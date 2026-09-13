import { describe, expect, test } from 'vitest';
import { leadWordFor } from './RankBoard';
import type { CompareResult, Row } from '@/lib/pricing/types';

/**
 * **2026-09-13、オーナー修正（訂正2）。**燃油込み・遠隔地除外という未確認の仮定に
 * 依存して `total.high` が閉じた行は、一次情報で確定した行と同じ強さの
 * 「CHEAPEST」で呼ばない——「ESTIMATED CHEAPEST」に弱める。
 * `rankIndeterminate` のときは従来どおり「LEADS」が最優先。
 */

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: 'x', serviceId: 'x', serviceName: 'X', variant: null, label: 'X', tag: '',
    lines: [], total: { low: 100, high: 100 }, rankHigh: 100, closedByAssumption: [],
    excluded: [], parcels: 1, method: 'ems', rank: 1, diff: 0, cheapest: true,
    tied: false, recommended: false, equivalent: false, paysUs: false, referralNote: null,
    surface: null, comparable: true,
    ...overrides,
  } as unknown as Row;
}

function result(overrides: Partial<CompareResult> = {}): CompareResult {
  return { rows: [], rankIndeterminate: false, rowDiffRange: null, ...overrides } as unknown as CompareResult;
}

describe('leadWordFor (RankBoard green label, 2026-09-13 owner correction)', () => {
  test('rankIndeterminate always wins with LEADS, regardless of closedByAssumption', () => {
    expect(leadWordFor(row({ closedByAssumption: ['courier-fuel-surcharge-included'] }), result({ rankIndeterminate: true }))).toBe('LEADS');
    expect(leadWordFor(row({ closedByAssumption: [] }), result({ rankIndeterminate: true }))).toBe('LEADS');
  });

  test('a row closed only via the fuel/remote-area assumption gets ESTIMATED CHEAPEST, not CHEAPEST', () => {
    const r = row({
      closedByAssumption: ['courier-fuel-surcharge-included', 'courier-remote-area-surcharge-excluded'],
    });
    expect(leadWordFor(r, result({ rankIndeterminate: false }))).toBe('ESTIMATED CHEAPEST');
  });

  test('a row with no assumption dependency keeps the full-strength CHEAPEST', () => {
    const r = row({ closedByAssumption: [] });
    expect(leadWordFor(r, result({ rankIndeterminate: false }))).toBe('CHEAPEST');
  });
});
