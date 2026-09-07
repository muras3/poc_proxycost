# トレカ（単カード）の重量調査 — tcg-singles

取得日: **2026-09-06**
手法: Shopify 公開商品JSON（`https://<domain>/products.json?limit=250&page=N` の `variants[].grams`）
計測: `node scripts/shopify-probe.mjs <domain> --pages 20`

## 叩いたドメイン（全部・不採用も含む）

| ドメイン | products.json URL | products | grams有 | verdict | 採否 |
|---|---|---:|---:|---|---|
| www.pokeninjapan.store | https://www.pokeninjapan.store/products.json?limit=250&page=1 | 5000 | 5198 | suspect | **採用** |
| japanmaster.myshopify.com | https://japanmaster.myshopify.com/products.json?limit=250&page=1 | 500 | 491 | usable | **採用** |
| onepiece.pokeninjapan.store | https://onepiece.pokeninjapan.store/products.json?limit=250&page=1 | 1114 | 1122 | pseudo | 不採用 |
| zenpan-japan.com | https://zenpan-japan.com/products.json?limit=250&page=1 | 3249 | 3248 | pseudo | 不採用 |
| tcg-corner.com | https://tcg-corner.com/products.json?limit=250&page=1 | 5000 | 4726 | pseudo | 不採用 |
| omotenashitcg.com | https://omotenashitcg.com/products.json?limit=250&page=1 | 5000 | 5380 | pseudo | 不採用 |
| cardotaku.com | https://cardotaku.com/products.json?limit=250&page=1 | 5000 | 5005 | pseudo | 不採用 |
| yugi-market.com | https://yugi-market.com/products.json?limit=250&page=1 | 5000 | 5041 | pseudo | 不採用 |
| japantradingcardstore.com | https://japantradingcardstore.com/products.json?limit=250&page=1 | 2658 | 538 | pseudo | 不採用 |
| sakurascardshop.com | https://sakurascardshop.com/products.json?limit=250&page=1 | 156 | 185 | usable | 不採用（単カードが約10件） |
| poketherapy.com | https://poketherapy.com/products.json?limit=250&page=1 | 123 | 115 | usable | 不採用（封入品のみ） |
| japan-figure.com | https://japan-figure.com/products.json?limit=250&page=1 | 5000 | 9093 | usable | 不採用（単カード n=24） |
| tcgrepublic.com | https://tcgrepublic.com/products.json?limit=250&page=1 | – | – | insufficient | Shopify でない（404） |
| ichiba-japan.com | https://ichiba-japan.com/products.json?limit=250&page=1 | – | – | insufficient | 403 |
| www.fujicardshop.com | https://www.fujicardshop.com/products.json?limit=250&page=1 | – | – | insufficient | 403 |
| samuraiswordtokyo.com | https://samuraiswordtokyo.com/products.json?limit=250&page=1 | – | – | insufficient | JSON を返さない |
| japan-game-tcg-market.myshopify.com | https://japan-game-tcg-market.myshopify.com/products.json?limit=250&page=1 | – | – | insufficient | 500 |

Shopify でなかった/JSON が取れなかったのは他に www.hareruyamtg.com、tokyomtg.com、www.nin-nin-game.com。
robots.txt は取得できた店すべてで `User-agent: *` が /products.json を許可していた。

## 分かったこと — 店が2つの流儀に割れている

このカテゴリの数字が読みにくいのは、`grams` に入れているものが店ごとに違うから。

**(A) カード単体の重量を入れる店**

| ドメイン | 単カードの grams | 件数 |
|---|---:|---:|
| japantradingcardstore.com | 1 g | 442 |
| tcg-corner.com | 2 g | 3,632 |
| omotenashitcg.com | 2 g | 4,651 |
| cardotaku.com | 3 g | 4,694 |
| yugi-market.com | 5 g | 4,470 |

独立した5店が 1〜5g に集まる。**カード1枚が約1.7〜5g** というのは実データで裏が取れた。
ただしどの店も全件ほぼ同値なので verdict は全部 pseudo。指示どおり lines には採らなかった。

**(B) 梱包込みの発送重量を入れる店**

| ドメイン | 対象 | n | 中央値 | P25 | P75 |
|---|---|---:|---:|---:|---:|
| www.pokeninjapan.store | product_type=Single | 2,743 | 50 g | 50 | 50 |
| www.pokeninjapan.store | product_type=PSA | 1,602 | 100 g | 100 | 250 |
| japanmaster.myshopify.com | タイトルのレアリティ語で抽出 | 358 | 100 g | 100 | 100 |
| zenpan-japan.com（pseudo・参考） | Pokémon TCG | 1,959 | 50 g | 50 | 50 |
| onepiece.pokeninjapan.store（pseudo・参考） | product_type=Single | 1,084 | 50 g | 50 | 50 |

送料の見積もりに要るのは (B) なので、lines は (B) で作った。

## 作った lines

| id | 中央値 | P25 | P75 | n | ばらつき |
|---|---:|---:|---:|---:|---:|
| graded-slab（PSA/BGS 鑑定品） | 100 g | 100 | 250 | 1,602 | 2.5x |
| single-card（単カード・梱包込み） | 50 g | 50 | 50 | 3,101 | 1.0x |

fallback は 50 g。

- 50g は「スリーブ＋トップローダー＋封筒」の想定と合い、依頼の 20〜60g のレンジに入る。
- graded-slab の 100g は PSA スラブ実物（約85g）とも整合する。250g は緩衝材込みの発送形態とみられる。
- マッチ順は **graded-slab を先に見ること**。鑑定品のタイトルにも `sar` などのレアリティ語が入るので、
  single-card を先に当てると鑑定品が 50g に落ちる。

## 限界（正直に）

- **`grams` は実測ではない。**送料計算用の入力値。`"measured": false`。
- **50g は1オーダーあたりの梱包込み重量であって、1枚あたりではない。**10枚を 500g と見るのは誤り。
  カード自体は (A) より1枚 2〜5g で、増分はほぼ紙の重さだけ。
- pooled の single-card が p25=p75=50・spread 1.0 なのは pokeninjapan の 2,743件が
  japanmaster の 358件を数で圧倒しているため。**実際の店間のばらつきは 50〜100g** とみるべき。
- **単カードの母数があって pseudo にならなかったのは実質 pokeninjapan 1店だけ。**
  onepiece.pokeninjapan.store は同一運営なので独立検証にならない。
- japanmaster には1枚で 1,000g という値が13件ある。送料区分をそのまま入れているだけで実重量ではない。
- 単カード専門の最大手 tcgrepublic.com は Shopify ではなく、このやり方では取れない。
