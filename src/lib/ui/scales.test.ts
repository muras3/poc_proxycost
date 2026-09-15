import { describe, expect, test } from 'vitest';
import { arrivalBarStops, linearPct, logPct, parseDaysDisplay, totalBarStops } from './scales';

describe('linearPct', () => {
  test('maps 0..domainMax to 0..100', () => {
    expect(linearPct(0, 100)).toBe(0);
    expect(linearPct(50, 100)).toBe(50);
    expect(linearPct(100, 100)).toBe(100);
  });
  test('clamps above domainMax', () => {
    expect(linearPct(150, 100)).toBe(100);
  });
  test('domainMax <= 0 never divides by zero or goes negative', () => {
    expect(linearPct(50, 0)).toBe(0);
    expect(linearPct(50, -10)).toBe(0);
  });
});

describe('totalBarStops', () => {
  test('closed interval gives both stops, upperUnknown false', () => {
    const s = totalBarStops({ low: 25, high: 75 }, 100);
    expect(s).toEqual({ lowPct: 25, highPct: 75, upperUnknown: false });
  });
  test('high === null never fabricates an upper stop', () => {
    const s = totalBarStops({ low: 40, high: null }, 100);
    expect(s.lowPct).toBe(40);
    expect(s.highPct).toBeNull();
    expect(s.upperUnknown).toBe(true);
  });
  test('high === low collapses to a point (zero-width band)', () => {
    const s = totalBarStops({ low: 60, high: 60 }, 100);
    expect(s.lowPct).toBe(s.highPct);
  });
});

describe('logPct', () => {
  test('endpoints map to 0 and 100', () => {
    expect(logPct(1, 1, 100)).toBe(0);
    expect(logPct(100, 1, 100)).toBe(100);
  });
  test('short durations are still visible next to long ones (not crushed near 0)', () => {
    // 2日 vs 90日: 線形なら2/90≈2.2%でほぼ見えないが、対数なら十分な幅を持つ。
    const shortPct = logPct(2, 1, 90);
    const linearEquivalent = (2 / 90) * 100;
    expect(shortPct).toBeGreaterThan(linearEquivalent * 3);
  });
  test('degenerate domain (max <= min) never throws or divides by zero', () => {
    expect(() => logPct(5, 10, 10)).not.toThrow();
    expect(Number.isFinite(logPct(5, 10, 10))).toBe(true);
  });
});

describe('arrivalBarStops', () => {
  // **Fable レビュー（コーディネーター経由）後の再設計。**以前は片方でも
  // null なら `null`（呼び出し側はテキストのみのフォールバック）を返していた
  // ——結果、EMS・小形包装物・宅配便のような「上限だけ／どちらも未知」の行が
  // 軒並み棒を1本も描かずに終わっていた（台帳）。今は**必ず4点を返す**。
  test('both bounds known: exact stops, no fade', () => {
    const s = arrivalBarStops({ minDays: 12, maxDays: 26 }, 1, 90);
    expect(s.lowPct).toBeLessThanOrEqual(s.highPct);
    expect(s.fadeLow).toBe(false);
    expect(s.fadeHigh).toBe(false);
  });
  test('"X days or less" (min unknown): starts at the domain floor, fades the start', () => {
    const s = arrivalBarStops({ minDays: null, maxDays: 10 }, 1, 90);
    expect(s.lowPct).toBe(0);
    expect(s.highPct).toBeGreaterThan(0);
    expect(s.fadeLow).toBe(true);
    expect(s.fadeHigh).toBe(false);
  });
  test('"at least N days" (max unknown): ends at the domain ceiling, fades the end', () => {
    const s = arrivalBarStops({ minDays: 30, maxDays: null }, 1, 90);
    expect(s.highPct).toBe(100);
    expect(s.fadeHigh).toBe(true);
    expect(s.fadeLow).toBe(false);
  });
  test('fully unknown (courier "not yet modeled"): spans the whole domain, both ends fade', () => {
    const s = arrivalBarStops({ minDays: null, maxDays: null }, 1, 90);
    expect(s.lowPct).toBe(0);
    expect(s.highPct).toBe(100);
    expect(s.fadeLow).toBe(true);
    expect(s.fadeHigh).toBe(true);
  });
  test('default domain is the fixed 1..90 day range (no args needed)', () => {
    const s = arrivalBarStops({ minDays: 1, maxDays: 90 });
    expect(s.lowPct).toBe(0);
    expect(s.highPct).toBe(100);
  });
});

describe('parseDaysDisplay', () => {
  test('passes through already-structured minDays/maxDays untouched', () => {
    expect(parseDaysDisplay({ minDays: 12, maxDays: 26, text: '12–26 days' }))
      .toEqual({ minDays: 12, maxDays: 26 });
  });
  test('"a week or less" converts to a 7-day ceiling — a unit conversion, not a guess', () => {
    expect(parseDaysDisplay({ minDays: null, maxDays: null, text: 'a week or less' }))
      .toEqual({ minDays: null, maxDays: 7 });
  });
  test('month-scale text is never converted to days (would fabricate a number)', () => {
    expect(parseDaysDisplay({ minDays: null, maxDays: null, text: '1–3 months' }))
      .toEqual({ minDays: null, maxDays: null });
  });
  test('genuinely unpublished text stays fully unknown', () => {
    expect(parseDaysDisplay({ minDays: null, maxDays: null, text: 'not yet modeled' }))
      .toEqual({ minDays: null, maxDays: null });
    expect(parseDaysDisplay({ minDays: null, maxDays: null, text: 'transit time not published' }))
      .toEqual({ minDays: null, maxDays: null });
  });
});
