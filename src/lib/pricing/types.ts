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

export type WeightOrigin = 'table' | 'assumed' | 'user';

export interface Item {
  id: string;
  title: string;
  priceYen: number;
  /** 商品ページ由来 = fixed / 検索候補由来・利用者編集 = estimate */
  priceTier: 'fixed' | 'estimate';
  site: SiteId;
  url?: string | null;
  imageUrl?: string | null;
  /** null = 重量が無い。段（Band）に落ちる。**計算機の UI は null を渡さない**
   *  （表に当たらなければ仮置きを入れ、そう書いて、直してもらう。docs/UI-DESIGN.md §4）。 */
  weightG: number | null;
  weightTier: Tier;
  /** 重量の出所（'1/7 scale · n=647 · Solaris Japan' など）。 */
  weightSource?: string | null;
  /** 重量の出どころ。'table' = 重量表のライン、'assumed' = 表に当たらず仮置き、'user' = 利用者が入力。 */
  weightOrigin?: WeightOrigin;
  /** 重量表のラインの P25–P75（g）。表から引いたときだけ入る。
   *  この幅の中で1位が替わるかを compare() が見る。 */
  weightRangeG?: [number, number] | null;
  /** 重量表のライン id。/weights#<id> へのリンクに使う。 */
  weightLineId?: string | null;
  /** 出品が送料込みか。全社に等しく効くので1位は動かない（docs/DESIGN-NOTES.md §1）。 */
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
  /**
   * 他の行と総額を比べてよいか。
   * **最大の費目（国際送料）が取れていない行を、取れている行と並べたら順位は嘘になる。**
   * false の行は順位から外し、末尾に理由つきで置く。
   */
  comparable: boolean;
  /** comparable が false の理由（英語、画面にそのまま出す）。 */
  notComparableReason: string | null;
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

/**
 * 1点の重量だけを動かしたとき1位が替わるか。
 * 他の点は与えられた重量のまま、この点だけを lowG / highG に置いて比べる。
 * **「順位が替わる」と「比べられなくなる」を混ぜない**（rankStable と同じ規則）。
 */
export interface WeightSensitivity {
  /** 試した下限・上限（g／点）。表のラインなら P25–P75、仮置きなら 500 g〜10 kg。 */
  lowG: number;
  highG: number;
  /** その重量で1位になる行の label。比較可能な行が無ければ null。 */
  winnerAtLow: string | null;
  winnerAtHigh: string | null;
  /** その端で比較可能な行が減っていたら true。そのときの winner は「最安」ではなく
   *  「唯一値段が付く社」。画面ではそう書く。 */
  onlyPricedAtLow: boolean;
  onlyPricedAtHigh: boolean;
  /** この点の重量だけで1位が替わるか。null（比べられない）は「替わった」に数えない。 */
  decisive: boolean;
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
  /**
   * 表示に添える現地通貨換算。asOf は出典（ECB）の参照日で、我々が読んだ日ではない。
   * 画面はこの2つを区別して出す（片方だけ出すと出典表示が嘘になる）。
   */
  currency: { code: string; rate: number; asOf: string; fetchedOn: string; sourceUrl: string };
  /** 重量が1点でも不明か。 */
  hasUnknownWeight: boolean;
  /**
   * 項目 id → その点の重量だけを動かしたときの1位の動き。
   * 重量が全点そろっているときだけ。利用者が入れた重量の点は入れない（幅を知らない）。
   */
  weightSensitivity: Record<string, WeightSensitivity>;
}

export interface CompareInput {
  items: Item[];
  country: CountryCode;
}
