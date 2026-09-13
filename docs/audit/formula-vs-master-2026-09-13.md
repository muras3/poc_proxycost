# formula-vs-master 監査（2026-09-13）

## スコープと方法

`master/fees.json`（70行）と `master/customs.json` を対象に、オーナーが挙げた4軸
（課金単位／上限下限／丸め／税計算順序）について、コードとの整合を検査した。

**手法**: `master-sync.test.ts` がすでに fees.json の全行と customs.json の F34
（通関手数料・28セル）を機械的に MAPPED/CONFLICT/NOT_IN_CODE に振り分け、期待値を
master から動的に読んでいる（ベタ書きの再発を防ぐ設計、docstring 参照）。これは
「マスタとコードの値が一致しているか」を毎行検査する仕組みとしてすでに機能している
ため、本監査はそれを土台に、**4軸のうち踏み外しやすい分岐点を選び、実際にコードを
壊して該当テストが red になるかを確認する変異テスト**を主手法にした。128行すべてを
1行ずつ手で読み直す時間は取れておらず、軸ごとに代表的な分岐（billing unit の3箇所、
floor/ceiling の2箇所、CIF税計算順序の2箇所）をサンプルした。**これは全数監査では
なく、指定された4軸に絞った深掘りサンプル監査**であることを明記する。

## 実施した変異テストと結果

| # | 対象 | Master の規則 | 変異内容 | 結果 |
|---|---|---|---|---|
| 1 | `compare.ts` `feeLines()` の `chargedPerDistinctItem` | Neokyo/ZenMarket/FROM JAPAN は「同一商品を複数個買っても手数料は1回」と自社ページに明記 | `countOf` を常に `i.qty` に変更（品数ではなく点数で課金） | **4件 red**。billing unit（同一商品の重複計上）はテストで守られている |
| 2 | `compare.ts` `buildRow()` の `ordersGroupedByShop` | Buyee のショッピングのみ「同一店舗なら1注文」 | 常に `oneOrderPerItem(items)` に固定（まとめない） | **8件 red**。守られている |
| 3 | `courier-clearance.ts` `evalClearanceRuleYen` の `rate_min` | DHL/UPS の ~¥2,734 下限（`greater_of`/`rate_min`） | `Math.max(min, rate*base)` → `rate*base` のみに変更（下限を外す） | **3件 red**。守られている |
| 4 | `courier-clearance.ts` `evalClearanceRuleYen` の `rate_min_max`（SG UPS） | `rate_of_import_charges_with_min_and_max`: 5.6%、下限S$22.50、**上限S$100** | `Math.min(v, maxLocal*ccyToJpy)` を外し、上限を適用しないコードに変更 | **927件 all green（検出ゼロ）** ── 上限が外れても何も落ちない |
| 5 | `compare.ts` の CA 関税ベース（`dutyBaseYenP`） | CBSA D13-3-3/D13-3-4: 関税・GST・州税は共通ベース＝商品代＋国内送料（国際送料は除く） | `cc === 'CA' ? p.itemsYen + p.domYen : p.baseYenP` → 常に `p.baseYenP` | **4件 red**。守られている |
| 6 | `compare.ts` の CIF 国の VAT ベース（関税込みか） | GB/DE/FR/SG は `base: 'CIF'` で、VATは関税込みの額に課税 | `vatBaseP = c.base==='CIF' ? p.cifP + dutyYenP` → `p.cifP` のみ（関税を含めない） | **3件 red**。守られている |
| 7 | `compare.ts` の DE/FR `flatDutyPerItem` 免税枠内適用 | 免税枠（€150）**以下**でも €3/点の flat duty がかかる（免税＝0ではない） | flat 分岐を無効化し、免税枠以下を常に無税として計算 | **12件 red**。守られている |

（すべての変異は確認後に元へ戻し、`npx vitest run` で 927/927 green に復帰したことを確認済み。差分は残っていない。）

## 主な発見

### 【最重要】SG UPS の通関手数料上限（S$100）に、それを破っても検知できるテストが無い

- **master の規則**（`master/customs.json` route `ups_disbursement`）:
  `rule.type = "rate_of_import_charges_with_min_and_max"`、`rate: 0.056`、
  `min: 22.5`、`max: 100.0`（SGD）。原文引用: *"5.6% of the import duties and
  taxes, subject to a minimum of S$22.50 and maximum of S$100 per shipment."*
- **コード**: `src/lib/pricing/courier-clearance.ts:395` の
  `{ kind: 'rate_min_max', rate: 0.056, minLocal: 22.5, maxLocal: 100 }` を、
  同ファイル446行目 `evalClearanceRuleYen()` の `case 'rate_min_max'` が
  `Math.min(Math.max(minLocal*ccy, rate*base), maxLocal*ccy)` として正しく評価する。
  **実装そのものは master と一致している。**
- **問題**: 上限（`Math.min(..., maxLocal*ccyToJpy)`）を丸ごと削除しても
  `npx vitest run` は **927/927 green のまま**（変異テスト#4）。加えて
  `python3 master/validate.py` 自身が
  `SG/UPS(ups_disbursement): rule.type='rate_of_import_charges_with_min_and_max' ── 評価器はあるが fixture 無し`
  と報告しており、**この規則を実際の値で駆動するfixtureが存在しないことは
  マスタ側のバリデータもすでに把握している**——コードとバリデータの両方が
  独立に「上限に到達する具体的なケースで検証されていない」ことを示している。
- **向き**: この上限は課税額が大きいカート（duty+tax が S$100/0.056 ≈ S$1,786
  を超える）で効くはずのガードで、外れると**上限超過分だけ過大計上**になる
  （このリポジトリの主眼である「過小評価が危険」の逆方向だが、コードが今後
  リファクタで壊れても誰も気づけない、という意味でのリスク）。
- **証拠**: 変異テスト#4（`Math.min` 削除で 927/927 green）＋
  `master/validate.py` の `fixture 無し` 警告（独立した2つの検知経路が
  一致）。
- **推奨（実装はしていない。監査の指示どおり修正はオーナー判断）**: `duty+tax`
  が S$1,786相当を超えるSG宛カートを1件、`compare.test.ts` か
  `courier-clearance.test.ts` に固定ケースとして追加し、`amount` が
  S$100換算の円額で頭打ちになることを assert する。

## 4軸のうち、サンプルした範囲でクリーンだったもの

- **課金単位（billing unit）**: `chargedPerDistinctItem` と `ordersGroupedByShop`
  はいずれも変異で red になった（#1, #2）。PR #111/#116 が統一した宅配便の
  per-shipment化についても、`courier-clearance.test.ts`
  （`到達不能な分岐であること自体をピン留め`と docstring にある）と
  `master-sync.test.ts` の F34 MAPPED セクションが customs.json の全28セルを
  カバーしている。この軸はサンプルした範囲で健全。
- **最小額（floor）**: DHL/UPSの `rate_min` 下限は変異で red になった（#3）。
- **税計算順序（duty→VAT、CIF vs FOB、goods vs CIF閾値）**: CA・CIF国のVATベース・
  DE/FRのflatDutyPerItemはいずれも変異で red になった（#5, #6, #7）。加えて
  `dutyFreeLimit`/`vatFreeLimit` の判定に使う `declaredP`（`p.itemsYen / rate`、
  = 商品代のみ）は CIF国でも一貫して「goods」ベースで判定しており
  （`compare.ts:340-341, 349, 352, 439`）、閾値がCIFベースの数量と取り違えられて
  いる箇所はサンプル範囲では見つからなかった。
- **丸め**: `volumetricDivisorCm3PerKg` は全社 `5000` に統一されており（PR #82の
  668行確認と整合）、コード中に `6000` や社ごとに異なる除数は見つからなかった。
  宅配便の実測レート（`courierPriceFor`）は観測値をそのまま区間で返す設計で、
  独自の丸め・容積重量の掛け直しをしない（docstring で明示: 「容積重量を掛け直さない」）
  ため、丸め規則を別社に貸すという形の欠陥はこの経路には存在しない。**上限（最大)側の
  発見（本レポート主眼）以外、この軸自体はサンプル範囲でクリーン。**

## テストが無い、または検知力が確認できていないルール（次の欠陥が出やすい場所）

- **SG UPS の `rate_min_max` 上限（S$100）** ── 上記の最重要発見そのもの。
- `master/validate.py` の出力にある他の「評価器はあるが fixture 無し」行も同じ
  形のリスクを負っている（本監査ではSG UPS以外は変異テストしていない）:
  - SG FedEx (`greater_of`)
  - SG ECMS (`rate_of_import_charges`)
  - TW 快遞 COD (`fixed_per_parcel`)
- 上記いずれも、変異させて red になるかを実際には確認していない
  （時間の制約でSG UPSのみ深掘りした）。**次にここを見る人向けの候補リスト**として記録する。

## Verify（実行結果）

- `npx vitest run`: 監査前 **927 passed**、監査後（すべての変異を revert 済み）
  **927 passed**（変更なし——本監査はコード・master 双方とも変更していない）
- `npx tsc --noEmit`: エラー無し
- `npm run lint`: エラー無し
- `python3 master/validate.py`: `OK: スキーマ通過 / 再現 4件（うち独立1件）/ マスタと矛盾 0件`
  （このコマンド自身が上記の「fixture 無し」4行を報告している——本監査の発見と独立に一致）
- `python3 master/render-docs.py --check`: `OK`（docs/MASTER.md, README.md ともに一致）

## 除外・すでに解決済みとして扱ったもの

- 宅配便への §2④ 重量上限分割の未接続、DHL以外の拒否/追加料金の未確定は
  `CLAUDE.md` §9 の通り既知の事項として再報告しない。
- ロードマップの8件の仮置き仮定（4件が過小評価側）は `docs/ROADMAP.md` に
  索引済みとして再報告しない。
- `invoice_check` が `never_checked` の行が大半であることは、このタスクの
  前提（内部整合性の監査であり実額検証ではない）として承知している。
