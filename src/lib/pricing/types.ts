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

/**
 * 額の形（P1）。**`Tier`（確度）とは軸が別。混ぜない。**
 *   point   … 確定した1つの額
 *   range   … 幅のある額（`amount` が下端、`amountHighYen` が上端）
 *   unknown … 額が無い。`amount` は null。理由は `unknownReason` に構造化して持つ
 *             （旧: `note` の散文にしか無く、機械可読ではなかった）
 * 省略時は `amount` の有無から推論する（`amount != null` なら 'point'、null なら
 * 'unknown'）── 660件超の既存コードが `amount: number | null` だけで Line を作れることを崩さない。
 */
export type AmountKind = 'point' | 'range' | 'unknown';

export interface Line {
  /** 安定した識別子。表の行を会社間で突き合わせるのに使う。 */
  key: string;
  /** 画面表示（英語）。 */
  label: string;
  /** 円。null = 未取得。**0 で埋めるな。** 'range' のときは下端。 */
  amount: number | null;
  /** 額の形。省略時は amount の有無から推論（上の AmountKind 参照）。 */
  amountKind?: AmountKind;
  /** amountKind が 'range' のときの上端（円）。 */
  amountHighYen?: number | null;
  /** amountKind が 'range' のときの、下端・上端それぞれの根拠（英語）。 */
  rangeNote?: string | null;
  /**
   * amount が null（未取得）の理由（英語、構造化）。**`note` の散文とは別に機械可読で持つ。**
   * 画面・集計はこちらを読み、`note` は引き続き行の1行説明として残す。
   */
  unknownReason?: string | null;
  /**
   * 未取得だが「額 × 期間」等で上端が置けるときの見積り（円）。
   * null/undefined = 上端が置けない費目（P1 時点で3件: FROM JAPAN 外注梱包・
   * US Zonos 利用料・F35 立替/DDP。docs/ROADMAP.md P1 参照）。
   * **これは上限ではなく推定。**`unknownCapNote` に必ずその旨を書く。
   */
  unknownCapYen?: number | null;
  /** unknownCapYen の根拠・「推定であり上限ではない」旨（英語）。 */
  unknownCapNote?: string | null;
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
  /**
   * 総額は区間（P1）。**`low` は従来の総額と同じ計算式**
   * （未取得の費目は 0 として落ちる）── 順位・差額は P1 では `low` で測り、挙動を変えない。
   *
   * `high` は **`null` = 上限不明**（docs/ROADMAP.md P1 確定仕様5「上端が置けない費目は
   * 上限不明として別表示」）。上端が置けない未取得の費目（`unknownCapYen` が無い行）が
   * 1件でも残っていれば、他がどれだけ確定していても `high` は必ず `null`。
   * **`{ high: 数値, highUnbounded: true }` のような矛盾した状態を型で作れないようにする**
   * ため、真偽値のフラグは持たない。
   *
   * 行のどの未取得費目にも上端が置け、かつ額に幅のある行（`amountKind: 'range'`）の上端も
   * 出せているとき、`high` はそれらを足した具体的な数値になる。未取得の費目が1つも無い行
   * （`excluded.length === 0`）では `high === low`（幅ゼロが正しい状態）。
   */
  total: { low: number; high: number | null };
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
  /**
   * 「おすすめ」枠に入るか（P1-2）。**下端で並べたとき1位の幅と重なる社**を、
   * 1位自身を含めて最大3社（1位 + 重なる社2社まで）まで囲う。
   * 重なる社が無ければ1位だけが true（単独1位）。`comparable` が false の行は常に false。
   * 判定方法は `docs/ROADMAP.md` P1「『重なる』の定義」、実装は `compare.ts` の
   * `computeBracket()` を参照。
   */
  recommended: boolean;
  /**
   * 「同等」の印（P1-2）。おすすめ枠には入らない（3社目以降）が、
   * 1位の幅とは重なっている社。**枠には入れない**——おすすめは最大2社という上限を
   * 動かさないための印であって、資格の有無ではない。`recommended` と同時に true には
   * ならない。`comparable` が false の行は常に false。
   */
  equivalent: boolean;
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
  /**
   * 段や重量をずらしてもおすすめ枠が動かないか。**`rankIndeterminate` が true の
   * ときは常に false。**「安定」と「そもそも判別できない」を同じ `true` に潰さない
   * ため（P1-2、コーディネーター判断3、2026-09-11）——比較可能な全社が
   * おすすめ枠＋同等に収まっている（誰か1位の総額が上限不明で、全社が
   * その不確かさに埋もれている）状態は、重量を動かしても枠の集合が変わりようが
   * ないので機械的に「安定」と判定されてしまうが、中身は「どの社が安いか
   * 一切判別できていない」であって「重量が変わっても薦める社が変わらない」
   * という意味の安定ではない。この区別は `rankIndeterminate` を見て付ける。
   */
  rankStable: boolean;
  /**
   * 比較可能な社が1社でも在るのに、その全員がおすすめ枠か同等の印に収まっていて
   * 「どの社が安いか」を区別できない状態か（P1-2、判断3）。**このとき `rankStable`
   * は必ず `false`**——`rankIndeterminate` を「安定」側に寄せない。
   * 画面・`measured.ts`・README はこのフラグで「安定」と「判定不能」を描き分ける。
   */
  rankIndeterminate: boolean;
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
