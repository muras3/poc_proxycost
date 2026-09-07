import type { SiteId } from '@/lib/pricing/types';

export interface Site {
  id: SiteId;
  name: string;
  /** この語がホスト名に含まれればこのサイトと判定する。 */
  hosts: string[];
  /**
   * 「1点の出品ページ」のパス。**検索結果ページ・カテゴリ・記事を候補から外すため。**
   * 実測（40クエリ・790件、docs/audit/search-reality.md）では 4 割が出品ではなく
   * 一覧ページで、そのまま籠に入れても値段が付かず送れない。
   * 空配列 = そのサイトの出品ページの形を確かめていない（**落とさない**）。
   */
  listing: RegExp[];
  /** オークションか固定価格か。オークションは落札価格が事後に決まる。 */
  kind: 'auction' | 'fixed';
  /** Jauce のサービス料がベータで無料になるか（¥400/点 + 8% が 0 になる）。 */
  jauceFree: boolean;
}

// 横断検索の対象。増やすときは Jauce の無料対象かを必ず確かめてから足す。
export const SITES: Site[] = [
  {
    id: 'yahoo-auctions', name: 'Yahoo! Auctions', hosts: ['auctions.yahoo.co.jp'],
    // 出品は /jp/auction/<id>。/search/ と /closedsearch/ は一覧（後者は終了済みで買えない）。
    listing: [/^(?:page\.)?auctions\.yahoo\.co\.jp\/(?:jp\/)?auction\/[a-z]?\d+/i],
    kind: 'auction', jauceFree: false,
  },
  {
    id: 'mercari', name: 'Mercari', hosts: ['jp.mercari.com', 'mercari.com'],
    // /item/<id> と /shops/product/<id>。/search と /s/<id> は一覧。
    listing: [
      /^jp\.mercari\.com\/(?:[a-z]{2}\/)?item\/[a-z0-9]+/i,
      /^jp\.mercari\.com\/(?:[a-z]{2}\/)?shops\/product\/[a-z0-9]+/i,
    ],
    kind: 'fixed', jauceFree: false,
  },
  {
    id: 'rakuten', name: 'Rakuten', hosts: ['item.rakuten.co.jp', 'rakuten.co.jp'],
    // 出品は item. サブドメインだけ。search.rakuten.co.jp は一覧。
    listing: [/^item\.rakuten\.co\.jp\/[^/]+\/[^/?]+/],
    kind: 'fixed', jauceFree: true,
  },
  {
    id: 'yahoo-shopping', name: 'Yahoo! Shopping',
    hosts: ['store.shopping.yahoo.co.jp', 'shopping.yahoo.co.jp'],
    // 出品は store. サブドメインの <店>/<商品>。shopping.yahoo.co.jp/search は一覧。
    listing: [/^store\.shopping\.yahoo\.co\.jp\/[^/]+\/[^/?]+/],
    kind: 'fixed', jauceFree: true,
  },
  {
    id: 'amazon-jp', name: 'Amazon.co.jp', hosts: ['amazon.co.jp'],
    listing: [/amazon\.co\.jp\/(?:.*\/)?(?:dp|gp\/product)\/[A-Z0-9]{10}/],
    kind: 'fixed', jauceFree: false,
  },
  {
    id: 'suruga-ya', name: 'Suruga-ya', hosts: ['suruga-ya.jp'],
    listing: [/suruga-ya\.jp\/product\/detail\//],
    kind: 'fixed', jauceFree: false,
  },
  {
    id: 'mandarake', name: 'Mandarake', hosts: ['mandarake.co.jp'],
    listing: [
      /mandarake\.co\.jp\/order\/detailPage\/item/i,
      /mandarake\.co\.jp\/auction\/item\/itemInfo/i,
    ],
    kind: 'fixed', jauceFree: false,
  },
  {
    id: 'zozo', name: 'ZOZOTOWN', hosts: ['zozo.jp'],
    listing: [/zozo\.jp\/shop\/[^/]+\/goods(?:-sale)?\/\d+/],
    kind: 'fixed', jauceFree: false,
  },
  {
    id: 'hmv', name: 'HMV Japan', hosts: ['hmv.co.jp'],
    // 商品は .../item_<名前>_<id>/ か /product/。/news/article/ は記事。
    listing: [/hmv\.co\.jp\/(?:.*\/)?item_/, /hmv\.co\.jp\/product\//],
    kind: 'fixed', jauceFree: false,
  },
  {
    id: 'toranoana', name: 'Toranoana', hosts: ['ecs.toranoana.jp', 'toranoana.jp'],
    listing: [/toranoana\.jp\/(?:.*\/)?ec\/item\/\d+/],
    kind: 'fixed', jauceFree: false,
  },
];

// 対象外のサイト。出品ページの形を知らないので listing は空＝**落とさない**。
const OTHER: Site = { id: 'other', name: 'Other shop', hosts: [], listing: [], kind: 'fixed', jauceFree: false };

export function siteFromUrl(url: string): Site {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return OTHER;
  }
  // 長いホスト名から先に当てる。'shopping.yahoo.co.jp' を 'yahoo.co.jp' に取られないため。
  const ranked = SITES.flatMap((s) => s.hosts.map((h) => ({ s, h })))
    .sort((a, b) => b.h.length - a.h.length);
  for (const { s, h } of ranked) {
    // 完全一致かサブドメインだけを認める。部分一致にすると
    // 'auctions.yahoo.co.jp.example.com' のような詐称ホストを本物と誤認する。
    if (host === h || host.endsWith(`.${h}`)) return s;
  }
  return OTHER;
}

export function siteById(id: SiteId): Site {
  return SITES.find((s) => s.id === id) ?? OTHER;
}

/**
 * その URL が「1点の出品ページ」か。
 * Brave は検索結果ページ・カテゴリ・記事も返す（実測で 790 件中 317 件、
 * とくにヤフオクは 129 件すべてが一覧で、うち 59 件は終了済みの
 * `/closedsearch/`＝もう買えない）。**それを候補に混ぜると、値段の付かない行が
 * 籠に入る。**形を確かめていないサイト（listing が空）は落とさない。
 */
export function isListingUrl(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const site = siteFromUrl(url);
  if (!site.listing.length) return true;
  const target = `${u.hostname.toLowerCase()}${u.pathname}${u.search}`;
  return site.listing.some((re) => re.test(target));
}

/** Brave に投げる `site:` の並び。1クエリに収める（ページングは追加課金）。 */
export function siteFilter(): string {
  return SITES.flatMap((s) => s.hosts.slice(0, 1)).map((h) => `site:${h}`).join(' OR ');
}
