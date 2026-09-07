/**
 * 差額**だけ**を長さで符号化する。総額は符号化しない
 * （総額は約半分が推論なので、面積で強調してはいけない。docs/UI-DESIGN.md §1）。
 */
export function DiffBar({ diff, max }: { diff: number; max: number }) {
  if (max <= 0) return null;
  const pct = Math.max(2, Math.round((diff / max) * 100));
  return (
    <div className="h-1.5 w-full max-w-[140px] rounded-full bg-neutral-200 dark:bg-neutral-800">
      <div
        className="h-1.5 rounded-full bg-neutral-400 dark:bg-neutral-600"
        style={{ width: `${diff === 0 ? 0 : pct}%` }}
      />
    </div>
  );
}
