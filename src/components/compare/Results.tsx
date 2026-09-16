'use client';

import { useEffect, type ReactNode } from 'react';
import { track } from '@/lib/analytics/events';
import { andList } from '@/lib/pricing/compare';
import { COUNTRIES } from '@/lib/pricing/countries';
import { methodLabel } from '@/lib/ui/methodLabel';
import { foreign, yen } from '@/lib/ui/format';
import type { CompareResult, CountryCode, Item, ProvinceCode } from '@/lib/pricing/types';
import { Board } from './Board';
import { headlineFor, tooCloseText, weightEffectFor, weightEffectText } from './rankClaim';
import { NoteButton, Mark } from './Popover';
import { TotBar } from './RankRow';
import { totalParts } from './mockFormat';
import { RemoteAreaSurchargeNote } from './RemoteAreaSurchargeNote';
import { AlcoholInCartNote, LongItemsInCartNote, RestrictedGoodsNote } from './RestrictedGoodsNote';
import { FreeShippingDomesticNote } from './FreeShippingDomesticNote';
import { alcoholItems, longItems } from '@/lib/pricing/restricted-goods';
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

  // ファネル2段目（比較結果の表示）。**比べられる行が実際に出たときだけ**数える——
  // 「Can't compare」の枠は結果を見たことにならない。`track` は1回の読み込みにつき
  // 1回しか送らないので、条件を変えて再描画しても分母は増えない。
  const sawResults = comp.length > 0;
  useEffect(() => {
    if (sawResults) track('results');
  }, [sawResults]);
  const first = comp[0];
  const leaders = comp.filter((r) => r.cheapest);
  const uniform = new Set(comp.map((r) => r.method)).size <= 1;
  const hiMax = comp.length ? Math.max(...comp.map((r) => r.total.high ?? r.total.low)) : 0;
  const sens = result.weightSensitivity;
  const decisiveItems = items.filter((i) => sens[i.id]?.decisive);
  // **「測れば決まる」／「測ると決まらなくなる」を見出しと同格で出す**
  // （`rankClaim.weightEffectFor`）。`decisive` だけでは向きが分からないので、
  // その端で1位と判別が付かない社の数（`contestedAtLow`/`High`）と今の社数を
  // 見比べて分ける。以前この事実はカートの注記にしか出ておらず、順位を読んで
  // いる人の目には入らなかった。
  const wEffect = weightEffectFor(result, items);
  const wText = weightEffectText(wEffect);

  /* --- summary: winner + the gap is the headline; total is secondary --- */
  let summary: ReactNode = null;
  if (comp.length >= 2 && first) {
    // **見出しが何を言えるかは engine の `contestedIds` だけが決める**
    // （`rankClaim.headlineFor`）。`recommended`/`equivalent` は使わない——
    // あれは画面に囲える数の上限（最大2社）が掛かっていて、重なり判定も
    // 推移的なので、「1位と判別が付かない社の集合」ではない（`rankClaim` 参照）。
    const h = headlineFor(result);
    const est = leaders.some((r) => r.closedByAssumption.length > 0);
    let head: ReactNode;
    if (h.kind === 'indeterminate') {
      head = <h2 className="summary">Can&rsquo;t tell who leads to {countryName} — the top total&rsquo;s own upper bound is open.</h2>;
    } else if (h.kind === 'tooClose') {
      // **差額は数値で出さない。**区間が交わっている以上、点推定どうしの差は
      // 「どちらが安いか」について何も言っていない。ページで一番大きい文字が
      // 一番強く断定してしまうので、ここに `¥N below` は置かない。
      head = (
        <h2 className="summary" data-testid="too-close">
          <b>{tooCloseText(h.names)}</b> — too close to call to {countryName}
          {h.names.length > 2 && <> ({h.names.length} services overlap)</>}.
        </h2>
      );
    } else if (h.kind === 'tie') {
      head = (
        <h2 className="summary">
          <b>{andList(h.names)}</b> are tied {est ? 'estimated ' : ''}cheapest to {countryName}
          {/* 同額の社の外にも交わっている社が居れば、その数は黙って落とさない。 */}
          {h.contested > h.names.length && <> — {h.contested} services overlap in all</>}.
        </h2>
      );
    } else {
      // **断定してよい唯一のケース**（`contestedIds` が1社 ＝ 1位の区間が
      // 誰の区間とも交わっていない）。ここだけ従来どおり差額を数値で出す。
      const next = h.kind === 'clear' ? h.next : undefined;
      head = (
        <h2 className="summary" data-testid="clear-winner">
          <b>{first.serviceName}</b> is {est ? 'the estimated cheapest' : 'cheapest'} to {countryName}
          {next && <> — <span className="gap">{yen(next.diff)}</span> below {next.label}</>}.
        </h2>
      );
    }
    const tp = totalParts(first);
    summary = (
      <div data-testid="summary">
        {head}
        {/* 同格——見出しの直後、総額（`.sumtot`）より前。下段の小さい注記に落とさない。 */}
        {wText && (
          <p className="summary-weight" data-testid="weight-effect" data-effect={wEffect.kind}>
            {wText}{' '}
            {wEffect.kind !== 'none' && wEffect.items[0] && (
              <button type="button" className="link" onClick={() => onFocusWeight(wEffect.items[0]!.id)}>
                Check weights
              </button>
            )}
          </p>
        )}
        <p className="sumtot">
          {/*
            **2026-09-15、着地総額の断定をやめた（文言のみ）。**以前は「1st, at the door」。
            同じ画面に売上税・VAT が `not published` の国があり、Jauce の Zonos 利用料も
            未算入で、`total.high` が閉じない行もある以上、「着いたときに払い終わる額」は
            言い切れない。既知＋推定だと分かる言い方にする。金額そのものは変えていない。
          */}
          <span className="lbl">1st, known and estimated charges</span>
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
  // 出す・出さないの判定は各注記と同じ純関数で先に行い、空の `.cond` を作らない。
  const all = [...items];
  if (rows.length && alcoholItems(all).length) {
    conds.push(<CondWrap key="alc"><AlcoholInCartNote result={result} items={all} /></CondWrap>);
  }
  if (rows.length && longItems(all).length) {
    conds.push(<CondWrap key="long"><LongItemsInCartNote result={result} items={all} /></CondWrap>);
  }
  if (rows.length && all.some((i) => i.freeShipping)) {
    conds.push(<CondWrap key="free"><FreeShippingDomesticNote result={result} items={all} /></CondWrap>);
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
    <div className="cond">
      <span className="bang" aria-hidden="true">!</span>
      {children}
    </div>
  );
}
