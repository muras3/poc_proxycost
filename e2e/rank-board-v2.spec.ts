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
    // **既定カートの non-comparable 状態には依存しない**——方式を DHL（`courier-dhl`）に
    // 固定すると、米国ではその便を売る社だけが比べられ、他の社は「売っていない」
    // として順位の外に置かれる（Mock v3 状態5「Method fixed」と同じ形）。
    // **全行**を比べられなくすると盤そのものが「Can't compare」の枠に替わる
    // （下のテスト）ので、ここでは混在する状態を作る。
    await gotoCompare(page);
    await page.getByLabel('Ship by').selectOption('courier-dhl');

    await expect.poll(async () => {
      const rows = await readRanking(page);
      return rows.some((r) => r.comparable) && rows.some((r) => !r.comparable);
    }).toBe(true);

    const all = await readRanking(page);
    for (const r of all) {
      if (r.comparable) expect(r.shownRank, `${r.name}: comparable row must show a rank`).toBeGreaterThan(0);
      else expect(r.shownRank, `${r.name}: not-comparable row must not show a rank number`).toBe(0);
    }
    // 比べられない行は比べられる行の後ろに並ぶ。
    const firstNot = all.findIndex((r) => !r.comparable);
    expect(all.slice(firstNot).every((r) => !r.comparable)).toBe(true);
    // 理由は行の下の注記として出る（閉じた見出しの中ではなく）。
    const rows = ranking(page).locator('li[data-row-id]');
    for (let i = firstNot; i < all.length; i++) {
      await expect(rows.nth(i).locator('.cav')).toContainText(/Not ranked:/);
    }
  });

  test('when no row can be compared, the board gives way to a "Can\'t compare" panel that names each reason', async ({ page }) => {
    // e2e/compare.spec.ts のテスト18cと同じ手法で、方式の上限を超える重さの
    // 品を足し、方式を「小形包装物」に固定して**確実に**全行 non-comparable にする。
    await gotoCompare(page);
    await addByHand(page, 'Heavy box for rank-column check', 8000);
    await openCart(page);
    const heavy = weightBox(page, 'Heavy box for rank-column check');
    await heavy.fill('5000');
    await heavy.blur();
    await page.getByLabel('Ship by').selectOption('small-packet-air');

    const panel = page.getByTestId('norank');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText(/Can.t compare/);
    // 盤は出ない——総額の無い行に順位・棒を描かない（Mock v3 状態7c）。
    await expect(ranking(page)).toHaveCount(0);
    await expect(page.getByTestId('total-bar')).toHaveCount(0);
    await expect(page.getByTestId('arrival-bar')).toHaveCount(0);
    // 社ごとの理由が1行ずつ並ぶ。
    expect(await panel.locator('li[data-row-id]').count()).toBeGreaterThan(1);
  });

  test('total bar and arrival bar render for every comparable row, on a shared scale', async ({ page }) => {
    await gotoCompare(page);
    const rows = ranking(page).locator('li[data-row-id]');
    const n = await rows.count();
    const totalBarWidths: number[] = [];
    for (let i = 0; i < n; i++) {
      const row = rows.nth(i);
      const text = (await row.innerText()).replace(/\s+/g, ' ');
      const comparable = !/NOT RANKED/.test(text);
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
        // 方式名は列の中に見える文字で（見出しは列頭の "Ships by / arrives"）。
        await expect(arrivalBar).toHaveAttribute('aria-label', /^Ships by /);
      } else {
        // **比べられない行には総額バーも到着バーも出さない**——その方式では
        // そもそも送れないので、出すと「送れる」かのように見える。
        await expect(totalBar).toHaveCount(0);
        await expect(arrivalBar).toHaveCount(0);
      }
    }
    // 共通スケールのコンテナ自体は全行同じ幅（Mock `.totbar` 112px）を使っている
    // ——描画された実幅がすべて同じであること（コンテナのCSSが行ごとに違わない）。
    const distinct = new Set(totalBarWidths.map((w) => Math.round(w)));
    expect(distinct.size, `total-bar widths differ across rows: ${[...distinct]}`).toBe(1);
  });

  test('a not-comparable row shows neither a total bar nor an arrival bar', async ({ page }) => {
    // 上の「順位番号なし」と同じ混在状態（DHL 固定）で、比べられない行にだけ
    // 棒が1本も出ないことを直接確認する。
    await gotoCompare(page);
    await page.getByLabel('Ship by').selectOption('courier-dhl');

    const rows = ranking(page).locator('li[data-row-id]');
    await expect.poll(async () => {
      const list = await readRanking(page);
      return list.some((r) => r.comparable) && list.some((r) => !r.comparable);
    }).toBe(true);

    const list = await readRanking(page);
    for (let i = 0; i < list.length; i++) {
      if (list[i]!.comparable) continue;
      // **比べられない行には総額バーも到着バーも出さない**——その方式では
      // そもそも送れないので、出すと「送れる」かのように見える。
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
        // 「以上」は総額の文字自身が言う（棒は aria-hidden の絵）。
        await expect(rows.nth(i).getByTestId('row-total').locator('.tot'))
          .toHaveAttribute('aria-label', /upper bound unknown/);
      }
    }
    expect(sawUnknown, 'expected at least one row with an unknown upper bound in the default cart')
      .toBe(true);
  });

  /**
   * 台帳（Fable レビュー）: 「到着の棒が EMS・小形包装物・宅配便でそれぞれ
   * 描画される」。方式を「Ship by」で明示的に選び、毎回すべての comparable 行に
   * `arrival-bar` が出て、線種が期待どおりであることを確認する。
   *
   * 線種は **`Row.days.minDays/maxDays`（構造化フィールド）だけ**で決まる——
   * 文字列を正規表現で読まない。EMS の "a week or less" は一次情報だが日数の数字を
   * 持たない（エンジンは週→日を換算しない）ので、棒は「数字が無い」点線になり、
   * 公表された数字を持つ小形包装物（"10 days or less"）と航空小包（"12–26 days"）
   * だけが実線の区間を持つ。既定カート（`method: 'cheapest'`）の実測データの
   * 顔ぶれには依存しない。
   */
  for (const [methodId, style, label] of [
    ['ems', 'dotted', 'EMS ("a week or less" — no day figure, so no segment length)'],
    ['small-packet-air', 'solid', 'Small packet (airmail) ("10 days or less")'],
    ['parcel-air', 'solid', 'International parcel (air) ("12–26 days")'],
  ] as const) {
    test(`arrival bar draws the right line style for ${label}`, async ({ page }) => {
      await gotoCompare(page);
      // **小形包装物は2kg上限**（`postage.ts`）。既定カートの合計重量はこの上限
      // ギリギリ／超え得るため、カートを空にして軽い1点に絞り、上限とは無関係に
      // comparable であることを保証する（他の2方式にも同じカートで揃える）。
      await emptyCart(page);
      await addByHand(page, 'Light item for arrival-bar check', 1000);
      // PR-C でカートは既定で畳まれる。重量欄に触る前に開く。
      await openCart(page);
      await weightBox(page, 'Light item for arrival-bar check').fill('300');
      await weightBox(page, 'Light item for arrival-bar check').blur();
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
        // **方式を固定すると全行が同じ方式なので、Ships by の列は畳まれる**（Mock v3
        // `.board.uniform .c-ship{display:none}`——全行に同じ字を6回書かない）。棒の
        // 中身（線種）は属性で読む。実際に描かれることは、方式が混ざる既定カートの
        // テスト（上の「on a shared scale」）が見ている。
        await expect(bar).toBeHidden();
        // 日本郵便の日数は一次情報（`tier: 'fixed'`）——線種とは別の事実。
        await expect(bar).toHaveAttribute('data-published', 'true');
        const segment = rows.nth(i).getByTestId('arrival-bar-segment');
        await expect(segment).toHaveAttribute('data-style', style);
        if (style === 'solid') {
          // 実線の区間は物差しの一部分——全幅ではない（left/width は % で入る）。
          const w = await segment.evaluate((e) => parseFloat((e as HTMLElement).style.width));
          expect(w).toBeLessThan(100);
        }
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
      await expect(segment).toHaveAttribute('data-style', 'dotted');
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

  test('opening a row with a surface alternative shows its line only inside the opened log', async ({ page }) => {
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
        // 配達ログの中の1行（Export の段）——閉じた行の見出しには居ない。
        await expect(opened).toHaveRole('row');
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
      const whole = (await bar.boundingBox())!;
      const track = (await bar.getByTestId('total-bar-track').boundingBox())!;
      const openEnd = bar.getByTestId('total-bar-open-end');
      await expect(openEnd).toBeVisible();
      const ob = (await openEnd.boundingBox())!;
      expect(ob.width).toBeGreaterThanOrEqual(12);
      // 下限の位置に関係なく、開いた終端は棒の右端まで途切れず届いている（右へ消える）。
      expect(ob.x + ob.width).toBeGreaterThanOrEqual(whole.x + whole.width - 1);
      // 下限が物差しの 100% に居る行でも、開いた終端は同じ長さで見えている。
      if (track.width >= whole.width - 1) sawFull = true;
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
      // 到着の棒は desktop では自分の列を持つので左端が揃う。狭い幅では Mock v3 の
      // とおり方式名の右に並ぶ（`.c-ship{flex-direction:row}`）ので、行ごとに位置が違う。
      if (width >= 760) expect(new Set(arrivals).size, `arrival-bar left x differs: ${arrivals}`).toBe(1);
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

    // 方式を固定すると Ships by の列は畳まれる（Mock `.board.uniform`）ので、形は属性で読む。
    // 追跡なし ＝ 棒の終端に開いた赤い輪（Mock `.daybar .ring`）。
    await shipBy.selectOption('small-packet-air');
    const untracked = ranking(page).locator('[data-testid="arrival-bar"][data-tracked="false"]').first();
    await expect(untracked).toHaveCount(1);
    const ring = untracked.locator('[data-testid="arrival-bar-end"]');
    await expect(ring).toHaveAttribute('data-end', 'untracked');
    expect(await ring.evaluate((e) => getComputedStyle(e).borderRadius)).toBe('50%');
    await expect(untracked).toHaveAttribute('aria-label', /untracked/);

    // 未公表 ＝ 長さの無い点線。輪は付かない（追跡の有無とは別の事実）。
    await shipBy.selectOption('courier-ups');
    const unpub = ranking(page).locator('[data-testid="arrival-bar"][data-published="false"]').first();
    await expect(unpub).toHaveCount(1);
    await expect(unpub.locator('[data-testid="arrival-bar-end"]')).toHaveCount(0);
    await expect(unpub.getByTestId('arrival-bar-segment')).toHaveAttribute('data-style', 'dotted');
    await expect(unpub).toHaveAttribute('aria-label', /not published/);
  });

  test('opened row shows the raw arrival text in the international shipping line', async ({ page }) => {
    await gotoCompare(page);
    await page.getByLabel('Ship by').selectOption('ems');
    await openRankRow(page, 0);
    // 配達ログの国際送料の行の下に、方式名・日数の原文・追跡の有無が1行で出る。
    await expect(ranking(page).getByTestId('intl-line-note').first()).toContainText('a week or less');
  });
});
