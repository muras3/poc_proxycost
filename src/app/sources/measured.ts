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
// F07（2026-09-12、payment-fee-rates）: 1位が Neokyo から FROM JAPAN に替わり
// （FROM JAPAN が新たに計上した3.5%の推定 deposit 込みでも、Neokyo に同じ3.5%が
// 乗った分だけ Neokyo が押し上げられて逆転した）、estimate の内訳（国内送料 ¥4,000 +
// FROM JAPAN の推定 deposit ¥1,277）が増えた。fixed（EMS等）・unverified（米国関税）は
// 変わらない。
export const CONFIDENCE_SPLIT: ConfidenceSlice[] = [
  {
    tier: 'fixed',
    what: 'Published price lists and the Japan Post EMS table — every amount is printed somewhere.'
      + ' The weight we look the EMS rate up with is still ours',
    yen: 31200, share: '81%',
  },
  {
    tier: 'estimate',
    what: 'The fee certainly applies, the amount is our assumption — domestic postage inside Japan,'
      + ' plus a deposit fee FROM JAPAN does not publish (we use the 3.5% ZenMarket does publish)',
    yen: 5277, share: '14%',
  },
  {
    tier: 'unverified',
    what: 'Second-hand figures — US duty 12.5%. The USPS $9.35 used to sit here;'
      + ' it is now read off Notice 123 itself, and is zero inside the prepayment band',
    yen: 1875, share: '5%',
  },
];

/**
 * 7 カ国それぞれの1位の行を確度(tier)ごとに合計したもの。**旧 README にあった
 * 「7カ国合計 ¥263,981・公表側84%（¥221,079）」は、コードのどこからも
 * 導けない手書きの値だった**（`src/` に `221079` 等の数字は存在しない）。
 * `CONFIDENCE_SPLIT`（米国1カ国の内訳）は `measured.test.ts` で縛られていたが、
 * 7カ国の集計は縛られておらず、`CONFIDENCE_SPLIT` と同じ形の事故
 * （為替を直し忘れて古い総額を「実測」と名乗った、というくだり参照）を
 * 集計の側で静かに起こしていた。ここに export してテストで縛ったので、
 * 以後は費目・為替を直せば自動で値が動く。
 *
 * **`GB_SPLIT`（旧: GB単体の公表/推定の割合）はここに統合し、独立した export
 * としては廃止した。**同じ「GBの公表側の割合」を2箇所に export すると、
 * この集計そのものが防ごうとしている「同じ数字が2箇所にあってずれる」を
 * 自分で再現するため。GBの割合は下の配列から `country === 'GB'` で引く。
 */
export interface CountryConfidenceRow {
  country: CountryCode;
  totalYen: number;
  fixedYen: number;
  estimateYen: number;
  unverifiedYen: number;
  /** fixedYen / totalYen を四捨五入した表示用の割合。 */
  publishedShare: string;
}

// F07（2026-09-12、payment-fee-rates）: 全7カ国で1位の顔ぶれは変わっていない
// （US は FROM JAPAN、他6カ国は Neokyo のまま）。動いたのは総額だけ——1位の社が
// 新たに計上した推定 deposit（3.5%、Neokyo・FROM JAPAN とも会社の公表値ではない）
// ぶん estimate が増え、総額が上がった。
export const CONFIDENCE_SPLIT_BY_COUNTRY: CountryConfidenceRow[] = [
  { country: 'US', totalYen: 38352, fixedYen: 31200, estimateYen: 5277, unverifiedYen: 1875, publishedShare: '81%' },
  { country: 'GB', totalYen: 41298, fixedYen: 34430, estimateYen: 5177, unverifiedYen: 1691, publishedShare: '83%' },
  { country: 'DE', totalYen: 43912, fixedYen: 34649, estimateYen: 7901, unverifiedYen: 1362, publishedShare: '79%' },
  { country: 'FR', totalYen: 44329, fixedYen: 36428, estimateYen: 7901, unverifiedYen: 0, publishedShare: '82%' },
  { country: 'AU', totalYen: 35181, fixedYen: 29950, estimateYen: 5231, unverifiedYen: 0, publishedShare: '85%' },
  // **外部レビュー⑤-b（2026-09-11）で CA の GST・州税ベースを直し**（国際送料は
  // 除くが、国内送料は含む——CBSA Memorandum D13-3-3/D13-3-4 の duty paid value
  // に揃えた）、**外部レビュー2回目 A-6（2026-09-11）で関税のベースも同じ
  // `items + dom` に揃えた**（以前は関税だけ `items` のみで、GST・州税と
  // ベースが食い違っていた。`compare.ts` の `taxLines` 参照）ので、CA の総額が
  // 動いた。
  { country: 'CA', totalYen: 37517, fixedYen: 30546, estimateYen: 6971, unverifiedYen: 0, publishedShare: '81%' },
  { country: 'SG', totalYen: 31954, fixedYen: 24500, estimateYen: 7454, unverifiedYen: 0, publishedShare: '77%' },
];

/**
 * `CONFIDENCE_SPLIT_BY_COUNTRY` の7カ国合計。**旧 README の ¥263,981 / 84% に
 * 相当するが、値をそこに合わせにいっていない。**いま測ればこの値になる、というだけ。
 * 今回の再測定でも当時と違う値が出た（輸出通関の総額化・保管料の追加・ZenMarket の
 * 確度変更など、この間に入った費目修正の積み重ねのため）。
 */
export interface ConfidenceTotal {
  totalYen: number;
  fixedYen: number;
  estimateYen: number;
  unverifiedYen: number;
  fixedShare: string;
  estimateShare: string;
  unverifiedShare: string;
}

export const CONFIDENCE_TOTAL: ConfidenceTotal = {
  // F07（2026-09-12、payment-fee-rates）: 7カ国それぞれの1位が新たに推定 deposit を
  // 負ったぶん（fixed は動かず、estimate だけ ¥37,578 → ¥45,912 に増えた）、
  // 7カ国合計が ¥264,209 → ¥272,543 に動いた。
  totalYen: 272543,
  fixedYen: 221703,
  estimateYen: 45912,
  unverifiedYen: 4928,
  fixedShare: '81%',
  estimateShare: '17%',
  unverifiedShare: '2%',
};

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

// ⑤-b（外部レビュー、2026-09-11）で CA の GST・州税ベースを直し、外部レビュー
// 2回目 A-6（2026-09-11）で関税のベースもそれに揃えた（`items + dom`）ので、
// 4つの重量すべてで総額が動いた（並び・交差重量は動いていない）。
// F07（2026-09-12、payment-fee-rates）: Neokyo が新たに推定 deposit（3.5%）を負い、
// 総額が全4重量で上がった（並び・交差重量・cheapest/last の顔ぶれは動いていない）。
export const WEIGHT_SHIFT: WeightShiftRow[] = [
  { weight: '200 g', perItemG: 200, totalYen: 31662, delta: '−16%', cheapest: 'Neokyo', last: 'Buyee, default' },
  { weight: '600 g (our estimate)', perItemG: 600, totalYen: 37517, delta: '0%', cheapest: 'Neokyo', last: 'Buyee, default' },
  { weight: '1,500 g', perItemG: 1500, totalYen: 51507, delta: '+37%', cheapest: 'Neokyo', last: 'Buyee, default' },
  { weight: '3,000 g', perItemG: 3000, totalYen: 71144, delta: '+90%', cheapest: 'FROM JAPAN', last: 'Buyee, default' },
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
  /**
   * P1-2（コーディネーター判断3、2026-09-11）: 比較可能な全社がおすすめ枠か同等の
   * 印に収まっていて、どの社が安いか区別できない状態か。**このとき `rankStable`
   * は必ず false**——「安定」と「判定不能」を同じ `true` に潰さない。
   */
  rankIndeterminate: boolean;
  /** true の国だけ埋まる。compare() の rankStabilityNote から、社名の分かる文だけ転記。 */
  staysCheapest: string | null;
}

export const RANK_STABILITY: RankStabilityRow[] = [
  // US: P1-4（外部レビュー、オーナー確定 2026-09-11）で「安定」に変わった。
  // 1位（FROM JAPAN）の総額はいまも上限不明だが、それは FROM JAPAN 固有の
  // 未知（外注梱包）——米国の Zonos 前払い利用料・連邦売上税のような「社を
  // 問わず同じようにかかる共通の未知」は順位判定（`Row.rankHigh`）から無視する
  // ようにしたので、ZenMarket が明確な2位として枠に残り、判定不能ではなくなった。
  {
    country: 'US', rankStable: true, rankIndeterminate: false,
    staysCheapest: 'FROM JAPAN and ZenMarket',
  },
  { country: 'GB', rankStable: false, rankIndeterminate: false, staysCheapest: null },
  { country: 'DE', rankStable: false, rankIndeterminate: false, staysCheapest: null },
  { country: 'FR', rankStable: false, rankIndeterminate: false, staysCheapest: null },
  { country: 'AU', rankStable: true, rankIndeterminate: false, staysCheapest: 'Neokyo' },
  { country: 'CA', rankStable: false, rankIndeterminate: false, staysCheapest: null },
  { country: 'SG', rankStable: true, rankIndeterminate: false, staysCheapest: 'Neokyo' },
];

export const yen = (n: number) => `¥${n.toLocaleString('en-US')}`;
