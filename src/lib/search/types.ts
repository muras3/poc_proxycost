import type { SiteId } from '@/lib/pricing/types';

export interface Candidate {
  title: string;
  url: string;
  site: SiteId;
  siteName: string;
  /** null = 検索結果から価格が取れなかった。**0 で埋めない。** */
  priceYen: number | null;
  imageUrl: string | null;
}

export interface SearchResponse {
  configured: boolean;
  results: Candidate[];
  reason?: string;
}

export interface ProductResponse {
  ok: boolean;
  title?: string;
  /** null = ページから価格を読めなかった。**0 で埋めない。** */
  priceYen?: number | null;
  site?: SiteId;
  siteName?: string;
  imageUrl?: string | null;
  /** 出品が送料込みか。読めなければ undefined。総額に直接効くので推測しない。 */
  freeShipping?: boolean;
  reason?: string;
}
