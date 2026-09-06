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
 * 開発環境からは Buyee / ZenMarket / Neokyo / Jauce が自動アクセスを弾くため
 * 確認できなかった。**普通のネットワークから実行すれば確認できる可能性がある。**
 */
import { DEEP_LINKS } from '../src/lib/pricing/deeplink';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';
const FAKE = 'z9999999999';

const realIds = process.argv.slice(2).filter((a) => /^[a-z]?\d{9,12}$/i.test(a));
if (!realIds.length) {
  console.error('実在する出品IDを渡すこと（例: npm run deeplinks:check -- s1243168909）');
  console.error('ヤフオクの出品URL末尾の英数字。期限切れのIDでは判定できない。');
  process.exit(2);
}

async function get(url: string) {
  try {
    const r = await fetch(url, {
      headers: { 'user-agent': UA, accept: 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(30000),
    });
    const body = await r.text();
    const title = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? '';
    return { status: r.status, size: body.length, title, url: r.url };
  } catch (e) {
    return { status: 0, size: 0, title: `ERR ${(e as Error).message}`, url };
  }
}

let anyChange = false;

for (const [serviceId, bySite] of Object.entries(DEEP_LINKS)) {
  for (const [site, link] of Object.entries(bySite)) {
    if (!link) continue;
    console.log(`\n=== ${serviceId} / ${site} ===`);
    console.log(`  ${link.pattern}  (現在 verified=${link.verified})`);

    const reals = [];
    for (const id of realIds) reals.push(await get(link.pattern.replace('{id}', id)));
    const fake = await get(link.pattern.replace('{id}', FAKE));

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
