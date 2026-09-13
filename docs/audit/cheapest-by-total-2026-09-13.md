# F-total是正: `'cheapest'` は国際送料ではなく着地総額で選ぶ

**発見**: Fable 5.1（PR #137 監査文書）。**修正**: このPR、`claude/cheapest-by-total`。

## 1. 欠陥の再現

`src/lib/pricing/compare.ts` の `buildRow` にある `cheapestCandidate` が、
**国際送料だけ**（`priceAll()` / `priceCourier().low` の最小）で配送方式を選んでいた。
着地側の通関立替手数料（`courier-clearance-fee`）は選択に一切入っていなかった。

**実証条件**: US・1,000g・商品¥3,000・FROM JAPAN。`compare()` を直接叩いて確認。

| 方式 | 送料 | 通関手数料 | 総額（`total.low`） |
|---|---|---|---|
| UPS（旧コードが選ぶ） | ¥4,124 | ¥2,734 | ¥12,046 |
| ECMS（新コードが選ぶ） | ¥4,250 | ¥11 | ¥9,453 |

送料はUPSが¥126安いが、**総額はUPSの方が¥2,593高い**。この差額はFableの報告
（送料差¥126・総額差¥2,593）と厳密に一致する——**再現一致**。

**注記（絶対額の食い違い、確認できていない）**: 上表の絶対額（UPS ¥12,046・ECMS
¥9,453）はFableの報告値（UPS ¥11,839・ECMS ¥9,246）と両方とも**一律¥207高い**。
送料・通関手数料それ自体はFableの数字と1円単位で一致しており、選択ロジックの
正しさに影響する差ではない。¥207がどこから来る食い違いか（Fableが使った
`compare()` の呼び出し条件が何かこちらと違う——storageDaysや品目のsite等——のか、
本監査の再現スクリプトの側の設定差か）は**確認していない**。次にこの数字を扱う
ときは、まずこの¥207の出どころを特定すること。

## 2. 直したこと

`buildRow` の中で `cheapestCandidate` を選ぶロジックを、候補方式ごとに
**`buildRow` 自身を再帰的に呼んで、返ってきた `Row.total.low` を比べる**方式に
変えた（`ctx.method` に候補IDを明示して渡すので、再帰は`wanted === 'cheapest'`
分岐に二度と入らず、深さ1で止まる）。

**なぜこの実装にしたか**: 関税・VAT/GST・通関手数料・梱包・保管はどれも、実際に
選んだ方式の箱割り（`boxesForPostal`/`baseBoxes`）に依存する。送料と通関手数料を
別々の簡易式で再計算する実装だと、`buildRow` 本体の計算式と食い違うリスクを常に
背負う。`buildRow` をそのまま再帰させれば、「本当にその方式を選んだときに画面に
出る総額」と選択に使う総額が構造的に一致することが保証される——計算式を2箇所に
複製しない。

候補から除外する条件は変えていない: `priceAll`/`priceCourier` が `null` を返す
方式（売っていない・その国へ出していない・商品価格上限超・寸法超・重量超）は、
再帰呼び出しの結果の `intl-shipping` 行の `amount` が `null` であることで検出し、
除外する。

## 3. like-for-like（未取得費目の扱い）

**規約**: 総額の比較は `Row.total.low`（未取得の費目は0として畳む、既存の
`sum()`/`totalRange()` と同じ規約）で行う。`total.high`（上限が開いているか）は
比較に使わない。

**これは新しいルールではなく、既存の慣行をそのまま引き継いだだけ**: 直す前の
コードも「値段が付くか（`priceAll`/`priceCourier().low` が non-null か）」だけで
判定しており、上限の開閉は見ていなかった。`rankHighFor()` も `scope: 'shared'`
以外の未取得行がある候補を総額比較から一律には除外しない——このPRはその路線を
継承した。

**認める限界**: 方式ごとの未取得費目（`courier-clearance-fee` の
`C_unknown`/`schema_gap`。GB/DEのFedEx、GBのUPSなど）がある候補は、その分だけ
`total.low` が実際より安く出ている可能性がある。実証したUS/1,000g/¥3,000の例
（UPS・ECMS）は両候補とも通関手数料が確定値（`fixed`/`estimate`）で、未取得費目の
構成は同一——Fableもこれを確認済み。**一般には未取得費目の構成が候補間で同一とは
限らないので、`total.low` 同士の比較がlike-for-likeであることをこのPRは全候補の
組み合わせについて検証していない。**

## 4. 上限不明（`high === null`）を含む方式どうしの比較

**選んだ規則**: 下端（`total.low`）で比較する。`rankHigh`/`Line.scope === 'shared'`
の「差を生まない共通の未知は0に畳む」という既存の扱いは、`total.low` の計算自体には
関わらない（`total.low` はもともと共通・固有を問わずすべての未取得を0として畳む
——`rankHighFor` が `scope: 'shared'` だけを特別扱いするのは `total.high`
（上限が開くかどうかの表示用）のためであって、`low` 側には最初から適用されない）。
このPRは`total.low`をそのまま使うので、この特別扱いを新たに持ち込む必要はない。

## 5. per-Shipment / per-Parcel の課金単位

`courier-clearance-fee` の集計（`aggregateClearanceFee`、`courier-clearance.ts`）は
既存のまま——候補ごとに `buildRow` を丸ごと再実行するので、個口数・Shipment単位の
推定（店舗分割 vs 重量上限分割）もその候補の実際の箱割りに従って正しく再計算される。
今日時点では宅配便が §2④ の重量上限分割を経由しない（`baseBoxes` のまま）ので、
この監査で調べた条件では `weight-limit` 分岐は到達していない——これは既存の制約で、
このPRが新たに導入したものではない。

## 6. 影響した条件数・最大差額

343条件（7カ国×7重量×7価格）を総ざらいはしていない（このPRのスコープでは
`docs/measurements/` の再測定は行っていない）。Fableの報告（343条件中97条件・
111行、最大¥2,640、1位の入れ替わり0件）はこのPRの直接の再現対象ではなく、
**Fableの数字をそのまま引用しているだけで、このPR自身で343条件を再走査して
確認したわけではない**。このPRが独自に確認したのは、上記1のUS/1,000g/¥3,000の
1条件と、`src/lib/pricing/compare.test.ts` に追加した3条件、および
`e2e/compare.spec.ts` で見つかった1条件（下記7）の計5条件。

## 7. 既存テストへの影響

### `src/lib/pricing/compare.test.ts`

1件失敗した: `"'cheapest' never picks a method that costs more than another eligible non-surface one"`。

**判定: (a) 新しい選択が正しいのでテスト自体を直した。** このテストは「`cheapest`
は他の非Surface方式より**送料が**安いものを選ぶ」ことを検証しており——これは
直す前の欠陥（送料だけで選ぶ）をそのまま固定するテストだった。検証する不変条件を
「送料が最小」から「総額（`total.low`）が最小」に差し替えた
（`"'cheapest' never picks a method that costs more (total) than another eligible non-surface one"`
に改名）。

### `e2e/compare.spec.ts`

1件失敗した: `"7. seller-paid shipping takes the same domestic shipping off every row — the order does not move"`。

**判定: (a) 新しい選択が正しいので期待値を正した。** US・5点・各200g・各¥3,000の
手組みカートで、`cheapest` の並びが `Buyee consolidated → ZenMarket → Neokyo →
FROM JAPAN → Jauce → Buyee default` から
`Buyee consolidated → FROM JAPAN → ZenMarket → Neokyo → Jauce → Buyee default`
に変わった。`compare()` を直接叩いて確認: ZenMarket/FROM JAPANはこのカートで、
送料は安いが通関手数料の床（DHL/UPS系、概ね$17.50相当=¥2,734)が乗る方式から、
床を持たないECMS系（3%のみ、最低額0）に切り替わり、総額が下がる——切り替え幅が
FROM JAPANの方が大きかったため、ZenMarketを追い越して2位に上がった。1位
（Buyee consolidated）・5位（Jauce）・6位（Buyee default）は変わらない。

## 8. オラクル（`calculator-oracle.test.ts`、160条件）への影響

**影響なし。確認済み。** `npx vitest run src/lib/pricing/calculator-oracle.test.ts`
の結果は変更前後で同一: `match: 156 / differ_named: 0 / differ_unexplained: 4 /
not_comparable: 0`。

**理由**: オラクルは `postageFor()`/`markupYen()`——日本郵便の公表表そのもの——を
直接呼んで、各社の計算機が**特定の方式を明示指定したとき**に表示する送料と突き合わせる
（`loadCommittedOracleObservations()` の観測はどれも特定方式のIDを持つ）。このPRが
変更したのは `buildRow` 内の `'cheapest'` 解決ロジックだけで、`postageFor`/
`markupYen` 自体、および特定方式を明示指定したときの計算結果は一切変えていない。
したがってオラクルの比較対象（特定方式の送料）は変わりようがない。

## 9. mutation テスト

`src/lib/pricing/compare.test.ts` に追加した3件（US/FROM JAPAN・GB/Neokyo・
FR/ZenMarket、それぞれ別の社・別の国、日本郵便と宅配便の組み合わせを違えてある）は
mutation で確認済み: 選択ロジックを送料だけの比較（このPR前のコード）に戻すと
3件とも失敗する（`upsShip < chosenShip` などの前提アサーション自体が
`4124 < 4124` のように等号で失敗する——送料最安の方式がそのまま選ばれるため）。
`git stash` で実装ファイルだけを一時的に退避し、テストファイルは変更したまま
実行して確認、その後 `git stash apply` で復元、`git diff` で復元が完全である
ことを確認した。

## 10. `MethodPicker` / `src/components/` への影響

無い。変えたのは `buildRow` 内で `ctx.method === 'cheapest'` のときだけ通る
候補選択ロジックであり、利用者が方式を明示選択する経路（`ctx.method` が具体的な
方式ID）は一切変更していない。`src/components/` は触っていない
（`git diff --stat` で確認）。

## 11. ローカル検証

- `npx vitest run`: 35 files / 1103 tests / 全パス。
- `npx tsc --noEmit`: エラー無し。
- `npm run lint`: エラー無し。
- `python3 master/validate.py`: スキーマ通過・矛盾0件（このPRの変更対象外なので
  無関係のはずだが、念のため実行——結果は変更前と同一）。
- e2e（ローカル限定回避策: `next build --webpack`、`playwright.config.ts` の
  `webServer.command` を一時的に `npm run build` → `npx next build --webpack`
  に書き換えて実行、確認後に元へ戻した——コミットには含めていない）:
  `e2e/compare.spec.ts` / `parcel.spec.ts` / `parcel-split.spec.ts` /
  `taxes.spec.ts` / `assumed-weights.spec.ts` / `pages.spec.ts` を `desktop`
  プロジェクトのみで実行——結果は本ファイル末尾に追記する。フルマトリクス
  （mobile含む全プロジェクト・全spec）はCI（`all green`）に委ねる。
