/**
 * 各社の「出品を直接開く」URL が本当にその出品に着くかを確かめる。
 *
 *   npm run deeplinks:check -- <実在する出品ID> [<もう1つ>]
 *   例: npm run deeplinks:check -- s1243168909 b1243418061
 *
 * **200 が返るだけでは証拠にならない。** 何を渡しても 200 を返すサイトと
 * 区別できないので、架空のIDで 404 になることも併せて見る。両方を満たした
 * ものだけ src/lib/pricing/deeplink.ts の verified を true にしてよい。
 *
 * 2026-09-06 時点で確認できたのは fromjapan / buyee / jauce。ZenMarket は Cloudflare の
 * managed challenge が実在IDにも架空IDにも同じ 403 を返すので**2条件のどちらも見えない**。
 * Neokyo は出品ページの形自体が分からない（deeplink.ts のコメント）。
 * **普通のネットワークから実行すれば確認できる可能性がある。**
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DEEP_LINKS } from '../src/lib/pricing/deeplink';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';
const FAKE = 'z9999999999';

const realIds = process.argv.slice(2).filter((a) => /^[a-z]?\d{9,12}$/i.test(a));
if (!realIds.length) {
  console.error('実在する出品IDを渡すこと（例: npm run deeplinks:check -- s1243168909）');
  console.error('ヤフオクの出品URL末尾の英数字。期限切れのIDでは判定できない。');
  process.exit(2);
}

// cookie を跨いで持つ。ブラウザと同じで、一度通した bot ゲートを何度も通らないため。
const work = mkdtempSync(join(tmpdir(), 'deeplinks-'));
const JAR = join(work, 'cookies.txt');
const BODY = join(work, 'body.html');
process.on('exit', () => rmSync(work, { recursive: true, force: true }));

/**
 * **fetch ではなく curl で叩く。** Jauce の WAF は node/undici の TLS 指紋を
 * 「server is busy. gcp.」（503）で弾く。実在IDも架空IDも同じ 503 になるので、
 * fetch のままでは 2条件のどちらも見えない。curl は同じ回線・同じ UA で 302 を返す。
 * **判定を甘くするのではなく、判定できる状態まで持っていくための入れ替え。**
 */
function curl(url: string, form?: Record<string, string>) {
  const args = [
    '-sS', '-L', '--max-time', '30', '-A', UA,
    '-H', 'Accept: text/html,application/xhtml+xml',
    '-H', 'Accept-Language: en-US,en;q=0.9',
    '-c', JAR, '-b', JAR, '-o', BODY, '-w', '%{http_code} %{url_effective}',
  ];
  if (form) {
    args.push('-H', `Referer: ${url}`);
    for (const [k, v] of Object.entries(form)) args.push('--data-urlencode', `${k}=${v}`);
  }
  args.push(url);
  const meta = execFileSync('curl', args, { encoding: 'utf8' }).trim().split(' ');
  return {
    status: Number(meta[0]),
    url: meta[1] ?? url,
    body: readFileSync(BODY, 'utf8'),
  };
}

/**
 * Jauce は cookie を持たない要求を `/except_bot_access.php?target=…` に 302 で流す。
 * 中身は OK を1回押すだけの素の POST フォームで、JS チャレンジではない。
 * **利用者がボタンを押したのと同じ1回の POST を出すだけ**で、判定の中身は変えない。
 * ここを通さないと、この社だけ全IDが同じ応答に見えて 2条件を確かめられない。
 */
function passBotGate(r: ReturnType<typeof curl>) {
  if (!/except_bot_access\.php/.test(r.url)) return null;
  const target = r.body.match(/name="target"\s+value="([^"]+)"/)?.[1];
  if (!target) return null;
  return curl(r.url, { type: 'submit', target, submit_button: 'OK' });
}

/** node の fetch で1回。undici の TLS 指紋を通す社はこちらでしか読めない。 */
async function viaFetch(url: string) {
  const r = await fetch(url, {
    headers: { 'user-agent': UA, accept: 'text/html' },
    redirect: 'follow',
    signal: AbortSignal.timeout(30000),
  });
  return { status: r.status, url: r.url, body: await r.text() };
}

/**
 * **同じ URL を2つの経路で叩く。** 各社の bot 対策が見ているものが違うため:
 *   - Jauce の WAF は node/undici の TLS 指紋を 503「server is busy. gcp.」で弾く。curl は通る。
 *   - Buyee の AWS WAF は curl を 202 の JS チャレンジに送る。undici は通る。
 * 片方だけでは、その社が「何を返しても同じ」に見えて 2条件のどちらも確かめられない。
 * **判定の条件は一切変えていない。**変えたのは、判定できる応答まで届く手段の数だけ。
 */
/**
 * **bot の壁は 200 でも返ってくる。**「200 だから中身を見た」と扱うと、
 * Jauce のゲート（894 バイトの `check bost`）を出品ページと取り違える。
 * 壁と分かっているものはここで全部落とす。
 */
function isWall(r: { url: string; body: string }) {
  return /except_bot_access\.php/.test(r.url)
    || /<title[^>]*>\s*(check bost|Just a moment)/i.test(r.body)
    || /awsWafCookieDomainList/.test(r.body);
}

async function get(url: string) {
  const decisive = (r: { status: number; url: string; body: string }) =>
    (r.status === 200 || r.status === 404 || r.status === 410) && !isWall(r);
  let last: { status: number; url: string; body: string } | null = null;
  let err = '';

  try {
    last = await viaFetch(url);
    if (decisive(last)) return summarize(last);
  } catch (e) {
    err = (e as Error).message;
  }

  try {
    const first = curl(url);
    const r = passBotGate(first) ?? first;
    if (decisive(r) || !last) last = r;
  } catch (e) {
    err ||= (e as Error).message;
  }

  if (!last) return { status: 0, size: 0, title: `ERR ${err}`, url };
  return summarize(last);
}

function summarize(r: { status: number; url: string; body: string }) {
  const title = r.body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? '';
  return { status: r.status, size: r.body.length, title, url: r.url };
}

let anyChange = false;

for (const [serviceId, bySite] of Object.entries(DEEP_LINKS)) {
  for (const [site, link] of Object.entries(bySite)) {
    if (!link) continue;
    console.log(`\n=== ${serviceId} / ${site} ===`);
    console.log(`  ${link.pattern}  (現在 verified=${link.verified})`);

    // 相手のレート制限に自分でぶつからないよう間を空ける。詰めて叩くと 403 が返り、
    // **その 403 を「検証できない」と読んでしまう**（判定を壊すのはこちらの都合）。
    const wait = () => new Promise((res) => setTimeout(res, 5000));

    const reals = [];
    for (const id of realIds) {
      reals.push(await get(link.pattern.replace('{id}', id)));
      await wait();
    }
    const fake = await get(link.pattern.replace('{id}', FAKE));
    await wait();

    for (const [i, r] of reals.entries()) {
      console.log(`  実在 ${realIds[i]}: http=${r.status} size=${r.size} title="${r.title.slice(0, 60)}"`);
    }
    console.log(`  架空 ${FAKE}: http=${fake.status} size=${fake.size}`);

    const allRealOk = reals.every((r) => r.status === 200 && r.size > 5000);
    const fakeRejected = fake.status === 404 || fake.status === 410;
    // タイトルが実在IDごとに違う＝そのページが出品ごとの内容を出している
    const titlesDiffer = reals.length < 2 || new Set(reals.map((r) => r.title)).size > 1;

    const verdict = allRealOk && fakeRejected && titlesDiffer;
    console.log(`  → ${verdict ? '検証できた。verified: true にしてよい'
      : '検証できない。' + [
        allRealOk ? '' : '実在IDで 200 が返らない',
        fakeRejected ? '' : `架空IDが ${fake.status} を返す（何でも通っている可能性）`,
        titlesDiffer ? '' : '出品が違ってもタイトルが同じ（内容が出品ごとでない）',
      ].filter(Boolean).join(' / ')}`);

    if (verdict !== link.verified) {
      anyChange = true;
      console.log(`  ★ deeplink.ts の ${serviceId}/${site} を verified: ${verdict} に変えること`);
    }
  }
}

console.log(anyChange
  ? '\n判定が変わった組み合わせがある。deeplink.ts を手で更新し、確認日と根拠を書き直すこと。'
  : '\n判定に変化なし。');
