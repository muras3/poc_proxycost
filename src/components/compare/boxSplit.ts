import { PACKING_ADD_G, PACKING_MULTIPLIER } from '@/lib/pricing/compare';
import { COUNTRIES } from '@/lib/pricing/countries';
import { maxGramsFor } from '@/lib/pricing/postage';
import { splitByWeightLimit, type PackableItem } from '@/lib/pricing/parcels';
import { rateFor } from '@/lib/pricing/rates';
import type { CountryCode, Item } from '@/lib/pricing/types';

/**
 * カート → 「うちがどう分けて計算しているか」の可視化用データ。
 *
 * **ここは pricing の計算をやり直さない。**`splitByWeightLimit`（重量上限を
 * 超えたら箱を増やす、重い順に詰める）・`PACKING_MULTIPLIER`/`PACKING_ADD_G`
 * （梱包後重量の式）は、すべて `src/lib/pricing/*` からそのまま輸入した、
 * `compare.ts` の `buildRow` が使っているのと同じ関数・同じ定数。
 *
 * **店舗の切れ目による分割は、今このファイルには実装していない
 * （2026-09-12、オーナー指摘で撤回）。** 最初の版は `groupByShop` の下地を
 * そのまま使い、次の版はそれを「店舗が分からない商品は1つにまとめる」よう
 * 緩めた `groupForDisplay` に置き換えたが、**どちらも同じ欠陥のバリエーション
 * だった**: `groupByShop`（`src/lib/pricing/shops.ts`）が単品ずつ別グループに
 * するのは、Buyee の「注文ごと」課金という**開示済みで意図的な**保守側の
 * 仮定であり（`compare.ts` のコメント「まとめられていない点は1点＝1注文で
 * 課金しているので、この社の総額は高く出ている」）、しかもその店舗分割自体が
 * 実際に効くのは Buyee の default 変種だけ（`compare.ts` の `split` 条件）。
 * この区画はどの `Row`（どの社・どの方式）にも紐付いていない汎用表示なので、
 * 店舗分割をここで一律に適用すると「価格は N 個口で計算されているのに絵は
 * 1箱」「絵は複数店舗と言っているが実は店舗が分からないだけ」のどちらの
 * 向きにもズレる——EMS の重量上限を無条件に使っていた最初の欠陥と同じ形の
 * 「行に紐付いていない値を一般化して見せる」問題。
 *
 * **したがって今は重量上限による分割だけを見せる。**店舗の切れ目（識別できた
 * 別店舗／per-listing サイト／店舗不明の4種、後者ほど画面に出す価値が高い）
 * を正しく見せるには、`compare.ts`（`buildRow`）が実際に使った下地と理由を
 * `Row` 経由で公開してもらう必要がある——`Row.parcels` は個数（`number`）
 * だけで、どの商品がどの箱に入ったか・箱ごとの申告額・分割の理由は
 * `buildRow` の中で計算されて捨てられる。**Row が公開すべきだが今は公開して
 * いない値**（PR 本文の質問として提起済み）。それが来たら、この関数は
 * `Row` の出力をそのまま描くだけになり、ここでの再計算は丸ごと要らなくなる。
 *
 * **既知の限界（オーナー指摘、2026-09-12）**: 重量上限も常に EMS のものを
 * 使う——実際に選ばれた方式（例: DE/3点×600g/cheapest は `small-packet-air`、
 * 上限2kg）と食い違いうる。同じ理由（行に紐付いていない）で、これも `Row` が
 * 箱の内訳を公開するまでの間に合わせ。
 */

export type SplitReason = 'weight-limit';

export interface SplitBox {
  /** 箱の通し番号（0始まり）。 */
  boxIndex: number;
  /** この箱に入っている商品の元の添字。**重い順**（`packHeaviestFirst` の詰め順）。 */
  itemIndices: number[];
  /** 梱包後重量（g）。`PACKING_MULTIPLIER`/`PACKING_ADD_G` で計算——`compare.ts` と同じ式。 */
  packedWeightG: number;
  /** この箱の申告額 = この箱に実際に入っている商品の代金の合計。均等割りではない。 */
  declaredYen: number;
  /** この箱がなぜ他の箱と別なのか。**今は 'weight-limit' しか出さない**
   *  （店舗の切れ目を出さない理由は上のモジュール doc comment 参照）。 */
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
 * カートを箱に分ける。**カート全体を1つの下地とし、EMS の重量上限
 * （`maxGramsFor('ems', country)`）を超えたときだけ `splitByWeightLimit` で
 * 増やす。**店舗の切れ目による分割は行わない（上のモジュール doc comment
 * 参照——店舗分割は特定の `Row` に紐付いた仮定で、ここには持ち込めない）。
 *
 * 単品だけで上限を超える商品があれば、その方式は使えない（`splitByWeightLimit` の
 * 規則）——呼び出し側はこれを `null` として受け取り、単一箱のフォールバック表示に
 * 倒す。
 */
export function computeBoxSplit(items: readonly Item[], country: CountryCode): SplitBox[] | null {
  if (items.length === 0) return [];
  const netPerItem = items.map((i) => (i.weightG ?? 0) * i.qty);
  const limit = maxGramsFor('ems', country);
  const countryInfo = COUNTRIES[country];
  const rate = rateFor(countryInfo.ccy);
  const dutyFreeThresholdYen = Number.isFinite(countryInfo.dutyFreeLimit)
    ? Math.round(countryInfo.dutyFreeLimit * rate)
    : null;

  const packable: PackableItem[] = items.map((item, idx) => ({
    index: idx,
    weightG: netPerItem[idx]!,
    priceYen: item.priceYen * item.qty,
  }));
  const packed = splitByWeightLimit(packable, limit, packedWeightFor);
  if (packed == null) return null; // この方式は使えない（単品が上限超え）

  return packed.map((box, boxIndex) => ({
    boxIndex,
    itemIndices: box.indices,
    packedWeightG: packedWeightFor(box.totalWeightG),
    declaredYen: box.declaredYen,
    reason: 'weight-limit' as const,
    dutyFreeThresholdYen,
    overThreshold: dutyFreeThresholdYen != null && box.declaredYen > dutyFreeThresholdYen,
  }));
}
