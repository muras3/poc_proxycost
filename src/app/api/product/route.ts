import { NextResponse } from 'next/server';
import { cacheGet, cachePut, TTL_PRODUCT } from '@/lib/search/cache';
import { UA, fetchPublic, isPublicHttpUrl, parseProductHtml, robotsBlocks } from '@/lib/search/product';
import type { ProductResponse } from '@/lib/search/types';

export const runtime = 'nodejs';

const MAX_HTML_BYTES = 3_000_000;

const fail = (reason: string) =>
  NextResponse.json<ProductResponse>({ ok: false, reason }, { status: 200 });

const BLOCKED = "That shop's robots.txt asks us not to fetch this page. Type the price in by hand.";

/** robots.txt を尊重する。引けないだけでは諦めない（禁止の証拠が無いなら取りに行く）。 */
async function robotsForbids(target: URL): Promise<boolean> {
  const key = `robots:${target.origin}`;
  const cached = await cacheGet(key);
  if (cached !== null) return robotsBlocks(cached, target.pathname);

  const res = await fetchPublic(`${target.origin}/robots.txt`, {
    headers: { 'user-agent': UA },
    timeoutMs: 5000,
  });
  if (!res.ok || !res.res.ok) return false;
  const txt = (await res.res.text()).slice(0, 200_000);
  await cachePut(key, txt, TTL_PRODUCT);
  return robotsBlocks(txt, target.pathname);
}

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get('url') ?? '';
  if (!isPublicHttpUrl(raw)) {
    return fail('That does not look like a public listing URL.');
  }
  const target = new URL(raw);

  const cacheKey = `product:${target.toString()}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return NextResponse.json(JSON.parse(cached) as ProductResponse);

  if (await robotsForbids(target)) return fail(BLOCKED);

  const page = await fetchPublic(target.toString(), {
    headers: { 'user-agent': UA, accept: 'text/html' },
    timeoutMs: 10000,
  });
  if (!page.ok) return fail(page.reason);
  if (!page.res.ok) return fail(`That page returned HTTP ${page.res.status}.`);

  // リダイレクトで別ホストに出たら、その先の robots.txt を見直す。
  // 最初のホストの許可は、飛ばされた先の許可ではない。
  const final = new URL(page.finalUrl);
  if (final.origin !== target.origin && (await robotsForbids(final))) return fail(BLOCKED);

  const type = page.res.headers.get('content-type') ?? '';
  if (type && !/text\/html|application\/xhtml/i.test(type)) {
    return fail('That URL is not a product page we can read.');
  }
  const declared = Number(page.res.headers.get('content-length') ?? '0');
  if (declared > MAX_HTML_BYTES) return fail('That page is too large to read.');

  const html = (await page.res.text()).slice(0, MAX_HTML_BYTES);
  const parsed = parseProductHtml(html, page.finalUrl);
  if (parsed.ok) await cachePut(cacheKey, JSON.stringify(parsed), TTL_PRODUCT);
  return NextResponse.json(parsed);
}
