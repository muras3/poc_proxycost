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

const STORE = 'data/fee-pages.json';
const UA = 'proxycost-fee-watch/0.1 (+https://github.com/muras3/poc_proxycost)';

interface Snapshot { url: string; hash: string; checkedOn: string; note: string }

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
  '確認日を更新すること。',
].filter(Boolean).join('\n\n');

console.log(body);
if (changed.length) {
  const filed = await openIssue(body);
  console.log(filed ? 'issue を立てた' : 'GITHUB_TOKEN / GH_REPO が無いので issue は立てていない');
}
