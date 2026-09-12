import { describe, expect, it } from 'vitest';
import { compare } from '@/lib/pricing/compare';
import type { CompareResult, Item, Row } from '@/lib/pricing/types';
import { consolidationCalloutData } from './ConsolidationCallout';

function item(over: Partial<Item> & { id: string }): Item {
  return {
    title: over.id, priceYen: 3000, priceTier: 'fixed', site: 'yahoo-auctions',
    weightG: 600, weightTier: 'estimate', qty: 1, ...over,
  };
}

function items(n: number): Item[] {
  return Array.from({ length: n }, (_, i) => item({ id: `i${i}` }));
}

function withRows(rows: Row[]): CompareResult {
  return { rows, bands: null, rowTotalRange: null, rowDiffRange: null } as CompareResult;
}

describe('consolidationCalloutData - F4: total.high === null な行を free と言い切らない', () => {
  // 実際の compare() を走らせて確かめた行(3点・AU 宛)。Buyee は default/consolidated
  // の2行に分かれる: default は3個口ぶんの通関手数料の帯が閉じて high === low
  // (36,839円)、consolidated は1個口にまとまり総額が下がる(29,326円)が、いまの
  // F14 のティア(services.ts - package consolidation が Buyee で未取得)のせいで
  // con.total.high === null。これが free と言い切れない当の状態。
  it('con.total.high === null の間は feeUnconfirmed = true - free と言い切れない', () => {
    const rows = compare({ method: 'ems', items: items(3), country: 'AU' }).rows;
    const def = rows.find((r) => r.id === 'buyee:default')!;
    const con = rows.find((r) => r.id === 'buyee:consolidated')!;
    expect(def.total.high).toBe(def.total.low); // 対照: default 側は閉じている
    expect(con.total.high).toBeNull();

    const data = consolidationCalloutData(withRows(rows));
    expect(data).not.toBeNull();
    expect(data!.feeUnconfirmed).toBe(true);
    expect(data!.savingText).toBe(`¥${(def.total.low - con.total.low).toLocaleString('en-US')}`);
  });

  it('total.high === null な行が free を主張しない - 構造的に con.total.high から導く', () => {
    // con.total.high を人工的に閉じる(F14 のティアが将来変わって上限が置ける
    // ようになった場合の再現)。定数を見ているのではなく total.high を見ている
    // ことを確かめる: 同じ入力から con.total.high だけ変えて挙動が変わることを見る。
    const rows = compare({ method: 'ems', items: items(3), country: 'AU' }).rows;
    const conIndex = rows.findIndex((r) => r.id === 'buyee:consolidated');
    const closed = [...rows];
    closed[conIndex] = { ...closed[conIndex]!, total: { ...closed[conIndex]!.total, high: closed[conIndex]!.total.low } };

    const data = consolidationCalloutData(withRows(closed));
    expect(data).not.toBeNull();
    expect(data!.feeUnconfirmed).toBe(false);
  });

  it('def/con のどちらかが無ければ何も出さない', () => {
    expect(consolidationCalloutData(withRows([]))).toBeNull();
  });

  it('同梱しても総額が減らないなら出さない(言うことが無い)', () => {
    const rows = compare({ method: 'ems', items: items(3), country: 'AU' }).rows;
    const defIndex = rows.findIndex((r) => r.id === 'buyee:default');
    const conIndex = rows.findIndex((r) => r.id === 'buyee:consolidated');
    const noSaving = [...rows];
    noSaving[defIndex] = { ...noSaving[defIndex]!, total: { ...noSaving[defIndex]!.total, low: noSaving[conIndex]!.total.low } };

    expect(consolidationCalloutData(withRows(noSaving))).toBeNull();
  });
});
