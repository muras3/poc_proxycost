import { describe, expect, test } from 'vitest';
import { compare } from './compare';
import { SERVICES, SERVICES_CHECKED_ON, SERVICE_BY_ID, type Service } from './services';
import type { Item, Line, Row, SiteId } from './types';

// 出品サイトは Jauce と ZenMarket で料金が変わる。全サイトを一度に回すために並べておく。
const SITES: SiteId[] = [
  'yahoo-auctions', 'mercari', 'rakuten', 'yahoo-shopping', 'amazon-jp',
  'suruga-ya', 'mandarake', 'zozo', 'hmv', 'toranoana', 'other',
];

function item(over: Partial<Item> & { id: string }): Item {
  return {
    title: over.id, priceYen: 10000, priceTier: 'fixed', site: 'yahoo-auctions',
    weightG: 600, weightTier: 'estimate', qty: 1, ...over,
  };
}
const rowsFor = (items: Item[]) => compare({ items, country: 'US' }).rows;
const byService = (rows: Row[], serviceId: string): Row =>
  rows.find((r) => r.serviceId === serviceId) ?? (() => { throw new Error(`no row ${serviceId}`); })();
const line = (row: Row, key: string): Line =>
  row.lines.find((l) => l.key === key) ?? (() => { throw new Error(`no line ${key} in ${row.id}`); })();
const amount = (row: Row, key: string) => row.lines.find((l) => l.key === key)?.amount;
const one = (serviceId: string, over: Partial<Item> = {}) =>
  byService(rowsFor([item({ id: 'a', ...over })]), serviceId);
const svc = (id: string): Service =>
  SERVICE_BY_ID.get(id) ?? (() => { throw new Error(`no service ${id}`); })();

describe('the service table itself', () => {
  test('five services, unique ids, and every rate cited from the company that charges it', () => {
    expect(SERVICES.map((s) => s.id)).toEqual(['neokyo', 'zenmarket', 'fromjapan', 'buyee', 'jauce']);
    expect(new Set(SERVICES.map((s) => s.id)).size).toBe(SERVICES.length);
    for (const s of SERVICES) {
      expect(s.url).toMatch(/^https:\/\//);
      expect(s.sourceUrl).toMatch(/^https:\/\//);
      // 一次情報とは「その社自身が公開したページ」のこと。まとめ記事を引いたら primarySource は嘘になる。
      expect(new URL(s.sourceUrl!).host).toBe(new URL(s.url).host);
      expect(s.primarySource).toBe(true);
    }
  });

  test('every fee line carries the page it came from, so a wrong number can be traced', () => {
    for (const s of SERVICES) {
      const row = one(s.id);
      // items / domestic-shipping は我々の入力と仮定なので出所は無い。社が請求する行には必ず出所が要る。
      const ours = new Set(['items', 'domestic-shipping']);
      for (const l of row.lines) {
        if (ours.has(l.key)) continue;
        expect(l.sourceUrl, `${s.id} / ${l.key}`).toBeTruthy();
      }
      const feeKeys = ['service-fee', 'purchase-fee', 'protection-plan', 'ad-valorem',
        'bank-fee', 'payment-inside-jp', 'packing', 'deposit'];
      for (const l of row.lines.filter((x) => feeKeys.includes(x.key))) {
        expect(l.sourceUrl, `${s.id} / ${l.key}`).toBe(s.sourceUrl);
      }
    }
  });

  test('the table records the day it was checked, and that day is not in the future', () => {
    // 料金を触ったらこの日付も動かす。動いていない表は「いつのものか分からない表」。
    expect(SERVICES_CHECKED_ON).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const checked = new Date(`${SERVICES_CHECKED_ON}T00:00:00Z`);
    expect(Number.isNaN(checked.getTime())).toBe(false);
    expect(checked.getTime()).toBeLessThanOrEqual(Date.now());
  });

  test('nobody marks up the published EMS rate', () => {
    for (const s of SERVICES) expect(s.emsMarkup).toBe(0);
  });

  test('who pays us is recorded, and the cheapest row is still allowed to pay us nothing', () => {
    expect(svc('neokyo').paysUs).toBe(false);
    expect(svc('jauce').paysUs).toBe(false);
    expect(svc('jauce').referralNote).toBeNull();
    for (const id of ['zenmarket', 'fromjapan', 'buyee']) {
      expect(svc(id).paysUs).toBe(true);
      expect(svc(id).referralNote).toBeTruthy();
    }
    // 5点 ¥3,000 200g では Neokyo が最安。**報酬を1円も払わない社が1位に立てること**が、
    // 順位が総額だけで決まっている証拠。
    const rows = rowsFor(Array.from({ length: 5 }, (_, i) => item({ id: `i${i}`, priceYen: 3000, weightG: 200 })));
    expect(rows[0]!.serviceId).toBe('neokyo');
    expect(rows[0]!.paysUs).toBe(false);
    expect(rows.map((r) => r.total)).toEqual([...rows.map((r) => r.total)].sort((a, b) => a - b));
  });

  test('Buyee alone ships per order, and nobody folds domestic shipping into their fee', () => {
    expect(SERVICES.filter((s) => s.parcelDefault === 'per-order').map((s) => s.id)).toEqual(['buyee']);
    expect(SERVICES.filter((s) => s.consolidationOnRequest).map((s) => s.id)).toEqual(['buyee']);
    // Neokyo の公式は「(商品代＋国内送料) ＋ ¥350」。¥350 に国内送料は入っていない。
    // ここが true に戻ると Neokyo だけ国内送料 ¥800/点 を無料にして不当に安く見える。
    expect(SERVICES.filter((s) => s.domesticIncluded).map((s) => s.id)).toEqual([]);
  });

  test('only ZenMarket and Jauce take a cut of the money you send them', () => {
    expect(SERVICES.filter((s) => s.deposit).map((s) => s.id)).toEqual(['zenmarket', 'jauce']);
    expect(SERVICES.filter((s) => s.packing?.mandatory).map((s) => s.id)).toEqual(['neokyo', 'jauce']);
  });

  test('ZenMarket is the only unverified parcel assumption', () => {
    expect(SERVICES.filter((s) => !s.parcelVerified).map((s) => s.id)).toEqual(['zenmarket']);
  });

  test("a number we do not have is never shown as ¥0 — tier 'none' always means null", () => {
    // 未取得（none）を 0 で埋めると総額が安い方向に嘘をつく。逆に null なのに tier が
    // 付いていると「取れているのに 0」と読めてしまう。両方向を塞ぐ。
    for (const country of ['US', 'GB', 'DE', 'FR', 'AU', 'CA', 'SG'] as const) {
      for (const weightG of [200, 3000, 30000]) {
        const rows = compare({
          items: [item({ id: 'a', weightG, priceYen: 200000 }), item({ id: 'b', weightG, site: 'rakuten' })],
          country,
        }).rows;
        for (const r of rows) {
          for (const l of r.lines) {
            if (l.tier === 'none') expect(l.amount, `${country} ${r.id} ${l.key}`).toBeNull();
            if (l.amount === null) {
              expect(l.tier, `${country} ${r.id} ${l.key}`).toBe('none');
              // 総額から漏れている費目は行の excluded に必ず出す。安く見えている理由を隠さない。
              expect(r.excluded).toContain(l.label);
            }
          }
        }
      }
    }
  });
});

describe('Neokyo — ¥350 per item, charged on top of the domestic shipping', () => {
  test('the ¥350 does not swallow the domestic shipping', () => {
    const row = one('neokyo');
    expect(amount(row, 'service-fee')).toBe(350);
    expect(line(row, 'service-fee').note).not.toMatch(/domestic/i);
    const dom = line(row, 'domestic-shipping');
    expect(dom.amount).toBe(800);   // 我々の仮定 ASSUMED_DOMESTIC_SHIPPING_YEN
    expect(dom.tier).toBe('estimate');
  });

  test('the fee counts distinct items — three of the same listing is still one ¥350', () => {
    expect(amount(one('neokyo', { qty: 3 }), 'service-fee')).toBe(350);
    expect(line(one('neokyo', { qty: 3 }), 'service-fee').note).toContain('same item counted once');
  });

  test('three different listings are three fees and three domestic shipments', () => {
    const three = byService(rowsFor([item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' })]), 'neokyo');
    expect(amount(three, 'service-fee')).toBe(1050);
    expect(amount(three, 'domestic-shipping')).toBe(2400);
  });

  test('the fee is the same ¥350 whatever shop the item came from', () => {
    for (const site of SITES) expect(amount(one('neokyo', { site }), 'service-fee'), site).toBe(350);
  });

  test('packing is ¥500 up to 2 kg, then ¥150 per started kg — the 2 kg mark itself is free', () => {
    // 梱包後重量 = net × 1.2 + 300 g で判定する。
    const pack = (weightG: number) => amount(one('neokyo', { weightG }), 'packing');
    expect(pack(200)).toBe(500);   // gross 540 g
    expect(pack(1417)).toBe(500);  // gross 2,000 g ちょうど。まだ超過ではない
    expect(pack(1418)).toBe(650);  // gross 2,002 g → 1 kg 超過
    expect(pack(3000)).toBe(800);  // gross 3,900 g → 2 kg 超過（切り上げ）
    expect(pack(5000)).toBe(1250); // gross 6,300 g → 5 kg 超過
  });

  test('no deposit fee at Neokyo', () => {
    expect(svc('neokyo').deposit).toBeNull();
    expect(one('neokyo').lines.some((l) => l.key === 'deposit')).toBe(false);
  });
});

describe('ZenMarket — ¥500 per item, ¥800 only where the company says ¥800', () => {
  test('Yahoo! Auctions and Mercari cost ¥800, every other shop ¥500', () => {
    // 原文は「500 yen … Amazon, Rakuten, and most other stores / 800 yen … all Mercari
    // items and JDirectItems Auction bids」。一律 ¥800 にすると ZenMarket を不当に高く見せる。
    const expected: Record<string, number> = { 'yahoo-auctions': 800, mercari: 800 };
    for (const site of SITES) {
      expect(amount(one('zenmarket', { site }), 'service-fee'), site).toBe(expected[site] ?? 500);
    }
  });

  test('three identical T-shirts are still one service fee', () => {
    const row = one('zenmarket', { site: 'mercari', qty: 3 });
    expect(amount(row, 'service-fee')).toBe(800);
    expect(line(row, 'service-fee').note).toContain('same item counted once');
  });

  test('a mixed basket names both rates instead of hiding one', () => {
    const row = byService(rowsFor([item({ id: 'a', site: 'rakuten' }), item({ id: 'b' })]), 'zenmarket');
    expect(amount(row, 'service-fee')).toBe(1300);
    expect(line(row, 'service-fee').note).toBe('¥500 / ¥800 by shop, 2 charged');
  });

  // 3.5% は「送金合計に対する率」なので gross-up。base × r / (1 - r) であって base × r ではない。
  test('a ¥10,590 subtotal costs ¥384, not the ¥371 a naive percentage gives', () => {
    // items 5,610 + fee 800 + domestic 0 + EMS 4,180 = 10,590
    const row = one('zenmarket', { priceYen: 5610, weightG: 200, domesticShippingYen: 0 });
    expect(amount(row, 'items')).toBe(5610);
    expect(amount(row, 'ems')).toBe(4180);
    expect(amount(row, 'deposit')).toBe(384);
    expect(Math.round(10590 * 0.035)).toBe(371); // 素の率で計算したときの値。これではない。
  });

  test('a ¥10,000 subtotal costs ¥363 — the published ¥10,363 charge, off by one yen', () => {
    // items 5,020 + fee 800 + domestic 0 + EMS 4,180 = 10,000
    const row = one('zenmarket', { priceYen: 5020, weightG: 200, domesticShippingYen: 0 });
    expect(amount(row, 'deposit')).toBe(363);
  });

  test('the deposit is always the gross-up of the lines above it', () => {
    for (const priceYen of [1200, 8000, 25000, 140000]) {
      const row = one('zenmarket', { priceYen });
      const idx = row.lines.findIndex((l) => l.key === 'deposit');
      const base = row.lines.slice(0, idx).reduce((a, l) => a + (l.amount ?? 0), 0);
      expect(amount(row, 'deposit')).toBe(Math.round(base / (1 - 0.035) - base));
    }
  });

  test('the deposit sits after EMS and before the taxes, so it grosses up the shipping too', () => {
    const keys = one('zenmarket').lines.map((l) => l.key);
    expect(keys.indexOf('deposit')).toBeGreaterThan(keys.indexOf('ems'));
    expect(keys.indexOf('deposit')).toBeLessThan(keys.indexOf('duty'));
  });
});

describe('FROM JAPAN — ¥500 per item, and ¥200 only on a Yahoo! Auctions win', () => {
  test('the item fee counts distinct items, not units', () => {
    expect(amount(one('fromjapan', { qty: 3 }), 'service-fee')).toBe(500);
    const three = byService(rowsFor([item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' })]), 'fromjapan');
    expect(amount(three, 'service-fee')).toBe(1500);
  });

  test('the ¥200 is charged per auction won — three units of one auction is one ¥200', () => {
    expect(amount(one('fromjapan', { qty: 3 }), 'payment-inside-jp')).toBe(200);
    const three = byService(rowsFor([item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' })]), 'fromjapan');
    expect(amount(three, 'payment-inside-jp')).toBe(600);
    expect(line(three, 'payment-inside-jp').note).toContain('Yahoo! Auctions only');
  });

  test('outside Yahoo! Auctions the payment fee is a sourced ¥0, not an unknown', () => {
    // 2023-01-31 11:00 JST に他サイトの支払手数料は廃止された。廃止を知っている 0 なので
    // tier は fixed。ここが unverified や null に戻ったら「調べていない」の意味になる。
    for (const site of SITES.filter((s) => s !== 'yahoo-auctions')) {
      const l = line(one('fromjapan', { site }), 'payment-inside-jp');
      expect(l.amount, site).toBe(0);
      expect(l.tier, site).toBe('fixed');
    }
    expect(line(one('fromjapan'), 'payment-inside-jp').tier).toBe('fixed');
  });

  test('the mixed basket charges ¥200 only for the auction half', () => {
    const row = byService(rowsFor([item({ id: 'a', site: 'rakuten' }), item({ id: 'b' })]), 'fromjapan');
    expect(amount(row, 'service-fee')).toBe(1000);
    expect(amount(row, 'payment-inside-jp')).toBe(200);
  });

  test('the 5% / 10% FROM USA rate never touches Japanese items', () => {
    // ¥500/点 は定額。価格に比例する費目を足したら FROM JAPAN を不当に高く見せる。
    for (const priceYen of [1000, 100000, 1000000]) {
      const row = one('fromjapan', { priceYen });
      expect(amount(row, 'service-fee'), String(priceYen)).toBe(500);
      expect(row.lines.some((l) => l.key === 'ad-valorem'), String(priceYen)).toBe(false);
    }
  });

  test('the product protection plan is optional and stays out of the total', () => {
    const row = one('fromjapan');
    expect(row.optionalLines.map((l) => l.key)).toContain('protection');
    expect(row.lines.some((l) => l.key === 'protection')).toBe(false);
    expect(row.total).toBe(row.lines.reduce((a, l) => a + (l.amount ?? 0), 0));
  });
});

describe('Buyee — per order, and the domestic handling fee that never existed', () => {
  test('no service charges a line called domestic handling', () => {
    // 「Domestic handling ¥500」は日本国内の住所へ送るサービスの料金で、海外発送には無い。
    // 実在するのは注文ごとの保証プラン。ここが戻ると Buyee に架空の ¥500 を積むことになる。
    const rows = rowsFor([item({ id: 'a' }), item({ id: 'b' })]);
    for (const r of rows) expect(r.lines.some((l) => l.key === 'domestic-handling'), r.id).toBe(false);
  });

  test('the purchase fee and the protection plan are both per order, never per item', () => {
    const row = one('buyee', { qty: 3 });
    expect(amount(row, 'purchase-fee')).toBe(500);
    expect(amount(row, 'protection-plan')).toBe(500);
    expect(row.lines.some((l) => l.key === 'service-fee')).toBe(false);
  });

  test('three separate orders are charged three times, in both lines', () => {
    const row = rowsFor([item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' })])
      .find((r) => r.id === 'buyee:consolidated')!;
    expect(amount(row, 'purchase-fee')).toBe(1500);
    expect(amount(row, 'protection-plan')).toBe(1500);
    expect(line(row, 'purchase-fee').note).toBe('¥500 × 3 orders');
  });

  test('the protection plan we charge is the recommended one, and the breakdown says Lite is ¥0', () => {
    // 既定で一番高いプランを積んでいるのだから、¥0 の逃げ道があることを利用者に見せる。
    const l = line(one('buyee'), 'protection-plan');
    expect(l.note).toContain('Standard');
    expect(l.note).toContain('the Lite plan is ¥0');
  });

  test('the fee is the same whatever shop the item came from', () => {
    for (const site of SITES) {
      expect(amount(one('buyee', { site }), 'purchase-fee'), site).toBe(500);
      expect(amount(one('buyee', { site }), 'protection-plan'), site).toBe(500);
    }
  });
});

describe('Jauce — ¥400 + 8% on the auction site, ¥1,000 + 8% off it', () => {
  const jauce = (site: SiteId) => one('jauce', { site, priceYen: 10000, weightG: 600 });

  test('¥10,000 from Yahoo! Auctions: ¥400 service fee, ¥800 commission, ¥300 bank fee, ¥540 packing', () => {
    const row = jauce('yahoo-auctions');
    expect(amount(row, 'service-fee')).toBe(400);
    expect(amount(row, 'ad-valorem')).toBe(800);
    expect(amount(row, 'bank-fee')).toBe(300);
    expect(amount(row, 'packing')).toBe(540);
  });

  test('shops outside the auction site cost ¥1,000 per item, not ¥400', () => {
    // 駿河屋・まんだらけ・ZOZO・HMV・とらのあな・Amazon・その他は場外扱いで ¥1,000。
    const offAuction: SiteId[] = ['suruga-ya', 'mandarake', 'zozo', 'hmv', 'toranoana', 'amazon-jp', 'other'];
    for (const site of offAuction) {
      expect(amount(jauce(site), 'service-fee'), site).toBe(1000);
      expect(amount(jauce(site), 'ad-valorem'), site).toBe(800);
    }
    for (const site of ['yahoo-auctions', 'mercari'] as SiteId[]) {
      expect(amount(jauce(site), 'service-fee'), site).toBe(400);
    }
  });

  test('Jauce charges per unit — three of the same item is three fees', () => {
    // Neokyo / ZenMarket / FROM JAPAN と違い「同一商品は1回」の明記が無い。落札ごとに課金する。
    const row = one('jauce', { site: 'suruga-ya', qty: 3 });
    expect(amount(row, 'service-fee')).toBe(3000);
    expect(amount(row, 'ad-valorem')).toBe(2400);
  });

  test('Rakuten and Yahoo! Shopping are free in beta — but the bank fee and packing are not', () => {
    for (const site of ['rakuten', 'yahoo-shopping'] as SiteId[]) {
      const row = jauce(site);
      expect(amount(row, 'service-fee'), site).toBe(0);
      expect(amount(row, 'ad-valorem'), site).toBe(0);
      expect(amount(row, 'bank-fee'), site).toBe(300);
      expect(amount(row, 'packing'), site).toBe(540);
      expect(line(row, 'service-fee').note, site).toContain('1 free');
    }
  });

  test('a mixed basket charges only the chargeable item and says how many were free', () => {
    const row = byService(rowsFor([
      item({ id: 'a', site: 'rakuten', priceYen: 10000 }),
      item({ id: 'b', site: 'yahoo-auctions', priceYen: 10000 }),
    ]), 'jauce');
    expect(amount(row, 'service-fee')).toBe(400);
    expect(amount(row, 'ad-valorem')).toBe(800);   // 8% は課金対象の ¥10,000 だけに掛かる
    expect(line(row, 'ad-valorem').note).toContain('free in beta');
  });

  test('the banking fee is ¥300 per payment and scales with orders, not items', () => {
    // 公式の計算例（落札 ¥50,000 → 合計 ¥54,820）にも入っている実在の費目。
    expect(amount(one('jauce', { qty: 5 }), 'bank-fee')).toBe(300);
    const two = byService(rowsFor([item({ id: 'a' }), item({ id: 'b' })]), 'jauce');
    expect(amount(two, 'bank-fee')).toBe(600);
    expect(line(two, 'bank-fee').tier).toBe('fixed');
    expect(line(two, 'bank-fee').note).toContain('once per seller per day');
  });

  test('packing is ¥300 per parcel plus ¥120 per started kg from the first gram', () => {
    const pack = (weightG: number) => amount(one('jauce', { weightG }), 'packing');
    expect(pack(200)).toBe(420);   // gross 540 g   → 1 kg 開始
    expect(pack(600)).toBe(540);   // gross 1,020 g → 2 kg 開始
    expect(pack(3000)).toBe(780);  // gross 3,900 g → 4 kg 開始
    expect(pack(5000)).toBe(1140); // gross 6,300 g → 7 kg 開始
  });

  test('the deposit is ¥40 flat then a 3.9% gross-up, and is still flagged unverified', () => {
    const row = one('jauce');
    const idx = row.lines.findIndex((l) => l.key === 'deposit');
    const base = row.lines.slice(0, idx).reduce((a, l) => a + (l.amount ?? 0), 0) + 40;
    expect(amount(row, 'deposit')).toBe(Math.round(40 + (base / (1 - 0.039) - base)));
    // 原文未確認の解釈。fixed に格上げするなら先に原文を取ること。
    expect(row.lines[idx]!.tier).toBe('unverified');
  });
});
