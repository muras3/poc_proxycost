// 為替は固定値。ライブ取得は外部依存＝障害点なので使わない。
// 取得は scripts/fx-fetch.ts（手で走らせる）でやり、ここには結果だけを転記する。
//
// **画面に出す日付は、この定数から来なければならない。**以前ここは実装日を
// RATES_AS_OF に書いただけで転記しておらず、画面の "fixed 09-06" が
// 虚偽の出典表示になっていた（docs/audit/gaps.md G3、最大 11.9% の陳腐化）。
//
// 出典に欧州中央銀行(ECB) の euro foreign exchange reference rates を選んだ理由:
//   - 発行元が中央銀行そのもの。まとめサイトでも為替APIの再配布でもない。
//   - URL が固定で機械可読(XML)。スクレイピング前提の HTML ではない。
//   - 6通貨すべてと JPY が同じ1枚の文書に載る＝全通貨が同じ時点で揃う。
// 三菱UFJ銀行の外国為替公示相場も当たったが、公示相場ページは 404 になっており
// （2026-09-06 時点）、日本銀行の時系列は USD/JPY しか無い。
//
// ECB は EUR 建てでしか出さないので、対円は「円/EUR ÷ 当該通貨/EUR」で割り戻す。
// 割り戻す前の原文の値は ECB_PER_EUR に残してある（rates.test.ts が両者の一致を見る）。

/** 出典の固定 URL。scripts/fees-check.ts が週次でここを叩いて陳腐化を報せる。 */
export const RATES_SOURCE_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';
export const RATES_SOURCE_NAME = 'European Central Bank euro foreign exchange reference rates';

/**
 * ECB がこの値を「いつの参照レートか」として公表している日。
 * **我々が取得した日ではない。**ECB は土日祝を公表しないので普通はずれる。
 */
export const RATES_AS_OF = '2026-09-04';

/** 上の URL を実際に叩いて転記した日。ここが AS_OF と違うのは正常。 */
export const RATES_FETCHED_ON = '2026-09-06';

/**
 * ECB の原文そのまま（1 EUR あたりの当該通貨）。**転記の証拠なので丸めない。**
 * ここを直したら RATES も直すこと。ずれたら rates.test.ts が落ちる。
 */
export const ECB_PER_EUR: Record<string, number> = {
  JPY: 181.59,
  USD: 1.1622,
  GBP: 0.85898,
  AUD: 1.6134,
  CAD: 1.6038,
  SGD: 1.4724,
};

/**
 * 1通貨あたりの円。ECB_PER_EUR から割り戻して銭（小数2桁）に丸めた値。
 * 丸め誤差は約 0.006% で、直そうとしていた 4〜12% の陳腐化に対して無視できる。
 *
 * **取れなかった通貨を推測で埋めるな。**ECB が或る通貨の公表をやめたら、
 * その通貨だけ古い値が残ることになる。そのときは値を据え置いたうえで
 * STALE に理由と据え置いた日を書き、画面がそれを出せるようにすること
 * （fx-fetch.ts は取れなかった通貨の行を出力しないので、黙って古い値が
 *  新しい取得日を名乗ることは起きない）。
 */
export const RATES: Record<string, number> = {
  USD: 156.25,
  GBP: 211.40,
  EUR: 181.59,
  AUD: 112.55,
  CAD: 113.22,
  SGD: 123.33,
};

/**
 * 出典から転記できず古い値のまま残っている通貨。キーは通貨、値は理由。
 * 空なら「RATES の全通貨が RATES_AS_OF の出典値」。画面はこれを見て断り書きを出す。
 */
export const RATES_STALE: Record<string, string> = {};

export function rateFor(ccy: string): number {
  return RATES[ccy] ?? 1;
}

/** 画面表示用。211.4 ではなく 211.40 と出す（銭まで転記した、と読めるように）。 */
export function rateLabel(yen: number): string {
  return yen.toFixed(2);
}
