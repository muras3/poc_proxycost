/**
 * 代行5社が「対応している」と公表している出品サイトの一覧を、各社の一次情報から
 * 機械抽出する部品。**取得と抽出だけ。**判断（どれを検索対象にするか、料率をどうするか）は
 * しない。
 *
 * 呼び出し側は2つ:
 *   scripts/proxy-sites-fetch.ts … 一覧を出して data/proxy-sites.json を更新する
 *   scripts/fees-check.ts        … 週次で「増えた／消えた」を報せる
 *
 * **名前を host に落とすのは自動でやらない。**各社は同じサイトを違う名で出す
 * （Buyee と ZenMarket はヤフオクを "JDirectItems Auction" と書く）。ここが出すのは
 * 「そのページに実際に並んでいた名前とリンク先」まで。host への対応づけは
 * data/proxy-sites.json の `known` に人が一次情報を見て書く。
 *
 * **料率は取らない。**出典が散文なので社ごとにパーサを書くことになり、言い回しが
 * 変わると静かに壊れて間違った数字を出す。料率は fees-check.ts の
 * 「指紋を比べて変わったら報せる」ままにする。
 */
export const UA = 'proxycost-sites-watch/0.1 (+https://github.com/muras3/poc_proxycost)';
const ACCEPT = 'text/html,text/plain,*/*;q=0.8';

export interface Extracted {
  /** そのページに出ていた表示名。原文のまま。host の形ならそれ自体が host。 */
  label: string;
  /** その名前が指していたリンク先。同社内のページのこともある。 */
  href: string;
}

export interface Source {
  service: string;
  url: string;
  /** 何を見ているか（人が読む用）。 */
  note: string;
  /**
   * 抽出したラベルがそのまま host か。
   * **ラベルの形から推測しない。**`about.aspx` は host の形をしているが host ではない。
   * 出典ごとに、そこが何を並べているかを分かって書く。
   */
  labelsAreHosts: boolean;
  extract: (body: string) => Extracted[];
}

const unescapeHtml = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ');

const text = (html: string) =>
  unescapeHtml(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** URL から host を取り出す。URL でなければ null（例外を投げない）。 */
export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** 同じ label は1つに。並びは label で固定する（実行ごとに揺れないため）。 */
export function normalize(items: Extracted[]): Extracted[] {
  const byLabel = new Map<string, Extracted>();
  for (const it of items) {
    const label = it.label.trim();
    if (!label) continue;
    if (!byLabel.has(label)) byLabel.set(label, { label, href: it.href });
  }
  return [...byLabel.values()].sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
}

/**
 * Cloudflare などの「Just a moment...」。**200 で返ってくることがある。**
 * これを本文として扱うと「抽出 0 件 = 対応サイトが減った」と読み違える。
 */
export function isBotChallenge(body: string): boolean {
  return /<title>\s*Just a moment\.\.\.\s*<\/title>/i.test(body)
    || /challenges\.cloudflare\.com/.test(body);
}

/**
 * Buyee: トップの `<nav class="service-nav">`。ここに並ぶのが同社の「対応サイト」。
 * この入れ物が消えたら抽出は 0 件になる。**0 件は「対応サイトが無い」ではなく
 * 「読めなくなった」なので、失敗として報せる。**
 */
export function extractBuyee(html: string): Extracted[] {
  const nav = html.match(/<nav class="service-nav">([\s\S]*?)<\/nav>/);
  if (!nav) return [];
  const out: Extracted[] = [];
  for (const m of nav[1]!.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    out.push({ label: text(m[2]!), href: m[1]! });
  }
  return normalize(out);
}

/** Jauce: ヘッダの `<div class="responsive-shopCategories">` に出品サイトのタブが並ぶ。 */
export function extractJauce(html: string): Extracted[] {
  const nav = html.match(/<div class="responsive-shopCategories"[^>]*>([\s\S]*?)<\/div>/);
  if (!nav) return [];
  const out: Extracted[] = [];
  for (const m of nav[1]!.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    out.push({ label: text(m[2]!), href: m[1]! });
  }
  return normalize(out);
}

/**
 * Neokyo: shop-list のカード。カードの外部リンクが**元サイトの host そのもの**で、
 * 5社の中でこれと ZenMarket の othershops だけが host を直接くれる。
 */
export function extractNeokyo(html: string): Extracted[] {
  const out: Extracted[] = [];
  for (const m of html.matchAll(/class="[^"]*shop-list-item[^"]*"><a href="(https?:\/\/[^"]+)"/g)) {
    const host = hostOf(m[1]!);
    if (host) out.push({ label: host, href: m[1]! });
  }
  return normalize(out);
}

/**
 * ZenMarket: トップからサイト別ページ `/en/<name>.aspx` が張られている。
 * **どれが出品サイトでどれが案内ページかはここで決めない。**basename をそのまま出して、
 * known の対応表で人が仕分ける（`fees.aspx` のような案内ページも混ざる）。
 */
export function extractZenMarketPages(html: string): Extracted[] {
  const out: Extracted[] = [];
  for (const m of html.matchAll(/https:\/\/zenmarket\.jp\/en\/([a-z0-9_-]+)\.aspx/g)) {
    out.push({ label: `${m[1]!}.aspx`, href: `https://zenmarket.jp/en/${m[1]!}.aspx` });
  }
  return normalize(out);
}

/** 自社以外へ張られた外部リンクの host を拾う（ZenMarket の「その他の対応ショップ」）。 */
export function extractOutboundHosts(self: string) {
  return (html: string): Extracted[] => {
    const out: Extracted[] = [];
    for (const m of html.matchAll(/href="(https?:\/\/[^"]+)"/g)) {
      const host = hostOf(m[1]!);
      if (host && host !== self && !host.endsWith(`.${self}`)) {
        out.push({ label: host, href: m[1]! });
      }
    }
    return normalize(out);
  };
}

/**
 * FROM JAPAN: 画面は JS 描画で HTML からは何も取れない（docs/audit/fees.md と同じ事情）。
 * 公式が配信している翻訳ファイル（base64 の JSON）に `((meta))<サイト名>` というキーがあり、
 * これが同社のサイト別ランディングページの集合にあたる。
 */
export function extractFromJapan(body: string): Extracted[] {
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(body, 'base64').toString('utf8'));
  } catch {
    return [];
  }
  if (!json || typeof json !== 'object') return [];
  const out: Extracted[] = [];
  for (const key of Object.keys(json as Record<string, unknown>)) {
    const m = key.match(/^\(\(meta\)\)(.+)$/);
    if (m) out.push({ label: m[1]!.trim(), href: 'https://www.fromjapan.co.jp/' });
  }
  return normalize(out);
}

export const SOURCES: Source[] = [
  { service: 'Buyee', url: 'https://buyee.jp/', note: 'トップの <nav class="service-nav">', labelsAreHosts: false, extract: extractBuyee },
  { service: 'Jauce', url: 'https://www.jauce.com/', note: 'ヘッダの <div class="responsive-shopCategories">', labelsAreHosts: false, extract: extractJauce },
  { service: 'Neokyo', url: 'https://neokyo.com/en/shop-list', note: 'shop-list のカード（外部リンクが元サイトの host）', labelsAreHosts: true, extract: extractNeokyo },
  { service: 'Neokyo', url: 'https://neokyo.com/en/hobby-shop-list', note: 'shop-list（Hobbies & Games）', labelsAreHosts: true, extract: extractNeokyo },
  { service: 'Neokyo', url: 'https://neokyo.com/en/fashion-shop-list', note: 'shop-list（Fashion）', labelsAreHosts: true, extract: extractNeokyo },
  { service: 'Neokyo', url: 'https://neokyo.com/en/music-shop-list', note: 'shop-list（Music & Idols）', labelsAreHosts: true, extract: extractNeokyo },
  { service: 'Neokyo', url: 'https://neokyo.com/en/electronic-shop-list', note: 'shop-list（Electronics）', labelsAreHosts: true, extract: extractNeokyo },
  { service: 'FROM JAPAN', url: 'https://www.fromjapan.co.jp/translate/en.txt', note: '公式配信の翻訳ファイル（base64 JSON）の ((meta))<サイト名> キー', labelsAreHosts: false, extract: extractFromJapan },
  { service: 'ZenMarket', url: 'https://zenmarket.jp/en/', note: 'トップから張られたサイト別ページ /en/<name>.aspx', labelsAreHosts: false, extract: extractZenMarketPages },
  { service: 'ZenMarket', url: 'https://zenmarket.jp/en/othershops.aspx', note: '「その他の対応ショップ」の外部リンク（host がそのまま対応サイト）', labelsAreHosts: true, extract: extractOutboundHosts('zenmarket.jp') },
];

export interface SourceRecord {
  url: string;
  service: string;
  note: string;
  /** Source.labelsAreHosts をそのまま記録に残す（後段が出典の性質を見失わないため）。 */
  labelsAreHosts: boolean;
  status: number | null;
  ok: boolean;
  /** 取れなかったときの理由。**取れていないのに前回の値を載せない。** */
  reason?: string;
  labels: string[];
  hrefs: Record<string, string>;
  checkedOn: string;
}

export interface KnownSite {
  /** 一次情報で確かめた host。**確かめていないなら null。推測で埋めない。** */
  host: string | null;
  /** src/lib/pricing/types.ts の SiteId。まだ無いサイトは null。 */
  siteId: string | null;
  note: string;
}

export interface SitesStore {
  checkedOn: string;
  sources: Record<string, SourceRecord>;
  /** 表示名 → host の対応表。**人が一次情報を見て書く。**自動で増やさない。 */
  known: Record<string, KnownSite>;
}

/** 1つの出典を取ってきて抽出する。ネットワークの失敗を throw しない。 */
export async function fetchSource(s: Source, today: string): Promise<SourceRecord> {
  let status: number | null = null;
  let body = '';
  try {
    const res = await fetch(s.url, {
      headers: { 'user-agent': UA, accept: ACCEPT },
      signal: AbortSignal.timeout(25000),
      redirect: 'follow',
    });
    status = res.status;
    if (res.ok) body = await res.text();
  } catch {
    status = null;
  }
  const challenged = isBotChallenge(body);
  const items = status === 200 && !challenged ? s.extract(body) : [];
  const ok = items.length > 0;
  return {
    url: s.url,
    service: s.service,
    note: s.note,
    labelsAreHosts: s.labelsAreHosts,
    status,
    ok,
    ...(ok
      ? {}
      : {
        reason:
            status === null ? '取得できず（timeout / 接続不可）'
              : challenged ? 'bot チャレンジが返ってきた（本文が届いていない）'
                : status !== 200 ? `HTTP ${status}`
                  : '本文は取れたが抽出が 0 件（入れ物の形が変わった可能性）',
      }),
    labels: items.map((i) => i.label),
    hrefs: Object.fromEntries(items.map((i) => [i.label, i.href])),
    checkedOn: today,
  };
}

/** 前回の記録との差。**取れなかった回は差分を出さない**（消えたと読み違えるため）。 */
export function diffLabels(before: SourceRecord | undefined, now: SourceRecord):
{ added: string[]; gone: string[] } {
  if (!before || !before.ok || !now.ok) return { added: [], gone: [] };
  const was = new Set(before.labels);
  const has = new Set(now.labels);
  return {
    added: now.labels.filter((l) => !was.has(l)),
    gone: before.labels.filter((l) => !has.has(l)),
  };
}

/** known にも無く、host をそのまま並べる出典でもない名前＝「まだ調べていないサイト」。 */
export function unmappedLabels(rec: SourceRecord, known: Record<string, KnownSite>): string[] {
  if (!rec.ok || rec.labelsAreHosts) return [];
  return rec.labels.filter((l) => !(l in known));
}

/** その出典から読み取れる host の集合。**分からないものは含めない。** */
export function hostsOf(rec: SourceRecord, known: Record<string, KnownSite>): string[] {
  if (!rec.ok) return [];
  if (rec.labelsAreHosts) return rec.labels;
  return rec.labels.map((l) => known[l]?.host).filter((h): h is string => Boolean(h));
}
