'use client';

import Link from 'next/link';
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { flushSync } from 'react-dom';
import { ASSUMED_DOMESTIC_SHIPPING_YEN } from '@/lib/pricing/compare';
import { weightFieldsFor } from '@/lib/pricing/weights';
import type { Item, SiteId, WeightSensitivity } from '@/lib/pricing/types';
import { Amount, tierClass, tierTitle } from '@/lib/ui/tiers';
import { grams } from '@/lib/ui/format';

/** 重量入力の DOM id。StabilityNote の「Check the weights」がここへフォーカスを飛ばす。 */
export function weightInputId(itemId: string): string {
  return `weight-${itemId}`;
}

/** 親（StabilityNote の「Check the weights」）から呼ぶ命令。 */
export interface ItemListHandle {
  /** その品の重量入力へフォーカスを飛ばす。カートが畳まれていれば開いてから。 */
  focusWeight(itemId: string): void;
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
function toYen(text: string): number | null {
  const digits = text.replace(/[^\d]/g, '');
  return digits === '' ? null : Number(digits);
}

export interface ItemListProps {
  items: Item[];
  /** URL 取得で確定値になった項目の取得日（項目 id → 'YYYY-MM-DD'）。 */
  readOn: Record<string, string>;
  /** 価格をまだ貰えていない項目の id。価格欄は空のまま開く（docs/UI-DESIGN.md §2）。 */
  unpriced: string[];
  /** 項目 id → その品の重量だけで1位が替わるか（compare() の weightSensitivity）。 */
  sensitivity: Record<string, WeightSensitivity>;
  onPatch: (id: string, patch: Partial<Item>) => void;
  onRemove: (id: string) => void;
  ref?: Ref<ItemListHandle>;
}

export function ItemList({
  items, readOn, unpriced, sensitivity, onPatch, onRemove, ref,
}: ItemListProps) {
  // モバイルではカートを畳む（docs/UI-DESIGN.md §7.2）。lg 以上では常に開く。
  const [open, setOpen] = useState(false);
  const count = items.length;
  const seen = useRef(count);
  useEffect(() => {
    // 追加・削除があったら開く。「編集時に開く」を自動でやる。
    if (seen.current !== count) {
      seen.current = count;
      setOpen(true);
    }
  }, [count]);

  // 「Check the weights」から飛んでくる。畳まれたカートの中の入力にはフォーカス
  // できないので、まず開き、その描画を同期で終えてから focus() する。
  // クリックのハンドラから呼ばれるので flushSync を使ってよい（描画中ではない）。
  useImperativeHandle(ref, () => ({
    focusWeight(itemId: string) {
      flushSync(() => setOpen(true));
      const el = document.getElementById(weightInputId(itemId));
      if (el instanceof HTMLInputElement) {
        el.focus();
        el.select();
      }
    },
  }), []);

  if (!count) return null;

  return (
    <section className="mt-4" aria-label="Cart">
      {/* lg 以上ではカートは常に開いている。押せないボタンを残すと
          キーボード利用者には反応しない操作子に見えるので、見出しに変える。 */}
      <h2 className="hidden text-xs font-semibold uppercase tracking-wide text-neutral-500 lg:block">
        Cart ({count})
      </h2>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 lg:hidden"
      >
        Cart ({count})
        <span aria-hidden>{open ? '▾' : '▸'}</span>
      </button>

      <ul
        className={`${open ? 'block' : 'hidden lg:block'} divide-y divide-neutral-200 dark:divide-neutral-800`}
      >
        {items.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            readOn={readOn[item.id] ?? null}
            priceUnknown={unpriced.includes(item.id)}
            sensitivity={sensitivity[item.id] ?? null}
            onPatch={onPatch}
            onRemove={onRemove}
          />
        ))}
      </ul>
    </section>
  );
}

/** 1点の重量だけを動かしたときの、片端の結果を1句にする。 */
function endText(label: string | null, onlyPriced: boolean, g: number): string {
  // 表の外に出た端を「最安」と書かない（compare() の rankStable と同じ規則）。
  if (label == null) return `no published EMS rate at ${grams(g)}`;
  if (onlyPriced) return `only ${label} can still be priced at ${grams(g)}`;
  return `${label} at ${grams(g)}`;
}

/** P25–P75 を1句にする。幅が無いラインは「全部同じ値」と書く（0 や空にしない）。 */
function rangeText([lo, hi]: [number, number]): string {
  return lo === hi
    ? `middle half of listings: all ${grams(lo)}`
    : `middle half of listings: ${grams(lo)}–${grams(hi)}`;
}

function ItemRow({
  item, readOn, priceUnknown, sensitivity, onPatch, onRemove,
}: {
  item: Item;
  readOn: string | null;
  priceUnknown: boolean;
  sensitivity: WeightSensitivity | null;
  onPatch: ItemListProps['onPatch'];
  onRemove: ItemListProps['onRemove'];
}) {
  // 価格が読めなかった項目は空欄で開く。0 を初期値にすると「無料」と読まれる。
  const [price, setPrice] = useState(priceUnknown ? '' : String(item.priceYen));
  const [edited, setEdited] = useState(false);
  const [domestic, setDomestic] = useState(
    item.domesticShippingYen == null ? '' : String(item.domesticShippingYen),
  );
  // 重量欄は常に数字が入っている（表の中央値か仮置きか利用者の値）。空欄で開かない。
  const [weight, setWeight] = useState(item.weightG == null ? '' : String(item.weightG));

  const priceLabel = `Price of ${item.title}`;
  const weightLabel = `Weight in grams of ${item.title}`;
  const weightNoteId = `${weightInputId(item.id)}-note`;

  function commitPrice(text: string) {
    setPrice(text);
    const v = toYen(text);
    if (v == null) return; // 入力中の空欄。**0 を送らない。**
    setEdited(true);
    // 利用者が触った数字は推定。確定値のふりをさせない（docs/UI-DESIGN.md §2）。
    onPatch(item.id, { priceYen: v, priceTier: 'estimate' });
  }

  function commitDomestic(text: string) {
    setDomestic(text);
    // 空欄は「不明」。null を送れば compare() が ~¥800 の仮定に落ちる。
    onPatch(item.id, { domesticShippingYen: toYen(text) });
  }

  function commitWeight(text: string) {
    setWeight(text);
    const g = toYen(text);
    if (g == null || g <= 0) return; // 入力中。0 g の小包は無いので 0 も送らない。
    // 利用者が入れた数字は利用者のもの。表の出所・幅・リンクは外し、compare() も動かさない。
    onPatch(item.id, {
      weightG: g, weightTier: 'estimate', weightOrigin: 'user',
      weightSource: null, weightRangeG: null, weightLineId: null,
    });
  }

  function resetWeight() {
    // 表の中央値（当たらなければ仮置き）に戻す。何に戻るかはボタンの文字に書いてある。
    const w = weightFieldsFor(item.title);
    setWeight(String(w.weightG));
    onPatch(item.id, w);
  }

  // 「reset to ~439 g」の数字。利用者が上書きした後も、元の推定が何だったかを出す。
  const estimate = item.weightOrigin === 'user' ? weightFieldsFor(item.title) : null;

  return (
    <li className="flex gap-3 py-3">
      {item.imageUrl ? (
        // 出品画像のドメインは無数にあるので next/image は使えない。
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.imageUrl}
          alt=""
          className="h-14 w-14 shrink-0 rounded border border-neutral-200 object-cover dark:border-neutral-800"
        />
      ) : (
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded border border-dashed border-neutral-300 text-[10px] text-neutral-500 dark:text-neutral-400 dark:border-neutral-700">
          no image
        </span>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 text-sm">
            {item.url ? (
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                {item.title}
              </a>
            ) : (
              item.title
            )}
          </p>
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            aria-label={`Remove ${item.title}`}
            className="shrink-0 px-1 text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            ✕
          </button>
        </div>

        {/* 価格。編集可能。確度は §6 の規定どおり色と記号で出す。 */}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <label className="flex items-center gap-1 text-sm">
            <span className="sr-only">{priceLabel}</span>
            <span className={tierClass[item.priceTier]} title={tierTitle[item.priceTier]}>
              {item.priceTier === 'estimate' ? '~¥' : '¥'}
            </span>
            <input
              value={price}
              onChange={(e) => commitPrice(e.target.value)}
              onBlur={() => {
                // 空欄のまま離れたら元の数字に戻す。0 で計算させない。
                // まだ価格を貰えていない項目には戻す数字が無いので空欄のまま置く。
                if (toYen(price) == null && !priceUnknown) setPrice(String(item.priceYen));
              }}
              inputMode="numeric"
              aria-label={priceLabel}
              className={`w-20 rounded border border-neutral-300 bg-transparent px-1.5 py-0.5 text-sm num dark:border-neutral-700 ${tierClass[item.priceTier]}`}
            />
            {edited && (
              <span className={tierClass.estimate} title={tierTitle.estimate} aria-label="edited by you">
                ✎
              </span>
            )}
          </label>

          <span className="flex items-center gap-1 text-xs text-neutral-500">
            <button
              type="button"
              onClick={() => onPatch(item.id, { qty: Math.max(1, item.qty - 1) })}
              aria-label={`One fewer of ${item.title}`}
              className="h-6 w-6 rounded border border-neutral-300 dark:border-neutral-700"
            >
              −
            </button>
            <span className="w-6 text-center num text-neutral-900 dark:text-neutral-100">
              {item.qty}
            </span>
            <button
              type="button"
              onClick={() => onPatch(item.id, { qty: item.qty + 1 })}
              aria-label={`One more of ${item.title}`}
              className="h-6 w-6 rounded border border-neutral-300 dark:border-neutral-700"
            >
              +
            </button>
          </span>
        </div>

        {/* どのサイトの、どういう出どころの数字かを常に書く。 */}
        <p className="mt-1 text-xs text-neutral-500">
          <span className="rounded border border-neutral-300 px-1 py-0.5 dark:border-neutral-700">
            {SITE_NAMES[item.site]}
          </span>{' '}
          {priceUnknown ? (
            // 総額に入っていないことをこの行で言う。黙って外すと総額が安く見える。
            <span className={tierClass.none}>
              price not shown — type it in. Not counted until you do
            </span>
          ) : edited ? (
            <span className={tierClass.estimate}>edited by you</span>
          ) : item.priceTier === 'fixed' ? (
            <span>listing page{readOn ? ` · read ${readOn}` : ''}</span>
          ) : (
            <>
              <span className={tierClass.estimate}>reference price</span>
              {' — '}
              paste the listing URL above for the exact one
            </>
          )}
        </p>

        {/* 重量。**常に数字が入っていて、常に直せる。**出どころ（表のライン／仮置き／利用者）を
            横に書き、その品の重量だけで1位が替わるなら、その下で名指しする。
            推定は ~ と琥珀色、利用者編集はさらに ✎（docs/UI-DESIGN.md §6）。 */}
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-500">
          <label className="flex items-center gap-1">
            <span className="sr-only">{weightLabel}</span>
            <span aria-hidden>weight</span>
            <span className={tierClass.estimate} title={tierTitle.estimate} aria-hidden>~</span>
            <input
              id={weightInputId(item.id)}
              value={weight}
              onChange={(e) => commitWeight(e.target.value)}
              onBlur={() => {
                // 空欄・0 のまま離れたら元の数字に戻す。重量 0 で計算させない。
                const g = toYen(weight);
                if ((g == null || g <= 0) && item.weightG != null) setWeight(String(item.weightG));
              }}
              inputMode="numeric"
              aria-label={weightLabel}
              aria-describedby={weightNoteId}
              className={`w-16 rounded border border-neutral-300 bg-transparent px-1.5 py-0.5 text-xs num dark:border-neutral-700 ${tierClass.estimate}`}
            />
            <span aria-hidden>g</span>
            {item.weightOrigin === 'user' && (
              <span className={tierClass.estimate} title={tierTitle.estimate} aria-label="edited by you">
                ✎
              </span>
            )}
          </label>

          <span id={weightNoteId} className="min-w-0">
            {item.weightOrigin === 'user' ? (
              <>
                <span className={tierClass.estimate}>entered by you</span>
                {estimate && (
                  <>
                    {' · '}
                    <button type="button" onClick={resetWeight} className="underline">
                      {estimate.weightOrigin === 'assumed'
                        ? `reset to the assumed ~${grams(estimate.weightG!)}`
                        : `reset to ~${grams(estimate.weightG!)}`}
                    </button>
                  </>
                )}
              </>
            ) : item.weightOrigin === 'assumed' ? (
              <>
                {/* 何も知らない。そう書く。段表に落とすのをやめた分、ここで言う。 */}
                <span className={tierClass.estimate}>assumed</span>
                {' — no weight data for this title. Type it if you know it. '}
                <Link href="/weights" className="underline">
                  What we have
                </Link>
              </>
            ) : (
              <>
                <Link
                  href={item.weightLineId ? `/weights#${item.weightLineId}` : '/weights'}
                  className="hover:underline"
                >
                  {item.weightSource ?? 'our weight table'}
                </Link>
                {item.weightRangeG && <> · {rangeText(item.weightRangeG)}</>}
              </>
            )}
          </span>
        </div>

        {/* この品の重量だけで1位が替わる。記号 ⚠ と色の両方で出す（色だけに頼らない）。
            数字は compare() が出したもの。ハードコードしない。 */}
        {sensitivity?.decisive && (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
            <span aria-hidden>⚠ </span>
            This weight decides the cheapest:{' '}
            {endText(sensitivity.winnerAtLow, sensitivity.onlyPricedAtLow, sensitivity.lowG)},{' '}
            {endText(sensitivity.winnerAtHigh, sensitivity.onlyPricedAtHigh, sensitivity.highG)}.
          </p>
        )}

        {/* 国内送料。送料込み出品は全社に等しく効くので1位は動かないが、
            送金合計に率で乗る費目を持つ社（ZenMarket 3.5%）が中位で得をする。 */}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={item.freeShipping ?? false}
              onChange={(e) => onPatch(item.id, { freeShipping: e.target.checked })}
            />
            shipping included by seller
          </label>

          {item.freeShipping ? (
            <span>
              domestic <Amount amount={0} tier="fixed" />
            </span>
          ) : (
            <label className="flex items-center gap-1">
              <span className="sr-only">{`Domestic shipping for ${item.title}`}</span>
              domestic ¥
              <input
                value={domestic}
                onChange={(e) => commitDomestic(e.target.value)}
                inputMode="numeric"
                aria-label={`Domestic shipping for ${item.title}`}
                placeholder={String(ASSUMED_DOMESTIC_SHIPPING_YEN)}
                className="w-16 rounded border border-neutral-300 bg-transparent px-1.5 py-0.5 text-xs num dark:border-neutral-700"
              />
              {item.domesticShippingYen == null && (
                <span>
                  <Amount amount={ASSUMED_DOMESTIC_SHIPPING_YEN} tier="estimate" /> assumed —
                  paste the URL to know
                </span>
              )}
            </label>
          )}
        </div>
      </div>
    </li>
  );
}
