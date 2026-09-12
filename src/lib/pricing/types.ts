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

/**
 * 宅配便の識別子（P2、オーナー確定 2026-09-11）。**`PostalMethod` とは別の軸。**
 *
 * `PostalMethod` の3条件（地帯別公表表・郵便通関・実重量課金）を満たさないので
 * 混ぜない（`postage.ts` 冒頭のコメント参照）。だが「最終価格を正とする」
 * （分解しない・`MeasuredPostageRate`）という別の扱いで価格化できる、というのが
 * このPRで足す器。**このPR自体はどの社にもデータを入れない**——並行作業者が
 * `master/courier-rates.json` を取っている（`docs/audit/o2-courier-2026-09-08.md`
 * の便ID一覧に対応）。データが入るまで、この型に値は存在しても選ばれない。
 */
/**
 * **2026-09-12 拡大。**「1社1本の代表値」に潰さず、**各社の画面に出る便名ごとに ID を持つ**
 * （オーナー確定）。理由は2つ、どちらも実測で分かった:
 *
 * 1. **同じブランド名でも便で順位が入れ替わる。**ZenMarket の FEDEX と FEDEX LOWCOST は
 *    5,000g/10,000g/20,000g で2回順位が入れ替わる。「安い方だけを代表にする」と、
 *    条件によって中身が違う同じ ID になり、まさに直そうとしている不安定さを持ち込む。
 * 2. **所要日数が違い、それは利用者が選ぶ軸であって、こちらが潰していい軸ではない。**
 *    FedEx Economy は5〜7日、Priority は2〜3日。
 *
 * 便名から ID を作る対応表は `postage.ts` の `COURIER_METHOD_NAME_MAP` に**1箇所だけ**
 * 持つ（次のデータ取り込みの検査に使う）。**別の社が別の表記で印字していても、
 * 同じ便だと断定できる根拠が無ければ ID を分けたままにする**（Buyee の「ECMS」と
 * FROM JAPAN の「ECMS」は表記が一致するので束ねたが、ZenMarket の無印「FEDEX」が
 * FROM JAPAN の Economy/Priority のどちらに当たるかは未確定 —— 分けたまま、
 * `COURIER_METHOD_NAME_MAP` に「未解決の組」として注記する）。
 */
export type CourierMethod =
  | 'courier-fedex'
  | 'courier-fedex-economy'
  | 'courier-fedex-priority'
  | 'courier-fedex-lowcost'
  | 'courier-fedex-connect-plus'
  | 'courier-ups'
  | 'courier-dhl'
  | 'courier-dhl-green-plus'
  | 'courier-dhl-express-1200'
  | 'courier-dhl-express-worldwide'
  | 'courier-sf-express'
  | 'courier-ecms'
  | 'courier-ecms-express'
  | 'courier-buyee-air'
  /**
   * **各社が「Surface」と印字する自社便。**日本郵便の公表表（`PostalMethod` の
   * `small-packet-surface`/`parcel-surface`）とは別物 —— 画面の値がその表と一致しない
   * （ZenMarket US 600g は自社 SURFACE ¥3,300、日本郵便の小形包装物船便は表の対象外
   * ＝ 600g では価格化できない）。**順位（`cheapest`）には入れない**
   * （所要1〜3か月、オーナー決定 P2 4）が、`Row.surface` に額を出す。
   */
  | 'courier-surface';

export type CountryCode = 'US' | 'GB' | 'DE' | 'FR' | 'AU' | 'CA' | 'SG';

/**
 * 個口の寸法（cm）。**P2 2a。**箱は仮定する——既に梱包後重量を
 * `round(net×1.2+300)` と仮定しているのと同じ性質の仮定（`compare.ts` の
 * `grossG` 参照）。`postage.ts` の `DEFAULT_PARCEL_DIMENSIONS_CM` を見よ。
 *
 * **日本郵便の計算にこれを持ち込まない。**日本郵便4方式は寸法に一切依存しない
 * ことが実測済み（`docs/audit/o2-courier-2026-09-08.md` §2）。使うのは
 * (a) 日本郵便の「寸法による送れない」判定（額ではなく可否。同§2）と
 * (b) 宅配便の容積重量の計算（同§5）の2箇所だけ。
 */
export interface BoxDimensionsCm {
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}

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
  /**
   * P1-4（外部レビュー、オーナー確定 2026-09-11）。この行が**輸入側（買主側）で
   * 発生する費目か**——「どの社を使っても同じようにかかる」もの（米国の Zonos
   * 前払い利用料・連邦売上税の不在など）。`taxLines()`（国・カートの情報だけで
   * 決まり、社の識別子を見ない関数）が作る行にだけ付く。
   *
   * **`amount === null`（未取得）のときにだけ意味を持つ。**額が確定している行に
   * 付けても何も変わらない。未取得の行がこれを持つと、`compare.ts` の順位・
   * おすすめ枠・`rankIndeterminate` の判定（`rankHighFor`）はこの行を
   * 「差を生まない共通の未知」として無視する——**総額の表示（`Row.total.high`）
   * からは除かない**（絶対値の不確かさは本物なので「以上（上限不明）」は残す）。
   * 未指定（社固有の未知。FROM JAPAN の外注梱包など）は順位判定にも従来どおり効く。
   */
  scope?: 'shared';
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
  /**
   * P1-4（外部レビュー、オーナー確定 2026-09-11）。**画面には出さない内部専用の値。**
   * 順位・おすすめ枠・`rankIndeterminate` の判定にだけ使う上端。`total.high` と
   * ほぼ同じだが、`Line.scope === 'shared'` な未取得行（社を問わず輸入側でかかる
   * 未知——米国の Zonos 前払い利用料・連邦売上税の不在など）は「差を生まない」
   * ものとして無視し、0 として畳む。社固有の未取得行（FROM JAPAN の外注梱包など）
   * は `total.high` と同じくこの行を `null` にする。
   *
   * **`total.high` はこの値の影響を受けない。**「以上（上限不明）」という総額の
   * 表示は、共通の未知があるかぎり消えない——本物の絶対値の不確かさだからだ。
   * `rankHigh` は「社同士の差が付くかどうか」だけを測るための、表示に出ない
   * 補助値。
   */
  rankHigh: number | null;
  /** 総額から漏れている費目（未取得）の英語ラベル。総額が低く見える方向の誤りを明示する。 */
  excluded: string[];
  parcels: number;
  /**
   * この行に実際に使った国際配送の方式。`method: 'cheapest'` のとき行ごとに違いうる。
   * **`CourierMethod` も入りうる**（P2）——宅配便にデータが入り、かつそれが
   * 最安のとき。データが無い間はどの行もここに `CourierMethod` を持たない。
   */
  method: PostalMethod | CourierMethod;
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
  /**
   * **P2 4（オーナー確定 2026-09-12）。**この社が売っている「Surface」便のうち最安のもの
   * ——日本郵便の船便2方式（`small-packet-surface`/`parcel-surface`）と、社が自社便として
   * 出す `courier-surface` の両方を候補にする。**既定（`method`）には絶対に選ばれない**
   * （1〜3か月かかるので、`DEFAULT_METHOD` の解決からは常に除外——`compare.ts` 参照）。
   * だが額そのものは隠さない、というのがオーナーの明示の指示——**待てる利用者は
   * この額を読めなければならない。**
   *
   * `null` = この社にはこの国・この重量で価格化できる Surface 便が無い。
   *
   * **これは別行（別 Row）ではない。**ランキングは「社」を比べるものなので、1社が
   * 2行に化けると5社比較が壊れる（オーナー確定）。既定の行に載る副次フィールド。
   *
   * `shipYen` はこの Surface 便**単体の送料**（他の費目・税を含まない生の額）。
   * 総額まで作り直すには行全体をこの便で組み直す必要があり、このPRのスコープでは
   * 送料そのものの可視化だけに絞った——`docs/audit/` に理由を残す。
   */
  surface: {
    method: PostalMethod | CourierMethod;
    label: string;
    shipYen: { low: number; high: number | null };
    /** 例: '1–3 months'。画面はここをそのまま出す——「除外した」ではなく理由を書く。 */
    days: string;
    note: string;
  } | null;
  /**
   * **この行が実際に価格を計算した個口の内訳。**`parcels` は個数（`number`）
   * だけだったので、どの商品がどの箱に入ったか・箱ごとの申告額・なぜ他の箱と
   * 別なのかは `buildRow` の中で計算されて捨てられていた（2026-09-12、
   * `ParcelView`、当時の `boxSplit.ts`（後に削除）の複数版のレビューで指摘——UI 側がこれを
   * 再計算しようとするたびに、この行が実際に使った方式・グルーピングと
   * 食い違うバグを繰り返した。表示側は Row を再計算せず、この配列をそのまま
   * 描くこと）。
   *
   * `parcels === boxes.length` は常に成り立つ。`boxes` は既存の `parcels`
   * を置き換えない（既存の呼び出し側はそのまま動く）——追加のフィールド。
   */
  boxes: ParcelBox[];
}

/**
 * ある個口が他の個口と別である理由。**5つは対称ではない**（`shops.ts` 参照）:
 *   - `'identified-shop'`  … 店舗 ID が判明していて、実際に別の店舗だと分かっている
 *   - `'per-listing'`      … 出品ごとに1注文（オークション/メルカリ/ラクマ。
 *                            `isPerListingSite`）。これは Buyee の公表規約どおりの
 *                            正しい挙動であって、保守的な仮定ではない。
 *   - `'unresolved-shop'`  … 店舗を読み取れなかった（URL から店舗が引けない等）。
 *                            まとめない代わりに、合計額は高めに出る、と
 *                            `compare.ts` 自身が開示している。**5つのうちここだけ
 *                            が「こちらの数字が高めに外れているかもしれない」と
 *                            知りながら出している値**——最もユーザーに見せる価値がある。
 *   - `'weight-limit'`     … 配送方式の重量上限（`maxGramsFor`）を超えたため増やした箱
 *                            （docs/DESIGN-BOX-SIZE.md §2④）。**この個口の下地
 *                            から実際に2箱以上できたときだけ**——起きていない
 *                            分割をこの値で主張してはいけない（F6）。
 *   - `'single'`           … そもそも割れていない。1個口のカート、または下地が
 *                            1つで重量も上限に収まっている場合。「なぜ他と
 *                            別なのか」という問い自体が成立しない——だから
 *                            `'weight-limit'` へのフォールバックでごまかさず、
 *                            この値を正直に返す（F6、旧実装はここも
 *                            `'weight-limit'` にしていた）。
 * `'unresolved-shop'` を `'identified-shop'`（"a different shop"）のように見せては
 * いけない——知らないことを知っているかのように主張することになる。
 */
export type ParcelSplitReason =
  | 'identified-shop' | 'per-listing' | 'unresolved-shop' | 'weight-limit' | 'single';

/**
 * この箱の関税の判定（`compare.ts` の `taxLines` が個口ごとに出す判定、そのまま）。
 * **4種は対称ではない**（コーディネーター指摘 2026-09-12、`docs/DESIGN-BOX-SIZE.md` 参照）:
 *   - `'flat'`    … 免税限度以下でも1点あたり定額の関税がかかる（DE/FR の `flatDutyPerItem`）。
 *                   **免税線の下にあっても無税ではない**——画面はこれを「免税」と混同してはいけない。
 *   - `'free'`    … 免税限度（有限）以下で、関税ゼロ。**限度線を引いてよいのはこのときだけ。**
 *   - `'no-duty'` … この品目にはそもそも関税という費目が無い国（例: シンガポール、
 *                   `dutyFreeLimit: Infinity`）。**「限度以下だから免税」ではなく
 *                   「限度という概念自体が無い」**——画面はここで免税線を描いてはいけない
 *                   （無限の限度は線ではない）。
 *   - `'rate'`    … 免税限度を超え、税率で関税がかかる。
 *   - `'unknown'` … 税率が未公表（`yen` は `null`）。
 */
export type ParcelDutyKind = 'flat' | 'free' | 'no-duty' | 'rate' | 'unknown';

export interface ParcelDutyVerdict {
  kind: ParcelDutyKind;
  /** 円。`kind === 'unknown'` のときだけ `null`（未取得。0 とは書かない）。 */
  yen: number | null;
}

/**
 * この箱の VAT/GST の判定。**4種は対称ではない:**
 *   - `'no-rate'`         … 連邦レベルの VAT/GST が無い制度（米国）。
 *   - `'seller-collects'` … 代行が決済時に徴収する（国境では別途課さない）。`yen` は常に0
 *                           （社が別途、決済手数料の行で取る額を持つ）。
 *   - `'free'`            … VAT/GST の免税限度以下で、ゼロ。**免税限度が実質0の国
 *                           （GB/DE/FR/AU の `vatFreeLimit: 0`）ではこの kind は出ない**
 *                           ——0円以下の商品は存在しないので、必ず `'rate'` になる。
 *                           **免税線の下＝無税、という読みが崩れる国がある理由はここ。**
 *   - `'rate'`            … 税率で VAT/GST がかかる。
 */
export type ParcelVatKind = 'no-rate' | 'seller-collects' | 'free' | 'rate';

export interface ParcelVatVerdict {
  kind: ParcelVatKind;
  /** 円。`kind === 'no-rate'` のときだけ `null`。 */
  yen: number | null;
}

/** この箱の関税・VAT/GST の判定を1組にまとめたもの。`taxLines()` の個口ごとの判定そのもの。 */
export interface ParcelTaxVerdict {
  duty: ParcelDutyVerdict;
  vat: ParcelVatVerdict;
}

export interface ParcelBox {
  /** この箱に入っている商品の元の `items` 配列における添字。**重い順**
   *  （`packHeaviestFirst` の詰め順、docs/DESIGN-BOX-SIZE.md §2⑤）。 */
  itemIndices: number[];
  /** この箱の申告額 = 実際にこの箱に入っている商品の代金の合計。均等割りではない。 */
  declaredYen: number;
  /** 梱包後重量（g）。`compare.ts` の `grossG` と同じ式。 */
  weightG: number;
  /** この箱がなぜ他の箱と別なのか。上の `ParcelSplitReason` 参照。 */
  reason: ParcelSplitReason;
  /**
   * この箱の関税・VAT/GST の判定（コーディネーター指摘 2026-09-12）。
   * **画面はここから「免税かどうか」を読み取るだけで、しきい値と申告額を
   * 自分で比べてはいけない。**国によって免税限度が指すものが違いすぎる
   * （GB/DE/FR/AU は VAT 免税限度が実質0、DE/FR は免税限度以下でも定額関税、
   * SG は関税の限度が無限大）ため、「限度未満＝無税」という単純な比較は
   * 5カ国中5カ国で誤る。`taxLines()` が個口ごとに出した判定をそのまま渡す。
   */
  tax: ParcelTaxVerdict;
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
  /**
   * 行ID → その行が取りうる総額の幅。bands があるときのみ。
   *
   * **上端は `number | null`**（外部レビュー⑤-c、2026-09-11）。段のどれか1つでも
   * その行の `total.high === null`（上限不明。例: FROM JAPAN の外注梱包費）なら、
   * 全段を通じた上端も `null` のまま——`compare()` を直接呼ぶ利用者に閉区間の嘘を
   * つかない。以前はここが常に `[low, low]`（段ごとの下端の最小・最大）で組まれて
   * いたため、上限不明の行が段の切り替えで閉じた区間に化けていた（UI は必ず重量を
   * 入れるのでこの経路に到達しないが、`compare()` を直接呼ぶ利用者には嘘だった）。
   */
  rowTotalRange: Record<string, [number, number | null]> | null;
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
   *
   * **2026-09-12、`CourierMethod` も指定できるようにした（P2 1）。**宅配便に
   * データが入ったので、日本郵便の方式と同じ枠で明示的に選べる——UI がまだこの
   * 選択肢を出していなくても、`compare()` を直接呼ぶ側（テスト・将来の UI）は
   * 選べる。
   */
  method?: PostalMethod | CourierMethod | 'cheapest';
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
