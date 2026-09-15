# 注意事項の網羅性監査 — 今のUI と Mock v2（2026-09-15）

対象: 今のUI = `src/components/compare/*`・`src/components/search/*`・`src/lib/ui/*`（main `dceaea6`）。Mock = `prototypes/mock-v2.html`（`prototypes/engine.js` = 同じ main の `compare()` を束ねたもの。engine.js を作った時点の main と `src/lib/pricing/` の最終コミット `72bae6b` が一致しているので作り直していない）。
本書は `docs/design/caveat-tiers.md`（48件）を出発点にしつつ、**コードから独立に数え直した**。結果は 82 件。tiers.md の48件に無かったものは「出どころ」列に `+新` を付けた。

判定の語彙:
- **出ている** … その条件で、開かずに画面に見える
- **開いた中** … 行を開く／§を押す／折り畳みを開くと見える
- **欠落** … Mock のどこにも無い（DOM に無い）
- **条件未発見** … エンジンを 15,621 条件＋特殊21籠で回しても発火しなかった（データ上は生き残っているコード）
- **再現不能** … Mock の入力手段では条件を作れない（コード読解で判定した）

「今のUI」列も同じ語彙で書く。

## 1. 探索の方法

### 1.1 エンジンの掃引（node、`prototypes/engine.js` を `vm` で読む）

7か国 × 13重量（200 g〜40 kg）× 13方式（cheapest／郵便4／宅配便8）× 1点・3点 × 4価格帯（¥3,000〜¥350,000／点）× カナダは州4通り × cheapest のときは重量の出どころ3通り（table／assumed／user）= **15,621 条件**。加えて特殊籠 21（酒の重量ライン `sake-720ml`・長物 `rod-2piece`・送料込み出品・壊れ物・50 kg・保管 0/60/100/130 日・価格が参考値・国内送料既知・店舗不明を混ぜた3点・免税線をまたぐ2個口 CA/AU/SG/GB・既定の例カート US／CA・EMS 15 kg×3・小形包装物 1.5 kg×2）。
判定は `Row`/`Line`/`CompareResult` の**構造化フィールドと文字列の両方**で行い、各注意事項が最初に発火した条件と発火回数を記録した。追加で 100 g 刻みの掃引（7か国 × 100 g〜21 kg × cheapest と宅配便11方式）を「単調性が崩れた区間」と「Surface の上限不明」のためだけに回した。

スクリプトの要点（リポジトリには置かない。スクラッチにある）:

```
const P = vm で engine.js を評価 → ProxyCost
for cc,w,m,cnt,price,prov,origin: res = P.compare({items, country, method, province})
  結果側: comparable 行の有無 / rankIndeterminate / rankStable / rankStabilityNote の分岐語 /
          weightSensitivity の decisive・onlyPriced・winner null / 方式の混在
  行側:   comparable・notComparableReason の12分岐 / excluded / total.high null・range /
          approximate / tied / recommended数 / equivalent / closedByAssumption /
          tag の "assumed"・"request" / surface / paysUs / outboundDirect / boxes[].reason・tax /
  費目側: tier / amount null かつ unknownCapYen の有無 / amountKind range / scope shared /
          note の中の仮定語（"paste the URL"・"20×15×10"・"not monotonic"・"capped at"・"floor"…）
```

### 1.2 Mock の確認（Playwright 1.63、`python3 -m http.server` で配信、1280×900 と 390 px 枠）

26 シナリオ（Mock の状態 11 種のうち再現に関わる 8 種 ＋ ⌘K で国を US/DE/GB/SG/AU に変えたもの ＋ 保管 90/130 日 ＋ 送料込みトグル ＋ 州 AB 選択 ＋ 重量を 25 kg・12 kg×5 に編集 ＋ 行を開いた状態 ＋ 390 px）。各シナリオで `#app` の可視テキスト、**全ての § を順に押した popover の本文**、行ごとの `!` の数・§ の数・バッジ・スタンプ・列の文字列、条件行（`.cond`/`.band`）を DOM から取った。
Mock で作れない入力: 重量ラインに当たる品（酒・長物）、壊れ物、価格未取得以外の `weightLineId`、国内送料の既知値以外の tier。これらは「再現不能」とし、Mock のコードを読んで判定した。

## 2. 結果表

列の意味: 出どころ = ファイル:行 またはフィールド。発火条件 = 掃引で最初に見つかった条件（`cc/重量/方式/点数/価格`）。

### 2.1 結果全体（CompareResult）

| # | 注意事項 | 出どころ | 発火条件 | 今のUI | Mock | 判定 | 根拠 |
|---|---|---|---|---|---|---|---|
| 1 | 比べられる行が無い（"No published rate covers this parcel for …"） | `compare.ts:2526-2537` `rankStabilityNote` | US/200 g/小形包装物(船便)/1点 など 6,947 条件。cheapest でも CA 25 kg・GB 40 kg | 出ている（StabilityNote） | 出ている（`.norank` "Can't compare" ＋ 各社の理由） | 出ている | Playwright S6・S15 の可視テキスト |
| 2 | 判定不能（"These N companies sit within the same uncertainty… X looks the most likely."） | `compare.ts:2242` `indeterminateNote`、`rankIndeterminate` | US/200 g/Buyee Air/3点 など 551 条件。EMS 12 kg×5 CA も | 出ている | 出ている（`.cond` "Could go either way — these N are within our error"） | 出ている。**ただし意味が変わる（§3-1）** | S5・S16 |
| 3 | 判定不能のとき「方式が効く」誘導 | `RankBoard.tsx:196-212` | 同上 | 出ている | 出ている（同じ `.cond` に "Shipping method moves the total…" と Change method） | 出ている | S5 |
| 4 | 判定不能のとき LEADS に弱める・バッジを消す・Summary の断定を消す | `RankBoard.tsx:60-63,176,311`・`Summary` | 同上 | 出ている | 出ている（スタンプ LEADS・バッジ無し・見出し "Can't tell who is cheapest"） | 出ている | S5 |
| 5 | 安定（"X stay(s) in the recommended range even if we are off by 3x on weight."） | `compare.ts:2540-2552` | US/200 g/cheapest/3点 など 5,426 条件 | 出ている | **開いた中**（要約行の § "How firm is this order"） | 開いた中 | S4・S10・S12 の popover |
| 6 | 安定だが3倍で表を出る（"Beyond that, no priced rate covers the parcel for …"） | `compare.ts:2546-2551` | 同上 1,752 条件 | 出ている | 開いた中（同じ §） | 開いた中 | S1 popover 末尾（切れている） |
| 7 | 不安定（"The recommended range changes with the weight: at a third of…; at three times…"） | `compare.ts:2556-2575` | US/200 g/cheapest/1点 など 2,697 条件 | 出ている（⚠ ＋ Check the weights ボタン） | 出ている（`.cond` "1st place changes if weights are off — mostly the weight of 「…」"）。**誰が勝つかの本文は §** | 出ている（要約）／開いた中（本文） | S1・S7 |
| 8 | 不安定のうち「唯一値段が付く社」（"…is the only one we can still price"） | `compare.ts:2567-2570` | US/200 g/cheapest/1点 91 条件 | 出ている | 開いた中（§） | 開いた中 | S7 popover "FROM JAPAN is the only one we can still price" |
| 9 | 不安定のうち「どの方式も運べない」（"no priced method covers the parcel"） | `compare.ts:2563-2566` | US/200 g/courier-ecms/1点 419 条件 | 出ている | 開いた中（§） | 開いた中 | コード読解（`mk('What changes with weight', rankStabilityNote)`） |
| 10 | 比べられる社が1社だけ | `isIndeterminate` の `comparable.length <= 1`、`Summary` は `rows.length<2` で消える | US/200 g/小形包装物/1点 3,335 条件 | 出ている（Summary 無し。**だが RankBoard は "★ Recommended — sole top pick" と "CHEAPEST" を付ける**） | 出ている（見出し "Only X can be priced"。**だが同じ画面に "Top pick" バッジと "estimated cheapest" スタンプ**） | 出ている。**両方とも自己矛盾（§3-2）** | S3 |
| 11 | 1点の重量で1位が替わる（`weightSensitivity.decisive`） | `compare.ts:2400`、`ItemList.tsx:408`、`AssumedWeightsNote` | US/200 g/cheapest/1点/仮置き 1,632 条件 | 出ている（⚠ 行、カートが畳まれていても注記は外） | 出ている（畳んだカートの上に `.cond`、開いたカートの品にも） | 出ている | S1・S1b |
| 12 | `decisive` だが両端の勝者名が同じ（枠の**集合**が変わっただけ） | `compare.ts:2395-2400` のコメント | US/200 g/cheapest/¥350,000/仮置き 700 条件 | **出ているが読めない**（"FROM JAPAN at 500 g, FROM JAPAN at 10 kg" と書くだけ） | 開いたカートでは "(the top-pick set changes in between)" を足す。**畳んだ状態の `.cond` には足していない** | 出ている／意味の変化（§3-3） | S1（畳）と S1b（開）の文の差 |
| 13 | 片端で比べられる社が減る（`onlyPricedAtLow/High`） | `WeightSensitivity`、`ItemList.tsx:142-147` | US/200 g/cheapest/1点/表 200 条件 | 出ている | 出ている（`winnersText`） | 出ている | 1.2 のコード読解 |
| 14 | 片端で誰も値段が付かない（`winnerAt* == null`） | `ItemList.tsx:144` "no published **EMS** rate at …" | US/20 kg/cheapest/1点/表 160 条件（勝者は宅配便） | 出ている。**方式名が EMS 決め打ち＝F5 型の誤り**（勝者が FROM JAPAN の UPS でも "EMS" と書く） | 出ている（同じ文を写している `winnersText`） | 出ている／**両方とも文言が偽** | `ItemList.tsx:144`、`mock-v2.html:961` |
| 15 | 方式が行ごとに違う（cheapest で郵便と宅配便が混ざる） | `Row.method`（結果には無い） | US/200 g/cheapest/1点 2,418 条件 | **欠落**（行に方式名・日数・追跡が出ない。開いた内訳の note に日数） | 出ている（Ships by / arrives 列、mixed のときだけ） | 出ている | S1 の `ship` 列 |
| 16 | 重量不明の段（`bands`） | `compare.ts:2581-` | UI は到達しない（`weightFieldsFor` が null を返さない） | 到達しない | 到達しない | 条件未発見（構造的） | `useCompare.ts:69` |
| 17 | 為替の参照日（ECB `asOf`）と読んだ日（`fetchedOn`） | `Summary`、`currency` | 常時 | 出ている（asOf。fetchedOn は無い） | 出ている（asOf は要約、fetchedOn は脚注） | 出ている | S1 |
| 18 | 価格未取得の点数（"N items have no price yet…"） | `Calculator.tsx:184-189` | `unpriced` あり | 出ている | 出ている（カート行 "N without a price — not in totals"、開けば `.cond`） | 出ている | `mock-v2.html:981,989` |
| 19 | 全点が価格未取得 | `Calculator.tsx:159` | 同上 | 出ている | 出ている（`.norank` "Enter a price to compare"） | 出ている | `mock-v2.html:1081` |

### 2.2 行（Row）

| # | 注意事項 | 出どころ | 発火条件 | 今のUI | Mock | 判定 | 根拠 |
|---|---|---|---|---|---|---|---|
| 20 | 比べられない行（`comparable=false`）。理由は12分岐 | `compare.ts:1914-1967` | 58,825 行 | 出ている（理由の文・NOT COMPARABLE・総額 —） | 出ている（NOT RANKED・— ・行下の `!` "Not ranked: 理由"） | 出ている | S3・S5 |
| 20a | ├ 日本郵便を売らず、宅配便は測定の下限より軽い（"…that part is our measurement gap"） | `:1925-1930` | US/30〜150 g/cheapest（掃引の最軽 200 g では出ず、追加プローブで発見） | 出ている | 出ている（同じ文） | 出ている | probe: US 100 g で FROM JAPAN |
| 20b | ├ 日本郵便を売らず、宅配便にも値が無い | `:1931-1933` | US/10 kg/cheapest/3点 372 | 出ている | 出ている | 出ている | 掃引 |
| 20c | ├ どの方式も値が付かない | `:1934-1935` | US/25 kg/cheapest 3,713 | 出ている | 出ている | 出ている | S6・S15 |
| 20d | ├ この宅配便を扱わない | `:1941` | US/200 g/courier-dhl 35,360 | 出ている | 出ている | 出ている | S3 |
| 20e | ├ この宅配便をその国へ出さない | `:1943` | DE/1 kg/courier-fedex-connect-plus（Neokyo。掃引の方式一覧に無く、`services.ts:798` の `unavailableIn:['DE']` から逆算して発見） | 出ている | 出ている | 出ている | probe2 |
| 20f | ├ 宅配便の商品価格上限 | `:1945-1947` | **条件未発見**（`priceCapJpy` を持つ宅配便レートが `services.ts` に無い） | — | — | 条件未発見 | `grep priceCapJpy` は郵便2件のみ |
| 20g | ├ 宅配便が未価格 | `:1948-1949` | US/10 kg/courier-dhl/3点 5,144 | 出ている | 出ている | 出ている | 掃引 |
| 20h | ├ 郵便方式を売らない | `:1951` | US/200 g/小形包装物 7,802 | 出ている | 出ている | 出ている | 掃引 |
| 20i | ├ 郵便方式をその国へ出さない | `:1959` | US/200 g/EMS 1,092 | 出ている | 出ている | 出ている | 掃引 |
| 20j | ├ 郵便の商品価格上限（¥30,000） | `:1961-1962` | GB/200 g/小形包装物/¥120,000 1,170 | 出ている | 出ている | 出ている | 掃引 |
| 20k | ├ 寸法上限 | `:1964-1965` | **条件未発見**（既定箱 20×15×10 はどの制限も下回る。`postage.ts` のコメントどおり構造的に発火しない） | — | — | 条件未発見 | 掃引 0 件 |
| 20l | └ 重量上限超（"no published rate above X in our table"） | `:1966-1967` | US/2 kg/小形包装物 4,172 | 出ている | 出ている | 出ている | 掃引 |
| 21 | 総額から漏れた費目名（`excluded` → "excl. …"） | `RankBoard.tsx:280-284` | 63,540 行 | 出ている（行に常時） | **行には無い**（総額の `+` だけ）。費目名は開いた配達ログの赤い "not published" 行 | **開いた中に降格**（§3-4） | S1 `buyee:consolidated` の `cav` に費目名が無い |
| 22 | 上限不明（`total.high === null` → "or more (upper bound unknown)"） | `RankBoard.tsx:106-114`、`format.ts:50` | 4,715 行（US は全行、Buyee consolidated は常に、FROM JAPAN 外注梱包） | 出ている | 出ている（`≈¥60,500+` の `+`。言葉は § "How to read a total"） | 出ている | S1・S7 |
| 23 | 総額に幅（`high > low` → "¥a – b"） | `format.ts:53` | GB/200 g/cheapest/¥30,000 7,692 行（宅配便の測定点の間・Neokyo 保管料の段・通関手数料の仮定ゼロ） | 出ている | 出ている | 出ている | S1 |
| 24 | 総額に推定が混じる（`approximate` → `~`） | `compare.ts:1820` | **全 comparable 行**（掃引 27,089 行中、`approximate=false` は 0。重量 tier を fixed・国内送料既知にしても関税 estimate／入金手数料 estimate が残り、全行 true） | 出ている（`~`） | 出ている（`≈`） | 出ている。**ただし常に真なので情報量ゼロ（§3-5）** | probe `approx with fixed weight` |
| 25 | 同額（`tied` → "tied with X — the order between them means nothing"） | `RankBoard.tsx:86-91` | US/500 g/cheapest 123 条件（CA/200 g/EMS も） | 出ている | 出ている（`!` 行） | 出ている | S4 |
| 26 | おすすめ枠 単独（"★ Recommended — sole top pick"） | `RankBoard.tsx:249-254` | 6,799 条件 | 出ている | 出ている（"Top pick"） | 出ている | S9・S12 |
| 27 | おすすめ枠 2社（"either works"） | 同上 | 1,324 条件 | 出ている | 出ている（"Top pick · either of two"） | 出ている | S1 |
| 28 | 同等（`equivalent`。補足は title 属性のみ） | `RankBoard.tsx:255-262` | US/500 g/cheapest/3点/¥350,000 628 条件。CA 例カートでも | 出ている（補足はホバー） | 出ている（"As cheap, within error"） | 出ている | S1 ZenMarket |
| 29 | 仮定に依存して閉じた1位（`closedByAssumption` → ESTIMATED CHEAPEST） | `RankBoard.tsx:60-63` | 宅配便が1位の 5,657 条件 | 出ている | 出ている（スタンプ "estimated cheapest"・見出し "the estimated cheapest"・WCBO の Courier rates 行） | 出ている | S1 |
| 30 | 差額が下限でしかない（"at least +¥"） | `RankBoard.tsx:65-79` | 1位が上限不明または幅あり（W10a 3,880・W10b 1,449 条件） | 出ている | 出ている（小さな "at least"） | 出ている | S1 |
| 31 | tag: 個口が「まとまる」と未確認（"1 parcel assumed"、`parcelVerified=false` = ZenMarket） | `compare.ts:1874` | 14,897 行 | 出ている（行の tag） | **行には無い**（Boxes 列は "1 box"）。開いた配達ログの見出しにだけ tag | 開いた中に降格 | `mock-v2.html:1201,1322` |
| 32 | tag: 同梱は自分で頼む（"you must request this"） | `compare.ts:1875` | 7,052 行 | 出ている | 出ている（`!` "One box only if you ask X to combine…"） | 出ている | S1 |
| 33 | tag: 注文数≠個口数（"3 orders · 3 parcels"） | `compare.ts:1867` | 7,809 行 | 出ている | 出ている（Boxes 列 "5 boxes"。注文数は開いた中） | 出ている | S1 |
| 34 | Surface の代替（"Surface option — …: ¥… shipping, 1–3 months…"） | `RankBoard.tsx:289-297` | 60,684 行（ほぼ常時） | 出ている（行に常時） | **開いた中**（配達ログ Export 段の "Can wait 1–3 months? …"） | 開いた中に降格 | S2 popover "Surface option" |
| 34b | Surface 上限不明（`shipYen.high === null`） | `Row.surface.shipYen` | **条件未発見**（100 g 刻み全国で 0） | — | 実装あり（`¥X+`） | 条件未発見 | probe SURF-OPEN 0 件 |
| 35 | 紹介料（`referralNote` / "pays us nothing"） | `RankBoard.tsx:271-273` | 常時 | 出ている（全行） | **行には無い**。開いた配達ログの見出しと Door 段、フッターの一般文、リード文 | 開いた中に降格（一般文は出ている） | `mock-v2.html:574,1310,1322,1365` |
| 36 | 直リンクでない（"you will paste the listing URL there"） | `RankBoard.tsx:344-348` | 85,914 行 | 開いた中 | 開いた中（Door 段） | 開いた中 | `mock-v2.html:1311` |
| 37 | 箱の分かれ方の理由（`boxes[].reason` 5種） | `ParcelView.tsx:514-525` | per-listing 15,615／unresolved-shop 7,806／weight-limit 9,135／identified-shop（CA 例カート）／single | 出ている（箱区画は常時） | 開いた中（配達ログ Packed 段） | 開いた中に降格 | `mock-v2.html:1273` |
| 37b | └ `unresolved-shop`（"may read high" — 総額が高めに外れうる唯一の開示） | `types.ts:379-383` | 7,806 行 | 出ている（箱区画） | 開いた中（"shop unknown, so we don't combine — may read high"） | 開いた中 | 同上 |
| 37c | └ `weight-limit` で分割 | `ParcelView.tsx:592-594` 琥珀枠 | 9,135 行 | 出ている | 開いた中。**"OVER LIMIT" と赤で書く（§3-6）** | 開いた中／意味の変化 | `mock-v2.html:1246,1289` |
| 38 | 箱ごとの関税・VAT の判定（flat／free／no-duty／rate／unknown、seller-collects） | `ParcelView.tsx:538-550` | flat=DE/FR、free=GB、no-duty=SG、rate=US…、seller-collects=GB(IOSS)/AU/SG、vat free=CA 2個口の混在（特殊籠のみ）、duty unknown=**条件未発見**（`dutyRate` が null の国が無い） | 出ている（複数箱のときだけ） | 開いた中（figcaption。複数箱または duty≠rate のとき） | 開いた中 | `mock-v2.html:1247` |
| 39 | 箱の分割は当方の前提（`SplitDisclosure` オーナー確定の日本語文） | `ParcelView.tsx:769-786` | 複数箱 | 出ている | **欠落**（Mock のどこにも無い。§ "Boxes are illustrative" は別の内容） | 欠落 | 全 26 シナリオの可視テキスト・popover に「代行会社が決めます」無し |
| 40 | 箱ごとに別々に課税判定（"Each box is priced and duty-checked separately"） | `ParcelView.tsx:663-665` | 複数箱 | 出ている | 欠落 | 欠落 | 同上 |
| 41 | 消費者向け「1箱にまとめたら」の箱の見出し（split か否かで文言が変わる） | `ParcelView.tsx:796-802` | 常時 | 出ている | 欠落（秤は「1st place の箱」と言う） | 欠落（別物に置換） | `mock-v2.html:601` |
| 42 | 推定重量の品は半透明、仮置きは点線の輪郭（`EstimatedDataDisclosure`） | `ParcelView.tsx:455-469`、`PackingBox` | 常時（仮置きがあるときだけ点線の説明） | 出ている | 開いた中（§ "Boxes are illustrative"）。**表と仮置きを同じ「pale dashed」に潰す（§3-7）** | 開いた中／意味の変化 | `mock-v2.html:1229,1246` |
| 43 | 宅配便は容積重量で課金・箱は仮定（"chargeable weight… The box shown (20×15×10 cm) is our assumption"） | `ParcelView.tsx:752-763` | 1位が宅配便 | 出ている | 開いた中（intl-shipping の § note に "we assume a 20×15×10cm box"） | 開いた中 | S2 popover "UPS to Canada" |
| 44 | EMS は重量だけ・箱は梱包シミュレーションではない | `ParcelView.tsx:430-437` | 1位が郵便 | 出ている | 開いた中（§ "Boxes are illustrative" の一般文） | 開いた中 | 同上 |
| 45 | EMS 表の外（"Above the published EMS table — no postage figure exists"、`WeightLadder`） | `WeightLadder.tsx:203-207` | 30 kg 超（#1 と重なる） | 出ている | 欠落（段の目盛り自体が無い。#1 の `.norank` が代わりに立つ） | 欠落（#1 に吸収） | `mock-v2.html:1237-1239` のコメント |
| 46 | 送料の差分チップ（"+¥0 — same EMS weight step"） | `ParcelView.tsx:385-409` | 品を足したとき | 出ている | 欠落（秤の沈みに置換） | 欠落（別物に置換） | `renderHeft` |

### 2.3 費目（Line）

| # | 注意事項 | 出どころ | 発火条件 | 今のUI | Mock | 判定 | 根拠 |
|---|---|---|---|---|---|---|---|
| 47 | 確度4段階（fixed／estimate／unverified／none）の書式 | `tiers.tsx:6-26`、`Amount` | 全費目 | 出ている（`~`琥珀／点線下線／—。凡例2か所） | 開いた中（配達ログの線種＋タグ語、表の色）。凡例はログ見出しと § | 開いた中 | S2 |
| 48 | 未取得で上端も置けない（"— no upper bound"） | `RowBreakdown.tsx:36-46` | vat(US) 8,611／duty-prepayment 2,853／consolidation-packing 7,809／outsourced-packing 3,154／prepaid-import-tax 4,812／excise（酒） | 開いた中 | 開いた中（"not published / no upper bound"）。**US の売上税「none at federal level」も "not published" と書く（§3-8）** | 開いた中／意味の変化 | `mock-v2.html:1214` |
| 49 | 未取得だが上端の見積りがある（`unknownCapYen`／`unknownCapNote`） | `compare.ts:837-842`（Jauce 保管 60日超だけ） | 保管 100 日・130 日（特殊籠 2 件） | **欠落**（`unknownCapYen` は `isUncapped` の判定にしか使われず、額も根拠も画面に出ない。`grep unknownCapYen src/components` = RowBreakdown 1か所のみ） | 開いた中（"≈ up to ¥1,400" ＋ § に `unknownCapNote`） | **今のUIが欠落、Mock は開いた中** | S12b Jauce のログ |
| 50 | 幅のある費目と `rangeNote`（宅配便の測定点の間・Neokyo 保管の段・通関手数料の仮定ゼロ） | `Line.amountKind='range'` | intl-shipping 9,215／courier-clearance-fee 583／storage 3 | **`rangeNote` は欠落**（`grep rangeNote src/components` = 0。額は下端だけ `Amount` で出る） | 開いた中（"¥0 – 2,727" ＋ § に rangeNote） | **今のUIが欠落、Mock は開いた中** | S7b popover "ECMS destination clearance fee" |
| 51 | 社を問わず同じにかかる未知（`scope:'shared'`：US 売上税・Zonos・英酒税） | `Line.scope` | 上記 | 区別せず表示（`excluded` に並ぶ） | 区別せず | 両方とも構造化情報を捨てている | コード読解 |
| 52 | 国内送料は仮置き（"~¥800 each, paste the URL to know"） | `compare.ts:1429`、`ItemList.tsx:445-450` | 85,904 行 | 出ている（カート） | 出ている（カート "≈¥800 guess"）／§（ログ） | 出ている | S1b |
| 53 | Buyee の送料込み出品は国内送料が発生しうる（note＋`FreeShippingDomesticNote`） | `compare.ts:1425-1427`、`FreeShippingDomesticNote.tsx` | 送料込み出品あり（特殊籠） | 出ている（順位の上の常時行） | **欠落**（トグルしても注記無し。note は Buyee 行を開いた § の中だけ） | **欠落（重要）** | S13 に該当文無し |
| 54 | 宅配便の測定点の間の区間（"between two measured weight points (¥a–¥b; we show the lower bound)"） | `compare.ts:1501-1505` | 9,215 行 | 開いた中（note） | 開いた中（§） | 開いた中 | S2 |
| 54b | └ 単調性が崩れ上限不明 | `:1503` | **条件未発見**（100 g 刻み全国で 0） | — | — | 条件未発見 | probe NONMONO 0 件 |
| 55 | 宅配便の箱の仮定（"we assume a 20×15×10cm box … you cannot yet enter your own dimensions"） | `postage.ts:261` | 12,470 行 | 開いた中 | 開いた中 | 開いた中 | S2 |
| 56 | 追跡無し（"no tracking"） | `compare.ts:1506` | 2,639 行（小形包装物） | 開いた中（note。`MethodPicker` の選択肢には出る） | 出ている（Ships by 列の "untracked"、`!` "Untracked — 10 days or less"） | 出ている（Mock が昇格） | S1 buyee:default |
| 57 | 宅配便の所要日数は未モデル（`days:'not yet modeled'`） | `compare.ts:1330` | 12,470 行 | 出ていない（note にも出ない。`MethodPicker` はラベル由来の日数を確度無しで出す） | **Ships by 列にラベル由来の日数を確度無しで出す（"3-5 days"）。無い便は "days n/p"** | 意味の変化（§3-9） | S1 Neokyo "3-5 days" |
| 58 | 公表額への上乗せ（"+¥1,281 per parcel over the published rate"） | `compare.ts:1483-1485` | 867 行（ZenMarket 小形包装物） | 開いた中 | 開いた中 | 開いた中 | 掃引 |
| 59 | 保管の上限日数で頭打ち（"capped at 90 days; items are discarded…"） | `compare.ts:757` | 保管 100 日以上（特殊籠 7 行） | 開いた中 | 開いた中 | 開いた中 | S12 popover "¥0 — but items … are discarded" |
| 60 | Neokyo 保管は寸法で幅（rangeNote） | `compare.ts:799-808` | 保管 100 日 | 開いた中（幅の**上端は出ない**、#50） | 開いた中（"¥2,100 – 8,400"） | 今のUIが欠落 | S12 Neokyo 総額 ¥65,800 – 100,600 |
| 61 | Jauce 保管は非公表（unknownReason） | `compare.ts:822` | 保管 60 日超 | 開いた中 | 開いた中 | 開いた中 | S12b |
| 62 | 州税は人口加重の推定（"7.3% — our estimate… Pick your province"） | `compare.ts:258-264`、`ProvincePicker` | CA・州未選択 8,598 行 | 出ている（選択欄 "Not chosen — we estimate 7.3%"）＋開いた中 | 出ている（"province ≈ avg" 破線 ＋ §）＋ログの選択欄 | 出ている | S1 |
| 63 | 州税ゼロは取得できたゼロ（"Alberta: the CBSA collects no provincial tax…"） | `compare.ts:251-253` | CA/AB 8,580 行 | 開いた中 | 開いた中 | 開いた中 | S14 |
| 64 | 米国関税 12.5% は下限（"only the floor Section 301 puts…"、tier estimate） | `compare.ts:409-415`、`us-duty.ts:216` | 重量ラインが弱い分類のとき（`sake-720ml` で estimate。例カートの品は unverified "our assumption"） | 開いた中 | 開いた中（§） | 開いた中（再現不能: Mock にラインを持つ品が無い） | probe lineId 掃引 |
| 65 | 免税線を個口がまたぐ混在（duty "on the other N parcel"／vat "owe none"） | `compare.ts:420-431,490-497` | CA 2個口 ¥1,500+¥30,000（特殊籠 3 行）／SG 3点 ¥30,000 48 行 | 開いた中 | 開いた中 | 開いた中 | 掃引 |
| 66 | 決済時徴収（"collected at checkout by the service, not at the border"） | `compare.ts:480-485` | GB(IOSS)/AU/SG 8,876 行 | 開いた中 | 開いた中 | 開いた中 | S11 |
| 67 | 通関手数料: 決済時に払済の個口／手数料ゼロ帯 | `compare.ts:567-585` | zeroBand 46 行（US ¥350,000）。paidAtCheckout **条件未発見** | 開いた中 | 開いた中 | 開いた中／条件未発見 | 掃引 |
| 68 | 輸出通関手数料の確度が社で違う（zenmarket/neokyo は unverified） | `compare.ts:701-707` | 11,297 行 | 開いた中（点線下線） | 開いた中（点線） | 開いた中 | S12b |
| 69 | 宅配便の着地通関手数料: 税ゼロなら手数料ゼロと**仮定**（range、"if that assumption is wrong this row understates by up to ¥X"） | `compare.ts:1675-1713` | GB/200 g/courier-fedex 583 行 | 開いた中（下端だけ。上端・rangeNote は #50 で欠落） | 開いた中（幅＋§） | 今のUIが一部欠落 | S7b |
| 70 | 同・課金単位は推論（"the per-shipment unit itself is NOT stated…"） | `compare.ts:1664-1674` | 7,080 行 | 開いた中 | 開いた中 | 開いた中 | S2 popover |
| 71 | 同・額不明（`COURIER_CLEARANCE_UNKNOWN`） | `compare.ts:1718-1723` | **条件未発見**（マスタが `{}`、`courier-clearance.ts:465`） | — | — | 条件未発見（#149 で埋まった） | grep |
| 72 | 決済時徴収の GST/VAT: 誰が集めるか未確認（"we could not confirm who collects it"、estimate） | `compare.ts:1010-1016` | SG/200 g/cheapest 545 行（ZenMarket） | 開いた中 | 開いた中 | 開いた中 | 掃引 |
| 73 | 同・送料が無く額を出せない（null） | `:1006-1008,1026-1030` | GB/200 g/船便 4,812 行（比較不能行に付随） | 開いた中 | 開いた中 | 開いた中 | 掃引 |
| 74 | 入金手数料 3.5% は当方の暫定値（Buyee/Neokyo/FROM JAPAN） | `services.ts` deposit.note | 54,672 行 | 開いた中（琥珀） | 開いた中（§） | 開いた中 | S2 popover |
| 75 | ZenMarket の手数料でヤフオクを JDirectItems と読んだ推論 | `compare.ts:907-910` | 15,606 行 | 開いた中 | 開いた中 | 開いた中 | S7b |
| 76 | 店舗を読めず別注文で課金（総額が高めに出る） | `compare.ts:857-860` | 15,618 行（3点） | 開いた中 | 開いた中 | 開いた中 | 掃引 |
| 77 | 英酒税（発生するが額不明、shared） | `compare.ts:600-607` | 酒ライン（特殊籠 5 行） | 出ている（excl.）＋開いた中 | 再現不能（Mock にラインが無い）。コード上は excl. 行が無いので開いた中 | 再現不能 | — |
| 78 | Zonos 前払い利用料（US 郵便、shared） | `compare.ts:621-626` | 2,853 行 | 出ている（excl.） | 開いた中（総額 `+` のみ） | 開いた中に降格 | S7 Jauce 行の `cav` 空 |
| 79 | 外注梱包（FROM JAPAN、条件付き） | `compare.ts:1451-1458` | US/10 kg/3点/¥120,000 3,154 行、EMS 12 kg×5 | 出ている（excl.） | 開いた中（Packed 段 "not published"） | 開いた中に降格 | S16 popover |
| 80 | 同梱の費用未確認（consolidated 行、`ConsolidationCallout` の "unconfirmed (upper bound unknown)"） | `compare.ts:1462-1465`、`ConsolidationCallout.tsx` | 3,374 条件（常に unconfirmed。free になる条件は 0） | 出ている | 出ている（`!` "their fee for combining is unpublished"） | 出ている | S1 |

### 2.4 画面固定の注記（コンポーネント）

| # | 注意事項 | 出どころ | 発火条件 | 今のUI | Mock | 判定 | 根拠 |
|---|---|---|---|---|---|---|---|
| 81 | 比較の範囲（`EmsOnlyNote`: N方式・大きさは見ない・宅配便を価格化した社／していない社／グリッドの無い社・他社便を売る社の一覧・/sources リンク） | `EmsOnlyNote.tsx` | 常時 | 出ている | 開いた中（Ship by の § "How methods are compared"）。**未価格化の社名・グリッド無しの社名（Jauce）・二次情報の社の点線・リンクは欠落** | 開いた中／一部欠落 | `mock-v2.html:900` |
| 82 | 送れるかは見ていない（`RestrictedGoodsNote` 常時行、`restrictedList()` = データ由来） | `RestrictedGoodsNote.tsx:32-49` | 常時 | 出ている | 出ている（`.band`）。**品目を "banned goods, batteries, liquids" と決め打ち（データは "Alcohol, lithium batteries and blades"）、リンク無し（§3-10）** | 出ている／意味の変化 | S1 `.band` |
| 83 | リチウム電池の航空郵便を受けない宛先（GB/DE） | `RestrictedGoodsNote.tsx:38-43`、`LITHIUM_AIRMAIL_LISTED` | 宛先 GB/DE | 出ている | **欠落** | **欠落（重要）** | S8・S9 の可視テキストに "lithium" 無し |
| 84 | 酒がカートにある（`AlcoholInCartNote` ⚠） | `RestrictedGoodsNote.tsx:69-96` | 酒ライン | 出ている | **欠落**（コードが無い） | 欠落／再現不能 | grep "alcohol" = 0（band の決め打ち文を除く） |
| 85 | 長物がカートにある（`LongItemsInCartNote` ↔） | `:112-138` | 長物ライン | 出ている | **欠落**（コードが無い） | 欠落／再現不能 | grep "long" = 0 |
| 86 | 燃油込み・遠隔地除外（`RemoteAreaSurchargeNote`、文言固定） | `RemoteAreaSurchargeNote.tsx` | 常時 | 出ている | 出ている（一字一句同じ） | 出ている | S1 `.band` |
| 87 | 重量が仮置きの点数（`AssumedWeightsNote`、畳んだ `ul` の外） | `AssumedWeightsNote.tsx:160-207` | 仮置きあり | 出ている（**カートを畳んでいても**） | **カートを開いたときだけ `.cond`**。畳んでいると `decisive` の行しか出ない（decisive でない仮置きは何も出ない） | 開いた中に降格（§3-11） | S1 vs S1b・S20 |
| 88 | 仮置きの印 `?` と品ごとの文 | `AssumedMark`、`ItemList.tsx:355,380-391` | 同上 | 出ている | 出ている（開いたカート。点線赤下線＋`?`＋§） | 出ている（カート開） | S1b |
| 89 | 価格の3状態（listing page · read 日付／reference price／edited by you ✎／price not shown） | `ItemList.tsx:307-327` | 各品 | 出ている | 出ている（線種＋文。"current bid — final price comes later" を追加） | 出ている | `mock-v2.html:999-1003` |
| 90 | 重量の出どころ（表のライン・P25–P75・/weights リンク／entered by you・reset） | `ItemList.tsx:365-403` | 各品 | 出ている | 出ている（§ に P25–P75） | 出ている／開いた中 | S1b popover |
| 91 | 同梱の呼びかけ（`ConsolidationCallout`） | `ConsolidationCallout.tsx` | default と consolidated の差 > 0（3,374 条件） | 出ている（ボードの下の独立枠） | 出ている（Buyee default 行の `!`） | 出ている | S1 |
| 92 | 何が外れうるか（`WhatCouldBeOff`: Estimated／Second-hand／Not included／順位は保証・重量は当方） | `WhatCouldBeOff.tsx` | 比べられる行あり | 出ている | 開いた中（`<details>` 折り畳み） | 開いた中 | `mock-v2.html:1349` |
| 93 | 凡例（`TierLegend` ×2） | `Calculator.tsx:213`、`CostTable.tsx:107` | 常時 | 出ている | 開いた中（ログ見出し・表の下・§） | 開いた中 | S2 |
| 94 | 二次情報の社の列見出し破線（`primarySource===false`） | `CostTable.tsx:41-52` | **条件未発見**（5社とも `primarySource: true`） | 実装あり | 実装あり（`th.sec`） | 条件未発見（死んでいる） | `services.ts:558,845,1312,1719,1967` |
| 95 | 方式の選択肢: 未価格の宛先は無効化＋理由、日数・追跡 | `MethodPicker.tsx:54-65` | 各国 | 出ている | 出ている（Mock は `courierMethodAvailable` の代わりに 1 kg の probe で判定 — 重い重量しか測っていない便で食い違いうる） | 出ている（判定方法が違う） | `mock-v2.html:707-716` |
| 96 | 保管日数の既定は当方の仮定（琥珀＋title） | `StorageDaysInput.tsx` | 常時 | 出ている（title はホバー） | 出ている（"days · our default" ＋ §） | 出ている | S1 |
| 97 | 検索候補は参考価格・価格なし | `CandidateDialog.tsx:35-38,68-74` | 検索時 | 出ている | 出ている | 出ている | `mock-v2.html:837-839` |
| 98 | URL 取得失敗・一覧ページ・検索未設定の通知 | `SearchBox.tsx` | 失敗時 | 出ている | 出ている（4 変種） | 出ている | `renderNotice` |
| 99 | 金額の `title`（tierTitle） | `tiers.tsx:21-26` | 全金額 | 出ている（ホバーのみ） | 無し（§ に置換） | — | コード読解 |
| 100 | 総額の見出しは "approx. total" | `RankBoard.tsx:324` | 常時 | 出ている | "Total" ＋ § | 出ている（弱まる） | S1 |

### 2.5 集計

| 判定 | 件数 | 番号 |
|---|---|---|
| 出ている（Mock で開かずに見える） | 41 | 1,2,3,4,7(要約),10,11,12(開),13,14,15,17,18,19,20,20a-e,20g-j,20l,22,23,24,25,26,27,28,29,30,32,33,52,56,62,80,82,86,88,89,91,95,96,97,98 |
| 開いた中（§／行を開く／折り畳み） | 36 | 5,6,7(本文),8,9,21,31,34,35,36,37,37b,37c,38,42,43,44,47,48,49,50,54,55,57(列),58,59,60,61,63-70,72-76,78,79,81,87,90,92,93 |
| 欠落（Mock に無い） | 9 | 39,40,41,45,46,53,83,84,85 |
| 条件未発見（コードは在るがデータ上発火しない） | 8 | 16,20f,20k,34b,54b,67(一部),71,94 |
| 再現不能（Mock の入力手段では作れない。コード読解で判定） | 4 | 64,77,84,85 |
| 今のUIの側が欠落 | 3 | 49,50,60（`unknownCapYen`・`rangeNote`・幅の上端が画面のどこにも無い） |

（1件が複数の判定を持つものは両方に数えた。）

**今のUI と比べて Mock が「出ている」から「開いた中」へ降格させたもの（決定に効く順）**: #21 総額から漏れた費目名、#87 仮置きの点数（畳んだカート）、#34 Surface、#35 紹介料、#31 「1 parcel assumed」、#5/#6 安定の1行、#7 の本文、#37 箱の分割理由、#81 範囲の開示。

## 3. Mock が本来の意味を変えている箇所

| # | 箇所 | 元の意味 | Mock での読め方 | 根拠 |
|---|---|---|---|---|
| 3-1 | 判定不能の文 "these N are within our error"（#2） | `isIndeterminate` は **1位の `rankHigh` が置けない**ことだけを見る（`compare.ts:2196-2233`「判定不能の範囲は『1位』1点に絞る」）。2位以下の閉じた差は確定している | "N社が全部同じ誤差の中" と全員を巻き込む。EMS 12 kg×5 CA では ZenMarket +¥622 と Neokyo +¥10,881 が閉区間で確定しているのに「6社とも判別できない」 | S16。**エンジンの `indeterminateNote` 自身が同じ文を返している**ので今のUIも同罪。文言の問題ではなく構造（#3-1 は UI 側で「1位の上端が開いている」と描くべき） |
| 3-2 | 比べられる社が1社（#10） | 「唯一値段が付く社」であって「最安」ではない（`compare.ts:2222-2225`、`weightSensitivity` の `onlyPriced` と同じ規則） | "Top pick" バッジ＋"estimated cheapest" スタンプ＋"1ST"。見出しは "Only X can be priced" と正しい | S3。今のUIも "★ Recommended — sole top pick"＋"ESTIMATED CHEAPEST" を付けており同罪 |
| 3-3 | `decisive` の意味（#12） | おすすめ枠の**集合**が変わるか（`bracketChanged`）。両端の勝者が同じでも真になる | 畳んだカートの `.cond` は "FROM JAPAN at 500 g, FROM JAPAN at 10 kg" — 何も変わっていないように読める。開いたカートにだけ "(the top-pick set changes in between)" を足す | S1 vs S1b。今のUIの `ItemList` も同じ文で同じ欠陥 |
| 3-4 | `excluded`（#21） | 「この総額に入っていない費目の**名前**」を行の上で言う（総額が低く見える方向の誤りは特に明示、UI-DESIGN §6） | `+` 1文字。何が抜けているかは行を開いて赤い行を探す | S1・S7 |
| 3-5 | `≈`（#24） | 推定が混じる印 | 全行に付くので区別を作らない（今のUIの `~` も同じ。エンジンの `approximate` が常に真） | probe |
| 3-6 | `weight-limit` の箱（#37c） | 方式の上限で**分割した**（送れる形にした）箱 | "OVER LIMIT" を赤・点滅で表示 → 「上限超過＝送れない」に読める。同じ画面の #20l（本当に送れない）と区別が付かない | `mock-v2.html:1246,1269` |
| 3-7 | 箱の中身の描き分け（#42） | 半透明＝表の推定、点線の輪郭＝仮置き（`PackingBox`/`Glyph`、UI-DESIGN §6） | 利用者入力以外を全部 "pale dashed" に潰す。カートでは点線赤＋`?` で区別しているのに、箱では区別が消える | `mock-v2.html:1229 (.it.est)` |
| 3-8 | US の売上税の行（#48） | "none at federal level"（制度上存在しない） | "not published / no upper bound" のタグ（未公表と同じ顔）。本文は § の中 | `lineAmount` |
| 3-9 | 宅配便の所要日数（#57） | エンジンは `days:'not yet modeled'`／`daysTier:'none'`。`docs/audit/courier-transit-days-2026-09-13.md` は「ラベル由来の日数は保証か目安か不明」と結論 | Ships by 列に "3-5 days" を郵便の "a week or less" と同じ顔で出す（確度の印無し）。無い便は "days n/p" を点線で | S1 Neokyo。今のUIも `MethodPicker` で同じことをしている |
| 3-10 | 送れない品の常時行（#82） | `restrictedList()` がデータから "Alcohol, lithium batteries and blades" を組む。リンク付き | "banned goods, batteries, liquids" を文字列で決め打ち（liquids はデータに無い、blades が消えた）。リンク無し | `mock-v2.html:1136` |
| 3-11 | 仮置きの注記の置き場（#87） | 「畳んだ開示は開示ではない」（`AssumedWeightsNote.tsx:156`、UI-DESIGN §4 追記） | 畳んだカートでは `decisive` の行だけ。decisive でない仮置き（US 例カートの古本）は畳んだ状態で何も言わない | S1・S20 |
| 3-12 | 「N of M services can't be ranked」（Mock 独自の条件行） | — | 行数を社数で割っている。DHL 固定では "5 of 5 services can't be ranked" と出るが FROM JAPAN は順位に居る（Buyee が2行なので 5行/5社） | S3 |
| 3-13 | 方式の選べる／選べない（#95） | `courierMethodAvailable`（その国に測定点があるか） | 1 kg の probe を `compare()` に流して comparable 行が出るか。1 kg より重い点しか測っていない便（例: 測定が 1.5 kg から）は「選べない」に落ちる | `mock-v2.html:710-716` |

## 4. 今のUIで見つかった、Mock 以前からの欠陥（監査の副産物）

- **#49/#50/#60**: `Line.unknownCapYen`・`unknownCapNote`・`rangeNote`・`amountHighYen` は `src/components/` のどこにも描かれていない。上限が置ける未取得（Jauce 保管）は「— no upper bound」に**ならない**だけで、いくらまでかは出ない。幅のある費目は下端だけが `Amount` で出る（Neokyo 保管 ¥2,100–8,400 が ¥2,100 と見える。総額の幅には効いている）。
- **#14**: `ItemList.tsx:144` の "no published **EMS** rate at …" は F5 型の決め打ち（勝者が宅配便でも EMS と書く）。
- **#12**: `decisive` の文が「枠の集合が変わった」を表せない（両端の勝者名が同じでも ⚠ が出る）。
- **#10**: 比べられる社が1社のとき "★ Recommended — sole top pick" と "CHEAPEST/ESTIMATED CHEAPEST" を付ける。`Summary` は黙るが行は断定する。
- **#24**: `Row.approximate` が全行で真（関税 estimate・入金手数料 estimate が必ず残る）。`~` は何も区別していない。
- **#3-1**: `indeterminateNote` の "These N companies sit within the same uncertainty" は `isIndeterminate` の新定義（1位だけ）と食い違う。

## 5. Mock を今のUIより良くしている点（落とさないこと）

- 方式名・日数・追跡を行に出す（#15/#56）。方式が混ざるときの安さと速さのトレードオフが行で読める。
- `rangeNote`・`unknownCapNote`・`unknownCapYen` を § で読める（#49/#50）。
- 同梱の呼びかけを Buyee の行の中に置く（#91）。
- 判定不能・同額・比較不能を行の直下の `!` 行で言う（#2/#25/#20）。
- 州未選択・保管既定を条件欄で破線＋§ で示す（#62/#96）。
- 上限不明を `+` の1文字で総額の隣に置く（#22）— ただし何が抜けたかを行から消してはいけない（#3-4）。

## 6. 未確認のまま残ったこと

- #64（米国関税の下限）・#77（英酒税）・#84（酒）・#85（長物）は Mock に重量ラインを持つ品を入れる手段が無く、DOM では確認していない（コード読解）。
- Mock の 390 px は `.app.phone` の container query（`max-width: 760px` 側）で、実機の viewport 390 px と同じレイアウトになるかは確認していない（横スクロールは 26 シナリオ全て無し）。
- `courierMethodAvailable` と Mock の probe 判定が実際に食い違う便があるかは、全便×全国で照合していない（#3-13 は構造の指摘）。
