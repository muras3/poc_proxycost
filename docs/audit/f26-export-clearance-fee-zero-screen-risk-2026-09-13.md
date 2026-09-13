# F26（輸出通関手数料 ¥2,800）と FROM JAPAN 自社計算機の¥0表示のリスク — 2026-09-13

`master/fees.json` F26 に対する追加記録。目的は、オーナーがFROM JAPANの自社送料計算機を実際に操作して発見した矛盾——**FROM JAPANの計算機は日本郵便の全方式で輸出通関手数料を¥0と表示するが、F26は同じ経路に¥2,800を課している**——をリスクとして登録すること。詳細は機械可読な形で `master/fees.json` の `conclusions.F26_export_clearance_fee_screen_zero_risk_2026_09_13` に、`carrier-surcharges.json` の `fuel_surcharge_working_treatment`（F28）／`remote_area_surcharge_working_treatment`（F40）と同じ形（`treatment` に代えて `decision` / `confidence` / `readings`（`grounds_supporting`・`grounds_against`に代わる、順位をつけない4つの読み）/ `what_would_distinguish`（`pending_test`に相当））で記録した。このドキュメントは人間向けの要約。

## 結論（先出し）

- **金額・条件・振る舞いは変更していない。** F26の¥2,800（`carrier_in: ["JapanPost_all"]`）はそのまま。本PRは記録のみ。
- **観測事実（direct_fetch）**: 2026-09-13、オーナーがFROM JAPANの自社計算機を操作したところ、EMS・AirMail・Surface・Surface (Small Packet)・AirMail (Small Packet) を含むすべての結果画面で **"Export Clearance Fee: 0 yen"** と表示された。
- **この観測が何を意味するかは未決着。** 4つの読みを順位をつけずに記録した（下記）。
- **もし読み1（FROM JAPANが自己負担）が正しければ**、我々はFROM JAPANの日本郵便経路について、ルートあたり**¥2,800の過大計上（overstating）**をしていることになる。ただし本記録はこの仮定を採用していない。
- **F26の provenance を確認した結果、¥2,800が実請求書で裏付けられたことは5社とも一度も無い。** これは今回最も重要な発見であり、下記に独立した節として明示する。

## F26の provenance（今回確認した事実）

`master/fees.json` の F26 行を5社分読んだ。

| 会社 | tier | confidence相当 | quote/inference_basis | source | checked_on |
|---|---|---|---|---|---|
| Buyee | A_confirmed | 一次ページに逐語引用あり | "If you send item(s) valued over 200,000 yen with EMS, AIR, SAL or Japan Post Seamail, a customs clearance commission fee (2,800 yen) will be charged." | buyee.jp/helpcenter/guide/fees?lang=en | 2026-09-07 |
| FROM JAPAN | A_confirmed | 一次ページに逐語引用あり | "Packages with a total value exceeding 200,000 yen sent through Japan Post (EMS, International Parcel) will incur a 2,800 yen Export Clearance Fee." | fromjapan.co.jp/translate/en_help.txt | 2026-09-07 |
| Jauce | A_confirmed | 一次ページに逐語引用あり | "Additional customs fee: JPY 2,800 when package contents exceed JPY 200,000" | jauce.com/japan_auction_detail | 2026-09-07 |
| ZenMarket | B_inferred | Buyee/FROM JAPAN/Jauceからの推論 | 「Buyee・FROM JAPAN・Jauceの3社が同額・同条件で持つ」ことのみを根拠。ZenMarket自身のページには記載も否定も無い | zenmarket.jp/en/fees.aspx | 2026-09-07 |
| Neokyo | B_inferred | 同上 | 同上 | neokyo.com/en/fees | 2026-09-07 |

**¥2,800が実請求書（invoice）と突き合わされたことは、5社ともゼロ。** A_confirmedという tier 名は「一次ページの文言を direct_fetch で直接確認した」ことのみを意味し、「実際にその金額で請求された実例で裏付けた」ことを意味しない。F26についてはこの区別が今まで記録上どこにも明示されていなかった。

**過去の過大表示事故との異同**: CLAUDE.mdが記録する DE DHL最低額（本来 secondary source 由来だったものを `A_confirmed` と記録し、PR #99 で訂正）や、ロードマップの「primary source obtained」主張（実際は master では `unknown` のままだった、PR #89）と同じ形の事故には該当しない、というのが今回の判断である。理由は、F26の A_confirmed 3社は実際に `quote` フィールドに一次ページからの引用符付き原文を持ち、tier の語彙定義（一次ページを direct_fetch で確認）にそのまま合致しているため——過去2件は「見ていないのに見たかのように記録した」ことが問題だったが、F26は定義通りに運用されている。**ただし、これは tier の定義自体が最初から「実請求との照合」を範囲に含んでいないことの裏返りでもある。** 一次ページ＝正、実請求との突合せは対象外、という定義の射程の狭さは、F26に限らず本マスタ全体に共通する未解決のギャップであり、他の A_confirmed 行についても同種の再検証価値があることは付記しておく。

## 観測事実 vs 解釈の区別

`conclusions.F26_export_clearance_fee_screen_zero_risk_2026_09_13.observation_confidence` は `direct_fetch` とした——オーナー自身が計算機を実際に操作して見た画面の記述であり、伝聞・要約ではない。しかし**この¥0表示が何を意味するかについてのいかなる解釈も、この confidence を継承しない**。解釈（readings）はいずれも `reasoned_judgement_unconfirmed` に留める。

## 4つの読み（順位をつけない）

CLAUDE.md §9「状況は理由にならない」に従い、¥0表示という状況そのものからは、どの読みが正しいかを一つに決められない。

1. **R1 FROM JAPANが自己負担している** — ¥2,800相当を自社で吸収し、利用者に転嫁していない。
2. **R2 見積り外で後日請求される** — 同じ結果画面自身が次の一文を掲げている（逐語引用）: *"Your final payment will be determined by actual cost and may vary from the estimate provided in this tool."* この一文がR2の最有力の根拠。
3. **R3 我々の¥2,800とFROM JAPANの¥0表示は、そもそも別の役務・別の状況を指している** — F26の条件は `declared_value_jpy_over: 200000`。2026-09-13の計測がこのしきい値を実際に跨いだ入力で行われたかは、本記録の範囲では未確認。
4. **R4 計算機自体の表示が信頼できない** — 同じ2026-09-13の計測ラウンドで、SGの500g条件でUPSの結果が試行によって¥2,891⇔非表示と揺れる非決定的な挙動が観測されている。加えて、別のJauce計測でクライアント側の送信バグ（古い値が残留する）が文書化されている。したがって「画面が¥0と表示した」という観測自体は direct_fetch として正しいが、それが「真の値が¥0である」ことの証拠になるかは、計算機自体の信頼性が未確立な以上、別問題として扱う。

## 何が決着させるか（`what_would_distinguish`）

- **T1 実請求書**: FROM JAPAN経由で日本郵便ルートを実際に発送した実請求書に¥2,800（またはそれに近い）の輸出通関手数料の行が現れるか。現れればR2を、現れず他名目でも計上が無ければR1を支持する。
- **T2 F26一次ソースの再読**: FROM JAPAN・Buyeeの一次ソースを「誰が・いつ課金されるか」の観点で再読し、見積り外で後日請求される旨の記述があるか確認する。本記録の時点では未実施——最も安価に実施できる次の一歩。
- **T3 申告額しきい値の再現**: 2026-09-13の計測が `declared_value_jpy_over: 200000` を実際に跨いでいたか確認し、跨いでいなければ跨ぐ申告額で再計測する。
- **T4 計算機の安定性の再現**: 同一条件で複数回・日を跨いで再計測し、¥0表示が安定して再現するか確認する。

## 検証

- `python3 master/validate.py` → スキーマ通過、実請求再現4件（うち独立1件）、**マスタと矛盾0件**。
- `python3 master/render-docs.py` → 生成節を書き戻し、`--check` も一致（差分なし）。
- `npx vitest run` → **916 passed (916)**（`main` の基準値と一致、退行なし）。`master-sync.test.ts` はF26の本記録を参照しておらず、反応なし。
