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

/** 確度ごとの内訳（MEASURED_BASKET の1位の行）。tier は Tier と同じ意味。 */
export interface ConfidenceSlice {
  tier: 'fixed' | 'estimate' | 'unverified';
  what: string;
  yen: number;
  share: string;
}

/** 合計は WEIGHT_SHIFT の 600g 行と一致する。片方だけ直すとテストが落ちる。 */
export const CONFIDENCE_SPLIT: ConfidenceSlice[] = [
  {
    tier: 'fixed',
    what: 'Published price lists and the Japan Post EMS table — every amount is printed somewhere.'
      + ' The weight we look the EMS rate up with is still ours',
    yen: 30250, share: '84%',
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
 * 1点あたりの重量だけを動かしたときの1位と総額（米国）。
 * delta は 600g の総額に対する比。**1位が重量で替わることの根拠。**
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
  { weight: '200 g', perItemG: 200, totalYen: 29725, delta: '−18%', cheapest: 'Neokyo', last: 'Buyee, default' },
  { weight: '600 g (our estimate)', perItemG: 600, totalYen: 36125, delta: '0%', cheapest: 'Neokyo', last: 'Buyee, default' },
  { weight: '1,500 g', perItemG: 1500, totalYen: 51425, delta: '+42%', cheapest: 'Neokyo', last: 'Buyee, default' },
  { weight: '3,000 g', perItemG: 3000, totalYen: 73075, delta: '+102%', cheapest: 'FROM JAPAN', last: 'Buyee, default' },
];

/** 1位が入れ替わる重量（点数ごと、25g 刻みの走査）。画面の文章がこの3つを名指しする。 */
export const CROSSOVER_G: Record<number, number> = { 2: 1150, 3: 1325, 5: 1625 };

export const yen = (n: number) => `¥${n.toLocaleString('en-US')}`;
