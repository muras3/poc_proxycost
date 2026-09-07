import { z } from 'zod';
import { siteFromUrl } from './sites';
import type { ProductResponse } from './types';

export const UA = 'proxycost/0.1 (+https://github.com/muras3/poc_proxycost)';

// 価格の抽出は決定的にやる。LLM は使わない。
// 優先順: JSON-LD（Product/Offer）→ OpenGraph → サイト別の限定的な正規表現。

const offerSchema = z.object({
  price: z.union([z.string(), z.number()]).optional(),
  priceCurrency: z.string().optional(),
});
const productSchema = z.object({
  '@type': z.union([z.string(), z.array(z.string())]).optional(),
  name: z.string().optional(),
  image: z.union([z.string(), z.array(z.string()), z.object({ url: z.string() })]).optional(),
  offers: z.union([offerSchema, z.array(offerSchema)]).optional(),
});

const isProduct = (t: unknown) =>
  typeof t === 'string' ? t === 'Product' : Array.isArray(t) && t.includes('Product');

function toYen(v: unknown, ccy?: string): number | null {
  // 通貨が円でないなら換算せずに捨てる。勝手なレートで埋めない。
  if (ccy && ccy.toUpperCase() !== 'JPY') return null;
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[,\s¥￥]/g, '')) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function firstImage(image: unknown): string | null {
  if (typeof image === 'string') return image;
  if (Array.isArray(image) && typeof image[0] === 'string') return image[0];
  if (image && typeof image === 'object' && 'url' in image) {
    const u = (image as { url: unknown }).url;
    return typeof u === 'string' ? u : null;
  }
  return null;
}

function fromJsonLd(html: string) {
  const out: { title?: string; priceYen?: number | null; imageUrl?: string | null } = {};
  for (const m of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(m[1]!.trim());
    } catch {
      continue;
    }
    const nodes = Array.isArray(parsed) ? parsed : [parsed];
    const graph = nodes.flatMap((n) =>
      n && typeof n === 'object' && '@graph' in n
        ? ((n as { '@graph': unknown[] })['@graph'] ?? [])
        : [n],
    );
    for (const node of graph) {
      const p = productSchema.safeParse(node);
      if (!p.success || !isProduct(p.data['@type'])) continue;
      if (p.data.name && !out.title) out.title = p.data.name;
      const img = firstImage(p.data.image);
      if (img && !out.imageUrl) out.imageUrl = img;
      const offers = Array.isArray(p.data.offers) ? p.data.offers[0] : p.data.offers;
      if (offers && out.priceYen == null) {
        out.priceYen = toYen(offers.price, offers.priceCurrency);
      }
    }
  }
  return out;
}

const meta = (html: string, prop: string): string | null => {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']*)["']`, 'i');
  const m = html.match(re)
    ?? html.match(new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'));
  return m?.[1] ?? null;
};

function fromOpenGraph(html: string) {
  return {
    title: meta(html, 'og:title') ?? undefined,
    imageUrl: meta(html, 'og:image'),
    priceYen: toYen(
      meta(html, 'product:price:amount'),
      meta(html, 'product:price:currency') ?? undefined,
    ),
  };
}

function titleTag(html: string): string | undefined {
  return html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
}

/** ヤフオクの「送料無料 / 送料込み」。読めなければ undefined を返す。**推測しない。** */
function freeShippingHint(html: string, siteId: string): boolean | undefined {
  if (siteId !== 'yahoo-auctions') return undefined;
  if (/送料\s*無料|送料込み|出品者\s*負担/.test(html)) return true;
  if (/落札者\s*負担|送料\s*別/.test(html)) return false;
  return undefined;
}

export function parseProductHtml(html: string, url: string): ProductResponse {
  const site = siteFromUrl(url);
  const ld = fromJsonLd(html);
  const og = fromOpenGraph(html);
  const title = ld.title ?? og.title ?? titleTag(html);
  if (!title) {
    return { ok: false, reason: 'Could not read a product title from that page.' };
  }
  const priceYen = ld.priceYen ?? og.priceYen ?? null;
  return {
    ok: true,
    title: title.slice(0, 200),
    priceYen,
    site: site.id,
    siteName: site.name,
    imageUrl: ld.imageUrl ?? og.imageUrl ?? null,
    freeShipping: freeShippingHint(html, site.id),
    reason: priceYen == null ? 'The page did not state a price we could read — type it in.' : undefined,
  };
}

interface RobotsRule {
  allow: boolean;
  path: string;
}

/**
 * `User-agent: *` の群に属する Allow / Disallow だけを拾う。
 * 行単位で読むのは、`User-agent` が連続して1つの群を作る形（`Foo` と `*` を並べて
 * 同じ規則を与える）があり、テキストを分割する方法だとその群を取り落とすため。
 */
function starRules(robotsTxt: string): RobotsRule[] {
  const rules: RobotsRule[] = [];
  let inStar = false;
  let sawRule = false; // 規則の後にまた User-agent が来たら、そこから別の群
  for (const line of robotsTxt.split(/\r?\n/)) {
    const trimmed = line.replace(/#.*$/, '').trim();
    if (!trimmed) continue;
    const sep = trimmed.indexOf(':');
    if (sep < 0) continue;
    const field = trimmed.slice(0, sep).trim().toLowerCase();
    const value = trimmed.slice(sep + 1).trim();
    if (field === 'user-agent') {
      if (sawRule) {
        inStar = false;
        sawRule = false;
      }
      if (value === '*') inStar = true;
      continue;
    }
    if (field !== 'allow' && field !== 'disallow') continue;
    sawRule = true;
    if (inStar) rules.push({ allow: field === 'allow', path: value });
  }
  return rules;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** robots.txt のパス表記（`*` と 末尾 `$`）をそのまま扱う。 */
function ruleMatches(pattern: string, pathname: string): boolean {
  if (!pattern) return false; // 値の無い Disallow は「何も禁止しない」
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const source = `^${body.split('*').map(escapeRe).join('.*')}${anchored ? '$' : ''}`;
  try {
    return new RegExp(source).test(pathname);
  } catch {
    return false;
  }
}

/**
 * `User-agent: *` の規則で、このパスの取得が禁止されているか。
 * 最長一致が勝ち、同じ長さなら Allow が勝つ（RFC 9309）。
 * `Disallow: /` と `Allow: /product/` を併記する店を「全面禁止」と読むと、
 * 許可されている商品ページまで諦めることになる。
 */
export function robotsBlocks(robotsTxt: string, pathname: string): boolean {
  let best: RobotsRule | null = null;
  for (const rule of starRules(robotsTxt)) {
    if (!ruleMatches(rule.path, pathname)) continue;
    const longer = !best || rule.path.length > best.path.length;
    const tieButAllow = best != null && rule.path.length === best.path.length && rule.allow;
    if (longer || tieButAllow) best = rule;
  }
  return best ? !best.allow : false;
}

/**
 * localhost・プライベートIP・非標準ポートを弾く（SSRF 対策）。
 * IPv4 射影 IPv6（::ffff:127.0.0.1）や CGNAT（100.64/10）も塞ぐ。
 * **文字列の検証だけでは足りない。**リダイレクト先は fetchPublic 側で毎回この関数に掛ける。
 */
export function isPublicHttpUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  // 80 / 443 以外は内部サービスを狙う踏み台になる。
  if (u.port && u.port !== '80' && u.port !== '443') return false;

  let h = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  // ::ffff:127.0.0.1 と ::ffff:7f00:1 のどちらの表記でも来る。ドット形に均してから判定する。
  const mapped = h.match(/^::ffff:(.+)$/i);
  if (mapped) {
    const rest = mapped[1]!;
    const hex = rest.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
    h = hex
      ? [
          (parseInt(hex[1]!, 16) >> 8) & 255, parseInt(hex[1]!, 16) & 255,
          (parseInt(hex[2]!, 16) >> 8) & 255, parseInt(hex[2]!, 16) & 255,
        ].join('.')
      : rest;
  }

  if (h === 'localhost' || h.endsWith('.localhost') || h === '::1' || h === '::' || h === '0.0.0.0') return false;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
  // 100.64/10 は CGNAT。クラウドのメタデータ代理に使われる。
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h)) return false;
  if (/^169\.254\./.test(h) || /^0\./.test(h)) return false;
  if (/^(fc|fd|fe80)/i.test(h)) return false;
  return true;
}

const MAX_REDIRECTS = 3;

/**
 * リダイレクトを自前で辿り、**毎ホップで公開URLかを検査し直す。**
 * `redirect: 'follow'` のままだと、公開ホストが 302 で 169.254.169.254 へ飛ばすだけで
 * 内部に届いてしまう（文字列検査は最初の1回しか効かない）。
 */
export async function fetchPublic(
  url: string, init: RequestInit & { timeoutMs?: number } = {},
): Promise<{ ok: true; res: Response; finalUrl: string } | { ok: false; reason: string }> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isPublicHttpUrl(current)) {
      return { ok: false, reason: 'That URL resolves somewhere we will not fetch from.' };
    }
    let res: Response;
    try {
      res = await fetch(current, {
        ...init,
        redirect: 'manual',
        signal: AbortSignal.timeout(init.timeoutMs ?? 10000),
      });
    } catch {
      return { ok: false, reason: 'Could not reach that page.' };
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return { ok: false, reason: 'That page redirected without a destination.' };
      current = new URL(loc, current).toString();
      continue;
    }
    return { ok: true, res, finalUrl: current };
  }
  return { ok: false, reason: 'That page redirected too many times.' };
}
