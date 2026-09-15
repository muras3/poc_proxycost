'use client';

import type {
  CountryCode, CourierMethod, Item, PostalMethod, ProvinceCode, WeightSensitivity,
} from '@/lib/pricing/types';
import { CA_PROVINCES, CA_PROVINCE_AVERAGE_RATE, PROVINCE_CODES } from '@/lib/pricing/countries';
import { COUNTRIES } from '@/lib/pricing/countries';
import { grams } from '@/lib/ui/format';
import { CountryPicker } from './CountryPicker';
import { MethodPicker } from './MethodPicker';
import { StorageDaysInput } from './StorageDaysInput';

/**
 * **条件欄。**mock-v3 の4欄グリッド（送り先＋州を1欄に統合／保管日数／配送方式／
 * カート1行）を、既存の各ピッカー（`CountryPicker`/`MethodPicker`/`StorageDaysInput`）の
 * 挙動・出典・計算は一切変えずに並べ直すだけの薄いレイアウト。**数値・順位は
 * 一切動かさない**（このコンポーネントは `src/lib/pricing` を触らない）。
 *
 * 幅で 4列 → 2×2 → 縦積みに折り返す（`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`）。
 * どの幅でも `min-w-0` を各セルに付け、手入力フォーム（`ManualAdd`）を開いたまま
 * カナダを選んでも横スクロールが出ない（以前の回帰、PR-C 準備メモ参照）。
 *
 * 州は Canada のときだけ、送り先セルの**中**に出す——別セルにすると4欄グリッドの
 * 5番目の欄になり、4欄という形そのものが崩れる。
 */
export function ConditionsBar({
  country, province, storageDays, method, items, sensitivity,
  onCountryChange, onProvinceChange, onStorageDaysChange, onMethodChange, onEditCart,
}: {
  country: CountryCode;
  province: ProvinceCode | null;
  storageDays: number;
  method: PostalMethod | CourierMethod | 'cheapest';
  items: Item[];
  sensitivity: Record<string, WeightSensitivity>;
  onCountryChange: (c: CountryCode) => void;
  onProvinceChange: (p: ProvinceCode | null) => void;
  onStorageDaysChange: (d: number) => void;
  onMethodChange: (m: PostalMethod | CourierMethod | 'cheapest') => void;
  onEditCart: () => void;
}) {
  const count = items.length;
  const totalG = items.reduce((sum, i) => sum + (i.weightG ?? 0) * Math.max(1, i.qty), 0);
  const anyEstimated = items.some((i) => i.weightOrigin !== 'user');
  const hasDecisive = items.some((i) => sensitivity[i.id]?.decisive);

  return (
    <div
      data-testid="conditions-bar"
      className="grid min-w-0 grid-cols-1 gap-3 border border-neutral-200 bg-paper-2 p-3 text-xs sm:grid-cols-2 lg:grid-cols-4 dark:border-neutral-800"
    >
      {/* 1. 送り先 ＋ 州（統合）。 */}
      <div className="min-w-0" data-testid="destination-cell">
        <CountryPicker value={country} onChange={onCountryChange} />
        {country === 'CA' && (
          <ProvinceInline province={province} onChange={onProvinceChange} />
        )}
      </div>

      {/* 2. 保管日数。 */}
      <div className="min-w-0">
        <StorageDaysInput value={storageDays} onChange={onStorageDaysChange} />
      </div>

      {/* 3. 配送方式。 */}
      <div className="min-w-0">
        <MethodPicker value={method} onChange={onMethodChange} country={country} />
      </div>

      {/* 4. カート1行。総額を左右する重量の品があれば赤い印。 */}
      <div className="min-w-0">
        <button
          type="button"
          onClick={onEditCart}
          data-testid="conditions-cart-summary"
          className="flex w-full items-center gap-2 text-left text-neutral-600 dark:text-neutral-400"
        >
          <span className="num text-neutral-900 dark:text-neutral-100">
            {count} item{count === 1 ? '' : 's'} &middot; {anyEstimated ? '≈' : ''}{grams(totalG)}
          </span>
          {hasDecisive && (
            <span
              aria-hidden
              data-testid="conditions-cart-decisive-dot"
              className="inline-block h-2 w-2 rounded-full bg-red-600"
            />
          )}
          <span className="underline">Edit cart</span>
        </button>
      </div>
    </div>
  );
}

/**
 * 州の表示。**選択済みなら `Canada · Ontario`、未選択なら `Canada · province ≈ avg`**
 * （mock-v3 §conditions、`wPlace` の文言そのまま）。中身は `ProvincePicker` と
 * 同じ `<select>`——率の一覧・既定「未選択」の理由は `ProvincePicker.tsx` の
 * コメントを見よ。ここでは見せ方（1行に繋げて出す）だけを変える。
 */
function ProvinceInline({
  province, onChange,
}: { province: ProvinceCode | null; onChange: (p: ProvinceCode | null) => void }) {
  const avg = `${(CA_PROVINCE_AVERAGE_RATE * 100).toFixed(1)}%`;
  const selected = province ? CA_PROVINCES[province] : null;
  return (
    <label className="mt-1 flex min-w-0 items-center gap-1 text-neutral-600 dark:text-neutral-400">
      <span aria-hidden>&middot;</span>
      <span className="sr-only">Province</span>
      <select
        value={province ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : (e.target.value as ProvinceCode))}
        aria-label="Province"
        className={
          selected
            ? 'min-w-0 max-w-full truncate rounded border border-neutral-300 bg-transparent px-1 py-0.5 dark:border-neutral-700'
            : 'min-w-0 max-w-full truncate rounded border border-dashed border-indigo-400 bg-transparent px-1 py-0.5 text-indigo-700 dark:border-indigo-500 dark:text-indigo-300'
        }
      >
        <option value="">province &asymp; avg ({avg})</option>
        {PROVINCE_CODES.map((c) => {
          const p = CA_PROVINCES[c];
          return (
            <option key={c} value={c}>
              {p.name}
              {p.taxName ? ` — ${p.taxName} ${+(p.rate * 100).toFixed(3)}%` : ' — no provincial tax at the border'}
            </option>
          );
        })}
      </select>
      <span className="sr-only">
        {selected ? `${COUNTRIES.CA.name} · ${selected.name}` : `${COUNTRIES.CA.name} · province ≈ avg`}
      </span>
    </label>
  );
}
