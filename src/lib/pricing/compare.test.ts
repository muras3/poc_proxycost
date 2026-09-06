import { describe, expect, test } from 'vitest';
import { compare } from './compare';
import { UNKNOWN_WEIGHT_STEPS_G } from './ems';
import type { CountryCode, Item, Row } from './types';

const COUNTRIES_ALL: CountryCode[] = ['US', 'GB', 'DE', 'FR', 'AU', 'CA', 'SG'];

function item(over: Partial<Item> & { id: string }): Item {
  return {
    title: over.id, priceYen: 3000, priceTier: 'fixed', site: 'yahoo-auctions',
    weightG: 600, weightTier: 'estimate', qty: 1, ...over,
  };
}

/** n 点・全点同一価格/同一重量。手で検証済みの表と同じ形。 */
function items(n: number, weightG: number | null, priceYen = 3000, over: Partial<Item> = {}): Item[] {
  return Array.from({ length: n }, (_, i) => item({ id: `i${i}`, priceYen, weightG, ...over }));
}

const byId = (rows: Row[], id: string): Row =>
  rows.find((r) => r.id === id) ?? (() => { throw new Error(`no row ${id}`); })();
const line = (row: Row, key: string) =>
  row.lines.find((l) => l.key === key) ?? (() => { throw new Error(`no line ${key}`); })();
const sumLines = (row: Row) => row.lines.reduce((a, l) => a + (l.amount ?? 0), 0);

// ── 手で検証済みの総額。ここが動いたら engine が変わったということ。
describe('verified totals — 5 items x ¥3,000 to the US', () => {
  const CASES: [number, number][] = [[200, 27128], [600, 33528], [1500, 48828], [3000, 62178]];

  test.each(CASES)('%i g per item → ¥%i', (weightG, total) => {
    const r = compare({ items: items(5, weightG), country: 'US' });
    expect(r.rows[0]!.serviceName).toBe('Neokyo');
    expect(r.rows[0]!.total).toBe(total);
    expect(r.rows[r.rows.length - 1]!.label).toBe('Buyee, default');
    expect(r.hasUnknownWeight).toBe(false);
    expect(r.bands).toBeNull();
  });

  test('the whole board is fixed at 200 g', () => {
    const r = compare({ items: items(5, 200), country: 'US' });
    expect(r.rows.map((x) => [x.id, x.total])).toEqual([
      ['neokyo', 27128],
      ['fromjapan', 32378],
      ['jauce', 33850],
      ['buyee:consolidated', 33878],
      ['zenmarket', 33952],
      ['buyee:default', 53788],
    ]);
  });
});

describe('every country ranks the same way', () => {
  test.each(COUNTRIES_ALL)('%s: Neokyo cheapest, Buyee default last', (cc) => {
    for (const weightG of [200, 600, 1500, 3000]) {
      const r = compare({ items: items(5, weightG), country: cc });
      expect(r.rows[0]!.serviceName).toBe('Neokyo');
      expect(r.rows[r.rows.length - 1]!.label).toBe('Buyee, default');
    }
  });

  test.each(COUNTRIES_ALL)('%s: the winner survives a 5x weight error at 200 g and 600 g', (cc) => {
    for (const weightG of [200, 600]) {
      const r = compare({ items: items(5, weightG), country: cc });
      expect(r.rankStable).toBe(true);
      expect(r.rankStabilityNote).toContain('Neokyo');
      expect(r.rankStabilityNote).toContain('5x');
    }
  });

  test('each country reports its own currency at the fixed rate', () => {
    const seen = COUNTRIES_ALL.map((cc) => compare({ items: items(1, 600), country: cc }).currency.code);
    expect(seen).toEqual(['USD', 'GBP', 'EUR', 'EUR', 'AUD', 'CAD', 'SGD']);
    expect(compare({ items: items(1, 600), country: 'US' }).currency.rate).toBe(150);
  });
});

// ── 順位は総額のみ。paysUs は並びに一切効かない。
describe('ranking uses the total and nothing else', () => {
  test('rows come back in ascending total order with 1-based ranks', () => {
    const r = compare({ items: items(5, 600), country: 'US' });
    const totals = r.rows.map((x) => x.total);
    expect(totals).toEqual([...totals].sort((a, b) => a - b));
    expect(r.rows.map((x) => x.rank)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test('a service that pays us nothing can be first', () => {
    const r = compare({ items: items(5, 600), country: 'US' });
    expect(r.rows[0]!.serviceId).toBe('neokyo');
    expect(r.rows[0]!.paysUs).toBe(false);
    expect(r.rows[0]!.cheapest).toBe(true);
    // 報酬を払う会社が上に繰り上がっていないこと。
    expect(r.rows.filter((x) => x.paysUs).every((x) => x.rank > 1)).toBe(true);
  });

  test('paying us does not pull a row up: the order equals a plain sort by total', () => {
    const r = compare({ items: items(3, 1500), country: 'GB' });
    const bySort = [...r.rows].sort((a, b) => a.total - b.total || a.serviceName.localeCompare(b.serviceName));
    expect(r.rows.map((x) => x.id)).toEqual(bySort.map((x) => x.id));
  });

  test('diff is the gap to the cheapest', () => {
    const r = compare({ items: items(5, 600), country: 'US' });
    const low = r.rows[0]!.total;
    for (const row of r.rows) expect(row.diff).toBe(row.total - low);
    expect(r.rows[0]!.diff).toBe(0);
    expect(r.rows.filter((x) => x.cheapest)).toHaveLength(1);
  });
});

// ── 未取得は null。0 で埋めたら失敗する。
describe('unfetched numbers stay null', () => {
  test('US has no federal sales tax line to show', () => {
    const row = compare({ items: items(1, 600), country: 'US' }).rows[0]!;
    const vat = line(row, 'vat');
    expect(vat.amount).toBeNull();
    expect(vat.amount).not.toBe(0);
    expect(vat.tier).toBe('none');
    expect(vat.label).toBe('Sales tax / VAT');
    expect(row.excluded).toContain('Sales tax / VAT');
  });

  test('Canada leaves provincial tax out and says so', () => {
    const row = compare({ items: items(1, 600), country: 'CA' }).rows[0]!;
    const prov = line(row, 'province-tax');
    expect(prov.amount).toBeNull();
    expect(prov.amount).not.toBe(0);
    expect(prov.tier).toBe('none');
    expect(row.excluded).toContain('Provincial tax');
    // 免税限度を超えていて税率が無い国は Duty も null（0 ではない）。
    expect(line(row, 'duty').amount).toBeNull();
  });

  test('a clearance fee we never fetched is null, not zero', () => {
    for (const cc of ['DE', 'FR', 'AU', 'CA', 'SG'] as const) {
      const clearance = line(compare({ items: items(1, 600), country: cc }).rows[0]!, 'clearance');
      expect(clearance.amount).toBeNull();
      expect(clearance.tier).toBe('none');
    }
  });

  test('a fetched zero is still a zero: under-threshold duty is 0 with a reason', () => {
    const duty = line(compare({ items: items(1, 600), country: 'GB' }).rows[0]!, 'duty');
    expect(duty.amount).toBe(0);
    expect(duty.tier).toBe('fixed');
    expect(duty.note).toContain('threshold');
  });

  test('nulls never enter the total, and excluded lists exactly the null lines', () => {
    for (const cc of COUNTRIES_ALL) {
      for (const row of compare({ items: items(3, 600), country: cc }).rows) {
        expect(row.total).toBe(sumLines(row));
        expect(row.excluded).toEqual(row.lines.filter((l) => l.amount == null).map((l) => l.label));
      }
    }
  });

  test('optional extras are kept out of the total', () => {
    const row = byId(compare({ items: items(1, 600), country: 'US' }).rows, 'neokyo');
    expect(row.optionalLines.length).toBeGreaterThan(0);
    expect(row.optionalLines.every((l) => !row.lines.some((x) => x.key === l.key))).toBe(true);
    expect(row.total).toBe(sumLines(row));
  });
});

// ── Buyee だけが既定で注文ごとに別送する。
describe('Buyee splits parcels by order', () => {
  test('two rows once there is more than one order', () => {
    const rows = compare({ items: items(3, 600), country: 'US' }).rows;
    const consolidated = byId(rows, 'buyee:consolidated');
    const dflt = byId(rows, 'buyee:default');
    expect(consolidated.variant).toBe('consolidated');
    expect(dflt.variant).toBe('default');
    expect(dflt.parcels).toBe(3);
    expect(consolidated.parcels).toBe(1);
    expect(dflt.tag).toBe('3 orders · 3 parcels');
    expect(consolidated.tag).toContain('you must request this');
  });

  test('splitting costs more on EMS and on the clearance fee', () => {
    const rows = compare({ items: items(3, 600), country: 'US' }).rows;
    const consolidated = byId(rows, 'buyee:consolidated');
    const dflt = byId(rows, 'buyee:default');
    expect(line(dflt, 'ems').amount!).toBeGreaterThan(line(consolidated, 'ems').amount!);
    // USD 9.35 × ¥150 × 3 個口を最後に一度だけ丸める（1個口 ¥1,403 の3倍ではない）。
    expect(line(consolidated, 'clearance').amount).toBe(1403);
    expect(line(dflt, 'clearance').amount).toBe(4208);
    expect(line(dflt, 'clearance').note).toBe('USD 9.35 × 3 parcels');
    expect(dflt.total).toBeGreaterThan(consolidated.total);
  });

  test('a single order gives one Buyee row and no variant', () => {
    const rows = compare({ items: items(1, 600), country: 'US' }).rows;
    expect(rows.filter((r) => r.serviceId === 'buyee')).toHaveLength(1);
    const only = byId(rows, 'buyee');
    expect(only.variant).toBeNull();
    expect(only.label).toBe('Buyee');
    expect(only.parcels).toBe(1);
  });

  test('the other four services stay at one parcel', () => {
    const rows = compare({ items: items(4, 600), country: 'US' }).rows;
    for (const id of ['neokyo', 'zenmarket', 'fromjapan', 'jauce']) {
      expect(byId(rows, id).parcels).toBe(1);
    }
  });
});

// ── 送料込み出品が唯一の逆転条件。境界を固定する。
describe('free domestic shipping is the one thing that flips the winner', () => {
  const winner = (n: number, weightG: number, freeShipping: boolean) =>
    compare({ items: items(n, weightG, 3000, { freeShipping }), country: 'US' }).rows[0]!.serviceId;

  test('paid domestic shipping: Neokyo wins everywhere on the grid', () => {
    for (const n of [1, 2, 3, 5]) {
      for (const w of [200, 600, 1000, 1500, 2000, 3000]) {
        expect(winner(n, w, false)).toBe('neokyo');
      }
    }
  });

  test('n=1: FROM JAPAN takes over at every weight', () => {
    for (const w of [200, 600, 1000, 1500, 2000, 3000]) {
      expect(winner(1, w, true)).toBe('fromjapan');
    }
  });

  test('n=2 and n=3: the flip happens at 1,500 g', () => {
    for (const n of [2, 3]) {
      expect(winner(n, 1000, true)).toBe('neokyo');
      expect(winner(n, 1500, true)).toBe('fromjapan');
      expect(winner(n, 3000, true)).toBe('fromjapan');
    }
  });

  test('n=5 at 600 g does not flip', () => {
    expect(winner(5, 600, true)).toBe('neokyo');
    expect(winner(5, 1500, true)).toBe('neokyo');
    expect(winner(5, 2000, true)).toBe('fromjapan');
  });

  test('the flip is Neokyo packing (¥500 + ¥150/kg) against FROM JAPAN ¥200 per order', () => {
    const light = compare({ items: items(2, 1000, 3000, { freeShipping: true }), country: 'US' }).rows;
    const heavy = compare({ items: items(2, 1500, 3000, { freeShipping: true }), country: 'US' }).rows;
    const pack = (rows: Row[]) => line(byId(rows, 'neokyo'), 'packing').amount!;
    expect(pack(heavy)).toBeGreaterThan(pack(light));
    // FROM JAPAN 側は重量が増えても手数料が動かない（EMS だけが動く）。
    const fee = (rows: Row[]) => line(byId(rows, 'fromjapan'), 'payment-inside-jp').amount!;
    expect(fee(light)).toBe(400);
    expect(fee(heavy)).toBe(400);
  });

  test('free shipping zeroes the domestic line without touching the service fee', () => {
    const rows = compare({ items: items(2, 600, 3000, { freeShipping: true }), country: 'US' }).rows;
    const fj = byId(rows, 'fromjapan');
    expect(line(fj, 'domestic-shipping').amount).toBe(0);
    expect(line(fj, 'domestic-shipping').tier).toBe('fixed');
    expect(line(fj, 'service-fee').amount).toBe(1000);
  });
});

// ── 重量不明。1つの数字を押し付けず、EMS の段ごとに出す。
describe('unknown weight falls back to EMS steps', () => {
  const unknown = () => compare({
    items: [item({ id: 'a', weightG: null, weightTier: 'none' }), item({ id: 'b', weightG: null, weightTier: 'none' })],
    country: 'US',
  });

  test('six bands, taken from the EMS table', () => {
    const r = unknown();
    expect(r.hasUnknownWeight).toBe(true);
    expect(r.bands).toHaveLength(6);
    expect(r.bands!.map((b) => b.stepG)).toEqual([...UNKNOWN_WEIGHT_STEPS_G]);
    expect(r.bands!.map((b) => b.label)).toEqual(['500 g', '1 kg', '1.5 kg', '2 kg', '3 kg', '5 kg']);
  });

  test('the same winner in every band means rankStable', () => {
    const r = unknown();
    expect(r.bands!.every((b) => b.cheapestRowId === 'neokyo')).toBe(true);
    expect(r.rankStable).toBe(true);
    expect(r.rankStabilityNote).toContain('Neokyo');
    expect(r.rankStabilityNote).toContain('500 g');
    expect(r.rankStabilityNote).toContain('5 kg');
  });

  test('a winner that changes with the step is reported as unstable', () => {
    // 1点・送料別だと 5 kg の段だけ FROM JAPAN が勝つ。
    const r = compare({ items: [item({ id: 'a', weightG: null, weightTier: 'none' })], country: 'US' });
    expect(r.rankStable).toBe(false);
    expect(r.rankStabilityNote).toContain('changes with weight');
    expect(r.bands![5]!.cheapestRowId).toBe('fromjapan');
    expect(r.bands![0]!.cheapestRowId).toBe('neokyo');
  });

  test('each band is itself ranked and totals grow with the step', () => {
    const r = unknown();
    for (const band of r.bands!) {
      // 2注文なので Buyee が consolidated / default の2行に割れて 6 行になる。
      expect(band.rows).toHaveLength(6);
      expect(band.rows.map((x) => x.rank)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(band.rows[0]!.id).toBe(band.cheapestRowId);
      expect(band.cheapestServiceName).toBe(band.rows[0]!.label);
    }
    const firstOf = r.bands!.map((b) => b.rows[0]!.total);
    expect(firstOf).toEqual([...firstOf].sort((a, b) => a - b));
  });

  test('ranges cover every band, and the mid band is the representative board', () => {
    const r = unknown();
    for (const id of Object.keys(r.rowTotalRange!)) {
      const totals = r.bands!.flatMap((b) => b.rows.filter((x) => x.id === id).map((x) => x.total));
      expect(r.rowTotalRange![id]).toEqual([Math.min(...totals), Math.max(...totals)]);
      const diffs = r.bands!.flatMap((b) => b.rows.filter((x) => x.id === id).map((x) => x.diff));
      expect(r.rowDiffRange![id]).toEqual([Math.min(...diffs), Math.max(...diffs)]);
    }
    const all = r.bands!.flatMap((b) => b.rows.map((x) => x.total));
    expect(r.totalRangeYen).toEqual([Math.min(...all), Math.max(...all)]);
    expect(r.rows).toEqual(r.bands![3]!.rows);
  });

  test('one unknown item among known ones still drops the whole board to bands', () => {
    const r = compare({
      items: [item({ id: 'a', weightG: 600 }), item({ id: 'b', weightG: null, weightTier: 'none' })],
      country: 'US',
    });
    expect(r.hasUnknownWeight).toBe(true);
    expect(r.bands).not.toBeNull();
    expect(r.rows.length).toBeGreaterThan(0);
  });
});

describe('edges', () => {
  test('no items → an empty board, not a crash', () => {
    const r = compare({ items: [], country: 'US' });
    expect(r.rows).toEqual([]);
    expect(r.bands).toBeNull();
    expect(r.totalRangeYen).toBeNull();
    expect(r.hasUnknownWeight).toBe(false);
    expect(r.currency.code).toBe('USD');
  });

  test('quantity multiplies the price and the weight inside one order', () => {
    const one = compare({ items: [item({ id: 'a', weightG: 200, qty: 3 })], country: 'US' }).rows;
    expect(line(byId(one, 'neokyo'), 'items').amount).toBe(9000);
    expect(byId(one, 'neokyo').tag).toBe('3 items · 1 parcel');
    // 3点でも1注文なので Buyee の購入手数料は1回だけ。
    expect(line(byId(one, 'buyee'), 'purchase-fee').amount).toBe(500);
  });

  test('an estimated price marks the row approximate', () => {
    const exact = compare({ items: [item({ id: 'a', priceTier: 'fixed', freeShipping: true })], country: 'SG' }).rows;
    const guess = compare({ items: [item({ id: 'a', priceTier: 'estimate', freeShipping: true })], country: 'SG' }).rows;
    expect(line(byId(exact, 'neokyo'), 'items').tier).toBe('fixed');
    expect(line(byId(guess, 'neokyo'), 'items').tier).toBe('estimate');
    expect(byId(guess, 'neokyo').approximate).toBe(true);
  });

  test('an assumed domestic shipping cost is labelled estimate, a given one is not', () => {
    const assumed = byId(compare({ items: [item({ id: 'a' })], country: 'US' }).rows, 'zenmarket');
    expect(line(assumed, 'domestic-shipping').amount).toBe(800);
    expect(line(assumed, 'domestic-shipping').tier).toBe('estimate');
    const known = byId(compare({ items: [item({ id: 'a', domesticShippingYen: 250 })], country: 'US' }).rows, 'zenmarket');
    expect(line(known, 'domestic-shipping').amount).toBe(250);
    expect(line(known, 'domestic-shipping').tier).toBe('fixed');
  });

  test('every row carries an outbound url and a stable id', () => {
    const rows = compare({ items: items(2, 600), country: 'US' }).rows;
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    for (const r of rows) expect(r.outboundUrl).toMatch(/^https:\/\//);
  });
});
