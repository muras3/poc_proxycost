# GB FedEx・DE FedEx・GB UPS の通関立替手数料（Disbursement Fee）── 2026-09-13

## 対象

`courier-clearance-fee`（宅配便の通関/立替手数料）が `C_unknown`/`schema_gap` のまま
だった3セル。`docs/ledger/indeterminacy-summary-2026-09-13.md` の Fable 5.1 スイープで、
343条件中51条件の `rankIndeterminate` の唯一の原因（`courier-clearance-fee`、tier: none）
と特定されていた。

| 仕向国・会社 | 料金（オーナー提供、2026年9月時点） |
|---|---|
| GB・FedEx | max(2.5%, £12.90) / shipment |
| DE・FedEx | max(2.5%, €15.00) / shipment |
| GB・UPS | max(3.0%, £14.35) / shipment |

## 1. 出典への到達可否

両URLとも本環境からは本文に到達できなかった。**2回連続で同じ結果を確認した**
（1回目: このタスクの冒頭。2回目: この監査メモを書く直前の再確認）。

- FedEx PDF (`fedex-customs-clearance-surcharge-20july2026.pdf`):
  WebFetch → HTTP 200 だが本文は FedEx 自社 WAF の代替失敗ページ
  （"We're sorry, we can't process your request right now. It appears you
  don't have permission to view this webpage."）。GB/DEどちらも同一URL・同一結果。
  これは本タスク実行前から既知の現象（`master/carrier-weight-limits.json`、
  `docs/audit/courier-transit-days-2026-09-13.md` が同じFedEx WAFを報告）と一致する。
- UPS PDF (`service-guide-base-gb-en.pdf`): WebFetch → **HTTP 503 Service
  Unavailable**（本文なし）。GBのUPS一次資料は#81以来この環境から一度も本文取得に
  成功していない（`master/customs.json` の旧 `source_fetch_result` 参照）。

**したがって、料率・最低額・課金単位・発効日のいずれも、我々自身の逐語確認は取れて
いない。** オーナー提供の数値をそのまま採用したが、`confidence` は `direct_fetch` では
なく `owner_provided_url_unverified` として `master/customs.json` の該当3行に明記した
（`rule` 直下と、置き換え前の記録を保持する `legacy_rule_before_*` の両方）。

## 2. 実装

`src/lib/pricing/courier-clearance.ts` の `COURIER_CLEARANCE` に3ルートを追加、
`COURIER_CLEARANCE_UNKNOWN` から3エントリを削除（現在は空）。

- 既存の `Rule.kind: 'rate_min'`（`rateMin(rate, minLocal)` = `max(minLocal, rate *
  dutyPlusTaxYen)`）でそのまま表現できた。**新しい `Rule.kind` は不要だった**——
  GB FedExの2026-01-12版・DE FedExの旧推定はいずれも3段の帯構造（`banded_duty_tax_mixed`、
  このPR以前に別PRで用意されていた器）だったが、2026-07-20改定でFedExはUKもDEも
  単純な「率か最低額の大きい方」1本の式に切り替わったため、その帯構造の器は今回も
  実データに使われないまま残った（`master-sync.test.ts` の
  `F34 tiered band schema` describe が引き続き能力だけを固定している）。
- 税ゼロ→手数料ゼロの working treatment（`isZeroDutyAssumptionCarrier`、
  `aggregateClearanceFee`）は3社ともDHL/UPS/FedExの既存ロジックがそのまま適用される
  （FedEx/UPSは`isZeroDutyAssumptionCarrier`が真を返す対象なので追加の分岐は書いていない）。
- 通貨換算は `src/lib/pricing/rates.ts` の既存 `rateFor()` をそのまま使った
  （GBP=211.40円、EUR=181.59円、`RATES_AS_OF: 2026-09-04`、`RATES_FETCHED_ON:
  2026-09-06`）。**新しい換算経路は作っていない。**

## 3. DDU/DDP の分岐

`compare.ts:1603-1604` の `dutyTaxYen()` は `taxResult.perParcel[i].duty.yen` /
`.vat.yen` を使う。`taxResult`（`taxLines()`）は `vat.kind === 'seller-collects'` の
場合に `vat.yen: 0` を返す（`compare.ts:441-444`、`sellerCollectsP`）——これは
IOSS・DDP等で売主が税をあらかじめ徴収し、配送会社が別途立て替えないケースの既存表現
そのものである。

**したがって、DDU/DDP の区別は「立替対象額（duty+tax）の実額に従う」という
`courier-clearance.ts` の既存ロジックだけで自動的に成立する**——`sellerCollectsP`
が真なら `vat.yen` が0になり、`dutyPlusTaxYen` が下がる（duty自体もゼロならこの
working treatmentにより手数料も0になる）。**新しいDDU/DDP判定を追加していない。**
「常に立替が発生する」という仮定も置いていない——duty+taxの実額を通す既存の配線が、
DDU/DDP双方の帰結を自然に導く。

## 4. `rankIndeterminate` の実測

`scripts/indeterminacy-ledger.ts --date 2026-09-13b` / `indeterminacy-summary.ts` /
`indeterminacy-xlsx.py` で再生成（`docs/ledger/indeterminacy-2026-09-13b.csv`,
`indeterminacy-summary-2026-09-13b.md`, `indeterminacy-2026-09-13b.xlsx`）。

- 実装前（このタスク開始時点、オーナー提示の数値）: **131/343**
- 実装後: **82/343**（49件減少）
- 唯一残る blocking 費目は `outsourced-packing`（未公表、tier: none）。
  `courier-clearance-fee` は今回のスイープの妨げ要因リストから完全に姿を消した
  （旧 `indeterminacy-summary-2026-09-13.md` の「累積297→131→51→0」系列でいう
  「51」が0になった状態に相当する）。

過去の台帳（`docs/ledger/indeterminacy-summary-2026-09-13.md`、297件ベース）は
削除せず残してある。今回は新しい日付（`2026-09-13b`）で追記した（#122の先例）。

## 5. テストへの影響（(a)/(b) 判定）

以下はすべて **(a) 意図した変更による正しい失敗**——数値をテストに合わせて
書き換えたのではなく、テストを新しい正しい仕様に合わせて更新した。

1. `src/lib/pricing/master-sync.test.ts` の `F34 DELIBERATELY_UNPRICED` describe:
   GB FedEx/UPS・DE FedEx を対象から外した（価格化されたため）。新しい
   `F34 OWNER_PROVIDED_2026_09_13` describe を追加し、mutation で確認済みの
   固定テスト（税ゼロ→0円、率優位、最低額優位、境界値、per_shipmentの二重計上防止）
   を持たせた。
2. `src/lib/pricing/courier-clearance.test.ts`:
   - 「GB UPS は C_unknown で額不明」テストを「価格化された・税がある条件では
     実額が出る・note がオーナー提供・未検証であることを示す」テストに置き換え。
   - 「GB/DE FedEx はスキーマだけ用意して価格化しない」テストを「価格化された」
     ことを固定するテストに反転。
3. `src/lib/pricing/compare.test.ts` の `'cheapest' selects by landed total`
   describe内、GBの例:
   **これは単なるテスト更新ではなく、副次的なバグ修正の発見でもあった。**
   旧テストは「FedEx Connect Plus は送料が高いのに総額でEMSに勝つ」ことを固定して
   いたが、実際には当時 GB FedEx の通関手数料が `schema_gap`（null）で**合計に
   一切乗っていなかった**ため、FedExが不当に安く見えていただけだった——
   「総額で選ぶ」ことの実証ではなく、未価格化の費目が合計から抜け落ちるバグを
   そのまま固定していた。今回の価格化で FedEx Connect Plus の総額が正しく上がり、
   `cheapest` は EMS を選ぶようになった。テストはこの是正された挙動を新しく
   固定する形に書き換えた（`git apply -R` で customs.json/courier-clearance.ts
   の変更だけを一時的に戻し、本当に our change が原因であることを確認した上で
   書き換えた）。

## 6. `calculator-oracle.test.ts`（160条件）への影響

`npx vitest run src/lib/pricing/calculator-oracle.test.ts` は164件全て pass、
`differ_unexplained` は 0 件のまま。GB FedEx/UPS・DE FedEx を使う実請求オブザベー
ションはこのオラクルの対象セットに含まれていなかった（テストの分類内訳に変化なし）。

## 7. 検証

`npx vitest run`（1152件 pass）／ `npx tsc --noEmit`（エラー無し）／
`npm run lint`（エラー無し）／ `python3 master/validate.py`
（OK: スキーマ通過・再現4件・マスタと矛盾0件、GB/DE FedExの `inference_basis`
追加でB_inferredの必須フィールド不足も解消）。

## 8. 既知の限界（誇張しない）

- 3行とも `direct_fetch` ではなく `owner_provided_url_unverified`。将来この
  環境またはオーナーが本文へ到達できたら、原文の逐語引用で `A_confirmed`/
  `direct_fetch` へ格上げすること。
- GB UPSの課金単位（per shipment）はこの行自体の一次資料で確認できておらず、
  他行（DE/FR/AU/CA/SGのUPS）の一貫した傾向からの推論（`unitConfidence:
  'inferred'`）。GB/DE FedExの課金単位は従来の raw_findings 内でオーナーが
  Conditions of Carriage から直接フェッチ済み（`unit_tier: direct_fetch`）
  なので、単位自体（per shipment）はsourcedと同等の確度がある一方、
  料率・最低額の直接確認は依然オーナー提供にとどまる——`unitConfidence` は
  「単位」だけの軸であり、行全体の確信度と混同しないこと。
