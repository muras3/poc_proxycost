// 為替は固定値。ライブ取得は外部依存＝障害点なので使わない。
// 実装日に公表仲値から転記し asOf を更新すること。利用者は画面で変更できる。
export const RATES: Record<string, number> = {
  USD: 150, GBP: 190, EUR: 163, AUD: 99, CAD: 110, SGD: 116,
};
export const RATES_AS_OF = '2026-09-06';

export function rateFor(ccy: string): number {
  return RATES[ccy] ?? 1;
}
