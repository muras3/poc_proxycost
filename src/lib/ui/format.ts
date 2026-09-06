// 総額は ¥100 単位に丸め、差額は円単位で出す。
// 差額の方が確かな数字なので、精度の見た目も差額の方を高くする（docs/UI-DESIGN.md §1）。

export function yen(n: number): string {
  return `¥${Math.round(n).toLocaleString('en-US')}`;
}

export function yenRounded(n: number): string {
  return `¥${(Math.round(n / 100) * 100).toLocaleString('en-US')}`;
}

export function grams(g: number): string {
  return g >= 1000
    ? `${(g / 1000).toFixed(g % 1000 === 0 ? 0 : 1)} kg`
    : `${g.toLocaleString('en-US')} g`;
}

const SYMBOL: Record<string, string> = {
  USD: '$', GBP: '£', EUR: '€', AUD: 'A$', CAD: 'C$', SGD: 'S$',
};

export function foreign(yenAmount: number, code: string, rate: number): string {
  if (!rate) return '';
  const v = yenAmount / rate;
  return `≈ ${SYMBOL[code] ?? ''}${Math.round(v).toLocaleString('en-US')}`;
}

/** '¥5,250 – 19,800'。両端が同じなら1つの数字に畳む。 */
export function yenRange([lo, hi]: [number, number], round = false): string {
  const f = round ? yenRounded : yen;
  if (lo === hi) return f(lo);
  const hiText = f(hi).replace('¥', '');
  return `${f(lo)} – ${hiText}`;
}

export function rangeIsPoint([lo, hi]: [number, number]): boolean {
  return lo === hi;
}
