'use client';

import { CA_PROVINCES, CA_PROVINCE_AVERAGE_RATE, PROVINCE_CODES } from '@/lib/pricing/countries';
import type { ProvinceCode } from '@/lib/pricing/types';

/**
 * カナダ宛のときだけ出る州の選択。**既定は未選択。**
 *
 * 既定を「オンタリオ」にはしない: 一番人口の多い州の率を、選んでいない人の請求額として
 * 名乗ることになる。かわりに未選択のまま人口加重の代表値を出し（`compare()` の
 * province-tax 行が tier estimate で描く）、ここで「選ぶと確定する」と言う。
 * **`—` にはしない。**州税は確実に発生するので、出さないほうが誤りが大きい
 * （docs/DESIGN-NOTES.md §2）。
 *
 * 選択肢の並びは `CA_PROVINCES` の宣言順（HST 州 → PST 州 → 徴収なし）。
 * 率をその場に出すのは、選ぶ前に何が変わるかを見せるため。
 */
export function ProvincePicker({
  value, onChange,
}: { value: ProvinceCode | null; onChange: (p: ProvinceCode | null) => void }) {
  const avg = `${(CA_PROVINCE_AVERAGE_RATE * 100).toFixed(1)}%`;
  return (
    <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
      Province
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : (e.target.value as ProvinceCode))}
        className="rounded border border-neutral-300 bg-transparent px-2 py-1 text-xs dark:border-neutral-700"
      >
        {/* 未選択の中身を「—」ではなく実際に使っている数字にする。
            選ばないままでも何が入っているかが読める。 */}
        <option value="">Not chosen — we estimate {avg}</option>
        {PROVINCE_CODES.map((c) => {
          const p = CA_PROVINCES[c];
          return (
            <option key={c} value={c}>
              {p.name}
              {p.taxName
                ? ` — ${p.taxName} ${+(p.rate * 100).toFixed(3)}%`
                : ' — no provincial tax at the border'}
            </option>
          );
        })}
      </select>
    </label>
  );
}
