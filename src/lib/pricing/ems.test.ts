import { describe, expect, test } from 'vitest';
import {
  EMS_MAX_INDEX, EMS_TABLE, EMS_ZONE, UNKNOWN_WEIGHT_STEPS_G,
  emsFor, emsStepGrams, emsStepIndex, emsYen, formatStep,
} from './ems';
import { COUNTRY_CODES } from './countries';

describe('the published EMS table', () => {
  test('27 steps, each with five zones', () => {
    expect(EMS_TABLE).toHaveLength(27);
    expect(EMS_MAX_INDEX).toBe(26);
    for (const row of EMS_TABLE) {
      expect(row).toHaveLength(6); // [上限g, 第1〜第5帯]
      for (const n of row) expect(Number.isFinite(n)).toBe(true);
    }
  });

  test('steps run from 500 g to 15 kg and never go backwards', () => {
    const limits = EMS_TABLE.map((r) => r[0]!);
    expect(limits[0]).toBe(500);
    expect(limits[limits.length - 1]).toBe(15000);
    for (let i = 1; i < limits.length; i++) expect(limits[i]!).toBeGreaterThan(limits[i - 1]!);
  });

  test('inside a zone the price never falls as the parcel gets heavier', () => {
    for (let zone = 1; zone <= 5; zone++) {
      for (let i = 1; i < EMS_TABLE.length; i++) {
        expect(EMS_TABLE[i]![zone]!).toBeGreaterThan(EMS_TABLE[i - 1]![zone]!);
      }
    }
  });
});

describe('step boundaries', () => {
  test('500 g exactly is still the first step; 501 g is the second', () => {
    expect(emsStepIndex(500)).toBe(0);
    expect(emsStepIndex(501)).toBe(1);
    expect(emsFor(500, 4).yen).toBe(3900);
    expect(emsFor(501, 4).yen).toBe(4180);
    expect(emsFor(500, 4).stepG).toBe(500);
    expect(emsFor(501, 4).stepG).toBe(600);
  });

  test('a step covers everything above the previous limit up to its own', () => {
    expect(emsStepIndex(1)).toBe(0);
    expect(emsStepIndex(600)).toBe(1);
    expect(emsStepIndex(1000)).toBe(5);
    expect(emsStepIndex(1001)).toBe(6);   // 1,250 g の段
    expect(emsStepIndex(1250)).toBe(6);
    expect(emsStepIndex(1251)).toBe(7);   // 1,500 g の段
    expect(emsStepIndex(15000)).toBe(26);
  });

  test('over 15 kg is rounded into the top step instead of being dropped', () => {
    expect(emsStepIndex(15001)).toBe(EMS_MAX_INDEX);
    expect(emsStepIndex(30000)).toBe(EMS_MAX_INDEX);
    expect(emsStepIndex(1_000_000)).toBe(EMS_MAX_INDEX);
    expect(emsFor(99999, 4).yen).toBe(emsFor(15000, 4).yen);
    expect(emsFor(99999, 4).stepG).toBe(15000);
  });

  test('the zone column is read straight off the table', () => {
    expect(emsYen(0, 4)).toBe(3900);
    expect(emsYen(1, 4)).toBe(4180);
    expect(emsYen(0, 1)).toBe(1450);
    expect(emsYen(0, 2)).toBe(1900);
    expect(emsYen(0, 3)).toBe(3150);
    expect(emsYen(0, 5)).toBe(3600);
    expect(emsYen(EMS_MAX_INDEX, 4)).toBe(39100);
  });

  test('indices out of range are clamped, not thrown', () => {
    expect(emsYen(-5, 4)).toBe(3900);
    expect(emsYen(999, 4)).toBe(39100);
    expect(emsStepGrams(-1)).toBe(500);
    expect(emsStepGrams(999)).toBe(15000);
  });

  test('a step offset moves by whole steps and stays inside the table', () => {
    expect(emsFor(500, 4, 1).yen).toBe(4180);
    expect(emsFor(500, 4, 2).stepG).toBe(700);
    expect(emsFor(500, 4, -3).yen).toBe(3900);        // 下にはみ出しても第1段
    expect(emsFor(15000, 4, 3).stepG).toBe(15000);    // 上にはみ出しても最上段
  });
});

describe('zones and labels', () => {
  test('every country we ship to has a zone', () => {
    for (const cc of COUNTRY_CODES) {
      expect(EMS_ZONE[cc]).toBeGreaterThanOrEqual(1);
      expect(EMS_ZONE[cc]).toBeLessThanOrEqual(5);
    }
    expect(EMS_ZONE.US).toBe(4);
    expect(EMS_ZONE.SG).toBe(2);
    expect([EMS_ZONE.GB, EMS_ZONE.DE, EMS_ZONE.FR, EMS_ZONE.AU, EMS_ZONE.CA]).toEqual([3, 3, 3, 3, 3]);
  });

  test('the US is more expensive than Singapore at the same weight', () => {
    expect(emsFor(1000, EMS_ZONE.US).yen).toBeGreaterThan(emsFor(1000, EMS_ZONE.SG).yen);
  });

  test('labels read as grams below a kilo and kilos above', () => {
    expect(formatStep(500)).toBe('500 g');
    expect(formatStep(900)).toBe('900 g');
    expect(formatStep(1000)).toBe('1 kg');
    expect(formatStep(1250)).toBe('1.3 kg');
    expect(formatStep(1500)).toBe('1.5 kg');
    expect(formatStep(15000)).toBe('15 kg');
  });
});

describe('the steps we show when the weight is unknown', () => {
  test('six of them, each a real EMS step', () => {
    expect([...UNKNOWN_WEIGHT_STEPS_G]).toEqual([500, 1000, 1500, 2000, 3000, 5000]);
    const limits = new Set(EMS_TABLE.map((r) => r[0]!));
    for (const g of UNKNOWN_WEIGHT_STEPS_G) expect(limits.has(g)).toBe(true);
  });

  test('no two of them land on the same EMS row', () => {
    const idx = UNKNOWN_WEIGHT_STEPS_G.map((g) => emsStepIndex(g));
    expect(new Set(idx).size).toBe(idx.length);
  });
});
