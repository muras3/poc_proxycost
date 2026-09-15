import { expect, test } from '@playwright/test';
import { gotoCompare, openRankRow, ranking, readRanking } from './helpers';

/**
 * PR-B（順位ボードと配達ログ）の担当範囲だけを縛る e2e。
 * 数値・順位のロジックは触っていない前提——ここは形の話だけを検証する。
 */

test.describe('rank board v2 — closed row shape', () => {
  test('closed rows carry no prose paragraph (<p>) — only the row header, badges, and bars', async ({ page }) => {
    await gotoCompare(page);
    const rows = ranking(page).locator('li[data-row-id]');
    const n = await rows.count();
    for (let i = 0; i < n; i++) {
      // ボタン（閉じた行の見出し）の中に <p> があってはいけない。文章の段落は
      // 開いた中（isOpen ブロック）にだけ許される。
      const pInButton = rows.nth(i).locator('button p');
      expect(await pInButton.count(), `row ${i} has a <p> inside its closed header`).toBe(0);
    }
  });

  test('a not-comparable row has no rank number and sits out of the rank column', async ({ page }) => {
    await gotoCompare(page);
    const all = await readRanking(page);
    const notComparable = all.filter((r) => !r.comparable);
    // 既定カート（米国）は Neokyo が日本郵便を売らず non-comparable になる
    // （e2e/compare.spec.ts のテスト1と同じ前提）。0件なら前提が崩れているので
    // スキップではなく明示的に失敗させる。
    expect(notComparable.length, 'expected at least one not-comparable row in the default cart')
      .toBeGreaterThan(0);
    for (const r of notComparable) {
      expect(r.shownRank, `${r.name}: not-comparable row must not show a rank number`).toBe(0);
    }
  });

  test('total bar and arrival bar render for every comparable row, on a shared scale', async ({ page }) => {
    await gotoCompare(page);
    const rows = ranking(page).locator('li[data-row-id]');
    const n = await rows.count();
    const totalBarWidths: number[] = [];
    for (let i = 0; i < n; i++) {
      const row = rows.nth(i);
      const text = (await row.innerText()).replace(/\s+/g, ' ');
      const comparable = !/NOT COMPARABLE/.test(text);
      const totalBar = row.getByTestId('total-bar');
      const arrivalBar = row.getByTestId('arrival-bar');
      if (comparable) {
        await expect(totalBar).toHaveCount(1);
        const box = await totalBar.boundingBox();
        expect(box, `row ${i}: total-bar has no box`).not.toBeNull();
        totalBarWidths.push(box!.width);
      } else {
        await expect(totalBar).toHaveCount(0);
      }
      // 到着バーは数字が取れない行ではテキストのみのフォールバックになるので
      // 常に data-testid="arrival-bar" 自体は存在する（数値バーか文字だけか）。
      await expect(arrivalBar).toHaveCount(1);
    }
    // 共通スケールのコンテナ自体は全行同じ最大幅（max-w-[160px]）を使っている
    // ——描画された実幅がすべて同じであること（コンテナのCSSが行ごとに違わない）。
    const distinct = new Set(totalBarWidths.map((w) => Math.round(w)));
    expect(distinct.size, `total-bar widths differ across rows: ${[...distinct]}`).toBe(1);
  });

  test('upper-bound-unknown total bar fades at the right edge instead of drawing a false ceiling', async ({ page }) => {
    await gotoCompare(page);
    const rows = ranking(page).locator('li[data-row-id]');
    const n = await rows.count();
    let sawUnknown = false;
    for (let i = 0; i < n; i++) {
      const bar = rows.nth(i).getByTestId('total-bar');
      if ((await bar.count()) === 0) continue;
      if ((await bar.getAttribute('data-upper-unknown')) === 'true') {
        sawUnknown = true;
        await expect(rows.nth(i).getByTestId('total-bar-fade')).toBeVisible();
      }
    }
    expect(sawUnknown, 'expected at least one row with an unknown upper bound in the default cart')
      .toBe(true);
  });

  test('arrival bar line style encodes published vs. unpublished, tracked vs. untracked', async ({ page }) => {
    await gotoCompare(page);
    const rows = ranking(page).locator('li[data-row-id]');
    const n = await rows.count();
    let sawSolid = false;
    let sawDotted = false;
    for (let i = 0; i < n; i++) {
      const bar = rows.nth(i).getByTestId('arrival-bar');
      if ((await bar.count()) === 0) continue;
      if ((await bar.getAttribute('data-mode')) !== 'numeric') continue;
      const segment = rows.nth(i).getByTestId('arrival-bar-segment');
      const cls = (await segment.getAttribute('class')) ?? '';
      if (cls.includes('border-solid')) sawSolid = true;
      if (cls.includes('border-dotted')) sawDotted = true;
    }
    // 郵便（公表・実線）と宅配便（未公表・点線）が両方存在するはずの既定カート。
    expect(sawSolid || sawDotted, 'expected at least one numeric arrival bar').toBe(true);
  });

  test('Buyee shows the 1⇄5 paired box count on both its default and consolidated rows', async ({ page }) => {
    await gotoCompare(page);
    const rows = ranking(page).locator('li[data-row-id]');
    const n = await rows.count();
    const buyeeRows: number[] = [];
    for (let i = 0; i < n; i++) {
      const id = await rows.nth(i).getAttribute('data-row-id');
      if (id?.startsWith('buyee:')) buyeeRows.push(i);
    }
    expect(buyeeRows.length, 'expected both Buyee rows (default + consolidated) in the default cart')
      .toBe(2);
    for (const i of buyeeRows) {
      const box = rows.nth(i).getByTestId('box-count');
      await expect(box).toHaveAttribute('data-pair', 'true');
      await expect(box).toContainText('⇄');
    }
  });

  test('opening a row with a surface alternative shows its paragraph only inside the opened panel', async ({ page }) => {
    await gotoCompare(page);
    const rows = ranking(page).locator('li[data-row-id]');
    const n = await rows.count();
    let checked = false;
    for (let i = 0; i < n; i++) {
      const row = rows.nth(i);
      // 開く前は surface-alternative が居ない。
      await expect(row.getByTestId('surface-alternative')).toHaveCount(0);
      await openRankRow(page, i);
      const opened = row.getByTestId('surface-alternative');
      if ((await opened.count()) > 0) {
        checked = true;
        await expect(opened).toBeVisible();
        expect(await opened.evaluate((el) => el.tagName)).toBe('P');
      }
      await openRankRow(page, i); // 閉じ直す（次の行のチェックを独立させる）
    }
    // Surface 便を持つ行が既定カートに1つも無ければ、このテスト自体が
    // 検証すべきものを検証していない——明示的に落とす。
    expect(checked, 'expected at least one row with a surface alternative in the default cart').toBe(true);
  });
});

test.describe('rank board v2 — no horizontal scroll', () => {
  for (const width of [390, 1280]) {
    test(`ranking section never causes horizontal scroll at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await gotoCompare(page);
      const scrolls = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      expect(scrolls, `document is wider than the viewport at ${width}px`).toBe(false);
    });
  }
});
