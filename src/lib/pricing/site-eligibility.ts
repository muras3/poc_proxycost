import { siteById, SITES } from '@/lib/search/sites';
import type { SiteId } from './types';

/**
 * **サイト適格性の常時開示。**
 *
 * ユーザーが商品 URL を貼ったとき、代行5社（buyee / zenmarket / neokyo / fromjapan /
 * jauce）それぞれが**そのショッピングサイトから買えると公表しているか**を出す。
 * 出す値は `blocked` / `caution` / アラート無し（`none`）の3つだけ。
 *
 * `restricted-goods.ts` と同じ作法: **判定はしない。** 各社が原文で何と言っているかと、
 * 我々がいつ読んだかしか書かない。理由（`reason`）は原文の要約であって、我々の判断ではない。
 *
 * ここは運用・監視の対象外（ウォッチャーもstaleness判定も無い）。`data/proxy-sites.json` /
 * `scripts/lib/proxy-sites.ts` はそれ用の別の仕組みで、ここからは触らない。
 *
 * **マスタ形式の選択について（`master/*.json` + `validate.py` ではなくこの TS モジュールを
 * 選んだ理由）**: `master/` は「数値（送料・手数料の額）を、再現計算で fixtures と突き合わせる」
 * ためのマスタで、Python の検証器が請求額の再現性を見ている。ここのデータは数値ではなく
 * 「対応している／していない」という4値の事実＋出典URL＋引用文で、再現計算の対象がない。
 * `restricted-goods.ts`（英語ユーザー向け文言＋日本語コメントで出典を説明する、ソース付き
 * ノンジャッジな TS データモジュール）の方が形として一致するので、そちらに合わせた。
 * スキーマの検証は Python ではなく同じ vitest スイート内の `validateEligibilityRows` で行う
 * （`site-eligibility.test.ts`）。
 */

/** 代行5社。 */
export type ProxyId = 'buyee' | 'zenmarket' | 'neokyo' | 'fromjapan' | 'jauce';

/**
 * 各社の一般方針。
 *   any_japanese_url … 「日本語のURLなら基本何でも」（buyee, zenmarket, neokyo, fromjapan）
 *   listed_only       … 「公表している主要サイトのみ」（jauce）
 */
export type ProxyPolicy = 'any_japanese_url' | 'listed_only';

export interface ProxyInfo {
  id: ProxyId;
  name: string;
  policy: ProxyPolicy;
  /** 方針そのものの出典（自由文の引用）。 */
  policyQuote: string;
  policySourceUrl: string;
}

export const PROXIES: Record<ProxyId, ProxyInfo> = {
  buyee: {
    id: 'buyee', name: 'Buyee', policy: 'any_japanese_url',
    policyQuote: 'Buyee supports ordering from a broad set of named Japanese shopping and'
      + ' auction sites, plus most other Japanese shops via its universal proxy purchase form.',
    policySourceUrl: 'https://buyee.jp/',
  },
  zenmarket: {
    id: 'zenmarket', name: 'ZenMarket', policy: 'any_japanese_url',
    policyQuote: 'ZenMarket lists dozens of partner and recommended Japanese shops and also'
      + ' accepts purchase requests from other Japanese shopping sites.',
    policySourceUrl: 'https://zenmarket.jp/en/othershops.aspx',
  },
  neokyo: {
    id: 'neokyo', name: 'Neokyo', policy: 'any_japanese_url',
    policyQuote: 'Any Japanese website is eligible for our service, as long as: The purchased'
      + ' items are not prohibited. ... The shop in question is able to ship your order to'
      + ' our headquarters.',
    policySourceUrl: 'https://neokyo.com/en/service-introduction',
  },
  fromjapan: {
    id: 'fromjapan', name: 'FROM JAPAN', policy: 'any_japanese_url',
    policyQuote: 'ご希望の商品ページ、オークションページのURLを入力して、注文・入札が簡単に行えます。',
    policySourceUrl: 'https://www.fromjapan.co.jp/',
  },
  jauce: {
    id: 'jauce', name: 'Jauce', policy: 'listed_only',
    policyQuote: 'Please note that our system supports only "major" online malls and stores.',
    policySourceUrl: 'https://www.jauce.com/help/knowledgebase.php?article=1',
  },
};

/**
 * 出品サイト。**検索の `SiteId`（`src/lib/search/sites.ts`）と可能な限り共有する**——
 * 別の識別子を割ると同じサイトが二重に管理されて食い違う。検索にまだ無いサイトだけ、
 * ここだけの文字列 id を新設する（検索の `SITES` には**足さない**。検索挙動を変えるため）。
 */
export type EligibilitySiteId = SiteId
  | 'paypay-fleamarket'
  | 'rakuma'
  | 'bookoff'
  | 'animate'
  | 'amiami'
  | '2ndstreet'
  | 'melonbooks'
  | 'p-bandai'
  | 'yodobashi';

/** 検索の `SITES` にまだ無いサイトのホスト表。ここだけで完結させる。 */
const EXTRA_HOSTS: Partial<Record<EligibilitySiteId, string[]>> = {
  'paypay-fleamarket': ['paypayfleamarket.yahoo.co.jp'],
  rakuma: ['fril.jp'],
  bookoff: ['shopping.bookoff.co.jp', 'bookoffonline.co.jp'],
  animate: ['animate-onlineshop.jp'],
  amiami: ['amiami.jp'],
  '2ndstreet': ['2ndstreet.jp'],
  melonbooks: ['melonbooks.co.jp'],
  'p-bandai': ['p-bandai.jp'],
  yodobashi: ['yodobashi.com'],
};

/** 画面文言・reason 文に使う表示名。 */
export const SITE_LABELS: Record<EligibilitySiteId, string> = {
  'yahoo-auctions': 'Yahoo! Japan Auctions',
  mercari: 'Mercari',
  rakuten: 'Rakuten',
  'yahoo-shopping': 'Yahoo! Shopping',
  'amazon-jp': 'Amazon.co.jp',
  'suruga-ya': 'Suruga-ya',
  mandarake: 'Mandarake',
  zozo: 'ZOZOTOWN',
  hmv: 'HMV Japan',
  toranoana: 'Toranoana',
  other: 'this site',
  'paypay-fleamarket': 'PayPay Fleamarket',
  rakuma: 'Rakuma',
  bookoff: 'BOOKOFF',
  animate: 'Animate',
  amiami: 'AmiAmi',
  '2ndstreet': '2nd STREET',
  melonbooks: 'Melonbooks',
  'p-bandai': 'Premium Bandai (P-Bandai)',
  yodobashi: 'Yodobashi Camera',
};

/** amazon.co.jp と amazon.jp が同居するので、'amazon-jp' の追加ホストだけここで足す。 */
const EXTRA_HOSTS_FOR_KNOWN: Partial<Record<SiteId, string[]>> = {
  'amazon-jp': ['amazon.jp'],
};

function hostsFor(site: EligibilitySiteId): string[] {
  const extra = EXTRA_HOSTS[site];
  if (extra) return extra;
  const known = siteById(site as SiteId);
  const more = EXTRA_HOSTS_FOR_KNOWN[site as SiteId] ?? [];
  return [...known.hosts, ...more];
}

const ALL_ELIGIBILITY_SITE_IDS: EligibilitySiteId[] = [
  ...SITES.map((s) => s.id).filter((id): id is SiteId => id !== 'other' && id !== 'hmv'),
  'paypay-fleamarket', 'rakuma', 'bookoff', 'animate', 'amiami', '2ndstreet', 'melonbooks',
  'p-bandai', 'yodobashi',
];

/**
 * URL のホストから出品サイトを引く。`siteFromUrl`（検索用）と同じ規則:
 * 完全一致かサブドメインだけを認め、`amazon.co.jp.evil.com` のような詐称ホストは
 * 拾わない。長いホスト名から先に当てる。
 */
export function eligibilitySiteFromUrl(url: string): EligibilitySiteId | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  const ranked = ALL_ELIGIBILITY_SITE_IDS
    .flatMap((id) => hostsFor(id).map((h) => ({ id, h })))
    .sort((a, b) => b.h.length - a.h.length);
  for (const { id, h } of ranked) {
    if (host === h || host.endsWith(`.${h}`)) return id;
  }
  return null;
}

/** 各社が官製に公表している対応状況。 */
export type SiteStatus = 'listed' | 'unsupported' | 'suspended' | 'not_listed';

/** その事実をどう確認したか。 */
export type EvidenceMethod = 'raw_html' | 'browser' | 'member_area';

export interface EligibilityRow {
  proxy: ProxyId;
  site: EligibilitySiteId;
  status: SiteStatus;
  method: EvidenceMethod;
  /** listed/unsupported/suspended は必須。not_listed は無くてよい。 */
  sourceUrl?: string;
  /** 原文の引用（英語）。member_area は掲載されていた店名（ラベル）。 */
  quote?: string;
  checkedOn: string;
  /** 判断ではなく、データを読む上での注意書き（例: 表記ゆれ、リンク先の食い違い）。 */
  note?: string;
}

export const ELIGIBILITY_CHECKED_ON = '2026-09-15';

// ============================================================ buyee (any_japanese_url)
const BUYEE_ABOUT = 'https://media.buyee.jp/pr/about_mercari/en/';
const BUYEE_AUCTION = 'https://media.buyee.jp/pr/about_auction/en/';
const BUYEE_SHOPPING = 'https://media.buyee.jp/guide/buyee05_jdirectitems/en/';
const BUYEE_PAYPAY = 'https://media.buyee.jp/pr/about_paypay/en/';
const BUYEE_RAKUTEN = 'https://media.buyee.jp/guide/buyee02_rakuten/en/';
const BUYEE_SHOP_NAV = 'https://shop.buyee.jp/';
const BUYEE_AMAZON = 'https://media.buyee.jp/guide/buyee02_amazon/en/';
const BUYEE_ZOZO = 'https://media.buyee.jp/guide/buyee02_zozo/en/';
const BUYEE_OTHER_SHOPPING = 'https://media.buyee.jp/guide/othershopping/en/';
const BUYEE_PBANDAI = 'https://shop.buyee.jp/p-bandai';

const BUYEE_ROWS: EligibilityRow[] = [
  {
    proxy: 'buyee', site: 'mercari', status: 'listed', method: 'raw_html',
    sourceUrl: BUYEE_ABOUT,
    quote: 'Shop at Mercari from Japan, and Buyee will ship your items worldwide!',
    checkedOn: ELIGIBILITY_CHECKED_ON,
  },
  {
    proxy: 'buyee', site: 'yahoo-auctions', status: 'listed', method: 'raw_html',
    sourceUrl: BUYEE_AUCTION,
    quote: 'Buyee brands Yahoo! Japan Auctions as "JDirectItems Auction".',
    checkedOn: ELIGIBILITY_CHECKED_ON,
  },
  {
    proxy: 'buyee', site: 'yahoo-shopping', status: 'listed', method: 'raw_html',
    sourceUrl: BUYEE_SHOPPING,
    quote: 'Buyee brands Yahoo! Shopping as "JDirectItems Shopping".',
    checkedOn: ELIGIBILITY_CHECKED_ON,
  },
  {
    proxy: 'buyee', site: 'paypay-fleamarket', status: 'listed', method: 'raw_html',
    sourceUrl: BUYEE_PAYPAY,
    quote: 'Buyee brands PayPay Fleamarket as "JDirectItems Fleamarket" and links to'
      + ' buyee.jp/paypayfleamarket/.',
    checkedOn: ELIGIBILITY_CHECKED_ON,
  },
  {
    proxy: 'buyee', site: 'rakuten', status: 'listed', method: 'raw_html',
    sourceUrl: BUYEE_RAKUTEN,
    quote: "order items from Japan's largest online shopping mall, Rakuten",
    checkedOn: ELIGIBILITY_CHECKED_ON,
  },
  {
    proxy: 'buyee', site: 'rakuma', status: 'listed', method: 'raw_html',
    sourceUrl: BUYEE_SHOP_NAV,
    quote: 'shop.buyee.jp\'s navigation carries a "楽天ラクマ" (Rakuma) tab.',
    checkedOn: ELIGIBILITY_CHECKED_ON,
  },
  {
    proxy: 'buyee', site: 'amazon-jp', status: 'listed', method: 'raw_html',
    sourceUrl: BUYEE_AMAZON,
    quote: 'Buy from Amazon Japan - Buyee',
    checkedOn: ELIGIBILITY_CHECKED_ON,
  },
  {
    proxy: 'buyee', site: 'zozo', status: 'listed', method: 'raw_html',
    sourceUrl: BUYEE_ZOZO,
    quote: "order items from Japan's largest fashion shopping site, ZOZOTOWN.",
    checkedOn: ELIGIBILITY_CHECKED_ON,
  },
  {
    proxy: 'buyee', site: 'animate', status: 'listed', method: 'raw_html',
    sourceUrl: BUYEE_OTHER_SHOPPING,
    quote: 'Must-see shop list: "animate pokemoncenter-online melonbooks OFFMALL digimart'
      + ' 2ndstreet towerrecords".',
    checkedOn: ELIGIBILITY_CHECKED_ON,
  },
  {
    proxy: 'buyee', site: 'melonbooks', status: 'listed', method: 'raw_html',
    sourceUrl: BUYEE_OTHER_SHOPPING,
    quote: 'Must-see shop list: "animate pokemoncenter-online melonbooks OFFMALL digimart'
      + ' 2ndstreet towerrecords".',
    checkedOn: ELIGIBILITY_CHECKED_ON,
  },
  {
    proxy: 'buyee', site: '2ndstreet', status: 'listed', method: 'raw_html',
    sourceUrl: BUYEE_OTHER_SHOPPING,
    quote: 'Must-see shop list: "animate pokemoncenter-online melonbooks OFFMALL digimart'
      + ' 2ndstreet towerrecords".',
    checkedOn: ELIGIBILITY_CHECKED_ON,
  },
  {
    // 汎用の告知文は undated だが、証拠は P-Bandai 専用の /p-bandai → /closed へのリダイレクト。
    proxy: 'buyee', site: 'p-bandai', status: 'unsupported', method: 'raw_html',
    sourceUrl: BUYEE_PBANDAI,
    quote: 'こちらのサイトは諸般の都合により、購入サポートサービスを終了させていただくこととなりました。'
      + ' (shop.buyee.jp/p-bandai redirects to /closed.)',
    checkedOn: ELIGIBILITY_CHECKED_ON,
  },
  { proxy: 'buyee', site: 'suruga-ya', status: 'not_listed', method: 'raw_html', checkedOn: ELIGIBILITY_CHECKED_ON },
  { proxy: 'buyee', site: 'mandarake', status: 'not_listed', method: 'raw_html', checkedOn: ELIGIBILITY_CHECKED_ON },
  { proxy: 'buyee', site: 'bookoff', status: 'not_listed', method: 'raw_html', checkedOn: ELIGIBILITY_CHECKED_ON },
  { proxy: 'buyee', site: 'amiami', status: 'not_listed', method: 'raw_html', checkedOn: ELIGIBILITY_CHECKED_ON },
  { proxy: 'buyee', site: 'toranoana', status: 'not_listed', method: 'raw_html', checkedOn: ELIGIBILITY_CHECKED_ON },
  { proxy: 'buyee', site: 'yodobashi', status: 'not_listed', method: 'raw_html', checkedOn: ELIGIBILITY_CHECKED_ON },
];

// ========================================================= zenmarket (any_japanese_url)
const ZM_QUICKGUIDE = 'https://zenmarket.jp/en/quickguide.aspx';
const ZM_OTHERSHOPS = 'https://zenmarket.jp/en/othershops.aspx';
const ZM_RECOMMENDED = 'https://zenmarket.jp/en/recommendedshops.aspx';
const ZM_DISCOVER_ZOZO = 'https://discover-en.zenmarket.jp/stores/zozotown';
const ZM_PBANDAI_BLOG = 'https://zenmarket.jp/en/blog/post/6651/How-to-purchase-from-Bandai';

const ZENMARKET_ROWS: EligibilityRow[] = [
  {
    proxy: 'zenmarket', site: 'mercari', status: 'listed', method: 'raw_html',
    sourceUrl: ZM_QUICKGUIDE,
    quote: 'ZenMarket collaborates with two popular marketplace apps: Mercari and Rakuma.',
    checkedOn: ELIGIBILITY_CHECKED_ON,
  },
  {
    proxy: 'zenmarket', site: 'rakuma', status: 'listed', method: 'raw_html',
    sourceUrl: ZM_QUICKGUIDE,
    quote: 'ZenMarket collaborates with two popular marketplace apps: Mercari and Rakuma.',
    checkedOn: ELIGIBILITY_CHECKED_ON,
  },
  {
    proxy: 'zenmarket', site: 'yahoo-auctions', status: 'listed', method: 'raw_html',
    sourceUrl: ZM_OTHERSHOPS,
    quote: 'Inline JSON entry {"code":"YahooAuction","name":"JDirectItems Auction"}.',
    checkedOn: ELIGIBILITY_CHECKED_ON,
  },
  {
    proxy: 'zenmarket', site: 'yahoo-shopping', status: 'listed', method: 'raw_html',
    sourceUrl: ZM_OTHERSHOPS,
    quote: 'Inline JSON entry {"code":"YahooShopping","name":"JDirectItems Shopping"}.',
    checkedOn: ELIGIBILITY_CHECKED_ON,
  },
  {
    proxy: 'zenmarket', site: 'rakuten', status: 'listed', method: 'raw_html',
    sourceUrl: ZM_OTHERSHOPS, quote: 'Store list footer names "Rakuten.co.jp".',
    checkedOn: ELIGIBILITY_CHECKED_ON,
  },
  {
    proxy: 'zenmarket', site: 'amazon-jp', status: 'listed', method: 'raw_html',
    sourceUrl: ZM_OTHERSHOPS, quote: 'Store list footer names "Amazon.co.jp".',
    checkedOn: ELIGIBILITY_CHECKED_ON,
  },
  {
    proxy: 'zenmarket', site: 'suruga-ya', status: 'listed', method: 'raw_html',
    sourceUrl: ZM_OTHERSHOPS, quote: 'Store list entry with a href to Suruga-ya.',
    checkedOn: ELIGIBILITY_CHECKED_ON,
  },
  {
    proxy: 'zenmarket', site: 'mandarake', status: 'listed', method: 'raw_html',
    sourceUrl: ZM_OTHERSHOPS, quote: 'Store list entry with a href to Mandarake.',
    checkedOn: ELIGIBILITY_CHECKED_ON,
  },
  {
    proxy: 'zenmarket', site: 'animate', status: 'listed', method: 'raw_html',
    sourceUrl: ZM_OTHERSHOPS, quote: 'Store list entry with a href to Animate.',
    checkedOn: ELIGIBILITY_CHECKED_ON,
  },
  {
    proxy: 'zenmarket', site: 'amiami', status: 'listed', method: 'raw_html',
    sourceUrl: ZM_OTHERSHOPS, quote: 'Store list entry with a href to AmiAmi.',
    checkedOn: ELIGIBILITY_CHECKED_ON,
  },
  {
    proxy: 'zenmarket', site: '2ndstreet', status: 'listed', method: 'raw_html',
    sourceUrl: ZM_OTHERSHOPS, quote: 'Store list entry with a href to 2nd STREET.',
    checkedOn: ELIGIBILITY_CHECKED_ON,
  },
  {
    proxy: 'zenmarket', site: 'toranoana', status: 'listed', method: 'raw_html',
    sourceUrl: ZM_OTHERSHOPS, quote: 'Store list entry with a href to Toranoana.',
    checkedOn: ELIGIBILITY_CHECKED_ON,
  },
  {
    proxy: 'zenmarket', site: 'bookoff', status: 'listed', method: 'raw_html',
    sourceUrl: ZM_RECOMMENDED, quote: '"BOOKOFF" listed among recommended shops.',
    checkedOn: ELIGIBILITY_CHECKED_ON,
  },
  {
    proxy: 'zenmarket', site: 'melonbooks', status: 'listed', method: 'raw_html',
    sourceUrl: ZM_RECOMMENDED, quote: '"8% OFF on Melonbooks" listed among recommended shops.',
    checkedOn: ELIGIBILITY_CHECKED_ON,
  },
  {
    proxy: 'zenmarket', site: 'zozo', status: 'listed', method: 'browser',
    sourceUrl: ZM_DISCOVER_ZOZO,
    quote: 'Buy ZOZOTOWN directly from Japan with ZenMarket',
    checkedOn: ELIGIBILITY_CHECKED_ON,
  },
  {
    proxy: 'zenmarket', site: 'p-bandai', status: 'unsupported', method: 'browser',
    sourceUrl: ZM_PBANDAI_BLOG,
    quote: 'As of July 2023, Premium Bandai have banned purchasing from overseas through use'
      + ' of proxy services including ZenMarket.',
    checkedOn: ELIGIBILITY_CHECKED_ON,
  },
  { proxy: 'zenmarket', site: 'paypay-fleamarket', status: 'not_listed', method: 'raw_html', checkedOn: ELIGIBILITY_CHECKED_ON },
  { proxy: 'zenmarket', site: 'yodobashi', status: 'not_listed', method: 'raw_html', checkedOn: ELIGIBILITY_CHECKED_ON },
];

// ============================================================= neokyo (any_japanese_url)
const NK_MERCARI = 'https://neokyo.com/en/mercari-introduction';
const NK_RAKUMA = 'https://neokyo.com/en/rakuma-introduction';
const NK_JDI_AUCTION = 'https://neokyo.com/en/jdirectitems-introduction';
const NK_JDI_SHOPPING = 'https://neokyo.com/en/jdirectitems-shopping-introduction';
const NK_MARKETPLACE_LIST = 'https://neokyo.com/en/marketplace-list';
const NK_SHOP_LIST = 'https://neokyo.com/en/shop-list';
const NK_HOBBY_SHOP_LIST = 'https://neokyo.com/en/hobby-shop-list';
const NK_ANIME_GOODIES = 'https://neokyo.com/en/anime-goodies';

const NEOKYO_ROWS: EligibilityRow[] = [
  {
    proxy: 'neokyo', site: 'mercari', status: 'listed', method: 'raw_html',
    sourceUrl: NK_MERCARI, quote: 'Dedicated Mercari introduction page.',
    checkedOn: ELIGIBILITY_CHECKED_ON,
  },
  {
    proxy: 'neokyo', site: 'rakuma', status: 'listed', method: 'raw_html',
    sourceUrl: NK_RAKUMA, quote: 'Dedicated Rakuma introduction page.',
    checkedOn: ELIGIBILITY_CHECKED_ON,
  },
  {
    proxy: 'neokyo', site: 'yahoo-auctions', status: 'listed', method: 'raw_html',
    sourceUrl: NK_JDI_AUCTION,
    quote: 'JDirectItems Auction known as Yahoo! Japan Auction domestically',
    checkedOn: ELIGIBILITY_CHECKED_ON,
  },
  {
    proxy: 'neokyo', site: 'yahoo-shopping', status: 'listed', method: 'raw_html',
    sourceUrl: NK_JDI_SHOPPING,
    quote: 'JDirectItems Shopping is an online shopping website known as Yahoo! Shopping in'
      + ' Japan',
    checkedOn: ELIGIBILITY_CHECKED_ON,
  },
  {
    proxy: 'neokyo', site: 'paypay-fleamarket', status: 'listed', method: 'raw_html',
    sourceUrl: NK_MARKETPLACE_LIST,
    quote: 'Card linking to paypayfleamarket.yahoo.co.jp: "Paypay offers a hassle-free and'
      + ' secure way to purchase".',
    checkedOn: ELIGIBILITY_CHECKED_ON,
  },
  {
    proxy: 'neokyo', site: 'rakuten', status: 'listed', method: 'raw_html',
    sourceUrl: NK_MARKETPLACE_LIST, quote: 'Card linking to rakuten.co.jp.',
    checkedOn: ELIGIBILITY_CHECKED_ON,
  },
  {
    proxy: 'neokyo', site: 'amazon-jp', status: 'listed', method: 'raw_html',
    sourceUrl: NK_MARKETPLACE_LIST, quote: 'Card linking to amazon.jp.',
    checkedOn: ELIGIBILITY_CHECKED_ON,
  },
  {
    proxy: 'neokyo', site: 'suruga-ya', status: 'listed', method: 'raw_html',
    sourceUrl: NK_SHOP_LIST, quote: 'Shop card "Surugaya".',
    checkedOn: ELIGIBILITY_CHECKED_ON,
  },
  {
    proxy: 'neokyo', site: 'zozo', status: 'listed', method: 'raw_html',
    sourceUrl: NK_SHOP_LIST, quote: 'Shop card "ZOZOTOWN".',
    checkedOn: ELIGIBILITY_CHECKED_ON,
  },
  {
    proxy: 'neokyo', site: 'bookoff', status: 'listed', method: 'raw_html',
    sourceUrl: NK_HOBBY_SHOP_LIST, quote: 'Card linking to bookoffonline.co.jp.',
    checkedOn: ELIGIBILITY_CHECKED_ON,
  },
  {
    proxy: 'neokyo', site: 'animate', status: 'listed', method: 'raw_html',
    sourceUrl: NK_HOBBY_SHOP_LIST, quote: 'Card linking to animate-onlineshop.jp.',
    checkedOn: ELIGIBILITY_CHECKED_ON,
  },
  {
    proxy: 'neokyo', site: 'melonbooks', status: 'listed', method: 'raw_html',
    sourceUrl: NK_HOBBY_SHOP_LIST, quote: 'Card linking to melonbooks.co.jp.',
    checkedOn: ELIGIBILITY_CHECKED_ON,
  },
  {
    // マーケ文言のみ。P-Bandai 自体が2023年7月に代行禁止（ZenMarket ブログ）。
    // 行そのものは Neokyo が「listed」と書いていることを事実として残す
    // ——ブロック判定はサイト単位ルール（p-bandai ブロック）が別に効かせる。
    proxy: 'neokyo', site: 'p-bandai', status: 'listed', method: 'raw_html',
    sourceUrl: NK_ANIME_GOODIES,
    quote: '...or to order Premium Bandai or any other anime goodies.',
    checkedOn: ELIGIBILITY_CHECKED_ON,
    note: 'Marketing copy only; Premium Bandai itself banned proxy purchases as of July 2023'
      + " per ZenMarket's blog. The site-level p-bandai rule overrides this to blocked.",
  },
  { proxy: 'neokyo', site: 'mandarake', status: 'not_listed', method: 'raw_html', checkedOn: ELIGIBILITY_CHECKED_ON },
  { proxy: 'neokyo', site: 'amiami', status: 'not_listed', method: 'raw_html', checkedOn: ELIGIBILITY_CHECKED_ON },
  { proxy: 'neokyo', site: '2ndstreet', status: 'not_listed', method: 'raw_html', checkedOn: ELIGIBILITY_CHECKED_ON },
  { proxy: 'neokyo', site: 'toranoana', status: 'not_listed', method: 'raw_html', checkedOn: ELIGIBILITY_CHECKED_ON },
  { proxy: 'neokyo', site: 'yodobashi', status: 'not_listed', method: 'raw_html', checkedOn: ELIGIBILITY_CHECKED_ON },
];

// =========================================================== fromjapan (any_japanese_url)
const FJ_NAV = 'https://www.fromjapan.co.jp/';
const FJ_YAHOO_AUCTIONS = 'https://www.fromjapan.co.jp/japan/jp/yahoo-auctions/';

const FROMJAPAN_ROWS: EligibilityRow[] = [
  {
    proxy: 'fromjapan', site: 'mercari', status: 'listed', method: 'browser',
    sourceUrl: FJ_NAV, quote: 'ショッピングサイトリスト nav entry "メルカリ JP".',
    checkedOn: ELIGIBILITY_CHECKED_ON,
  },
  {
    proxy: 'fromjapan', site: 'yahoo-auctions', status: 'listed', method: 'browser',
    sourceUrl: FJ_YAHOO_AUCTIONS, quote: 'ショッピングサイトリスト nav entry "JDirectItems Auction".',
    checkedOn: ELIGIBILITY_CHECKED_ON,
  },
  {
    proxy: 'fromjapan', site: 'paypay-fleamarket', status: 'listed', method: 'browser',
    sourceUrl: FJ_NAV,
    quote: 'ショッピングサイトリスト nav entry "JDirectItems Fleamarket" (item hrefs resolve to'
      + ' paypayfleamarket.yahoo.co.jp).',
    checkedOn: ELIGIBILITY_CHECKED_ON,
  },
  {
    proxy: 'fromjapan', site: 'rakuten', status: 'listed', method: 'browser',
    sourceUrl: FJ_NAV, quote: 'ショッピングサイトリスト nav entry "楽天市場".',
    checkedOn: ELIGIBILITY_CHECKED_ON,
  },
  {
    proxy: 'fromjapan', site: 'rakuma', status: 'listed', method: 'browser',
    sourceUrl: FJ_NAV, quote: 'ショッピングサイトリスト nav entry "楽天ラクマ".',
    checkedOn: ELIGIBILITY_CHECKED_ON,
  },
  {
    proxy: 'fromjapan', site: 'amazon-jp', status: 'listed', method: 'browser',
    sourceUrl: FJ_NAV, quote: 'ショッピングサイトリスト nav entry "Amazon".',
    checkedOn: ELIGIBILITY_CHECKED_ON,
  },
  {
    proxy: 'fromjapan', site: 'suruga-ya', status: 'listed', method: 'browser',
    sourceUrl: FJ_NAV, quote: 'ショッピングサイトリスト nav entry "駿河屋".',
    checkedOn: ELIGIBILITY_CHECKED_ON,
  },
  {
    proxy: 'fromjapan', site: 'mandarake', status: 'not_listed', method: 'browser',
    checkedOn: ELIGIBILITY_CHECKED_ON,
    note: 'The nav\'s "MANDARAKE" tile links to a Mercari seller search, not mandarake.co.jp,'
      + ' so it is not evidence of Mandarake support.',
  },
  { proxy: 'fromjapan', site: 'yahoo-shopping', status: 'not_listed', method: 'browser', checkedOn: ELIGIBILITY_CHECKED_ON },
  { proxy: 'fromjapan', site: 'bookoff', status: 'not_listed', method: 'browser', checkedOn: ELIGIBILITY_CHECKED_ON },
  { proxy: 'fromjapan', site: 'animate', status: 'not_listed', method: 'browser', checkedOn: ELIGIBILITY_CHECKED_ON },
  { proxy: 'fromjapan', site: 'amiami', status: 'not_listed', method: 'browser', checkedOn: ELIGIBILITY_CHECKED_ON },
  { proxy: 'fromjapan', site: 'zozo', status: 'not_listed', method: 'browser', checkedOn: ELIGIBILITY_CHECKED_ON },
  { proxy: 'fromjapan', site: '2ndstreet', status: 'not_listed', method: 'browser', checkedOn: ELIGIBILITY_CHECKED_ON },
  { proxy: 'fromjapan', site: 'toranoana', status: 'not_listed', method: 'browser', checkedOn: ELIGIBILITY_CHECKED_ON },
  { proxy: 'fromjapan', site: 'melonbooks', status: 'not_listed', method: 'browser', checkedOn: ELIGIBILITY_CHECKED_ON },
  { proxy: 'fromjapan', site: 'p-bandai', status: 'not_listed', method: 'browser', checkedOn: ELIGIBILITY_CHECKED_ON },
  { proxy: 'fromjapan', site: 'yodobashi', status: 'not_listed', method: 'browser', checkedOn: ELIGIBILITY_CHECKED_ON },
];

// =============================================================== jauce (listed_only)
const JC_AUCTION_DETAIL = 'https://www.jauce.com/japan_auction_detail';
const JC_YAHOO_SHOPPING = 'https://www.jauce.com/yahoo-japan-shopping/';
const JC_SHOP_ORDER = 'https://www.jauce.com/auctions/shop_order.php';

const JAUCE_ROWS: EligibilityRow[] = [
  {
    proxy: 'jauce', site: 'yahoo-auctions', status: 'listed', method: 'raw_html',
    sourceUrl: JC_AUCTION_DETAIL,
    quote: 'With JAUCE, you can bid on Yahoo Japan Auctions in real-time',
    checkedOn: ELIGIBILITY_CHECKED_ON,
  },
  {
    proxy: 'jauce', site: 'rakuten', status: 'listed', method: 'raw_html',
    sourceUrl: JC_AUCTION_DETAIL,
    quote: 'Japanese shopping malls such as Rakuten or Amazon Japan are also available with'
      + ' JAUCE.',
    checkedOn: ELIGIBILITY_CHECKED_ON,
  },
  {
    proxy: 'jauce', site: 'yahoo-shopping', status: 'listed', method: 'raw_html',
    sourceUrl: JC_YAHOO_SHOPPING, quote: 'Dedicated Yahoo! Japan Shopping page.',
    checkedOn: ELIGIBILITY_CHECKED_ON,
  },
  {
    proxy: 'jauce', site: 'amazon-jp', status: 'suspended', method: 'raw_html',
    sourceUrl: JC_AUCTION_DETAIL,
    quote: 'Our Amazon Japan service is currently under maintenance and so is temporarily'
      + ' unavailable.',
    checkedOn: ELIGIBILITY_CHECKED_ON,
    note: 'The item page also shows "This page is under maintenance."',
  },
  // member_area: https://www.jauce.com/auctions/shop_order.php のカテゴリ一覧。
  // quote = 一覧に出ていた店名そのもの。7/16カテゴリのみ確認済み
  // （Online shopping malls, Camera & Consumer Electronics, Clothing Shoes & Accessories,
  //  Dolls, Car parts, Books, Toys）。
  {
    proxy: 'jauce', site: 'zozo', status: 'listed', method: 'member_area',
    sourceUrl: JC_SHOP_ORDER, quote: 'ZOZOTOWN',
    checkedOn: ELIGIBILITY_CHECKED_ON, note: 'Category: Online shopping malls.',
  },
  {
    proxy: 'jauce', site: 'yodobashi', status: 'listed', method: 'member_area',
    sourceUrl: JC_SHOP_ORDER, quote: 'Yodobashi',
    checkedOn: ELIGIBILITY_CHECKED_ON, note: 'Category: Camera & Consumer Electronics.',
  },
  {
    proxy: 'jauce', site: 'suruga-ya', status: 'listed', method: 'member_area',
    sourceUrl: JC_SHOP_ORDER, quote: 'suruga-ya',
    checkedOn: ELIGIBILITY_CHECKED_ON, note: 'Category: Books.',
  },
  {
    proxy: 'jauce', site: 'bookoff', status: 'listed', method: 'member_area',
    sourceUrl: JC_SHOP_ORDER, quote: 'Bookoffonline',
    checkedOn: ELIGIBILITY_CHECKED_ON, note: 'Category: Books.',
  },
  {
    proxy: 'jauce', site: 'mandarake', status: 'listed', method: 'member_area',
    sourceUrl: JC_SHOP_ORDER, quote: 'MANDARAKE',
    checkedOn: ELIGIBILITY_CHECKED_ON, note: 'Category: Books.',
  },
  {
    proxy: 'jauce', site: 'toranoana', status: 'listed', method: 'member_area',
    sourceUrl: JC_SHOP_ORDER, quote: 'Toranoana',
    checkedOn: ELIGIBILITY_CHECKED_ON, note: 'Category: Books.',
  },
  {
    proxy: 'jauce', site: 'animate', status: 'listed', method: 'member_area',
    sourceUrl: JC_SHOP_ORDER, quote: 'animate-onlineshop',
    checkedOn: ELIGIBILITY_CHECKED_ON, note: 'Category: Toys.',
  },
  {
    proxy: 'jauce', site: 'amiami', status: 'listed', method: 'member_area',
    sourceUrl: JC_SHOP_ORDER, quote: 'amiami',
    checkedOn: ELIGIBILITY_CHECKED_ON, note: 'Category: Toys.',
  },
  {
    proxy: 'jauce', site: 'p-bandai', status: 'listed', method: 'member_area',
    sourceUrl: JC_SHOP_ORDER, quote: 'Premium Bandai',
    checkedOn: ELIGIBILITY_CHECKED_ON,
    note: 'Category: Toys. This list is likely stale given the July 2023 P-Bandai proxy ban;'
      + ' the site-level p-bandai rule overrides this to blocked.',
  },
  { proxy: 'jauce', site: 'mercari', status: 'not_listed', method: 'member_area', checkedOn: ELIGIBILITY_CHECKED_ON },
  { proxy: 'jauce', site: 'paypay-fleamarket', status: 'not_listed', method: 'member_area', checkedOn: ELIGIBILITY_CHECKED_ON },
  { proxy: 'jauce', site: 'rakuma', status: 'not_listed', method: 'member_area', checkedOn: ELIGIBILITY_CHECKED_ON },
  { proxy: 'jauce', site: '2ndstreet', status: 'not_listed', method: 'member_area', checkedOn: ELIGIBILITY_CHECKED_ON },
  { proxy: 'jauce', site: 'melonbooks', status: 'not_listed', method: 'member_area', checkedOn: ELIGIBILITY_CHECKED_ON },
];

export const ELIGIBILITY_ROWS: EligibilityRow[] = [
  ...BUYEE_ROWS,
  ...ZENMARKET_ROWS,
  ...NEOKYO_ROWS,
  ...FROMJAPAN_ROWS,
  ...JAUCE_ROWS,
];

/**
 * サイト単位のルール。プロキシごとの行を上書きしない——各社が何と言っているかは
 * `ELIGIBILITY_ROWS` にそのまま残す。ここは「サイト自体が代行購入を禁じている」
 * という、プロキシに関係ない別の事実を足す。
 */
export interface SiteLevelRule {
  site: EligibilitySiteId;
  level: 'blocked';
  reason: string;
  sourceUrl: string;
  quote: string;
  checkedOn: string;
}

export const SITE_LEVEL_RULES: SiteLevelRule[] = [
  {
    site: 'p-bandai',
    level: 'blocked',
    reason: 'Premium Bandai itself bans purchases made through proxy shopping services,'
      + ' regardless of what any individual proxy publishes.',
    sourceUrl: 'https://zenmarket.jp/en/blog/post/6651/How-to-purchase-from-Bandai',
    quote: 'As of July 2023, Premium Bandai have banned purchasing from overseas through use'
      + ' of proxy services including ZenMarket.',
    checkedOn: ELIGIBILITY_CHECKED_ON,
  },
];

export type EligibilityLevel = 'blocked' | 'caution' | 'none';

export interface EligibilityResult {
  level: EligibilityLevel;
  /** 英語1文。原文の要約。判断は書かない。'none' のときは省略。 */
  reason?: string;
  sourceUrl?: string;
  checkedOn?: string;
}

function rowFor(proxy: ProxyId, site: EligibilitySiteId): EligibilityRow | undefined {
  return ELIGIBILITY_ROWS.find((r) => r.proxy === proxy && r.site === site);
}

function siteLevelRuleFor(site: EligibilitySiteId): SiteLevelRule | undefined {
  return SITE_LEVEL_RULES.find((r) => r.site === site);
}

/**
 * URL 1件・プロキシ1社について、貼られた URL がそのプロキシで買えると各社が
 * 公表しているかを返す。**判定はしない**——出せるのは各社の原文の要約だけ。
 *
 * - ホストが分からない／未知 → `none`（アラート無し）
 * - サイト自体が代行購入を禁じている（`SITE_LEVEL_RULES`）→ 全社 `blocked`
 * - その社の行が `unsupported` / `suspended` → `blocked`
 * - `listed_only` の社で、行が無いか `not_listed` → `caution`
 * - それ以外 → `none`
 */
export function eligibilityFor(url: string, proxy: ProxyId): EligibilityResult {
  const site = eligibilitySiteFromUrl(url);
  if (site == null) return { level: 'none' };

  const siteRule = siteLevelRuleFor(site);
  if (siteRule) {
    return {
      level: siteRule.level,
      reason: `${siteRule.reason} ${siteRule.quote}`.trim(),
      sourceUrl: siteRule.sourceUrl,
      checkedOn: siteRule.checkedOn,
    };
  }

  const row = rowFor(proxy, site);
  const proxyName = PROXIES[proxy].name;
  const siteName = SITE_LABELS[site];

  if (row && (row.status === 'unsupported' || row.status === 'suspended')) {
    return {
      level: 'blocked',
      reason: `${proxyName} says ${siteName} is ${row.status === 'unsupported' ? 'not supported' : 'temporarily suspended'}: "${row.quote ?? ''}"`.trim(),
      sourceUrl: row.sourceUrl,
      checkedOn: row.checkedOn,
    };
  }

  const policy = PROXIES[proxy].policy;
  if (policy === 'listed_only' && (!row || row.status === 'not_listed')) {
    return {
      level: 'caution',
      reason: `${proxyName} only supports stores it lists by name, and ${siteName} does not`
        + ' appear in that list.',
      sourceUrl: PROXIES[proxy].policySourceUrl,
      checkedOn: ELIGIBILITY_CHECKED_ON,
    };
  }

  return { level: 'none' };
}

/** 5社ぶんの結果を一度に返す。 */
export function eligibilityForAllProxies(url: string): Record<ProxyId, EligibilityResult> {
  const ids = Object.keys(PROXIES) as ProxyId[];
  return Object.fromEntries(ids.map((id) => [id, eligibilityFor(url, id)])) as Record<
    ProxyId, EligibilityResult
  >;
}

/**
 * スキーマ検証。`listed` / `unsupported` / `suspended` の行は
 * source・quote（`member_area` を除く……というより、実データは member_area でも
 * 店名を quote に入れているので一律で必須にしている）・checkedOn を持たねばならない。
 * `master/validate.py` と同じ理由でここに置く: **データを実際に読む検証**であることを
 * `site-eligibility.test.ts` の変異テストで証明する。
 */
export function validateEligibilityRows(rows: EligibilityRow[]): string[] {
  const errors: string[] = [];
  for (const r of rows) {
    const tag = `${r.proxy}/${r.site}`;
    if (r.status === 'listed' || r.status === 'unsupported' || r.status === 'suspended') {
      if (!r.sourceUrl) errors.push(`${tag}: missing sourceUrl for status '${r.status}'`);
      if (!r.quote) errors.push(`${tag}: missing quote for status '${r.status}'`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(r.checkedOn)) {
        errors.push(`${tag}: checkedOn '${r.checkedOn}' is not YYYY-MM-DD`);
      }
    }
  }
  return errors;
}
