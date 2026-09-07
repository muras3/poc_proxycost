# 実請求との突き合わせ（reality）

**担当**: 公開されている実際の請求・明細と、この計算機の出力を費目単位で突き合わせる。
**作業日**: 2026-09-06
**計算機の状態**: `3aabc20` 時点の `src/lib/pricing/*` に対して `npx tsx` で `compare()` を実行（実行時刻 2026-09-06T14:00–14:16Z）。
作業中に他の作業者が `ems.ts` / `compare.ts` / `types.ts` / `DESIGN-NOTES.md` を編集した。
**§4.6 の基準ケースは編集後の作業ツリーで再実行し、総額・順位とも同一であることを確認した**（14:20Z）。
使用したいずれの事例も 12kg 以下なので、`ems.ts` の 15kg 超の丸め変更の影響は受けない。

---

## 0. 先に結論

- **費目まで数字が載っている実請求は 7 件見つかった。** ZenMarket 3、Buyee 2、Jauce 1、FROM JAPAN 1（部分）。
- **Neokyo の実請求は 1 件も見つからなかった。** 探した範囲は §5 に書く。**Neokyo はこの計算機が全ての条件で1位に置いている会社であり、その1位が実請求で一度も裏づけられていない。**
- 総額が一致した事例は **0 件**。ただし不一致の大半は「事例が古く、当時の料金表と現在の料金表が違う」ことで説明がつく。**制度差を除いた後にも残る不一致が 3 種類あり、いずれも計算機側の誤り**（§4）。
- 一方、**日本郵便 EMS の 27 段 × 5 地帯の料金表と地帯割り当ては、日本郵便の現在の公表表と完全に一致した**（§3.1）。実請求 2 件で「代行の国際送料 = EMS 公表料金そのまま」も実証できた（事例 R2・R4）。

---

## 1. 方法

1. WebSearch（日・英・繁中）でブログ・掲示板（PTT / 痞客邦 / ameblo / note / 個人ブログ）から、
   **商品代・手数料・国内送料・国際送料・総額が数字で載っている**投稿を集めた。
2. 各事例を同条件で `compare()` に入れて実行した（下記の呼び出し器を使い、作業後に削除した）。
3. 重量が書いていない事例は、書いてある国際送料から **その事例の時点の** EMS 料金表を逆引きして重量段を推定した。
   古い料金表は Wayback Machine の日本郵便スナップショットから取った（§3.2）。逆引きした箇所はその都度明記する。
4. 一致・不一致を総額ではなく**費目単位**で分解し、差の出所を「制度変更（事例が古い）」と「計算機の誤り」に分けた。

事例の内訳が「商品代＋手数料＋国内送料」のようにまとめて書かれている場合、その粒度でしか分解できない。
その場合は**かたまり単位でしか比較していない**と明記した。

---

## 2. 事例

### R1 — ZenMarket 入金手数料（DESIGN-NOTES §3 の再確認）

- 出典: https://nyamo.life/archives/zenmarket.html ／ 記事日 2021-09-25 ／ 確認日 2026-09-06
- 条件: ZenMarket、台湾の利用者、口座チャージ

| | 公開値 | 計算機 | 差 |
|---|---:|---:|---:|
| ¥10,000 を使えるようにするための請求 | ¥10,363 | ¥10,363（`10000/(1-0.035)=10362.7`） | ¥0 |

原文: 「10,000円チャージするには、10,363円がクレジットカードから引き落としされます」

**一致。** DESIGN-NOTES §3 の記述は再現できた。加えてこの1件は、
**ZenMarket の 3.5% が「受け取る額」ではなく「請求される額」に対する率（= gross-up）である**ことを示す。
`compare.ts` の `base/(1-rate) - base` は ZenMarket については正しい。
（Jauce は違う。R6 を見よ。）

ただし §3.5 のとおり、ZenMarket 公式は現在この率を **「Funds Deposit Fee (from 1%)」** と書いており、
3.5% は支払手段のひとつの値でしかない。`deposit.rate = 0.035` を `tier: 'fixed'` としているのは強すぎる。

---

### R2 — ZenMarket → 台湾、カメラ1点（国際送料が EMS 公表料金と完全一致）

- 出典: https://nyamo.life/archives/zenmarket.html ／ 記事日 2021-09-25（注文 2021-08-20、着 2021-08-31）／ 確認日 2026-09-06
- 条件: ZenMarket、台湾（= EMS 第1地帯）、1点、Olympus E-PL10、EMS

| 費目 | 公開値 | 出所の検証 |
|---|---:|---|
| 商品代 | ¥65,780 | — |
| ZenMarket 手数料 | ¥300 | 当時の料金（2023-10-18 に ¥500 へ改定。§3.4） |
| 国際送料（EMS） | ¥2,700 | **2021年当時の第1地帯 1.5kg 段 = ¥2,700 と完全一致** |
| 関税（台湾、着払い現金） | ¥3,492（NT$873） | — |
| 合計 | **¥72,272** | 65,780+300+2,700+3,492 = 72,272（自己整合） |

**重量は記事に無い。国際送料 ¥2,700 から 2021-01-28 時点の日本郵便 EMS 表を逆引きして 1.25kg 超〜1.5kg 段と推定した。**
カメラ＋外箱としてもっともらしい。

**判定: 国際送料の費目のみ一致（差 ¥0）。**
これは `services.ts` の `emsMarkup: 0`（ZenMarket、`tier: 'estimate'`）を実請求で裏づける唯一の事例。

台湾は計算機の対応7カ国に無いため、総額の突き合わせはできない。

---

### R3 — ZenMarket → オーストラリア、2点

- 出典: https://nichigopress.jp/topics-item/78825/ ／ 記事日 2023-10-25 ／ 確認日 2026-09-06
- 条件: ZenMarket、オーストラリア（EMS 第3地帯）、2点（楽天のランチバッグ ¥1,232 ＋ メルカリの傘 ¥2,380）、EMS

公開値（記事が分けている粒度そのまま）:

| 費目 | 公開値 |
|---|---:|
| 商品代（1,232 + 2,380） | ¥3,612 |
| 手数料 | ¥300/点（記事の記載） |
| **商品代＋手数料＋国内送料 の小計** | **¥4,796** |
| 国際送料（EMS） | **¥4,021** |
| 合計 | **¥8,817** |

計算機（`{country:"AU", items:[楽天 ¥1,232 / メルカリ ¥2,380]}`、重量は下記のとおり逆引き）:

```
items              ¥3612
service-fee        ¥1600   ¥800 × 2
domestic-shipping  ¥1600   ~¥800 each（仮定）
ems                ¥3900   zone 3, 800 g step
deposit             ¥389   3.5%
duty                  ¥0   under AUD 1000
vat (GST)           ¥751   10%
clearance              —
TOTAL             ¥11852
```

**重量は記事に無い。国際送料 ¥4,021 に最も近い第3地帯の段（800g = ¥3,900）を採り、
梱包後 800g になる正味重量（`(800-300)/1.2 = 416g`、2点で 208g ずつ）を入力した。**

差の分解:

| かたまり | 公開値 | 計算機 | 差 | 原因 |
|---|---:|---:|---:|---|
| 商品代 | 3,612 | 3,612 | 0 | — |
| 手数料＋国内送料＋入金手数料 | 1,184（= 4,796 − 3,612） | 3,589（1,600+1,600+389） | **+2,405** | ①国内送料 ¥800/点 の仮定（§4.1）②手数料 ¥800 固定（§4.2）③事例が ¥300/点 時代 |
| 国際送料 | 4,021 | 3,900 | −121 | **不明**（下記） |
| GST | 記載なし | 751 | +751 | ZenMarket は AU 向け ≤AUD1,000 の荷物に 10% GST を国際送料と同時に徴収すると公式に書いている。記事の ¥4,021 に含まれている可能性がある |
| 合計 | 8,817 | 11,852 | **+3,035** | |

**国際送料 ¥4,021 は、第3地帯のどの公表段とも一致しない。** 隣接段は 800g=¥3,900 / 900g=¥4,150。
3.5% の gross-up を掛けると ¥3,900 → ¥4,041（差 ¥20）で近いが一致しない。
AUD 表示からの円換算の可能性もある。**特定できなかったので、特定できなかったと書く。**
R2 の完全一致と合わせると、ZenMarket の `emsMarkup: 0` は「1件で一致・1件で不明」であり、`tier: 'estimate'` のままが妥当。

---

### R4 — Buyee → イタリア、1点 9kg（**EMS 公表料金と完全一致した最良の事例**）

- 出典: https://iiyanitalia.com/howitaly/life/buie-review ／ 記事日 2021-01-06 ／ 確認日 2026-09-06
- 条件: Buyee、イタリア（EMS 第3地帯＝当時の「ヨーロッパ」）、Yahoo!ショッピングの着物用マネキン1点、EMS、**約9kg**

公開値:

| 費目 | 公開値 |
|---|---:|
| 商品代金 | ¥10,980 |
| Buyee 手数料 | ¥300 |
| 保障プラン | ¥500（記事は「任意」と書いている） |
| 海外配送料（EMS、約9kg） | **¥15,300** |
| Buyee への合計 | **¥27,080** |
| 輸入関税（着後、現地払い） | 約 €45 |

**検証: 2021-01-28 時点の日本郵便 EMS 表で、第3地帯（ヨーロッパ）9.0kg までは ¥15,300。完全一致（差 ¥0）。**
→ **Buyee の国際送料は日本郵便の公表 EMS 料金そのままである**ことが実請求で確認できた。
`services.ts` の Buyee `emsMarkup: 0` / `emsMarkupTier: 'estimate'` は、少なくともこの1件で実証された。
また記事の「約9kgs」は**発送時の実重量**であって商品の正味重量ではない。

計算機（イタリアは未対応なのでドイツで代用。梱包後 9,000g になる正味 7,250g を入力）:

```
items              ¥10980
purchase-fee         ¥500   ¥500 × 1 order
domestic-handling    ¥500   ¥500 × 1 order
domestic-shipping      ¥0
ems                ¥21400   zone 3, 9 kg step
duty                    —   over the EUR 150 threshold — rate not included
vat                 ¥6152   19%
clearance               —
TOTAL              ¥39532
```

差の分解（公開値に関税 €45 ≒ ¥5,715（2021年の €1≒¥127）を足した ¥32,795 と比べる）:

| 費目 | 公開値（2021） | 計算機（2026） | 差 | 原因 |
|---|---:|---:|---:|---|
| 商品代 | 10,980 | 10,980 | 0 | — |
| 代行手数料 | 300 | 500 | +200 | **制度変更。** Buyee は 2026-04-01 に購入サポート手数料を ¥300→¥500 に改定。現行制度では**一致** |
| プラン | 500 | 500（`domestic-handling` という名前で計上） | 0 | 金額は一致するが**費目名が違う**（§4.4） |
| 国内送料 | 0 | 0 | 0 | — |
| 国際送料 | 15,300 | 21,400 | **+6,100** | **全額が EMS 料金改定。** 2021年の第3地帯9kg=¥15,300 → 現在¥21,400。**マークアップではない** |
| 税 | 5,715（関税・実費） | 6,152（VAT 19%）＋関税「—」 | +437 | 計算機はイタリア未対応でドイツ(19%)代用。イタリアの VAT は 22%。関税は「—」で計上されていない |
| 合計 | 32,795 | 39,532 | **+6,737** | |

**制度変更（EMS 改定 ¥6,100 ＋ 手数料改定 ¥200）を除くと、残差は税の ¥437 のみ。**
**この事例は、代行手数料・プラン・国内送料・国際送料の 4 費目すべてで計算機のモデルが正しいことを示している。**

---

### R5 — Buyee → チェコ、2点（手数料の費目構成のみ）

- 出典: https://ameblo.jp/jablko-japonka/entry-12654501957.html ／ 記事日 2021-02-04 ／ 確認日 2026-09-06
- 条件: Buyee、チェコ、2注文（メルカリの日焼け止め ¥3,499 ／ LOHACO）、おまとめ梱包

| 費目 | 公開値 | 計算機の扱い |
|---|---:|---|
| 商品代金（メルカリ） | ¥3,499 | `items` |
| 購入サポート手数料 | ¥300 × 2注文 | `purchase-fee` ¥500 × 2（現行料金） |
| 支払手数料 | ¥200 | **計算機に費目が無い** |
| 国内送料（LOHACO） | ¥220 | `domestic-shipping`。**計算機の仮定 ¥800 に対し実勢は ¥220** |
| おまとめ梱包手数料 | ¥500 | `optional` に無い（Buyee の任意費目は保護梱包 ¥1,500 / 特殊梱包 ¥2,500 / 通関 ¥2,800 のみ） |
| 国際送料（EMS） | ¥6,600（送料無料キャンペーンで実際は ¥0） | — |
| 代替手段の提示 | DHL ¥6,481 ／ 国際小包AIR ¥6,750 ／ **国際小包・船 ¥2,900** | 計算機は EMS 固定（§4.5） |
| 手数料の合計（本人記載） | 「手数料の合計１３００円。（ロハコの送料２２０円を含めると１５２０円」 | |

チェコは対応国に無いので総額比較はできない。**この事例が示すのは 3 点**:
①国内送料の実勢は ¥220 で、計算機の ¥800 仮定は 3.6 倍高い。
②同じ荷物で船便なら ¥2,900、EMS なら ¥6,600 と 2.3 倍違う。計算機は高い方だけを出している。
③Buyee の「おまとめ梱包 ¥500」が計算機の任意費目リストに無い。
（現行の公式ページ〔§3.2〕にも「おまとめ梱包サービス」はオプション費用として載っている。）

---

### R6 — Jauce、2件落札（**完全に内訳が載っている唯一の Jauce 事例**）

- 出典: http://japanesebaseballcards.blogspot.com/2015/06/proxy-bidding-with-jauce.html ／ 記事日 2015-06-26 ／ 確認日 2026-09-06
- 条件: Jauce、同一出品者の 2 オークション（¥800 / ¥700）、送り先は記事に明示なし（ブログは米国拠点）

公開値（すべて記事に数字で載っている）:

| 費目 | 公開値 |
|---|---:|
| 落札価格 | ¥800 ＋ ¥700 = ¥1,500 |
| オークション手数料 1件目 | ¥864（= 800 + 800×8%） |
| オークション手数料 2件目 | ¥456（= 400 + 700×8%） |
| **銀行送金手数料（banking fee）** | **¥300**（同一出品者につき1回） |
| 入金手数料（¥2,000 入金） | ¥123 |
| 入金手数料（¥2,620 入金） | ¥148 |
| 国内送料 | ¥300 |
| 国際送料 | ¥1,200 |
| **合計** | **¥4,891** |

自己整合の確認: 1,500 + 1,320 + 300 + 271 + 300 + 1,200 = 4,891 ✔

計算機（`{country:"US", items:[ヤフオク ¥800（国内送料 ¥300）, ヤフオク ¥700（国内送料 ¥0）]}`、正味250g×2）:

```
items               ¥1500
service-fee          ¥800   ¥400 × 2
ad-valorem           ¥120   8%
domestic-shipping    ¥300
packing              ¥420   ¥300 per parcel + ¥120/kg
ems                 ¥5020   zone 4, 900 g step
deposit              ¥373   ¥40 + 3.9%
duty                 ¥188   12.5%
clearance           ¥1403   USD 9.35
TOTAL              ¥10124
```

2015年の米国は de minimis $800 以下が免税だったので、関税 ¥188 と通関 ¥1,403 を除いた **¥8,533** と比べる。

| 費目 | 公開値 | 計算機 | 差 | 原因 |
|---|---:|---:|---:|---|
| 落札価格 | 1,500 | 1,500 | 0 | — |
| 代行手数料 | 1,320 | 920 | **−400** | **制度変更。** 2015年は初回落札 ¥800+8%、24時間以内の2件目が ¥400+8%。現在の Jauce 公式は「JPY 400 per auction + 8%」の一律。**計算機は現行制度どおりで正しい** |
| **銀行送金手数料** | **300** | **0（費目そのものが無い）** | **−300** | **計算機の欠落。**現行の Jauce 公式にも "Banking fee: JPY 300 flat per payment"（出品者ごと・1日1回に集約）として存在する（§3.3） |
| 入金手数料 | 271 | 373 | +102 | 分割入金2回 vs 1回、かつ率の扱いが違う（下記） |
| 国内送料 | 300 | 300 | **0** | **一致** |
| 梱包料 | 明細に行が無い | 420 | +420 | 2015年当時に梱包料の費目があったか不明 |
| 国際送料 | 1,200 | 5,020 | **+3,820** | **最大の差。** ¥1,200 は当時のどの EMS 段とも一致しない（2015年の北米宛 EMS 最低段は ¥2,000 前後）。**小形包装物か SAL の可能性が高い。計算機は EMS 固定**（§4.5） |
| 合計 | 4,891 | 8,533 | **+3,642** | |

**入金手数料の性質がここで分かる。** 公開値: ¥2,000 の入金に ¥123 → `40 + 2000×4.15% = 123` ✔。
¥2,620 の入金に ¥148 → `40 + 2620×4.15% = 148.7` ✔。
つまり Jauce の入金手数料は **「使えるようにしたい金額（credit）に対する率を、その上に足す」** 方式。
計算機は `base/(1-rate) - base`（= 実効 4.06%）で計算しているが、
Jauce 公式の文言は "JPY 40 + 3.9% **over the deposit amount**" なので **`40 + 0.039 × base` が正しい**。
実効率で 0.16pt、¥40,000 の注文で約 ¥63 の過大計上。（ZenMarket は R1 のとおり gross-up で正しい。**2社で方式が違う。**）

---

### R7 — FROM JAPAN → 台湾（部分。総額なし）

- 出典: https://www.ptt.cc/bbs/e-shopping/M.1518458486.A.CB4.html ／ 投稿日 2018-02-13 ／ 確認日 2026-09-06
- 条件: FROM JAPAN、台湾、コート（¥1,799 → 値動きし最終的に未購入）、別便で約9kg を FedEx エコノミー

載っている数字:

| 費目 | 公開値 | 計算機の扱い |
|---|---:|---|
| 商品価格 | ¥1,799 / ¥2,399 / ¥2,699（変動） | — |
| 「日本寄送手續費」 | ¥200 | `payment-inside-jp` ¥200 に対応 |
| 「其他手續費」 | ¥100 | 対応なし |
| 国内送料の選択肢 | 直送 ¥300 ／ 安心転送 ¥700 | 計算機の仮定は ¥800。**実勢は ¥300〜700** |
| 国際送料 | FedEx エコノミー（約9kg、3日） | 計算機は EMS 固定 |
| 総額 | **記載なし** | |

**総額が無いので突き合わせはできない。** 記録として残す。
なお国内送料の実勢が ¥300〜¥700 という点は R5（¥220）・R8（¥410）と整合し、
計算機の ¥800 仮定が高い側に寄っていることを 3 件目として支持する。

---

### R8 — ZenMarket 国内送料の実勢（部分）

- 出典: https://ken25sai.pixnet.net/blog/posts/16050555581 ／ 記事日 2021-10-26 ／ 確認日 2026-09-06
- 「ZENMARKET要向我收￥840、確認之後改要向我收￥410運費」（当初 ¥840 と請求され、確認後 ¥410 に訂正された）

総額は無い。国内送料の実勢値 **¥410** の 1 サンプルとしてのみ使える。

---

## 3. 事例と並行して取った一次情報（「実際に請求される額」の裏取り）

事例が集まらない社については、**その社自身が現在公表している請求の内訳**を原典から取った。
これは実請求そのものではないが、「何がいくら請求されるか」の一次情報である。

### 3.1 日本郵便 EMS 料金表 — **完全一致**

- 出典: https://www.post.japanpost.jp/send/oversea/charge/list-ems/all.html ／ 確認日 2026-09-06
- `ems.ts` の `EMS_TABLE` 27 段 × 5 地帯 **135 個の数字がすべて公表表と一致した**（500g ¥1,450/1,900/3,150/3,900/3,600 … 15kg ¥14,600/18,350/34,000/39,100/41,700）。
- 地帯の割り当ても一致:
  第1=中国・韓国・台湾／第2=アジア（中韓台を除く）／**第3=オセアニア・カナダ・メキシコ・中近東・ヨーロッパ**／第4=米国（グアム等海外領土含む）／第5=中南米・アフリカ。
  → `EMS_ZONE` の `US:4, GB/DE/FR/AU/CA:3, SG:2` は正しい。
- **ただし公表表には脚注がある**: 「※第3地帯および第4地帯については、**特別追加料金を含みます**」。
  この特別追加料金は改定される。**転記時点を固定した表を `tier` なしで持つのは危うい**（`EMS_CHECKED_ON` はあるが、EMS の行は `tier: 'estimate'` で出ている）。

### 3.2 Buyee 公式料金ページ — 手数料は一致、`domestic-handling` は名前が違う

- 出典: https://buyee.jp/helpcenter/guide/fees?lang=ja ／ https://faq.buyee.jp/article/3?lang=ja ／ 確認日 2026-09-06
- 「購入サポート手数料 **一律￥500/オーダー毎**」→ `perOrderYen: 500` **一致**。
- 「※落札/購入時の**個数が2個以上の場合でも一律￥500**です」「同一ショップからの購入は複数の商品が含まれてる場合でも一律￥500」
  → 計算機は `perOrderYen × orders` で数量を掛けていないので **正しい**（他4社は違う。§4.3）。
- 保障プラン: **スタンダード ¥500 ／ 配送保障 ¥500 ／ 検品 ¥300 ／ ライト ¥0**。
  → 計算機の 2 本目の ¥500（`domestic-handling` = "Domestic handling"）は**このプラン料金であって「国内配送サービス料」ではない**。
  Buyee の公式ページに「国内配送サービス料」という費目は存在しない。**ライトプランを選べば ¥0 にできる。**
- 「国内配送料金は…通常150円～1,500円程度」「注文ごとに国内配送料金が発生」→ 注文単位という扱いは正しい。
- 通関業務委託料 ¥2,800（落札価格20万円超・EMS等）→ `optional` と一致。
- **DESIGN-NOTES §4 の「Buyee の Standard Plan が公式ページ上で ¥800 と ¥500 の両方に見える」は解消できる**:
  購入サポート手数料 ¥500/オーダー と スタンダードプラン ¥500 は別物で、合計 ¥1,000。¥800 という値は現在の公式ページには無い。

### 3.3 Jauce 公式料金ページ — **料金ページの URL が 404。銀行送金手数料が計算機に無い**

- `services.ts` の `sourceUrl: 'https://www.jauce.com/fee'` は **HTTP 404**（curl で確認、2026-09-06）。
  現行の料金ページは https://www.jauce.com/japan_auction_detail 。
- 現行の記載（確認日 2026-09-06）:
  - Jauce commission: "**JPY 400 per auction + 8% of the closing price**" → `perItemYen:400 / adValoremRate:0.08` **一致**
  - Depositing fee: "**JPY 40 + 3.9% over the deposit amount**" → 金額は一致。**掛け方が違う**（R6）
  - **Banking fee: "JPY 300 flat per payment"（出品者ごとに1日1回に集約）→ 計算機に費目が無い**
  - Smart packing: "JPY 300 per package + JPY 120/kg" → `packing` **一致**
  - "JPY 250/kg fee is required for methods other than EMS"、通関 ¥2,800（20万円超）
  - **「初回落札は ¥800」という記載は現行ページに無い。** 2015年の事例（R6）で見えた ¥800/¥400 の区別は現在は無いと読める。

### 3.4 ZenMarket 公式料金ページ — **手数料は出品元サイトごとに ¥300/¥500/¥800**

- 公式は直アクセスで 403（DESIGN-NOTES §4 の記述どおり）。Wayback の 2026-07-25 スナップショットから取得。
  https://web.archive.org/web/20260725075657/https://zenmarket.jp/en/fees.aspx ／ 確認日 2026-09-06
- 原文: "We charge a convenient fee (**300-800 yen**) per item … Our **standard fee of 500 yen** applies to **Amazon, Rakuten, and most other stores**. A **discounted fee of 300 yen** applies to Recommended Stores, while a fee of **800 yen** applies to **all Mercari items and JDirectItems Auction bids**."
  → **`fee.perItemYen: 800` の一律適用は、ヤフオクとメルカリ以外のすべてのサイトで ¥300 過大。**
- 原文: "**If you buy 3 identical T-shirts, our service fee will still be the same.**"
  → 数量では増えない（§4.3）。
- 原文: "Funds **Deposit Fee (from 1%)** — Covers payment gateway fees like Paypal/Alipay"
  → 3.5% は支払手段依存の一値。`tier: 'fixed'` は強すぎる。
- 手数料に含まれるもの: 初回同梱、500万円未満の輸送保険、**日本国内の銀行送金手数料**。
- 料金改定の履歴（一次・二次）:
  - 2023-10-18 ¥300 → ¥500／点（https://prtimes.jp/main/html/rd/p/000000295.000023616.html）
  - 2026-04-01 メルカリ、2026-05-01 ヤフオク ¥500 → ¥800（https://zenmarket.jp/fr/blog/post/16434/）
- AU 向け: 「AUD 1,000 以下の荷物に 10% GST を徴収し、**国際送料と同時に請求する**」。
- EU 向け: 「品代 150 EUR 以下の荷物は VAT 前払いを**任意で選べる**」。

### 3.5 FROM JAPAN 公式（翻訳配信ファイル） — **¥200 の支払手数料はオークション限定**

- 出典: https://www.fromjapan.co.jp/translate/en_help.txt（base64 の JSON）／ 確認日 2026-09-06
- `help_fee_140`: "**500 yen per item**" → `perItemYen: 500` **一致**。
  ただしこれは `help_fee_130` の見出しどおり **"Product Protection Plan"** の料金であり、
  Charge 2 の必須費目（`title_serviceRule_1400` "- Handling fees"）である。
  → **`optional` に別途載っている "Product Protection Plan ¥500 per item" は、必須費目の二重計上になっている。**
- `help_fee_150`: "***If multiple units of the same item are paid together, handling fees will be the same as for one item.***" → 数量では増えない（§4.3）。
- `help_fee_160` / `help_fee_180`: "Payment Fees Inside Japan" = "**200 yen (consistent)**"
- `title_serviceRule_1411`: "* Purchases made **after January 31, 2023** at 11:00 (JST) **will no longer be charged a payment fee**."
- `title_serviceRule_1460`: "Regardless of the payment method, items won on **JDirectItems Auctions** shall incur a 200 yen payment fee **per auction**."
- `help_fee_280`: "* We will not collect any payment fees from customers even if they are incurred on purchases made in Japan."
  → **`paymentInsideJapanYen: 200` を全サイト・全注文に一律で乗せているのは誤り。ヤフオクの落札のみ、落札1件ごと。**
  `services.ts` のコメント「点ごとか注文ごとか原文から読めない」は**原文で解決できる（オークション1件ごと）**。
- 輸出通関 ¥2,800（20万円超・日本郵便）→ `optional` と一致。
- AU: "10% of the total order value (**Charge 1 + Charge 2** before GST is added)"、
  SG: 400 SGD 未満で 9% of (Charge 1 + Charge 2)。
  → **代行が前払いで徴収する GST の課税ベースは「商品代＋全手数料＋全送料」。**
  計算機の AU は `base:'FOB'`（`itemsYen + emsYen`）、SG は `CIF`（`items+dom+ems`）で、
  **どちらも手数料を課税ベースから落としている**（税の担当に引き継ぐ）。

### 3.6 Neokyo 公式料金ページ — **`domesticIncluded: true` を支持しない**

- 出典: https://neokyo.com/en/fees ／ https://neokyo.com/fr/frais-et-commissions ／ 確認日 2026-09-06
- 梱包料: "Up to 2 kilograms **500 yen**" / "More than 2 kilograms 500 yen + **150 yen** for each additional kilo over 2 kg, rounded up"
  さらに全段表（500, 650, 800, 950 …）が載っており、`packing: {perParcelYen:500, perKgYen:150, freeUpToG:2000}` と**完全一致**。
- 国際送料: "**We do not charge any Neokyo fee on shipping cost, you pay the actual provider price.**"
  → `emsMarkup: 0` を一次情報で確認できた（`emsMarkupTier` は `'estimate'` のままだが、**`'fixed'` に上げられる**）。
- 手数料: "Flat Fee **350 yen**"、"If you purchase multiples copies of the same item within the same Buy Request, this fee is **only applied once**."
  仏語版の注記: "Une commande concerne un article donné." → **異なる商品ごとに ¥350、数量では増えない**。
- **問題はここ。** 第1回支払いの見出しが英語で
  "**ORDER PAYMENT — Order and domestic shipping price — 350 ¥JPY**"、
  仏語で "**PAIEMENT DE LA COMMANDE — Prix de l'article et de la livraison vers Neokyo — 350 ¥JPY**"
  （＝「商品の価格**と Neokyo への配送の価格**」）。
  ¥350 が何を含むかの説明（"Our Neokyo service includes: purchasing the item from the seller, an open channel to ask questions…, Neokyo support, receipt and storage … for up to 45 days"）に
  **国内送料は入っていない。**
  → **`domesticIncluded: true` は、Neokyo 自身の料金ページ（英・仏）に反する。**
  §4.6 のとおり、これはこの計算機の順位を決めている仮定である。

---

## 4. 制度変更を除いても残る不一致（＝計算機の誤り）

### 4.1 国内送料 ¥800/点 の仮定が実勢より高い

実勢の実測値: **¥220**（R5、LOHACO）／**¥300 または ¥700**（R7、FROM JAPAN の2択）／**¥410**（R8、ZenMarket が訂正後に請求）。
Buyee 公式も「通常150円～1,500円程度」。**4サンプルすべてが ¥800 未満**（最大 ¥700）。
5点の注文で `¥800 × 5 = ¥4,000` が乗るので、総額に対する影響は最大級。
`tier: 'estimate'` で表示されている点は正しいが、中央値としては高すぎる。

### 4.2 ZenMarket の手数料を全サイト ¥800 にしている

正: 楽天・Amazon・その他多くの店 ¥500／推奨店 ¥300／**メルカリ・ヤフオクのみ ¥800**（§3.4）。
`services.ts` のコメントは「¥500 と誤っていた履歴がある。ヤフオクは ¥800」とあるが、**修正の方向に行き過ぎている**。
`SiteId` は既に型として存在するので、Jauce の `freeForSites` と同じ仕組みで表現できる。

### 4.3 数量（qty）で手数料を掛けている（4社で誤り）

| 社 | 一次情報 | 計算機 |
|---|---|---|
| ZenMarket | "If you buy 3 identical T-shirts, our service fee will still be the same." | `¥800 × 3` |
| FROM JAPAN | "If multiple units of the same item are paid together, handling fees will be the same as for one item." | `¥500 × 3` |
| Neokyo | "If you purchase multiples copies of the same item within the same Buy Request, this fee is only applied once." | `¥350 × 3` |
| Jauce | （数量に関する記載を確認できず） | `¥400 × 3` |
| Buyee | "個数が2個以上の場合でも一律￥500" | `¥500 × 1` ✔ |

実測（`{country:"US", items:[楽天 ¥3,000 × qty 3]}`、2026-09-06 実行）:

| 社 | 計算機の手数料 | 一次情報どおりの手数料 | 過大 |
|---|---:|---:|---:|
| Neokyo | ¥1,050 | ¥350 | +¥700 |
| ZenMarket | ¥2,400 | ¥500（楽天） | **+¥1,900** |
| FROM JAPAN | ¥1,500 ＋ 支払手数料 ¥200 | ¥500 ＋ ¥0 | **+¥1,200** |
| Buyee | ¥500 | ¥500 | ¥0 |

**`compare.ts` の `chargeableUnits` が `i.qty` を足し込んでいるのが原因**（`feeLines`）。
Buyee だけが `perOrderYen × orders` なので免れている。

### 4.4 費目名が実際の請求名と違う

- Buyee の 2 本目の ¥500 は **"Domestic handling"** と表示されるが、実体は**保障プラン**（ライトなら ¥0）。
  「国内配送サービス料」という費目は Buyee に存在しない（§3.2）。
- FROM JAPAN の必須 ¥500 は "Service fee" と表示されるが、実体は **Product Protection Plan**。
  同じものが `optional` にも "Product Protection Plan ¥500 per item" として**二重に載っている**（§3.5）。
- FROM JAPAN の "Payment fee inside Japan ¥200 × orders" は、**ヤフオクの落札1件ごと**が正しく、
  楽天・Amazon・メルカリ等では ¥0（§3.5）。ノートの「per order or per item is not stated」は原文で解決済み。
- Jauce に **銀行送金手数料 ¥300/支払** の費目が無い（§3.3、R6 で実請求に現れている）。

### 4.5 国際送料を EMS だけで出している

R5（Buyee／チェコ）は同じ荷物で **EMS ¥6,600 ／ DHL ¥6,481 ／ 国際小包AIR ¥6,750 ／ 国際小包・船 ¥2,900** と提示されている。
R6（Jauce）の実請求 ¥1,200 は当時のどの EMS 段とも合わず、小形包装物か SAL と考えるほかない。
R7（FROM JAPAN）は FedEx。
**5社すべてが EMS より安い手段を持っており、実請求はしばしばそちらである。**
国際送料は総額の 40〜50%（DESIGN-NOTES §1）なので、EMS 固定は総額を系統的に高く出す。
（順位への影響は小さい。全社に同じ EMS 表を当てているため。ただし各社の対応手段は同一ではない。）

### 4.6 **Neokyo の `domesticIncluded: true` が1位を作っている**

`domesticIncluded: true` は Neokyo だけに立っており、`domestic-shipping` を ¥0 にする。
Neokyo 自身の料金ページ（英・仏）はこれを支持しない（§3.6）。

DESIGN-NOTES §1 の基準ケース（5点 × ¥3,000、米国、正味600g／点）を `3aabc20` で実行した結果と、
一次情報どおりに直した場合の総額:

| 社 | 計算機（現状） | 直した場合 | 直した内容 |
|---|---:|---:|---|
| Neokyo | **¥33,528（1位）** | ¥37,528 | 国内送料 ¥800×5 を加算（§3.6） |
| FROM JAPAN | ¥38,478（2位） | **¥37,478（1位）** | 支払手数料 ¥200×5 を削除（非オークションのため §3.5） |
| ZenMarket | ¥40,273（4位） | ¥38,718 | 手数料 ¥800→¥500／点（楽天等）＋入金手数料の再計算 |

**1位が Neokyo から FROM JAPAN に入れ替わる。差は ¥50。**
しかもこの ¥50 は国内送料の仮定に依存しない（両社とも実費で同額が乗るため）。
構造としては `Neokyo 1,750 + 梱包 800 = 2,550` 対 `FROM JAPAN 2,500 + 梱包 0 = 2,500`。

DESIGN-NOTES §1「逆転条件」は、国内送料が ¥0 のとき **1点のときに限り** Neokyo → FROM JAPAN の入れ替わりが起き、
「2点以上では入れ替わらない。Neokyo の ¥350/点 が FROM JAPAN の ¥500/点 + ¥200/注文 に対して点数とともに効くため」と書いている。

**その「¥200/注文」が、非オークションの注文には発生しない**（§3.5、FROM JAPAN 自身の規約）。
それを外すと点数が効かなくなり、**5点でも入れ替わる。**
DESIGN-NOTES が「重量を ×1/10 から ×3 まで外しても1位は動かない」と書いた頑健性は、
**重量に対しては成り立つが、この 2 つの費目の扱いに対しては成り立たない。**
順位は総額の推定誤差には強いが、**費目が有るか無いかの判断には弱い。**

---

## 5. 集められなかった社と、その理由

### Neokyo — **実請求 0 件**

探した場所と検索語:
- WebSearch（英）: `Neokyo review "I paid" total invoice item price "service fee" "packing fee" EMS shipping myfigurecollection`、
  `site:reddit.com Neokyo total cost breakdown "packing fee" "service fee" yen shipping EMS`、
  `Neokyo trustpilot review "350 yen" "500 yen" packing paid total order breakdown yen figures shipped`
- WebSearch（日）: `"neokyo" 使ってみた 手数料 350円 梱包料 500円 国際送料 合計 内訳 レビュー`、
  `Neokyo 実際 注文 合計 "350" "500" 梱包 EMS 円 支払った 明細`
- WebSearch（仏・西・独）: `Neokyo avis commande frais total yen "frais de service" "frais d'emballage" livraison EMS prix payé blog` ほか
- 直接取得を試みて失敗したもの:
  - MyFigureCollection のスレッド `thread/15969` と `blogpost/59677`（Neokyo の送料の話題）→ **HTTP 403**
  - Neokyo 自身の送料見積り `neokyo.com/en/shipping-rates-estimate` → **Cloudflare のチャレンジページが返る**（見積り値が取れない）

見つかったのは Neokyo 公式の料金ページと Trustpilot のレビュー（金額を伴わない定性的な評価）だけ。
**「350×3 + 500 = 1,550 円」のような例はすべて Neokyo 公式か、公式を書き写した比較記事で、実請求ではない。**
Neokyo はフランス発の比較的新しい会社で、日本語圏・中国語圏の利用体験記がほぼ無い。
英語圏の議論は MFC と Discord に集まっており、どちらも取得できなかった。

**この計算機はすべての条件で Neokyo を1位に置いているが、その1位を裏づける実請求は 1 件も無い。**

### FROM JAPAN — **総額のある事例 0 件**（部分1件）

R7（PTT、2018）に手数料と国内送料の選択肢は載っているが総額が無い。
検索語 `"FROM JAPAN" 代行 手数料 500円 実際 請求 内訳 合計 使ってみた`、
`"FROM JAPAN" proxy review order total breakdown "service fee" "500 yen" shipping EMS paid invoice`、
`"fromjapan" 代購 費用 明細 手續費 500日圓 國際運費 總計 心得 教學` で拾えたのは
比較記事（`maketto.jp`、`blog.onemall.jp`、`buy-japan.com`、`japan-shop-helper.com`、`sugoifinds.com`、`otakushoppingguide.com` など）ばかりで、
**これらは互いに矛盾する数字を書いており**（同じ FROM JAPAN の手数料を「500円」「¥250/点＋5%」と別々に書いている）、
出典も無いため事例として採らなかった。**この種の記事は一次情報として使えない。**

### Buyee / ZenMarket — 総額はあるが古い

集まった 5 件（R1〜R5、R8）はすべて 2021〜2023 年で、
Buyee は 2026-04-01、ZenMarket は 2023-10-18／2026-04-01／2026-05-01 に手数料を改定している。
2024 年以降の内訳つきの利用体験記は、日・英・繁中いずれでも見つからなかった。
現在ヒットするのは各社公式ブログと、生成された比較記事が大半になっている。

---

## 6. 社ごとの一致度

| 社 | 内訳つき実請求 | 費目単位で一致したもの | 費目単位で不一致だったもの |
|---|---:|---|---|
| Buyee | 2件（R4, R5） | **国際送料 ¥15,300 が EMS 公表料金と完全一致**（R4）／代行手数料（現行制度に換算して一致）／プラン ¥500／国内送料 | 費目名（`domestic-handling` は実体がプラン）／おまとめ梱包 ¥500 が任意費目に無い |
| ZenMarket | 3件（R1, R2, R3）＋部分1件（R8） | **入金手数料 ¥10,000→¥10,363 が1円差**（R1）／**国際送料 ¥2,700 が EMS 公表料金と完全一致**（R2） | 手数料を全サイト ¥800 にしている／国際送料 ¥4,021 は説明できず（R3）／国内送料の仮定 |
| Jauce | 1件（R6） | 国内送料 ¥300／代行手数料の現行モデル（¥400+8%） | **銀行送金手数料 ¥300 の費目が無い**／入金手数料の掛け方（gross-up ではなく加算）／国際送料が EMS 固定（実請求は非EMS）／料金ページの URL が 404 |
| FROM JAPAN | 0件（部分1件 R7） | — | 支払手数料 ¥200 の適用条件（オークション限定）／Product Protection Plan の二重計上 |
| Neokyo | **0件** | —（一次情報では梱包料の全段表と「送料にマークアップなし」が一致） | **`domesticIncluded: true` が公式ページに反する** |

---

## 7. 検算に使った呼び出し

`compare()` は下記のような呼び出し器で叩いた。**作業後に削除した**（製品コードは触っていない）。

```ts
// scratch-probe.ts（削除済み）
import { compare } from './src/lib/pricing/compare';
const spec = JSON.parse(process.argv[2]!);
const items = spec.items.map((it, i) => ({
  id: String(i), title: it.title ?? `item${i}`, priceYen: it.priceYen,
  priceTier: 'fixed', site: it.site ?? 'yahoo-auctions',
  weightG: it.weightG ?? null, weightTier: 'fixed',
  freeShipping: it.freeShipping ?? false,
  domesticShippingYen: it.domesticShippingYen ?? null, qty: it.qty ?? 1,
}));
for (const r of compare({ items, country: spec.country }).rows) { /* 行を印字 */ }
```

```
npx tsx scratch-probe.ts '{"country":"AU","items":[
  {"priceYen":1232,"site":"rakuten","weightG":208},
  {"priceYen":2380,"site":"mercari","weightG":208}],"only":["zenmarket"]}'      # R3
npx tsx scratch-probe.ts '{"country":"DE","items":[
  {"priceYen":10980,"site":"yahoo-shopping","weightG":7250,"freeShipping":true}],"only":["buyee"]}'  # R4
npx tsx scratch-probe.ts '{"country":"US","items":[
  {"priceYen":800,"site":"yahoo-auctions","weightG":250,"domesticShippingYen":300},
  {"priceYen":700,"site":"yahoo-auctions","weightG":250,"domesticShippingYen":0}],"only":["jauce"]}' # R6
```

歴史的な EMS 料金表（R2・R4・R6 の逆引きに使用）:
- 2021-01-28 スナップショット: https://web.archive.org/web/20210128141218/https://www.post.japanpost.jp/int/charge/list/ems_all.html
  （当時は 4 地帯。第1=アジア／第2=オセアニア・北米・中米・中近東／第3=ヨーロッパ／南米・アフリカ。
  第3地帯 9.0kg = **¥15,300**、第1地帯 1.5kg = **¥2,700**）
- 2023-01-12 / 2023-06-07 / 2023-12-08 のスナップショットは、いずれも現在と同一の 5 地帯・同一料金。
  → **EMS の値上げは 2021-10 〜 2022-05 の間に起きており、2023 年以降は据え置き。**
