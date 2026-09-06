import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  breakdownTable,
  cart,
  costRow,
  gotoCompare,
  headerCells,
  isNonDecreasing,
  openCart,
  openRankRow,
  parseYen,
  rankButtons,
  ranking,
  readRanking,
  rowCells,
  stepTable,
} from './helpers';

/**
 * 比較画面の E2E。**実際に押して、選んで、打ち込む。**
 * 数字は決め打ちしない（入力を変えれば動く）。固定するのは関係だけ:
 * 「1位が誰か」「昇順であること」「変化の向き」。
 */

// 確度4段階の title 属性（src/lib/ui/tiers.tsx の tierTitle）。
// クラス名ではなくこれで拾う。見た目が変わっても意味は変わらない。
const TITLE = {
  fixed: 'From the published price list',
  estimate: 'Our estimate, not a published figure',
  unverified: 'Second-hand source — we have not seen the original',
  none: 'Not included in the total — this is not zero',
} as const;

/** 税・関税に当たる費目。ここに ¥0 が出ていたら「未取得」を「無料」と偽っている。 */
const TAX_LABEL = /^(Duty|Sales tax|VAT|GST|Provincial tax|Customs clearance fee)/;

async function taxRowsOf(li: Locator): Promise<{ label: string; cells: string[] }[]> {
  const rows = li.getByRole('row');
  const n = await rows.count();
  const out: { label: string; cells: string[] }[] = [];
  for (let i = 0; i < n; i++) {
    const cells = await rowCells(rows.nth(i));
    const label = cells[0] ?? '';
    if (TAX_LABEL.test(label)) out.push({ label, cells });
  }
  return out;
}

// ────────────────────────────────────────────────────────────────
// desktop / mobile 共通
// ────────────────────────────────────────────────────────────────

test('1. the ranking is sorted by total, ascending, and so are the gaps', async ({ page }) => {
  await gotoCompare(page);
  const rows = await readRanking(page);

  expect(rows.length).toBeGreaterThanOrEqual(5);
  expect(isNonDecreasing(rows.map((r) => r.total))).toBe(true);
  expect(isNonDecreasing(rows.map((r) => r.diff))).toBe(true);

  // 1位だけが CHEAPEST で、差額は 0。
  expect(rows[0]!.cheapest).toBe(true);
  expect(rows.filter((r) => r.cheapest)).toHaveLength(1);
  expect(rows[0]!.diff).toBe(0);

  // 差額と総額が同じ順位付けを指していること。総額は ¥100 丸めなので誤差を許す。
  for (const r of rows.slice(1)) {
    expect(r.diff).toBeGreaterThan(0);
    expect(Math.abs(r.total - rows[0]!.total - r.diff)).toBeLessThanOrEqual(100);
  }
});

test('2. the cheapest row pays us nothing — money never buys rank', async ({ page }) => {
  await gotoCompare(page);
  const rows = await readRanking(page);

  // Neokyo は報酬を払わない。それでも1位に出る。ここが崩れたら製品の主張が崩れる。
  expect(rows[0]!.text).toContain('pays us nothing');

  // 「報酬を払う社が下位にいる」ことも併せて見る（そもそも払う社が居ないと主張にならない）。
  const paying = rows.filter((r) => /pays us ¥/.test(r.text));
  expect(paying.length).toBeGreaterThan(0);
  for (const r of paying) expect(r.rank).toBeGreaterThan(1);
});

test('3. what we do not have shows as — , never as ¥0', async ({ page }) => {
  await gotoCompare(page);
  const li = await openRankRow(page, 0);

  // 米国宛には連邦の売上税が無い＝我々は数字を持っていない。0 ではない。
  const vat = costRow(li, 'Sales tax / VAT');
  await expect(vat).toHaveCount(1);
  expect((await rowCells(vat))[1]).toBe('—');

  // 税・関税の行に ¥0 が出ていないこと。
  for (const { label, cells } of await taxRowsOf(li)) {
    for (const c of cells.slice(1)) {
      expect(c, `${label} shows ¥0`).not.toBe('¥0');
    }
  }
});

test('4. changing the destination changes the numbers', async ({ page }) => {
  await gotoCompare(page);
  const before = await readRanking(page);

  await page.getByLabel('Ship to').selectOption('GB');
  // 行き先が変われば EMS の地帯も税も変わる。総額が動くまで待つ。
  await expect
    .poll(async () => (await readRanking(page))[0]!.total)
    .not.toBe(before[0]!.total);

  const li = await openRankRow(page, 0);
  // 英国には VAT がある。米国で「—」だった行が金額になる。
  const vat = costRow(li, /^VAT/);
  await expect(vat).toHaveCount(1);
  const amount = (await rowCells(vat))[1]!;
  expect(amount).not.toBe('—');
  expect(parseYen(amount)).toBeGreaterThan(0);
});

test('5. an item with no weight data falls to a total per EMS weight step', async ({ page }) => {
  await gotoCompare(page);

  // 重量表に載らない語で手入力する。'plush toy' はどのラインにも当たらないので
  // 重量は null のまま入り、計算は EMS の段ごとの総額に落ちるはず。
  await page.getByRole('button', { name: 'Or add an item by hand' }).click();
  await page.getByLabel('Item name').fill('plush toy, no weight data');
  await page.getByLabel('Price ¥').fill('3000');
  await page.getByRole('button', { name: 'Add by hand' }).click();

  const c = await openCart(page);
  await expect(c.getByText(/weight unknown/i).first()).toBeVisible();

  // 1つの数字を押し付けない。段ごとの総額が出る。
  const section = stepTable(page);
  await expect(section).toHaveCount(1);

  // **各段の最安が同じ列に縦に並ぶこと** = 順位が重量に対して頑健、の可視化。
  const winners = await cheapestColumnPerStep(page);
  expect(winners.length).toBeGreaterThan(1);
  expect(new Set(winners).size, `cheapest moves between steps: ${winners.join(', ')}`).toBe(1);

  // 段表の数字は全部推定なので、確定値と同じ見た目になっていないこと。
  // デスクトップ用とモバイル用の2つの表が DOM に居るので、見えている方だけを見る。
  const shown = section.getByText(/^~¥/).locator('visible=true').first();
  await expect(shown).toBeVisible();
  // 色は Tailwind v4 が lab() で出すので値で比較しない。確度は色以外の signal で見る。
  await expect(shown).toHaveAttribute('title', 'Our estimate, not a published figure');

  // 段表に出る金額は例外なく '~' 付き。1つでも裸の ¥ があれば確定値に見える。
  // getByRole('cell') は隠れている側の表（sm:hidden / hidden sm:block）を拾わない。
  const money = (await section.getByRole('cell').allInnerTexts())
    .map((t) => t.replace(/\s+/g, ' ').trim())
    .filter((t) => t.includes('¥'));
  expect(money.length).toBeGreaterThan(0);
  for (const t of money) {
    expect(t, `a step total is not marked as an estimate: ${t}`).not.toMatch(/(?<!~)¥/);
  }
});

/** 段の表から、各段で最安のセルが何列目かを読む。 */
async function cheapestColumnPerStep(page: Page): Promise<number[]> {
  const section = stepTable(page);
  const wide = section.getByRole('table').first();
  if (await wide.isVisible()) {
    // デスクトップ: 列 = 会社。最安セルは塗られている（背景色でしか区別できない）。
    return wide.locator('tbody tr').evaluateAll((trs) =>
      trs.map((tr) => {
        const tds = Array.from(tr.querySelectorAll('td'));
        return tds.findIndex((td) => {
          const bg = getComputedStyle(td).backgroundColor;
          return bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
        });
      }),
    );
  }
  // モバイル: 'Cheapest' 列に社名がそのまま出る。列番号の代わりに社名を返す。
  const names = await section.getByRole('row').evaluateAll((trs) =>
    trs.slice(1).map((tr) => tr.querySelectorAll('td')[1]?.textContent?.trim() ?? ''),
  );
  const uniq = [...new Set(names)];
  return names.map((n) => uniq.indexOf(n));
}

test('6. one more of an item raises the total', async ({ page }) => {
  await gotoCompare(page);
  await openCart(page);
  const before = await readRanking(page);

  await cart(page).getByRole('button', { name: /^One more of / }).first().click();

  await expect
    .poll(async () => (await readRanking(page))[0]!.total)
    .toBeGreaterThan(before[0]!.total);

  // 全行が上がる。1点増えて安くなる社は無い。
  const after = await readRanking(page);
  for (const r of after) {
    const same = before.find((b) => b.name === r.name && b.variant === r.variant);
    if (same) expect(r.total).toBeGreaterThan(same.total);
  }
});

test('7. seller-paid shipping on a single item flips the cheapest row', async ({ page }) => {
  await gotoCompare(page);
  await openCart(page);

  // 1点だけにする。Buyee の consolidated / default が畳まれて行数も減る。
  const rowsBefore = await rankButtons(page).count();
  await cart(page).getByRole('button', { name: /^Remove / }).last().click();
  await expect(cart(page).getByRole('listitem')).toHaveCount(1);
  await expect(rankButtons(page)).toHaveCount(rowsBefore - 1);

  const before = await readRanking(page);
  expect(before[0]!.name).toBe('Neokyo');

  // 国内送料が消えると、それを込みで課金する Neokyo の優位が消える。
  await cart(page).getByRole('checkbox', { name: 'shipping included by seller' }).check();
  await expect
    .poll(async () => (await readRanking(page))[0]!.name)
    .toBe('FROM JAPAN');

  const after = await readRanking(page);
  expect(after[0]!.total).toBeLessThan(before[0]!.total);
  expect(isNonDecreasing(after.map((r) => r.total))).toBe(true);
});

test('8. editing a price marks that number as ours, not theirs', async ({ page }) => {
  await gotoCompare(page);
  await openCart(page);

  const edited = page.locator('[aria-label="edited by you"]'); // ARIA 属性。クラス名ではない
  await expect(edited).toHaveCount(0);

  const price = cart(page).getByRole('textbox', { name: /^Price of / }).first();
  const before = await readRanking(page);
  await price.fill('19800');

  await expect(edited.first()).toBeVisible();
  await expect(edited.first()).toHaveText('✎');
  await expect(cart(page).getByText('edited by you').first()).toBeVisible();
  await expect.poll(async () => (await readRanking(page))[0]!.total)
    .not.toBe(before[0]!.total);
});

test('9. no ad before consent; an ad only after Accept', async ({ page }) => {
  await gotoCompare(page, { consent: 'leave' });
  const ad = page.getByText('Ad · unrelated to the ranking');
  const banner = page.getByRole('dialog', { name: 'Cookie consent' });

  await expect(ad).toHaveCount(0);
  await banner.getByRole('button', { name: 'Reject' }).click();
  await expect(banner).toBeHidden();
  await expect(rankButtons(page).first()).toBeVisible();
  await expect(ad).toHaveCount(0);

  // 同意をやり直して、今度は受け入れる。
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(banner).toBeVisible();
  await expect(ad).toHaveCount(0);
  await banner.getByRole('button', { name: 'Accept' }).click();
  await expect(ad).toBeVisible();
});

test('10. only the links that actually pay us are marked sponsored', async ({ page }) => {
  await gotoCompare(page);
  const rows = await readRanking(page);

  let paying = 0;
  let free = 0;
  for (let i = 0; i < rows.length; i++) {
    const li = await openRankRow(page, i);
    const link = li.getByRole('link', { name: /^Open / });
    await expect(link).toBeVisible();
    const rel = ((await link.getAttribute('rel')) ?? '').split(/\s+/);
    await expect(link).toHaveAttribute('target', '_blank');
    expect(rel).toContain('noopener');
    expect(rel).toContain('nofollow');

    // 報酬を払う社だけが sponsored。払わない社に付けると虚偽の開示になる。
    if (/pays us nothing/.test(rows[i]!.text)) {
      expect(rel).not.toContain('sponsored');
      free++;
    } else {
      expect(rel).toContain('sponsored');
      paying++;
    }
    await openRankRow(page, i); // 閉じる
  }
  // 両方が実在しないと、この区別を検証したことにならない。
  expect(paying).toBeGreaterThan(0);
  expect(free).toBeGreaterThan(0);
});

// ────────────────────────────────────────────────────────────────
// desktop 専用
// ────────────────────────────────────────────────────────────────

test.describe('desktop layout', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'lg 以上の表なので desktop でだけ見る');
  });

  test('11. the breakdown table has one column per ranked row', async ({ page }) => {
    await gotoCompare(page);
    const table = breakdownTable(page);
    await expect(table).toBeVisible();

    const ranked = await rankButtons(page).count();
    const headers = await headerCells(table);
    // 先頭は費目の見出し。残りが会社の列。
    expect(headers[0]).toBe('Cost');
    expect(headers).toHaveLength(ranked + 1);

    // 列順＝順位順。
    const rows = await readRanking(page);
    for (let i = 0; i < rows.length; i++) {
      expect(headers[i + 1]).toContain(rows[i]!.name);
    }
  });

  test('12. confidence is actually drawn: ~ for estimates, dotted for second-hand, — for missing', async ({ page }) => {
    await gotoCompare(page);
    const table = breakdownTable(page);
    await expect(table).toBeVisible();

    // 推定は '~' 前置。
    const estimate = table.getByTitle(TITLE.estimate).first();
    await expect(estimate).toBeVisible();
    expect((await estimate.innerText()).trim()).toMatch(/^~¥/);

    // 未取得は '—'。0 とは書かない。
    const none = table.getByTitle(TITLE.none).first();
    await expect(none).toBeVisible();
    expect((await none.innerText()).trim()).toBe('—');

    // 二次情報は点線の下線。**クラス名ではなく computed style で見る。**
    const unverified = table.getByTitle(TITLE.unverified).first();
    await expect(unverified).toBeVisible();
    const deco = await unverified.evaluate((el) => {
      const s = getComputedStyle(el);
      return { line: s.textDecorationLine, style: s.textDecorationStyle };
    });
    expect(deco.style).toBe('dotted');
    expect(deco.line).toContain('underline');

    // 一次情報には下線が付かない（点線が「二次情報だけ」を意味していること）。
    const fixed = table.getByTitle(TITLE.fixed).first();
    await expect(fixed).toBeVisible();
    const plain = await fixed.evaluate((el) => getComputedStyle(el).textDecorationLine);
    expect(plain).toBe('none');
  });
});

// ────────────────────────────────────────────────────────────────
// mobile 専用
// ────────────────────────────────────────────────────────────────

test.describe('mobile layout', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', '狭い画面の畳み方なので mobile でだけ見る');
  });

  test('13. nothing scrolls sideways', async ({ page }) => {
    await gotoCompare(page);
    const overflow = async () =>
      page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        inner: window.innerWidth,
      }));

    const atStart = await overflow();
    expect(atStart.scroll).toBe(atStart.inner);

    // 一番長い行（最下位＝差額が大きい）を開いても、はみ出さないこと。
    await openRankRow(page, (await rankButtons(page).count()) - 1);
    const opened = await overflow();
    expect(opened.scroll).toBe(opened.inner);

    await openCart(page);
    const withCart = await overflow();
    expect(withCart.scroll).toBe(withCart.inner);
  });

  test('14. no cost×company table on a phone', async ({ page }) => {
    await gotoCompare(page);
    await expect(breakdownTable(page)).toBeHidden();
    // 順位リストの中の表も、開くまでは出ていない。
    await expect(ranking(page).getByRole('table')).toHaveCount(0);
  });

  test('15. tapping a row opens the two-column comparison against the cheapest', async ({ page }) => {
    await gotoCompare(page);
    const rows = await readRanking(page);

    // 2位を開く: 自社・最安・差額の3列＋費目。
    await rankButtons(page).nth(1).tap();
    const second = ranking(page).getByRole('listitem').nth(1);
    await expect(second.getByRole('table')).toBeVisible();
    expect(await headerCells(second)).toEqual([
      'Cost', rows[1]!.name, rows[0]!.name, 'diff',
    ]);

    // 最安を開くと、比べる相手が居ないので列が減る。
    await rankButtons(page).nth(1).tap();
    await rankButtons(page).nth(0).tap();
    const first = ranking(page).getByRole('listitem').nth(0);
    await expect(first.getByRole('table')).toBeVisible();
    expect(await headerCells(first)).toEqual(['Cost', rows[0]!.name]);
  });
});
