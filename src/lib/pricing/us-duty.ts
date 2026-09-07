import { WEIGHT_CATEGORIES } from '@/data/weights';
import type { Item } from './types';

/**
 * **米国の関税を、重量表のカテゴリの範囲で確かめる（T24）。**
 *
 * いまの実装は全品目に一律 12.5% を当てている。その 12.5% の根拠は
 * 2026-07-24 発効の USTR Section 301 措置で、日本産品は「**12.5% net of MFN**」
 * ＝ 実効 `max(MFN率, 12.5%)` になる（docs/audit/taxes.md §1）。
 * つまり **MFN が 12.5% 以下の品目では 12.5% がちょうど正しく、
 * 12.5% を超える品目では 12.5% は下限にすぎない。**
 *
 * 入力に品目分類は無いが、**重量表のカテゴリは既に判定できている**
 * （`Item.weightLineId` → カテゴリ）。そこで「そのカテゴリに入りうる HTS 見出しを
 * 全部引いて、MFN が 12.5% を超えるものが在るか」だけを見る。
 * 見出しを1つに特定する（＝品目を分類する）ことはしない。**それは推測になる。**
 *
 * 税率は 2026-09-07 に `hts.usitc.gov/reststop/search` から引いた MFN 一般税率。
 * 引いた見出しと率をそのまま残す（下の `headings`）ので、次に見る人が同じ引き方を再現できる。
 */
export type UsDutyVerdict =
  /** そのカテゴリに入りうる見出しの MFN が全て 12.5% 以下。`max(MFN, 12.5%)` は 12.5% ちょうど。 */
  | 'at-or-below'
  /** 12.5% を超える見出しが在る。**12.5% は下限であって税率ではない。** */
  | 'can-exceed'
  /** 従価率で書かれていない（リットルあたりの定額など）。`max()` が定義できない。 */
  | 'not-ad-valorem';

export interface UsCategoryDuty {
  /** `WEIGHT_CATEGORIES[].category`。 */
  categoryId: string;
  verdict: UsDutyVerdict;
  /** 実際に引いた見出しと MFN 一般税率。**原文の書き方のまま**（'Free' / '20%' / '3¢/liter'）。 */
  headings: { htsNo: string; general: string; what: string }[];
  /** 画面に出す1句（英語）。verdict の中身を利用者の言葉で言う。 */
  sayEn: string;
}

export const US_DUTY_CHECKED_ON = '2026-09-07';
export const US_HTS_SOURCE_URL = 'https://hts.usitc.gov/';
/** USTR Section 301（2026-07-24 発効）が日本産品に置いた下限。 */
export const US_SECTION_301_FLOOR = 0.125;

export const US_DUTY_BY_CATEGORY: Record<string, UsCategoryDuty> = {
  figures: {
    categoryId: 'figures',
    verdict: 'at-or-below',
    headings: [{ htsNo: '9503.00.00', general: 'Free', what: 'dolls, other toys, scale models' }],
    sayEn: 'checked against HTS 9503.00.00 (toys and scale models), where the MFN rate is Free',
  },
  music: {
    categoryId: 'music',
    verdict: 'at-or-below',
    headings: [
      { htsNo: '8523.80.10', general: 'Free', what: 'phonograph records' },
      { htsNo: '8523.49.30', general: 'Free', what: 'discs for reproducing sound only' },
    ],
    sayEn: 'checked against HTS 8523.80.10 and 8523.49.30 (records and discs), both Free',
  },
  'tcg-singles': {
    categoryId: 'tcg-singles',
    // **どちらの見出しに落ちるかを決める必要が無い。**候補が2つとも Free なので、
    // 分類を我々が選ばなくても答えは同じになる。選べば推測になるので選ばない。
    verdict: 'at-or-below',
    headings: [
      { htsNo: '9504.40.00', general: 'Free', what: 'playing cards' },
      { htsNo: '4911.99.80', general: 'Free', what: 'other printed matter' },
    ],
    sayEn: 'checked against HTS 9504.40.00 and 4911.99.80 — both candidate headings are Free',
  },
  kpop: {
    categoryId: 'kpop',
    headings: [
      { htsNo: '4901.99.00', general: 'Free', what: 'printed books' },
      { htsNo: '4911.91.40', general: 'Free', what: 'printed pictures and photographs' },
      { htsNo: '8523.49.30', general: 'Free', what: 'discs for reproducing sound only' },
      { htsNo: '8513.10.20', general: '12.5%', what: 'flashlights (the nearest heading for a lightstick)' },
    ],
    verdict: 'at-or-below',
    sayEn: 'checked against HTS 4901/4911 (print), 8523.49.30 (discs) and 8513.10.20'
      + ' (the nearest heading for a lightstick, 12.5%) — none above 12.5%',
  },
  'fishing-tackle': {
    categoryId: 'fishing-tackle',
    headings: [
      { htsNo: '9507.10.00', general: '6%', what: 'fishing rods' },
      { htsNo: '9507.30.20', general: '9.2%', what: 'reels valued not over $2.70' },
      { htsNo: '9507.30.60', general: '3.9%', what: 'reels valued over $8.45' },
      { htsNo: '9507.30.80', general: '5.4%', what: 'parts and accessories' },
    ],
    verdict: 'at-or-below',
    sayEn: 'checked against HTS 9507 (rods 6%, reels 3.9–9.2%), all under 12.5%',
  },
  sneakers: {
    categoryId: 'sneakers',
    headings: [
      { htsNo: '6404.11.90', general: '20%', what: 'sports footwear valued over $12/pair' },
      { htsNo: '6402.99.90', general: '20%', what: 'other footwear valued over $12/pair' },
      { htsNo: '6404.11.49', general: '37.5%', what: 'other footwear with textile uppers' },
      { htsNo: '6402.99.31', general: '6%', what: 'other footwear of rubber or plastics' },
    ],
    verdict: 'can-exceed',
    sayEn: 'footwear runs from 6% to 37.5% in HTS chapter 64 depending on the sole, the upper'
      + ' and the price per pair — none of which we know',
  },
  'used-luxury': {
    categoryId: 'used-luxury',
    headings: [
      { htsNo: '4202.22.89', general: '17.6%', what: 'handbags with an outer surface of textile' },
      { htsNo: '4202.22.15', general: '16%', what: 'handbags with an outer surface of plastic sheeting' },
      { htsNo: '4202.21.90', general: '9%', what: 'leather handbags valued over $20' },
      { htsNo: '9102.11.25', general: '40¢ each + 8.5% on the case + …', what: 'wrist watches' },
    ],
    verdict: 'can-exceed',
    sayEn: 'handbags run 9% to 17.6% by material in HTS 4202, and watches are charged partly'
      + ' per piece — the material and the make decide it, and we know neither',
  },
  'sports-goods': {
    categoryId: 'sports-goods',
    headings: [
      { htsNo: '9506.99.60', general: '4%', what: 'other sports equipment' },
      { htsNo: '6211.43.10', general: '16%', what: "women's garments of man-made fibres" },
      { htsNo: '6204.53.30', general: '16%', what: 'skirts and divided skirts of synthetic fibres' },
    ],
    verdict: 'can-exceed',
    sayEn: 'the equipment sits near 4% in HTS 9506, but the uniforms, hakama and obi in this'
      + ' category are apparel, and apparel runs to 16% and beyond',
  },
  'food-tea-sake': {
    categoryId: 'food-tea-sake',
    headings: [
      { htsNo: '2206.00.45', general: '3¢/liter', what: 'rice wine or sake' },
      { htsNo: '2206.00.90', general: '4.2¢/liter', what: 'other fermented beverages' },
    ],
    verdict: 'not-ad-valorem',
    sayEn: 'drinks are charged by the litre in HTS 2206, not as a percentage, so a percentage'
      + ' cannot be read off against the 12.5% floor',
  },
};

/** 重量表のライン id からカテゴリ id を引く。**表の1か所から引く。書き写さない。** */
export function categoryIdOfLine(lineId: string): string | null {
  for (const cat of WEIGHT_CATEGORIES) {
    for (const line of cat.lines) if (line.id === lineId) return cat.category;
  }
  return null;
}

/** カートの中で、重量表が分類できたカテゴリ（重複なし・表の順）。 */
export function categoryIdsOf(items: Item[]): string[] {
  const hit = new Set(
    items.map((i) => (i.weightLineId ? categoryIdOfLine(i.weightLineId) : null))
      .filter((c): c is string => c != null),
  );
  return WEIGHT_CATEGORIES.map((c) => c.category).filter((c) => hit.has(c));
}

export interface UsDutyReading {
  /** 12.5% がそのカテゴリの実際の率だと言い切れるか。 */
  verdict: UsDutyVerdict | 'unclassified';
  /** 内訳の note の**後半**（率のあとに続く句）。率は `countries.ts` の値から出す。 */
  noteEn: string;
  /**
   * **12.5% が下限にすぎないと、こちらで確かめられた**か。
   * 分類できなかった籠はここに入れない——「分からない」は「超えると分かった」ではない。
   * これが true のときだけ、行の確度を我々の仮定（estimate）に落とす。
   */
  knownFloor: boolean;
}

/**
 * カートの中身から、12.5% をどう言うべきかを決める。
 *
 * **一番弱い判定に合わせる。**カートに1点でも「12.5% を超えうる」品が入っていれば、
 * その籠の関税は下限でしかない。強いほうに合わせると、混ざった籠で嘘になる。
 * 分類できなかった品しか無い籠は、これまでどおり「仮定」と名乗る。
 */
export function readUsDuty(items: Item[]): UsDutyReading {
  // **1点ずつ見る。**カテゴリの種類数と点数を比べると、同じカテゴリの2点が
  // 「1点しか分類できなかった」に見えて、分類できている籠まで「仮定」に落ちる。
  const perItem = items.map((i) => {
    const id = i.weightLineId ? categoryIdOfLine(i.weightLineId) : null;
    return id ? US_DUTY_BY_CATEGORY[id] ?? null : null;
  });
  const unclassified = items.length === 0 || perItem.some((d) => d == null);
  const ids = categoryIdsOf(items);
  const known = ids.map((id) => US_DUTY_BY_CATEGORY[id]).filter((d): d is UsCategoryDuty => !!d);

  const weak = known.find((d) => d.verdict === 'can-exceed')
    ?? known.find((d) => d.verdict === 'not-ad-valorem');
  if (weak) {
    return {
      verdict: weak.verdict,
      knownFloor: true,
      noteEn: 'but that is only the floor Section 301 puts on goods of Japan, not the rate for'
        + ` this basket: ${weak.sayEn}. Your bill can be higher than this line.`,
    };
  }
  if (known.length && !unclassified) {
    return {
      verdict: 'at-or-below',
      knownFloor: false,
      noteEn: 'the duty is the greater of the MFN rate and the Section 301 rate on goods of'
        + ` Japan, and ${known.map((d) => d.sayEn).join('; ')} — so this is the rate here,`
        + ' not a floor.',
    };
  }
  // 分類できない品が混ざっている籠。**「12.5% を超えると分かった」わけではない**ので、
  // 確度は据え置き（この 12.5% の出どころは USTR の措置であって、我々の仮定ではない）。
  // 仮定であることは note に書く——T24 が求めているのはそこまで。
  return {
    verdict: 'unclassified',
    knownFloor: false,
    noteEn: 'our assumption. It is the floor Section 301 puts on goods of Japan; we could not'
      + ' place every item in this basket against a tariff heading, and headings above it exist.',
  };
}
