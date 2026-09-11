import { expect, test } from '@playwright/test';

// 検索と商品ページ取得の口。**キーが無い状態が既定**なので、そこで壊れないことが要点。

test.describe('/api/search', () => {
  test('with no Brave key it answers 200 and says so, instead of failing', async ({ request }) => {
    const r = await request.get('/api/search?q=nendoroid');
    expect(r.status()).toBe(200);
    const body = await r.json();
    // キーが無いことを隠さない。UI は URL を貼る道に落ちる。
    if (!process.env['BRAVE_API_KEY']) {
      expect(body.configured).toBe(false);
      expect(body.results).toEqual([]);
      expect(String(body.reason)).toMatch(/not configured/i);
    } else {
      expect(body.configured).toBe(true);
      expect(Array.isArray(body.results)).toBe(true);
    }
  });

  test('an empty query does not throw', async ({ request }) => {
    const r = await request.get('/api/search?q=');
    expect(r.status()).toBe(200);
    expect((await r.json()).results).toEqual([]);
  });
});

test.describe('/api/product — SSRF guard', () => {
  const blocked = [
    'http://localhost/x',
    'http://127.0.0.1/x',
    'http://169.254.169.254/latest/meta-data/',
    'http://10.0.0.1/x',
    'http://192.168.1.1/x',
    'http://172.16.0.1/x',
    'http://[::ffff:127.0.0.1]/x',
    'http://[::1]/x',
    'http://100.64.0.1/x',
    'http://example.com:22/x',
    'file:///etc/passwd',
  ];

  for (const url of blocked) {
    test(`refuses ${url}`, async ({ request }) => {
      const r = await request.get(`/api/product?url=${encodeURIComponent(url)}`);
      // 200 で ok:false を返す（例外にしない）。中身は絶対に返さない。
      expect(r.status()).toBe(200);
      const body = await r.json();
      expect(body.ok).toBe(false);
      expect(body.title).toBeUndefined();
      expect(body.priceYen).toBeUndefined();
    });
  }

  test('a missing url parameter does not throw', async ({ request }) => {
    const r = await request.get('/api/product');
    expect(r.status()).toBe(200);
    expect((await r.json()).ok).toBe(false);
  });
});

test.describe('the calculator survives an unusable search', () => {
  test('typing a keyword shows the notice and keeps the page working', async ({ page }) => {
    await page.goto('/');
    const banner = page.getByRole('dialog', { name: 'Cookie consent' });
    if (await banner.count()) await banner.getByRole('button', { name: 'Reject' }).click();

    await page.getByLabel('Listing URL or keyword').fill('nendoroid miku');
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    // キーが無ければ「未設定。URL を貼れ」と出る。黙って何も起きないのは最悪。
    await expect(
      page.getByText(/not configured|No listings found|unavailable/i),
    ).toBeVisible();

    // 通知が出たあとも順位は生きている。**文言ではなく要素で見る**（P1-3 追修正:
    // 判定不能なら Summary は「is cheapest」と言い切らない。既定カート（米国）は
    // P1-4 で判定不能ではなくなったが、要素の存在だけを見るこの検査自体は
    // どちらの状態でも成り立つ）。
    await expect(page.getByTestId('summary')).toBeVisible();
  });

  test('a URL we cannot fetch tells the user, and does not add a ¥0 item', async ({ page }) => {
    await page.goto('/');
    const banner = page.getByRole('dialog', { name: 'Cookie consent' });
    if (await banner.count()) await banner.getByRole('button', { name: 'Reject' }).click();

    const before = await page.getByRole('button', { name: /^Cart \(/ }).count()
      ? await page.getByRole('button', { name: /^Cart \(/ }).innerText()
      : await page.getByRole('heading', { name: /^Cart \(/ }).innerText();

    await page.getByLabel('Listing URL or keyword').fill('http://127.0.0.1/item/1');
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    await expect(page.getByText(/public listing URL|Could not read|will not fetch/i)).toBeVisible();

    const after = await page.getByRole('button', { name: /^Cart \(/ }).count()
      ? await page.getByRole('button', { name: /^Cart \(/ }).innerText()
      : await page.getByRole('heading', { name: /^Cart \(/ }).innerText();
    expect(after, 'a failed fetch must not add an item').toBe(before);
  });

  test('pasting a search page says what to paste instead, and adds nothing', async ({ page }) => {
    await page.goto('/');
    const banner = page.getByRole('dialog', { name: 'Cookie consent' });
    if (await banner.count()) await banner.getByRole('button', { name: 'Reject' }).click();

    const cart = async () => (await page.getByRole('button', { name: /^Cart \(/ }).count()
      ? page.getByRole('button', { name: /^Cart \(/ }).innerText()
      : page.getByRole('heading', { name: /^Cart \(/ }).innerText());
    const before = await cart();

    // Brave が返してくる形そのまま。実測ではヤフオクの候補 192 件中 189 件がこれだった
    // （docs/audit/search-reality.md）。取りに行っても値段は書かれていない。
    await page.getByLabel('Listing URL or keyword')
      .fill('https://auctions.yahoo.co.jp/closedsearch/closedsearch/nendoroid');
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    await expect(page.getByText(/not one listing/i)).toBeVisible();
    expect(await cart(), 'a search page must not become a cart row').toBe(before);
  });
});
