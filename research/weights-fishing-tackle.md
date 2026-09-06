# 釣具（fishing-tackle）の重量 — 実データ調査

取得日: **2026-09-06** / 手法: Shopify 公開商品JSON（`scripts/shopify-probe.mjs`）
出力: `data/weights/fishing-tackle.json`

## 叩いたドメイン（全部・不採用も含む）

| ドメイン | URL | 結果 | verdict | 採否 |
|---|---|---|---|---|
| asianportal-fishing.com | `https://asianportal-fishing.com/products.json?limit=250&page=N` | 5,000商品 / 4,999 variants に grams | **usable** | **採用** |
| jdmreelhub.com | `https://jdmreelhub.com/products.json?limit=250&page=N` | 1,298商品 / 1,091 variants に grams | **usable** | **採用** |
| jdmtackleheaven.com | `https://jdmtackleheaven.com/products.json?limit=250&page=N` | 5,000商品 / 9,669 variants に grams | **usable** | **採用**（30kg超の760件を除外） |
| jpnfishingtackle.com | `https://jpnfishingtackle.com/products.json?limit=250&page=N` | 5,000商品 / 6,535 variants に grams | suspect | **不採用** |
| japamart.com | `/products.json` | 404 | insufficient | Shopify ではない（買い付け代行） |
| www.ichibantackle.com | `/products.json` | 403 | insufficient | Shopify ではない |
| japantackle.com | `/products.json` | 404 | insufficient | Shopify ではない |
| www.kkjapanlure.com | `/products.json` | 404 | insufficient | Shopify ではない |
| www.plat.co.jp | `/products.json` | 接続不可 | insufficient | 自社カート |
| www.fishing-otsuka.co.jp | `/products.json` | 403 | insufficient | Shopify ではない |
| japanlureshop.com | `/products.json` | 404 | insufficient | Shopify ではない |
| www.digitaka.com | `/products.json` | 302（JSON を返さない） | insufficient | Shopify ではない |
| www.itacklesjapan.com | `/products.json` | 404 | insufficient | Shopify ではない |
| jdmbasstackle.com | `/products.json` | 404 | insufficient | Shopify ではない |
| northonetackle.com | `/products.json` | 名前解決できず | insufficient | 到達不可 |

robots.txt は採用3店とも `User-agent: *` が `/products.json` を許可。

## 採否の理由

**asianportal-fishing.com（採用）** — distinct=198 (4.0%)、最頻値 15%。`product_type` が
Freshwater/Saltwater Lures・Rods・Reels・Lines に整理されており、そのまま商品ラインに使える。

**jdmreelhub.com（採用）** — リール専業。100の倍数が 98% で梱包区分の匂いは強いが、
機種ごとに 400〜5,200g で動き、電動リール 1,400g とスピニング/ベイト 600g の段が分かれている。
リールの段を引く用途には十分。

**jdmtackleheaven.com（採用、一部除外）** — ルアー系の分類が非常に細かく（Area Trout Spoons、
Bass Soft Baits 等 100種以上）ライン分割に効く。ただしロッドに **1,000,970g（1t）・3,199,970g（3.2t）**
という値が 760件あった。寸法制限を重量欄に押し込んだ擬似値なので **30,000g 超は全部落とした**
（EMS の重量上限 30kg より上は物理的にありえない）。

**jpnfishingtackle.com（不採用）** — 中央値 13g、最頻値が 14g / 7g / 21g。これは 1/2oz・1/4oz
といった**ルアー自重**そのもので、発送重量ではない。同種のクランクベイトが他店では梱包込み
67〜100g なので、この値を採ると送料を 5〜9倍過小に見積もる。suspect 判定だが採用しない。

## 作った商品ライン（15本）

| line | 中央値 | P25 | P75 | n | ばらつき |
|---|---:|---:|---:|---:|---:|
| rod-1piece | 9,780 g | 9,630 | 10,520 | 55 | 1.09x |
| rod-2piece | 6,660 g | 5,480 | 7,680 | 498 | 1.40x |
| rod-multipiece（3本継以上・振出） | 5,890 g | 3,790 | 6,250 | 104 | 1.65x |
| rod（継数不明） | 6,660 g | 5,480 | 8,040 | 657 | 1.47x |
| electric-reel | 1,400 g | 1,200 | 1,800 | 75 | 1.50x |
| spinning-reel | 770 g | 600 | 800 | 821 | 1.33x |
| baitcasting-reel | 600 g | 600 | 770 | 792 | 1.28x |
| reel（種別不明） | 700 g | 600 | 800 | 1,613 | 1.33x |
| squid-jig（エギ・タイラバ） | 140 g | 100 | 144 | 154 | 1.44x |
| metal-jig | 73 g | 50 | 120 | 342 | 2.40x |
| jig-head / ラバージグ | 100 g | 20 | 140 | 617 | 7.00x |
| soft-bait / ワーム | 166 g | 58 | 250 | 1,180 | 4.31x |
| hard-lure | 80 g | 50 | 125 | 8,111 | 2.50x |
| fishing-line | 87 g | 30 | 168 | 390 | 5.60x |
| terminal-tackle | 30 g | 30 | 40 | 732 | 1.33x |

分類は各店の `product_type` で切った（店が自分で付けた分類なのでタイトル語より誤爆しない）。
`match` の語はアプリ側でタイトルに当てるためのもので、**lines は上から順に評価する前提**。
ロッドを先に置かないと「エギングロッド」が squid-jig に取られる。

## 一番効いた発見: ロッドの grams は質量ではなく容積重量

asianportal のロッドを継数で切ると、**継数が増えるほど値が小さくなる**。

| 継数 | n | 中央値 | ばらつき |
|---|---:|---:|---:|
| 1本継 | 55 | 9,780 g | 1.09x |
| 2本継 | 498 | 6,660 g | 1.40x |
| 3本継 | 61 | 5,840 g | 1.32x |
| 4本継 | 13 | 3,940 g | 3.24x |
| 5本継 | 4 | 2,560 g | 1.09x |
| 6本継（テレスコ） | 1 | 2,300 g | — |

4'8" のウルトラライトのトラウトロッド（実質量 100g 未満）に 3,790g が付いている。
これは質量ではなく**仕舞寸法から出した容積重量**。国際発送でロッドが効くのは質量ではなく
寸法なので、コスト推定にはこちらのほうが合うと判断して採用した。
カテゴリ一律（全ロッド 6,660g）だと 1本継で 47% 過小、5本継で 160% 過大になるので、
継数で切る意味がある。

## 限界（正直に）

- **grams は全店とも実測ではない。**梱包区分の値。jdmreelhub は 100の倍数が 98%、
  asianportal のライン類は 161件すべて 30g。だから `"measured": false`。
- **ロッドは 2店で 5.5倍ずれる。**asianportal 6,660g（容積重量）vs jdmtackleheaven 1,220g（実質量寄り）。
  asianportal を採用したが、どちらを取るかで送料推定が大きく変わる。
- **ロッドは重量段より先に寸法制限に当たる。**EMS は長さ 1.5m・長さ+胴回り 3m が上限。
  1本継ロッド（多くが仕舞 2m 超）は **そもそも EMS で送れない**。2本継でも仕舞 1.3〜1.6m で
  クーリエの長尺サーチャージ帯に入る。重量段だけで見積もると必ず外れるので、ロッドは
  「重量では決まらない・別枠」と画面に出すべき。ここは重量データでは解けない。
- **hard-lure は店で中央値がずれる**（asianportal 120g / jdmtackleheaven 56g）。
  ブリスター単体か台紙付きかといった梱包粒度の差とみられ、統合中央値 80g はその中間でしかない。
- jig-head（7.0x）と fishing-line（5.6x）はばらつきが大きく `tier: "unverified"`。
  ライン類は「1個の小巻き 30g」と「大巻きスプール 800g」が同じ分類に混ざっている。
- **fallbackG = 100g** は採用3店全体の中央値。カタログがルアー中心なので小物寄りで、
  ロッド・リールが lines で当たらないと大きく過小になる。
- 玉網・ランディングネット（中央値 10,970g）は n=7 で line にしなかった。
- タイトルは全店英語。`match` には日本語（ヤフオク想定）と英語を両方入れてあるが、
  日本語側は対応表の当てずっぽうで、実データで検証していない。
