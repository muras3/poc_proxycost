# FROM JAPAN 外注梱包（F14 追加費用側）の条件付き化 — 2026-09-13

## 発端

`master/fees.json` の F14（外注梱包）は既に2026-09-11に一次情報から発生条件（重量・商品価格・壊れ物の3条件）を特定していた（`checked_on: 2026-09-11`、note に3条件を記録済み）。だがそれは**マスタに書いただけ**で、`src/lib/pricing/services.ts` はその条件を一切見ずに、`unpricedFees` として**全条件で無条件に** `amount: null`（上限不明）を立てていた。この過剰計上が343条件中97条件の `rankIndeterminate` の原因だった（`docs/ledger/indeterminacy-summary-2026-09-13.md`）。

オーナーが2026-09-13に改めて一次情報を確認し、実装方針を決定した:

```
重量 50kg 以上
OR（重量 30kg 以上 AND 商品価格 30万円以上）
OR fragile/special_handling = true
  → Outsourced packing: 金額不明・上限不明（現状の扱いを維持）

それ以外
  → 0円（行を立てない。未知にしない）
```

## 1. 出典への到達可否

オーナーが指定した一次情報URL:

```
https://www.fromjapan.co.jp/japan/en/help/logistics/
```

**WebFetch・curl の両方で試みたが、いずれも HTTP 403（到達不能）。** 他のFROM JAPAN直リンク（`master/fees.json` の複数箇所に記録がある）と同じ、この環境からの遮断パターン。

そこで、この費目の元々の出典である `https://www.fromjapan.co.jp/translate/en_help.txt`（2026-09-07/09-11から使用、base64エンコードされたJSON形式）を2026-09-13に再取得した:

- HTTP 200（到達成功）
- 内容を base64 デコードして JSON パース、以下のキーの逐語一致を確認:
  - `help_logistics_1622`: "Packages containing multiple fragile items may require outsourced packing."
  - `help_logistics_1730`: "Items that cannot be packed by FROM JAPAN will require outsourced packing. You must pay the actual cost to have a packing company pack the items."
  - `title_serviceRule_1870`: "Items that meet any of the conditions below will require outsourced packing. Member shall pay a separate cost to have a packing company pack the items."
  - `title_serviceRule_1880`: "- An item weighing 50 kg or above"
  - `title_serviceRule_1890`: "- An item weighing 30 kg or above and priced 300,000 yen or above"

**結論: オーナー提示の3条件（50kg以上／30kg以上かつ30万円以上／壊れ物）は、`en_help.txt` の原文と完全に一致する。** ただし、これはオーナー指定のURL（`/japan/en/help/logistics/`）そのものへの直接到達ではない——`confidence: direct_fetch` は `en_help.txt` に対するものであり、`master/fees.json` にその区別をそのまま記録した。

利用規約側（`title_serviceRule_1880/1890`）は条件1・2のみを列挙し、条件3（壊れ物）が無い——ヘルプ（`help_logistics_*`）との不一致は2026-09-11から既知で、`master/fees.json` の note が理由付きで残している。この不一致自体は解消せず、そのまま残した。

## 2. 実装

### しきい値の一元化

`src/lib/pricing/services.ts` に `OUTSOURCED_PACKING_THRESHOLD`（`soloWeightG: 50_000`, `heavyWeightG: 30_000`, `heavyPriceYen: 300_000`）と、これを使う `requiresOutsourcedPacking(totalWeightG, itemsYen, fragile)` を新設。マジックナンバーはこの1箇所だけに置いた（`priceCapJpy` と同じ書き方に倣った）。

### `Item` 型への追加

`src/lib/pricing/types.ts` の `Item` に `fragile?: boolean` と `specialHandling?: boolean` を追加。**両方とも既定 `false`。** このPRでは利用者が入力する経路（`src/components/`）を作らない——型とエンジン側の対応だけ。

### `Service` 型・`compare.ts` の配線

- `Service.unpricedFees`（毎行無条件）から `Service.outsourcedPackingFee`（条件を満たした行にだけ足す）という新しいフィールドに分離。
- `compare.ts` の `buildRow` で、行の総重量（`parcelGross` の合計）・商品代合計（`itemsYen`）・`items.some(i => i.fragile || i.specialHandling)` を `requiresOutsourcedPacking()` に渡し、真のときだけ `outsourced-packing` 行（`amount: null`）を足す。

### `master/fees.json` の更新

F14 の該当エントリに `confidence: "direct_fetch"`、`checked_on: "2026-09-13"` を追加し、2026-09-13の再確認（`en_help.txt` の再取得・逐語確認、オーナー指定URLの403）とコードへの反映内容をnoteに追記。既存の記述（2026-09-11時点の3条件・公式内の不一致の分析）は消していない。

## 3. `fragile`/`special_handling` のUI — 実装しない（提案のみ）

このPRでは実装しない。理由:

- 商品種別だけから壊れ物を機械的に判定する根拠（信頼できる商品種別マスタ、判定ロジック）を持っていない。
- ユーザー入力経路は `src/components/` の変更になり、**数値・ランキングを動かす変更とUIを動かす変更は同じPRに混ぜない**（CLAUDE.md §8）というルールに反する。

**別PRへの提案:**
1. 商品追加フォームに「壊れ物・特別な取扱いが必要」チェックボックスを追加し、`Item.fragile` にバインドする。
2. 陶器・ガラス・美術品などの商品種別（サイト側のカテゴリ情報が取れる場合）から自動でチェックボックスに確認フラグ（デフォルトON、ユーザーが外せる）を出す仕組み——ただし商品種別の判定根拠（各サイトのカテゴリ体系とfragile判定のマッピング）を別途確立する必要があり、このPRの範囲外。

## 4. `rankIndeterminate` の実測

`scripts/indeterminacy-ledger.ts` / `indeterminacy-summary.ts` を再実行（343条件グリッド、`docs/ledger/indeterminacy-summary-2026-09-13.md` と同じ条件格子）。

- 修正前: **131/343**（`docs/ledger/indeterminacy-summary-2026-09-13.md`）
- 修正後: **51/343**（`docs/ledger/indeterminacy-summary-2026-09-13-fix.md`）

**予測（131 − 97 = 34）とは一致しなかった。実測は51。** 差の理由は、131件のうち97件が「outsourced-packingが唯一の妨げ費目」ではなく、一部が `courier-clearance-fee`（51件、宅配便の着地側通関手数料、未取得）とも重複してブロックされていたため——単純な引き算は成り立たない。実は元の `indeterminacy-summary-2026-09-13.md` の「2. 累積効果」表自体が既にこれを予告していた:

```
| 上位n費目 | 埋めた費目 | 残る rankIndeterminate 件数 |
| 1 | courier-destination-fees | 297 → 131 |
| 2 | courier-destination-fees, outsourced-packing | 297 → 51 |
| 3 | courier-destination-fees, outsourced-packing, courier-clearance-fee | 297 → 0 |
```

このPRは2行目（courier-destination-feesは既にmainで修正済み、131が起点）に相当する変更で、その表が予告していた「51」と実測が完全に一致した。**このグリッド（重量は最大8,000g）では条件1・2（50kg以上／30kg以上かつ30万円以上）は元々一度も成立しない**——このグリッドで消えた97件は全て条件3（壊れ物）扱いになっていたわけではなく、単に「条件を見ずに無条件で立てていた」旧実装のバグが原因だったことの裏付けでもある。

残る51件はすべて `courier-clearance-fee`（FedEx destination clearance fee、未取得）が原因——本PRのスコープ外。

## 5. 既存テストで落ちたもの — (a)/(b) 判定

以下は全て **(a) 新しい挙動が正しい**（旧テストが、条件を見ない無条件計上という旧仕様を検証していた）と判定し、テストの入力（`fragile: true` を明示的に付与、または想定値を更新）を直した。コードを書き換えて通した箇所はない。

| ファイル | テスト | 判定 |
|---|---|---|
| `master-sync.test.ts` | F14 outsourced-packing が unpricedFees に居ること | (a) `outsourcedPackingFee` に移動。read を更新 |
| `services.test.ts` | FROM JAPANだけが `unpricedFees` を持つ／outsourced-packingが常に出る | (a) 普通の商品では出ない、`fragile:true` で出ることを検証するテストに分割 |
| `compare.test.ts`（複数） | 「display:totalの費目は無条件で出る」「FROM JAPANは全帯で上限不明」「胴の重量帯で枠が動く」「2点の未知重量で1位が動く」 | (a) いずれも、旧仕様（無条件で常にoutsourced-packingが立つ）に依存していた。検証したい別のメカニズム（未取得行の伝播・枠の動き）を保つため `fragile: true` を明示して再現 |
| `rank-indeterminate-audit.test.ts` / `rank-indeterminate-leader.test.ts` | 「600g・¥3,000という普通の商品でFROM JAPANが上限不明のままcheapestになる」 | (a) この監査自体が本PRの対象そのもの（97件のうちの1つ）。`fragile: true` を明示して `isIndeterminate`（PR #127）のロジック自体の検証を保った |
| `taxes.test.ts` | 7カ国×4価格帯で `excluded` に "Outsourced packing" が毎回出る | (a) この籠（最大重量3,000g）はどの条件も満たさないので出なくなった。期待値から削除 |
| `courier-clearance.test.ts` | SG・DHLで `total.high` が常にnull | (a)（副次的発見）コメントの因果関係が誤りだった——実際にnullにしていたのはF34のcourier-destination-feesではなく、この外注梱包バグだった。修正後は `courier-clearance-fee` 自身のrangeを反映した具体的な数値に閉じる、が正しい挙動 |

すべて `npx vitest run`（1154件）green、`tsc --noEmit`・`npm run lint` green、`master/validate.py` green。

## 6. 検証済みしきい値の境界（新設テスト、`services.test.ts`）

- 49,900g / 50,000g（条件1）
- 29,900g+¥300,000 / 30,000g+¥299,999 / 30,000g+¥300,000 / 30,100g+¥300,001（条件2、AND）
- `fragile: true`（条件3）
- 普通の商品（どの条件も満たさない）

**ミューテーションで確認済み**（適用→対象テストが落ちる→復元→`git diff`が空、の順）:
1. `soloWeightG: 50_000 → 50_001` — 境界テストが落ちた
2. `heavyWeightG && heavyPriceYen` の `&&` → `||` — 境界テストが落ちた
3. `if (fragile) return true;` を削除 — 壊れ物テストが落ちた

いずれも復元後 `git diff` は空。
