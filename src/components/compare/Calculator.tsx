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
import { FreeShippingDomesticNote } from './FreeShippingDomesticNote';
import { ItemList, type ItemListHandle } from './ItemList';
import { OptionalExtras } from './OptionalExtras';
import { MethodPicker } from './MethodPicker';
import { ParcelView } from './ParcelView';
import { ProvincePicker } from './ProvincePicker';
import { RankBoard, Summary } from './RankBoard';
import { StorageDaysInput } from './StorageDaysInput';
import {
  AlcoholInCartNote, LongItemsInCartNote, RestrictedGoodsNote,
} from './RestrictedGoodsNote';
import { StabilityNote } from './StabilityNote';
import { WhatCouldBeOff } from './WhatCouldBeOff';
import { useCompare, type Draft } from './useCompare';

/**
 * 画面の結線だけを持つ。並びは docs/UI-DESIGN.md §7。
 * 順位 → 凡例 → 内訳 → 弱点 → 広告の順で、確かな情報ほど上に置く。
 */
export function Calculator() {
  const {
    items, country, province, method, storageDays, seq, unpriced, result, dispatch,
  } = useCompare();
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
  // 価格が未取得の項目は compare() に渡っていない。箱にも入れない
  // （総額に効いていない品を箱に立てたら、箱と総額が別のカートを指す）。
  const priced = items.filter((i) => !unpriced.includes(i.id));
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
          {/* **方式は行き先と同じ格の入力。**総額は方式で決まり、方式は利用者が選ぶ
              （Neokyo 原文「please select ... as the shipment method」）。
              既定は EMS で、各社の既定が分かったら変える（`compare()` の `DEFAULT_METHOD`）。 */}
          <MethodPicker
            value={method}
            onChange={(m) => dispatch({ type: 'method', method: m })}
          />
          {/* **保管日数も行き先・方式と同じ格の入力**（F21、0d）。既定45日は我々の仮定
              なので、`tier: estimate` と同じ琥珀色で示す（`StorageDaysInput` のコメント）。 */}
          <StorageDaysInput
            value={storageDays}
            onChange={(d) => dispatch({ type: 'storageDays', storageDays: d })}
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

      {/**
        * **箱は入力とカートと同じ視界に置く。**
        * 足した品が箱に落ちるのを見せるための絵なので、順位表の下に置いたら
        * （前の配置）誰も見ない位置で動くことになり、動きが何も伝えない。
        *
        * 縦積み（モバイル）では箱をカートの**上**に置く。カートは足すたびに開き、
        * 1点で 300px 以上あるので、カートの下に置くと2点目からは画面の外に出る。
        * **勝手にスクロールさせて解決しない**（scrollIntoView が祖先ごと動かして
        * 常時開示を画面外に押し出した前科がある）。位置で解決する。
        *
        * lg 以上では横に2つ。**DOM の順＝画面の順＝フォーカスの順**にしたいので、
        * モバイルで先に来る箱がそのまま左の列になる（order-* で入れ替えると、
        * どちらかの幅で読み上げ順とタブ順が画面と食い違う）。
        * 横に並べるぶん順位表は押し下がらない。
        */}
      <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
        <ParcelView items={priced} country={country} className="lg:w-[32rem] lg:shrink-0" />
        <ItemList
          items={items}
          readOn={readOn}
          unpriced={unpriced}
          sensitivity={result.weightSensitivity}
          ref={cart}
          className="min-w-0 flex-1"
          onPatch={(id: string, patch: Partial<Item>) => dispatch({ type: 'patch', id, patch })}
          onRemove={(id: string) => dispatch({ type: 'remove', id })}
        />
      </div>

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
            {/* 長さで方式が絞られうる品。**寸法は入力にすら無い**ので、
                どの方式が落ちるかは書けない——見ていないことだけ言う。 */}
            <LongItemsInCartNote result={result} items={items} />
            {/* Buyee だけの話（他4社は材料が無い）。「送料無料」の出品が1点でも
                あるときだけ、金額は動かさず出す（T-F10、docs/FEE-ITEMS.md §5 R1）。 */}
            <FreeShippingDomesticNote result={result} items={items} />
          </div>

          <div className="mt-4">
            <RankBoard result={result} />
            <TierLegend className="mt-3" />
          </div>

          {/* 箱はここに居た（順位の下・内訳の上）。読み順としては筋が通っていたが、
              **足した瞬間に動く絵が、入力から1画面以上下に居た。**動きは見られなければ
              何も伝えないので、入力とカートの隣（上）へ移した。 */}

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
