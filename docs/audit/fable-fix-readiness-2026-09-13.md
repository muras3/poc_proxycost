# Fix 判定監査: 計算モデルを凍結して UI 改革に入ってよいか（2026-09-13, Fable）

問い（オーナー）: リスクや改善点を精査したうえで、計算モデルを一旦 Fix（凍結）して
抜本的な UI 改革に入ってよい品質にバックエンド・モデルが仕上がっているか。
**判断基準はユーザー** ── この画面を信じて買い物をした人が誤った判断に導かれるか。

対象: `origin/main` = `8bee9c5`（#136）。**コードは一切変更していない**（mutation は
すべて復元し、`git diff` が空・`npx vitest run` が 35 ファイル 1,100 件 green であることを
最後に確認した）。この文書だけを追加する。

---

## 1. 判定

**条件付きで Fix してよい。UI に入る前に潰すべき項目は 2 つだけ。**

| # | 前提条件 | 何が起きているか | 直す規模 |
|---|---|---|---|
| P1 | **配送方法の「最安」選択を、送料ではなく行の総額（`total.low`）で決める** | `compare.ts` `buildRow` の `cheapestCandidate` は **国際送料だけ**で方式を選ぶ（`priceAll()` / `priceCourier().low` の最小）。宅配便の着地側通関手数料（UPS US の $17.50 など）や、郵便限定の窓口手数料（Royal Mail £8）は選択に入らない。結果、**同じ社の別方式のほうが総額で安いのに高い方式の行が表示される**。343 条件のグリッドで **97 条件（28%）・111 行**、最大 **¥2,640**（§3 δ-1）。順位1位の入れ替わりは like-for-like では 0 件だが、1位の社の総額そのものが ¥2,593 高く表示される条件がある | `buildRow` 内の候補比較を「その方式で行を組んだときの `total.low`」に置き換える（候補ごとに行を1回組む）。既存テストは総額をベタ書きで固定しているので、差分が出た行は期待値の更新が要る |
| P2 | **`master/fees.json` の `tier` と `src` の `Tier` を `master-sync.test.ts` で突き合わせる** | 80 行のうち確度を突き合わせているのは事実上 F02/zenmarket（ヤフオク）と F07 の deposit 3 件だけ。**マスタの `tier` を 5 行で書き換えても 1,100 件全部通った**（§4 α）。今日すでに食い違っている行が 3 つある: F02/buyee（master `B_inferred`／code `fixed`）、F26/zenmarket・F26/neokyo（master `B_inferred`／code は `exportClearanceLine()` が全社一律 `'fixed'`）。ユーザーへの実害は「確度の印」だけ（金額は一致）だが、**この検査が無いかぎり「料金表どおり」という画面の主張を master が裏付けているとは言えない** ── まさに「検査が検査になっていない」型 | `MappedEntry` に `tier` の対応（`A_confirmed→fixed` / `B_inferred→estimate` / `C_unknown→unverified or none`）を足し、行ごとに読む関数を1つ追加。F34（customs.json）側は既に同じ形でやっている（`master-sync.test.ts:1247`）ので、その写し |

P1 は「画面の主たる主張（どこが一番安いか・いくらか）」に直接効く。P2 は主張の裏付けの
検査。**それ以外（§2 表 B、§6）は UI 改革と並行で直してよい。**

「Fix してはいけない」にしなかった理由: 誤導が起きる方向を全部計算した結果（§3）、
**1位の社が入れ替わる欠陥は、既知の仮置き（燃油・遠隔地）を除いて見つからなかった。**
燃油・遠隔地は、宅配便の行がすべて `courier-destination-fees: null` で上限不明になる
ので、画面は「CHEAPEST」ではなく「LEADS／or more (upper bound unknown)」を出す。
つまり**ユーザーには「決めきれない」と正直に伝わっている**。それを「決める」ために
測定が要る、という状態は Fix 後も変わらないし、UI 改革を止める理由にならない。

---

## 2. ユーザーにとって致命的 vs 内部的な不満

### 表 A: ユーザーが誤導され得るもの（画面の主張が実態と違い得る）

| # | 箇所 | 何が起きるか | 規模（計算で確認） | 分類 |
|---|---|---|---|---|
| A1 | `compare.ts` `buildRow` `cheapestCandidate`（送料だけで方式を選ぶ） | 同じ社に総額でもっと安い方式があるのに、高い方の行を出す。**例: US・1,000g・¥3,000 の FROM JAPAN** ── 表示は UPS ¥11,839（送料 ¥4,124 + UPS 通関立替手数料 ¥2,734）、ECMS なら ¥9,246（送料 ¥4,250 + ECMS 手数料 ¥11）。送料は UPS が ¥126 安いが総額は ¥2,593 高い。両行の未取得行（外注梱包・着地側費用・売上税）は同一なので like-for-like | 343 条件中 97 条件・111 行。社別: FROM JAPAN 49、Neokyo 46、ZenMarket 16。最大 ¥2,640。**1位の入れ替わりは 0 件**（like-for-like）。1位の社自身の総額が高く出る条件はある | **P1（Fix 前）** |
| A2 | 仮置き #1/#2（燃油・遠隔地サーチャージ込み） | 宅配便の行の送料に +20〜25% を足すと 1位が入れ替わる | 343 条件中 **+25% で 18 件、+20% で 14 件**（例: GB・500g・¥10,000: ZenMarket ECMS EXPRESS → FROM JAPAN）。ただし該当条件はすべて 1位が `high: null` で `rankIndeterminate=true`、画面は「LEADS」表示 | 既知（ROADMAP #1/#2）。**画面は断定していない**ので誤導ではないが、「決めきれない」条件が 343 中 288（84%）に及ぶ ── UI 改革で「決めきれない」をどう見せるかが本丸 |
| A3 | `parcels.ts` `packHeaviestFirst` の詰め順 | 重い順→軽い順に変えても全テスト通過（§4 γ q1）。箱の分け方が変わると個口ごとの申告額が変わり、免税限度またぎ・通関手数料の帯が変わる | 影響は「重量上限で箱を分けるカート」（日本郵便・多品目・2kg 超の小形包装物や 20〜30kg 超）に限る。今回のグリッド（1品目）では発生しない。ROADMAP #8 が「按分規則は未確認」と既に記録 | 並行で可 |

### 表 B: 内部的な不満（実害なし、または実害が「確度の印」に留まる）

| # | 箇所 | 内容 | 分類 |
|---|---|---|---|
| B1 | `master-sync.test.ts` | fees.json の `tier` を書き換えても落ちない（§4 α、5/5 生存）。今日食い違っている行 3 件（F02/buyee、F26/zenmarket、F26/neokyo） | **P2（Fix 前）** ── 実害は確度の印だけだが、検査の不在そのものが問題 |
| B2 | `countries.ts` GB `dutyRate: 0.029` | 0.05 に変えても全テスト通過（§4 γ c2）。他 6 か国の率・限度はすべて落ちた。GB の 2.9% は WTO プロファイルの非農産品単純平均で `estimate`、master にも無い（`customs.json` に 0.029 は FedEx AU の率としてしか無い） | 並行で可。GB・£135 超の関税額と、それが VAT ベースに入る分が誰にも固定されていない |
| B3 | 境界の `<=`（`sellerCollectsBelow`／`vatFreeLimit`／`clearanceBands.upTo`／`overlapsLeader`） | `<` に変えても通る（§4 γ g6/g14/g17/g11）。等号が効くのは申告額が限度と**ぴったり一致**する 1 点だけで、為替で割った実数値が一致することは実務上ない | 並行で可（テストを足すだけ） |
| B4 | `src/` の虚偽コメント 5 件（既知 #6） | 未修正のまま。今回の調査でも `services.ts` の宅配便コメントは読まずにデータで確認した | 並行で可 |
| B5 | 既知の `differ_unexplained` 4 件（Jauce CA/GB 500g） | Jauce の EMS を ¥1,000、Surface を ¥400 引いても **CA・GB の全 98 条件で 1位は変わらない**（Jauce は 500g 帯で常に最下位、差 ¥1,200 以上） | 実害なし。再測定は必要だが Fix を止めない |
| B6 | FROM JAPAN International ePacket Light 未価格化（既知 #7③） | **「既定かつ最安」は master のデータと合わない。** `courier-rates.json` `fromjapan_seven_countries_2026_09_13` の GB/DE/FR/AU/CA/SG × 500/1,000/2,000g の 18 点すべてで AirMail (Small Packet) のほうが安い（例 GB: 500g ¥1,230 vs ePacket Light ¥1,600、1,000g ¥2,130 vs ¥2,500、2,000g ¥3,930 vs ¥4,300）。我々のモデルは同じ 18 点で `small-packet-air` を選び、額は FROM JAPAN の表示と **1 円まで一致**（§3 δ-3）。ePacket Light を足しても FROM JAPAN の下端は下がらない | 実害なし（この 18 点の範囲で）。「最安」という記述は撤回すべき |
| B7 | `isIndeterminate` の `some`/`every` | `every` に戻しても通る（§4 γ g16）が、これは**等価変異**: 1位が単独のとき `some` と `every` は同じ。差が出るのは `total.low` が完全同額のタイ時のみ。#127 の修正は本物で、テストも本物 | 不満ですらない（記録のみ） |
| B8 | 仮置き #3（関税ゼロなら宅配便の通関手数料もゼロ） | `amountHighYen` をそのまま足しても **1位の入れ替わり 0 件**（343 条件） | 実害なし |

---

## 3. (δ) 誤導シナリオ ── 国・重量・価格を指定して計算したもの

すべて `compare()` を直接呼んで確認した（スクリプトはスクラッチに置き、リポジトリには
入れていない）。グリッド: 7 か国 × 重量 {200, 500, 1,000, 2,000, 3,000, 5,000, 8,000}g ×
商品価格 {3,000, 10,000, 30,000, 60,000, 100,000, 150,000, 250,000} 円、1 品目、
`storageDays: 0`、`method: 'cheapest'`（画面の既定）。

### δ-1 送料だけで方式を選ぶ（A1）── **確認した。誤導が起きる**

**US・1,000g・¥3,000・FROM JAPAN**（既定表示）:

```
表示（cheapest → UPS）                  同社 ECMS を選んだ場合
 intl-shipping           4,124            4,250
 courier-clearance-fee   2,734 (estimate)    11 (fixed)
 duty                      375              375
 deposit                   306              310
 total.low              11,839            9,246   ← ¥2,593 安い
 未取得行: outsourced-packing / courier-destination-fees / sales tax — 両方同じ
```

UPS が選ばれた理由は送料が ¥126 安いから。**着地側の通関立替手数料（$17.50 の最低額）が
候補比較に入っていない**。同じ構造が US の 1,000〜3,000g × 全価格で再現する（表 A1）。
順位への効き方: like-for-like では 1位は変わらない（0/343）が、A1 の 97 条件では
「2位以下の社との差額」が実態より大きく表示される。**「一番安いのはここ」は覆らないが、
「いくら安いか」と「この社ならいくらか」は最大 ¥2,640 ずれる。**

方式の候補に「別の未取得行を持つ方式」まで含めると 1位の入れ替わりは 11 件出る
（例: GB・200g・¥60,000 ── 表示は Buyee CHEAPEST ¥81,801（閉区間）、ZenMarket を
ECMS EXPRESS にすると ¥81,313 だが `courier-destination-fees: null` で上限不明）。
これは「閉じた ¥81,801」と「¥81,313 以上」のどちらを 1位と呼ぶか、という設計の問いで、
現状の画面（Buyee CHEAPEST）は**モデル自身の順位規則（`total.low` で並べ、1位が
上限不明なら LEADS）より強い主張**になっている。P1 を直せば消える。

### δ-2 燃油・遠隔地サーチャージ（仮置き #1/#2、A2）── **入れ替わる。ただし画面は断定していない**

宅配便の行の `intl-shipping` に +25% を足して再順位付け: 343 条件中 **18 件**で 1位が変わる
（+20% で 14 件）。例:

- GB・500g・¥10,000: ZenMarket（ECMS EXPRESS ¥17,623 以上）→ FROM JAPAN（¥17,972 以上）
- US・200g・¥3,000〜¥30,000: Buyee（ECMS）→ ZenMarket
- DE・5,000g・¥10,000: FROM JAPAN（FedEx Economy）→ ZenMarket

18 件すべてで 1位は `high: null`・`rankIndeterminate: true`（宅配便の行は必ず
`courier-destination-fees: null` を持つ）。画面は「LEADS … or more (upper bound unknown)」。
**誤導ではないが、343 条件中 288 件（84%）がこの「決めきれない」状態**であり、
そのうち 256 件は 1位が宅配便。UI 改革は「決めきれない」が通常状態だという前提で
設計する必要がある。

### δ-3 FROM JAPAN の ePacket Light（既知 #7③）── **順位は動かない（18 点で確認）**

`master/courier-rates.json` の FROM JAPAN 実測（同社の計算機の表示、gross 重量）と、
同じ gross 重量（net 167/583/1,417g → ×1.2+300g = 500/1,000/2,000g）で我々が選ぶ方式:

| 国 | gross | 我々の選択・額 | FJ 表示 AirMail (Small Packet) | FJ 表示 ePacket Light |
|---|---|---|---|---|
| GB/DE/FR/AU/CA | 500g | small-packet-air ¥1,230 | ¥1,230 | ¥1,600 |
| GB/DE/FR/AU/CA | 1,000g | small-packet-air ¥2,130 | ¥2,130 | ¥2,500 |
| GB/DE/FR/CA | 2,000g | small-packet-air ¥3,930 | ¥3,930 | ¥4,300 |
| AU | 2,000g | courier-ecms ¥2,629 | ¥3,930 | ¥4,300 |
| SG | 500g / 1,000g / 2,000g | ¥860 / ¥1,460 / ECMS ¥2,067 | ¥860 / ¥1,460 / ¥2,660 | ¥1,230 / ¥1,830 / ¥3,030 |

ePacket Light はどの点でも AirMail (Small Packet) より高い。**未価格化でも FROM JAPAN の
下端は下がらず、順位は動かない。**「既定かつ最安」という前提（オーナー指示 #7③）は、
少なくとも master にある 18 点では成り立たない（「既定選択」であることは画面の観測で、
「最安」ではない）。5,000g 以上では両方式とも消えるので比較対象が無い。

### δ-4 Jauce の `differ_unexplained` 4 件 ── **順位は動かない（98 条件で確認）**

CA・GB の 49 条件ずつで、Jauce の EMS 行から ¥1,000、Surface 行から ¥400 を引いて
再順位付け: 1位の変化 **0 件**。500g 帯で Jauce は最下位（GB・¥10,000 で 5位 ¥21,037、
4位 Neokyo ¥19,818 との差 ¥1,219 > ¥1,000）。

### δ-5 仮置き #3（関税ゼロ時の通関手数料）── **順位は動かない**

`courier-clearance-fee` の `amountHighYen`（手数料ありの上端）を `low` に足して再順位付け:
1位の変化 **0 件**（343 条件）。

---

## 4. (α)(β)(γ) の実行結果

方法: 1 変異ずつ適用 → `npx vitest run`（35 ファイル 1,100 件）→ ファイルをバイト単位で
復元 → `git status --porcelain` が空であることを確認。実行後に再度 `git diff` 空・
1,100 件 green を確認した。

### (α) master の `tier` ↔ src の `Tier` ── **5/5 生存。検査になっていない**

| 変異（`master/fees.json`） | 結果 |
|---|---|
| F12/buyee 保証プラン `A_confirmed → C_unknown` | **SURVIVED** 1,100 passed |
| F14/neokyo 梱包料 `A_confirmed → B_inferred` | **SURVIVED** |
| F26/zenmarket 輸出通関手数料 `B_inferred → A_confirmed` | **SURVIVED** |
| F02/buyee 購入手数料 `B_inferred → A_confirmed` | **SURVIVED** |
| F02/jauce 落札手数料 `A_confirmed → C_unknown` | **SURVIVED** |

`master-sync.test.ts` の `MAPPED` は `rule.amount` 等の**額**しか読まない
（`read()`/`expect()` の対に `tier` が無い）。確度を突き合わせているのは
F02/zenmarket のヤフオク（`inferred_marketplaces`）と F07 の deposit 3 社
（`NOT_IN_CODE` 内で `tier === 'estimate'` を assert）だけ。F34（customs.json）は
`master-sync.test.ts:1247` で `A_confirmed→fixed / B_inferred→estimate` を突き合わせて
いるので、fees.json 側だけが抜けている。

現状の食い違い（テスト無しで放置されている）:
- F02/buyee: master `B_inferred`（`inference_basis` は台湾例外に関する推論）、code `fee.tier: 'fixed'`
- F26/zenmarket・F26/neokyo: master `B_inferred`（「他 3 社と同額・同条件と推論」）、code は
  `exportClearanceLine()` が全社一律 `'fixed'`（`compare.ts:687`）

### (β) `master-sync.test.ts` は本物の検査か ── **額と行の存在については本物。両側同時書き換えは通る（構造上不可避）**

| 変異 | 結果 |
|---|---|
| master のみ: F02/buyee `rule.amount 500 → 600` | killed（master-sync 1 件） |
| code のみ: `services.ts` buyee `perOrderYen 500 → 600` | killed（17 件: master-sync + compare + services） |
| **両側同時**（master 600 ＆ code 600） | **killed（16 件: compare.test / services.test の総額ベタ書き）** |

- 方向: 双方向。網羅性テストが「fees.json の全行がちょうど 1 バケットに入る」ことを
  行数をベタ書きせずに assert しているので、**master に行を足すだけで落ちる**。
  `NOT_IN_CODE` の `assertNotInCode` は 40 件すべて実在のフィールド不在を assert している
  （`expect(true)` の類は無い）。
- 両側同時書き換えが通らないのは master-sync の手柄ではなく、`compare.test.ts` /
  `services.test.ts` が総額・値をベタ書きしているから。**master-sync 単体は両側同時なら
  通る構造**（read＝code・expect＝master の突き合わせなので原理的にそう）。これは欠陥では
  なく検査の限界で、値の出典が master の外（一次資料）にある以上避けられない。
- 弱点は α のとおり `tier` を読まないこと。もう 1 つ: `NOT_IN_CODE` に理由を書いて
  入れれば何でも通る（理由の真偽は人が読むしかない）。

### (γ) 追加 mutation ── 32 件中 8 件生存（うち等価変異 1、実害のあるもの 0、検査不在 3）

| id | 何を壊したか | 結果 | 生存した場合の意味 |
|---|---|---|---|
| g1 | VAT ベースから関税を外す（CIF 国） | killed 3 | — |
| g2 | `rankHighFor` で `scope:'shared'` を畳まない | killed 11 | — |
| g3 | `totalRange` が上限不明を無視する | killed 14 | — |
| g4 | 梱包の kg 端数 `ceil → floor` | killed 20 | — |
| g5 | deposit のグロスアップを外す | killed 13 | — |
| **g6** | `sellerCollectsBelow` の `<= → <` | **SURVIVED** | 申告額が A$1,000／S$400 とぴったり一致する 1 点のみ。実害なし（B3） |
| g7 | `dutyFreeLimit` の `<= → <` | killed 1 | — |
| g8 | 免税判定を intrinsic ではなく CIF で測る | killed 13 | — |
| g9 | CA の GST ベースから国内送料を外す | killed 5 | — |
| g10 | 保管の無料日数を 1 日ずらす | killed 33 | — |
| **g11** | `overlapsLeader` の `<= → <` | **SURVIVED** | 2位の下端が 1位の上端と同額のときだけ枠の出入りが変わる。実害なし |
| g12 | 購入手数料を注文数で掛けない | killed 8 | — |
| g13 | 従価手数料を qty で掛けない | killed 1 | — |
| **g14** | `clearanceBands.upTo` の `<= → <` | **SURVIVED** | 帯の境界 1 点のみ。実害なし |
| g15 | prepaid tax の `before-shipping` ベースを total に | killed 2 | — |
| **g16** | `isIndeterminate` の `some → every`（#127 の逆戻し） | **SURVIVED** | **等価変異**。1位が単独なら同じ結果。タイ時のみ差 |
| **g17** | `vatFreeLimit` の `<= → <` | **SURVIVED** | 境界 1 点のみ。実害なし |
| g18 | CA の関税ベースから国内送料を外す | killed 4 | — |
| c1 | DE `dutyRate 0.041 → 0.05` | killed 2 | — |
| **c2** | **GB `dutyRate 0.029 → 0.05`** | **SURVIVED** | **GB・£135 超の関税率を誰も固定していない**（master にも無い）。関税は VAT ベースに入るので、率が違えば VAT も動く。今の値は WTO 単純平均で `estimate` 表示 ── 誤導ではないが検査不在（B2） |
| c3 | DE `vatRate 0.19 → 0.20` | killed 2 | — |
| c4 | CA `vatFreeLimit 20 → 40` | killed 7 | — |
| c5 | AU 通関手数料 `50+48 → 50+0` | killed 1 | — |
| c6 | GB `dutyFreeLimit 135 → 150` | killed 2 | — |
| c7 | SG `vatRate 0.09 → 0.08` | killed 3 | — |
| c8 | US `dutyRate 0.125 → 0.10` | killed 10 | — |
| r1 | 為替 `GBP 211.40 → 200` | killed 6（ECB 表との突合） | — |
| e1 | EMS ゾーン `CA 3 → 2` | killed 15（oracle 含む） | — |
| p1 | 郵便料金表の段 `<= → <` | killed 79 | — |
| p2 | 宅配便補間で非単調区間を無視 | killed 1 | — |
| **q1** | 箱詰めを重い順→軽い順 | **SURVIVED** | 多品目・重量上限で分割するカートで個口の中身が変わり、個口ごとの免税判定が変わり得る（A3）。1 品目では発生しない |
| k1 | 通関手数料の上限（S$100 等）を外す | killed 1 | — |
| k2 | 通関手数料の `max(最低額, 率)` を `min` に | killed 3 | — |

読み方: 前回（#135）の「B 型 5 箇所全滅」に加えて、**税の積み上げ順（関税→VAT ベース）、
按分、ゼロ/null の分岐、単位（qty・注文数）、為替、ゾーン、料金表の段はすべて落ちた。**
生き残ったのは、境界 1 点の等号 4 件、等価変異 1 件、そして検査不在 3 件（GB 関税率・
箱詰め順・master の tier）。

---

## 5. 新たに見つけたもの（既知 9 点に無いもの）

1. **A1: 「最安」の配送方法が送料だけで選ばれている**（`compare.ts` `buildRow`
   `cheapestCandidate`）。着地側通関手数料・郵便窓口手数料・prepaid の有無が候補比較に
   入らない。343 条件中 97 条件で同じ社にもっと安い方式がある（最大 ¥2,640）。
   これが P1。
2. **B2: GB の関税率 2.9% が master にもテストにも無い**（c2 生存）。
3. **B6: 「ePacket Light が FROM JAPAN の最安」は master のデータと矛盾する**。18 点すべてで
   AirMail (Small Packet) が安く、我々の額はそれと 1 円まで一致している。
4. **α の具体例 3 行が今日すでに食い違っている**（F02/buyee、F26/zenmarket、F26/neokyo）。
   既知 #9 は「別語彙で手書き対応」とまでは言っていたが、現に不一致が存在することは
   確認されていなかった。
5. **A3: 箱詰め順がテストで固定されていない**（q1 生存）。
6. 統計として: 画面の既定（`cheapest`）で **343 条件中 288（84%）が `rankIndeterminate`**、
   256 件で 1位が宅配便。「CHEAPEST」と断定できる条件は 55 件（16%）。これは欠陥ではなく
   現状の正直な姿だが、UI 改革の前提として数字で持っておくべき。

---

## 6. 残った未知 ── 確認できなかったこと

- **A1 の実害の上限**: グリッドは 1 品目・既定箱・保管 0 日。多品目（店舗分割・
  重量分割）や `storageDays > 0` での差は計算していない。宅配便の候補比較に
  通関手数料を入れたときの総額差は最大 ¥2,640（1 品目）としか言えない。
- **A2 の実際の率**: 燃油・遠隔地が表示価格に込みかどうかは今回も確認していない
  （+20〜25% は既存記録の値を借りた感度分析であって測定ではない）。
- **B5 の真因**: Jauce CA/GB の ¥2,150 が測定汚染か Jauce 固有の料金かは判定していない
  （オラクル文書と同じ結論。順位に効かないことだけを確認した）。
- **GB 関税率 2.9%（B2）の妥当性**: WTO 単純平均を使う選び方の是非は判断していない。
  「誰も固定していない」ことだけを示した。
- **e2e**: Playwright は実行していない（vitest 1,100 件のみ）。UI が `total.high === null`
  をどう見せるかはコードを読んで確認した（`RankBoard.tsx` の LEADS／or more）。
- **既知 9 点の再調査は行っていない**。#1（oracle 156/4）、#2（skip/only ゼロ）、
  #4（被覆）、#5（費目確度）、#6（虚偽コメント）は前提として使った。#3 の mutation は
  自分の選び方で 32 件追加した（§4 γ）。#7①②（宅配便の重量上限・所要日数）は今回の
  誤導シナリオに影響しないので触れていない。
- **P1 を直したときに既存テストの期待値がどれだけ動くか**は数えていない
  （`compare.test.ts` は総額をベタ書きしているので、A1 の 97 条件に重なるフィクスチャは
  更新が要る）。
