// 実在のタイトルに対する重量表の**網羅**と**正確**を、別々に出す。
//
//   npx tsx scripts/weights-coverage.ts [--detail] [--by site|group|query] [--split dev|all]
//   npx tsx scripts/weights-coverage.ts --holdout        （集計だけ。行は出さない）
//   npx tsx scripts/weights-coverage.ts --json
//
// **「引き当て率」という一つの数字は使わない。**何かに当たった割合しか見ておらず、
// 正しい行に当たったかを区別しないので、間違った行を増やすだけで上がる。
// 間違った行に当たるのは当たらないより悪い（黙って別物の重量で総額と順位を出す）。
//
//   coverage : 重量が付いた / listing の総数            … 答えられた割合
//   accuracy : expectLine と一致 / 重量が付いた数        … 答えのうち正しい割合
//   net      : 正しい行に当たった / listing の総数       … 実際に役に立った割合
//   misfire  : off-target と listing-no-data に付いた数  … **0 を目指す**
//
// 既定は dev だけを見る。holdout は --holdout を明示したときだけ、しかも集計しか出さない
// （--holdout --detail で行も出るが、辞書を書きながら開けたら held-out ではなくなる）。

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WEIGHT_CATEGORIES } from '../src/data/weights';
import { resolveWeight } from '../src/lib/pricing/weights';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export type Kind = 'listing' | 'listing-no-data' | 'off-target' | 'unlabelled';
export interface CorpusRow {
  id: string; group: string; query: string;
  site: string | null; url: string | null;
  split: 'dev' | 'holdout';
  kind: Kind; expectLine: string | null; note: string; title: string;
}

export function loadCorpus(): CorpusRow[] {
  const raw = JSON.parse(readFileSync(join(ROOT, 'data', 'weights-corpus.json'), 'utf8')) as { titles: CorpusRow[] };
  return raw.titles;
}

export interface Scored extends CorpusRow {
  gotLine: string | null;
  gotGrams: number | null;
  /** 期待どおりか。listing 以外は「何も付かないこと」が期待。 */
  right: boolean;
}

export function score(rows: CorpusRow[]): Scored[] {
  return rows.map((r) => {
    const w = resolveWeight(r.title);
    return { ...r, gotLine: w.lineId, gotGrams: w.grams, right: w.lineId === r.expectLine };
  });
}

export interface Report {
  titles: number;
  listings: number;
  resolved: number;
  correct: number;
  /** 重量は付いたが行が違う。 */
  wrongLine: number;
  /** listing だが何も付かなかった。 */
  silent: number;
  /** 黙るべき行に重量が付いた。 */
  misfire: number;
  misfireOffTarget: number;
  misfireNoData: number;
  coverage: number | null;
  accuracy: number | null;
  net: number | null;
}

export function report(scored: Scored[]): Report {
  const listings = scored.filter((r) => r.kind === 'listing');
  const resolved = listings.filter((r) => r.gotLine !== null);
  const correct = resolved.filter((r) => r.right);
  const mustBeSilent = scored.filter((r) => r.kind === 'off-target' || r.kind === 'listing-no-data');
  const misfire = mustBeSilent.filter((r) => r.gotLine !== null);
  // 母数が 0 のときに 0% と書かない。分からないものは null（画面では —）。
  const pct = (a: number, b: number) => (b === 0 ? null : a / b);
  return {
    titles: scored.length,
    listings: listings.length,
    resolved: resolved.length,
    correct: correct.length,
    wrongLine: resolved.length - correct.length,
    silent: listings.length - resolved.length,
    misfire: misfire.length,
    misfireOffTarget: misfire.filter((r) => r.kind === 'off-target').length,
    misfireNoData: misfire.filter((r) => r.kind === 'listing-no-data').length,
    coverage: pct(resolved.length, listings.length),
    accuracy: pct(correct.length, resolved.length),
    net: pct(correct.length, listings.length),
  };
}

const gramsByLine = new Map<string, number>(
  WEIGHT_CATEGORIES.flatMap((c) => c.lines.map((l) => [l.id, l.medianG] as const)),
);

function main() {
  const argv = process.argv.slice(2);
  const has = (f: string) => argv.includes(f);
  const arg = (f: string) => (has(f) ? argv[argv.indexOf(f) + 1] : null);

  const all = loadCorpus();
  const unlabelled = all.filter((r) => r.kind === 'unlabelled');
  const wantSplit = has('--holdout') ? 'holdout' : arg('--split') === 'all' ? 'all' : 'dev';
  const rows = all.filter((r) => r.kind !== 'unlabelled' && (wantSplit === 'all' || r.split === wantSplit));
  const scored = score(rows);
  const rep = report(scored);

  if (has('--json')) {
    console.log(JSON.stringify({ split: wantSplit, unlabelled: unlabelled.length, ...rep }, null, 2));
    return;
  }

  const pc = (v: number | null) => (v === null ? '  — ' : `${(v * 100).toFixed(0).padStart(3)}%`);
  console.log(`\nsplit: ${wantSplit}   titles: ${rep.titles}   (listing ${rep.listings} · no-data ${
    scored.filter((r) => r.kind === 'listing-no-data').length} · off-target ${
    scored.filter((r) => r.kind === 'off-target').length})`);
  if (unlabelled.length) console.log(`** ${unlabelled.length} rows are still kind:"unlabelled" and count for nothing **`);
  console.log();
  console.log(`coverage  ${pc(rep.coverage)}   ${rep.resolved}/${rep.listings} listings carry a weight`);
  console.log(`accuracy  ${pc(rep.accuracy)}   ${rep.correct}/${rep.resolved} of those are the expected line`);
  console.log(`net       ${pc(rep.net)}   ${rep.correct}/${rep.listings} listings end up with the right line`);
  console.log(`misfire   ${String(rep.misfire).padStart(4)}    titles that must stay silent got a weight`
    + ` (${rep.misfireOffTarget} off-target, ${rep.misfireNoData} listing-no-data)`);

  const by = arg('--by');
  if (by) {
    const key = (r: Scored) => (by === 'site' ? (r.site ?? '(none)') : by === 'query' ? r.query : r.group);
    const groups = new Map<string, Scored[]>();
    for (const r of scored) groups.set(key(r), [...(groups.get(key(r)) ?? []), r]);
    console.log(`\n${by.padEnd(28)} listings  cov  acc  net  misfire`);
    for (const [k, g] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) {
      const s = report(g);
      console.log(`${k.slice(0, 28).padEnd(28)} ${String(s.listings).padStart(6)}  ${pc(s.coverage)} ${pc(s.accuracy)} ${pc(s.net)}  ${String(s.misfire).padStart(4)}`);
    }
  }

  if (has('--detail') && (wantSplit !== 'holdout' || has('--detail'))) {
    const ratio = (a: string | null, b: string | null) => {
      const x = a ? gramsByLine.get(a) : null, y = b ? gramsByLine.get(b) : null;
      return x && y ? `${(Math.max(x, y) / Math.min(x, y)).toFixed(1)}x off` : '';
    };
    const wrong = scored.filter((r) => r.kind === 'listing' && r.gotLine !== null && !r.right);
    console.log(`\n— wrong line (${wrong.length}) —`);
    for (const r of wrong) console.log(`  ${r.id} ${(r.expectLine ?? '?').padEnd(20)} got ${(r.gotLine ?? '-').padEnd(20)} ${ratio(r.expectLine, r.gotLine).padEnd(10)} ${r.title.slice(0, 60)}`);
    const mis = scored.filter((r) => r.kind !== 'listing' && r.gotLine !== null);
    console.log(`\n— misfire (${mis.length}) —`);
    for (const r of mis) console.log(`  ${r.id} ${r.kind.padEnd(16)} got ${(r.gotLine ?? '-').padEnd(20)} ${r.gotGrams} g  ${r.title.slice(0, 60)}`);
    const silent = scored.filter((r) => r.kind === 'listing' && r.gotLine === null);
    console.log(`\n— listing with no answer (${silent.length}) —`);
    for (const r of silent) console.log(`  ${r.id} want ${(r.expectLine ?? '?').padEnd(20)} ${r.title.slice(0, 70)}`);
  }
  console.log();
}

if (import.meta.url === `file://${process.argv[1]}`) main();
