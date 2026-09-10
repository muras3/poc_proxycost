// 本番の /api/search を叩いて実在のタイトルを集める。**ラベルは付けない。**
//
//   npx tsx scripts/corpus/harvest.ts [--group <id>] [--limit <n>]
//
// 出力は scripts/corpus/harvest.json（生の収穫。クエリと一緒に残す）。
// ここでラベルを付けないのは、集める側が「当たってほしい行」を知っていると、
// 母数そのものが辞書に都合よく歪むため。ラベルは別の手順で人が付ける。

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const API = 'https://proxycost.3amoncall.workers.dev/api/search';

interface QueryPlan {
  groups: { id: string; why: string; queries: string[] }[];
}
export interface Harvested {
  group: string;
  query: string;
  site: string;
  url: string;
  title: string;
}

const plan = JSON.parse(readFileSync(join(HERE, 'queries.json'), 'utf8')) as QueryPlan;

const argv = process.argv.slice(2);
const onlyGroup = argv.includes('--group') ? argv[argv.indexOf('--group') + 1] : null;
const limit = argv.includes('--limit') ? Number(argv[argv.indexOf('--limit') + 1]) : Infinity;

const OUT = join(HERE, 'harvest.json');
let existing: { fetchedOn: string; queriesRun: number; rows: Harvested[] };
try {
  existing = JSON.parse(readFileSync(OUT, 'utf8')) as typeof existing;
} catch {
  existing = { fetchedOn: '', queriesRun: 0, rows: [] };
}
// URL で重複を落とす。同じ商品が別のクエリで出ても母数は1件。
const byUrl = new Map(existing.rows.map((r) => [r.url, r]));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function run(group: string, query: string): Promise<number> {
  // **キャッシュバスターを必ず付ける。**付けないと前の収穫を見て誤った結論を出す。
  const cb = `${Math.floor(Math.random() * 1e9)}${Date.now()}`;
  const url = `${API}?q=${encodeURIComponent(query)}&_cb=${cb}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (!r.ok) { await sleep(2000 * (attempt + 1)); continue; }
      const body = await r.json() as { results?: { title: string; url: string; site: string }[]; reason?: string };
      if (!body.results) { await sleep(2000 * (attempt + 1)); continue; }
      let added = 0;
      for (const res of body.results) {
        if (byUrl.has(res.url)) continue;
        byUrl.set(res.url, { group, query, site: res.site, url: res.url, title: res.title });
        added++;
      }
      return added;
    } catch {
      await sleep(2000 * (attempt + 1));
    }
  }
  console.error(`  ! ${query} — no results after 3 attempts`);
  return 0;
}

let ran = 0;
for (const g of plan.groups) {
  if (onlyGroup && g.id !== onlyGroup) continue;
  for (const q of g.queries) {
    if (ran >= limit) break;
    const added = await run(g.id, q);
    ran++;
    console.log(`${String(ran).padStart(3)} [${g.id}] ${q} → +${added} (total ${byUrl.size})`);
    await sleep(1100); // Brave は 1 req/s の枠。詰めて投げると 429 で穴が開く。
  }
}

const rows = [...byUrl.values()];
writeFileSync(OUT, `${JSON.stringify({
  what: 'Raw titles the production /api/search returned. Unlabelled on purpose — see scripts/corpus/queries.json for the plan.',
  fetchedOn: new Date().toISOString().slice(0, 10),
  queriesRun: existing.queriesRun + ran,
  rows,
}, null, 2)}\n`);
console.log(`\n${rows.length} unique urls from ${existing.queriesRun + ran} queries → ${OUT}`);
