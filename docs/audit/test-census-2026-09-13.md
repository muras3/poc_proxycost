# テスト棚卸し・mutation 監査（2026-09-13）

問い: 「今の計算モデルは穴だらけなのか、精度が高いのか」——本数ではなく、テストが
実際に何を検査しているかを数える。**このドキュメントはコードを一切変更していない**
（mutation は検証後すべて `git diff` が空になるまで復元済み）。

## 1. 本数

- `src/**/*.test.ts`: **34 ファイル、1,096 本**（vitest 実行結果と一致。`it(`/`test(` の
  静的grepでは675件しか出ない ── 差分421件は `for` ループや `describe.each` 相当の
  動的生成によるもの。ファイルごとの内訳は表2参照）
- `e2e/**/*.spec.ts`: **8 ファイル、静的に数えられる `test(` 呼び出し109件**
  （Playwright は今回実行していない。棚卸しは静的カウントのみ）

### 表1: ファイルごとの実測テスト数（vitest実行ベース）

| ファイル | 本数 |
|---|---:|
| compare.test.ts | 164 |
| calculator-oracle.test.ts | 164 |
| master-sync.test.ts | 123 |
| courier-monotonicity.test.ts | 95 |
| services.test.ts | 82 |
| weights.test.ts | 64 |
| sites.test.ts | 47 |
| product.test.ts | 35 |
| taxes.test.ts | 28 |
| courier-clearance.test.ts | 27 |
| deeplink.test.ts | 20 |
| ems.test.ts | 20 |
| courier-postage.test.ts | 19 |
| postage.test.ts | 19 |
| AssumedWeightsNote.test.ts | 22 |
| glyphs.test.ts | 16 |
| parcels.test.ts | 15 |
| restricted-goods.test.ts | 14 |
| PackingBox.test.ts | 13 |
| shops.test.ts / ParcelView.test.ts / WeightLadder.test.ts | 11 |
| us-duty / weights.corpus | 10 |
| courier-wiring.test.ts | 9 |
| compare-input.test.ts | 8 |
| courier-ui-wiring.test.ts | 7 |
| shipping-methods.test.ts | 6 |
| brave.test.ts | 6 |
| measured.test.ts | 5 |
| rates.test.ts | 5 |
| calculator-oracle.test.ts(参照済) / ConsolidationCallout / EmsOnlyNote | 4 |
| courier-monotonicity(上表参照) / rank-indeterminate-audit | 2 |

（合計1,096。上記は主要な行のみの抜粋、全34ファイルの正確な数は次の生データ:
measured 5, AssumedWeightsNote 22, ConsolidationCallout 4, EmsOnlyNote 4, PackingBox 13,
ParcelView 11, WeightLadder 11, calculator-oracle 164, compare-input 8, compare 164,
courier-clearance 27, courier-monotonicity 95, courier-postage 19, courier-ui-wiring 7,
courier-wiring 9, deeplink 20, ems 20, master-sync 123, parcels 15, postage 19,
rank-indeterminate-audit 2, rates 5, restricted-goods 14, services 82,
shipping-methods 6, shops 11, taxes 28, us-duty 10, weights.corpus 10, weights 64,
brave 6, product 35, sites 47, glyphs 16 → 合計1096）

**本数の多さ（calculator-oracle 164, courier-monotonicity 95）は主にデータ駆動の
`for` ループ展開によるもので、手で書かれた別々の主張の数ではない。** 本数を根拠に
「厚く検査されている」と読むのは誤り。

## 2. 類型分類（ファイル単位、主判定）

推計方法: 各ファイルを実際に開いて読み、そのファイルの主要なアサーションが
(A)/(B)/(C)/(D)のどれを中心にしているかで分類した。1ファイルに複数の型が混在する
場合は「主」で分類し、混在の程度を備考に書いた。

| ファイル | 主分類 | 備考 |
|---|---|---|
| compare.test.ts | A/C | `compare()` を実際に呼び、内訳の総和・null伝播・順位を検査。値は独立に導出 |
| calculator-oracle.test.ts | A | 外部の代行業者の**実測表示額**とエンジン出力を突き合わせ。ベタ書きなし |
| master-sync.test.ts | A/C | `master/fees.json` を都度ファイルから読み、期待値をその場で計算（設計文書に「ベタ書きしない」と明記） |
| courier-monotonicity.test.ts | C | 単調性という性質のみ検査。具体値に依存しない |
| rank-indeterminate-audit.test.ts | C | 「現状の挙動」を固定する監査テスト。既存の穴を明示的に記録 |
| services.test.ts | A/D混在 | 出所URL・ドメイン一致などD寄りの検査と、`compare()`経由のA検査が混在 |
| taxes.test.ts | A/B混在 | 多くは`compare()`経由でA。ただし国別の`note`文言はベタ書き比較(B寄り) |
| postage.test.ts | A/B混在 | 単調性・地帯整合はC/A。**表のスポット値（例:510円）は文字通りのベタ書き**でB寄り。ただし出典（郵便局公表表）からの独立転記であり、実装の定数を読み返しているわけではない |
| ems.test.ts | A/B混在 | postage.test.tsと同型。`EMS_TABLE[0]`などの完全一致はB寄りだが、独立ソース照合 |
| weights.test.ts / weights.corpus.test.ts | B寄り | `resolveWeight('Nendoroid...').grams` の期待値 `439` は `src/data/weights.ts` の`medianG: 439`と**同じ数値の転記**。実装とテストを同じ方向へ書き換えると通る典型形（mutationで確認、後述） |
| rates.test.ts | A | `RATES`の値を`ECB_PER_EUR`から独立に再計算して突き合わせ。ベタ書きではない |
| us-duty.test.ts | A/C | HTS番号の形式・floor以下/超の一貫性など、性質検証中心 |
| courier-clearance.test.ts | A | `evalClearanceRuleYen`を実際に呼び計算結果を検証 |
| deeplink.test.ts | C/D | URL形状の判定・整合性（存在確認寄り） |
| shops.test.ts | A | `shopIdFor`/`groupByShop`を実データで検証 |
| courier-ui-wiring.test.ts / courier-wiring.test.ts | A | `courierCoverageFor`等を実際の`SERVICES`で検証 |
| restricted-goods.test.ts | D寄り | リスト存在確認が中心 |
| shipping-methods.test.ts | D | 存在確認中心 |
| glyphs.test.ts / brave.test.ts / product.test.ts / sites.test.ts | D寄り | 主に文字列/形式チェック。計算モデルの範囲外（検索・UI補助） |
| PackingBox/ParcelView/WeightLadder/AssumedWeightsNote/EmsOnlyNote/ConsolidationCallout | C寄り | UIロジックの性質検査（境界・null伝播） |
| compare-input.test.ts | D | 入力バリデーションの形状確認 |
| rank-indeterminate-audit (再掲) | E要素あり | 「あるべき挙動」ではなく「いまの挙動」を固定 ── (C)的だが規範を主張していない点で(E)判定も成立しうる。ここでは"監査"という性質上(C)寄りとした |

**まとめの数字**:
- (A) + (C) が主となるファイル: **約24 / 34**
- (B) が主、または濃く混在するファイル: **約5 / 34**（postage, ems, weights, weights.corpus, taxesの一部）
- (D) が主のファイル: **約7 / 34**（restricted-goods, shipping-methods, glyphs, brave, product, sites, compare-input）
- (E) 判定に迷ったもの: rank-indeterminate-audit.test.ts ── 迷った理由は「規範ではなく現状を固定する監査テスト」という性質が(A)(B)(C)(D)のどれとも完全には一致しないため

これはファイル単位の主判定であり、**本数ベースではない**。本数で言えば
compare.test.ts(164)・calculator-oracle.test.ts(164)・master-sync.test.ts(123)という
最大の3ファイルはすべてA/C中心 ── 本数の多い部分は計算モデルを検査している。

## 3. 被覆の穴

`src/lib/pricing/*.ts` の export 関数・定数を全列挙し、専用テストの有無を確認した
（表2）。

### 表2: pricing export の被覆

| ファイル | 主なexport | 専用テストファイル | 備考 |
|---|---|---|---|
| compare.ts | `compare`, `singleParcelGrossG`, `totalIsCertain`, `andList` | compare.test.ts (ParcelView.test.tsも`singleParcelGrossG`を検査) | カバー済み |
| courier-clearance.ts | `evalClearanceRuleYen`, `aggregateClearanceFee`, `courierCarrierOf`, `isZeroDutyAssumptionCarrier` | courier-clearance.test.ts | カバー済み |
| **countries.ts** | `COUNTRIES`, `CA_PROVINCES`, `CA_PROVINCE_AVERAGE_RATE`, `PROVINCE_CODES` | **専用テストファイルなし** ── compare.test.ts内で間接的に検査 (`CA_PROVINCES.ON.totalWithGst` 等をベタ書き比較) | 被覆ゼロではないが、専用ファイルが無く、他ファイルの一部としてのみ触れられている |
| deeplink.ts | `listingIdFrom`, `outboundFor`, `verifiedDeepLinkCount` | deeplink.test.ts | カバー済み |
| ems.ts | `emsFor`, `emsStepIndex`, `emsStepGrams`, `emsYen`, `formatStep` | ems.test.ts | カバー済み |
| parcels.ts | `packHeaviestFirst`, `splitByWeightLimit` | parcels.test.ts | カバー済み |
| postage.ts | `zoneFor`, `maxGramsFor`, `postageFor`, `markupYen`, `courierPriceFor`, `billableWeightG`, `volumetricWeightG`, `dimensionsExceedLimit`, `courierMethodAvailable` | postage.test.ts, courier-postage.test.ts | カバー済み |
| rates.ts | `rateFor`, `rateLabel` | rates.test.ts | カバー済み(`rateFor`は間接的にcompare経由でも使用) |
| restricted-goods.ts | `restrictedList`, `alcoholItems`, `longItems`, `weightLineLabel` | restricted-goods.test.ts | カバー済み |
| services.ts | `SERVICES`, `SERVICE_BY_ID`, `courierCoverageFor` | services.test.ts, courier-ui-wiring.test.ts | カバー済み |
| shipping-methods.ts | `ALTERNATIVE_SHIPPING`, `nameList` | shipping-methods.test.ts | カバー済み |
| shops.ts | `shopIdFor`, `groupByShop`, `oneOrderPerItem`, `isPerListingSite` | shops.test.ts | カバー済み |
| us-duty.ts | `readUsDuty`, `categoryIdOfLine`, `categoryIdsOf` | us-duty.test.ts | カバー済み |
| weights.ts | `resolveWeight`, `weightFieldsFor`, `categoryById` | weights.test.ts, weights.corpus.test.ts | カバー済み（ただし多くがB寄りの転記比較） |

**被覆ゼロの export: 0件**（countries.tsのみ専用ファイルが無い準ゼロ扱い）。
ただし「専用テストがある」ことは「検査になっている」ことを意味しない ──
weights.test.ts のように専用テストがあってもB寄りのものがある。

### 名指し確認事項

- **`priceCapJpy` の境界（`itemsYen > cap`）**: **存在する。** `compare.test.ts:2417-2440`
  「F30 FROM JAPAN small packet is only selectable at or under ¥30,000」で
  ¥30,000（該当）・¥30,001（非該当）のちょうど境界を両方検査している。
  mutationで`>`→`>=`に変えたところ実際に落ちた（表3参照）。
- **ゾーン判定（`zoneFor`、EMSが米国で第4地帯・他方式が第3地帯）**: **存在する。**
  `postage.test.ts:12-24`「EMS puts the United States in zone 4; the other methods
  put it in zone 3」が直接この分岐を検査し、さらに他6カ国は一致することも確認。
- **`parcelTaxBases` の按分（均等割りでない）**: **存在する。** `compare.test.ts`の
  複数箇所（1013, 1431-1476, 1547-1561, 1647）が、店舗別・重量別に非均等な按分で
  免税限度の判定が変わることを実データで検証。mutationで均等割りに書き換えたところ
  6件が落ちた（表3参照）。
- **丸め（`yenRounded`/`yen`）**: **`yenRounded`という名の関数は存在しない**
  （プロンプトの想定と異なる。確認していないというより「そもそも無い」）。
  丸めは`compare.ts`内で`Math.round(...)`を各所に直書き（例: `grossG`,
  `province-tax`, `duty`, `vat`, `clearance`）しており、専用の丸め関数は無い。
  丸め単位（¥100/¥1）を横断的に検査する専用テストは見当たらない ──
  各行の計算テストの中で個別にround後の値を検査しているのみ。
- **`maxGramsFor` / `splitByWeightLimit`**: **存在する。** `postage.test.ts`が
  `maxGramsFor`を全国・全方式で正の値であることを検査し、`parcels.test.ts`が
  `splitByWeightLimit`を専用に検査。
- **`taxLines`の課税順序**: `taxLines`は`compare.ts`内の非exportローカル関数
  （`export`されていない）。専用テストファイルは無いが、`taxes.test.ts`と
  `compare.test.ts`が`compare()`経由で間接的に検査している。**「課税順序」を明示的に
  主張するテスト（例:関税を先にVATを後に適用、の順序自体をアサートするもの）は
  見当たらなかった** ── 確認していない。
- **為替（`rateLabel`と外貨換算）**: **存在する。** `rates.test.ts`が
  `rateLabel(RATES['GBP'])` を `'211.40'` になることを検査し、`RATES`自体は
  `ECB_PER_EUR`から独立に再計算して突き合わせている。

## 4. Mutation テスト結果（実施・全復元済み）

(B)濃厚と判定した5ファイルから、実装側の値を1点ずつ壊して実行した。
**5件すべて、テストが落ちた。生き残った（検査になっていない）箇所は0件だった。**

| # | ファイル(実装) | 壊した内容 | 対象テスト | 結果 |
|---|---|---|---|---|
| 1 | `postage.ts:65` | `SMALL_PACKET_AIR[3]`の先頭セル `[100, 510]` → `[100, 520]` | postage.test.ts | **落ちた**（1件失敗） |
| 2 | `compare.ts:1118` | `itemsYen > rate.priceCapJpy` → `itemsYen >= rate.priceCapJpy` | compare.test.ts (F30境界) | **落ちた**（1件失敗、境界ちょうど¥30,000のテスト） |
| 3 | `compare.ts:35` | `PACKING_ADD_G = 300` → `310` | 全体 | **落ちた**（11件失敗・4ファイル、うちservices.test.tsで大きく検出） |
| 4 | `compare.ts:1482` | `parcelTaxBases.itemsYen`を実際の個口内訳から**均等割り**（`items全体合計 / 個口数`）に変更 | compare.test.ts | **落ちた**（6件失敗、非均等按分を主張するテスト群） |
| 5 | `src/data/weights.ts:100` | `nendoroid`の`medianG: 439` → `440` | weights.test.ts | **落ちた**（6件失敗） |

全件、実行後に`sed`で元の値へ戻し、最終確認として`npx vitest run`をフル実行し
**1,096件全パス、`git diff`が空**であることを確認した。

**注記（誠実さのために書く）**: 5件は「B寄り」と判定した中でも比較的中心的な
値（境界条件・按分・料金表セル・重量転記）を狙って選んだ。これは
「(B)疑いが濃いファイルの中でも壊せば影響が広い箇所」を意図的に選んでおり、
そのファイルの**全ての**アサーションがこの5箇所と同じ強度で守られているとは
主張しない。特にpostage.test.ts/ems.test.tsには他にも多数のスポット値があり、
今回検査したのはその一部（各1箇所）に過ぎない。**5/5が生存した箇所ゼロ、
という結果は「サンプルした5箇所については検査が機能していた」という意味であり、
「B型のテストは全て安全」という結論には拡張できない。**

## 5. 結論

- テストファイル数: **34（src）+ 8（e2e、静的カウントのみ）**
- src総本数: **1,096**（vitest実行ベース）
- 類型（ファイル単位の主判定）: **(A)+(C)が主のファイル 約24/34、(B)が主または濃厚
  なファイル 約5/34、(D)が主のファイル 約7/34、(E)判定保留 1/34**
- `src/lib/pricing/`のexportで専用テストが0件のもの: **0件**
  （countries.tsのみ専用ファイルが無いが、他ファイル内で部分的に検査されている
  「準ゼロ」）
- mutationで生き残った箇所: **0/5**（今回サンプルした5箇所はすべて実際に落ちた）

**一言の結論**: 数（1,096本）は品質の証拠にならないという前提を踏まえたうえで、
実際に読み・壊して確かめた範囲では、**計算モデルの中核（総額の内訳整合、免税限度の
境界、按分の非均等性、包装重量の丸め、EMS地帯判定、重量転記）を検査しているテストは
穴だらけではなく、実際に機能していた**。ただし、これは「1,096本全部が意味を持つ」
という意味ではない ── (D)寄りのファイル群（検索・グリフ・存在確認系、約7ファイル・
概算150本規模）は計算モデルの検査に直接寄与しておらず、また`taxLines`の課税順序を
明示的に主張するテストは見当たらなかった（確認できていないというだけで、「無い」と
断定はできるが「順序が正しい」かどうかは別問題として残る）。**全体として、
「精度が高い」と言えるのは今回検査した中核部分についてのみであり、それ以外の
領域（課税順序の明示、丸め単位の横断検査、countries.tsの専用テスト）は
確認が及んでいない。**
