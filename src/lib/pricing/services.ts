import type { CountryCode, SiteId, Tier } from './types';

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

export interface OptionalFee {
  key: string;
  label: string;
  amountYen: number;
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
  /** 画面に出す1行（英語）。その社の原文の言い方に寄せる。 */
  note: string;
  tier: Tier;
  sourceUrl: string;
  /** 一次情報を当たった日。 */
  checkedOn: string;
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
  /** 国際送料のマークアップ。0 = EMS 公表料金そのまま。 */
  emsMarkup: number;
  /**
   * **マークアップの確度であって、重量の確度ではない。**
   * EMS の料金表そのものは日本郵便の公表値（一次情報）なので、EMS 行の tier は
   * 「その社が公表額をそのまま転嫁しているか」だけを表す。重量が推定であることは
   * Items 行の重量 tier と `Row.approximate` が別に持つ（docs/COMPLETENESS.md T16）。
   *   fixed      … その社自身が「上乗せしない」と書いている
   *   unverified … 実請求（二次情報）が公表額と一致した。社の記述は無い
   *   estimate   … 我々の仮定。裏付けが無いか、実請求と食い違う
   */
  emsMarkupTier: Tier;
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

export const SERVICES_CHECKED_ON = '2026-09-06';

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
    emsMarkup: 0,
    // 原文（fees、2026-09-06 取得）:「We do not charge any Neokyo fee on shipping cost,
    // you pay the actual provider price.」— 社自身が上乗せ無しと書いている。
    emsMarkupTier: 'fixed',
    optional: [
      { key: 'unpacking', label: 'Unpacking / removing original box', amountYen: 1000, note: 'per parcel', tier: 'fixed' },
      { key: 'konbini', label: 'Convenience store payment', amountYen: 1000, note: 'per payment', tier: 'fixed' },
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
      flatYen: 0, rate: 0.035, tier: 'fixed',
      // ¥10,000 をチャージするには 10000/(1-0.035) = ¥10,362.7 が必要。
      // 台湾の利用者が公開した実請求 ¥10,363 と1円差で一致（docs/DESIGN-NOTES.md §3）。
      note: '3.5% of the whole payment',
    },
    packing: null,
    parcelDefault: 'one',
    parcelVerified: false,
    consolidationOnRequest: false,
    emsMarkup: 0,
    // **上げられない。** 料金ページ（Arquivo.pt 2025-11-27 の写し）は国際送料を
    // 「Always pay」と書くだけで、公表額そのままとは書いていない。実請求は
    // 1件が公表額と完全一致（R2 ¥2,700）、1件はどの段とも一致しない（R3 ¥4,021）。
    // 一致しない実例がある以上、これは我々の仮定である（docs/audit/reality.md §3.4）。
    emsMarkupTier: 'estimate',
    optional: [
      { key: 'photos', label: 'Extra photos', amountYen: 500, note: 'per request', tier: 'fixed' },
      { key: 'repack', label: 'Repacking', amountYen: 1000, note: 'from ¥1,000 to ¥4,000', tier: 'fixed' },
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
    emsMarkup: 0,
    // 会員ランクで国際送料が %OFF になると自社の翻訳ファイルに書いてあるが、率が
    // テンプレ変数のままで読めない（docs/audit/fees.md §3）。上乗せ 0 は我々の仮定。
    emsMarkupTier: 'estimate',
    optional: [
      { key: 'protection', label: 'Product Protection Plan', amountYen: 500, note: 'per item', tier: 'fixed' },
      { key: 'export-clearance', label: 'Export clearance fee', amountYen: 2800, note: 'only over ¥200,000', tier: 'fixed' },
      { key: 'konbini', label: 'Convenience store payment', amountYen: 1000, note: 'per payment', tier: 'fixed' },
      { key: 'repack', label: 'Repacking', amountYen: 1500, note: 'from ¥1,500', tier: 'fixed' },
      { key: 'photos', label: 'Extra photos', amountYen: 500, note: '3 photos', tier: 'fixed' },
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
    emsMarkup: 0,
    // 社の記述は無い（料金ページは見積りツールに飛ばすだけ）。根拠は実請求1件で、
    // イタリア宛 9kg の国際送料 ¥15,300 が当時の第3地帯 9.0kg 段と1円違わず一致した
    // （docs/audit/reality.md R4）。**一次情報ではないので点線で描く。**
    emsMarkupTier: 'unverified',
    optional: [
      { key: 'protective-packing', label: 'Protective packing', amountYen: 1500, note: 'per parcel', tier: 'fixed' },
      { key: 'special-packing', label: 'Special packing', amountYen: 2500, note: 'per parcel', tier: 'fixed' },
      { key: 'customs-doc', label: 'Customs clearance handling', amountYen: 2800, note: 'when required', tier: 'fixed' },
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
    emsMarkup: 0,
    emsMarkupTier: 'fixed',
    optional: [],
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
