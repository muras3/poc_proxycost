import type { CountryCode, SiteId } from '@/lib/pricing/types';

/**
 * /sources が「実測」として公開している数字。**compare() の出力そのものであって、
 * 手で書いた値ではない。**
 *
 * ここを別ファイルに出しているのは、`measured.test.ts` が毎回 compare() で測り直して
 * 突き合わせられるようにするため。料金・EMS 料金表・為替のどれかを直すと、この定数を
 * 直すまでテストが赤くなる。
 *
 * **この仕掛けが無かったせいで一度嘘が出た。** 為替を ECB の実値へ直した（4186822）とき
 * この表を直し忘れ、公開ページが ¥58 古い総額を「2026-09-06 の実測」として出していた
 * （US の通関手数料 $9.35 が ¥150/USD のままだった）。
 */

/** 測ったカート。**画面の文章もこの形を説明している。** */
export const MEASURED_BASKET = {
  units: 5,
  priceYen: 3000,
  site: 'yahoo-auctions' as SiteId,
  country: 'US' as CountryCode,
  /** 重量表が無い品に入る既定の推定値ではなく、この測定で固定した重量。 */
  weightG: 600,
};

/**
 * **重量の節だけ宛先がカナダ。**この節の主張は「重量の推定を外すと1位が替わる」で、
 * 替わる2社は Neokyo と FROM JAPAN。**Neokyo は米国宛に日本郵便を売っていない**
 * （自社の見積画面が EMS・航空・船便のすべてに
 * "Not available or suspended in your country." を返す。2026-09-07 確認）ため、
 * 米国では片側が盤面に存在せず、200 g から 3,000 g まで FROM JAPAN が動かない。
 *
 * **これは「米国では重量を気にしなくていい」という良い知らせではない。**
 * 選べる社が1つ減っただけで、重量が総額に効く度合い（200 g → 3,000 g で +97%）は
 * 米国でも変わらない。現象が観測できる国で見せるほうが正直なので、
 * 同じ形が同じ交差重量で成り立つカナダで測る。
 */
export const WEIGHT_SHIFT_COUNTRY = 'CA' as CountryCode;

/** 確度ごとの内訳（MEASURED_BASKET の1位の行）。tier は Tier と同じ意味。 */
export interface ConfidenceSlice {
  tier: 'fixed' | 'estimate' | 'unverified';
  what: string;
  yen: number;
  share: string;
}

/**
 * 合計は米国・600 g の1位の行の総額と一致する。片方だけ直すとテストが落ちる。
 * **1位が Neokyo から FROM JAPAN に替わったので額も替わった**（Neokyo が米国宛に
 * 日本郵便を売っていないため。`WEIGHT_SHIFT_COUNTRY` の説明を参照）。
 * 割合はほぼ動いていない——欠けているのは1社であって、確度の構造ではない。
 */
export const CONFIDENCE_SPLIT: ConfidenceSlice[] = [
  {
    tier: 'fixed',
    what: 'Published price lists and the Japan Post EMS table — every amount is printed somewhere.'
      + ' The weight we look the EMS rate up with is still ours',
    yen: 31200, share: '84%',
  },
  {
    tier: 'estimate',
    what: 'The fee certainly applies, the amount is our assumption — domestic postage inside Japan',
    yen: 4000, share: '11%',
  },
  {
    tier: 'unverified',
    what: 'Second-hand figures — US duty 12.5%. The USPS $9.35 used to sit here;'
      + ' it is now read off Notice 123 itself, and is zero inside the prepayment band',
    yen: 1875, share: '5%',
  },
];

/** 同じカートを英国へ送ったときの「公表」対「推論」。米国より公表側に寄る（VAT が公表税率）。 */
export const GB_SPLIT = { publishedShare: '86%', inferredShare: '14%' };

/**
 * 1点あたりの重量だけを動かしたときの1位と総額（**カナダ**。理由は
 * `WEIGHT_SHIFT_COUNTRY`）。delta は 600g の総額に対する比。
 * **1位が重量で替わることの根拠。**
 */
export interface WeightShiftRow {
  /** 画面表示。 */
  weight: string;
  perItemG: number;
  totalYen: number;
  delta: string;
  cheapest: string;
  last: string;
}

export const WEIGHT_SHIFT: WeightShiftRow[] = [
  { weight: '200 g', perItemG: 200, totalYen: 30754, delta: '−17%', cheapest: 'Neokyo', last: 'Buyee, default' },
  { weight: '600 g (our estimate)', perItemG: 600, totalYen: 37062, delta: '0%', cheapest: 'Neokyo', last: 'Buyee, default' },
  { weight: '1,500 g', perItemG: 1500, totalYen: 52111, delta: '+41%', cheapest: 'Neokyo', last: 'Buyee, default' },
  { weight: '3,000 g', perItemG: 3000, totalYen: 73385, delta: '+98%', cheapest: 'FROM JAPAN', last: 'Buyee, default' },
];

/**
 * 1位が入れ替わる重量（点数ごと、25g 刻みの走査）。画面の文章がこの3つを名指しする。
 * **重量は米国で測ったときと1gも変わっていない。**測る国だけがカナダに移った
 * （`WEIGHT_SHIFT_COUNTRY`）。3点・5点は独・英・仏でも同じ重量で交差する。
 */
export const CROSSOVER_G: Record<number, number> = { 2: 1150, 3: 1325, 5: 1625 };

/**
 * 7 カ国それぞれの `rankStable`（`MEASURED_BASKET` の条件、既定の推定重量 600 g）。
 * **以前ここに `rankStable` の実測値は無かった。**README は「7 カ国すべてで false」と
 * 手で書いており、2026-09-06 以降の料金修正（Neokyo の国内送料・FROM JAPAN の ¥200・
 * ZenMarket のサイト別・輸出通関の総額化など）で値が動いたのに誰も測り直していなかった。
 * 実際は US・AU・SG が true。この表を足して `measured.test.ts` に縛ったので、
 * 今後は料金を直して値が変わればテストが落ちる。
 */
export interface RankStabilityRow {
  country: CountryCode;
  rankStable: boolean;
  /** true の国だけ埋まる。compare() の rankStabilityNote から、社名の分かる文だけ転記。 */
  staysCheapest: string | null;
}

export const RANK_STABILITY: RankStabilityRow[] = [
  { country: 'US', rankStable: true, staysCheapest: 'FROM JAPAN' },
  { country: 'GB', rankStable: false, staysCheapest: null },
  { country: 'DE', rankStable: false, staysCheapest: null },
  { country: 'FR', rankStable: false, staysCheapest: null },
  { country: 'AU', rankStable: true, staysCheapest: 'Neokyo' },
  { country: 'CA', rankStable: false, staysCheapest: null },
  { country: 'SG', rankStable: true, staysCheapest: 'Neokyo' },
];

export const yen = (n: number) => `¥${n.toLocaleString('en-US')}`;
