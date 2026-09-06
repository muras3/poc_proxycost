import { describe, expect, test } from 'vitest';
import { compare } from './compare';
import { SERVICES, SERVICE_BY_ID, type Service } from './services';
import type { Item, Row, SiteId } from './types';

function item(over: Partial<Item> & { id: string }): Item {
  return {
    title: over.id, priceYen: 10000, priceTier: 'fixed', site: 'yahoo-auctions',
    weightG: 600, weightTier: 'estimate', qty: 1, ...over,
  };
}
const rowsFor = (items: Item[]) => compare({ items, country: 'US' }).rows;
const byService = (rows: Row[], serviceId: string): Row =>
  rows.find((r) => r.serviceId === serviceId) ?? (() => { throw new Error(`no row ${serviceId}`); })();
const amount = (row: Row, key: string) => row.lines.find((l) => l.key === key)?.amount;
const svc = (id: string): Service =>
  SERVICE_BY_ID.get(id) ?? (() => { throw new Error(`no service ${id}`); })();

describe('the service table itself', () => {
  test('five services, unique ids, every one with a source', () => {
    expect(SERVICES.map((s) => s.id)).toEqual(['neokyo', 'zenmarket', 'fromjapan', 'buyee', 'jauce']);
    expect(new Set(SERVICES.map((s) => s.id)).size).toBe(SERVICES.length);
    for (const s of SERVICES) {
      expect(s.url).toMatch(/^https:\/\//);
      expect(s.sourceUrl).toMatch(/^https:\/\//);
      expect(s.primarySource).toBe(true);
    }
  });

  test('nobody marks up the published EMS rate', () => {
    for (const s of SERVICES) expect(s.emsMarkup).toBe(0);
  });

  test('who pays us is recorded but stays out of the ranking', () => {
    expect(svc('neokyo').paysUs).toBe(false);
    expect(svc('jauce').paysUs).toBe(false);
    expect(svc('jauce').referralNote).toBeNull();
    for (const id of ['zenmarket', 'fromjapan', 'buyee']) {
      expect(svc(id).paysUs).toBe(true);
      expect(svc(id).referralNote).toBeTruthy();
    }
  });

  test('Buyee is the only one that ships per order, Neokyo the only one that includes domestic shipping', () => {
    expect(SERVICES.filter((s) => s.parcelDefault === 'per-order').map((s) => s.id)).toEqual(['buyee']);
    expect(SERVICES.filter((s) => s.consolidationOnRequest).map((s) => s.id)).toEqual(['buyee']);
    expect(SERVICES.filter((s) => s.domesticIncluded).map((s) => s.id)).toEqual(['neokyo']);
  });

  test('ZenMarket is the only unverified parcel assumption', () => {
    expect(SERVICES.filter((s) => !s.parcelVerified).map((s) => s.id)).toEqual(['zenmarket']);
  });
});

describe('Neokyo — ¥350 per item, domestic shipping included', () => {
  test('the service fee counts items, not orders', () => {
    const one = byService(rowsFor([item({ id: 'a' })]), 'neokyo');
    expect(amount(one, 'service-fee')).toBe(350);
    const three = byService(rowsFor([item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' })]), 'neokyo');
    expect(amount(three, 'service-fee')).toBe(1050);
    expect(three.lines.find((l) => l.key === 'service-fee')!.note).toContain('domestic shipping incl.');
  });

  test('domestic shipping is a zero we know, not a zero we invented', () => {
    const row = byService(rowsFor([item({ id: 'a' })]), 'neokyo');
    const dom = row.lines.find((l) => l.key === 'domestic-shipping')!;
    expect(dom.amount).toBe(0);
    expect(dom.tier).toBe('fixed');
    expect(dom.note).toBe('included in the service fee');
  });

  test('packing is ¥500 up to 2 kg, then ¥150 per started kg', () => {
    // 梱包後重量 = net × 1.2 + 300 g。
    const pack = (weightG: number) => amount(byService(rowsFor([item({ id: 'a', weightG })]), 'neokyo'), 'packing');
    expect(pack(600)).toBe(500);   // gross 1,020 g
    expect(pack(1400)).toBe(500);  // gross 1,980 g
    expect(pack(1500)).toBe(650);  // gross 2,100 g → 1 kg over
    expect(pack(3000)).toBe(800);  // gross 3,900 g → 2 kg over
    expect(pack(5000)).toBe(1250); // gross 6,300 g → 5 kg over（切り上げ）
  });

  test('no deposit fee at Neokyo', () => {
    expect(byService(rowsFor([item({ id: 'a' })]), 'neokyo').lines.some((l) => l.key === 'deposit')).toBe(false);
    expect(svc('neokyo').deposit).toBeNull();
  });
});

describe('ZenMarket — ¥800 per item plus a 3.5% deposit fee', () => {
  test('the service fee counts items', () => {
    expect(amount(byService(rowsFor([item({ id: 'a' })]), 'zenmarket'), 'service-fee')).toBe(800);
    expect(amount(byService(rowsFor([item({ id: 'a' }), item({ id: 'b' })]), 'zenmarket'), 'service-fee')).toBe(1600);
  });

  // 3.5% は「送金合計に対する率」なので gross-up。base × r / (1 - r) であって base × r ではない。
  test('a ¥10,590 subtotal costs ¥384, not ¥371', () => {
    // items 5,610 + fee 800 + domestic 0 + EMS 4,180 = 10,590
    const row = byService(rowsFor([item({ id: 'a', priceYen: 5610, weightG: 200, domesticShippingYen: 0 })]), 'zenmarket');
    expect(amount(row, 'items')).toBe(5610);
    expect(amount(row, 'ems')).toBe(4180);
    expect(amount(row, 'deposit')).toBe(384);
    expect(Math.round(10590 * 0.035)).toBe(371); // 素の率で計算したときの値。これではない。
  });

  test('a ¥10,000 subtotal costs ¥363 — the known ¥10,363 charge, off by one yen', () => {
    // items 5,020 + fee 800 + domestic 0 + EMS 4,180 = 10,000
    const row = byService(rowsFor([item({ id: 'a', priceYen: 5020, weightG: 200, domesticShippingYen: 0 })]), 'zenmarket');
    expect(amount(row, 'deposit')).toBe(363);
  });

  test('the deposit is always the gross-up of the lines above it', () => {
    for (const priceYen of [1200, 8000, 25000, 140000]) {
      const row = byService(rowsFor([item({ id: 'a', priceYen })]), 'zenmarket');
      const idx = row.lines.findIndex((l) => l.key === 'deposit');
      const base = row.lines.slice(0, idx).reduce((a, l) => a + (l.amount ?? 0), 0);
      expect(amount(row, 'deposit')).toBe(Math.round(base / (1 - 0.035) - base));
    }
  });

  test('the deposit sits after EMS and before the taxes', () => {
    const keys = byService(rowsFor([item({ id: 'a' })]), 'zenmarket').lines.map((l) => l.key);
    expect(keys.indexOf('deposit')).toBeGreaterThan(keys.indexOf('ems'));
    expect(keys.indexOf('deposit')).toBeLessThan(keys.indexOf('duty'));
  });
});

describe('FROM JAPAN — ¥500 per item and ¥200 inside Japan', () => {
  test('the item fee scales with items, the payment fee with orders', () => {
    const row = byService(rowsFor([item({ id: 'a', qty: 3 })]), 'fromjapan');
    expect(amount(row, 'service-fee')).toBe(1500);
    expect(amount(row, 'payment-inside-jp')).toBe(200);
    const three = byService(rowsFor([item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' })]), 'fromjapan');
    expect(amount(three, 'service-fee')).toBe(1500);
    expect(amount(three, 'payment-inside-jp')).toBe(600);
  });

  test('the ¥200 is flagged unverified and says why', () => {
    const l = byService(rowsFor([item({ id: 'a' })]), 'fromjapan').lines.find((x) => x.key === 'payment-inside-jp')!;
    expect(l.tier).toBe('unverified');
    expect(l.note).toContain('per order or per item is not stated');
  });

  test('the 5% / 10% FROM USA rate is not applied to Japanese items', () => {
    const cheap = byService(rowsFor([item({ id: 'a', priceYen: 1000 })]), 'fromjapan');
    const rich = byService(rowsFor([item({ id: 'a', priceYen: 100000 })]), 'fromjapan');
    expect(amount(cheap, 'service-fee')).toBe(amount(rich, 'service-fee'));
    expect(rich.lines.some((l) => l.key === 'ad-valorem')).toBe(false);
  });
});

describe('Buyee — ¥500 per order, not per item', () => {
  test('three items in one order are charged once', () => {
    const row = byService(rowsFor([item({ id: 'a', qty: 3 })]), 'buyee');
    expect(amount(row, 'purchase-fee')).toBe(500);
    expect(amount(row, 'domestic-handling')).toBe(500);
    expect(row.lines.some((l) => l.key === 'service-fee')).toBe(false);
  });

  test('three separate orders are charged three times', () => {
    const rows = rowsFor([item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' })]);
    const row = rows.find((r) => r.id === 'buyee:consolidated')!;
    expect(amount(row, 'purchase-fee')).toBe(1500);
    expect(amount(row, 'domestic-handling')).toBe(1500);
    expect(row.lines.find((l) => l.key === 'purchase-fee')!.note).toBe('¥500 × 3 orders');
  });
});

describe('Jauce — the only ad valorem model', () => {
  const jauce = (site: SiteId) => byService(rowsFor([item({ id: 'a', site, priceYen: 10000, weightG: 600 })]), 'jauce');

  test('¥10,000 from Yahoo! Auctions: ¥400 service fee, ¥800 commission, ¥540 packing', () => {
    const row = jauce('yahoo-auctions');
    expect(amount(row, 'service-fee')).toBe(400);
    expect(amount(row, 'ad-valorem')).toBe(800);
    expect(amount(row, 'packing')).toBe(540);
  });

  test('Rakuten is free in beta — but packing is still charged', () => {
    const row = jauce('rakuten');
    expect(amount(row, 'service-fee')).toBe(0);
    expect(amount(row, 'ad-valorem')).toBe(0);
    expect(amount(row, 'packing')).toBe(540);
    expect(row.lines.find((l) => l.key === 'service-fee')!.note).toContain('1 free');
  });

  test('Yahoo! Shopping is free too, other sites are not', () => {
    expect(amount(jauce('yahoo-shopping'), 'ad-valorem')).toBe(0);
    for (const site of ['mercari', 'suruga-ya', 'mandarake', 'other'] as const) {
      expect(amount(jauce(site), 'ad-valorem')).toBe(800);
      expect(amount(jauce(site), 'service-fee')).toBe(400);
    }
  });

  test('a mixed basket charges only the chargeable items', () => {
    const row = byService(rowsFor([
      item({ id: 'a', site: 'rakuten', priceYen: 10000 }),
      item({ id: 'b', site: 'yahoo-auctions', priceYen: 10000 }),
    ]), 'jauce');
    expect(amount(row, 'service-fee')).toBe(400);
    expect(amount(row, 'ad-valorem')).toBe(800);
  });

  test('packing is ¥300 per parcel plus ¥120 per started kg from the first gram', () => {
    const pack = (weightG: number) => amount(byService(rowsFor([item({ id: 'a', weightG })]), 'jauce'), 'packing');
    expect(pack(600)).toBe(540);   // gross 1,020 g → 2 kg started
    expect(pack(200)).toBe(420);   // gross 540 g   → 1 kg started
    expect(pack(3000)).toBe(780);  // gross 3,900 g → 4 kg started
  });

  test('the deposit is ¥40 flat then a 3.9% gross-up', () => {
    const row = byService(rowsFor([item({ id: 'a' })]), 'jauce');
    const idx = row.lines.findIndex((l) => l.key === 'deposit');
    const base = row.lines.slice(0, idx).reduce((a, l) => a + (l.amount ?? 0), 0) + 40;
    expect(amount(row, 'deposit')).toBe(Math.round(40 + (base / (1 - 0.039) - base)));
    expect(row.lines[idx]!.tier).toBe('unverified');
  });
});
