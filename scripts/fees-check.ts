/**
 * 各社の公式料金ページと日本郵便の EMS 料金表に差分が出たら issue を立てる。
 *
 * **数字は自動更新しない。**料金は一次情報の転記であって、推論させてよい対象では
 * ない。ここがやるのは「変わったぞ」と知らせるところまで。直すのは人間。
 *
 * data/fee-pages.json に前回のハッシュを持つ。差分が出たら
 * GITHUB_TOKEN があれば issue を立て、無ければ標準出力に出して非ゼロで終わる。
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

import { SERVICES } from '../src/lib/pricing/services';
import { EMS_SOURCE_URL } from '../src/lib/pricing/ems';
import { COUNTRIES } from '../src/lib/pricing/countries';
import { RATES, RATES_AS_OF, RATES_SOURCE_URL } from '../src/lib/pricing/rates';
import { fetchEcbDaily, yenPer, ECB_DAILY_URL } from './lib/ecb';

const STORE = 'data/fee-pages.json';
const UA = 'proxycost-fee-watch/0.1 (+https://github.com/muras3/poc_proxycost)';

interface Snapshot { url: string; hash: string; checkedOn: string; note: string }

/**
 * 為替がこれ以上ずれていたら報せる。
 * 2% は ¥20,000 の総額で ¥400 にあたり、実測の籠で1位と2位を分けている ¥50 より
 * 大きい。つまりこの幅を超えると、順位の説明が為替の陳腐化で崩れうる。
 */
const FX_DRIFT_PCT = 2;

/**
 * 出典が更新されてからこの日数を超えて転記していなければ報せる。
 * 相場が静かでも「読んだのはいつか」を年単位で放置しないため。
 */
const FX_STALE_DAYS = 14;

const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

/**
 * 為替の出典を見る。**ハッシュでは見ない。**参照レートは毎日変わるので、
 * ハッシュ差分は毎週必ず出て、出た瞬間に意味を失う。見るべきは
 * 「rates.ts の値と出典の値がどれだけ離れたか」と「いつの値を転記したままか」。
 * ここも数字は自動更新しない。直すのは人間（npm run fx:fetch で転記する値が出る）。
 */
async function checkFx(today: string): Promise<{ changed: string[]; unreachable: string[] }> {
  const changed: string[] = [];
  const unreachable: string[] = [];
  if (RATES_SOURCE_URL !== ECB_DAILY_URL) {
    changed.push(`- **為替の出典 URL が食い違っている**: rates.ts=${RATES_SOURCE_URL} / ecb.ts=${ECB_DAILY_URL}`);
    return { changed, unreachable };
  }
  const daily = await fetchEcbDaily();
  if (!daily) {
    unreachable.push(`- 為替の出典（ECB 日次参照レート）— 取得できず: ${ECB_DAILY_URL}`);
    return { changed, unreachable };
  }
  for (const [ccy, held] of Object.entries(RATES)) {
    const live = yenPer(daily.perEur, ccy);
    if (live == null) {
      // **消えた通貨を推測で埋めない。**据え置いて、消えたことだけを報せる。
      unreachable.push(`- 為替 ${ccy} が出典に無くなっている（rates.ts は ¥${held} のまま据え置き）: ${ECB_DAILY_URL}`);
      continue;
    }
    const drift = ((live - held) / held) * 100;
    if (Math.abs(drift) >= FX_DRIFT_PCT) {
      changed.push(
        `- **為替 ${ccy}** が ${drift >= 0 ? '+' : ''}${drift.toFixed(1)}% ずれた`
        + `（rates.ts ¥${held} → 出典 ¥${live.toFixed(2)} / 参照日 ${daily.refDate}）: ${ECB_DAILY_URL}`,
      );
    }
  }
  const age = daysBetween(RATES_AS_OF, daily.refDate);
  if (age > FX_STALE_DAYS) {
    changed.push(
      `- **為替の転記が ${age} 日古い**（rates.ts は ${RATES_AS_OF} の参照レート、`
      + `出典は ${daily.refDate} を公表）: ${ECB_DAILY_URL}`,
    );
  }
  if (!changed.length && !unreachable.length) {
    console.log(`為替は出典の ${daily.refDate} 値と ${FX_DRIFT_PCT}% 以内（転記は ${RATES_AS_OF}、${today} 確認）`);
  }
  return { changed, unreachable };
}

/** 見た目だけの差分でうるさくならないよう、本文のテキストだけを見る。 */
function digest(html: string): string {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, {
      headers: { 'user-agent': UA, accept: 'text/html,text/plain' },
      signal: AbortSignal.timeout(15000),
    });
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  }
}

function targets(): { url: string; note: string }[] {
  const out: { url: string; note: string }[] = [];
  for (const s of SERVICES) {
    if (s.sourceUrl) out.push({ url: s.sourceUrl, note: `${s.name} の料金ページ` });
  }
  out.push({ url: EMS_SOURCE_URL, note: '日本郵便 EMS 料金表' });
  for (const [cc, c] of Object.entries(COUNTRIES)) {
    if (c.sourceUrl) out.push({ url: c.sourceUrl, note: `${cc} の税・免税限度` });
  }
  return out;
}

async function openIssue(body: string): Promise<boolean> {
  const token = process.env['GITHUB_TOKEN'];
  const repo = process.env['GH_REPO'];
  if (!token || !repo) return false;
  const r = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      title: `料金ページに差分: ${new Date().toISOString().slice(0, 10)}`,
      body,
      labels: ['fees'],
    }),
  });
  return r.ok;
}

const previous: Record<string, Snapshot> = existsSync(STORE)
  ? (JSON.parse(readFileSync(STORE, 'utf8')) as Record<string, Snapshot>)
  : {};

const today = new Date().toISOString().slice(0, 10);
const next: Record<string, Snapshot> = {};
const changed: string[] = [];
const unreachable: string[] = [];

for (const t of targets()) {
  const html = await fetchText(t.url);
  if (html == null) {
    unreachable.push(`- ${t.note} — 取得できず: ${t.url}`);
    // 取れなかっただけで前回の記録を消さない。次回また試す。
    const prev = previous[t.url];
    if (prev) next[t.url] = prev;
    continue;
  }
  const hash = digest(html);
  const prev = previous[t.url];
  if (prev && prev.hash !== hash) {
    changed.push(`- **${t.note}** が変わった（${prev.checkedOn} → ${today}）: ${t.url}`);
  }
  next[t.url] = { url: t.url, hash, checkedOn: today, note: t.note };
}

// 為替は本文のハッシュではなく値のずれで見る（checkFx のコメント）。
const fx = await checkFx(today);
changed.push(...fx.changed);
unreachable.push(...fx.unreachable);

writeFileSync(STORE, `${JSON.stringify(next, null, 2)}\n`);

if (!changed.length && !unreachable.length) {
  console.log(`差分なし（${Object.keys(next).length} ページ / ${today}）`);
  process.exit(0);
}

const body = [
  changed.length ? `## 差分が出たページ\n\n${changed.join('\n')}` : '',
  unreachable.length ? `## 取得できなかったページ\n\n${unreachable.join('\n')}` : '',
  '\n**数字は自動更新していない。**原文を読んで、変わっていれば',
  '`src/lib/pricing/services.ts` / `ems.ts` / `countries.ts` を手で直し、',
  '確認日を更新すること。為替なら `npm run fx:fetch` が出典の値を出すので、',
  'それを `src/lib/pricing/rates.ts` に転記し、参照日と取得日の両方を更新すること。',
].filter(Boolean).join('\n\n');

console.log(body);
if (changed.length) {
  const filed = await openIssue(body);
  console.log(filed ? 'issue を立てた' : 'GITHUB_TOKEN / GH_REPO が無いので issue は立てていない');
}
