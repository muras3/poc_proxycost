// 収穫（scripts/corpus/harvest.json）を母数（data/weights-corpus.json）に畳み込む。
//
//   npx tsx scripts/corpus/merge.ts [--per-query 6]
//
// **既にラベルの付いた行には触らない。**新しい行は kind:"unlabelled" で入り、
// 人が付けるまでテストが落ちる（scripts/corpus/corpus.test.ts）。
// 率を上げたいときに黙って母数を入れ替えられないように、この2つを分けている。
//
// split（dev / holdout）は**クエリ単位**で決める。行単位で無作為に割ると、同じクエリの
// 兄弟タイトル（同じ作品・同じ語）が両側に散って holdout が dev の写しになる。
// グループの中でクエリを sha1 で並べ、順位の下1桁が 0〜2 のクエリを holdout に置く
// （＝各グループのおよそ 3 割）。グループを跨いで偏らせないので、
// 「holdout に丸ごと落ちたカテゴリ」が生まれない。**一度書いた split は動かさない。**

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Harvested } from './harvest.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const CORPUS = join(ROOT, 'data', 'weights-corpus.json');

export type Kind = 'listing' | 'listing-no-data' | 'off-target' | 'unlabelled';

export interface CorpusRow {
  id: string;
  group: string;
  query: string;
  site: string | null;
  url: string | null;
  split: 'dev' | 'holdout';
  kind: Kind;
  /** 当たるべき行。listing のときだけ id、それ以外は null。 */
  expectLine: string | null;
  note: string;
  title: string;
}
export interface Corpus {
  what: string;
  kinds: Record<string, string>;
  split: Record<string, string>;
  capturedOn: string;
  source: string;
  queryPlan: string;
  titles: CorpusRow[];
}

const sha1 = (s: string) => createHash('sha1').update(s).digest('hex');

/** グループ内でクエリを sha1 順に並べ、上から 3/10 を holdout にする。 */
export function splitFor(group: string, query: string, allInGroup: string[]): 'dev' | 'holdout' {
  const ranked = [...new Set(allInGroup)].sort((a, b) => sha1(a).localeCompare(sha1(b)));
  const rank = ranked.indexOf(query);
  return rank >= 0 && rank % 10 < 3 ? 'holdout' : 'dev';
}

function main() {
  const argv = process.argv.slice(2);
  const perQuery = argv.includes('--per-query') ? Number(argv[argv.indexOf('--per-query') + 1]) : 6;

  const harvest = JSON.parse(readFileSync(join(HERE, 'harvest.json'), 'utf8')) as { rows: Harvested[] };
  const corpus = JSON.parse(readFileSync(CORPUS, 'utf8')) as Corpus;

  const known = new Set(corpus.titles.map((t) => t.url ?? `title:${t.title}`));
  const knownTitles = new Set(corpus.titles.map((t) => t.title));

  // クエリごとに sha1(url) 順で上から N 件だけ採る。**多く返ったクエリに母数を
  // 食われないため。**選び方が url のハッシュなので、店やジャンルには偏らない。
  const byQuery = new Map<string, Harvested[]>();
  for (const r of harvest.rows) {
    const list = byQuery.get(r.query) ?? [];
    list.push(r);
    byQuery.set(r.query, list);
  }
  const queriesByGroup = new Map<string, string[]>();
  for (const r of harvest.rows) {
    const list = queriesByGroup.get(r.group) ?? [];
    if (!list.includes(r.query)) list.push(r.query);
    queriesByGroup.set(r.group, list);
  }

  // 店ごとの総数。**少ない店の行を先に採る。**収穫は Amazon と Yahoo!ショッピングに
  // 大きく偏る（1,519 件中 632 件が Amazon、ZOZOTOWN は 0 件だった）ので、そのまま
  // 母数にすると Amazon のタイトル書式に合わせた最適化になる。並べ替えの鍵は店だけで、
  // 中身は sha1(url) 任せ。**「当たりそうな商品」を選り好みしない。**
  const siteCount = new Map<string, number>();
  for (const r of harvest.rows) siteCount.set(r.site, (siteCount.get(r.site) ?? 0) + 1);

  const added: CorpusRow[] = [];
  for (const [query, rows] of byQuery) {
    const picked = [...rows].sort((a, b) => {
      const d = (siteCount.get(a.site) ?? 0) - (siteCount.get(b.site) ?? 0);
      return d !== 0 ? d : sha1(a.url).localeCompare(sha1(b.url));
    }).slice(0, perQuery);
    for (const r of picked) {
      if (known.has(r.url)) continue;
      // 同じ文言のタイトルが別 URL で来ることがある（同一商品の別店・別ページ）。
      // 重量表から見れば同じ入力なので、母数には1回だけ入れる。
      if (knownTitles.has(r.title)) continue;
      known.add(r.url);
      knownTitles.add(r.title);
      added.push({
        id: `h-${sha1(r.url).slice(0, 8)}`,
        group: r.group,
        query,
        site: r.site,
        url: r.url,
        split: splitFor(r.group, query, queriesByGroup.get(r.group) ?? [query]),
        kind: 'unlabelled',
        expectLine: null,
        note: '',
        title: r.title,
      });
    }
  }

  corpus.titles = [...corpus.titles, ...added];
  writeFileSync(CORPUS, `${JSON.stringify(corpus, null, 2)}\n`);
  console.log(`+${added.length} unlabelled rows (corpus is now ${corpus.titles.length})`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop() ?? '')) main();
