/**
 * 監査専用テスト（docs/audit/rank-indeterminate-2026-09-13.md）。
 *
 * ここに置くのは「あるべき挙動」を強制する変更ではなく、**今の挙動を固定して
 * 目に見えるようにする**テストだけ——このファイルはランキング・UI のロジックを
 * 一切変えていない（監査タスクの制約どおり）。
 *
 * 見つけたことは大きく2つ:
 *
 * 1. `rankIndeterminate` が真になる条件（`isIndeterminate`、compare.ts）は
 *    「比較可能な全社の `rankHigh` が `null`」という、実務上ほぼ到達しない
 *    グローバル条件でしかない。**「今の1位（下端最小）自身の `rankHigh` が
 *    `null`」という、はるかにありふれた条件では真にならない。** そのため、
 *    社固有の未知（FROM JAPAN の外注梱包費など）が理由で自分の総額の真の値が
 *    青天井になりうる社が、たまたま下端最小（同着含む）になった瞬間、画面は
 *    修飾なしの緑太字「CHEAPEST」を出す——`rankIndeterminate` は false のまま。
 *    下のテストがこれを実際の `compare()` 呼び出しで再現する（CA・EMS・300g）。
 *
 * 2. `isIndeterminate` の正の側（真になる側）を検査する既存テストが**1件も
 *    無かった**（`compare.test.ts` の `rankIndeterminate` への言及は全て
 *    `toBe(false)`）。ミューテーションテストで確認済み: `isIndeterminate` の
 *    本体を `return false;` に置き換えても、`npx vitest run
 *    src/lib/pricing/compare.test.ts` は 164 件全て green のまま
 *    （このファイルはそのミューテーションもコードに含めていない——手順のみ
 *    監査レポートに記録した）。PR #93 が見つけた「検査が検査になっていない」
 *    パターンと同じ形。
 */
import { describe, expect, test } from 'vitest';
import { compare } from './compare';
import type { Item } from './types';

const singleItem = (weightG: number): Item[] => [{
  id: 'a', title: 'a', priceYen: 3000, priceTier: 'fixed', site: 'yahoo-auctions',
  weightG, weightTier: 'estimate', qty: 1,
}];

describe('rank-indeterminate audit (2026-09-13) — pins current behaviour, does not change it', () => {
  test(
    'US / default method ("cheapest") / 600g / ¥3,000: FROM JAPAN comes out as the outright '
    + 'cheapest row while its own rankHigh is null (outsourced-packing is an unbounded, '
    + 'company-specific unknown) — the engine still reports rankIndeterminate: false and '
    + 'marks the row "cheapest". This is not a constructed corner case: `method: \'cheapest\'` '
    + 'is `DEFAULT_METHOD`, i.e. what the calculator actually uses out of the box, and a sweep '
    + 'over weight/price/country/item-count finds this pattern in well over ten thousand '
    + 'combinations (see the audit report for the sweep).',
    () => {
      const r = compare({ method: 'cheapest', items: singleItem(600), country: 'US' });
      const fj = r.rows.find((x) => x.id === 'fromjapan');
      expect(fj).toBeDefined();
      // FROM JAPAN's own upper bound is unbounded (company-specific — not scope: 'shared').
      expect(fj!.rankHigh).toBeNull();
      // Yet it is tied for the lowest total.low, so the ranking marks it cheapest...
      expect(fj!.cheapest).toBe(true);
      // ...and the summary-level flag that would soften "CHEAPEST" to "LEADS" in the UI
      // (RankBoard.tsx `diffText`) stays false, because `isIndeterminate` only fires when
      // EVERY comparable row's rankHigh is null, not when the leader's own is.
      expect(r.rankIndeterminate).toBe(false);
      // The outsourced-packing line is the source of the unbounded rankHigh.
      const packing = fj!.lines.find((l) => l.key === 'outsourced-packing');
      expect(packing).toBeDefined();
      expect(packing!.amount).toBeNull();
      expect(packing!.scope).not.toBe('shared');
    },
  );

  test(
    'the same US case: because the sole leader (FROM JAPAN) is itself unbounded, '
    + 'computeBracket correctly falls back to "let everyone whose low is reachable in" '
    + '(P1-4\'s documented Infinity fallback) — so the runner-up also lands in the '
    + 'recommended bracket. That bracket widening is the one place today\'s code registers '
    + 'this specific uncertainty; the headline "CHEAPEST" word on FROM JAPAN\'s own row is '
    + 'not softened by it, because that word is driven solely by `result.rankIndeterminate` '
    + '(see the test above) — the two signals disagree.',
    () => {
      const r = compare({ method: 'cheapest', items: singleItem(600), country: 'US' });
      const ok = r.rows.filter((x) => x.comparable).sort((a, b) => a.total.low - b.total.low);
      const fj = ok[0]!;
      expect(fj.id).toBe('fromjapan');
      expect(fj.rankHigh).toBeNull();
      expect(fj.cheapest).toBe(true);
      expect(fj.recommended).toBe(true);
      // The runner-up is pulled into the bracket too, precisely because FROM JAPAN's own
      // upper bound cannot be used to exclude it (bound stays null → Infinity fallback).
      const runnerUp = ok[1];
      expect(runnerUp).toBeDefined();
      expect(runnerUp!.recommended || runnerUp!.equivalent).toBe(true);
      // But nothing downgrades FROM JAPAN's own "CHEAPEST" word — that is driven solely by
      // `result.rankIndeterminate`, which this scenario leaves false (see test above).
      expect(r.rankIndeterminate).toBe(false);
    },
  );
});
