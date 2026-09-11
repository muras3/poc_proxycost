import type { ReactNode } from 'react';
import {
  SERVICES, SERVICES_CHECKED_ON, type MarkupPostageRate, type Service,
} from '@/lib/pricing/services';
import { POSTAL_METHODS } from '@/lib/pricing/postage';
import { ASSUMED_DOMESTIC_SHIPPING_YEN } from '@/lib/pricing/compare';
import type { SiteId } from '@/lib/pricing/types';
import { yen, grams } from '@/lib/ui/format';
import { tierClass, tierTitle } from '@/lib/ui/tiers';

const SITE_LABEL: Record<SiteId, string> = {
  'yahoo-auctions': 'Yahoo! Auctions',
  mercari: 'Mercari',
  rakuten: 'Rakuten',
  'yahoo-shopping': 'Yahoo! Shopping',
  'amazon-jp': 'Amazon.co.jp',
  'suruga-ya': 'Suruga-ya',
  mandarake: 'Mandarake',
  zozo: 'ZOZOTOWN',
  hmv: 'HMV Japan',
  toranoana: 'Toranoana',
  other: 'other shops',
};

const HEAD = [
  'Service', 'Service fee', 'Domestic shipping', 'Deposit / payment fee', 'Packing',
  'Parcels by default', 'International shipping', 'Referral', 'Price list',
];

function host(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function Dash() {
  return <span className={tierClass.none} title={tierTitle.none}>—</span>;
}

function Cell({ label, children, className = '' }: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <td className={`block py-0.5 lg:table-cell lg:px-2 lg:py-3 lg:align-top ${className}`}>
      <span className="mr-2 inline-block w-32 align-top text-[11px] uppercase tracking-wide text-neutral-500 lg:hidden">
        {label}
      </span>
      <span className="inline-block align-top">{children}</span>
    </td>
  );
}

function serviceFee(svc: Service): ReactNode {
  const f = svc.fee;
  const parts: ReactNode[] = [];
  if (f.perItemYen != null) {
    parts.push(<span key="item" className={tierClass[f.tier]}>{yen(f.perItemYen)} per item</span>);
  }
  if (f.perOrderYen != null) {
    parts.push(<span key="order" className={tierClass[f.tier]}>{yen(f.perOrderYen)} per order</span>);
  }
  if (f.adValoremRate != null) {
    parts.push(
      <span key="adv" className={tierClass[f.tier]}>
        + {(f.adValoremRate * 100).toFixed(1).replace(/\.0$/, '')}% of the item price
      </span>,
    );
  }
  if (f.paymentInsideJapanYen != null) {
    parts.push(
      <span
        key="pay"
        className={tierClass[f.paymentInsideJapanTier ?? 'unverified']}
        title="The original does not say whether this is per item or per order. We charge it once per order."
      >
        + {yen(f.paymentInsideJapanYen)} payment fee inside Japan
      </span>,
    );
  }
  if (f.freeForSites && f.freeForSites.length > 0) {
    parts.push(
      <span key="free" className={tierClass[f.freeForSitesTier ?? 'unverified']}>
        free for {f.freeForSites.map((s) => SITE_LABEL[s]).join(' and ')} (beta)
      </span>,
    );
  }
  if (parts.length === 0) return <Dash />;
  return <span className="flex flex-col gap-0.5">{parts}</span>;
}

function domestic(svc: Service): ReactNode {
  const extra = svc.fee.protectionPlanPerOrderYen;
  return (
    <span className="flex flex-col gap-0.5">
      {svc.domesticIncluded ? (
        <span className={tierClass.fixed}>included in the service fee</span>
      ) : (
        <span className={tierClass.estimate} title="We assume this when the listing does not state it">
          {yen(ASSUMED_DOMESTIC_SHIPPING_YEN)} assumed per order
        </span>
      )}
      {extra != null ? (
        <span className={tierClass[svc.fee.tier]}>+ {yen(extra)} handling per order</span>
      ) : null}
    </span>
  );
}

function deposit(svc: Service): ReactNode {
  const d = svc.deposit;
  if (!d) return <Dash />;
  return (
    <span className={tierClass[d.tier]} title={tierTitle[d.tier]}>
      {d.note}
    </span>
  );
}

function packing(svc: Service): ReactNode {
  const p = svc.packing;
  if (!p) return <Dash />;
  return (
    <span className={tierClass[p.tier]}>
      {yen(p.perParcelYen)} per parcel
      {p.perKgYen > 0
        ? `, + ${yen(p.perKgYen)} per kg${p.freeUpToG > 0 ? ` over ${grams(p.freeUpToG)}` : ''}`
        : ''}
      {p.mandatory ? '' : ' (optional)'}
    </span>
  );
}

function parcels(svc: Service): ReactNode {
  const base = svc.parcelDefault === 'per-order' ? 'one parcel per order' : 'one parcel for the order';
  return (
    <span className="flex flex-col gap-0.5">
      <span className={svc.parcelVerified ? tierClass.fixed : tierClass.estimate}>
        {svc.parcelVerified ? base : `${base} (assumed)`}
      </span>
      {svc.consolidationOnRequest ? (
        <span className="text-xs text-neutral-600 dark:text-neutral-400">
          consolidation free on request
        </span>
      ) : null}
    </span>
  );
}

/**
 * その社が売っている日本郵便の方式と、公表額に対する上乗せ。
 *
 * **社ごとに品揃えが違う**（FROM JAPAN 5方式 / Jauce 2方式）ので、方式の数も出す。
 * **上乗せは方式ごと**（ZenMarket は EMS どおりで小形包装物だけ +45.2%）なので、
 * 「全部公表額どおり」か「どの方式に上乗せがあるか」を書き分ける。
 */
/** 上乗せがあるか。国限定のものも含める。 */
function hasMarkup(rate: MarkupPostageRate): boolean {
  const all = [rate.markup, ...Object.values(rate.byCountry ?? {})];
  return all.some((m) => m.kind !== 'none');
}

/** 上乗せの形を1語で。**率で書かない**——実測で分かった形は「1kg 段ごとの定額」。 */
function describeMarkup(rate: MarkupPostageRate): string {
  const step = [rate.markup, ...Object.values(rate.byCountry ?? {})]
    .find((m) => m.kind === 'per-kg-step');
  if (step && step.kind === 'per-kg-step') {
    const onlySome = rate.markup.kind === 'none';
    return `+¥${step.yen}/kg${onlySome ? ' (US only)' : ''}`;
  }
  return 'over the published price, amount varies by country and weight';
}

function international(svc: Service): ReactNode {
  const rows = POSTAL_METHODS
    .map((m) => ({ spec: m, rate: svc.postage[m.id] }))
    .filter((x): x is { spec: typeof x.spec; rate: MarkupPostageRate } => x.rate != null);
  const marked = rows.filter((r) => hasMarkup(r.rate));
  return (
    <span>
      {`${rows.length} Japan Post ${rows.length === 1 ? 'method' : 'methods'}: `}
      {marked.length === 0 ? (
        <span className={tierClass.fixed} title={tierTitle.fixed}>
          all at the published price
        </span>
      ) : (
        marked.map((r, i) => (
          <span key={r.spec.id}>
            {i > 0 ? ', ' : ''}
            <span className={tierClass[r.rate.tier]} title={tierTitle[r.rate.tier]}>
              {`${r.spec.label} ${describeMarkup(r.rate)}`}
            </span>
          </span>
        ))
      )}
      {marked.length > 0 && ', the rest at the published price'}
    </span>
  );
}

export function FeeTable() {
  return (
    <div>
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">
          Proxy service fees, with the price list each number comes from
        </caption>
        <thead className="hidden lg:table-header-group">
          <tr className="border-b border-neutral-300 text-left text-[11px] uppercase tracking-wide text-neutral-500 dark:border-neutral-700">
            {HEAD.map((h) => <th key={h} scope="col" className="px-2 py-2 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody className="block lg:table-row-group">
          {SERVICES.map((svc) => (
            <tr
              key={svc.id}
              className="mb-3 block rounded-lg border border-neutral-200 p-3 lg:mb-0 lg:table-row lg:rounded-none lg:border-0 lg:border-b lg:p-0 dark:border-neutral-800"
            >
              <Cell label="Service" className="font-medium">
                {/* 一次情報は実線、二次情報は破線（docs/UI-DESIGN.md §6）。 */}
                <span
                  className={`inline-block border-b pb-0.5 ${svc.primarySource ? 'border-solid' : 'border-dashed'}`}
                  title={svc.primarySource
                    ? 'Taken from the published price list'
                    : 'Second-hand source — we have not read the original price list'}
                >
                  {svc.name}
                </span>
              </Cell>
              <Cell label="Service fee">{serviceFee(svc)}</Cell>
              <Cell label="Domestic shipping">{domestic(svc)}</Cell>
              <Cell label="Deposit fee">{deposit(svc)}</Cell>
              <Cell label="Packing">{packing(svc)}</Cell>
              <Cell label="Parcels">{parcels(svc)}</Cell>
              <Cell label="International">{international(svc)}</Cell>
              <Cell label="Referral">
                <span className="text-neutral-600 dark:text-neutral-400">
                  {svc.paysUs ? (svc.referralNote ?? 'pays us a referral fee') : 'pays us nothing'}
                </span>
              </Cell>
              <Cell label="Price list">
                {svc.sourceUrl ? (
                  <a className="underline" href={svc.sourceUrl} target="_blank" rel="noopener noreferrer">
                    {host(svc.sourceUrl)}
                  </a>
                ) : <Dash />}
              </Cell>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-3 text-xs text-neutral-600 dark:text-neutral-400">
        Fees read on {SERVICES_CHECKED_ON}. A solid underline under a company name means we read its
        own price list. A dashed underline means the figures are second-hand. The referral column is
        printed because you deserve to know it — it is never an input to the ranking.
      </p>
    </div>
  );
}
