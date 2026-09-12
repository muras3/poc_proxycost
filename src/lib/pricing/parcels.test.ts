import { describe, expect, test } from 'vitest';
import { packHeaviestFirst, type PackableItem } from './parcels';

const it = (index: number, weightG: number, priceYen: number): PackableItem =>
  ({ index, weightG, priceYen });

describe('packHeaviestFirst', () => {
  test('single parcel: everything goes into the one box, unchanged from the common case', () => {
    const items = [it(0, 500, 1000), it(1, 200, 2000), it(2, 900, 500)];
    const [box] = packHeaviestFirst(items, 1);
    expect(box!.indices.sort()).toEqual([0, 1, 2]);
    expect(box!.declaredYen).toBe(3500);
    expect(box!.totalWeightG).toBe(1600);
  });

  test('conservation: declared value is never lost or created, for any parcel count', () => {
    const items = [it(0, 500, 1234), it(1, 200, 777), it(2, 900, 5001), it(3, 50, 1)];
    const totalYen = items.reduce((a, i) => a + i.priceYen, 0);
    for (const n of [1, 2, 3, 4, 5]) {
      const boxes = packHeaviestFirst(items, n);
      const sum = boxes.reduce((a, b) => a + b.declaredYen, 0);
      expect(sum).toBe(totalYen);
      // 全商品がちょうど1回だけどこかの箱に入る。
      const allIndices = boxes.flatMap((b) => b.indices).sort();
      expect(allIndices).toEqual([0, 1, 2, 3]);
    }
  });

  test('deterministic tie-break: equal-weight items pack in input order, same result every time', () => {
    const items = [it(0, 100, 10), it(1, 100, 20), it(2, 100, 30), it(3, 100, 40)];
    // 全部同じ重さ。LPT はどの箱も最軽量タイなら箱番号の小さいほうへ——
    // 結果は「先頭から交互に2箱へ配る」になるはず。何度呼んでも同じ。
    const runs = Array.from({ length: 5 }, () => packHeaviestFirst(items, 2));
    for (const boxes of runs) {
      expect(boxes[0]!.indices).toEqual([0, 2]);
      expect(boxes[1]!.indices).toEqual([1, 3]);
    }
  });

  test('heaviest-first: the single heaviest item anchors the first (emptiest) box', () => {
    const items = [it(0, 100, 1), it(1, 100, 1), it(2, 1000, 1)];
    const boxes = packHeaviestFirst(items, 2);
    // 最重量（index 2）が最初に、最も軽い箱（box0, 0g）に入る。
    expect(boxes[0]!.indices).toContain(2);
  });

  test('an item heavier than a method\'s own limit still packs — this function does not enforce limits', () => {
    // このユーティリティは重量上限を判定しない（呼び出し側の責務）。1点だけで
    // 上限を超える商品も、他の商品と同じように1つの箱に割り当てられる。
    const items = [it(0, 40_000, 500)]; // 例: 小形包装物2kg・国際小包30kgの両方を超える重さ
    const [box] = packHeaviestFirst(items, 1);
    expect(box!.indices).toEqual([0]);
    expect(box!.totalWeightG).toBe(40_000);
  });

  test('empty and zero-weight items do not break the packer', () => {
    expect(packHeaviestFirst([], 3).every((b) => b.indices.length === 0)).toBe(true);
    const items = [it(0, 0, 100), it(1, 0, 200), it(2, 500, 300)];
    const boxes = packHeaviestFirst(items, 2);
    const sum = boxes.reduce((a, b) => a + b.declaredYen, 0);
    expect(sum).toBe(600);
  });

  test('item count not divisible by parcel count: still conserves and fills every box', () => {
    const items = [it(0, 500, 100), it(1, 400, 100), it(2, 300, 100), it(3, 200, 100), it(4, 100, 100)];
    const boxes = packHeaviestFirst(items, 3);
    expect(boxes).toHaveLength(3);
    expect(boxes.reduce((a, b) => a + b.declaredYen, 0)).toBe(500);
    expect(boxes.flatMap((b) => b.indices)).toHaveLength(5);
  });

  test('rejects a non-positive or non-integer parcel count', () => {
    expect(() => packHeaviestFirst([it(0, 1, 1)], 0)).toThrow();
    expect(() => packHeaviestFirst([it(0, 1, 1)], -1)).toThrow();
    expect(() => packHeaviestFirst([it(0, 1, 1)], 1.5)).toThrow();
  });
});
