'use client';

import { DEFAULT_STORAGE_DAYS } from '@/lib/pricing/compare';
import { tierClass } from '@/lib/ui/tiers';

/**
 * 倉庫に置く日数（F21、0d）。**既定 45 日は我々の仮定であって一次情報ではない**
 * （オーナー決定 2026-09-11、docs/FEE-ITEMS.md §5 R2）。「貯めてまとめ発送」という
 * 使い方の実態に寄せた数字なので、`tier: estimate` と同じ琥珀色にして、
 * 確定値（各社の料金表）と混ぜて見せない（`src/lib/ui/tiers.tsx`）。
 *
 * **他の入力（行き先・方式・州）と同じ格で並べる。**新しいデザインを発明しない
 * ── `CountryPicker` / `MethodPicker` / `ProvincePicker` と同じ `<label>` + 枠の形。
 * 変えたら `useCompare` が即座に `compare()` を呼び直し、再ランキングする。
 */
export function StorageDaysInput({
  value, onChange,
}: { value: number; onChange: (days: number) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
      Storage
      <input
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        value={value}
        onChange={(e) => {
          const n = Math.trunc(Number(e.target.value));
          if (Number.isFinite(n) && n >= 0) onChange(n);
        }}
        className={`w-16 rounded border border-neutral-300 bg-transparent px-2 py-1 text-xs`
          + ` dark:border-neutral-700 ${tierClass.estimate}`}
        aria-label="Days kept in the warehouse before shipping"
      />
      <span>
        {'days in the warehouse'}
        {value === DEFAULT_STORAGE_DAYS && (
          <span className={tierClass.estimate}>{' (our default assumption)'}</span>
        )}
      </span>
    </label>
  );
}
