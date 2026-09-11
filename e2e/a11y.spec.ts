import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { addByHand } from './helpers';

// アクセシビリティは「気をつける」では守れないので機械で固定する。
// 実際、最初にかけた時点で contrast 違反が serious 7件出た
// （text-neutral-400 が地色に対して 2.47。AA は 4.5）。

const PAGES = ['/', '/weights', '/sources', '/privacy'];

for (const path of PAGES) {
  test(`${path} has no WCAG A/AA violations`, async ({ page }) => {
    await page.addInitScript(() => {
      // 同意バナーが被って測定対象が変わるのを避ける。
      try { window.localStorage.setItem('proxycost.consent.v1', 'denied'); } catch { /* 無くてよい */ }
    });
    await page.goto(path);
    await expect(page.getByRole('contentinfo')).toBeVisible();

    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const summary = violations.map(
      (v) => `${v.impact} ${v.id} (${v.nodes.length}) — ${v.nodes[0]?.html.slice(0, 90)}`,
    );
    expect(summary, `${path} の違反:\n${summary.join('\n')}`).toEqual([]);
  });
}

test('the ranking is reachable and operable by keyboard alone', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'キーボード操作なので desktop でだけ見る');
  await page.addInitScript(() => {
    try { window.localStorage.setItem('proxycost.consent.v1', 'denied'); } catch { /* 無くてよい */ }
  });
  await page.goto('/');
  await expect(page.getByRole('contentinfo')).toBeVisible();

  // Tab で順位の行まで到達し、Enter で内訳が開けること。
  // マウスでしか開けない内訳は、内訳が無いのと同じ。
  const row = page.locator('li button[aria-expanded]').first();
  await row.focus();
  await expect(row).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(row).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('li table')).toHaveCount(1);

  // フォーカスが見えること。輪郭が消えているとキーボードでは現在地を失う。
  const outline = await row.evaluate((el) => {
    const s = getComputedStyle(el);
    return `${s.outlineStyle}/${s.outlineWidth}`;
  });
  expect(outline, 'フォーカス輪郭が消えている').not.toBe('none/0px');
});

/**
 * **既定のカートには出ない画面が1つある。**重量表に当たらない品を入れたときだけ出る
 * 「仮置き」の注記（`AssumedWeightsNote`）は、上の `/` の監査を通っていない
 * （既定の2点は両方とも表に当たるので、注記もその琥珀の地色も存在しない）。
 * 出るときだけ出るものは、出した状態で測らないと誰も測っていないのと同じ。
 */
test('the placeholder-weight state has no WCAG A/AA violations either', async ({ page }) => {
  await page.addInitScript(() => {
    try { window.localStorage.setItem('proxycost.consent.v1', 'denied'); } catch { /* 無くてよい */ }
  });
  await page.goto('/');
  await expect(page.getByRole('contentinfo')).toBeVisible();
  await addByHand(page, 'mystery lot A, no weight data', 4000);
  await expect(page.getByTestId('assumed-weights')).toBeVisible();

  const audit = async (b: AxeBuilder) =>
    (await b.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations.map(
      (v) => `${v.impact} ${v.id} (${v.nodes.length}) — ${v.nodes[0]?.html.slice(0, 90)}`,
    );

  // 明色は上の `/` と同じ全画面の監査。注記の琥珀は地の上に琥珀を重ねるので、
  // 行・ボタン・リンクまで含めてここで測る。
  const light = await audit(new AxeBuilder({ page }));
  expect(light, `light の違反:\n${light.join('\n')}`).toEqual([]);

  // 暗色は**注記の中だけ**を測る。琥珀の上の琥珀という、この注記に固有の危険はここに在る。
  // 全画面にしないのは、暗色の `/` が既に色コントラスト違反を 96 件出しているから
  // （`text-neutral-500` が地に対して足りない。この変更より前から在る）。
  // **これは既存の門を緩めたのではない** — 暗色の全画面はもともと測られていない。
  // 直すのは別の仕事で、直すときにこの include を外す。
  await page.emulateMedia({ colorScheme: 'dark' });
  const dark = await audit(new AxeBuilder({ page }).include('[data-testid="assumed-weights"]'));
  expect(dark, `dark（注記の中）の違反:\n${dark.join('\n')}`).toEqual([]);
});

/**
 * T-F10: 「送料無料」の出品を1点入れたときだけ出る Buyee 限定の注記
 * （`FreeShippingDomesticNote`）。既定のカートには出ない状態なので、
 * 上の `/` の監査はこれを一度も測っていない。出した状態で別に測る
 * （`assumed-weights` と同じ理由・同じ作法）。
 */
test('the free-shipping-domestic note has no WCAG A/AA violations either', async ({ page }) => {
  await page.addInitScript(() => {
    try { window.localStorage.setItem('proxycost.consent.v1', 'denied'); } catch { /* 無くてよい */ }
  });
  await page.goto('/');
  await expect(page.getByRole('contentinfo')).toBeVisible();

  const box = page.getByRole('checkbox', { name: 'shipping included by seller' }).first();
  if (!(await box.isVisible())) {
    await page.getByRole('button', { name: /^Cart \(/ }).click();
  }
  await box.check();
  await expect(page.getByText(/domestic shipping fees may occur/i)).toBeVisible();

  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const summary = violations.map(
    (v) => `${v.impact} ${v.id} (${v.nodes.length}) — ${v.nodes[0]?.html.slice(0, 90)}`,
  );
  expect(summary, `違反:\n${summary.join('\n')}`).toEqual([]);
});
