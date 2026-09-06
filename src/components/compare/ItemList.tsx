'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ASSUMED_DOMESTIC_SHIPPING_YEN } from '@/lib/pricing/compare';
import type { Item, SiteId } from '@/lib/pricing/types';
import { Amount, tierClass, tierTitle } from '@/lib/ui/tiers';
import { grams } from '@/lib/ui/format';

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
  onPatch: (id: string, patch: Partial<Item>) => void;
  onRemove: (id: string) => void;
}

export function ItemList({ items, readOn, unpriced, onPatch, onRemove }: ItemListProps) {
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
            onPatch={onPatch}
            onRemove={onRemove}
          />
        ))}
      </ul>
    </section>
  );
}

function ItemRow({
  item, readOn, priceUnknown, onPatch, onRemove,
}: {
  item: Item;
  readOn: string | null;
  priceUnknown: boolean;
  onPatch: ItemListProps['onPatch'];
  onRemove: ItemListProps['onRemove'];
}) {
  // 価格が読めなかった項目は空欄で開く。0 を初期値にすると「無料」と読まれる。
  const [price, setPrice] = useState(priceUnknown ? '' : String(item.priceYen));
  const [edited, setEdited] = useState(false);
  const [domestic, setDomestic] = useState(
    item.domesticShippingYen == null ? '' : String(item.domesticShippingYen),
  );
  const [askWeight, setAskWeight] = useState(false);
  const [weight, setWeight] = useState('');

  const priceLabel = `Price of ${item.title}`;

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

  function commitWeight() {
    const g = toYen(weight);
    if (g == null || g <= 0) return;
    onPatch(item.id, { weightG: g, weightTier: 'estimate' });
    setAskWeight(false);
  }

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

        {/* 重量。当たらなければ「段ごとの総額」に落ちることを書く。**でっち上げない。** */}
        <p className="mt-1 text-xs text-neutral-500">
          {item.weightG == null ? (
            <>
              <span className={tierClass.none}>weight unknown</span>
              {' — we show a total per weight step. '}
              {askWeight ? (
                <span className="inline-flex items-center gap-1">
                  <input
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitWeight();
                    }}
                    inputMode="numeric"
                    aria-label={`Weight in grams of ${item.title}`}
                    placeholder="grams"
                    className="w-20 rounded border border-neutral-300 bg-transparent px-1.5 py-0.5 text-xs num dark:border-neutral-700"
                  />
                  <button type="button" onClick={commitWeight} className="underline">
                    Save
                  </button>
                </span>
              ) : (
                <button type="button" onClick={() => setAskWeight(true)} className="underline">
                  I know the weight
                </button>
              )}
            </>
          ) : (
            <>
              <Link href="/weights" className="hover:underline">
                <span className={tierClass[item.weightTier]}>
                  {item.weightTier === 'estimate' ? '~' : ''}
                  {grams(item.weightG)}
                </span>
                {item.weightSource ? ` · ${item.weightSource}` : ' · entered by you'}
              </Link>
              {!item.weightSource && (
                <>
                  {' · '}
                  <button
                    type="button"
                    onClick={() => onPatch(item.id, { weightG: null, weightTier: 'none' })}
                    className="underline"
                  >
                    clear
                  </button>
                </>
              )}
            </>
          )}
        </p>

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
