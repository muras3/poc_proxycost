// 実在のタイトルに対する重量表の引き当て率を出す。
//
//   npx tsx scripts/weights-coverage.ts [--all] [--json]
//
// 母数は data/weights-corpus.json の kind:"listing"（本番の /api/search が返した実タイトルのうち、
// 1点の商品であるもの）。店舗ページ・カテゴリページ・別ジャンルの結果は kind:"off-target" として
// 母数から外す。**そこに重量を当てるのは検索側の問題であって、重量表の仕事ではない。**
// --all を付けると off-target も一覧に出す（当ててはいけないものが当たっていないかの目視用）。

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveWeight } from '../src/lib/pricing/weights';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

interface CorpusTitle {
  n: number;
  query: string;
  kind: 'listing' | 'off-target';
  note: string;
  title: string;
  /** 当たるべき行（当てないなら null）。weights.corpus.test.ts が固定している。 */
  expectLine: string | null;
}

const corpus = JSON.parse(
  readFileSync(join(ROOT, 'data', 'weights-corpus.json'), 'utf8'),
) as { capturedOn: string; source: string; titles: CorpusTitle[] };

const showAll = process.argv.includes('--all');
const asJson = process.argv.includes('--json');

const rows = corpus.titles.map((t) => {
  const r = resolveWeight(t.title);
  return {
    ...t, hit: r.grams != null, lineId: r.lineId, grams: r.grams, categoryId: r.categoryId,
    asExpected: r.lineId === t.expectLine,
  };
});

const listings = rows.filter((r) => r.kind === 'listing');
const hits = listings.filter((r) => r.hit);

if (asJson) {
  console.log(JSON.stringify({
    capturedOn: corpus.capturedOn,
    listings: listings.length,
    resolved: hits.length,
    offTarget: rows.length - listings.length,
    offTargetResolved: rows.filter((r) => r.kind === 'off-target' && r.hit).length,
    offExpectation: rows.filter((r) => !r.asExpected).map((r) => ({ n: r.n, expected: r.expectLine, got: r.lineId })),
    rows,
  }, null, 2));
} else {
  for (const r of showAll ? rows : listings) {
    const mark = r.hit ? `${r.grams} g` : '—';
    const kind = r.kind === 'listing' ? ' ' : '~';
    // 期待と違う行に当たったら印を出す。率だけ見ていると、当たり先が変わったのを見落とす。
    const flag = r.asExpected ? ' ' : `!  expected ${r.expectLine ?? '(none)'}`;
    console.log(
      `${kind}${String(r.n).padStart(2)} ${(r.lineId ?? '(none)').padEnd(20)} ${mark.padStart(8)} ${flag} ${r.title.slice(0, 60)}`,
    );
  }
  const offHit = rows.filter((r) => r.kind === 'off-target' && r.hit);
  console.log();
  console.log(`listings resolved: ${hits.length}/${listings.length} = ${(hits.length / listings.length * 100).toFixed(0)}%`);
  console.log(`off-target titles that still got a weight: ${offHit.length}/${rows.length - listings.length}`);
  const drift = rows.filter((r) => !r.asExpected);
  console.log(`titles resolving to a line other than the one recorded in the corpus: ${drift.length}`);
  const byQuery = new Map<string, [number, number]>();
  for (const r of listings) {
    const [h, n] = byQuery.get(r.query) ?? [0, 0];
    byQuery.set(r.query, [h + (r.hit ? 1 : 0), n + 1]);
  }
  console.log([...byQuery].map(([q, [h, n]]) => `${q} ${h}/${n}`).join('  ·  '));
}
