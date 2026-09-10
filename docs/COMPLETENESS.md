# 完成度判定と残タスク

判定日 2026-09-06 / 対象 `1a28305`（ブランチ `claude/automated-income-schemes-uzn8zw-rh3uwh`、作業ツリーはクリーン）。
入力は `docs/audit/{fees,taxes,logic,reality,gaps}.md`、`REQUIREMENTS.md`、`docs/DESIGN-NOTES.md`、`docs/UI-DESIGN.md`。
監査の主張のうち判定を左右するものは、この日に自分で再実行・再取得した（§0）。

判断の軸は1つ。**このプロダクトの約束は「順位と差額」であって「総額」ではない**（REQUIREMENTS §2）。
したがって欠落・ずれは (a) **順位または差額を変えうるもの＝致命的** と (b) **総額だけをずらすもの＝開示すれば許容** に分ける。
(b) の「開示」は UI-DESIGN §6 の規定どおり、`—`（未取得）と `excl. …`（何が入っていないか）で行う。

**2026-09-07 追記（この軸は判定日のもの）。**プロダクトの定義が
「**総額を可能な限り正確なものを出して、順位づけする**」に確定した（REQUIREMENTS §2）。
総額はもう「約束の外」ではない。**判定日の (a)/(b) の切り分けはこの文書の P0 を決めた
根拠なので書き換えない**が、これ以降は (b)「総額だけをずらすもの」も
**開示だけで済ませず、一次情報が取れる限り値を入れる**（進め方は `docs/TODO-NEXT.md` §1）。

---

## 0. 自分で確認したこと（監査の再現）

| 確認 | 結果 | 出典 / 方法 |
|---|---|---|
| 日本郵便 EMS 料金表の段数 | **42 段、上限 30kg**。実装は 27 段（15kg まで）。18kg 段・第4地帯は **¥46,300** | https://www.post.japanpost.jp/send/oversea/charge/list-ems/all.html を curl → HTML の `<tr>` を数えた（200、26,461 bytes） |
| 5点 × ¥3,000 × 3,000g → US の順位 | **1位 Buyee, default ¥96,388（comparable）**、他5行は EMS null で comparable=false | `compare()` を `npx tsx` で直接実行 |
| 1点 20,000g → US | 全行 comparable=false。それでも rank 1〜5 が付いて返る | 同上 |
| DE ¥18,650 → ¥18,651 | 総額 ¥31,393 → ¥30,813（**¥1 高い商品が ¥580 安い**）。`logic.md` L2 は未修正 | 同上 |
| SG の関税 note | `under the SGD Infinity threshold` が今も返る（`logic.md` E5 未修正） | 同上 |
| Neokyo 料金ページの構造 | `<h5>Order and domestic shipping price</h5>` → `<i class="fa-plus fa-3x">` → `350 ¥JPY`。**（商品代＋国内送料）＋ ¥350** の構造。¥350 の説明文に国内送料は無い | https://neokyo.com/en/fees（200） |
| ZenMarket 料金ページ | 直アクセスは 403（Cloudflare）。**Wayback 2026-07-25 は取得できた**（`fees.md`・`gaps.md` の「egress 拒否」は今日は再現しない。`reality.md` §3.4 と一致） | https://web.archive.org/web/20260725075657/https://zenmarket.jp/en/fees.aspx（200） |
| ZenMarket の原文 | 「standard fee of 500 yen … Amazon, Rakuten, and most other stores / 300 yen … Recommended Stores / **800 yen … all Mercari items and JDirectItems Auction bids**」「If you buy 3 identical T-shirts, our service fee will still be the same」「**You never pay: … for initial packing and consolidation**」「Funds Deposit Fee (**from 1%**)」「Overstay Over 60 Days: **50 JPY a day per item**」「AU 1,000 AUD 以下に 10% GST を国際送料と同時に請求」 | 同上 |
| テスト | `npx vitest run` 181 passed。うち `compare.test.ts:74-87` は **「Buyee, default が唯一の比較可能行で1位」を7カ国で固定**している | 実行 |
| `data/fee-pages.json` | `jauce` の項目 **0 件**（監視対象外） | grep |

---

## 1. 判定

**公開してはいけない。**（`1a28305` 時点。§5 の P0 が全て終われば「条件つきで公開してよい」に上がる）

根拠は3つ。

1. **UI から到達できる入力で、最も高い行が唯一の1位として出る。** 5点 × 3,000g／米国（DESIGN-NOTES §1 が自分の根拠に使っている例）で、Buyee default ¥96,388 が1位、正しい1位 Neokyo は ¥69,378（18kg 段 ¥46,300 を入れた値）。**差 ¥27,010、向きは逆。** 原因は EMS 表を 27 段しか転記していないことで、日本郵便は同じ URL に 42 段を公表している（§0）。しかも `1a28305` はこの挙動をテストと DESIGN-NOTES に「制度の性質」として固定した。**画面の文言「Japan Post publishes no EMS rate above 15 kg」は事実に反する。**
2. **基準ケース（1点 ¥5,000 / 500g / US）の1位2位差は ¥650。その幅の中に、一次情報で確定した費目の誤りが5社中4社にある。** Neokyo 国内送料 ¥800（過小）、FROM JAPAN ¥200（過大）、ZenMarket ¥300/点（過大、楽天等）、Jauce ¥300（過小）、Buyee ¥500 の費目名（プランなのに国内配送と表示）。これらは順位と差額を直接動かす（§2）。**約束の主語が壊れている。**
3. **約束の根拠が文書上も実装上も一致していない。** REQUIREMENTS §2 は「1/3〜5倍で7カ国すべて順位が1つも動かなかった」と書くが、`logic.md` L5 の実測では 1点 4,760g／5点 5,960g で1位が入れ替わり、実装自身が `rankStable` を `[1/3, 3]` に狭めた。DESIGN-NOTES §1 は「×1/10〜×3」、REQUIREMENTS は「1/3〜5倍」、compare.ts は `[1/3, 3]`。**3つが別の主張をしている。**

---

## 2. 順位・差額を変えうる欠落（致命的。公開前に全部処理する）

各項目に「なぜ順位に効くか」を書く。金額は基準ケース（1点 ¥5,000 / 500g / US、Neokyo 12,898・FJ 13,548・Buyee 13,848・ZM 14,069・Jauce 14,598）。

| # | 欠落・ずれ | 出典（監査） | なぜ順位・差額に効くか | 処置 |
|---|---|---|---|---|
| A1 | **EMS 表が 27 段（15kg）。公表は 42 段（30kg）。** 表の外を `comparable:false` にした結果、個口を分ける Buyee default だけが表の内側に残り1位になる | gaps G4、§0 で再現 | 5点×3,000g／US で **最高値の行が1位（+¥27,010）**。1点 20,000g では全行 non-comparable なのに rank が付く。UI の重量欄から到達可能 | **公開停止。転記して直す**（T1） |
| A2 | **Neokyo `domesticIncluded: true`。** 公式ページは（商品代＋国内送料）＋¥350 の構造で、¥350 の内訳に国内送料は無い | fees #1、reality §3.6/§4.6、§0 で HTML 構造確認 | 1点で 12,898 → 13,698、**FJ 13,548 に抜かれて1位陥落**。5点では A3 と合わせて FJ と ¥50 差で入れ替わる。**現在の「7カ国で Neokyo 1位」はこの仮定1つで作られている。** Neokyo の実請求は 0 件で裏取り不能（reality §5） | **公開停止。false にする**（T2） |
| A3 | **FROM JAPAN ¥200 を全注文に課金。** 原文は「JDirectItems Auctions のみ・落札1件ごと」「2023-01-31 以降それ以外は廃止」 | fees、reality §3.5 | 非ヤフオクで ¥200/注文 過大。A2 を直した後、5点カートで **FJ 37,478 vs Neokyo 37,528 → FJ が1位**。DESIGN-NOTES §1 の「2点以上では入れ替わらない」根拠がこの ¥200 | **公開停止。ヤフオク限定に**（T3） |
| A4 | **ZenMarket ¥800 一律。** 原文は楽天・Amazon・多くの店 ¥500、推奨店 ¥300、メルカリ・ヤフオク ¥800 | reality §3.4、§0 で原文確認 | 楽天1点で −¥300 → 13,769 < Buyee 13,848、**ZM が Buyee を抜いて3位**。qty>1 なら A5 と重なる | **公開停止。サイト別に**（T4） |
| A5 | **同一商品 qty>1 で手数料を qty 倍**（Neokyo・ZM・FJ）。原文は3社とも「同一商品の複数個は1回」 | fees #7、reality §4.3、§0 で ZM 原文確認 | qty 3 楽天で ZM +¥1,900、FJ +¥1,200、Neokyo +¥700 過大。Buyee だけ正しいので **Buyee が相対的に有利に出る** | **公開停止**（T5） |
| A6 | **Jauce 銀行手数料 ¥300/支払（出品者×日）が無い。場外店舗（駿河屋・まんだらけ・ZOZO・HMV・とらのあな等）は ¥1,000+8% なのに一律 ¥400+8%** | fees #4/#5、reality R6（2015 実請求に ¥300 が現れる）・§3.3 | 基準ケースでは最下位のままだが **差額が ¥300 狂う**。場外店舗では ¥600/点 過小で順位が動く。`sourceUrl` が 404 で料金改定を検知できない | **公開停止**（T6） |
| A7 | **Buyee「Domestic handling ¥500」は存在しない費目。実体は保証プラン（Standard ¥500 推奨 / Lite ¥0）** | fees #2/#3、reality §3.2/§4.4 | 額は偶然一致。**Lite を選ぶ利用者には ¥500/注文 過大で 3位→2位**。費目名が嘘なので利用者は気づけない | **公開停止。改名し Lite を任意欄に**（T7） |
| A8 | **免税限度を CIF（送料込み）で判定。** GB/EU は intrinsic value（商品代）で判定する。さらに DE/FR は限度超で関税が null になり **総額が下がる**（L2） | taxes #9、logic L2、§0 で再現 | 各社の CIF が違うので **社ごとに違う商品価格で限度をまたぎ、ある社だけ関税 ¥489 が消える帯**ができる。商品代で判定すれば全社同時にまたぐ（順位は守られ、非単調は開示で足りる） | **公開停止。判定基準を商品代に**（T8） |
| A9 | **オークションの現在価格を `priceTier: 'fixed'` で総額に入れる。** `Site.kind` は宣言だけで未参照 | gaps G11 | 従価型は Jauce だけ（8%）なので **落札価格が上がると Jauce の差額だけ広がる**。確定色で出すのは不変条件4の逆 | **公開停止。auction は 'estimate' に**（T9） |
| A10 | Buyee ショッピングは同一店舗の複数注文で ¥500 は1回。実装は点ごと | fees #8 | 同一店舗2点で ¥500 過大 → 3点カートで Buyee の順位が動きうる。ただし店舗 id が入力に無い | P1（T14）。**公開条件にはしない**：現状は Buyee を高く見せる向きで、報酬を払う社に不利な誤り。開示して後回し |
| A11 | 順位の頑健性の主張が3文書で違う（§1 根拠3） | logic L5、gaps G4-c | 約束の根拠そのもの | **公開停止。文書を実測に揃える**（T12） |
| A12 | **代行が前徴収する GST（AU ≤A$1,000・SG <S$400）。** Buyee・FJ は徴収を自社で明記、ZM は AU で明記（§0）。**Neokyo・Jauce は未取得。** 税関側は「登録事業者からの購入は免除なし」 | taxes §4/§6、reality §3.5、§0 | 徴収する社としない社が混在すれば **AU/SG で 9〜10% の非対称＝順位が動く**。現状は全社 ¥0（SG）／全社 10%（AU、基数違い）で対称 | P1（T15）。**AU/SG は「前徴収の有無を確認できた社／できていない社」を行に開示して公開**。未検証のまま非対称に実装しない |

**(a) に入れなかったもの（順位に効くが「EMS 比較」という範囲の外）**

- **EMS 固定**（gaps G1/G5/G6/§2）。同一方式を全社に当てる限り1位は不動（gaps 自身の実測）。差額は Jauce の非EMS保険 ¥250/kg で最大 47% 動き、Buyee 分割／同梱の差は符号が反転する。**これは「順位が間違っている」ではなく「比較の範囲が画面に書かれていない」。** 範囲を明示する（T10）。**方式選択は 2026-09-07 に割った**——日本郵便の他方式は §6 の「やらない」から外して着手し、宅配便は理由を差し替えて「やらない」に残した（§6 の追記）。
- **米国の DDP／Zonos／Neokyo の FedEx 13.4%**（gaps G2）。FedEx を選んだ場合の話で、EMS 比較の外。EMS（日本郵便）経路では Zonos 前払いの利用料が全社に等しく乗り、額は非公開 → **null 行で開示**（T11）。
- **請求通貨・カード外貨手数料が社ごとに違う**（gaps G7）。¥260〜520 で1位2位差と同じ桁。だがカード発行会社ごとで一次情報が取れない → §6。
- **保管料**（gaps G13）。Buyee 30日 → ¥100〜300/日、ZM 60日 → ¥50/日/点（§0 で確認）、Neokyo 45日・Jauce 60日・FJ 60日。同梱前提の利用では既定で発生しうるが、**時間が入力に無い**。任意欄に「free storage N days, then …」を並べる（T19）。**2026-09-07 追記（T19 で取得済み）: 「Neokyo・FJ・Jauce は額が未取得」はこの行の誤りだった。**Neokyo は /en/storage に週次の表が在り（fees と FAQ しか見ていなかった）、FJ は 60日で廃棄・延長不可なので有料延長がそもそも存在しない。額が本当に無いのは Jauce だけ。

---

## 3. 総額だけをずらす欠落（開示して公開できる）

全社に等しく乗るので順位は動かない。**総額を低く見せる向きが一貫して大きい**（taxes §8）ので、開示は「何が入っていないか」を必ず列挙する形にする。

| # | 欠落 | 額（基準例） | 画面での開示 |
|---|---|---|---|
| B1 | US：MFN>12.5% の品目（衣類 16.5〜32%）、原産国、CBP の MPF／EMS 手数料 $1+$2.69〜12.09 | −¥480〜2,340 / −¥550〜1,960 | Duty 行 note「12.5%: Japan-origin goods with MFN ≤12.5% (figures, games, books). Apparel is higher.」／excluded に「US CBP entry fees」 |
| B2 | US：USPS $9.35 は DDP 前払い経路では発生しない疑い（taxes と gaps が対立、§7） | +¥1,403（過大の疑い） | tier `unverified` 維持、note「charged only if USPS collects duty on delivery」 |
| B3 | SG：OVR 9% 前徴収（A12 の対称部分）。全社が徴収するなら総額のみ | −¥1,503（−8%） | T15 で行を追加。未確認の社は `unverified` |
| B4 | CA：州税（ON 8% 等）と Canada Post CAN$9.95 | −¥2,495（−13%） | **解消（T23、2026-09-07）。**「depends on your province — not included」は正しくなかった: 州税は確実に発生するので `—` は誤り。州選択を作り、未選択でも人口加重の代表値を estimate で出す。Canada Post の CAN$9.95 は原文を取って通関手数料の行に入れた |
| B5 | AU：A$1,000 超の IPC A$50＋生物検疫 A$48 | −¥9,702（該当帯） | excluded に「Import Processing Charge + biosecurity (over A$1,000)」 |
| B6 | GB：≤£135 で VAT と £8 を両方積む。売り手徴収なら £8 は発生しない。Royal Mail £8 自体も未検証 | +¥1,520（過大） | note「Either the proxy charges UK VAT at checkout, or Royal Mail charges VAT + £8 on delivery」。tier `unverified` 維持 |
| B7 | DE/FR：€3 が代行経由（DSIG か）に当たるか未確定。IOSS 経路では €3 に VAT を掛けない | ±¥93〜98 | €3 の tier を `fixed` → `unverified` に落とし note「EU flat duty for distance sales; applicability to proxy purchases not confirmed」（T17）。Union handling fee（2026-11 予定）は excluded に予告 |
| B8 | **為替が 4〜12% 陳腐化。`RATES_AS_OF = '2026-09-06'` は転記していない日付** | £表示 +11%、SG 帯で GST ¥4,200 の誤課税 | **転記して日付を正しくする**（T13、P0）。理由は「念のため」ではない：**画面の `fixed 09-06` が虚偽の出典表示**であり、閾値の境界を ¥2,800〜13,400 動かす。**→ T13b 済**: 2026-09-06 に ECB 日次参照レート（参照日 2026-09-04）から転記。GB の境界は ¥25,650→¥28,539、SG は ¥46,400→¥49,332 になり、¥46,400〜49,332 帯の GST 誤課税は消えた |
| B9 | 国内送料 ¥800 の仮定。実勢サンプル4件は ¥220〜700、Buyee 公表レンジ ¥150〜1,500 | 全社 ±同額 | 据え置き（§6）。note を「~¥800 assumed (Buyee publishes ¥150–1,500). Paste the URL to know.」に |
| B10 | EMS 行の「published rate」表記。4社は `emsMarkupTier: 'estimate'` なのに断言 | 0（表記の問題） | 表記を「Japan Post published rate; pass-through assumed」に。Buyee・ZM は 2021 実請求で公表額と完全一致（reality R2/R4）、Neokyo は原文「no Neokyo fee on shipping cost」あり → この3社は `fixed` に上げてよい。FJ は根拠なし（T16） |
| B11 | `approximate` が常に true（EMS 行の tier が固定で 'estimate'）。`~` に情報が無い | 表記 | EMS 行の tier を「料金 fixed／重量 estimate」に分ける（T16） |
| B12 | 重量の誤爆（日付 `1/7`、1文字 CJK トークン、`1/6 ドール 服`）。`1a28305` で L4（最長語）は修正済みだが誤爆は残る | 30x の総額ずれ。1つの数字が「確定」に見えて段表が消える | P1（T18）。当面は重量チップの note に「from title keywords — check it」 |
| B13 | Jauce 入金手数料 gross-up（原文は加算と読める） | −¥22〜63 | P3（T25）。§7 の矛盾あり |
| B14 | 任意欄：FJ Protection Plan の二重計上、輸出通関 ¥2,800 が Jauce/Neokyo に無い、Neokyo 開梱は 1,000＋梱包料 | 総額外 | **済**（T21）。輸出通関は ZenMarket にも無かった——**日本郵便の費目**なので5社すべてに出す |
| B15 | `SGD Infinity threshold` の表示 | 表記 | P0 で消す（T13 と同時、1行） |
| B16 | 15〜30kg・30kg 超・Neokyo の米国宛 20kg 上限 | A1 で解決。30kg 超は「EMS で送れない」 | T1 の中で「over 30 kg — not accepted by EMS」を全行に出し、**1位を出さない** |

---

## 4. 「検証できなかった」ものを検証できないまま公開してよいか

| 項目 | 判断 | 画面での扱い |
|---|---|---|
| ZenMarket 全般 | **公開してよい。** 公式ページの Wayback 2026-07-25 を取得でき（§0）、手数料・梱包無料・保管料・入金手数料の原文がある。直アクセス 403 は取得手段の問題で情報の欠如ではない | `sourceUrl` は `fees.aspx` のまま、`/sources` に「archived copy 2026-07-25」と確認日を併記。`primarySource: true` 維持 |
| Royal Mail £8 | 公開してよい | `unverified`（点線）維持。B6 の note |
| DE/FR 郵便の立替手数料 | 公開してよい | `null`（—）維持。既にそうなっている |
| Neokyo 週次保管料・Jauce 月次保管料の額 | 公開してよい | **Neokyo は取れた**（/en/storage の週次表）。額が無いのは Jauce だけで、そこは「free 60 days, then a monthly fee (amount not published)」＋額 null |
| Zonos 利用料の額 | 公開してよい | **null 行を必ず出す**（T11）。無いことにしない |
| FJ 会員ランクの国際送料 %OFF | 公開してよい | What could be off に1行「FROM JAPAN discounts international shipping for repeat customers (rate not published)」 |
| EU €3 の代行への適用 | 公開してよい | tier を `unverified` に（T17） |
| Neokyo・Jauce の SG/AU GST 登録 | **未検証のまま非対称に実装してはいけない。** 対称（全社徴収）＋未確認社に `unverified` で公開 | T15 |
| Neokyo の実請求 0 件 | 公開してよい。ただし **1位の社に実請求の裏が無い**ことは `/sources` に書く | 「No public invoice found for Neokyo as of 2026-09-06; totals rest on its published fee page only」 |
| 2024 年以降の実請求が全社 0 件 | 公開してよい。実請求との一致は公開条件にしない（§6） | — |
| Jauce の qty 課金（同一オークション複数個） | 公開してよい | 現状維持＋note「per auction」 |
| Buyee EMS の上乗せ有無 | 公開してよい | R4（2021）で公表額と完全一致。`fixed` に上げる根拠として十分（T16） |

---

## 5. 残タスク（優先度つき）

**P0 ＝ これが全て終わるまで公開しない。** P1 ＝ 公開直後に。P2/P3 ＝ 余力で。
各タスクは「何が出れば終わりか」で書く。

### P0（公開ブロッカー）

**2026-09-07 追記（マージ前の照合）。** §5 は判定日（対象 `1a28305`）の計画のまま置かれていて、
**その後に実装した P0 のほとんどに `済` が書き戻されていなかった。**実装を1つずつ当たり直し、
各行の先頭に現状を書いた。**「完了の定義」の欄は判定日の文言のまま**なので、その後の修正で
数字が動いたものは行内にそう書く（消すと、当時何を根拠に決めたかが読めなくなる）。

| # | タスク | 完了の定義 |
|---|---|---|
| T1 | **済（完了の定義の数字だけ古い）。**`EMS_TABLE.length === 42`・上限 30,000g・30kg 超は `comparable=false` で順位を出さない（`ems.test.ts`・`compare.test.ts`）。**「5点×3,000g/US で1位 Neokyo ¥69,378」はもう成り立たない**——T2 以降の料金修正で **FROM JAPAN ¥74,536**（`src/app/sources/measured.ts` が compare() で測り直して縛る）。`emsFor(18300, zone4)` も 18,300g は 19kg 段なので ¥48,700 で、¥46,300 は 18kg 段ちょうどの値。**公表表 210 値の全数突合は入っていない**（`ems.test.ts` はスポット照合＋単調性・段境界の性質検査）。 EMS 表を公表 42 段に拡張。30kg 超は全行「EMS で送れない」にして1位を出さない。`compare.test.ts:74-87` と DESIGN-NOTES §1 の「Buyee default が唯一の比較可能行」を撤回。UI 文言「Japan Post publishes no EMS rate above…」を削除 | `EMS_TABLE.length === 42`、`emsFor(18300, zone4) === 46300`、5点×3,000g/US で1位 Neokyo ¥69,378、公表表 210 値との突合テストが追加されて通る、30kg 超で `rows.every(r => !r.comparable)` かつ `rank` が付かない |
| T2 | **済。**`services.ts` の5社すべてが `domesticIncluded: false`。 Neokyo `domesticIncluded: false` | Neokyo 行の domestic-shipping が他社と同じ値・同じ tier で出る。FeeTable の「included in the service fee」が消える。DESIGN-NOTES §1「逆転条件」を実測で書き直す |
| T3 | **済（形は完了の定義と違う）。**楽天でも行は消さず、**出典のある ¥0**（tier `fixed`、2023-01-31 に廃止されたことを知っている 0）で出す。行を消すと「調べていない」と区別が付かない。ヤフオク2点で ¥400。 FJ ¥200 を `yahoo-auctions` のみ・点（落札）ごとに限定、tier `fixed` | 楽天1点の FJ 行に payment-inside-jp が無い。ヤフオク2点で ¥400。REQUIREMENTS §8「点ごとか注文ごとか読めない」を削除 |
| T4 | **済。**rakuten 1点 ¥500、mercari 1点 ¥800。 ZenMarket 手数料をサイト別（mercari／yahoo-auctions ¥800、それ以外 ¥500）。推奨店 ¥300 は判定手段が無いので ¥500＋note | rakuten 1点 ¥500、mercari 1点 ¥800、note に「¥300 at ZenMarket Recommended Stores (not detected here)」 |
| T5 | **済。**qty 3 で Neokyo ¥350／ZM ¥800（メルカリ）・¥500（楽天）／FJ ¥500。 Neokyo・ZM・FJ の点あたり手数料を「同一商品の qty は1回」に | qty 3 で Neokyo ¥350／ZM ¥500（楽天）／FJ ¥500。Jauce は現状維持＋note「per auction」 |
| T6 | **済。**`bank-fee` ¥300、場外店舗 ¥1,000+8%、`sourceUrl` は `japan_auction_detail`、`data/fee-pages.json` に jauce のハッシュ在り。 Jauce：銀行手数料 ¥300 を追加（v1 は点ごと。原文「出品者×日で1回」を note に書き上限として扱う）、場外店舗 SiteId（suruga-ya／mandarake／zozo／hmv／toranoana／other）は ¥1,000+8%、`sourceUrl` を `https://www.jauce.com/japan_auction_detail` に | ヤフオク1点で banking-fee ¥300、suruga-ya 1点で service-fee ¥1,000、`data/fee-pages.json` に jauce のハッシュが 1 件以上 |
| T7 | **一部。**存在しなかった「Domestic handling」は廃し、`protection-plan`「Protection plan」¥500／注文にした。**Lite plan の −¥500 は未実装**——`optionalLines` に無い。 Buyee「Domestic handling」を「Guarantee plan (Standard, Buyee's default) ¥500 / order」に改名。任意欄に「Lite plan: −¥500 / order (no compensation)」 | 行キー・ラベル・note が変わり、Lite の減額が optionalLines に出る |
| T8 | **済（境界の額は為替で動いた）。**判定は intrinsic value になり、DE の関税行が切り替わる境界は**全社同時に1点だけ**（実測 ¥27,239＝ECB 転記値での €150）。完了の定義の ¥18,650／¥18,651 は判定日の為替での額。 免税限度の判定基準を商品代（intrinsic value）に（GB/DE/FR）。限度超で関税 null の行は excluded に「duty above €150 not included」 | DE で ¥18,650→¥18,651 の境界が全社同時に起きる（社ごとにずれない）。商品 £120＋送料で GB が閾値以下と判定される |
| T9 | **済。**`useCompare.ts` が `kind === 'auction'` の出品を `priceTier: 'estimate'` に落とす。 オークション（`Site.kind === 'auction'`）の価格を `priceTier: 'estimate'` に。note「current bid — final price is decided at auction end」 | ヤフオク出品を追加すると Items 行が `~` で出る。Jauce の ad-valorem 行に同じ note |
| T10 | **済**。「EMS 比較」の範囲を Verdict 直下に明示。`EmsOnlyNote` が Summary / StabilityNote の直下に常時1行出す（畳まない・条件を付けない）。文言は `src/lib/pricing/shipping-methods.ts`（各社の非EMS方式・出典 URL・確認日）から作り、原文に届かなかった社は §6 の点線で描く。`/sources#ems` に社ごとの方式一覧と出典を置き、開示から直リンク（**2026-09-06 追記: ZenMarket の原文に Arquivo.pt の写し経由で到達したので、点線の社は 0 件になった。**写しから読んだ社は `capturedOn` を持ち、`/sources#ems` に採取日を出す。`gaps.md` §8） | 「Compared using Japan Post EMS only. …（5社）… all sell cheaper ways to send the same parcel (small packet, surface mail, couriers) that we do not price, so a real order can come in under the totals below.」が順位表の上に常時出る。E2E 10件（desktop / mobile 各5）が、タップ0回で読めること・国を変えても品を足しても行を開いても消えないこと・カートを空にすると順位と一緒に消えること・リンク先が社ごとの方式と出典日を出すことを実操作で見る |
| T11 | **済。**US の `excluded` に「US import prepayment (Zonos) fee — not published」が出る（E2E `taxes.spec.ts:27`）。 US：Zonos 前払い利用料を null 行で追加（商品 $100〜800）。USPS $9.35 の note を B2 のとおりに | US の excluded に「US import prepayment (Zonos) fee — not published」が出る |
| T12 | **済（grep の完了条件は文字どおりには満たない）。**3文書が同じ主張になり、REQUIREMENTS §2 は「重量を外しても順位が動かないこと」を**約束しない**と書き、交差重量（2点1,150g／3点1,325g／5点1,625g）を実測で載せる。`grep "5x\|5倍"` が 0 にならないのは、**撤回した主張を撤回として引用している箇所**（REQUIREMENTS の撤回文・`docs/audit/*` の観測記録・この文書 §1）が残るため。 REQUIREMENTS §2・DESIGN-NOTES §1・`compare.ts` の rankStable 文言を同じ主張に揃える（倍率 [1/3, 3]、1位のみ、成立条件「重量 <4.76kg/点（1点）／<5.96kg/点（5点）」）。§1 の 3,000g 行を T1 後の実測で埋める | 3文書に同じ倍率・同じ条件が書かれ、`grep -rn "5x\|5倍" REQUIREMENTS.md docs/` が 0 件 |
| T13 | **済。**為替は ECB から転記（T13b）、`SGD Infinity threshold` は消え、SG の関税 note は `no duty on this category`。 為替を公表仲値から転記し `RATES_AS_OF` を転記日に。`rates.ts` に出典 URL。`SGD Infinity threshold` の表示を消す | 6通貨が出典の当日値と一致。SG duty note が「no duty on this category」 |
| T13b | **済**（為替の半分）。出典は ECB の euro reference rates（固定 URL・機械可読・6通貨と JPY が同じ1枚）。三菱UFJ銀行の公示相場ページは 404、日銀は USD/JPY のみで 2 日遅れだった。参照日 `RATES_AS_OF` と取得日 `RATES_FETCHED_ON` を分けて持ち、画面（`/sources#fx`・順位の見出し）は両方と出典 URL をこの定数から出す。取得は `npm run fx:fetch`（手動、ライブ取得はプロダクトに入れない） | 6通貨が ECB 2026-09-04 の値と一致（`rates.test.ts` が原文 `ECB_PER_EUR` からの割り戻しと突き合わせる）。E2E 2件が画面の日付・URL・レートを実操作で見る。**`SGD Infinity threshold` の表示は T13 に残っている** |

### P1（公開直後）

| # | タスク | 完了の定義 |
|---|---|---|
| T14 | **済**。Buyee ショッピングの同一店舗まとめ（同一 site かつ同一店舗ドメインで1注文）。**店舗は `Item` に欄を足さず出品URLから引いた**（`src/lib/pricing/shops.ts`）。欄にすると画面側の埋め忘れが黙って点ごと課金に戻り、誤りが表に出ない。rakuten / yahoo-shopping は URL の店舗コード、駿河屋・まんだらけ・ZOZO・HMV・とらのあなはドメインで1店。ヤフオク・メルカリは原文が「1件ごと」なのでまとめない。Amazon は同一出品者と読める根拠が無いのでまとめず、**まとめ損ねた点数を内訳に書く**（この過大計上は報酬を払う社に不利だが黙って安くはしない） | 同一店舗2点で purchase-fee ¥500 × 1 |
| T15 | **済。**社ごとに数値と `—` が分かれて出る（E2E `taxes.spec.ts:44`・`:66`）。 AU ≤A$1,000・SG <S$400 の代行前徴収 GST を全社に実装（基数＝商品＋手数料＋国内送料＋国際送料）。Buyee・FJ・ZM(AU) は `fixed`、Neokyo・Jauce・ZM(SG) は `unverified` | SG 基準例で GST 9% ≒ ¥1,500 が全社に出る。tier が社ごとに違う |
| T16 | **済**。EMS 行の tier を「料金の確度／重量の確度」に分離。EMS 行の tier は**その社が公表額をそのまま転嫁しているか**だけを表し、重量が推定であることは `Row.approximate` が別に数える。`emsMarkupTier` は Neokyo `fixed`（原文「We do not charge any Neokyo fee on shipping cost」）、ZM・FJ は `estimate` のまま。**Buyee は指示の `fixed` ではなく `unverified` にした**——社の記述が無く、根拠は実請求1件の一致（二次情報）だけなので、不変条件4「二次情報は点線」に従った | 価格・重量・国内送料が全て確定の入力で `approximate === false` になる入力が存在する |
| T17 | **済**。€3（DE/FR）を `unverified`——制度の原文は取れているが「代行経由の購入が distance sale of imported goods に当たるか」が断定できず、当たらなければ ¥489/点 が総額から消える。ZM 入金手数料 3.5% を `estimate`——公表値は「Funds Deposit Fee (from 1%)」だけで、3.5% は実請求からの逆算。実請求が固定するのは**掛け方（gross-up）**であって率ではない | 点線／琥珀で描かれる |
| T18 | **済。**`psa10 charizard` が graded-slab に当たり、`2024/1/7 発売`・`1/6 ドール 服`・1文字トークンは null に落ちる。 `resolveWeight`：スケール表記は前後に「スケール／scale／フィギュア」を要求、1文字 CJK トークンを削除、PSA/BGS の数字連結に対応 | `logic.md` §5 の誤爆 13 件が null か妥当値になり、取りこぼし `psa10 charizard` が当たる |
| T19 | **済**。保管料を5社の任意欄に。額を取りに行った結果、指示の想定と3社ずれた: **Neokyo は額が在った**（/en/storage の週次表 Small ¥350〜Large ¥1,400。fees ページと FAQ しか見ていなかったのが原因）。**FROM JAPAN は有料延長が存在しない**（60日で廃棄・延長不可 help_logistics_110）＝分かっている 0 なので 0。Jauce だけ「monthly storage fee」で額が無く null。Buyee は梱包後重量で段が決まるので個口ごとに実額。任意費目の型に `amountFor`（個口・重量・点数から実額）と null 額を足し、note（単位・上限）も画面に出す | 5社の optionalLines に storage 行が出る |
| T20 | **済。**`assertUsableInput()` が NaN／Infinity／qty 0 で投げる。 `compare()` 入口で `Number.isFinite` と `qty >= 1` を検査 | NaN／Infinity／qty 0 で例外か空結果。順位表に NaN が混ざらない |
| T21 | **済**。FJ Protection Plan の二重計上を削除（原文 title_serviceRule_670 で必須＝既に service-fee にある）。**輸出通関 ¥2,800 は5社すべてに**——これは代行の費目ではなく日本郵便の費目なので、日本郵便の原文（輸出申告代行手数料 2,800円／件、複数個口は合わせて1件）に当たって `EXPORT_DECLARATION_FEE_YEN` に出典ごと置き、額を書いていない Neokyo・ZenMarket も「書いていない」を note に出したうえで同額で出す（ZM は Arquivo.pt の写しを全文検索して記載が無いことを確認）。Neokyo 開梱＝¥1,000＋その個口の梱包料。Jauce は割れ物梱包 ¥600+¥240/kg（必須 Smart Packing の**代わり**なので全額＋置き換えの note）・速達・写真・個別作業を追加し、プレミアム保険 1.9% は**基数が原文から読めない**ので額 null。Buyee 写真 ¥300/個口、FJ 外注梱包（「実費」なので null）も追加 | 各社の optionalLines が fees.md の原文一覧と一致 |
| T22 | **一部。**対象 URL は足した（日本郵便のお知らせ JSON・ECB・jauce、さらに輸出申告代行手数料のページ）。**「直近実行が全件 200」は未確認**——`data/fee-pages.json` に記録が在るのは 12 件で、最後に足した `sendover20` はまだ記録が無い（次の `npm run fees:check` で入る）。 監視：`fees-check.ts` に日本郵便の国際郵便お知らせページと為替の出典を追加、jauce の新 URL を登録 | 週次 Action の対象 URL 一覧に 3 件増え、直近実行が全件 200 |
| T22b | **済**（為替の分）。`fees-check.ts` が ECB の出典を見る。**ハッシュでは見ない**（参照レートは毎日変わるので毎週必ず差分が出て、出た瞬間に意味を失う）。見るのは (a) `rates.ts` の値と出典の値のずれが 2% 以上か、(b) 転記が出典の参照日より 14 日以上古いか、(c) 通貨が出典から消えたか。消えた通貨は据え置いて報せるだけで、推測で埋めない | `npm run fees:check` が「為替は出典の 2026-09-04 値と 2% 以内（転記は 2026-09-04、2026-09-06 確認）」を出す。閾値 2% の根拠は ¥20,000 で ¥400＝実測の籠で1位と2位を分ける ¥50 より大きいこと |

### P2 / P3

| # | タスク | 完了の定義 |
|---|---|---|
| T23 | **済**。州選択を作った（既定は未選択）。率は **CBSA Memorandum D2-3-6 Appendix A**（輸入品に対する州税の徴収表。州の財務省ではなくこちらを正とする——国境で取られる率は州が住民に課す率と一致しないことがあり、徴収協定が無い州では国境で取られない）。**州の取り分だけを行にする**（連邦 GST 5% の行が別に在るので、HST 13% を1行で出すと二重計上）。未選択でも `—` にせず、Statistics Canada 2026-04-01 推計の**人口加重平均 7.3%** を tier estimate で出し、note に「州を選ぶと確定する」と書く。単純平均にしないのは、人口 4 万の準州（0%）が1,610 万のオンタリオ（8%）と同じ重みになるため。AB・準州3つの 0% は**取得できた 0**なので tier fixed のまま、理由を note に書く。Canada Post の CAN$9.95 は原文（「a handling fee of CAN$9.95 per dutiable or taxable mail item」）を取り、**C$20 以下では 0**（同ページが「CBSA doesn't assess duty or tax on mail items valued at CAN$20 or less」と書いている＝発生しないことが取得できている）。行き先を変えると州の選択は捨てる——残すと選んだ覚えの無い率が確定値の顔で出る。**残るカナダの未取得は関税率だけ**（T24） | ON で HST 13%（州税 8% ＋ GST 5%）が数値。未選択でも数値（estimate）。ユニット8件と E2E 8件（desktop / mobile 各4）が**実操作で**選んで確かめる |
| T24 | **済（3つのうち、額を出せたのは AU だけ。残り2つは「何が言えるか」を出した）。**詳細と、やらないと決めた範囲の理由は §6 の3行 | 米国は該当カテゴリで Duty 行の**文言と確度**が変わる（額は変えない）。AU は A$1,000 以下が `—` から**公表された ¥0** に、超えると数値。GB は酒が入ったときだけ excise の null 行が出て excluded に載る。ユニット20件と E2E 6件（desktop / mobile 各3）が実操作で見る |
| T25 | Jauce 入金手数料の方式（gross-up か加算か）を原文とサポートに確認して直す | 原文の引用と実効率が `services.ts` の note に載る |
| T26 | **済**。同額は同順位（競技順位 1-1-3）。第2キーを消した。**社名の辞書順は無害ではなかった**——同額 3,938 組のうち 3,716 組（94%）で報酬を払う社が報酬ゼロの社より上に置かれていた（`'Buyee' < 'Neokyo'`）。CHEAPEST は**同額の全行に付ける**（「これより安い選択肢は無い」という事実の表明で、1社を推すバッジではない。どちらにも付けない案は「最安が存在しない」と読める）。同順位の縦の並びは `SERVICES` の宣言順で意味を持たないので、画面が `tied with … — the order between them means nothing` と行内で打ち消す。「1位が動いたか」（`rankStable` / `weightSensitivity` / 段ごとの最安）は集合で見る——`rows[0]` で見ると並びの偶然を「順位が動いた」と読む。実測は `docs/audit/ties-2026-09-07.md`（`npm run ties:scan` で測り直せる） | 同額2行で rank が同じ値。ユニット7件と E2E 2件（desktop / mobile 各2＝4）が**実操作で**同額を作って見る（AU・楽天・¥4,200・450 g で1位タイ、US・ヤフオク・¥12,800・1,450 g で2位タイ） |
| T27 | **済**。判定はしない（品目分類も内容品の申告も持っていない）。**免責は `What could be off` ではなく順位表の隣に置いた**——あの節は費目の表より下に在り、総額を読んで離脱した人には届かない。`EmsOnlyNote` と同じ場所・同じ約束（畳まない・条件を付けない・順位が出ているあいだ常に出る）にした。原文は日本郵便の禁制品ページ（`src/lib/pricing/restricted-goods.ts` に URL と確認日）: 酒は 24% 超が全世界共通で不可・24% 以下は宛先次第、リチウム電池は機器内蔵のみ可で**宛先の一覧に英国とドイツは無い**、刀剣等は凶器類ラベルが要り国内を航空輸送しない。**24% と刀剣等の記述は英語版に無い**ので出典は日本語版を指し、`/sources#restricted` にそう書く。酒がカートに当たったとき（`Item.weightLineId` が sake ライン）は強い警告を足す。**取れなかったもの**: 国別禁制品表はJS のフォームで国ごとの URL が無く、宛先別の酒の可否は取れていない | 順位表が出ているあいだ常に画面にある。ユニット10件と E2E 8件（desktop / mobile 各4）が**実操作で**、7カ国すべてで消えないこと・品を足しても行を開いても消えないこと・カートを空にすると順位と一緒に消えること・酒を入れると強い警告が足され外すと消えること・リンク先が原文と確認日を出すことを見る |

---

## 6. やらないと決めたこと（理由つき）

| やらない | 理由 |
|---|---|
| **宅配便（FedEx / DHL / UPS / SF / ECMS）の料金を出す** | **2つが立っているため**（**2026-09-07 に3つから2つに減った。**理由は表の下の訂正）。~~①料率が非公開~~ ——公表された料金表が無いのは事実だが、**額は公開の見積 API で取れる**ので価格化できない理由にはならない。②**通関が別モデル**——郵便の通関手数料モデル（US $9.35 / GB £8 / DE €7.50 / CA C$9.95 / SG S$10.90）が使えず、自社が通関業者になる経路になる。この表の「米国 FedEx／DDP 経路の課税モデル」の行がこれ。③**容積重量の軸が要り、寸法が入力に無い**。この表の「容積重量」の行がこれ。**ただしこれは我々の設計の問題で、箱を仮定すれば解ける。**②とは性質が違う。**中途半端に送料だけ差し替えると、送料は下がり通関は上がるという向きが逆の2つの誤りが総額に同居し、EMS 一本より悪くなる。**（**日本郵便の他方式**＝小形包装物・国際小包の航空/船便は、2026-09-07 にこの表から外した。表の下を見ろ） |
| カード外貨手数料・請求通貨の差 | カード発行会社ごとに違い、一次情報が無い。What could be off に「Your card may add 2–4% FX; Buyee bills in your currency, Neokyo in yen」の1行で止める |
| 容積重量 | EMS は実重量課金（寸法は上限のみ）。**日本郵便の他方式も実重量課金なので、そちらを足しても要らない。**要るのは宅配便だけで、**寸法が入力に無いことが上の宅配便の行の理由③** |
| FJ 会員ランク割引の実装 | 率が原文から読めない。開示のみ |
| 原産国・HTS 別の関税（P2 以前） | 入力に品目分類が無い。B1 の note で仮定を明示する。フィギュア・ゲームでは 12.5% が当たっている（taxes §1 の HTS 実引き） |
| **米国の関税額をカテゴリごとに変える（T24）** | **やらない。**12.5% は Section 301 が日本産品に置いた下限で、実効は `max(MFN, 12.5%)`。重量表のカテゴリからは「そのカテゴリに入りうる見出しの MFN が 12.5% を超えるか」までしか言えず、**見出しを1つに決めるには素材・構造・単価が要る**（靴は同じ 6404.11 の中で 7.5%〜37.5%、鞄は素材で 9%〜17.6%、時計は個数あたりの定額が混ざる）。決めれば推測になる。だから**額は変えず、確度と文言を変えた**: 全見出しが 12.5% 以下と確かめられたカテゴリ（figures / music / tcg-singles / kpop / fishing-tackle）は「これが税率であって下限ではない」と引いた見出しごと書き、超えうるカテゴリ（sneakers / used-luxury / sports-goods）と従価でないカテゴリ（food-tea-sake）は「下限にすぎない・請求はこれより高くなりうる」と書いて tier を estimate に落とす。**混ざった籠は弱いほうに合わせる。**分類できない品が1点でもあれば従来どおり「仮定」と名乗り、確度は据え置く（「分からない」は「超えると分かった」ではない） |
| **収集品の Section 301 適用除外（Annex II Part A）を当てる** | **やらない。**除外は 9701〜9705（美術品・切手・収集品）で、重量表のどのカテゴリもそこに落ちない（中古ブランド品は 4202/9102 であって 9705 ではない）。除外に当てれば関税が 12.5% → 0 になるので影響は大きいが、当てる根拠が無い。Annex 本文も 431 ページ中 2 ページしか確認できていない（§8） |
| **英国の酒税を金額で出す（T24）** | **やらない。**発生は確実で、原文もある（gov.uk「you'll be charged Excise Duty at current rates」。£135 も £39 も効かない）。出せないのは**税率が ABV の帯と純アルコールのリットル数で決まる**ため。重量表が持っているのは瓶の容量だけで、**ABV はどこにも無い**。ABV を仮に置けば、その1つの仮定で税額が丸ごと決まる。だから額は null にして `excluded` に名前を載せる（米国の Zonos 利用料と同じ形）——「発生するのに額を知らない」を画面に出す。日本酒の ABV を出品ページから読めるようになったら、ここは実装できる |
| 国内送料 ¥800 の引き下げ | 実勢サンプル 4 件（¥220〜700）は少なく、Buyee 公表レンジ ¥150〜1,500 の中央値に近い。T2 後は全社に等しく乗るので順位に効かない。レンジを note に書く（B9） |
| 実請求との一致を公開条件にすること | 2024 年以降の内訳つき実請求は全社で 0 件、Neokyo は全期間で 0 件（reality §5）。取れない条件を条件にしない。**公開条件は「各社の公式料金ページ（一次情報）との費目単位の一致」**とする |
| A10（Buyee 同一店舗まとめ）を公開条件にすること | 誤りの向きが Buyee を高く見せる側で、報酬を払う社に不利。開示して P1 |
| LLM による重量・価格の推定 | 不変条件3 |
| 米国 FedEx／DDP 経路の課税モデル（Neokyo 13.4%＋ブローカー） | 郵便の通関経路の外なので、郵便の通関手数料モデルが当たらない。**これが上の宅配便の行の理由②。**日本郵便の他方式（郵便のまま通関する）には要らない |

### 2026-09-07: 「配送方法の選択（EMS 以外の料金）を v1 で出す」を、この表から外した

原文（判定日 2026-09-06 の1行。**消さずに残す**）:

> **配送方法の選択（EMS 以外の料金）を v1 で出す** ｜ 各社の非EMS請求額はログイン必須の見積りで一次情報が取れない（gaps §5）。日本郵便の公表額を当てると「各社がそのまま転嫁している」という推測になり、Buyee は AIR Packet で上乗せを明記している（gaps G14）。不変条件4に反する。代わりに「EMS 比較」であることを画面に書く（T10）。**順位はこの範囲では守られる**（gaps §2(a) の実測）

**理由として書いた2つが 2026-09-07 に一次情報で否定された。**

1. **「ログイン必須で一次情報が取れない」は成り立たない。**各社の送料計算機は公開されていて、
   アカウントも規約同意も要らない。**1回まわすと全方式が同時に出る**——ZenMarket のスペイン向け
   見積で、船便 / FedEx / UPS / DHL / EMS の5方式が1つの見積から出ている実例がある。
2. **「公表額を当てると転嫁の推測になる」は、EMS でも同じ推測をしている。**
   `src/lib/pricing/services.ts` の `emsMarkupTier` は Buyee が `unverified`、
   ZenMarket と FROM JAPAN が `estimate`（`fixed` は Neokyo と Jauce だけ）。
   **EMS だけこの推測を許して他方式を拒む根拠にはならない。**

**そして障壁は方式で割れる。日本郵便の他方式と宅配便を同じ行で扱ってはいけなかった。**

| | 日本郵便の他方式（小形包装物・国際小包の航空/船便） | 宅配便（FedEx / DHL / UPS / SF / ECMS） |
|---|---|---|
| 料金 | **公開済み**（`post.japanpost.jp/send/oversea/charge/list-normal｜list-parcel/zone1〜5`） | **料金表は非公開**（各社が個別交渉した料率）。**ただし額は取れる**——見積 API が公開されており、便ごとの `Price`（円）を JSON で返す（2026-09-07 確認。`docs/O2-COURIER-RUN.md`） |
| 所要日数 | **公開済み**（代行各社。Buyee: 船便 1-3 months / 国際小包 12-26 days。Neokyo: Surface "A few months" / Airmail "<10 days"） | 公開済み（FedEx 2-7 days / DHL 1-4 / UPS 1-3） |
| 通関の経路 | **郵便のまま。**現在の輸入側モデル（郵便の通関手数料 US $9.35 / GB £8 / DE €7.50 / CA C$9.95 / SG S$10.90）がそのまま使える | **別モデルが必要。**自社が通関業者になる（＝上の表の「米国 FedEx／DDP 経路の課税モデル」の行） |
| 容積重量 | **不要**（実重量課金） | **必要**（＝上の表の「容積重量」の行）。**寸法は入力に無い**——ただし見積 API は `width/height/depth` を引数に取り、`ShippingLimitsParamA-CInCm` で各便の寸法制限も返す。**箱を仮定すれば解ける**（梱包後重量を `×1.2+300g` と仮定しているのと同じ性質） |

→ **日本郵便の他方式は「やらない」から外し、実装に着手する。**
→ **宅配便は「やらない」に残す**（上の表の1行目）。

> **2026-09-07 訂正。**ここには理由を「料率の非公開・通関の別モデル・容積重量の3つが
> 同時に立つ」と書いていたが、**①が結論として間違っていた。**公表された料金表が無いのは
> 事実だが、**額は公開の見積 API で関数として評価できる**（`POST calc.aspx/Calculate` に
> `{weight, country, width, height, depth}` を渡すと便ごとの `Price` が返る）。
> **「表が無い」から「価格化できない」を導いていたのが飛躍。**
> 表を持たなくても、十分な点を取れば形は決まる——Jauce の船便の上乗せ `+¥250/kg段` は
> 実測3点から決めており、同じ手が使える。
>
> **残る本当の障害は2つ。**②**通関が別モデル**（自社が通関業者になるので郵便の通関手数料が
> 当たらない）——これは相手側の事実で、我々の努力では消えない。
> ③**寸法が入力に無い**——これは**我々の設計の問題**で、箱を仮定すれば解ける。
> ①②③を同列に並べていたのが誤り。**性質が違う。**
>
> 次の一歩は `docs/O2-COURIER-RUN.md`（「寸法を渡さなくても額が出る便はどれか」を
> 各社1回で確定させる）。出る便があれば、それは日本郵便と同じ形でそのまま載る。

なお **`EmsOnlyNote`（T10）は日本郵便の他方式が入るまでそのまま**：いま画面が出している
「EMS のみで比べている・各社はもっと安い送り方を売っている」は、実装が EMS 1本である
あいだは事実のままである。

---

## 7. 監査同士の矛盾（判断を保留したもの）

| 論点 | 主張 A | 主張 B | 扱い |
|---|---|---|---|
| USPS $9.35 の tier | taxes §1「一致。`unverified` から上げてよい」 | gaps W5「DDP 前払い経路では発生しない疑い。撤回すべき」 | **保留。`unverified` のまま**、note に条件を書く（B2）。判断には USPS が DDP 郵便物に手数料を課すかの原文が要る（§8） |
| ZenMarket の取得可否 | fees／gaps「Wayback も egress 拒否」 | reality §3.4「Wayback 2026-07-25 を取得」 | **今日 reality を再現できた（§0）。reality を採る** |
| EMS 15kg 超 | logic L3「表の外は丸めるな」→ `1a28305` が null 化 | gaps G4「表は 42 段ある。null 化は誤り」 | **今日 42 段を確認（§0）。gaps を採る**。`1a28305` の変更は撤回対象（T1） |
| Jauce 入金手数料 | fees「gross-up は誤り（加算）」／reality R6「加算が正しい」 | logic B10「計算は正しい、解釈が未検証」。reality 自身の 2015 実請求は 4.15% で現行 3.9% と合わない | **保留（T25）。差は ¥22〜63 で順位に効かない** |
| Buyee おまとめ梱包 ¥500 | fees「2022-12-21 に一律免除（/consolidate 原文）」 | reality §3.2「現行公式ページにオプション費用として載っている」 | **保留。両方の URL を再取得して原文を並べるまで任意欄に入れない** |
| 順位の頑健性の倍率 | REQUIREMENTS §2「1/3〜5倍」 | DESIGN-NOTES §1「×1/10〜×3」／compare.ts `[1/3, 3]`／logic L5「1点 8倍で入替」 | 矛盾。**実測（logic L5）に揃える**（T12） |

---

## 8. 取れなかった一次情報（次に取りに行く人のために）

| 項目 | 状態（2026-09-06） | 試したこと・手がかり |
|---|---|---|
| ZenMarket 公式（直） | 403（Cloudflare の managed challenge。**JS を実行しないと通れない**） | **写しなら読める。**(a) Wayback 2026-07-25（§0）。(b) **Arquivo.pt に 2025-11-27 の写しが一式ある**（`fees` `help`(2025-12-10) `calc` `weight` `payment` `recommendedshops` `othershops` `prohibited_items` `useragreement`）。取り方と URL は `docs/audit/gaps.md` §8.5。**配送方式一覧はこれで取得済み。**同梱の既定挙動・SG GST は未確認のまま |
| ZenMarket 公式（直）を live で読む道 | **無い。**素通しは静的拡張子と `/api/...` だけで、そこに HTML は無い | UA・Accept・sec-ch-ua・リダイレクトの総当たり、`r.jina.ai`、urlscan、Common Crawl、Playwright の実 Chromium まで試した記録が `gaps.md` §8.2–8.3 |
| Royal Mail の £8 立替手数料 | 403／503 | royalmail.com、help.royalmail.com、価格表 PDF |
| Deutsche Post／DHL（DE）、La Poste（FR）の通関立替手数料 | 404／未着手 | deutschepost.de、zoll.de 英語ページ |
| USPS が DDP 前払い郵便物に $9.35 を課すか | **原文の場所が判明。まだ読んでいない** | **`https://pe.usps.com/text/imm/immc7_002.htm`（IMM 712 Customs Clearance and Delivery Fee）が 200 で読める**（2026-09-06 確認）。`www.usps.com/…/international-mail-manual.htm` は 404 なので、そちらを見ると「読めない」に見える。§7 の保留を解く鍵 |
| Zonos の1件あたり利用料 | 額が非公開 | Zonos Docs は「vary by post」。日本郵便 PDF も額を書かない |
| Neokyo・Jauce・ZenMarket(SG) の OVR／GST 登録 | 未取得 | 各社の SG／AU 向け案内ページ。IRAS の OVR 登録事業者検索 |
| Neokyo の週次保管料の額、Jauce の月次保管料の額 | ページに額が無い | fees／FAQ とも「size による」 |
| Neokyo・Jauce の有料会員の有無 | 記載なし | 「無い」と断定できる文も無い |
| FJ 会員ランクの国際送料 %OFF の率 | テンプレ変数で読めない | `translate/en_help.txt` `help_other_490-640`。ログイン後の画面 |
| Buyee の EMS 上乗せの明示 | AIR Packet のみ「preparation fee」の記載 | R4（2021）で EMS は公表額と一致 |
| Buyee おまとめ梱包 ¥500 の現行有無 | fees と reality が矛盾（§7） | /consolidate と /fees の両方を同日に再取得 |
| EU €3 が代行購入（DSIG か）に適用されるか | 規則本文で断定不能 | Reg 2026/382、ZenMarket EU VAT ガイド（403） |
| ATO の redeliverer 規定原文 | 403（Akamai） | ABF の IPC 表と Buyee の案内で代替済み |
| Federal Register の郵便 informal entry 規則本文 | リダイレクトで不可 | CBP FAQ と大統領令で代替済み |
| USTR FRN Annex（書籍・情報資料の 301 除外範囲） | 431 ページ中 p.28・p.241 のみ確認 | Annex II Part A |
| 日本酒の ABV | **出品にも重量表にも無い**（重量表が持っているのは瓶の容量だけ） | これが取れれば GB の酒税は計算できる（税率表は取得済み: gov.uk alcohol duty rates、2026-02-01 施行、8.5〜22% ABV の帯） |
| 日本郵便 国別条件表（酒類・国別上限重量） | **依然として取れない**（2026-09-07 再試行）。`https://www.post.japanpost.jp/cgi-kokusai/` は JS のフォームで、国ごとに開ける URL が無い。`<option>` すら HTML に無い | Neokyo 側の「米国宛 20kg」で代替。T27 の警告は「宛先が決める」までで止め、どの宛先が拒むかは書かない |
| 日本郵便 禁制品（酒 24% / リチウム電池 / 刀剣等） | **取れた**（2026-09-07）。全世界共通の代表例に「アルコール飲料 アルコール濃度24％を超えるもの」、リチウム電池は機器内蔵のみ可＋宛先の列挙（**英国・ドイツは無い**）、刀剣等は凶器類ラベル・国内は航空輸送しない | `https://www.post.japanpost.jp/int/use/restriction/index.html`（24% と刀剣等は**日本語版にしか無い**）、`.../upc_en.html`（リチウムの宛先一覧、英語）、`.../restriction02.pdf`（リチウムの条件4項目）。T27 で `src/lib/pricing/restricted-goods.ts` に置いた |
| Canada Post CAN$9.95 の本文 | 検索結果の要約のみ | canadapost-postescanada.ca |
| 各社の非EMS 見積り額 | ログイン必須 | 5社とも |
| Neokyo の実請求 | **0 件** | MFC スレッド 403、Neokyo 見積りツールは Cloudflare チャレンジ。英語圏の議論は MFC／Discord に集中 |
| FJ の総額つき実請求 | 0 件（部分 1 件） | 比較記事は互いに矛盾し出典が無く不採用 |
| 2024 年以降の全社の内訳つき実請求 | 0 件 | 日・英・繁中で検索 |
| Jauce の同一オークション複数個の手数料 | 記載なし | japan_auction_detail |
| ZenMarket の出品ページ直リンクの検証 | **不可（判定不能）** | 実在IDも架空IDも同じ 403 を返すので、2条件のどちらも見えない。形が実在することだけは Arquivo.pt の `auction.aspx?itemCode=…` の写しから分かるが、「形が在る」と「その出品に着く」は別（`gaps.md` §8.6） |
| Neokyo の出品ページの URL の形 | **不明** | `robots.txt` の `Disallow: */product/` から `/{lang}/product/{store}/{id}` らしいが、候補パスは全て Cloudflare 403 で当否すら見えない。sitemap に商品 URL は 0 件（`gaps.md` §8.6） |
| Royal Mail / La Poste / Deutsche Post / Canada Post | 403 / 403 / 404 / 404（2026-09-06 も同じ） | 上の各行のとおり |
