'use client';

import { DEFAULT_STORAGE_DAYS } from '@/lib/pricing/compare';
import { tierClass, tierTitle } from '@/lib/ui/tiers';

/**
 * 倉庫に置く日数（F21、0d）。**既定 45 日は我々の仮定であって一次情報ではない**
 * （オーナー決定 2026-09-11、docs/FEE-ITEMS.md §5 R2）。「貯めてまとめ発送」という
 * 使い方の実態に寄せた数字なので、数字自体を `tier: estimate` と同じ琥珀色にして、
 * 確定値（各社の料金表）と混ぜて見せない（`src/lib/ui/tiers.tsx`）。
 *
 * **他の入力（行き先・方式・州）と同じ格・同じ密度で並べる。**新しいデザインを
 * 発明しない ── `CountryPicker` / `MethodPicker` / `ProvincePicker` と同じ
 * `<label>` 一行の形にする。**説明文を常時表示のテキストとしては持たない**
 * （`Amount` コンポーネントと同じく `title` 属性で読ませる） ── 最初の実装は
 * 「days in the warehouse」＋「(our default assumption)」を毎回横に出しており、
 * `flex-wrap` する狭い画面でこの1行ぶん縦が伸び、`e2e/parcel.spec.ts` の
 * 「箱がビューポートに収まる」（PR #10 由来の制約）を壊した。
 * 変えたら `useCompare` が即座に `compare()` を呼び直し、再ランキングする。
 */
export function StorageDaysInput({
  value, onChange,
}: { value: number; onChange: (days: number) => void }) {
  return (
    <label
      className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400"
      title={`${tierTitle.estimate} — default is ${DEFAULT_STORAGE_DAYS} days`}
    >
      Storage (days)
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
        className={`w-14 rounded border border-neutral-300 bg-transparent px-2 py-1 text-xs`
          + ` dark:border-neutral-700 ${tierClass.estimate}`}
        aria-label="Days kept in the warehouse before shipping"
      />
    </label>
  );
}
