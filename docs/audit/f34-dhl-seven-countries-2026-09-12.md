# F34（通関手数料）DHL Express 7か国 一次情報収集（2026-09-12）

`docs/audit/f34-clearance-fee-by-route-2026-09-12.md` がスコープした「宅配便4社×7か国28マス」のうち、
本タスクは **DHL Express の7マス（US/GB/DE/FR/AU/CA/SG）** のみを対象にした。FedEx・UPS/ECMS は
別セッションが並行して同じ `master/customs.json#clearance` に書き込んでいるため、DHL 以外の行には
一切触れていない。

## 結論を先に

- **7か国すべて、DHLの公式一次資料（Service & Rate Guide 2026 の各国版PDF、直接フェッチ・逐語確認）
  から「宛先国・受取人請求」側の費目を確認できた。** 米国・英国・豪州は当初の課題どおり
  `Duty Tax Paid`（出発国/第三国請求）と混同するリスクがあったが、今回はすべて明示的に
  `Duty Tax Processing`（カナダのみ名称は`Customs Clearance`だが定義文はDTX相当）の行を記録し、
  対比のため`Duty Tax Paid`側の金額も`dtp_for_contrast`として併記した（ruleには含めていない）。
- **DE の既存 `A_confirmed` 行に金額の誤りを発見した。** 名称・仕組み（2%・宛先国で受取人請求）は
  正しかったが、最低額が二次情報（paketda.de、€12.50+19%USt=€14.88）由来の古い数字で、DHL自身の
  一次資料（2026年版レートガイド、および法的拘束力を持つドイツ語版「Auftragsbedingungen und
  Gebühren für die Zollabfertigung」PDF）は **€15.00 zzgl. MwSt.（19%込みで約€17.85）** としており、
  金額が食い違っていた。今回、一次資料の値に更新した（詳細は下表とcorrected_from）。
- 7か国中 **per-parcel/per-shipmentが一次資料で明言されているのはDEのみ**（"pro abgefertigter
  Sendung" = per cleared shipment）。他6か国は「% of fiscal charges」としか書かれておらず、
  DEと同型と推定するのは推論(B_inferred)に留めた。
- **税ゼロ時に課すかどうかは7か国すべてC_unknown。** どの一次資料にも明示の免除規定が無い
  （郵便側5か国にあった「税が発生しないなら課さない」という明記がDHL Expressの資料には見当たらない）。
  カナダの定義文（「DHLがCustoms entryを作成する非書類インポート全件に対して課金」）は税ゼロでも
  課される可能性を示唆するが、これは読み方の推論であり断定はしていない。

## 表：destination × DTP/DTX × 費目名 × 金額 × per-parcel/shipment × 税ゼロ時 × 発効日 × confidence × source × 読取日 × 逐語引用

| 国 | DTP/DTX | 費目名（原文） | 金額/構造 | per-parcel/shipment | 税ゼロ時 | 発効日 | confidence | source | 読取日 | 逐語引用 |
|---|---|---|---|---|---|---|---|---|---|---|
| US | DTX | Duty Tax Processing: Account Holders / Non-Account Holder | 2% of fiscal charges, min $17.50（両者同額） | unknown（推定 per_shipment、B_inferred） | C_unknown | DHL Express Service & Rate Guide 2026（発効日の明記なし） | A_confirmed | [US Rate Guide 2026 PDF](https://mydhl.express.dhl/content/dam/downloads/us/en/rate-guide/service_and_rate_guide_us_en_2026.pdf.coredownload.pdf) | 2026-09-12 | あり |
| US（対比） | DTP | Duty Tax Paid | 2% of fiscal charges, min $17.00 | — | — | 同上 | A_confirmed | 同上 | 2026-09-12 | あり |
| GB | DTX | Duty Tax Processing: Account Customers / Non-Account Customers | Account: 2.5%・min £12.00／Non-Account: 2.5%・min £11.00 | unknown（B_inferred） | C_unknown | 同上（GB版） | A_confirmed | [GB Rate Guide 2026 PDF](https://mydhl.express.dhl/content/dam/downloads/gb/en/rate-guide/service_and_rate_guide_gb_en.pdf.coredownload.pdf) | 2026-09-12 | あり |
| GB（対比） | DTP | Duty Tax Paid | 2% of fiscal charges, min £16.00 | — | — | 同上 | A_confirmed | 同上 | 2026-09-12 | あり |
| DE | DTX | Duty Tax Processing（独: Kapitalbereitstellungsprovision） | 2% der verauslagten Einfuhrabgaben, mind. €15.00 zzgl. MwSt.（≒€17.85込み） | **per_shipment（A_confirmed、"pro abgefertigter Sendung"と明記）** | C_unknown | 2026 Rate Guide／独語T&C（発効日明記なし） | A_confirmed（金額を本タスクで€14.88→€15.00+MwStへ訂正） | [独語T&C PDF](https://www.dhl.de/dam/jcr:3c343ee4-e952-4310-aa15-dfd1c99aa7e9/dhl-express-auftragsbedingungen-gebuehren-zollabfertigung-de-012025.pdf) / [DE Rate Guide 2026](https://www.dhl.de/dam/jcr:66008de1-5933-4497-a194-ab7f4626d671/dhl-express-produkte-services-und-preise-en.pdf) | 2026-09-12 | あり |
| DE（対比） | DTP | Duty Tax Paid | 2% of fiscal charges, min €17.00 | — | — | 同上 | A_confirmed | DE Rate Guide 2026 | 2026-09-12 | あり |
| FR | DTX | Duty Tax Processing: Account Customers / Non-Account Customers | Account: 2%・min €15.30／Non-Account: 1.8%・min €16.67 | unknown（B_inferred） | C_unknown | 同上（FR版） | A_confirmed | [FR Rate Guide 2026 PDF](https://mydhl.express.dhl/content/dam/downloads/fr/en/rate-guide/service_and_rate_guide_fr_en_2026.pdf.coredownload.pdf) | 2026-09-12 | あり |
| FR（対比） | DTP | Duty Tax Paid | 2% of fiscal charges, min €17 | — | — | 同上 | A_confirmed | 同上 | 2026-09-12 | あり |
| AU | DTX | Duty Tax Processing: Account Customers / Non-Account Customers | 両者とも 3%・min 23 AUD | unknown（B_inferred） | C_unknown | 同上（AU版） | A_confirmed | [AU Rate Guide 2026 PDF](https://mydhl.express.dhl/content/dam/downloads/au/en/rate-guide/service_and_rate_guide_au_en_2026.pdf.coredownload.pdf) | 2026-09-12 | あり |
| AU（対比） | DTP | Duty Tax Paid | 2% of fiscal charges, min 30 AUD | — | — | 同上 | A_confirmed | 同上 | 2026-09-12 | あり |
| CA | DTX相当（名称は"Customs Clearance"） | Customs Clearance: with DHL Brokerage Account / without | with: 2.75%・min 12.00 CAD／without: 2.75%・min 18.00 CAD | unknown（B_inferred） | C_unknown（定義文が「全件課金」と読めるが推論） | 同上（CA版） | A_confirmed | [CA Rate Guide 2026 PDF](https://mydhl.express.dhl/content/dam/downloads/ca/en/rate-guide/service_and_rate_guide_ca_en_2026.pdf.coredownload.pdf) | 2026-09-12 | あり |
| CA（対比） | DTP | Duty Tax Paid | 2.5% of fiscal charges, min 16.00 CAD | — | — | 同上 | A_confirmed | 同上 | 2026-09-12 | あり |
| SG | DTX | Duty Tax Processing: Account Customers / Non-Account Customers | 両者とも 5%・min SGD 20 | unknown（B_inferred） | C_unknown | 同上（SG版） | A_confirmed | [SG Rate Guide 2026 PDF](https://mydhl.express.dhl/content/dam/downloads/sg/en/rate-guide/service_and_rate_guide_sg_en_2026.pdf.coredownload.pdf) | 2026-09-12 | あり |
| SG（対比） | DTP | Duty Tax Paid | 2% of fiscal charges, min SGD 34 | — | — | 同上 | A_confirmed | 同上 | 2026-09-12 | あり |

**すべて `curl -L` でHTTP 200・PDFとして直接フェッチでき、WAF等の代替ページには当たらなかった**
（原則2「PDFがブラウザのPDFビューアで描画されないときは直接フェッチする」を踏まえ、最初から
`curl` でPDFを取得し `pdftotext -layout` でテキスト化した）。US FedExのようなWAF失敗は今回は
発生していない。

## DEの訂正の詳細

- 訂正前（このタスク開始時点の `master/customs.json`、`A_confirmed`）: 「2% der Einfuhrabgaben,
  mindestens aber 14,88 Euro」、出典 paketda.de（業界紙。DHL自身の一次資料ではない）。
- 訂正後（本タスクで一次資料により確認）: 独語T&C PDFの逐語引用
  > "Bei Überweisung wird das zuzügliche Entgelt für die Nutzung des DHL eigenen Aufschubkontos
  > standardmäßig in Höhe von 2 % der verauslagten Einfuhrabgaben, mind. jedoch 15,00 EUR, zzgl.
  > MwSt. pro abgefertigter Sendung berechnet (Service: Duty Tax Processing)."

  英語版 Rate Guide 2026 の対応行（Duty Tax Processing: Account/Non-Account Customers）も
  「2% of fiscal charges with minimum of €15.00」で一致。**€15.00はネット額でMwSt(19%)別**、
  旧記録の€14.88は「€12.50+19%」という別の計算に基づいていた（€12.50という数字自体の出典が
  paketda.deにも明記されていない）。したがって最低額は€12.50→€15.00へ、率(2%)は変わらず。
- **タスクが警告した「DTP/DTXの取り違え」自体は起きていなかった**——独語T&C PDFが
  `(Service: Duty Tax Processing)` と明記しており、「Kapitalbereitstellungsprovision」は
  DTXの独語通称だったことを一次資料で確認できた。取り違えではなく、**二次情報由来の金額が
  一次資料と食い違っていた**、という別種の問題だった。

## 追記（2026-09-12、マージ後）── FedExの並行成果と合わせて見えた2点

`main` に並行着地した FedEx 7か国分（#98, `docs/audit/f34-fedex-seven-countries-2026-09-12.md`）と
本ブランチを `git merge` した際に気づいたので、コーディネーターの指示どおりここに書き足す。
**以下はどちらも観察の記録であり、スキーマ変更や実装はしていない。決定はオーナーに委ねる。**

### per-shipment vs per-parcel は、もはや「未確認」で片付けられる状態ではない

上の表で書いたとおり、DHL側は7か国中**DEだけ** per_shipment を一次資料で確認できた
（"pro abgefertigter Sendung"）。マージして分かったのは、**FedEx SG行が2件目のper-shipment候補
になっている**こと（`unit: "per_shipment"`, `unit_tier: "search_snippet_no_verbatim_quote"`、
"5% of GST amount ... per shipment" という検索結果要約に基づく）。DHL・FedExという別々の2社が、
別々の情報源から、同じ「per-shipment」という軸に行き着いている。

これは `docs/audit/f34-clearance-fee-by-route-2026-09-12.md` が指摘したスキーマ・ギャップ
（「per-parcel か per-shipment かを表現する専用フィールドが `rule.type` に無い」）を補強する材料になる
と考える。**箱分割（#85）は個数を動かす変更なので、per-parcel の費目は分割で増え、per-shipment の
費目は増えない。** 今は各行に非構造化の `per_parcel_or_shipment` / `unit` フィールドを自己流に
足してあるだけで、コード側からは読めない。**この2件（DE-DHLの確認済みper_shipmentと、SG-FedExの
未確認per_shipment候補）を見て、`rule.type` に per-shipment 用の型を追加するかどうかは、
#97 が既に記録した既知のギャップとしてオーナーの判断に委ねる。** 本PRではフィールドの追加や
実装は行っていない。

### 「税ゼロ時に課すか」がDHL7か国すべてC_unknownであること自体が結果

これは「埋め残し」ではなく、**確認した上での不在（counted_absence寄りの結果）**として明記する。
7か国分のDHL Express Service & Rate Guide 2026（PDF、各10ページ程度）全文を
`duty tax|disbursement`および`de minimis|no duty|duty-free|zero`でgrepし、該当箇所を人力でも
確認したが、**免除規定の記述はどの国のガイドにも一切無かった。** 対して、`docs/PRINCIPLES.md`
原則2・および本タスクが前提とした郵便事業者側（USPS/Royal Mail/Deutsche Post/SingPost/ABF）は
**5か国中5か国**が「税が発生しない場合は課さない」という条件を一次資料に明記している
（`docs/audit/f34-clearance-fee-by-route-2026-09-12.md`表参照）。

**この非対称性は、このカリキュレータが最も使われる「安いカート」で効く。** 免税帯に収まる注文で
DHL Expressの通関手数料が「ゼロ」になるのか「最低額（例: US $17.50, DE €15.00+MwSt）が満額課される」
のかは、総額計算の結論を左右する。今回は7か国×2社（DTX側だけでも7件）の一次資料を確認した上で
「書かれていない」と分かったのであり、**探し方が足りなかったのではなく、DHL自身が公表する
一般向け料金表にはこの判断基準が載っていない、という事実**として扱うべきだと考える。

## 埋められなかったセルと試したこと

- **7か国×「税ゼロ時に課すか」**: 7つのRate Guide PDF全文を`duty tax|disbursement`および
  `de minimis|no duty|duty-free|zero`でgrepしたが、免除規定の記述は見つからなかった
  （`counted_absence`——全10ページ中の該当セクション全文を読んだ上での不在）。DHL Expressの
  Rate Guideは一般向け料金表であり、判断基準を書いた運用マニュアルではないため、この軸は
  別種の一次資料（各国のカスタマーサービスFAQ等）が必要と思われる。今回はスコープ外として
  試みていない。
- **US/GB/DE以外の per-parcel/per-shipment 明記**: 同上のgrepで「per shipment」「per parcel」
  の語がDuty Billing Servicesの行自体には付いておらず（隣接する他の費目行にはper shipmentの
  表記があるが、Duty Tax系の行だけ「Charging method」列が「% of fiscal charges」になっている）、
  確認できなかった。DEの独語T&Cのみ例外的に法的文書として明記していた。
- **DE のRate Guide URLパターンの不一致**: 他6か国は
  `mydhl.express.dhl/content/dam/downloads/<cc>/en/rate-guide/service_and_rate_guide_<cc>_en_2026.pdf.coredownload.pdf`
  で取得できたが、DEだけこのパターンは404（`dhl_de.pdf` が実際にはHTMLエラーページとして
  返ってきた）。`dhl.de`ドメイン配下の別URL（`www.dhl.de/dam/jcr:...`）を検索で特定して代替した。

## 他社の行について

FedEx・UPS・ECMSの既存行は一切編集していない。US FedEx行に「DHLの2費目に対応させると本行は
Processing側」という既存のnoteがあるが、内容を確認した限り誤りは見当たらなかった（触れていない）。

## 検証

- `python3 master/validate.py` → 0件矛盾（実請求再現4件PASS、1件SKIP、DHL行に対する新規fixtureは無い）。
- `python3 master/render-docs.py` → 生成節を書き戻し、`--check` もOK。
- `npx vitest run` → **870 passed**（`main`時点と同数、既存テストの喪失なし）。
