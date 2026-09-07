/**
 * 代行5社の対応サイト一覧を一次情報から取り直し、data/proxy-sites.json との差を出す。
 *
 * **一覧は自動で書き換えない**（`--write` を付けたときだけ書く）。fx-fetch.ts と
 * 同じ作法で、既定は「原文はこうだった」と見せるところまで。検索対象
 * （src/lib/search/sites.ts）を変えるのは人間。
 *
 *   npm run sites:fetch            … 取得して差分と未対応づけを出す
 *   npm run sites:fetch -- --write … data/proxy-sites.json を更新する
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import {
  SOURCES, fetchSource, diffLabels, unmappedLabels, hostsOf,
  type SitesStore, type SourceRecord,
} from './lib/proxy-sites';

const STORE = 'data/proxy-sites.json';
const today = new Date().toISOString().slice(0, 10);

const prev: SitesStore | null = existsSync(STORE)
  ? (JSON.parse(readFileSync(STORE, 'utf8')) as SitesStore)
  : null;
const known = prev?.known ?? {};

const records: Record<string, SourceRecord> = {};
for (const s of SOURCES) records[s.url] = await fetchSource(s, today);

console.log(`# 代行5社の対応サイト（取得日 ${today}）`);
console.log('');
console.log('| 社 | 出典 | HTTP | 抽出 |');
console.log('|---|---|---:|---:|');
for (const s of SOURCES) {
  const r = records[s.url]!;
  console.log(`| ${r.service} | ${r.url} | ${r.status ?? '—'} | ${r.ok ? `${r.labels.length} 件` : `**${r.reason}**`} |`);
}

const changed: string[] = [];
const unmapped = new Set<string>();
for (const s of SOURCES) {
  const r = records[s.url]!;
  if (!r.ok) {
    // **取れなかったことを差分として出す。**前回の値で埋めて「変化なし」にしない。
    changed.push(`- **取れなかった**: ${r.service} ${r.url} — ${r.reason}`);
    continue;
  }
  const { added, gone } = diffLabels(prev?.sources?.[s.url], r);
  if (added.length || gone.length) {
    changed.push(
      `- ${r.service} ${r.url}`
        + (added.length ? `\n  - 増えた: ${added.join(' / ')}` : '')
        + (gone.length ? `\n  - 消えた: ${gone.join(' / ')}` : ''),
    );
  }
  for (const l of unmappedLabels(r, known)) unmapped.add(`${r.service}: ${l}`);
}

console.log('');
console.log(changed.length ? `## 前回との差分\n${changed.join('\n')}` : '## 前回との差分：無し');

// 何社が同じ host を挙げているか。**「人気」ではなく「何社が対応と書いたか」で並べる。**
const byHost = new Map<string, Set<string>>();
for (const s of SOURCES) {
  const r = records[s.url]!;
  if (!r.ok) continue;
  for (const host of hostsOf(r, known)) {
    if (!byHost.has(host)) byHost.set(host, new Set());
    byHost.get(host)!.add(r.service);
  }
}
const ranked = [...byHost.entries()]
  .map(([host, services]) => ({ host, services: [...services].sort() }))
  .sort((a, b) => b.services.length - a.services.length || (a.host < b.host ? -1 : 1));

console.log('');
console.log('## 対応社数の多い順（上位30）');
console.log('| host | 社数 | 社 |');
console.log('|---|---:|---|');
for (const r of ranked.slice(0, 30)) {
  console.log(`| ${r.host} | ${r.services.length} | ${r.services.join(', ')} |`);
}
console.log('');
console.log(`host が付いた対応サイト: ${ranked.length} 件`);

console.log('');
console.log('## 対応表（data/proxy-sites.json の known）に無い名前');
if (unmapped.size) {
  console.log('**推測で host を当てない。**一次情報を見て known に書くまでは検索対象に入れない。');
  for (const u of [...unmapped].sort()) console.log(`- ${u}`);
} else {
  console.log('無し。');
}

if (process.argv.includes('--write')) {
  const store: SitesStore = { checkedOn: today, sources: records, known };
  writeFileSync(STORE, `${JSON.stringify(store, null, 2)}\n`);
  console.log('');
  console.log(`${STORE} を書き換えた。`);
}
