import { describe, expect, it } from 'vitest';
import type { Item } from '@/lib/pricing/types';
import { computeBoxSplit, packedWeightFor } from './boxSplit';

function item(over: Partial<Item> & { id: string }): Item {
  return {
    title: over.id, priceYen: 1000, priceTier: 'estimate', site: 'other',
    weightG: 500, weightTier: 'estimate', weightOrigin: 'table', qty: 1, ...over,
  };
}

describe('computeBoxSplit', () => {
  it('カートが空なら空配列', () => {
    expect(computeBoxSplit([], 'US')).toEqual([]);
  });

  it('1点だけなら1箱、reason は shop（分割していないので既定は shop 扱い）', () => {
    const boxes = computeBoxSplit([item({ id: 'a', priceYen: 5000 })], 'US')!;
    expect(boxes).toHaveLength(1);
    expect(boxes[0]!.declaredYen).toBe(5000);
    expect(boxes[0]!.reason).toBe('shop');
  });

  it('**conservation**: 箱ごとの申告額の合計はカート全体の代金に一致する', () => {
    const items = [
      item({ id: 'a', priceYen: 3000, weightG: 5000, qty: 1 }),
      item({ id: 'b', priceYen: 2000, weightG: 5000, qty: 1 }),
      item({ id: 'c', priceYen: 4000, weightG: 5000, qty: 1 }),
      item({ id: 'd', priceYen: 1000, weightG: 5000, qty: 1 }),
      item({ id: 'e', priceYen: 6000, weightG: 5000, qty: 1 }),
    ];
    const boxes = computeBoxSplit(items, 'US')!;
    const total = items.reduce((a, i) => a + i.priceYen * i.qty, 0);
    expect(boxes.reduce((a, b) => a + b.declaredYen, 0)).toBe(total);
  });

  it('US / EMS / 5点×5000g は2箱に分かれ、reason は weight-limit', () => {
    const items = Array.from({ length: 5 }, (_, i) =>
      item({ id: `x${i}`, site: 'suruga-ya', weightG: 5000, priceYen: 1000 * (i + 1) }));
    const boxes = computeBoxSplit(items, 'US')!;
    expect(boxes.length).toBe(2);
    expect(boxes.every((b) => b.reason === 'weight-limit')).toBe(true);
    // 重い順に詰める＝各箱内の itemIndices は重量降順
    for (const b of boxes) {
      const weights = b.itemIndices.map((idx) => items[idx]!.weightG!);
      expect([...weights].sort((a, c) => c - a)).toEqual(weights);
    }
  });

  it('店舗が違えば箱も分かれ、reason は shop', () => {
    const items = [
      item({ id: 'a', site: 'rakuten', url: 'https://item.rakuten.co.jp/shop-a/123/' }),
      item({ id: 'b', site: 'rakuten', url: 'https://item.rakuten.co.jp/shop-b/456/' }),
    ];
    const boxes = computeBoxSplit(items, 'US')!;
    expect(boxes.length).toBe(2);
    expect(boxes.every((b) => b.reason === 'shop')).toBe(true);
  });

  it('免税しきい値: 申告額がしきい値を超えると overThreshold=true', () => {
    const cheap = computeBoxSplit([item({ id: 'a', priceYen: 100 })], 'DE')!;
    expect(cheap[0]!.overThreshold).toBe(false);
    const pricey = computeBoxSplit([item({ id: 'a', priceYen: 10_000_000 })], 'DE')!;
    expect(pricey[0]!.overThreshold).toBe(true);
  });

  it('しきい値が無い国（シンガポール）は常に under', () => {
    const boxes = computeBoxSplit([item({ id: 'a', priceYen: 10_000_000 })], 'SG')!;
    expect(boxes[0]!.dutyFreeThresholdYen).toBeNull();
    expect(boxes[0]!.overThreshold).toBe(false);
  });

  it('単品だけで EMS の上限を超えるなら null（この方式は使えない）', () => {
    expect(computeBoxSplit([item({ id: 'a', weightG: 40_000 })], 'US')).toBeNull();
  });

  it('packedWeightFor は compare.ts と同じ式（PACKING_MULTIPLIER・PACKING_ADD_G）', () => {
    expect(packedWeightFor(1000)).toBe(Math.round(1000 * 1.2 + 300));
  });
});
