# 比較画面の注意書き — 3段階の仕分け

調べた範囲: `src/components/compare/*`（`Calculator.tsx` から辿った）、`src/lib/pricing/compare.ts`・`services.ts`・`restricted-goods.ts`、`src/lib/ui/tiers.tsx`。コードは 2026-09-13 時点の main と同じ。

仕分けの基準は「その注意を知るとユーザーの選択が変わるか」。
- **段1 読み飛ばせない**: 順位、送れるかどうか、どの社を選ぶかが変わるもの。該当する行やカードの中に文字で常に出す。ホバーに頼らない。
- **段2 数字に付ける**: 金額の確からしさが変わるもの。数字の形で示す（`+` は上限不明、`≈`、線の種類 fixed=実線／estimate=破線／unverified=点線／none=線なし、幅の書き方）。根拠はタップで見せる。
- **段3 必要な人だけ**: 前提・範囲・仕組みの説明。小さな印＋ポップオーバー（タップとキーボードで開ける）か /sources に置く。

表の「置き場所」列の意味: ボード行＝RankBoard の各社の行／条件1行＝その条件が成り立つときだけボードの上に出す1行／配達ログ＝行を開いた内訳（RowBreakdown・CostTable）の該当する段／数字の形＝金額の表記そのもの／/sources＝出典ページ。

## 一覧

| # | 注記（コンポーネント/フィールド） | 表示条件 | 伝えている内容（要約＋原文の短い引用） | 段 | 置き場所 | 表示文言案（英語） |
|---|---|---|---|---|---|---|
| 1 | `StabilityNote` ← `rankStabilityNote`（重量が分かっていて安定） | `rows` があり、`rankStable=true` で判定不能でない | 重量が3倍ずれてもおすすめ枠の顔ぶれが変わらない。"stays in the recommended range even if we are off by 3x on weight" | 3 | 印＋ポップオーバー（おすすめ枠のバッジに付ける） | "Holds even if weights are 3x off." |
| 1b | 同上。安定だが範囲外に出る場合（`outOfTable`） | 1 のうえで、重量を ÷3／×3 したときに表から外れる（誰にも値段が付かない、または枠が縮む） | "Beyond that, no priced rate covers the parcel for …" | 3 | 同上 | "Past 3x, no rate covers it." |
| 2 | `StabilityNote`（不安定） | `rankStable=false` かつ判定不能でない。⚠ と「Check the weights」ボタンが付く | 重量次第でおすすめの社が変わる。倍率ごとの勝者を名指しする。"The recommended range changes with the weight: at a third of … X; at three times … Y" | **1** | 条件1行（ボードの上）＋重量欄へ飛ぶリンク | "Cheapest changes with weight: lighter → X, heavier → Y. Check weights" |
| 3 | `StabilityNote`（判定不能）← `indeterminateNote` | `rankIndeterminate=true`（比較できる全社がおすすめ枠か同等に収まっている） | どこが勝つか区別できない。先頭が最有力。"we can't tell which one wins. X looks the most likely." | **1** | 条件1行 | "Could go either way — these N are within our error. X leads." |
| 4 | `RankBoard` の判定不能時の誘導行 | `rankIndeterminate=true` | 総額を動かすのは社より配送方法。"Shipping method moves the total more than company choice does." ＋ Change shipping method | **1** | 条件1行（3 と一緒にする） | "Method matters more than company here. Change method" |
| 5 | `rankStabilityNote`（どこにも値段が付かない） | 比較できる行が1つもない（`!first`） | "No published rate covers this parcel for …, so we cannot compare these totals." | **1** | 条件1行（ボードの代わりに出す） | "Can't compare: no published rate covers this parcel for {method}." |
| 6 | `rankStabilityNote`（重量不明の段ごと）＋ `Summary` の " at {band}" | `hasUnknownWeight`（計算機の UI はもう通らない経路） | 段ごとのおすすめ枠。"The recommended range changes with weight — 500 g: …" | 1（到達すれば） | 条件1行 | 2 と同じ形 |
| 7 | `Summary`（"X is cheapest" / "are tied cheapest" / "costs at least ¥ more"） | 比較できる行が2つ以上。判定不能のときは断定部分を出さない | 1位と差額。1位か相手の総額が確定していなければ "at least" | 2（言い方）／順位の見出し | ボードの見出し＋数字の形 | "X is cheapest · others +¥…" |
| 8 | 差額表示 `diffText`: CHEAPEST／LEADS／`at least +¥` | 各行。判定不能なら LEADS にして緑をやめる。どちらかの総額が確定していなければ at least | 差額が下限でしかないこと | 2 | 数字の形（`+¥1,295+` や `≥` などにそろえる） | "+¥1,295 or more" |
| 9 | `row.tied` ← `tiedText` | 比較できる他の行と `total.low` がちょうど同じ | "tied with X — the order between them means nothing" | **1** | ボード行 | "Tied with X — order means nothing." |
| 10 | おすすめバッジ `★ Recommended — sole top pick / either works`（`recommended`） | 判定不能でなく、枠に入っている | 1社なら単独1位、2社ならどちらでもよい | **1** | ボード行 | "Top pick" / "Either of these two" |
| 11 | `Equivalent` バッジ（`equivalent`、title で補足） | 判定不能でなく、1位の幅に重なるが枠が2社で埋まっている | 補足文 "Within the top pick's range, but the recommended box already holds two companies" はホバーでしか読めない | **1** | ボード行（補足をホバーから文字に出す） | "As cheap as the top pick, within error." |
| 12 | `notComparableReason` ＋ 差額 `NOT COMPARABLE`・総額 `—` | `comparable=false`（国際送料が取れない） | その社では送れない、または値段が無い理由。例: "X does not sell any Japan Post method to …", "has no published rate above 30 kg …", "can only be selected under ¥… declared value", "outside this method's size limit", "has not priced this courier … yet" | **1** | ボード行（理由を文字で） | "Can't ship this: {reason}." ／ "Not priced: {reason}." と、送れないのか値段が無いだけかを分ける |
| 13 | `row.excluded` → `excl. …` | 行に `amount == null` の費目がある | 総額に入っていない費目の名前（例: outsourced packing、package consolidation、UK excise、US duty prepayment、destination courier fees） | 2 | 数字の形（総額に `+`）＋配達ログのその段 | "+ unpriced: packing" |
| 14 | 総額の `(upper bound unknown)`・`or more`・RowBreakdown の "— no upper bound" と "upper bound unknown — see “no upper bound” rows above" | `total.high === null`（上限の推定も置けない null 行がある） | 上限が青天井 | 2 | 数字の形 `¥32,957+` ／配達ログのその段に「上限なし」 | "¥32,957+ (no cap known)" |
| 15 | 総額の `~`（`row.approximate`） | 価格か重量が推定、または費目のどれかが estimate | 総額が推定 | 2 | 数字の形 `≈` | "≈¥31,700" |
| 16 | `Amount`/`TierLegend`（Plain / ~amber / Dotted / — = not included, not zero） | 金額すべて。凡例は `Calculator` と `CostTable` の両方に出る | 確度の4段階。title でも補足 | 2 | 数字の形（線の種類）。凡例は印＋ポップオーバーへ | "Solid = published · dashed = our estimate · dotted = second-hand · none = not in total" |
| 17 | `CostTable` の列見出しの破線／実線（`primarySource===false`、title だけで説明） | lg 以上のみ | その社の料金表が二次情報 | 2 | 数字の形（列ごとに点線）＋タップで根拠 | "Fee table from a second-hand source." |
| 18 | `Line.note`（全費目。例: "zone 3, 1 parcel, 1.5 kg step (weight after our packing allowance), published rate, no markup — a week or less, tracked"） | 行を開いたとき（RowBreakdown、全費目で常に出る） | 計算の根拠、日数、追跡の有無 | 3（日数・追跡は下の 19） | 配達ログのその段 | そのまま短くする |
| 19 | 国際送料 note の日数・追跡（`spec.days`, tracked/no tracking） | 行を開いたとき | 速さと追跡の有無。コードのコメントに「額だけ出すと安い方を選ばせる誤誘導」とある | **1**（方式が違う行があるとき） | ボード行（方式が混ざるときだけ） | "~1 week, tracked" / "1–3 months, untracked" |
| 20 | `Line.rangeNote`（保管料の size band、宅配便の測定点の間、清算手数料の仮定） ＋ `amountKind:'range'` | その費目が range のとき | 下端と上端の置き方。例: "low = the measured price at the weight point just below; high = just above" | 2 | 数字の形（`¥a–¥b`）＋タップで rangeNote | "¥a–¥b depending on box size" |
| 21 | 通関手数料をゼロと仮定する行（`courier-clearance-fee` の label/note） | 宅配便で、関税や税がかからない単位がある | 手数料を取らないと仮定している。外れると最大 ¥X 低く出る。"if that assumption is wrong this row understates by up to ¥…" | 2 | 数字の形（幅）＋配達ログ | "¥0–¥X — we assume no fee when no duty is due" |
| 22 | `row.surface` → "Surface option — …: ¥… shipping, {days}. not used as the default because it takes … — shown separately for anyone willing to wait" | 船便（または courier-surface）に値段がある社 | 待てるなら安い別の方式がある | **1**（安さと日数で選択が変わる） | ボード行（副次行。今もボード行にある） | "Wait {days}: ¥… by sea." |
| 23 | `row.referralNote` / "pays us nothing" | 全行、常に | 紹介料をもらっているか | 3（順位に影響しないと明言済み）。ただし開示の義務があるので隠さない | ボード行に小さく（常時。ポップオーバーに入れない） | "Pays us ¥100 per sign-up" |
| 24 | `row.tag`（"5 orders · 5 parcels"、" assumed"、" · you must request this"） | 全行。assumed は `parcelVerified=false`、request は consolidated 行 | 個口数。1箱にまとまるかは未確認。同梱は自分で頼む必要がある | **1**（request this・orders≠parcels）／2（assumed） | ボード行 | "1 box — only if you ask" / "5 separate parcels" / "1 box (assumed)" |
| 25 | `ConsolidationCallout` | default 行と consolidated 行が両方あり、差が 0 より大きい | "ask them to consolidate before shipping. It may reduce the total by about ¥…" ＋ 無料かどうか未確認（high=null のとき） | **1** | ボード行（Buyee の行の中。今はボードの下に独立した枠） | "Ask Buyee to combine: saves ~¥16,000 (fee unknown)." |
| 26 | `EmsOnlyNote`（scope-disclosure） | `rows` がある、常時 | 日本郵便の N 方式で比べた。大きさは見ていない（"a parcel's size is never checked, and an oversize one is refused however light"）。値段を付けた宅配便と付けていない宅配便の社名 | 3（範囲の説明）。ただし「大きさを見ていない＝重くなくても断られる」は 30 と同じ中身 | /sources ＋ 印とポップオーバー | "Compared: N Japan Post methods + couriers for A, B." |
| 27 | `RestrictedGoodsNote`（常時） | `rows` がある、常時 | 送れない品があるかもしれないが、こちらは確かめていない。"We do not check, so a total here is not a promise that the parcel can be sent." | 3（中身を見ない一般論） | /sources ＋ 印 | "We don't check if items are shippable." |
| 28 | `RestrictedGoodsNote` のリチウム行 | `LITHIUM_AIRMAIL_LISTED[country]===false`（GB, DE） | 宛先がリチウム電池入りの航空郵便を受け付ける国に載っていない | **1**（電池入りの品なら郵便では送れない） | 条件1行（その国のときだけ） | "Japan Post won't airmail lithium batteries to {country}." |
| 29 | `AlcoholInCartNote` | カートに重量表の酒ラインに当たる品がある | 24% を超える酒はどこへも郵送できない。それ以下は宛先次第。"these totals may belong to a parcel that cannot be sent" | **1** | 条件1行（強い色） | "Alcohol: over 24% can't be mailed at all — totals may be for an unsendable parcel." |
| 30 | `LongItemsInCartNote` | カートに重量表の「長い品」ラインに当たる品がある | 長い荷物は値段を付けた方式でも断られうる。どれが受けるかは言えない | **1** | 条件1行 | "Long item: some methods above may refuse it — we don't know sizes." |
| 31 | `FreeShippingDomesticNote` | `rows` があり、`freeShipping` の品が1つでもある | Buyee だけ、送料無料と書いてあっても国内送料がかかりうる。"Buyee's total above may be higher than shown" | 2（Buyee の数字の確からしさ）。僅差なら順位にも効く | 数字の形（Buyee 行の国内送料を破線にして `+`）＋タップで出典 | "Buyee may add domestic shipping despite ‘free shipping’." |
| 32 | 未取得価格の件数注記（Calculator） | `unpriced.length > 0` | "N items have no price yet and are not in these totals." | **1**（カートの中身が総額と違う） | 条件1行 | "N items not priced — not in totals." |
| 33 | 全品価格未取得の空状態 | `pricedCount===0` | "Enter a price above to compare" | 1（ボードの代わり） | ボード位置 | 現状のまま |
| 34 | `AssumedWeightsNote`（カートの枠） | `weightOrigin==='assumed'` の品が1点以上 | N 点に重量データが無く、仮置き ~X で計算している。順位はその数字に乗っている | **1** | 条件1行（カートの上。ボード側にも1行） | "N of M items use a placeholder weight — ranking rests on it. Enter weights" |
| 34b | 同上の decisive 行（⚠） | 仮置きの品のうち `weightSensitivity.decisive` があるもの | "alone decides which service comes out cheapest" | **1** | 同上 | "This guess decides the winner." |
| 35 | `AssumedMark`（?、title だけで説明） | 仮置きの品の横 | "No weight data for this title — the number is our placeholder" | 2 | 数字の形（重量の点線と ?）＋タップで根拠 | "Placeholder weight" |
| 36 | ItemList の decisive 行 "This weight decides the cheapest: …" | `sensitivity.decisive` | その品の重量で1位が替わる | **1** | カートの品の行 | "This weight flips the winner: ≤a g → X, ≥b g → Y." |
| 37 | ItemList の国内送料 "~¥800 assumed — paste the URL to know" | 国内送料が未入力 | 国内送料は仮置き | 2 | 数字の形（破線） | "≈¥800 (guess)" |
| 38 | ProvincePicker "Not chosen — we estimate 7.3%"／Provincial tax note | CA で州を選んでいない | 州税が人口加重の推定 | 2 | 数字の形＋入力欄 | "≈7.3% avg — pick province" |
| 39 | `WhatCouldBeOff` の Estimated / Second-hand / Not included の一覧 | 比較できる行があれば、どれか該当する費目があるとき | 全行の費目を確度ごとにまとめる。"Your real bill will be higher, not lower." | 2 | 数字の形と重複するのでまとめ一覧としては不要。/sources へ | — |
| 40 | `WhatCouldBeOff` の最後の固定文 | 常時 | 並び順は保証する。料率は公表表、重量（宅配便なら箱の大きさ）は当方の仮定。"Shipping is most of a total." | 3 | 印＋ポップオーバー | "Order is solid; weight is our guess." |
| 41 | ParcelView の EMS 説明＋`EstimatedDataDisclosure` | 郵便の区画 | EMS は重さだけで決まり、箱は梱包シミュレーションではない。薄い＝推定重量、点線＝仮置き | 3 | 印＋ポップオーバー | "EMS prices by weight only; box is illustrative." |
| 42 | ParcelView の宅配便説明 | 宅配便の区画 | 請求重量は容積重量との大きい方。箱の寸法は仮定 | 2（宅配便の送料の確からしさ） | 数字の形（宅配便送料を破線）＋ポップオーバー | "Courier price assumes a {L×W×H} box." |
| 43 | ParcelView の複数箱 "Each box is priced and duty-checked separately" | 2個口以上 | 仕組みの説明 | 3 | ポップオーバー | — |
| 44 | WeightLadder "Above the published EMS table — no postage figure exists" | EMS の表の上限を超える | この重量には値段が無い | **1**（12 と 5 に重なる） | 12 と 5 に吸収 | — |
| 45 | 費目の note の中の仮定（例: Deposit fee "assumed 3.5% … our own placeholder", ZenMarket service fee ¥800 の推定, Neokyo の size limit 推定） | 各費目 | 数字が当方の置いた値 | 2 | 数字の形（破線）＋配達ログ | "≈¥972 — our placeholder rate" |
| 46 | UK excise / US duty prepayment / destination courier fees（null 行、scope shared） | GB で酒あり／US 郵便／宅配便 | 発生するが額が分からない | 2（13・14 と同じ扱い） | 数字の形 `+`＋配達ログ | "+ UK alcohol duty (rate unknown)" |
| 47 | Summary の為替 "(ECB reference rate for …)" | `Summary` が出るとき | 換算の根拠 | 3 | /sources#fx | — |
| 48 | 外部リンク "you will paste the listing URL there" | 行を開き、直リンクが無いとき | 相手のサイトでする作業 | 3 | 配達ログ | — |

## 段1の項目で、`prototypes/proposals-data-boxes.json`（カナダ宛・5点×¥3,000・EMS）で実際に出るもの・出ないもの

JSON に入っているのは `rankStabilityNote` と、行の `tag`/`total`/`tied`/`comparable`/`lines` だけ。`excluded`・`surface`・`referralNote`・`equivalent`・カートの `weightOrigin` は入っていない。これらは「コードからの推定」と書いた。

**出るもの**
- #2 不安定（600 / 1000 / 1400 g）: "…at three times the weight you gave us, FROM JAPAN and Neokyo…"。200 g は安定（#1、段3）。
- #3 と #4 判定不能（2000–8000 g の全段）: "These 6 companies sit within the same uncertainty… FROM JAPAN looks the most likely." と、方式への誘導行。
- #10 おすすめバッジ: 200–1400 g で出る（判定不能の段では出さない）。#11 Equivalent も判定不能でない段で出うるが、JSON に値が無く確認できない。
- #24 tag: Buyee default "5 orders · 5 parcels"、consolidated "you must request this"、ZenMarket "1 parcel assumed"、5000 g 以上は "2 parcels"（consolidated 行の request 表記は 5000 g 以上で消える。tag の組み方が split 分岐で変わるため）。
- #25 ConsolidationCallout: 全段で出る（差は ¥11,152〜¥20,309）。consolidated 行が `high=null` なので "unconfirmed (upper bound unknown)"。
- #34 AssumedWeightsNote: `itemWeightTier: estimate` なので重量は表か仮置き。`assumed` かどうかは JSON から判断できない（表に当たれば出ない）。
- #19 日数と追跡: 全行が EMS なので方式が混ざらず、ボード行に出す必要はない。

**出ないもの**
- #5 値段が付かない、#12 notComparableReason（全行 `comparable=true`）、#9 tied（同額の行がない）、#28 リチウム（CA は載っている）、#29 酒、#30 長い品（品名がないので不明。JSON の範囲では出ない扱い）、#32/#33 未取得価格（全品 ¥3,000）、#6 重量不明の段、#44 EMS の表の上限超え（EMS は 30 kg まで。8 kg は2個口で収まる）。
- #22 surface: 選んだ方式が EMS なので既定の順位には入らない。ただ `surface` は方式を選んでも組まれうる。JSON に無いので実際に出るかは未確認。

## 今のUIで同じ内容を2回、3回出しているところ

1. **上限不明**を4か所で出している。ボード行の "or more (upper bound unknown)"、RowBreakdown の "— no upper bound"（その段）と tfoot の "upper bound unknown — see…"、`excl. …`（ボード行）、`WhatCouldBeOff` の "Not included"。さらに ConsolidationCallout でも "(upper bound unknown)"。→ 数字の形 `+` と配達ログのその段にまとめる。
2. **確度の凡例** `TierLegend` を `Calculator`（RankBoard の下）と `CostTable` の下で2回出している。`Amount` の title も同じ内容。
3. **推定の費目**を、数字の色（amber と `~`）、RowBreakdown の note、`WhatCouldBeOff` の Estimated 一覧の3か所で出している。
4. **重量が仮置き**を、`AssumedWeightsNote`（カート）、`AssumedMark` の title、ItemList の "assumed"、ParcelView の `EstimatedDataDisclosure`（点線の説明）、`StabilityNote`（"our weight estimate"）、`WhatCouldBeOff` の最後の文（"the weight … is ours"）の6か所で出している。
5. **1位を決める重量**を、`AssumedWeightsNote` の decisive 行、ItemList の "This weight decides the cheapest"、`StabilityNote` の不安定文の3か所で出している。
6. **大きさを見ていない**を、`EmsOnlyNote`（"a parcel's size is never checked"）、`LongItemsInCartNote`、ParcelView（EMS "volume never enters"／宅配便 "box … is our assumption"）の3か所で出している。
7. **判定不能**を、`StabilityNote` の文、RankBoard の誘導行、LEADS の表記、バッジを消すこと、Summary の断定を消すことの5つで出している（打ち消しのために必要なぶんもあるが、文としては 3＋4 の1行で足りる）。
8. **同梱**を、tag の "you must request this"、`ConsolidationCallout`、consolidated 行の "Package consolidation" 費目（none → excl.）の3か所で出している。
9. **送れないかもしれない**を、`RestrictedGoodsNote`（常時）と `AlcoholInCartNote`、`LongItemsInCartNote` で出している。常時の1行は条件付きの行と前置きが重なる。
10. **紹介料**: ボード行の referralNote と、リンクの rel=sponsored（こちらは見えない）。重複としては軽い。

## 判断に迷ったものと理由

- **#26 EmsOnlyNote（範囲の開示）を段3にした**: 大部分は範囲の説明で選択は変わらない。ただ「値段を付けていない宅配便のほうが安いかもしれない」は、社を選ぶ判断に効きうる。どこへ出しても同じ内容なので段1にはしなかった。宅配便の値段が無い国（未価格社）でだけ、条件1行に上げる案もある。
- **#27 RestrictedGoodsNote（常時）を段3にした**: コードは「畳まない・常時出す」を原則にしている（T27）。ただ、中身を見ずに常に出す文は読み飛ばされるので、選択が変わる条件付きの 28/29/30 を段1にし、常時の文は印に下げた。方針が変わるので、オーナーの確認が必要。
- **#31 FreeShippingDomesticNote を段2にした**: 額が上がりうるだけなので段2。ただ、Buyee が1位と僅差なら順位が入れ替わりうるので、段1との境目にある。
- **#22 surface を段1にした**: 別の方式の値段で、日数と引き換えに選択を変えるための情報なので段1。ただ、ボード行が長くなる。
- **#23 referralNote**: 選択は変えない（順位は paysUs を見ない）が、利害の開示なのでポップオーバーに隠すのはまずい。段3の扱いで、置き場所だけボード行にした。
- **#19 日数・追跡**: 方式が混ざると（cheapest で宅配便と郵便が並ぶ）安さと速さのトレードオフになり段1。EMS だけで比べるなら段3。条件で段が変わる。
- **#24 tag の "assumed"（個口がまとまるかは未確認）**: 5点が1箱になるかは送料に大きく効くので段1にも見える。ただ金額の確からしさの話なので段2にした。
- **#11 Equivalent**: 補足が title だけでホバーに頼っている。バッジは段1だが、今の補足の文は「枠が2社で埋まった」という仕組みの説明で、ユーザーに意味が無い。文言を変える前提で段1にした。
- **#6 重量不明の経路**: UI からは届かないとコメントにあるが、コードは残っている。一覧には入れ、段1にした。
