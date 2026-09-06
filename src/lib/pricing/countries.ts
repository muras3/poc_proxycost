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
