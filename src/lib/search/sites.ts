import type { SiteId } from '@/lib/pricing/types';

export interface Site {
  id: SiteId;
  name: string;
  /** この語がホスト名に含まれればこのサイトと判定する。 */
  hosts: string[];
  /** オークションか固定価格か。オークションは落札価格が事後に決まる。 */
  kind: 'auction' | 'fixed';
  /** Jauce のサービス料がベータで無料になるか（¥400/点 + 8% が 0 になる）。 */
  jauceFree: boolean;
}

// 横断検索の対象。増やすときは Jauce の無料対象かを必ず確かめてから足す。
export const SITES: Site[] = [
  { id: 'yahoo-auctions', name: 'Yahoo! Auctions', hosts: ['auctions.yahoo.co.jp'], kind: 'auction', jauceFree: false },
  { id: 'mercari', name: 'Mercari', hosts: ['jp.mercari.com', 'mercari.com'], kind: 'fixed', jauceFree: false },
  { id: 'rakuten', name: 'Rakuten', hosts: ['item.rakuten.co.jp', 'rakuten.co.jp'], kind: 'fixed', jauceFree: true },
  { id: 'yahoo-shopping', name: 'Yahoo! Shopping', hosts: ['store.shopping.yahoo.co.jp', 'shopping.yahoo.co.jp'], kind: 'fixed', jauceFree: true },
  { id: 'amazon-jp', name: 'Amazon.co.jp', hosts: ['amazon.co.jp'], kind: 'fixed', jauceFree: false },
  { id: 'suruga-ya', name: 'Suruga-ya', hosts: ['suruga-ya.jp'], kind: 'fixed', jauceFree: false },
  { id: 'mandarake', name: 'Mandarake', hosts: ['mandarake.co.jp'], kind: 'fixed', jauceFree: false },
  { id: 'zozo', name: 'ZOZOTOWN', hosts: ['zozo.jp'], kind: 'fixed', jauceFree: false },
  { id: 'hmv', name: 'HMV Japan', hosts: ['hmv.co.jp'], kind: 'fixed', jauceFree: false },
  { id: 'toranoana', name: 'Toranoana', hosts: ['ecs.toranoana.jp', 'toranoana.jp'], kind: 'fixed', jauceFree: false },
];

const OTHER: Site = { id: 'other', name: 'Other shop', hosts: [], kind: 'fixed', jauceFree: false };

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

/** Brave に投げる `site:` の並び。1クエリに収める（ページングは追加課金）。 */
export function siteFilter(): string {
  return SITES.flatMap((s) => s.hosts.slice(0, 1)).map((h) => `site:${h}`).join(' OR ');
}
