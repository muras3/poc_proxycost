'use client';

import { useRef, useState } from 'react';
import { AdSlot } from '@/components/chrome/AdSlot';
import { ManualAdd } from '@/components/search/ManualAdd';
import { SearchBox } from '@/components/search/SearchBox';
import { TierLegend, tierClass } from '@/lib/ui/tiers';
import type { CountryCode, Item, ProvinceCode } from '@/lib/pricing/types';
import { ConsolidationCallout } from './ConsolidationCallout';
import { CostTable } from './CostTable';
import { CountryPicker } from './CountryPicker';
import { EmsOnlyNote } from './EmsOnlyNote';
import { ItemList, type ItemListHandle } from './ItemList';
import { OptionalExtras } from './OptionalExtras';
import { ProvincePicker } from './ProvincePicker';
import { RankBoard, Summary } from './RankBoard';
import { AlcoholInCartNote, RestrictedGoodsNote } from './RestrictedGoodsNote';
import { StabilityNote } from './StabilityNote';
import { WhatCouldBeOff } from './WhatCouldBeOff';
import { useCompare, type Draft } from './useCompare';

/**
 * 画面の結線だけを持つ。並びは docs/UI-DESIGN.md §7。
 * 順位 → 凡例 → 内訳 → 弱点 → 広告の順で、確かな情報ほど上に置く。
 */
export function Calculator() {
  const { items, country, province, seq, unpriced, result, dispatch } = useCompare();
  // URL 取得で確定値になった項目の取得日。Item に日付欄が無いのでここで持つ。
  // 追加は必ずクライアント側の操作なので、SSR と食い違わない。
  const [readOn, setReadOn] = useState<Record<string, string>>({});
  // StabilityNote の「Check the weights」→ カートの重量入力へ。
  // 1位を決めている品（decisive）があればそこへ、無ければ先頭の品へ。
  const cart = useRef<ItemListHandle>(null);
  function checkWeights() {
    const decisive = items.find((i) => result.weightSensitivity[i.id]?.decisive);
    const target = decisive ?? items[0];
    if (target) cart.current?.focusWeight(target.id);
  }

  function onAdd(draft: Draft) {
    if (draft.priceTier === 'fixed') {
      // useCompare が次に振る id は `i${seq}`。
      const id = `i${seq}`;
      const today = new Date().toISOString().slice(0, 10);
      setReadOn((prev) => ({ ...prev, [id]: today }));
    }
    dispatch({ type: 'add', draft });
  }

  const empty = items.length === 0;
  // 価格を貰えていない項目は総額に入っていない（useCompare が compare() から外す）。
  const pricedCount = items.length - unpriced.length;

  return (
    <div className="mt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* モバイルでは行き先を先に決めさせる（幅が狭いので入力欄と並べない）。 */}
        <div className="order-first flex flex-wrap items-center gap-x-4 gap-y-2 sm:order-last sm:shrink-0">
          <CountryPicker
            value={country}
            onChange={(c: CountryCode) => dispatch({ type: 'country', country: c })}
          />
          {/* **カナダだけ州で税が変わる**（CBSA D2-3-6）ので、そこだけ2段目を出す。
              他国で常に出しておくと、選べない欄が画面に残る。 */}
          {country === 'CA' && (
            <ProvincePicker
              value={province}
              onChange={(p: ProvinceCode | null) => dispatch({ type: 'province', province: p })}
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <SearchBox onAdd={onAdd} />
          <ManualAdd onAdd={onAdd} />
        </div>
      </div>

      <ItemList
        items={items}
        readOn={readOn}
        unpriced={unpriced}
        sensitivity={result.weightSensitivity}
        ref={cart}
        onPatch={(id: string, patch: Partial<Item>) => dispatch({ type: 'patch', id, patch })}
        onRemove={(id: string) => dispatch({ type: 'remove', id })}
      />

      {empty ? (
        <p className="mt-10 text-sm text-neutral-500">Add a listing to compare.</p>
      ) : pricedCount === 0 ? (
        // 全部が価格未取得。順位を出すと ¥0 の買い物の順位になる。
        <p className="mt-10 text-sm text-neutral-500">
          Enter a price above to compare — we could not read one from the listing.
        </p>
      ) : (
        <>
          <div className="mt-8 space-y-2 border-t border-neutral-200 pt-6 dark:border-neutral-800">
            {/* 黙って外すと総額が安く見える。外したことを総額の隣で言う。 */}
            {unpriced.length > 0 && (
              <p className={`text-xs ${tierClass.none}`}>
                {unpriced.length === 1
                  ? '1 item has no price yet and is not in these totals.'
                  : `${unpriced.length} items have no price yet and are not in these totals.`}
              </p>
            )}
            <Summary result={result} />
            <StabilityNote result={result} onCheckWeights={checkWeights} />
            {/* 比較の範囲（EMS 限定）は順位のすぐ隣に、常に出す。畳んだら
                「読んでいない人には言っていない」のと同じになる。 */}
            <EmsOnlyNote result={result} />
            {/* **送れるかは一度も見ていない。**同じ理由で同じ場所に、常に出す。
                酒がカートに入っているときだけ、その下に強い警告を足す（T27）。 */}
            <RestrictedGoodsNote result={result} country={country} />
            <AlcoholInCartNote result={result} items={items} />
          </div>

          <div className="mt-4">
            <RankBoard result={result} />
            <TierLegend className="mt-3" />
          </div>

          <div className="mt-4 empty:mt-0">
            <ConsolidationCallout result={result} />
          </div>

          {/* 段ごとの総額の表（WeightStepTable）はここに居たが外した。カートの全点に
              重量が入って直せる今、「重量が X なら総額は」に答えるのは重量欄そのもの。
              全点を同じ重量に置く表は、全点が不明だったときにしか意味が無かった。 */}

          <CostTable result={result} />

          <OptionalExtras rows={result.rows} />
          <WhatCouldBeOff result={result} />

          {/* 広告はここだけ。比較の中・横には置かない。 */}
          <AdSlot />
        </>
      )}
    </div>
  );
}
