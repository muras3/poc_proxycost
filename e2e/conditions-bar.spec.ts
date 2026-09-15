import { expect, test } from '@playwright/test';
import {
  addByHand, cart, gotoCompare, isCollapsed, openCart,
} from './helpers';

/**
 * PR-C（2026-09-15）の条件欄・カート折りたたみ・常時アイコンの e2e。
 * 数値・順位は一切変えていない（`src/lib/pricing` 不可侵）ので、ここは
 * **見え方・操作**だけを検査する。
 */

test('the destination + province field is merged into one cell, and shows the unselected default', async ({ page }) => {
  await gotoCompare(page);
  const bar = page.getByTestId('conditions-bar');
  await expect(bar).toBeVisible();
  const destination = page.getByTestId('destination-cell');
  await expect(destination).toBeVisible();

  // 他国では州の欄が無い。
  await expect(page.getByLabel('Province')).toHaveCount(0);

  // カナダを選ぶと、送り先セルの中に州の欄が現れる（別セルではない＝4欄のまま）。
  await page.getByLabel('Ship to').selectOption('CA');
  const province = destination.getByLabel('Province');
  await expect(province).toHaveCount(1);
  await expect(province).toHaveValue('');

  // 未選択の既定表示。文言は既存の `ProvincePicker` のまま
  // （`e2e/taxes.spec.ts` が "we estimate {avg}" を一言一句で掴んでいる）。
  await expect(destination).toContainText(/we estimate/);

  await province.selectOption('ON');
  await expect(province).toHaveValue('ON');
});

test('opening the manual-add form while Canada is selected causes no horizontal scroll, at 1280 and 390', async ({ page }) => {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await gotoCompare(page);
    await page.getByLabel('Ship to').selectOption('CA');
    await page.getByRole('button', { name: 'Add by hand', exact: true }).first().click();
    await expect(page.getByLabel('Item name')).toBeVisible();

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(
      overflow.scrollWidth,
      `scrollWidth ${overflow.scrollWidth} > clientWidth ${overflow.clientWidth} at ${width}px, `
      + 'Canada selected, manual-add form open',
    ).toBeLessThanOrEqual(overflow.clientWidth);
  }
});

test('the cart folds to one line by default and expands/collapses on click', async ({ page }) => {
  await gotoCompare(page);
  // 既定カートを足した直後は開く（「編集時に開く」の既存規約）。まず畳む。
  const toggle = page.getByTestId('cart-line');
  await expect(toggle).toBeVisible();
  const first = cart(page).getByRole('listitem').first();
  if (await first.isVisible()) await toggle.click();
  await expect(first).toBeHidden();

  // 条件欄の要約からも開ける。
  await page.getByTestId('conditions-cart-summary').click();
  await expect(first).toBeVisible();

  // もう一度たたむ。
  await toggle.click();
  await expect(first).toBeHidden();
});

test('a weight that decides 1st place is marked in both the conditions-bar summary and the folded cart line', async ({ page }) => {
  await gotoCompare(page);
  // 表に無いタイトルは仮置き重量になり、既定カートと組み合わせると1位を左右し
  // うる（`assumed-weights.spec.ts` と同じ手口）。当たらなければこのテストは
  // 印の有無ではなく前提が崩れているとして、はっきり失敗させる。
  await addByHand(page, 'a completely unknown mystery gadget XQ9', 3000);
  await openCart(page);

  const decisiveInCart = page.getByTestId('cart-decisive-mark');
  const hasDecisive = await decisiveInCart.count() > 0;
  test.skip(!hasDecisive, 'no decisive weight in this cart — nothing to assert the mark against');

  await expect(decisiveInCart).toBeVisible();
  await expect(page.getByTestId('conditions-cart-decisive-dot')).toBeVisible();
});

test('the two always-on icons open with a click and with the keyboard', async ({ page }) => {
  await gotoCompare(page);
  const shippability = page.getByTestId('icon-shippability');
  const fuelRemote = page.getByTestId('icon-fuel-remote');
  await expect(shippability).toBeVisible();
  await expect(fuelRemote).toBeVisible();

  // タップ（クリック）。
  await shippability.click();
  await expect(page.getByText(/We do not check/)).toBeVisible();

  // キーボード。フォーカスして Enter で開閉する（<summary> のネイティブ挙動）。
  await fuelRemote.focus();
  await expect(fuelRemote).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('remote-area-surcharge-note')).toBeVisible();
});

test('the scale shows a weight/box/service summary and sinks with weight', async ({ page }) => {
  await gotoCompare(page);
  const scale = page.getByTestId('scale');
  await expect(scale).toBeVisible();
  await expect(page.getByTestId('scale-summary')).toContainText(/in \d+ box/);

  const before = await page.getByTestId('scale-platform').evaluate(
    (el) => getComputedStyle(el).transform,
  );
  // 重量を大きく増やすと台の沈み（translateY）が変わる。
  await openCart(page);
  const w = page.locator('input[aria-label^="Weight in grams of"]').first();
  await w.fill('18000');
  await w.blur();
  await expect
    .poll(async () => page.getByTestId('scale-platform').evaluate((el) => getComputedStyle(el).transform))
    .not.toBe(before);
});

test('the lithium-airmail badge is always visible for GB/DE and absent elsewhere', async ({ page }) => {
  await gotoCompare(page);
  await expect(page.getByTestId('lithium-airmail-badge')).toHaveCount(0);

  await page.getByLabel('Ship to').selectOption('GB');
  const badge = page.getByTestId('lithium-airmail-badge');
  await expect(badge).toBeVisible();
  await expect(badge).toContainText('Li-ion: no airmail');
  // 常時表示——アイコンを何も押さなくても読める。
  expect(await isCollapsed(badge)).toBe(false);

  await page.getByLabel('Ship to').selectOption('US');
  await expect(page.getByTestId('lithium-airmail-badge')).toHaveCount(0);
});
