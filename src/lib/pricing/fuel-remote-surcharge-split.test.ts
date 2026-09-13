import { describe, expect, test } from 'vitest';
import { compare } from './compare';
import type { Item } from './types';

/**
 * **2026-09-13、オーナー決定の検証。**燃油サーチャージ・遠隔地サーチャージを
 * 分離した後の宅配便の行の振る舞いを固定する。
 *
 * - 燃油: 行を立てない・計上しない。
 * - 遠隔地: 総額（`total.low`/`total.high`）を動かさない・`rankIndeterminate`
 *   の原因にならない。ただし `total.high` が閉じても「確定」ではないので
 *   `Row.closedByAssumption` に依存の印が残る。
 */

const item = (weightG: number, priceYen = 6000): Item => ({
  id: 'i', title: 't', priceYen, priceTier: 'fixed', site: 'yahoo-auctions',
  weightG, weightTier: 'fixed', qty: 1,
});

describe('courier fuel/remote-area surcharge split (2026-09-13 owner decision)', () => {
  test('no courier row carries a courier-destination-fees / fuel / remote-area line', () => {
    for (const country of ['US', 'GB', 'DE', 'FR', 'AU', 'CA', 'SG'] as const) {
      for (const method of [
        'courier-fedex', 'courier-ups', 'courier-dhl', 'courier-ecms', 'courier-buyee-air',
      ] as const) {
        const rows = compare({ items: [item(600)], country, method }).rows;
        for (const row of rows) {
          const keys = row.lines.map((l) => l.key);
          expect(keys, `${country}/${method}/${row.id}`).not.toContain('courier-destination-fees');
          expect(keys.some((k) => k.includes('fuel'))).toBe(false);
          expect(keys.some((k) => k.includes('remote-area'))).toBe(false);
        }
      }
    }
  });

  test('a courier row whose only prior unknown was courier-destination-fees now has total.high closed', () => {
    // GB・Buyee-Air（自社便）、高額カート: 他に未取得の費目が無い一つの実測条件
    // ——旧仕様ではこの行1つだけが total.high を開いていた。
    const rows = compare({ items: [item(600, 300_000)], country: 'GB', method: 'courier-buyee-air' }).rows;
    const row = rows.find((r) => r.serviceId === 'buyee')!;
    expect(row.total.high).not.toBeNull();
    expect(row.total.high).toBe(row.total.low);
  });

  test('the row is marked as closed by assumption, not as a genuine determination', () => {
    const rows = compare({ items: [item(600, 300_000)], country: 'GB', method: 'courier-buyee-air' }).rows;
    const row = rows.find((r) => r.serviceId === 'buyee')!;
    expect(row.closedByAssumption).toEqual(
      expect.arrayContaining(['courier-fuel-surcharge-included', 'courier-remote-area-surcharge-excluded']),
    );
  });

  test('a postal (non-courier) row is never marked closedByAssumption for this reason', () => {
    const rows = compare({ items: [item(600)], country: 'DE', method: 'ems' }).rows;
    for (const row of rows) {
      expect(row.closedByAssumption).toEqual([]);
    }
  });

  test('removing the fuel/remote-area line does not change total.low for any row (no amount was ever added)', () => {
    // 旧行は amount: null（計上ゼロ）だったので、削除しても total.low は変わらない
    // ——これは「加算していなかった」ことの直接の証拠になる。
    const rows = compare({ items: [item(600)], country: 'DE', method: 'courier-ups' }).rows;
    const row = rows.find((r) => r.serviceId === 'zenmarket')!;
    const sumOfLines = row.lines.reduce((a, l) => a + (l.amount ?? 0), 0);
    expect(row.total.low).toBe(sumOfLines);
  });
});
