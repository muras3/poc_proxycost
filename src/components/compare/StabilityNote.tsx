import type { CompareResult } from '@/lib/pricing/types';

/**
 * rankStabilityNote は compare() が計算して返す。**ハードコードしない。**
 * 不安定なときは「重量を確かめろ」と言うだけでなく、確かめる欄まで連れて行く
 * （onCheckWeights）。文だけ出して欄を探させるのは、見逃されるのと同じ。
 */
export function StabilityNote({
  result, onCheckWeights,
}: {
  result: CompareResult;
  onCheckWeights?: (() => void) | null;
}) {
  if (!result.rankStabilityNote) return null;
  const unstable = !result.rankStable;
  return (
    <p
      className={`text-xs ${
        unstable
          ? 'text-amber-700 dark:text-amber-400'
          : 'text-neutral-600 dark:text-neutral-400'
      }`}
    >
      {/* 記号は色だけに頼らないため（docs/UI-DESIGN.md §6）。 */}
      {unstable && <span aria-hidden>⚠ </span>}
      {result.rankStabilityNote}
      {unstable && onCheckWeights && (
        <>
          {' '}
          <button type="button" onClick={onCheckWeights} className="underline">
            Check the weights in your cart
          </button>
        </>
      )}
    </p>
  );
}
