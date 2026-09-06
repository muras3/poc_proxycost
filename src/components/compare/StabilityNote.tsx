import type { CompareResult } from '@/lib/pricing/types';

/** rankStabilityNote は compare() が計算して返す。**ハードコードしない。** */
export function StabilityNote({ result }: { result: CompareResult }) {
  if (!result.rankStabilityNote) return null;
  return (
    <p
      className={`text-xs ${
        result.rankStable
          ? 'text-neutral-600 dark:text-neutral-400'
          : 'text-amber-700 dark:text-amber-400'
      }`}
    >
      {result.rankStabilityNote}
    </p>
  );
}
