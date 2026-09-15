import { expect, test } from '@playwright/test';
import {
  addByHand, emptyCart, gotoCompare, openCart, openRankRow, ranking, readRanking, weightBox,
} from './helpers';

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
    // **既定カートの non-comparable 状態には依存しない**——実測で既定カート
    // (US) は Neokyo も含めて全行 comparable になりうる（データ次第で動く）。
    // e2e/compare.spec.ts のテスト18cと同じ手法で、方式の上限を超える重さの
    // 品を足し、方式を「小形包装物」に固定して**確実に**全行 non-comparable
    // にする。
    await gotoCompare(page);
    await addByHand(page, 'Heavy box for rank-column check', 8000);
    const heavy = weightBox(page, 'Heavy box for rank-column check');
    await heavy.fill('5000');
    await heavy.blur();
    await page.getByLabel('Ship by').selectOption('small-packet-air');

    await expect.poll(async () => {
      const rows = await readRanking(page);
      return rows.length > 0 && rows.every((r) => !r.comparable);
    }).toBe(true);

    const all = await readRanking(page);
    for (const r of all) {
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
        // **必ず棒が描かれる。**方式が公表/未公表/完全未知のどれでも
        // `arrival-bar` は常に1つ存在する（台帳、Fable レビュー: 以前はここが
        // テキストのみのフォールバックに落ちて棒が0本になっていた）。
        await expect(arrivalBar).toHaveCount(1);
        await expect(arrivalBar.getByText('Ships by')).toBeVisible();
      } else {
        // **比べられない行には総額バーも到着バーも出さない**——その方式では
        // そもそも送れないので、出すと「送れる」かのように見える。
        await expect(totalBar).toHaveCount(0);
        await expect(arrivalBar).toHaveCount(0);
      }
    }
    // 共通スケールのコンテナ自体は全行同じ最大幅（max-w-[160px]）を使っている
    // ——描画された実幅がすべて同じであること（コンテナのCSSが行ごとに違わない）。
    const distinct = new Set(totalBarWidths.map((w) => Math.round(w)));
    expect(distinct.size, `total-bar widths differ across rows: ${[...distinct]}`).toBe(1);
  });

  test('a not-comparable row shows neither a total bar nor an arrival bar', async ({ page }) => {
    // 上の「①not-comparable な行は順位番号なし」と同じ確実な手法で全行を
    // non-comparable にし、バーが1本も出ないことを直接確認する。
    await gotoCompare(page);
    await addByHand(page, 'Heavy box for no-bars check', 8000);
    const heavy = weightBox(page, 'Heavy box for no-bars check');
    await heavy.fill('5000');
    await heavy.blur();
    await page.getByLabel('Ship by').selectOption('small-packet-air');

    const rows = ranking(page).locator('li[data-row-id]');
    await expect.poll(async () => {
      const list = await readRanking(page);
      return list.length > 0 && list.every((r) => !r.comparable);
    }).toBe(true);

    const n = await rows.count();
    for (let i = 0; i < n; i++) {
      await expect(rows.nth(i).getByTestId('total-bar')).toHaveCount(0);
      await expect(rows.nth(i).getByTestId('arrival-bar')).toHaveCount(0);
    }
  });

  test('upper-bound-unknown total bar draws an open dotted end instead of a false ceiling', async ({ page }) => {
    await gotoCompare(page);
    const rows = ranking(page).locator('li[data-row-id]');
    const n = await rows.count();
    let sawUnknown = false;
    for (let i = 0; i < n; i++) {
      const bar = rows.nth(i).getByTestId('total-bar');
      if ((await bar.count()) === 0) continue;
      if ((await bar.getAttribute('data-upper-unknown')) === 'true') {
        sawUnknown = true;
        const openEnd = rows.nth(i).getByTestId('total-bar-open-end');
        await expect(openEnd).toBeVisible();
        const ob = await openEnd.boundingBox();
        expect(ob!.width, `row ${i}: open end must have a visible fixed length`).toBeGreaterThanOrEqual(12);
        await expect(bar).toHaveAttribute('aria-label', /no upper bound/);
      }
    }
    expect(sawUnknown, 'expected at least one row with an unknown upper bound in the default cart')
      .toBe(true);
  });

  /**
   * 台帳（Fable レビュー）: 「到着の棒が EMS・小形包装物・宅配便でそれぞれ
   * 描画される」。3方式それぞれを「Ship by」で明示的に選び、毎回すべての
   * comparable 行に `arrival-bar` が出て、線種が期待どおりであることを確認する。
   * 既定カート（`method: 'cheapest'`）の実測データの顔ぶれには依存しない。
   */
  for (const [methodId, expectSolid, label, lightenCart] of [
    ['ems', true, 'EMS ("a week or less" — UI 側の週→日換算で棒になる)', false],
    // **小形包装物は2kg上限**（`postage.ts`）。既定カートの合計重量はこの上限
    // ギリギリ／超え得るため（e2e/compare.spec.ts のテスト18cが8000gの品を
    // わざわざ足して超過させているのと同じマスタ）、この方式だけはカートを
    // 空にして軽い1点に絞り、上限とは無関係に comparable であることを保証する。
    ['small-packet-air', true, 'Small packet (airmail) ("10 days or less")', true],
  ] as const) {
    test(`arrival bar draws a numeric segment for ${label}`, async ({ page }) => {
      await gotoCompare(page);
      if (lightenCart) {
        await emptyCart(page);
        await addByHand(page, 'Light item for small-packet-air check', 1000);
        // PR-C でカートは既定で畳まれる。重量欄に触る前に開く。
        await openCart(page);
        await weightBox(page, 'Light item for small-packet-air check').fill('300');
        await weightBox(page, 'Light item for small-packet-air check').blur();
      }
      await page.getByLabel('Ship by').selectOption(methodId);

      const rows = ranking(page).locator('li[data-row-id]');
      await expect.poll(async () => {
        const list = await readRanking(page);
        return list.some((r) => r.comparable);
      }, `expected at least one comparable row after forcing ${methodId}`).toBe(true);

      const n = await rows.count();
      let sawSegment = false;
      for (let i = 0; i < n; i++) {
        const list = await readRanking(page);
        if (!list[i]?.comparable) continue;
        const bar = rows.nth(i).getByTestId('arrival-bar');
        await expect(bar).toHaveCount(1);
        await expect(bar).toHaveAttribute('data-published', expectSolid ? 'true' : 'false');
        const segment = rows.nth(i).getByTestId('arrival-bar-segment');
        const cls = (await segment.getAttribute('class')) ?? '';
        expect(cls).toContain(expectSolid ? 'border-solid' : 'border-dotted');
        sawSegment = true;
      }
      expect(sawSegment, `expected at least one comparable row to check for ${methodId}`).toBe(true);
    });
  }

  test('arrival bar draws a dotted, un-lengthed segment for an unpublished courier day estimate', async ({ page }) => {
    // 宅配便（`CourierMethod`）は `Row.days.tier` が常に `'none'`（`buildRow` が
    // 明示的にそう組む）——未公表として点線で描かれることを検証する。米国は
    // 宅配便が価格化されている唯一の宛先（`courierMethodAvailable`）なので、
    // ここで courier-ups を明示的に選ぶ。
    await gotoCompare(page);
    await page.getByLabel('Ship by').selectOption('courier-ups');

    const rows = ranking(page).locator('li[data-row-id]');
    await expect.poll(async () => {
      const list = await readRanking(page);
      return list.some((r) => r.comparable);
    }, 'expected at least one comparable row after forcing courier-ups').toBe(true);

    const list = await readRanking(page);
    let checked = false;
    for (let i = 0; i < list.length; i++) {
      if (!list[i]?.comparable) continue;
      const bar = rows.nth(i).getByTestId('arrival-bar');
      await expect(bar).toHaveAttribute('data-published', 'false');
      const segment = rows.nth(i).getByTestId('arrival-bar-segment');
      expect(await segment.getAttribute('class')).toContain('border-dotted');
      // **生の "not yet modeled" は行に出ない**——方式名だけ見せる。
      await expect(rows.nth(i)).not.toContainText('not yet modeled');
      checked = true;
    }
    expect(checked, 'expected at least one comparable row for courier-ups').toBe(true);
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

test.describe('rank board v2 — Fable review shapes', () => {
  test('upper-unknown open end stays visible on a row whose low sits at 100% of the scale (US, EMS)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoCompare(page);
    await page.getByLabel('Ship by').selectOption('ems');
    const bars = ranking(page).locator('[data-testid="total-bar"][data-upper-unknown="true"]');
    await expect.poll(() => bars.count()).toBeGreaterThan(0);
    const n = await bars.count();
    let sawFull = false;
    for (let i = 0; i < n; i++) {
      const bar = bars.nth(i);
      const track = await bar.getByTestId('total-bar-track').boundingBox();
      const openEnd = bar.getByTestId('total-bar-open-end');
      await expect(openEnd).toBeVisible();
      const ob = (await openEnd.boundingBox())!;
      expect(ob.width).toBeGreaterThanOrEqual(12);
      // 下限の位置に関係なく、点線は棒の右端より右まで途切れず見えている。
      if (ob.x >= track!.x + track!.width - 1) sawFull = true;
    }
    expect(sawFull, 'expected a low=100% upper-unknown row (US EMS Jauce)').toBe(true);
  });

  for (const width of [390, 1280]) {
    test(`total bars share the same left x on every row, incl. long method names (${width}px)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await gotoCompare(page);
      const bars = ranking(page).getByTestId('total-bar');
      await expect.poll(() => bars.count()).toBeGreaterThan(1);
      const xs = await bars.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
      const arrivals = await ranking(page).getByTestId('arrival-bar-track')
        .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
      const labels = await ranking(page).getByTestId('arrival-bar').allInnerTexts();
      expect(labels.some((l) => l.length > 30), `expected a long method name: ${labels}`).toBe(true);
      expect(new Set(xs).size, `total-bar left x differs: ${xs}`).toBe(1);
      expect(new Set(arrivals).size, `arrival-bar left x differs: ${arrivals}`).toBe(1);
    });
  }

  test('untracked and unpublished arrival bars end in different shapes', async ({ page }) => {
    await gotoCompare(page);
    await emptyCart(page);
    await addByHand(page, 'Light item for end-shape check', 1000);
    // PR-C でカートは既定で畳まれる。重量欄に触る前に開く。
    await openCart(page);
    await weightBox(page, 'Light item for end-shape check').fill('300');
    await weightBox(page, 'Light item for end-shape check').blur();
    const shipBy = page.getByLabel('Ship by');

    await shipBy.selectOption('small-packet-air');
    const untracked = ranking(page).locator('[data-testid="arrival-bar"][data-tracked="false"]').first();
    await expect(untracked).toBeVisible();
    const ring = untracked.locator('[data-testid="arrival-bar-end"]');
    await expect(ring).toHaveAttribute('data-end', 'untracked');
    await expect(ring).toBeVisible();
    const ringRadius = await ring.evaluate((e) => getComputedStyle(e).borderRadius);
    await expect(untracked.getByRole('img')).toHaveAttribute('aria-label', /untracked/);

    await shipBy.selectOption('courier-ups');
    const unpub = ranking(page).locator('[data-testid="arrival-bar"][data-published="false"]').first();
    await expect(unpub).toBeVisible();
    const end = unpub.locator('[data-testid="arrival-bar-end"]');
    await expect(end).toHaveAttribute('data-end', 'unpublished');
    expect(await unpub.getByTestId('arrival-bar-segment').getAttribute('class')).toContain('border-dotted');
    await expect(unpub.getByRole('img')).toHaveAttribute('aria-label', /not published/);
    const endRadius = await end.evaluate((e) => getComputedStyle(e).borderRadius);
    expect(endRadius).not.toBe(ringRadius);
  });

  test('opened row shows the raw arrival text in the international shipping line', async ({ page }) => {
    await gotoCompare(page);
    await page.getByLabel('Ship by').selectOption('ems');
    await openRankRow(page, 0);
    await expect(ranking(page).getByTestId('intl-days').first()).toContainText('a week or less');
  });
});
