import type { Item, SiteId } from './types';

/**
 * 各社の「その出品を自社サイトで開く」URL。
 *
 * トップページに飛ばすと、利用者はもう一度 URL を貼り直すことになる。動線として
 * 明確に劣るので、出品を直接開ける社は直接開く。
 *
 * **ただし検証できたものだけを有効にする。** 形が違えば 404 に飛ばすことになり、
 * それはトップページより悪い。verified が false の組み合わせでは何も返さず、
 * 呼び出し側はトップページに落ちる。
 *
 * 検証の方法（scripts/deeplinks-check.ts が同じことをする）:
 *   1. 実在する出品IDで 200 が返り、ページにその出品の情報が出ること
 *   2. **架空のIDでは 404 が返ること**（1 だけでは「何を渡しても 200」と区別できない）
 */
export interface DeepLink {
  /** `{id}` を出品IDに置き換える。 */
  pattern: string;
  /** 上の2条件を実際に確かめたか。**false の間は使わない。** */
  verified: boolean;
  checkedOn: string;
  note: string;
}

export const DEEP_LINKS: Record<string, Partial<Record<SiteId, DeepLink>>> = {
  fromjapan: {
    'yahoo-auctions': {
      pattern: 'https://www.fromjapan.co.jp/japan/en/auction/yahoo/input/{id}',
      verified: true,
      checkedOn: '2026-09-06',
      note: '実在ID2件で 200 かつページタイトルが出品名。架空IDでは 404',
    },
  },
  buyee: {
    'yahoo-auctions': {
      pattern: 'https://buyee.jp/item/yahoo/auction/{id}',
      verified: true,
      checkedOn: '2026-09-06',
      note: '実在ID2件で 200、タイトルが出品ごとに異なる。架空IDでは 404',
    },
  },
  // 以下は形が分かっていても**この環境から検証できていない**。各社が自動アクセスを
  // 弾くため（ZenMarket は Cloudflare の 403、Jauce は 503、Neokyo は候補パスが
  // いずれも 404 で形自体が不明）。検証できるまで有効にしない。
  // `npm run deeplinks:check -- <出品ID>` を普通のネットワークから走らせれば判定できる。
  zenmarket: {
    'yahoo-auctions': {
      pattern: 'https://zenmarket.jp/en/auction.aspx?itemCode={id}',
      verified: false,
      checkedOn: '2026-09-06',
      note: '未検証。HTTP 403（Cloudflare）で確認できなかった',
    },
  },
  jauce: {
    'yahoo-auctions': {
      pattern: 'https://www.jauce.com/auction/{id}',
      verified: false,
      checkedOn: '2026-09-06',
      note: '未検証。bot チェックページに飛ぶ。ただしそのページ自身がこのURLを遷移先として提示する',
    },
  },
  neokyo: {},
};

/** 出品URLから、その出品のIDを取る。取れなければ null。**組み立てない。** */
export function listingIdFrom(url: string | null | undefined, site: SiteId): string | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  switch (site) {
    case 'yahoo-auctions': {
      // https://page.auctions.yahoo.co.jp/jp/auction/s1243168909
      // https://auctions.yahoo.co.jp/jp/auction/s1243168909
      const m = u.pathname.match(/\/auction\/([a-z]?\d{9,12})\/?$/i);
      if (m?.[1]) return m[1];
      const q = u.searchParams.get('aID') ?? u.searchParams.get('auctionID');
      return q && /^[a-z]?\d{9,12}$/i.test(q) ? q : null;
    }
    case 'mercari': {
      // https://jp.mercari.com/item/m12345678901
      const m = u.pathname.match(/\/item\/(m\d{9,12})\/?$/i);
      return m?.[1] ?? null;
    }
    default:
      return null;
  }
}

export interface OutboundLink {
  url: string;
  /** その出品を直接開くか（false なら社のトップ）。 */
  direct: boolean;
}

/**
 * その社でこの出品を開くリンク。直接開けないときは社のトップに落とす。
 * **落ちたことを direct: false で伝える**ので、画面はそれを隠さずに書ける。
 */
export function outboundFor(
  serviceId: string, serviceUrl: string, item: Item | null | undefined,
): OutboundLink {
  if (!item) return { url: serviceUrl, direct: false };
  const link = DEEP_LINKS[serviceId]?.[item.site];
  if (!link || !link.verified) return { url: serviceUrl, direct: false };
  const id = listingIdFrom(item.url, item.site);
  if (!id) return { url: serviceUrl, direct: false };
  return { url: link.pattern.replace('{id}', encodeURIComponent(id)), direct: true };
}

/** 検証済みの組み合わせの数。/sources に出して、どこまで直接開けるかを見せる。 */
export function verifiedDeepLinkCount(): number {
  return Object.values(DEEP_LINKS)
    .flatMap((byS) => Object.values(byS))
    .filter((d) => d?.verified).length;
}
