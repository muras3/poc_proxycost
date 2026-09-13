import { expect, test, type Page } from '@playwright/test';
import {
  addByHand, costRow, emptyCart, gotoCompare, openRankRow, parseYen, rankButtons, readRanking,
  rowCells, setMethod,
} from './helpers';
import { CA_PROVINCES, CA_PROVINCE_AVERAGE_RATE } from '../src/lib/pricing/countries';
import {
  US_DUTY_BY_CATEGORY, US_DUTY_CHECKED_ON, US_HTS_SOURCE_URL,
} from '../src/lib/pricing/us-duty';

/**
 * 税まわりの開示を、実際に押して確かめる。
 * **数字は決め打ちしない。**固定するのは「金額が出ているか」「— が出ているか」
 * 「どの社にどちらが出るか」だけ。
 */

const PREPAY = 'US import prepayment (Zonos) fee — not published';
const CHECKOUT_GST = 'GST collected at checkout';

async function shipTo(page: Page, code: string): Promise<void> {
  const first = (await readRanking(page))[0]!;
  const before = { total: first.total, name: first.name, variant: first.variant };
  await page.getByLabel('Ship to').selectOption(code);
  // 行き先が変われば EMS の地帯も税も変わる。総額が動くまで待つ。
  // **総額だけでは見ない。**画面の総額は ¥100 丸めなので、別の国の別の社の
  // 総額と偶然同じ丸め値になることがある（実測: 米国既定の ZenMarket
  // 「~¥27,900 or more」とシンガポールの FROM JAPAN「~¥27,900」が同じ表示に
  // 丸まった——実額も上限の有無も別物）。**1位の総額と1位の社の両方**を見て、
  // どちらかが変わるまで待つ——丸めの偶然一致だけでは「動いていない」と誤診しない。
  await expect.poll(async () => {
    const r = (await readRanking(page))[0]!;
    return { total: r.total, name: r.name, variant: r.variant };
  }).not.toEqual(before);
}

test('the US board admits the Zonos prepayment fee on postal rows; courier rows carry '
  + 'no destination-fee line at all, only the shared fuel/remote-area disclosure', async ({ page }) => {
  // **F3是正（2026-09-12）で書き直した。**以前はこのテストが「どの行にも Zonos が
  // 出る」と決め打ちしていたが、それ自体が F3 のバグ（Zonos は日本郵便が米国宛の
  // 引受条件として課すもので、宅配便の行には成立しない）を固定するテストになっていた
  // ——このアサーションのほうを直す（`setMethod` で固定するのではなく、既定の
  // 籠が実際に何を見せているかを検査する。#90 の言う「デフォルト行が利用者に何を
  // 見せるか」の主張なので、ピン留めではなく新しい正しい姿へ書き換える）。
  //
  // **2026-09-13、オーナー決定で `courier-destination-fees` 行は分離・撤去された。**
  // 燃油サーチャージは表示送料に含まれている前提で行を作らず、遠隔地サーチャージは
  // 総額に加算しない共通の画面注記（`RemoteAreaSurchargeNote`）に回した——つまり
  // 宅配便の行はもう「目的地側の未公表費用」という個別の行を持たない。以前の
  // 「郵便は Zonos、宅配便は目的地未知、どちらの行も必ずどちらか一方を持つ」という
  // 主張は、宅配便側の前提が消えたので**もう成り立たない**。宅配便の行は Zonos も
  // 持たず、行としての目的地未知費用も持たない——共通注記だけが画面のどこかに
  // 一度出る形に変わった。
  await gotoCompare(page);

  const rows = await readRanking(page);
  let sawPostalZonos = 0;
  let sawCourierRow = 0;
  for (const row of rows) {
    const lower = row.text.toLowerCase();
    const hasZonos = lower.includes(PREPAY.toLowerCase());
    if (hasZonos) sawPostalZonos++;
    if (row.name !== 'Jauce') sawCourierRow++;
  }
  expect(sawPostalZonos, 'no postal (Zonos) row in the default cart').toBeGreaterThan(0);
  expect(sawCourierRow, 'no courier row in the default cart').toBeGreaterThan(0);

  // Jauce（既定の籠で唯一の郵便行）を開くと、Zonos が費目として並び、金額は「—」。
  // **¥0 ではない。**
  const jauceIndex = rows.findIndex((r) => r.name === 'Jauce');
  expect(jauceIndex, 'Jauce not found in the default ranking').toBeGreaterThanOrEqual(0);
  const jauceLi = await openRankRow(page, jauceIndex);
  const fee = costRow(jauceLi, PREPAY);
  await expect(fee).toHaveCount(1);
  const cells = await rowCells(fee);
  expect(cells[1]).toBe('—');
  expect(cells.slice(1)).not.toContain('¥0');

  // 宅配便の行（Jauce 以外）を開くと、Zonos は出ず、目的地側の未知の費用の
  // 個別行も出ない——共通注記（`RemoteAreaSurchargeNote`）に置き換わったので、
  // 費目の表としてはこの費目の行自体が無い。
  const courierIndex = rows.findIndex((r) => r.name !== 'Jauce');
  expect(courierIndex, 'no courier row in the default ranking').toBeGreaterThanOrEqual(0);
  const courierLi = await openRankRow(page, courierIndex);
  await expect(costRow(courierLi, PREPAY)).toHaveCount(0);

  // 共通注記は画面に常時1つ出る（2026-09-13、訂正3でオーナーが「宅配便の行が
  // あるときだけ」から「常時」に変えた）。
  await expect(page.getByTestId('remote-area-surcharge-note')).toBeVisible();
});

test('Australia shows the checkout GST every service publishes', async ({ page }) => {
  await gotoCompare(page);
  await shipTo(page, 'AU');

  // 5社とも自社ページで徴収を明記しているので、どの行にも金額が出る。
  const n = await rankButtons(page).count();
  expect(n).toBeGreaterThan(1);
  for (let i = 0; i < n; i++) {
    const li = await openRankRow(page, i);
    const gst = costRow(li, CHECKOUT_GST);
    await expect(gst).toHaveCount(1);
    const cells = await rowCells(gst);
    expect(cells[1], `row ${i}`).not.toBe('—');
    expect(parseYen(cells[1]!), `row ${i}`).toBeGreaterThan(0);
  }

  // 二重取りしていないこと: 国境側の GST は 0 で、理由が書いてある。
  const li = await openRankRow(page, 0);
  const border = costRow(li, 'GST').first();
  expect((await rowCells(border))[0]).toContain('collected at checkout by the service');
});

test('Singapore: every service carries a number — confirmed as published, the rest as an estimate', async ({ page }) => {
  await gotoCompare(page);
  await shipTo(page, 'SG');

  // **以前ここは「確認できない社は —」だった。それは誤りだった。**
  // 確認できていないのは「**誰が**集めるか」であって「いくら払うか」ではない。
  // 集める社は決済時に、集めない社は国境で SingPost が集める——買い手が出す額は同じ 9%。
  // `—` にすると、調べていないことがその社の安さに化ける（`docs/TODO-NEXT.md` 課題1）。
  const confirmed = ['Buyee', 'FROM JAPAN'];
  const rows = await readRanking(page);
  let estimated = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const li = await openRankRow(page, i);
    // **見出しが2通りある。**徴収を明記している社は `GST collected at checkout`、
    // 明記していない社は `GST — estimated: we could not confirm who collects it`。
    // 片方だけで探すと、もう片方が「行が無い」＝undefined になって
    // 「— だった」と誤診する（このテストが実際にそう壊れていた）。
    const cells = await rowCells(costRow(li, /^GST (collected at checkout|— estimated)/));
    expect(cells[1], `${row.name}: 額が「—」になっている`).not.toBe('—');
    if (confirmed.includes(row.name)) {
      // 自社ページで徴収を明記している社。公表値なので `~` は付かない。
      expect(cells[1], row.name).not.toMatch(/^~/);
      expect(parseYen(cells[1]!), row.name).toBeGreaterThan(0);
      expect(row.text, row.name).not.toContain('could not confirm');
    } else {
      // 額は出すが、**推定と分かる形で**出す（`~` と琥珀）。
      expect(cells[1], row.name).toMatch(/^~¥/);
      expect(parseYen(cells[1]!.replace('~', '')), row.name).toBeGreaterThan(0);
      // **何が確定していないのかを、行そのものが名乗る。**
      expect(cells[0], row.name).toContain('could not confirm');
      estimated++;
    }
  }
  expect(estimated, '推定の社が居ない — この籠ではもう非対称を試せていない')
    .toBeGreaterThan(0);
});

// ─────────────────────────────────────────────────────────────────────────────
// T23: カナダの州。**州税も Canada Post の手数料も確実に発生する。**
// 以前はどちらも「—」だった。ここでは「選ばなくても数字が出る」「選ぶと確定する」
// 「州で総額が動く」を、実際に選んで確かめる。
// ─────────────────────────────────────────────────────────────────────────────

/** 開いた内訳から、その費目の1列目（この行の金額）を読む。 */
async function amountOf(page: Page, label: string | RegExp): Promise<string> {
  const li = await openRankRow(page, 0);
  const cells = await rowCells(costRow(li, label).first());
  return cells[1] ?? '';
}

test('Canada without a province still shows a provincial tax — as an estimate, never a dash', async ({ page }) => {
  await gotoCompare(page);
  await shipTo(page, 'CA');

  // 既定は未選択。欄はその中身（我々が当てている率）を名乗る。
  const picker = page.getByLabel('Province');
  await expect(picker).toBeVisible();
  await expect(picker).toHaveValue('');
  const avg = `${(CA_PROVINCE_AVERAGE_RATE * 100).toFixed(1)}%`;
  await expect(picker).toContainText(`we estimate ${avg}`);

  // **未選択でも数字。** `—` でも ¥0 でもない。
  const amount = await amountOf(page, 'Provincial tax');
  expect(amount).not.toBe('—');
  expect(parseYen(amount)).toBeGreaterThan(0);

  // 推定だと名乗り、確定させる道をその場で示す。
  const li = await openRankRow(page, 0);
  const note = (await rowCells(costRow(li, 'Provincial tax').first()))[0]!;
  expect(note).toContain(avg);
  expect(note).toContain('weighted by population');
  expect(note).toContain('Pick your province');

  // 総額から抜けている費目の一覧に州税は載らない（抜けていないので）。
  for (const row of await readRanking(page)) {
    expect(row.text, row.name).not.toMatch(/excl\..*provincial tax/i);
  }
});

test('picking Ontario turns the estimate into HST 13%, and Alberta into a real zero', async ({ page }) => {
  await gotoCompare(page);
  await shipTo(page, 'CA');
  const before = (await readRanking(page))[0]!.total;

  await page.getByLabel('Province').selectOption('ON');
  await expect.poll(async () => (await readRanking(page))[0]!.total).not.toBe(before);

  const li = await openRankRow(page, 0);
  const prov = await rowCells(costRow(li, 'Provincial tax').first());
  expect(prov[0]).toContain('Ontario');
  // 原文の合計（HST 13%）をその場に書く。州の取り分 8% と連邦 5% の関係が読めないと、
  // 二重に取られているように見える。
  expect(prov[0]).toContain('13% together');
  expect(prov[1]).not.toBe('—');
  const ontario = parseYen(prov[1]!);
  expect(ontario).toBeGreaterThan(0);

  // 州税の行が GST の行と別に立っていて、足すと 13% になること。
  const gst = parseYen((await rowCells(costRow(li, 'GST').first()))[1]!);
  expect(Math.abs((gst + ontario) / (gst / 0.05) - 0.13)).toBeLessThan(0.001);

  // アルバータは 0。**「調べていない」ではなく「国境では取られない」**と書いてある。
  // **総額は額の付いた行から取る。**国際送料が取れていない行は総額を名乗らない。
  const cheapestTotal = async () =>
    (await readRanking(page)).find((r) => r.total != null)!.total!;
  const onTotal = await cheapestTotal();
  await page.getByLabel('Province').selectOption('AB');
  await expect.poll(cheapestTotal).toBeLessThan(onTotal);
  const ab = await rowCells(costRow(await openRankRow(page, 0), 'Provincial tax').first());
  expect(ab[1]).toBe('¥0');
  expect(ab[0]).toContain('no provincial tax at the border');

  // ケベックは一番高い（QST 9.975%）。
  await page.getByLabel('Province').selectOption('QC');
  await expect.poll(cheapestTotal).toBeGreaterThan(onTotal);
  const qc = await rowCells(costRow(await openRankRow(page, 0), 'Provincial tax').first());
  expect(qc[0]).toContain(`${+(CA_PROVINCES.QC.rate * 100).toFixed(3)}%`);
});

test('the Canada Post handling fee is on the bill, per parcel, with its own figure', async ({ page }) => {
  await gotoCompare(page);
  await shipTo(page, 'CA');
  // **F3是正（2026-09-12）で `'ems'` に固定した。**この手数料は Canada Post
  // 自身の窓口手数料で、宅配便（FedEx/UPS/DHL/ECMS）の荷物には構造的に立たない
  // （`src/lib/pricing/countries.ts` の `COUNTRIES.CA.clearanceCarrierScope`）。
  // #92 以降、CAの既定順位の1位は宅配便に化ることがあるため、`cheapest` のままだと
  // このテストの主張（郵便の手数料の振る舞い）が「たまたま郵便が勝っている」に
  // 依存してしまう——明示的に郵便へ固定し、何を検査しているかをテスト自身に語らせる。
  await setMethod(page, 'ems');

  const li = await openRankRow(page, 0);
  const fee = await rowCells(costRow(li, 'Customs clearance fee').first());
  expect(fee[1]).not.toBe('—');
  expect(parseYen(fee[1]!)).toBeGreaterThan(0);
  expect(fee[0]).toContain('CAD 9.95');
  expect(fee[0]).toContain('Canada Post handling fee');
});

test('the province picker only exists for Canada, and choosing another country forgets it', async ({ page }) => {
  await gotoCompare(page);
  // 米国では出ない。選べない欄を画面に残さない。
  await expect(page.getByLabel('Province')).toHaveCount(0);

  await shipTo(page, 'CA');
  await page.getByLabel('Province').selectOption('QC');
  await expect(page.getByLabel('Province')).toHaveValue('QC');

  // 別の国へ移すと欄ごと消え、戻ってきたときに選択は残っていない。
  // 残っていたら、選んだ覚えの無い率が確定値の顔で出ることになる。
  await shipTo(page, 'GB');
  await expect(page.getByLabel('Province')).toHaveCount(0);
  await shipTo(page, 'CA');
  await expect(page.getByLabel('Province')).toHaveValue('');
});

// ─────────────────────────────────────────────────────────────────────────────
// T24: 米国の品目別関税・AU の輸入処理手数料・GB の酒税。
// **額を変えられるのは AU だけ。**米国は「12.5% が税率なのか下限なのか」を言い分け、
// 英国は「発生するのに額を知らない」を費目として出す。
// ─────────────────────────────────────────────────────────────────────────────

test('the US duty line says whether 12.5% is the rate or only a floor, and which heading we read', async ({ page }) => {
  await gotoCompare(page);
  // 既定のカートはフィギュア2点。重量表が figures と分類できるので、HTS 9503 を引いて
  // 「これが税率であって下限ではない」と言える。
  const li = await openRankRow(page, 0);
  const duty = await rowCells(costRow(li, 'Duty').first());
  expect(duty[0]).toContain('9503.00.00');
  expect(duty[0]).toContain('not a floor');
  expect(parseYen(duty[1]!)).toBeGreaterThan(0);

  // 靴を足すと、同じ 12.5% が「下限」に変わる。**額は変えない**——見出しを1つに
  // 決めるのは推測なので、変えられるのは言い方と確度だけ。
  await addByHand(page, 'sneaker casual', 12000);
  const after = await rowCells(costRow(await openRankRow(page, 0), 'Duty').first());
  expect(after[0]).toContain('only the floor');
  expect(after[0]).toContain('chapter 64');
  expect(after[0]).toContain('Your bill can be higher');
});

test('Australia shows a published zero below A$1,000 and a real charge above it', async ({ page }) => {
  await gotoCompare(page);
  await shipTo(page, 'AU');

  // 既定の籠（¥17,000）は A$1,000 の下。**「—」ではなく ¥0**、理由つき。
  const low = await rowCells(costRow(await openRankRow(page, 0), 'Customs clearance fee').first());
  expect(low[1]).toBe('¥0');
  expect(low[0]).toContain('no import declaration is required');

  // A$1,000 を越える1点だけにすると、手数料が数字になる。
  // **1点にするのは意味がある**: 帯は郵便物1個ごとに決まるので、注文ごとに個口を割る行は
  // 割った額で帯が決まり、割った先が A$1,000 の下に落ちれば手数料は 0 のままになる。
  // それは我々のごまかしではなく、原文が申告1件ごとに課すと書いていることの帰結である。
  await emptyCart(page);
  await addByHand(page, 'expensive lot', 300000);
  await expect.poll(async () => {
    const c = await rowCells(costRow(await openRankRow(page, 0), 'Customs clearance fee').first());
    return c[1];
  }).not.toBe('¥0');
  const high = await rowCells(costRow(await openRankRow(page, 0), 'Customs clearance fee').first());
  expect(parseYen(high[1]!)).toBeGreaterThan(0);
  expect(high[0]).toContain('AUD 98');
  expect(high[0]).toContain('biosecurity');
});

test('a bottle bound for the UK puts the excise duty on the board as a dash, not silence', async ({ page }) => {
  await gotoCompare(page);
  await shipTo(page, 'GB');
  const EXCISE = /UK excise duty on alcohol/;
  // 酒が無いあいだはこの費目自体が無い。
  await expect(page.getByText(EXCISE)).toHaveCount(0);

  await addByHand(page, 'junmai sake 720ml', 5000);
  // 順位のどの行にも「総額から抜けている費目」として名前が出る。
  for (const row of await readRanking(page)) {
    expect(row.text.toLowerCase(), row.name).toContain('uk excise duty on alcohol');
  }
  // 内訳では「—」。**¥0 ではない。**
  const li = await openRankRow(page, 0);
  const cells = await rowCells(costRow(li, EXCISE).first());
  expect(cells[1]).toBe('—');
  expect(cells[0]).toContain('at any value');
});

test('/sources publishes the tariff headings behind the 12.5%, category by category', async ({ page }) => {
  await page.goto('/sources#us-hts');
  await expect(page.getByRole('heading', {
    name: 'United States: what the 12.5% is, and where it is only a floor',
  })).toBeVisible();
  for (const d of Object.values(US_DUTY_BY_CATEGORY)) {
    const row = page.getByRole('row').filter({ hasText: d.categoryId }).first();
    await expect(row, `${d.categoryId} が /sources に無い`).toHaveCount(1);
    for (const h of d.headings) await expect(row).toContainText(h.htsNo);
  }
  // 引いた日と出典が出ていること。出ていなければただの主張になる。
  await expect(page.getByText(US_DUTY_CHECKED_ON).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'USITC Harmonized Tariff Schedule' }))
    .toHaveAttribute('href', US_HTS_SOURCE_URL);
});
