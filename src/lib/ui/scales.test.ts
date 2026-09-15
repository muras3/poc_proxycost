import { describe, expect, test } from 'vitest';
import { arrivalBarStops, linearPct, logPct, totalBarStops } from './scales';

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
  test('null when either bound is unknown (no fabricated numeric bar)', () => {
    expect(arrivalBarStops({ minDays: null, maxDays: 10 }, 1, 90)).toBeNull();
    expect(arrivalBarStops({ minDays: 5, maxDays: null }, 1, 90)).toBeNull();
    expect(arrivalBarStops({ minDays: null, maxDays: null }, 1, 90)).toBeNull();
  });
  test('returns ordered low/high percentages when both bounds are known', () => {
    const s = arrivalBarStops({ minDays: 12, maxDays: 26 }, 1, 90)!;
    expect(s.lowPct).toBeLessThanOrEqual(s.highPct);
  });
});
