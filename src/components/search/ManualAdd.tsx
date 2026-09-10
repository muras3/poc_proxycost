'use client';

import { useState } from 'react';
import { SITES } from '@/lib/search/sites';
import type { SiteId } from '@/lib/pricing/types';
import type { Draft } from '@/components/compare/useCompare';

/**
 * 手入力の口。**これが無いと詰む経路がある** —
 * Brave のキーが未設定なら検索は使えず、URL 取得も相手が JSON-LD も OG も
 * 出していなければ落ちる。そのとき利用者に残る道がこれしかない。
 * 重量表に載らない商品名を入れれば、重量は 1,000 g の仮置きになり、カートでそう名乗る。
 */
export function ManualAdd({ onAdd }: { onAdd: (d: Draft) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [site, setSite] = useState<SiteId>('yahoo-auctions');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    const p = price.trim() === '' ? null : Number(price.replace(/[^\d]/g, ''));
    onAdd({
      title: t,
      // 手入力は我々の値でも店の値でもなく利用者の値。参考値として扱う。
      priceYen: p != null && Number.isFinite(p) && p > 0 ? p : null,
      priceTier: 'estimate',
      site,
      url: null,
      imageUrl: null,
    });
    setTitle('');
    setPrice('');
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 text-xs text-neutral-600 underline dark:text-neutral-400"
      >
        Or add an item by hand
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="mt-2 flex flex-wrap items-end gap-2 text-xs">
      {/* **狭い画面では自分の行を取る。** `flex-1 min-w-0` だけだと、価格・サイト・ボタンの
          固定幅に押されて幅 21px まで縮み（Pixel 7 実測）、ラベルが 'Price ¥' に重なって
          手入力そのものが使えなくなっていた。折り返すぶんには縦しか使わない。 */}
      <label className="w-full min-w-0 sm:w-auto sm:flex-1">
        <span className="block text-neutral-500">Item name</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="what you would search for on the listing site"
          className="mt-0.5 w-full rounded border border-neutral-300 bg-transparent px-2 py-1.5 dark:border-neutral-700"
        />
      </label>
      <label>
        <span className="block text-neutral-500">Price ¥</span>
        <input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          inputMode="numeric"
          placeholder="optional"
          className="mt-0.5 w-24 rounded border border-neutral-300 bg-transparent px-2 py-1.5 num dark:border-neutral-700"
        />
      </label>
      <label>
        <span className="block text-neutral-500">Site</span>
        <select
          value={site}
          onChange={(e) => setSite(e.target.value as SiteId)}
          className="mt-0.5 rounded border border-neutral-300 bg-transparent px-2 py-1.5 dark:border-neutral-700"
        >
          {SITES.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        className="rounded bg-neutral-900 px-3 py-1.5 text-white dark:bg-neutral-100 dark:text-neutral-900"
      >
        Add by hand
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-neutral-500 underline"
      >
        Cancel
      </button>
    </form>
  );
}
