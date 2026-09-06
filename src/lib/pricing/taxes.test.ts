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

// ─────────────────────────────────────────────────────────────────────────────
// T11: 米国の関税事前納付（Zonos）の利用料。**発生するが額が公表されていない。**
// 0 でも推定値でもなく null 行として出し、excluded に名前を載せる。
// ─────────────────────────────────────────────────────────────────────────────
const PREPAY_LABEL = 'US import prepayment (Zonos) fee — not published';

describe('the US prepayment fee is disclosed as a cost we cannot price', () => {
  test('every US row carries the line, with no amount and no tier that implies one', () => {
    for (const row of rowsFor('US', 15000)) {
      const l = line(row, 'duty-prepayment');
      expect(l.label, row.id).toBe(PREPAY_LABEL);
      expect(l.amount, row.id).toBeNull();
      expect(l.tier, row.id).toBe('none');
      expect(l.sourceUrl, row.id).toContain('post.japanpost.jp');
      expect(l.note, row.id).toMatch(/Zonos/);
    }
  });

  test('it shows up in excluded, which is where the shortfall is read', () => {
    for (const row of rowsFor('US', 15000)) {
      expect(row.excluded, row.id).toContain(PREPAY_LABEL);
    }
  });

  test('it never enters the total — the board stays comparable', () => {
    const rows = rowsFor('US', 15000);
    for (const row of rows) {
      expect(row.total, row.id).toBe(row.lines.reduce((a, l) => a + (l.amount ?? 0), 0));
      expect(row.comparable, row.id).toBe(true);
    }
  });

  test('no other destination invents a prepayment it does not have', () => {
    for (const cc of COUNTRY_CODES) {
      if (cc === 'US') continue;
      for (const row of rowsFor(cc, 15000)) {
        expect(row.lines.some((l) => l.key === 'duty-prepayment'), `${cc} ${row.id}`).toBe(false);
        expect(row.excluded, `${cc} ${row.id}`).not.toContain(PREPAY_LABEL);
      }
    }
  });

  test('above the USD 2,500 band Japan Post asks for no prepayment, so we drop the line', () => {
    // ¥2,000,000 は現行の為替（¥150〜¥157/USD）のどちらでも 12,000 USD 超。
    for (const row of rowsFor('US', 2_000_000)) {
      expect(row.lines.some((l) => l.key === 'duty-prepayment'), row.id).toBe(false);
    }
  });

  test('the band is measured per parcel, because the rule is per postal item', () => {
    // 3点 × ¥300,000 = 商品代で 5,700〜6,000 USD。1個口にまとめる社は帯の外だが、
    // 注文ごとに分けて出す Buyee は 1個口あたり 1,900〜2,000 USD で帯の中に残る。
    const rows = rowsFor('US', 300_000, 3);
    const has = (id: string) =>
      rows.find((r) => r.id === id)!.lines.some((l) => l.key === 'duty-prepayment');
    expect(has('buyee:default')).toBe(true);
    expect(has('buyee:consolidated')).toBe(false);
    expect(has('neokyo')).toBe(false);
  });
});
