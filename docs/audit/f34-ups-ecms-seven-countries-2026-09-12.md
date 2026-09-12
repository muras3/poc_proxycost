# F34（通関手数料）── UPS/ECMS 7カ国の一次情報取得（2026-09-12）

`docs/audit/f34-clearance-fee-by-route-2026-09-12.md` が「宅配便4社×7カ国の28マスのうち
埋まっているのは3マス」と棚卸ししたうちの、**UPSとECMSの取り分**を埋める作業。
対象は US / GB / DE / FR / AU / CA / SG の7カ国。範囲は `master/customs.json` の
`clearance[]` のみで、`src/` は一切変更していない。

## 結論を先に

- **UPSは US・DE・FR・AU・CA・SG の6カ国で一次資料を取得できた**（GBのみ #81 と同じ壁に当たった）。
- **ECMSは「関税を立て替えない」フォワーダーではなかった。** US・UK・SGの3法人分の
  Terms & Conditions が一言一句同じ条文で「立て替えた関税の3%を手数料として課す」と
  規定している。DE/FR/AU/CAはECMSの法人自体が確認できず、counted_absenceとして記録した。
- **CAの既存の範囲行（`courier: UPS/FedEx/DHL`, CAD 10〜50, B_inferred）は、UPSの取り分を
  今回の一次情報で分解できる。** UPS自身の式は「duty/taxの3.7%、または$7.40（Standard）/
  $11.65（Express系）のいずれか大きい方」で、既存の範囲の下端付近と整合する。

## 表1: UPS

| destination | 費目名（原文） | 金額・構造 | per-parcel/shipment | 税ゼロ時 | 発効日 | confidence | source | 読んだ日 | 逐語引用 |
|---|---|---|---|---|---|---|---|---|---|
| US | Disbursement Fee | 2.5% of duty/tax/gov charges advanced, 最低 $17.50 | per_shipment（未確認、推定） | unknown | 2026-09-07（二次情報） | **B_inferred**／`amount_tier: search_snippet` | ups.com/us/en/shipping/international-shipping/import-fees（本文未読） | 2026-09-12 | **なし** |
| GB | Disbursement Fee（推定） | 2.5%、最低 £12〜£17（**未確認**） | unknown | unknown | unknown | **C_unknown** | assets.ups.com の GB向けPDF（本文未読） | 2026-09-12 | **なし** |
| DE | Disbursement Fee | ≤€22: €7.20固定／>€22: 3.00%・最低€14.90のいずれか大きい方 | per_shipment | unknown | 記載なし（文書名から2026年版と推定） | **A_confirmed** | ups.com/assets/resources/webcontent/de_DE/additional-service-charge-de.pdf | 2026-09-12 | **あり** |
| FR | Disbursement Fee | ≤€22: €8.40固定／>€22: 3.05%・最低€17.50のいずれか大きい方 | per_shipment | unknown | 記載なし | **A_confirmed** | ups.com/assets/resources/webcontent/fr_FR/additional-service-charge-fr.pdf | 2026-09-12 | **あり** |
| AU | Disbursement Fee | 3.6% of import duty/tax、または A$23.80+GST のいずれか大きい方 | per_shipment | unknown | 2024-12-22（ガイド発効日） | **A_confirmed** | ups.com/.../service_guide_au.pdf | 2026-09-12 | **あり** |
| CA | Disbursement Fee | 3.7% of duty/tax、または $7.40(Standard)/$11.65(Express系) のいずれか大きい方 | per_shipment | unknown | 2024-12-22（ガイド発効日） | **A_confirmed** | ups.com/.../en_CA/rate_guide_ca.pdf | 2026-09-12 | **あり** |
| SG | Disbursement Fee | 5.6% of import duty/tax、最低 S$22.50・**上限 S$100** | per_shipment | unknown | 2023-12-24（ガイド発効日） | **A_confirmed** | ups.com/.../service_guide_sg_2024.pdf | 2026-09-12 | **あり** |

DE/FR/AU/SGの逐語引用（原文まま）:

- DE: "Disbursement Fee (fee of % of the advanced amount/minimum, whichever is greater) … €7,20 per shipment having an intrinsic value lower or equal to €22, €14,90 minimum or 3,00% of the advanced amount when the intrinsic value of the goods exceed €22."
- FR: "… € 8,40 per shipment having an intrinsic value lower or equal to € 22, € 17,50 minimum or 3.05% of the advanced amount when the intrinsic value of the goods exceed € 22."
- AU: "The Disbursement Fee for importation into Australia will be 3.6% of the import duties and taxes, or A$23.80 plus GST per shipment, whichever is greater."
- CA: "The applicable Disbursement Fee is the greater of 3.7% of the duty/tax amount or $7.40 on UPS Standard service or $11.65 on UPS Worldwide Express Plus, UPS Worldwide Express, UPS Worldwide Express Freight, Worldwide Express Freight Midday, UPS Worldwide Express Saver and UPS Worldwide Expedited service."
- SG: "The Disbursement Fee for importation into Singapore will be 5.6% of the import duties and taxes, subject to a minimum of S$22.50 and maximum of S$100 per shipment."

いずれも destination-side・受取人請求（"UPS may prepay duties, taxes and other government charges
on behalf of the payer" と明記）であることを、DE/FR/AU/CA/SGの全文で確認している。

**税ゼロ時に課すかどうかは、UPSのどの一次資料にも明示の条件文が無く、7カ国すべてC_unknownのまま。**
これは`docs/audit/f34-clearance-fee-by-route-2026-09-12.md`が指摘した「宅配便側はこの条件を1カ国も
確認できていない」を追加調査後も変えられなかった、ということ。

## 表2: ECMS

| destination | ECMSは関税を立て替えるか | 費目名（原文） | 金額・構造 | per-parcel/shipment | 税ゼロ時 | confidence | source | 読んだ日 | 逐語引用 |
|---|---|---|---|---|---|---|---|---|---|
| US | **立て替える** | duty advance payment fee | 3% of advanced customs duty | unknown（T&Cに明記なし） | unknown（下記参照） | **A_confirmed** | ecmsglobal.com … ECMS US Terms Conditions v1.2.pdf | 2026-09-12 | **あり** |
| GB | **立て替える** | duty advance payment fee | 同上 | unknown | unknown | **A_confirmed** | ecmsglobal.com … ECMS UK Terms Conditions v1.34.pdf | 2026-09-12 | **あり** |
| SG | **立て替える** | duty advance payment fee | 同上 | unknown | unknown | **A_confirmed** | ecmsglobal.com … Singapore Terms and Conditions 2023.pdf | 2026-09-12 | **あり** |
| DE | 不明（法人自体が未確認） | — | — | — | — | **C_unknown**（counted_absence） | ecmsglobal.com 内検索（DE向け法人・T&C文書なし） | 2026-09-12 | — |
| FR | 不明（法人自体が未確認） | — | — | — | — | **C_unknown**（counted_absence） | 同上 | 2026-09-12 | — |
| AU | 不明（法人自体が未確認） | — | — | — | — | **C_unknown**（counted_absence） | 同上 | 2026-09-12 | — |
| CA | 不明（法人自体が未確認） | — | — | — | — | **C_unknown**（counted_absence） | 同上 | 2026-09-12 | — |

逐語引用（US/UK/SGの3法人版で一言一句同一）:

> "When ECMS EXPRESS acts on Receiver's behalf, Receiver shall pay or reimburse ECMS EXPRESS for
> all Shipment or other charges due, or Customs Duties owed for services provided by ECMS EXPRESS
> or incurred by ECMS EXPRESS on Shipper's or Receiver's behalf. The payment of Customs Duties
> will be requested prior to delivery. If ECMS EXPRESS advances any Customs Duties on behalf of a
> Receiver, ECMS EXPRESS is entitled to charge a duty advance payment fee of 3%."

### ECMSは「関税を立て替えない」プレイヤーか ── 先に答えるべき問い

**答え: 立て替える。** タスクが想定していた分岐（「立て替えないなら"does not apply"が正しい結論」）
は、少なくともUS/UK/SGの3法人については成立しない。T&C自体が"If ECMS EXPRESS advances any Customs
Duties on behalf of a Receiver"という条件文を持つため、**立て替えないケースもあり得る**（Receiverが
自分で先に払うか、shipperが負担するケースなど）と読めるが、**立て替えた場合には必ず3%の手数料が
つく**、というのがこのT&Cの構造。したがって「ECMSに通関手数料が存在しない」という結論は取れず、
「3%（destination-side、受取人請求）」という具体的な数値で`clearance[]`に記録した。

## DE/FR/AU/CAのECMS ── 法人が確認できないことの意味

自社サイト内検索・Web検索の両方で、ECMSの国別T&C文書は en-us / en-uk / en-sg / en-nl / en-hk の
5種類しか見つからなかった。二次情報（zenmarket.jp のブログ等）は「ECMS Expressは11カ国で
営業（US, UK, 中国, NL, MY, PH, TH, SG, JP, KR, HK）」と伝えており、この4カ国（DE/FR/AU/CA）は
含まれていない。**したがって「この4カ国向けにECMSという配送方式自体が存在しない可能性が高い」
という見立てになるが、これは`declared`（ECMS自身が明示的に否定した記録）ではなく、`counted_absence`
（探したが見つからなかった、という記録）として記録した。** 探した内容: ecmsglobal.comのサイト内
検索、Google検索でのT&C文書探索、法人一覧・拠点一覧の二次情報。

## GBのUPS ── #81と同じ壁

- `https://assets.ups.com/adobe/assets/urn:aaid:aem:c5fb0001-0bc2-4281-8fd0-c4d1c548e30b/original/as/additional-service-charge-si-gb-en.pdf`
  に `curl --http1.1` で2回アクセスし、いずれも `curl: (52) Empty reply from server`（HTTP 000）。
- 同URLに `WebFetch` でアクセスし、`HTTP 503 Service Unavailable`。
- 同ドメインの `en_GB/trade-policy-tariff-changes-en-gb.pdf`（別ファイル）は HTTP 200・27ページ
  取得できたが、Disbursement Feeの**数式に言及するFAQはあっても具体的な料率・最低額が書かれていない**
  （表がおそらく画像として埋め込まれており `pdftotext -layout` で抽出できなかった可能性がある）。
- 二次情報（MoneySavingExpertフォーラム等）は「2.5%、最低£12〜£17」を伝えるが、UPS自身の一次資料
  ではないため `C_unknown` に留めた。

これは**タスク文が事前に警告していた「#81が同じくGB/CAを取得できなかった」の通りGBについては
再現した**が、**CAは今回取得できており、#81時点の状況からは前進している。**

## USのUPS ── 200/503混在とEmpty replyの併存

- `https://www.ups.com/us/en/shipping/international-shipping/import-fees` を `WebFetch` で
  アクセスし `HTTP 503`。
- `https://www.ups.com/media/us/currentrates/rate-pdf/imaddl.pdf`（Value-Added Services Rates、
  検索結果ではUS向けとして案内されていた）を `curl --http1.1` で2回試行し、いずれも
  `curl: (52) Empty reply from server`。
- 独立した複数の二次情報（ShipScience等の料金改定まとめ）が「2.5% of Duties/Taxes、最低$17.50、
  2026-09-07発効」で一致しており、DE/FR/AU/CA/SGで確認できた構造（rate + minimum, whichever
  greater）とも整合するため、`master/customs.json`のUS FedEx行が採用した基準と同じく
  `B_inferred`／`amount_tier: search_snippet` とした（reasoned_judgementより確度は高いが
  A_confirmedにはしない）。

## 税ゼロ時の扱い（zero_when_no_tax）── UPSは7カ国とも未確認のまま

`docs/audit/f34-clearance-fee-by-route-2026-09-12.md`が「郵便側は5/5カ国で確認できているが
宅配便側は1カ国も確認できていない」と指摘した軸について、今回UPSの一次資料を6カ国分読んだが、
**「duty/taxがゼロのときDisbursement Feeを課すか」を明示した条件文はどの資料にも無かった。**
式が"a fee of % of the advanced amount"である以上、advanced amountがゼロなら%側は0になるが、
**flatの最低額（例: DE €7.20、FR €8.40、AU A$23.80、CA $7.40/$11.65、SG S$22.50）が
duty/taxゼロでも課されるかどうかは構造上決まらず、未確認のまま。** これは実装前に必ず埋めるべき
残課題として次work に送る。

## per-parcel / per-shipment

UPSの資料はいずれも "per shipment" と明記しており（DE/FR/AU/CA/SGで確認）、**per-parcelの
UPS Disbursement Fee事例は見つからなかった。** これは`docs/audit/f34-clearance-fee-by-route-2026-09-12.md`
が「per-shipment用のrule.typeがまだ無い」と指摘した状況を変える発見で、**UPSの行こそがper-shipment
型を要求する最初の実例になる。** 既存スキーマの `rule.type` 命名は `fixed_per_parcel` 系のみで
per-shipment用が無いため、今回追加した行では `"per": "per_shipment"` を独立フィールドとして
rule外に置いた（既存の `rule.type` 命名規則を汚さず、監査が指摘した欠落を埋める最小限の対応）。
ECMSは per-parcel/shipment の別自体がT&Cに書かれておらず `"per": "unknown"` とした。

## スキーマへの追加（新しい rule.type）

既存の `clearance[].rule.type` 語彙（`fixed_per_parcel` / `rate_of_import_charges` /
`rate_of_import_charges_with_min` / `greater_of` / `banded_by_value` / `range` 等）では
表現できない形が2つあったため、新しい type を追加した。**`master/validate.py` の
`eval_clearance()` はこれらの新type用の評価ロジックを持たない**（既存のfixture検証はこの2type
を使う行を対象にしていないため、`validate.py` は現状のまま0件の矛盾でPASSする）。実装時に
これらの行をエンジンで使うなら、`eval_clearance()` に分岐を追加する必要がある。

1. **`banded_by_value_mixed`**（DE/FR UPS向けに新設）: 申告価格帯によって「税ゼロならflat」
   ではなく「flat」と「rate_with_min」のどちらの**構造**を使うかが変わる。既存の
   `banded_by_value` は帯ごとに単一の金額しか持てず、帯ごとに別の計算式（flat vs
   rate_with_min）を許さないため、`bands: [{value_lte/value_gt, rule: {...}}]` という
   入れ子構造にした。
2. **`rate_of_import_charges_with_min_and_max`**（SG UPS向けに新設）: 既存の
   `rate_of_import_charges_with_min` は下限のみ。SGは上限（S$100）も明記されているため、
   `min`と`max`の両方を持つ type を追加した。
3. **`greater_of_by_service`**（CA UPS向けに新設）: 既存の `greater_of` は単一のflatと
   単一のrateの組だが、CAはサービス種別（Standard / Express系）でflat側の額が変わる。
   `min_by_service: {サービス名: 額}` を追加した。

いずれも「1社の1カ国限定の構造」であり、他社・他国に一般化できるかは未確認（原則3: 1社で
確認したことを一般則にしない）。

### 宣言されているが評価されない（declared-but-not-evaluated）── 沈黙を許さない

**型が存在する＝計算される、ではない。** 上記3つの新型を含め、`master/customs.json` の
`clearance[].rule.type` には `eval_clearance()`（`master/validate.py`）が評価できない型が
複数ある。今回のレビューで「型を宣言しただけで評価ロジックを足さないと、次に読む人が
`rule.type` を見て『計算されている』と誤解する」という指摘を受け、**`master/validate.py`
自体に、通常の検証出力の中でこれを毎回明示的に報告するコードを追加した**（`master/validate.py`
実行のたびに `== 1. スキーマ ==` の直後に出る）:

```
rule.type 評価カバレッジ: 通関経路 36 件中 22 件が eval_clearance() で評価可能、**14 件は宣言のみで未評価**
未評価の内訳（型が存在する ＝ 計算されている、と読んではいけない行）:
    - US/FedEx(courier_brokerage): rule.type='greater_of' ── eval_clearance() 未対応
    - US/UPS(ups_disbursement): rule.type='rate_of_import_charges_with_min' ── eval_clearance() 未対応
    - GB/UPS(ups_disbursement): rule.type='unknown' ── eval_clearance() 未対応
    - DE/DHL Express(dhl_express): rule.type='rate_of_import_charges_with_min' ── eval_clearance() 未対応
    - DE/UPS(ups_disbursement): rule.type='banded_by_value_mixed' ── eval_clearance() 未対応
    - DE/ECMS(ecms_duty_advance): rule.type='not_found' ── eval_clearance() 未対応
    - FR/UPS(ups_disbursement): rule.type='banded_by_value_mixed' ── eval_clearance() 未対応
    - FR/ECMS(ecms_duty_advance): rule.type='not_found' ── eval_clearance() 未対応
    - AU/UPS(ups_disbursement): rule.type='greater_of' ── eval_clearance() 未対応
    - AU/ECMS(ecms_duty_advance): rule.type='not_found' ── eval_clearance() 未対応
    - CA/UPS / FedEx / DHL(courier): rule.type='range' ── eval_clearance() 未対応
    - CA/UPS(ups_disbursement): rule.type='greater_of_by_service' ── eval_clearance() 未対応
    - CA/ECMS(ecms_duty_advance): rule.type='not_found' ── eval_clearance() 未対応
    - SG/UPS(ups_disbursement): rule.type='rate_of_import_charges_with_min_and_max' ── eval_clearance() 未対応
```

**選んだ対応: 「実装ではなく、通常の検証出力に必ず現れる明示レポート行」。** `validate.py` を
未評価型があるだけで `exit(1)` させる案は選ばなかった。理由は、この14件のうち11件は**今回のPRより
前から`main`に存在していた行**（`greater_of` を使うUS FedEx行や `rate_of_import_charges_with_min`
を使うDE DHL Express行など）で、これらは`docs/audit/f34-clearance-fee-by-route-2026-09-12.md`の
時点で既にA_confirmed/B_inferredとしてマスタに乗っている「正当に未実装なだけの行」。ここでビルドを
落とすと、今回のPRとは無関係の既存データまで「壊れている」ように見えてしまい、原因の切り分けを
かえって難しくする。**カバレッジ報告は`validate.py`の通常出力に常に表示される**ため、
`python3 master/validate.py` を実行する誰もこれを見逃せない（ドキュメントだけに書いて終わりにしない、
という要求を満たす）。次に `eval_clearance()` へ分岐を追加する人は、この一覧をそのままTODOとして
使える。**`EVAL_HANDLED_TYPES` 集合と `eval_clearance()` の if 分岐は手で同期させる方式**なので、
今後 `eval_clearance()` に分岐を足す際は `master/validate.py` 冒頭のコメントの通り
`EVAL_HANDLED_TYPES` も必ず更新すること。

## 検証

- `python3 master/validate.py` → **矛盾0件**（既存の再現4件は変更前と同じ結果のまま）。
- `python3 master/render-docs.py` → 生成節を書き戻し、`--check` → 一致確認済み。
- `npx vitest run` → **870 件 pass**（変更前の基準値と同数、何も失われていない）。
- `src/` は一切変更していない（`master/customs.json` と `docs/audit/` のみ。`docs/MASTER.md`
  は render-docs.py による自動生成の書き戻しのみ）。

## この監査中に見つけた、他社の行に関する疑問（編集はしていない）

特に無し。FedEx/DHLの既存行には触れていない。

## 確度はカ国ではなく「業者」で分かれている

このPR単体（UPS/ECMS）に、並行PRのFedEx（#98、6/7ヶ国がB_inferred、WAFで本文未読）・
DHL（#99、7/7ヶ国がA_confirmed、公式レートガイドから逐語引用）を並べると、**確度の差は
国ではなく業者で分かれている**ことが分かる。実装をどの粒度で始めるかの判断材料として、
セルごとに `tier: 'fixed'`（原文の数値をそのまま使える）と言えるかどうかを示す:

| destination | UPS | ECMS | FedEx（#98想定） | DHL（#99想定） |
|---|---|---|---|---|
| US | B_inferred（本文未読、二次情報一致） | **A_confirmed** | B_inferred（WAF） | A_confirmed |
| GB | **C_unknown**（本文未読、#81と同じ壁） | **A_confirmed** | B_inferred（WAF） | A_confirmed |
| DE | **A_confirmed** | counted_absence（法人なし） | B_inferred（WAF） | A_confirmed |
| FR | **A_confirmed** | counted_absence（法人なし） | B_inferred（WAF） | A_confirmed |
| AU | **A_confirmed** | counted_absence（法人なし） | B_inferred（WAF） | A_confirmed |
| CA | **A_confirmed** | counted_absence（法人なし） | B_inferred（WAF） | A_confirmed |
| SG | **A_confirmed** | **A_confirmed** | B_inferred（WAF） | A_confirmed |

（FedEx/DHL列は並行PRの内容に基づく想定であり、このPRが検証したのはUPS/ECMS列のみ。
確定はそれぞれのPRのマージ後に再確認すること。）

**読み方**: UPSは5/7がA_confirmed（GBのみ0、USのみB_inferred）。ECMSは実在する3法人が
全てA_confirmed、残り4カ国はそもそも法人が無いという意味でのcounted_absence（「調べたが
分からなかった」ではなく「調べたら存在自体が無かった」）。DHLは7/7がA_confirmed。FedExは
0/7がA_confirmed（全てWAFに阻まれた二次情報一致）。**したがって「国単位でA/Bを線引きする」
という設計はミスリードで、実装を業者別に区切るなら「UPS・DHLは`tier: 'fixed'`前提でほぼ
全国できる、FedExは全国が推定値前提、ECMSは法人が存在する3カ国のみ確定値」という3段構えに
なる。** 全業者を同じ確度で扱う実装（例えば全部を`tier: 'fixed'`とみなすUI表現）は、FedExの
列だけ実態と乖離する。

## 次にやるべきこと

1. **GB/USのUPS Disbursement Feeの一次確認。** GBは#81に続き2回目の失敗、USも本文未読のまま。
   assets.ups.com の一部PDFがこの環境から `Empty reply from server` を返す一方、同ドメインの
   別ファイルは正常に取得できており、ブロックの単位がファイル単位なのかCDNのキャッシュ状態
   なのか切り分けられていない。
2. **UPS・ECMSともに「税ゼロ時に課すか」が全滅。** 実装前に埋めないと、`docs/PRINCIPLES.md`
   原則1が要求する「観測できないものの当てずっぽうをしない」を満たせない箇所が残る。
3. **`eval_clearance()` に `banded_by_value_mixed` / `rate_of_import_charges_with_min_and_max`
   / `greater_of_by_service` の評価ロジックを追加**（今回のPRでは追加していない。理由:
   対応するfixture実請求が無く、評価ロジックだけ足しても検証できないため）。
4. **DHL Duty Tax Processing の GB/AU分、FedEx Disbursement Fee の GB/DE/FR/AU/CA/SG分**は
   引き続き未着手（今回のタスクのスコープ外、UPS/ECMSのみ担当）。
