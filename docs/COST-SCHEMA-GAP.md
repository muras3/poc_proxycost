# 総額スキーマの過不足

2026-09-07。O3（決済前の明細）をネットで探した結果と、そこから判明した
「現行の総額スキーマ」と「本来あるべき総額スキーマ」の差分。
差分はすべて `src/calc.js` / `src/data.js` の HEAD に対して実行して確認した。

---

## 1. 調査で取れたもの / 取れなかったもの

| 会社 | O1 公式料金 | O2 送料計算機 | O3 決済前の明細 |
|---|---|---|---|
| Neokyo | **○ 一次取得** | **○ 公開・ログイン不要** | × 要アカウント |
| Buyee | **○ 一次取得** | **○ 公開シミュレータ** | × 要アカウント |
| FROM JAPAN | **○ 一次取得**（`/translate/en_help.txt`、base64 でエンコードされた 1,474 キーの JSON） | 未確認 | × 要アカウント |
| Jauce | **○ 一次取得** | 未確認 | × 要アカウント |
| ZenMarket | **× 403** | 第三者（DutyGlobal）が公開 | × 要アカウント |

ZenMarket の 403 は**規約上の問題ではない**。`robots.txt` の `User-agent: *` が禁じているのは
ロケール重複パス（`/en/ja/` 等）だけで、`/en/fees.aspx` は許可されている。
通常の Chrome UA でも 403 なので、**Cloudflare によるデータセンター IP の遮断**。
本人のブラウザからは見える。

### 結論：O3 はネット上に落ちていない

出回っているのは **O1（公式料金表）と O2（送料計算機）と二次情報のブログ**だけ。
O3（明細行）は5社とも**無料アカウント作成＋カート投入**が要る。検索では代替できない。

**ただし O1 は想定よりはるかに豊富だった。**下記 §4 の新規費目はすべて一次情報から取れており、
**O3 を待たずに費目カタログ（表A）の大半が埋まる。**

---

## 2. 二次情報は金額に使えない（実例）

| 出典 | Buyee の購入手数料 |
|---|---|
| japan-shop-helper.com「Is Buyee Safe? 2026 Fee Breakdown + ¥38K Test」 | **6% + ¥300**（¥38,000 の商品に ¥2,280 と記載） |
| tokyocardreport.com | ¥500 per order |
| **Buyee 公式** | **"Flat rate ¥500 per order"** |

「実測 ¥38K テスト」を名乗る記事が、**公式と 4.5 倍違う数字**を出している。
しかもその記事の総額 ¥43,980 には**国内送料も輸入税も入っていない**
（記事自身が「import duties は buyer の責任」と書いて総額から外している）。
`README.md` が既に指摘した「二次情報は実際に3項目とも外していた」がそのまま再現した。

**運用ルール：**
- 二次情報は **Q5（費目の候補列挙）にのみ使う**。金額（Q2）には一切使わない。
- Q5 に限れば、競合代行の「隠れ手数料」記事は**バイアスの向きが有利**
  （他社の費目を多く挙げる方向に偏るので、漏れが減る）。maketto.jp は著者が競合の CEO。

---

## 3. 一次情報で確認した費目（現行コードに存在しないもの）

すべて公式ページから直接取得。**斜体でない項目は現行 `SERVICES` にスロットが無い。**

### 全社に共通する可能性が高いもの

| 費目 | 金額 | 条件 | 一次確認済みの社 |
|---|---|---|---|
| **輸出通関手数料** | **¥2,800** | 総額 20万円超、日本郵便（EMS・国際小包） | **Buyee・FROM JAPAN・Jauce の3社**（同額・同条件） |

3社が同額・同条件で持つ以上、**日本郵便の輸出通関料の転嫁**であり、
残り2社（ZenMarket・Neokyo）にも存在する可能性が高い。
現行コードには**どの社にも無い**（`src/*.js` の `2800` は EMS 表の値）。

### 会社が destination の輸入税を代理徴収する

| 会社 | 徴収する国 | 課税ベース |
|---|---|---|
| Neokyo | **Australia, EU27, US territories** | 未取得 |
| FROM JAPAN | Australia GST 10%（customs value < A$1,000） | **Charge 1 + Charge 2 before GST**＝商品代＋国内送料＋国際送料＋**全手数料** |
| FROM JAPAN | GST 15%（NZ と推定、要確認） | 同上 |
| FROM JAPAN | SST 10%（Malaysia、LVG） | Charge 1 |

**これが「会社 × 国」の交差項の実例。**現行モデルは国の税を代行会社と無関係に1回計算しており、
**誰が・どの課税ベースで徴収するかを表現できない。**

### 会社ごと

| 会社 | 費目 | 金額 | 条件 |
|---|---|---|---|
| Buyee | 保証プラン | ¥0 / ¥300 / ¥500 / ¥500 | Lite / Inspection / Standard / Insured Delivery |
| Buyee | 通関手数料 | ¥2,800 | 20万円超・EMS/AIR/SAL/船便 |
| FROM JAPAN | 取扱手数料 | ¥500 / 点 | **同一商品を複数個まとめて支払うと1点分**（後述） |
| FROM JAPAN | 支払手数料 | **¥200 / オークション** | **JDirectItems Auction の落札のみ**。支払方法によらない |
| FROM JAPAN | 特別配送料 | **¥2,710** | **FedEx の直配エリア外**（＝郵便番号依存） |
| FROM JAPAN | コンビニ・郵便局払い | ¥1,000 | 該当支払方法のみ |
| FROM JAPAN | 再梱包 | ¥1,500 〜 | 確定済み発送指示の変更・取消 |
| FROM JAPAN | 交渉手数料 | **max(¥2,000, 30%)** | 価格交渉オーダー |
| FROM JAPAN | 配送方法の可否 | — | **ePacket Light < ¥10,000／Small Packet < ¥30,000／ePacket・IPA ≤ $400／PMI ≤ $2,499.99** |
| Jauce | 落札手数料 | **¥400 + 落札価格の 8%** | オークション |
| Jauce | サービス料 | **¥1,000 + 8%** | 場外店舗 |
| Jauce | サービス料 | **無料** | ショッピングモール（ベータ中） |
| Jauce | 入金手数料 | **¥40 + 3.9%** | 支払方法によらない |
| Jauce | 銀行手数料 | ¥300 / 支払 | **出品者ごと・1日1回** |
| Jauce | 梱包 | **¥300 + ¥120/kg**（Smart）／**¥600 + ¥240/kg**（Fragile） | 0 kg から比例 |
| Jauce | 保険 | **総額の 1.9%** | Premium |
| Jauce | 追加通関手数料 | ¥2,800 | 20万円超 |
| ZenMarket | 保管超過 | ¥50 / 日 / 点 | 60日無料の後（二次情報） |
| ZenMarket | 補強梱包 | ¥1,000 / 箱 | （二次情報） |
| Neokyo | 開梱 | ¥1,000 | ＋梱包料 |
| Neokyo | コンビニ払い | ¥1,000 | |

### Neokyo の国内送料込みは一次情報で裏付けられた

`neokyo.com/en/fees` は **"Order and domestic shipping price: 350 ¥JPY"** と明記し、
¥350 が "Shipping towards Neokyo" を含むと書いている。
→ **`data.js:37` の `domesticIncluded: true` は正しい。**
`TEST-PLAN.md` §9 で P0 に置いた「1件の実購入で決着させる」項目は、**購入せずに解決した。**

※ ただし公式ページの文言 ≠ 実請求。大型・重量物・複数店舗での例外は O3/O4 で要確認。

---

## 4. 現行スキーマ vs あるべきスキーマ

### 4.1 入力

**現行**（`compare()` の引数、実行して確認）:

```js
compare({
  items: [{ price, weight, freeShipping, domesticShipping }],
  country,
  stepOffset,
})
```

**あるべき**（§3 の一次情報が要求する軸）:

| 階層 | フィールド | 現行 | これが無いと出せない費目 |
|---|---|---|---|
| item | `price` | ○ | |
| item | `weight` / `dims` | weight のみ | 容積重量、梱包段 |
| item | **`qty`** | **×** | FROM JAPAN「同一商品の複数個は手数料1点分」 |
| item | **`seller_id`** | **×** | 注文数・parcel 数・Jauce の銀行手数料（出品者ごと日次） |
| item | **`marketplace`** | **×** | ZenMarket ¥300/500/800、Jauce auction/mall/場外、FROM JAPAN の JDirectItems ¥200 |
| item | `listed_domestic_shipping` / `freeShipping` | ○ | |
| item | **`category` / `hazmat` / `battery`** | **×** | 配送方法の可否、特殊梱包 |
| order | **`proxy`** | 暗黙（全社ループ） | 会社が代理徴収する輸入税 |
| order | **`plan`** | **×** | Buyee ¥0/300/500/500、FROM JAPAN Plan Fee |
| order | **`payment_method`** | **×** | 入金手数料、コンビニ ¥1,000 |
| order | **`shipping_method`** | **× EMS 固定** | ePacket/Small Packet/FedEx/PMI、可否が Charge 1 の額に依存 |
| order | **`consolidation`** | 部分（`parcelDefault`） | まとめ梱包の要否 |
| order | **`optional_services[]`** | **×** | 写真・開梱・補強・保険 |
| dest | `country` | ○ | |
| dest | **`postal_code`** | **×** | CA 州税、**FedEx 直配エリア外 ¥2,710** |
| dest | **`carrier`** | **×** | 通関手数料は業者ごとに違う |
| dest | **`incoterm` (DDU/DDP)** | **×** | 立替手数料、DDP 手数料 |

### 4.2 課金形式（料金モデルが表現できる形）

**現行**：`{ perItem | (perOrder + domesticServicePerOrder), domesticIncluded, depositRate, packing{base, perExtraKg} }`
→ 表現できるのは **4形だけ**。

| 課金形式 | 一次情報の実例 | 現行 |
|---|---|---|
| 点あたり定額 | Neokyo ¥350、FROM JAPAN ¥500、ZenMarket ¥300〜800 | ○ |
| 注文あたり定額 | Buyee ¥500 | ○ |
| 総支払額に対する率 | ZenMarket 入金手数料 | ○（スカラー1つのみ） |
| 2 kg 超の kg 段階 | Neokyo ¥500 + ¥150/kg | ○ |
| **価格連動の率** | **Jauce 8%** | **×** |
| **固定 ＋ 率** | **Jauce ¥400+8% / ¥1,000+8% / 入金 ¥40+3.9%** | **×** |
| **max(定額, 率)** | **FROM JAPAN 交渉 max(¥2,000, 30%)** | **×** |
| **0 kg からの kg 比例** | **Jauce ¥300+¥120/kg、¥600+¥240/kg** | **×** |
| **同一商品の複数個は1回** | **FROM JAPAN 取扱手数料** | **×**（`items.length` で ×n） |
| **仕入先で分岐** | **ZenMarket・Jauce・FROM JAPAN の3社** | **×** |
| **プラン選択** | **Buyee 4段、FROM JAPAN Plan Fee** | **×** |
| **申告額の閾値** | **輸出通関 ¥2,800 超 20万円（3社確認）** | **×** |
| **配送業者・配送先条件** | **FedEx 直配エリア外 ¥2,710** | **×** |
| **配送方法の可否が商品代に依存** | **FROM JAPAN 4種の上限** | **×** |
| **支払方法で分岐** | **コンビニ ¥1,000（2社）、入金手数料** | **×** |
| **保険の率** | **Jauce 1.9%** | **×** |
| **出品者ごと・日次** | **Jauce 銀行手数料 ¥300** | **×** |
| **日数比例の保管超過** | **ZenMarket ¥50/日/点、Buyee ¥100/日〜** | **×** |
| **会社が代理徴収する輸入税** | **Neokyo（AU/EU27/US領）、FROM JAPAN（AU/NZ/MY）** | **×** |

**19形のうち表現できるのは4形。**
`SERVICES` の固定フィールド方式では **Jauce を1社も追加できない**
（`¥400 + 8%` を書く場所が無い）。
**Jauce 追加はデータ入力ではなく、料金モデルを「規則の式」へ作り直す設計変更。**

### 4.3 税

**現行**：国ごとに `{ base: 'CIF'|'FOB', dutyRate, dutyFreeLimit, vatRate, vatFreeLimit, clearanceFeePerParcel }` を1組。

**あるべき**：

| 軸 | 現行 | 実際 |
|---|---|---|
| 課税ベース | 国ごとに CIF / FOB の2択 | **徴収者ごとに違う。**FROM JAPAN の AU GST は `Charge1 + Charge2`（＝手数料込み） |
| 徴収者 | 常に着地国 | **会社が代理徴収する場合がある**（Neokyo は AU/EU27/US領、FROM JAPAN は AU/NZ/MY） |
| 通関手数料 | 国ごとに1つ | **国 × 配送業者 × DDU/DDP** |
| 郵便番号 | 入力が無い | CA 州税、遠隔地 |

**AU GST の課税ベースの誤りを実測した**（FROM JAPAN、現行 vs 一次情報の式）：

| 構成 | 現行 GST | あるべき GST | 過小 | 総額比 |
|---|---:|---:|---:|---:|
| 単品 ¥1,000 / 50g | ¥415 | ¥545 | ¥130 | 2.2% |
| 単品 ¥5,000 / 600g | ¥1,000 | ¥1,130 | ¥130 | 1.1% |
| 3点 ¥7,000 | ¥1,200 | ¥1,590 | ¥390 | 2.3% |
| 単品 ¥50,000 / 1.5kg | ¥5,775 | ¥5,905 | ¥130 | 0.2% |

**額は小さい（0.2〜2.3%）が、符号が常に過小方向で系統的。**
金額の大きさより「課税ベースを会社ごとに持てない」という構造の方が問題。

---

## 5. 過不足の集計

### 不足（総額が過小になる方向）

| # | 内容 | 影響 |
|---|---|---|
| 1 | 輸出通関手数料 ¥2,800（20万円超、3社で一次確認） | 高額注文で階段状に ¥2,800 |
| 2 | 会社が代理徴収する輸入税（Neokyo AU/EU27/US領、FROM JAPAN AU/NZ/MY） | 該当国で丸ごと欠落 or 二重計上 |
| 3 | プラン費（Buyee ¥0〜500、FROM JAPAN Plan Fee） | 注文ごと最大 ¥500 |
| 4 | FedEx 直配エリア外 ¥2,710 | 該当郵便番号で ¥2,710 |
| 5 | Jauce の全費目（社ごと未実装） | 5社中1社が存在しない |
| 6 | 入金・支払手数料の分岐（コンビニ ¥1,000 ×2社、JDirectItems ¥200） | 条件次第で ¥200〜1,000 |
| 7 | AU GST の課税ベース（手数料を含めていない） | 0.2〜2.3% |
| 8 | `null`（未取得）が総額から静かに落ちる（`calc.js:115,122`） | 未取得の費目ぶん全額 |
| 9 | EMS 表の上限超過を最終段に丸める（`data.js:29-32`） | 15 kg 超で青天井 |
| 10 | 保管超過・保険・写真・補強・開梱 | 選択時のみ |

### 過剰（総額が過大になる方向）

| # | 内容 | 影響 |
|---|---|---|
| 11 | `items.length` を注文数として使用（`seller` フィールドが無い） | Buyee の購入手数料・国内配送サービス料・parcel 数・通関手数料が同一店舗の点数ぶん過大 |
| 12 | 同一商品の複数個に手数料を ×n（FROM JAPAN は1点分） | 数量ぶん過大 |
| 13 | DE/FR の `flatDutyPerItem × items.length` | 同上 |

### 表現できない（過不足以前の問題）

| # | 内容 |
|---|---|
| 14 | 課金形式 19 形のうち 15 形が書けない（§4.2）。**Jauce は1社も追加できない** |
| 15 | 入力に 12 軸が無い（§4.1）。軸が無い費目は調査しても入れる場所が無い |
| 16 | `null` が「発生しない」と「未取得」を区別できない → **網羅性が計測不能** |
| 17 | `COUNTRIES` が通関手数料を国ごとに1つしか持てない → 国 × 業者 × DDU/DDP を書けない |

### 現行の総額スロット数

`calc.js` が全社 × 全7カ国で出しうる費目ラベルは **14種**（VAT/GST/Sales tax は同一スロット）
＝ **実質 11 スロット**。
本調査で一次情報から確認できた費目だけで **30 種類以上**。

---

## 6. 次にやること（順序）

1. **料金モデルを「規則の式」へ作り直す**（§4.2）。これが無いと Jauce も入らず、以降の全部が乗らない
2. **入力スキーマに 12 軸を追加**（§4.1）
3. **`null` を3値化**（`value` / `notApplicable` / `unknown`）→ 網羅性が測れるようになる
4. §5 の不足10件・過剰3件を実装
5. **ZenMarket の公式料金は本人のブラウザで取得**（この環境からは IP 遮断で不可）
6. **5社のアカウントを作り O3 を取得**。ネット検索では代替できないことが確定した
7. O3 の全行を費目IDへ逆写像し、未写像0件を確認

---

## 7. 出典（一次情報）

- Neokyo 料金：https://neokyo.com/en/fees
- Neokyo 送料計算機：https://neokyo.com/en/shipping-rates-estimate
- Buyee 料金：https://buyee.jp/helpcenter/guide/fees?lang=en
- Buyee 送料：https://bc.help.buyee.jp/en/shipping-fees/
- FROM JAPAN ヘルプ原文：https://www.fromjapan.co.jp/translate/en_help.txt （base64 → JSON 1,474 キー）
- Jauce 料金：https://www.jauce.com/japan_auction_detail
- ZenMarket 料金：https://zenmarket.jp/en/fees.aspx （**この環境からは 403。robots.txt は許可**）

## 8. 出典（二次情報：費目の候補列挙にのみ使用、金額には使用しない）

- maketto.jp/blog/17 （著者は競合代行 Maketto の CEO）
- tokyocardreport.com/articles/zenmarket-vs-buyee-pokemon-cards/
- japan-shop-helper.com/en/travel/features/buyee-review （**Buyee 手数料を公式と 4.5 倍取り違えている**）
- blog.onemall.jp （競合代行 OneMall）
- dutyglobal.com/forwarders/zenmarket （ZenMarket 専用の送料計算機。国際送料のみで、手数料・関税・国内送料は非対応）
