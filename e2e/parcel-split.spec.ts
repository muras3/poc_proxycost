import { expect, test, type Page } from '@playwright/test';
import { addByHand, emptyCart, gotoCompare, openCart, weightBox } from './helpers';

/**
 * 箱が分かれるカートの E2E。
 *
 * **`ParcelView` はもう箱の内訳を計算しない。**`Calculator` が最安行
 * （`result.rows.find(r => r.cheapest)`）の `row.boxes`（`compare()` の出力）を
 * そのまま渡し、`ParcelView` はそれを描くだけ（2026-09-12、コーディネーターの
 * レビューで、店舗分割・重量上限を UI 側で再計算するたびに実際の計算と食い違う
 * バグを3回作ったあとに撤回・修正）。
 *
 * したがってここのフィクスチャは「どのカートなら、実際に最安になる行が本当に
 * 複数箱に分かれるか」を先に確かめた実測値（`src/lib/pricing/compare.test.ts`
 * の `Row.boxes` ブロック、およびこの PR 作業中の使い捨て調査で確認済み）:
 *   - **US・5点×5000g・price 1,000〜5,000円・cheapest（既定）**:
 *     最安は `buyee:default`、`courier-ecms`、5箱、**理由は全部 'per-listing'**
 *     （既定の出品サイト yahoo-auctions は出品ごとに1注文——Buyee の公表規約
 *     どおりの正しい挙動であって保守的な仮定ではない）。
 *   - **DE・2点×15,000g・price 1,000/2,000円・cheapest（既定）**:
 *     最安は `zenmarket`、`parcel-air`、2箱、**理由は両方 'weight-limit'**
 *     （2点合計36kg超で parcel-air 自身の重量上限を超える）。
 * オーナー確定の4つの事実がすべて画面に出ているかを、この2つの実在する
 * フィクスチャで固定する:
 *   1. なぜ分かれたか（per-listing / weight-limit ——実際の理由をそのまま）
 *   2. 重い順に詰めた順序
 *   3. 箱ごとの申告額（その箱の中身の合計）
 *   4. 箱ごとの関税・VAT/GST の判定
 * すべて `prefers-reduced-motion` でも読める（この区画はテキストのみ・
 * アニメーションを使っていない）。
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
 *     どちらの費目も 'free' にはならない——「免税限度の下にいる箱」が実際には
 *     二重に課税されている、というまさに5カ国で崩れる読みの実例。
 */

function parcel(page: Page) {
  return page.getByRole('region', { name: 'Parcel' });
}

async function shipTo(page: Page, cc: string): Promise<void> {
  await page.getByLabel('Ship to').selectOption(cc);
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
  await expect(parcel(page)).toBeVisible();
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
  await expect(parcel(page)).toBeVisible();
}

test('per-listing split shows why it split, the pack order, each box\'s declared value,'
  + ' and each box\'s actual duty/VAT verdict', async ({ page }) => {
  await perListingCart(page);

  const split = page.getByTestId('parcel-split');
  await expect(split).toBeVisible();

  // 開示文が「代行会社が箱を分ける」という前提から始まる（#76 承認文言）。
  await expect(page.getByTestId('split-disclosure')).toContainText('箱を何個に分けるかは代行会社が決めます');

  const boxes = page.getByTestId('split-box');
  await expect(boxes).toHaveCount(5);

  // fact 1: 分割の理由が画面に出ている。**実際の Row の理由をそのまま**
  // ——per-listing であって weight-limit や「a different shop」ではない。
  await expect(boxes.first()).toHaveAttribute('data-reason', 'per-listing');
  await expect(boxes.first().getByTestId('split-box-reason')).toContainText('bills one order per listing');
  await expect(boxes.first().getByTestId('split-box-reason')).not.toContainText('a different shop');

  // fact 2: 重い順の詰め順が番号として見える。
  const orderBadges = boxes.first().getByTestId('pack-order');
  await expect(orderBadges.first()).toBeVisible();

  // fact 3: 箱ごとの申告額 = その箱の中身の合計（均等割りではない）。5点とも
  // 値段が違うので、5箱の申告額もすべて違う。
  const declaredTexts = await boxes.evaluateAll(
    (els) => els.map((el) => el.querySelector('[data-testid="split-box-declared"]')?.textContent ?? ''),
  );
  expect(new Set(declaredTexts).size).toBe(5);
  const toYen = (s: string) => Number(s.match(/[\d,]+/)?.[0]?.replace(/,/g, '') ?? NaN);
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

  const boxes = page.getByTestId('split-box');
  await expect(boxes).toHaveCount(2);
  await expect(boxes.first()).toHaveAttribute('data-reason', 'weight-limit');
  await expect(boxes.nth(1)).toHaveAttribute('data-reason', 'weight-limit');
  await expect(boxes.first().getByTestId('split-box-reason')).toContainText("weight limit");
  await expect(boxes.first().getByTestId('split-box-reason')).not.toContainText('per listing');
  await expect(boxes.first().getByTestId('split-box-reason')).not.toContainText('a different shop');

  // 保全はここでも成り立つ。
  const declaredTexts = await boxes.evaluateAll(
    (els) => els.map((el) => el.querySelector('[data-testid="split-box-declared"]')?.textContent ?? ''),
  );
  const toYen = (s: string) => Number(s.match(/[\d,]+/)?.[0]?.replace(/,/g, '') ?? NaN);
  expect(declaredTexts.map(toYen).reduce((a, b) => a + b, 0)).toBe(1000 + 2000);

  // **fact 4、DE の実例。**商品代は関税の免税限度（€150）を大きく下回るが、
  // ドイツは免税限度以下でも1点あたり定額の関税がかかる（`flatDutyPerItem`）
  // ——「免税限度の下＝無税」ではないことを、この画面自身が言えているかを見る。
  await expect(boxes.first()).toHaveAttribute('data-duty-kind', 'flat');
  await expect(boxes.first().getByTestId('split-box-duty')).not.toContainText(/^none/);
  await expect(boxes.first().getByTestId('split-box-duty')).toContainText('still charged under the duty-free line');
  // VAT はゼロにはならない——ZenMarket が IOSS で決済時に代理徴収するので
  // 'seller-collects'（国境では取らないが、無税ではない）。**'free' ではない**
  // ことがここでの主張——`vatFreeLimit: 0` の国で VAT が消える箱は無い。
  await expect(boxes.first()).not.toHaveAttribute('data-vat-kind', 'free');
  await expect(boxes.first().getByTestId('split-box-vat')).not.toContainText(/^none — under/);
});

test('prefers-reduced-motion: all four facts are still readable with motion off', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await perListingCart(page);

  const boxes = page.getByTestId('split-box');
  await expect(boxes).toHaveCount(5);
  await expect(boxes.first().getByTestId('split-box-reason')).toBeVisible();
  await expect(boxes.first().getByTestId('pack-order').first()).toBeVisible();
  await expect(boxes.first().getByTestId('split-box-declared')).toBeVisible();
  await expect(boxes.first().getByTestId('split-box-duty')).toBeVisible();
  await expect(boxes.first().getByTestId('split-box-vat')).toBeVisible();
});

test('no horizontal overflow at 412px wide with a split cart', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 900 });
  await perListingCart(page);
  await expect(page.getByTestId('parcel-split')).toBeVisible();

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(
    overflow.scrollWidth,
    `scrollWidth ${overflow.scrollWidth} > clientWidth ${overflow.clientWidth} at 412px`,
  ).toBeLessThanOrEqual(overflow.clientWidth);
});
