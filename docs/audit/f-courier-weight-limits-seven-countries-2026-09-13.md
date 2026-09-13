# 宅配便4社の重量・寸法上限 ── 7か国 一次情報収集（2026-09-13）

`docs/DESIGN-BOX-SIZE.md` §2④（分割 ── 方式の上限を超えたら箱を増やす）は日本郵便のみ実装済み
（PR #85）で、`maxGramsFor()` は `PostalMethod` しか受け取らない。宅配便4社（DHL Express / UPS /
FedEx / ECMS）に対して同じ分割を適用できないのは「意図的な省略」ではなく、**単に各社の公表値を
集めていなかっただけ**という前提に立ち、US/GB/DE/FR/AU/CA/SGの7か国について一次資料を集めた。

**スコープは `master/`（新規ファイル `master/carrier-weight-limits.json`）と本ノートのみ。
`src/` は一切変更していない。`master/customs.json` と `master/validate.py` にも触れていない。**

## 結論を先に

1. **DHL Express は「サーチャージ」であって「拒否」ではない。** 各国レートガイドの巻頭比較表が
   掲げる1ピース上限（150lb/US、70kg/他6か国）を超えても、その場で拒否されるのではなく
   Overweight Piece サーチャージ（US $100.00、DE €100.00/€50.00等、per piece）が課金される。
   実際に「受け付けない」と明言されるのは、7か国共通の脚注が定めるはるかに高いネットワーク全体の
   上限（ピース1,000kg/300cm、出荷全体3,000kg）を超えた場合のみ。**したがって §2④ をDHLに接続する
   なら、150lb/70kgの壁ではなく1,000kg/300cmの壁で分割すべき**というのが直接の含意になる
   （ただし本製品が想定する荷物の重量域でこの壁に達することはまず無い）。
2. **UPS は文書の性質によって記述が割れている。** US Terms of Carriage・CA Rate & Service Guide・
   AU/GB共通のTerms and Conditions of Serviceは「UPSシステムで検知されれば追加料金（Over Maximum
   Weight/Length/Size）の対象」とサーチャージ方式を明記する一方、**SGのService Guideだけは
   「not accepted for transportation」と拒否方式を明記している。** 同じ数値（70kg/274cm/400cm）に
   ついて文書ごとに言っていることが違う、という一次資料同士の矛盾を解けないまま記録した。
3. **UPSの長さ+胴回り合計上限は単一の値ではない。** US/CAは165in(419cm)、AU/GB/SGは157in(400cm)。
   1ピース最大重量(150lb/70kg)と最大長(108in/274cm)は7か国で一致するとみられるが、胴回り込みの
   合計上限は少なくとも2系統ある。
4. **FedExは7か国すべて`input_rejected`。** fedex.com の複数URLがHTTP 200で応答するが、本文は
   「FedEx | System Down」というWAF側フェイルオーバーページで、実際のレートガイド/サービスガイドの
   本文には一度も到達できなかった。タスク指示が事前に警告した症状をそのまま再現した。二次情報
   （フォワーダーのブログ等）による代替は行っていない。
5. **ECMSは独自の重量上限を公表していない（`counted_absence`）。** US/UK/SGのTerms & Conditions
   は課金方式（実重量or体積重量の大きい方、再計量あり）を説明するのみで、具体的な上限値（kg/cm）
   は一切記載がない。「パートナー宅配業者の上限を継承している」はもっともらしい推測だが、
   T&C自身がそう明言しているわけではないため断定していない。DE/FR/AU/CAはECMSの法人自体が
   未確認（`docs/audit/f34-ups-ecms-seven-countries-2026-09-12.md` と同じ結果）。

## 表：carrier × destination × 1ピース最大重量 × 最大出荷重量 × 寸法上限 × 拒否/サーチャージ × confidence × source × 読取日 × 逐語引用

### DHL Express（フラッグシップ商品 "DHL Express Worldwide"）

| 国 | 1ピース最大重量 | 最大出荷重量 | 寸法上限(L×W×H) | ネットワーク全体の拒否ライン | 拒否/サーチャージ | confidence | source | 読取日 | 逐語引用 |
|---|---|---|---|---|---|---|---|---|---|
| US | 150 lb (68.0kg) | 6,600 lb | 48×32×32 in | 2,200 lb/118 in、出荷 6,600 lb | **surcharge**（Overweight Piece $100.00/piece） | A_confirmed/direct_fetch | [US Rate Guide 2026](https://mydhl.express.dhl/content/dam/downloads/us/en/rate-guide/service_and_rate_guide_us_en_2026.pdf.coredownload.pdf) | 2026-09-13 | あり |
| GB | 70 kg | 3,000 kg | 120×80×80 cm | 1,000 kg/300 cm | reasoned_judgement_unconfirmed（US/DEと同型と推定） | A_confirmed（数値）/B_inferred（拒否orサーチャージ） | [GB Rate Guide](https://mydhl.express.dhl/content/dam/downloads/gb/en/rate-guide/service_and_rate_guide_gb_en.pdf.coredownload.pdf) | 2026-09-13 | あり |
| DE | 70 kg | 3,000 kg | 120×80×80 cm | 1,000 kg/300 cm | **surcharge**（Overweight Piece €100.00/€50.00、独自に再確認） | A_confirmed/direct_fetch | [DE 独語T&C準拠PDF](https://www.dhl.de/dam/jcr:66008de1-5933-4497-a194-ab7f4626d671/dhl-express-produkte-services-und-preise-en.pdf) | 2026-09-13 | あり |
| FR | 70 kg | 3,000 kg | 120×80×80 cm | 1,000 kg/300 cm | reasoned_judgement_unconfirmed | A_confirmed（数値）/B_inferred | [FR Rate Guide](https://mydhl.express.dhl/content/dam/downloads/fr/en/rate-guide/service_and_rate_guide_fr_en_2026.pdf.coredownload.pdf) | 2026-09-13 | あり |
| AU | 70 kg | 3,000 kg | 120×80×80 cm | 1,000 kg/300 cm | reasoned_judgement_unconfirmed | A_confirmed（数値）/B_inferred | [AU Rate Guide](https://mydhl.express.dhl/content/dam/downloads/au/en/rate-guide/service_and_rate_guide_au_en_2026.pdf.coredownload.pdf) | 2026-09-13 | あり |
| CA | 70 kg (150 lb) | 3,000 kg (6,600 lb) | 未取得（表の行はあるが抽出テキストに値が載らなかった） | 1,000 kg/118 in | reasoned_judgement_unconfirmed | A_confirmed（重量）/C_unknown（寸法） | [CA Rate Guide](https://mydhl.express.dhl/content/dam/downloads/ca/en/rate-guide/service_and_rate_guide_ca_en_2026.pdf.coredownload.pdf) | 2026-09-13 | あり（重量部分） |
| SG | 70 kg | 3,000 kg | 120×80×80 cm | 1,000 kg/300 cm | reasoned_judgement_unconfirmed | A_confirmed（数値）/B_inferred | [SG Rate Guide](https://mydhl.express.dhl/content/dam/downloads/sg/en/rate-guide/service_and_rate_guide_sg_en_2026.pdf.coredownload.pdf) | 2026-09-13 | あり |

DHLは**グローバルでほぼ単一の上限**（US以外は70kg/120×80×80cm/1,000kg/300cmで完全一致、USはヤード・
ポンド法の慣用値でわずかに異なるだけ）。目的が違う2つの数値（150lb/70kgのサービス上限とその何倍もの
1,000kg/300cmのネットワーク上限）が両方公表されている点が今回の発見。

### UPS

| 国 | 1ピース最大重量 | 最大出荷重量 | 最大長 | 最大長+胴回り | 拒否/サーチャージ | confidence | source | 読取日 | 逐語引用 |
|---|---|---|---|---|---|---|---|---|---|
| US | 150 lb | 記載なし（沈黙） | 108 in (274cm) | 165 in (419cm) | **surcharge**（Over Maximum Weight/Length/Size） | A_confirmed/direct_fetch | [US Terms of Carriage 2026](https://assets.ups.com/adobe/assets/urn:aaid:aem:c6bf8a2f-018f-4aa0-838b-ffc1a75eb1d9/original/as/terms-carriage-us-en.pdf) | 2026-09-13 | あり |
| CA | 150 lb (68kg) | **明示的に無制限** | 108 in (274cm) | 165 in (419cm) | **surcharge** | A_confirmed/direct_fetch | [CA Rate & Service Guide 2026](https://assets.ups.com/adobe/assets/urn:aaid:aem:e359415f-4c37-47c2-b57d-c2ab60b6f527/original/as/rate-guide-ca-en.pdf) | 2026-09-13 | あり |
| AU | 70 kg (150lb) | 記載なし（沈黙） | 274 cm (108in) | 400 cm (157in) | **surcharge** | A_confirmed/direct_fetch | [AU/GB共通 Terms and Conditions of Service](https://assets.ups.com/adobe/assets/urn:aaid:aem:47e1afa5-edd6-476c-a0a9-4daeed41648a/original/as/terms-service-au-gb-en.pdf) | 2026-09-13 | あり |
| GB | 70 kg (150lb) | 記載なし（沈黙） | 274 cm (108in) | 400 cm (157in) | **surcharge** | A_confirmed/direct_fetch | 同上（AUと同一文書） | 2026-09-13 | あり |
| SG | 70 kg | **明示的に無制限** | 274 cm | 400 cm | **refused（"not accepted for transportation"）** | A_confirmed/direct_fetch | [SG Rate & Service Guide 2026](https://assets.ups.com/adobe/assets/urn:aaid:aem:b6e1facb-372a-49d8-a6c4-81e471a98857/original/as/service-guide-sg-gb-en.pdf) | 2026-09-13 | あり |
| DE | 70 kg (150lb)（未検証） | 不明 | 274 cm（未検証） | 400 cm（未検証） | 不明 | search_snippet_no_verbatim_quote | DE専用のURLを時間内に特定できず、Web検索の要約のみ | 2026-09-13 | なし |
| FR | 70 kg (150lb)（未検証） | 不明 | 274 cm（未検証） | 400 cm（未検証） | 不明 | search_snippet_no_verbatim_quote | 同上 | 2026-09-13 | なし |

## FedEx（7か国すべて `input_rejected`）

| 国 | 試したURL | 結果 |
|---|---|---|
| US/GB/DE/FR/AU/CA/SG（共通） | `https://www.fedex.com/en-us/shipping/international/rates-and-transit-times.html`、`https://www.fedex.com/content/dam/fedex/us-united-states/services/InternationalPackageServiceGuide.pdf` | HTTP **200**、ただしボディは `FedEx \| System Down` というWAF側フェイルオーバーページ。実コンテンツに到達せず |

タスク指示が予告した「HTTP 200だがWAFチャレンジ」を国別URLを変えても再現した。二次情報での代替は
行っていない（本リポジトリに既にNeokyoによるFedEx disbursement rateの陳腐化した孫引き例が1件あり、
同じ轍を踏まないため）。

## ECMS

ECMS EXPRESSのUS/UK/SG版Terms & Conditions（3法人版とも一言一句同一条文、
`docs/audit/f34-ups-ecms-seven-countries-2026-09-12.md` が既に確認済み）を再確認したところ、
**重量・寸法の具体的な上限値は一切記載されていない。** あるのは課金方式の説明のみ:

> "Delivery charge: ECMS EXPRESS's shipment charges are calculated according to the higher of
> actual or volumetric weight per piece and any piece will be re-weighed and re-measured by
> ECMS EXPRESS or ECMS EXPRESS's partner to confirm this calculation."

「ECMS EXPRESS's partner」という語が出てくることから、実配送を担うパートナー宅配業者の上限を
そのまま運用で使っている可能性は示唆されるが、T&C自身が「継承する」と明言しているわけではないため
`counted_absence`（US/UK/SG）として記録し、「inherits」は断定していない。DE/FR/AU/CAはECMSの
法人自体が未確認（重量上限以前の問題、`docs/audit/f34-ups-ecms-seven-countries-2026-09-12.md` と
同じ結果）。

## 埋め残し（このタスクの90分では埋まらなかったマス）

- UPSのDE/FRの正確な数値・一次資料URL（Web検索の要約はAU/GB/SGと同じ157in/400cm系だと述べたが、
  一次PDFを自分でフェッチして確認していない）。
- DHL CAの寸法上限（`Maximum piece dimensions` の行はPDFに存在するが、`pdftotext -layout`後の
  テキストで値がセルの位置ズレにより読み取れなかった。手作業でPDFのレイアウトを見れば埋まる
  可能性がある）。
- DHL GB/FR/AU/CA/SGのOverweight Pieceサーチャージ額そのもの（金額表の該当行を今回は
  US/DEでのみ個別に再確認した。同じ表構造が7か国とも存在するのはグレップ済みだが、各国通貨での
  金額は未確認）。

## 検証

- `python3 master/validate.py` → **OK: スキーマ通過 / 再現 4件（うち独立1件）/ マスタと矛盾 0件**
  （本タスクは `customs.json` を変更していないため、この結果はタスク開始前と同一のまま）。
- `python3 master/render-docs.py` → `docs/MASTER.md`・`README.md` の生成節を書き戻し、差分なし
  （新設の `master/carrier-weight-limits.json` は `render-docs.py` の対象外——`fees.json`と
  `customs.json`のみを読む固定実装のため、意図的に不整合は起きない）。
- `python3 master/render-docs.py --check` → **OK**（両ファイルとも一致）。
- `npx vitest run` → **905 passed**（`main` の905件と一致、既存テストへの影響なし。`src/`を
  変更していないため当然の結果）。
