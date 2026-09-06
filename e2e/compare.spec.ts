import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  breakdownTable,
  cart,
  cartItem,
  costRow,
  DECIDES,
  emsOnlyNote,
  gotoCompare,
  headerCells,
  isCollapsed,
  isNonDecreasing,
  openCart,
  openRankRow,
  parseYen,
  rankButtons,
  ranking,
  readRanking,
  rowCells,
  weightBox,
  type RankRow,
} from './helpers';
import { RATES, RATES_AS_OF } from '../src/lib/pricing/rates';
import {
  ALTERNATIVE_SHIPPING, ALTERNATIVE_SHIPPING_SECOND_HAND, nameList,
} from '../src/lib/pricing/shipping-methods';

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

/** 重量表に載らない名前で1点、手で足す。 */
async function addByHand(page: Page, title: string, priceYen: number): Promise<void> {
  const form = page.getByRole('button', { name: 'Or add an item by hand' });
  if (await form.count()) await form.click();
  await page.getByLabel('Item name').fill(title);
  await page.getByLabel('Price ¥').fill(String(priceYen));
  await page.getByRole('button', { name: 'Add by hand', exact: true }).click();
}

/** カートを空にする。 */
async function emptyCart(page: Page): Promise<void> {
  await openCart(page);
  const removes = cart(page).getByRole('button', { name: /^Remove / });
  for (let n = await removes.count(); n > 0; n = await removes.count()) await removes.first().click();
}

const PLUSH = 'plush toy, no weight data';

test('5. an item with no weight data gets an assumed weight, says so, and is corrected in place', async ({ page }) => {
  await gotoCompare(page);

  // 'plush toy' はどのラインにも当たらない。以前は重量 null で「段ごとの総額」に落ちていた。
  // いまは仮置きの 1,000 g が入り、**仮置きだと名乗り**、その場で直せる。
  await addByHand(page, PLUSH, 3000);
  const c = await openCart(page);
  const li = cartItem(page, PLUSH);
  await expect(li.getByText(/assumed/).first()).toBeVisible();
  await expect(li.getByText(/no weight data for this title/)).toBeVisible();
  await expect(weightBox(page, PLUSH)).toHaveValue('1000');
  // 段の表はもう出ない。順位は仮置きで出る。
  await expect(page.getByRole('region', { name: 'Totals by weight step' })).toHaveCount(0);
  await expect(c.getByText(/weight unknown/i)).toHaveCount(0);

  const assumed = await readRanking(page);
  expect(assumed.length).toBeGreaterThanOrEqual(5);
  for (const r of assumed) expect(r.total).toBeGreaterThan(0);

  // **この品の重量が1位を決める**（既定の2点＋仮置き1点、米国。2026-09-06 実測:
  // 500 g で Neokyo、10 kg で FROM JAPAN）。仮置きの数字を信じるなと、その場で言う。
  await expect(li.getByText(DECIDES)).toBeVisible();
  const flag = (await li.getByText(DECIDES).innerText()).replace(/\s+/g, ' ');
  expect(flag).toMatch(/at 500 g/);
  expect(flag).toMatch(/at 10 kg/);
  // 名指しされた2社は違う社であること（同じ社なら「決める」は嘘）。
  const named = flag.match(/: (.+?) at 500 g, (.+?) at 10 kg\./);
  expect(named, flag).toBeTruthy();
  expect(named![1]).not.toBe(named![2]);

  // 軽くすれば総額は下がり、重くすれば上がる。
  await weightBox(page, PLUSH).fill('200');
  await expect.poll(async () => (await readRanking(page))[0]!.total).toBeLessThan(assumed[0]!.total);
  const light = await readRanking(page);
  await weightBox(page, PLUSH).fill('5000');
  await expect.poll(async () => (await readRanking(page))[0]!.total).toBeGreaterThan(assumed[0]!.total);
  const heavy = await readRanking(page);
  for (const r of heavy) {
    const l = light.find((x) => x.name === r.name && x.variant === r.variant);
    if (l) expect(r.total, `${r.name} did not get dearer with weight`).toBeGreaterThan(l.total);
  }
  // そして1位が替わる。これが「重量を入れてもらうしかない」理由そのもの。
  expect(light[0]!.name, 'the winner did not change between 200 g and 5 kg').not.toBe(heavy[0]!.name);

  // 打ち込んだ数字は利用者のもの。✎ と「entered by you」、そして仮置きに戻す道。
  await expect(li.locator('[aria-label="edited by you"]')).toHaveCount(1);
  await expect(li.getByText('entered by you')).toBeVisible();
  await li.getByRole('button', { name: /^reset to the assumed ~1 kg$/ }).click();
  await expect(weightBox(page, PLUSH)).toHaveValue('1000');
  await expect(li.locator('[aria-label="edited by you"]')).toHaveCount(0);
  await expect.poll(async () => (await readRanking(page))[0]!.total).toBe(assumed[0]!.total);
});

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

/** 仮置きの重量を、画面から実重量に直す。 */
async function tellWeight(page: Page, title: string, gramsValue: number): Promise<void> {
  const box = weightBox(page, title);
  await expect(box).toHaveValue('1000'); // 表に無い名前なので仮置きが入っている
  await box.fill(String(gramsValue));
  await expect(cartItem(page, title).getByText('entered by you')).toBeVisible();
}

test('7. seller-paid shipping takes the same domestic shipping off every row — the cheapest row does not move, a middle row does', async ({ page }) => {
  await gotoCompare(page);
  await openCart(page);

  // 例の2点を捨てて、実測と同じカートを手で組む。
  await emptyCart(page);
  for (const name of HANDMADE) await addByHand(page, name, 3000);
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

const FIGURE = 'Hatsune Miku 1/7 scale figure (example)';
const NENDOROID = 'Nendoroid Kagamine Rin (example)';

test('16. a weight from our table is shown with its source and spread, can be overwritten, and reset', async ({ page }) => {
  await gotoCompare(page);
  await openCart(page);
  const li = cartItem(page, FIGURE);

  // 表の中央値が入っている。出どころはラインへのリンク、幅は P25–P75。
  await expect(weightBox(page, FIGURE)).toHaveValue('1500');
  const source = li.getByRole('link', { name: /1\/7 scale/ });
  await expect(source).toHaveAttribute('href', /\/weights#scale-1-7$/);
  await expect(li.getByText(/middle half of listings: all 1\.5 kg/)).toBeVisible();
  await expect(li.locator('[aria-label="edited by you"]')).toHaveCount(0);

  // 上書きすると総額が動き、数字は利用者のものになる。
  const before = await readRanking(page);
  await weightBox(page, FIGURE).fill('3000');
  await expect.poll(async () => (await readRanking(page))[0]!.total).toBeGreaterThan(before[0]!.total);
  await expect(li.locator('[aria-label="edited by you"]')).toHaveCount(1);
  await expect(li.getByText('entered by you')).toBeVisible();
  // 表の出どころは消える。利用者の数字に「n=647」を添えたら出所の偽装になる。
  await expect(li.getByRole('link', { name: /1\/7 scale/ })).toHaveCount(0);

  // 戻せる。何に戻るかがボタンに書いてある。
  await li.getByRole('button', { name: /^reset to ~1\.5 kg$/ }).click();
  await expect(weightBox(page, FIGURE)).toHaveValue('1500');
  await expect(li.locator('[aria-label="edited by you"]')).toHaveCount(0);
  await expect(li.getByRole('link', { name: /1\/7 scale/ })).toBeVisible();
  await expect.poll(async () => (await readRanking(page))[0]!.total).toBe(before[0]!.total);
});

test('17. when the weight decides the winner, the note says so and takes you to the box that matters', async ({ page }) => {
  await gotoCompare(page);

  // 既定の2点は FROM JAPAN が ×1/3〜×3 で安定。何も言わず、誰も名指ししない。
  await expect(page.getByText(/stays cheapest even if we are off by 3x on weight/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check the weights in your cart' })).toHaveCount(0);
  await expect(page.getByText(DECIDES)).toHaveCount(0);

  // 表に無い品を1点足すと不安定になる。
  await addByHand(page, PLUSH, 3000);
  const note = page.getByText(/The cheapest option changes with the weight/);
  await expect(note).toBeVisible();
  // 表の中央値と仮置きを「あなたがくれた重量」とは呼ばない。
  await expect(note).toContainText('our weight estimate');
  await expect(note).not.toContainText('you gave us');

  // **仮置きの品だけでなく、ねんどろいども** P25–P75（380–600 g）だけで1位を替える
  // （2026-09-06 実測）。表の精度を上げても消えない、だから入力してもらう。
  await openCart(page);
  await expect(cartItem(page, PLUSH).getByText(DECIDES)).toBeVisible();
  await expect(cartItem(page, NENDOROID).getByText(DECIDES)).toBeVisible();
  await expect(cartItem(page, NENDOROID).getByText(DECIDES)).toContainText('at 380 g');
  await expect(cartItem(page, NENDOROID).getByText(DECIDES)).toContainText('at 600 g');
  await expect(cartItem(page, FIGURE).getByText(DECIDES)).toHaveCount(0);

  // モバイルではカートを畳んでおく。ボタンが開いてくれること自体を見る。
  const toggle = cart(page).getByRole('button', { name: /^Cart \(/ });
  if (await toggle.isVisible()) {
    await toggle.click();
    await expect(cart(page).getByRole('listitem').first()).toBeHidden();
  }

  // 導線: 押すと、1位を決めている品の重量入力にフォーカスが移る。
  await page.getByRole('button', { name: 'Check the weights in your cart' }).click();
  const focused = page.locator(':focus');
  await expect(focused).toHaveAttribute('aria-label', /^Weight in grams of /);
  await expect(focused).toBeVisible();
  const title = ((await focused.getAttribute('aria-label')) ?? '').replace(/^Weight in grams of /, '');
  await expect(cartItem(page, title).getByText(DECIDES)).toBeVisible();
});

test('18. a single item: the weight does not decide anything, so we do not nag', async ({ page }) => {
  await gotoCompare(page);
  await emptyCart(page);
  await addByHand(page, PLUSH, 3000);
  await openCart(page);

  // 仮置きは入るし、仮置きだと名乗る。だが 500 g〜10 kg で1位は動かない（実測）。
  await expect(weightBox(page, PLUSH)).toHaveValue('1000');
  await expect(cartItem(page, PLUSH).getByText(/assumed/).first()).toBeVisible();
  await expect(page.getByText(/stays cheapest even if we are off by 3x on weight/)).toBeVisible();
  await expect(page.getByText(DECIDES)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Check the weights in your cart' })).toHaveCount(0);

  // それでも直せる。直せば総額は動く（1位は動かない）。
  const before = await readRanking(page);
  await weightBox(page, PLUSH).fill('8000');
  await expect.poll(async () => (await readRanking(page))[0]!.total).toBeGreaterThan(before[0]!.total);
  expect((await readRanking(page))[0]!.name).toBe(before[0]!.name);
});

// ─────────────────────────────────────────────────────────────────────────────
// T10: 比較の範囲（EMS 限定）の常時開示。
// この表は「全社を日本郵便の EMS で送ったら」の総額でしかない。各社はもっと安い方式を
// 実際に売っていて、我々はそれを price していない（docs/audit/gaps.md G1・§2）。
// **黙っていれば、実際より高い表を「これが全部です」と出していることになる。**
// 畳まれていないこと・順位が出ている限り必ず居ることを、押して確かめる。
// ─────────────────────────────────────────────────────────────────────────────

test('19. the ranking says out loud that only EMS was priced, and that cheaper methods exist', async ({ page }) => {
  await gotoCompare(page);
  const note = emsOnlyNote(page);

  // 何も押していない状態で、もう読める。
  await expect(note).toHaveCount(1);
  await expect(note).toBeVisible();
  expect(await isCollapsed(note), '開示が「開かないと読めない」場所に居る').toBe(false);

  const text = (await note.innerText()).replace(/\s+/g, ' ');
  // (1) EMS でしか比べていないこと。
  expect(text).toMatch(/Japan Post EMS only/);
  // (2) もっと安い手段が実在すること、それを我々が値付けしていないこと、
  //     そして誤差の向き（総額は高く出ている）まで。
  expect(text).toMatch(/cheaper ways to send the same parcel/);
  expect(text).toMatch(/small packet/);
  expect(text).toMatch(/surface mail/);
  expect(text).toMatch(/couriers/);
  expect(text).toMatch(/we do not price/);
  expect(text).toMatch(/under the totals below/);

  // 5社とも名指しする。1社でも落ちれば「その社は EMS しか無い」と読めてしまう。
  for (const s of ALTERNATIVE_SHIPPING) expect(text).toContain(s.serviceName);

  // 原文を読めていない社は点線で描く（docs/UI-DESIGN.md §6。線種は数字以外にも適用する）。
  const secondHand = note.getByTitle(TITLE.unverified);
  await expect(secondHand).toHaveCount(1);
  expect((await secondHand.innerText()).trim()).toBe(nameList(ALTERNATIVE_SHIPPING_SECOND_HAND));
  const deco = await secondHand.evaluate((el) => {
    const st = getComputedStyle(el);
    return { line: st.textDecorationLine, style: st.textDecorationStyle };
  });
  expect(deco.style).toBe('dotted');
  expect(deco.line).toContain('underline');

  // 総額を読む前に目に入る位置（順位表の上）に居ること。
  const noteBox = (await note.boundingBox())!;
  const rankBox = (await ranking(page).boundingBox())!;
  expect(noteBox.y + noteBox.height).toBeLessThanOrEqual(rankBox.y + 1);
});

test('20. the disclosure stays through real use, and it comes and goes with the ranking', async ({ page }) => {
  await gotoCompare(page);
  const note = emsOnlyNote(page);
  await expect(note).toBeVisible();

  // 行き先を変える（総額も税も全部変わる）。
  await page.getByLabel('Ship to').selectOption('GB');
  await expect(note).toBeVisible();

  // 品を足す。
  await addByHand(page, 'mystery lot Z', 4000);
  await expect(note).toBeVisible();

  // 行を開く。開いた内訳の中に複製されもしない。
  await openRankRow(page, 1);
  await expect(note).toHaveCount(1);
  await expect(note).toBeVisible();

  // カートを空にすれば順位が消える。**順位だけ残って開示が消えることも、
  // 開示だけ残って宙に浮くことも無い。**
  await emptyCart(page);
  await expect(ranking(page)).toHaveCount(0);
  await expect(note).toHaveCount(0);

  // 戻せば両方戻る。
  await addByHand(page, 'mystery lot Z', 4000);
  await expect(ranking(page)).toHaveCount(1);
  await expect(note).toBeVisible();
});

test('21. the disclosure links to the methods we did not price, named company by company', async ({ page }) => {
  await gotoCompare(page);
  await emsOnlyNote(page).getByRole('link', { name: /small packet/ }).click();
  await expect(page).toHaveURL(/\/sources#ems$/);
  await expect(page.getByRole('heading', { name: 'EMS postage from Japan' })).toBeVisible();

  for (const s of ALTERNATIVE_SHIPPING) {
    const li = page.getByRole('listitem').filter({ hasText: `${s.serviceName} — besides EMS:` });
    await expect(li, `${s.serviceName} の非EMS方式が /sources に無い`).toHaveCount(1);
    for (const m of s.methods) await expect(li).toContainText(m);
    // 出典 URL と読んだ日が付いていること。付いていなければただの主張になる。
    await expect(li.getByRole('link', { name: `${s.serviceName} shipping page` }))
      .toHaveAttribute('href', s.sourceUrl);
    await expect(li).toContainText(s.checkedOn);
  }
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

  test('the EMS-only disclosure holds for every destination, and there is only ever one', async ({ page }) => {
    await gotoCompare(page);
    const note = emsOnlyNote(page);
    for (const code of ['GB', 'DE', 'FR', 'AU', 'CA', 'SG', 'US']) {
      await page.getByLabel('Ship to').selectOption(code);
      await expect(note, `${code} で開示が消えた`).toHaveCount(1);
      await expect(note).toBeVisible();
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

  test('the EMS-only disclosure is readable on a phone without opening anything', async ({ page }) => {
    await gotoCompare(page);
    const note = emsOnlyNote(page);

    // タップ0回で読める。畳んだ開示は、読まれない開示と同じ。
    await expect(note).toBeVisible();
    expect(await isCollapsed(note)).toBe(false);

    // 幅に収まっている（横スクロールの外に逃がさない）。
    const box = (await note.boundingBox())!;
    const width = await page.evaluate(() => window.innerWidth);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);

    // 行を開いてもカートを開いても居続ける。
    await openRankRow(page, 0);
    await expect(note).toBeVisible();
    await openCart(page);
    await expect(note).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 順位の見出しに添える現地通貨換算。**ここは「fixed <実装日>」と出していた。**
// 転記していない日付を出典日として名乗っていたので（docs/audit/gaps.md G3）、
// 実際に画面を操作して、出典名・参照日・転記したレートが出ることを見る。
// ─────────────────────────────────────────────────────────────────────────────
test.describe('the currency line under the winner cites the rate it actually used', () => {
  // 見出しの1文。順位の直下の別の文（安定性の注記）と取り違えないよう2条件で絞る。
  const summary = (page: Page) => page
    .locator('p')
    .filter({ hasText: /is cheapest/ })
    .filter({ hasText: /approx\. total/ })
    .first();

  test('the default destination shows the transcribed USD rate and the ECB reference date',
    async ({ page }) => {
      await gotoCompare(page);
      const text = (await summary(page).innerText()).replace(/\s+/g, ' ');
      expect(text).toContain(`¥${RATES['USD']!.toFixed(2)}/USD`);
      expect(text).toContain(`ECB reference rate for ${RATES_AS_OF}`);
      // 出典を名乗らない裸の「fixed <日付>」に戻っていないこと。
      expect(text).not.toMatch(/\(fixed \d{4}-\d{2}-\d{2}\)/);
    });

  test('switching the destination switches the quoted rate to that currency', async ({ page }) => {
    await gotoCompare(page);
    await page.getByLabel('Ship to').selectOption('GB');
    await expect(summary(page)).toContainText(`¥${RATES['GBP']!.toFixed(2)}/GBP`);
    const text = (await summary(page).innerText()).replace(/\s+/g, ' ');
    expect(text).toContain(`ECB reference rate for ${RATES_AS_OF}`);
    // £ の概算が、転記したレートで割った値であること。
    // **¥190/£ のままなら 11% 大きい数字が出る。そこが利用者に見えていた嘘だった。**
    // 見出しの円は ¥100 に丸めて出るので、その丸め幅（±0.3£）だけ許して比べる。
    const total = parseYen(text.match(/approx\. total ~?(¥[\d,]+)/)![1]!);
    const shown = Number(text.match(/≈ £([\d,]+)/)![1]!.replace(/,/g, ''));
    expect(Math.abs(shown - total / RATES['GBP']!)).toBeLessThanOrEqual(1);
    expect(Math.abs(shown - total / 190), 'the pre-transcription ¥190/£ must not fit')
      .toBeGreaterThan(1);
  });
});
