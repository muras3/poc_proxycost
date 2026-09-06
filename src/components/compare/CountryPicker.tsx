'use client';

import { COUNTRIES } from '@/lib/pricing/countries';
import type { CountryCode } from '@/lib/pricing/types';

const CODES = Object.keys(COUNTRIES) as CountryCode[];

export function CountryPicker({
  value, onChange,
}: { value: CountryCode; onChange: (c: CountryCode) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
      Ship to
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as CountryCode)}
        className="rounded border border-neutral-300 bg-transparent px-2 py-1 text-xs dark:border-neutral-700"
      >
        {CODES.map((c) => (
          <option key={c} value={c}>{COUNTRIES[c].name}</option>
        ))}
      </select>
    </label>
  );
}
