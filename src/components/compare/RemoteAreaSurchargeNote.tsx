import type { CompareResult } from '@/lib/pricing/types';

/**
 * **2026-09-13、オーナー決定（その後2回の訂正を経た最終版）。**宅配便の燃油・
 * 遠隔地サーチャージの扱いを分離した（旧: `compare.ts` の `courier-destination-fees`
 * 行が2つをまとめて未公表・`amount: null` にし、`total.high` を開けて343条件中
 * 266条件を `rankIndeterminate` にしていた）。
 *
 * - **燃油サーチャージ**: 表示送料に含まれている前提として扱う。計上しない・
 *   未知にもしない（C11 の決定どおり）。**ただしこれは一次情報で確認された
 *   事実ではなく未確認の仮定**——`Row.closedByAssumption` がこれに依存する行を
 *   マークし、`RankBoard` の緑ラベルを「ESTIMATED CHEAPEST」に弱める。
 * - **遠隔地サーチャージ**: 表示送料に含めない・総額にも加算しない。
 *   その代わり**この注記を常時出す**。
 *
 * **`Line` にしなかった理由**（`compare.ts` の該当箇所のコメントと対）:
 * `amount: null` の行は `scope: 'shared'` を付けても `Row.total.high`
 * （画面表示）を閉じない——`scope` が畳むのは順位専用の内部値 `rankHigh` だけで、
 * `totalRange()` はこの値を見ない。総額の上限を実際に開けない唯一の表現は
 * 「そもそも行を作らない」ことなので、この注記は `CompareResult` の外
 * （コンポーネント側の静的な文言）として持ち、比較のデータには一切触れない。
 *
 * **文言はそのまま**（オーナー指定、言い換え禁止。2026-09-13 訂正3が最終版):
 * 「表示送料は燃油サーチャージ込みとして推定しています。遠隔地追加料金は
 * 含みません。」
 *
 * **常時表示**（訂正3で「宅配便の行があるときだけ」から変更——宅配便が1件も
 * 無い籠でも、この注記は出しっぱなしでよいとオーナーが判断した）。順位が
 * 無いときだけ、語る対象が無いので出さない（`FreeShippingDomesticNote` 等と
 * 同じ条件）。
 */
/**
 * 文言そのもの（vitest はnode環境で描画しないので、文だけを分離して検査する
 * ——`AssumedWeightsNote.tsx` の `assumedWeightsText` と同じ形）。
 */
export const REMOTE_AREA_SURCHARGE_NOTE_TEXT =
  'Displayed shipping rates are estimated as fuel-surcharge inclusive. Remote-area '
  + 'surcharges are not included.';

export function RemoteAreaSurchargeNote({ result }: { result: CompareResult }) {
  if (!result.rows.length) return null;

  return (
    <p data-testid="remote-area-surcharge-note" className="text-xs text-neutral-600 dark:text-neutral-400">
      {REMOTE_AREA_SURCHARGE_NOTE_TEXT}
    </p>
  );
}
