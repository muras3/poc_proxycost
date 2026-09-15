'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { COUNTRIES, CA_PROVINCES, CA_PROVINCE_AVERAGE_RATE, PROVINCE_CODES } from '@/lib/pricing/countries';
import { COURIER_METHODS, POSTAL_METHODS, courierMethodAvailable } from '@/lib/pricing/postage';
import type {
  CountryCode, CourierMethod, Item, Line, PostalMethod, ProvinceCode,
} from '@/lib/pricing/types';
import { grams, yen } from '@/lib/ui/format';
import { Mark } from './Popover';

export type MethodChoice = PostalMethod | CourierMethod | 'cheapest';
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
            aria-label={`Destination: ${countryName}${country === 'CA' ? (province ? `, ${CA_PROVINCES[province].name}` : ', province not chosen') : ''}`}
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
          <optgroup label="Japan Post">
            {POSTAL_METHODS.map((m) => (
              <option key={m.id} value={m.id}>
                {`${m.label} · ${m.days}${m.tracked ? '' : ' · no tracking'}`}
              </option>
            ))}
          </optgroup>
          <optgroup label="Courier">
            {COURIER_METHODS.map((m) => {
              const ok = courierMethodAvailable(m.id, country);
              return (
                <option key={m.id} value={m.id} disabled={!ok}>
                  {ok ? `${m.label} · ${m.days}` : `${m.label} · not priced for ${countryName}`}
                </option>
              );
            })}
          </optgroup>
        </select>
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
