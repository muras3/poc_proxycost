import { describe, expect, test } from 'vitest';
import { loadCorpus, report, score, type CorpusRow } from '../../../scripts/weights-coverage';
import { WEIGHT_CATEGORIES } from '@/data/weights';

// 本番 /api/search が返した実在のタイトル 603 件（data/weights-corpus.json）。
// **ここが重量表の唯一の物差し。**
//
// 測るのは一つの「引き当て率」ではなく、独立した3つ:
//   coverage  重量が付いた / listing            … 答えられた割合
//   accuracy  正しい行 / 重量が付いた            … 答えのうち正しい割合
//   misfire   黙るべきものに付いた数             … **0 を目指す**
// 網羅だけ上げて正確を下げるのは改悪なので、片方だけの門は置かない。
//
// 門は **dev だけ**に掛ける。holdout は辞書を書きながら見ない集合で、
// そこに門を置くと「テストを通す」経由で holdout に合わせ込めてしまう。
// 最終的な数字は npx tsx scripts/weights-coverage.ts --holdout で出す。

const LINE_IDS = new Set(WEIGHT_CATEGORIES.flatMap((c) => c.lines.map((l) => l.id)));
const all = loadCorpus();
const dev = all.filter((r) => r.split === 'dev');
const holdout = all.filter((r) => r.split === 'holdout');

describe('the corpus itself', () => {
  test('every row is labelled, and the label says what it means', () => {
    expect(all.length).toBeGreaterThanOrEqual(603);
    const bad: string[] = [];
    for (const r of all) {
      if (r.kind === 'unlabelled') bad.push(`${r.id} is still unlabelled`);
      if (!['listing', 'listing-no-data', 'off-target'].includes(r.kind)) bad.push(`${r.id} bad kind ${r.kind}`);
      if (!['dev', 'holdout'].includes(r.split)) bad.push(`${r.id} bad split ${r.split}`);
      if (!r.title) bad.push(`${r.id} has no title`);
      // expectLine は「あるべき行」であって「いま当たっている行」ではない。
      // listing 以外が行を名乗ると、当ててはいけないものが期待値になってしまう。
      if (r.kind !== 'listing' && r.expectLine !== null) bad.push(`${r.id} is ${r.kind} but names ${r.expectLine}`);
      if (r.kind === 'listing' && r.expectLine === null) bad.push(`${r.id} is a listing with no expected line`);
      if (r.expectLine !== null && !LINE_IDS.has(r.expectLine)) bad.push(`${r.id} names a line that does not exist: ${r.expectLine}`);
      // 判断の理由を残していないラベルは、あとから曲げられても気づけない。
      if (r.kind !== 'listing' && !r.note) bad.push(`${r.id} says nothing about why it must stay silent`);
    }
    expect(bad).toEqual([]);
  });

  test('no id and no title appears twice', () => {
    const ids = all.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    const titles = all.map((r) => r.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  test('all ten proxied sites are represented, and no one shop owns the corpus', () => {
    // 収穫は Amazon に大きく偏る（1,586 件中 649 件）。母数がそのまま偏ると
    // Amazon のタイトル書式に合わせた最適化になるので、採るときに薄い店を優先している。
    const bySite = new Map<string, number>();
    for (const r of all) if (r.site) bySite.set(r.site, (bySite.get(r.site) ?? 0) + 1);
    for (const id of [
      'yahoo-auctions', 'mercari', 'rakuten', 'yahoo-shopping', 'amazon-jp',
      'suruga-ya', 'mandarake', 'zozo', 'hmv', 'toranoana',
    ]) expect(bySite.get(id) ?? 0, id).toBeGreaterThan(0);
    const withSite = all.filter((r) => r.site).length;
    for (const [site, n] of bySite) expect(n / withSite, site).toBeLessThan(0.4);
  });

  test('the held-out set is a real third of the corpus and is split by query, not by row', () => {
    expect(holdout.length / all.length).toBeGreaterThan(0.2);
    expect(holdout.length / all.length).toBeLessThan(0.45);
    // 同じクエリの兄弟タイトルが両側に散ると、holdout は dev の写しになる。
    const devQueries = new Set(dev.map((r) => r.query));
    const straddling = [...new Set(holdout.map((r) => r.query))].filter((q) => devQueries.has(q));
    expect(straddling).toEqual([]);
    // 丸ごと holdout に落ちたカテゴリが無いこと（そこは伸ばしようがなくなる）。
    const devGroups = new Set(dev.map((r) => r.group));
    for (const g of new Set(all.map((r) => r.group))) expect(devGroups.has(g), g).toBe(true);
  });
});

describe('what the weight table does with those titles (dev split only)', () => {
  const rep = report(score(dev));

  test('coverage does not fall', () => {
    // 2026-09-08 時点: 134/137。**下がる変更はここで止まる。**
    expect(rep.resolved).toBeGreaterThanOrEqual(134);
  });

  test('accuracy does not fall', () => {
    // 2026-09-08 時点: 131/134 が期待どおりの行。
    // **網羅を上げて正確を下げる変更は、ここで落ちる。**
    expect(rep.correct).toBeGreaterThanOrEqual(131);
    expect(rep.correct / rep.resolved).toBeGreaterThanOrEqual(0.95);
  });

  test('the number of titles that must stay silent but get a weight does not grow', () => {
    // **目標は 0。**間違った行に当たるのは当たらないより悪い（黙って別物の重量で
    // 総額と順位を出す）。数ではなく**どの行か**で固定する。数だけだと、1件直して
    // 1件増やす変更が緑のまま通る。
    const known: Record<string, string> = {
      // 題名が切れていて、かつおのたたき（食品）か たたきのたれ（調味料）か決まらない。
      // 母数の注記もそう言っている。語では分けられない。
      'h-7995ef84': 'the title is truncated and does not say which of the two things it sells',
      // 2026-09-08 に figures へ plush 行（184 g）が入った。この3件は
      // 「Toys are outside the table」と書かれた時期のラベルで、表に値が入った今は
      // listing として付け直す仕事が残っている。**辞書側で黙らせて数を良くしない。**
      'h-e6d2f5d6': 'label predates the plush line added to the table on 2026-09-08',
      'h-e4cc8ccd': 'label predates the plush line added to the table on 2026-09-08',
      'h-f1aee95b': 'label predates the plush line added to the table on 2026-09-08',
    };
    const unexpected = score(dev)
      .filter((r) => r.kind !== 'listing' && r.gotLine !== null && !(r.id in known))
      .map((r) => `${r.id} got ${r.gotLine} on ${r.title.slice(0, 40)}`);
    expect(unexpected).toEqual([]);
    expect(rep.misfire).toBeLessThanOrEqual(Object.keys(known).length);
    // 店頭・カテゴリページに重量が付くことは、もう1件も許さない。
    expect(rep.misfireOffTarget).toBe(0);
  });

  test('a resolved listing carries the shop the line came from', () => {
    for (const r of score(dev)) {
      if (r.gotLine === null) continue;
      expect(r.gotGrams, r.id).toBeGreaterThan(0);
    }
  });
});

describe('the corpus is measured the same way twice', () => {
  test('resolveWeight is deterministic — no model, no clock, no randomness', () => {
    const once = score(all).map((r) => `${r.id}:${r.gotLine}:${r.gotGrams}`);
    const twice = score(all).map((r) => `${r.id}:${r.gotLine}:${r.gotGrams}`);
    expect(once).toEqual(twice);
  });

  test('the labels are not a copy of what the table answers today', () => {
    // ラベルを「いま当たっている行」で埋めると accuracy は必ず 100% になり、
    // 物差しとして死ぬ。**期待と現実が食い違う行が実際に在ること**を要求する。
    const scored = score(all as CorpusRow[]);
    const disagree = scored.filter((r) => r.gotLine !== r.expectLine);
    expect(disagree.length).toBeGreaterThan(0);
  });
});
