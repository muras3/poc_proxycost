'use client';

import { useState } from 'react';
import { flushSync } from 'react-dom';
import { AdSlot } from '@/components/chrome/AdSlot';
import { courierMethodAvailable } from '@/lib/pricing/postage';
import { COUNTRIES } from '@/lib/pricing/countries';
import type { CompareResult, CountryCode, Item, Line, ProvinceCode } from '@/lib/pricing/types';
import { AddBar } from './AddBar';
import { Cart, weightInputId } from './Cart';
import { CostTable } from './CostTable';
import { EmsOnlyNote } from './EmsOnlyNote';
import { Heft } from './Heft';
import { PopoverProvider } from './Popover';
import { Results } from './Results';
import { Waybill, type MethodChoice } from './Waybill';
import { WhatCouldBeOff } from './WhatCouldBeOff';
import { useCompare, type Draft } from './useCompare';

/**
 * 比較画面の結線。並びは Mock v3 のまま:
 * 商品追加 → 条件欄（waybill）→ 秤（heft）→ 結果（要約・段1の1行・常時アイコン・順位ボード）
 * → カート（たたんだ1行）→ 全社費目表・What could be off（折りたたみ）→ 広告 → フッター。
 * 数値・順位は `useCompare`（＝`compare()`）が返すものをそのまま描く。
 */
export function Calculator() {
  const {
    items, country, province, method, storageDays, seq, unpriced, result, dispatch,
  } = useCompare();
  // URL 取得で確定値になった項目の取得日。Item に日付欄が無いのでここで持つ。
  const [readOn, setReadOn] = useState<Record<string, string>>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  function onAdd(draft: Draft) {
    if (draft.priceTier === 'fixed') {
      const id = `i${seq}`;
      setReadOn((prev) => ({ ...prev, [id]: new Date().toISOString().slice(0, 10) }));
    }
    dispatch({ type: 'add', draft });
  }

  function setCountry(c: CountryCode) {
    dispatch({ type: 'country', country: c });
    // 行き先で価格化の無い宅配便を選んだままにしない（Mock `setCountry` と同じ）。
    if (method !== 'cheapest' && method.startsWith('courier-') && !courierMethodAvailable(method as never, c)) {
      dispatch({ type: 'method', method: 'cheapest' });
    }
  }

  function focusMethod() {
    const el = document.getElementById('ship-by-select');
    el?.scrollIntoView({ block: 'center' });
    el?.focus();
  }

  /** その品の重量入力へ。畳まれていれば開き、その描画を同期で終えてから focus() する。 */
  function focusWeight(id: string) {
    flushSync(() => setCartOpen(true));
    const el = document.getElementById(weightInputId(id));
    if (el instanceof HTMLInputElement) {
      el.scrollIntoView({ block: 'center' });
      el.focus();
      el.select();
    }
  }

  function toggleCart() {
    const next = !cartOpen;
    flushSync(() => setCartOpen(next));
    if (next) document.getElementById('cart')?.scrollIntoView({ block: 'start' });
  }

  const priced = items.filter((i) => !unpriced.includes(i.id));
  const cheapest = result.rows.find((r) => r.comparable && r.cheapest) ?? null;
  const provinceLine = result.rows[0]?.lines.find((l) => l.key === 'province-tax') ?? null;
  const onMethod = (m: MethodChoice) => dispatch({ type: 'method', method: m });

  return (
    <PopoverProvider>
      <AddBar onAdd={onAdd} onPending={setPending} manualOpen={manualOpen} onManualOpen={setManualOpen} />

      <Waybill
        country={country}
        province={province}
        storageDays={storageDays}
        method={method}
        items={items}
        cartOpen={cartOpen}
        provinceLine={provinceLine}
        scopeNote={priced.length > 0 ? <EmsOnlyNote result={result} country={country} /> : null}
        onCountry={setCountry}
        onProvince={(p: ProvinceCode | null) => dispatch({ type: 'province', province: p })}
        onStorageDays={(d) => dispatch({ type: 'storageDays', storageDays: d })}
        onMethod={onMethod}
        onCartToggle={toggleCart}
      />

      <Heft row={priced.length ? cheapest : null} items={priced} />

      {items.length === 0 && !pending ? (
        <EmptyState country={country} onManual={() => setManualOpen(true)} />
      ) : priced.length === 0 ? (
        <div className="norank" role="status">
          <h3>Enter a price to compare</h3>
          <p>None of the items in your cart has a price yet. Type one in the cart below.</p>
        </div>
      ) : (
        <Results
          result={result}
          country={country}
          province={province}
          method={method}
          items={items}
          priced={priced}
          onFocusMethod={() => { onMethod('cheapest'); focusMethod(); }}
          onFocusWeight={focusWeight}
          onProvince={(p) => dispatch({ type: 'province', province: p })}
        />
      )}

      <Cart
        items={items}
        readOn={readOn}
        unpriced={unpriced}
        sensitivity={result.weightSensitivity}
        pending={pending}
        open={cartOpen}
        onToggle={toggleCart}
        onPatch={(id: string, patch: Partial<Item>) => dispatch({ type: 'patch', id, patch })}
        onRemove={(id: string) => {
          dispatch({ type: 'remove', id });
          if (items.length <= 1) setCartOpen(false); // 空になったら「編集中」を残さない
        }}
        onFocusWeight={focusWeight}
      />

      {priced.length > 0 && result.rows.some((r) => r.comparable) && (
        <Folds result={result} />
      )}

      {priced.length > 0 && result.rows.some((r) => r.comparable) && <AdSlot />}
    </PopoverProvider>
  );
}

/**
 * 折りたたみ2つ（Mock v3 `details.fold`）。既定は閉じていて、見出しと件数だけが見える。
 * 中身（表・一覧）は `CostTable` / `WhatCouldBeOff` のもの。件数は行の費目から数える。
 */
function Folds({ result }: { result: CompareResult }) {
  const rows = result.rows;
  const keys = new Set<string>();
  for (const r of rows) for (const l of r.lines) keys.add(l.key);
  const comparable = rows.filter((r) => r.comparable).flatMap((r) => r.lines);
  const uniq = (f: (l: Line) => boolean) => new Set(comparable.filter(f).map((l) => l.label)).size;
  const offCount = uniq((l) => l.tier === 'estimate') + uniq((l) => l.tier === 'unverified') + uniq((l) => l.amount == null);
  return (
    <div id="folds">
      <details className="fold" id="all-fees">
        <summary data-testid="breakdown-toggle">
          <h2>All fees, side by side</h2>
          <span className="lbl">{keys.size} fees × {rows.length} rows</span>
        </summary>
        <CostTable result={result} />
      </details>
      <details className="fold" id="what-could-be-off">
        <summary>
          <h2>What could be off</h2>
          <span className="lbl">{offCount} fees</span>
        </summary>
        <WhatCouldBeOff result={result} />
      </details>
    </div>
  );
}

/** 空のカート（Mock v3 `.empty`）。3つの入口と、その後に何が起きるかの1行。 */
function EmptyState({ country, onManual }: { country: CountryCode; onManual: () => void }) {
  return (
    <>
      <div className="empty" role="group" aria-label="How to start">
        <div>
          <div className="n">1</div>
          <h3>Paste a listing</h3>
          <p>Copy the URL of one item on Yahoo! Auctions, Mercari, Rakuten, Suruga-ya… into the box above. We read its price.</p>
          <button type="button" className="link" onClick={() => document.getElementById('q')?.focus()}>Go to the box</button>
        </div>
        <div>
          <div className="n">2</div>
          <h3>Or search</h3>
          <p>Type a keyword (日本語 OK). You pick from results; their prices are reference prices.</p>
          <button type="button" className="link" onClick={() => document.getElementById('q')?.focus()}>Search by keyword</button>
        </div>
        <div>
          <div className="n">3</div>
          <h3>Or type it in</h3>
          <p>Name and price by hand, when a page can&rsquo;t be read.</p>
          <button type="button" className="link" onClick={onManual}>Add by hand</button>
        </div>
      </div>
      <p className="emptyfoot">
        Then we price the same cart at Buyee, ZenMarket, Neokyo, FROM JAPAN and Jauce, landed in {COUNTRIES[country].name}.
      </p>
    </>
  );
}
