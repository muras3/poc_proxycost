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
 * **このモジュールが呼ばれる場面**: `compare.ts` は、まず店舗という**既に分かっている**
 * 分割基準（Buyee の注文ごと別送）で個口の下地を作り、そのうえで `splitByWeightLimit`
 * （下）を使って、**選ばれた配送方式（郵便）自身の重量上限**（`postage.ts` の
 * `maxGramsFor` ── 小形包装物2kg・EMS/国際小包30kg 等）を超える個口をさらに箱に分ける
 * （docs/DESIGN-BOX-SIZE.md §2④）。店舗の下地1つがそのまま上限に収まるときは
 * 箱は増えない——重い順に詰め直す理由が無いのはその場合だけ。
 *
 * conservation（合計が保存される）とタイブレークの決定性はここで担保し、
 * テストで固定する。
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

/**
 * **docs/DESIGN-BOX-SIZE.md §2④（オーナー確定 2026-09-12）── 「方式の上限を超えたら
 * 箱を増やす」の実装。** `packHeaviestFirst` はどの重量上限に対しても中立な
 * 汎用ユーティリティだが、この関数は特定の配送方式の重量上限を実際に適用し、
 * 「何個の箱に分ければ収まるか」まで決める。
 *
 * **アルゴリズム（決定的）**: 箱数 `n` を1から増やしながら `packHeaviestFirst(items, n)`
 * を試し、**すべての箱の梱包後重量（`packedWeightOf` で個口の実重量から算出）が
 * 上限以下になった最小の `n`** を採用する。`packHeaviestFirst` 自体のタイブレーク
 * （重量降順・同点は入力順／箱は同点なら番号が小さいほう）がそのまま効くので、
 * 同じ商品構成は常に同じ箱数・同じ詰め方になる。
 *
 * **箱数は最小化する。**「とりあえず1箱ずつ詰めて溢れたら次の箱」という順次埋め方
 * ではなく、収まる最小の箱数を総当たりで探す——LPTは箱数が増えるほど個々の箱の
 * 負荷を均等に近づけるので、無駄に箱を増やさない。
 *
 * **1点だけで上限を超える商品がある場合**: `items.length` 個の箱まで試しても
 * （＝1商品1箱まで分けても）なお超える箱が残るなら、`null` を返す——**この方式は
 * 使えない**という意味（呼び出し側は他の方式と同じ「額が付かない」扱いにする）。
 * 「箱をさらに増やしても解決しない以上、その商品を運べる方式ではない」という
 * 読み方を採用した（他の読み方——「入りきらない特大口として運べることにする」——も
 * ありうるが、上限を無視した箱を運べることにするのは架空の免除になるため採らない）。
 *
 * **conservation**: 返る `ParcelPack[]` の `declaredYen` の合計は、常に入力の
 * `priceYen` の合計と一致する（`packHeaviestFirst` がその保証を持つ）。
 *
 * 空配列は「箱0個」（空配列）を返す——上限判定の対象がそもそも無い。
 */
export function splitByWeightLimit(
  items: readonly PackableItem[],
  maxPackedWeightG: number,
  packedWeightOf: (netWeightSumG: number) => number,
): ParcelPack[] | null {
  if (items.length === 0) return [];
  for (let n = 1; n <= items.length; n += 1) {
    const boxes = packHeaviestFirst(items, n).filter((b) => b.indices.length > 0);
    if (boxes.every((b) => packedWeightOf(b.totalWeightG) <= maxPackedWeightG)) {
      return boxes;
    }
  }
  return null;
}
