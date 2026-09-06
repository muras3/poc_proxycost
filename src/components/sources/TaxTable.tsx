import type { ReactNode } from 'react';
import { COUNTRIES, COUNTRY_CODES, type Country } from '@/lib/pricing/countries';
import { tierClass, tierTitle } from '@/lib/ui/tiers';

const HEAD = [
  'Country', 'Taxed on', 'Duty-free limit', 'Duty', 'VAT / GST', 'Tax-free limit',
  'Clearance fee per parcel', 'Source',
];

const NOTE_TEXT: Record<string, string> = {
  de_minimis_suspended:
    'The US de minimis exemption is suspended, so duty applies from the first item.',
  province_tax_not_included:
    'Canadian provincial sales tax is not included — we only apply the 5% federal GST.',
};

function noteText(key: string): string {
  return NOTE_TEXT[key] ?? key.replace(/_/g, ' ');
}

function money(v: number, ccy: string): string {
  return `${v.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${ccy}`;
}

function pct(rate: number): string {
  return `${(rate * 100).toFixed(2).replace(/\.?0+$/, '')}%`;
}

/** null は「—」。**0% とは書かない。**税率 0 が確認できている国だけ 0% と書く。 */
function Dash({ title }: { title?: string }) {
  return <span className={tierClass.none} title={title ?? tierTitle.none}>—</span>;
}

function Cell({ label, children, className = '' }: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <td className={`block py-0.5 lg:table-cell lg:px-2 lg:py-3 lg:align-top ${className}`}>
      <span className="mr-2 inline-block w-36 align-top text-[11px] uppercase tracking-wide text-neutral-500 lg:hidden">
        {label}
      </span>
      <span className="inline-block align-top">{children}</span>
    </td>
  );
}

function dutyCell(c: Country): ReactNode {
  if (c.flatDutyPerItem != null) {
    return (
      <span className={tierClass[c.dutyTier]} title={tierTitle[c.dutyTier]}>
        {money(c.flatDutyPerItem, c.ccy)} flat per item
      </span>
    );
  }
  if (c.dutyRate == null) {
    return <Dash title="We have not found a rate we can stand behind. It is not zero." />;
  }
  return (
    <span className={tierClass[c.dutyTier]} title={tierTitle[c.dutyTier]}>
      {pct(c.dutyRate)}
    </span>
  );
}

function limitCell(v: number, ccy: string): ReactNode {
  if (!Number.isFinite(v)) return <span title="No duty on ordinary goods">no limit</span>;
  if (v <= 0) return <span className="tabular-nums">none — taxed from the first item</span>;
  return <span className="tabular-nums">{money(v, ccy)}</span>;
}

export function TaxTable() {
  const usedNotes = Array.from(
    new Set(COUNTRY_CODES.flatMap((code) => COUNTRIES[code].notes)),
  );

  return (
    <div>
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Import duty and tax by destination country</caption>
        <thead className="hidden lg:table-header-group">
          <tr className="border-b border-neutral-300 text-left text-[11px] uppercase tracking-wide text-neutral-500 dark:border-neutral-700">
            {HEAD.map((h) => <th key={h} scope="col" className="px-2 py-2 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody className="block lg:table-row-group">
          {COUNTRY_CODES.map((code) => {
            const c = COUNTRIES[code];
            return (
              <tr
                key={code}
                className="mb-3 block rounded-lg border border-neutral-200 p-3 lg:mb-0 lg:table-row lg:rounded-none lg:border-0 lg:border-b lg:p-0 dark:border-neutral-800"
              >
                <Cell label="Country" className="font-medium">
                  {c.name}
                  {c.notes.length > 0 ? (
                    <sup className="ml-0.5 text-[10px] text-neutral-500">
                      {c.notes.map((n) => usedNotes.indexOf(n) + 1).join(',')}
                    </sup>
                  ) : null}
                </Cell>
                <Cell label="Taxed on">
                  <span title={c.base === 'CIF' ? 'Goods plus shipping' : 'Goods only'}>
                    {c.base === 'CIF' ? 'goods + shipping' : 'goods only'}
                  </span>
                </Cell>
                <Cell label="Duty-free limit">{limitCell(c.dutyFreeLimit, c.ccy)}</Cell>
                <Cell label="Duty">{dutyCell(c)}</Cell>
                <Cell label="VAT / GST">
                  {c.vatRate == null ? <Dash /> : <span className="tabular-nums">{pct(c.vatRate)}</span>}
                </Cell>
                <Cell label="Tax-free limit">
                  {c.vatFreeLimit == null ? <Dash /> : limitCell(c.vatFreeLimit, c.ccy)}
                </Cell>
                <Cell label="Clearance fee">
                  {c.clearanceFeePerParcel == null ? (
                    <Dash title="We have not found a published figure. It is not zero — your carrier may still bill you." />
                  ) : (
                    <span className={tierClass[c.clearanceTier]} title={tierTitle[c.clearanceTier]}>
                      {money(c.clearanceFeePerParcel, c.clearanceCcy)}
                    </span>
                  )}
                </Cell>
                <Cell label="Source">
                  {c.sourceUrl ? (
                    <a className="underline" href={c.sourceUrl} target="_blank" rel="noopener noreferrer">
                      customs authority
                    </a>
                  ) : <Dash />}
                </Cell>
              </tr>
            );
          })}
        </tbody>
      </table>

      {usedNotes.length > 0 ? (
        <ol className="mt-3 space-y-1 text-xs text-neutral-600 dark:text-neutral-400">
          {usedNotes.map((n, i) => (
            <li key={n}>{i + 1}. {noteText(n)}</li>
          ))}
        </ol>
      ) : null}

      <p className="mt-3 text-xs text-neutral-600 dark:text-neutral-400">
        A dash means we have not found a figure we can stand behind. It never means zero, and the
        total on the calculator lists what it leaves out. Duty and tax are charged by your own
        customs, not by the proxy service, and they are charged on every parcel — which is why the
        number of parcels changes the total more than most fee differences do.
      </p>
    </div>
  );
}
