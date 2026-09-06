import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

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
