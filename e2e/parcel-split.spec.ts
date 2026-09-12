import { expect, test, type Page } from '@playwright/test';
import { addByHand, emptyCart, gotoCompare, openCart, weightBox } from './helpers';

/**
 * 箱が分かれるカートの E2E。
 * オーナー確定の4つの事実がすべて画面に出ているかを固定する:
 *   1. なぜ分かれたか（店舗の切れ目 / EMS の重量上限超え）
 *   2. 重い順に詰めた順序
 *   3. 箱ごとの申告額（その箱の中身の合計）
 *   4. 箱ごとの免税しきい値
 * すべて `prefers-reduced-motion` でも読める（この区画はテキストのみ・
 * アニメーションを使っていない）。
 * デフォルトの国は US（`useCompare.ts`）——US / EMS / 5点×5000g は
 * `docs/DESIGN-BOX-SIZE.md` に記録されている実際に2箱へ分かれる組み合わせ。
 */

function parcel(page: Page) {
  return page.getByRole('region', { name: 'Parcel' });
}

/** US / EMS / 5点×5000g のカートを作る。すべて同じ店舗（suruga-ya）に置き、
 *  店舗の切れ目ではなく重量上限だけが分割理由になるようにする。 */
async function heavyFiveItemCart(page: Page): Promise<void> {
  await gotoCompare(page);
  await emptyCart(page);
  for (let i = 0; i < 5; i++) {
    await addByHand(page, `Heavy ${i}`, 1000 * (i + 1), 'suruga-ya');
    await openCart(page);
    await weightBox(page, `Heavy ${i}`).fill('5000');
  }
  await expect(parcel(page)).toBeVisible();
}

test('splitting a shipment shows why it split, the pack order, each box\'s declared value, and its duty-free threshold', async ({ page }) => {
  await heavyFiveItemCart(page);

  const split = page.getByTestId('parcel-split');
  await expect(split).toBeVisible();

  // 開示文が「代行会社が箱を分ける」という前提から始まる（#76 承認文言）。
  await expect(page.getByTestId('split-disclosure')).toContainText('箱を何個に分けるかは代行会社が決めます');

  const boxes = page.getByTestId('split-box');
  await expect(boxes).toHaveCount(2);

  // fact 1: 分割の理由が画面に出ている。同じ店舗の5点が重量上限で分かれたので weight-limit。
  await expect(boxes.first()).toHaveAttribute('data-reason', 'weight-limit');
  await expect(boxes.nth(1)).toHaveAttribute('data-reason', 'weight-limit');
  await expect(boxes.first().getByTestId('split-box-reason')).toContainText("over EMS's");

  // fact 2: 重い順の詰め順が番号として見える。
  const orderBadges = boxes.first().getByTestId('pack-order');
  await expect(orderBadges.first()).toBeVisible();
  const numbers = await orderBadges.allTextContents();
  expect(numbers.map(Number)).toEqual([...numbers.map(Number)].sort((a, b) => a - b));

  // fact 3: 箱ごとの申告額 = その箱の中身の合計（均等割りではない）。
  const declared = await boxes.allTextContents();
  for (const box of declared) {
    expect(box).toMatch(/Declared value/i);
  }
  const box1Declared = await boxes.first().getByTestId('split-box-declared').innerText();
  const box2Declared = await boxes.nth(1).getByTestId('split-box-declared').innerText();
  expect(box1Declared).not.toBe(box2Declared); // 5点の価格が全部違うので均等割りなら一致しない

  // 保全: 2箱の申告額の合計はカート全体の代金と一致する。
  const toYen = (s: string) => Number(s.match(/[\d,]+/)?.[0]?.replace(/,/g, '') ?? NaN);
  const total = toYen(box1Declared) + toYen(box2Declared);
  expect(total).toBe(1000 + 2000 + 3000 + 4000 + 5000);

  // fact 4: 箱ごとの免税しきい値と、そのしきい値に対する判定。
  await expect(boxes.first().getByTestId('split-box-threshold')).toBeVisible();
  await expect(boxes.first().getByTestId('split-box-threshold-state')).toBeVisible();
});

test('prefers-reduced-motion: all four facts are still readable with motion off', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await heavyFiveItemCart(page);

  const boxes = page.getByTestId('split-box');
  await expect(boxes).toHaveCount(2);
  await expect(boxes.first().getByTestId('split-box-reason')).toBeVisible();
  await expect(boxes.first().getByTestId('pack-order').first()).toBeVisible();
  await expect(boxes.first().getByTestId('split-box-declared')).toBeVisible();
  await expect(boxes.first().getByTestId('split-box-threshold')).toBeVisible();
});

test('a cart split across different shops says so, not "weight limit"', async ({ page }) => {
  await gotoCompare(page);
  await emptyCart(page);
  await addByHand(page, 'Shop A item', 3000, 'suruga-ya');
  await addByHand(page, 'Shop B item', 4000, 'mandarake');
  await openCart(page);
  await weightBox(page, 'Shop A item').fill('300');
  await weightBox(page, 'Shop B item').fill('300');

  const boxes = page.getByTestId('split-box');
  await expect(boxes).toHaveCount(2);
  await expect(boxes.first()).toHaveAttribute('data-reason', 'shop');
  await expect(boxes.first().getByTestId('split-box-reason')).toContainText('a different shop');
});

test('no horizontal overflow at 412px wide with a split cart', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 900 });
  await heavyFiveItemCart(page);
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
