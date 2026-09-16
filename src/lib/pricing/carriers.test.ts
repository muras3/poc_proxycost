import { describe, expect, it } from 'vitest';
import { compare } from './compare';
import {
  CARRIER_IDS, CARRIER_NAMES, carrierIdOfChoice, carrierOf, methodsOfCarrier,
} from './carriers';
import { POSTAL_METHODS, RANKED_COURIER_METHOD_IDS } from './postage';
import type { CompareInput, CountryCode, CourierMethod, Item, PostalMethod } from './types';

/**
 * **運送会社の単位で選ぶ（オーナー確定 2026-09-16）。**
 *
 * 検査するのは2つ。
 * 1. 対応表が漏れない・重ならない（`carrierOf` が順位候補の全 ID を1社ずつに割る）。
 * 2. 会社を指定したとき、**その社が扱うその会社の便のうち総額が最安の便**が
 *    行に使われる。送料だけで比べていないことも見る（総額で比べる規約は
 *    `docs/audit/cheapest-by-total-2026-09-13.md` の是正と同じ）。
 *
 * `'cheapest'` が1円も動いていないことは `compare-numeric-invariance.test.ts` の
 * digest（7カ国×9重量×3価格×6方式）が見ている——**候補集合を絞る分岐を足しただけで
 * 既定の経路には触れていない**ので、あちらが通ることがそのまま不変の証拠になる。
 */

function mkItem(priceYen: number, weightG: number): Item {
  return {
    id: 'i1', title: 'Test item', priceYen, priceTier: 'fixed', site: 'yahoo-auctions',
    weightG, weightTier: 'fixed', qty: 1,
  };
}

const RANKED: readonly (PostalMethod | CourierMethod)[] = [
  ...POSTAL_METHODS.map((m) => m.id).filter((m) => !m.endsWith('-surface')),
  ...RANKED_COURIER_METHOD_IDS,
];

describe('carriers: 対応表は漏れない・重ならない', () => {
  it('順位候補のどの便もちょうど1社に属する', () => {
    const seen = new Set<string>();
    for (const id of CARRIER_IDS) {
      for (const m of methodsOfCarrier(id)) {
        expect(seen.has(m), `${m} が2社に属している`).toBe(false);
        seen.add(m);
        expect(carrierOf(m)).toBe(id);
      }
    }
    expect([...seen].sort()).toEqual([...RANKED].sort());
  });

  it('船便は運送会社の候補に入らない（既定から外すのと同じ規約）', () => {
    const all = CARRIER_IDS.flatMap((id) => [...methodsOfCarrier(id)]);
    expect(all).not.toContain('small-packet-surface');
    expect(all).not.toContain('parcel-surface');
    expect(all).not.toContain('courier-surface');
  });

  it('選択肢の値は往復する', () => {
    for (const id of CARRIER_IDS) expect(carrierIdOfChoice(`carrier:${id}`)).toBe(id);
    expect(carrierIdOfChoice('cheapest')).toBeNull();
    expect(carrierIdOfChoice('ems')).toBeNull();
    expect(carrierIdOfChoice('carrier:nope')).toBeNull();
    // 社名は7つとも埋まっている（画面に出る唯一の出どころ）。
    for (const id of CARRIER_IDS) expect(CARRIER_NAMES[id]).toBeTruthy();
  });
});

describe('運送会社を指定したら、その社のその会社の便の中で総額が最安の便を使う', () => {
  const country: CountryCode = 'US';
  const items = [mkItem(30000, 3000)];
  const storageDays = 45;

  /** その行が、その社の同じ会社の他の便より総額で安い（か同額）ことを確かめる。 */
  function expectCheapestWithinCarrier(
    carrier: (typeof CARRIER_IDS)[number], cc: CountryCode = country,
  ) {
    const method = `carrier:${carrier}` as NonNullable<CompareInput['method']>;
    const rows = compare({ items, country: cc, method, storageDays }).rows
      .filter((r) => r.comparable);
    expect(rows.length, `${carrier}: 比べられる行が無い`).toBeGreaterThan(0);
    for (const row of rows) {
      // 選ばれた便はその会社のもの。
      expect(carrierOf(row.method), `${row.id}: 別の会社の便が選ばれている`).toBe(carrier);
      // 同じ社の同じ会社の他の便を1つずつ指名して、総額がこれより安いものが無いこと。
      for (const alt of methodsOfCarrier(carrier)) {
        const altRow = compare({ items, country: cc, method: alt, storageDays }).rows
          .find((r) => r.id === row.id);
        if (!altRow?.comparable) continue;
        const altShip = altRow.lines.find((l) => l.key === 'intl-shipping');
        if (!altShip || altShip.amount == null) continue;
        expect(
          altRow.total.low,
          `${row.id}: ${alt} の総額 ${altRow.total.low} が選ばれた ${row.method} の ${row.total.low} より安い`,
        ).toBeGreaterThanOrEqual(row.total.low);
      }
    }
  }

  it('複数の便を扱う会社（FedEx: 5便）', () => {
    expect(methodsOfCarrier('fedex').length).toBeGreaterThan(1);
    expectCheapestWithinCarrier('fedex');
  });

  it('複数の便を扱う会社（DHL: 4便）', () => {
    expect(methodsOfCarrier('dhl').length).toBeGreaterThan(1);
    expectCheapestWithinCarrier('dhl');
  });

  it('1便だけの会社（UPS）は必ずその便になる', () => {
    expect(methodsOfCarrier('ups')).toEqual(['courier-ups']);
    const rows = compare({
      items, country, method: 'carrier:ups', storageDays,
    }).rows.filter((r) => r.comparable);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.method).toBe('courier-ups');
  });

  it('郵便（Japan Post）は船便を除いた3方式の中から選ぶ', () => {
    expect([...methodsOfCarrier('japan-post')].sort())
      .toEqual(['ems', 'parcel-air', 'small-packet-air']);
    expectCheapestWithinCarrier('japan-post');
  });

  it('扱いの無い会社（SF Express）は、方式を名指しせずに「比べられない」と言う', () => {
    // どの社も `courier-sf-express` に価格を持っていない（`postage.ts`）。
    const res = compare({ items, country, method: 'carrier:sf-express', storageDays });
    expect(res.rows.some((r) => r.comparable)).toBe(false);
    // **名指ししない。**その社の便を1つも使えていないのに便名を出すと嘘になる
    // （`compare.ts` の `noPricedCandidate` と同じ理由）。
    for (const r of res.rows) {
      expect(r.notComparableReason ?? '').not.toContain('EMS');
    }
  });

  it('送料だけでなく総額で選ぶ（通関立替手数料が方式で違う会社で効く）', () => {
    // 送料の最安と総額の最安が食い違う便があるなら、選ばれるのは総額の方。
    for (const carrier of ['fedex', 'dhl', 'ecms'] as const) {
      const method = `carrier:${carrier}` as NonNullable<CompareInput['method']>;
      for (const row of compare({ items, country, method, storageDays }).rows) {
        if (!row.comparable) continue;
        const ship = (id: string) => {
          const alt = compare({
            items, country, method: id as NonNullable<CompareInput['method']>, storageDays,
          }).rows.find((r) => r.id === row.id);
          const line = alt?.lines.find((l) => l.key === 'intl-shipping');
          return alt?.comparable && line?.amount != null
            ? { shipYen: line.amount, totalLow: alt.total.low }
            : null;
        };
        const chosen = ship(row.method)!;
        const cheapestShip = [...methodsOfCarrier(carrier)]
          .map(ship).filter((x) => x != null)
          .sort((a, b) => a.shipYen - b.shipYen)[0]!;
        // 総額で選んでいる以上、選ばれた便の総額は「送料最安の便」の総額以下。
        expect(chosen.totalLow).toBeLessThanOrEqual(cheapestShip.totalLow);
      }
    }
  });
});
