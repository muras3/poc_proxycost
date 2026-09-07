import { describe, expect, test } from 'vitest';
import { POSTAL_METHODS, POSTAL_ZONE, maxGramsFor, postageFor } from './postage';
import { EMS_ZONE } from './ems';
import { COUNTRY_CODES } from './countries';
import type { CountryCode } from './types';
import type { PostalMethod } from './postage';

const METHODS = POSTAL_METHODS.map((m) => m.id);

describe('the zone table is the one for this method, not the one for EMS', () => {
  test('EMS puts the United States in zone 4; the other methods put it in zone 3', () => {
    // **地帯の割り方が方式で違う。**EMS の表を流用すると米国の額が全方式で狂う。
    // 出典の地帯一覧（`list-normal/zone{n}-list.html`）を7カ国すべて照合した結果。
    expect(EMS_ZONE.US).toBe(4);
    expect(POSTAL_ZONE.US).toBe(3);
    // 残りの6カ国は一致する。**一致していることも確かめる**——
    // 米国だけずれているという主張が、他国のずれを見落としていないこと。
    for (const cc of COUNTRY_CODES) {
      if (cc === 'US') continue;
      expect(POSTAL_ZONE[cc], cc).toBe(EMS_ZONE[cc]);
    }
  });

  test('every country the calculator ships to has a zone in every method', () => {
    for (const cc of COUNTRY_CODES) {
      expect(POSTAL_ZONE[cc], cc).toBeGreaterThan(0);
      for (const m of METHODS) expect(maxGramsFor(m, cc), `${m} ${cc}`).toBeGreaterThan(0);
    }
  });
});

describe('the tables are the published tables', () => {
  test('the spot values we transcribed match the source, zone by zone', () => {
    // 原文（2026-09-07 取得）から抜いた点。**表全体ではなく端と代表点**を押さえる。
    const at = (m: PostalMethod, cc: CountryCode, g: number) => postageFor(m, cc, g)?.yen;
    // 第3地帯（US/GB/DE/FR/AU/CA）
    expect(at('small-packet-air', 'DE', 100)).toBe(510);
    expect(at('small-packet-air', 'DE', 600)).toBe(1410);
    expect(at('small-packet-air', 'DE', 2000)).toBe(3930);
    expect(at('small-packet-surface', 'DE', 100)).toBe(480);
    expect(at('small-packet-surface', 'DE', 2000)).toBe(2200);
    expect(at('parcel-air', 'DE', 1000)).toBe(3850);
    expect(at('parcel-air', 'DE', 30000)).toBe(55200);
    expect(at('parcel-surface', 'DE', 3000)).toBe(3700);
    expect(at('parcel-surface', 'DE', 30000)).toBe(15900);
    // 第2地帯（SG）
    expect(at('small-packet-air', 'SG', 100)).toBe(380);
    expect(at('small-packet-air', 'SG', 2000)).toBe(2660);
    expect(at('parcel-air', 'SG', 1000)).toBe(2500);
    expect(at('parcel-surface', 'SG', 30000)).toBe(14600);
    // **米国は第3地帯**なので、EMS と違ってドイツと同額になる。
    expect(at('small-packet-air', 'US', 600)).toBe(at('small-packet-air', 'DE', 600));
    expect(at('parcel-surface', 'US', 3000)).toBe(at('parcel-surface', 'DE', 3000));
  });

  test('surface small packet is the same price in both zones — that is the source, not a typo', () => {
    for (const g of [100, 250, 500, 1000, 2000]) {
      expect(postageFor('small-packet-surface', 'SG', g)?.yen, `${g}g`)
        .toBe(postageFor('small-packet-surface', 'DE', g)?.yen);
    }
  });

  test('every table rises with weight — a heavier parcel is never cheaper', () => {
    for (const cc of COUNTRY_CODES) {
      for (const m of METHODS) {
        let prev = 0;
        for (let g = 50; g <= maxGramsFor(m, cc); g += 50) {
          const yen = postageFor(m, cc, g)!.yen;
          expect(yen, `${m} ${cc} ${g}g`).toBeGreaterThanOrEqual(prev);
          prev = yen;
        }
      }
    }
  });

  test('the step charged is the step at or above the actual weight, never below it', () => {
    for (const cc of COUNTRY_CODES) {
      for (const m of METHODS) {
        for (const g of [1, 99, 100, 101, 999, 1000, 1001]) {
          if (g > maxGramsFor(m, cc)) continue;
          const r = postageFor(m, cc, g)!;
          expect(r.stepGrams, `${m} ${cc} ${g}g`).toBeGreaterThanOrEqual(g);
        }
      }
    }
  });
});

describe('over the limit is "cannot be sent", not "the top row"', () => {
  test('small packet stops at 2 kg and returns nothing above it', () => {
    for (const cc of COUNTRY_CODES) {
      expect(maxGramsFor('small-packet-air', cc), cc).toBe(2000);
      expect(postageFor('small-packet-air', cc, 2000), cc).not.toBeNull();
      // **表の最後の段を当てない。**当てれば送れないものに値段が付く。
      expect(postageFor('small-packet-air', cc, 2001), cc).toBeNull();
      expect(postageFor('small-packet-surface', cc, 2001), cc).toBeNull();
    }
  });

  test('parcel stops at 30 kg', () => {
    for (const cc of COUNTRY_CODES) {
      expect(maxGramsFor('parcel-air', cc), cc).toBe(30_000);
      expect(postageFor('parcel-air', cc, 30_001), cc).toBeNull();
    }
  });

  test('zero and negative weight are not a shipment', () => {
    for (const m of METHODS) {
      expect(postageFor(m, 'DE', 0), m).toBeNull();
      expect(postageFor(m, 'DE', -1), m).toBeNull();
    }
  });
});

describe('which method is cheapest, at the weights that matter', () => {
  /** その重量を運べる方式を、安い順に。**運べない方式は候補に入れない。** */
  const cheapestFirst = (cc: CountryCode, g: number) => POSTAL_METHODS
    .map((spec) => ({ id: spec.id, yen: postageFor(spec.id, cc, g)?.yen }))
    .filter((x): x is { id: PostalMethod; yen: number } => x.yen != null)
    .sort((a, b) => a.yen - b.yen || a.id.localeCompare(b.id));

  test('at 600 g every method can carry it, and surface small packet is cheapest', () => {
    const got = cheapestFirst('DE', 600);
    expect(got.map((g) => g.id).sort()).toEqual([...METHODS].sort());
    expect(got[0]!.id).toBe('small-packet-surface');
    // 600g は「1.0kgまで ¥1,300」の段。¥800 は「500gまで」の段で 600g には当たらない。
    expect(got[0]!.yen).toBe(1300);
  });

  test('at 3 kg the small packet options are gone, not merely expensive', () => {
    const got = cheapestFirst('DE', 3000);
    expect(got.map((g) => g.id).sort()).toEqual(['ems', 'parcel-air', 'parcel-surface']);
    expect(got[0]!.id).toBe('parcel-surface');
    expect(got[0]!.yen).toBe(3700);
  });

  test('EMS is never the cheapest, in any country we ship to, at any weight', () => {
    // **既定を EMS にしていたことの評価。**EMS は速い代わりに、日本郵便の中で常に最安ではない。
    for (const cc of COUNTRY_CODES) {
      for (const g of [200, 600, 1000, 2000, 3000, 10_000]) {
        const got = cheapestFirst(cc, g);
        if (got.length < 2) continue;
        expect(got[0]!.id, `${cc} ${g}g`).not.toBe('ems');
      }
    }
  });

  test('above 30 kg nothing is left — the parcel cannot go by post at all', () => {
    expect(cheapestFirst('DE', 30_001)).toEqual([]);
  });
});

describe('every method carries its own evidence', () => {
  test('the days, their source and the tracking flag are all present', () => {
    for (const m of POSTAL_METHODS) {
      expect(m.label, m.id).toBeTruthy();
      // 数字を要求しない。**EMS の原文は「Less than a week」で数字が無い。**
      // 数字を要求すると、原文に無い精度を書かせることになる。
      expect(m.days.length, m.id).toBeGreaterThan(3);
      expect(m.daysSourceUrl, m.id).toMatch(/^https:\/\//);
      expect(typeof m.tracked, m.id).toBe('boolean');
    }
  });

  test('SAL is absent — the published table exists but Buyee says it is suspended', () => {
    // 日本郵便の料金表に SAL の行は残っているが、それは引き受けている意味ではない。
    // Buyee 原文「(Japan Post Economy Airmail) * Currently suspended」。
    expect(METHODS).not.toContain('sal');
    for (const m of POSTAL_METHODS) expect(m.label.toLowerCase()).not.toContain('sal');
  });

  test('couriers are absent, and that is a deliberate boundary', () => {
    // 宅配便は①料率非公開 ②通関が別モデル ③容積重量（寸法が入力に無い）。
    for (const m of POSTAL_METHODS) {
      for (const bad of ['fedex', 'dhl', 'ups', 'ecms']) {
        expect(m.label.toLowerCase(), m.id).not.toContain(bad);
      }
    }
  });
});
