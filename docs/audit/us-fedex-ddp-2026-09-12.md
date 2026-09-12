# US FedEx DDP の課税式 ── 「一次情報を取得済み」の検証（実装前監査）

調査日 2026-09-12。`docs/ROADMAP.md` P2 の残項目「US FedEx DDP の課税式は一次情報を
取得済みだが未実装」という記述を、実装に着手する前にそのまま信用してよいか検証した。
**スコープは検証と記録のみ。`src/` は一切変更していない。**

## 結論を先に

**「一次情報を取得済み」は誤りだった。** `master/customs.json` の US 行は、この調査の
直前まで US の courier brokerage を

```json
{"route": "courier_brokerage", "carrier": "DHL / FedEx", "rule": {"type": "unknown"},
 "tier": "C_unknown", "source": "—", "note": "米国の courier brokerage は未取得"}
```

として明示的に「未取得」と記録していた。マスタの中に「取得済み」を裏付ける行は無い。
ロードマップの記述はマスタと矛盾しており、**実装に進む前に一次情報の収集からやり直す
必要がある**、というのが今回の1点目の結論。

今回の調査でFedEx自身の一次ページを再取得しようとしたが、**この環境からはFedExの
WAFに阻まれて本文を取得できなかった**（詳細は表の下）。かわりに独立した複数の二次情報源
から式の形は再構成できたが、FedEx自身の逐語引用ではないため、`master/customs.json` の
新しい行も `tier: B_inferred` / `amount_tier: search_snippet` に留めた——**A_confirmed
に格上げしていない。**

## 表: 要素ごとの保有状況

| 要素 | 保有していたもの（調査前） | 出典が言っていること | confidence | 出典 + 確認日 | 逐語引用 |
|---|---|---|---|---|---|
| **課税基準（FOB）** | `customs.json` US.duty.base = `"goods"`、`countries.ts` の `base: 'FOB'` と整合 | 直接の裏付けは今回未取得（`threshold_unit` 節は郵便物単位の裏付けのみ）。運用上 FOB（商品代金のみ）で通っており、既存記録と矛盾なし | 既存: `B_inferred`（`duty.tier`） | 既存のまま変更なし | 既存記録どおり未確認 |
| **de minimis ($800, §321)** | `customs.json`: `de_minimis.status = "suspended"`, `effective_from: 2025-08-29`, quote 済み | CBP自身のページ（help.cbp.gov/Article-1919）はJS駆動のSPAで、この環境からは本文を再取得できなかった（`curl -L` は200だがSalesforceのシェルのみ）。かわりに Federal Register の告示タイトル・White House EO 14324・KPMG/Eckert Seamans/borderbuddyなど独立した複数の二次情報が同じ事実（2025-08-29発効の停止、法的廃止は2027-07-01）を今日時点でも一致して伝えている | 既存記録: `A_confirmed`（quoteあり、以前のセッションが取得）／今回の再検証は`search_snippet`止まり（本文再取得は失敗） | 既存 https://www.help.cbp.gov/s/article/Article-1919（2026-09-07取得と記録）／今回 https://www.federalregister.gov/documents/2025/09/02/2025-16802/... ほか（2026-09-12、本文403/JS） | 既存の quote は保持。今回の再取得は不可（下記参照） |
| **品目別の関税率** | `customs.json`: `rule.type = "max_of_mfn_or_rate"`, `rate: 0.125`（`max(MFN, 12.5%)`）、`origin_assumption: JP` | 品目により大きく外れる（`docs/audit/taxes.md` に衣類で -19.5pt 等の実例）。単一レートは存在しない | `B_inferred` | USTR FRN (2026-07-23)、既存記録のまま | 既存記録どおり |
| **FedExの立替手数料（Disbursement/Advancement Fee）** | **調査前は無し（`rule.type: "unknown"`, `tier: C_unknown`）** | ShipScience等の複数の独立した二次情報が一致: **`greater of $17.50 or 2.5% of duty+tax+MPF`、2026-07-20発効**（旧: $15/2%）。過去に本リポジトリが記録していたのは Neokyo 自社ページの転記「2% of the Base Tax or 15USD, whichever is higher」（`docs/audit/gaps.md` G2節）で、これは**旧料率かつFedEx自身のページではない** | 新規追加: `B_inferred` / `amount_tier: search_snippet` | FedEx一次ページのURLは特定できたが本文取得に失敗（下記参照）。二次情報: ShipScience記事、2026-09-12 | **無し**（FedEx一次ページの逐語引用は取得できていない） |
| **州の売上税（sales tax）** | `customs.json` US.vat.rule.type = `"none_at_federal_level"`, `tier: A_confirmed`、note「州 sales tax は郵便番号依存で未取得」 | 今回の調査でこれを覆す情報は見つからなかった。連邦レベルでのVAT/消費税は無く、州のuse taxは郵便番号（管轄）依存のため、通関時点でFedExが一律に代理徴収する構造は確認できなかった | 既存 `A_confirmed`（連邦不課税の部分）／州税の不在は`C_unknown`のまま変更なし | 既存記録のまま | 既存のまま |

## FedEx一次ページの再取得を試みた記録（すべてステータスコード付き）

CLAUDE.md/PRINCIPLES.md の「301を未到達と誤読した」教訓に従い、`curl -L` でリダイレクトを
追い、**印象ではなくステータスコードで報告する。**

| URL | HTTPステータス | 実際の本文 |
|---|---|---|
| `https://www.fedex.com/en-us/shipping/rate-changes/additional-shipping-fees.html` | 200（リダイレクトなし） | FedEx自社WAFの代替失敗ページ本文（「We're sorry, we can't process your request right now. It appears you don't have permission to view this webpage.」インシデント番号つき）。200だが実質的な本文は無い |
| `https://www.fedex.com/content/dam/fedex/us-united-states/services/surcharge_and_fee_changes_2026.pdf` | 200 | 同上の代替失敗ページ（PDFではなくHTML、1.7KB） |
| `https://www.fedex.com/en-us/customer-support/faq/duties-taxes-imported-goods/paying-duties-taxes/disbursement-fee-shipping.html` | 200 | 同上 |
| `https://www.fedex.com/content/dam/fedex/apac-asia-pacific/downloads/fedex-customs-clearance-surcharge-july2026.pdf` | 200 | 同上 |
| 上記 URL の archive.org（Wayback Machine）版 | ── | この環境のegressポリシーでarchive.org自体がブロックされている（`Blocked by egress policy`）。Wayback自体にはスナップショットが存在すること（`archive.org/wayback/available` API）は確認できたが、本文には到達できなかった |
| `https://www.help.cbp.gov/s/article/Article-1919` | 200（`?language=en_US` へのリダイレクト込み） | Salesforceベースの動的ページで、`curl`ではJSシェルしか返らない。以前のセッション（2026-09-07、記録では`A_confirmed`）はブラウザ相当の取得で本文を取れていたと見られるが、今回は再現できなかった |

**重要な区別**: 今回の「取得できなかった」は、CLAUDE.mdが警告する「301を不可到達と誤読した」
パターンとは違う。**すべて200が返っている**うえで、本文がWAFの代替ページ（FedEx）または
JS駆動のSPAシェル（CBP）だったという、ステータスコードだけでは検知できない種類の失敗。
これ自体を今回明示的に記録した。

## FedEx手数料式の「greater of」明記について

`docs/ROADMAP.md`（133-135行）は「FedExは US・DE・GB・FR・SG の5か国で比較演算子を
明記していない（本文は『2.5% or $17.50』としか書いていない）」と記録している。今回集めた
複数の独立した二次情報（ShipScience等）は一致して **`greater of` / `whichever is higher`**
という比較演算子を明記して伝えている。しかしこれらはFedEx自身のページの逐語引用ではないため、
**ロードマップの「演算子は非公開」という評価を覆す確証にはならない**——「演算子込みで
書いている二次情報が複数ある」という事実と、「FedEx自身が演算子を明記しているとこの環境で
確認できた」という事実は別物であり、後者はまだ成立していない。`master/customs.json` の
新規行はこの区別を保ったまま `B_inferred` としている。

## 何が実装前にまだ欠けているか

1. **FedEx一次ページの本文そのもの**（Disbursement Fee の式・比較演算子・発効日）。
   WAF回避のためブラウザ相当の取得（人間による手動確認、または別環境からのフェッチ）が必要。
2. **品目別の関税率を得る経路**。`countries.ts` の `dutyRate: number | null` が既に
   「わからない」を表現できる形になっているので、実装は単一レートを決め打たず、
   `null`（不明）または HTS ベースの入力軸を要求する形にすべき。ベタ書きの0や12.5%固定は誤り。
3. **§321 $800 de minimis の停止という一次記録の再検証**。既存の`A_confirmed`行は
   2026-09-07取得のまま今回更新できていない。次回、ブラウザ相当の取得ができる環境で
   再確認し、`checked_on` を更新すべき。
4. **DHLと同じ「出発国 vs 宛先国」のカテゴリ確認をFedExにも適用する**。今回の新規行の
   `note` に明記した通り、FedExのDisbursement Feeは宛先国（米国）で請求人に課される
   費目として扱ったが、これもFedEx一次ページで確認できていない推定。

## `US.dutyFreeLimit: 0`（`countries.ts`）についての判断

`countries.ts` の `dutyFreeLimit: 0` は、`master/customs.json` の
`de_minimis.status: "suspended"`（2025-08-29発効、$800の免税を全廃）と整合しており、
**今回の調査では誤りとする根拠は見つからなかった。** ただし前節の通り、この結論の
一次裏付け（CBP自身のページ本文）は今回この環境から再取得できていない。既存の
`A_confirmed`+quoteは2026-09-07取得のまま据え置きとし、**「現状では正しいと判断するが、
一次ページの再確認は次回改めて必要」**という留保付きの結論とする。

## 使ったコマンドの記録（再現用）

```
curl -Ls -o /dev/null -w "%{http_code} %{url_effective}\n" <url>   # ステータスとリダイレクト先
curl -Ls -A "Mozilla/5.0 ..." -o out.pdf -w "%{http_code}\n" <url>  # UA偽装しても同じ結果
curl -Ls "http://archive.org/wayback/available?url=<url-no-scheme>"  # スナップショット有無の確認のみ
```
