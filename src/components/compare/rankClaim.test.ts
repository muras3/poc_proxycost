import { beforeAll, describe, expect, test } from 'vitest';
import { compare, computeContested } from '@/lib/pricing/compare';
import type { CompareResult, CountryCode, Item, Row } from '@/lib/pricing/types';
import {
  headlineFor, isContested, diffIsEstablished, tooCloseText, itemWeightEffectKind,
} from './rankClaim';

/**
 * **見出しが engine の答えと一致していることを検査する。**
 *
 * 期待値を画面の文字列としてベタ書きしない（CLAUDE.md §5、PR #93 が見つけた
 * 「検査が検査になっていない」型）。ここでの期待値は全て `compare()` の実際の
 * 出力（`contestedIds`）から**その場で導出**する——`headlineFor` が engine を
 * 無視して何かを返すようになれば、社名の集合が合わなくなって落ちる。
 *
 * 掃引の条件は実際の呼び出しに寄せる（`method: 'cheapest'` は UI の既定）。
 */

const one = (weightG: number, priceYen: number, fragile = false): Item[] => [{
  id: 'a', title: 'a', priceYen, priceTier: 'fixed', site: 'yahoo-auctions',
  weightG, weightTier: 'estimate', qty: 1, fragile,
} as unknown as Item];

const CCS: CountryCode[] = ['US', 'GB', 'DE', 'FR', 'AU', 'CA', 'SG'];
const GRAMS = [300, 600, 1000, 2000, 5000, 10_000, 20_000];
const PRICES = [1000, 3000, 10_000, 50_000];

interface Case { label: string; result: CompareResult }

function sweep(): Case[] {
  const out: Case[] = [];
  for (const country of CCS) {
    for (const g of GRAMS) {
      for (const p of PRICES) {
        for (const fragile of [false, true]) {
          out.push({
            label: `${country}/${g}g/¥${p}/fragile=${fragile}`,
            result: compare({ method: 'cheapest', items: one(g, p, fragile), country }),
          });
        }
      }
    }
  }
  return out;
}

/**
 * **掃引は1回だけ回して、全ての `test()` で使い回す。**
 *
 * 理由（2026-09-16、run 35040076963 / job 104617751999）: この掃引は
 * 7カ国 × 7重量 × 4価格 × fragile2通り = **392条件** で `compare()` を
 * 呼ぶ。engine の1回の呼び出しは軽いが、392回ぶんとなるとアイドルな
 * ローカルでも1条件あたりの合計が 0.8〜1.7 秒に達する。#176 はこれを
 * `sweep()` として**各 `test()` の中から呼んで**いたため、同じ392条件を
 * 5回（= 約5.4秒ぶん）回していた。最初の `test()` は加えて engine 側の
 * モジュール初期化とJITのウォームアップを丸ごと負担するので最も遅く、
 * vitest の既定 `testTimeout: 5000ms` に対する余裕が実測 1712ms ＝ 約2.9倍
 * しか無かった。CI は複数ワーカーが並列に走るぶん遅いので、#177（docs
 * のみの変更）の CI でこの最初の `test()` が 5000ms を超えて落ちた。
 *
 * `beforeAll` に移すと掃引は1回（約1.2〜1.7秒）で済み、しかも `beforeAll`
 * は `testTimeout` ではなく `hookTimeout`（既定 10000ms）で測られる。
 * 各 `test()` 側は掃引済みの配列を舐めるだけになり数ミリ秒で終わる。
 * **条件を1つも減らしていない**ので、#176 が捕まえたかった CAP による
 * 打ち切りと推移的重なりは、これまでと同じ実データで踏み続ける。
 */
let CASES: Case[] = [];
beforeAll(() => { CASES = sweep(); });

const labelsOf = (result: CompareResult, ids: string[]): string[] => {
  const by = new Map(result.rows.map((r) => [r.id, r]));
  return ids.map((id) => by.get(id)?.label ?? id);
};

describe('computeContested: the primary value the headline rests on', () => {
  test('it is cap-free and non-transitive, so it is NOT the recommended/equivalent bracket', () => {
    // **この2つが同じものなら、この PR の前提そのものが無い。**枠には
    // `BRACKET_CAP = 2` が掛かっていて重なり判定も推移的なので、実データで
    // 両者が食い違う条件が実在することを、掃引から数えて示す。
    let capBites = 0;      // 判別できない社が3社以上＝枠の2社では表せない
    let transitive = 0;    // 枠／同等に居るのに1位とは直接重ならない社が居る
    for (const { result } of CASES) {
      const comp = result.rows.filter((r) => r.comparable);
      if (comp.length < 2) continue;
      const contested = new Set(result.contestedIds);
      if (contested.size > 2) capBites += 1;
      const inBracket = comp.filter((r) => r.recommended || r.equivalent);
      if (inBracket.some((r) => !contested.has(r.id))) transitive += 1;
    }
    // どちらも実データに存在する。存在しなければこの検査自体が無意味なので落とす。
    expect(capBites, 'no condition has 3+ contested services — the CAP argument is untested').toBeGreaterThan(0);
    expect(transitive, 'no condition has a bracket member that does not overlap the leader').toBeGreaterThan(0);
  });

  test('the leader is always in it, and it is exactly the rows whose low reaches the leader group’s rankHigh', () => {
    for (const { label, result } of CASES) {
      const comp = result.rows.filter((r) => r.comparable);
      if (!comp.length) continue;
      expect(result.contestedIds, `${label}: leader missing`).toContain(comp[0]!.id);

      // 定義をここで**独立に**組み直して突き合わせる（engine の関数を呼ぶだけでは
      // 「同じ実装が同じ答えを返した」しか言えない）。
      const leadLow = comp[0]!.total.low;
      const leaders = comp.filter((r) => r.total.low === leadLow);
      const highs = leaders.map((r) => r.rankHigh).filter((h): h is number => h != null);
      const bound = highs.length ? Math.max(...highs) : Infinity;
      const expected = comp.filter((r) => r.total.low <= bound).map((r) => r.id);
      expect(result.contestedIds, label).toEqual(expected);
    }
  });

  test('computeContested never extends its bound with the rows it admits', () => {
    // 推移性が無いことの直接検査。人工の行で、1位とは重ならないが2社目とは
    // 重なる3社目を作り、それが入らないことを見る。
    const row = (id: string, low: number, rankHigh: number | null): Row => ({
      id, total: { low, high: rankHigh }, rankHigh, comparable: true,
    } as unknown as Row);
    // 1位 [100,150]、2社目 [140,300]、3社目 [200,400]。
    // 3社目は1位の150には届かないが、2社目の300には重なる。
    const ids = computeContested([row('a', 100, 150), row('b', 140, 300), row('c', 200, 400)]);
    expect(ids).toEqual(['a', 'b']);
  });
});

describe('headlineFor: the names it prints are exactly the engine’s contested set', () => {
  test('across the sweep, every headline agrees with contestedIds — and both branches occur', () => {
    let clear = 0; let tooClose = 0; let tie = 0; let indet = 0; let none = 0;
    for (const { label, result } of CASES) {
      const h = headlineFor(result);
      const comp = result.rows.filter((r) => r.comparable);
      const contestedLabels = labelsOf(result, result.contestedIds);

      if (h.kind === 'none') { none += 1; expect(comp.length, label).toBeLessThan(2); continue; }
      if (h.kind === 'indeterminate') { indet += 1; expect(result.rankIndeterminate, label).toBe(true); continue; }

      // 判定不能でない限り、見出しの種類は contestedIds の社数だけで決まる。
      if (h.kind === 'clear') {
        clear += 1;
        expect(result.contestedIds.length, `${label}: asserted a winner while others overlap`).toBe(1);
        // 断定した社は、まさにその唯一の contested な行。
        expect(h.leader.id, label).toBe(result.contestedIds[0]);
      } else if (h.kind === 'tooClose') {
        tooClose += 1;
        expect(result.contestedIds.length, label).toBeGreaterThan(1);
        // **名前の集合が engine の集合と一致する（CAP で切り捨てない）。**
        expect(h.names, label).toEqual(contestedLabels);
      } else {
        tie += 1;
        // 同額の社は全員 contested に含まれる。
        expect(new Set(contestedLabels).size, label).toBeGreaterThanOrEqual(h.names.length);
        expect(h.contested, label).toBe(result.contestedIds.length);
      }
    }
    // **どの枝も実データで通っていること。**通っていない枝の検査は検査ではない。
    expect(clear, 'no clear-winner condition in the sweep').toBeGreaterThan(0);
    expect(tooClose, 'no too-close condition in the sweep').toBeGreaterThan(0);
    expect(indet, 'no indeterminate condition in the sweep').toBeGreaterThan(0);
    expect(tie + none, 'tie/none counted').toBeGreaterThanOrEqual(0);
  });

  test('a clear winner is only ever claimed when nobody else overlaps the leader', () => {
    // 肯定側。`contestedIds` が1社の条件を実データから拾って、その条件では
    // 見出しが断定し、2位の差額が数値で出せる状態であることまで見る。
    const clears = CASES.filter(({ result }) => {
      const comp = result.rows.filter((r) => r.comparable);
      return comp.length >= 2 && !result.rankIndeterminate && result.contestedIds.length === 1;
    });
    expect(clears.length, 'the sweep found no clear winner to assert on').toBeGreaterThan(0);
    for (const { label, result } of clears) {
      const h = headlineFor(result);
      expect(h.kind, label).toBe('clear');
      if (h.kind !== 'clear') continue;
      // 2位が居れば、その差は「確かめられた差」なので数値で出してよい。
      const next = h.next;
      if (next) {
        expect(diffIsEstablished(next, result), `${label}: next row must carry a real gap`).toBe(true);
        expect(next.diff, label).toBeGreaterThan(0);
      }
    }
  });

  test('when the intervals overlap, no non-leader row is allowed to print a gap', () => {
    // 「断定できるのは区間が交わらないときだけ」という規則の、行側での言い換え。
    let checked = 0;
    for (const { label, result } of CASES) {
      for (const r of result.rows.filter((x) => x.comparable && !x.cheapest)) {
        if (isContested(r, result)) {
          expect(diffIsEstablished(r, result), `${label}/${r.id}`).toBe(false);
          checked += 1;
        }
      }
    }
    expect(checked, 'no overlapping non-leader row in the sweep').toBeGreaterThan(0);
  });
});

describe('tooCloseText: folds long lists but never hides the count', () => {
  test('3 or fewer are named in full', () => {
    expect(tooCloseText(['A', 'B'])).toBe('A and B');
    expect(tooCloseText(['A', 'B', 'C'])).toBe('A, B and C');
  });
  test('4 or more fold, and the number of hidden services is stated', () => {
    expect(tooCloseText(['A', 'B', 'C', 'D'])).toBe('A, B and 2 others');
    expect(tooCloseText(['A', 'B', 'C', 'D', 'E'])).toBe('A, B and 3 others');
  });
});

describe('itemWeightEffectKind: decisive alone does not say which way', () => {
  const w = (lo: number, hi: number) => ({
    lowG: 500, highG: 10_000, winnerAtLow: 'A', winnerAtHigh: 'B',
    onlyPricedAtLow: false, onlyPricedAtHigh: false, decisive: true,
    bracketAtLow: [], bracketAtHigh: [], contestedAtLow: lo, contestedAtHigh: hi,
  });
  test('narrowing to one company at either end settles it', () => {
    expect(itemWeightEffectKind(w(1, 3), 3)).toBe('settles');
    expect(itemWeightEffectKind(w(3, 1), 3)).toBe('settles');
  });
  test('**widening from one company is NOT "check it and it settles"**', () => {
    // {A} → {A,B}。ここを `decisive` だけで読むと「確かめれば決まる」と嘘を書く。
    expect(itemWeightEffectKind(w(1, 2), 1)).toBe('unsettles');
  });
  test('same count, different faces, is neither', () => {
    expect(itemWeightEffectKind(w(2, 2), 2)).toBe('shifts');
  });
});
