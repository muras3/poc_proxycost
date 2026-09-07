import { EMS_TABLE, EMS_ZONE, EMS_CHECKED_ON, EMS_SOURCE_URL, formatStep } from '@/lib/pricing/ems';
import { COUNTRIES } from '@/lib/pricing/countries';
import type { CountryCode } from '@/lib/pricing/types';
import { yen } from '@/lib/ui/format';

const ZONES = [1, 2, 3, 4, 5];

/** 我々が扱う7カ国のうち、その地帯に落ちる国名。落ちない地帯は空のまま（作らない）。 */
function countriesInZone(zone: number): string[] {
  return (Object.keys(EMS_ZONE) as CountryCode[])
    .filter((code) => EMS_ZONE[code] === zone)
    .map((code) => COUNTRIES[code].name);
}

export function EmsTable() {
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[22rem] border-collapse text-[11px] sm:text-xs">
          <caption className="sr-only">
            EMS prices from Japan, all {EMS_TABLE.length} weight steps by zone
          </caption>
          <thead>
            <tr className="border-b border-neutral-300 text-left text-neutral-500 dark:border-neutral-700">
              <th scope="col" className="py-2 pr-2 font-medium">Up to</th>
              {ZONES.map((z) => {
                const names = countriesInZone(z);
                return (
                  <th key={z} scope="col" className="px-1 py-2 text-right font-medium sm:px-2">
                    <span className="block">Zone {z}</span>
                    <span className="block font-normal text-neutral-500 dark:text-neutral-400">
                      {names.length > 0 ? names.join(', ') : 'not in our list'}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {EMS_TABLE.map((row) => {
              const [limit, ...prices] = row;
              if (limit == null) return null;
              return (
                <tr key={limit} className="border-b border-neutral-100 dark:border-neutral-900">
                  <th scope="row" className="py-1.5 pr-2 text-left font-normal tabular-nums">
                    {formatStep(limit)}
                  </th>
                  {prices.map((price, i) => (
                    <td key={ZONES[i] ?? i} className="px-1 py-1.5 text-right tabular-nums sm:px-2">
                      {yen(price)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-neutral-600 dark:text-neutral-400">
        Japan Post published prices, all {EMS_TABLE.length} steps, read on {EMS_CHECKED_ON}:{' '}
        <a className="underline" href={EMS_SOURCE_URL} target="_blank" rel="noopener noreferrer">
          post.japanpost.jp
        </a>. A parcel is charged at the first step it fits into, so 1,001 g and 1,250 g cost the
        same. That is why the calculator shows totals per step when it does not know the weight, and
        why the ranking barely moves when a weight guess is wrong.
      </p>
    </div>
  );
}
