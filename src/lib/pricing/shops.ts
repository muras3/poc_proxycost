import type { Item, SiteId } from './types';

/**
 * 出品がどの店舗のものかを、**出品URLから**引く。
 *
 * なぜ Item に `shopId` 欄を足さずに URL から引くのか（T14 でどちらにするか選んだ理由）:
 * 店舗を知っているのは出品URLだけで、欄を足すと画面側が埋め忘れたときに黙って
 * 「店舗不明」に戻り、Buyee の購入手数料が点ごとに戻る。**埋め忘れが過大計上として
 * 表に出ないなら、その欄は無いほうが安全。** URL は検索・貼り付けの両方の経路で必ず
 * 通るので、URL から引ける限り必ず当たる。
 *
 * 引けないとき（URL が無い／店舗が URL に出ない）は null を返し、呼び出し側は
 * 「まとめられない」＝点ごとに課金したうえで、**そう画面に書く**。黙って安いほうに
 * 倒さない（Buyee にとっては過大計上のまま。我々に報酬を払う社に不利な向きだが、
 * 分からないものを分かったことにするほうが悪い）。
 */

/** ドメイン全体が1つの店の社。URL のどこにも店舗名は要らない。 */
const SINGLE_SHOP_SITES: SiteId[] = ['suruga-ya', 'mandarake', 'zozo', 'hmv', 'toranoana'];

/**
 * 出品ごとに1注文になるサイト（オークション・フリマ）。
 * **ここで店舗が取れないのは欠落ではない。** Buyee の原文が
 * 「One successful bid or purchase / flat rate ¥500」と、購入1件ごとだと書いている。
 * 店舗が読めなかった（＝まとめ損ねた）ショッピングの点と混ぜて数えると、
 * 画面に「読めなかった」と出すべきでないものまで出る。
 */
const PER_LISTING_SITES: SiteId[] = ['yahoo-auctions', 'mercari'];

export function isPerListingSite(site: SiteId): boolean {
  return PER_LISTING_SITES.includes(site);
}

/** 店舗の場所にならない先頭パス（検索・カテゴリ等）。ここを店舗名と読むと別々の店が同じ店になる。 */
const NOT_A_SHOP = new Set(['search', 'category', 'ranking', 'event', 'campaign', 'products', 'item']);

function firstSegment(pathname: string): string | null {
  const seg = pathname.split('/').filter(Boolean);
  const s = seg[0]?.toLowerCase();
  if (!s || NOT_A_SHOP.has(s)) return null;
  return s;
}

/**
 * その出品の店舗ID。**社をまたいで衝突しないように site を前に付ける。**
 * null = 店舗を特定できない（＝まとめられない）。
 *
 * amazon-jp を単一店舗として扱わない理由: Amazon は1つのドメインの中に多数の出品者が
 * いて、Buyee の原文が言う「同一店舗（same store）」と一致するとは限らない。
 * 一致しているという根拠を持っていないので、まとめない。
 * オークション・フリマ（yahoo-auctions / mercari）は Buyee の原文が
 * 「落札・購入1件ごとに ¥500」と書いているので、そもそもまとめる対象ではない。
 */
export function shopIdFor(item: Pick<Item, 'site' | 'url'>): string | null {
  if (SINGLE_SHOP_SITES.includes(item.site)) return `${item.site}:${item.site}`;
  if (item.site !== 'rakuten' && item.site !== 'yahoo-shopping') return null;
  if (!item.url) return null;
  let u: URL;
  try {
    u = new URL(item.url);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (item.site === 'rakuten') {
    // https://item.rakuten.co.jp/{shop}/{itemcode}/
    if (!/(^|\.)rakuten\.co\.jp$/.test(host)) return null;
    const shop = firstSegment(u.pathname);
    return shop ? `rakuten:${shop}` : null;
  }
  // Yahoo!ショッピング:
  //   https://store.shopping.yahoo.co.jp/{store}/{code}.html
  //   https://shopping.yahoo.co.jp/store/{store}/item/{code}/
  if (!/(^|\.)yahoo\.co\.jp$/.test(host)) return null;
  const seg = u.pathname.split('/').filter(Boolean);
  if (host.startsWith('store.shopping.')) {
    const shop = firstSegment(u.pathname);
    return shop ? `yahoo-shopping:${shop}` : null;
  }
  if (seg[0]?.toLowerCase() === 'store' && seg[1]) return `yahoo-shopping:${seg[1].toLowerCase()}`;
  return null;
}

export interface ShopGrouping {
  /** 1注文ぶんの点の並び（items の添字）。同一店舗の複数点は1つのまとまりになる。 */
  groups: number[][];
  /**
   * ショッピングの出品のうち、店舗を特定できずにまとめられなかった点の数。
   * **画面に出すためにここで数える。** オークション・フリマは（そもそも出品ごとなので）
   * ここに入れない。
   */
  unknownShopItems: number;
  /** まとめによって減った注文の数（＝過大計上を止めた回数）。 */
  merged: number;
}

/**
 * 同一店舗の複数点を1注文にまとめる。
 * Buyee の原文（購入手数料の項、2026-09-06 に取得）:
 *   「Shopping: Order / flat rate ¥500 * **Even if multiple purchases are from the
 *     same store**, it is a flat rate of ¥500.」
 *   「JDirectItems Auction / Mercari / Rakuma: One successful bid or purchase / flat rate ¥500」
 * → ショッピングだけが店舗単位、オークション・フリマは出品単位。
 *
 * まとめない社にはこの関数を通さない（`FeeModel.ordersGroupedByShop`）。
 * 「同一出品者ならまとめる」と読める文は Jauce（銀行手数料）と FROM JAPAN（国内送料）にも
 * あるが、費目が別で条件も別なので、その社の原文を読んでから別に直す。
 */
export function groupByShop(items: Pick<Item, 'site' | 'url'>[]): ShopGrouping {
  const byShop = new Map<string, number[]>();
  const groups: number[][] = [];
  let unknownShopItems = 0;
  items.forEach((item, idx) => {
    const shop = shopIdFor(item);
    if (!shop) {
      if (!isPerListingSite(item.site)) unknownShopItems += 1;
      groups.push([idx]);
      return;
    }
    const existing = byShop.get(shop);
    if (existing) {
      existing.push(idx);
      return;
    }
    const group = [idx];
    byShop.set(shop, group);
    groups.push(group);
  });
  return { groups, unknownShopItems, merged: items.length - groups.length };
}

/** まとめない社の並び（1点＝1注文）。呼び出し側の分岐を1か所に閉じるために置く。 */
export function oneOrderPerItem(items: readonly unknown[]): ShopGrouping {
  return { groups: items.map((_, i) => [i]), unknownShopItems: 0, merged: 0 };
}
