import { expect, test, type Page } from '@playwright/test';
import {
  addByHand, emptyCart, gotoCompare, openCart, openRankRow, readRanking, shipTo, weightBox,
} from './helpers';

/**
 * 箱が分かれるカートの E2E。
 *
 * 箱の絵は **1位の行を開いた配達ログの「Packed」の段**に居る（Mock v3 `packHTML`）。
 * `DeliveryLog` は `row.boxes`（`compare()` の出力）をそのまま描くだけで、店舗分割・
 * 重量上限を UI 側で再計算しない（2026-09-12、コーディネーターのレビューで、UI 側の
 * 再計算が実際の計算と食い違うバグを3回作ったあとに撤回・修正）。
 *
 * したがってここのフィクスチャは「どのカートなら、実際に最安になる行が本当に
 * 複数箱に分かれるか」を先に確かめた実測値（`src/lib/pricing/compare.test.ts`
 * の `Row.boxes` ブロック）:
 *   - **US・5点×5000g・price 1,000〜5,000円・cheapest（既定）**:
 *     最安は `buyee:default`、5箱、**理由は全部 'per-listing'**。
 *   - **DE・2点×15,000g・price 1,000/2,000円・cheapest（既定）**:
 *     最安は `zenmarket`、`parcel-air`、2箱、**理由は両方 'weight-limit'**。
 * オーナー確定の4つの事実がすべて画面に出ているかを、この2つのフィクスチャで固定する:
 *   1. なぜ分かれたか（per-listing / weight-limit ——実際の理由をそのまま。Mock v3 では
 *      箱と箱の間の線種＋箱の下の1行）
 *   2. 箱ごとの中身（何点入っているか）
 *   3. 箱ごとの申告額（その箱の中身の合計）
 *   4. 箱ごとの関税・VAT/GST の判定
 * すべて `prefers-reduced-motion` でも読める（絵の落下アニメーションは無効になり、
 * 文字はそのまま）。
 *
 * **fact 4 は「免税しきい値」ではなく「関税・VAT/GST の判定」**
 * （2026-09-12、コーディネーター指摘で撤回・修正）。「しきい値の下＝無税」は
 * 7か国中5か国で誤る——ここで使う2つのフィクスチャがそれぞれ実例を持つ:
 *   - US（per-listing フィクスチャ）: 関税の免税限度が0なので、**免税線に意味が
 *     無く、必ず課税**（`duty.kind` は 'rate'、'free' にはならない）。
 *   - DE（weight-limit フィクスチャ）: 商品代が安く関税の免税限度（€150）以下
 *     だが、**免税限度以下でも1点あたり定額の関税がかかる**（`duty.kind` は
 *     'flat'、'free' ではない）。VAT は ZenMarket が IOSS で決済時に代理徴収する
 *     ため `vat.kind` は 'seller-collects'（無税ではない——国境で取らないだけ）。
 */

/** 1位の行を開き、その配達ログの箱の区画を返す。 */
async function openPack(page: Page) {
  const rows = await readRanking(page);
  const i = rows.findIndex((r) => r.cheapest);
  expect(i, 'no cheapest row').toBeGreaterThanOrEqual(0);
  const li = await openRankRow(page, i);
  const pack = li.getByTestId('pack');
  await expect(pack).toBeVisible();
  return pack;
}

/** US・5点×5000g・price 1,000〜5,000円。最安 = buyee:default、5箱、per-listing。 */
async function perListingCart(page: Page): Promise<void> {
  await gotoCompare(page);
  await emptyCart(page);
  for (let i = 0; i < 5; i++) {
    await addByHand(page, `Item ${i}`, 1000 * (i + 1));
    await openCart(page);
    await weightBox(page, `Item ${i}`).fill('5000');
  }
}

/** DE・2点×15,000g・price 1,000/2,000円。最安 = zenmarket、2箱、weight-limit。 */
async function weightLimitCart(page: Page): Promise<void> {
  await gotoCompare(page);
  await shipTo(page, 'DE');
  await emptyCart(page);
  await addByHand(page, 'Heavy A', 1000);
  await openCart(page);
  await weightBox(page, 'Heavy A').fill('15000');
  await addByHand(page, 'Heavy B', 2000);
  await openCart(page);
  await weightBox(page, 'Heavy B').fill('15000');
}

const toYen = (s: string) => Number(s.match(/[\d,]+/)?.[0]?.replace(/,/g, '') ?? NaN);

test('per-listing split shows why it split, each box\'s contents and declared value,'
  + ' and each box\'s actual duty/VAT verdict', async ({ page }) => {
  await perListingCart(page);
  const pack = await openPack(page);

  // 分割の理由は区画の見出しの1行（Mock `.pk-note`: 「5 boxes · one order per listing …」）。
  await expect(pack).toHaveAttribute('data-why', 'per-listing');
  await expect(pack.locator('.pk-note')).toContainText(/5 boxes/);
  await expect(pack.locator('.pk-note')).toContainText(/one order per listing/);

  const boxes = pack.getByTestId('split-box');
  await expect(boxes).toHaveCount(5);

  // fact 1: **実際の Row の理由をそのまま**——per-listing であって weight-limit や
  // 「a different shop」ではない。
  await expect(boxes.first()).toHaveAttribute('data-reason', 'per-listing');
  await expect(pack).not.toContainText('a different shop');
  await expect(pack).not.toContainText('weight limit');

  // fact 2: 箱ごとの中身。1注文1箱なので、どの箱も1点。
  await expect(boxes.first().getByTestId('split-box-reason')).toContainText(/1 item/);

  // fact 3: 箱ごとの申告額 = その箱の中身の合計（均等割りではない）。5点とも
  // 値段が違うので、5箱の申告額もすべて違う。
  const declaredTexts = await boxes.evaluateAll(
    (els) => els.map((el) => el.querySelector('[data-testid="split-box-declared"]')?.textContent ?? ''),
  );
  expect(new Set(declaredTexts).size).toBe(5);
  // 保全: 5箱の申告額の合計はカート全体の代金と一致する。
  expect(declaredTexts.map(toYen).reduce((a, b) => a + b, 0)).toBe(1000 + 2000 + 3000 + 4000 + 5000);

  // fact 4: 箱ごとの関税・VAT の判定。**US は関税の免税限度が0**なので、
  // どの箱も 'free'（免税）にはなり得ず、必ず課税される——免税線を引く意味が無い
  // 国の実例。
  await expect(boxes.first().getByTestId('split-box-duty')).toBeVisible();
  await expect(boxes.first()).not.toHaveAttribute('data-duty-kind', 'free');
  await expect(boxes.first().getByTestId('split-box-vat')).toBeVisible();
});

test('weight-limit split is told apart from per-listing — different reason, different wording', async ({ page }) => {
  await weightLimitCart(page);
  const pack = await openPack(page);

  const boxes = pack.getByTestId('split-box');
  await expect(boxes).toHaveCount(2);
  await expect(pack).toHaveAttribute('data-why', 'weight-limit');
  await expect(boxes.first()).toHaveAttribute('data-reason', 'weight-limit');
  await expect(boxes.nth(1)).toHaveAttribute('data-reason', 'weight-limit');
  await expect(pack.locator('.pk-note')).toContainText(/weight limit/);
  await expect(pack).not.toContainText('per listing');
  await expect(pack).not.toContainText('a different shop');
  // Mock v3: 重量上限での分割は、箱と箱の間の**破線**で言う（赤い「OVER LIMIT」は無い）。
  await expect(boxes.nth(1)).toHaveClass(/bxsep-wl/);
  expect(await boxes.nth(1).evaluate((e) => getComputedStyle(e).borderLeftStyle)).toBe('dashed');
  await expect(pack).not.toContainText(/OVER LIMIT/i);

  // 保全はここでも成り立つ。
  const declaredTexts = await boxes.evaluateAll(
    (els) => els.map((el) => el.querySelector('[data-testid="split-box-declared"]')?.textContent ?? ''),
  );
  expect(declaredTexts.map(toYen).reduce((a, b) => a + b, 0)).toBe(1000 + 2000);

  // **fact 4、DE の実例。**商品代は関税の免税限度（€150）を大きく下回るが、
  // ドイツは免税限度以下でも1点あたり定額の関税がかかる（`flatDutyPerItem`）
  // ——「免税限度の下＝無税」ではないことを、この画面自身が言えているかを見る。
  await expect(boxes.first()).toHaveAttribute('data-duty-kind', 'flat');
  await expect(boxes.first().getByTestId('split-box-duty')).toContainText('even under the limit');
  // VAT はゼロにはならない——ZenMarket が IOSS で決済時に代理徴収するので
  // 'seller-collects'（国境では取らないが、無税ではない）。**'free' ではない**
  // ことがここでの主張——`vatFreeLimit: 0` の国で VAT が消える箱は無い。
  await expect(boxes.first()).not.toHaveAttribute('data-vat-kind', 'free');
  await expect(boxes.first().getByTestId('split-box-vat')).not.toContainText(/under the tax-free limit/);
});

test('prefers-reduced-motion: all four facts are still readable with motion off', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await perListingCart(page);
  const pack = await openPack(page);

  const boxes = pack.getByTestId('split-box');
  await expect(boxes).toHaveCount(5);
  await expect(pack.locator('.pk-note')).toBeVisible();
  await expect(boxes.first().getByTestId('split-box-reason')).toBeVisible();
  await expect(boxes.first().getByTestId('split-box-declared')).toBeVisible();
  await expect(boxes.first().getByTestId('split-box-duty')).toBeVisible();
  await expect(boxes.first().getByTestId('split-box-vat')).toBeVisible();
  // 絵の中身（品）も最終状態で全部見えている。
  await expect(boxes.first().getByTestId('packed-item')).toHaveCount(1);
});

test('no horizontal overflow at 412px wide with a split cart', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 900 });
  await perListingCart(page);
  await openPack(page);

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(
    overflow.scrollWidth,
    `scrollWidth ${overflow.scrollWidth} > clientWidth ${overflow.clientWidth} at 412px`,
  ).toBeLessThanOrEqual(overflow.clientWidth);
});
