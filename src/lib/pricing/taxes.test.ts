import { describe, expect, test } from 'vitest';
import { compare } from './compare';
import { COUNTRIES, COUNTRY_CODES } from './countries';
import type { CountryCode, Item, Row } from './types';

/** 1点だけの籠。税の分岐は点数ではなく商品代で決まるので、これで足りる。 */
function items(n: number, priceYen = 3000, weightG = 600): Item[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `i${i}`, title: `i${i}`, priceYen, priceTier: 'fixed' as const,
    site: 'yahoo-auctions' as const, weightG, weightTier: 'estimate' as const, qty: 1,
  }));
}

const rowsFor = (cc: CountryCode, priceYen = 3000, n = 1) =>
  compare({ items: items(n, priceYen), country: cc }).rows;
const line = (row: Row, key: string) =>
  row.lines.find((l) => l.key === key)
  ?? (() => { throw new Error(`no line ${key} in ${row.id}`); })();

// ─────────────────────────────────────────────────────────────────────────────
// T13a: 免税限度が無い国に「限度」の文言を出さない。
// ─────────────────────────────────────────────────────────────────────────────
describe('the duty note says something a buyer can read', () => {
  test('Singapore has no duty limit, so it does not claim one', () => {
    // 以前ここは `under the SGD Infinity threshold` と出ていた。
    // Infinity は数字ではないので、そのまま文字列に混ぜたら画面が壊れる。
    for (const row of rowsFor('SG')) {
      const duty = line(row, 'duty');
      expect(duty.amount, row.id).toBe(0);
      expect(duty.note, row.id).toBe('no duty on this category');
    }
  });

  test('the other six still say which threshold they used', () => {
    const noteOf = (cc: CountryCode) => line(rowsFor(cc)[0]!, 'duty').note;
    expect(noteOf('US')).toBe('12.5% of the item price');
    expect(noteOf('GB')).toBe('under the GBP 135 threshold');
    expect(noteOf('DE')).toBe('EUR 3 flat × 1 item');
    expect(noteOf('FR')).toBe('EUR 3 flat × 1 item');
    expect(noteOf('AU')).toBe('under the AUD 1000 threshold');
    expect(noteOf('CA')).toBe('over the CAD 20 threshold — rate not included');
  });

  test('no country prints a non-number where a number belongs', () => {
    for (const cc of COUNTRY_CODES) {
      for (const row of rowsFor(cc, 30000)) {
        for (const l of row.lines) {
          expect(l.note, `${cc} ${row.id} ${l.key}`).not.toMatch(/Infinity|NaN|undefined|null/);
          expect(l.label, `${cc} ${row.id} ${l.key}`).not.toMatch(/Infinity|NaN|undefined|null/);
        }
      }
    }
  });

  test('the country table itself still carries the limit we branch on', () => {
    // 「限度が無い」を 0 で表さない。0 は「1円から課税」の意味になる。
    expect(Number.isFinite(COUNTRIES.SG.dutyFreeLimit)).toBe(false);
    expect(COUNTRIES.SG.dutyRate).toBe(0);
  });
});
