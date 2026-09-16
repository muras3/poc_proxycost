'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { COUNTRIES, CA_PROVINCES, CA_PROVINCE_AVERAGE_RATE, PROVINCE_CODES } from '@/lib/pricing/countries';
import { COURIER_METHODS, POSTAL_METHODS, courierMethodAvailable } from '@/lib/pricing/postage';
import type {
  CountryCode, CourierMethod, Item, Line, PostalMethod, ProvinceCode,
} from '@/lib/pricing/types';
import {
  UNTRACKED, carrierChoices, methodGroups, methodRawNote, notAvailableFor, notPricedFor,
} from '@/lib/ui/methodDisplay';
import { carrierIdOfChoice, type CarrierChoice } from '@/lib/pricing/carriers';
import { grams, yen } from '@/lib/ui/format';
import { Mark } from './Popover';

export type MethodChoice = PostalMethod | CourierMethod | 'cheapest' | CarrierChoice;
const COUNTRY_ORDER: CountryCode[] = ['US', 'GB', 'DE', 'FR', 'AU', 'CA', 'SG'];

/**
 * 条件欄（Mock v3 `.waybill`）。4欄: 送り先（＋州）／保管日数／配送方式／カート1行。
 * 送り先は閉じているときは1つのボタン、押すと国（と州）の select が出る。
 * **数値・順位は一切動かさない**——値を親へ返すだけ。
 */
export function Waybill({
  country, province, storageDays, method, items, cartOpen, provinceLine, scopeNote,
  onCountry, onProvince, onStorageDays, onMethod, onCartToggle,
}: {
  country: CountryCode;
  province: ProvinceCode | null;
  storageDays: number;
  method: MethodChoice;
  items: readonly Item[];
  cartOpen: boolean;
  /** 1位の行の `province-tax` の費目（州未選択の注釈に、今入っている額を出す）。 */
  provinceLine: Line | null;
  /** 「Ship by §」の注釈に足す、比べている範囲の開示（`EmsOnlyNote`）。 */
  scopeNote?: ReactNode;
  onCountry: (c: CountryCode) => void;
  onProvince: (p: ProvinceCode | null) => void;
  onStorageDays: (d: number) => void;
  onMethod: (m: MethodChoice) => void;
  onCartToggle: () => void;
}) {
  const [placeOpen, setPlaceOpen] = useState(false);
  // その宛先で値段が付かない便を出すか。**既定は隠す**——20個の選択肢のうち、
  // 押しても何も起きない項目が灰色で混ざっていると、選べる範囲そのものが読めない。
  // 「無い」と「選べない」を混同しないための開示（docs/UI-DESIGN.md）は、消すのではなく
  // 「Show N not priced for …」の1行に畳んで、開けば従来どおり理由付きで見えるようにする。
  const [unpricedOpen, setUnpricedOpen] = useState(false);
  // 開閉のあとにフォーカスを移す先（描画後に1回だけ使う）。
  const focusNext = useRef<string | null>(null);
  const setFocusId = (id: string) => { focusNext.current = id; };
  useEffect(() => {
    const id = focusNext.current;
    if (!id) return;
    focusNext.current = null;
    document.getElementById(id)?.focus();
  }, [placeOpen, country, province]);

  const w = items.reduce((s, i) => s + (i.weightG ?? 0) * Math.max(1, i.qty), 0);
  const anyEst = items.some((i) => i.weightOrigin !== 'user');
  const countryName = COUNTRIES[country].name;
  const avg = `${(CA_PROVINCE_AVERAGE_RATE * 100).toFixed(1)}%`;
  const courierCount = COURIER_METHODS.filter((m) => courierMethodAvailable(m.id, country)).length;
  // 郵便5方式は全宛先で価格化済み。宅配便だけが宛先で割れる（`courierMethodAvailable`）。
  const priced = (id: PostalMethod | CourierMethod) => !id.startsWith('courier-')
    || courierMethodAvailable(id as CourierMethod, country);
  const pricedGroups = methodGroups(priced);
  const unpricedGroups = methodGroups((id) => !priced(id));
  const unpricedCount = unpricedGroups.reduce((s, g) => s + g.methods.length, 0);
  // **既定の選択肢は運送会社**（オーナー確定 2026-09-16）。便を20個並べると、
  // 細かい便はたいてい1社しか扱っていないので、選んだ瞬間に他社が全部
  // 「比べられません」になって比較が成立しない（`Lowcost` は ZenMarket だけ）。
  const carrierOpts = carrierChoices(priced);
  const availCarriers = carrierOpts.filter((c) => c.available);
  const unavailCarriers = carrierOpts.filter((c) => !c.available);
  const chosenCarrier = carrierIdOfChoice(method);
  /** いま指名されている便（会社指定・既定のときは無い）。 */
  const chosenService: PostalMethod | CourierMethod | null =
    method === 'cheapest' || method.startsWith('carrier:')
      ? null
      : (method as PostalMethod | CourierMethod);
  // 便の指名は**押したときだけ**出す。挙動（グループ分け・未価格は畳む）は今まで通り。
  const [byService, setByService] = useState(false);
  const showServices = byService || chosenService != null;
  // 選ばれている便／社がその宛先で価格化されていないとき（宛先を変えた直後など）は、
  // 畳んだままだと `<select>` が自分の値を表示できない。そのときは開いた状態で出す。
  const showUnpriced = showServices
    ? unpricedOpen || (chosenService != null && !priced(chosenService))
    : unpricedOpen || (chosenCarrier != null && unavailCarriers.some((c) => c.id === chosenCarrier));

  return (
    <section className="waybill" id="waybill" aria-label="Conditions" data-testid="conditions-bar">
      <div className="wb" data-testid="destination-cell">
        <span className="lbl" id="wPlaceL">
          Ship to{country === 'CA' ? ' · province' : ''}{' '}
          {country === 'CA' && !province && (
            <Mark
              title="Province not chosen"
              label="About: the tax used until you pick one"
              body={(
                <>
                  <p>Canada charges a different provincial tax by province. Until you pick one we use a population-weighted average ({avg}), marked as our estimate.</p>
                  {provinceLine && (
                    <p>Now in the total: {provinceLine.amount == null ? 'not published' : yen(provinceLine.amount)} ({provinceLine.tier}).</p>
                  )}
                </>
              )}
            />
          )}
        </span>
        {placeOpen ? (
          <span className="wpick">
            <select
              id="wCountry"
              className="wsel"
              aria-label="Ship to"
              value={country}
              onChange={(e) => {
                const k = e.target.value as CountryCode;
                setFocusId(k === 'CA' ? 'wProv' : 'wPlace');
                if (k !== 'CA') setPlaceOpen(false);
                onCountry(k);
              }}
            >
              {COUNTRY_ORDER.map((k) => <option key={k} value={k}>{COUNTRIES[k].name}</option>)}
            </select>
            {country === 'CA' && (
              <select
                id="wProv"
                className={`wsel ${province ? '' : 'est'}`}
                aria-label="Province"
                value={province ?? ''}
                onChange={(e) => {
                  onProvince(e.target.value === '' ? null : (e.target.value as ProvinceCode));
                  setPlaceOpen(false);
                  setFocusId('wPlace');
                }}
              >
                <ProvinceOptions avg={avg} />
              </select>
            )}
            <button type="button" className="link" id="wPlaceDone" onClick={() => { setPlaceOpen(false); setFocusId('wPlace'); }}>
              Done
            </button>
          </span>
        ) : (
          <button
            type="button"
            className="wcart wplacebtn"
            id="wPlace"
            aria-expanded={false}
            aria-describedby="wPlaceL"
            aria-label={`Destination: ${countryName}${country === 'CA' ? (province ? `, ${CA_PROVINCES[province].name}` : ' (average tax rate until you pick)') : ''}`}
            onClick={() => { setPlaceOpen(true); setFocusId('wCountry'); }}
          >
            {countryName}
            {country === 'CA' && (
              <> · {province ? CA_PROVINCES[province].name : <span className="est">province ≈ avg</span>}</>
            )}
          </button>
        )}
      </div>

      <div className="wb">
        <label className="lbl" htmlFor="wStore">
          Storage{' '}
          <Mark
            title="Storage days"
            body={<p>How long the forwarder holds your items before shipping. 45 days is <b>our assumption</b> (people usually collect several orders), not a published figure. Change it and the ranking recomputes.</p>}
          />
        </label>
        <span className="wv">
          <input
            id="wStore"
            className="wnum"
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={storageDays}
            aria-label="Days kept in the warehouse before shipping"
            onChange={(e) => {
              const n = Math.trunc(Number(e.target.value));
              if (Number.isFinite(n) && n >= 0) onStorageDays(n);
            }}
          />{' '}
          <span className={`wsub ${storageDays === 45 ? 'est' : ''}`}>
            days{storageDays === 45 ? ' · our default' : ''}
          </span>
        </span>
      </div>

      <div className="wb">
        <label className="lbl" htmlFor="ship-by-select">
          Ship by{' '}
          <Mark
            title="How methods are compared"
            body={(
              <>
                <p>&ldquo;Cheapest that fits&rdquo; picks, for each service, the cheapest method that can carry this parcel — so rows may use different methods. Surface mail (1–3 months) is never picked; it&rsquo;s shown inside each row instead.</p>
                <p>Priced here: {POSTAL_METHODS.length} Japan Post methods and {courierCount} courier services for {countryName}. We never check a parcel&rsquo;s size, and an oversize one is refused however light.</p>
                {scopeNote}
              </>
            )}
          />
        </label>
        <select
          id="ship-by-select"
          className="wsel"
          value={method}
          onChange={(e) => onMethod(e.target.value as MethodChoice)}
        >
          <option value="cheapest">Cheapest that fits — per service</option>
          {!showServices && availCarriers.map((c) => (
            <option key={c.id} value={c.value}>{c.name}</option>
          ))}
          {!showServices && showUnpriced && unavailCarriers.map((c) => (
            <option key={c.id} value={c.value} disabled>
              {`${c.name} · ${notAvailableFor(country)}`}
            </option>
          ))}
          {showServices && pricedGroups.map((g) => (
            <optgroup key={g.carrier} label={g.carrier}>
              {g.methods.map((m) => (
                <option key={m.id} value={m.id} title={methodRawNote(m.id)}>
                  {`${m.service} · ${m.days}${m.tracked ? '' : ` · ${UNTRACKED}`}`}
                </option>
              ))}
            </optgroup>
          ))}
          {showServices && showUnpriced && unpricedGroups.map((g) => (
            <optgroup key={g.carrier} label={g.carrier}>
              {g.methods.map((m) => (
                <option key={m.id} value={m.id} disabled title={methodRawNote(m.id)}>
                  {`${m.service} · ${notPricedFor(country)}`}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {/* 便の指名は既定では出さない。押したときだけ、今までの一覧をそのまま出す。 */}
        <button
          type="button"
          className="link wshowmore"
          id="ship-by-services"
          data-testid="ship-by-services-toggle"
          aria-expanded={showServices}
          aria-controls="ship-by-select"
          onClick={() => {
            // 便の一覧を閉じるときは、指名していた便を持ち越さない——閉じた一覧の
            // 中にしか無い値を `<select>` が表示できなくなる。既定へ戻す。
            if (showServices && chosenService != null) onMethod('cheapest');
            setByService((v) => !v);
            setUnpricedOpen(false);
          }}
        >
          {showServices ? 'Choose a carrier' : 'Choose a specific service'}
        </button>
        {(showServices ? unpricedCount > 0 : unavailCarriers.length > 0) && (
          <button
            type="button"
            className="link wshowmore"
            id="ship-by-unpriced"
            data-testid="ship-by-unpriced-toggle"
            aria-expanded={showUnpriced}
            aria-controls="ship-by-select"
            onClick={() => setUnpricedOpen((v) => !v)}
          >
            {showUnpriced ? 'Hide' : 'Show'}{' '}
            {showServices
              ? `${unpricedCount} ${notPricedFor(country)}`
              : `${unavailCarriers.length} ${notAvailableFor(country)}`}
          </button>
        )}
      </div>

      <div className="wb">
        <span className="lbl">Cart</span>
        <button
          type="button"
          className="wcart"
          id="wCart"
          data-testid="conditions-cart-summary"
          aria-describedby="wCartSub"
          aria-controls="cart"
          aria-expanded={cartOpen}
          onClick={onCartToggle}
        >
          {items.length} item{items.length === 1 ? '' : 's'} · {anyEst ? '≈' : ''}{grams(w)}
        </button>
        <span className="wsub" id="wCartSub">net, before packing · {cartOpen ? 'editing below' : 'Edit cart'}</span>
      </div>
    </section>
  );
}

/**
 * 州の選択肢。文言は旧 `ProvincePicker` のまま（`e2e/taxes.spec.ts` が
 * 「we estimate {avg}」を一言一句で掴んでいる）。率をその場に出すのは、選ぶ前に
 * 何が変わるかを見せるため。並びは `CA_PROVINCES` の宣言順。
 */
export function ProvinceOptions({ avg }: { avg: string }) {
  return (
    <>
      <option value="">Not chosen — we estimate {avg}</option>
      {PROVINCE_CODES.map((c) => {
        const p = CA_PROVINCES[c];
        return (
          <option key={c} value={c}>
            {p.name}
            {p.taxName ? ` — ${p.taxName} ${+(p.rate * 100).toFixed(3)}%` : ' — no provincial tax at the border'}
          </option>
        );
      })}
    </>
  );
}
