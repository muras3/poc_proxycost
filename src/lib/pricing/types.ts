// 数字の出どころと確度。ここが崩れたらこのツールの価値は無い。
//   fixed      … 各社の公開料金表・日本郵便の公表料金（一次情報）
//   estimate   … 我々の仮定、または利用者が触った値
//   unverified … 二次情報。原典に当たれていない
//   none       … 未取得。画面では「—」。**0 とは書かない**
export type Tier = 'fixed' | 'estimate' | 'unverified' | 'none';

/**
 * 国際配送の方式。**日本郵便が地帯別の料金表を公表していて、通関経路が郵便のままで、
 * 実重量課金のものだけ。**宅配便がここに無い理由は `postage.ts` の先頭に書いてある。
 */
export type PostalMethod =
  | 'ems'
  | 'small-packet-air'
  | 'small-packet-surface'
  | 'parcel-air'
  | 'parcel-surface';

export type CountryCode = 'US' | 'GB' | 'DE' | 'FR' | 'AU' | 'CA' | 'SG';

/**
 * カナダの州・準州。**州によって国境で取られる税が違う**（CBSA D2-3-6）ので、
 * カナダだけは国コードでは足りない。null = 利用者が選んでいない
 * ——そのときも `—` にはせず、人口加重の代表値を tier estimate で出す
 * （`countries.ts` の `CA_PROVINCE_AVERAGE_RATE`）。
 */
export type ProvinceCode =
  | 'ON' | 'QC' | 'BC' | 'AB' | 'MB' | 'SK' | 'NS' | 'NB' | 'NL' | 'PE'
  | 'YT' | 'NT' | 'NU';

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
  /** 総額から漏れている費目（未取得）の英語ラベル。総額が低く見える方向の誤りを明示する。 */
  excluded: string[];
  parcels: number;
  /** この行に実際に使った国際配送の方式。`method: 'cheapest'` のとき行ごとに違いうる。 */
  method: PostalMethod;
  /**
   * 1 始まり。総額のみで決まる。**同額なら同じ数字**（競技順位。1-1-3 で次は飛ぶ）。
   * 社名の辞書順のようなタイブレークは使わない（compare.ts の `rank()` に理由）。
   */
  rank: number;
  /** 1位との差額（円）。 */
  diff: number;
  /** 比較可能な行の中で総額が最小か。**同額なら全部 true。** */
  cheapest: boolean;
  /**
   * 総額が同じ比較可能な行が他にあるか。
   * **同順位の行の縦の並びは何も意味しない**ので、画面はこれを見て `tied` と書き、
   * 上に並んだ側が勝っているという読みを打ち消す。
   */
  tied: boolean;
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
  /** この段で最安の行の id。**同額なら複数**。比較可能な行が無ければ空。 */
  cheapestRowIds: string[];
  /** 同じ行の label。画面と note はここから作る。 */
  cheapestServiceNames: string[];
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
  /** その重量で1位になる行の label。**同額なら 'A and B' と並べる。**
   *  比較可能な行が無ければ null。 */
  winnerAtLow: string | null;
  winnerAtHigh: string | null;
  /** その端で比較可能な行が減っていたら true。そのときの winner は「最安」ではなく
   *  「唯一値段が付く社」。画面ではそう書く。 */
  onlyPricedAtLow: boolean;
  onlyPricedAtHigh: boolean;
  /**
   * この点の重量だけで1位が替わるか。null（比べられない）は「替わった」に数えない。
   * **同額のときは「基準の重量で最安だった行が、その端でも最安のままか」で見る。**
   * 同額の中のどれが `rows[0]` に来るかは並びの偶然なので、それで判定したら
   * 動いていない順位が動いたことになる。
   */
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
  /**
   * 国際配送の方式。**未指定（既定）は 'cheapest'** ＝ その行の荷物を実際に運べる方式のうち
   * 最安を、行ごとに選ぶ。**方式は利用者が選ぶもの**で、代行はメニューを出すだけ
   * （Neokyo 原文「please select Japan Post as the shipment method」）。
   *
   * 以前は EMS 固定だった。EMS は日本郵便の中で**どの重量でも最安ではない**ので、
   * 既定を EMS にすることは「一番高い郵便」を黙って選ぶことだった。
   */
  method?: PostalMethod | 'cheapest';
  /**
   * カナダ宛のときの州。**未指定でも州税は出す**（発生が確実なので `—` にしない）。
   * 未指定なら人口加重の代表値を tier estimate で、「州を選ぶと確定する」と note に書く。
   * カナダ以外では無視する。
   */
  province?: ProvinceCode | null;
  /**
   * 倉庫に置く日数。**既定 45 日**（オーナー決定 2026-09-11）。
   * 「貯めてまとめ発送」の実態に寄せた**我々の仮定**で、一次情報ではない（docs/FEE-ITEMS.md §5 R2）。
   * 利用者が変更でき、変えたら即座に再計算・再ランキングする。
   */
  storageDays?: number;
}
