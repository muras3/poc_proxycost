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
  type RankRow,
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

/** 行の開示文から報酬の有無を読む。'pays us nothing' 以外は我々に報酬を払う社。 */
const paysUs = (r: RankRow) => !/pays us nothing/.test(r.text);

/** 社名（と variant）で順位を引く。居なければその場で落とす。 */
function rankOf(rows: RankRow[], name: string, variant: string | null = null): number {
  const row = rows.find((r) => r.name === name && r.variant === variant);
  expect(row, `${name}${variant ? `, ${variant}` : ''} is not in the ranking`).toBeTruthy();
  return row!.rank;
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

test('2. rank is decided by the total alone — paying us buys neither the top spot nor safety from the bottom', async ({ page }) => {
  await gotoCompare(page);

  // 順位の根拠を画面が名乗っていること。**「1位が誰か」ではなく「何で並べたか」**が主張の中身。
  await expect(page.getByText(/ranked by the total that reaches your door/i)).toBeVisible();
  await expect(page.getByText(/pay us and some do not — that never moves a row/i)).toBeVisible();

  const rows = await readRanking(page);
  expect(rows.length).toBeGreaterThanOrEqual(5);

  // 報酬の有無は全行が名乗る。名乗らない行があると混在を確かめようがない。
  for (const r of rows) expect(r.text, `${r.name} does not disclose the referral`).toMatch(/pays us/);

  // 並びは総額の昇順そのもの。報酬で並べ替えられていないことを、画面の並びで見る。
  const key = (r: RankRow) => `${r.name}${r.variant ? `/${r.variant}` : ''}`;
  expect(rows.map(key)).toEqual([...rows].sort((a, b) => a.total - b.total).map(key));

  // 1位が1位である理由は総額が最小であること。CHEAPEST もそこにだけ付く。
  expect(rows[0]!.total).toBe(Math.min(...rows.map((r) => r.total)));
  expect(rows[0]!.cheapest).toBe(true);
  expect(rows.filter((r) => r.cheapest)).toHaveLength(1);

  const paying = rows.filter(paysUs);
  const free = rows.filter((r) => !paysUs(r));
  expect(paying.length).toBeGreaterThan(0);
  expect(free.length).toBeGreaterThan(0);

  // **払う社と払わない社が混ざって並ぶ。**払う社が上に固まっていたら、この順に
  // 報酬が効いていることになる。上下どちらの向きの並びも実在することで否定する。
  expect(free.some((f) => paying.some((p) => p.rank > f.rank)), 'every paying row sits above every free row').toBe(true);
  expect(paying.some((p) => free.some((f) => f.rank > p.rank)), 'every free row sits above every paying row').toBe(true);

  // 既定の2点では1位も最下位も我々に報酬を払う社（2026-09-06 の実測）。
  // **これは「払う社が勝つ」という主張ではない。**払っていても最安なら1位に出るし、
  // 払っていても高ければ最下位に落ちる、という同じ規則の両端である。
  expect(paysUs(rows[0]!), 'the top row does not pay us — the interesting case is not exercised').toBe(true);
  expect(paysUs(rows[rows.length - 1]!), 'paying us kept a row off the bottom').toBe(true);

  // 1点に減らすと最下位は報酬を払わない社に替わる。最下位も報酬では決まっていない。
  const rowsBefore = await rankButtons(page).count();
  await openCart(page);
  await cart(page).getByRole('button', { name: /^Remove / }).last().click();
  await expect(cart(page).getByRole('listitem')).toHaveCount(1);
  await expect(rankButtons(page)).toHaveCount(rowsBefore - 1);

  const single = await readRanking(page);
  expect(paysUs(single[single.length - 1]!), 'the bottom row still pays us — both sides must be able to land there').toBe(false);
  expect(isNonDecreasing(single.map((r) => r.total))).toBe(true);
  expect(single[0]!.total).toBe(Math.min(...single.map((r) => r.total)));
  expect(single[0]!.cheapest).toBe(true);
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

  const steps = await readStepTable(page);
  expect(steps.length).toBeGreaterThan(1);

  // どの段にも数字が出る。**空でも ¥0 でもない。**段を出す以上、全部の段で出す。
  for (const s of steps) {
    expect(s.cells.length, `${s.label} has no cells`).toBeGreaterThan(0);
    for (const cell of s.cells) {
      expect(cell, `${s.label} has a cell without a number`).toMatch(/~¥[\d,]+/);
    }
    for (const t of s.totals) expect(t, `${s.label} shows a total of ${t}`).toBeGreaterThan(0);
  }

  // 重くなれば高くなる。段をまたいで単調（同額は許す。段の刻みは料金表の刻み）。
  const lows = steps.map((s) => Math.min(...s.totals));
  const highs = steps.map((s) => Math.max(...s.totals));
  expect(isNonDecreasing(lows), `the cheapest total is not monotone: ${lows.join(', ')}`).toBe(true);
  expect(isNonDecreasing(highs), `the dearest total is not monotone: ${highs.join(', ')}`).toBe(true);
  // 全段同額だと単調は自明に真になる。実際に上がっていること。
  expect(lows[lows.length - 1]).toBeGreaterThan(lows[0]!);
  // デスクトップは社ごとの列があるので、列単位でも単調であること。
  const cols = steps[0]!.totals.length;
  if (cols > 2) {
    for (let i = 0; i < cols; i++) {
      const col = steps.map((s) => s.totals[i]!);
      expect(isNonDecreasing(col), `column ${i} is not monotone: ${col.join(', ')}`).toBe(true);
    }
  }

  // **最安の社は段によって替わる。これが仕様。**
  // 「どの段でも同じ社が最安」は 2026-09-06 の実測で否定された
  // （docs/DESIGN-NOTES.md §1、docs/audit/measured-2026-09-06.md）。
  // 軽い段と重い段で勝者が違うのは、重量に非線形に効く費目があるため。
  const winners = steps.map((s) => s.cheapest);
  expect(new Set(winners).size, `the cheapest never moves between steps: ${winners.join(', ')}`)
    .toBeGreaterThan(1);
  expect(winners[0], 'the lightest and the heaviest step have the same winner')
    .not.toBe(winners[winners.length - 1]);

  // 替わるという事実が**利用者に届いていること。**段ごとの勝者を名指しで出す。
  const note = page.getByText(/The cheapest option changes with weight/).first();
  await expect(note).toBeVisible();
  const noteText = (await note.innerText()).replace(/\s+/g, ' ');
  for (const s of steps) {
    expect(noteText, `the note does not say who is cheapest at ${s.label}`)
      .toContain(`${s.label}: ${s.cheapest}`);
  }

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

interface StepRow {
  /** '500 g' / '1 kg'。EMS 料金表の段そのもの。 */
  label: string;
  /** その段で最安と示されている社。デスクトップは塗られた列の見出し、モバイルは Cheapest 欄。 */
  cheapest: string;
  /** 段の行から読める総額。デスクトップは社ごと、モバイルは幅の両端。 */
  totals: number[];
  /** 金額セルの生テキスト。空欄・'—' を見つけるのに使う。 */
  cells: string[];
}

/** 段の表を読む。デスクトップ（社ごとの列）とモバイル（3列）の両方に対応する。 */
async function readStepTable(page: Page): Promise<StepRow[]> {
  const section = stepTable(page);
  // 隠れている側の表は role で拾われないので、見えている表がそのまま取れる。
  const table = section.getByRole('table').first();
  await expect(table).toBeVisible();
  const wide = (await headerCells(table))[0] === 'Weight / item';

  if (wide) {
    // 列 = 会社。見出しの1行目が社名（2行目に variant が付くことがある）。
    const names = await table.locator('thead th').evaluateAll((ths) =>
      ths.slice(1).map((th) => (th.firstChild?.textContent ?? '').trim()),
    );
    const raw = await table.locator('tbody tr').evaluateAll((trs) =>
      trs.map((tr) => {
        const tds = Array.from(tr.querySelectorAll('td'));
        return {
          label: (tds[0]?.textContent ?? '').replace(/\s+/g, ' ').trim(),
          cells: tds.slice(1).map((td) => (td.textContent ?? '').replace(/\s+/g, ' ').trim()),
          // 最安セルは背景色でしか区別できない。クラス名ではなく computed style で見る。
          win: tds.slice(1).findIndex((td) => {
            const bg = getComputedStyle(td).backgroundColor;
            return bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
          }),
        };
      }),
    );
    return raw.map((r) => {
      expect(r.win, `no cheapest cell is marked on the ${r.label} step`).toBeGreaterThanOrEqual(0);
      return { label: r.label, cheapest: names[r.win] ?? '', totals: r.cells.map(parseYen), cells: r.cells };
    });
  }

  // モバイル: 段 / 最安（社名＋その額）/ 幅。社ごとの内訳は出ないので幅の両端を読む。
  const raw = await table.locator('tbody tr').evaluateAll((trs) =>
    trs.map((tr) => {
      const tds = Array.from(tr.querySelectorAll('td'));
      const spans = Array.from(tds[1]?.querySelectorAll('span') ?? []);
      return {
        label: (tds[0]?.textContent ?? '').replace(/\s+/g, ' ').trim(),
        cheapest: (spans[0]?.textContent ?? '').trim(),
        low: (spans[1]?.textContent ?? '').trim(),
        range: (tds[2]?.textContent ?? '').replace(/\s+/g, ' ').trim(),
      };
    }),
  );
  return raw.map((r) => {
    const [lo, hi] = r.range.replace(/[−—]/g, '–').split('–');
    const totals = [parseYen(r.low), parseYen(hi ?? lo ?? '')];
    // 幅の下限は、その段の最安と同じ数字であること。
    expect(parseYen(lo ?? ''), `${r.label}: the range does not start at the cheapest`).toBe(totals[0]);
    return { label: r.label, cheapest: r.cheapest, totals, cells: [r.low, r.range] };
  });
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

/**
 * 5点 × ¥3,000 × 200 g・米国。監査の実測がある組み合わせ
 * （docs/audit/measured-2026-09-06.md）。重量表に当たらない名前で入れて、
 * 重量は手で 200 g と教える。
 */
const HANDMADE = ['mystery lot A', 'mystery lot B', 'mystery lot C', 'mystery lot D', 'mystery lot E'];

/** 重量不明の項目に、画面から重量を教える。 */
async function tellWeight(page: Page, title: string, gramsValue: number): Promise<void> {
  const li = cart(page).getByRole('listitem').filter({ hasText: title });
  await li.getByRole('button', { name: 'I know the weight' }).click();
  await li.getByRole('textbox', { name: `Weight in grams of ${title}` }).fill(String(gramsValue));
  await li.getByRole('button', { name: 'Save' }).click();
  await expect(li.getByText(`${gramsValue} g`)).toBeVisible();
}

test('7. seller-paid shipping takes the same domestic shipping off every row — the cheapest row does not move, a middle row does', async ({ page }) => {
  await gotoCompare(page);
  await openCart(page);

  // 例の2点を捨てて、実測と同じカートを手で組む。
  const removes = cart(page).getByRole('button', { name: /^Remove / });
  for (let n = await removes.count(); n > 0; n = await removes.count()) await removes.first().click();

  await page.getByRole('button', { name: 'Or add an item by hand' }).click();
  for (const name of HANDMADE) {
    await page.getByLabel('Item name').fill(name);
    await page.getByLabel('Price ¥').fill('3000');
    await page.getByRole('button', { name: 'Add by hand', exact: true }).click();
  }
  await openCart(page);
  await expect(cart(page).getByRole('listitem')).toHaveCount(HANDMADE.length);
  for (const name of HANDMADE) await tellWeight(page, name, 200);

  const before = await readRanking(page);
  expect(before).toHaveLength(6);
  expect(before[0]!.name).toBe('Neokyo');
  expect(rankOf(before, 'ZenMarket')).toBe(4);
  expect(rankOf(before, 'Buyee', 'consolidated')).toBe(3);

  // 国内送料が無くなる前の内訳。仮定の ~¥800 × 5点。
  const liBefore = await openRankRow(page, 0);
  expect((await rowCells(costRow(liBefore, /^Domestic shipping/)))[1]).toBe('~¥4,000');
  await openRankRow(page, 0); // 閉じる

  // 5点すべてを送料込み出品にする。
  const boxes = cart(page).getByRole('checkbox', { name: 'shipping included by seller' });
  await expect(boxes).toHaveCount(HANDMADE.length);
  for (let i = 0; i < HANDMADE.length; i++) await boxes.nth(i).check();

  await expect
    .poll(async () => (await readRanking(page))[0]!.total)
    .toBeLessThan(before[0]!.total);
  const after = await readRanking(page);

  // 国内送料は消えた。**「未取得」ではなく確定した ¥0** として出る。
  const liAfter = await openRankRow(page, 0);
  expect((await rowCells(costRow(liAfter, /^Domestic shipping/)))[1]).toBe('¥0');
  await openRankRow(page, 0);

  // **1位は動かない。**旧テストはここで Neokyo → FROM JAPAN に替わると主張していたが、
  // Neokyo の ¥350 に国内送料は含まれない（公式は「商品代＋国内送料」に加算する形）。
  // 5社とも国内送料は別建てなので、送料込み出品は全社に等しく効く
  // （docs/DESIGN-NOTES.md §1「逆転条件」）。
  expect(after[0]!.name, 'seller-paid shipping moved the cheapest row').toBe(before[0]!.name);
  expect(after[0]!.name).toBe('Neokyo');
  expect(after[1]!.name).toBe(before[1]!.name);
  expect(isNonDecreasing(after.map((r) => r.total))).toBe(true);

  // 全社が同じ国内送料（~¥800 × 5点）のぶん下がる。総額は ¥100 丸めなので誤差を許す。
  const DOMESTIC = 4000;
  const dropOf = (name: string, variant: string | null = null) => {
    const b = before.find((r) => r.name === name && r.variant === variant);
    const a = after.find((r) => r.name === name && r.variant === variant);
    expect(b && a, `${name} disappeared from the ranking`).toBeTruthy();
    return b!.total - a!.total;
  };
  for (const r of after) {
    const drop = dropOf(r.name, r.variant);
    expect(drop, `${r.name} did not lose the domestic shipping`).toBeGreaterThanOrEqual(DOMESTIC - 100);
  }
  // 送金合計に率で乗る費目を持つ社は、その率のぶん余計に下がる（ZenMarket の入金手数料 3.5%）。
  expect(dropOf('ZenMarket')).toBeGreaterThanOrEqual(DOMESTIC + 100);
  // 定額の費目しか持たない社は、国内送料ちょうどしか下がらない。
  expect(dropOf('Neokyo')).toBeLessThanOrEqual(DOMESTIC + 100);

  // **動くのは中位。**国内送料が消えた分だけ率の費目が軽くなり、
  // ZenMarket が Buyee, consolidated を抜いて 4位 → 3位に上がる。
  expect(rankOf(after, 'ZenMarket')).toBe(3);
  expect(rankOf(after, 'Buyee', 'consolidated')).toBe(4);
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


test('11b. a single listing opens on the proxy directly where we verified it', async ({ page }) => {
  await gotoCompare(page);

  // 例の2点を消し、実在の出品URLを1つだけ入れる。
  const c = await openCart(page);
  const removes = c.getByRole('button', { name: /remove|✕/i });
  for (let n = await removes.count(); n > 0; n = await removes.count()) await removes.first().click();

  await page.getByRole('button', { name: 'Or add an item by hand' }).click();
  await page.getByLabel('Item name').fill('Nendoroid test listing');
  await page.getByLabel('Price ¥').fill('5000');
  await page.getByRole('button', { name: 'Add by hand', exact: true }).click();

  // 手入力には出品URLが無いので、どの社もトップに落ちる。
  // **黙って落とさず、何をすることになるかを書く**こと。
  const li = await openRankRow(page, 0);
  await expect(li.getByRole('link', { name: /^Open / })).toBeVisible();
  await expect(li.getByText(/paste the listing URL there/i)).toBeVisible();
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
