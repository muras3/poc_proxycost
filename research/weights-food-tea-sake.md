# 食品・茶・酒の重量調査 — food-tea-sake

取得日: **2026-09-06**
手法: Shopify 公開商品JSON（`https://<domain>/products.json?limit=250&page=N` の `variants[].grams`）
計測: `node scripts/shopify-probe.mjs <domain> --pages 20`

## 叩いたドメイン（全部・不採用も含む）

| ドメイン | products.json URL | products | grams有 | verdict | 採否 |
|---|---|---:|---:|---|---|
| www.saketora.com | https://www.saketora.com/products.json?limit=250&page=1 | 5000 | 4955 | usable | **採用** |
| japanesetaste.com | https://japanesetaste.com/products.json?limit=250&page=1 | 5000 | 5070 | usable | **採用** |
| www.sugoimart.com | https://www.sugoimart.com/products.json?limit=250&page=1 | 5000 | 4988 | usable | **採用** |
| bokksumarket.com | https://bokksumarket.com/products.json?limit=250&page=1 | 638 | 595 | usable | **採用** |
| www.japanesegreenteashops.com | https://www.japanesegreenteashops.com/products.json?limit=250&page=1 | 507 | 507 | usable | **採用** |
| www.akazuki.com | https://www.akazuki.com/products.json?limit=250&page=1 | 1000 | 1802 | usable | **採用**（重みは軽い） |
| global.fukujuen.com | https://global.fukujuen.com/products.json?limit=250&page=1 | 82 | 88 | usable | **採用** |
| ippodotea.com | https://ippodotea.com/products.json?limit=250&page=1 | 82 | 81 | usable | **採用** |
| www.chadoteahouse.com | https://www.chadoteahouse.com/products.json?limit=250&page=1 | 76 | 75 | usable | **採用** |
| www.japanesegreenteain.com | https://www.japanesegreenteain.com/products.json?limit=250&page=1 | 38 | 54 | usable | **採用** |
| www.kurashu.jp | https://www.kurashu.jp/products.json?limit=250&page=1 | 44 | 66 | usable | **採用** |
| wabisabi-store.jp | https://wabisabi-store.jp/products.json?limit=250&page=1 | 212 | 440 | usable | 不採用（食品の行がほぼ無い） |
| www.tippsysake.com | https://www.tippsysake.com/products.json?limit=250&page=1 | 914 | 913 | pseudo | 不採用（662件が 1,361g の定数） |
| jsake.com | https://jsake.com/products.json?limit=250&page=1 | 142 | 140 | pseudo | 不採用（実質8値） |
| japanesegreenteaonline.com | https://japanesegreenteaonline.com/products.json?limit=250&page=1 | 8 | 8 | insufficient | 公開商品が8件 |
| ujimatchatea.com | https://ujimatchatea.com/products.json?limit=250&page=1 | 23 | 24 | insufficient | n<50 |
| www.o-cha.com | https://www.o-cha.com/products.json?limit=250&page=1 | – | – | insufficient | Shopify でない（404） |
| www.hibiki-an.com | https://www.hibiki-an.com/products.json?limit=250&page=1 | – | – | insufficient | Shopify でない（404） |
| ikkyu-tea.com | https://ikkyu-tea.com/products.json?limit=250&page=1 | – | – | insufficient | Shopify でない（404） |
| www.plazajapan.com | https://www.plazajapan.com/products.json?limit=250&page=1 | – | – | insufficient | Shopify でない（404） |
| japan-snack.com | https://japan-snack.com/products.json?limit=250&page=1 | – | – | insufficient | Shopify でない（404） |
| the-nihonshu.com | https://the-nihonshu.com/products.json?limit=250&page=1 | – | – | insufficient | Shopify でない（404） |
| sakeyoi.com | https://sakeyoi.com/products.json?limit=250&page=1 | – | – | insufficient | HTML を返す |
| nipponsake.com | https://nipponsake.com/products.json?limit=250&page=1 | – | – | insufficient | HTML を返す |
| sakeinn.com | https://sakeinn.com/products.json?limit=250&page=1 | – | – | insufficient | fetch failed（2回試行） |

robots.txt は取得できた店すべてで `User-agent: *` が /products.json を許可していた。

## 分かったこと — 酒は容量表記で切ると 1.17x まで狭まる

酒瓶はタイトルに `720ml` `1800ml` が必ず入る。そこで切ると、フィギュアのスケール表記と
同じくらい狭い分布になる。saketora はケース販売（`[1CS] 6bottle`、`[2CS] 12bottle`）が
在庫の大半なので、**タイトルから本数を拾って1本あたりに割り戻してある**。

| ライン | n | 中央値 | P25 | P75 | ばらつき |
|---|---:|---:|---:|---:|---:|
| 1.8L（一升瓶） | 583 | 3,300 g | 2,200 | 3,355 | 1.52x |
| 700〜750ml | 1,754 | **1,420 g** | 1,320 | 1,540 | **1.17x** |
| 300ml | 335 | 607 g | 459 | 688 | 1.50x |

**720ml の 1,420g は3つの独立な証拠と一致する。**

- saketora（n=1,713）… 1,400 g
- kurashu.jp（n=37）… 1,890 g ← 海外向けの緩衝梱包が厚い店の上限
- tippsysake.com（pseudo・不採用）… 913件中 662件が **1,361g ちょうど＝3ポンド**の定数

内訳としても、中身 720g ＋ 瓶・ラベル・化粧箱で約 700g、で合う。

### 酒の落とし穴を2つ記録しておく

1. **`grams` が内容量 ml とそのまま同じ行が混じっている。**720ml で 62件（3.5%）。
   瓶の重さを入れ忘れた入力ミス。中央値には効かないが、単品を引くときは
   *720ml なのに 1,000g 未満* は疑うこと。
2. **ケース販売を割り戻さないと中央値が 4,620g になる。**saketora の商品の大半は
   6本・12本のケース。`日本酒(Sake)` の product_type そのままの中央値は 4,440g で、
   これを1本の重量と読むと 3倍以上ずれる。

### 酒は EMS で送れない国がある

日本郵便の EMS はアルコール飲料を「引受可能だが宛先国により禁制品」として扱う。
**アルコール度数24%超は航空危険物として一律不可**、24%以下でも宛先国の規制で不可の国が多い
（米国は個人宛のアルコール送付が原則不可、豪州・NZ・中東各国なども不可）。
`sake-1800ml` / `sake-720ml` / `sake-300ml` の3ラインは、重量が出せても
**宛先によっては発送そのものが成立しない。**見積もり画面では重量より先に可否を出す必要がある。

## 分かったこと — 茶は7店が独立に一致した

| ドメイン | n | 中央値 |
|---|---:|---:|
| ippodotea.com | 65 | 88 g |
| www.japanesegreenteain.com | 43 | 109 g |
| www.chadoteahouse.com | 70 | 110 g |
| japanesetaste.com | 123 | 111 g |
| global.fukujuen.com | 79 | 120 g |
| www.japanesegreenteashops.com | 125 | 125 g |
| www.sugoimart.com | 82 | 141 g |

**100g 缶・100g 袋という日本茶の標準包装がそのまま出ている。**プールして 113 g。
液体でなくても内容量規格が効くので distinct が高く出る、というのがこのカテゴリの特徴だった。

## 分かったこと — 菓子は店の品揃えで割れる

| ドメイン | n | 中央値 | 何を置いているか |
|---|---:|---:|---|
| www.sugoimart.com | 1,639 | 70 g | コンビニ菓子の1袋単品 |
| bokksumarket.com | 425 | 91 g | 同上 |
| www.japanesegreenteashops.com | 57 | 115 g | 茶請け |
| japanesetaste.com | 660 | 240 g | 箱入りの土産菓子 |
| www.akazuki.com | 55 | 300 g | 同上 |

プールした 90 g は sugoimart に引っ張られている。ばらつき 3.1x。
**この線は他より当てにならない**ので、そのつもりで使うこと。

## 作った lines

判定順は **sake-1800ml → sake-720ml → sake-300ml → noodle → snack-sweets →
seasoning-bottle → tea-leaf**。理由は2つ。

- 容量表記は他のどの語より強い証拠なので酒を先に見る。
- 「醤油せんべい」は調味料ではなく菓子、「抹茶チョコレート」は茶ではなく菓子。
  だから `snack-sweets` を `seasoning-bottle` と `tea-leaf` より先に置く。

| id | 中央値 | P25 | P75 | n | ばらつき |
|---|---:|---:|---:|---:|---:|
| sake-1800ml | 3,300 g | 2,200 | 3,355 | 583 | 1.52x |
| sake-720ml | 1,420 g | 1,320 | 1,540 | 1,754 | 1.17x |
| sake-300ml | 607 g | 459 | 688 | 335 | 1.50x |
| noodle | 122 g | 89 | 208 | 349 | 2.34x |
| snack-sweets | 90 g | 58 | 180 | 2,837 | 3.10x |
| seasoning-bottle | 484 g | 299 | 777 | 186 | 2.60x |
| tea-leaf | 113 g | 75 | 198 | 631 | 2.64x |

fallback は 190 g（採用店の食品行のうちどのラインにも当たらなかった 2,061件の中央値 188g）。

## 限界（正直に）

- **`grams` は実測ではない。**送料計算用の入力値。`"measured": false`。
- **`match` に入れた日本語の語は検証できていない。**採用した店の商品タイトルはすべて英語で、
  日本語側は英語で当たった商品ラインに対応する語を人手で対応づけただけ。
  ヤフオクの日本語タイトルでの命中率は別途確かめる必要がある。
  「そば」は「そばかす」に当たりうるが、このカテゴリの出品タイトルでは実害が小さいと判断して残した。
- **生鮮・冷蔵・冷凍がデータに一切入っていない。**海外発送する Shopify 店は常温品しか置かない。
  鮮魚・和牛・生菓子の重量はこの手法では取れない。
- **瓶入り調味料は n=186 と薄い。**醤油の1L ペットボトルから 100ml の柚子胡椒まで入るので
  ばらつき 2.6x。実質 japanesetaste 1店（n=147）に依存している。
- akazuki.com は verdict=usable だが 100/300/500 の丸め値が 69% で、実質 suspect 寄り。
  食品は n=119 しかないので重みを軽く見ている。
- 日本茶の最大手 o-cha.com・hibiki-an.com・ikkyu-tea.com はいずれも Shopify ではなく、
  このやり方では取れなかった。
