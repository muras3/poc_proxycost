# 費目の確度センサス（2026-09-13）

**担当範囲**: 費目そのものの確度を数えること。コード変更・`master/` の変更は無し。測っただけ。

**結論を先に**: 母集合128件のうち、一次資料に基づき額が確定している (`tier: A_confirmed` かつ実額あり) のは114件（89%）。だがこれは「一次ページを読んだ」という意味でしかない。**実際の請求書と独立に突き合わせて確認できているのは128件中たった1件（0.8%）**——過去の「1項目説」は正しかった。宅配便4社中、自社の重量上限を一次資料で確認できているのは実質1.5社（DHLは明確、UPSは7カ国中5カ国のみ）で、FedExは全7カ国とも取得不能、ECMSは自社上限を公表していないと確認済み——これが「上限不明で総額が確定できない」の直接の原因になっている。**「精度が高い」と言うには根拠が足りない。実態は「一次資料は広く読んでいるが、独立検証はほぼ皆無」という状態。**

---

## 0. 事実確認: `confidence` / `invoice_check` はエンジンに届いていない

依頼にあった前提をコードで確認した。

```
$ grep -rn "invoice_check" src/
(該当なし)
$ grep -n "confidence" src/lib/pricing/types.ts
(該当なし)
```

- `Line`（`src/lib/pricing/types.ts`）が持つ確度の軸は `tier`（`fixed`/`estimate`/`unverified`/`none`）と `sourceUrl` のみ。
- `confidence`・`invoice_check`・`evidence_class` は `master/*.json`（`fees.json` / `customs.json` / `carrier-weight-limits.json` / `carrier-surcharges.json` / `courier-rates.json`）にのみ存在し、`src/` には1件も現れない。
- さらに `master/fees.json` 自身の `schema.tier` は `A_confirmed`/`B_inferred`/`C_unknown` という語彙で、`src` の `Tier`（`fixed`/`estimate`/`unverified`/`none`）とは**別の語彙**。両者の対応は自動生成ではなく、`src/lib/pricing/services.ts` 等の**手書きの値**をコメントで `master/fees.json` の行番号（F02等）に紐づけているだけで、機械的な同期は無い（一致は `master-sync.test.ts` が個別に検査）。

**したがって事実: 確度の軸は `master/` には（部分的に）在るが、エンジン（`src/`）には届いていない。** これは前提通りで、依頼の記述は正しい。

---

## 1. 母集合の確定: 「128」とは何か

`docs/ROADMAP.md:1257` に「`fees.json`・`customs.json` を合わせた128行」という記述があるが、その内訳を明記していなかった。コミット `d8158e5`（PR #117）のメッセージに **「80の fees.json 行と48の clearance ルートすべてに明示的に付けた」** とあり、これで内訳が特定できた。

```
fees.json.rows                         : 80件
customs.json.countries[*].clearance[*] : 48件（9か国分の通関/立替手数料ルート）
合計                                     : 128件
```

コードで検証済み（`python3` で `len(fees['rows'])==80`、`sum(len(c['clearance']) for c in customs['countries'])==48`）。

**注意点（重要な副産物）**: `customs.json` の国数は **9**（US, GB, DE, FR, ES, AU, CA, SG, TW）で、`src/lib/pricing/types.ts` の `CountryCode`（7か国: US/GB/DE/FR/AU/CA/SG）より **ES・TW の2か国分多い**。つまり128件のうち一部（ES・TWの計7件）は**現行のUIが対応する7か国の外**にある。この監査では以後、依頼通り「7か国」を主眼に置くが、**母集合128自体は9か国分**であることを明記する。この不一致自体、確度と別に「母集合の定義がそもそも揺れている」ことの証拠。

この監査で採用した数え方: **上記128件をそのまま母集合とする**（PR #117 の定義をそのまま踏襲、独自に絞り込んでいない）。

---

## 2. `master/` 側の確度分布（128件）

### 2-1. `tier`（`A_confirmed` / `B_inferred` / `C_unknown`、`master/fees.json` 語彙）

| ソース | A_confirmed | B_inferred | C_unknown | 合計 |
|---|---|---|---|---|
| fees.json（80件） | 65 | 11 | 4 | 80 |
| customs.json clearance（48件） | 25 | 16 | 7 | 48 |
| **合計（128件）** | **90（70%）** | **27（21%）** | **11（9%）** | **128** |

### 2-2. `invoice_check`（`master/` 全128件、依頼の§4センサス）

| 値 | fees.json | customs.json clearance | 合計 |
|---|---|---|---|
| `never_checked` | 78 | 44 | **122（95.3%）** |
| `confirmed_calculator` | 2 | 0 | **2（1.6%）** |
| `confirmed_independent` | 0 | 1 | **1（0.8%）** |
| `confirmed_circular` | 0 | 3 | **3（2.3%）** |
| `contradicted` | 0 | 0 | **0** |
| 合計 | 80 | 48 | 128 |

**「独立に実請求で確認できたのは1項目だけ」という過去の記録は正しい。** `confirmed_independent` は128件中ちょうど1件（`customs.json` の通関ルート側）。`confirmed_calculator`（会社自身の見積り計算機が再現、PR #117が新設した値）が2件、`confirmed_circular`（検証対象と同じ出典を使った請求書との一致＝独立確認ではない）が3件あるが、これらはいずれも「独立確認」ではない。**独立検証は128件中1件、0.8%。**

### 2-3. `confidence`（`direct_fetch`/`search_snippet`/`search_snippet_no_verbatim_quote`/`reasoned_judgement_unconfirmed`、依頼記載の語彙）

`fees.json` の行トップレベルに `confidence` フィールドを持つのは **80行中わずか3行**（インデックス12・13・14。値は `direct_fetch` が2件、`null` が1件）。残り77行はこのフィールド自体を持たない（`tier: A_confirmed/B_inferred` の語彙で確度を表現しており、`confidence` の4値語彙は別ファイル系統——`carrier-weight-limits.json`・`carrier-surcharges.json`・`courier-rates.json`・`customs.json` の一部——でのみ本格的に使われている）。`customs.json` の `clearance` 配列48件には `confidence` フィールドが**1件も無い**（48件とも `<absent>`）。

**結論**: 依頼が前提とした4値の `confidence` 語彙は、128件の母集合の大部分（125/128、97.7%）には付いていない。`tier`（A/B/C）の方が実質的な確度表現として機能している。**この不整合自体、確度データの管理が一箇所に統一されていないことを示す。**

---

## 3. 出典（`source`）の有無・一次/二次判定

`fees.json` 80行・`customs.json` clearance 48件、**全128件が `source` フィールドを持つ**（欠落0件）。ただし依頼は「一次資料か二次情報か」も問うている。ドメインで機械判定した結果（`fees.json` のみ。判定ロジック: 各社の公式ドメイン or 日本郵便公式ドメインを一次、それ以外を二次・要目視）:

| 分類 | 件数 |
|---|---|
| 一次（各社公式ドメイン・日本郵便公式） | 76 |
| 二次/非URL（親会社beenos.comの2019年プレスリリース1件、独語フォーラムteetalk.de 1件、`REQUIREMENTS.md` 自己参照2件） | 4 |
| 合計 | 80 |

`customs.json` clearance 48件は自動ドメイン判定を行っていない（各国の法域機関・運送会社サイトが多岐にわたり、機械的な一次/二次判定は**この監査では実施していない＝判定できない**、と明記する）。

---

## 4. 上限不明（`high === null`）を生む費目

`Row.total.high` が `null` になるのは、`amount === null` かつ `unknownCapYen` が置けない行が1件でも残っている場合（`types.ts` のコメントで確認）。`src/lib/pricing/*.ts` を検索したところ:

- `amountKind: 'unknown'` の**明示リテラルは0件**（`amount == null` のときのデフォルト推論に任せている）。
- `unknownCapYen:` を実際にセットしている箇所は `compare.ts` に1か所のみ（動的計算）。
- 母集合128件そのものではなく、**宅配便4社の重量上限データ**（`master/carrier-weight-limits.json`）が「上限不明」の主因であることが分かった（この軸は128件の集計に含まれない別ファイル。ただし依頼の「断定できない」の直接原因として最も強い証拠なので、事実として報告する）:

| 運送会社 | 状態（`evidence_class`） | 7か国中の内訳 |
|---|---|---|
| DHL Express | `declared`（自社ページに明記） | 7/7か国が判明。**拒否ではなく追加料金**（Overweight Piece Surcharge、ネットワーク上限は150lb/70kg超も1,000kg/300cmまで運べる） |
| UPS | 一部 `declared` | US/CA/AU/GB/SGは追加料金の一次資料あり、DE/FRも `declared`。ただし**SGはService Guideが「輸送として引き受けない」と明記**——追加料金と拒否が国で割れている |
| FedEx | `input_rejected` | **7/7か国とも取得不能**（公式ページがHTTP 200のWAFフェイルオーバーページを返す）。事実上、FedExの重量上限は全世界で不明 |
| ECMS | `counted_absence` | 7/7か国とも「自社の上限を公表していないと確認」（Terms & Conditionsに数値の記載なし、"inherits" と断定する根拠も無い） |

**上限不明を直接生んでいるのは実質2社: FedEx（7か国全滅）とECMS（7か国全滅、ただし理由は「未取得」ではなく「非公表と確認済み」）。** DHLは既知、UPSは7カ国中5カ国は既知（2カ国はEUの`declared`が別途取得済みなので実質7/7判明だが、拒否/追加料金の扱いがSGだけ異なる）。**なお、この重量上限データ自体はコードに配線されていない**（`carrier-weight-limits.json` 冒頭の `$schema_note` が明記: 「本キーは一次情報収集のみで、`src/` 側の配線はスコープ外」）ため、現状の `high === null` は主に**未取得の費目（`amount: null` の行）そのもの**から生じており、重量上限の不明さは「将来さらに悪化しうる潜在リスク」として別枠で記録した。

---

## 5. `tier` 分布(`src/` エンジン内、`Line.tier` の実値)

`master/` の `A_confirmed`/`B_inferred` とは別軸として、実際に画面へ出る `Line.tier`（`fixed`/`estimate`/`unverified`/`none`）を `src/lib/pricing/*.ts`（テストファイル除く）の全リテラルで数えた。

| tier | 件数 |
|---|---|
| `fixed` | 68 |
| `estimate` | 33 |
| `unverified` | 1 |
| `none` | 1（`weights.ts` の重量フォールバック。費目の行ではない） |
| 合計（費目相当の行のリテラル） | 108 |

うち `SERVICES`（`src/lib/pricing/services.ts`、5社の費目定義本体）内訳（社ごと）:

| 社 | fixed | estimate | unverified | none | 小計 |
|---|---|---|---|---|---|
| neokyo | 6 | 7 | 0 | 0 | 13 |
| zenmarket | 10 | 7 | 0 | 0 | 17 |
| fromjapan | 8 | 6 | 0 | 0 | 14 |
| buyee | 11 | 3 | 0 | 0 | 14 |
| jauce | 7 | 0 | 1 | 0 | 8 |
| **合計** | **42** | **23** | **1** | **0** | **66** |

**注意**: これは `SERVICES` 配列内の費目行のみで、送料本体（`postage.ts`/`ems.ts`/`courier-clearance.ts`等）や通関系の行（`courier-clearance.ts` に17件の `fixed`、6件の `estimate` が別途存在）は含まない。**128件の `master/` センサスとはID単位で1対1に対応していない**（`master/fees.json` の1行が `src/` で複数のLineに展開されることがあるため）。国別（7か国）の内訳は `courier-clearance.ts`・`compare.ts`（税ライン）に分散しており、この監査の時間内では行単位まで分解しきれなかった——**「国別の完全な行内訳」は出せていない、と明記する**。

---

## 6. 「仮置きの8つ」対応表

`docs/ROADMAP.md:1260`以降の一覧（P1、オーナー暫定判断）を、対応する `master/` の記録場所と突き合わせた。

| # | 仮定の内容 | `master/` 記録場所 | 対応する `tier`/軸 |
|---|---|---|---|
| 1 | 燃油サーチャージは代行の表示価格に込み | `carrier-surcharges.json` `conclusions.fuel_surcharge_working_treatment`（C11） | working treatment（`tier`とは別の分類。額のLineとしては存在せず「加算しない」という判断そのもの） |
| 2 | 遠隔地サーチャージも同様に込み | `carrier-surcharges.json` `conclusions.remote_area_surcharge_working_treatment`（C12） | 同上 |
| 3 | 関税・税ゼロ時、宅配便の通関立替手数料は課されない | `carrier-surcharges.json` `conclusions.zero_duty_clearance_fee_working_treatment`（C13） | `amountKind: 'range'` の上端にのみ計上（`compare.ts`） |
| 4 | 通関/立替手数料の課金単位はshipment単位に統一 | `customs.json` 各carrier行の `unit`/`unit_basis` | 該当行は128件センサスの一部（clearance 48件に含まれる） |
| 5 | Air Waybill数え方（shop分割 vs 重量上限分割） | `customs.json` FedEx GB/DEの `unit_note` | 上記4と同じ範囲。src配線は無し |
| 6 | カード決済手数料は5社一律3.5% | `fees.json` `conclusions.F07_payment_fee_working_treatment` | `src/lib/pricing/compare.ts` に `tier: 'estimate'` 相当で実装（F07自体は`fees.json`行としては個社別に存在せず、working treatmentとして別枠） |
| 7 | 既定箱20×15×10cm・重量上限20kg | `courier-rates.json`（実測レンジ）、`carrier-weight-limits.json`（本監査§4） | Lineの`tier`には現れない前提（`DEFAULT_PARCEL_DIMENSIONS_CM`という定数） |
| 8 | 複数個口への申告額按分方法 | `fees.json` F39c（conclusions） | `src/lib/pricing/parcels.ts` に実装済みだが一次資料での裏付け無し。Lineの`tier`外の前提 |

**8件のうち、128件センサスの個々の行として直接対応するのは #4・#5・#6 の一部のみ**。#1・#2・#3・#7・#8は「working treatment（運用判断）」という第4のカテゴリで、`Tier`型にも`master/fees.json`の`tier`語彙にも収まらない——**これ自体、確度の分類体系がカバーしきれていない領域があることを示す**。

---

## 7. 結論（数字で）

母集合 **128件**（`fees.json` 80行 + `customs.json` clearance 48件、PR #117の定義通り）のうち:

- 一次資料に基づき発生が確認できている（`tier: A_confirmed`）: **90件（70.3%）**。ただしこれは「額そのものが一次資料で裏付けられている」ことは意味しない（`amount_tier: C_unknown` が別途10件ある）。
- 推論（`B_inferred`）: **27件（21.1%）**
- 未確定（`C_unknown`）: **11件（8.6%）**
- 実請求で**独立確認**（`confirmed_independent`）できているのは **1件（0.8%）**——過去の「1項目説」は正しかった。
- 会社の計算機での再現確認（`confirmed_calculator`、独立確認より弱い）が2件、循環確認（`confirmed_circular`、確認としての価値は無い）が3件。
- 未チェック（`never_checked`）: **122件（95.3%）**——「一次ページを読んだ」ことと「実際の請求と合っている」ことの差がここに表れている。
- 上限不明を生む直接要因: 宅配便4社中、FedEx（7/7か国で自社重量上限データ取得不能）とECMS（7/7か国で自社上限非公表と確認済み）の**2社**。DHLは既知、UPSは実質判明（SGのみ扱いが特殊）。
- `confidence`（4値語彙）は母集合128件のうち **125件（97.7%）に付いていない**——依頼前提の「エンジンに届いていない」だけでなく、**`master/` 内部でも付与が徹底されていない**。

**一言結論**: 「精度が高い」と言えるだけの根拠は無い。一次資料は広く当たっている（70%が`A_confirmed`）が、それは「公式ページを読んだ」という弱い意味でしかなく、**独立した実請求での裏付けは128件中1件**にとどまる。加えて `confidence`/`invoice_check` という確度の軸自体がエンジンにも`master/`内部にも一貫して配線されていないため、**利用者が画面で見る `tier: fixed` は「読んだ」以上の保証をしていない**。「穴だらけ」とまでは言い切れない（未計上=`none`は事実上ゼロで、未取得は`amount: null`として明示され0円で隠されてはいない）が、「精度が高い」という主張も、独立検証1件では支えられない。実態は**「広く読んでいるが、ほぼ検証していない」**。
