'use client';

import type { ReactNode } from 'react';
import { andList } from '@/lib/pricing/compare';
import { COUNTRIES } from '@/lib/pricing/countries';
import { methodLabel } from '@/lib/ui/methodLabel';
import { foreign, yen } from '@/lib/ui/format';
import type { CompareResult, CountryCode, Item, ProvinceCode } from '@/lib/pricing/types';
import { Board } from './Board';
import { NoteButton, Mark } from './Popover';
import { TotBar } from './RankRow';
import { totalParts } from './mockFormat';
import { RemoteAreaSurchargeNote } from './RemoteAreaSurchargeNote';
import { AlcoholInCartNote, LongItemsInCartNote, RestrictedGoodsNote } from './RestrictedGoodsNote';
import { FreeShippingDomesticNote } from './FreeShippingDomesticNote';
import type { MethodChoice } from './Waybill';

/**
 * 結果（Mock v3 `renderResults`）: 要約 → 段1の条件つき1行（`.cond`）→ 常時アイコン2つ →
 * 順位ボード（比べられる行が無ければ「Can't compare」の枠）。
 */
export function Results({
  result, country, province, method, items, priced, onFocusMethod, onFocusWeight, onProvince,
}: {
  result: CompareResult;
  country: CountryCode;
  province: ProvinceCode | null;
  method: MethodChoice;
  items: readonly Item[];
  priced: readonly Item[];
  onFocusMethod: () => void;
  onFocusWeight: (id: string) => void;
  onProvince: (p: ProvinceCode | null) => void;
}) {
  const rows = result.rows;
  const comp = rows.filter((r) => r.comparable);
  const countryName = COUNTRIES[country].name;
  const first = comp[0];
  const leaders = comp.filter((r) => r.cheapest);
  const uniform = new Set(comp.map((r) => r.method)).size <= 1;
  const hiMax = comp.length ? Math.max(...comp.map((r) => r.total.high ?? r.total.low)) : 0;
  const sens = result.weightSensitivity;
  const decisiveItems = items.filter((i) => sens[i.id]?.decisive);

  /* --- summary: winner + the gap is the headline; total is secondary --- */
  let summary: ReactNode = null;
  if (comp.length >= 2 && first) {
    const next = comp.find((r) => !r.cheapest);
    let head: ReactNode;
    if (result.rankIndeterminate) {
      head = <h2 className="summary">Can&rsquo;t tell who leads to {countryName} — the top total&rsquo;s own upper bound is open.</h2>;
    } else {
      const est = leaders.some((r) => r.closedByAssumption.length > 0);
      const who = leaders.length > 1
        ? <><b>{andList(leaders.map((r) => r.label))}</b> are tied {est ? 'estimated ' : ''}cheapest</>
        : <><b>{first.serviceName}</b> is {est ? 'the estimated cheapest' : 'cheapest'}</>;
      head = (
        <h2 className="summary">
          {who} to {countryName}
          {next && <> — <span className="gap">{yen(next.diff)}</span> below {next.label}</>}.
        </h2>
      );
    }
    const tp = totalParts(first);
    summary = (
      <div data-testid="summary">
        {head}
        <p className="sumtot">
          <span className="lbl">1st, at the door</span>
          <span className="v num" aria-label={tp.aria}>{tp.vis}</span>
          <TotBar row={first} hiMax={hiMax} />
          <span>{foreign(first.total.low, result.currency.code, result.currency.rate)} at ECB rate of {result.currency.asOf}</span>
          {result.rankStable && <Mark title="How firm is this order" body={<p>{result.rankStabilityNote}</p>} />}
          {uniform && <span>· {first.boxes.length === 1 ? '1 box' : `${first.boxes.length} boxes`} by {methodLabel(first.method)}</span>}
        </p>
      </div>
    );
  } else if (comp.length === 1 && first) {
    summary = (
      <div data-testid="summary">
        <h2 className="summary">Only <b>{first.serviceName}</b> can be priced for this parcel to {countryName}.</h2>
      </div>
    );
  }

  /* --- tier 1 conditional lines --- */
  const conds: ReactNode[] = [];
  if (comp.length && result.rankIndeterminate) {
    conds.push(
      <p className="cond" key="indet" data-testid="indeterminate-note">
        <span className="bang" aria-hidden="true">!</span>
        <span>Could go either way — the leader&rsquo;s own total has no upper bound, so the order below is only who leads on the low end. Shipping method moves the total more than company choice does.{' '}
          <button type="button" className="link" onClick={onFocusMethod}>Change method</button>
        </span>
      </p>,
    );
  }
  const notRanked = rows.filter((r) => !r.comparable);
  if (comp.length && notRanked.length && method !== 'cheapest') {
    const nrServices = new Set(notRanked.map((r) => r.serviceId)).size;
    const allServices = new Set(rows.map((r) => r.serviceId)).size;
    conds.push(
      <p className="cond" key="nr">
        <span className="bang" aria-hidden="true">!</span>
        <span>{nrServices} of {allServices} services can&rsquo;t be ranked for {methodLabel(method)} — they&rsquo;re listed last with the reason.{' '}
          <button type="button" className="link" onClick={onFocusMethod}>Back to cheapest per service</button>
        </span>
      </p>,
    );
  }
  // 宛先の事実: リチウム電池入りの航空郵便を受けない国（`compare()` が国だけで決めた値を読む）。
  if (rows.length && !result.destinationFacts.lithiumAirmailListed) {
    conds.push(
      <p className="cond" key="li" data-testid="lithium-airmail-badge">
        <span className="bang" aria-hidden="true">!</span>
        <span>{countryName} does not take lithium batteries by air mail. Ask the agent before shipping a battery-powered item this way.</span>
      </p>,
    );
  }
  // カートの中身に依る段1の注意（Mock にはこの条件が無いので、同じ `.cond` の形で載せる）。
  for (const [key, node] of [
    ['alc', <AlcoholInCartNote key="alc" result={result} items={[...items]} />],
    ['long', <LongItemsInCartNote key="long" result={result} items={[...items]} />],
    ['free', <FreeShippingDomesticNote key="free" result={result} items={[...items]} />],
  ] as const) {
    conds.push(<CondWrap key={key}>{node}</CondWrap>);
  }

  /* --- the two always-on notes as icons; the wording lives in the popover --- */
  const bands = rows.length > 0 && (
    <div className="iconband" role="group" aria-label="Always-on notes">
      <NoteButton
        className="ic"
        testId="icon-shippability"
        title="Goods restrictions not checked"
        label="Goods restrictions not checked"
        body={<RestrictedGoodsNote result={result} country={country} />}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="9" width="16" height="11" rx="1" /><path d="M8 9V6a4 4 0 0 1 8 0v3" /><line x1="3" y1="3" x2="21" y2="21" />
        </svg>
      </NoteButton>
      <NoteButton
        className="ic"
        testId="icon-fuel-remote"
        title="Fuel & remote-area surcharge"
        label="Fuel surcharge included, remote-area surcharge not included"
        body={<RemoteAreaSurchargeNote result={result} />}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 21V10l7-6 7 6v11" /><circle cx="12" cy="14" r="2.4" /><path d="M9 21v-3.5" /><path d="M15 21v-3.5" />
        </svg>
      </NoteButton>
    </div>
  );

  /* --- board, or the no-board state --- */
  const wobble = decisiveItems.length
    ? <p>Within the range we tested, {result.rankStabilityNote}</p>
    : null;
  const board = !comp.length ? (
    <div className="norank" role="status" data-testid="norank">
      <h3>Can&rsquo;t compare</h3>
      <p>{result.rankStabilityNote}</p>
      <p className="lbl">No total is shown, because every total below would be missing its largest cost.</p>
      <ul className="wcbo">
        {rows.map((r) => <li key={r.id} data-row-id={r.id}><span className="k">{r.label}</span><span>{r.notComparableReason}</span></li>)}
      </ul>
      {items[0] && <><button type="button" className="link" onClick={() => onFocusWeight(items[0]!.id)}>Check weights</button> · </>}
      <button type="button" className="link" onClick={onFocusMethod}>Change method</button>
    </div>
  ) : (
    <Board result={result} items={priced} wobble={wobble} province={province} onProvince={country === 'CA' ? onProvince : null} />
  );

  return (
    <div id="results">
      {summary}
      <div role="group" aria-label="Before you choose">{conds}{bands}</div>
      {board}
    </div>
  );
}

/** 既存の注記コンポーネント（`<p class="text-xs …">` を返す）を Mock の `.cond` の形に載せる。中身が無ければ何も出さない。 */
function CondWrap({ children }: { children: ReactNode }) {
  return (
    <div className="condwrap">
      <span className="bang" aria-hidden="true">!</span>
      {children}
    </div>
  );
}
