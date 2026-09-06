# 監査：代行5社の費目が網羅されているか

確認日: **2026-09-06**（以下の表の「確認日」は全てこの日）
対象: `src/lib/pricing/services.ts` / `src/lib/pricing/compare.ts`（読み取りのみ。製品コードは触っていない）

判定語:
- **一致** … 公式ページの原文と実装が合う
- **欠落** … 公式にあるのに実装に無い（総額を低く見せる）
- **幻** … 実装にあるのに公式に無い／別サービスの費目（総額を高く見せる）
- **誤り** … 実装にはあるが条件・単位・基数が原文と違う
- **未検証** … 一次情報を取れなかった。合っている証拠が無い

金額の影響は、この場で実際に `compare()` を走らせた基準値と突き合わせている。

```
1点 ¥5,000 / 500g / US 向け        3点 ¥5,000 / 500g / US 向け
1 Neokyo      12,898              1 Neokyo               29,078
2 FROM JAPAN  13,548 (+650)       2 FROM JAPAN           31,878 (+2,800)
3 Buyee       13,848 (+950)       3 Buyee, consolidated  32,778 (+3,700)
4 ZenMarket   14,069 (+1,171)     4 ZenMarket            33,226 (+4,148)
5 Jauce       14,598 (+1,700)     5 Jauce                34,079 (+5,001)
                                  6 Buyee, default       41,543 (+12,465)
```

**1位と2位の差は1点で ¥650 しかない。** 以下の欠落・幻はどれもこの幅より大きいか同程度で、
順位を動かす。

---

## 1. Neokyo

出典: https://neokyo.com/en/fees （取得成功、200） / https://neokyo.com/en/faq （取得成功、200）

| 費目 | 公式の記載（原文） | 実装 | 判定 |
|---|---|---|---|
| サービス料 | "350 yen (US$ 2.24)" per item | `perItemYen: 350` | 一致 |
| 同一商品の複数個 | "If you purchase multiples copies of the same item within the same Buy Request, this fee is only applied once." | `perItemYen × qty`（compare.ts の `chargeableUnits` は qty を合算） | **誤り**（qty 2 以上で ¥350/個 過大） |
| **国内送料** | ORDER PAYMENT の見出し "Order and domestic shipping price" の**下にプラス記号があり、その下が ¥350**。すなわち「（商品代＋国内送料）＋ ¥350」。¥350 の "What does this price cover?" は purchasing / 質問窓口 / サポート / 45日保管 のみを挙げ、**国内送料を挙げていない** | `domesticIncluded: true` → 画面に "Domestic shipping ¥0 included in the service fee" | **幻（最重要）** |
| 梱包料 | "Up to 2 kilograms 500 yen" / "More than 2 kilograms 500 yen + 150 yen for each additional kilo over 2 kg, rounded up"。全段表も 150円刻みで 30kg まで | `perParcelYen 500 / perKgYen 150 / freeUpToG 2000` | 一致 |
| 30kg 超 | ">30 KG Not covered" | 無し（上限なしで計算し続ける） | 欠落（軽微） |
| 国際送料マークアップ | "We do not charge any Neokyo fee on shipping cost, you pay the actual provider price." | `emsMarkup: 0` | 一致（ただし tier が `estimate`。原文があるので `fixed` でよい） |
| 保険・追跡 | "Includes insurance & tracking"（発送料に内包） | 別建てしない | 一致 |
| 保管料 | 無料45日。"Weekly storage fee when an item or a package free storage allowance expires"、FAQ「Additional weekly storage period cost may vary depending on your item size」。**料額はページに無い** | 無し | 欠落（発送が早ければ0） |
| 開梱 | "You will be charged 1000¥ **plus the price of the packing fee**（例: 500¥ Packing Fee → 1500¥ Unpacking Fee）" | optional ¥1,000 | 誤り（梱包料が足されない） |
| コンビニ払い | "1000 yen" | optional ¥1,000 | 一致 |
| 為替・カード手数料 | 明示の手数料は無い。"All transactions on Neokyo are made in Yen. The actual exchange rate will be determined by your payment agency."（FAQ も「PayPal が換算する」） | 無し | 一致（暗黙のスプレッドは計上しない、で妥当） |
| ¥200,000 超 | FAQ「any item worth more than 200,000 yen is subject to special export procedures on our part」 | 無し（同額の輸出通関 ¥2,800 は FROM JAPAN と Buyee にだけ入っている） | 欠落（社間で非対称） |
| 既定の個口 | "Shipment ... **Can contain several orders**" | `parcelDefault: 'one'` | 一致 |

**Neokyo の総額影響**: `domesticIncluded: true` を落とすと 1点で +¥800（コード内の仮定値 `ASSUMED_DOMESTIC_SHIPPING_YEN`）。
12,898 → 13,698 となり **FROM JAPAN 13,548 に抜かれて1位から落ちる**。3点なら +¥2,400 で
FROM JAPAN との差は 2,800 → 400 に縮む。実勢 ¥150〜1,500 の上側なら3点でも順位が入れ替わる。

---

## 2. ZenMarket

出典: **取れなかった。** 詳細は末尾「取得できなかったページ」。
以下は全て**一次情報で裏が取れていない**。

| 費目 | 公式の記載 | 実装 | 判定 |
|---|---|---|---|
| サービス料 | 未取得 | `perItemYen: 800`（flat） | **未検証**。検索結果のスニペット（二次情報）は「ZenPlus・Recommended Stores は ¥300、Mercari と JDirectItems Auction は ¥800」と、**出品元による段**があると書いている。実装は段を持たない | 
| 入金手数料 3.5% | 未取得 | `deposit.rate 0.035` を gross-up | 未検証（DESIGN-NOTES §3 の台湾利用者の実請求 ¥10,363 との一致だけが根拠。これは二次情報） |
| 梱包料 | 未取得 | `packing: null`（梱包無料の扱い） | **未検証**。5社中2社（Neokyo・Jauce）は必須の梱包料を取る。無料である証拠が無い |
| 保管料 | 未取得 | 無し | 未検証 |
| 出金・返金手数料 | 未取得 | 無し | 未検証（二次情報では「Wise/現地送金の出金は 0.6〜2% + ¥500」） |
| 有料会員 | 未取得 | 無し | 未検証 |
| 追加写真 ¥500 / 再梱包 ¥1,000〜4,000 | 未取得 | optional にある | 未検証 |
| 既定の個口 | 未取得 | `parcelDefault: 'one'`, `parcelVerified: false` | 実装が自分で「未検証」と書いている。正直で、正しい |

---

## 3. FROM JAPAN

出典: https://www.fromjapan.co.jp/translate/en_help.txt （取得成功、200、222,060 bytes）
※ このファイルは base64 の JSON。デコードして 1,474 個の原文文字列を読んだ。
`https://www.fromjapan.co.jp/en/help/fee` 自体は 200 で返るが本文は JS 描画で空。翻訳ファイルが実質の原文。

| 費目 | 公式の記載（キー: 原文） | 実装 | 判定 |
|---|---|---|---|
| プラン料 ¥500/点 | `help_fee_140`: "500 yen per item"、`help_fee_252`: "Plan Fee"。**強制**: `title_serviceRule_670`: "Members agree that all purchased items will be covered by our Product Protection Plan. **Use of the Product Protection Plan is mandatory for all items.**" | `perItemYen: 500` | 一致（強制であることが確認できた） |
| 同一商品の複数個 | `help_fee_150`: "*If multiple units of the same item are paid together, handling fees will be the same as for one item." | `perItemYen × qty` | **誤り**（qty 2 以上で ¥500/個 過大） |
| Product Protection Plan（任意費目として） | 上記のとおり**必須**であり、総額に既に入っている | `optional` に `protection ¥500/item` が**もう一度**ある | **幻（二重計上）** |
| 日本国内の支払手数料 ¥200 | `title_serviceRule_1411`: "**Purchases made after January 31, 2023 at 11:00 (JST) will no longer be charged a payment fee.**" / `title_serviceRule_1460`: "Regardless of the payment method, items won on JDirectItems Auctions shall incur a **200 yen payment fee per auction**." / `help_fee_280`: "We will not collect any payment fees from customers even if they are incurred on purchases made in Japan." | `paymentInsideJapanYen: 200` を**全注文**に課金。注記は "per order or per item is not stated" | **誤り**。(a) 単位は原文にある（**per auction**）。(b) JDirectItems（ヤフオク）**以外は 2023-01-31 に廃止**。Mercari / Rakuten / ショッピングでは ¥200/注文 の過大 |
| 同一出品者の合算 | `auction_124`: "If the above conditions are met, domestic shipping charges and payment fees for multiple items can be combined." | 無し（常に注文数ぶん課金） | 欠落（軽微） |
| 国内送料 | `help_fee_260`: "Actual cost (Items which do not charge shipping fees inside Japan are charged 0 yen)" | `domesticIncluded: false` + 実費 | 一致 |
| **会員ランク割引** | `help_other_420`: "Member ranks will then upgrade based on the value of your annual Charge 1 total. Our ranks go from Green, Gold, Platinum and finally to Black." / `help_other_490,540,590,640`: "**:1% Off international shipping fees**"（率はテンプレ変数のままで、この配信ファイルからは読めない） | 無し | **欠落**。常連ほど国際送料が安くなる。率が読めないので実装できないが、「未取得」と画面に出す価値はある |
| 保管料 | `help_fee_390`: "Free storage (60 days)"。超過後の料額はこのファイルに無い | 無し | 欠落（発送が早ければ0） |
| 輸出通関 ¥2,800 | `help_fee_620`: "Applied to packages with a total value exceeding 200,000 yen sent through Japan Post (EMS, International Parcel)." | optional ¥2,800 "only over ¥200,000" | 一致 |
| 再梱包 | `help_fee_750`: "From 1,500 yen" / `help_logistics_140`: "A repacking fee of at least 1,500 yen is required to modify or cancel confirmed shipping instructions." | optional ¥1,500 | 一致 |
| 写真 | `help_fee_1471`: "3 photos for 500 yen" | optional ¥500 "3 photos" | 一致 |
| コンビニ払い | `special_order_250`: "an additional 1,000 yen commission fee will be applied" | optional ¥1,000 | 一致 |
| 外注梱包 | `help_fee_720/721`: "Outsourced Packing — Actual cost" | 無し | 欠落（該当時のみ） |
| FedEx 区域外 ¥2,710 | `help_logistics_480`: "Special Delivery Fee" | 無し | 該当せず（EMS 前提のため） |
| キャンセル | `special_order_140`: "After Charge 1 is paid, we cannot make a cancellation, return, or claim to the seller." | 無し | 一致（料金ではなく不可） |
| AU/NZ/SG/MY の税 | `help_fee_780`: AU は "10% of the total order value (Charge 1(item price) + Charge 2 before GST is added)"、SG は 9%（`help_fee_824`）。**代行側が事前徴収する** | `countries.ts` が受取国側で計算 | 費目としては欠落ではない。ただし基数（Charge1+Charge2 = 国際送料込み）が countries.ts の基数と一致しているかは**国別監査の担当** |
| 5% 手数料（FROM USA の 10%/$5） | `help_fee_254`: "50.00 USD or more: Total amount x 10% / Less than 50.00 USD: 5.00 USD"。これは **FROM USA**（米国商品）の料金 | 実装のコメントが「別サービス FROM USA の料金で、日本商品には適用されない」と明記 | 一致（正しく除外している） |
| 既定の個口 | プラン内容に "Combined shipping" / "Item consolidation"（`help_fee_397,400`）。ただし「既定で1個口」と明言した文は見つからなかった | `parcelDefault: 'one'`, `parcelVerified: true` | **未検証**（`parcelVerified: true` の根拠を原文で確認できなかった） |

---

## 4. Buyee

出典: https://buyee.jp/helpcenter/guide/fees?lang=en ほか5ページ（全て取得成功、200）

| 費目 | 公式の記載（原文） | 実装 | 判定 |
|---|---|---|---|
| 購入手数料 | "Flat rate ¥500 / Per order"。"JDirectItems Auction / Mercari / Rakuma: One successful bid or purchase / flat rate ¥500" | `perOrderYen: 500` | 一致 |
| ショッピングの注文単位 | "Shopping: Order / flat rate ¥500 * **Even if multiple purchases are from the same store**, it is a flat rate of ¥500." | compare.ts は `orders = items.length`（1点＝1注文） | 誤り（同一店舗の複数点で ¥500/点 過大） |
| **保証プラン（必須選択）** | "3. Guarantee plan : delivery compensation, inspection. **Fee differs depending on the selected plan.**" — Standard Plan **500 yen（"Recommended" 表示、¥800 → ¥500）** / Insured Delivery 500 / Inspection 300 / **Lite 0**。/plans: "Service Fee: 500 JPY / $5 **per order**" | **無し** | **欠落（重大）**。既定（推奨）を選ぶと ¥500/注文 |
| 国内配送サービス料 ¥500 | 料金ページの国際発送の項に**そんな費目は無い**。¥500 は /domestic-shipping-method の「**日本国内の住所へ送る**サービス」の料金: "Domestic Shipping Rates + Domestic Shipping Service fee (500 Yen)"。海外利用者には掛からない | `domesticServicePerOrderYen: 500` → 画面に "Domestic handling ¥500 × N orders" | **幻**。国外発送の総額に入る費目ではない |
| 国内送料 | "prices generally range from 150 ~ 1,500 yen/$1.5 ~ $15" | 実費（既定の仮定 ¥800） | 一致 |
| 個口の既定 | "In order to handle your packages properly, **we process each order respectively**, even if multiple orders are purchased through the same seller/store. Because of this, **there will be separate domestic shipment fees for each order**." | `parcelDefault: 'per-order'` | 一致。**5社で Buyee だけが外れ値、という前提は正しい** |
| 同梱 | /consolidate: "**Effective December 21, 2022** ... we have **uniformly waived the fee** for our consolidation service."（My Page から申請、到着後） | `consolidationOnRequest: true`、追加料金なし | 一致（無料であることを一次情報で確認） |
| 保護梱包 | /packing: "one-time charge of **1,500 yen/$15** ... per box" | optional ¥1,500 per parcel | 一致 |
| 特殊梱包 | /special-packaging: "one-time charge of **2,500 yen / $25 per package**" | optional ¥2,500 | 一致 |
| 写真 | /photo-shoot: "Photo Service Fee is **300 yen / $3 per package**(5 photos)" | 無し | 欠落（軽微） |
| 通関手数料 ¥2,800 | "If you send item(s) valued over 200,000 yen with EMS, AIR, SAL or Japan Post Seamail, a customs clearance commission fee (2,800 yen) will be charged." | optional ¥2,800 | 一致 |
| 保管料 | /storage: 無料30日、以後**日割**。~10,000g ¥100/日、10,001〜20,000g ¥200/日、20,001g〜 ¥300/日。最大90日 | 無し | 欠落。**5社で無料期間が最短（30日）**。滞留すると効く |
| 為替・カード手数料 | 明示の手数料は無い。"Based on the usage fee of all currencies, it will change based on the market rate between 11 o'clock and 12 o'clock in the morning of Japan time." | 無し | 一致（暗黙のスプレッドのみ） |
| 有料会員 BuyeePASS | /subscribe: Gold 5 ¥3,500 / Platinum 20 ¥12,000 / Diamond 90 ¥40,000（30日）。ただし **Buyee Air Delivery Taiwan 専用**、EMS 不可 | 無し | 該当せず（対応7カ国に台湾は無い） |

**Buyee の総額影響**: 「欠落 ¥500/注文（プラン）」と「幻 ¥500/注文（国内配送サービス料）」が
金額としては相殺しているため、**総額はたまたま近い**。だが中身は両方間違っており、
Lite プラン（¥0）を選ぶ利用者にとっては ¥500/注文の過大、
Standard を選ぶ利用者にとっては費目名が別物である。**偶然の一致に頼っている。**

---

## 5. Jauce

出典: https://www.jauce.com/japan_auction_detail （"Services & Charges"、取得成功、200）
**実装の `sourceUrl` `https://www.jauce.com/fee` は 404**（/fees, /help/fee, /about/fee, /faq も全て404）。

| 費目 | 公式の記載（原文） | 実装 | 判定 |
|---|---|---|---|
| 手数料（ヤフオク） | "Jauce commission: **JPY 400 per auction + 8% of the closing price**" | `perItemYen 400 + adValoremRate 0.08` | 一致 |
| **8% の基数** | "8% **of the closing price**"。例: "Auction closing price: JPY 50,000 / Our commission: **JPY 4,400 (JPY 400 + 8%)**" → 8% × 50,000 = 4,000。**落札価格のみ。送料は含まない** | `chargeableYen`（商品代のみ） | **一致（原文と計算例の両方で確認）** |
| 単位 | "per **auction**" | `perItemYen × qty`（点数） | 誤り（同一オークションで qty 2 以上のとき ¥400/個 過大。ヤフオクでは稀） |
| **銀行手数料** | "**Banking fee: JPY 300 flat per payment.** This fee is for bank remittance to the seller. We keep our fees for you as low as possible by only passing on the bank fee once a day for the items purchased in a single day from the same seller." 計算例にも "Banking fee: JPY 300 (flat fee)" として総額に入っている | **無し** | **欠落（重大）**。出品者×日ごとに ¥300 |
| 楽天・Yahoo!ショッピング | "Shopping fees for Online Shopping Malls — Service fee: **FREE during the beta version** / Banking fee: **FREE**" | `freeForSites: ['rakuten','yahoo-shopping']`, tier `unverified` | 一致（**今も有効**。tier は `unverified` のままで良くない、原文が取れた） |
| Amazon JP | 同じ段落に "Rakuten, Yahoo! Japan Shopping, and Amazon Japan*" と並ぶ。"*Our Amazon Japan service is currently **under maintenance** and so is temporarily unavailable." | `freeForSites` に `amazon-jp` が無い | 欠落（ただし停止中なので実害は小さい。むしろ「取り扱い停止」を出すべき） |
| **場外店舗** | "Fees for off-site stores — Service fee: **JPY 1,000 + 8%** over the item purchase price. Banking fee: JPY 300" | 全て `¥400 + 8%` | **欠落**。suruga-ya / mandarake / zozo / hmv / toranoana / other で **¥600/点 過小**（＋銀行手数料 ¥300） |
| JAUCE Stores | "the purchase commission (400¥ + 8%) and the banking fee (300¥) are **NOT required**" | 無し（該当 SiteId も無い） | 欠落（軽微） |
| 入金手数料 | "Depositing fee: **JPY 40 + 3.9% over the deposit amount** regardless of the payment method." | `flatYen 40, rate 0.039` を **gross-up**（¥40 + 4.058%） | 誤り（軽微）。原文は「入金額に対して 3.9%」で、gross-up と読む根拠は無い。¥14,000 の注文で約 ¥22 の過大 |
| 梱包（必須） | "**Smart Packing: JPY 300 per package + JPY 120/kg**"。"By default, we check all the packages and optimize them accordingly" | `perParcelYen 300, perKgYen 120, freeUpToG 0, mandatory: true` | 一致 |
| 割れ物梱包 | "Fragile Packing: JPY 600 per package + JPY 240/kg" | 無し（`optional: []`） | 欠落（任意） |
| 保険 | "A fee of **JPY 250/kg** is required for methods other than EMS of Japan Post."／"Premium Insurance ... **1.9%** over the total amount" | 無し | 一致（EMS 前提なので 250/kg は掛からない）／プレミアムは欠落（任意） |
| 写真 | "Picture service ... costs **300 yen per auction**. ... if the auction closing price is **20,000 yen or higher**, we provide this service ... **for free**" | 無し | 欠落（任意） |
| 速達出荷 | "The fee for 'Expedited Shipping' service is **JPY 200 + JPY 80/kg**." | 無し | 欠落（任意） |
| 個別作業 | "Customized Processing Option ... **2,000¥ per hour**" | 無し | 欠落（任意） |
| 通関 ¥2,800 | "If the total value of the contents of a package exceeds JPY 200,000, Japan Post will apply an additional fee of **JPY 2,800** for the customs clearance." | 無し | 欠落（FROM JAPAN・Buyee には入れているのに Jauce に無い＝社間で非対称） |
| 保管料 | "We store them in our warehouse **free for 60 days** ... After the free period elapses we will charge a **monthly storage fee up to 120 days**."（料額はページに無い） | 無し | 欠落（発送が早ければ0） |
| 国際送料 | "Your shipping estimate will include our international delivery fees" | `emsMarkup: 0`, tier `fixed`（実測で確認済みとコメント） | 一致 |
| 既定の個口 | "If you buy more than one item, **we will consolidate them and ship to you in 'as few boxes as possible'**." | `parcelDefault: 'one'` | 一致 |

---

## 総額への影響が大きい順（欠落・幻・誤りの一覧）

| # | 社 | 内容 | 向き | 1点/3点での額 | 順位を動かすか |
|---|---|---|---|---|---|
| 1 | Neokyo | 国内送料を「サービス料込み」として ¥0 にしている（公式ページの構造は「商品代＋国内送料」＋¥350） | **過小** | +¥800 / +¥2,400 | **動かす**。1点で 12,898→13,698、FROM JAPAN 13,548 に負けて1位陥落 |
| 2 | Buyee | 保証プラン（必須選択、推奨 Standard ¥500/注文）が無い | 過小 | +¥500 / +¥1,500 | 1点で 3位→4位（ZenMarket 14,069 と 14,348 で逆転） |
| 3 | Buyee | 「Domestic handling ¥500/注文」は日本国内宛て配送の料金。国外発送には存在しない | **過大** | −¥500 / −¥1,500 | Lite プラン利用者では 3位→2位 |
| 4 | Jauce | 銀行手数料 ¥300/支払（出品者×日ごと） | 過小 | +¥300 / +¥900 | 最下位のままだが差額表示が狂う |
| 5 | Jauce | 場外店舗（駿河屋・まんだらけ・ZOZO・HMV・とらのあな等）は ¥1,000+8%。実装は一律 ¥400+8% | 過小 | +¥600/点 | 該当サイトでは動かす |
| 6 | FROM JAPAN | ¥200 の支払手数料を全注文に課金。原文では JDirectItems（ヤフオク）**のみ**、それ以外は 2023-01-31 に廃止 | 過大 | −¥200/注文（非ヤフオク時） | 1点・非ヤフオクなら 2位のまま、3点で Buyee との差が縮む |
| 7 | Neokyo / FROM JAPAN | 点あたり手数料を qty 倍している。原文は「同一商品の複数個は1回だけ」 | 過大 | −¥350 / −¥500 × 超過個数 | qty>1 のとき動かす |
| 8 | Buyee | ショッピングは同一店舗の複数点で ¥500 は1回。実装は点ごと | 過大 | −¥500/超過点 | 動かしうる |
| 9 | ZenMarket | ¥800 一律。二次情報では ZenPlus・推奨店舗は ¥300 の段がある | 過大の疑い | −¥500/点（もし正なら） | 動かす |
| 10 | 全社 | 保管料（Buyee 30日→¥100〜300/日、Neokyo 45日→週次、Jauce 60日→月次、FROM JAPAN 60日） | 過小 | 発送が早ければ 0 | 通常は動かさない |
| 11 | FROM JAPAN | 会員ランクの国際送料 %OFF | 過大 | 率が読めない | 常連では動かす |
| 12 | Jauce・Neokyo | 輸出通関 ¥2,800（¥200,000 超）が FROM JAPAN・Buyee にしか入っていない | 任意費目の非対称 | 総額外 | 動かさない |
| 13 | FROM JAPAN | 任意費目 `protection ¥500/item` は必須プラン料の二重計上 | 過大（任意欄） | 総額外 | 動かさない |
| 14 | Jauce | 入金手数料を gross-up している（原文は「入金額に対して 3.9%」） | 過大 | 約 −¥22 | 動かさない |
| 15 | Jauce | `sourceUrl` が 404。`scripts/fees-check.ts` は取得失敗を `unreachable` に積むだけで、`data/fee-pages.json` に **jauce の項目が1つも無い**＝料金改定を検知できない | 監視の穴 | — | — |

---

## 取得できなかったページ

| ページ | 結果 | 試したこと |
|---|---|---|
| https://zenmarket.jp/en/fees.aspx | **403**（Cloudflare "Just a moment..." managed challenge） | curl（UA 有無・HTTP/1.1・ブラウザ相当ヘッダ一式）、WebFetch、`/ja/fees.aspx`、`/en/faq.aspx`、サイトルート — **ゾーン全体が 403** |
| 同上 Wayback（`web.archive.org/web/20260825121505/...`、スナップショット自体は存在し 200） | **egress 拒否**（`Blocked by egress policy`） | curl / WebFetch とも不可 |
| 同上 読み取りプロキシ | 403 / 522 | `r.jina.ai`、`api.allorigins.win` |
| https://zenmarket.jp/en/blog/post/15634/... （¥300 の新サービス料の告知） | 403 | WebFetch |
| https://www.jauce.com/fee（実装の `sourceUrl`） | **404** | `/fees`, `/help/fee`, `/about/fee`, `/faq` も 404。**実際の料金原文は https://www.jauce.com/japan_auction_detail にある** |
| https://www.fromjapan.co.jp/en/help/fee | 200 だが本文が空（JS 描画） | 代わりに公式配信の `translate/en_help.txt` をデコードして原文を読んだ |
| Neokyo の週次保管料の料額 | ページに金額が無い | fees / FAQ とも「size による」としか書いていない |

**ZenMarket について今日わかったことは、何も無い。** 実装の ZenMarket 列は全て
2026-09-06 時点で未検証である（`data/fee-pages.json` には同日付のハッシュが残っているので、
過去のどこかでは取れていた）。

---

## 実装が現実を写しているか

| 社 | 判定 | 理由（1行） |
|---|---|---|
| Neokyo | **×** | 料金額は全部合っているが、国内送料を「込み」として ¥0 にしており、公式ページの構造はそう読めない。**最安1位が、最も影響の大きい未検証の仮定で作られている** |
| ZenMarket | **×** | 公式ページを一切取得できず、¥800 一律・梱包無料・個口の既定のどれも一次情報の裏が無い |
| FROM JAPAN | **△** | 必須 ¥500/点は原文で確定できたが、¥200 の支払手数料が条件（ヤフオクのみ・2023年に廃止）を無視して全注文に乗り、会員ランク割引が無い |
| Buyee | **△** | ¥500/注文と無料同梱・注文別送は原文で確定。ただし必須の保証プラン（¥500）が無く、代わりに国外発送では存在しない「国内配送サービス料 ¥500」が乗っている。**額が近いのは偶然** |
| Jauce | **△** | 400+8%（落札価格のみ）と梱包・楽天無料は原文と計算例で完全一致。だが銀行手数料 ¥300 と場外店舗 ¥1,000+8% が丸ごと抜け、`sourceUrl` は 404 で改定も検知できない |

○ は1社も無い。
