import { expect, test, type Page } from '@playwright/test';
import { addByHand, gotoCompare, openRankRow, ranking } from './helpers';

/**
 * **`/privacy` に書いた約束を、実際にブラウザから出ていくものだけで検査する。**
 *
 * 約束は3つ:
 *   1. ファネルの1件が運ぶのは `{ "e": "<3語のどれか>" }` だけ。**他の鍵を1つも持たない。**
 *   2. 検索語・商品名・価格・押した社名は、そのリクエストのどこにも現れない。
 *   3. 外部の計測スクリプトを1つも読み込まない。
 *
 * **本文の取り方に注意（実測、2026-09-16）**: 計測は `navigator.sendBeacon` を Blob で
 * 呼ぶので、Playwright の `request.postData()` も `postDataBuffer()` も **`null` /
 * `undefined` を返す**。そこを素直に書くと本文が空に見え、「何も漏れていない」と
 * **誤って合格する**——検査が検査にならない形。したがって `sendBeacon` 自体を差し替えて
 * **アプリが渡した引数そのもの**を捕まえ、それとは別に、素の（差し替えない）ページで
 * 本物の POST が `/api/e` に届くことを見る。
 *
 * 期待値は文字列でベタ書きしない。禁止語は**このテストが実際に画面へ入力した値**から導く。
 */

const SENTINEL_TITLE = 'ZZTESTITEMZZ';
const SENTINEL_PRICE = 4242;
const EVENTS = ['entry', 'results', 'outbound'];

declare global {
  interface Window { __beacons?: { url: string; body: string }[] }
}

/** `navigator.sendBeacon` を差し替えて、渡された URL と本文を `window.__beacons` に貯める。 */
async function captureBeacons(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__beacons = [];
    const real = navigator.sendBeacon?.bind(navigator);
    navigator.sendBeacon = (url: string | URL, data?: BodyInit | null): boolean => {
      const record = (body: string) => { window.__beacons!.push({ url: String(url), body }); };
      if (data instanceof Blob) void data.text().then(record);
      else record(typeof data === 'string' ? data : '');
      // 本物にも渡す。**「送ったつもり」で終わらせない**——ネットワーク側の検査が要る。
      return real ? real(url, data as BodyInit) : true;
    };
  });
}

/** 検索・比較結果・代行業者への遷移の3段を、実際の操作で一通り踏む。 */
async function walkFunnel(page: Page): Promise<void> {
  await gotoCompare(page);
  await addByHand(page, SENTINEL_TITLE, SENTINEL_PRICE);
  await expect(ranking(page).first()).toBeVisible();
  // 遷移リンクは順位の行を開いた中（配達ログ）にある。遷移そのものは検査の対象では
  // ないので（外部サイトへ出ると以降が測れない）、行き先を潰してから押す。
  const li = await openRankRow(page, 0);
  const go = li.locator('a.go').first();
  await expect(go).toBeVisible();
  await go.evaluate((el) => { el.removeAttribute('target'); el.setAttribute('href', '#'); });
  await go.click();
}

test('the funnel beacon carries one word and nothing else', async ({ page }) => {
  await captureBeacons(page);
  await walkFunnel(page);

  await expect
    .poll(async () => (await page.evaluate(() => window.__beacons ?? [])).length, { timeout: 10_000 })
    .toBe(EVENTS.length);

  const beacons = await page.evaluate(() => window.__beacons ?? []);
  const names = beacons.map((b) => (JSON.parse(b.body) as { e: string }).e);

  // 3段すべてが出ている。出ていなければ計測が死んでいる（特に `outbound` が最重要）。
  expect([...names].sort()).toEqual([...EVENTS].sort());
  // 各段は1読み込みにつき最大1回。重複すると「結果を見た人のうち押した割合」が壊れる。
  expect(new Set(names).size, `a stage was counted twice: ${names.join(', ')}`).toBe(names.length);

  const forbidden = [SENTINEL_TITLE, String(SENTINEL_PRICE)];
  for (const b of beacons) {
    const parsed = JSON.parse(b.body) as Record<string, unknown>;
    // 約束1: 鍵は `e` ただ1つ。**新しい鍵を足したらここで落ちる。**
    expect(Object.keys(parsed), `beacon carried more than the event name: ${b.body}`).toEqual(['e']);
    expect(EVENTS).toContain(parsed.e);
    // 約束2: 入力した値も、押した社名も、どこにも入っていない（URL のクエリも見る）。
    const whole = `${b.url} ${b.body}`;
    for (const bad of forbidden) expect(whole, `beacon leaked ${bad}`).not.toContain(bad);
    // 宛先は自分のサイトの1本道だけ。クエリ文字列を生やさない。
    const u = new URL(b.url, page.url());
    expect(u.search).toBe('');
    expect(u.pathname).toBe('/api/e');
  }
});

test('the beacons really reach /api/e, and no third-party script is loaded', async ({ page }) => {
  // **差し替えないページで**見る。上のテストは「アプリが何を渡したか」しか見ておらず、
  // それだけでは本当に送られたことの証明にならない。
  const hits: string[] = [];
  const thirdPartyScripts: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.pathname === '/api/e') hits.push(r.method());
    if (r.resourceType() === 'script' && u.host !== new URL(page.url() || u.origin).host) {
      thirdPartyScripts.push(r.url());
    }
  });

  await walkFunnel(page);

  await expect.poll(() => hits.length, { timeout: 10_000 }).toBe(EVENTS.length);
  expect(hits.every((m) => m === 'POST')).toBe(true);
  // 同意を拒否した状態（`gotoCompare` の既定）で、外部の計測スクリプトは1つも読まれない。
  expect(thirdPartyScripts, `third-party scripts loaded: ${thirdPartyScripts.join(', ')}`).toEqual([]);
});
