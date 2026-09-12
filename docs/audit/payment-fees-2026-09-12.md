# F07（入金・決済手数料）方法別公表状況の調査 — 2026-09-12

`master/fees.json` F07 行に対する追加調査。目的は、オーナーの読み（代行各社は支払方法ごとの決済手数料を公表しているはずだ）を検証すること。詳細な数値・quote・source は `master/fees.json` の `rows`（F07, company別）と、新設した `conclusions` の各キーに機械可読な形で入れてある。このドキュメントは人間向けの要約。

## 結論（先出し）

- **公表しているのは5社中1社（Jauce）だけ**、確認できた範囲では方法によらず一律の料率。
- **ZenMarket は基本率（3.5%）を公表しているが、方法別の内訳は今回も取得できなかった**（要ログインのページの先）。この基本率がたまたま現行コードの3.5%と一致している。
- **Buyee・Neokyo は「非公表」と確認できた**（一次ページに方法別の料率が無いことを direct_fetch で確認）。
- **FROM JAPAN は判定不能**——該当ページがこの環境からは終始 403（AWS WAF）で、公表の有無そのものを確認できなかった。
- 結果として、オーナーの読みは**部分的に真**（Jauce・ZenMarketは公表）であり、**部分的に外れている**（Buyee・Neokyoは明確に非公表。しかもNeokyoは「決済会社任せ」と積極的に書いている）。

## per-proxy × per-method 表

| 会社 | 方法 | 料率 | 固定額 | ベース | 何回課金 | 通貨/為替スプレッド | confidence | source |
|---|---|---|---|---|---|---|---|---|
| Jauce | すべての方法（PayPal含む、方法によらず一律と明記） | 3.9% | ¥40 | deposit amount（入金額） | 入金1回につき（購入時の入金） | JPY。為替スプレッドの記載なし | direct_fetch | jauce.com/japan_auction_detail |
| ZenMarket | 全方法共通の基本率 | 3.5% | なし | total transaction amount（振込希望額ではなく取引総額） | 取引（入金）1回につき | JPY。「PayPal支払い時はPayPal/銀行のレートで自動換算」の言及はあるがスプレッド率は非公表 | direct_fetch（2026-09-07取得。2026-09-12に再訪を試みたが403で不可） | zenmarket.jp/en/payment.aspx |
| ZenMarket | 方法別内訳（fees.aspxの「from 1%」の内訳） | 不明（「1%から」とだけ） | 不明 | 不明 | 不明 | 不明 | 非公表（要ログインの profile/addfunds.aspx の先） | zenmarket.jp/en/fees.aspx |
| ZenMarket | PayPal入金（参考・非一次情報） | 3.2%（参考値、ZenMarket公式ではない） | ¥40 | deposit amount | 不明 | JPY | B_inferred（独語圏の複数の書き手が一致。ZenMarket自身の一次ページではない） | teetalk.de ほか |
| Buyee | PayPal / Credit Card(VISA/Mastercard/JCB/銀聯) / Alipay / Buyee Wallet / FPX / iDEAL\|Wero / Przelewy24 | **非公表** | **非公表** | — | — | 決済通貨の決まり方は明記（カード発行国／PayPal登録国／Alipayは人民元）だが換算スプレッドの料率は非公表 | direct_fetch（Payment MethodsページとFeesページの両方を確認、いずれにも料率記載なし） | buyee.jp/helpcenter/guide/payment?lang=en, buyee.jp/helpcenter/guide/fees?lang=en |
| Neokyo | Neokyo Wallet(PayPal経由) / Stripe(Visa/Mastercard/AMEX/JCB) / Wise | **非公表（Neokyo自身は取らないと明記）** | — | — | — | 「決済プロバイダ自身が手数料を徴収する」と明記。PayPalの例として¥40という数字が出るが、これはPayPal自身の料率としての言及でありNeokyoの公表値ではない | direct_fetch | neokyo.com/en/wallet-introduction |
| FROM JAPAN | credit card / PayPal / Alipay（検索スニペットのみで存在を確認） | **未検証（この環境からは403でページに到達できず）** | — | — | — | — | 検証不能（403）。検索スニペットに「Payment processing fee (within Japan): Free of charge」という言及があるが逐語引用ではないため不採用 | www.fromjapan.co.jp/japan/en/help/payment/ 、.../help/fee/ 、fjlabo.fromjapan.co.jp/introduction/en/index.html（すべて403） |

## 何が確認できて、何ができなかったか

### 直接確認できたページ（direct_fetch）

- Jauce: `https://www.jauce.com/japan_auction_detail` — 200、本文取得、逐語引用あり
- Buyee: `https://buyee.jp/helpcenter/guide/payment?lang=en`、`https://buyee.jp/helpcenter/guide/fees?lang=en` — いずれも200、本文取得（サーバレンダリングされた静的ページ）
- Neokyo: `https://neokyo.com/en/wallet-introduction`、`https://neokyo.com/en/fees` — いずれも200、本文取得

### 403でこの環境から到達できなかったページ

- ZenMarket: `https://zenmarket.jp/en/payment.aspx`（2026-09-07には到達できていた一次情報。既存のquoteは上書きしていない）
- FROM JAPAN: `https://www.fromjapan.co.jp/japan/en/help/payment/`、`https://www.fromjapan.co.jp/japan/en/help/fee/`、レガシーの `http://fjlabo.fromjapan.co.jp/introduction/en/index.html`（いずれもAWS WAFのCAPTCHA/チャレンジスクリプトが応答に含まれる403。curlはヘッダーを整えても本文が空のVue.js SPAシェルしか返らない）
- `web.archive.org` 経由の代替取得も試みたが、このツール環境からは archive.org 自体が到達不能（別マスタ `master/carrier-surcharges.json` に記録済みの制約と同種）

**第三者サイトへのフォールバックは行っていない**——ZenMarketの基本率とJauceは一次ページから直接取得済みなので不要。FROM JAPANとZenMarketの方法別内訳は「一次情報が読めなかった」という空白のまま残し、他社の値で埋めていない。唯一の例外はZenMarketのPayPal率で、これは既存行（2026-09-07時点、B_inferred）をそのまま維持しただけで今回新たに追加した推測ではない。

## 3.5%（現行コードの逆算値）との整合・矛盾

- **Jauce（3.9%+¥40）は3.5%と矛盾する**——3.9%は3.5%より常に高く、固定¥40がさらに上乗せされる。ただしこれは本タスク以前からfees.json上ではJauce専用のrule（`fixed_plus_rate`）として正しく表現されており、今回新たに見つかった矛盾ではない。
- **ZenMarketの基本率は3.5%と一致する**（payment.aspxに「Deposit fee is 3.5% of the total transaction amount」と明記）。ただし一致した理由（実際にその支払方法だったのか偶然か）は追跡できない。方法別の内訳（fees.aspxの「from 1%」）が読めていないため、カード決済に限定した場合に3.5%のままでよいかは未確定。
- **Buyee・Neokyo・FROM JAPANは比較対象となる公表値が無い／得られなかった**ため、3.5%との整合・矛盾いずれも判定不能。

## 1回課金か、購入時と送料支払い時の2回課金か

現行コードはF07を注文につき1回（`stage: purchase`）だけ計上する前提。一次情報を確認した範囲では:

- Jauce・ZenMarket: 入金手数料は「1回の入金につき」と明記されており、2回発生する記述はない。
- Buyee: 「Second Payment stage (Domestic and International Shipping, and other Fees)」という二段階の支払いタイミングが明記されているが、この二段階目に決済手数料（%や固定額）が別途かかるとは書かれていない——支払いのタイミングが2回に分かれるという事実のみ。
- Neokyo: Order Payment（商品ごと）とShipment Payment（荷物ごと）の別建て課金があるが、これはF02（商品/送料の請求構造）の話であり、F07（決済手数料そのもの）が2回取られるという記述ではない。

**結論**: 現時点の一次情報からは、F07を1回課金とする現行実装の前提を覆す証拠は見つからなかった。ただしBuyeeの二段階請求構造は、将来より詳しい一次情報が見つかった場合に再確認すべき点として残す。

## 非公表企業（Buyee・Neokyo・FROM JAPAN）に対する当面の扱い

`master/fees.json` の `conclusions.F07_no_disclosure_default_working_treatment` を参照。要旨:

- **扱い**: 方法別の入金・決済手数料を公表していない会社については、当面は現行の3.5%（支払方法不明の逆算値）を「一般的な相場に基づく暫定値」として使い続けてよい。
- **根拠**:
  1. **誤差の絶対額が小さい**（強い）——F07は総額の数%に過ぎず、通関立替手数料や申告価格のように総額の順位を動かすほどの絶対額にはなりにくい。
  2. **上下双方向に誤差が閉じている**（中程度）——今回確認できた公表値（Jauce 3.9%+¥40、ZenMarket 3.5%）は3.5%の前後に分布しており、系統的に一方向に偏っていない。
  3. **宣言価格の扱いとの非対称**（強い、対比としての根拠）——宣言価格は関税・VATという法的リスクを伴う費目なので一般相場を使わない、という立場と対をなす。F07は代行会社の内部手数料に過ぎず、法的リスクも大きな金額変動も伴わない。
- **反論として残しておくべき点**:
  - 「非公表」の中身は一様ではない。Buyee/Neokyoは確認できた非公表だが、FROM JAPANは単に「この環境からは検証できなかった」だけで、実際には公表されている可能性が残る。
  - ZenMarketの「from 1%」という表現は、少なくとも一部の支払方法でカード決済が1%台になりうることを示唆する。オーナー方針の「カード前提」を厳密に適用するなら、ZenMarketに3.5%を使い続けるのは過大側に倒れている可能性がある。
  - Jauceは「非公表だから一般相場」の対象ではなく「公表されているのに一般相場を使ってしまっている」ケースにあたる。もし現行コードがJauceにも一律3.5%を適用しているなら、これは推測ではなく公表値との差し替えが必要な既知の不整合としてT-F9に残すべき。

## 次にやるべきこと（このタスクのスコープ外）

1. ブラウザ操作を持つ環境からFROM JAPANの該当ページ（AWS WAF）とZenMarketのpayment.aspx/addfunds.aspx（ログイン後）に再訪し、方法別の表を取得する。
2. コード側がF07にどの数値（3.5%固定か、会社ごとに分岐しているか）を実際に使っているかを`src/`側の調査として別途確認する（本タスクは`src/`に触れていない）。
3. Jauceの3.9%+¥40が現行コードに反映されているかを確認する（`docs/ROADMAP.md` の C-2 で「gross-upが過大かもしれない」という既存の懸念と関連する可能性がある）。
