/**
 * 商品を複数の個口（箱）に振り分ける汎用ユーティリティ。
 *
 * **docs/DESIGN-BOX-SIZE.md §2⑤（オーナー確定 2026-09-12）**: 配送方式の重量・寸法の
 * 上限を超えて箱が増えるとき、どの商品をどの箱に入れるかは代行が決める——我々には
 * 分からない。分からないなりに申告額を個口ごとに計算するための**仮の規則**として、
 * 「重い順に詰める」を置く（理由は同ドキュメント参照: 追加のデータを要らず、現実の
 * 梱包作業に近い直感で、ビンパッキングの初等的なヒューリスティック——First Fit
 * Decreasing / LPT——とも一致する）。
 *
 * **このモジュールが呼ばれる場面（現状）**: 現時点のコードベースには、配送方式の
 * 重量・寸法上限を超えて箱を増やす仕組み自体がまだ無い（`postage.ts`/`services.ts`
 * 側の配線は別PRで進行中、docs/DESIGN-BOX-SIZE.md §2④）。したがって
 * `compare.ts` の唯一の複数個口経路（Buyee の注文ごと別送）は、店舗という
 * **既に分かっている**分割基準を使っており、ここの重量ベースの割り振りを必要としない
 * ——店舗で個口が決まっている以上、重い順に詰め直す理由が無い。
 *
 * このユーティリティは、その将来の配線（上限超過による箱の追加）が入ったときに
 * そのまま使える形で先に用意しておくもの。conservation（合計が保存される）と
 * タイブレークの決定性はここで担保し、テストで固定する。
 */

export interface PackableItem {
  /** 呼び出し側の配列における添字。結果の `indices` はこれを返す。 */
  index: number;
  weightG: number;
  priceYen: number;
}

export interface ParcelPack {
  /** この個口に入った商品の元の添字（`PackableItem.index`）。 */
  indices: number[];
  totalWeightG: number;
  /** この個口の申告額 = 実際に入っている商品の価格の合計。均等割りではない。 */
  declaredYen: number;
}

/**
 * 商品を `parcelCount` 個の箱に、**重い順に**振り分ける。
 *
 * アルゴリズム（Longest Processing Time / 貪欲最小負荷法）:
 * 1. 商品を重量の**降順**に並べる。
 * 2. 各商品を、その時点で合計重量が最も軽い箱に入れる。
 *
 * **タイブレーク（決定的であることを保証する規則。同じカートは常に同じ結果になる）**:
 * - 重量が同点の商品どうしは、**入力配列に出現した順**（安定ソート）を保つ。
 * - 複数の箱が同点で最も軽いときは、**箱番号が小さいほう**を選ぶ。
 *
 * **conservation**: 戻り値の `declaredYen` の合計は、入力の `priceYen` の合計と
 * 常に一致する（各商品はちょうど1つの箱に入り、値を作りも消しもしない）。
 *
 * 空配列・重量0の商品もそのまま扱う（0は「軽い」の一種として並ぶだけ）。
 * `parcelCount` が商品数を超えても構わない——空の箱ができるだけ。
 */
export function packHeaviestFirst(
  items: readonly PackableItem[],
  parcelCount: number,
): ParcelPack[] {
  if (!Number.isInteger(parcelCount) || parcelCount < 1) {
    throw new Error(`packHeaviestFirst: parcelCount must be a positive integer, got ${parcelCount}`);
  }
  const boxes: ParcelPack[] = Array.from({ length: parcelCount },
    () => ({ indices: [], totalWeightG: 0, declaredYen: 0 }));

  // 重量降順。同点は入力順（`Array#sort` は安定ソートなので、比較関数が 0 を返せば
  // 元の順序が保たれる——ここでは明示的に添字で比較して、V8 以外の将来のエンジンでも
  // 安定性に依存しない）。
  const order = items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => b.item.weightG - a.item.weightG || a.i - b.i);

  for (const { item } of order) {
    let best = 0;
    for (let b = 1; b < boxes.length; b += 1) {
      if (boxes[b]!.totalWeightG < boxes[best]!.totalWeightG) best = b;
    }
    const box = boxes[best]!;
    box.indices.push(item.index);
    box.totalWeightG += item.weightG;
    box.declaredYen += item.priceYen;
  }
  return boxes;
}
