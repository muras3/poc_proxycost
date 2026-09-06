# スニーカー（sneakers）の重量調査

- 取得日: **2026-09-06**
- 手法: Shopify 公開商品JSON `https://<domain>/products.json?limit=250&page=N` の `variants[].grams`
- 計測: `node scripts/shopify-probe.mjs <domain> --pages 20`
- `measured: false` — grams は実測ではなく送料計算用の入力値

## 結論（先に）

**一般的な運動靴（ナイキ・アディダス・ニューバランス等）の重量は、実データでは取れなかった。**
日本のスニーカー専門店で grams を入れている店はすべて「靴は一律◯g」の帯課金で、
`quality.verdict` が pseudo になる。数値をでっち上げないため、これらは採用していない。

採用できたのは以下の2店だけ。

| ドメイン | verdict | products | variantsWithGrams | 採否 |
|---|---|---:|---:|---|
| store.japan-zone.com | usable | 553 | 3,462 | **採用**（地下足袋・足袋スニーカー） |
| japan-clothing.com | usable | 1,018 | 1,979 | **採用**（カジュアルスニーカー9型） |

## 叩いたドメイン全部

### 採用

| ドメイン | verdict | products | vg | 理由 |
|---|---|---:|---:|---|
| [store.japan-zone.com](https://store.japan-zone.com/products.json?limit=250&page=1) | usable | 553 | 3,462 | distinct=119 (3.4%)、最頻値 9%。型番ごとに動く（Air Jog V 6=830g / V 12=1,010g）。一部はサイズでも動く（Soukaido VO-80F 24cm=1,360g→29cm=1,760g） |
| [japan-clothing.com](https://japan-clothing.com/products.json?limit=250&page=1) | usable | 1,018 | 1,979 | distinct=58 (2.9%)。スニーカー9型が 600/650/700/750/800g と型ごとに違う（197 variants） |

### 参考記録（数値は使わない）

| ドメイン | verdict | products | vg | 理由 |
|---|---|---:|---:|---|
| [tabiji.co.jp](https://tabiji.co.jp/products.json?limit=250&page=1) | suspect | 94 | 912 | 足袋スニーカー n=570 が 400g 46% / 500g 45% の二段だけ。サイズでも動かない。japan-zone と2倍ずれるので line には使わず |
| [nubiantokyo.com](https://nubiantokyo.com/products.json?limit=250&page=1) | suspect | 5,000 | 13,986 | 店全体は suspect。ただし Footwear n=2,360 の 97.5%（2,302件）が **4,000g** の定数。靴だけ見れば pseudo なので不採用 |
| [komarijp.com](https://komarijp.com/products.json?limit=250&page=1) | usable | 171 | 273 | 包丁は実測らしく動くが Tabi shoes n=104 は全件 500g。tabiji の帯を裏付けるだけ |
| [japanesetaste.com](https://japanesetaste.com/products.json?limit=250&page=1) | usable | 5,084 | 5,156 | grams は本物（distinct 19.6%）だが履物の product_type が皆無 |
| [kokorojapanstore.com](https://kokorojapanstore.com/products.json?limit=250&page=1) | usable | 2,000 | 2,138 | 同上。履物なし |

### pseudo（全件同値。採用不可）

| ドメイン | verdict | products | vg | 中身 |
|---|---|---:|---:|---|
| [kickslab.com](https://kickslab.com/products.json?limit=250&page=1) | pseudo | 1,519 | 20,686 | distinct=2。SNEAKER 18,915件が全部 **3,000g**。BOOTS も CAPS も 3,000g |
| [wormtokyo.com](https://wormtokyo.com/products.json?limit=250&page=1) | pseudo | 4,588 | 4,475 | distinct=2。4,474件が **1,000g**。中古スニーカー専門 |
| [kinetics-tokyo.com](https://kinetics-tokyo.com/products.json?limit=250&page=1) | pseudo | 5,000 | 31,199 | distinct=**1**。31,199件すべて 100g。SHOES（MEN）14,344件も 100g |
| [sousou.co.jp](https://sousou.co.jp/products.json?limit=250&page=1) | pseudo | 5,000 | 15,245 | distinct=2。15,238件が 600g。地下足袋も座布団も服も 600g |
| [tabifootwear.com](https://tabifootwear.com/products.json?limit=250&page=1) | pseudo | 70 | 434 | distinct=3。Hightops も Shoes も Sandals も全部 400g |
| [taiko-shop.com](https://taiko-shop.com/products.json?limit=250&page=1) | pseudo | 5,000 | 6,245 | 最頻値 490g が 69%。和太鼓店（足袋も扱う） |

### insufficient（grams が 0 / Shopify でない / 遮断）

| ドメイン | products | vg | 理由 |
|---|---:|---:|---|
| mita-sneakers.co.jp | 5,000 | 0 | Shopify だが grams 全件 0 |
| uniontokyo.jp | 500 | 0 | 同上 |
| undefeated.jp | 499 | 0 | 同上 |
| snobasia.com | 250 | 0 | 同上（海外発送あり） |
| blueover.jp | 86 | 0 | 国産スニーカーブランド。grams 全件 0 |
| spingle.jp / en.spingle.jp | 841 | 31 | 広島の国産メーカー。grams があるのは 31件のみ（n<50） |
| corlection.com | 1,552 | 2 | grams ほぼ 0 |
| shop.moonstar-usa.com | – | 0 | ムーンスター北米法人。grams 0、かつ日本発ではない |
| www.atmos-tokyo.com / atmos-pink.com | – | – | 403（bot 遮断） |
| abc-mart.net | – | – | 403（Shopify でない） |
| japantrendshop.com / zenplus.jp / www.2ndstreet.jp | – | – | 403（Shopify でない） |
| fascinate-online.com / billys-tokyo.net / www.lowtex.jp / 1ldkshop.com / henderscheme.com / shoeslikepottery.com / jikatabi.net / made-in-japan.jp / japanrabbit.com / denimio.com / hinoya.com / okayamadenim.com / emeraldjapan.com / footlocker.jp / bring-kicks-kaitori.com | – | – | products.json が 404（Shopify でない） |
| aandsstore.com / chapter-web.com / instep-onlinestore.com / sneakerlounge.jp / hoopsdream.jp / kicksstadium.jp / kinetics-store.com / gr8-tokyo.com / vendor-tokyo.com / lowtexplus.com / sneakermania.jp / marugo-tabi.com / moonstar-shop.jp / ragtag.jp / skit-inc.com | – | – | 名前解決できず（実在しないドメイン） |
| kicks.jp / sousounetshop.jp / jpnstyle.com / kind.co.jp | – | – | TLS エラーで接続不可 |

## 分かったこと

### 1. サイズ variant で grams は動くか

**ほぼ動かない。** 履物の grams は「1商品1値」で入っている。

| 店 | サイズで動くか |
|---|---|
| japan-clothing.com | 動かない。9型すべて 36〜43 まで同一値 |
| tabiji.co.jp | 動かない。30商品すべて flat |
| kickslab / nubian / wormtokyo / kinetics | 商品間ですら動かない |
| **store.japan-zone.com** | **一部だけ動く**（履物 105商品中 4商品） |

動く例（japan-zone、これが唯一の実測らしいデータ）:

- Soukaido VO-80F Steel-Toe: 24cm=1,360g → 24.5cm=1,410g → … → 29cm=1,760g（0.5cm ごとに +50g、両端で **1.29倍**）
- Toraichi Magic Long Safety Boots: 24.5cm=1,980g → 27cm=2,280g

サイズ幅で 1.3倍動くので、本来はサイズを見るべきだが、そのデータを出している店が1つしかない。

### 2. 箱込みか箱なしかで倍違う（実際に倍以上違った）

同じ「スニーカー1足」に対して、店が入れている値:

| 店 | 値 | 中身の推定 |
|---|---:|---|
| japan-clothing.com | 600〜800g | 靴のみ（箱なし）の実重量 |
| store.japan-zone.com（足袋スニーカー） | 830g | 靴＋簡易梱包 |
| wormtokyo.com | 1,000g | 中古＝箱なし前提の帯 |
| kickslab.com | 3,000g | 靴箱＋外装の帯 |
| nubiantokyo.com | 4,000g | 靴箱＋外装＋余裕の帯 |

**750g と 4,000g で 5.3倍。** ヤフオク出品は靴箱付きで送られることが多いので、
`fallbackG: 750` は箱付き出品に対して過小に出る。だから `fallbackTier: "unverified"` にした。
靴箱ぶんは +250〜500g 程度とみられるが、これを裏付ける実データは今回取れていない。

### 3. 商品ラインは切れた（ただし地下足袋側だけ）

store.japan-zone.com は型番に足袋の「こはぜ数」（6＝ローカット / 12＝ハイカット）が入っており、
ここで重量が段になっている:

| ライン | 件数 | 中央値 | P25 | P75 | ばらつき |
|---|---:|---:|---:|---:|---:|
| 安全地下足袋（先芯・スパイク） | 190 | 1,760 g | 1,660 | 1,960 | 1.18x |
| 足袋スニーカー（大人） | 361 | 830 g | 760 | 910 | 1.20x |
| 作業・祭り足袋（軟底） | 743 | 560 g | 460 | 660 | 1.43x |
| キッズ地下足袋 | 195 | 360 g | 360 | 360 | **1.00x** |
| カジュアルスニーカー（箱なし・japan-clothing） | 197 | 750 g | 700 | 750 | 1.07x |

型番ごとの段の例（japan-zone）:
Marugo Air Jog III 6 = 730g / III 12 = 830g / V 6 = 830g / V 12 = 1,010g /
Matsuri Jog 6 = 560g / Matsuri Jog 12 = 760g / Kids Matsuri Jog = 360g。
**こはぜ数（6/12）で 100〜200g 動く。**

## 限界（正直に）

1. **一般的な運動靴の重量は取れていない。** ナイキ・ニューバランス等を扱う店（kickslab,
   wormtokyo, kinetics-tokyo, nubiantokyo, mita-sneakers, undefeated.jp, uniontokyo）は
   例外なく pseudo か grams=0 だった。`sneaker-casual` の 750g は japan-clothing.com という
   日本デザイン系カジュアルスニーカーのみを扱う小規模カタログ1店が根拠。
2. **`sneaker-casual` の実効 n は 9。** n=197 は variant 数で、型数は9・重量の異なり値は5つ。
   統計としては薄い。
3. **地下足袋系3ライン（safety-jikatabi / tabi-sneaker / work-tabi）は japan-zone 1店だけが根拠。**
   同種を扱う tabiji.co.jp は足袋スニーカーを 400/500g としており **2倍ずれる**。
   tabiji は帯が2段だけの suspect なので japan-zone を優先したが、どちらが正しいかは決められない。
4. **grams は全店とも実測ではない。** 送料計算用の入力値。`measured: false`。
5. サイズによる 1.3倍の変動を lines は表現していない（p25/p75 に一部吸収されているだけ）。
