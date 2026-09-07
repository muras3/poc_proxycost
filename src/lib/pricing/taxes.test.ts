import { describe, expect, test } from 'vitest';
import { compare } from './compare';
import { COUNTRIES, COUNTRY_CODES } from './countries';
import { SERVICES } from './services';
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

  // ───────────────────────────────────────────────────────────────────────────
  // T17: 我々が原典に当たれていない数字を、確定の顔で出さない。
  // ───────────────────────────────────────────────────────────────────────────
  test('the EU flat €3 is charged but drawn as second-hand, in both EU countries', () => {
    // 制度の原文（EU の暫定定額関税ガイダンス）は取れている。取れていないのは
    // 「代行経由の購入が distance sale of imported goods に当たるか」で、
    // 当たらなければこの ¥489/点 は総額から丸ごと消える。額を出しつつ点線で描く。
    for (const cc of ['DE', 'FR'] as CountryCode[]) {
      for (const row of rowsFor(cc)) {
        const duty = line(row, 'duty');
        expect(duty.amount, `${cc} ${row.id}`).toBeGreaterThan(0);
        expect(duty.tier, `${cc} ${row.id}`).toBe('unverified');
      }
      expect(COUNTRIES[cc].dutyTier, cc).toBe('unverified');
    }
  });

  test('ZenMarket 3.5% deposit fee is our figure — the page says only "from 1%"', () => {
    const zen = rowsFor('US').find((r) => r.serviceId === 'zenmarket')!;
    const deposit = line(zen, 'deposit');
    expect(deposit.amount).toBeGreaterThan(0);
    expect(deposit.tier).toBe('estimate');
    expect(deposit.note).toContain('from 1%');
    // 推定が1つでも混ざれば総額に `~` が付く。
    expect(zen.approximate).toBe(true);
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

// ─────────────────────────────────────────────────────────────────────────────
// T15: 代行が販売時点で徴収する GST（AU ≤A$1,000・SG <S$400）。
// **確認できた社は数値、確認できていない社は「—」。** 未検証のまま非対称に実装しない
// ＝「調べていないから安い」を作らない。どちらがどちらかをここで固定する。
// ─────────────────────────────────────────────────────────────────────────────

/** 一次情報で「自社が徴収する」と確認できた社（確認日 2026-09-06）。 */
const COLLECTS: Record<'AU' | 'SG', string[]> = {
  // 5社とも自社ページに明記。豪州は全社そろっている。
  AU: ['neokyo', 'zenmarket', 'fromjapan', 'buyee', 'jauce'],
  // Buyee と FROM JAPAN だけ。他3社は自社ページに記載が無く、確認できていない。
  SG: ['buyee', 'fromjapan'],
};

const PREPAID = 'prepaid-import-tax';
const nonTaxLines = (row: Row) =>
  row.lines.filter((l) => !['duty', 'vat', 'province-tax', 'clearance', PREPAID, 'duty-prepayment']
    .includes(l.key));

describe('the GST the service collects at checkout is shown per service', () => {
  test('Australia: every one of the five says it collects, so every row carries a number', () => {
    const rows = rowsFor('AU', 3000, 5);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const l = line(row, PREPAID);
      expect(COLLECTS.AU, row.id).toContain(row.serviceId);
      expect(l.label, row.id).toBe('GST collected at checkout');
      expect(l.amount, row.id).toBeGreaterThan(0);
      expect(l.tier, row.id).toBe('fixed');
      expect(l.sourceUrl, row.id).toMatch(/^https:\/\//);
      // 総額に入る。開示ではなく実費として積む。
      expect(row.total, row.id).toBe(row.lines.reduce((a, x) => a + (x.amount ?? 0), 0));
      expect(row.excluded, row.id).not.toContain(l.label);
    }
  });

  test('Singapore: only the two we could confirm carry a number — the rest show a dash', () => {
    const rows = rowsFor('SG', 3000, 5);
    for (const row of rows) {
      const l = line(row, PREPAID);
      if (COLLECTS.SG.includes(row.serviceId)) {
        expect(l.amount, row.id).toBeGreaterThan(0);
        expect(l.tier, row.id).toBe('fixed');
        expect(l.label, row.id).toBe('GST collected at checkout');
      } else {
        // **0 ではなく null。** 0 と書けば「この社では GST が要らない」という嘘になる。
        expect(l.amount, row.id).toBeNull();
        expect(l.tier, row.id).toBe('none');
        expect(l.label, row.id)
          .toBe('GST collected at checkout — we could not confirm whether this service collects it');
        // **社名は入れない。**この文言は全社の列に掛かる見出しにも出るので、
        // ここで名指しすると他社の金額にまでその社の話が付いてしまう。
        expect(l.label, row.id).not.toContain(row.serviceName);
        // 総額から抜けていることが画面に出る。
        expect(row.excluded, row.id).toContain(l.label);
      }
    }
    // 確認できた社／できていない社が、両方ちゃんと表に出ていること。
    const withNumber = rows.filter((r) => line(r, PREPAID).amount != null).map((r) => r.serviceId);
    const withDash = rows.filter((r) => line(r, PREPAID).amount == null).map((r) => r.serviceId);
    expect(new Set(withNumber)).toEqual(new Set(COLLECTS.SG));
    expect(withDash.length).toBeGreaterThan(0);
    expect(new Set(withDash)).toEqual(
      new Set(SERVICES.map((s) => s.id).filter((id) => !COLLECTS.SG.includes(id))));
  });

  test('the tax is charged once: the border line is zero while the service collects it', () => {
    for (const cc of ['AU', 'SG'] as const) {
      for (const row of rowsFor(cc, 3000, 5)) {
        const vat = line(row, 'vat');
        expect(vat.amount, `${cc} ${row.id}`).toBe(0);
        expect(vat.note, `${cc} ${row.id}`).toContain('collected at checkout by the service');
        expect(row.lines.filter((l) => l.key === PREPAID).length, `${cc} ${row.id}`).toBe(1);
      }
    }
  });

  test('each base is the one that service publishes, not one we averaged', () => {
    const rows = rowsFor('AU', 3000, 5);
    const row = (id: string) => rows.find((r) => r.serviceId === id)!;
    const preTax = (r: Row) => nonTaxLines(r).reduce((a, l) => a + (l.amount ?? 0), 0);
    const shipping = (r: Row) => r.lines
      .filter((l) => ['domestic-shipping', 'packing', 'ems'].includes(l.key))
      .reduce((a, l) => a + (l.amount ?? 0), 0);

    // Neokyo・ZenMarket は「declared value（内容品価格）の 10%」と書いている。
    for (const id of ['neokyo', 'zenmarket']) {
      const r = row(id);
      expect(line(r, PREPAID).amount, id).toBe(Math.round(line(r, 'items').amount! * 0.10));
    }
    // FROM JAPAN・Jauce は「Charge 1 + Charge 2（総額）の 10%」。
    for (const id of ['fromjapan', 'jauce']) {
      const r = row(id);
      expect(line(r, PREPAID).amount, id).toBe(Math.round(preTax(r) * 0.10));
    }
    // Buyee は豪州のページに送料を挙げていない（徴収は購入手続きの時点）。
    const b = row('buyee');
    expect(line(b, PREPAID).amount).toBe(Math.round((preTax(b) - shipping(b)) * 0.10));
    // ベースが違えば額も違う。ここが全部同じになったら実装が原文を捨てている。
    expect(new Set(rows.map((r) => line(r, PREPAID).amount)).size).toBeGreaterThan(1);
  });

  test('above the threshold the border takes over and the checkout line goes away', () => {
    // AU: 商品代 A$1,000 超（¥200,000 は現行の為替で A$1,700 前後）。
    for (const row of rowsFor('AU', 200_000)) {
      expect(row.lines.some((l) => l.key === PREPAID), row.id).toBe(false);
      expect(line(row, 'vat').amount, row.id).toBeGreaterThan(0);
      expect(line(row, 'vat').note, row.id).not.toContain('checkout');
    }
    // SG: 商品代 S$400 超（¥100,000 は S$700 前後）。
    for (const row of rowsFor('SG', 100_000)) {
      expect(row.lines.some((l) => l.key === PREPAID), row.id).toBe(false);
      expect(line(row, 'vat').amount, row.id).toBeGreaterThan(0);
    }
  });

  test('no other destination grows a checkout tax we never confirmed', () => {
    for (const cc of COUNTRY_CODES) {
      if (cc === 'AU' || cc === 'SG') continue;
      for (const row of rowsFor(cc, 3000, 5)) {
        expect(row.lines.some((l) => l.key === PREPAID), `${cc} ${row.id}`).toBe(false);
      }
    }
  });

  test('the data itself keeps a source and a date for every claim we make', () => {
    for (const svc of SERVICES) {
      for (const cc of ['AU', 'SG'] as const) {
        const p = svc.prepaidImportTax?.[cc];
        if (!p) {
          expect(COLLECTS[cc], `${svc.id} ${cc}`).not.toContain(svc.id);
          continue;
        }
        expect(COLLECTS[cc], `${svc.id} ${cc}`).toContain(svc.id);
        expect(p.sourceUrl, `${svc.id} ${cc}`).toMatch(/^https:\/\//);
        expect(p.checkedOn, `${svc.id} ${cc}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(p.rate, `${svc.id} ${cc}`).toBe(cc === 'AU' ? 0.10 : 0.09);
        expect(p.tier, `${svc.id} ${cc}`).toBe('fixed');
      }
    }
  });

  test('the country table keeps the band the whole branch turns on', () => {
    expect(COUNTRIES.AU.sellerCollectsBelow).toBe(1000);
    expect(COUNTRIES.SG.sellerCollectsBelow).toBe(400);
    for (const cc of COUNTRY_CODES) {
      if (cc === 'AU' || cc === 'SG') continue;
      expect(COUNTRIES[cc].sellerCollectsBelow, cc).toBeNull();
    }
  });
});
