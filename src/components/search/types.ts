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
