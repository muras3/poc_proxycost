import { describe, expect, test } from 'vitest';
import { courierCoverageFor } from './services';
import { COURIER_METHODS, RANKED_COURIER_METHOD_IDS, courierMethodAvailable } from './postage';

// **画面（`EmsOnlyNote`/`MethodPicker`）が使う純関数だけをここで検査する。**
// `compare()` を通した配線（実際に選ばれる方式・`Row.surface`）は
// `courier-wiring.test.ts` が持つ。

describe('courierCoverageFor (EmsOnlyNote の国別開示)', () => {
  test('US: 4社が価格化済み、Jauce だけ courier グリッドが無い', () => {
    const c = courierCoverageFor('US');
    expect(c.pricedServiceNames.sort()).toEqual(
      ['Buyee', 'FROM JAPAN', 'Neokyo', 'ZenMarket'].sort(),
    );
    expect(c.unpricedServiceNames).toEqual([]);
    expect(c.noCourierServiceNames).toEqual(['Jauce']);
  });

  test('未測定の国（GB）: 4社とも「調べていない」側に落ち、価格化済みは0社', () => {
    const c = courierCoverageFor('GB');
    expect(c.pricedServiceNames).toEqual([]);
    expect(c.unpricedServiceNames.sort()).toEqual(
      ['Buyee', 'FROM JAPAN', 'Neokyo', 'ZenMarket'].sort(),
    );
    expect(c.noCourierServiceNames).toEqual(['Jauce']);
  });

  test('7か国全部を通しても、価格化済み・未測定・対象外のどれか1つにだけ入る', () => {
    for (const cc of ['US', 'GB', 'DE', 'FR', 'AU', 'CA', 'SG'] as const) {
      const c = courierCoverageFor(cc);
      const total = c.pricedServiceNames.length + c.unpricedServiceNames.length
        + c.noCourierServiceNames.length;
      expect(total, cc).toBe(5); // 5社総数（Jauce 含む）
    }
  });
});

describe('courierMethodAvailable / COURIER_METHODS (MethodPicker の選択肢)', () => {
  test('ZenMarket の SURFACE 便 (courier-surface) はランキング候補には出さない', () => {
    expect(RANKED_COURIER_METHOD_IDS).not.toContain('courier-surface');
  });

  test('米国宛では、実際にデータを持つ便が available になる', () => {
    expect(courierMethodAvailable('courier-fedex', 'US')).toBe(true); // ZenMarket FEDEX
    expect(courierMethodAvailable('courier-dhl-express-1200', 'US')).toBe(true); // Neokyo
  });

  test('未測定の国では同じ便 id が available:false になる（¥0 に見せない）', () => {
    expect(courierMethodAvailable('courier-fedex', 'GB')).toBe(false);
    expect(courierMethodAvailable('courier-dhl-express-1200', 'DE')).toBe(false);
  });

  test('COURIER_METHODS は全便に非空の label と days を持つ', () => {
    expect(COURIER_METHODS.length).toBe(RANKED_COURIER_METHOD_IDS.length);
    for (const m of COURIER_METHODS) {
      expect(m.label.length, m.id).toBeGreaterThan(0);
      expect(m.days.length, m.id).toBeGreaterThan(0);
    }
  });
});
