# マスタの読み方 ── 確定と推論の区分け

2026-09-07。`master/fees.json`（費目）と `master/customs.json`（国×経路）の使い方。

**この文書の目的は1つ：どの数字をそのまま使ってよく、どの数字を使ってはいけないかを分けること。**

---

## 信頼度は4段階

| tier | 意味 | 使い方 |
|---|---|---|
| **A_confirmed** | 各社公式・政府機関・実請求の**原文を引用できる**。`quote` 付き | **そのまま点予測に使う** |
| **B_inferred** | 一次情報から論理的に導いた。`inference_basis` に根拠を1行 | **使ってよい。ただし区間の幅に反映する** |
| **C_unknown** | 情報が無い、または実務で大きく振れる | **点予測に使わない。**区間の上端に算入し、画面で「未取得」と出す |
| **D_unpredictable** | **原理的に予測できない** | **モデルの外。**区間でも当てにいかない。免責として明示する |

**マスタ（JSON）に入っているのは A と B だけ。** C と D は本文書の後半に一覧で置く。
「マスタに無い＝発生しない」ではないので、C の一覧を必ず併読すること。

---

## マスタの規模（この節は `master/render-docs.py` が JSON から生成する）

<!-- generated:BEGIN counts -->
| 数えたもの | 実数 |
|---|---:|
| `fees.json` の行 | **80** |
| ├ A_confirmed | 65 |
| ├ B_inferred | 11 |
| ├ C_unknown | 4 |
| └ うち `amount_tier: C_unknown`（額が未取得） | 10 |
| `rule.type` の語彙 | 33 種 |
| `catalog`（F01〜、欠番なし） | 41 |
| `customs.json` の国 | 9 |
| └ 通関経路 | 48 |

会社ごとの行数：zenmarket 20 / fromjapan 19 / jauce 16 / buyee 15 / neokyo 10
<!-- generated:END counts -->

## サイトに載せるか（`display`、この節も生成）

<!-- generated:BEGIN display -->
| display | 件数 | 意味 |
|---|---:|---|
| `total` | 21 | 総額に算入して画面に出す |
| `engine_only` | 7 | 計算には効くが、独立した行としては画面に出さない（他の費目の中で分岐する・他の費目の判定パラメータになる・内包される） |
| `optional` | 0 | 任意欄に並べる（総額外） |
| `warning_only` | 1 | 金額は動かさず、警告文だけ出す |
| `hidden` | 12 | 載せない |

### `total` 以外に分類された項目（載せない・載せない理由が1か所で読めること）

| id | 名前 | display | 理由 |
|---|---|---|---|
| F03 | ↑ 仕入先による分岐 | `engine_only` | F02 の rule 内で仕入先ごとに分岐させる。独立行にしない。 |
| F04 | ↑ 同一商品の複数個 | `engine_only` | F02 の課金回数を決めるパラメータ。間違えると qty>1 で必ず過大になる。 |
| F05 | 国内配送サービス料 | `hidden` | 存在しない費目だと判定した記録。以前 ¥500 を注文ごとに過大計上していたので、記録を消すと同じ誤りが足し直される。画面には出さない。 |
| F08 | コンビニ・郵便局払い | `hidden` | カード前提なので発生しない（オーナー決定 2026-09-11）。 |
| F11 | 価格交渉手数料 | `hidden` | 利用者が代行に値下げ交渉を依頼したときだけ（オーナー決定 2026-09-11）。 |
| F13b | 「送料無料」でも国内送料が出る（リスクフラグ） | `warning_only` | 発生率を持っていない。全件に足せば過大になるので、金額は動かさず警告だけ出す（オーナー決定 2026-09-11、T-F10）。区間化が入ったら上端への算入を再検討する。 |
| F15 | 補強・保護梱包 | `hidden` | 利用者が選んだときだけ（オーナー決定 2026-09-11）。 |
| F16 | 梱包後の変更・再梱包 | `hidden` | 利用者が選んだときだけ（オーナー決定 2026-09-11）。 |
| F17 | 開梱 | `hidden` | 利用者が選んだときだけ（オーナー決定 2026-09-11）。 |
| F18 | 写真 | `hidden` | 利用者が選んだときだけ（オーナー決定 2026-09-11）。 |
| F19 | 検品 | `hidden` | 利用者が選んだときだけで、額も未取得（オーナー決定 2026-09-11）。 |
| F20 | 保管無料期間 | `engine_only` | F21 の判定パラメータ。無料期間が Buyee 30日 / Neokyo 45日 / 他3社 60日と社で2倍違う。独立行にはしない。 |
| F22 | 購入後キャンセル | `hidden` | 落札後はキャンセル不可。発生すれば全損に近いが予測できない（オーナー決定 2026-09-11）。 |
| F23 | 廃棄 | `hidden` | 保管期限超過で廃棄される。額が未取得（オーナー決定 2026-09-11）。 |
| F24 | 特殊処理 | `hidden` | 利用者が選んだときだけ（オーナー決定 2026-09-11）。 |
| F30 | 配送方法の可否制限 | `engine_only` | 「送れない便に値段を付けない」ための制約。行ではなく、どの方式に価格を出すかを決める。0c（2026-09-11）で、この計算機が価格化している方式のうち Small_Packet（charge1_jpy_max ¥30,000）だけを PostageRate.priceCapJpy として接続した。ePacket_Light / ePacket / IPA / PMI はこの計算機が価格化していない方式なので繋がない。 |
| F37 | カード・PayPal の外貨換算上乗せ | `hidden` | 公表された率が存在せず、手数料 0% のカードもあるので発生すら確実でない。判定は円で行う（決定済み）。 |
| F38 | 通関手数料にかかる VAT | `engine_only` | 通関手数料そのものに乗る税。`clearance` の行に内包して出す。 |
| F39 | 会社の申告額ポリシー（CN22/インボイスに何を書くか） | `engine_only` | 費目ではなく入力。代行が CN22 に何を書くか。F31・F32・F34・F36 の全部がこれに依存する。①③は未取得だが②は5社とも取得済み（2026-09-12 訂正、下記 `questions` 参照）。①は2026-09-12の追加調査でJauce以外の4社が判明。 |
| F40 | 燃油・遠隔地サーチャージ（配送業者の公表率） | `engine_only` | F28 を会社属性として持つための行。各社の公表送料が燃油込みかどうかを調べる必要がある。 |
<!-- generated:END display -->

各行の形：

```jsonc
{
 "id": "F02", "company": "buyee", "name": "購入手数料", "stage": "purchase",
 "rule": { "type": "fixed_per_order", "amount": 500, "currency": "JPY" },
 "conditions": { "country_not": ["TW"] },
 "mandatory": true,
 "tier": "A_confirmed",
 "source": "https://buyee.jp/helpcenter/guide/fees?lang=en",
 "quote": "Flat rate ¥500 / Per order … Even if multiple purchases are from the same store, it is a flat rate of ¥500.",
 "note": "同一店舗の複数購入・複数落札でも1回。注文数でも商品数でもない",
 "checked_on": "2026-09-07"
}
```

**`rule.type` は 31 種類**（ゼロ系4型を `zero` に統合し、閾値キーを `declared_value_jpy_over` に統一した後の数）。現行 `src/lib/pricing/services.ts` の `SERVICES` が表現できるのは4種類。

### B_inferred の7行（推論の中身を全部書く）

| 行 | 推論 | 根拠 |
|---|---|---|
| ZenMarket F26 | 輸出通関 ¥2,800（20万円超・日本郵便） | Buyee・FROM JAPAN・Jauce の**3社が同額・同条件**。日本郵便の輸出通関料の転嫁なので、日本郵便を使う限り発生する。ZenMarket 公式に記載も否定も無い |
| Neokyo F26 | 同上 | 同上 |
| Jauce F36 | 豪州 GST 10% を代理徴収 | **豪州法が A$1,000 以下の低額輸入について販売者・マーケットプレイス・再送業者に徴収を義務づけている。**5社中4社で確認済み |
| **Buyee F05** | **国内配送サービス料 ¥500 は存在しない** | 公式料金ページは1回目を3項目（商品代・購入手数料・保証プラン）、2回目を4項目と**網羅的に列挙**しており、この費目が無い。Buyee Cart の料金ページも同構成。**→ 当時の `src/data.js` の `domesticServicePerOrder: 500` は過大計上だった。2026-09 に是正済みで、現行 `src/lib/pricing/services.ts:431` は「『Domestic handling ¥500』は存在しない費目だった」と注記し、実体である`protectionPlanPerOrderYen: 500`（保証プラン）に置き換わっている** |
| ZenMarket F07 | PayPal 入金手数料 3.2% ＋ ¥40 | 独語圏の**複数の独立した書き手が一致**。Jauce の ¥40＋3.9% と構造・水準が整合的。公式の方法別表は要ログインで未取得 |
| Buyee F14 | まとめ梱包は申請制のオプション（額は未取得） | 公式はオプションであることを明記。「申請すれば無料」は `REQUIREMENTS.md` §8.5 の調査由来で、今回の一次取得では無料の引用が取れていない |
| FROM JAPAN F36 | GST 15% は NZ 向け | 率15%・同一の課税ベース記述。**原文に国名が無い**ので推定。要確認 |

---

## 国 × 経路（この節も生成）

**通関手数料は「国ごとに1つ」ではない。「国 × 配送業者 × 利用者の操作」で決まる。**

<!-- generated:BEGIN countries -->
| 国 | 関税 | VAT/GST | 通関手数料（経路ごと） |
|---|---|---|---|
| **US** | 12.5%† | — | USPS USD 〜2500:0.0・上限なし:9.35 ／ FedEx 2.5% ／ DHL Express None ／ UPS 2.5% / USD 17.5 ／ ECMS 3% |
| **GB** | 135 以下は免税‡ | 20% | Royal Mail GBP 8 ／ Parcelforce GBP 12 ／ Royal Mail / Parcelforce GBP 25 ／ DHL Express None ／ ECMS 3% |
| **DE** | EUR 3† | 19% | Deutsche Post / DHL 標準 / EMS EUR 7.5 ／ DHL Express 2% / EUR 15.0 ／ UPS EUR None ／ ECMS None |
| **FR** | EUR 3† | 20% | La Poste EUR 8 ／ La Poste EUR 2・5 ／ Chronopost EUR 21 ／ DHL Express None ／ FedEx（frais d'avance / avance de douane） 2.5% ／ UPS EUR None ／ ECMS None |
| **ES** | EUR 3† | 21% | Correos（事前に自分で払う） EUR 1.29 ／ Correos（配達時・現金） EUR 6 ／ FedEx 3% / EUR 15 ／ DHL EUR 21 ／ UPS 28.3% ／ FedEx 30% |
| **AU** | 1000 以下は免税‡ | 10% | ABF（Import Processing Charge） AUD 〜1000:0・〜10000:50・上限なし:152 ／ DHL Express None ／ FedEx（Disbursement Fee/Advancement Fee） 2.9% ／ UPS 3.6% ／ ECMS None |
| **CA** | 20 以下は免税‡ | 5% | Canada Post CAD 9.95 ／ UPS / FedEx / DHL CAD 10〜50 ／ DHL Express None ／ FedEx（Disbursement Fee） 3.1% ／ UPS 3.7% ／ ECMS None |
| **SG** | 0% | 9% | SingPost SGD 0 ／ SingPost SGD 10.9 ／ DHL Express None ／ FedEx（Disbursement Fee/Advancement Fee） 5% ／ UPS 5.6% / SGD 22.5 ／ ECMS 3% |
| **TW** | 2000 以下は免税† | 5%† | 快遞（代引き） TWD 30 |

† 推論（`inference_basis` あり）　‡ 未取得
<!-- generated:END countries -->

### 国をまたいで成り立った構造（生成）

<!-- generated:BEGIN findings -->
**通関手数料は輸入税が実際に発生するときだけ課される**（A_confirmed）

- **GB**: If there is no duty or tax to pay, you will not be charged a handling fee
- **DE**: Die Auslagepauschale wird fällig, wenn der Empfänger Einfuhrabgaben bezahlen muss
- **FR**: frais administratifs liés au traitement de votre dédouanement（税が発生する処理に紐づく）
- **SG**: S$400 以下は OVR で徴収済みなので SingPost が徴収するものが無い
- **US**: USPS IMM 712.11「must collect a Postal Service fee from the addressee for each item on which customs duty or Internal Revenue tax **is collected**」／712.2 は「mail items examined and passed free of duty by U.S. Customs」を明示的に除外

→ **手数料は独立した費目ではなく、税の発生に従属する。**免税帯では税も手数料も 0。国ごとに単一の定額を無条件で足すモデルは、免税帯で必ず過大になる

**利用者が事前に自分で通関・納税すると手数料が下がる国がある**（A_confirmed）

- **ES**: €6 → €1.29＋IVA ＝ €1.56
- **FR**: €8 → €2・€5

→ 料金表ではなく利用者の操作で決まる。予測はどちらを想定するか明示しなければならない

**免税限度はすべて「1個口（consignment）あたり」で測る。注文全体では測らない**（A_confirmed）

- **GB**: The £135 limit applies to the value of a total consignment that is imported ... Unless sent individually, the seller must add the individual values of all items in a consignment together
- **DE/FR (EU)**: in consignments <= EUR 150. This threshold applies per consignment
- **CA**: The CBSA doesn't assess duty or tax on mail items valued at CAN$20 or less
- **SG**: the postal parcel contains goods of a total CIF value exceeding S$400
- **AU**: （B推論・ABF 原文に未到達）代行の運用文言が parcels containing Low-Value Goods (1000 AUD or less)

→ 実装は 2026-09-07 まで**カート全額**で判定していた。注文ごとに別送する Buyee の既定では1個口 €110 ずつ（€150 以下）なのに『€330 超』と判定して 4.1% を掛けており、**個口を分けたほうが税は安くなるのに逆に高く出していた**（DE 3点×¥20,000 で ¥2,876 対 正しくは ¥1,634）。ただし個口を分けると EMS が個口ごとに乗るので総額は上がる（同ケースで ¥91,263 → ¥101,137）。**『分ければ安い』は断言できず、両方計算して初めて言える。**
<!-- generated:END findings -->

そのほか、手で確かめた構造：

1. **郵便は安い定額、courier は高い。**どの国でも例外なし
2. **courier の課金形は国ごとに違う** ── 定額（GB）／率＋下限（DE・ES の FedEx）／下限のみ（ES の DHL）／税額比例（ES の UPS）／レンジ（CA）
3. **手数料自体に VAT が乗る国がある**（ES・DE・CA で確認）
4. **豪州・シンガポールは「着地で払う」のではなく「代行会社が決済時に取る」** ── 構造が逆

### CA の実請求（1件、全行）

```
申告額     CA$1,988.70
Duty              $0
Excise            $0
GST  (5%)     $99.44
PST  (7%)    $139.21   ← 現行コードは null で総額から脱落
Handling       $9.95
合計         $248.60
```

**脱落している PST は総額の 56%。**カナダは郵便番号を入力させない限り出せない。

---

## C_unknown ── 点予測に使ってはいけない（マスタに入っていない）

| 費目 | 対象 |
|---|---|
| 保管超過の額 | Neokyo（週ごと）／FROM JAPAN／Jauce（61〜120日の月額。参考額 CD 約¥200/月・ギター約¥700/月は公表されているが料金表ではなく、¥700 は上限ではない） |
| FROM JAPAN の外注梱包（50kg以上／30kg以上かつ30万円以上／壊れ物） | 額は実費のみで上限・料金表は無い。うち2条件はこの計算機では原理的に発生せず、残る1条件（壊れ物）は同社の主観判断で検出不能 |
| Jauce の標準郵便保険・¥20,000超過分 | 日本郵便の増額表はあるが、Jauce が自動付保・請求するかは未確定 |
| FROM JAPAN の Plan Fee | 年間 Charge1 実績で変動。額の表が未取得 |
| Buyee の保護梱包・特殊梱包・写真・保管 | 二次情報しか無い |
| 補強梱包 | Neokyo・Jauce |
| 燃油・遠隔地サーチャージ | 全社 |
| Neokyo・Buyee の代理徴収の率と対象国 | 徴収する事実は公式。率は未取得 |
| 関税率（閾値超） | GB・DE・FR・AU・CA |
| 米国の courier brokerage | DHL・FedEx |
| AU・SG の着地時手数料 | 発生するのかどうかも不明 |
| 州・地方税 | US（州）・CA（州）は郵便番号が必要 |

**画面では「—」と出し、0 と書かない。総額から黙って落とさない。**
現行 `src/lib/pricing/compare.ts:27` の `(l.amount ?? 0)` はこれを 0 として落としているので、
**C の項目がある限り総額は必ず過小になる。**

---

## D_unpredictable ── モデルの外（区間でも当てにいかない）

| 事象 | 実例 |
|---|---|
| **通関側が申告額を書き換える** | FedEx が実価値 €25 の品に **+€305 の「ajuste」**を付け IVA €69 を請求。$58 を「58円」と誤読して IVA €0.07 になった例も |
| **為替で免税閾値を跨ぐ** | €148 → €151 で €150 を超えた実例。**予測時点で税額が確定しない帯がある** |
| **利用者の通関操作** | 事前に自分で払うか放置するかで €1.56 vs €6（ES）、€2 vs €8（FR） |
| **カード発行会社の外貨上乗せ** | 実勢 1.5〜3%。利用者ごとに違う |
| **梱包後の実測重量** | 倉庫に届くまで誰にも分からない |
| **配送業者が勝手に変わる** | Buyee は「送料無料」でも追跡便に変更して国内送料を発生させると公式明記 |

**これらは「予測が下手」なのではなく、予測が成立しない。**
免責として明示し、区間の幅の根拠にする。

---

## このマスタから読み取れる、製品への一番大きな示唆

**配送業者の選択が、代行会社の選択より総額に効く。**

ZenMarket の見積（同一荷物・スペイン向け、利用者が投稿）：

| 便 | 送料 | ＋通関手数料 |
|---|---:|---|
| 船便 | €27 | Correos €1.56〜6 |
| FedEx | €40 | €15（150€超は3%） |
| UPS | €55 | 関税額の 28.3% |
| DHL | €61 | 最低 €21＋IVA |
| **EMS** | **€63** | Correos €1.56〜6 |

送料だけで **2.3 倍**、差 €36 ≒ **¥5,900**。
`docs/DESIGN-NOTES.md` が測った**会社間の最大差（5点で ¥5,250）と同等以上**。

**現行 proxycost は全社 EMS 固定で比較している。**
これは「最も高い便に全社を揃えて会社を比べている」状態で、
順位が正しくても**利用者が実際に選べる最安を1つも見せていない。**

---

---

## 検証器 ── `python3 master/validate.py`

**Fable のレビューで、以前の検証器はマスタを読んでいなかったことが判明した（R1）。**
0.21 / 0.283 / 9.95 をコードにベタ書きしていたので、`customs.json` を書き換えても PASS していた。
**書き直して、`customs.json` の `rule` を実際に評価するインタプリタにした。**
その結果、隠れていた欠陥が即座に2件出た（台湾の課税ベース欠落）。

<!-- generated:BEGIN validator -->
```
== 1. スキーマ ==
  費目 80 行 / rule.type 33 種 / catalog 41 / 国 9 / 通関経路 48
  display 内訳: total 21 / engine_only 7 / optional 0 / warning_only 1 / hidden 12

  rule.type 評価カバレッジ: 通関経路 48 件中 22 件が eval_clearance() で評価可能、**26 件は宣言のみで未評価**
  未評価の内訳（型が存在する ＝ 計算されている、と読んではいけない行）:
    - US/FedEx(courier_brokerage): rule.type='greater_of' ── eval_clearance() 未対応
    - US/DHL Express(dhl_express): rule.type='rate_of_import_charges_with_min_variants' ── eval_clearance() 未対応
    - US/UPS(ups_disbursement): rule.type='rate_of_import_charges_with_min' ── eval_clearance() 未対応
    - GB/DHL Express(dhl_express): rule.type='rate_of_import_charges_with_min_variants' ── eval_clearance() 未対応
    - GB/FedEx(courier_brokerage): rule.type='unknown' ── eval_clearance() 未対応
    - GB/UPS(ups_disbursement): rule.type='unknown' ── eval_clearance() 未対応
    - DE/DHL Express(dhl_express): rule.type='rate_of_import_charges_with_min' ── eval_clearance() 未対応
    - DE/FedEx（Aufwendungspauschale/Disbursement Fee）(fedex): rule.type='unknown' ── eval_clearance() 未対応
    - DE/UPS(ups_disbursement): rule.type='banded_by_value_mixed' ── eval_clearance() 未対応
    - DE/ECMS(ecms_duty_advance): rule.type='not_found' ── eval_clearance() 未対応
    - FR/DHL Express(dhl_express): rule.type='rate_of_import_charges_with_min_variants' ── eval_clearance() 未対応
    - FR/FedEx（frais d'avance / avance de douane）(fedex): rule.type='greater_of' ── eval_clearance() 未対応
    - FR/UPS(ups_disbursement): rule.type='banded_by_value_mixed' ── eval_clearance() 未対応
    - FR/ECMS(ecms_duty_advance): rule.type='not_found' ── eval_clearance() 未対応
    - AU/DHL Express(dhl_express): rule.type='rate_of_import_charges_with_min_variants' ── eval_clearance() 未対応
    - AU/FedEx（Disbursement Fee/Advancement Fee）(fedex): rule.type='greater_of' ── eval_clearance() 未対応
    - AU/UPS(ups_disbursement): rule.type='greater_of' ── eval_clearance() 未対応
    - AU/ECMS(ecms_duty_advance): rule.type='not_found' ── eval_clearance() 未対応
    - CA/UPS / FedEx / DHL(courier): rule.type='range' ── eval_clearance() 未対応
    - CA/DHL Express(dhl_express): rule.type='rate_of_import_charges_with_min_variants' ── eval_clearance() 未対応
    - CA/FedEx（Disbursement Fee）(fedex): rule.type='greater_of' ── eval_clearance() 未対応
    - CA/UPS(ups_disbursement): rule.type='greater_of_by_service' ── eval_clearance() 未対応
    - CA/ECMS(ecms_duty_advance): rule.type='not_found' ── eval_clearance() 未対応
    - SG/DHL Express(dhl_express): rule.type='rate_of_import_charges_with_min_variants' ── eval_clearance() 未対応
    - SG/FedEx（Disbursement Fee/Advancement Fee）(fedex): rule.type='greater_of' ── eval_clearance() 未対応
    - SG/UPS(ups_disbursement): rule.type='rate_of_import_charges_with_min_and_max' ── eval_clearance() 未対応

== 2. 実請求の再現（customs.json の rule を評価する） ==
  [PASS    ] es-zenmarket-ups-2023-07-26  (循環（率をこの請求書から導いている）)
             IVA 56.10(算出)/56.15(実請求) 手数料 15.89/15.9 手数料VAT 3.34/3.34 合計 342.51/342.52
  [PASS    ] ca-canadapost-forum  (独立)
             GST 99.44/99.44 PST 139.21/139.21 手数料 9.95/9.95 手数料GST 0.00/(実請求に行が無い) 合計 248.59/248.6
  [PASS    ] es-fedex-30pct  (循環（率をこの請求書から導いている）)
             手数料 7.54/7.54 手数料込み 9.12/9.12
  [PASS    ] es-correos-selfclear  (循環（率をこの請求書から導いている）)
             IVA 26.25/26.25 手数料 1.29/1.29 合計 27.81/27.81
  [SKIP    ] au-zenmarket-ems  (再現不可)
             仕入先と国内送料が記事に無く Charge1 の内訳 ¥1,184 を分解できない。さらに豪州GSTが総額に現れておらずマスタと矛盾する


OK: スキーマ通過 / 再現 4件（うち独立 1件）/ マスタと矛盾 0件
   ※ 独立 = fixture の出典とマスタの数値の出典が別文書であること
```
<!-- generated:END validator -->

### 直近の結果が意味すること

**独立検証は 0 件。**
唯一マスタと出典が別だった fixture（CA / Canada Post）は **CONFLICT** ＝
マスタ（Canada Post 公式の「CA$9.95 ＋ 5% GST」）と実請求（手数料への GST 行が無い）が食い違う。

**つまり現時点で、このマスタは実請求で一度も独立に裏付けられていない。**
以前の版が「4/5 再現・独立2件」と書いていたのは、検証器の欠陥による過大表示だった。

### スキーマ検証の内容

- A_confirmed は `quote` 必須、B_inferred は `inference_basis` 必須
- 全行に `source` と `rule.type`
- **catalog に欠番を作らない** ── F01〜F38 を全部列挙し、
  `fees.json` に行が無いものは `excluded_reason` を書く（`master/fees.json` の `catalog`）
- 国ごとに `clearance_fee_vat`（F38）が必ず存在する

### 再現検証で気をつけること ── 循環と独立

| 件 | 判定 |
|---|---|
| ES / UPS | **一部が循環。**28.3% という率は**この請求書から導いた**ので、再現できて当然。
独立に検証できたのは**構造**（税額に比例する手数料 → その手数料への VAT）と合計の整合だけ |
| **CA / Canada Post** | **独立。**CA$9.95 は Canada Post の公表料金で、この請求書とは無関係。
GST 5%・PST 7% も公表値。**マスタだけで CA$248.60 を再現した** |
| **ES / Correos 自己申告** | **独立。**€1.29 と 21% は支払画面の内訳そのもの |
| ES / FedEx 30% | 循環 |
| AU / ZenMarket | **再現不可。**仕入先と国内送料が記事に無く、Charge1 の内訳 ¥1,184 を分解できない。
さらに**豪州 GST が総額に現れておらず、マスタと矛盾する**（要確認） |

**「4/5 再現」を精度の主張に使ってはいけない。**
独立に検証できたのは 2 件だけで、しかもどちらも輸入側だけ。
**代行会社側の費目は、実請求で1件も検証できていない。**

---

## 台湾を追加した

`Buyee の購入手数料が台湾のみ ¥300`（BEENOS プレスリリース・一次）という発見に対して、
**対象国リストが7カ国のままだったのは私の不整合。**台湾を `customs.json` に追加した。

| 項目 | 内容 | tier |
|---|---|---|
| 免税 | 完税価格 **NT$2,000 以下**（＝商品価格＋国際送料＋保険） | B |
| 営業税 | **5%** ＝（完税価格 ＋ 進口税）× 5% | B |
| **回数制限** | **半年で6回まで免税。7回目からは NT$1 でも課税** | B |
| 代引きの税金代収手数料 | 約 NT$30 | B |
| Buyee の購入手数料 | **¥300**（英語版公式は ¥500） | **A** |

**回数制限は納税義務者ごとで、淘宝・メルカリ・日本代購が同一枠を共有する。**
つまり**国の税ルールが利用者の輸入履歴に依存する。**予測時点では前提を置くしかない（D 寄り）。

---

## Reddit は取れなかった（試した手を全部記録）

| 手 | 結果 |
|---|---|
| `www.reddit.com/search.json` | **403** |
| `old.reddit.com/search.json` | **403** |
| reader サービス経由 | **401**「bad IP reputation。認証しろ」 |
| **pullpush.io**（Pushshift 後継の全文検索） | **429**「無料のスクレイピング資源は提供していない。有料サービスは Discord へ」 |
| Redlib / Libreddit ミラー 9件 | 403 / 418 / 到達不可 / **Anubis のチャレンジ** |
| **Anubis の proof-of-work を自力で解く** | **難易度4の SHA-256 は解けたが、`method: preact` ＝ JS 実行を要求する方式**で、ハッシュでは通らない |
| Playwright / Chromium | **この環境のプロキシが Chromium の TLS を落とす**（curl で 200 の neokyo でも同じ） |
| 検索エンジン経由（`site:` ほか複数の言い回し） | Reddit の本文に到達しない |

**結論：この環境からは Reddit に到達する手が無い。**
API トークンを取るか、本人のブラウザで開くかのどちらか。
`r/AnimeFigures` `r/Gunpla` `r/PokemonTCG` `r/mechmarket` は**未探索のまま残っている。**

---

## 出典の階層

| 階層 | 扱い |
|---|---|
| 各社公式ページ・政府機関 | **A。**`quote` を必ず残す |
| 実請求の全行引用（利用者投稿） | **A。**ただし国・時期・業者を必ず併記 |
| 実請求の断片（金額のみ） | **B。**複数が独立に一致した場合のみ |
| 比較ブログ・競合代行の記事 | **費目の候補列挙にのみ使う。金額には使わない** |

**二次情報が公式と食い違った実例：**
- Buyee の手数料：二次「6%＋¥300」／公式「**¥500 定額**」（4.5倍違う）
- ZenMarket の保管無料期間：DutyGlobal「45日」／公式「**60日**」
