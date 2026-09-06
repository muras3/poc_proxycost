# 中古ブランド品（used-luxury）の重量データ

取得日: 2026-09-06 / 手法: Shopify 公開商品JSON（`https://<domain>/products.json?limit=250&page=N` の `variants[].grams`）
計測: `node scripts/shopify-probe.mjs <domain> --pages 20`

## 叩いたドメイン全部

### Shopify で grams があった店

| ドメイン | products | grams有 | verdict | 採否 |
|---|---:|---:|---|---|
| [www.tokyourluxury.com](https://www.tokyourluxury.com/products.json?limit=250&page=1) | 1,673 | 129 | usable | **採用（バッグ・財布の中核）** |
| [www.rookjapan.com](https://www.rookjapan.com/products.json?limit=250&page=1) | 4,313 | 3,813 | usable | **採用（腕時計のみ）** |
| [luxlux.jp](https://luxlux.jp/products.json?limit=250&page=1) | 1,860 | 1,854 | suspect | 数値は不採用（順序の裏づけのみ） |
| [gracejapanluxuybrand.myshopify.com](https://gracejapanluxuybrand.myshopify.com/products.json?limit=250&page=1) | 3,221 | 1,032 | suspect | 数値は不採用（順序の裏づけのみ） |
| [luxuness.com](https://luxuness.com/products.json?limit=250&page=1) | 5,000 | 5,000 | pseudo | 不採用 |
| [world.reclo.jp](https://world.reclo.jp/products.json?limit=250&page=1) | 5,000 | 5,000 | pseudo | 不採用 |
| [brandoffbuyingclub.com](https://brandoffbuyingclub.com/products.json?limit=250&page=1) | 5,000 | 5,000 | pseudo | 不採用 |
| [hannari-shop.net](https://hannari-shop.net/products.json?limit=250&page=1) | 244 | 86 | pseudo | 不採用 |
| [www.ippojapanwatch.com](https://www.ippojapanwatch.com/products.json?limit=250&page=1) | 5,000 | 4,477 | pseudo | 不採用 |
| [cjluxury.com](https://cjluxury.com/products.json?limit=250&page=1) | 477 | 7 | insufficient | 不採用 |

### Shopify だが grams が全件 0

vintagelacharme.com (2,570件) / dct-ep-vintageluxurystore.com (5,000件) /
amorevintagejapan.com (5,000件) / myluxury-store.com (4,419件) /
weeklyluxdrop.com (5,000件) / brandstreettokyo.com (5,000件)

### products.json が空配列（公開JSONを止めている）

jash.co.jp / tomodachi.fun / arigatousharejapan.biz（いずれも同系列の中古ブランド卸）

### Shopify ではない（404 / 403 / 別プラットフォーム）

brandbagworld.com, j-ports.com, vintagequeenjapan.com, brandluxjp.com, sekinevintage.com,
timepeaks.com, luxjpn.com, www.thewatchcompany.com, watchnian.com, brashel.jp,
atlantisvintagetokyo.com (403), www.daikokuya78.com (403), shop.zenplus.jp, zenluxe.jp,
allu-official.com, gc-yukizaki.com, store.komehyo.jp, www.rinkan.com, vintageparis.jp

## 採否の理由

**www.tokyourluxury.com を中核にした。** 中古ブランドバッグ専業で、grams が 47g〜1,876g の
1g 刻み（866g / 675g / 89g / 615g …）。distinct 比 97.7%、最頻値でも 2% しかない。
これは送料区分ではなく一点ごとに秤で量った値とみてよい。中古ブランド品は一点物で
variants が1件ずつなので、distinct 比がそのまま「個別入力されているか」の指標になる。

**www.rookjapan.com は腕時計ラインにだけ使った。** 中古ブランド品店で腕時計の実測値を
出している店が1軒も無かったため。`product_type=Luxury Watch` が n=834・中央値 839g・
ばらつき 1.47x で、機種ごとに端数が動いている。ただしこの店は新品中心の時計店であって
中古ブランド品店ではない。`used` タグの付いた 90件は全部セイコーの国内モデルで、
高級ブランドの中古ではなかった。

**luxlux.jp / gracejapanluxuybrand は数値を捨て、順序だけ使った。** どちらも
`quality.verdict` は suspect だが、中身は完全な送料区分（luxlux は 1,000/3,000/6,000/9,000/18,000g
の5値のみ、grace は 1,000/2,000/3,000/4,000g）。ハンドバッグ 6,000g は物理重量としてあり得ない
（容積重量を重量欄に入れている）。ただし区分の並び

- luxlux: 財布・アクセ 1kg < ショルダー・バックパック 3kg < ハンドバッグ・トート 6kg < ボストン 9kg
- grace: ネックレス 1kg < 財布・時計 2kg < ショルダー・ハンドバッグ 3kg

は tokyourluxury の実測順（財布 235g < ポーチ 329g < ハンドバッグ 576g < ショルダー 657g <
トート 805g < ボストン 1,025g）と一致する。**ライン分けの切り方は2系統で裏が取れた**が、
値そのものは1店（tokyourluxury）にしか依っていない。

**中古ブランド品店の大半は擬似値だった。** luxuness 全 5,000件が 500g、
world.reclo.jp と brandoffbuyingclub.com は全 5,000件が 3,000g（この2つは件数も
product_type 別内訳も完全一致で、同一カタログの別ドメイン。独立した2店として数えていない）、
hannari-shop.net は時計もバッグも全部 1,000g、ippojapanwatch は時計もバンドの駒も全部 300g。

## 作ったライン（全部 tokyourluxury。腕時計のみ rookjapan）

| ライン | n | 中央値 | P25 | P75 | ばらつき |
|---|---:|---:|---:|---:|---:|
| Boston / duffle | 8 | 1,025 g | 874 | 1,085 | 1.24x |
| Tote | 25 | 805 g | 690 | 897 | 1.30x |
| Shoulder / crossbody | 34 | 657 g | 475 | 860 | 1.81x |
| Handbag | 15 | 576 g | 439 | 690 | 1.57x |
| Pouch / clutch | 13 | 329 g | 155 | 425 | 2.74x |
| Wallet / small leather | 23 | 235 g | 182 | 353 | 1.94x |
| Luxury watch (boxed, rookjapan) | 834 | 839 g | 762 | 1,120 | 1.47x |

カテゴリ一律のフォールバックは 584 g（tokyourluxury 全 129件の中央値）。

## 限界（正直に）

1. **tokyourluxury の値は商品そのものの重量で、梱包を含まない可能性が高い。**
   LV ミニパピヨンが 89g、バッグチャームが 65g。発送重量として使うなら緩衝材と箱の分の
   上乗せが要る。JSON の `measured` は false のまま。
2. **バッグ各ラインの n が薄い。** ボストン 8件、ポーチ 13件、ハンドバッグ 15件。
   1店の在庫を切っているだけなので、ブランド構成が偏っていれば中央値も偏る。
3. **腕時計 839g は新品時計店の化粧箱込みの値。** 中古を箱なしで送る場合とは別物
   （ロレックスの時計単体は 150g 前後）。ここは代用であって中古ブランド品の実データではない。
4. 数値の裏づけが 1 店しかない。tcg-singles のように複数店で同じ中央値が出る、という
   確認ができていない。中古ブランド品は在庫が一点物で、そもそも grams を入れる店が少ない。
