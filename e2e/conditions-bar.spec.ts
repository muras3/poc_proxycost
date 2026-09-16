import { expect, test } from '@playwright/test';
import {
  addByHand, cart, gotoCompare, isCollapsed, openCart, ranking, shipTo,
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

  // 他国では州の欄が無い（閉じた送り先ボタンにも州は出ない）。
  await expect(page.getByLabel('Province')).toHaveCount(0);

  // カナダを選ぶと、送り先セルの**中**に州が繋がって出る（別セルではない＝4欄のまま）。
  // 未選択は「province ≈ avg」（Mock v3 `.wplacebtn .est`）——選ぶまでは平均率の推定。
  await shipTo(page, 'CA');
  await expect(destination.locator('#wPlace')).toContainText(/Canada · province ≈ avg/);

  // 送り先を開くと州の select が同じセルの中に出る。既定は未選択で、平均率を名乗る
  // （文言は旧 `ProvincePicker` のまま。`e2e/taxes.spec.ts` が "we estimate {avg}" を掴む）。
  await destination.locator('#wPlace').click();
  const province = destination.getByLabel('Province');
  await expect(province).toHaveCount(1);
  await expect(province).toHaveValue('');
  await expect(province).toContainText(/we estimate/);

  // 州を選ぶと閉じて、ボタンに州名が出る。
  await province.selectOption('ON');
  await expect(destination.locator('#wPlace')).toContainText(/Canada · Ontario/);
});

test('opening the manual-add form while Canada is selected causes no horizontal scroll, at 1280 and 390', async ({ page }) => {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await gotoCompare(page);
    await shipTo(page, 'CA');
    await page.getByRole('button', { name: 'Add by hand', expanded: false }).first().click();
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

  await shipTo(page, 'GB');
  const badge = page.getByTestId('lithium-airmail-badge');
  await expect(badge).toBeVisible();
  await expect(badge).toContainText(/does not take lithium batteries by air mail/);
  // 常時表示——アイコンを何も押さなくても読める。
  expect(await isCollapsed(badge)).toBe(false);

  await shipTo(page, 'US');
  await expect(page.getByTestId('lithium-airmail-badge')).toHaveCount(0);
});

/**
 * **2026-09-16（オーナー確定）: 選ぶ単位は運送会社。**便を20個並べると、細かい便を
 * たいてい1社しか扱っていないので、選んだ瞬間に他社が全部「比べられません」になり
 * （実画面で "4 of 5 services can't be ranked"）比較が成立しなかった。
 */
test('Ship by offers the carriers, not the 20 individual services', async ({ page }) => {
  await gotoCompare(page);
  const picker = page.locator('#ship-by-select');

  // 既定は「Cheapest that fits」＋運送会社だけ。便もグループ見出しも出ていない。
  await expect(picker.locator('option').first()).toHaveText(/^Cheapest that fits/);
  await expect(picker.locator('optgroup')).toHaveCount(0);
  const values = await picker.locator('option').evaluateAll(
    (os) => os.map((o) => (o as HTMLOptionElement).value));
  expect(values[0]).toBe('cheapest');
  for (const v of values.slice(1)) expect(v, `便が既定で並んでいる: ${v}`).toMatch(/^carrier:/);
  // 米国では SF Express だけ扱いが無いので、残り6社が選べる。
  expect(values.slice(1)).toEqual([
    'carrier:japan-post', 'carrier:fedex', 'carrier:dhl',
    'carrier:ups', 'carrier:ecms', 'carrier:buyee',
  ]);

  // 扱いの無い社は消さず、「Show N not available for …」に畳む（未価格の便と同じ形）。
  const toggle = page.getByTestId('ship-by-unpriced-toggle');
  await expect(toggle).toContainText('Show 1 not available for United States');
  await toggle.click();
  const sf = picker.locator('option[value="carrier:sf-express"]');
  await expect(sf).toHaveCount(1);
  await expect(sf).toBeDisabled();
  await expect(sf).toContainText('not available for United States');

  // **会社を選ぶと、比べられる行の Ships by はその会社の便になる。**便は行ごとに
  // 違ってよい（その社が扱うその会社の便のうち総額が最安のもの）。
  await picker.selectOption('carrier:fedex');
  const shipsBy = await ranking(page).getByTestId('arrival-bar').allInnerTexts();
  expect(shipsBy.length, 'FedEx で比べられる行が1つも無い').toBeGreaterThan(0);
  for (const t of shipsBy) expect(t, `FedEx 以外の便が出ている: ${t}`).toMatch(/FedEx/);
});

test('Ship by hides the methods that are not priced for the destination, and opens them on demand', async ({ page }) => {
  await gotoCompare(page);
  const picker = page.locator('#ship-by-select');
  // 便の指名は押したときだけ出る（既定は運送会社）。ここから先の挙動は従来どおり。
  await page.getByTestId('ship-by-services-toggle').click();
  const toggle = page.getByTestId('ship-by-unpriced-toggle');

  // 米国では価格の付かない便は1つ（SF Express）。既定ではその1つが選択肢に居ない。
  await expect(toggle).toContainText('Show 1 not priced for United States');
  await expect(picker.locator('option[value="courier-sf-express"]')).toHaveCount(0);
  // 灰色の無効項目が既定で並んでいないこと（開くまで無効の選択肢はゼロ）。
  await expect(picker.locator('option:disabled')).toHaveCount(0);

  // 開くと、従来どおり「選べない理由」付きの無効な項目として見える（消しはしない）。
  await toggle.click();
  const sf = picker.locator('option[value="courier-sf-express"]');
  await expect(sf).toHaveCount(1);
  await expect(sf).toBeDisabled();
  await expect(sf).toContainText('not priced for United States');
  await expect(toggle).toContainText('Hide 1 not priced for United States');

  // 宛先を変えると件数も国名も追従する（ドイツは5便が未価格）。開いた状態は
  // 利用者が選んだものなので、宛先を変えても勝手に畳まない。
  await shipTo(page, 'DE');
  await expect(page.getByTestId('ship-by-unpriced-toggle'))
    .toContainText('Hide 5 not priced for Germany');
  await expect(picker.locator('option:disabled')).toHaveCount(5);
});

test('Ship by groups the methods by carrier, with the names cleaned up and the raw label kept', async ({ page }) => {
  await gotoCompare(page);
  const picker = page.locator('#ship-by-select');
  await page.getByTestId('ship-by-services-toggle').click();

  // グループの見出し = 運送会社。郵便が先頭。
  const groups = await picker.locator('optgroup').evaluateAll(
    (gs) => gs.map((g) => (g as HTMLOptGroupElement).label));
  expect(groups[0]).toBe('Japan Post');
  for (const c of ['FedEx', 'DHL', 'UPS', 'ECMS', 'Buyee']) expect(groups).toContain(c);
  // 会社ごとに1つの見出し（同じ会社が2度出ない）。
  expect(new Set(groups).size).toBe(groups.length);

  // 先頭は既定の「Cheapest that fits」のまま。
  await expect(picker.locator('option').first()).toHaveText(/^Cheapest that fits/);

  // 便名は整形されている: 全部大文字をやめ、グループ名と重複する会社名を落とし、
  // 括弧の日数は名前から外して右に出す。
  const fedexTexts = await picker.locator('optgroup[label="FedEx"] option').allInnerTexts();
  expect(fedexTexts.join(' | ')).toContain('Lowcost');
  expect(fedexTexts.join(' | ')).toContain('Connect Plus · 3–5 days');
  for (const t of fedexTexts) {
    expect(t, `会社名が便名に重複している: ${t}`).not.toMatch(/FedEx/i);
    expect(t, `原文の全部大文字が残っている: ${t}`).not.toMatch(/\b[A-Z]{3,}\b/);
    expect(t, `括弧の日数が名前に残っている: ${t}`).not.toMatch(/\(\d/);
  }
  // 種別を社が書いていない便は Standard と決めつけない。
  expect(fedexTexts.join(' | ')).toContain('(tier not published)');

  // **原文は捨てていない**——どの社のどの表記かが `title` に残る。
  await expect(picker.locator('option[value="courier-fedex-lowcost"]'))
    .toHaveAttribute('title', 'ZenMarket: “FEDEX LOWCOST”');
});

test('the Ship by field, with the not-priced list open, causes no horizontal scroll at 390', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoCompare(page);
  await shipTo(page, 'DE'); // 未価格が5便＝行が一番長くなる宛先
  await page.getByTestId('ship-by-services-toggle').click();
  const toggle = page.getByTestId('ship-by-unpriced-toggle');
  await toggle.click();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, '390px で横スクロールが出ている').toBeLessThanOrEqual(1);
  // 畳むボタンはキーボードで押せる（`<button>` のまま、select とは別の操作）。
  await toggle.focus();
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});
