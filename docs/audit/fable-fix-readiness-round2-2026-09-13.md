# Fix 判定監査 第2回（2026-09-13, Fable 5.1）── 前回の P1・P2 は潰れた。判定は「Fix してよい」

**判定: Fix してよい。** 前回（`docs/audit/fable-fix-readiness-2026-09-13.md`、#137）の前提条件 P1・P2 は
両方とも実証のうえ潰れている。残る不完全さ（§7・§8）は UI 改革と並行で直せる。
確信度と、何を確認できていないかは §1 末尾に書く。

対象: `origin/main` = `1fb9e4b`（#142 まで）。**コードは一切変更していない。** mutation は
すべて復元し、最後に `git diff` が空・`npx vitest run` が 38 ファイル 1,136 件 green であることを
確認した（§5 末尾）。この文書だけを追加する。
再走査・mutation のスクリプトはスクラッチに置き、リポジトリには入れていない。

---

## 1. 判定

**Fix してよい。前回と同じ判定を繰り返してはいない ── 前回は「条件付き」、今回は「条件なし」。**

| 前回の前提条件 | 今回の実証 | 結果 |
|---|---|---|
| **P1** 最安方式が送料だけで選ばれる（343 条件中 97 条件・111 行、最大 ¥2,640） | 同じ 343 条件（7 か国 × 7 重量 × 7 価格、1 品目、`storageDays: 0`）を、候補 17 方式すべてを明示指定した行と突き合わせて再走査（§3） | **111 行 → 0 行。** 2 つの `site` 変種（`mercari` / `yahoo-auctions`）とも 0 |
| **P2** `master/fees.json` の `tier` が未検査（5 行書き換えて 5/5 生存） | 前回と同じ 5 行を再度書き換え（§5 a1〜a5） | **5 行中 4 行が落ちるようになった。1 行（F02/jauce 落札手数料）は今も生存** ── ただしこれは「額は検査され tier だけが未検査」の行で、実害は確度の印のみ |

「Fix してはいけない」にしなかった理由: 画面が**断定**する数字（`CHEAPEST`・閉じた総額）が実態と
食い違う経路は、今回の再走査と mutation では見つからなかった。P1 の修正で新しく表面化した性質
（§7-1: 未取得費目を 0 と畳んだ結果として上限不明の方式が選ばれる）は、画面では「¥X or more」
「LEADS」として**上限不明を明示して**出るので、ユーザーへの主張は前回より弱く（正直に）なっている。

「条件付き」にしなかった理由: 残った項目のうちユーザーに見える差は「確度の印」の 2 件（§7-2, §7-3）
だけで、金額・順位には効かない。オーナーは UI を作り直すと言っており、印の見せ方は UI 改革の
中で決まる。それを Fix の前提条件にすると、UI 改革の設計判断を先取りして凍結することになる。

**確信度と、何が不確かか:**
- P1・P2 が潰れたことの確信度は高い（数えた。§3・§5）。
- 「新しい欠陥がユーザーを誤導しない」の確信度は**中**。理由は §7-1 の GB/FedEx の例で、選ばれた方式が
  持つ未取得費目（FedEx UK Disbursement Fee）の額を一次資料で確認できていない（FedEx のページは今回も
  WAF で本文が取れない ── 取得を試みて HTTP 200・本文は "System Down / permission" のみ）。額が分かれば
  「上限不明」の幅が数字で言える。今は「存在するが額不明」までしか言えない。
- 多品目・`storageDays > 0` の再走査は実行した（§3 末尾）。e2e は実行していない（§8）。

---

## 2. ¥207 のずれ ── 特定した。どちらも正しい。前提の違いは `Item.site`

**結論: ¥207 = FROM JAPAN の「Payment fee inside Japan」¥200（ヤフオク落札 1 件ごと）+ その ¥200 に
かかる入金手数料のグロスアップ ¥7（3.5% 仮置き）。**前回の私のグリッドは品目の `site` を
`'mercari'` にしていた。#143 の再現とその回帰テスト（`compare.test.ts:2940`）は `'yahoo-auctions'` に
している。

再現（`compare()` を直接呼んだ。US・1,000g・¥3,000・FROM JAPAN・`storageDays: 0`）:

| `site` | UPS 総額 | ECMS 総額 | 差額 | `payment-inside-jp` 行 | `deposit` 行（UPS/ECMS） |
|---|---|---|---|---|---|
| `mercari`（前回の私） | ¥11,839 | ¥9,246 | ¥2,593 | ¥0 | ¥306 / ¥310 |
| `yahoo-auctions`（#143） | ¥12,046 | ¥9,453 | ¥2,593 | **¥200** | ¥313 / ¥317 |

`storageDays`（0 か既定の 45 か）は無関係だった（両方で同じ値。保管 0 日は無料期間内）。

根拠:
- `src/lib/pricing/services.ts:1265` `paymentInsideJapanYen: 200, paymentInsideJapanSites: ['yahoo-auctions'], paymentInsideJapanTier: 'fixed'`。
  出典は FROM JAPAN の公式配信翻訳ファイル `en_help.txt`（コメント「¥200 は **ヤフオクの落札 1 件ごと限定**。
  2023-01-31 以降それ以外の支払手数料は廃止」）。`master/fees.json` F06/fromjapan は `A_confirmed` で、
  `master-sync.test.ts:1119` が tier を突き合わせている。
- `src/lib/pricing/compare.ts:925` ── `paymentInsideJapanSites` があれば `ctx.items.filter((i) => sites.includes(i.site)).length` 件分だけ立つ。
- 入金手数料は `compare.ts:1761` で `(base / (1 - rate) - base)` のグロスアップ。¥200 × (1/(1−0.035) − 1) ≈ ¥7.25 → 合計で ¥207。

**どちらが正しいか**: どちらも、その入力に対しては正しい。ユーザーに出るのは**品目がヤフオク出品なら
¥12,046 / ¥9,453、それ以外なら ¥11,839 / ¥9,246**。この経路は mutation で検査されている
（§5 y1: 全品目に ¥200 を課すよう変えると 7 件落ちる。y2/y3: グロスアップの底と丸めも落ちる）。
バグではない。前回の私の文書は `site` を明記していなかった ── それが「原因不明」を生んだ。

---

## 3. P1・P2 が潰れたかの実証

### 3-1. P1 ── 343 条件の再走査: 111 行 → 0 行

方法: 前回と同じグリッド（US/GB/DE/FR/AU/CA/SG × {200, 500, 1,000, 2,000, 3,000, 5,000, 8,000}g ×
{3,000, 10,000, 30,000, 60,000, 100,000, 150,000, 250,000}円、1 品目、`storageDays: 0`、`method: 'cheapest'`）。
各条件で `comparable` な 5 行（社）について、候補 17 方式（`ems` / `small-packet-air` / `parcel-air` +
`RANKED_COURIER_METHOD_IDS` 14 件）をそれぞれ `method` に明示指定して `compare()` を呼び、その社の行の
`intl-shipping` が非 null（＝運べる）な方式の `total.low` と、`'cheapest'` が選んだ行の `total.low` を比べた。

| 指標 | 前回（#136 時点） | 今回（`site: mercari`） | 今回（`site: yahoo-auctions`） |
|---|---|---|---|
| 条件数 / 検査した行数 | 343 / — | 343 / 1,715 | 343 / 1,715 |
| 「同じ社にもっと安い方式がある」行（like-for-like） | **111 行（97 条件）** | **0** | **0** |
| 同上（未取得行の構成を問わず） | — | **0** | **0** |
| 最大差額 | ¥2,640 | ¥0 | ¥0 |

**`'cheapest'` が選ぶ方式は、今の実装ではその社の全候補の中で `total.low` 最小になっている。** #143 の
回帰テスト 3 件 + 私の再走査で、前回の事象は消えた。

**多品目・`storageDays > 0`（前回「分からない」と書いたもの）**: 7 か国 × 20 カート（3 品目×3 店舗
× 重量 3 段 × 価格 3 段 × 保管 {0, 60} 日 = 18、加えて 6 点 15kg・4 点 2.8kg の 2 カート）= 140 条件で同じ
検査をした。結果は §3-3。

### 3-2. P2 ── tier の mutation: 前回生存した 5 行のうち 4 行が落ちる

| 行（`master/fees.json`） | 前回 | 今回 |
|---|---|---|
| F12/buyee 保証プラン `A_confirmed → C_unknown` | 生存 | **killed**（master-sync 1 件） |
| F14/neokyo 梱包料 `A → B` | 生存 | **killed** |
| F26/zenmarket 輸出通関手数料 `B → A` | 生存 | **killed** |
| F02/buyee 購入手数料 `B → A` | 生存 | **killed** |
| **F02/jauce 落札手数料 `A → C`** | 生存 | **生存** |
| （追加）F07/jauce 入金手数料 `A → B` | — | killed（既知の例外テストが `A_confirmed` を固定） |

F02/jauce が生存する理由: `master-sync.test.ts` の `TIER_CHECKS`（1067〜1170 行）は 19 行を列挙しているが
F02/jauce（3 行ある: 落札手数料・サービス料（場外店舗）ほか）は入っていない。`MAPPED`（228 行）で**額**は
突き合わせているので、額は守られ tier だけが素通りする。実害: 画面の確度の印だけ（金額は変わらない）。

`master/customs.json` 側（前回 128 件中の 48 件）: `clearance` 48 行の tier は `A_confirmed` 25 /
`B_inferred` 16 / `C_unknown` 7。US/UPS を `B→A`・`B→C`、AU/DHL Express を `A→B`、AU/UPS を `A→C` の
4 通りで書き換え、**4/4 killed**（`F34 MAPPED` / `F34 網羅性`）。こちらは検査されている。

### 3-3. 多品目グリッドの結果

140 条件・834 行で「同じ社にもっと安い方式がある」行は **0**（like-for-like でも 0、最大差額 ¥0）。
`rankIndeterminate` は 140 条件中 139。

---

## 4. ユーザーにとって致命的 vs 内部的な不満

### 表 A: ユーザーが誤導され得るもの

| # | 箇所 | 何が起きるか | 規模 | 判定 |
|---|---|---|---|---|
| A1（前回） | `buildRow` の方式選択が送料だけ | 同じ社の高い方式の行を**閉じた数字で**出す | 前回 111 行、最大 ¥2,640 | **潰れた（0 行）** |
| **A4（新規）** | `buildRow` の方式選択が `total.low`（未取得費目は 0 と畳む）で比べる（`compare.ts:1231〜`） | 未取得費目を持つ方式が、それを 0 と数えたぶん安く見えて選ばれる。**例: GB・200g・¥3,000・Neokyo** ── 選択 FedEx Connect Plus ¥11,342（`courier-clearance-fee: null`＝FedEx UK Disbursement Fee は `C_unknown`/`schema_gap`、`courier-destination-fees: null`）、EMS なら ¥11,473（全行閉じ、Royal Mail £8 ¥1,691 込み）。差 ¥131。FedEx の手数料が ¥131 を超えれば EMS の方が安い ── 超えるかどうかは一次資料に到達できず**未確認** | 1,715 行中、**P1 の修正で方式が変わった行 212、うち「未取得費目が厳密に増える方式へ移った」行 101**。選ばれた行が上限不明で、全行閉じた別方式が ¥500 以内にある行 72、¥1,000 以内 102、¥3,000 以内 220 | **誤導ではない**。行は「¥11,342 or more」と出る（`src/lib/ui/format.ts:50`）。だが**前回より重いか軽いか**: 軽い。前回は閉じた数字が ¥2,593 高かった（嘘を断定）。今回は下端が低めに出るが「以上」と明示している。順位への効き方は次の行 |
| A4′ | 同上、順位 | 旧規則（送料だけ）と新規則で **1 位の社が変わる条件 11 件**（前回 δ-1 で「別の未取得行を持つ方式まで含めると 11 件」と予告したものと一致）。**11 件中 9 件で 1 位が「閉じた CHEAPEST」から「上限不明の LEADS」に変わった**（例: GB・200g・¥60,000 ── 旧 Buyee CHEAPEST ¥81,801 → 新 ZenMarket ECMS Express ¥81,313 以上、Buyee は 2 位）。逆（開→閉）は 0 件 | 11 / 343 | **誤導ではない**（LEADS は断定していない）。前回の「Buyee CHEAPEST ¥81,801」の方が、モデル自身の順位規則より強い主張だった。**ただし UI 改革の前提が変わる**: 「決めきれない」条件が増えた（§6） |
| A2（前回） | 燃油・遠隔地の仮置き | 変わらず（今回は再計算していない） | — | 既知。画面は断定しない |
| A3（前回） | 箱詰め順 | `parcels.test.ts` / `taxes.test.ts` で固定（§5 q1 killed） | — | **潰れた** |

**表 A に「致命的」は無い。**

### 表 B: 内部的な不満（実害は確度の印まで）

| # | 箇所 | 内容 | 分類 |
|---|---|---|---|
| B1（前回） | fees.json tier 未検査 | 19 行検査、F02/jauce の tier だけ未検査（§3-2） | ほぼ潰れた。残 1 行は並行で可 |
| **B9（新規）** | `master-sync.test.ts:1411` と `tier-vocab.ts` | **同じ master 語彙 `B_inferred` が 2 つの別の意味に写像されている。** fees.json 側は `tier-vocab.ts` で `B_inferred → unverified`（点線下線、「Second-hand source」）。customs.json 側は `master-sync.test.ts:1411` にベタ書きで `B_inferred → estimate`（`~` 付き、「Our estimate, not a published figure」）。customs の `B_inferred` 16 行（US UPS $17.50・US FedEx・CA FedEx・AU FedEx など）の `inference_basis` は「独立した複数の二次情報が一致、一次資料は WAF で未達」── これは `types.ts` の `unverified`（二次情報。原典に当たれていない）の定義そのもので、`estimate`（我々の仮定）ではない。**#142 の「対応表を 1 箇所に集約した」は fees.json についてだけ真**。US・1,000g・¥3,000 の UPS 通関手数料 ¥2,734 は画面で `~`（我々の推定）と出るが、実態は「二次情報で一致した公表額」 | 金額・順位には効かない。UI 改革で印を設計し直すときに統一する |
| B10（新規） | `tier-vocab.ts` `C_unknown → none` | `TIER_CHECKS` 19 行はすべて `A`/`B` で、`C_unknown → none` の写像を通る行が 1 つも無い（§5 v2 生存）。写像が間違っていても検出されない | 並行で可 |
| B11（新規） | `buildRow` 再帰の `ctx` | `weightScale`／`storageDays`／`province` を再帰側で潰しても全テスト通過（§5 p4/p5/p8）。p5・p8 はほぼ等価変異（保管・州税は方式に依存しない）。**p4 は等価ではない**: `rankStable`（重量 ×1/3・×3）の再計算で、方式の選択が倍率後の重量で行われることを固定するテストが無い。表示総額には効かず `rankStable` フラグにだけ効く | 並行で可 |
| B2（前回） | GB 関税率 2.9% | `taxes.test.ts` / `tax-order.test.ts` で固定（§5 c2 killed）。出典を確認した: WTO World Tariff Profiles の英国プロファイル PDF（今回取得）Part A.1 に「Simple average 2025 … Non-Ag **2.9**」「Trade weighted average … Non-Ag 2.4」とある。**値は出典どおり**。「非農産品の単純平均を品目不明の関税率として使う」選び方の妥当性は判定していない（品目別の UK Global Tariff を照合していない） | 並行で可 |
| B6（前回） | ePacket Light | #143 前後で配線されたとの報告。`services.ts` で FROM JAPAN の `postage` に `epacket-light` 相当の方式 ID は無い（`PostalMethod` は 5 方式のまま）。**「配線した」は確認できなかった**。前回 18 点で AirMail (Small Packet) の方が安いことを示しているので順位には効かない | 並行で可。「配線した」の実体を PR 番号で示してほしい |
| B12（新規、記録） | `compare()` の計算量 | 方式選択が候補 17 件ぶん `buildRow` を再帰するため、1 品目で 1.3ms → 22.9ms（×18）、5 品目 2 店舗 4.3 → 58.8ms、12 品目 132ms（ローカル計測、`performance.now()` 5 回平均）。無限再帰は構造上不可（再帰側は `ctx.method` を具体 ID にするので `wanted === 'cheapest'` 分岐に戻らない）。`ctx`/`items` の破壊的変更は `buildRow` 内に無い（`sort`/`push`/`splice`/`reverse` の適用先を grep） | 不満ですらない。UI で 100 品目を扱うなら要注意 |

---

## 5. mutation の結果 ── 31 件中 24 killed・7 生存・（初回エラー 2 件は修正して再実行）

方法: 1 変異ずつ適用 → `npx vitest run` → バイト単位で復元 → `git status --porcelain` でそのファイルが
clean であることを確認。31 件すべて `restored_clean`。最後に `git diff` 空・1,136 件 green を再確認。

| id | 何を壊したか | 結果 | 生存の意味 |
|---|---|---|---|
| a1〜a4 | fees.json tier（前回の 5 行のうち 4） | killed 各 1 | — |
| **a5** | fees.json F02/jauce 落札手数料 `A→C` | **生存** | `TIER_CHECKS` に無い（§3-2）。実害は印のみ |
| a6 | fees.json F07/jauce 入金手数料 `A→B` | killed 1 | 例外テストが `A_confirmed` を固定 |
| b1/b2 | customs.json US/UPS `B→A` / `B→C` | killed 各 1 | — |
| b3/b4 | customs.json AU/DHL Express `A→B` / AU/UPS `A→C` | killed 各 1 | — |
| v1 | `tier-vocab` `B_inferred → estimate` | killed 3 | — |
| **v2** | `tier-vocab` `C_unknown → unverified` | **生存** | 写像を通る行が無い（B10） |
| v3 | `EXPORT_CLEARANCE_FEE_TIER_BY_SERVICE.zenmarket → fixed` | killed 2 | — |
| v4 | `perOrderYenTier → fixed` | killed 1 | — |
| p1 | 方式選択を送料だけに戻す（#143 の逆戻し） | killed 4 | — |
| p2 | 「運べない方式」の除外を外す（送料 null が 0 に畳まれる） | killed 13 | — |
| **p3** | 同額時の ID タイブレークを逆順 | **生存** | `total.low` 完全同額のときだけ。等価に近い |
| **p4** | 再帰側 `weightScale: 1` | **生存** | B11。`rankStable` の再計算だけに効く |
| **p5** | 再帰側 `storageDays: 0` | **生存** | 等価変異（保管は方式に依存しない） |
| **p6** | `total.high ?? total.low` で比べる | **生存** | 閉じた行は `high === low`、開いた行は `low` に落ちるので、宅配便の補間区間（`low < high`）を持つ行どうしの比較でだけ差が出る。その比較を固定するテストが無い。表示には効かない |
| p7 | 候補から宅配便を外す | killed 8 | — |
| **p8** | 再帰側 `province: null` | **生存** | 等価に近い（州税は方式に依存しない） |
| t1 | `taxLines` CIF の VAT ベースから関税を外す | killed 4 | — |
| t2 | `taxLines` `companyCollectsBelow` を無視 | killed 12 | — |
| c2 | GB `dutyRate 0.029 → 0.05`（前回生存） | **killed 2** | 塞がった |
| q1 | 箱詰め順を逆（前回生存） | **killed 2** | 塞がった |
| y1 | `payment-inside-jp` を全品目に課す（¥207 の経路） | killed 7 | — |
| y2 | 入金手数料のグロスアップ底から定額を外す | killed 5 | — |
| y3 | 入金手数料 `round → floor` | killed 10 | — |

読み方: **前回「検査不在」だった 3 か所（GB 関税率・箱詰め順・fees の tier）は塞がった**（tier は 19/20 行）。
新しいコード（#143 の方式選択）で生き残った 4 件（p3〜p6, p8）はいずれも表示総額に効かない ──
ユーザーにとっての意味は「`rankStable` の再計算経路と、補間区間を持つ行どうしの比較規則が固定されていない」
に留まる。

復元の確認: 31 件すべて `git status --porcelain -- <file>` が空。最終 `git diff --quiet` → 空。
`npx vitest run` → 38 files / 1,136 tests passed。

---

## 6. `rankIndeterminate` の現在の割合

| | 前回（#136） | 今回 `site: mercari` | 今回 `site: yahoo-auctions` |
|---|---|---|---|
| `rankIndeterminate === true` | 288 / 343（**84.0%**） | **297 / 343（86.6%）** | **292 / 343（85.1%）** |
| 「CHEAPEST」と断定できる条件 | 55（16%） | 46（13.4%） | 51（14.9%） |
| 1 位が宅配便 | 256 | 266 | 265 |

増えた理由は §4 A4′: P1 の修正で 1 位が「閉じた郵便」から「上限不明の宅配便」に移った条件が 9 件ある。
**UI 改革の前提は「決めきれないが通常状態（85〜87%）」で変わらず、むしろ強まった。**

---

## 7. 新たに見つけたもの（前回の文書に無いもの）

1. **A4（§4）: `total.low` 比較は未取得費目を 0 と畳むので、上限不明の方式を閉じた方式より優先する。**
   101 行で「未取得費目が厳密に増える方式」に移り、うち 72 行は全行閉じた別方式が ¥500 以内にある。
   GB/FedEx の例（¥131 差）が具体例。誤導ではない（「or more」）が、**UI 改革で「この行はなぜ『以上』なのか
   ／閉じた方式ならいくらか」を見せる設計が要る**。#143 自身が「like-for-like は一般には保証できない」と
   認めていた限界が、実際に 101 行で起きている、という数字。
2. **B9: `B_inferred` の写像が fees.json と customs.json で違う**（`unverified` vs `estimate`）。
   同じ master 語彙が画面で 2 種類の印になる。customs 側 16 行。
3. **B10: `C_unknown → none` を通る検査行が無い。**
4. **B6 の「配線した」を確認できなかった**（`PostalMethod` は 5 方式のまま）。
5. **F07/jauce の判定**: Jauce の一次ページを今回取得した（HTTP 200）。原文:
   「Depositing fee : JPY 40 + 3.9% over the deposit amount regardless of the payment method.」
   **master の `A_confirmed` は正しい**（額の引用は一次資料にある）。コードの `unverified` が指すのは
   「¥40 を底に含めてから 3.9% をグロスアップで効かせる」という計算式の解釈で、原文はその式を
   どちらとも書いていない。**「据え置き」は妥当。master を直す必要も無い。**判定できないのは
   「グロスアップか単純乗算か」で、これは一次資料に無いので出典では決まらない（実請求書が要る）。
6. **語彙対応 `B_inferred → unverified`（設問 3）**: fees.json の `B_inferred` 行の実例（`rows/70,71` F26
   zenmarket/neokyo「他 3 社が同額・同条件で持つことからの推論」、`rows/0` F02/buyee「2019 年のプレス
   リリース、現行ページ未再確認」、`rows/73`「独語圏の複数の書き手が一致」）は「何らかの情報はあるが
   その社自身の原典に当たれていない」で、`unverified` の定義に合う。合わないのは `rows/9` ヤフオク解釈と
   `rows/6`（申請制の解釈）で、これは「我々の解釈」= `estimate` に近い ── 前者は既に例外として
   `estimate` に置かれている。**対応表は多数派に合っている。直す必要は無い。**ただし customs.json 側が
   同じ語を `estimate` にしている（B9）ので、「fees は unverified・customs は estimate」という
   非対称は UI 改革時に片方へ寄せるべき。

---

## 8. 残った未知 ── 確認できなかったこと

- **FedEx UK Disbursement Fee の額**（A4 の幅）: FedEx のページは WAF（本文 "System Down …
  don't have permission"）。額が分からないので「GB/Neokyo の ¥131 差が覆るか」は言えない。
- **燃油・遠隔地の実率**: 今回も測っていない。
- **Jauce ¥2,150 の真因**: 今回は触れていない（前回と同じ）。
- **GB 2.9% の品目別妥当性**: WTO の値は確認した。UK Global Tariff の品目別率とは照合していない。
- **e2e**: 実行していない（vitest 1,136 件のみ）。CI の `all green` に委ねる。
- **B6「ePacket Light を配線した」の実体**: 見つからなかった。
- **`rankStable` 経路の方式選択**（B11 p4）: テストが無いことは分かったが、実際にその経路で
  選択が違う条件があるかは数えていない。
- **P1 修正時に動いたテスト期待値の件数**（前回の未知）: #143 の diff で確認 ── `compare.test.ts` 1 件
  （不変条件の書き換え）+ `e2e/compare.spec.ts` 1 件（順位フィクスチャ）。

---

## 9. 断定不能 86.6% の内訳 ── 1 位の行の上限を開けている費目（追記、集計のみ）

方法: §3-1 と同じ 343 条件（`site: mercari`）。`rankIndeterminate === true` の 297 条件について、
1 位（`total.low` 最小、同着なら全員）の行のうち `rankHighFor()` を `null` にする `Line`
（`amount == null` かつ `scope !== 'shared'` かつ `unknownCapYen == null`）を費目ごとに数えた。
**297 条件すべてが 1 位自身の未取得費目で説明できた**（1 位は閉じているのに 2 位以下との重なりで
断定不能、という条件は 0）。

| 費目（`Line.key`） | 条件数（297 中） | 誰の 1 位行か | 1 社の問題か |
|---|---|---|---|
| `courier-destination-fees`（燃油・遠隔地サーチャージ、宅配便の全ルートで未公表） | **266** | Buyee 103 / ZenMarket 97 / FROM JAPAN 66 | **全社共通**（宅配便が 1 位になる条件のすべて） |
| `outsourced-packing`（FROM JAPAN の外注梱包料） | **97** | FROM JAPAN 97 | **FROM JAPAN 1 社**（同社が 1 位の 97 条件すべてに付く） |
| `courier-clearance-fee`（宅配便の通関立替手数料、`C_unknown`/`schema_gap` のルート） | **51** | ZenMarket 34 / FROM JAPAN 17 | 2 社（GB/DE の FedEx、GB の UPS など、ルート依存） |

組み合わせ: `destination-fees` 単独 166、`destination-fees + outsourced-packing` 49、
`clearance + destination-fees` 34、`outsourced-packing` 単独 31、3 つ全部 17。

**上位いくつを埋めれば減るか**（1 位の行の該当費目を「取れた」と仮定して数え直し。**注意: 費目を
埋めると額が増えて 1 位が入れ替わり得るが、その入れ替わりは集計で出ない ── 下の数字は
「今の 1 位が閉じるか」だけ**）:

| 埋める費目 | 1 位が開いたままの条件 |
|---|---|
| 無し | 297 |
| `courier-destination-fees` | **131** |
| + `outsourced-packing` | **51** |
| + `courier-clearance-fee` | **0** |

1 位の方式（297 条件）: ECMS 92 / ECMS Express 63 / Buyee Air 57 / small-packet-air 31（= FROM JAPAN
の `outsourced-packing` 単独）/ FedEx Low Cost 22 / FedEx Economy 17 / FedEx 12 / UPS 3。

**断定できる 46 条件の偏り**: 国 DE 13 / FR 13 / CA 9 / AU 5 / US 3 / GB 3 / **SG 0**（SG は 49 条件
すべて断定不能）。重量は **200g 22 / 500g 15 / 1,000g 9 で 2,000g 以上は 0**。価格は ¥60,000〜¥150,000 に
36 件集中（¥3,000・¥10,000 が 5 件ずつ、¥30,000・¥250,000 は 0）。1 位は Buyee small-packet-air 33 /
ZenMarket small-packet-air 13 ── **断定できるのは「軽くて郵便（小形包装物）が勝つ」条件だけ**で、
それ以外は宅配便が下端で勝ち、宅配便には必ず `courier-destination-fees` が付く。

**断定不能を減らすには何を取ればいいか**: 第一に **宅配便の燃油・遠隔地サーチャージが表示価格に
込みかどうか**（1 費目で 297 → 131）。これは 3 社共通で、社ごとの計算機で「表示額に何が含まれるか」を
確かめる測定 1 ラウンド（CLAUDE.md §10 の手順）で答えが出る性質の問い。第二に **FROM JAPAN の
外注梱包料**（→ 51）。第三に **FedEx/UPS の GB・DE 通関手数料**（→ 0、ただし FedEx は WAF で一次資料に
到達できていない）。
