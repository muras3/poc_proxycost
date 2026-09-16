import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  addByHand,
  alcoholNote,
  breakdownTable,
  cart,
  cartItem,
  costRow,
  costRowByKey,
  emptyCart,
  emsOnlyNote,
  findRow,
  freeShippingDomesticNote,
  gotoCompare,
  headerCells,
  isCollapsed,
  isNonDecreasing,
  openBreakdown,
  openCart,
  openRankRow,
  parseYen,
  rankButtons,
  ranking,
  readRanking,
  lineNote,
  restrictedNote,
  rowCells,
  weightBox,
  type RankRow, shipTo, openScopeNote, openRestrictedNote, openNeedleNote, closeCart,
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

/**
 * 社名（と variant）で順位を引く。`findRow`（helpers.ts）が、そもそも variant を
 * 持たない社に variant を渡す**書き間違い**をその場で例外にする。見つからない
 * だけなら、探した対象と実際にあった行を並べて落とす。
 */
function rankOf(rows: RankRow[], name: string, variant: string | null = null): number {
  const row = findRow(rows, name, variant);
  const wanted = `${name}${variant ? `/${variant}` : ''}`;
  const present = rows.map((r) => `${r.name}${r.variant ? `/${r.variant}` : ''}`).join(', ') || '(no rows)';
  expect(row, `rankOf: looked for ${wanted} but the ranking has: ${present}`).toBeTruthy();
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
  // **差額を名乗る行だけを並びの対象にする。**1位と区間が交わっている行は
  // 差額を数値で出さない（画面は 'TOO CLOSE'、`readRanking` は diff=null）——
  // 点推定どうしの引き算は、交わっている相手に対しては実際の総額の並びと
  // 逆になりうるため（`src/components/compare/rankClaim.ts`）。
  const withGap = rows.filter((r) => r.diff !== null);
  expect(isNonDecreasing(withGap.map((r) => r.diff!))).toBe(true);

  // 1位だけが CHEAPEST で、差額は 0。
  expect(rows[0]!.cheapest).toBe(true);
  expect(rows.filter((r) => r.cheapest)).toHaveLength(1);
  expect(rows[0]!.diff).toBe(0);
  // 1位自身は差額欄に '1ST'/'LEADS' を出すので、'TOO CLOSE' にはならない。
  expect(rows[0]!.contested).toBe(false);

  // 比べられない行は総額も差額も名乗らず、なぜ比べられないのかを書く。
  for (const r of all.filter((x) => !x.comparable)) {
    expect(r.total, `${r.name} prints a total it cannot stand behind`).toBeNull();
    expect(r.cheapest).toBe(false);
    expect(r.text).toMatch(/does not (sell|ship)|no published rate/);
  }

  // 差額と総額が同じ順位付けを指していること。総額は ¥100 丸めなので誤差を許す。
  // **数値を名乗っている行だけ**——交わっている行は数値そのものを出していない。
  for (const r of rows.slice(1).filter((x) => x.diff !== null)) {
    expect(r.diff!).toBeGreaterThan(0);
    expect(Math.abs(r.total! - rows[0]!.total! - r.diff!)).toBeLessThanOrEqual(100);
  }
  // 交わっている行は、数値の代わりに「なぜ数値を出さないか」をその場に書く。
  for (const r of rows.filter((x) => x.contested)) {
    expect(r.diff, `${r.name} prints a gap although it overlaps the leader`).toBeNull();
    expect(r.text).toMatch(/Too close to call against/);
  }
});

test('1b. ZenMarket is never misdetected as variant "default" by its own Surface-shipping prose', async ({ page }) => {
  // **ZenMarket は default／consolidated の変種を持たない社**（`parcelDefault`
  // が per-order でないので `rowsFor` は常に `buildRow(svc, null, ctx)` を呼ぶ
  // ——`src/lib/pricing/compare.ts`）。したがって ZenMarket の行は常に
  // `variant: null` のはず。
  //
  // 既定のカート（米国宛）で ZenMarket の行を開くと、必ずこの一文を含む
  // ——Surface 便（1〜3ヶ月）を既定にしない理由の注記:
  //   "not used as the **default** because it takes 1-3 months"
  // `readRanking` がかつて `text.includes('default')` で変種を判定していたころ、
  // この地の文だけでこの行が `variant: 'default'` と**誤検出**されていた
  // （実際にはこの社に default 変種はそもそも存在しない）。
  //
  // **PR-B（順位ボード作り替え）で、この一文（Row.surface の段落）は
  // 「閉じた行に文章の段落を置かない」方針により閉じた行から開いた内訳の中へ
  // 移った。**プローブの文言そのものは閉じた行の地の文（`readRanking` が読む
  // `r.text`）にはもう出ないので、`readRanking` の variant 判定
  // （`data-row-id` 由来、地の文を見ない）が正しく効いていることを閉じた行で
  // 確認しつつ、プローブの文言自体が消えていないこと（このテストが何も検査
  // しなくなっていないこと）は行を開いて確かめる。
  await gotoCompare(page);
  const rows = await readRanking(page);
  const zen = rows.find((r) => r.name === 'ZenMarket');
  expect(zen, 'ZenMarket row not found in the default ranking').toBeTruthy();
  expect(zen!.variant).toBeNull();

  const zenIndex = rows.findIndex((r) => r.name === 'ZenMarket');
  const zenRow = await openRankRow(page, zenIndex);
  // 誤検出の引き金がまだそこにあることを確かめる——このプローブ自体が
  // 消えていたら、このテストは何も検査していないことになる。
  // Mock v3 では「Can wait 1–3 months? International parcel (surface)」の1行。
  // 「既定にしない理由」の文（`Row.surface.note`）はその行の注釈（§）の中。
  await expect(zenRow.getByTestId('surface-alternative')).toContainText(/Can wait 1–3 months\?/);
  expect(await lineNote(zenRow.getByTestId('surface-alternative'))).toMatch(/not used as the default/);
});

test('2. rank is decided by the total alone — no company pays us, and the disclosure says so', async ({ page }) => {
  await gotoCompare(page);
  // 2026-09-15、代行5社いずれとも契約が無いことが確定した。以前は「払う社と
  // 払わない社が混在」を検査していたが、その前提が虚偽だったので書き換えた。
  await shipTo(page, 'GB');

  // 順位の根拠を画面が名乗っていること。**「1位が誰か」ではなく「何で並べたか」**が主張の中身。
  await expect(page.getByText(/landed at your door/i)).toBeVisible();
  // ヒーロー文（lede）とフッターの開示文、両方に「No company pays us」が出る。
  // 順位に効かないという主張はどちらも「never move a row」で締める。
  await expect(page.locator('.lede').getByText(/No company pays us.*never move a row/i)).toBeVisible();
  await expect(page.getByRole('contentinfo').getByText(/No company pays us/i)).toBeVisible();

  const all = await readRanking(page);
  const rows = all.filter((r) => r.comparable);
  expect(rows.length).toBeGreaterThanOrEqual(4);

  // 報酬の有無は全行が名乗る（比べられない行も含む）。全社契約が無いので一様に
  // 「pays us nothing」を名乗る。**閉じた行には文章を置かない**（Mock v3）ので、
  // 開いた配達ログの `.ref` で読む。
  for (let i = 0; i < all.length; i++) {
    const li = await openRankRow(page, i);
    await expect(li.locator('.ref').first(), `${all[i]!.name} does not disclose the referral`)
      .toContainText(/pays us nothing/);
    await openRankRow(page, i); // 閉じる
  }

  // 並びは総額の昇順そのもの。
  const key = (r: RankRow) => `${r.name}${r.variant ? `/${r.variant}` : ''}`;
  expect(rows.map(key)).toEqual([...rows].sort((a, b) => a.total! - b.total!).map(key));

  // 1位が1位である理由は総額が最小であること。CHEAPEST もそこにだけ付く。
  expect(rows[0]!.total).toBe(Math.min(...rows.map((r) => r.total!)));
  expect(rows[0]!.cheapest).toBe(true);
  expect(rows.filter((r) => r.cheapest)).toHaveLength(1);

  // 1点に減らしても、並びは総額の昇順のまま。
  const rowsBefore = await rankButtons(page).count();
  await openCart(page);
  await cart(page).getByRole('button', { name: /^Remove / }).last().click();
  await expect(cart(page).getByRole('listitem')).toHaveCount(1);
  await expect(rankButtons(page)).toHaveCount(rowsBefore - 1);

  // **最下位は順位が付いた行の最下位。**比べられない行はその下に置かれるが、
  // それは「いちばん高い」ではなく「値段が付いていない」なので数えない。
  const single = (await readRanking(page)).filter((r) => r.comparable);
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
  expect((await rowCells(vat))[1]).toBe('not published');

  // **¥0 そのものは禁じない。**原文が「その帯では 0」と書いている費目は 0 で正しい
  // （米国の $2,500 以下の通関手数料、英国の £135 以下の関税、豪の A$1,000 以下 …）。
  // 禁じるのは**「持っていない」が ¥0 に化けること。**その2つは tier で分かれる:
  //   持っていない  → tier `none`（title「Not included in the total — this is not zero」）で必ず「—」
  //   取得できた 0  → tier `fixed` などで ¥0、かつ**なぜ 0 なのかが note にある**
  //   （Mock v3 の配達ログ: 未取得の行は `data-tier="none"`、額の欄は「not published」
  //   か「≈ up to ¥X」。線は引かれない。）
  const noneRows = li.locator('[role="row"][data-tier="none"]');
  for (let i = 0; i < await noneRows.count(); i++) {
    const cells = await rowCells(noneRows.nth(i));
    expect(cells[1], '未取得が ¥0 に化けている').toMatch(/^(not published|≈ up to ¥)/);
  }
  for (const { label, cells } of await taxRowsOf(li)) {
    if (!cells.slice(1).includes('¥0')) continue;
    // ¥0 の理由は行の注釈（§）にある。
    const row = costRow(li, label).first();
    expect((await lineNote(row)).length, `${label} が理由なしに ¥0`).toBeGreaterThan(label.length + 5);
  }
});

test('3b. two figures we did not read from the source are drawn as such (T17)', async ({ page }) => {
  // (1) EU の €3 定額関税: 制度の原文は取れているが、代行経由の購入がその対象
  //     （distance sale of imported goods）に当たるかを断定できない。ZenMarket の
  //     行で確認する——duty はどの社でも同じ EU 規則から来るので、社の選び方に
  //     意味は無い。
  // (2) 入金手数料 3.5%: 唯一 ZenMarket だけが自社ページ（payment.aspx）でこの値を
  //     公表しており、2026-09-12 の F07 調査で ZenMarket の deposit tier は
  //     `estimate` → `fixed` に上がった（詳細: services.test.ts, taxes.test.ts の
  //     F07 テスト）。**estimate のまま残っているのは Buyee/Neokyo/FROM JAPAN の3社**
  //     （ZenMarket の公表値を借りた暫定値であることが note に明記されている）。
  //     ここは Buyee の行で確認する。ZenMarket に estimate マーカーを戻すのは誤り
  //     （もう公表値であって推定ではない）。
  await gotoCompare(page);
  await shipTo(page, 'DE');
  await expect.poll(async () => (await readRanking(page)).length).toBeGreaterThan(0);

  const rows = await readRanking(page);
  const zen = rows.findIndex((r) => r.name === 'ZenMarket');
  expect(zen, 'ZenMarket が順位に居ない').toBeGreaterThanOrEqual(0);
  const zenLi = await openRankRow(page, zen);

  const duty = costRow(zenLi, /^Duty/);
  await expect(duty).toHaveCount(1);
  // **tier は `unverified` ではなく `estimate`。**制度の原文（EU の暫定定額関税ガイダンス）は
  // 手元にある——取れていないのは「代行経由の購入が DSIG に当たるか」で、それは**我々の仮定**。
  // 「原典に当たれていない」（unverified）ではないので、点線ではなく `~` と琥珀で描く。
  await expect(duty).toHaveAttribute('data-tier', 'estimate');
  expect((await rowCells(duty))[1]).toMatch(/^≈¥/);

  // **既定のカートは2点なので、Buyee は default／consolidated の2行に分かれる。**
  // variant を指定せず `name === 'Buyee'` だけで引くと、そのときの並び順（総額の
  // 安い方）でどちらを掴むかが決まってしまう——`svc.deposit` のパーセンテージは
  // 変種で変わらないので今日はどちらでも通るが、それは「たまたま」であって
  // 「そう検査している」ことにはならない。consolidated 行だと決め打って引く。
  const buyee = findRow(rows, 'Buyee', 'consolidated');
  expect(buyee, 'Buyee/consolidated が順位に居ない').toBeTruthy();
  const buyeeLi = await openRankRow(page, buyee!.rank - 1);

  const depositRow = costRow(buyeeLi, /^Deposit fee/);
  await expect(depositRow).toHaveCount(1);
  await expect(depositRow).toHaveAttribute('data-tier', 'estimate');
  expect((await rowCells(depositRow))[1]).toMatch(/^≈¥/);
  // 内訳の説明（行の注釈）が、この3.5%が Buyee 自身の公表値ではなく、ZenMarket から
  // 借りた暫定値であることを隠していないこと。
  expect(await lineNote(depositRow)).toContain('this is our own placeholder, not a rate Buyee');
});

test('4. changing the destination changes the numbers', async ({ page }) => {
  await gotoCompare(page);
  const before = await readRanking(page);

  await shipTo(page, 'GB');
  // 行き先が変われば EMS の地帯も税も変わる。総額が動くまで待つ。
  await expect
    .poll(async () => (await readRanking(page))[0]!.total)
    .not.toBe(before[0]!.total);

  const li = await openRankRow(page, 0);
  // 英国には VAT がある。米国で「—」だった行が金額になる。
  // **`prepaid-import-tax` 行（実額）を狙う。**`getByRole('cell', { name: /^VAT/ })`
  // は国境側の `vat` 行にもマッチしてしまい2行に化ける——国境側は sellerCollects の
  // 帯に入ると意図的に ¥0 で計上され（二重計上を避けるため、実額は社側の
  // `prepaid-import-tax` 行が持つ）、しかもそのラベル文字列自体が note と連結されて
  // 前方一致でも区別できない（両方 "VAT collected at checkout" で始まる）ので、
  // 文言ではなく `Line.key`（`data-cost-key`）で引く。
  const vat = costRowByKey(li, 'prepaid-import-tax');
  await expect(vat).toHaveCount(1);
  const amount = (await rowCells(vat))[1]!;
  expect(amount).not.toBe('—');
  expect(parseYen(amount)).toBeGreaterThan(0);
});

/** 重量表に載らない名前で1点、手で足す。 */
const PLUSH = 'plush toy, no weight data';

test('5. an item with no weight data gets an assumed weight, says so, and is corrected in place', async ({ page }) => {
  await gotoCompare(page);
  // **宛先はカナダ。カートは1点だけにする。**
  // **2026-09-12、courier-ui で差し替えた。**この PR で Buyee に実測宅配便運賃を
  // 配線した結果（P2「wire measured courier rates into the comparison engine」）、
  // おすすめ枠が事実上どこの宛先でも「ZenMarket・FROM JAPAN の2社で固定」に
  // 収束するようになった——既定の2点（フィギュア＋ねんどろいど）を残したまま
  // PLUSH を1点足しても、総額の1位（rank）が入れ替わることはあっても
  // **枠の顔ぶれ（recommended の集合）自体は動かない**ため、`decisive`
  // （枠の集合が変わったか）は常に false のままになり、この警告が実演できない
  // （`src/lib/pricing` で実測）。総額を小さく保つ——**カートをこの1点だけに
  // する**——と、枠の顔ぶれごと入れ替わる帯が残っている。
  //
  // **2026-09-12、六か国拡張で宛先を豪（AU）からカナダ（CA）に差し替えた。**
  // AU は今回の拡張で FROM JAPAN が全重量帯で1位を独占するようになり
  // （`compare()` で直接確認）、500 g/10 kg の割れ目が消えた。CA では
  // 500 g は FROM JAPAN・10 kg は Buyee と割れる（実測、`compare()` の
  // `weightSensitivity` で直接確認）。
  await shipTo(page, 'CA');
  await emptyCart(page);
  await addByHand(page, PLUSH, 3000);
  const c = await openCart(page);
  const li = cartItem(page, PLUSH);
  await expect(li.getByText(/placeholder/).first()).toBeVisible();
  await expect(li.getByText(/no weight data for this title/)).toBeVisible();
  await expect(weightBox(page, PLUSH)).toHaveValue('1000');
  // 段の表はもう出ない。順位は仮置きで出る。
  await expect(page.getByRole('region', { name: 'Totals by weight step' })).toHaveCount(0);
  await expect(c.getByText(/weight unknown/i)).toHaveCount(0);

  const assumed = priced(await readRanking(page));
  expect(assumed.length).toBeGreaterThanOrEqual(5);
  for (const r of assumed) expect(r.total).toBeGreaterThan(0);

  // **この品の重量が1位を決める**（カート1点、カナダ。2026-09-12 六か国拡張後の実測:
  // 500 g で FROM JAPAN、10 kg で Buyee）。仮置きの数字を信じるなと、その場で言う。
  await expect(li.getByTestId('decisive-note')).toBeVisible();
  const flag = (await li.getByTestId('decisive-note').innerText()).replace(/\s+/g, ' ');
  expect(flag).toMatch(/at 500 g/);
  expect(flag).toMatch(/at 10 kg/);
  // 名指しされた2社は違う社であること（同じ社なら「決める」は嘘）。
  const named = flag.match(/: (.+?) at 500 g, (.+?) at 10 kg\./);
  expect(named, flag).toBeTruthy();
  expect(named![1]).not.toBe(named![2]);

  // 軽くすれば総額は下がり、重くすれば上がる。1位も 200 g（FROM JAPAN）から
  // 8,000 g（Buyee）で入れ替わる（実測、同上）。
  await weightBox(page, PLUSH).fill('200');
  await expect.poll(async () => first(await readRanking(page)).total)
    .toBeLessThan(assumed[0]!.total);
  const light = await readRanking(page);
  await weightBox(page, PLUSH).fill('8000');
  await expect.poll(async () => first(await readRanking(page)).total)
    .toBeGreaterThan(first(assumed).total);
  const heavy = priced(await readRanking(page));
  for (const r of heavy) {
    const l = priced(light).find((x) => x.name === r.name && x.variant === r.variant);
    if (l) expect(r.total, `${r.name} did not get dearer with weight`).toBeGreaterThan(l.total);
  }
  // そして1位が替わる。これが「重量を入れてもらうしかない」理由そのもの。
  expect(first(light).name, 'the winner did not change between 200 g and 8 kg')
    .not.toBe(heavy[0]!.name);

  // 打ち込んだ数字は利用者のもの。「entered by you」、そして仮置きに戻す道。
  await expect(li.getByText('entered by you')).toBeVisible();
  await li.getByRole('button', { name: /^reset to the placeholder ≈1 kg$/ }).click();
  await expect(weightBox(page, PLUSH)).toHaveValue('1000');
  await expect(li.getByText('entered by you')).toHaveCount(0);
  await expect.poll(async () => (await readRanking(page))[0]!.total).toBe(assumed[0]!.total);
});

/**
 * 同額（T26）。**手で作れる実在の入力**で、同順位になることを画面で見る。
 * 1点 ¥1,000・100 g・楽天・カナダ宛・EMS 指定で ZenMarket と FROM JAPAN が
 * ちょうど同額。走査では同額を含む組み合わせが多数あり、稀な事故ではないので
 * 画面で扱う。
 *
 * **2026-09-12、courier-ui で組み合わせを差し替えた。**Neokyo が新たに推定
 * deposit を負ったことで Neokyo/ZenMarket の同額（旧: ¥4,500・200g・豪）が
 * 全域で崩れた（`compare.test.ts` の `topTie` コメント参照）ので、そちらが
 * 見つけ直した新しい同額組み合わせ（ZenMarket・FROM JAPAN、`method: 'ems'`
 * 指定）に揃える。
 */
const TIE = 'tie probe, no weight data';

/**
 * **2026-09-13、PR #127 で書き換えた。**FROM JAPAN は常に社固有の未取得行
 * （`outsourced-packing`。実費・非公表）を持ち、その `rankHigh` は常に `null`
 * ——`isIndeterminate()` の修正（1位グループの誰か1人でも `rankHigh` が
 * `null` なら判定不能）が入る前は、この事実が1位判定に効いていなかった。
 *
 * **2026-09-13、さらに書き戻した（別PR、外注梱包の条件付き化）。**PR #127 の
 * 前提だった「FROM JAPAN は常に `outsourced-packing` を持つ」自体が**バグ**
 * だった——`services.ts` が重量・商品価格・壊れ物という発生条件を一切見ずに
 * 無条件で立てていた（`docs/audit/fromjapan-outsourced-packing-gate-2026-09-13.md`）。
 * このカート（100g・¥1,000、条件を満たさない普通の商品）はもう
 * `outsourced-packing` を持たないので、`rankHigh` は閉区間で確定する。
 * ZenMarket と FROM JAPAN が下端で同額（tied, 両方1位）で、かつ両方とも
 * `rankHigh` が確定しているので、このカートは正しく `rankIndeterminate: false`
 * に戻る——「ZenMarket and FROM JAPAN are tied cheapest」という言い切りの文が
 * 出るのが正しい（本当に同額で確定しているので、判定不能として隠す理由が無い）。
 */
test('22. two rows with the same total share the rank, and both are marked CHEAPEST (a genuine tie)', async ({ page }) => {
  await gotoCompare(page);
  await shipTo(page, 'CA');
  await emptyCart(page);
  await addByHand(page, TIE, 1000, 'rakuten');
  await openCart(page);
  await weightBox(page, TIE).fill('100');
  await page.getByLabel('Ship by').selectOption('ems');

  await expect.poll(async () => (await readRanking(page)).filter((r) => r.tied).length).toBe(2);
  const rows = await readRanking(page);

  const tied = rows.filter((r) => r.tied);
  expect(tied.map((r) => r.name).sort()).toEqual(['FROM JAPAN', 'ZenMarket']);

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
    expect(r.text, `${r.name} does not name who it is tied with`).toContain(`Tied with ${other}`);
    expect(r.text).toContain('the order between them means nothing');
  }
  // 同額でない行は名乗らない。全行に付いたら印として機能しない。
  for (const r of rest) expect(r.text, r.name).not.toContain('Tied with');

  // **このカートは本当に閉区間で同額——判定不能として隠す理由が無い。**
  // （外注梱包の条件付き化で、普通の商品はもう社固有の未取得行を持たない）
  await expect(page.getByText(/ZenMarket and FROM JAPAN are tied cheapest/)).toBeVisible();
});

test('23. a tie below the top shares its rank too, and does not move the winner', async ({ page }) => {
  // 1点 ¥500・1,850 g・ヤフオク・**ドイツ**で Buyee と Neokyo が ¥14,635 の3位タイ。
  // **旧実装はここで社名の辞書順に割っていて、報酬を払う Buyee が、報酬ゼロの Neokyo を
  // 常に上に置いていた**（同額 3,938 組のうち 3,716 組が同じ向き）。
  // **宛先が米国からドイツに変わった。**同額になる2社の片方（Neokyo）は米国宛に
  // 日本郵便を売っていないので、米国ではこの同額そのものが起きない。
  //
  // **2026-09-12、courier-ui の六か国拡張で組み合わせを差し替えた。**旧の
  // ¥12,800・1,450g の入力は、DE に Buyee/Neokyo/ZenMarket/FROM JAPAN の実測宅配便
  // 運賃を配線した結果、Buyee と Neokyo のどちらか（あるいは両方）が日本郵便から
  // 宅配便に乗り換えて同額が崩れた（`compare()` で直接確認）。新しい入力（¥500・
  // 1,850g）は同じ性質（3位タイ・1位は不動・タイの次は5位に飛ぶ）を再現する組み合わせ
  // として走査で見つけ直した。
  await gotoCompare(page);
  await shipTo(page, 'DE');
  // 0d: 保管が総額に入り、既定45日では無料期間30日の Buyee だけに課金が乗る。
  // ここで検査しているのは同額・同順位の仕組みであって保管日数の効きではないので、
  // 両社とも無料期間の内側になる30日に固定する（Buyee ¥0・Neokyo ¥0）。
  await page.getByLabel('Days kept in the warehouse before shipping').fill('30');
  await emptyCart(page);
  await addByHand(page, TIE, 500);
  await openCart(page);
  await weightBox(page, TIE).fill('1850');

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
  // 同額の2社は同じ順位（報酬の有無は配達ログの中で名乗る——閉じた行には出ない）。
  const buyee = tied.find((r) => r.name === 'Buyee')!;
  const neokyo = tied.find((r) => r.name === 'Neokyo')!;
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

test('7. seller-paid shipping takes the same domestic shipping off every row — the order does not move', async ({ page }) => {
  await gotoCompare(page);
  await openCart(page);

  // 0d: 保管が総額に入り、既定45日では無料期間30日の Buyee だけに課金が乗る。
  // このテストが検査しているのは送料込み出品の効きであって保管日数の効きではないので、
  // 無料期間の内側になる30日に固定する（Buyee ¥0）。
  await page.getByLabel('Days kept in the warehouse before shipping').fill('30');

  // 例の2点を捨てて、実測と同じカートを手で組む。
  await emptyCart(page);
  for (const name of HANDMADE) await addByHand(page, name, 3000);
  await openCart(page);
  await expect(cart(page).getByRole('listitem')).toHaveCount(HANDMADE.length);
  for (const name of HANDMADE) await tellWeight(page, name, 200);

  const before = await readRanking(page);
  // **2026-09-13、F-total是正（Fable 5.1 監査、PR #cheapest-by-total）でこの並びが
  // また動いた。**以前は `cheapest` が国際送料**だけ**で方式を選んでいたので、
  // ZenMarket/Neokyo は「送料が一番安い宅配便」を選んでいて、着地側の通関/立替
  // 手数料（DHL/UPS の最低額の床、概ね$17.50相当＝¥2,734）を払う羽目になっていた。
  // **いまは総額（送料＋通関手数料込み）が最小の方式を選ぶ**ので、ZenMarket は
  // 送料がやや高い ECMS Express（通関手数料の床が無い）に切り替わり、FROM JAPAN も
  // 同じ理由で ECMS を選んで総額が下がり、Neokyo（送料最安の DHL のまま——ECMS
  // Express を売っていないためこの選択自体は変わらない）を追い越して2位に上がった。
  // これは実額を計算した結果の正しい入れ替わりで、退行ではない
  // （`compare()` を直接叩いて確認済み、`src/lib/pricing/compare.test.ts` の
  // 「'cheapest' selects by landed total」にも同種の逆転を固定してある）。
  // （実測の新しい並び: Buyee consolidated → FROM JAPAN → ZenMarket → Neokyo → Jauce
  // → Buyee default）。
  expect(before).toHaveLength(6);
  expect(priced(before)).toHaveLength(6);
  expect(first(before).name).toBe('Buyee');
  expect(rankOf(before, 'Buyee', 'consolidated')).toBe(1);
  // **ここに以前あった `rankOf(before, 'ZenMarket', 'default')` は、readRanking の
  // 部分一致バグ（ZenMarket の Surface 案内文「not used as the default …」に
  // 引きずられて variant: 'default' と誤読される）を避けるための workaround
  // だった。**readRanking が `data-row-id` から構造的に variant を読むようになった
  // いま、ZenMarket は他社と同じく default/consolidated の変種を持たない
  // （`variant: null`）ので、素直に名前だけで引ける。
  expect(rankOf(before, 'FROM JAPAN')).toBe(2);
  expect(rankOf(before, 'ZenMarket')).toBe(3);
  expect(rankOf(before, 'Neokyo')).toBe(4);
  expect(rankOf(before, 'Jauce')).toBe(5);

  // 国内送料が無くなる前の内訳。仮定の ~¥800 × 5点。
  // **1位（Buyee consolidated）は同梱の都合で内訳の出方が違うことがあるため、
  // 単一小口の2位（ZenMarket）の行で確かめる。**
  const liBefore = await openRankRow(page, 1);
  expect((await rowCells(costRow(liBefore, /^Domestic shipping/)))[1]).toBe('≈¥4,000');
  await openRankRow(page, 1); // 閉じる

  // 5点すべてを送料込み出品にする。
  const boxes = cart(page).getByRole('checkbox', { name: 'shipping included by seller' });
  await expect(boxes).toHaveCount(HANDMADE.length);
  for (let i = 0; i < HANDMADE.length; i++) await boxes.nth(i).check();

  await expect
    .poll(async () => first(await readRanking(page)).total)
    .toBeLessThan(first(before).total);
  const after = priced(await readRanking(page));

  // 国内送料は消えた。**「未取得」ではなく確定した ¥0** として出る。
  // **1位（Buyee consolidated）は複数注文をまとめる変種で、国内送料の確度自体が
  // `estimate` のままなので `~¥0` と出る（0円自体は確定だが、確度の印は残る）。**
  // 確度が `fixed` に落ちる単一小口の2位（ZenMarket）の行で「確定した¥0」を確かめる。
  const liAfter = await openRankRow(page, 1);
  expect((await rowCells(costRow(liAfter, /^Domestic shipping/)))[1]).toBe('¥0');
  await openRankRow(page, 1);

  // **1位は動かない。**この主張自体はF34（宅配便の通関/立替手数料が%×duty+taxで
  // 決まる、`courier-clearance.ts`）を配線した後もそのまま成り立つ——のは自明では
  // ない点を明記しておく。**国内送料は US では課税ベース（FOB）に入らない**
  // （`countries.ts` の `Country.base`）ので、国内送料をゼロにしても各社の
  // duty/tax、ひいては通関手数料の額そのものは変わらない。だから一律¥4,000の
  // 控除が全社の総額を同じだけ下げ、順位は保たれる——CIF国（GB/DE/FR/SG）でこの
  // 同じテストを組んだ場合は、国内送料が課税ベースに乗るぶん通関手数料も動き、
  // この不変条件が成り立つとは限らない（`compare()`で直接確認し、この行は崩れて
  // いないことを確かめた上でここに書いている）。
  expect(after[0]!.name, 'seller-paid shipping moved the cheapest row').toBe(first(before).name);
  expect(after[0]!.name).toBe('Buyee');
  expect(after.map((r) => `${r.name}/${r.variant}`))
    .toEqual(priced(before).map((r) => `${r.name}/${r.variant}`));
  expect(isNonDecreasing(after.map((r) => r.total))).toBe(true);

  // 全社が同じ国内送料（~¥800 × 5点）のぶん下がる。variant は `data-row-id` から
  // 構造的に読んでいる（helpers.ts の readRanking）ので、名前＋variant でそのまま
  // 引ける——`findRow` が、variant を持たない社に variant を渡す書き間違いを
  // その場で例外にする（実例: 以前ここで `dropOf('FROM JAPAN', 'default')` と
  // 書いていた。FROM JAPAN の `data-row-id` は常に `'fromjapan'` で variant を
  // 持たないのに、旧・部分一致検出の名残りで 'default' を渡していた——CI が
  // "FROM JAPAN/default disappeared from the ranking" で発見）。
  const DOMESTIC = 4000;
  const dropOf = (name: string, variant: string | null) => {
    const b = findRow(priced(before), name, variant);
    const a = findRow(after, name, variant);
    expect(b && a, `${name}${variant ? `/${variant}` : ''} disappeared from the ranking`).toBeTruthy();
    return b!.total - a!.total;
  };
  for (const r of after) {
    const drop = dropOf(r.name, r.variant);
    expect(drop, `${r.name} did not lose the domestic shipping`).toBeGreaterThanOrEqual(DOMESTIC - 100);
  }
  // 送金合計に率で乗る費目を持つ社は、その率のぶん余計に下がる（ZenMarket の入金手数料 3.5%）。
  expect(dropOf('ZenMarket', null)).toBeGreaterThanOrEqual(DOMESTIC + 100);
  // 定額の費目しか持たない社は、国内送料ちょうどしか下がらない
  // ——率のぶんの余計な下げは無いが、それでも他社との差（¥700 以上）を
  // 越えるほどではないので、上で確かめたとおり順位自体は動かない。
  // **2026-09-12、FROM JAPAN が米国宛にEMSを売っていないため courier
  // （ECMS）で比較されるようになり、総額が上がったぶん自身の推定 deposit
  // （3.5%グロスアップ）の絶対額も少し増え、しきい値を ¥100 だけ超えた。**
  expect(dropOf('FROM JAPAN', null)).toBeLessThanOrEqual(DOMESTIC + 200);
});

test('8. editing a price marks that number as ours, not theirs', async ({ page }) => {
  await gotoCompare(page);
  await openCart(page);

  // 触った数字は「edited by you」と名乗る（Mock v3 `itemHTML`: 下線は実線の青 `t-user`）。
  const edited = cart(page).getByText('edited by you');
  await expect(edited).toHaveCount(0);

  const price = cart(page).getByRole('textbox', { name: /^Price of / }).first();
  const before = await readRanking(page);
  await price.fill('19800');

  await expect(edited.first()).toBeVisible();
  // 下線の形も変わる（推定の破線 → 利用者の実線）。クラス名ではなく computed style で見る。
  expect(await price.evaluate((el) => getComputedStyle(el).borderBottomStyle)).toBe('solid');
  await expect.poll(async () => (await readRanking(page))[0]!.total)
    .not.toBe(before[0]!.total);
});

test('9. no ad before consent; an ad only after Accept', async ({ page }) => {
  await gotoCompare(page, { consent: 'leave' });
  const ad = page.getByRole('complementary', { name: 'Advertisement' });
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

test('10. no outbound link is marked sponsored — nobody pays us today', async ({ page }) => {
  // 2026-09-15、代行5社いずれとも契約が無いことが確定した。以前は「報酬を払う社
  // だけ sponsored」の混在を検査していたが、いまは払う社が実在しない。
  await gotoCompare(page);
  const rows = await readRanking(page);
  expect(rows.length).toBeGreaterThan(0);

  for (let i = 0; i < rows.length; i++) {
    const li = await openRankRow(page, i);
    const link = li.getByRole('link', { name: /^Open / });
    await expect(link).toBeVisible();
    const rel = ((await link.getAttribute('rel')) ?? '').split(/\s+/);
    await expect(link).toHaveAttribute('target', '_blank');
    expect(rel).toContain('noopener');
    expect(rel).toContain('nofollow');

    await expect(li.locator('.ref').first(), `${rows[i]!.name} should disclose "pays us nothing"`)
      .toContainText(/pays us nothing/);
    expect(rel, `${rows[i]!.name}'s outbound link must not be sponsored`).not.toContain('sponsored');
    await openRankRow(page, i); // 閉じる
  }
});


test('11b. a single listing opens on the proxy directly where we verified it', async ({ page }) => {
  await gotoCompare(page);

  // 例の2点を消し、実在の出品URLを1つだけ入れる。
  const c = await openCart(page);
  const removes = c.getByRole('button', { name: /remove|✕/i });
  for (let n = await removes.count(); n > 0; n = await removes.count()) await removes.first().click();

  await page.getByRole('button', { name: 'Add by hand', expanded: false }).first().click();
  await page.getByLabel('Item name').fill('Nendoroid test listing');
  await page.getByLabel('Price ¥').fill('5000');
  await page.getByRole('form', { name: 'Add an item by hand' }).getByRole('button', { name: 'Add by hand' }).click();

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
  // 幅（P25–P75）は § の注釈の中（Mock v3 `mk('Weight from our table', …)`）。
  await li.getByRole('button', { name: 'About: Weight from our table' }).click();
  await expect(page.getByRole('dialog', { name: 'Weight from our table' }).getByText(/Middle half of listings: all 1\.5 kg/)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(li.getByText('entered by you')).toHaveCount(0);

  // 上書きすると総額が動き、数字は利用者のものになる。
  const before = await readRanking(page);
  await weightBox(page, FIGURE).fill('3000');
  await expect.poll(async () => first(await readRanking(page)).total)
    .toBeGreaterThan(first(before).total);
  await expect(li.getByText('entered by you')).toBeVisible();
  // 表の出どころは消える。利用者の数字に「n=647」を添えたら出所の偽装になる。
  await expect(li.getByRole('link', { name: /1\/7 scale/ })).toHaveCount(0);

  // 戻せる。何に戻るかがボタンに書いてある。
  await li.getByRole('button', { name: /^reset to ≈1\.5 kg$/ }).click();
  await expect(weightBox(page, FIGURE)).toHaveValue('1500');
  await expect(li.getByText('entered by you')).toHaveCount(0);
  await expect(li.getByRole('link', { name: /1\/7 scale/ })).toBeVisible();
  await expect.poll(async () => (await readRanking(page))[0]!.total).toBe(before[0]!.total);
});

test('17. when the weight decides the winner, the note says so and takes you to the box that matters', async ({ page }) => {
  await gotoCompare(page);
  // **宛先はカナダ。カートは1点だけにする**（テスト5と同じ理由——
  // 2026-09-12、courier-ui で Buyee に実測宅配便運賃を配線した結果、おすすめ枠が
  // 既定の2点＋追加1点だと顔ぶれごと動かなくなり、`decisive` を実演できる
  // 組み合わせが見つからなくなった。以前はドイツで既定2点のうち Nendoroid も
  // 道連れで決定打になっていたが、いまその反転先が無い。カートをこの1点だけに
  // 絞ると、枠の顔ぶれごと入れ替わる帯がまだ残っている——詳細はテスト5のコメント。
  // **2026-09-12、六か国拡張でさらに豪（AU）からカナダ（CA）に差し替えた**——
  // AU は FROM JAPAN が全重量帯で1位を独占するようになり割れ目が消えたため）。
  //
  // **2026-09-13、PR #127 で一度「recommended range changes with the weight」の
  // 期待を捨てたが、別PR（外注梱包の条件付き化、
  // `docs/audit/fromjapan-outsourced-packing-gate-2026-09-13.md`）で元に戻した。**
  // PR #127 が前提にした「FROM JAPAN は常に `outsourced-packing` を持つ」自体が
  // バグだった——`services.ts` が発生条件（重量・商品価格・壊れ物）を見ずに
  // 無条件で立てていた。このカート（PLUSH、表に当たらない仮置き 500g〜10kg）は
  // 条件を満たさないので、もう `outsourced-packing` を持たない——両端の1位
  // （500gでFROM JAPAN、10kgでBuyee）とも `rankHigh` が閉区間で確定するので、
  // 「重量で1位が確定的に入れ替わる」という元の前提が復活する。
  await shipTo(page, 'CA');
  await emptyCart(page);
  await addByHand(page, PLUSH, 3000);
  // Mock v3 #1: 「重量で1位が変わる」は文章ではなく形——1位の札の横で揺れる秤の針と、
  // 畳んだカートの赤い点。`rankStabilityNote` の文は針の注釈の中で読める。
  const note = await openNeedleNote(page);
  await expect(note).toContainText(/The recommended range changes with the weight/);
  await expect(page.getByText(/sit within the same uncertainty/)).toHaveCount(0);
  // 表の中央値と仮置きを「あなたがくれた重量」とは呼ばない。
  await expect(note).toContainText('our weight estimate');
  await expect(note).not.toContainText('you gave us');
  await page.keyboard.press('Escape');

  // **この仮置きの1点が1位を決める**（500 g で FROM JAPAN、10 kg で Buyee。実測、
  // テスト5と同じ）。
  await openCart(page);
  await expect(cartItem(page, PLUSH).getByTestId('decisive-note')).toBeVisible();
  await expect(cartItem(page, PLUSH).getByTestId('decisive-note')).toContainText('at 500 g');
  await expect(cartItem(page, PLUSH).getByTestId('decisive-note')).toContainText('at 10 kg');

  // カートを畳む。畳んだ1行には決め手の品が赤い点つきで名指しされている。
  await closeCart(page);
  await expect(cart(page).getByRole('listitem').first()).toBeHidden();
  await expect(page.getByTestId('cart-decisive-mark')).toBeVisible();

  // 導線: 「Check」を押すと、1位を決めている品の重量入力にフォーカスが移る。
  await page.getByTestId('cart-decisive-mark').getByRole('button', { name: 'Check' }).click();
  const focused = page.locator(':focus');
  await expect(focused).toHaveAttribute('aria-label', /^Weight in grams of /);
  await expect(focused).toBeVisible();
  const title = ((await focused.getAttribute('aria-label')) ?? '').replace(/^Weight in grams of /, '');
  await expect(cartItem(page, title).getByTestId('decisive-note')).toBeVisible();
});

/** 表に当たる、軽くて安い1点（漫画1冊、P25–P75 は 200–250 g）。 */
const MANGA = 'One Piece manga volume 1';

test('18. a single item: the US total is not indeterminate, even though the bracket now moves (P1-4)', async ({ page }) => {
  // **2026-09-12、courier-ui で fixture を差し替えた。**以前はここで PLUSH
  // （表に当たらない仮置き 1,000 g固定）を使っていたが、この PR で Buyee に
  // 実測宅配便運賃を配線した結果（P2「wire measured courier rates into the
  // comparison engine」）、1,000 g 前後で Buyee が新たにおすすめ枠へ食い込むように
  // なり、PLUSH 単体では 500 g〜10 kg は疎か ±3x でも 1位が
  // FROM JAPAN → ZenMarket → Buyee と動くようになった（`src/lib/pricing`
  // で実測——total: FROM JAPAN ¥7,971（1,000 g）→ ZenMarket ¥10,257（3,000 g）
  // → ZenMarket ¥12,688（8,000 g）、枠も FROM JAPAN+Buyee → ZenMarket+Buyee と
  // 入れ替わる）。**これは欠陥ではなく実測運賃を新たに載せたことの正しい効果**——
  // 「重量が分からない1点は1位が揺れうる」という、まさに T-17 が伝えたい話その
  // ものになった（この揺れは 5番・17番のテストが仮置き重量の側で確かめる）。
  //
  // **2026-09-12、さらに `master/courier-rates.json` の
  // `conclusions.courier_lineup_diffs` を配線した結果、表に当たる軽い1点
  // （漫画、200–250 g）でも安定は成り立たなくなった。**FROM JAPAN は米国宛に
  // EMS（日本郵便）を売っていないと確認済みで、この重量帯ではEMSを使えない
  // ぶん FROM JAPAN の「その社にとって一番安い方式」（=宅配便ECMS）が軽い荷物
  // では割高になり、1/3の重量では枠から外れる（3倍の重量では戻る）。
  // この18番が守りたいのは別の話——**「重量さえ分かっていれば、1点だけの
  // カートで判定不能（indeterminate）にはならない」**（P1-4）という不変条件で、
  // それは「枠の顔ぶれが重量で動かない」こととは別物。不安定であっても
  // 判定不能ではないことを、ここでは確かめる。
  await gotoCompare(page);
  await emptyCart(page);
  await addByHand(page, MANGA, 800);
  await openCart(page);

  await expect(weightBox(page, MANGA)).toHaveValue('210');
  const li = cartItem(page, MANGA);
  await expect(li.getByRole('link', { name: /manga volume/i })).toBeVisible();
  await expect(li.getByText('entered by you')).toHaveCount(0);

  // 枠は重量で動く（不安定）が、「判定不能」ではない——見出しは「Can't tell who leads」に
  // ならず、1位は「LEADS」ではなく「1ST」。同等の印（判定不能の注意）も出ない。
  await expect(page.getByText(/Can.t tell who leads/)).toHaveCount(0);
  await expect(page.getByTestId('indeterminate-note')).toHaveCount(0);
  await expect(page.getByText(/sit within the same uncertainty/)).toHaveCount(0);
  expect((await readRanking(page))[0]!.cheapest).toBe(true);
  await expect(ranking(page).locator('.flap.diff.lead').first()).toHaveAttribute('aria-label', '1ST');

  // それでも直せる。直せば総額は動く。
  const before = await readRanking(page);
  await weightBox(page, MANGA).fill('600');
  await expect.poll(async () => first(await readRanking(page)).total)
    .toBeGreaterThan(first(before).total);
});

// ─────────────────────────────────────────────────────────────────────────────
// T10: 比較の範囲の常時開示。
// **2026-09-07 に範囲が狭まった。**日本郵便の他方式（小形包装物・国際小包の航空/船便）を
// 価格化したので、出せないのは宅配便だけになった。
// **2026-09-12、courier-ui でその宅配便自体を実測運賃つきで配線した**（P2「wire
// measured courier rates into the comparison engine」）ので、選択肢はさらに広がり、
// 各社ブランドの宅配便（FedEx・DHL・UPS 等）も方式ピッカーに載るようになった。
// 「黙っていれば選べる範囲を狭く見せる」という開示の趣旨は変わらないが、狭さの
// 中身が変わったので、以下は「宅配便が選択肢に無い」ではなく「宅配便も選択肢に
// ある」ことを確かめる。
// ─────────────────────────────────────────────────────────────────────────────

test('18b. the shipping method is a control, and picking one moves every total', async ({ page }) => {
  // **方式は利用者が選ぶ。**代行はメニューを出すだけ（Neokyo 原文
  // 「please select Japan Post as the shipment method」）。総額は方式で決まるので、
  // 方式が入力に無ければ「可能な限り正確な総額」を出しようがない。
  await gotoCompare(page);
  const picker = page.getByLabel('Ship by');
  await expect(picker).toHaveCount(1);

  // **既定は `cheapest`（運べる中で最安。Surface は既定候補から除く）**
  // （P2 オーナー確定 2026-09-12）。Surface（1〜3か月）は既定にしない——
  // 誰も払わない額を総額として黙って出すことになるので。
  await expect(picker).toHaveValue('cheapest');
  // **2026-09-12、courier-ui で Neokyo にも実測宅配便運賃が付いた。**`cheapest`
  // （運べる中で最安）では Neokyo も宅配便運賃で比較可能になったが、**日本郵便を
  // 売っていない事実は変わらない**——特定の日本郵便の方式（船便など）を明示的に
  // 選ぶと、Neokyo だけは総額を出せなくなる。それ自体が「方式は利用者が選ぶ」
  // ことの効きの一部なので、消える1行を「安くなっていない」とは数えず、
  // **残った行が全部安くなること**を見る。
  // **Buyee は2行（同梱／既定）出るので、社名だけを鍵にすると片方が消える。**
  const keyOf = (r: RankRow) => `${r.name}${r.variant ? `/${r.variant}` : ''}`;
  const before = new Map(priced(await readRanking(page)).map((r) => [keyOf(r), r.total]));
  expect(before.size).toBeGreaterThan(0);

  // 船便に切り替えると総額が下がる。**同時に日数が読めること。**
  await picker.selectOption('parcel-surface');
  await expect.poll(async () => first(await readRanking(page)).total)
    .not.toBe([...before.values()][0]);
  const after = priced(await readRanking(page));
  // **2026-09-12、`master/courier-rates.json` の `conclusions.courier_lineup_diffs`
  // を配線した結果、国際小包(船便)を米国宛に出していない社が Neokyo だけでは
  // なくなった。**FROM JAPAN・Buyee は米国宛に日本郵便を一切出していないと確認済み
  // （以前はこの `unavailableIn` が無く、実際には売っていない米国向け国際小包に
  // 値段を付けていた欠陥）。さらに Jauce も米国宛の Surface だけは提供していないと
  // 実測済み（EMSは提供）。ZenMarket だけが米国向けに国際小包(船便)を売っている。
  expect(before.size - after.length).toBe(5);
  expect([...before.keys()].filter((k) => !after.some((r) => keyOf(r) === k)).sort()).toEqual(
    ['Buyee/consolidated', 'Buyee/default', 'FROM JAPAN', 'Jauce', 'Neokyo']);
  // それ以外の行（ZenMarketだけ）は船便のほうが安いので、素直に下がる。
  for (const r of after) {
    expect(r.total, `${keyOf(r)} が船便で安くなっていない`).toBeLessThan(before.get(keyOf(r))!);
  }

  // 行を開くと、額の隣に所要日数と追跡の有無がある。
  // **額だけ出して日数を出さなければ、遅いほうを選ばせる誤誘導になる。**
  const li = await openRankRow(page, 0);
  const ship = costRowByKey(li, 'intl-shipping');
  await expect(ship).toHaveCount(1);
  await expect(ship).toContainText(/International parcel \(surface\)/);
  // 日数と追跡の有無は、その行の下の1行（Mock `.lnote`）。
  await expect(li.getByTestId('intl-line-note')).toContainText('1–3 months');

  // 選択肢には日数が載っていて、選ぶ前に時間が見える。
  const options = await picker.locator('option').allInnerTexts();
  expect(options.join(' | ')).toMatch(/1–3 months/);
  expect(options.join(' | ')).toMatch(/no tracking/);
  expect(options.join(' | ')).toMatch(/Cheapest that fits/);
  // **宅配便もいまは選択肢にある**（P2 で実測運賃を配線済み）。
  for (const c of ['FedEx', 'DHL', 'UPS']) {
    expect(options.join(' | '), `${c} が選択肢に居ない`).toContain(c);
  }
});

test('18d. storage days shows the 45-day default and changing it recomputes every total (0d)', async ({ page }) => {
  // **保管日数は既定 45 日で画面に見えていること**（隠して通さない）。既定45日では
  // 無料期間30日の Buyee だけに課金が乗る（他4社は無料期間の内側で ¥0）。
  await gotoCompare(page);
  const days = page.getByLabel('Days kept in the warehouse before shipping');
  await expect(days).toHaveCount(1);
  await expect(days).toHaveValue('45');

  const before = new Map(priced(await readRanking(page)).map((r) => [`${r.name}/${r.variant}`, r.total]));
  expect(before.size).toBeGreaterThan(0);

  // 30日に変えると、無料期間30日のBuyeeの保管料が消えて安くなる。
  await days.fill('30');
  await expect.poll(async () => {
    const rows = priced(await readRanking(page));
    const buyee = rows.find((r) => r.name === 'Buyee' && r.variant === 'default');
    return buyee?.total;
  }).toBeLessThan(before.get('Buyee/default')!);
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
  // 全行が比べられないとき、盤は「Can't compare」の枠に替わり、社ごとに理由を並べる
  // （Mock v3 状態7c）。
  const panel = page.getByTestId('norank');
  await expect(panel).toBeVisible();
  await expect(panel.locator('li[data-row-id]')).toHaveCount(6);
  // 理由が読める。**方式名と上限が入っていること。**
  await expect(panel.getByText(/Small packet .* has no published rate above/).first()).toBeVisible();

  // 方式を戻せば表も戻る。片道の壊れ方をしていないこと。
  await page.getByLabel('Ship by').selectOption('parcel-surface');
  await expect.poll(async () => (await readRanking(page)).length).toBe(before.length);
});

test('19. the ranking says which methods are priced, US couriers included, other destinations named as unpriced', async ({ page }) => {
  await gotoCompare(page); // 既定は US
  // Mock v3: 比べている範囲の開示は「Ship by §」の注釈の中（wording only inside the popover）。
  const note = await openScopeNote(page);
  await expect(note).toHaveCount(1);
  expect(await isCollapsed(note), '開いたのに開示が読めない').toBe(false);

  const text = (await note.innerText()).replace(/\s+/g, ' ');
  // (1) 日本郵便の方式は価格化してあり、選べること。
  expect(text).toMatch(/Japan Post methods/);
  expect(text).toMatch(/cheapest that fits/i);
  // (2) 米国宛は宅配便も価格化してあり、それを名指しすること（Jauce は対象外だと言う）。
  // **2026-09-12、六か国拡張で「US only」の決め打ちを外した**（`EmsOnlyNote.tsx` の
  // `courierScopeText` 参照。国名は `COUNTRIES[country].name` から取り、文全体が
  // `coverage` だけから組み立つ）ので、ここも文字列 "US only" ではなく実際の国名を見る。
  expect(text).toMatch(/Courier rates are also priced/);
  expect(text).toMatch(/for United States/);
  expect(text).toMatch(/Jauce has no courier rate grid/);
  expect(text).toMatch(/FedEx/);
  expect(text).toMatch(/DHL/);
  expect(text).toMatch(/UPS/);
  // (3) **誤差の向きが「安く出ている」の一方向ではないこと。**
  //     宅配便は送料が安いことが多いが通関手数料が高い（スペイン €1.56〜€70）。
  //     「総額は高く出ている」と書けば、片側だけの誤差だと誤解させる。
  expect(text).toMatch(/either direction/);

  // **2026-09-12、六か国拡張で GB を「全社未測定」の例には使えなくなった。**
  // このPR（#87）が GB/DE/FR/AU/CA/SG に実測宅配便運賃を配線した結果、GB は
  // FROM JAPAN・Neokyo・ZenMarket・Buyee の4社とも価格化済みになった
  // （`courierCoverageFor('GB')` で直接確認）——「全社まだ調べていない」の分岐
  // (`pricedServiceNames.length === 0`) は2026-09-12時点でどの対応国からも
  // 到達できない（`EmsOnlyNote.test.ts` がその分岐をセレクタ経由ではなく直接
  // 検査している）。旧アサーションが間違っていたのではなく、データが増えて
  // GB がその例で無くなっただけ。代わりに DE を使う——DE は Buyee だけ
  // 未測定で、他3社は価格化済みという「一部だけ」の形を今も実演できる。
  await shipTo(page, 'DE');
  const deText = (await (await openScopeNote(page)).innerText()).replace(/\s+/g, ' ');
  expect(deText).toMatch(/Courier rates are also priced/);
  expect(deText).toMatch(/for Germany/);
  expect(deText).toMatch(/FROM JAPAN|Neokyo|ZenMarket/);
  expect(deText).toMatch(/Buyee also offer couriers here/);
  expect(deText).toMatch(/we have not priced them for Germany/);
  expect(deText).toMatch(/Jauce has no courier rate grid/);
  await shipTo(page, 'US');

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

  // 総額を読む前に目に入る位置（順位表の上、条件欄の「Ship by」の横）に注釈の印が居ること。
  await page.keyboard.press('Escape');
  const markBox = (await page.getByRole('button', { name: 'About: How methods are compared' }).boundingBox())!;
  const rankBox = (await ranking(page).boundingBox())!;
  expect(markBox.y + markBox.height).toBeLessThanOrEqual(rankBox.y + 1);
});

test('20. the disclosure stays through real use, and it comes and goes with the ranking', async ({ page }) => {
  await gotoCompare(page);
  // Mock v3: 開示は「Ship by §」の注釈の中。操作のたびに開き直して読む（注釈は外側クリックで閉じる）。
  await expect(await openScopeNote(page)).toBeVisible();

  // 行き先を変える（総額も税も全部変わる）。
  await shipTo(page, 'GB');
  await expect(await openScopeNote(page)).toBeVisible();

  // 品を足す。
  await addByHand(page, 'mystery lot Z', 4000);
  await expect(await openScopeNote(page)).toBeVisible();

  // 行を開く。開いた内訳の中に複製されもしない。
  await openRankRow(page, 1);
  await expect(await openScopeNote(page)).toHaveCount(1);

  // カートを空にすれば順位が消え、注釈からも開示が消える。**順位だけ残って開示が消えることも、
  // 開示だけ残って宙に浮くことも無い。**
  await emptyCart(page);
  await expect(ranking(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'About: How methods are compared' }).click();
  await expect(emsOnlyNote(page)).toHaveCount(0);
  await page.keyboard.press('Escape');

  // 戻せば両方戻る。
  await addByHand(page, 'mystery lot Z', 4000);
  await expect(ranking(page)).toHaveCount(1);
  await expect(await openScopeNote(page)).toBeVisible();
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

  // **PR-C（mock-v3 §5, owner review）: 文章の帯ではなく常時アイコンになった。**
  // 押さなくても読めた旧仕様（テスト24の元コメント「何も押していない状態で、
  // もう読める」）は、この設計変更でそのままは成り立たなくなった——ただし
  // 「隠れた場所に置かない・開示自体は無くならない」という T27 の約束は保つ:
  // アイコン自体は常に見え、押せばすぐに（タップ・キーボードとも）読める。
  const icon = page.getByTestId('icon-shippability');
  await expect(icon).toBeVisible();
  // アイコンは順位表より前（条件欄の中）に居る——総額を読む前に目に入る位置。
  const iconBox = (await icon.boundingBox())!;
  const rankBox = (await ranking(page).boundingBox())!;
  expect(iconBox.y).toBeLessThanOrEqual(rankBox.y);

  await icon.click();
  const note = restrictedNote(page);
  await expect(note).toHaveCount(1);
  await expect(note).toBeVisible();
  expect(await isCollapsed(note), '開いたのに開示が読めない').toBe(false);

  const text = (await note.innerText()).replace(/\s+/g, ' ');
  // (1) 何が制限されているか。**表（RESTRICTED_GOODS）と同じ語**が出ていること。
  expect(text).toContain(restrictedList());
  for (const g of RESTRICTED_GOODS) {
    expect(text.toLowerCase(), `${g.id} が開示に無い`).toContain(g.labelEn.toLowerCase());
  }
  // (2) 我々が見ていないこと、そして総額が「送れる」の保証ではないこと。
  expect(text).toMatch(/We do not check/);
  expect(text).toMatch(/not a promise that the parcel can be sent/);
});

test('25. the shippability disclosure stays through real use, and comes and goes with the ranking', async ({ page }) => {
  await gotoCompare(page);
  // Mock v3 §5: 常時アイコン（`icon-shippability`）の注釈の中で読む。注釈は外側の操作で
  // 閉じるので、操作のたびに開き直す（`openRestrictedNote`）。
  const note = restrictedNote(page);
  await expect(await openRestrictedNote(page)).toBeVisible();

  // 全ての行き先で消えない。ついでに、日本郵便がリチウム電池の航空郵便の宛先に
  // 挙げていない国では**その事実がその場に足される**ことを見る。
  // これは品目の判定ではなく宛先の事実なので、カートを見ずに言える。
  for (const cc of COUNTRY_CODES) {
    await shipTo(page, cc);
    await openRestrictedNote(page);
    await expect(note, `${cc} で開示が消えた`).toHaveCount(1);
    const t = (await note.innerText()).replace(/\s+/g, ' ');
    const named = t.includes(`does not list ${COUNTRIES[cc].name}`);
    expect(named, `${cc}: リチウム電池の宛先の事実が表と食い違う`)
      .toBe(!LITHIUM_AIRMAIL_LISTED[cc]);
  }

  // 品を足す。行を開く。開いた内訳の中に複製されない。
  await addByHand(page, 'mystery lot Z', 4000);
  await expect(await openRestrictedNote(page)).toBeVisible();
  await openRankRow(page, 1);
  await openRestrictedNote(page);
  await expect(note).toHaveCount(1);

  // カートを空にすれば順位と一緒に消える。開示だけ宙に浮かない。
  await emptyCart(page);
  await expect(ranking(page)).toHaveCount(0);
  await expect(page.getByTestId('icon-shippability')).toHaveCount(0);
  await expect(note).toHaveCount(0);

  // 戻せば両方戻る。アイコンは既定（畳んだ状態）で戻るので、もう一度開く。
  await addByHand(page, 'mystery lot Z', 4000);
  await expect(ranking(page)).toHaveCount(1);
  await expect(await openRestrictedNote(page)).toBeVisible();
});

test('26. a bottle of sake in the cart raises a stronger warning, and removing it takes the warning away', async ({ page }) => {
  await gotoCompare(page);
  // PR-C: 常時アイコンを開いてから読む（mock-v3 §5）。強い警告（`AlcoholInCartNote`）
  // 自体は以前どおり帯のまま——酒がカートに入っているときだけの一時的な警告なので、
  // アイコン化の対象（「常時」の2つ）には含めていない。
  // 酒が無いあいだは強い警告は出ない。常時の注釈だけ（アイコンの中）。
  await expect(alcoholNote(page)).toHaveCount(0);
  await expect(await openRestrictedNote(page)).toBeVisible();

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
  // 常時の注釈は消えない。強いほうが置き換えるのではなく、足される。
  await expect(await openRestrictedNote(page)).toBeVisible();

  // 酒を外せば強い警告は消え、常時の注釈は残る。
  await cartItem(page, SAKE).getByRole('button', { name: `Remove ${SAKE}` }).click();
  await expect(strong).toHaveCount(0);
  await expect(await openRestrictedNote(page)).toBeVisible();
});

test('27. both disclosures link to the rules, quoted with their source and date', async ({ page }) => {
  await gotoCompare(page);
  // PR-C: 常時アイコンを開いてから読む（mock-v3 §5）。
  await page.getByTestId('icon-shippability').click();
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
  await (await openScopeNote(page)).getByRole('link', { name: /why we leave couriers out/ }).click();
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
    await openBreakdown(page);
    const table = breakdownTable(page);
    await expect(table).toBeVisible();

    const ranked = await rankButtons(page).count();
    const headers = await headerCells(table);
    // 先頭は費目の見出し。残りが会社の列。
    expect(headers[0]).toMatch(/^fee$/i); // 見出しは CSS で大文字化される
    expect(headers).toHaveLength(ranked + 1);

    // 列順＝順位順。
    const rows = await readRanking(page);
    for (let i = 0; i < rows.length; i++) {
      // 見出しは CSS で大文字化されるので、大文字小文字を無視して比べる。
      expect(headers[i + 1]!.toLowerCase()).toContain(rows[i]!.name.toLowerCase());
    }
  });

  test('the scope disclosure holds for every destination, and there is only ever one', async ({ page }) => {
    await gotoCompare(page);
    for (const code of ['GB', 'DE', 'FR', 'AU', 'CA', 'SG', 'US']) {
      await shipTo(page, code);
      const note = await openScopeNote(page);
      await expect(note, `${code} で開示が消えた`).toHaveCount(1);
      await page.keyboard.press('Escape');
    }
  });

  test('12. confidence is actually drawn: ≈ for estimates, dotted for second-hand, red words for missing', async ({ page }) => {
    await gotoCompare(page);
    await openBreakdown(page);
    const table = breakdownTable(page);
    await expect(table).toBeVisible();

    // 推定は '≈' 前置（Mock v3 `lineAmount`）。**数字も色も、確度の印は `data-tier` から引く**
    // ——文言の部分一致で探すと、費目が増えたときに別の行を掴む。
    const estimate = table.locator('td[data-tier="estimate"]').first();
    await expect(estimate).toBeVisible();
    expect((await estimate.innerText()).trim()).toMatch(/^≈/);

    // 未取得は数字を書かない（'not published' か '≈ up to …'）。0 とは書かない。
    const none = table.locator('td[data-tier="none"]').first();
    await expect(none).toBeVisible();
    expect((await none.innerText()).trim()).toMatch(/^(not published|≈ up to )/);

    // 二次情報は点線の下線。**クラス名ではなく computed style で見る。**
    const unverified = table.locator('td[data-tier="unverified"] span').first();
    await expect(unverified).toBeVisible();
    const deco = await unverified.evaluate((el) => {
      const s = getComputedStyle(el);
      return { line: s.textDecorationLine, style: s.textDecorationStyle };
    });
    expect(deco.style).toBe('dotted');
    expect(deco.line).toContain('underline');

    // 一次情報には下線が付かない（点線が「二次情報だけ」を意味していること）。
    const fixed = table.locator('td[data-tier="fixed"]').first();
    await expect(fixed).toBeVisible();
    const plain = await fixed.evaluate((el) => getComputedStyle(el).textDecorationLine);
    expect(plain).toBe('none');
  });

  /**
   * ②の欠陥（コーディネーター指摘、2026-09-11）: 内訳表の `approx. total` 行が
   * `total.low` を1点表示し、`high === null` でも「or more」が付かず、
   * `comparable: false` の行にまで総額を出していた（米国の既定カートで Neokyo
   * 列に総額が出る一方 EMS 行は「—」——`RankBoard.tsx:49` が直した欠陥と
   * 同じ形が内訳表に残っていた）。**e2e はこの表を見ていなかった**
   * （`readRanking` は Ranking 領域のボタンしか読まない）ので、ここで直接見る。
   */
  test('the breakdown footer follows the same interval rules as the ranking (② regression)', async ({ page }) => {
    await gotoCompare(page);
    await openBreakdown(page);
    const table = breakdownTable(page);
    await expect(table).toBeVisible();

    // 既定カート（米国）: FROM JAPAN の総額は上限不明（Zonos）。
    // Ranking 側の 'or more' と、内訳表の footer の 'or more' が一致すること。
    const rows = await readRanking(page);
    const fromJapan = rows.find((r) => r.name === 'FROM JAPAN');
    expect(fromJapan, 'FROM JAPAN missing from ranking').toBeDefined();

    const headers = await headerCells(table);
    const fjColumn = headers.findIndex((h) => h.toLowerCase().includes('from japan'));
    expect(fjColumn, 'FROM JAPAN column not found in breakdown table').toBeGreaterThan(0);

    const footerRow = table.getByRole('row').filter({
      has: page.getByRole('cell', { name: 'Total', exact: true }),
    });
    // ヘッダーとフッターの列位置は同じ（先頭が Fee/Total、以降が会社ごと）。
    // 上限不明は見た目では「¥X」1点、読み上げ（aria-label）で 'or more' と言う（Mock v3 `totalParts`）。
    const fjCell = footerRow.getByRole('cell').nth(fjColumn);
    await expect(fjCell.locator('[aria-label]')).toHaveAttribute('aria-label', /or more/);
    expect(await fjCell.innerText()).not.toMatch(/–/); // 偽の上端（「¥X – Y」）を書かない

    // **重量を実測の宅配便レンジ（20 kg）の外・EMS 公表表（30 kg）の内まで重くすると、
    // 日本郵便を売れない社が比較不能になる。**その社の Ranking 側 'NOT RANKED' と、
    // 内訳表の footer の '—' が一致すること（`total.low` を出して最安に見せない）。
    // 以前は 25 kg/点（計 50 kg）だったが、それだと全社が比較不能になって
    // 順位表ごと消える（表も出ない）ので、混在が残る 15 kg/点（計 30 kg）にする。
    await openCart(page);
    await weightBox(page, FIGURE).fill('15000');
    await weightBox(page, NENDOROID).fill('15000');
    const heavyRows = await readRanking(page);
    const notComparable = heavyRows.filter((r) => !r.comparable);
    expect(notComparable.length, 'expected at least one not-comparable row at 15 kg/item').toBeGreaterThan(0);

    const heavyHeaders = await headerCells(table);
    const heavyFooterRow = table.getByRole('row').filter({
      has: page.getByRole('cell', { name: 'Total', exact: true }),
    });
    const heavyFooterCells = await rowCells(heavyFooterRow);
    for (const r of notComparable) {
      // 見出しは CSS で大文字化されるので、大文字小文字を無視して引く。
      const col = heavyHeaders.findIndex((h) => h.toLowerCase().includes(r.name.toLowerCase())
        && (r.variant == null || h.toLowerCase().includes(r.variant.toLowerCase())));
      expect(col, `${r.name} ${r.variant ?? ''} column not found`).toBeGreaterThan(0);
      expect(heavyFooterCells[col], `${r.name} ${r.variant ?? ''} should show — like the ranking`).toBe('—');
    }
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

  test('13b. the by-hand form is usable — the name field is not crushed to a sliver', async ({ page }) => {
    // Pixel 7 で 21px まで縮み、ラベルが 'Price ¥' に重なっていた。手入力は
    // 検索も URL も要らない唯一の経路なので、ここが潰れると足す手段が1つ消える。
    await gotoCompare(page);
    await page.getByRole('button', { name: 'Add by hand', expanded: false }).first().click();
    const name = page.getByLabel('Item name');
    await expect(name).toBeVisible();

    const box = (await name.boundingBox())!;
    const vw = await page.evaluate(() => window.innerWidth);
    expect(box.width, `名前欄が ${Math.round(box.width)}px しかない`).toBeGreaterThan(vw * 0.5);

    // ラベルどうしが重なっていない（同じ行に居るなら横に、違う行なら上下に離れている）。
    const price = page.getByLabel('Price ¥');
    const p = (await price.boundingBox())!;
    const overlaps = box.x < p.x + p.width && p.x < box.x + box.width
      && box.y < p.y + p.height && p.y < box.y + box.height;
    expect(overlaps, '名前欄と価格欄が重なっている').toBe(false);

    // 実際に打てて、実際に足せる。
    await name.fill('mobile hand-entry check');
    await page.getByLabel('Price ¥').fill('4000');
    await page.getByRole('form', { name: 'Add an item by hand' }).getByRole('button', { name: 'Add by hand' }).click();
    await openCart(page);
    await expect(cartItem(page, 'mobile hand-entry check')).toBeVisible();
  });

  test('13c. a long "or more (upper bound unknown)" total does not crush the row into one word per line', async ({ page }) => {
    // **P1-3 追修正で見つかった実際の崩れ。**`Ranking` セクションの y 座標
    // だけを見る既存テストは検出できなかった——`RankBoard` の右列
    // （差額・approx. total）が `shrink-0` のまま幅を持たなかったため、
    // 「or more (upper bound unknown)」のような長い文字列が右列の内容幅を
    // 押し広げ、`min-w-0 flex-1` の左列（社名・内訳）が単語ごとに折り返される
    // ところまで潰れていた。既定カート（米国）は `rankIndeterminate` で
    // 全行がこの文言を持っていた。
    //
    // **PR-B（順位ボード作り替え）で「or more (upper bound unknown)」の文言
    // 自体を閉じた行から外した**（台帳 #22/#30、Fable レビュー）——`TotalBar`
    // の右端フェードだけで同じ情報を伝える。ここでの崩れの再現条件は消えた
    // （むしろ右列は以前より短くなった）が、**この崩れ自体の検出手段として
    // レイアウトの縛りは残す価値がある**——右列が今後また長い文言を持てば
    // 同じ形で崩れうる。前提条件（上限不明の行が存在すること）は、文言では
    // なく `TotalBar` の `data-upper-unknown` 属性で確認する。
    await gotoCompare(page);
    await expect(
      ranking(page).locator('[data-testid="total-bar"][data-upper-unknown="true"]').first(),
    ).toBeAttached();

    const rows = ranking(page).locator('li[data-row-id]');
    const n = await rows.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      const row = rows.nth(i);
      const info = row.getByTestId('row-service');
      const rowBox = (await row.boundingBox())!;
      const infoBox = (await info.boundingBox())!;
      // 単語ごとの折り返しに壊れると、左列の幅がほぼ0まで潰れ、行の高さが
      // 行数ぶん異常に伸びる。**幅と高さの両方**を縛ることで、片方だけを
      // 通す偶然の実装を防ぐ。
      //
      // 上限は 260 → 300 に引き上げた。260 は afcca4f（P1-3 追修正、この崩れを
      // 塞いだ時点）で決めた値で、当時 row-info には Surface 代替行が無かった。
      // f794b20（P2 UI）で `Row.surface` の「Surface option — …」行が row-info に
      // 追加され、実測高さが 264px になった——その後 PR-B（順位ボード作り替え）で
      // Surface の段落は「閉じた行に文章の段落を置かない」方針により開いた中へ
      // 移し、代わりに総額バー・到着バー・箱数を右列（`row-info` の外）に足した。
      // 300 はどちらの構成でも、単語ごとの折り返し崩れ（コメント通り「行数ぶん
      // 異常に伸びる」ので数百px単位で跳ね上がる）を確実に検出できる値のまま。
      // Mock v3 の狭い幅の行: 34px の順位列 ＋ 社名の列 ＋ 開閉の矢印。社名の列が
      // 行の 4 割を下回るなら単語ごとの折り返しに潰れている。
      expect(infoBox.width, `row ${i}: 左列が潰れている（${Math.round(infoBox.width)}px）`)
        .toBeGreaterThan(rowBox.width * 0.4);
      expect(rowBox.height, `row ${i}: 行の高さが異常（${Math.round(rowBox.height)}px）`)
        .toBeLessThan(300);
    }
  });

  test('14. no cost×company table on a phone until the fold is opened', async ({ page }) => {
    await gotoCompare(page);
    // Mock v3: 全社費目表は閉じた折りたたみ。見出しは見えるが、表は開くまで出ない。
    expect(await breakdownTable(page).evaluate((el) => (el as HTMLDetailsElement).open)).toBe(false);
    await expect(breakdownTable(page).getByRole('table')).toBeHidden();
    // 順位リストの中の表も、開くまでは出ていない。
    await expect(ranking(page).getByRole('table')).toHaveCount(0);
  });

  test('15. tapping a row opens the two-column comparison against the cheapest', async ({ page }) => {
    await gotoCompare(page);
    const rows = await readRanking(page);

    // 2位を開く: 自社・最安・差額の3列＋費目。
    // 2位を開く: 配達ログ（費目の段）が出て、各費目の右端に1位との差（vs 1st）が付く。
    // Mock v3 の狭い幅では列見出し（`.lhead`）は出ないので、差のセルそのもので見る。
    await rankButtons(page).nth(1).tap();
    const second = ranking(page).locator('li[data-row-id]').nth(1);
    await expect(second.getByRole('table')).toBeVisible();
    await expect(second.getByRole('table')).toHaveAttribute('aria-label', new RegExp(`Delivery log · ${rows[1]!.name}`));
    const diffs = await second.locator('[role="row"] .v1').allInnerTexts();
    expect(diffs.some((t) => /^[+−]¥[\d,]+$|only here/.test(t.trim())), `vs-1st cells: ${diffs}`).toBe(true);

    // 最安を開くと、比べる相手が居ないので差の列は空。
    await rankButtons(page).nth(1).tap();
    await rankButtons(page).nth(0).tap();
    const first = ranking(page).locator('li[data-row-id]').nth(0);
    await expect(first.getByRole('table')).toBeVisible();
    const firstDiffs = await first.locator('[role="row"] .v1').allInnerTexts();
    expect(firstDiffs.every((t) => t.trim() === '')).toBe(true);
  });

  test('the scope disclosure is readable on a phone behind one tap, and fits the width', async ({ page }) => {
    await gotoCompare(page);
    // Mock v3: 開示は「Ship by §」の注釈の中。1タップで読め、幅に収まる（横スクロールの外に逃がさない）。
    const note = await openScopeNote(page);
    expect(await isCollapsed(note)).toBe(false);
    const box = (await note.boundingBox())!;
    const width = await page.evaluate(() => window.innerWidth);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);

    // 行を開いてもカートを開いても、開き直せば居る。
    await page.keyboard.press('Escape');
    await openRankRow(page, 0);
    await expect(await openScopeNote(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await openCart(page);
    await expect(await openScopeNote(page)).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 順位の見出しに添える現地通貨換算。**ここは「fixed <実装日>」と出していた。**
// 転記していない日付を出典日として名乗っていたので（docs/audit/gaps.md G3）、
// 実際に画面を操作して、出典名・参照日・転記したレートが出ることを見る。
// ─────────────────────────────────────────────────────────────────────────────
test.describe('the currency line under the winner cites the rate it actually used', () => {
  // 見出しの1文。**文言ではなく要素そのものを掴む**（P1-3 追修正）。
  // 以前は `/is cheapest/` を含むかで絞っていたが、`rankIndeterminate` のとき
  // Summary は「is cheapest」と断定しなくなった（判定不能で最安を言い切るのは
  // 自己矛盾なので削った）——文言に依存したセレクタは表示の正しい変更のたびに
  // 壊れる。`data-testid="summary"` で要素を直接掴む。
  const summary = (page: Page) => page.getByTestId('summary');

  test('the default destination shows the transcribed USD rate and the ECB reference date',
    async ({ page }) => {
      await gotoCompare(page);
      const text = (await summary(page).innerText()).replace(/\s+/g, ' ');
      // Mock v3 の要約は換算額と ECB の参照日を出す（レートの数字そのものは /sources）。
      expect(text).toMatch(/≈ \$[\d,]+/);
      expect(text).toContain(`ECB rate of ${RATES_AS_OF}`);
      // 出典を名乗らない裸の「fixed <日付>」に戻っていないこと。
      expect(text).not.toMatch(/\(fixed \d{4}-\d{2}-\d{2}\)/);
    });

  test('switching the destination switches the quoted rate to that currency', async ({ page }) => {
    await gotoCompare(page);
    await shipTo(page, 'GB');
    await expect(summary(page)).toContainText(/≈ £[\d,]+/);
    const text = (await summary(page).innerText()).replace(/\s+/g, ' ');
    expect(text).toContain(`ECB rate of ${RATES_AS_OF}`);
    // £ の概算が、転記したレートで割った値であること。
    // **¥190/£ のままなら 11% 大きい数字が出る。そこが利用者に見えていた嘘だった。**
    // 見出しの円は ¥100 に丸めて出るので、その丸め幅（±0.3£）だけ許して比べる。
    const total = parseYen((await summary(page).locator('.sumtot .v').getAttribute('aria-label'))!);
    const shown = Number(text.match(/≈ £([\d,]+)/)![1]!.replace(/,/g, ''));
    expect(Math.abs(shown - total / RATES['GBP']!)).toBeLessThanOrEqual(1);
    expect(Math.abs(shown - total / 190), 'the pre-transcription ¥190/£ must not fit')
      .toBeGreaterThan(1);
  });
});

test('27. a long item is named on the board, and naming it moves no total', async ({ page }) => {
  // **寸法は入力にすら無い。**だから「どの方式が落ちるか」は言えず、
  // 「見ていない」とだけ言う。ここで見るのは、出ること・鳴らし分けること・
  // **総額が1円も動かないこと**の3つ。
  await gotoCompare(page);

  // 常時の開示は、カートの中身に関係なく「Ship by §」の注釈の中に居る。
  await expect(await openScopeNote(page)).toContainText(/size is never checked/i);
  await page.keyboard.press('Escape');

  // 長物が入っていないうちは、名指しの警告は出ない。
  const named = page.getByText(/long rather than heavy/i);
  await expect(named).toHaveCount(0);

  await emptyCart(page);
  await addByHand(page, 'ゼブラ サラサクリップ 0.5mm 黒 10本', 666);
  await expect(named).toHaveCount(0);
  const before = priced(await readRanking(page)).map((r) => r.total);

  // 竿を足すと名指しが出る。**表が当てたラインの見出し**で名乗る（打った品名ではない）。
  await addByHand(page, 'シマノ ロッド 1ピース', 8000);
  await expect(named).toBeVisible();
  await expect(named).toContainText('Rod, 1-piece');
  await expect(named).toContainText(/we hold no size limits/i);

  // **総額は動く（品が1点増えたので）。動いてはいけないのは「長物だから」の差。**
  // 同じ重量の無名の品と入れ替えて、総額が一致することで確かめる。
  const withRod = priced(await readRanking(page)).map((r) => r.total);
  expect(withRod).not.toEqual(before);
  await openCart(page);
  await cart(page).getByRole('button', { name: /^Remove / }).last().click();
  await addByHand(page, '無名の箱', 8000);
  await openCart(page);
  await weightBox(page, '無名の箱').fill('9780');
  await expect(page.getByText(/long rather than heavy/i)).toHaveCount(0);
  expect(priced(await readRanking(page)).map((r) => r.total)).toEqual(withRod);
});

test('28. "free shipping" raises a Buyee-only note, and moves no total', async ({ page }) => {
  // F13b（master/fees.json）: Buyee 自身が「送料無料でも配送方法の変更で
  // 国内送料が発生しうる」と書いている。額は公表されていないので動かさず、
  // 警告だけ出す（T-F10）。対象は Buyee だけ ── 他4社は材料が無い。
  await gotoCompare(page);
  // 既定の2点だと国内送料の行が2点分の合算になり、1点だけ送料無料にしても
  // 行の額が ¥0 にならない。**行の額そのものを見る**ため、1点のカートにする。
  await emptyCart(page);
  const title = 'test figure';
  await addByHand(page, title, 3000);
  await openCart(page);

  // 「送料無料」の出品が無いうちは注記も出ない。
  await expect(freeShippingDomesticNote(page)).toHaveCount(0);

  // まず「確定で ¥0」（手入力）を作り、Buyee の総額を控えておく。
  // T-F10 が変えるのは確度（tier）だけなので、次で作る freeShipping の ¥0 と
  // 総額は一致するはず ── 一致しなければ金額が動いたということ。
  await page.getByLabel(`Domestic shipping for ${title}`).fill('0');
  const confirmedZero = await readRanking(page);
  const buyeeTotalConfirmedZero = confirmedZero.find((r) => r.name === 'Buyee')!.total;

  // 手入力の ¥0 を戻し、代わりに「送料無料（出品ページ）」にする。
  await page.getByLabel(`Domestic shipping for ${title}`).fill('');
  const box = cart(page).getByRole('checkbox', { name: 'shipping included by seller' }).first();
  await box.check();

  // 注記が出て、Buyee だけの話だと読める（原文の言い回しと出典リンクを含む）。
  const note = freeShippingDomesticNote(page);
  await expect(note).toBeVisible();
  const text = (await note.innerText()).replace(/\s+/g, ' ');
  expect(text).toMatch(/domestic shipping fees may occur due to a change of shipping method/);
  expect(text).toMatch(/Buyee/);
  expect(text).toMatch(/other services/);
  await expect(note.getByRole('link', { name: 'Source' })).toHaveAttribute(
    'href', 'https://buyee.jp/helpcenter/guide/fees?lang=en',
  );

  // Buyee の行の内訳: domestic-shipping は ¥0 のまま、確度は「公表値」ではなくなっている。
  const afterRanking = await readRanking(page);
  const buyeeIndexAfter = afterRanking.findIndex((r) => r.name === 'Buyee');
  const li = await openRankRow(page, buyeeIndexAfter);
  const row = costRow(li, /^Domestic shipping/);
  // **確度が fixed でなくなった印。**額は変わらないが、`~` が付く（tierClass の描き分け）。
  expect((await rowCells(row))[1]).toBe('≈¥0');
  const cellTitle = await row.getByRole('cell').nth(1).getAttribute('title');
  expect(cellTitle).not.toBe(TITLE.fixed);
  await openRankRow(page, buyeeIndexAfter); // 閉じる

  // **金額は1円も動いていない。**確定の ¥0 と freeShipping の ¥0 で、
  // Buyee の総額は同じ。
  expect(afterRanking[buyeeIndexAfter]!.total).toBe(buyeeTotalConfirmedZero);

  // 元に戻せば注記も消える。
  await box.uncheck();
  await expect(note).toHaveCount(0);
});
