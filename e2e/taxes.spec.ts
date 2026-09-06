import { expect, test, type Page } from '@playwright/test';
import {
  costRow, gotoCompare, openRankRow, parseYen, rankButtons, readRanking, rowCells,
} from './helpers';

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
