import { BUYEE_FREE_SHIPPING_SOURCE_URL } from '@/lib/pricing/compare';
import { tierClass } from '@/lib/ui/tiers';
import type { CompareResult, Item } from '@/lib/pricing/types';

/**
 * Buyee 自身の料金ページ（`master/fees.json` F13b、tier A_confirmed）:
 * 「出品ページに "Free shipping" とあっても、配送方法の変更で国内送料が発生しうる」。
 * **いま `domestic-shipping` はその ¥0 を確定値のまま出している。**発生率は公表
 * されていないので額は動かさず、警告だけ出す（オーナー決定 2026-09-11、T-F10）。
 *
 * **`WhatCouldBeOff` には収めなかった。**あれは最安の1行（`result.rows[0]`）の
 * 内訳だけを見て確度を語る作りで、これはカート全体（`freeShipping` の item が
 * 1点でもあるか）と、5社中1社（Buyee）固定の話。最安行が Buyee でなければ
 * `WhatCouldBeOff` からはこの費目が見えず、逆に最安行が Buyee でもここで言いたい
 * のは「Buyee の総額だけが低めに出ている可能性」であって「最安行の確度」ではない
 * ——`RestrictedGoodsNote` 系と同じ「カート全体・常時1行・畳まない」注記にした。
 *
 * **対象は Buyee だけ。**この記載を公表しているのは Buyee のみで、他4社については
 * 何も持っていない。他社の freeShipping ¥0 が確定のまま変わらないのは「発生しない」
 * と判定したからではなく、材料が無いから（確認できていない社を有利に描かない一方、
 * 確認できていない主張を確認済みとして広げもしない。`master/fees.json` の rows でも
 * F13b は company: buyee にしか無い。docs/FEE-ITEMS.md §5 R1「全社に等しくは乗らない」）。
 */
export function FreeShippingDomesticNote({
  result, items,
}: { result: CompareResult; items: Item[] }) {
  // 順位が無いときは語る対象も無い。RestrictedGoodsNote 等と同じ条件で消える。
  if (!result.rows.length) return null;
  if (!items.some((i) => i.freeShipping)) return null;

  return (
    <p>
      <span className={tierClass.estimate}>Domestic shipping</span>: your basket has a
      listing marked &ldquo;free shipping.&rdquo; Buyee states that domestic shipping fees
      may occur due to a change of shipping method, even though &ldquo;Free shipping&rdquo;
      might be stated on the product page. We price that shipment at ¥0 because no fee is
      published, so <strong className="font-medium">Buyee&rsquo;s total above may be higher
      than shown</strong>. We hold no such statement from the other services compared here.{' '}
      <a
        className="underline"
        href={BUYEE_FREE_SHIPPING_SOURCE_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        Source
      </a>
      .
    </p>
  );
}
