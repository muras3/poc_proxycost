import type { SiteId, Tier } from './types';

export interface FeeModel {
  /** 点あたりの定額手数料。 */
  perItemYen?: number;
  /** 注文あたりの定額手数料（Buyee）。 */
  perOrderYen?: number;
  /** 商品代に対する率（Jauce の 8%。唯一の従価型）。 */
  adValoremRate?: number;
  /** 注文あたりの国内配送サービス料（Buyee）。 */
  domesticServicePerOrderYen?: number;
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
  emsMarkupTier: Tier;
  optional: OptionalFee[];
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
    fee: { perItemYen: 350, tier: 'fixed' },
    domesticIncluded: true,
    deposit: null,
    packing: { perParcelYen: 500, perKgYen: 150, freeUpToG: 2000, mandatory: true, tier: 'fixed' },
    parcelDefault: 'one',
    parcelVerified: true,
    consolidationOnRequest: false,
    emsMarkup: 0,
    emsMarkupTier: 'estimate',
    optional: [
      { key: 'unpacking', label: 'Unpacking / removing original box', amountYen: 1000, note: 'per parcel', tier: 'fixed' },
      { key: 'konbini', label: 'Convenience store payment', amountYen: 1000, note: 'per payment', tier: 'fixed' },
    ],
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
    // ¥500 と誤っていた履歴がある。ヤフオクは ¥800。
    fee: { perItemYen: 800, tier: 'fixed' },
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
    emsMarkupTier: 'estimate',
    optional: [
      { key: 'photos', label: 'Extra photos', amountYen: 500, note: 'per request', tier: 'fixed' },
      { key: 'repack', label: 'Repacking', amountYen: 1000, note: 'from ¥1,000 to ¥4,000', tier: 'fixed' },
    ],
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
      // 「5%」「$50超10%」は別サービス FROM USA の料金で、日本商品には適用されない。
      paymentInsideJapanYen: 200,
      // 点ごとか注文ごとか原文から読めない。注文ごとと解釈している。
      paymentInsideJapanTier: 'unverified',
      tier: 'fixed',
    },
    domesticIncluded: false,
    deposit: null,
    packing: null,
    parcelDefault: 'one',
    parcelVerified: true,
    consolidationOnRequest: false,
    emsMarkup: 0,
    emsMarkupTier: 'estimate',
    optional: [
      { key: 'protection', label: 'Product Protection Plan', amountYen: 500, note: 'per item', tier: 'fixed' },
      { key: 'export-clearance', label: 'Export clearance fee', amountYen: 2800, note: 'only over ¥200,000', tier: 'fixed' },
      { key: 'konbini', label: 'Convenience store payment', amountYen: 1000, note: 'per payment', tier: 'fixed' },
      { key: 'repack', label: 'Repacking', amountYen: 1500, note: 'from ¥1,500', tier: 'fixed' },
      { key: 'photos', label: 'Extra photos', amountYen: 500, note: '3 photos', tier: 'fixed' },
    ],
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
    fee: { perOrderYen: 500, domesticServicePerOrderYen: 500, tier: 'fixed' },
    domesticIncluded: false,
    deposit: null,
    packing: null,
    // 5社で Buyee だけが外れ値。既定で注文ごとに別送し、申請すると無料で同梱する。
    parcelDefault: 'per-order',
    parcelVerified: true,
    consolidationOnRequest: true,
    emsMarkup: 0,
    emsMarkupTier: 'estimate',
    optional: [
      { key: 'protective-packing', label: 'Protective packing', amountYen: 1500, note: 'per parcel', tier: 'fixed' },
      { key: 'special-packing', label: 'Special packing', amountYen: 2500, note: 'per parcel', tier: 'fixed' },
      { key: 'customs-doc', label: 'Customs clearance handling', amountYen: 2800, note: 'when required', tier: 'fixed' },
    ],
    paysUs: true,
    referralNote: 'pays us a % of your purchase',
  },
  {
    id: 'jauce',
    name: 'Jauce',
    url: 'https://www.jauce.com/',
    sourceUrl: 'https://www.jauce.com/fee',
    primarySource: true,
    fee: {
      // 5社で唯一の従価型。¥400/点 + 落札価格の 8%。
      perItemYen: 400,
      adValoremRate: 0.08,
      // 楽天と Yahoo!ショッピングはサービス料がベータで無料。
      freeForSites: ['rakuten', 'yahoo-shopping'],
      freeForSitesTier: 'unverified',
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
    // 報酬の有無を確認できていない。払うと書けないので払わない扱いにする。
    paysUs: false,
    referralNote: null,
  },
];

export const SERVICE_BY_ID = new Map(SERVICES.map((s) => [s.id, s]));
