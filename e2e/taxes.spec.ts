import { expect, test, type Page } from '@playwright/test';
import {
  costRow, gotoCompare, openRankRow, parseYen, rankButtons, readRanking, rowCells,
} from './helpers';
import { CA_PROVINCES, CA_PROVINCE_AVERAGE_RATE } from '../src/lib/pricing/countries';

/**
 * 税まわりの開示を、実際に押して確かめる。
 * **数字は決め打ちしない。**固定するのは「金額が出ているか」「— が出ているか」
 * 「どの社にどちらが出るか」だけ。
 */

const PREPAY = 'US import prepayment (Zonos) fee — not published';
const CHECKOUT_GST = 'GST collected at checkout';

async function shipTo(page: Page, code: string): Promise<void> {
  const before = (await readRanking(page))[0]!.total;
  await page.getByLabel('Ship to').selectOption(code);
  // 行き先が変われば EMS の地帯も税も変わる。総額が動くまで待つ。
  await expect.poll(async () => (await readRanking(page))[0]!.total).not.toBe(before);
}

test('the US board admits the Zonos prepayment fee it cannot price', async ({ page }) => {
  await gotoCompare(page);

  // 順位のどの行にも「総額から抜けている費目」として名前が出る。
  for (const row of await readRanking(page)) {
    expect(row.text.toLowerCase(), row.name).toContain(PREPAY.toLowerCase());
  }

  // 内訳を開くと費目として並び、金額は「—」。**¥0 ではない。**
  const li = await openRankRow(page, 0);
  const fee = costRow(li, PREPAY);
  await expect(fee).toHaveCount(1);
  const cells = await rowCells(fee);
  expect(cells[1]).toBe('—');
  expect(cells.slice(1)).not.toContain('¥0');
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

test('Singapore shows a number only where we could confirm it, and a dash elsewhere', async ({ page }) => {
  await gotoCompare(page);
  await shipTo(page, 'SG');

  // Buyee と FROM JAPAN だけが自社ページで徴収を明記している。
  const confirmed = ['Buyee', 'FROM JAPAN'];
  const rows = await readRanking(page);
  let dashed = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const li = await openRankRow(page, i);
    const cells = await rowCells(costRow(li, new RegExp(`^${CHECKOUT_GST}`)));
    if (confirmed.includes(row.name)) {
      expect(cells[1], row.name).not.toBe('—');
      expect(parseYen(cells[1]!), row.name).toBeGreaterThan(0);
      expect(row.text, row.name).not.toContain('could not confirm');
    } else {
      // **0 ではなく —。**「その社では GST が要らない」とは書かない。
      expect(cells[1], row.name).toBe('—');
      expect(cells[0], row.name).toContain('could not confirm');
      // 総額から抜けていることが、開かなくても順位の行に出ている。
      expect(row.text.toLowerCase(), row.name).toContain('could not confirm');
      dashed++;
    }
  }
  expect(dashed, 'nobody was left unconfirmed — the fixture no longer tests the asymmetry')
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
  const onTotal = (await readRanking(page))[0]!.total;
  await page.getByLabel('Province').selectOption('AB');
  await expect.poll(async () => (await readRanking(page))[0]!.total).toBeLessThan(onTotal);
  const ab = await rowCells(costRow(await openRankRow(page, 0), 'Provincial tax').first());
  expect(ab[1]).toBe('¥0');
  expect(ab[0]).toContain('no provincial tax at the border');

  // ケベックは一番高い（QST 9.975%）。
  await page.getByLabel('Province').selectOption('QC');
  await expect.poll(async () => (await readRanking(page))[0]!.total).toBeGreaterThan(onTotal);
  const qc = await rowCells(costRow(await openRankRow(page, 0), 'Provincial tax').first());
  expect(qc[0]).toContain(`${+(CA_PROVINCES.QC.rate * 100).toFixed(3)}%`);
});

test('the Canada Post handling fee is on the bill, per parcel, with its own figure', async ({ page }) => {
  await gotoCompare(page);
  await shipTo(page, 'CA');

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
