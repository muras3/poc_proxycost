'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ASSUMED_DOMESTIC_SHIPPING_YEN } from '@/lib/pricing/compare';
import { ASSUMED_WEIGHT_G, weightFieldsFor } from '@/lib/pricing/weights';
import { siteById } from '@/lib/search/sites';
import type { Item, SiteId, WeightSensitivity } from '@/lib/pricing/types';
import { grams } from '@/lib/ui/format';
import { Mark } from './Popover';
import { WeightNeedle } from './WeightNeedle';

/** 重量入力の DOM id。「Check」「Enter the real weight」がここへフォーカスを飛ばす。 */
export function weightInputId(itemId: string): string {
  return `weight-${itemId}`;
}

/** サイト名はロゴでなくドメイン表記のテキスト（docs/UI-DESIGN.md §2）。 */
const SITE_NAMES: Record<SiteId, string> = {
  'yahoo-auctions': 'auctions.yahoo.co.jp',
  mercari: 'mercari.com',
  rakuten: 'rakuten.co.jp',
  'yahoo-shopping': 'shopping.yahoo.co.jp',
  'amazon-jp': 'amazon.co.jp',
  'suruga-ya': 'suruga-ya.jp',
  mandarake: 'mandarake.co.jp',
  zozo: 'zozo.jp',
  hmv: 'hmv.co.jp',
  toranoana: 'toranoana.jp',
  other: 'unknown site',
};

/** 空文字は null。**空欄を 0 と読まない**（0 は「無料」という別の主張）。 */
function digits(text: string): number | null {
  const d = text.replace(/[^\d]/g, '');
  return d === '' ? null : Number(d);
}

/** 1点の重量だけを動かしたときの、片端の結果を1句にする（Mock `winnersText`）。 */
function endText(label: string | null, onlyPriced: boolean, g: number): string {
  if (label == null) return `no published rate at ${grams(g)}`;
  if (onlyPriced) return `only ${label} can still be priced at ${grams(g)}`;
  return `${label} at ${grams(g)}`;
}
export function winnersText(s: WeightSensitivity): string {
  return `${endText(s.winnerAtLow, s.onlyPricedAtLow, s.lowG)}, ${endText(s.winnerAtHigh, s.onlyPricedAtHigh, s.highG)}`;
}

export interface CartProps {
  items: Item[];
  /** URL 取得で確定値になった項目の取得日（項目 id → 'YYYY-MM-DD'）。 */
  readOn: Record<string, string>;
  /** 価格をまだ貰えていない項目の id。価格欄は空のまま開く。 */
  unpriced: string[];
  sensitivity: Record<string, WeightSensitivity>;
  /** 読み込み中の URL。カートの末尾に「Reading …」の行を出す。 */
  pending: string | null;
  open: boolean;
  onToggle: () => void;
  onPatch: (id: string, patch: Partial<Item>) => void;
  onRemove: (id: string) => void;
  /** その品の重量入力へ（カートを開いてから）。 */
  onFocusWeight: (id: string) => void;
}

/**
 * カート（Mock v3 `#cart`）。**既定はたたんだ1行**（`.cartline`）。畳んでいる間も、
 * 1位を決めている重量の品は赤い点と秤の針で名指しする。開くと `.item` の一覧。
 */
export function Cart({
  items, readOn, unpriced, sensitivity, pending, open, onToggle, onPatch, onRemove, onFocusWeight,
}: CartProps) {
  const n = items.length;
  if (!n && !pending) return null;

  const assumed = items.filter((i) => i.weightOrigin === 'assumed');
  const decisive = items.filter((i) => sensitivity[i.id]?.decisive);
  const unpricedItems = items.filter((i) => unpriced.includes(i.id));
  const wTot = items.reduce((s, i) => s + (i.weightG ?? 0) * Math.max(1, i.qty), 0);
  const anyEst = items.some((i) => i.weightOrigin !== 'user');
  const pendingText = pending ? pending.replace(/^https?:\/\//, '').slice(0, 40) : '';

  const line = (
    <div className="cartline">
      <span className="lbl">Cart</span>
      <span className="num">{n} item{n === 1 ? '' : 's'} · {anyEst ? '≈' : ''}{grams(wTot)}</span>
      {unpricedItems.length > 0 && (
        <span className="wsrc as">{unpricedItems.length} without a price — not in totals</span>
      )}
      {pending && (
        <span className="wsrc"><span className="spin" aria-hidden="true" /> Reading {pendingText}…</span>
      )}
      <button type="button" className="btn ghost" data-testid="cart-line" aria-expanded={open} aria-controls="cart-body" onClick={onToggle}>
        {open ? 'Done' : 'Edit cart'}
      </button>
    </div>
  );

  // 仮置き重量の1行（Mock v3 と同じく、カートを開いたときだけ。畳んだ行には決め手の品の赤い点が出る）。
  const assumedCond = assumed.length > 0 && (
    <p
      className="cond"
      data-testid="assumed-weights"
      data-count={assumed.length}
      data-total={n}
    >
      <span className="bang" aria-hidden="true">!</span>
      <span>
        {assumed.length === n
          ? (n === 1 ? 'The only item uses' : `All ${n} items use`)
          : `${assumed.length} of ${n} item${n === 1 ? '' : 's'} use`}
        {' '}a placeholder weight ({grams(ASSUMED_WEIGHT_G)} each) — the totals and the ranking rest on it
        {assumed.some((i) => sensitivity[i.id]?.decisive) ? ', and it decides the winner' : ''}.{' '}
        <button type="button" className="link" onClick={() => onFocusWeight(assumed[0]!.id)}>
          Enter the real weight
        </button>
      </span>
    </p>
  );

  if (!open) {
    const d = decisive[0];
    const s = d ? sensitivity[d.id] : undefined;
    return (
      <section id="cart" aria-label="Cart">
        {line}
        {d && s && (
          <p className="cond" style={{ borderTop: 0, paddingTop: 2 }} data-testid="cart-decisive-mark">
            <span className="hotdot" aria-hidden="true" />
            <span className="jp">「{d.title.slice(0, 22)}{d.title.length > 22 ? '…' : ''}」</span>
            {decisive.length > 1 && <span className="lbl">+{decisive.length - 1}</span>}
            <WeightNeedle
              label="This weight decides 1st place"
              body={<p><b>{d.title}</b> {d.weightOrigin === 'user' ? '' : '≈'}{grams(d.weightG ?? 0)}. Within {grams(s.lowG)}–{grams(s.highG)}: {winnersText(s)}.</p>}
            />{' '}
            <button type="button" className="link" onClick={() => onFocusWeight(d.id)}>Check</button>
          </p>
        )}
      </section>
    );
  }

  return (
    <section id="cart" aria-label="Cart">
      {line}
      <div aria-live="polite">
        {assumedCond}
        {unpricedItems.length > 0 && (
          <p className="cond">
            <span className="bang" aria-hidden="true">!</span>
            <span>
              {unpricedItems.length} item{unpricedItems.length === 1 ? ' has' : 's have'} no price yet and{' '}
              {unpricedItems.length === 1 ? 'is' : 'are'} not in the totals below.
            </span>
          </p>
        )}
      </div>
      <ul className="cartbody" id="cart-body">
        {items.map((it) => (
          <ItemRow
            key={it.id}
            item={it}
            readOn={readOn[it.id] ?? null}
            priceUnknown={unpriced.includes(it.id)}
            sensitivity={sensitivity[it.id] ?? null}
            onPatch={onPatch}
            onRemove={onRemove}
          />
        ))}
        {pending && (
          <li className="item pending" aria-busy="true">
            <span className="thumb" aria-hidden="true" />
            <div>
              <p className="ititle"><span className="spin" aria-hidden="true" /> Reading {pending.replace(/^https?:\/\//, '').slice(0, 48)}…</p>
              <span className="skel" style={{ width: '60%' }} />
              <span className="skel" style={{ width: '40%' }} />
            </div>
            <span />
          </li>
        )}
      </ul>
      <p className="cartfoot">
        <span>Solid line = from the listing · dashed = reference or table · dotted + ? = our placeholder</span>
        <span>
          {decisive.length
            ? `${decisive.length} weight${decisive.length === 1 ? '' : 's'} can change 1st place`
            : 'no single weight changes 1st place'}
        </span>
      </p>
    </section>
  );
}

function ItemRow({
  item, readOn, priceUnknown, sensitivity, onPatch, onRemove,
}: {
  item: Item;
  readOn: string | null;
  priceUnknown: boolean;
  sensitivity: WeightSensitivity | null;
  onPatch: CartProps['onPatch'];
  onRemove: CartProps['onRemove'];
}) {
  // 価格が読めなかった項目は空欄で開く。0 を初期値にすると「無料」と読まれる。
  const [price, setPrice] = useState(priceUnknown ? '' : String(item.priceYen));
  const [edited, setEdited] = useState(false);
  const [domestic, setDomestic] = useState(item.domesticShippingYen == null ? '' : String(item.domesticShippingYen));
  // 重量欄は常に数字が入っている（表の中央値か仮置きか利用者の値）。空欄で開かない。
  const [weight, setWeight] = useState(item.weightG == null ? '' : String(item.weightG));

  const auction = siteById(item.site).kind === 'auction';
  const pt = priceUnknown ? 't-none' : edited ? 't-user' : item.priceTier === 'fixed' ? 't-fixed' : 't-estimate';
  const wt = item.weightOrigin === 'assumed' ? 't-assumed' : item.weightOrigin === 'user' ? 't-user' : 't-estimate';
  const hot = !!sensitivity?.decisive;
  // 「reset to ≈439 g」の数字。利用者が上書きした後も、元の推定が何だったかを出す。
  const table = item.weightOrigin === 'user' ? weightFieldsFor(item.title) : null;

  function commitPrice(text: string) {
    setPrice(text);
    const v = digits(text);
    if (v == null) return; // 入力中の空欄。**0 を送らない。**
    setEdited(true);
    // 利用者が触った数字は推定。確定値のふりをさせない（docs/UI-DESIGN.md §2）。
    onPatch(item.id, { priceYen: v, priceTier: 'estimate' });
  }
  function commitWeight(text: string) {
    setWeight(text);
    const g = digits(text);
    if (g == null || g <= 0) return; // 0 g の小包は無いので 0 も送らない。
    onPatch(item.id, {
      weightG: g, weightTier: 'estimate', weightOrigin: 'user',
      weightSource: null, weightRangeG: null, weightLineId: null,
    });
  }
  function commitDomestic(text: string) {
    setDomestic(text);
    onPatch(item.id, { domesticShippingYen: digits(text) }); // 空欄は「不明」→ compare() が ≈¥800 に落とす
  }
  function resetWeight() {
    const w = weightFieldsFor(item.title);
    setWeight(String(w.weightG));
    onPatch(item.id, w);
  }

  const priceSrc = priceUnknown
    ? <span style={{ color: 'var(--red)' }}>price not shown — type it. Not counted until you do</span>
    : edited
      ? <span className="wsrc est">edited by you</span>
      : item.priceTier === 'fixed'
        ? <span className="wsrc">listing page{readOn ? ` · read ${readOn}` : ''}</span>
        : auction && item.url == null
          ? <span className="wsrc est">current bid — final price comes later</span>
          : <span className="wsrc est">reference price</span>;

  const weightHref = item.weightLineId ? `/weights#${item.weightLineId}` : '/weights';
  const wsrc = item.weightOrigin === 'assumed' ? (
    <>
      <span className="wsrc as">placeholder — no weight data for this title</span>{' '}
      <Mark
        q
        text="?"
        testId="assumed-mark"
        title="Placeholder weight"
        body={(
          <>
            <p>We have no weight data for this title, so {grams(ASSUMED_WEIGHT_G)} is <b>our number, not a measurement</b>. Type the real weight if you know it.</p>
            <p><Link href="/weights">What we have →</Link></p>
          </>
        )}
      />
    </>
  ) : item.weightOrigin === 'user' ? (
    <>
      <span className="wsrc">entered by you</span>
      {table?.weightG != null && (
        <>
          {' · '}
          <button type="button" className="link" onClick={resetWeight}>
            {table.weightOrigin === 'assumed'
              ? `reset to the placeholder ≈${grams(table.weightG)}`
              : `reset to ≈${grams(table.weightG)}`}
          </button>
        </>
      )}
    </>
  ) : (
    <>
      <Link className="wsrc est" href={weightHref}>{item.weightSource ?? 'our weight table'}</Link>{' '}
      <Mark
        title="Weight from our table"
        body={(
          <>
            <p>Median of <Link href={weightHref}>{item.weightSource ?? 'our weight table'}</Link>.</p>
            {item.weightRangeG && (
              <p>Middle half of listings: {item.weightRangeG[0] === item.weightRangeG[1]
                ? `all ${grams(item.weightRangeG[0])}`
                : `${grams(item.weightRangeG[0])}–${grams(item.weightRangeG[1])}`}. We test whether 1st place changes inside this range.</p>
            )}
          </>
        )}
      />
    </>
  );

  return (
    <li className={`item ${hot ? 'hot' : ''}`} data-id={item.id}>
      {item.imageUrl ? (
        // 出品画像のドメインは無数にあるので next/image は使えない。
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.imageUrl} alt="" className="thumb" style={{ objectFit: 'cover' }} />
      ) : (
        <span className="thumb" aria-hidden="true">img</span>
      )}
      <div style={{ minWidth: 0 }}>
        <p className="ititle">
          {item.url
            ? <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>{item.title}</a>
            : item.title}
        </p>
        <div className="imeta">
          <span className="chip">{SITE_NAMES[item.site]}</span>
          <label className={`fin ${pt}`}>
            <span className="u">{item.priceTier === 'estimate' && !priceUnknown && !edited ? '≈¥' : '¥'}</span>
            <input
              value={price}
              inputMode="numeric"
              aria-label={`Price of ${item.title}`}
              onChange={(e) => commitPrice(e.target.value)}
              onBlur={() => {
                // 空欄のまま離れたら元の数字に戻す。0 で計算させない。
                if (digits(price) == null && !priceUnknown) setPrice(String(item.priceYen));
              }}
            />
          </label>
          <span className="qty" role="group" aria-label="Quantity">
            <button type="button" aria-label={`One fewer of ${item.title}`} onClick={() => onPatch(item.id, { qty: Math.max(1, item.qty - 1) })}>−</button>
            <span className="num" aria-live="polite">{item.qty}</span>
            <button type="button" aria-label={`One more of ${item.title}`} onClick={() => onPatch(item.id, { qty: item.qty + 1 })}>+</button>
          </span>
          {priceSrc}
        </div>
        <div className="imeta">
          <label className={`fin ${wt}`}>
            <span className="u">{item.weightOrigin === 'user' ? '' : '≈'}</span>
            <input
              id={weightInputId(item.id)}
              value={weight}
              inputMode="numeric"
              aria-label={`Weight in grams of ${item.title}`}
              onChange={(e) => commitWeight(e.target.value)}
              onBlur={() => {
                const g = digits(weight);
                if ((g == null || g <= 0) && item.weightG != null) setWeight(String(item.weightG));
              }}
            />
            <span className="u">g</span>
          </label>
          {wsrc}
        </div>
        <div className="imeta">
          <label className="chk">
            <input
              type="checkbox"
              checked={item.freeShipping ?? false}
              onChange={(e) => onPatch(item.id, { freeShipping: e.target.checked })}
            />{' '}
            shipping included by seller
          </label>
          {item.freeShipping ? (
            <span>domestic ¥0</span>
          ) : (
            <>
              <label className={`fin ${item.domesticShippingYen == null ? 't-estimate' : 't-user'}`}>
                <span className="u">domestic ¥</span>
                <input
                  value={domestic}
                  inputMode="numeric"
                  placeholder={String(ASSUMED_DOMESTIC_SHIPPING_YEN)}
                  aria-label={`Domestic shipping for ${item.title}`}
                  onChange={(e) => commitDomestic(e.target.value)}
                />
              </label>
              {item.domesticShippingYen == null && <span className="wsrc est">≈¥{ASSUMED_DOMESTIC_SHIPPING_YEN} guess</span>}
            </>
          )}
        </div>
      </div>
      <button type="button" className="rm" aria-label={`Remove ${item.title}`} onClick={() => onRemove(item.id)}>Remove</button>
      {hot && sensitivity && (
        <p className="decisive" data-testid="decisive-note">
          <span className="bang" aria-hidden="true">!</span>
          <span>
            <b>This weight decides 1st place.</b> Within {grams(sensitivity.lowG)}–{grams(sensitivity.highG)}: {winnersText(sensitivity)}.
            {sensitivity.winnerAtLow === sensitivity.winnerAtHigh && (
              <>{' '}<span className="wsrc">the recommended set still changes at those two weights, even though the named winner reads the same</span></>
            )}
          </span>
        </p>
      )}
    </li>
  );
}
