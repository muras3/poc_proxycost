# ProxyCost Development Handoff

**Date:** 2026-09-09  
**Product:** https://proxycost.3amoncall.workers.dev/  
**Purpose:** Claude にこのまま渡して、現在の設計意図を壊さず開発を継続するためのハンドオフ。

> **重要:** このドキュメントでは、`Fact`、`Decision`、`Open` を分ける。Claude は `Decision` をプロダクトオーナーとの合意事項として扱い、勝手に元へ戻さないこと。

### Fact-check status (double pass, 2026-09-09)

This revision was checked in two independent passes:
1. **Primary-source pass** — current official proxy pages and government/tax authorities.
2. **Consistency pass** — internal contradictions, over-claims, stale assumptions, and privacy/legal wording.

Verification labels used below:
- `OFFICIAL_PRIMARY`: current official source directly supports the claim.
- `PROJECT_MANUAL`: manually verified in the project against the current public UI; retain screenshot/test evidence.
- `PRODUCT_DECISION`: agreed design choice, not an external fact.
- `RESEARCH_HYPOTHESIS`: working estimate/assumption; never market as measured fact.
- `OPEN`: not sufficiently verified yet.


## 1. Executive summary

ProxyCost は、日本の商品を海外から購入するユーザー向けに、Buyee / ZenMarket / Neokyo / FROM JAPAN / Jauce の5社について「最終的に自宅へ届くまでにいくらかかるか」を比較するサービス。

現状は、商品URLまたはキーワードから商品を追加し、商品価格・推定重量・国内送料・代理購入手数料・国際送料・Duty等を組み合わせて5社を比較できる。競合の多くが「料金表比較」または手入力のballpark calculatorであるのに対し、ProxyCostは商品同定・重量推定・不確実性表示まで持っている。

最終形は単なるCalculatorではない。

**Calculate → Compare → Shipping methodを選ぶ → $3でカート構築 → ユーザー本人が最終確認・決済 → 同意済み・de-linked実績で次回の推定精度を改善**

このループを作る。

## 2. Product goal / target user

### Target
- 日本の商品を海外から購入したいユーザー
- アニメ / ゲーム / フィギュア / カード / 本 / ファッション等のコレクター
- 1点買いより、複数商品を倉庫に集めてまとめて発送するユーザーを重要セグメントとして想定

### Core pain
1. Proxy各社の「安い手数料表示」だけでは最終総額が分からない
2. 国内送料・梱包・国際送料・税・通関費用が後から乗る
3. 重量・箱サイズを購入前にユーザー自身が推測するのが難しい
4. 5社の料金体系・配送方法を横断比較するのが面倒
5. 最安Proxyが分かっても、複数商品の登録をもう一度Proxy側で行うのが面倒

## 3. Current state（2026-09-09）

### Current UI / engine
- 5社比較: Buyee / ZenMarket / Neokyo / FROM JAPAN / Jauce
- 商品入力: listing URL / keyword / manual
- 複数商品を1 parcelとして計算
- 商品カテゴリから重量を推定
- 国内送料を商品ごとに入力可能。未取得時は推定値
- Japan Post系送料を重量から計算
- Proxy手数料、packing、deposit等を明細化
- ランキングと「重量が大きく外れても順位が変わらない」頑健性表示あり
- Plain / estimated / second-hand / not included を視覚的に区別する思想がある

### Current quality issue / stale logic
以下は現行サイトで修正が必要。

1. **FROM JAPAN Payment fee ¥200 は誤り**。2026-09-07の公式Calculator実測で `Payment Fees = Free`。
2. 現行トップの「Courier rates are not priced / none publishes what it charges」は古い。**FROM JAPAN / ZenMarket / Jauce は現在の公開UIで方法別見積を確認済み、Neokyoは公式Estimator/配送仕様を確認済み。Buyeeは公式Estimatorの存在と実料金がweight/size/method/carrier依存であることは確認済みだが、公開Estimatorの方法別出力・寸法入力粒度はまだ実測OPEN。** よって「5社とも同粒度で取得済み」とはまだ書かない。
3. Dutyが「second-hand」となっており、税・関税ロジックを公式情報へ移行する必要がある。
4. Sales tax / VAT / GSTが一括で未算入。国別・Proxy別の徴収ルールを実装可能。
5. Sources / 実装の同期ずれが起きやすい。料金ルールは `checked_on` と `source` をコード側のデータとして一元管理する。

## 4. Decisions agreed with product owner

### D1. 初期データはクリーンに作る
- 初期アルゴリズムは **公式料金表、公式Calculator、政府・税関の公式ルール**を根拠にする。
- Panjiva / Volza等の有料・契約データベースを学習用データとして使わない。
- 他人のInvoiceを無断で収集・保存しない。
- 公開Calculatorは少数の境界値テストで挙動を把握し、**本番では自前ロジックを使う**。
- 非公開APIを本番依存にしない。正式に公開されたAPIがあり利用条件が明確な場合のみ利用を検討する。

### D2. 「ルールが確定」と「入力値が確定」を分離する
例: EMSの料金表が100%正しくても、重量が推定なら最終送料はEstimated。

状態は最低限以下を持つ。

```text
RULE_FIXED       : 計算ルール自体は公式根拠で確定
RULE_TODO        : 決定論的にできる見込みだが、まだルールを固め切っていない
ESTIMATED_INPUT  : ルールは確定、入力値が推定
UNKNOWN_EXTERNAL : 購入前に信頼して決められない外部要因
OPTIONAL         : ユーザー選択または条件発生時のみ
ACTUAL           : 実注文後に得られた確定値
```

### D3. Shipping methodはユーザーが変えられる
比較単位は **Proxy会社だけではなく `Proxy × Shipping Method`**。

- 各Proxyについて、その条件で利用可能な配送方法を表示
- デフォルトは Cheapest 等を選べる
- ユーザーが EMS / Surface / FedEx / DHL / UPS 等へ変更
- 変更時に総額・ランキングを即再計算
- 利用できないmethodは出さない

### D4. $3 `Build my cart`
無料比較だけで終わらせず、購入準備まで進める。

```text
Free:
Compare → affiliate link → user buys manually

Paid ($3):
Compare → user selects proxy → login check → payment authorization
→ cart automation → success → charge/capture → user final checkout
```

売っているのはAIではなく、**複数商品のProxy登録作業を消すこと**。

### D5. Automation architecture
- **Playwright-first**。正常系はLLMを使わない。
- Playwright失敗時だけAI fallback / self-healing。
- login / password / MFA / CAPTCHA はユーザー本人が操作（Human takeover）。
- 最終購入・支払いもユーザー本人。
- CAPTCHA solver、アクセス制御回避、ban回避をしない。
- 初期は **passwordを保存しない / sessionを永続保存しない / card情報を保存しない**。
- Remote browserは処理終了後破棄する。
- 認証画面のrecording/loggingは可能なら無効化。
- AI fallbackへ渡す情報も必要最小限（DOM断片等）にする。

### D6. Payment
- 決済基盤はStripeを優先。
- Stripe-hosted Checkout等を使い、ProxyCostがカード番号を扱わない。
- Card / Apple Pay / Google PayをStripe経由で提供する方向。
- UXは `Login availability check → payment authorization → automation → success時にcapture` が理想。Stripe実装時にmanual capture可否を確認する。

### D7. Data flywheel
サービスを使うほど推定精度が上がる構造にする。

実購入後、ユーザーの明示同意を得て、必要最小限の注文実績を保存する。**氏名等を削除しただけの1注文単位データを安易に「匿名」と呼ばない。** 取り込み時点では個人データ／個人に関する情報になり得る前提で扱い、ユーザー・アカウント・決済IDとのリンクを持たず、特異値や再識別リスクを必要に応じて一般化する。外部表示・共有に使うのは原則として集計済み統計情報。

保存候補:
```json
{
  "proxy": "zenmarket",
  "destination_country": "DE",
  "order_month": "2026-05",
  "categories": ["figure", "manga"],
  "item_count": 7,
  "item_value_jpy": 28400,
  "packed_weight_g": 3210,
  "package_dimensions_cm": [42, 31, 24],
  "shipping_method": "FedEx",
  "domestic_shipping_jpy": 900,
  "proxy_fees_jpy": 3500,
  "international_shipping_jpy": 7180,
  "tax_prepaid_jpy": 4860,
  "actual_total_jpy": 43940
}
```

保存しない:
- 氏名 / email / 住所 / 郵便番号
- Proxy account ID
- order number
- Cookie / session
- Stripe customer IDとの永続リンク
- browser fingerprint
- 再識別しやすい不要な商品名・URL（カテゴリ化を優先）

可能ならInvoice/CSVを**ブラウザ内で解析→不要な識別子を落とす→de-linked normalized JSONだけ送信**する。サーバー側ではプライバシー通知・利用目的・保存期間を定義し、十分な加工・集計が済むまで「匿名データ」と断定しない。

## 5. Five-proxy research status

### FROM JAPAN — OFFICIAL_PRIMARY + PROJECT_MANUAL / measured 2026-09-07
公開Calculatorをアカウントなし・ログインなしで実測。

- Product Protection / handling plan fee: **¥500 / item**。ただし**同一取引で同一商品の数量を複数購入した場合は1点分のみ**（OFFICIAL_PRIMARY）
- Payment Fees: **Free**
- Domestic delivery fee: default **¥700 Estimated**, user-editable。実費ではない
- Export Clearance Fee: **商品価格 > ¥200,000 で ¥2,800**
  - ¥200,000 = ¥0
  - ¥200,001 = ¥2,800
  - DE/GB/FR/AU/CA/SGで確認
  - USは¥210,000でも0（実測条件ではFedExのみ）
- 商品価格によって利用可能な配送methodが変わる
- DE 600gでは EMS / AirMail / Surface / FedEx Economy / FedEx Priority 等を価格付き表示
- SGではSF Expressも表示
- USではFedEx Economy / Priorityを確認
- Calculator自体が必ず最安methodをdefault選択するわけではない

### Jauce — PROJECT_MANUAL / measured current UI (official-source independent verification still limited)
公開ページをアカウント・ログインなしで実測。

Inputs:
- country: yes
- weight: yes
- length / width / height: yes

Examples (600g, 30×20×10cm):
- US: EMS ¥4,180 + Smart Packing ¥420
- Germany: EMS ¥3,400 + Smart Packing ¥420
- Germany: Surface ¥2,750 + Smart Packing ¥420
- DEでは複数methodの価格が同じ結果表に表示
- test条件ではDHL/FedExは表示されなかった
- 国によってavailabilityが変わる

### ZenMarket — official docs / high confidence
- Service fee: **¥300–800 / item**（購入先による）。**同一商品の複数量は1回、サイズ/色などvariationが異なる場合は別fee**（OFFICIAL_PRIMARY）
- Funds deposit fee: **from 1%**
- Domestic delivery: sometimes applicable
- Public shipping calculatorあり
- weight / dimensions / destination / item priceを使ってmethod別送料を見積可能
- basic consolidation / shipping insuranceをservice feeに含む説明あり

### Neokyo — official docs / high confidence
- Service fee: **¥350 / Buy Request**
- 同一Buy Request内の同一商品複数個はfee 1回
- Packing:
  - up to 2kg: ¥500
  - 2kg超: 追加1kgごとに¥150、切上げ
- International shipping: provider actual price, Neokyo markupなしと公式説明
- shipping estimatorあり
- Surface / Airmail / EMS / FedEx / UPS / DHL等（国によりavailability）
- US FedEx DDP等、一部のtax/broker ruleが公式にかなり詳細

### Buyee — official docs / medium-high confidence
- Purchase fee: **¥500 / order**
- Domestic shipping: actual cost（一般に150–1,500円程度との公式説明）
- International shipping: actual cost。weight / size / method / carrier等で変化
- Public shipping estimation toolあり
- Plan: Free / ¥300 / ¥500等
- Shipping methodは倉庫到着後に選択

**Open:** 現行public estimatorでmethod別料金・寸法入力をどの粒度まで取得できるかを、他4社と同様に境界値テストして固める。

## 6. Fee engine — canonical data model

`FIX` は「金額が永遠に同じ」ではなく、「決定関数を公式根拠で定義できた」を意味する。

| Category | Fee / value | Target status | Notes / required action |
|---|---|---|---|
| purchase | Item price | RULE_FIXED + ESTIMATED_INPUT | exact listing URLならActual/Confirmed。keyword参考価格はEstimated |
| proxy | FROM JAPAN handling / plan fee | RULE_FIXED | ¥500/item; identical multi-quantity in one transaction is charged once |
| proxy | ZenMarket service fee | RULE_FIXED | ¥300/500/800、購入先条件をrule化 |
| proxy | Neokyo service fee | RULE_FIXED | ¥350/Buy Request |
| proxy | Buyee purchase fee | RULE_FIXED | ¥500/order |
| proxy | Jauce commission | RULE_TODO | 現行公式一次根拠と境界値を確定 |
| payment | FROM JAPAN payment fee | RULE_FIXED | ¥0。現行サイトの¥200を修正 |
| payment | ZenMarket deposit fee | RULE_FIXED + ESTIMATED_INPUT | methodに依存。from 1%。支払方法別表を持つ |
| payment | Jauce deposit/banking fee | RULE_TODO | 公式一次根拠を固める |
| domestic | Seller → proxy warehouse | ESTIMATED_INPUT | listingで送料確定ならActual。なければstore/platform別推定 |
| warehouse | Basic packing / consolidation | RULE_FIXED / RULE_TODO | 会社別。Neokyoは式FIX、他社も基本/optionalを分離 |
| shipping | Japan Post | RULE_FIXED | 公式rate table + country/method availability |
| shipping | Courier (FedEx/DHL/UPS/SF etc.) | RULE_TODO → RULE_FIXED | proxy×country×method×weight×dimensions(+value)。FJ/Zen/Jauceはdirect/manual evidenceあり、Neokyoはofficial estimator/docs、Buyee exact public-estimator granularityはOPEN |
| shipping | Insurance | RULE_FIXED / OPTIONAL | methodごとのincluded / optionalを分離 |
| export | Export clearance | MIXED | FJは実測FIX。Buyee公式ルールあり。Zen/Neokyo/Jauceは公式根拠を追加 |
| import | Customs Duty | RULE_TODO → RULE_FIXED + ESTIMATED_INPUT | destination × origin × HS × value × date。origin/HS不明ならEstimated |
| import | VAT / GST / sales tax | RULE_TODO → RULE_FIXED | 国別税ルール + proxyが前払い徴収するかを組み合わせる |
| import | DDP / brokerage / carrier fee | RULE_TODO | proxy × carrier × destination。公開式はFIX、非公開分のみUnknown |
| fx | Card/PayPal FX | UNKNOWN_EXTERNAL | ProxyCost本体totalから分離するか参考値表示 |
| optional | Protection / inspection | OPTIONAL + RULE_FIXED | Buyee等 |
| optional | Protective/special packing | OPTIONAL | 選択時だけ |
| optional | Photo | OPTIONAL | 選択時だけ |
| optional | Repacking/unpacking | OPTIONAL | 選択時だけ |
| optional | Storage | OPTIONAL | 日数・サイズが分かればrule計算 |

## 7. Tax / duty engine research

税を一括で `Unknown` にしない。**法律上の計算ルールと、Proxyがどのタイミングで徴収するか**を分ける。

### US
- 2026-07のSection 301措置では、**product of Japan**についてMFN+Section301の合計が12.5%になる仕組みがある。
- 「日本から発送した商品」ではなく **country of origin** が重要。
- よって現行の「日本から買った商品に一律12.5%」は危険。
- Minimum inputs: destination, country_of_origin, HS code, value, date。**これは最低限であり、除外・特別措置・商品固有ルール等を別レイヤーで持つ。**

### EU27
- 2026-07-01から、€150以下のlow-value consignmentに**暫定€3 customs duty per item**（EU公式表現）。実装上の「item」の数え方はEU guidance例でfixture化してからFIXする。
- IOSS / DDP / standard import VATをProxy×shipping methodで判定する。
- Neokyo等は特定carrier・閾値でDDPルールを公式公開している。

### UK
- **total consignment value £135以下**は原則point-of-sale VATの制度（excise等の例外あり）。
- £135超はimport VAT / Customs Duty。
- Dutyは品目とoriginに依存。

### Australia
- Low-value imported goods (customs value ≤A$1,000)にはGST制度があり、登録対象の海外seller/platform等がpoint-of-saleで徴収する場合がある。
- >A$1,000は通常borderでGST/Customs等。**≤A$1,000が常にborderでGST課税されるという意味ではない。**
- ProxyのGST登録/徴収方式を会社別に紐付ける。

### Singapore
- Low-Value Goods判定は原則**1商品あたりsales value ≤S$400**等の要件（air/post、非免税等）で判定。
- GST-registered overseas supplier等ならpoint-of-sale GST、非登録等ではCIF条件によりimport GST。
- import GSTは基本 `CIF + duty` に9%。

### Canada
- 日本からの一般的な輸入では**C$20 baseline**を基準に扱う。ただし郵便とcourier、US/Mexico由来のCUSMA閾値は分けて実装し、単一閾値に一般化しない。
- 超過時はGST/HST/PST + duty（品目/原産国依存）。

## 8. Shipping-method UX

各Proxyのカード内にmethod selectorを持つ。

Example:
```text
FROM JAPAN
Shipping: [Surface ▼]
  Surface          ¥2,500
  EMS              ¥3,400
  FedEx Economy    ¥5,309
  FedEx Priority   ¥5,671
Total: ¥...
```

Global presetsも検討:
- Cheapest
- Fastest
- Balanced
- Tracking required

重要: ProxyCostが「FedEx同士」等に固定比較する必要はない。ユーザーが欲しいのは、**自宅へ届くまでの最適な `proxy × shipping method` の組合せ**。

## 9. Accuracy strategy

### Current internal assessment（実測ではなく開発上の仮説）
- 現状の最安Proxy順位精度: 約70–80%と推定
- 現状のlanded total: ±15–30%程度の誤差を想定

これはバックテスト結果ではない。マーケティングで数値を主張しないこと。

### Target before broad release
- 最安Proxy / shipping combination順位一致率: **90%+**
- landed total: 主要カテゴリで **±10–15%圏内**を目標
- `RULE_FIXED` と `ESTIMATED_INPUT` をUIで明確に区別

### Biggest remaining error sources
1. packed weight
2. packed dimensions
3. Japanese domestic shipping
4. country of origin
5. HS classification

料金式を固めた後は、**式の調査より入力推定の改善の方が重要になる**。

## 10. Backtest / validation policy

### Allowed / preferred
1. 公式Calculatorへの少数境界値テスト
2. Japan Post等の公式historical rate tables
3. Proxy公式の料金改定履歴
4. 公式に公開された過去parcel例
5. ユーザー本人が明示同意して提供する過去Invoice/CSV
6. 自分で行った実購入

### Do not use as model-training source
- Panjiva / Volza等の有料・契約shipment DB
- 無断転載された他人のInvoice
- 規約不明な大量スクレイピングデータ

### 3-layer test
**Layer 1: Rule regression**  
**大量に回すのはProxyCostの自前rule engineに対するunit/regression test。** 公式Calculatorへのアクセスは、規約・負荷に配慮した少数の境界値/spot checkに限定し、その結果をfixture化して実装ミスを潰す。

**Layer 2: Packing regression**  
実parcelデータで、商品構成→packed weight / dimensionsの誤差を測る。

**Layer 3: End-to-end ground truth**  
ユーザー同意済み過去orderで、予測総額 vs actual total、最安順位を測る。

Metrics:
- total absolute percentage error
- proxy ranking accuracy
- shipping-method ranking accuracy
- error distribution by category / country / proxy

## 11. $3 Build My Cart — implementation concept

```text
User creates multi-item cart
        ↓
ProxyCost calculates/ranks
        ↓
User chooses proxy + method
        ↓
"Build all N items — $3"
        ↓
Ephemeral remote browser
        ↓
Check authentication state (Playwright, no LLM)
        ↓
Not logged in → Human takeover for login/MFA/CAPTCHA
        ↓
Payment authorization
        ↓
Playwright deterministic flow
        ↓ failure only
AI fallback / selector repair
        ↓
Cart ready / checkout review page
        ↓
User takes over
        ↓
User checks variant/quantity/total and completes purchase
        ↓
Success capture / browser destroyed
```

Rules:
- Agent must never submit final purchase without user action.
- Credentials and persistent session are not stored in MVP.
- If proxy blocks automation, do not bypass access control; disable that integration until compliant path exists.
- Aim for Playwright >95% of actions. AI only exception path.

## 12. Monetization

### Primary
1. **Affiliate**: free comparison → proxy outbound click / conversion where partner program exists
2. **$3 Build my cart**: AI fallback前にpayment authorizationを確保し、**カート構築成功時にcaptureする**。authorizationだけで売上確定とは表現しない

### Secondary
- Ads can be added, but should not damage checkout/affiliate conversion.

Important: ranking must never be influenced by affiliate payout. Current site already states this principle; keep it.

## 13. Competitive position

Closest competitor **found in this research**: **Otaku Shopping Guide — Japan Proxy Fee Calculator**.

Competitor characteristics:
- Buyee / ZenMarket / Neokyo / FROM JAPAN (4 services)
- asks user to enter estimated package weight
- shipping / duty are explicitly ballpark estimates
- content volume / explanatory articlesは多い（qualitative observation）。SEO強度・trafficは外部データ未計測

ProxyCost advantages if roadmap is completed:
- 5 proxies including Jauce
- listing URL / keyword → item identification
- automatic weight estimation
- proxy-specific shipping-method selector
- detailed tax/DDP rule engine
- explicit `rule fixed vs input estimated vs unknown`
- $3 cart automation
- actual-order feedback loop

Competitor advantage today:
- distribution / SEO / content volume / existing audience

Therefore: **calculator sophistication can exceed competitor, but distribution is still weak.** Do not confuse a better engine with product-market fit.

## 14. Priority backlog

### P0 — correctness / stale data
- [ ] FROM JAPAN Payment fee ¥200 → ¥0
- [ ] Remove/update current statement that courier pricing is unavailable across proxies
- [ ] Unify Sources page and runtime fee data; no duplicated stale constants
- [ ] Replace second-hand Duty logic with official-source rule engine
- [ ] Re-check FROM JAPAN current DDP/import-duties-and-fees matrix as of 2026-09-09; Charge 2 can include import duties/customs handling for eligible DDP methods

### P1 — canonical fee engine
- [ ] Create versioned fee-rule schema with `source_url`, `checked_on`, `effective_from`, `effective_to`
- [ ] Finish Jauce commission / banking / deposit rules
- [ ] Finish export-clearance rules for all 5 proxies
- [ ] Finish payment/deposit rules by method

### P2 — shipping
- [ ] Boundary-test each proxy public calculator
- [ ] Build proxy×country×shipping-method availability table
- [ ] Build proxy-specific courier rate lookup/rule tables
- [ ] Shipping method selector + immediate re-ranking
- [ ] Buyee current estimator live test to close exact input/method granularity

### P3 — tax
- [ ] US origin/HS-aware duty engine
- [ ] EU27 VAT + €3-per-item low-value duty + IOSS/DDP handling; define exact item-count semantics from EU guidance
- [ ] UK VAT/duty engine
- [ ] AU GST engine
- [ ] SG GST engine
- [ ] CA GST/HST/PST/duty engine; separate postal/courier and CUSMA/non-CUSMA thresholds
- [ ] Proxy×carrier×country DDP/DDU matrix

### P4 — confidence model
- [ ] Implement `RULE_FIXED / RULE_TODO / ESTIMATED_INPUT / UNKNOWN_EXTERNAL / OPTIONAL / ACTUAL`
- [ ] UI tooltip: why a line is estimated and what input would make it confirmed
- [ ] Confidence should propagate to total and ranking

### P5 — validation
- [ ] Generate official-calculator regression fixtures
- [ ] Run 100–300 rule regression cases
- [ ] Recruit beta users for old invoice/CSV contribution with explicit opt-in + privacy notice; ingest as potentially personal data until de-linking/anonymisation/aggregation is validated
- [ ] Measure actual total error and ranking accuracy

### P6 — $3 automation
- [ ] Start with 1–2 proxies if full 5-company implementation delays validation
- [ ] Ephemeral browser + human login + Playwright
- [ ] AI fallback only on deterministic failure
- [ ] Stripe payment authorization/capture flow
- [ ] User final checkout takeover
- [ ] De-linked actual-cost capture after explicit consent; only call outputs anonymous after anonymisation/aggregation criteria are met

## 15. Implementation principles for Claude

1. **Never hide uncertainty.** If input is estimated, the line and total remain estimated.
2. **Do not invent fees.** Unknown must be represented as unknown, not zero.
3. **Official source first.** Every deterministic fee rule needs a source and checked date.
4. **No runtime dependency on private endpoints** unless explicitly approved and terms allow it.
5. **No credentials in app storage.** MVP uses ephemeral authenticated browser only; session/cookie data is treated as credential-equivalent and destroyed with the browser.
6. **Ranking is cost-based, never affiliate-payout-based.**
7. **Shipping method is part of the optimization variable.** Do not hardcode EMS as the comparison basis.
8. **A fee rule and an input estimate are different dimensions.** Model them separately.
9. **Regression tests are mandatory when fee rules change.**
10. **Prefer rules/tables over LLM.** LLM is exception recovery, not calculator logic.

## 16. Fact-check corrections applied (2026-09-09)

1. **FROM JAPAN ¥500 fee nuance** — same-item multiple quantities in one transaction are charged once, not blindly `¥500 × quantity`.
2. **Courier over-claim removed** — Buyee public estimator exact method/dimension granularity remains OPEN; do not claim five providers are identically verified.
3. **Privacy terminology tightened** — deleting names does not automatically make row-level purchase history anonymous. Treat raw/de-linked rows conservatively; use aggregate statistical data for public outputs.
4. **EU duty wording corrected** — official wording is `€3 per item`, not `per tariff item`.
5. **UK threshold clarified** — £135 applies to the total consignment.
6. **Australia/Singapore tax semantics clarified** — low-value GST may be collected at point of sale; threshold semantics are not simple border-only rules.
7. **Canada threshold scoped** — do not collapse postal/courier and CUSMA/non-CUSMA rules into one number.
8. **Validation policy corrected** — high-volume regression runs against ProxyCost locally; public calculators are only sampled for boundary/spot checks.
9. **$3 payment wording corrected** — payment authorization is not revenue; capture on successful cart build.
10. **FROM JAPAN DDP marked for immediate re-check** — current Charge 2 flow can include import duties/customs handling for eligible DDP shipments.

## 17. Key source references

### Product / competitor
- ProxyCost: https://proxycost.3amoncall.workers.dev/
- Otaku Shopping Guide calculator: https://otakushoppingguide.com/category/tools-compare/

### Proxy official sources
- FROM JAPAN fee information: https://blog.fromjapan.co.jp/en/service-site-updates/why-now-is-the-best-time-to-shop-with-from-japan-%F0%9F%92%B4%E2%9C%A8.html
- ZenMarket fees: https://zenmarket.jp/en/fees.aspx
- Neokyo fees: https://neokyo.com/en/fees
- Neokyo shipping/tax: https://neokyo.com/en/shipping
- Buyee fees: https://bc.help.buyee.jp/en/fee/
- Buyee shipping: https://bc.help.buyee.jp/en/shipping-fees/
- Buyee plans: https://bc.help.buyee.jp/en/plans/
- Jauce: current public Calculator findings are from manual browser verification in this project; retain screenshots/evidence in repo.

### Government / tax
- US 2026 Section 301 action: https://www.whitehouse.gov/presidential-actions/2026/07/actions-by-the-united-states-in-the-investigations-under-section-301-of-the-trade-act-of-1974-of-the-acts-policies-and-practices-of-60-economies-related-to-the-failure-of-each-economy-to-impose-and/
- EU low-value €3 duty: https://taxation-customs.ec.europa.eu/news/guidance-and-legal-text-temporary-flat-fee-low-value-imports-which-will-apply-until-1-july-2028-2026-06-08_en
- UK tax/duty: https://www.gov.uk/goods-sent-from-abroad/tax-and-duty
- Australia low-value GST: https://www.ato.gov.au/
- Singapore low-value GST: https://www.iras.gov.sg/taxes/goods-services-tax-%28gst%29/consumers/gst-on-imported-low-value-goods
- Canada mail/courier duties & tax: https://www.cbsa-asfc.gc.ca/import/courier/menu-eng.html

## 17. What is explicitly NOT proven yet

- `$3 Build my cart` の実支払需要。仮説は強いが未検証。
- Proxyユーザーの平均購入点数。複数商品利用が強いことは各社の保管・consolidation設計から示唆されるが、公開統計で「1商品が少数派」とは証明できていない。
- 現在の「70–80% / 将来90%+」精度数字。これは内部仮説で、バックテスト前に外部表示しない。
- 5社すべてのautomationが規約上問題なく長期運用できること。技術的実現性と契約/規約は別。
- すべての税・broker feeが購入前に100%確定できること。ルールがあってもHS/origin/packing等の入力が不明ならEstimatedになる。

---

**One-line direction:**

> Official rules first. Estimate only the missing inputs. Let users choose the real shipping method. Automate the boring purchase setup for $3. Learn only from consented, anonymous actual orders.


### Fact-check primary references added 2026-09-09
- FROM JAPAN complete guide (Apr 2026): https://blog.fromjapan.co.jp/en/how-to/complete-guide-to-buying-from-japan-beginner-friendly-%E2%9C%A8.html
- FROM JAPAN DDP breakdown request: https://forms.fromjapan.co.jp/en/ddpbreakdown
- EU temporary €3/item duty: https://taxation-customs.ec.europa.eu/news/guidance-and-legal-text-temporary-flat-fee-low-value-imports-which-will-apply-until-1-july-2028-2026-06-08_en
- UK overseas goods tax/duty: https://www.gov.uk/goods-sent-from-abroad/tax-and-duty
- UK £135 consignment VAT guidance: https://www.gov.uk/guidance/vat-and-overseas-goods-sold-directly-to-customers-in-the-uk
- Australia low-value GST: https://www.ato.gov.au/businesses-and-organisations/international-tax-for-business/gst-for-non-resident-businesses/gst-on-low-value-imported-goods
- Australia import GST formula: https://www.abf.gov.au/importing-exporting-and-manufacturing/importing/cost-of-importing-goods/gst-and-other-taxes
- Singapore low-value GST: https://www.iras.gov.sg/taxes/goods-services-tax-%28gst%29/consumers/gst-on-imported-low-value-goods
- Canada mail/courier duty/tax: https://www.cbsa-asfc.gc.ca/import/courier/menu-eng.html
- Japan PPC anonymous/statistical data FAQ: https://www.ppc.go.jp/all_faq_index/faq1-q15-2/
- Japan PPC anonymised information guidance: https://www.ppc.go.jp/personalinfo/tokumeikakouInfo/
