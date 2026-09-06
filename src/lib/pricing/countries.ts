import type { CountryCode, Tier } from './types';

export interface Country {
  name: string;
  ccy: string;
  /** 課税ベース。CIF = 商品+送料、FOB = 商品のみ。 */
  base: 'CIF' | 'FOB';
  /** 免税限度（現地通貨）。 */
  dutyFreeLimit: number;
  /** 限度以下で1点あたり定額の関税がかかる国（DE / FR の少額課税）。 */
  flatDutyPerItem?: number;
  /** null = 税率を取得できていない。0 と書くな。 */
  dutyRate: number | null;
  dutyTier: Tier;
  vatRate: number | null;
  vatFreeLimit: number | null;
  /** 小包ごとの通関手数料（現地通貨）。null = 未取得。 */
  clearanceFeePerParcel: number | null;
  clearanceCcy: string;
  clearanceTier: Tier;
  notes: string[];
  sourceUrl: string | null;
  /**
   * 関税の事前納付が要る国と帯。**利用料は発生するが額が公表されていない。**
   * 額を持っていないので、この費目は必ず tier none（null）で出す。0 とは書かない。
   */
  dutyPrepayment?: {
    /** 内容品価格（現地通貨）がこの額以下の郵便物で事前納付が必要。超えると不要。 */
    upTo: number;
    /** 画面のラベル。**excluded にそのまま並ぶので、これ自体が開示文になる。** */
    label: string;
    note: string;
    sourceUrl: string;
    checkedOn: string;
  };
}

// 各国の税。null = 未取得（画面では「—」。0 とは書かない）。
// dutyTier / clearanceTier が 'unverified' の値は二次情報で、原典に当たれていない。
export const COUNTRIES: Record<CountryCode, Country> = {
  US: {
    name: 'United States', ccy: 'USD', base: 'FOB',
    dutyFreeLimit: 0, dutyRate: 0.125, dutyTier: 'unverified',
    vatRate: null, vatFreeLimit: null,
    clearanceFeePerParcel: 9.35, clearanceCcy: 'USD', clearanceTier: 'unverified',
    notes: ['de_minimis_suspended'],
    sourceUrl: 'https://hts.usitc.gov/',
    // 日本郵便は 2026-04-14 から米国宛の引受を再開したが、条件として
    // 「差出人自身が CBP 認証事業者のアプリで関税を事前納付すること」を課している。
    // 内容品価格の帯は 2026-07-24 に 800 → 2,500 USD へ引き上げられた。
    // 販売品（この計算機が扱うもの）は 100 USD 以下でも事前納付が要る
    // （100 USD 以下で不要なのは書類と個人間の贈答品だけ）。
    // 原文（英語版）:「Zonos is currently the only certified company we recommend.
    // You will be charged a fee as designated by Zonos when you pay duties using its app.」
    // — **利用料が発生するとだけ書いてあり、額はどこにも無い。**
    // 各社（代行）も、この利用料をいくら転嫁するか公表していない。だから null で出す。
    dutyPrepayment: {
      upTo: 2500,
      label: 'US import prepayment (Zonos) fee — not published',
      note: 'Japan Post accepts US-bound mail only if the sender prepays duty through'
        + ' Zonos, and says Zonos charges a fee for it. Nobody publishes the amount.',
      sourceUrl: 'https://www.post.japanpost.jp/service/send/oversea/information/2026/0413_01_en.html',
      checkedOn: '2026-09-06',
    },
  },
  GB: {
    name: 'United Kingdom', ccy: 'GBP', base: 'CIF',
    dutyFreeLimit: 135, dutyRate: null, dutyTier: 'none',
    vatRate: 0.20, vatFreeLimit: 0,
    clearanceFeePerParcel: 8, clearanceCcy: 'GBP', clearanceTier: 'unverified',
    notes: [],
    sourceUrl: 'https://www.gov.uk/goods-sent-from-abroad',
  },
  DE: {
    name: 'Germany', ccy: 'EUR', base: 'CIF',
    dutyFreeLimit: 150, flatDutyPerItem: 3, dutyRate: null, dutyTier: 'fixed',
    vatRate: 0.19, vatFreeLimit: 0,
    clearanceFeePerParcel: null, clearanceCcy: 'EUR', clearanceTier: 'none',
    notes: [],
    sourceUrl: 'https://www.zoll.de/EN/Private-individuals/private-individuals_node.html',
  },
  FR: {
    name: 'France', ccy: 'EUR', base: 'CIF',
    dutyFreeLimit: 150, flatDutyPerItem: 3, dutyRate: null, dutyTier: 'fixed',
    vatRate: 0.20, vatFreeLimit: 0,
    clearanceFeePerParcel: null, clearanceCcy: 'EUR', clearanceTier: 'none',
    notes: [],
    sourceUrl: 'https://www.douane.gouv.fr/',
  },
  AU: {
    name: 'Australia', ccy: 'AUD', base: 'FOB',
    dutyFreeLimit: 1000, dutyRate: null, dutyTier: 'none',
    vatRate: 0.10, vatFreeLimit: 0,
    clearanceFeePerParcel: null, clearanceCcy: 'AUD', clearanceTier: 'none',
    notes: [],
    sourceUrl: 'https://www.abf.gov.au/importing-exporting-and-manufacturing/importing/cost-of-importing-goods',
  },
  CA: {
    name: 'Canada', ccy: 'CAD', base: 'FOB',
    dutyFreeLimit: 20, dutyRate: null, dutyTier: 'none',
    vatRate: 0.05, vatFreeLimit: 20,
    clearanceFeePerParcel: null, clearanceCcy: 'CAD', clearanceTier: 'none',
    notes: ['province_tax_not_included'],
    sourceUrl: 'https://www.cbsa-asfc.gc.ca/travel-voyage/postal-postale-eng.html',
  },
  SG: {
    name: 'Singapore', ccy: 'SGD', base: 'CIF',
    dutyFreeLimit: Number.POSITIVE_INFINITY, dutyRate: 0, dutyTier: 'fixed',
    vatRate: 0.09, vatFreeLimit: 400,
    clearanceFeePerParcel: null, clearanceCcy: 'SGD', clearanceTier: 'none',
    notes: [],
    sourceUrl: 'https://www.customs.gov.sg/individuals/importing-personal-goods/',
  },
};

export const COUNTRY_CODES = Object.keys(COUNTRIES) as CountryCode[];
