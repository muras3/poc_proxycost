import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { resolveWeight } from './weights';

// 本番 /api/search が返した実在のタイトル37件。**ここが引き当て率の唯一の物差し。**
// data/weights-corpus.json を原本にして、当たるべきものと当たってはいけないものを両方固定する。
// 語を1つ足すと当たる先が変わるので、率だけでなく「どの行に当たったか」まで見る。

interface CorpusTitle {
  n: number;
  query: string;
  kind: 'listing' | 'off-target';
  note: string;
  title: string;
  expectLine: string | null;
}

const corpus = JSON.parse(
  readFileSync(new URL('../../../data/weights-corpus.json', import.meta.url), 'utf8'),
) as { titles: CorpusTitle[] };

const listings = corpus.titles.filter((t) => t.kind === 'listing');
const offTarget = corpus.titles.filter((t) => t.kind === 'off-target');

describe('the titles the live search actually returns', () => {
  test('the corpus is the 37 titles we measured, and every one carries an expectation', () => {
    expect(corpus.titles).toHaveLength(37);
    expect(listings).toHaveLength(20);
    expect(offTarget).toHaveLength(17);
    for (const t of corpus.titles) {
      expect(typeof t.title, `#${t.n}`).toBe('string');
      expect(t.title.length, `#${t.n}`).toBeGreaterThan(0);
      expect(['listing', 'off-target'], `#${t.n}`).toContain(t.kind);
      // 期待は必ず書く。undefined（書き忘れ）と null（当てない）を区別する。
      expect(Object.hasOwn(t, 'expectLine'), `#${t.n}`).toBe(true);
    }
  });

  test('every title resolves to the line we expect, and to no other', () => {
    const wrong: string[] = [];
    for (const t of corpus.titles) {
      const got = resolveWeight(t.title).lineId;
      if (got !== t.expectLine) wrong.push(`#${t.n} expected ${t.expectLine} got ${got} — ${t.title.slice(0, 50)}`);
    }
    expect(wrong).toEqual([]);
  });

  test('14 of the 20 real listings resolve', () => {
    // 着手前は 5/20（25%）。語彙の穴を埋めて 12、書籍・ゲーム・総称フィギュアで 16、
    // K-POP の 1,750 g を映画の DVD に当てていた2件を落として 14（70%）。
    // **この数字を下げる変更はここで止まる。**
    const hit = listings.filter((t) => resolveWeight(t.title).lineId !== null);
    expect(hit).toHaveLength(14);
  });

  test('the six listings we still cannot answer say nothing at all', () => {
    // 当てられないことと、別の物の重量を当てることは違う。ここは null のまま固定する
    // （計算機は仮置き 1,000 g を「assumed」と名乗って埋める）。
    // 5 Webカメラ / 6,8 映画のディスク / 25 コーデセット / 30,32 携帯ゲーム機。
    const unresolved = listings.filter((t) => resolveWeight(t.title).lineId === null);
    expect(unresolved.map((t) => t.n)).toEqual([5, 6, 8, 25, 30, 32]);
  });

  test('a resolved listing carries the shop the line came from', () => {
    for (const t of listings) {
      const r = resolveWeight(t.title);
      if (r.lineId === null) continue;
      expect(r.source, `#${t.n}`).toMatch(/·/);
      expect(r.source, `#${t.n}`).toMatch(/\.(com|jp|store)/);
      expect(r.grams, `#${t.n}`).toBeGreaterThan(0);
    }
  });

  test('the four off-target titles that resolve are shop and category pages', () => {
    // 店舗ページ・カテゴリページに重量が付く。**重量表からは店名と品名を区別できない。**
    // 検索側の問題なのでここでは直さないが、直ったときに見えるように固定しておく。
    const resolved = offTarget.filter((t) => resolveWeight(t.title).lineId !== null);
    expect(resolved.map((t) => t.n)).toEqual([1, 2, 11, 35]);
  });
});
