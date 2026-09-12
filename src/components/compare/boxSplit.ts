import { PACKING_ADD_G, PACKING_MULTIPLIER } from '@/lib/pricing/compare';
import { COUNTRIES } from '@/lib/pricing/countries';
import { maxGramsFor } from '@/lib/pricing/postage';
import { splitByWeightLimit, type PackableItem } from '@/lib/pricing/parcels';
import { rateFor } from '@/lib/pricing/rates';
import { groupByShop } from '@/lib/pricing/shops';
import type { CountryCode, Item } from '@/lib/pricing/types';

/**
 * カート → 「うちがどう分けて計算しているか」の可視化用データ。
 *
 * **ここは pricing の計算をやり直さない。** `groupByShop`（店舗の下地）・
 * `splitByWeightLimit`（EMS の重量上限を超えたら箱を増やす、重い順に詰める）・
 * `PACKING_MULTIPLIER`/`PACKING_ADD_G`（梱包後重量の式）は、すべて
 * `src/lib/pricing/*` からそのまま輸入した、`compare.ts` の `buildRow` が使っている
 * のと同じ関数・同じ定数。ここでやっているのは、その組み合わせ方を画面用に
 * もう一度呼び出しているだけで、新しい判定・新しい数値は一切足していない。
 *
 * **`compare.ts` にはこの分解を外に返す出口が無い。**`Row.parcels` は個数
 * （`number`）だけで、どの商品がどの箱に入ったか・箱ごとの申告額・分割の理由
 * （店舗の切れ目か、重量上限の切れ目か）は `buildRow` の中で計算されて捨てられる。
 * したがってこのファイルは、Row を経由せず `groupByShop`/`splitByWeightLimit` を
 * 直接呼んでいる——**Row が公開すべきだが今は公開していない値**（`docs` 参照）。
 */

export type SplitReason = 'shop' | 'weight-limit';

export interface SplitBox {
  /** 箱の通し番号（0始まり）。 */
  boxIndex: number;
  /** この箱の元になった店舗グループの番号。**店舗をまたいで箱を混ぜない**という
   *  pricing 側の規則（`compare.ts` のコメント参照）をそのまま反映する。 */
  groupIndex: number;
  /** この箱に入っている商品の元の添字。**重い順**（`packHeaviestFirst` の詰め順）。 */
  itemIndices: number[];
  /** 梱包後重量（g）。`PACKING_MULTIPLIER`/`PACKING_ADD_G` で計算——`compare.ts` と同じ式。 */
  packedWeightG: number;
  /** この箱の申告額 = この箱に実際に入っている商品の代金の合計。均等割りではない。 */
  declaredYen: number;
  /** この箱がなぜ他の箱と別なのか。
   *  'shop' = 違う店舗の商品だから別の箱（最初から別々）。
   *  'weight-limit' = 同じ店舗の商品だが、EMS の重量上限（30kg）を超えたため増やした箱。 */
  reason: SplitReason;
  /** 届け先国の免税しきい値（円換算）。`null` は「しきい値なし」（例: シンガポール）。 */
  dutyFreeThresholdYen: number | null;
  /** この箱の申告額がしきい値を超えているか。`dutyFreeThresholdYen` が `null` なら常に `false`。 */
  overThreshold: boolean;
}

/** `compare.ts` の `grossG` と同じ式。**定数は輸入したもの、式はここで新しく決めていない。** */
export function packedWeightFor(netWeightSumG: number): number {
  return Math.round(netWeightSumG * PACKING_MULTIPLIER + PACKING_ADD_G);
}

/**
 * カートを箱に分ける。**EMS の重量上限（`maxGramsFor('ems', country)`）で
 * 店舗の下地（`groupByShop`）をさらに分ける**——`compare.ts` の `boxesForPostal`
 * と同じ合成順序（店舗が先、重量上限はその内側）。
 *
 * 単品だけで上限を超える商品があれば、その方式は使えない（`splitByWeightLimit` の
 * 規則）——呼び出し側はこれを `null` として受け取り、単一箱のフォールバック表示に
 * 倒す。
 */
export function computeBoxSplit(items: readonly Item[], country: CountryCode): SplitBox[] | null {
  if (items.length === 0) return [];
  const netPerItem = items.map((i) => (i.weightG ?? 0) * i.qty);
  const grouping = groupByShop([...items]);
  const limit = maxGramsFor('ems', country);
  const countryInfo = COUNTRIES[country];
  const rate = rateFor(countryInfo.ccy);
  const dutyFreeThresholdYen = Number.isFinite(countryInfo.dutyFreeLimit)
    ? Math.round(countryInfo.dutyFreeLimit * rate)
    : null;

  const boxes: SplitBox[] = [];
  for (let groupIndex = 0; groupIndex < grouping.groups.length; groupIndex += 1) {
    const g = grouping.groups[groupIndex]!;
    const packable: PackableItem[] = g.map((idx) => ({
      index: idx,
      weightG: netPerItem[idx]!,
      priceYen: items[idx]!.priceYen * items[idx]!.qty,
    }));
    const packed = splitByWeightLimit(packable, limit, packedWeightFor);
    if (packed == null) return null; // この方式は使えない（単品が上限超え）
    packed.forEach((box) => {
      const declaredYen = box.declaredYen;
      boxes.push({
        boxIndex: boxes.length,
        groupIndex,
        itemIndices: box.indices,
        packedWeightG: packedWeightFor(box.totalWeightG),
        declaredYen,
        reason: packed.length > 1 ? 'weight-limit' : 'shop',
        dutyFreeThresholdYen,
        overThreshold: dutyFreeThresholdYen != null && declaredYen > dutyFreeThresholdYen,
      });
    });
  }
  return boxes;
}
