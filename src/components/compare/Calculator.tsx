'use client';

import { useRef, useState } from 'react';
import { AdSlot } from '@/components/chrome/AdSlot';
import { ManualAdd } from '@/components/search/ManualAdd';
import { SearchBox } from '@/components/search/SearchBox';
import { TierLegend, tierClass } from '@/lib/ui/tiers';
import type { CountryCode, Item, ProvinceCode } from '@/lib/pricing/types';
import { AlwaysOnIcons } from './AlwaysOnIcons';
import { ConditionsBar } from './ConditionsBar';
import { ConsolidationCallout } from './ConsolidationCallout';
import { CostTable } from './CostTable';
import { EmsOnlyNote } from './EmsOnlyNote';
import { FreeShippingDomesticNote } from './FreeShippingDomesticNote';
import { ItemList, type ItemListHandle } from './ItemList';
import { LithiumAirmailBadge } from './LithiumAirmailBadge';
import { ParcelView } from './ParcelView';
import { RankBoard, Summary } from './RankBoard';
import { Scale } from './Scale';
import { AlcoholInCartNote, LongItemsInCartNote } from './RestrictedGoodsNote';
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

  // 判定不能（P1-3）→「配送方法の選択へ誘導する」（docs/ROADMAP.md P1 確定仕様）。
  // 総額に効くのは方式（2.3倍）であって会社ではない。**StabilityNote の1行には
  // 足さない**——デスクトップで既に折り返しの余白が無く（e2e/parcel.spec.ts の
  // 「順位表が最初の画面から押し出されている」が実測 908 > 900 で落ちた）、
  // 1文字でも足せば2行目に溢れて順位表を画面外へ押し出す。`RankBoard` の
  // 「Ranking」領域の**内側**（`<ol>` の直前）に出す——領域そのものの開始位置は
  // 動かないので、この制約を満たしたまま誘導文を置ける。
  function focusMethod() {
    document.getElementById('ship-by-select')?.focus();
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

  // ページの並び（PR-C 確定、2026-09-15）: 商品追加 → 条件欄 → 秤 → 要約 →
  // 常時アイコン2つ → 順位表（PR-B）→ カート（たたんだ1行）→ 全社費目表・
  // What could be off（折りたたみ）→ 広告。並びを変えただけで、各区画自身の
  // 計算・文言は一切変えていない（`src/lib/pricing` 不可侵、CLAUDE.md §8）。
  return (
    <div className="mt-6">
      <div className="min-w-0">
        <SearchBox onAdd={onAdd} />
        <ManualAdd onAdd={onAdd} />
      </div>

      {/* **最初の画面の並び（2026-09-15、PR-C 引き継ぎで組み直し）。**
          desktop（lg 以上）: 左の列に 条件欄 → 秤 → 要約 → 注記 → 常時アイコン、
          右の列に箱の絵（縮小表示）。順位表は2列の下に幅いっぱいで置く——箱の絵を
          縦に積むと場面の高さ（約250px）がそのまま順位表を押し下げた（実測 975 > 900）。
          狭い幅: 1列で 条件欄 → 秤 → 箱（縮小）→ 要約 → 注記 → 常時アイコン → 順位表。
          箱を要約より上に置くのは、手入力フォームを開いても入力欄と箱が同じ視界に
          残るため（e2e/parcel.spec.ts）。注記・アイコンは順位表より上
          （e2e/compare.spec.ts の 19・24）。並び替えは `order`（mobile）と grid の列（desktop）だけで、左の列の
          ラッパーは狭い幅では `contents` にして子を1列の並びに参加させる。 */}
      <div className="mt-3 flex min-w-0 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-x-6">
        <div className="contents lg:col-start-1 lg:row-start-1 lg:block lg:min-w-0">
          {/* **手入力フォームを開いたまま Canada を選んでも横スクロールを出さない**
              （`min-w-0` を各セル・グリッド自身に付ける。以前の回帰の再発防止）。 */}
          <ConditionsBar
            country={country}
            province={province}
            storageDays={storageDays}
            method={method}
            items={items}
            sensitivity={result.weightSensitivity}
            onCountryChange={(c: CountryCode) => dispatch({ type: 'country', country: c })}
            onProvinceChange={(p: ProvinceCode | null) => dispatch({ type: 'province', province: p })}
            onStorageDaysChange={(d) => dispatch({ type: 'storageDays', storageDays: d })}
            onMethodChange={(m) => dispatch({ type: 'method', method: m })}
            onEditCart={() => cart.current?.openCart()}
            className="order-1"
          />

          {/* 秤（mock-v3 `#heft`）。常時見える小さな部品——1位の実際の箱が
              乗って重いほど沈み、`x kg in N boxes · SERVICE` を言う。 */}
          <Scale
            items={priced}
            sensitivity={result.weightSensitivity}
            row={result.rows.find((r) => r.cheapest) ?? null}
            className="order-2"
          />

          {/* **リチウム電池の航空郵便可否（監査 #83）は常時表示。**`AlwaysOnIcons` の
              `<details>` に隠さない——「送れるかが変わる」段1の事実は畳んだ場所に
              置かない。`destinationFacts` は `compare()` が国だけで決めた値を読む。 */}
          <LithiumAirmailBadge result={result} country={country} className="order-3 mt-2" />

          {!empty && pricedCount > 0 && (
            <>
              <div className="order-5 mt-2 space-y-1 border-t border-neutral-200 pt-2 dark:border-neutral-800">
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
              </div>

              <div className="order-6 mt-2 space-y-1 lg:mt-1">
                {/* 比較の範囲（EMS 限定）は順位のすぐ隣に、常に出す。畳まない。 */}
                <EmsOnlyNote result={result} country={country} />
                {/* 酒がカートに入っているときだけ、強い警告を足す（T27）。 */}
                <AlcoholInCartNote result={result} items={items} />
                {/* 長さで方式が絞られうる品。寸法は入力に無いので、見ていないことだけ言う。 */}
                <LongItemsInCartNote result={result} items={items} />
                {/* Buyee だけの話。「送料無料」の出品が1点でもあるときだけ出す（T-F10）。 */}
                <FreeShippingDomesticNote result={result} items={items} />
              </div>

              {/* 常時アイコン2つ（送れるか未確認／燃油込み・遠隔地料金は含まない）。
                  文言は元のコンポーネントのまま（`AlwaysOnIcons` は薄いラッパー）。 */}
              <div className="order-7 mt-2">
                <AlwaysOnIcons result={result} country={country} />
              </div>
            </>
          )}
        </div>

        {/* 箱の3D絵（`ParcelView`、縮小表示）。desktop では右の列。開閉は無い
            （既存の e2e が畳まず前提で読んでいる）。中身・数値は変えていない。 */}
        <ParcelView
          items={priced}
          country={country}
          row={result.rows.find((r) => r.cheapest) ?? null}
          compact
          className="order-4 mt-2 min-w-0 lg:col-start-2 lg:row-start-1 lg:mt-0"
        />

        {empty ? (
          <p className="order-8 mt-10 text-sm text-neutral-500 lg:col-span-2">Add a listing to compare.</p>
        ) : pricedCount === 0 ? (
          // 全部が価格未取得。順位を出すと ¥0 の買い物の順位になる。
          <p className="order-8 mt-10 text-sm text-neutral-500 lg:col-span-2">
            Enter a price above to compare — we could not read one from the listing.
          </p>
        ) : (
          <div className="order-8 mt-2 min-w-0 lg:mt-4 lg:col-span-2 lg:row-start-2">
            <RankBoard result={result} onFocusMethod={focusMethod} />
            <TierLegend className="mt-3" />
          </div>
        )}
      </div>

      {!empty && pricedCount > 0 && (
        <>
          <div className="mt-4 empty:mt-0">
            <ConsolidationCallout result={result} />
          </div>

          {/* カート（たたんだ1行）。**順位表の下に置く**——条件欄の1行は要約への
              リンクで、実際に編集する場はここ。数量・重量・国内送料はここで直す。
              段ごとの総額の表（WeightStepTable）はここに居たが外した。カートの全点に
              重量が入って直せる今、「重量が X なら総額は」に答えるのは重量欄そのもの。 */}
          <ItemList
            items={items}
            readOn={readOn}
            unpriced={unpriced}
            sensitivity={result.weightSensitivity}
            ref={cart}
            className="mt-6"
            onPatch={(id: string, patch: Partial<Item>) => dispatch({ type: 'patch', id, patch })}
            onRemove={(id: string) => dispatch({ type: 'remove', id })}
          />

          {/* 全社費目表・What could be off は折りたたみで実在させる
              （PR-C: 常時は畳んで、開けば全部読める。中身の文言・数値は変えない）。 */}
          <details className="mt-8 group">
            <summary
              data-testid="breakdown-toggle"
              className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-neutral-500"
            >
              Full cost breakdown &amp; what could be off
            </summary>
            <div className="mt-2">
              <CostTable result={result} />
              <WhatCouldBeOff result={result} />
            </div>
          </details>

          {/* 広告はここだけ。比較の中・横には置かない。結果の後・フッターの上。 */}
          <AdSlot />
        </>
      )}
    </div>
  );
}
