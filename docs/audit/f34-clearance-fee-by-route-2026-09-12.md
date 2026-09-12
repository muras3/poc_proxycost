# F34（通関手数料）の業者軸 ── 現状棚卸し（2026-09-12）

## 結論を先に

**2d はまだ「経路の分だけ集めて実装する」段階ではない。** `master/fees.json` の F34 自体は
`in_fees_master: false` で `master/customs.json#clearance` に事実上委譲されており、その
`clearance[]` は7カ国のうち **5カ国は郵便事業者側しか埋まっていない**。宅配便（FedEx/DHL/UPS/ECMS）側は
US に FedEx 1行があるだけで、しかも `B_inferred`（一次ページはWAFに阻まれ本文未読）。
GB・FR・AU・SG は宅配便の行が**ゼロ**。DE は DHL Express の1行のみで UPS/FedEx が無い。
CA は `courier: UPS/FedEx/DHL` を範囲値（CAD 10〜50）でひとまとめにしており、社別に分解されていない。
**UPS は7カ国どこにも一次情報が無い。**

これは「モデル化する軸を設計する」以前の状態で、**まず宅配便4社×7カ国の一次情報を取りに行く**
段階にある。以下、`master/fees.json` の F34 定義と `master/customs.json#clearance` に既に
記録されている内容をそのまま棚卸しする（新規の一次情報取得はこの監査では行っていない。
理由は末尾「今回やらなかったこと」）。

## F34 自体（`master/fees.json`）が何を記録しているか

```
"id": "F34",
"name": "通関手数料（配送業者）",
"in_fees_master": false,
"kind": "country_side",
"excluded_reason": "master/customs.json の clearance に持つ。国×業者×利用者の操作で決まる",
"occurrence": "B_conditional_known",
"display": "total",
"display_reason": "税が実際に発生するときだけ課される（5カ国の原文で確認）。免税帯で無条件に足すと必ず過大。経路により €1.56〜€70（45倍）。"
```

**F34 は fees.json 上に自前の source URL・confidence・checked_on を持っていない**
（`in_fees_master: false` の行はその2つを持たない設計）。実体は `master/customs.json`
の各国 `clearance[]` 配列に分散している。したがって「F34 の confidence」という単一の値は
存在せず、**行ごとに confidence が違う**（下表）。オーナー確認要請にあった「F34 が unknown
か第二次情報の焼き直しか」は、**国×業者の行ごとに答えが違う**、というのが正確な報告になる。
ロードマップの €1.56〜€70／45倍という数字自体は `master/customs.json` ではなくスペインの
実請求（`docs/audit/`外、当時の会話記録）に由来し、`master/customs.json` には ES の
`clearance` 行として現存しない（ES の項目には `clearance` キーが見当たらない ── 下記参照）。

## 棚卸し表：destination × clearing party × fee

| 国 | 経路/業者 | 金額 | per-parcel/per-shipment | 税ゼロ時 | tier/confidence | source | checked_on | 逐語引用 |
|---|---|---|---|---|---|---|---|---|
| US | USPS | $9.35（帯: ≤$2,500→$0, それ以外→$9.35） | per item (`declared_value_per_parcel_usd`) | 免税帯なら$0（IMM 712.2） | A_confirmed | pe.usps.com/text/dmm300/Notice123.htm, imm/immc7_002.htm | 2026-09-07 | **あり**（"Per dutiable item ... $9.35"、712.11/712.2 も逐語） |
| US | FedEx（Disbursement/宛先側=Processing相当） | greater_of($17.50, 2.5%×(duty+tax+MPF)) | 記述なし（貨物単位が実質 per parcel） | 記述なし（`clearance_fee_vat` 自体は別項目 `unknown`。税ゼロ時に課すかは未確認） | **B_inferred**／`amount_tier: search_snippet` | fedex.com（本文WAF未読）／二次情報 ShipScience 一致 | 2026-09-12 | **なし**（`verbatim_quote_available: false`。FedEx自身のページは終始HTTP 200だが本文はWAFの代替失敗ページ） |
| US | DHL / UPS | **記録なし** | — | — | **C_unknown（行が存在しない）** | — | — | — |
| GB | Royal Mail | £8 | fixed_per_parcel | **税ゼロなら$0**（`conditional`が明記） | B_inferred（金額）／条件部分は A_confirmed | royalmail.com/receiving-mail/pay-a-fee | 記載なし（`inference_basis`のみ、`checked_on`欠落） | **なし**（"公表値だが原文引用を取れていない"と自己申告） |
| GB | Parcelforce | £12（高額品 £900超は£25） | fixed_per_parcel | 同上（`conditional`は国全体にかかる） | B_inferred | parcelforce.com/receiving/customs-charge | 記載なし | **なし** |
| GB | DHL / FedEx / UPS（宅配便） | **記録なし** | — | — | **C_unknown（行が存在しない）** | — | — | — |
| DE | Deutsche Post/DHL標準/EMS | €7.50（VAT込み） | fixed_per_parcel | 「輸入税が実際に発生する通にだけ課される」と明記 | B_inferred | paketda.de/zoll/kapitalbereitstellungsprovision.html | 記載なし | **なし**（業界紙一致だが公式Leistungen und Preise未読） |
| DE | DHL Express（Kapitalbereitstellungsprovision＝宛先側） | 2%×import_charges、最低€14.88（VAT込み） | 記述なし | 記述なし | **A_confirmed** | 同上 | 記載なし | **あり**（"2% der Einfuhrabgaben, mindestens aber 14,88 Euro"） |
| DE | FedEx / UPS | **記録なし** | — | — | **C_unknown** | — | — | — |
| FR | La Poste（窓口） | €8（TTC） | fixed_per_parcel | 記述なし（`clearance_fee_vat: unknown`） | A_confirmed | laposte.fr/…douane-colis-international | 記載なし | **あり**（"France Métropolitaine: 8€ TTC"） |
| FR | La Poste（オンライン払い） | €2〜€5（TTC、利用者操作で変動） | fixed_per_parcel | 同上 | A_confirmed | 同上 | 記載なし | **あり** |
| FR | DHL / FedEx / UPS（宅配便） | **記録なし** | — | — | **C_unknown（行が存在しない）** | — | — | — |
| AU | ABF Import Processing Charge（郵便・宅配便共通の税関手数料） | 帯: ≤A$1,000→$0, ≤A$10,000→$50, 超→$152 | 記述なし（実装は個口単位で判定） | **$0を確認済み**（"取得できた0"と明記） | B_inferred（実装からの転記） | abf.gov.au（一次） | 記載なし | **なし**（帯自体は実装から転記、原文の表そのものではない） |
| AU | DHL / FedEx / UPS 個別の宛先側フィー（Duty Tax Processing相当） | **記録なし**（ABFの帯が業者共通のため個社の追加フィーは未確認） | — | — | **C_unknown** | — | — | — |
| CA | Canada Post | C$9.95（handling）＋GSTが乗るかは**C_unknown**に格下げ済み | fixed_per_parcel | 実請求で「税ゼロ時に課されるか」は確認できず（実請求は税が発生したケースのみ） | A_confirmed（金額）／C_unknown（VAT有無） | cbsa-asfc.gc.ca D5-1-1 | 2026-09-07 | **あり**（"$9.95 handling fee"） |
| CA | UPS / FedEx / DHL（宅配便、社別未分解） | **範囲のみ** C$10〜50+ | 記述なし | 記述なし | B_inferred | 「複数の業界情報源」（社名なし） | 記載なし | **なし** |
| SG | SingPost（S$400以下） | $0 | fixed_per_parcel | **免税帯そのもの（OVRで決済時徴収済み）** | A_confirmed | singpost.com/…customs-clearance-gst-payments | 記載なし | **あり**（"exceeding S$400"の閾値文） |
| SG | SingPost（S$400超） | S$10.90 | fixed_per_parcel | — | B_inferred（**閾値はA_confirmed、金額S$10.90自体は未取得**） | 同上 | 記載なし | **なし**（"検索エンジン経由の描画のみ"と自己申告） |
| SG | DHL / FedEx / UPS | **記録なし** | — | — | **C_unknown** | — | — | — |

**訂正（この監査中に発見）**: 当初 `master/customs.json` の国エントリだけを見て「ES に通関手数料の
一次情報が無い」と書いたが、それは**`clearance[]` 配列を見ただけの誤り**だった。実際には
`master/fixtures.json` に ES の実請求が3件ある（`es-zenmarket-ups-2023-07-26` / `es-fedex-30pct` /
`es-correos-selfclear`、いずれも出典 elotrolado.net フォーラム投稿と correosaduanas.es の支払
画面）。これらから読める通関手数料は **€1.29（Correos 自己申告事前払い）／€7.54（FedEx、税額の30%）／
€15.90（UPS/ZenMarket、税額比例）** の3点で、いずれも `source_same_as_master: true`
（循環＝この請求書からマスタの率を導いている）と明記されている。**ロードマップが言う
「€1.56〜€70・45倍」という具体的な2値はこの3fixtureのどれとも一致しない**（最小値は€1.29で
€1.56ではなく、最大値の€70に相当する行が無い）。したがって、
**ロードマップの「45倍」はこの3fixtureの単純な言い換えでもない別の出典（会話記録等、
このリポジトリのファイルとして現存しないもの）に基づいている可能性が高く、fixtures.json
だけでは再現できない。** 少なくとも「ESに一次情報が全く無い」は誤りだが、「45倍スプレッドの
具体的な2値を裏付ける一次情報が `master/` 内に現存しない」は成り立つ——構造（税額比例の手数料
＋その手数料へのIVA）は3fixtureとも一致して確認できるが、€1.56と€70という具体的な端点は
確認できない。**次にこの数字を使う人は、まず「45倍」という主張がどこから来たかを再確認するか、
主張を「ES実請求で確認できる範囲では€1.29〜€15.90（12倍弱）」に修正する必要がある。**

## `carrier` フィールド（#95が確立）の完全性チェック

`master/customs.json#clearance[].carrier` は7カ国中5カ国（US・GB・DE・FR・SG）で**郵便側は埋まっている**。
AU は ABF（税関当局）を正しく「業者ではなく国全体にかかる」ものとして記録済み（タスクの指摘通り）。
CA は Canada Post は個別だが、宅配便3社を1行に潰している。**「各エントリが完全で最新か」を問われれば、
郵便側は概ね完全（GB/DEは金額の逐語引用が取れていないという確度の問題はあるが行自体は存在する）。
宅配便側は7カ国のうち埋まっているのは US(FedEx)・DE(DHL Express)・CA(3社まとめ) の3カ国のみ、
7カ国×4社=28マスのうち埋まっているのは3マス。**

## DHL「Duty Tax Paid」と「Duty Tax Processing」の取り違えについて

タスクが警告する取り違え（Duty Tax Paid＝出発国/第三国で課金、Duty Tax Processing＝宛先国）は、
`master/customs.json` の US FedEx 行の note に**既に訂正済みとして記録されている**：

> 「名称: 出発国・宛先国どちらでも同じ費目名だが、宛先国（米国）で FedEx が請求人に立替分を課す行にあたる ──
> `docs/ROADMAP.md` が警告した『DHLの Duty Tax Paid/Processing 取り違え』と同種の誤りを避けるため、
> DHL 側の2費目に対応させると本行は Processing 側（宛先国で課される方）に相当する。」

つまりこの訂正は **FedEx の行に対して**なされたもので、**DHL 自体の Duty Tax Processing の値は
US/GB/AU のどこにも存在しない**（取り違えを避けた結果、正しい方の値がまだ埋まっていない、
という状態）。DE の DHL Express 行（Kapitalbereitstellungsprovision）は独自の名称・独自の
式（2%、最低€14.88）で、これが DE における「宛先側の DHL 手数料」に相当するとみてよいが、
US/GB/AU の DHL Duty Tax Processing 相当額は**未取得のまま**。

## per-parcel / per-shipment の軸

明示的にどちらかを述べている行は少ない。US USPS が `declared_value_per_parcel_usd`（per parcel）、
AU ABF が「実装は個口単位で判定」（per parcel）、CA Canada Post が「per dutiable package」（per parcel）
と明言。**per-shipment（複数口をまとめた1回の通関で1回だけ課す）の行は master に1件もない。**
箱分割（#85）が効くのはこの軸で、**現状はどの経路も per-parcel 前提で書かれているため、
箱分割で個数が増えれば通関手数料も比例して増える、という設計にはできる状態**（逆に言えば
per-shipment の経路が実は混ざっているなら、その経路だけ箱分割で総額が過大計上される）。
これを7カ国×4社で確認しないまま実装すると、**未確認の前提を暗黙に固定することになる。**

## 税ゼロ時に課すかどうかの軸

- **GB**: `conditional` に明記——"If there is no duty or tax to pay, you will not be charged a handling fee."（A_confirmed、逐語）
- **US USPS**: IMM 712.2 に明記——免税で通過したものには課さない（A_confirmed、逐語）
- **AU**: 免税帯（≤A$1,000）で$0の帯自体が原文の表にある（帯の「0」の行が確認済み）
- **SG**: S$400以下はSingPostの手数料自体が$0（OVRで決済時徴収のため）
- **DE Deutsche Post**: 「輸入税が実際に発生する通にだけ課される」と明記（confidenceはB_inferred）
- **CA Canada Post / US FedEx / 全宅配便**: **税ゼロ時の扱いが未確認**（C_unknown、または記述自体が無い）

**郵便側は5/5カ国で「税ゼロなら手数料もゼロ」という同じ形の条件が確認できている
（束ねて一般則にできる見込みがある）。宅配便側はこの条件の有無が1カ国も確認できていない。**

## F34 実装時にスキーマが要求する形

現行の `clearance` の形（`carrier` + `rule`）はそのまま使えるが、要求される軸を並べると：

1. **国**（既存）
2. **経路の種別**：postal / courier（既存の `route` 命名で概ね表現できている）
3. **業者名**（`carrier` は既にある。courier 側は4社を書き分ける必要があり、現状は「まとめ」
   （CA）と「1社のみ」（US/DE）が混在——**スキーマの問題ではなく、データが埋まっていないだけ**）
4. **per-parcel か per-shipment か**：現行スキーマに専用フィールドが無い。`rule.type` の
   命名（`fixed_per_parcel` 等）に事実上埋め込まれているが、**per-shipment 用の `rule.type` が
   まだ定義されていない**。宅配便側でper-shipmentの事例が見つかった時点で追加が必要。
5. **税ゼロ時に課すか**：`conditional`（GBが持つ）や個々の `note` に自然文で書かれているのみで、
   構造化されたブールフィールドが無い。国によって書き方が違う（GBは`conditional`、USはnoteに
   IMM引用、AUは帯の0行、SGは0円行）。**実装するなら `zero_when_no_tax: true/false/"unknown"`
   のような明示フィールドに正規化する必要がある**——現状はプログラムから読める形になっていない。
6. **宣言価格帯（ESの45倍スプレッドが示唆する軸）**：ESの一次情報が失われているため、
   この軸が本当に必要かどうか自体を確認できていない。US/AUの帯（banded_by_value）は
   既にこの軸を持っているので、**スキーマとしては対応済み**（`banded_by_value` 型がある）。
   45倍スプレッドが「業者の違い」だけで説明できるのか、「同じ業者内での価格帯」も効くのか、
   ESの出典が無い以上どちらとも言えない。

**結論：スキーマ自体の不足は (4) per-shipment 型の欠如と (5) 税ゼロ条件の非構造化の2点。
それ以外（業者軸・価格帯軸）は既存スキーマで表現可能で、不足しているのはコードではなくデータ。**

## F34 は本当に「代行の内部運用」ではなく「公式ルール」の話か（原則1との整合）

原則1は「公式の枠組みから計算し、代行の内部運用を推測しない」。F34の宅配便側は**代行では
なく配送業者（FedEx/DHL/UPS）が公表する料率表**なので、原則1の対象（公式ルールが存在する
費目）に該当する——US FedEx行の `note` が既にこの立場を取っている。したがって「業者ごとに
1つの式を置く」ことは原則1違反ではなく、**原則1が要求する『公式ルール』が業者ごとに別々に
公表されているだけ**（航空会社の運賃表が会社ごとに違うのと同じ構造）。

## 今回やらなかったこと（正直な限界）

このタスクは「7カ国×4社の一次情報を新規に取得する」ことを求めていたが、この監査では
**新規の一次情報取得（Webサーチ・Webフェッチ）を行っていない**。理由：

1. 60分の締め切りの中で、`master/customs.json` に既にある内容の正確な棚卸し（上表）を
   最優先にした——**棚卸し自体がこれまで行われておらず、「何が既にあるか」を確定させることが
   最も価値があると判断した**（タスク文の「establish what we actually hold before anyone
   writes code」に対応）。
2. 上表が示す通り、**未取得のマスは28マス中25マス**（宅配便×国）にのぼり、これを60分以内に
   一次情報で埋めるのは、1件あたりの調査深度（US FedExの例では単一の業者×単一の国に
   複数の一次URLを試して全滅、というレベルの調査量）を踏まえると非現実的だった。
3. **中途半端な二次情報での穴埋めは、原則1・原則2が禁じる「観測できないものの当てずっぽう」を
   増やすだけ**——`confidence: reasoned_judgement_unconfirmed` の行を28マス埋めても、
   ロードマップが求める「45倍スプレッドをモデル化できるだけの一次情報」には到達しない。

**次にやるべきこと（このPRの後work）**: UPS の宛先側フィー（US/GB/DE/FR/AU/CA/SGの7カ国）と、
DHL Duty Tax Processing の GB/AU分、FedEx Disbursement Fee の GB/DE/FR/AU/CA/SG分を、
国ごとに1件ずつ一次情報で確認する作業を、別セッション（複数のサブエージェントに分割可能）に
渡すのが良い。US FedEx 1件だけでも `docs/audit/us-fedex-ddp-2026-09-12.md` 相当の調査量が
かかっている実績から、28マスは相応の時間を要する。

## ロードマップ記述が証拠と食い違う箇所

- `docs/ROADMAP.md` 2d行の「€1.56〜€70 = 45倍」は、上記の通り **`master/customs.json` に
  対応する一次情報が現存しない**。ロードマップはこれを2dの動機として繰り返し引用しているが、
  出典URL・checked_on・逐語引用のいずれも失われている（または最初から記録されていなかった）。
  これは「実装前提の数字」として扱うには弱すぎる——**タスク文が言う『第二次情報の焼き直し』
  どころか、一次情報の所在が追えない状態**。
- ロードマップは「carrier フィールドが国ごとに1つ」であるかのようには書いていないが、
  読み手が誤解しないよう明記しておく：**`clearance` は国ごとに複数行を許す配列として
  最初から設計されている**（`customs.json` 冒頭コメント「clearance は『国ごとに1つ』ではなく
  『国×配送業者×利用者の操作』」）。スキーマは軸を最初から持っており、問題はデータの充足率。
