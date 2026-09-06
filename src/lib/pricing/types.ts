// 数字の出どころと確度。ここが崩れたらこのツールの価値は無い。
//   fixed      … 各社の公開料金表・日本郵便の公表料金（一次情報）
//   estimate   … 我々の仮定、または利用者が触った値
//   unverified … 二次情報。原典に当たれていない
//   none       … 未取得。画面では「—」。**0 とは書かない**
export type Tier = 'fixed' | 'estimate' | 'unverified' | 'none';

export type CountryCode = 'US' | 'GB' | 'DE' | 'FR' | 'AU' | 'CA' | 'SG';

/** 出品元のサイト。Jauce のサービス料が無料になるかがここで決まる。 */
export type SiteId =
  | 'yahoo-auctions'
  | 'mercari'
  | 'rakuten'
  | 'yahoo-shopping'
  | 'amazon-jp'
  | 'suruga-ya'
  | 'mandarake'
  | 'zozo'
  | 'hmv'
  | 'toranoana'
  | 'other';

export interface Line {
  /** 安定した識別子。表の行を会社間で突き合わせるのに使う。 */
  key: string;
  /** 画面表示（英語）。 */
  label: string;
  /** 円。null = 未取得。**0 で埋めるな。** */
  amount: number | null;
  /** 内訳の1行説明（英語）。 */
  note: string;
  tier: Tier;
  sourceUrl?: string | null;
  /** 「これを選ぶと +¥1,500」型。総額には入れない。 */
  optional?: boolean;
}

export interface Item {
  id: string;
  title: string;
  priceYen: number;
  /** 商品ページ由来 = fixed / 検索候補由来・利用者編集 = estimate */
  priceTier: 'fixed' | 'estimate';
  site: SiteId;
  url?: string | null;
  imageUrl?: string | null;
  /** null = カテゴリからも決まらない。段（Band）に落ちる。 */
  weightG: number | null;
  weightTier: Tier;
  /** 重量の出所（'1/7 scale · n=647 · Solaris Japan' など）。 */
  weightSource?: string | null;
  /** 出品が送料込みか。順位の唯一の逆転条件（docs/DESIGN-NOTES.md §1）。 */
  freeShipping?: boolean;
  domesticShippingYen?: number | null;
  qty: number;
}

export interface Row {
  /** 'buyee:default' 等。 */
  id: string;
  serviceId: string;
  serviceName: string;
  variant: 'default' | 'consolidated' | null;
  /** 'Buyee, default' */
  label: string;
  /** '3 orders · 3 parcels' */
  tag: string;
  lines: Line[];
  total: number;
  /** 総額に入っていない任意費目。 */
  optionalLines: Line[];
  /** 総額から漏れている費目（未取得）の英語ラベル。総額が低く見える方向の誤りを明示する。 */
  excluded: string[];
  parcels: number;
  /** 1 始まり。総額のみで決まる。 */
  rank: number;
  /** 1位との差額（円）。 */
  diff: number;
  cheapest: boolean;
  /** アフィリエイト報酬の有無。**順位計算には一切使わない。** */
  paysUs: boolean;
  referralNote: string | null;
  /** その社を開くリンク。1点だけで直接開けるならその出品を、そうでなければ社のトップ。 */
  outboundUrl: string;
  /** outboundUrl が出品を直接開くか。false なら画面でそう書く。 */
  outboundDirect: boolean;
  /** 複数点のとき、出品ごとに直接開けるリンク（開けないものは含めない）。 */
  itemLinks: { itemId: string; title: string; url: string }[];
  /** 総額に推定が混じっているか。混じっていれば画面で `~` を付ける。 */
  approximate: boolean;
}

/** 重量が不明なときの EMS の段。段は EMS 料金表の段からしか取らない。 */
export interface Band {
  /** この段の上限（g）。EMS_TABLE の段そのもの。 */
  stepG: number;
  /** '500 g' / '1.5 kg' */
  label: string;
  rows: Row[];
  cheapestRowId: string;
  cheapestServiceName: string;
}

export interface CompareResult {
  /** 重量が確定しているときの結果。bands があるときは代表段（中央の段）の結果。 */
  rows: Row[];
  /** 重量不明のとき段ごとの結果。確定しているときは null。 */
  bands: Band[] | null;
  /** 行ID → その行が取りうる総額の幅。bands があるときのみ。 */
  rowTotalRange: Record<string, [number, number]> | null;
  /** 行ID → 1位との差額の幅。bands があるときのみ。 */
  rowDiffRange: Record<string, [number, number]> | null;
  /** 段や重量をずらしても1位が動かないか。 */
  rankStable: boolean;
  /** 英語で1行。画面にそのまま出す。 */
  rankStabilityNote: string;
  /** bands があるときの総額全体の幅。 */
  totalRangeYen: [number, number] | null;
  currency: { code: string; rate: number; asOf: string };
  /** 重量が1点でも不明か。 */
  hasUnknownWeight: boolean;
}

export interface CompareInput {
  items: Item[];
  country: CountryCode;
}
