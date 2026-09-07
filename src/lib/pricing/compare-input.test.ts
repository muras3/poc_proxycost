import { describe, expect, test } from 'vitest';
import { compare } from './compare';
import type { CompareInput, Item } from './types';

function item(over: Partial<Item> = {}): Item {
  return {
    id: 'a', title: 'a', priceYen: 3000, priceTier: 'fixed', site: 'yahoo-auctions',
    weightG: 600, weightTier: 'estimate', qty: 1, ...over,
  };
}
const run = (over: Partial<Item>) =>
  () => compare({ items: [item(over)], country: 'US' });

// ─────────────────────────────────────────────────────────────────────────────
// T20: 壊れた入力は投げる。**空の結果にして黙らない**（compare.ts の理由書きを見よ）。
// ─────────────────────────────────────────────────────────────────────────────
describe('compare() refuses input it cannot price', () => {
  test('NaN / Infinity in the price is rejected, not averaged into a total', () => {
    expect(run({ priceYen: Number.NaN })).toThrow(/unusable price/);
    expect(run({ priceYen: Number.POSITIVE_INFINITY })).toThrow(/unusable price/);
    expect(run({ priceYen: -1 })).toThrow(/unusable price/);
  });

  test('a quantity below one, or a fractional one, is rejected', () => {
    expect(run({ qty: 0 })).toThrow(/unusable quantity/);
    expect(run({ qty: -2 })).toThrow(/unusable quantity/);
    expect(run({ qty: 1.5 })).toThrow(/unusable quantity/);
    expect(run({ qty: Number.NaN })).toThrow(/unusable quantity/);
  });

  test('a weight of zero or NaN is rejected, but null stays legal', () => {
    expect(run({ weightG: 0 })).toThrow(/unusable weight/);
    expect(run({ weightG: Number.NaN })).toThrow(/unusable weight/);
    expect(run({ weightG: Number.POSITIVE_INFINITY })).toThrow(/unusable weight/);
    // null は「重量が分からない」。段（Band）に落ちる正当な入力。
    expect(() => compare({ items: [item({ weightG: null })], country: 'US' })).not.toThrow();
  });

  test('a domestic shipping figure that is not a number is rejected', () => {
    expect(run({ domesticShippingYen: Number.NaN })).toThrow(/unusable domestic shipping/);
    expect(run({ domesticShippingYen: -100 })).toThrow(/unusable domestic shipping/);
    // null は「出品から読めなかった」。仮定に落ちる正当な入力。
    expect(() => compare({ items: [item({ domesticShippingYen: null })], country: 'US' }))
      .not.toThrow();
  });

  test('an unknown destination is rejected before any row is built', () => {
    const bad = { items: [item()], country: 'ZZ' } as unknown as CompareInput;
    expect(() => compare(bad)).toThrow(/unknown destination country ZZ/);
  });

  test('the message names the item, so the caller can find it', () => {
    expect(() => compare({ items: [item({ id: 'kettle' }), item({ id: 'cup', qty: 0 })], country: 'US' }))
      .toThrow(/item cup/);
  });

  test('nothing that survives the check can put NaN in a total', () => {
    // 検査を通った入力では、どの行のどの費目にも NaN は出ない。
    for (const over of [{}, { weightG: null }, { qty: 7 }, { priceYen: 0 }, { freeShipping: true }]) {
      const r = compare({ items: [item(over as Partial<Item>)], country: 'US' });
      const rows = r.bands ? r.bands.flatMap((b) => b.rows) : r.rows;
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(Number.isFinite(row.total), `${row.id} total`).toBe(true);
        for (const l of row.lines) {
          expect(l.amount == null || Number.isFinite(l.amount), `${row.id} ${l.key}`).toBe(true);
        }
      }
    }
  });

  test('an empty basket is still an empty board, not a throw', () => {
    expect(compare({ items: [], country: 'US' }).rows).toEqual([]);
  });
});
