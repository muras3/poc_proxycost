/**
 * 監査専用テスト（docs/audit/rank-indeterminate-2026-09-13.md）。
 *
 * **2026-09-13 追記（PR #127 のマージで判明）**: このファイルは元々「あるべき
 * 挙動」を強制せず「今の挙動（バグ）を固定して目に見えるようにする」ためだけの
 * ものだった——監査タスク自身はランキング・UI のロジックを変えていない。
 * その後 PR #127 がここで指摘された欠陥そのもの（`isIndeterminate` が1位自身の
 * `rankHigh` を見ていない）を修正した。`main` を PR #127 のブランチに
 * マージした結果、このファイルが持ち込まれ、**このファイルが固定していた
 * 「バグ側」の挙動が、直った実装と食い違って failing になった**——CI の
 * 失敗ではなく、CI 前のローカル `npx vitest run` で検出。以下の2テストの
 * `rankIndeterminate` 期待値を `false`→`true` に直し、コメントも「直る前は
 * こうだった」という記録に書き換える。`fj.cheapest`／`recommended` など
 * `rankIndeterminate` 以外のフィールドの期待値は本 PR の影響を受けないので
 * そのまま。
 *
 * 見つけたことは大きく2つ（元の記述、直った今も歴史的事実として正しい）:
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
      // ...and PR #127 fixed the summary-level flag that softens "CHEAPEST" to "LEADS" in
      // the UI (RankBoard.tsx `diffText`) to fire here: `isIndeterminate` now also fires when
      // the LEADER's own rankHigh is null, not only when every comparable row's is. Before
      // the fix this was `false` (see docs/audit/rank-indeterminate-2026-09-13.md) — the
      // screen showed an unqualified "CHEAPEST" even though FROM JAPAN's own total could run
      // arbitrarily higher.
      expect(r.rankIndeterminate).toBe(true);
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
    + 'recommended bracket. Before PR #127, that bracket widening was the ONLY place the '
    + 'engine registered this uncertainty — the headline "CHEAPEST" word on FROM JAPAN\'s own '
    + 'row was not softened by it, because that word was driven solely by '
    + '`result.rankIndeterminate`, which disagreed with what the bracket already knew. '
    + 'PR #127 made the two signals agree.',
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
      // `computeBracket`/`rank()` are untouched by PR #127, so this stays true.
      const runnerUp = ok[1];
      expect(runnerUp).toBeDefined();
      expect(runnerUp!.recommended || runnerUp!.equivalent).toBe(true);
      // PR #127: the headline word now agrees with the bracket's own judgment — the leader's
      // own unbounded rankHigh now flips `rankIndeterminate` to true ("LEADS", not "CHEAPEST").
      expect(r.rankIndeterminate).toBe(true);
    },
  );
});
