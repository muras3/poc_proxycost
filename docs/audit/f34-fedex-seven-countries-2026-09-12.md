# F34（通関手数料）FedEx 7カ国 一次情報収集の結果（2026-09-12）

対象: `docs/audit/f34-clearance-fee-by-route-2026-09-12.md` が指摘した「宅配便4社×7カ国28マス中3マスしか埋まっていない」のうち、
US を除く6カ国（GB, DE, FR, AU, CA, SG）の **FedEx** 行。スコープは `master/customs.json` の `clearance[]` と本文書のみ。`src/` は変更していない。

## 結論を先に

- **FedEx自身の一次ページはこの環境から6カ国すべてで読めなかった。** curl -L・WebFetch のいずれも終始 HTTP 200 だが、本文は FedEx 自社 WAF の代替失敗ページ（`FedEx | System Down`、1771バイト、GB/DE/AU/CA/SG/FRで同一）。archive.org の availability API 自体は今回この環境から到達できた（前回セッションの記録と違う点）が、実際のスナップショット本文を持つ `web.archive.org` への到達はこの環境の egress ポリシーで `Blocked by egress policy` として塞がれており、結局本文は取得できなかった。**US行の `B_inferred` はこの調査でも upgrade できなかった**（下記参照）。
- 6カ国とも独立した複数のWebSearch要約（ShipScience・spaceshipapp・ebbLogistics・消費者フォーラム等）から具体的な金額を再構成できたが、**いずれもFedEx自身の逐語引用ではない**ため `tier: B_inferred` / `amount_tier: search_snippet_no_verbatim_quote` に留めた。
- **GBとDEはFedExの請求構造そのものが現行 `clearance[]` スキーマで表現できない**（帯ごとに計算式が変わる3段構造）。無理に既存の型に押し込めず、`schema_gap: true` として構造を記録し、実装は行っていない。
- **SGだけ「per shipment」という単位の記述が二次情報に見つかった** ── 監査が「per-shipment の行は master に1件も無い」としていた点への、未確定ながら初めての反証候補。
- FR / DE で、同じ「FedEx欧州の最低額」を指すはずの二次情報同士が **€15 と €18（FR）／€15 と 帯構造（DE）** で食い違っており、そのまま記録した。

## 表: destination × charge name × amount/structure × per-parcel/per-shipment × 税ゼロ時 × 発効日 × confidence × source × 確認日 × 逐語引用

| 国 | 費目名 | 金額/構造 | 単位 | 税ゼロ時 | 発効日 | confidence | source URL | 確認日 | 逐語引用 |
|---|---|---|---|---|---|---|---|---|---|
| GB | Disbursement Fee | **schema_gap**（3段帯: ≤£43→30%・下限£10.50／£43-£524→定額£12.90／£524超→2.5%） | 不明（C_unknown） | 不明（C_unknown） | 2026-01-12 | B_inferred（search_snippet_no_verbatim_quote） | https://www.fedex.com/en-gb/customer-support/faq/duties-taxes-imported-goods/paying-duties-taxes/disbursement-fee-shipping.html | 2026-09-12 | なし |
| DE | Aufwendungspauschale (Disbursement Fee) | **schema_gap**（3段帯: ≤€50→30%・下限€5(net)／€50-€600→定額€15／€600超→2.5%） | 不明（C_unknown） | 不明（C_unknown） | 不明 | B_inferred（search_snippet_no_verbatim_quote） | https://www.fedex.com/de-de/ancillary-clearance-service.html | 2026-09-12 | なし |
| FR | frais d'avance / avance de douane | greater_of(2.5%, €18 TTC) ※€15説と食い違い | 不明（C_unknown） | 不明（C_unknown） | 不明 | B_inferred（search_snippet_no_verbatim_quote） | https://forum.quechoisir.org/fedex-substitution-frais-de-tva-dedouanement-t294550.html | 2026-09-12 | なし |
| AU | Disbursement Fee/Advancement Fee | greater_of(AUD 24.00, 2.9%) | 不明（C_unknown） | 不明（C_unknown） | 2026-07-20（旧: AUD 20.00/2.9%） | B_inferred（search_snippet_no_verbatim_quote） | https://www.fedex.com/en-au/customer-support/faq/duties-taxes-imported-goods/paying-duties-taxes/disbursement-fee-shipping.html | 2026-09-12 | なし |
| CA | Disbursement Fee | greater_of(CAD 12.00, 3.10%) | 不明（C_unknown） | 不明（C_unknown） | 2026-08-03（旧: CAD 11.40/3.10%） | B_inferred（search_snippet_no_verbatim_quote） | https://www.fedex.com/en-ca/customer-support/faq/duties-taxes-imported-goods/paying-duties-taxes/disbursement-fee-shipping.html | 2026-09-12 | なし |
| SG | Disbursement Fee/Advancement Fee | greater_of(SGD 24.00, 5%)、上限SGD 120 | **per shipment**（旧版PDFの検索結果要約が明記。2026年版での再確認はできていない） | 不明（C_unknown、S$400以下のsingpost免税帯とは別経路） | 2026-07-20（旧: SGD 20.00/5%、さらに前はSGD 12.00/5%） | B_inferred（search_snippet_no_verbatim_quote） | https://www.fedex.com/en-sg/customer-support/faq/duties-taxes-imported-goods/paying-duties-taxes/disbursement-fee-shipping.html | 2026-09-12 | なし |
| US（既存行、参考） | Disbursement Fee | greater_of($17.50, 2.5%) | 不明（C_unknown） | 不明（C_unknown） | 2026-07-20 | B_inferred（既存のまま） | https://www.fedex.com/en-us/shipping/rate-changes/additional-shipping-fees.html | 既存記録どおり2026-09-12（今回再取得試行、変化なし） | なし |

## US行のアップグレードは今回もできなかった

`docs/audit/us-fedex-ddp-2026-09-12.md` の記録どおり、US一次ページはWAF代替ページのまま。今回新たに archive.org の availability API（`http://archive.org/wayback/available?url=...`）自体はこの環境から到達できることを確認したが（前回セッションの記録と異なる）、返ってきたスナップショットURL（`http://web.archive.org/web/20260610140936/...`）への実際のフェッチは

```
$ curl -Ls -o /tmp/o.html -w "%{http_code}\n" "http://web.archive.org/web/.../additional-shipping-fees.html"
403
$ cat /tmp/o.html
Blocked by egress policy
```

と、`archive.org`（APIのホスト）と`web.archive.org`（スナップショット本体のホスト）が別ホスト扱いでegressポリシーの通過可否が違う、という形で失敗した。WebFetchツールでも同URLは明示的に拒否された（`Claude Code is unable to fetch from web.archive.org`）。**したがって US行の tier は `B_inferred` のまま変更していない。**

## GBとDEで見つかった、埋められなかった箱（スキーマギャップ）

タスク文の指示（「既存の `clearance[]` の形で表現できない場合は形を記述して停止し、実装しない」）に従い、GBとDEの2行は `rule.type: "unknown"` のまま、実際の帯構造を `raw_findings` フィールドに保存した。

必要な形（提案、未実装）:

```
"rule": {
  "type": "tiered_by_duty_tax",
  "currency": "GBP",
  "bands": [
    {"duty_tax_max": 43,  "formula": "rate_with_min", "rate": 0.30, "min": 10.50},
    {"duty_tax_max": 524, "formula": "flat", "amount": 12.90},
    {"duty_tax_max": null, "formula": "rate_only", "rate": 0.025}
  ]
}
```

既存の `banded_by_value`（USPS/ABFで使用）は「帯の境界→単一の出力額」しか表現できず、帯ごとに異なる計算式（下限付き率・定額・率のみ）を差し込めない。これは監査が指摘した「per-shipment型の欠如」「税ゼロ条件の非構造化」の2点に**加えて見つかった3点目のギャップ**として報告する。

興味深い点（未確認の仮説）: GBとDEの帯の**形そのもの**（下限付き率→定額→率のみ、の3段）が一致しており、金額としきい値だけが国ごとに違う。これはFedExが単一の内部テンプレートを各国通貨に置き換えて運用している可能性を示唆する。次にUPS/DHLの同種行を集める際、同じテンプレートを想定して検索すると効率が良い可能性がある（あくまで仮説、確認していない）。

## per-parcel / per-shipment 軸のアップデート

2026-09-12の親監査は「per-shipmentの行はmasterに1件も無い」としていたが、SGのFedEx行について、2022年・2023年版のFedEx SGサーチャージPDFの検索結果要約が

> "5% of GST amount with a minimum charge of SGD 12.00 and a maximum charge of SGD 120.00 **per shipment**"

と明記しているのを見つけた。**これはFedEx一次ページ本文の逐語引用ではなく、2026年最新版での再確認もできていない**ため、`unit: "per_shipment"` は `unit_tier: search_snippet_no_verbatim_quote` に留め、`docs/customs.json` の当該行にその限界を明記した。箱分割（#85）の実装判断に使う前に、2026年版の一次ページでの再確認が必要。

## 食い違い（そのまま報告する）

1. **FR: €18 vs €15。** 消費者フォーラム（quechoisir.org）は「2.5% du montant liquidé ou un minimum de 18€ TTC」、別のWebSearch要約（ShipScience）は「Europe: Flat €15.00 minimum, 2.5% of duty & tax for all countries」。両方とも二次情報で、時期や粒度（フランス個別 vs 欧州共通の代表値）の違いで説明できる可能性はあるが判定できない。両方を残した。
2. **DE: €15固定帯（600ユーロ以下)vs「欧州共通€15」。** DE個別の検索結果（30%/€5・€15固定・2.5%の3段）と、汎欧州の「€15固定・2.5%」という別の二次情報は、同じ「€15」という数字を含みながら位置づけが違う（帯の一部 vs 全体の下限）。FR同様、一次情報なしに判定できない。
3. **US行のNeokyo由来の旧料率（2%/$15）は今回のGB/DE/FR/AU/CA/SGのどの新規行とも一致しない** ── 各国とも「率+下限（greater_of型）」という同じ形自体は共通するが、率・下限の具体値は国ごとにばらばら（AU 2.9%、CA 3.10%、SG 5%、US 2.5%、FR 2.5%）。単一の「代行の通関手数料は概ねX%」という一般化はできない。

## 試したが失敗したこと（ステータスコード付き）

| URL | 結果 |
|---|---|
| `fedex.com/en-{gb,de,fr,au,ca,sg}/customer-support/faq/.../disbursement-fee-shipping.html` | 200、本文はFedEx WAF代替ページ（1771バイト、`FedEx \| System Down`） |
| `fedex.com/en-{gb,de,fr,au,ca,sg}/shipping/rate-changes/additional-shipping-fees.html` | 同上 |
| `fedex.com/content/dam/fedex/apac-asia-pacific/downloads/fedex-customs-clearance-surcharge-july2026.pdf` | 200、同上（PDFでなくHTML） |
| `fedex.com/en-au/customs-tools/clearance.html`, `fedex.com/en-ca/ancillary-clearance-service.html`（WebFetch経由） | 同上 |
| `archive.org/wayback/available?url=...`（6カ国） | 200。GB/AU/SGはスナップショットあり、DE/FR/CAは`archived_snapshots: {}`（スナップショット自体が無い） |
| `web.archive.org/web/<timestamp>/...`（GB/AU/SG、実スナップショット本文） | 403 `Blocked by egress policy` |
| WebFetchツールで同じweb.archive.org URL | 明示的に拒否（`Claude Code is unable to fetch from web.archive.org`） |

## 検証コマンド

```
python3 master/validate.py     # OK: スキーマ通過 / 再現4件（独立1件）/ マスタと矛盾0件
python3 master/render-docs.py && python3 master/render-docs.py --check   # OK 両方
npx vitest run                 # 870 passed（mainと同数、退行なし）
```

`src/` は一切変更していない。
