import type { CountryCode, PostalMethod, SiteId, Tier } from './types';

export interface FeeModel {
  /** 点あたりの定額手数料（既定）。 */
  perItemYen?: number;
  /** 出品サイトで額が変わる社（ZenMarket）。無い site は perItemYen。 */
  perItemBySite?: Partial<Record<SiteId, number>>;
  /**
   * 同一商品を複数個買っても手数料は1回か。
   * Neokyo / ZenMarket / FROM JAPAN は自社ページで明記している。
   * Buyee は注文ごとなのでこの欄を使わない。
   */
  chargedPerDistinctItem?: boolean;
  /** 従価料率が変わる社（Jauce の場外店舗）。 */
  adValoremBySite?: Partial<Record<SiteId, number>>;
  /** 支払ごとの銀行手数料（Jauce ¥300）。出品者×日ごとだが、注文ごとで近似する。 */
  bankFeePerOrderYen?: number;
  bankFeeTier?: Tier;
  /** 支払手数料が課される出品サイト。空なら全サイト。 */
  paymentInsideJapanSites?: SiteId[];
  /** 注文あたりの定額手数料（Buyee）。 */
  perOrderYen?: number;
  /**
   * 同一サイト・同一店舗の複数点が1注文になるか（Buyee のショッピング）。
   * **その社が自分のページで「同じ店なら1回」と書いているときだけ true。**
   * 店舗は出品URLから引く（`shops.ts`）。URL から引けない点はまとめない
   * ＝その点は1点＝1注文のまま課金し、行の note にそう書く。
   */
  ordersGroupedByShop?: boolean;
  /** 商品代に対する率（Jauce の 8%。唯一の従価型）。 */
  adValoremRate?: number;
  /** 注文あたりの保証プラン料（Buyee。Lite を選べば ¥0）。 */
  protectionPlanPerOrderYen?: number;
  /** 日本国内での支払手数料（FROM JAPAN ¥200）。点か注文か原文から読めない。 */
  paymentInsideJapanYen?: number;
  paymentInsideJapanTier?: Tier;
  /** このサイト由来の item は perItem / adValorem を課金しない（Jauce のベータ無料）。 */
  freeForSites?: SiteId[];
  freeForSitesTier?: Tier;
  tier: Tier;
}

export interface DepositFee {
  /** 先に乗る定額（Jauce の ¥40）。 */
  flatYen: number;
  /** 送金合計額に対する率。gross-up で効く。 */
  rate: number;
  tier: Tier;
  note: string;
}

export interface PackingFee {
  /** 個口あたりの基本料。 */
  perParcelYen: number;
  /** 超過1kgあたり。 */
  perKgYen: number;
  /** ここまでは基本料に含まれる。 */
  freeUpToG: number;
  /** 必須か（選べる任意費目ではないか）。 */
  mandatory: boolean;
  tier: Tier;
}

/**
 * 任意費目の額を決めるのに要る、その行の実際の姿。
 * 「1個口あたり」「1kgあたり」「1点あたり」の費目を、**持っている数字で実額にする**
 * ために渡す。持っていない数字（保管日数など）は額にしない。
 */
export interface OptionalFeeContext {
  parcels: number;
  /** 個口ごとの梱包後重量（g）。 */
  parcelGrossG: number[];
  /** 点数（qty の合計）。 */
  units: number;
  /** その行で実際に積んだ梱包料（円）。Neokyo の開梱料が「¥1,000 ＋ 梱包料」なので要る。 */
  packingYen: number;
}

export interface OptionalFee {
  key: string;
  label: string;
  /** 円。**null = 額が公表されていない。** 画面では「—」。0 とは書かない。 */
  amountYen: number | null;
  /**
   * 額の出どころが、その社の料金ページとは別のとき指す。省略すると社の sourceUrl。
   * **輸出申告代行手数料は日本郵便の額**で、代行各社は「郵便局が取る」と書いているだけ。
   * 社のページを出典に立てると、額を社が決めているように読める。
   */
  sourceUrl?: string;
  /**
   * 個口・重量・点数で額が決まる費目。あれば amountYen より優先する。
   * null を返せば「この入力では額を出せない」。
   */
  amountFor?: (ctx: OptionalFeeContext) => number | null;
  note: string;
  tier: Tier;
}

/**
 * 代行が販売時点で徴収する輸入税（AU の GST・SG の GST）。
 *
 * **確認できた国だけ入れる。入っていない国は「徴収しない」ではなく「確認できていない」。**
 * 未確認を 0 として扱えば、単に調べていない社が安く見えるだけの表になる。
 * 画面ではその社のその国の行が「—」になり、excluded に「確認できていない」と出る。
 */
export interface PrepaidImportTax {
  rate: number;
  /**
   * 課税ベース。**その社が自分のページで書いているとおりに選ぶ。**
   *   declared        … 内容品価格（商品代）のみ
   *   before-shipping … 商品代＋当社手数料（送料は入らない）
   *   total           … 税を除く支払総額（商品代＋手数料＋国内送料＋梱包＋国際送料）
   */
  base: 'declared' | 'before-shipping' | 'total';
  /**
   * **その社が自分で徴収すると言っている上限**（受取国通貨・intrinsic value）。
   * 国側の `sellerCollectsBelow` は「その国では**どの社も**販売時点で取る」制度
   * （豪 A$1,000・星 S$400）を表すのに対し、こちらは**社ごと**。
   * EU/UK の IOSS は制度が任意なので、**社によって取る／取らないが割れる**。
   */
  collectsBelow?: number;
  /** 画面に出す1行（英語）。その社の原文の言い方に寄せる。 */
  note: string;
  tier: Tier;
  sourceUrl: string;
  /** 一次情報を当たった日。 */
  checkedOn: string;
}

/**
 * 公表額への上乗せ。**形は観測点の数で決まる。**
 *
 * 2026-09-07 のフェーズ2（5社 × 7カ国 × 3重量＝105見積）で、
 * 3つの上乗せは **1kg 段ごとの定額**だと3点とも一致して分かった。
 * 1つだけ形が決まっていない ── 小形包装物は上限 2kg で、観測が 600g と 2,000g の
 * **2点しか取れない**。2点は必ず直線で結べるので「直線だ」は発見ではない。
 */
export type PostageMarkup =
  /** 上乗せ無し。公表額そのまま。 */
  | { kind: 'none' }
  /**
   * 1kg 段ごとの定額。`ceil(g / 1000) × yen`。
   * **3点（600g / 2,000g / 5,000g）すべてで一致したので、形が決まっている。**
   */
  | { kind: 'per-kg-step'; yen: number }
  /**
   * 観測点だけ。**形は決まっていない。**点の間は線形で結び、外は端の値を延ばす。
   * これは「直線だと分かった」ではなく「2点しか無いので直線以外を選べない」。
   * 3点目が取れたら形ごと見直す。
   */
  | { kind: 'observed'; points: readonly (readonly [grams: number, addYen: number])[] };

/** その社のその方式の料金。公表額に上乗せを足して出す。 */
export interface PostageRate {
  /** 全国共通の上乗せ。国で違うものは `byCountry` が上書きする。 */
  markup: PostageMarkup;
  /** 国ごとの上乗せ。**国で額が変わるものがある**（ZenMarket は US と SG が別）。 */
  byCountry?: Partial<Record<CountryCode, PostageMarkup>>;
  /**
   * **上乗せの確度であって、重量の確度ではない。**料金表そのものは日本郵便の公表値
   * （一次情報）なので、この tier は「その社が公表額をそのまま転嫁しているか」だけを表す。
   *   fixed    … 公表額と一致することを確認した、または上乗せの形が3点で決まった
   *   estimate … 上乗せはあるが、観測が2点で形を決められない
   */
  tier: Tier;
  sourceUrl: string;
  checkedOn: string;
  /** その社の画面での呼び方（原文）。訳さない。 */
  labelRaw: string;
  /** 上乗せがある方式だけ、観測の中身を残す。 */
  observed?: string;
}

export interface Service {
  id: string;
  name: string;
  url: string;
  sourceUrl: string | null;
  /** 料金の出所が一次情報か。false なら画面の列見出しを破線にする。 */
  primarySource: boolean;
  fee: FeeModel;
  /** サービス料に国内送料が含まれるか（Neokyo だけ true）。 */
  domesticIncluded: boolean;
  deposit: DepositFee | null;
  packing: PackingFee | null;
  /** 既定の個口。'per-order' は注文ごとに別送（Buyee だけ）。 */
  parcelDefault: 'one' | 'per-order';
  parcelVerified: boolean;
  /** 同梱を申請できるか。 */
  consolidationOnRequest: boolean;
  /**
   * **その社が売っている日本郵便の方式と、公表額に対する上乗せ。**
   *
   * 2026-09-07 に5社の公開計算機を実測（`docs/O2-CALCULATOR-RUN.md` フェーズ1、
   * ドイツ宛 600g）して分かったことが2つあり、それが以前の形（社ごとに1つの
   * `emsMarkup`）では表せなかった:
   *
   * 1. **品揃えが社で違う。**FROM JAPAN は5方式、Jauce は2方式しか出さない。
   *    全社が全方式を出すことにしていたのは嘘だった。**キーが無い方式は売っていない。**
   * 2. **上乗せは方式ごと。**ZenMarket は EMS が公表額どおりなのに小形包装物(航空)だけ
   *    +45.2%、Jauce は EMS どおりで国際小包(船便)だけ +10.0%。
   *    社ごとに1つの率では、この2件を再現できない。
   *
   * **EMS は5社とも1円まで一致した**（全社 ¥3,400 = 公表額）ので、そこだけ `fixed`。
   */
  postage: Partial<Record<PostalMethod, PostageRate>>;
  optional: OptionalFee[];
  /**
   * 受取国ごとの前徴収税。**確認できた国だけ。** 未確認の国は欄ごと無い。
   * 「無い」と「0」を区別できるように、ここに 0 を置くことはしない。
   */
  prepaidImportTax?: Partial<Record<CountryCode, PrepaidImportTax>>;
  /** アフィリエイト報酬を払うか。**順位計算には一切使わない。** */
  paysUs: boolean;
  referralNote: string | null;
}

/** ZenMarket が EU・UK の VAT 前徴収を強制にした告知。DE / FR / GB の3行が同じ原文を指す。 */
const ZENMARKET_VAT_PRECHARGE_URL =
  'https://zenmarket.jp/en/blog/post/16240/mandatory-vat-precharge-eu-norway';

export const SERVICES_CHECKED_ON = '2026-09-06';

/**
 * 輸出申告代行手数料 ¥2,800。**代行5社の費目ではなく日本郵便の費目。**
 * だから5社すべての任意欄に同じ額で出す。3社（Buyee・Jauce・FROM JAPAN）は自社ページに
 * 額を書いており、Neokyo は「代行する」とだけ書き、ZenMarket は何も書いていない。
 * **書いていない社に出さなければ、その社が安いのではなく我々が調べていないだけの表になる。**
 *
 * 原文（2026-09-07 取得）:
 *   「内容品の合計価格が20万円を超える（税込み20万1円以上の）郵便物を海外へ発送する
 *     場合、税関への輸出申告の実施および輸出許可の取得が必要です。」
 *   「郵便料金とは別に、輸出申告代行手数料を1件につき2,800円お支払いください。」
 *   「同じ受取人あてに2個以上発送する場合は、全ての梱包を合わせて1件となります。」
 *
 * 最後の1文から、これは個口あたりではなく申告1件あたり。よって `amountFor` を持たせず
 * 定額で出す。**同時発送でなければ別の申告になるが、発送のタイミングは入力に無い。**
 */
export const EXPORT_DECLARATION_FEE_YEN = 2800;
export const EXPORT_DECLARATION_FEE_SOURCE =
  'https://www.post.japanpost.jp/service/send/oversea/attention/sendover20/';

export const SERVICES: Service[] = [
  {
    id: 'neokyo',
    name: 'Neokyo',
    url: 'https://neokyo.com/',
    sourceUrl: 'https://neokyo.com/en/fees',
    primarySource: true,
    // 公式の ORDER PAYMENT は「Order and domestic shipping price」の下にプラス記号を置き、
    // その下が ¥350。つまり（商品代＋国内送料）＋¥350 で、**¥350 に国内送料は含まれない。**
    // 「同一商品の複数個は1回だけ」も同ページに明記。
    fee: { perItemYen: 350, chargedPerDistinctItem: true, tier: 'fixed' },
    domesticIncluded: false,
    deposit: null,
    packing: { perParcelYen: 500, perKgYen: 150, freeUpToG: 2000, mandatory: true, tier: 'fixed' },
    parcelDefault: 'one',
    parcelVerified: true,
    consolidationOnRequest: false,
    // 2026-09-07 に公開計算機で実測（`docs/O2-CALCULATOR-RUN.md` フェーズ1、DE 600g）。
    // 小形包装物を出していない（国際小包のみ）。郵便番号と寸法が必須入力
    postage: {
      'parcel-surface': {
        markup: { kind: 'none' }, tier: 'fixed',
        labelRaw: 'Japan Post / Surface (2-4 months)',
        sourceUrl: 'https://neokyo.com/en/shipping-rates-estimate',
        checkedOn: '2026-09-07',
      },
      'ems': {
        markup: { kind: 'none' }, tier: 'fixed',
        labelRaw: 'Japan Post / EMS (2-5 days)',
        sourceUrl: 'https://neokyo.com/en/shipping-rates-estimate',
        checkedOn: '2026-09-07',
      },
      'parcel-air': {
        markup: { kind: 'none' }, tier: 'fixed',
        labelRaw: 'Japan Post / Airmail (6-10 days)',
        sourceUrl: 'https://neokyo.com/en/shipping-rates-estimate',
        checkedOn: '2026-09-07',
      },
    },
    optional: [
      // 原文:「You will be charged 1000¥ **plus the price of the packing fee**
      // (Example: 500¥ Packing Fee, 1500¥ Unpacking Fee).」
      // 梱包料はこの行が実際に積んでいる額なので、そこから出す。¥1,000 だけ出すのは過小。
      {
        key: 'unpacking', label: 'Unpacking / removing original box', amountYen: 1000,
        amountFor: (ctx) => 1000 + ctx.packingYen,
        note: '¥1,000 plus the packing fee for the same parcel', tier: 'fixed',
      },
      { key: 'konbini', label: 'Convenience store payment', amountYen: 1000, note: 'per payment', tier: 'fixed' },
      // 額の出どころは日本郵便（EXPORT_DECLARATION_FEE_SOURCE）。**Neokyo 自身は額を
      // 書いていない**（FAQ は「any item worth more than 200,000 yen is subject to
      // special export procedures on our part」＝申告を代行するとだけ書く）。
      // 額は一次情報なので fixed。誰が書いていないかは note に出す。
      {
        key: 'export-clearance', label: 'Export clearance fee', amountYen: EXPORT_DECLARATION_FEE_YEN,
        sourceUrl: EXPORT_DECLARATION_FEE_SOURCE,
        note: 'only over ¥200,000 — Neokyo says it handles the export declaration but does'
          + ' not print the amount; ¥2,800 is the fee Japan Post itself publishes',
        tier: 'fixed',
      },
      // https://neokyo.com/en/storage（2026-09-07 取得）。原文の表:
      //   Dimensions | Additional Order Weekly Storage cost | Additional Parcel Weekly Storage cost
      //   Small 350 yen / 210 yen ・ Average 700 yen / 490 yen ・ Large 1400 yen / 980 yen
      // 「45 days for items and 7 days for packages」「up to a limit of six unpaid weeks」。
      // **寸法は入力に無い**ので一番小さい段を出し、幅を note に書く（実勢はこれより高い）。
      {
        key: 'storage', label: 'Storage, per week after 45 free days', amountYen: 350,
        sourceUrl: 'https://neokyo.com/en/storage',
        note: 'per order: ¥350 small / ¥700 average / ¥1,400 large — parcels ¥210 / ¥490 / ¥980.'
          + ' We do not know your parcel size, so this is the smallest step',
        tier: 'fixed',
      },
    ],
    // 豪州の GST は自社で徴収すると公式に書いている（確認日 2026-09-06）。原文:
    // 「effective March 24th, 2023, we will be charging 10% of the declared value for
    //  parcels containing Low-Value Goods (1000 AUD or less) bound for Australia as GST,
    //  in addition to international shipping and insurance fees」
    // → **課税ベースは declared value（内容品価格）**で、送料・手数料は入らない。
    // シンガポールについては同じページにも料金ページにも記載が無い。**だから書かない。**
    prepaidImportTax: {
      AU: {
        rate: 0.10, base: 'declared', tier: 'fixed',
        note: '10% of the declared value, charged with the shipping fee',
        sourceUrl: 'https://neokyo.com/en/shipping', checkedOn: '2026-09-06',
      },
    },
    // 最もよく最安になる会社が、報酬を払わない。それでも順位は総額のみで決める。
    paysUs: false,
    referralNote: 'pays us nothing',
  },
  {
    id: 'zenmarket',
    name: 'ZenMarket',
    url: 'https://zenmarket.jp/',
    sourceUrl: 'https://zenmarket.jp/ja/fees.aspx',
    primarySource: true,
    // 一律 ¥800 ではない。原文は「500 yen … Amazon, Rakuten, and most other stores /
    // 300 yen … Recommended Stores / 800 yen … all Mercari items and JDirectItems Auction bids」。
    // 「If you buy 3 identical T-shirts, our service fee will still be the same」も明記。
    fee: {
      perItemYen: 500,
      perItemBySite: { 'yahoo-auctions': 800, mercari: 800 },
      chargedPerDistinctItem: true,
      tier: 'fixed',
    },
    domesticIncluded: false,
    deposit: {
      // **公表値は 3.5% ではない。** 料金ページ（Arquivo.pt 2025-11-27 の写し、
      // 2026-09-06 読了）は「Funds Deposit Fee (**from 1%**)」としか書いておらず、
      // 支払方法ごとの率を出していない。3.5% は台湾の利用者が公開した実請求
      // ¥10,363 から我々が逆算した値（10000/(1-0.035) = ¥10,362.7 と1円差、
      // docs/DESIGN-NOTES.md §3）。**逆算は我々の推定なので estimate。**
      flatYen: 0, rate: 0.035, tier: 'estimate',
      note: '3.5% of the whole payment — the page says only "from 1%"',
    },
    packing: null,
    parcelDefault: 'one',
    parcelVerified: false,
    consolidationOnRequest: false,
    // 2026-09-07 に公開計算機で実測（`docs/O2-CALCULATOR-RUN.md` フェーズ1、DE 600g）。
    // 船便の小形包装物は出していない。NOVA GLOBAL・ECMS EXPRESS は自社独自方式で未価格化
    postage: {
      'small-packet-air': {
        // **形が決まっていない唯一の上乗せ。**小形包装物は上限 2kg なので、
        // 観測は 600g と 2,000g の2点しか取れない。kg段で割ると DE は 637 と 508 で
        // 一致しないので定額ではなく、2点は必ず直線で結べるので「直線」も発見ではない。
        markup: { kind: 'observed', points: [[600, 637], [2000, 1015]] },
        byCountry: {
          US: { kind: 'observed', points: [[600, 1281], [2000, 2142]] },
          SG: { kind: 'observed', points: [[600, 572], [2000, 824]] },
        },
        tier: 'estimate',
        labelRaw: 'AIRMAIL (AVIA) Small Parcel',
        observed: '600g/2,000g の2点。DE +637/+1,015、US +1,281/+2,142、SG +572/+824。'
          + '**国でも重量でも動く。**率にすると DE +45.2%/+25.8%、US +90.9%/+54.5%、SG +58.4%/+31.0%',
        sourceUrl: 'https://zenmarket.jp/en/calc.aspx',
        checkedOn: '2026-09-07',
      },
      'parcel-surface': {
        // US だけ 1kg 段ごとに ¥100。3点（+100/+200/+500）で一致。
        markup: { kind: 'none' },
        byCountry: { US: { kind: 'per-kg-step', yen: 100 } },
        tier: 'fixed',
        labelRaw: 'SURFACE Standard Parcel',
        observed: 'US のみ +¥100/kg段（600g +100 / 2,000g +200 / 5,000g +500）',
        sourceUrl: 'https://zenmarket.jp/en/calc.aspx',
        checkedOn: '2026-09-07',
      },
      'ems': {
        markup: { kind: 'none' }, tier: 'fixed',
        labelRaw: 'EMS Standard Parcel',
        sourceUrl: 'https://zenmarket.jp/en/calc.aspx',
        checkedOn: '2026-09-07',
      },
      'parcel-air': {
        // US だけ 1kg 段ごとに ¥350。3点（+350/+700/+1,750）で一致。
        markup: { kind: 'none' },
        byCountry: { US: { kind: 'per-kg-step', yen: 350 } },
        tier: 'fixed',
        labelRaw: 'AIRMAIL (AVIA) Standard Parcel',
        observed: 'US のみ +¥350/kg段（600g +350 / 2,000g +700 / 5,000g +1,750）',
        sourceUrl: 'https://zenmarket.jp/en/calc.aspx',
        checkedOn: '2026-09-07',
      },
    },
    optional: [
      { key: 'photos', label: 'Extra photos', amountYen: 500, note: 'per request', tier: 'fixed' },
      { key: 'repack', label: 'Repacking', amountYen: 1000, note: 'from ¥1,000 to ¥4,000', tier: 'fixed' },
      // 額の出どころは日本郵便（EXPORT_DECLARATION_FEE_SOURCE）。**ZenMarket の写しには
      // 記載が無い**（料金ページ・help とも「Customs fees may apply upon delivery」まで。
      // Arquivo.pt 2025-11-27 の写しを 2026-09-07 に全文検索して 200,000 も 2,800 も
      // 出ないことを確認した）。5社とも同じ日本郵便で送る以上、この費目を ZenMarket
      // にだけ出さなければ、料金差ではなく我々の調査量の差を安さとして見せることになる。
      {
        key: 'export-clearance', label: 'Export clearance fee', amountYen: EXPORT_DECLARATION_FEE_YEN,
        sourceUrl: EXPORT_DECLARATION_FEE_SOURCE,
        note: 'only over ¥200,000 — ZenMarket does not print this fee anywhere we can read;'
          + ' ¥2,800 is the export declaration fee Japan Post itself publishes',
        tier: 'fixed',
      },
      // 料金ページ原文（Arquivo.pt 2025-11-27 の写し、2026-09-07 読了）:
      //   「Storage Over 60 Days: 50 JPY a day per item.」
      // help の同じ説明:「free for 60 days … a fee of 50 JPY will start to be taken for
      //   each item per day」。**点ごと**なので点数で出せる。
      {
        key: 'storage', label: 'Storage, per day after 60 free days', amountYen: 50,
        amountFor: (ctx) => 50 * ctx.units,
        note: '¥50 a day per item, counted from the day it arrived at the warehouse',
        tier: 'fixed',
      },
    ],
    // 料金ページの「To Australian customers」（確認日 2026-09-06、直アクセスは 403 なので
    // r.jina.ai 経由で本文を取得）。原文:「we are required to collect 10% GST for all parcels
    // sent to Australia with a total value of 1,000 AUD or less … GST will be applied to
    // parcels where the declared value is equal to or lower than 1,000 AUD. If it applies,
    // the tax will be charged at the same time as the international shipping fee」
    // → ベースは declared value。同ページに欧州の VAT 任意前払いの記載はあるが、
    // **シンガポールの記載は無い。**
    prepaidImportTax: {
      AU: {
        rate: 0.10, base: 'declared', tier: 'fixed',
        note: '10% of the declared value, charged with the international shipping fee',
        sourceUrl: 'https://zenmarket.jp/en/fees.aspx', checkedOn: '2026-09-06',
      },
      // **5社でここだけが EU / UK の VAT を決済時に取る。**しかも 2026-03-02 から強制。
      // 原文（自社ブログ 2026-02-19）:「Starting March 2, 2026, ZenMarket will make VAT
      // pre-charge mandatory for eligible shipments to the European Union (EU), Norway
      // and the UK.」「European Union (IOSS System): All parcels with a declared value of
      // 150 EUR or less」「UK (VAT precharge): For parcels with a goods value of
      // 135 GBP or less」「Customers will no longer be able to opt out of VAT pre-charge
      // for applicable shipments.」
      //
      // **輸送業者の限定が無い。**Neokyo は同じ IOSS でも「If you ship with Japan Post
      // ... the customs are Delivered Duty Unpaid」と郵便を明示的に外しているが、
      // ZenMarket の告知にその条件は無い。だからこの計算機の既定（EMS）でも効く。
      //
      // **閾値と課税ベースは別物。**€150 / £135 の判定は intrinsic value（商品代のみ）だが、
      // 課税ベースは EU VAT 指令の一般規則で「the invoiced price, including taxes, duties,
      // levies and charges (excluding VAT itself), and **incidental expenses such as
      // commission, packing, transport and insurance costs charged by the supplier**」。
      // IOSS では代行が supplier なので、代行が請求する分は全部入る → `total`。
      // （最初 `declared` で置いたが、それだと課税ベースが商品代だけになり
      //  ZenMarket の税額が他社の約半分に出ていた。閾値の測り方と混同していた。）
      // **未確定**: €3 の定額関税が課税ベースに入るか。指令の文言は duties を含むが、
      // その関税は IOSS の外で課され、我々は代行の請求書を持っていない。入れていない。
      DE: {
        rate: 0.19, base: 'total', collectsBelow: 150, tier: 'fixed',
        note: '19% German VAT, charged at parcel payment via IOSS — not at the border',
        sourceUrl: ZENMARKET_VAT_PRECHARGE_URL, checkedOn: '2026-09-07',
      },
      FR: {
        rate: 0.20, base: 'total', collectsBelow: 150, tier: 'fixed',
        note: '20% French VAT, charged at parcel payment via IOSS — not at the border',
        sourceUrl: ZENMARKET_VAT_PRECHARGE_URL, checkedOn: '2026-09-07',
      },
      GB: {
        rate: 0.20, base: 'total', collectsBelow: 135, tier: 'fixed',
        note: '20% UK VAT, charged at parcel payment — not at the border',
        sourceUrl: ZENMARKET_VAT_PRECHARGE_URL, checkedOn: '2026-09-07',
      },
    },
    paysUs: true,
    referralNote: 'pays us ¥100 if you sign up',
  },
  {
    id: 'fromjapan',
    name: 'FROM JAPAN',
    url: 'https://www.fromjapan.co.jp/',
    // 公式配信の翻訳ファイルから原文取得: `500 yen per item`
    sourceUrl: 'https://www.fromjapan.co.jp/translate/en_help.txt',
    primarySource: true,
    fee: {
      perItemYen: 500,
      chargedPerDistinctItem: true,
      // 「5%」「$50超10%」は別サービス FROM USA の料金で、日本商品には適用されない。
      // ¥200 は **ヤフオクの落札1件ごと限定**。2023-01-31 11:00 JST 以降、
      // それ以外の支払手数料は廃止された。原文に per auction と書いてある。
      paymentInsideJapanYen: 200,
      paymentInsideJapanSites: ['yahoo-auctions'],
      paymentInsideJapanTier: 'fixed',
      tier: 'fixed',
    },
    domesticIncluded: false,
    deposit: null,
    packing: null,
    parcelDefault: 'one',
    parcelVerified: true,
    consolidationOnRequest: false,
    // 2026-09-07 に公開計算機で実測（`docs/O2-CALCULATOR-RUN.md` フェーズ1、DE 600g）。
    // **5社で唯一、既定で方式が選ばれている**（最安を自動選択）。International ePacket Light ¥1,780 は未価格化
    postage: {
      'small-packet-surface': {
        markup: { kind: 'none' }, tier: 'fixed',
        labelRaw: 'Surface (Small Packet)',
        sourceUrl: 'https://www.fromjapan.co.jp/en/estimate/',
        checkedOn: '2026-09-07',
      },
      'small-packet-air': {
        markup: { kind: 'none' }, tier: 'fixed',
        labelRaw: 'AirMail (Small Packet)',
        sourceUrl: 'https://www.fromjapan.co.jp/en/estimate/',
        checkedOn: '2026-09-07',
      },
      'parcel-surface': {
        markup: { kind: 'none' }, tier: 'fixed',
        labelRaw: 'Surface',
        sourceUrl: 'https://www.fromjapan.co.jp/en/estimate/',
        checkedOn: '2026-09-07',
      },
      'ems': {
        markup: { kind: 'none' }, tier: 'fixed',
        labelRaw: 'EMS',
        sourceUrl: 'https://www.fromjapan.co.jp/en/estimate/',
        checkedOn: '2026-09-07',
      },
      'parcel-air': {
        markup: { kind: 'none' }, tier: 'fixed',
        labelRaw: 'AirMail',
        sourceUrl: 'https://www.fromjapan.co.jp/en/estimate/',
        checkedOn: '2026-09-07',
      },
    },
    optional: [
      // **Product Protection Plan をここに置いてはいけない。** 原文
      // title_serviceRule_670:「Members agree that all purchased items will be covered by
      // our Product Protection Plan. Use of the Product Protection Plan is mandatory for
      // all items.」＝必須で、その ¥500/点 は既に service-fee として総額に入っている。
      // 任意欄にも並べると同じ費目を二度見せることになる（docs/audit/fees.md §3）。
      {
        key: 'export-clearance', label: 'Export clearance fee', amountYen: EXPORT_DECLARATION_FEE_YEN,
        sourceUrl: EXPORT_DECLARATION_FEE_SOURCE,
        note: 'only over ¥200,000', tier: 'fixed',
      },
      { key: 'konbini', label: 'Convenience store payment', amountYen: 1000, note: 'per payment', tier: 'fixed' },
      { key: 'repack', label: 'Repacking', amountYen: 1500, note: 'from ¥1,500', tier: 'fixed' },
      { key: 'photos', label: 'Extra photos', amountYen: 500, note: '3 photos', tier: 'fixed' },
      // 翻訳ファイル原文（2026-09-07 読了）: help_fee_720「Outsourced Packing」＋
      // help_fee_721「Actual cost」、help_logistics_1730「Items that cannot be packed by
      // FROM JAPAN will require outsourced packing. You must pay the actual cost to have a
      // packing company pack the items.」、title_serviceRule_1870「Items that meet any of the
      // conditions below will require outsourced packing.」
      // **額は「実費」としか書かれていない。**社が決める額ではないので推定もできない。
      // null で出して「—」にする。0 と書けば、掛かる社を掛からない社として見せる。
      {
        key: 'outsourced-packing', label: 'Outsourced packing', amountYen: null,
        note: 'actual cost — charged when FROM JAPAN judges an item too difficult to pack itself,'
          + ' and the amount is never published',
        tier: 'none',
      },
      // 翻訳ファイル原文（2026-09-07 読了）: help_fee_390「Free storage (60 days)」、
      // help_logistics_110「If an item is not instructed for shipping within 60 days, it
      // will be discarded. The storage period cannot be extended.」
      // → **延長そのものが無いので、超過料金は「未取得」ではなく存在しない。**
      // 分かっている 0 は 0 と書く（分かっていない 0 は書かない、の裏返し）。
      {
        key: 'storage', label: 'Storage after 60 free days', amountYen: 0,
        note: 'there is no paid extension — items not shipped within 60 days are discarded',
        tier: 'fixed',
      },
    ],
    // 公式配信の翻訳ファイル（確認日 2026-09-06）。原文:
    //  help_fee_780「For sales with a customs value under 1,000 AUD, 10% of the total order
    //   value (Charge 1(item price) + Charge 2 before GST is added) will be collected as GST.」
    //  help_fee_824「from January 1, 2024, if the total value of the items on the invoice is
    //   less than 400 SGD, 9% of the total cost (Charge 1 + Charge 2 before GST is added)
    //   required to deliver the parcel will be collected as GST on behalf of the customer.」
    //  help_fee_826「GST will not be collected in advance for Surface shipments」
    // → 5社で唯一、AU と SG の**両方**を明記している。Charge 1 + Charge 2 は
    //   商品代＋手数料＋送料の全額なので base は total。
    prepaidImportTax: {
      AU: {
        rate: 0.10, base: 'total', tier: 'fixed',
        note: '10% of Charge 1 + Charge 2 (items, fees and shipping) before GST',
        sourceUrl: 'https://www.fromjapan.co.jp/translate/en_help.txt', checkedOn: '2026-09-06',
      },
      SG: {
        rate: 0.09, base: 'total', tier: 'fixed',
        note: '9% of Charge 1 + Charge 2 before GST — not prepaid on surface mail',
        sourceUrl: 'https://www.fromjapan.co.jp/translate/en_help.txt', checkedOn: '2026-09-06',
      },
    },
    paysUs: true,
    referralNote: 'pays us a % of your purchase',
  },
  {
    id: 'buyee',
    name: 'Buyee',
    url: 'https://buyee.jp/',
    sourceUrl: 'https://buyee.jp/helpcenter/guide/fees?lang=en',
    primarySource: true,
    // ¥500 は「注文ごと」であって「点ごと」ではない。
    // **「Domestic handling ¥500」は存在しない費目だった。**（あれは日本国内の住所へ
    // 届けるサービスの料金）。実体は保証プランで、Standard ¥500（推奨）/ Insured ¥500 /
    // Inspection ¥300 / **Lite ¥0** から注文ごとに選ぶ。既定は推奨の Standard を積む。
    // ショッピングは**店舗ごとに1注文**。原文（購入手数料の項、2026-09-06 取得）:
    // 「Shopping: Order / flat rate ¥500 * Even if multiple purchases are from the same
    //  store, it is a flat rate of ¥500.」
    // オークション・フリマは「One successful bid or purchase / flat rate ¥500」なので出品ごと。
    fee: {
      perOrderYen: 500, protectionPlanPerOrderYen: 500, ordersGroupedByShop: true, tier: 'fixed',
    },
    domesticIncluded: false,
    deposit: null,
    packing: null,
    // 5社で Buyee だけが外れ値。既定で注文ごとに別送し、申請すると無料で同梱する。
    parcelDefault: 'per-order',
    parcelVerified: true,
    consolidationOnRequest: true,
    // 2026-09-07 に公開計算機で実測（`docs/O2-CALCULATOR-RUN.md` フェーズ1、DE 600g）。
    // EMS に Recommended バッジが付くが、既定では選択されていない。SAL は小形・小包とも Shipping not available
    postage: {
      'small-packet-air': {
        markup: { kind: 'none' }, tier: 'fixed',
        labelRaw: 'Small Packet (AIR) / Airmail (without tracking)',
        sourceUrl: 'https://buyee.jp/helpcenter/guide/shipping-fees?lang=en',
        checkedOn: '2026-09-07',
      },
      'parcel-surface': {
        markup: { kind: 'none' }, tier: 'fixed',
        labelRaw: 'International Parcel Post (Surface Mail)',
        sourceUrl: 'https://buyee.jp/helpcenter/guide/shipping-fees?lang=en',
        checkedOn: '2026-09-07',
      },
      'ems': {
        markup: { kind: 'none' }, tier: 'fixed',
        labelRaw: 'EMS / Express Mail Service',
        sourceUrl: 'https://buyee.jp/helpcenter/guide/shipping-fees?lang=en',
        checkedOn: '2026-09-07',
      },
      'parcel-air': {
        markup: { kind: 'none' }, tier: 'fixed',
        labelRaw: 'International Parcel Post (AIR)',
        sourceUrl: 'https://buyee.jp/helpcenter/guide/shipping-fees?lang=en',
        checkedOn: '2026-09-07',
      },
    },
    optional: [
      { key: 'protective-packing', label: 'Protective packing', amountYen: 1500, note: 'per parcel', tier: 'fixed' },
      { key: 'special-packing', label: 'Special packing', amountYen: 2500, note: 'per parcel', tier: 'fixed' },
      // 他社と同じ費目なので同じキー・同じラベルにする（社をまたいで並べるのが任意欄の役目）。
      // 原文:「If you send item(s) valued over 200,000 yen with EMS … a customs clearance
      // commission fee (2,800 yen) will be charged.」
      {
        key: 'export-clearance', label: 'Export clearance fee', amountYen: EXPORT_DECLARATION_FEE_YEN,
        sourceUrl: EXPORT_DECLARATION_FEE_SOURCE,
        note: 'only over ¥200,000', tier: 'fixed',
      },
      // /helpcenter/guide/photo-shoot（2026-09-07 取得）:「Photo Service Fee is 300 yen /
      // $3 per package(5 photos).」
      {
        key: 'photos', label: 'Photo service', amountYen: 300,
        amountFor: (ctx) => 300 * ctx.parcels,
        note: '5 photos per package', tier: 'fixed',
      },
      // https://buyee.jp/helpcenter/guide/storage?lang=en（2026-09-07 取得）。原文の表:
      //   ～10,000g JPY100 / 1 day、10,001g～20,000g JPY200 / 1 day、20,001g～ JPY300 / 1 day
      //   「free for the first 30 days」「Maximum storage period is 90 days」
      // **重量帯は個口の重量で決まる。**我々は梱包後重量を持っているので実額を出せる。
      // 5社で無料期間が最短（30日）なのは Buyee なので、ここを空欄にすると
      // 一番効く社の費目だけが表から消える。
      {
        key: 'storage', label: 'Storage, per day after 30 free days', amountYen: 100,
        amountFor: (ctx) => ctx.parcelGrossG.reduce(
          (a, g) => a + (g <= 10000 ? 100 : g <= 20000 ? 200 : 300), 0,
        ),
        note: '¥100 a day up to 10 kg, ¥200 to 20 kg, ¥300 above — per parcel, max 90 days',
        tier: 'fixed',
      },
    ],
    // 豪州（確認日 2026-09-06）:「Please pay the 10% GST along with the total price of the
    // goods, Buyee's service fee, and other optional fees during handling.」
    // → **この文に送料は挙がっていない。** 徴収は「handling（購入手続き）」の時点で、
    //   国際送料が決まる前。だから base は before-shipping（商品代＋当社手数料）。
    // シンガポール（確認日 2026-09-06）:「Please pay the 9% GST along with the total price of
    // the goods, Buyee's service fee, and other optional fees during handling.」に加え、
    // 課税対象として「the value of goods shown on the invoice, Buyee's service fees,
    // optional service fees, domestic/international shipping costs, consumer tax, etc.」を
    // 挙げている。**こちらは送料が明記されている**ので base は total。
    // 「GST will not be collected in advance for shipments sent to Singapore by Japan Post
    //  by sea」＝航空便（この計算機の EMS）は前徴収の対象。
    prepaidImportTax: {
      AU: {
        rate: 0.10, base: 'before-shipping', tier: 'fixed',
        note: "10% of the goods, Buyee's service fee and optional fees, paid at checkout",
        sourceUrl: 'https://buyee.jp/helpcenter/guide/au-gst?lang=en', checkedOn: '2026-09-06',
      },
      SG: {
        rate: 0.09, base: 'total', tier: 'fixed',
        note: "9% of the goods, Buyee's fees and shipping — air mail only, not sea",
        sourceUrl: 'https://buyee.jp/helpcenter/guide/sg-gst?lang=en', checkedOn: '2026-09-06',
      },
    },
    paysUs: true,
    referralNote: 'pays us a % of your purchase',
  },
  {
    id: 'jauce',
    name: 'Jauce',
    url: 'https://www.jauce.com/',
    // /fee は 404。原文はこちら。
    sourceUrl: 'https://www.jauce.com/japan_auction_detail',
    primarySource: true,
    fee: {
      // 5社で唯一の従価型。ヤフオクは ¥400/点 + 落札価格の 8%。
      // **場外店舗（駿河屋・まんだらけ・ZOZO・HMV・とらのあな等）は ¥1,000 + 8%。**
      perItemYen: 400,
      perItemBySite: {
        'suruga-ya': 1000, mandarake: 1000, zozo: 1000, hmv: 1000, toranoana: 1000,
        'amazon-jp': 1000, other: 1000,
      },
      adValoremRate: 0.08,
      // 楽天と Yahoo!ショッピングはサービス料がベータで無料（原文で現在も有効）。
      freeForSites: ['rakuten', 'yahoo-shopping'],
      freeForSitesTier: 'fixed',
      // 「Banking fee: JPY 300 flat per payment」。出品者×日ごとに1回なので
      // 注文ごとで近似する。公式の計算例（落札50,000→合計54,820）にも入っている。
      bankFeePerOrderYen: 300,
      bankFeeTier: 'fixed',
      tier: 'fixed',
    },
    domesticIncluded: false,
    deposit: {
      flatYen: 40, rate: 0.039, tier: 'unverified',
      // ¥40 の定額が先に乗り、その上で率が gross-up で効くと解釈している。原文未確認。
      note: '¥40 + 3.9% of the payment',
    },
    // 梱包は必須。選べる任意費目ではない。
    packing: { perParcelYen: 300, perKgYen: 120, freeUpToG: 0, mandatory: true, tier: 'fixed' },
    parcelDefault: 'one',
    parcelVerified: true,
    consolidationOnRequest: false,
    // 国際送料は EMS 公表料金そのまま。マークアップ 0 を実測で確認した。
    // 2026-09-07 に公開計算機で実測（`docs/O2-CALCULATOR-RUN.md` フェーズ1、DE 600g）。
    // **2方式しか出さない。**小形包装物・宅配便いずれも無い。SAL は行が残るが Not available
    postage: {
      'ems': {
        markup: { kind: 'none' }, tier: 'fixed',
        labelRaw: 'EMS',
        sourceUrl: 'https://www.jauce.com/price_check.php',
        checkedOn: '2026-09-07',
      },
      'parcel-surface': {
        // **1kg 段ごとに ¥250。3点で一致したので形が決まっている。**
        // 率で見ると 10.0% → 16.1% → 25.5% と動くが、kg段で割ると全部 250。
        // 率で持っていた 10% は 600g でしか合わず、5kg で ¥760 の過少だった。
        markup: { kind: 'per-kg-step', yen: 250 }, tier: 'fixed',
        labelRaw: 'Surface',
        observed: '600g +250 / 2,000g +500 / 5,000g +1,250 → いずれも ¥250/kg段',
        sourceUrl: 'https://www.jauce.com/price_check.php',
        checkedOn: '2026-09-07',
      },
    },
    optional: [
      // 以下すべて japan_auction_detail の原文（2026-09-07 取得）。
      // 「Fragile Packing : JPY 600 per package + JPY 240/kg」。既定の Smart Packing
      // （¥300 + ¥120/kg、必須なので総額に入っている）**の代わり**に選ぶもの。
      // 差額ではなく全額を出し、置き換えであることを note に書く。
      {
        key: 'fragile-packing', label: 'Fragile packing', amountYen: 600,
        amountFor: (ctx) => ctx.parcelGrossG.reduce(
          (a, g) => a + 600 + 240 * Math.ceil(g / 1000), 0,
        ),
        note: '¥600 per package + ¥240/kg, instead of the Smart Packing already in the total',
        tier: 'fixed',
      },
      // 「If the total value of the contents of a package exceeds JPY 200,000, Japan Post
      //  will apply an additional fee of JPY 2,800 for the customs clearance.」
      {
        key: 'export-clearance', label: 'Export clearance fee', amountYen: EXPORT_DECLARATION_FEE_YEN,
        sourceUrl: EXPORT_DECLARATION_FEE_SOURCE,
        note: 'only over ¥200,000', tier: 'fixed',
      },
      // 「it costs 300 yen per auction. … If the auction closing price is 20,000 yen or
      //  higher, we provide this service for the supported categories for free!」
      {
        key: 'photos', label: 'Picture service', amountYen: 300,
        note: '3 photos per auction — free when the auction closed at ¥20,000 or more',
        tier: 'fixed',
      },
      // 「The fee for 'Expedited Shipping' service is JPY 200 + JPY 80/kg.」
      {
        key: 'expedited', label: 'Expedited shipping', amountYen: 200,
        amountFor: (ctx) => ctx.parcelGrossG.reduce(
          (a, g) => a + 200 + 80 * Math.ceil(g / 1000), 0,
        ),
        note: '¥200 + ¥80/kg — dispatched within one business day',
        tier: 'fixed',
      },
      // 「Customized Processing Option … priced at 2,000¥ per hour.」
      {
        key: 'customized-processing', label: 'Customized processing', amountYen: 2000,
        note: '¥2,000 per hour of handling', tier: 'fixed',
      },
      // 「Premium Insurance More peace of mind for only 1.9% over the total amount!」
      // **どの合計に掛かるのかが原文から読めない**（商品代か、送料込みの支払総額か）。
      // 率を勝手に当てて数字を出せば、その額は我々の推測になる。額は出さない。
      {
        key: 'premium-insurance', label: 'Premium insurance', amountYen: null,
        note: '1.9% of "the total amount" — the page does not say which total, so we do not'
          + ' put a number on it',
        tier: 'none',
      },
      // 原文（japan_auction_detail、2026-09-07 取得）:「We store them in our warehouse
      // free for 60 days … After the free period elapses we will charge a monthly storage
      // fee up to 120 days.」**額はページのどこにも無い**（/storage も同じ文面）。
      // 0 と書けば無料という嘘、行ごと省けば費目が無いという嘘。だから null で出す。
      {
        key: 'storage', label: 'Storage, per month after 60 free days', amountYen: null,
        note: 'the company does not publish the amount — free for 60 days, then a monthly'
          + ' fee up to 120 days, after which unclaimed items are discarded',
        tier: 'none',
      },
    ],
    // 豪州（確認日 2026-09-06、https://www.jauce.com/australian-gst）。原文:
    //「If the total amount including the item price, domestic and international
    //  packing/delivery fees, our service fee, and optional fees is less than A$1,000,
    //  GST is collected by JAUCE during the shipment order and sent to ATO.」
    // → ベースは支払総額（total）。
    // **監査時点では Jauce は「未取得」だったが、料金ページの「To customers in Australia」
    //   から辿って一次情報を取れた。** シンガポールの案内は同サイトに無い（/singapore-gst は 404）。
    prepaidImportTax: {
      AU: {
        rate: 0.10, base: 'total', tier: 'fixed',
        note: '10% of the item price, our fees and the packing/delivery fees',
        sourceUrl: 'https://www.jauce.com/australian-gst', checkedOn: '2026-09-06',
      },
    },
    // 報酬の有無を確認できていない。払うと書けないので払わない扱いにする。
    paysUs: false,
    referralNote: null,
  },
];

export const SERVICE_BY_ID = new Map(SERVICES.map((s) => [s.id, s]));
