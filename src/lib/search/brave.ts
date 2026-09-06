import { z } from 'zod';
import { siteFilter, siteFromUrl } from './sites';
import type { Candidate, SearchResponse } from './types';
import { cacheGet, cachePut, TTL_SEARCH } from './cache';

const ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';

// thumbnail と product.price はスキーマに存在するが型が any? で返却保証の記載が無い
// （REQUIREMENTS §8.5）。**通らなければ落として null にする。推測で埋めない。**
const resultSchema = z.object({
  title: z.string(),
  url: z.string(),
  thumbnail: z.object({ src: z.string().optional() }).partial().optional(),
  product: z.object({ price: z.union([z.string(), z.number()]).optional() }).partial().optional(),
});
const bodySchema = z.object({
  web: z.object({ results: z.array(z.unknown()).optional() }).partial().optional(),
});

function yenFrom(price: unknown): number | null {
  if (typeof price === 'number') return price > 0 ? Math.round(price) : null;
  if (typeof price !== 'string') return null;
  // '¥12,800' / '12800 JPY' のような表記だけ受ける。通貨記号が付かない数字は信用しない。
  const m = price.match(/(?:¥|￥|JPY\s*)\s*([\d,]+)|([\d,]+)\s*(?:円|JPY)/i);
  const digits = (m?.[1] ?? m?.[2])?.replace(/,/g, '');
  const n = digits ? Number(digits) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * キーが入っているか。UI と `/api/search` が「未設定」と「その他の失敗」を
 * 混ぜて表示しないために、判定をここ1か所に置く。
 */
export function isSearchConfigured(): boolean {
  return Boolean(process.env['BRAVE_API_KEY']);
}

export const NOT_CONFIGURED =
  'Keyword search is not configured on this deployment. Paste a listing URL instead.';

export async function braveSearch(query: string): Promise<SearchResponse> {
  const key = process.env['BRAVE_API_KEY'];
  if (!key) {
    // キーが無いことを隠さない。UI は URL を貼る道に落ちる。
    return { configured: false, results: [], reason: NOT_CONFIGURED };
  }

  const q = `${query} (${siteFilter()})`;
  // 24h キャッシュ。$5/1,000 プランに storage rights が含まれるかは公式に明記が無く
  // （REQUIREMENTS §8.5 の未決事項）、Brave の回答次第でここは短くするか外す。
  const cacheKey = `search:${q}`;
  const cached = await cacheGet(cacheKey);
  if (cached) {
    return { configured: true, results: JSON.parse(cached) as Candidate[] };
  }

  // 1クエリのみ。ページングは1回ごとに $0.005 の追加課金になる。
  const url = `${ENDPOINT}?q=${encodeURIComponent(q)}&count=20&country=JP&search_lang=ja`;
  let raw: unknown;
  try {
    const r = await fetch(url, {
      headers: { Accept: 'application/json', 'X-Subscription-Token': key },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) {
      return { configured: true, results: [], reason: `Search returned HTTP ${r.status}.` };
    }
    raw = await r.json();
  } catch {
    return { configured: true, results: [], reason: 'Search timed out.' };
  }

  const body = bodySchema.safeParse(raw);
  if (!body.success) return { configured: true, results: [], reason: 'Search returned an unexpected shape.' };

  const results: Candidate[] = [];
  for (const item of body.data.web?.results ?? []) {
    const p = resultSchema.safeParse(item);
    if (!p.success) continue;
    const site = siteFromUrl(p.data.url);
    if (site.id === 'other') continue; // 対象サイト以外は出さない
    results.push({
      title: p.data.title.replace(/<\/?strong>/g, '').slice(0, 200),
      url: p.data.url,
      site: site.id,
      siteName: site.name,
      priceYen: yenFrom(p.data.product?.price),
      imageUrl: p.data.thumbnail?.src ?? null,
    });
  }

  await cachePut(cacheKey, JSON.stringify(results), TTL_SEARCH);
  return { configured: true, results };
}
