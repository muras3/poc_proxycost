import { describe, expect, test } from 'vitest';
import { packHeaviestFirst, splitByWeightLimit, type PackableItem } from './parcels';

const it = (index: number, weightG: number, priceYen: number): PackableItem =>
  ({ index, weightG, priceYen });

// compare.ts の `grossG` と同じ式（テスト用に複製。定数まで揃える必要は無い——
// このテストは「上限判定と箱数」を確かめるためのもので、実際の梱包後重量の
// 係数そのものは compare.test.ts / postage.test.ts の管轄）。
const packedWeightOf = (netG: number) => Math.round(netG * 1.2 + 300);

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

describe('splitByWeightLimit (docs/DESIGN-BOX-SIZE.md §2④)', () => {
  test('fits in one box: does not add a parcel when the total is already under the limit', () => {
    const items = [it(0, 500, 1000), it(1, 200, 2000)];
    const boxes = splitByWeightLimit(items, 2_000_000, packedWeightOf)!;
    expect(boxes).toHaveLength(1);
    expect(boxes[0]!.indices.sort()).toEqual([0, 1]);
  });

  test('exceeds a method\'s limit: splits into the minimum number of boxes that fit', () => {
    // 小形包装物2kg相当の上限を real 例で試す: 1500g×2点は合計3000g(net)で
    // packedWeightOf(3000)=3900g、1箱の上限2000gを超える。2箱に分ければ
    // 各1500g→packedWeightOf(1500)=2100g……まだ超える。3箱目まで要る場合もあるが、
    // ここでは単純に「1点1箱にすれば必ず収まる」設計であることを、
    // 上限をちょうど1点分に合わせて確認する。
    const items = [it(0, 1500, 100), it(1, 1500, 100)];
    const limit = 2100; // 1500gの梱包後重量(1500*1.2+300=2100)ちょうど。2点合算(2*1500=3000→3900)は超える。
    const boxes = splitByWeightLimit(items, limit, packedWeightOf)!;
    expect(boxes).toHaveLength(2);
    expect(boxes.flatMap((b) => b.indices).sort()).toEqual([0, 1]);
    for (const b of boxes) expect(packedWeightOf(b.totalWeightG)).toBeLessThanOrEqual(limit);
  });

  test('conservation: total declared value across the split boxes matches the input total', () => {
    const items = [it(0, 900, 3000), it(1, 850, 2500), it(2, 700, 1500), it(3, 300, 500)];
    const totalYen = items.reduce((a, i) => a + i.priceYen, 0);
    const boxes = splitByWeightLimit(items, 1600, packedWeightOf)!;
    expect(boxes.reduce((a, b) => a + b.declaredYen, 0)).toBe(totalYen);
    expect(boxes.flatMap((b) => b.indices).sort()).toEqual([0, 1, 2, 3]);
  });

  test('determinism: the same cart always produces the same split, including weight ties', () => {
    const items = [it(0, 500, 100), it(1, 500, 200), it(2, 500, 300), it(3, 500, 400)];
    const runs = Array.from({ length: 5 }, () => splitByWeightLimit(items, 1200, packedWeightOf));
    for (const boxes of runs) {
      expect(boxes!.map((b) => b.indices)).toEqual(runs[0]!.map((b) => b.indices));
    }
  });

  test('a single item that alone exceeds the limit makes the method unusable (returns null)', () => {
    // docs/DESIGN-BOX-SIZE.md §2④ を実装するにあたり、この場合の扱いは文書に
    // 明記が無かった（PRの依頼文が挙げる未解決点の一つ）。ここでは
    // 「箱を増やしても解決しない以上、その方式は使えない」という読み方を採用し、
    // 固定する。
    const items = [it(0, 40_000, 500)];
    expect(splitByWeightLimit(items, 2000, packedWeightOf)).toBeNull();
  });

  test('one oversized item among otherwise-fine items still fails the whole group', () => {
    const items = [it(0, 40_000, 500), it(1, 100, 10)];
    expect(splitByWeightLimit(items, 2000, packedWeightOf)).toBeNull();
  });

  test('empty input: zero boxes, not an error', () => {
    expect(splitByWeightLimit([], 2000, packedWeightOf)).toEqual([]);
  });
});
