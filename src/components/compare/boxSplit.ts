import { PACKING_ADD_G, PACKING_MULTIPLIER } from '@/lib/pricing/compare';
import { COUNTRIES } from '@/lib/pricing/countries';
import { maxGramsFor } from '@/lib/pricing/postage';
import { splitByWeightLimit, type PackableItem } from '@/lib/pricing/parcels';
import { rateFor } from '@/lib/pricing/rates';
import { shopIdFor } from '@/lib/pricing/shops';
import type { CountryCode, Item } from '@/lib/pricing/types';

/**
 * カート → 「うちがどう分けて計算しているか」の可視化用データ。
 *
 * **ここは pricing の計算をやり直さない。**`splitByWeightLimit`（重量上限を
 * 超えたら箱を増やす、重い順に詰める）・`PACKING_MULTIPLIER`/`PACKING_ADD_G`
 * （梱包後重量の式）・`shopIdFor`（店舗 ID の判定）は、すべて `src/lib/pricing/*`
 * からそのまま輸入した、`compare.ts` の `buildRow` が使っているのと同じ関数・
 * 同じ定数。ここでやっているのは、その組み合わせ方を画面用にもう一度呼び出して
 * いるだけで、新しい判定・新しい数値は一切足していない
 * （`groupForDisplay` だけは `groupByShop` そのものではない——下のコメント参照）。
 *
 * **`compare.ts` にはこの分解を外に返す出口が無い。**`Row.parcels` は個数
 * （`number`）だけで、どの商品がどの箱に入ったか・箱ごとの申告額・分割の理由
 * （店舗の切れ目か、重量上限の切れ目か）は `buildRow` の中で計算されて捨てられる。
 * したがってこのファイルは、Row を経由せず `splitByWeightLimit` を直接呼んでいる
 * ——**Row が公開すべきだが今は公開していない値**（PR 本文の質問として提起済み）。
 *
 * **既知の限界（オーナー指摘、2026-09-12）**: この区画はどの `Row`（どの社・
 * どの方式）にも紐付いていない、汎用の「うちはこう計算しています」表示。
 * そのため重量上限は常に EMS のものを使う——実際に選ばれた方式（例:
 * DE/3点×600g/cheapest は `small-packet-air`、上限2kg）と食い違いうる。
 * `Row` が箱の内訳を公開するまでの間に合わせであることを明記しておく。
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
 * 「店舗の切れ目」の下地。**`groupByShop` をそのまま使わない。**
 *
 * `groupByShop`（`src/lib/pricing/shops.ts`）は、店舗が分からない商品
 * （`shopIdFor` が `null` を返す——手入力・`other` サイトなど）を**1点ずつ
 * 別グループ**にする。これは Buyee の「注文ごと」課金を数える目的では正しいが
 * （店舗不明なら別注文と数えるほうが過大にならない側）、**この画面が言いたいのは
 * 「本当に別の店舗だと分かっている」ことだけ**——店舗が分からないだけの商品を
 * N 個の別々の箱に散らすと、実際には起きていない「店舗による分割」を見せてしまう
 * （店舗分割は Buyee の default 変種でしか実際に効かない、`compare.ts` の
 * `split` 条件参照）。
 *
 * そこで、店舗 ID が分かる商品どうしは `groupByShop` と同じ規則で束ね、
 * **店舗が分からない商品は全員まとめて1つの下地に入れる**——「分からない」を
 * 「別々」の証拠として使わない、という原則1（`docs/PRINCIPLES.md`）と同じ考え方。
 */
function groupForDisplay(items: readonly Item[]): number[][] {
  const byShop = new Map<string, number[]>();
  const order: string[] = [];
  const unknown: number[] = [];
  items.forEach((item, idx) => {
    const shop = shopIdFor(item);
    if (!shop) {
      unknown.push(idx);
      return;
    }
    if (!byShop.has(shop)) {
      byShop.set(shop, []);
      order.push(shop);
    }
    byShop.get(shop)!.push(idx);
  });
  const groups = order.map((s) => byShop.get(s)!);
  if (unknown.length > 0) groups.push(unknown);
  return groups;
}

/**
 * カートを箱に分ける。**EMS の重量上限（`maxGramsFor('ems', country)`）で
 * 店舗の下地（`groupForDisplay`）をさらに分ける**——`compare.ts` の
 * `boxesForPostal` と同じ合成順序（店舗が先、重量上限はその内側）。
 *
 * **注意（オーナー指摘、2026-09-12）**: ここで使う上限は常に EMS のもの。
 * 実際に選ばれた行の方式（例: DE/3点×600g/cheapest は `small-packet-air`、
 * 上限2kg）と食い違いうる——この区画は特定の行に紐付いていない汎用の
 * 「うちはこう計算しています」表示で、`compare()` の `Row` は箱の内訳を
 * 外に出していない（`Row.parcels` は個数のみ）ため、行ごとの実際の方式に
 * 追随できない。**Row がこの内訳を公開すれば、この関数はまるごと要らなくなる**
 * ——公開されるまでの間に合わせであることを、ここに明記しておく。
 *
 * 単品だけで上限を超える商品があれば、その方式は使えない（`splitByWeightLimit` の
 * 規則）——呼び出し側はこれを `null` として受け取り、単一箱のフォールバック表示に
 * 倒す。
 */
export function computeBoxSplit(items: readonly Item[], country: CountryCode): SplitBox[] | null {
  if (items.length === 0) return [];
  const netPerItem = items.map((i) => (i.weightG ?? 0) * i.qty);
  const groups = groupForDisplay(items);
  const limit = maxGramsFor('ems', country);
  const countryInfo = COUNTRIES[country];
  const rate = rateFor(countryInfo.ccy);
  const dutyFreeThresholdYen = Number.isFinite(countryInfo.dutyFreeLimit)
    ? Math.round(countryInfo.dutyFreeLimit * rate)
    : null;

  const boxes: SplitBox[] = [];
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const g = groups[groupIndex]!;
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
