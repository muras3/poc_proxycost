# K-POP（アルバム・グッズ）の発送重量調査

- 取得日: **2026-09-06**
- 手法: Shopify 公開商品JSON `https://<domain>/products.json?limit=250&page=N` の `variants[].grams`
- 計測: `node scripts/shopify-probe.mjs <domain> --pages 20`
- 成果物: `data/weights/kpop.json`

## 前提の訂正：日本の小売がほぼ無い

手法は「海外発送する日本の小売」を想定しているが、K-POP ではそれが事実上存在しなかった。

- 日本拠点で海外発送する Shopify 店として **kpopfromjapan.com** を見つけたが、1,432件すべて `grams` が 0
- **kpopmerch.jp** は日本語・日本向けだが、運営は韓国（KPOPMERCH、京畿道龍仁市）
- 日本の主要店（ktown4u / catchopcd / pocamarket / kpopcd.com / s-record.jp＝新大久保のソウルレコード）は
  いずれも Shopify ではなく `products.json` が 404 / 303

そこで韓国・米国拠点の Shopify 店を使った。商品自体は韓国製で日本の店が売るものと同一なので
重量の推定には使えるが、**「日本の小売の値」ではない**点を明示しておく。

## 叩いたドメイン全部

| ドメイン | products | grams入り | verdict | 採否 |
|---|---:|---:|---|---|
| kpopmerch.jp | 3,115 | 5,116 | suspect | **採用** |
| www.kpopalbums.com | 5,000 | 13,572 | suspect | **採用** |
| shop.delivered.co.kr | 5,000 | 14,778 | suspect | **採用** |
| cokodive.com | 499 | 1,048 | usable | **採用** |
| www.kpop.exchange | 2,143 | 7,057 | suspect | **採用（photocard のみ）** |
| kpopstoreinusa.com | 5,000 | 10,872 | suspect | 不採用（裏取り） |
| kplaceshop.com | 1,750 | 6,246 | usable | 不採用（裏取り） |
| kpopmerch.com | 3,730 | 9,536 | suspect | 不採用（.jp と同一運営） |
| kpopfromjapan.com | 1,432 | 0 | insufficient | 不採用 |
| hallyusuperstore.com | – | – | insufficient | robots.txt が `Disallow: /` |
| www.ktown4u.com | – | – | insufficient | Shopify でない（303） |
| www.catchopcd.net | – | – | insufficient | Shopify でない（404） |
| pocamarket.com | – | – | insufficient | Shopify でない（404） |
| kpopcd.com | – | – | insufficient | Shopify でない（404） |
| s-record.jp | – | – | insufficient | Shopify でない（404） |
| www.musickorea.com | – | – | insufficient | Shopify でない（404） |

URL はいずれも `https://<ドメイン>/products.json?limit=250&page=1` 以降。

## 店が2つの流儀に割れている（最大の論点）

**(A) 梱包込みの発送重量を入れる店**（100g刻み・段が粗い）

| 店 | アルバムの中央値 |
|---|---:|
| kpopmerch.jp | 800 g |
| www.kpopalbums.com | 800 g |
| shop.delivered.co.kr | 1,000 g |
| cokodive.com | 700 g |
| kpopstoreinusa.com | 907 g (= 2 lb) |

5店が独立に **700〜1,000g** に集まる。

**(B) 商品単体の重量を入れる店**（oz 換算）

| 店 | アルバムの中央値 |
|---|---:|
| kplaceshop.com | 172 g |
| www.kpop.exchange | 454 g (= 16 oz) |

代行発送のコストに要るのは (A) なので、`lines` は原則 **(A) の4店をプール**して作った。
(A)−(B) の差 400〜600g が箱と緩衝材にあたる。

依頼のヒントは「アルバムはフォトブック込みで 300〜600g」だったが、実データの発送重量は 800g。
差はヒントが商品単体、実データが梱包込みだからで、(B) 群の 454g がヒントとよく一致する。**桁は違っていない。**

## 作った商品ライン（(A) 4店プール、n は変種数）

| ライン | 中央値 | P25 | P75 | n | ばらつき |
|---|---:|---:|---:|---:|---:|
| photocard（単体） | 28 g | 28 | 57 | 1,074 | 2.0x |
| platform-album | 400 g | 300 | 600 | 1,140 | 2.0x |
| album（CD＋フォトブック） | 800 g | 500 | 1,000 | 9,679 | 2.0x |
| lightstick | 900 g | 500 | 1,500 | 586 | 3.0x |
| photobook | 1,000 g | 800 | 1,600 | 1,182 | 2.0x |
| magazine | 1,500 g | 1,200 | 2,500 | 542 | 2.1x |
| dvd-bluray | 1,750 g | 1,200 | 2,000 | 150 | 1.7x |

fallback は 700 g（K-POP 専門3店 kpopmerch.jp / kpopalbums / cokodive の全 19,709件の中央値）。

### photocard だけ別ソースな理由

(A) 群のフォトカード中央値は 300〜500g だが、これは韓国の店の **最小箱の送料段**であって
商品の重さではない。単体カードを `product_type` で持っているのは **www.kpop.exchange**
（`Photo Card(s)` 1,074件）だけなので、そこから 28g を採った。

ただし 28g はちょうど 1 oz で全体の 67% を占める最小単位であり、これも下限の丸め値。
実物のカードは同店の最小値 **3g**。28g はスリーブ＋封筒込みとみるべきで、
`tcg-singles` カテゴリが独立に出した「梱包込み単カード 50g」と桁が合う。

### platform-album を分けた効果

POCA / Weverse / NEMO / Kihno / PLVE / Objekt / SMini は CD を含まないカード型の販売形態で、
通常のアルバムの半分（400g）。ここを分けずに album の 800g を当てると **2倍ずれる**。
`lines` のマッチ順は platform-album を album より先に見ること（'POCA ALBUM' は 'album' を含む）。

## 限界（正直に）

- 採用4店のうち独立系統は3つ。kpopmerch.jp と kpopmerch.com は同一運営なので後者は不採用
- shop.delivered.co.kr は在庫の大半が K-ファッション/コスメ。K-POP 部分だけを `product_type` で切り出している
- kpopmerch.jp のアルバムに 181,437g / 272,155g / 408,233g という桁違いの値が数件ある
  （lb と g の取り違えとみられる）。集計では 20,000g 超を除外した
- lightstick は ばらつき 3.0x と広い。公式ペンライトは箱のサイズが商品ごとに違うため。
  500〜1,500g の幅をそのまま出している
- 全店の `grams` は送料計算用の入力値であって実測ではない。`measured: false`
