import { expect, test, type Page } from '@playwright/test';
import {
  RATES, RATES_AS_OF, RATES_FETCHED_ON, RATES_SOURCE_NAME, RATES_SOURCE_URL,
} from '../src/lib/pricing/rates';
import { cart, gotoCompare, openCart } from './helpers';

// 公開ページ（/weights /sources /privacy）。ここは「計算の中身を全部見せる」ための面なので、
// 数字が出ていることではなく **出典・件数・取得日・確度が添えてあること** を見る。

async function open(page: Page, path: string) {
  // 同意は localStorage にしか無いので、遷移前に入れておく。
  // バナーの出現を待ってから押す形にすると、hydration の前後で
  // 出る/消えるが入れ替わる瞬間を掴んで固まる。ここは同意の挙動を
  // 見るテストではないので、その競合ごと避ける。
  await page.addInitScript(() => {
    try { window.localStorage.setItem('proxycost.consent.v1', 'denied'); } catch { /* 使えなくてよい */ }
  });
  const res = await page.goto(path);
  expect(res?.status(), `${path} should be reachable`).toBe(200);
}

const noJapanese = async (page: Page, path: string) => {
  // 対象は海外の代行利用者。**散文は英語。**
  // ただし商品ラインの照合語（ねんどろいど / ポップアップパレード）と
  // カテゴリの和名は、日本の出品にそのまま出る名称なので残す方が役に立つ。
  // それらは 'matches …' の注記としてしか現れないので除外する。
  const texts = await page.locator('main p, main li, main td').allInnerTexts();
  const offenders = texts
    .filter((t) => !/matches\s/.test(t))
    .filter((t) => /[぀-ゟ゠-ヿ]{6,}/.test(t));
  expect(offenders, `Japanese prose leaked into ${path}: ${offenders.join(' | ')}`).toEqual([]);
};

test.describe('/weights — the weight table we publish', () => {
  test('every weight row carries a source, a count and a fetch date', async ({ page }) => {
    await open(page, '/weights');
    await expect(page.getByRole('heading', { name: /Shipping weights we use/i })).toBeVisible();

    const rows = page.locator('table tbody tr');
    const n = await rows.count();
    expect(n, 'the page must actually publish rows').toBeGreaterThan(0);

    for (let i = 0; i < n; i++) {
      const cells = await rows.nth(i).locator('td').allInnerTexts();
      const line = cells.join(' | ');
      // 出典（ドメイン）と取得日が同じ行にあること。
      expect(line, `row ${i} has no source domain: ${line}`).toMatch(/\.(com|jp|store)/);
      expect(line, `row ${i} has no fetch date: ${line}`).toMatch(/\d{4}-\d{2}-\d{2}/);
    }
  });

  test('unmeasured data says so, and n=0 is never printed as a count', async ({ page }) => {
    await open(page, '/weights');
    // Shopify の grams は送料計算用の入力値。実測と言い張らない。
    await expect(page.getByText(/not measured|shop-declared/i).first()).toBeVisible();
    // **公開する重量の標本数として** 0 を出さない。記録していない行は「—」。
    // （不採用理由の中の「grams が全件 0 だったので落とした」は 0 件という事実の
    //   記録なので別。むしろ書くべきもので、ここでは対象外にする。）
    const rows = page.locator('table tbody tr');
    for (let i = 0; i < await rows.count(); i++) {
      const cells = await rows.nth(i).locator('td').allInnerTexts();
      expect(cells.join(' | '), `row ${i} publishes a sample size of 0`).not.toMatch(/(^|\|)\s*0\s*(\||$)/);
    }
  });

  test('it names the categories it has no data for, instead of leaving them blank', async ({ page }) => {
    await open(page, '/weights');
    await expect(page.getByRole('heading', { name: /not covered/i })).toBeVisible();
    const notCovered = await page.getByRole('heading', { name: /not covered/i })
      .locator('xpath=following-sibling::*').allInnerTexts();
    expect(notCovered.join(' ')).toMatch(/instrument|camera|book/i);
  });

  test('the method note admits what the numbers are not', async ({ page }) => {
    await open(page, '/weights');
    const body = await page.locator('main').innerText();
    expect(body, 'must say grams is an input to a shipping calculator, not a measurement')
      .toMatch(/not a measurement|input to a shipping/i);
    expect(body, 'must say pseudo catalogues are thrown away').toMatch(/pseudo/i);
  });

  test('no Japanese prose on an English page', async ({ page }) => {
    await open(page, '/weights');
    await noJapanese(page, '/weights');
  });
});

test.describe('/sources — the fee, postage and tax tables', () => {
  test('it states what we stand behind and what we do not, in that order', async ({ page }) => {
    await open(page, '/sources');
    const body = await page.locator('main').innerText();
    const stand = body.search(/stand behind/i);
    const notStand = body.search(/do not stand behind/i);
    expect(stand).toBeGreaterThanOrEqual(0);
    expect(notStand).toBeGreaterThan(stand);
  });

  test('the EMS table publishes every step, with its source and date', async ({ page }) => {
    await open(page, '/sources');
    const ems = page.locator('table').filter({ hasText: /500 g|Up to/ }).first();
    await expect(ems).toBeVisible();
    // 日本郵便の公表料金は全42段・30kg まで。抜くと「段で決まる」という説明が成り立たない。
    // 27 を期待していた頃の表は 15kg で切れており、それ自体が転記漏れだった。
    const rows = await ems.locator('tbody tr').count();
    expect(rows, 'EMS table must publish all 42 steps').toBe(42);
    const body = await page.locator('main').innerText();
    expect(body).toMatch(/post\.japanpost\.jp|Japan Post/i);
    expect(body).toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  test('countries we have no number for keep their row, marked —', async ({ page }) => {
    await open(page, '/sources');
    const tax = page.locator('table').filter({ hasText: /Duty-free limit/i }).first();
    await expect(tax).toBeVisible();
    const rows = await tax.locator('tbody tr').count();
    expect(rows, 'all seven destinations must keep a row').toBe(7);
    // 空欄ではなく「—」であること。0 でもないこと。
    expect(await tax.innerText()).toContain('—');
  });

  test('it separates FROM JAPAN from FROM USA, which is a different service', async ({ page }) => {
    await open(page, '/sources');
    const body = await page.locator('main').innerText();
    expect(body).toMatch(/FROM USA/);
    expect(body).toMatch(/does not apply|not apply to/i);
  });

  test('it discloses that the ranking never looks at referrals', async ({ page }) => {
    await open(page, '/sources');
    const body = await page.locator('body').innerText();
    // /sources 本文（「decided by the total alone」）と FeeTable（「pays us nothing」）、
    // フッターの開示（「No company pays us」）の3か所。2026-09-15 以降、全社契約なし。
    expect(body).toMatch(/decided by the total alone/i);
    expect(body).toMatch(/pays us nothing/i);
    expect(body).toMatch(/No company pays us/i);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 為替の出典表示。画面は以前 "fixed rates read on <実装日>" と出していたが、
  // その日に転記した事実は無かった（docs/audit/gaps.md G3）。**日付と URL が
  // rates.ts の定数から来ていることを、実際の画面で確かめる。**
  // ─────────────────────────────────────────────────────────────────────────
  test('the exchange rates name their source, its reference date and the day we read it',
    async ({ page }) => {
      await open(page, '/sources');
      const fx = page.locator('section').filter({ hasText: /Exchange rates/ }).last();
      await expect(fx).toBeVisible();

      // 出典そのものへのリンク。踏める URL でなければ「出典」と呼べない。
      const link = fx.getByRole('link', { name: new RegExp(RATES_SOURCE_NAME, 'i') });
      await expect(link).toHaveAttribute('href', RATES_SOURCE_URL);

      // 参照日と取得日の両方。片方だけだと、どちらの日付なのか読めない。
      const text = (await fx.innerText()).replace(/\s+/g, ' ');
      expect(text, 'the source reference date must be on the page').toContain(RATES_AS_OF);
      expect(text, 'the day we read it must be on the page').toContain(RATES_FETCHED_ON);

      // 6通貨すべてが銭まで出ていること。¥190/GBP のような丸い数字は転記の顔をしていない。
      for (const [code, rate] of Object.entries(RATES)) {
        expect(text, `${code} must be shown to the sen`).toContain(`¥${rate.toFixed(2)}/${code}`);
      }

      // 「読んだ日」を出典の日付として名乗る言い回しに戻っていないこと。
      expect(text).not.toMatch(/fixed rates read on/i);
    });

  test('no Japanese prose on an English page', async ({ page }) => {
    await open(page, '/sources');
    await noJapanese(page, '/sources');
  });
});

test.describe('/privacy', () => {
  test('it exists, is dated, and does not claim things we have not built', async ({ page }) => {
    await open(page, '/privacy');
    await expect(page.getByRole('heading', { name: /privacy/i }).first()).toBeVisible();
    const body = await page.locator('main').innerText();
    expect(body).toMatch(/\d{4}-\d{2}-\d{2}/);
    // AdSense のタグはまだ入れていない。入れたと書いてあったら嘘になる。
    if (/adsense/i.test(body)) expect(body).toMatch(/not yet|plan to|when we/i);
  });

  test('no Japanese prose on an English page', async ({ page }) => {
    await open(page, '/privacy');
    await noJapanese(page, '/privacy');
  });
});

test.describe('navigation between the calculator and its evidence', () => {
  test('the footer reaches every public page from anywhere', async ({ page }) => {
    for (const from of ['/', '/weights', '/sources', '/privacy']) {
      await open(page, from);
      for (const name of [/^Weights$/i, /^Sources$/i, /^Privacy$/i]) {
        await expect(
          page.getByRole('contentinfo').getByRole('link', { name }),
          `${from} footer is missing a link`,
        ).toBeVisible();
      }
    }
  });

  test('the weight source on the calculator links to that line of the weight table', async ({ page }) => {
    // カートはモバイルで畳まれているので、hydration を待って開く（helpers の作法）。
    await gotoCompare(page);
    await openCart(page);
    const link = cart(page).getByRole('link', { name: /1\/7 scale/ }).first();
    await expect(link).toHaveAttribute('href', /\/weights#scale-1-7$/);
    await link.click();
    await expect(page).toHaveURL(/\/weights#scale-1-7$/);
    // 飛んだ先の行が実在すること。無いアンカーは無いリンクと同じ。
    await expect(page.locator('#scale-1-7')).toBeVisible();
  });
});
