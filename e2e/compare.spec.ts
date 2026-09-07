import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  addByHand,
  alcoholNote,
  breakdownTable,
  cart,
  cartItem,
  costRow,
  DECIDES,
  emptyCart,
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
  restrictedNote,
  rowCells,
  weightBox,
  type RankRow,
} from './helpers';
import { RATES, RATES_AS_OF } from '../src/lib/pricing/rates';
import {
  ALTERNATIVE_SHIPPING, ALTERNATIVE_SHIPPING_SECOND_HAND, ALTERNATIVE_SHIPPING_VERIFIED, nameList,
} from '../src/lib/pricing/shipping-methods';
import {
  LITHIUM_AIRMAIL_LISTED, RESTRICTED_GOODS, restrictedList,
} from '../src/lib/pricing/restricted-goods';
import { COUNTRIES, COUNTRY_CODES } from '../src/lib/pricing/countries';

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

/**
 * **総額が出ている行だけ。**国際送料が取れていない行（既定の宛先＝米国では
 * Neokyo。日本郵便を売っていない）は 'NOT COMPARABLE' と `—` を出し、総額を
 * 名乗らない。「安くなった」「高くなった」「昇順だ」はどれも額のある行の話なので、
 * 額の無い行を混ぜると、比べていないものを比べたことになる。
 */
const priced = (rows: RankRow[]): (RankRow & { total: number })[] =>
  rows.filter((r): r is RankRow & { total: number } => r.total != null);

/** 順位が付いている行のうち1位。額の無い行を1位と読まない。 */
const first = (rows: RankRow[]) => priced(rows)[0]!;

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
  const all = await readRanking(page);
  // **順位が付いている行だけが並びの対象。**既定の宛先（米国）では Neokyo が
  // 日本郵便を売っていないので、その行は 'NOT COMPARABLE' と `—` を出して末尾に回る。
  const rows = all.filter((r) => r.comparable);

  expect(rows.length).toBeGreaterThanOrEqual(4);
  expect(isNonDecreasing(rows.map((r) => r.total!))).toBe(true);
  expect(isNonDecreasing(rows.map((r) => r.diff))).toBe(true);

  // 1位だけが CHEAPEST で、差額は 0。
  expect(rows[0]!.cheapest).toBe(true);
  expect(rows.filter((r) => r.cheapest)).toHaveLength(1);
  expect(rows[0]!.diff).toBe(0);

  // 比べられない行は総額も差額も名乗らず、なぜ比べられないのかを書く。
  for (const r of all.filter((x) => !x.comparable)) {
    expect(r.total, `${r.name} prints a total it cannot stand behind`).toBeNull();
    expect(r.cheapest).toBe(false);
    expect(r.text).toMatch(/does not (sell|ship)|no published rate/);
  }

  // 差額と総額が同じ順位付けを指していること。総額は ¥100 丸めなので誤差を許す。
  for (const r of rows.slice(1)) {
    expect(r.diff).toBeGreaterThan(0);
    expect(Math.abs(r.total! - rows[0]!.total! - r.diff)).toBeLessThanOrEqual(100);
  }
});

test('2. rank is decided by the total alone — paying us buys neither the top spot nor safety from the bottom', async ({ page }) => {
  await gotoCompare(page);

  // 順位の根拠を画面が名乗っていること。**「1位が誰か」ではなく「何で並べたか」**が主張の中身。
  await expect(page.getByText(/ranked by the total that reaches your door/i)).toBeVisible();
  await expect(page.getByText(/pay us and some do not — that never moves a row/i)).toBeVisible();

  const all = await readRanking(page);
  const rows = all.filter((r) => r.comparable);
  expect(rows.length).toBeGreaterThanOrEqual(4);

  // 報酬の有無は全行が名乗る（比べられない行も含む）。名乗らない行があると混在を
  // 確かめようがない。
  for (const r of all) expect(r.text, `${r.name} does not disclose the referral`).toMatch(/pays us/);

  // 並びは総額の昇順そのもの。報酬で並べ替えられていないことを、画面の並びで見る。
  const key = (r: RankRow) => `${r.name}${r.variant ? `/${r.variant}` : ''}`;
  expect(rows.map(key)).toEqual([...rows].sort((a, b) => a.total! - b.total!).map(key));

  // 1位が1位である理由は総額が最小であること。CHEAPEST もそこにだけ付く。
  expect(rows[0]!.total).toBe(Math.min(...rows.map((r) => r.total!)));
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

  // **最下位は順位が付いた行の最下位。**比べられない行はその下に置かれるが、
  // それは「いちばん高い」ではなく「値段が付いていない」なので数えない。
  const single = (await readRanking(page)).filter((r) => r.comparable);
  expect(paysUs(single[single.length - 1]!), 'the bottom row still pays us — both sides must be able to land there').toBe(false);
  expect(isNonDecreasing(single.map((r) => r.total!))).toBe(true);
  expect(single[0]!.total).toBe(Math.min(...single.map((r) => r.total!)));
  expect(single[0]!.cheapest).toBe(true);
});

test('3. what we do not have shows as — , never as ¥0', async ({ page }) => {
  await gotoCompare(page);
  const li = await openRankRow(page, 0);

  // 米国宛には連邦の売上税が無い＝我々は数字を持っていない。0 ではない。
  const vat = costRow(li, 'Sales tax / VAT');
  await expect(vat).toHaveCount(1);
  expect((await rowCells(vat))[1]).toBe('—');

  // **¥0 そのものは禁じない。**原文が「その帯では 0」と書いている費目は 0 で正しい
  // （米国の $2,500 以下の通関手数料、英国の £135 以下の関税、豪の A$1,000 以下 …）。
  // 禁じるのは**「持っていない」が ¥0 に化けること。**その2つは tier で分かれる:
  //   持っていない  → tier `none`（title「Not included in the total — this is not zero」）で必ず「—」
  //   取得できた 0  → tier `fixed` などで ¥0、かつ**なぜ 0 なのかが note にある**
  const noneCells = li.getByTitle('Not included in the total — this is not zero');
  for (let i = 0; i < await noneCells.count(); i++) {
    expect((await noneCells.nth(i).innerText()).trim(), '未取得が ¥0 に化けている').toBe('—');
  }
  for (const { label, cells } of await taxRowsOf(li)) {
    if (!cells.slice(1).includes('¥0')) continue;
    expect(cells[0]?.trim(), `${label} が理由なしに ¥0`).not.toBe('');
  }
});

test('3b. two figures we did not read from the source are drawn as such (T17)', async ({ page }) => {
  // (1) EU の €3 定額関税: 制度の原文は取れているが、代行経由の購入がその対象
  //     （distance sale of imported goods）に当たるかを断定できない。
  // (2) ZenMarket の入金手数料 3.5%: 公表値は「from 1%」で、3.5% は実請求からの逆算。
  // どちらも「確定」の顔で描いてはいけない。
  await gotoCompare(page);
  await page.getByLabel('Ship to').selectOption('DE');
  await expect.poll(async () => (await readRanking(page)).length).toBeGreaterThan(0);

  const rows = await readRanking(page);
  const zen = rows.findIndex((r) => r.name === 'ZenMarket');
  expect(zen, 'ZenMarket が順位に居ない').toBeGreaterThanOrEqual(0);
  const li = await openRankRow(page, zen);

  const duty = costRow(li, /^Duty/);
  await expect(duty).toHaveCount(1);
  // **tier は `unverified` ではなく `estimate`。**制度の原文（EU の暫定定額関税ガイダンス）は
  // 手元にある——取れていないのは「代行経由の購入が DSIG に当たるか」で、それは**我々の仮定**。
  // 「原典に当たれていない」（unverified）ではないので、点線ではなく `~` と琥珀で描く。
  const dutyAmount = duty.getByTitle(TITLE.estimate).first();
  await expect(dutyAmount).toBeVisible();
  expect((await dutyAmount.innerText()).trim()).toMatch(/^~¥/);

  const depositRow = costRow(li, /^Deposit fee/);
  await expect(depositRow).toHaveCount(1);
  const deposit = depositRow.getByTitle(TITLE.estimate).first();
  await expect(deposit).toBeVisible();
  expect((await deposit.innerText()).trim()).toMatch(/^~¥/);
  // 内訳の説明が、公表されている文言を隠していないこと。
  await expect(depositRow).toContainText('from 1%');
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
const PLUSH = 'plush toy, no weight data';

test('5. an item with no weight data gets an assumed weight, says so, and is corrected in place', async ({ page }) => {
  await gotoCompare(page);
  // **宛先をドイツにする。**後半が見せたいのは「仮置きの重量が1位を決めるので、
  // 決めていると画面がその場で言う」こと。その反転は Neokyo と FROM JAPAN の間で
  // 起き、**Neokyo は米国宛に日本郵便を売っていない**ので、米国では 500 g でも
  // 10 kg でも FROM JAPAN のまま＝この警告そのものが出ない。
  await page.getByLabel('Ship to').selectOption('DE');

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

  const assumed = priced(await readRanking(page));
  expect(assumed.length).toBeGreaterThanOrEqual(5);
  for (const r of assumed) expect(r.total).toBeGreaterThan(0);

  // **この品の重量が1位を決める**（既定の2点＋仮置き1点、ドイツ。2026-09-06 実測:
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
  await expect.poll(async () => first(await readRanking(page)).total)
    .toBeLessThan(assumed[0]!.total);
  const light = await readRanking(page);
  await weightBox(page, PLUSH).fill('5000');
  await expect.poll(async () => first(await readRanking(page)).total)
    .toBeGreaterThan(first(assumed).total);
  const heavy = priced(await readRanking(page));
  for (const r of heavy) {
    const l = priced(light).find((x) => x.name === r.name && x.variant === r.variant);
    if (l) expect(r.total, `${r.name} did not get dearer with weight`).toBeGreaterThan(l.total);
  }
  // そして1位が替わる。これが「重量を入れてもらうしかない」理由そのもの。
  expect(first(light).name, 'the winner did not change between 200 g and 5 kg')
    .not.toBe(heavy[0]!.name);

  // 打ち込んだ数字は利用者のもの。✎ と「entered by you」、そして仮置きに戻す道。
  await expect(li.locator('[aria-label="edited by you"]')).toHaveCount(1);
  await expect(li.getByText('entered by you')).toBeVisible();
  await li.getByRole('button', { name: /^reset to the assumed ~1 kg$/ }).click();
  await expect(weightBox(page, PLUSH)).toHaveValue('1000');
  await expect(li.locator('[aria-label="edited by you"]')).toHaveCount(0);
  await expect.poll(async () => (await readRanking(page))[0]!.total).toBe(assumed[0]!.total);
});

/**
 * 同額（T26）。**手で作れる実在の入力**で、同順位になることを画面で見る。
 * 1点 ¥4,200・450 g・楽天・オーストラリア宛で Neokyo と ZenMarket がちょうど ¥10,420。
 * 走査では同額を含む組み合わせが 3,938 あり、うち 15 組が1位の同額
 * （docs/audit/ties-2026-09-07.md）。稀な事故ではないので画面で扱う。
 */
const TIE = 'tie probe, no weight data';

test('22. two rows with the same total share the rank, and both are CHEAPEST', async ({ page }) => {
  await gotoCompare(page);
  await page.getByLabel('Ship to').selectOption('AU');
  await emptyCart(page);
  await addByHand(page, TIE, 4200, 'rakuten');
  await openCart(page);
  await weightBox(page, TIE).fill('450');

  await expect.poll(async () => (await readRanking(page)).filter((r) => r.tied).length).toBe(2);
  const rows = await readRanking(page);

  const tied = rows.filter((r) => r.tied);
  expect(tied.map((r) => r.name).sort()).toEqual(['Neokyo', 'ZenMarket']);

  // 総額が同じで、**順位の数字も同じ**。並び順（1本目・2本目）ではなく行が出す数字を見る。
  expect(new Set(tied.map((r) => r.total)).size, 'the two rows are not actually equal').toBe(1);
  expect(tied[0]!.shownRank).toBe(tied[1]!.shownRank);
  expect(tied[0]!.shownRank).toBe(1);

  // **CHEAPEST は両方に付く。**片方だけに付けたら、同額なのに1社を推したことになる。
  expect(tied.every((r) => r.cheapest)).toBe(true);
  expect(rows.filter((r) => r.cheapest)).toHaveLength(2);

  // 同順位が2つ在るので、次の行は 2 ではなく 3 に飛ぶ（競技順位）。
  const rest = rows.filter((r) => !r.tied);
  expect(rest[0]!.shownRank).toBe(3);
  expect(rest.map((r) => r.shownRank)).toEqual([3, 4, 5]);

  // **縦の並びが順位に読まれないよう、その場で打ち消す。**
  for (const r of tied) {
    const other = tied.find((x) => x.name !== r.name)!.name;
    expect(r.text, `${r.name} does not name who it is tied with`).toContain(`tied with ${other}`);
    expect(r.text).toContain('the order between them means nothing');
  }
  // 同額でない行は名乗らない。全行に付いたら印として機能しない。
  for (const r of rest) expect(r.text, r.name).not.toContain('tied with');

  // 一番大きい文が1社を名指ししていないこと。同額なら両方を挙げる。
  await expect(page.getByText(/Neokyo and ZenMarket are tied cheapest/)).toBeVisible();
  await expect(page.getByText(/^Neokyo is cheapest/)).toHaveCount(0);
  await expect(page.getByText(/^ZenMarket is cheapest/)).toHaveCount(0);
});

test('23. a tie below the top shares its rank too, and does not move the winner', async ({ page }) => {
  // 1点 ¥12,800・1,450 g・ヤフオク・**ドイツ**で Buyee と Neokyo が ¥28,417 の3位タイ。
  // **旧実装はここで社名の辞書順に割っていて、報酬を払う Buyee が、報酬ゼロの Neokyo を
  // 常に上に置いていた**（同額 3,938 組のうち 3,716 組が同じ向き）。
  // **宛先が米国からドイツに変わった。**同額になる2社の片方（Neokyo）は米国宛に
  // 日本郵便を売っていないので、米国ではこの同額そのものが起きない。
  await gotoCompare(page);
  await page.getByLabel('Ship to').selectOption('DE');
  await emptyCart(page);
  await addByHand(page, TIE, 12800);
  await openCart(page);
  await weightBox(page, TIE).fill('1450');

  await expect.poll(async () => (await readRanking(page)).filter((r) => r.tied).length).toBe(2);
  const rows = await readRanking(page);

  const tied = rows.filter((r) => r.tied);
  expect(tied.map((r) => r.name).sort()).toEqual(['Buyee', 'Neokyo']);
  expect(tied[0]!.shownRank).toBe(tied[1]!.shownRank);
  expect(tied[0]!.shownRank).toBe(3);
  // 上位ではない同額なので CHEAPEST は付かず、差額も同じ。
  expect(tied.some((r) => r.cheapest)).toBe(false);
  expect(tied[0]!.diff).toBe(tied[1]!.diff);

  // 報酬を払う社が、払わない社より上の順位を取れていないこと。
  const buyee = tied.find((r) => r.name === 'Buyee')!;
  const neokyo = tied.find((r) => r.name === 'Neokyo')!;
  expect(buyee.text).toMatch(/pays us/);
  expect(neokyo.text).toContain('pays us nothing');
  expect(buyee.shownRank).toBe(neokyo.shownRank);

  // 1位は同額ではないので、これまでどおり1社が CHEAPEST。
  expect(rows.filter((r) => r.cheapest)).toHaveLength(1);
  expect(rows[0]!.shownRank).toBe(1);
  expect(rows[0]!.tied).toBe(false);
  // 同順位が2つ在るぶん、そのあとは 5 に飛ぶ（3-3 のあと 5）。
  expect(rows.map((r) => r.shownRank)).toEqual([1, 2, 3, 3, 5]);
});

test('6. one more of an item raises the total', async ({ page }) => {
  await gotoCompare(page);
  await openCart(page);
  const before = await readRanking(page);

  await cart(page).getByRole('button', { name: /^One more of / }).first().click();

  await expect
    .poll(async () => first(await readRanking(page)).total)
    .toBeGreaterThan(first(before).total);

  // 全行が上がる。1点増えて安くなる社は無い。
  const after = priced(await readRanking(page));
  for (const r of after) {
    const same = priced(before).find((b) => b.name === r.name && b.variant === r.variant);
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
  // 6行のうち、額が付くのは5行。**Neokyo は米国宛に日本郵便を売っていない。**
  expect(before).toHaveLength(6);
  expect(priced(before)).toHaveLength(5);
  expect(first(before).name).toBe('FROM JAPAN');
  expect(rankOf(before, 'ZenMarket')).toBe(3);
  expect(rankOf(before, 'Buyee', 'consolidated')).toBe(2);

  // 国内送料が無くなる前の内訳。仮定の ~¥800 × 5点。
  const liBefore = await openRankRow(page, 0);
  expect((await rowCells(costRow(liBefore, /^Domestic shipping/)))[1]).toBe('~¥4,000');
  await openRankRow(page, 0); // 閉じる

  // 5点すべてを送料込み出品にする。
  const boxes = cart(page).getByRole('checkbox', { name: 'shipping included by seller' });
  await expect(boxes).toHaveCount(HANDMADE.length);
  for (let i = 0; i < HANDMADE.length; i++) await boxes.nth(i).check();

  await expect
    .poll(async () => first(await readRanking(page)).total)
    .toBeLessThan(first(before).total);
  const after = priced(await readRanking(page));

  // 国内送料は消えた。**「未取得」ではなく確定した ¥0** として出る。
  const liAfter = await openRankRow(page, 0);
  expect((await rowCells(costRow(liAfter, /^Domestic shipping/)))[1]).toBe('¥0');
  await openRankRow(page, 0);

  // **1位は動かない。**旧テストはここで Neokyo → FROM JAPAN に替わると主張していたが、
  // Neokyo の ¥350 に国内送料は含まれない（公式は「商品代＋国内送料」に加算する形）。
  // 5社とも国内送料は別建てなので、送料込み出品は全社に等しく効く
  // （docs/DESIGN-NOTES.md §1「逆転条件」）。
  expect(after[0]!.name, 'seller-paid shipping moved the cheapest row').toBe(first(before).name);
  // **1位が Neokyo から FROM JAPAN に替わった。**送料込み出品の効き方が変わった
  // からではなく、この画面の宛先（米国）に Neokyo が居なくなったから
  // ——日本郵便を売っておらず、行は 'NOT COMPARABLE' になる。
  // 主張（送料込みは全社に等しく効くので1位は動かない）はそのまま成り立っている。
  expect(after[0]!.name).toBe('FROM JAPAN');
  // 2位は**動く**——それがこのテストの後半の主張（下の rankOf）。以前ここで
  // 「2位も動かない」と書けていたのは、1位が Neokyo で ZenMarket の繰り上がりが
  // 3位止まりだったから。Neokyo が米国の盤面から抜けて1つずつ繰り上がり、
  // ZenMarket は 3位 → 2位に上がる。
  expect(priced(before)[1]!.name).toBe('Buyee');
  expect(after[1]!.name).toBe('ZenMarket');
  expect(isNonDecreasing(after.map((r) => r.total))).toBe(true);

  // 全社が同じ国内送料（~¥800 × 5点）のぶん下がる。総額は ¥100 丸めなので誤差を許す。
  const DOMESTIC = 4000;
  const dropOf = (name: string, variant: string | null = null) => {
    const b = priced(before).find((r) => r.name === name && r.variant === variant);
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
  // （以前ここは Neokyo で見ていた。米国の盤面に居なくなったので、同じく
  //  送金額に率を掛けない FROM JAPAN で見る。）
  expect(dropOf('FROM JAPAN')).toBeLessThanOrEqual(DOMESTIC + 100);

  // **動くのは中位。**国内送料が消えた分だけ率の費目が軽くなり、
  // ZenMarket が Buyee, consolidated を抜いて 3位 → 2位に上がる。
  expect(rankOf(after, 'ZenMarket')).toBe(2);
  expect(rankOf(after, 'Buyee', 'consolidated')).toBe(3);
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
  await expect.poll(async () => first(await readRanking(page)).total)
    .toBeGreaterThan(first(before).total);
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
  // **宛先をドイツにする。**この画面が見せたいのは「重量が1位を決めるときは
  // そう書いて、決めている品の入力に連れて行く」こと。その反転は Neokyo と
  // FROM JAPAN の間で起き、**Neokyo は米国宛に日本郵便を売っていない**
  // （自社の見積が3方式すべてに "Not available or suspended in your country."）。
  // 米国では反転が起きないので、この導線を米国では実演できない。
  await page.getByLabel('Ship to').selectOption('DE');

  // 既定の2点は ×1/3〜×3 で安定。何も言わず、誰も名指ししない。
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
  await expect.poll(async () => first(await readRanking(page)).total)
    .toBeGreaterThan(first(before).total);
  expect(first(await readRanking(page)).name).toBe(first(before).name);
});

// ─────────────────────────────────────────────────────────────────────────────
// T10: 比較の範囲の常時開示。
// **2026-09-07 に範囲が狭まった。**日本郵便の他方式（小形包装物・国際小包の航空/船便）を
// 価格化したので、出せないのは**宅配便だけ**になった。開示もそこだけに絞る。
// 宅配便は①料率非公開 ②通関が別モデル ③容積重量（寸法が入力に無い）の3つが同時に立つ
// （docs/COMPLETENESS.md §6）。**黙っていれば、選べる範囲を狭く見せることになる。**
// 畳まれていないこと・順位が出ている限り必ず居ることを、押して確かめる。
// ─────────────────────────────────────────────────────────────────────────────

test('18b. the shipping method is a control, and picking one moves every total', async ({ page }) => {
  // **方式は利用者が選ぶ。**代行はメニューを出すだけ（Neokyo 原文
  // 「please select Japan Post as the shipment method」）。総額は方式で決まるので、
  // 方式が入力に無ければ「可能な限り正確な総額」を出しようがない。
  await gotoCompare(page);
  const picker = page.getByLabel('Ship by');
  await expect(picker).toHaveCount(1);

  // **既定は EMS。**「運べる中で最安」を既定にすると最安はたいてい船便（1〜3か月）で、
  // ほぼ誰も払わない額を総額として出すことになる。
  await expect(picker).toHaveValue('ems');
  // **方式で動くのは送料が乗っている行だけ。**既定の宛先（米国）では Neokyo が
  // 日本郵便を売っていないので、どの方式を選んでもその行に額は付かない
  // ——動かないのが正しい。額の無い行を「安くなっていない」と数えない。
  // **Buyee は2行（同梱／既定）出るので、社名だけを鍵にすると片方が消える。**
  const keyOf = (r: RankRow) => `${r.name}${r.variant ? `/${r.variant}` : ''}`;
  const before = new Map(priced(await readRanking(page)).map((r) => [keyOf(r), r.total]));
  expect(before.size).toBeGreaterThan(0);

  // 船便に切り替えると総額が下がる。**同時に日数が読めること。**
  await picker.selectOption('parcel-surface');
  await expect.poll(async () => first(await readRanking(page)).total)
    .not.toBe([...before.values()][0]);
  const after = priced(await readRanking(page));
  expect(after.length).toBe(before.size);
  for (const r of after) {
    expect(r.total, `${keyOf(r)} が船便で安くなっていない`).toBeLessThan(before.get(keyOf(r))!);
  }

  // 行を開くと、額の隣に所要日数と追跡の有無がある。
  // **額だけ出して日数を出さなければ、遅いほうを選ばせる誤誘導になる。**
  const li = await openRankRow(page, 0);
  const ship = costRow(li, /International parcel \(surface\)/);
  await expect(ship).toHaveCount(1);
  await expect(ship).toContainText('1–3 months');

  // 選択肢には日数が載っていて、選ぶ前に時間が見える。
  const options = await picker.locator('option').allInnerTexts();
  expect(options.join(' | ')).toMatch(/1–3 months/);
  expect(options.join(' | ')).toMatch(/no tracking/);
  expect(options.join(' | ')).toMatch(/Cheapest that fits/);
  // **宅配便は選択肢に無い。**料率が非公開で、通関が別モデルで、寸法が入力に無い。
  for (const c of ['FedEx', 'DHL', 'UPS']) {
    expect(options.join(' | '), `${c} が選択肢に居る`).not.toContain(c);
  }
});

test('18c. a method too small for the parcel marks every row not comparable, it does not make them cheap', async ({ page }) => {
  // 小形包装物は 2kg まで。**上限超を最上段の額で通すと、送れないものを最安に見せる。**
  await gotoCompare(page);
  await addByHand(page, 'Heavy box', 8000);
  const heavy = weightBox(page, 'Heavy box');
  await expect(heavy).toHaveCount(1);
  // 梱包後 = 実重量 ×1.2 + 300g。5,000g なら 6,300g で 2kg の上限を大きく超える。
  await heavy.fill('5000');
  await heavy.blur();

  const before = await readRanking(page);
  expect(before.length).toBeGreaterThan(0);

  await page.getByLabel('Ship by').selectOption('small-packet-air');
  // **全行が「比較できない」になる。**額を付けずに理由を出すのが正しい
  // ——「この重量ではこの方式で送れない」であって「安い」ではない。
  await expect.poll(async () => {
    const n = await rankButtons(page).count();
    let flagged = 0;
    for (let i = 0; i < n; i++) {
      if ((await rankButtons(page).nth(i).innerText()).includes('NOT COMPARABLE')) flagged++;
    }
    return { n, flagged };
  }).toEqual({ n: 6, flagged: 6 });
  // 理由が読める。**方式名と上限が入っていること。**
  await expect(page.getByText(/Small packet .* has no published rate above/).first()).toBeVisible();

  // 方式を戻せば表も戻る。片道の壊れ方をしていないこと。
  await page.getByLabel('Ship by').selectOption('parcel-surface');
  await expect.poll(async () => (await readRanking(page)).length).toBe(before.length);
});

test('19. the ranking says which methods are priced, and that couriers are not', async ({ page }) => {
  await gotoCompare(page);
  const note = emsOnlyNote(page);

  // 何も押していない状態で、もう読める。
  await expect(note).toHaveCount(1);
  await expect(note).toBeVisible();
  expect(await isCollapsed(note), '開示が「開かないと読めない」場所に居る').toBe(false);

  const text = (await note.innerText()).replace(/\s+/g, ' ');
  // (1) 日本郵便の方式は価格化してあり、選べること。
  expect(text).toMatch(/Japan Post methods/);
  expect(text).toMatch(/cheapest that fits/i);
  // (2) 出せないのは宅配便だけで、それを名指しすること。
  expect(text).toMatch(/Courier rates are not priced/);
  expect(text).toMatch(/FedEx/);
  expect(text).toMatch(/DHL/);
  expect(text).toMatch(/UPS/);
  expect(text).toMatch(/none of them publishes/);
  // (3) **誤差の向きが「安く出ている」の一方向ではないこと。**
  //     宅配便は送料が安いことが多いが通関手数料が高い（スペイン €1.56〜€70）。
  //     「総額は高く出ている」と書けば、片側だけの誤差だと誤解させる。
  expect(text).toMatch(/either direction/);

  // 5社とも名指しする。1社でも落ちれば「その社は EMS しか無い」と読めてしまう。
  for (const s of ALTERNATIVE_SHIPPING) expect(text).toContain(s.serviceName);

  // 原文を読めていない社は点線で描く（docs/UI-DESIGN.md §6。線種は数字以外にも適用する）。
  // **点線の有無は表が決める。**いま全社の原文に届いているなら点線は1つも無いのが正しく、
  // 逆に届いていない社が居るのに実線で描かれていたら、確度の差を黙って消したことになる。
  const secondHand = note.getByTitle(TITLE.unverified);
  const expectedDotted = ALTERNATIVE_SHIPPING_SECOND_HAND.length ? 1 : 0;
  await expect(secondHand).toHaveCount(expectedDotted);
  if (expectedDotted) {
    expect((await secondHand.innerText()).trim()).toBe(nameList(ALTERNATIVE_SHIPPING_SECOND_HAND));
    const deco = await secondHand.evaluate((el) => {
      const st = getComputedStyle(el);
      return { line: st.textDecorationLine, style: st.textDecorationStyle };
    });
    expect(deco.style).toBe('dotted');
    expect(deco.line).toContain('underline');
  } else {
    // 点線が無いときは「一次情報で読めた社」として全社が名指しされていること。
    expect(text).toContain(nameList(ALTERNATIVE_SHIPPING_VERIFIED));
  }

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

// ─────────────────────────────────────────────────────────────────────────────
// T27: 「送れないかもしれない」の常時開示。
// この計算機は総額を出すが、**その小包が送れるかは一度も見ていない。**黙っていれば
// 「¥26,000 で届く」と読まれる表を、届かない品にも出していることになる。
// EMS の開示（T10）と同じ場所・同じ約束で、押して確かめる。
// ─────────────────────────────────────────────────────────────────────────────

/** 酒として当たるタイトル。重量表の corroboration 規則が要求する語（sake）を含む。 */
const SAKE = 'Dassai junmai daiginjo sake 720ml';

test('24. the ranking says out loud that some goods may not be shippable, and that we never checked', async ({ page }) => {
  await gotoCompare(page);
  const note = restrictedNote(page);

  // 何も押していない状態で、もう読める。
  await expect(note).toHaveCount(1);
  await expect(note).toBeVisible();
  expect(await isCollapsed(note), '開示が「開かないと読めない」場所に居る').toBe(false);

  const text = (await note.innerText()).replace(/\s+/g, ' ');
  // (1) 何が制限されているか。**表（RESTRICTED_GOODS）と同じ語**が出ていること。
  expect(text).toContain(restrictedList());
  for (const g of RESTRICTED_GOODS) {
    expect(text.toLowerCase(), `${g.id} が開示に無い`).toContain(g.labelEn.toLowerCase());
  }
  // (2) 我々が見ていないこと、そして総額が「送れる」の保証ではないこと。
  expect(text).toMatch(/We do not check/);
  expect(text).toMatch(/not a promise that the parcel can be sent/);

  // 総額を読む前に目に入る位置（順位表の上）に居ること。
  const noteBox = (await note.boundingBox())!;
  const rankBox = (await ranking(page).boundingBox())!;
  expect(noteBox.y + noteBox.height).toBeLessThanOrEqual(rankBox.y + 1);
});

test('25. the shippability disclosure stays through real use, and comes and goes with the ranking', async ({ page }) => {
  await gotoCompare(page);
  const note = restrictedNote(page);
  await expect(note).toBeVisible();

  // 全ての行き先で消えない。ついでに、日本郵便がリチウム電池の航空郵便の宛先に
  // 挙げていない国では**その事実がその場に足される**ことを見る。
  // これは品目の判定ではなく宛先の事実なので、カートを見ずに言える。
  for (const cc of COUNTRY_CODES) {
    await page.getByLabel('Ship to').selectOption(cc);
    await expect(note, `${cc} で開示が消えた`).toHaveCount(1);
    await expect(note).toBeVisible();
    const t = (await note.innerText()).replace(/\s+/g, ' ');
    const named = t.includes(`does not list ${COUNTRIES[cc].name}`);
    expect(named, `${cc}: リチウム電池の宛先の事実が表と食い違う`)
      .toBe(!LITHIUM_AIRMAIL_LISTED[cc]);
  }

  // 品を足す。行を開く。開いた内訳の中に複製されない。
  await addByHand(page, 'mystery lot Z', 4000);
  await expect(note).toBeVisible();
  await openRankRow(page, 1);
  await expect(note).toHaveCount(1);
  await expect(note).toBeVisible();

  // カートを空にすれば順位と一緒に消える。開示だけ宙に浮かない。
  await emptyCart(page);
  await expect(ranking(page)).toHaveCount(0);
  await expect(note).toHaveCount(0);

  // 戻せば両方戻る。
  await addByHand(page, 'mystery lot Z', 4000);
  await expect(ranking(page)).toHaveCount(1);
  await expect(note).toBeVisible();
});

test('26. a bottle of sake in the cart raises a stronger warning, and removing it takes the warning away', async ({ page }) => {
  await gotoCompare(page);
  // 酒が無いあいだは強い警告は出ない。常時の1行だけ。
  await expect(alcoholNote(page)).toHaveCount(0);
  await expect(restrictedNote(page)).toBeVisible();

  await addByHand(page, SAKE, 5200);
  const strong = alcoholNote(page);
  await expect(strong).toHaveCount(1);
  await expect(strong).toBeVisible();
  expect(await isCollapsed(strong), '強い警告が畳まれている').toBe(false);

  const text = (await strong.innerText()).replace(/\s+/g, ' ');
  // 重量表が当てたラインの見出しで名指しする（品名ではなく、当たった根拠のほうを出す）。
  expect(text).toContain('Sake / spirits, 700-750ml bottle');
  // 原文が言っていること。24% と「宛先が決める」の両方。
  expect(text).toMatch(/no drink over 24% ABV/);
  expect(text).toMatch(/the destination country\s+decides/);
  // そして我々が見ていないこと。ここを落とすと「送れない」と断定したことになる。
  expect(text).toMatch(/without checking/);
  expect(text).toMatch(/may belong to a\s+parcel that cannot be sent/);
  // 常時の1行は消えない。強いほうが置き換えるのではなく、足される。
  await expect(restrictedNote(page)).toBeVisible();

  // 酒を外せば強い警告は消え、常時の1行は残る。
  await cartItem(page, SAKE).getByRole('button', { name: `Remove ${SAKE}` }).click();
  await expect(strong).toHaveCount(0);
  await expect(restrictedNote(page)).toBeVisible();
});

test('27. both disclosures link to the rules, quoted with their source and date', async ({ page }) => {
  await gotoCompare(page);
  await restrictedNote(page).getByRole('link', { name: 'What the rules say' }).click();
  await expect(page).toHaveURL(/\/sources#restricted$/);
  await expect(page.getByRole('heading', { name: 'Goods that may not be shippable at all' }))
    .toBeVisible();

  for (const g of RESTRICTED_GOODS) {
    const li = page.getByRole('listitem').filter({ hasText: `${g.labelEn} —` }).first();
    await expect(li, `${g.id} の原文が /sources に無い`).toHaveCount(1);
    await expect(li).toContainText(g.checkedOn);
    await expect(li.getByRole('link', { name: 'Japan Post, nonmailable articles' }))
      .toHaveAttribute('href', g.sourceUrl);
    // 英語版に無い記述は、その旨をその行に書く。書かないと英語で読めると読まれる。
    if (g.sourceLang === 'ja') {
      await expect(li).toContainText('only in the Japanese page');
    }
  }

  // 宛先ごとのリチウム電池の可否を、表と同じ中身で出していること。
  const notListed = COUNTRY_CODES
    .filter((c) => !LITHIUM_AIRMAIL_LISTED[c]).map((c) => COUNTRIES[c].name);
  for (const name of notListed) {
    await expect(page.getByText(new RegExp(`${name}[^.]*(is|are) not`))).toBeVisible();
  }
  // 取れなかったものは「取れなかった」と書く。黙って落とさない。
  await expect(page.getByText(/What we could not get:/)).toBeVisible();
});

test('21. the disclosure links to why couriers are left out, named company by company', async ({ page }) => {
  await gotoCompare(page);
  await emsOnlyNote(page).getByRole('link', { name: /why we leave couriers out/ }).click();
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
    // 保存版から読んだ社は、その写しがいつ採られたかまで出す。読んだ日だけだと
    // 9か月前の内容を今日の実測に見せてしまう。
    if (s.capturedOn) {
      await expect(li, `${s.serviceName} の写しの採取日が /sources に無い`)
        .toContainText(s.capturedOn);
      await expect(li).toContainText('archived copy');
    }
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

  test('the scope disclosure holds for every destination, and there is only ever one', async ({ page }) => {
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

  test('the scope disclosure is readable on a phone without opening anything', async ({ page }) => {
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
