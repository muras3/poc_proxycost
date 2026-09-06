# スポーツ用品（sports-goods）の重量調査

- 取得日: **2026-09-06**
- 手法: Shopify 公開商品JSON `https://<domain>/products.json?limit=250&page=N` の `variants[].grams`
- 計測: `node scripts/shopify-probe.mjs <domain> --pages 20`
- `measured: false` — grams は実測ではなく送料計算用の入力値

## 結論（先に）

**取れたのは武道具（剣道・居合・合気道・空手・柔道・弓道）だけ。**
カテゴリ固有ヒントにあった **野球・サッカー・ゴルフは 1店も採れなかった。**

- 野球: Shopify の日本店は 2店見つかったが `grams` が全件 0（japan-ballpark.com / katanajp.co）。
  値が入っている店は台湾（全件 1,000g）と米国（全件 907g＝2 lb）で、どちらも定数かつ日本の店ではない。
- ゴルフ: 3店とも **ポンド単位の一律区分**。2,268g（5 lb）/ 1,361g（3 lb）/ 4,000g の固定値で、
  ドライバーとアイアンセットが同じ重量になっている。`verdict` は pseudo。
- サッカー: Shopify の日本店自体が見つからなかった（fcFA・SWS・スポサク・japansoccer-jersey は別プラットフォーム）。

したがって「グラブ・バット・ユニフォームで桁が違うので product_type で切る」というヒントは、
**武道具の中でだけ**実行できた（防具セット 5,000g / 面 2,500g / 袴 1,500g / 帯 400g / 手ぬぐい 200g）。

採用したのは以下の3店。

| ドメイン | verdict | products | variantsWithGrams | 採否 |
|---|---|---:|---:|---|
| tozandoshop.com | suspect | 1,160 | 4,917 | **採用**（京都・東山堂の海外向け店。品目の切り分けが最も細かい） |
| www.seidoshop.com | suspect | 675 | 4,199 | **採用**（合気道・古武道。加工サービス 1,800件を除外して使用） |
| kendostar.com | suspect | 486 | 131 | **採用**（n は少ないが竹刀・防具の段が東山堂と一致） |

## 叩いたドメイン全部

### 採用（3店）

| ドメイン | verdict | products | vg | 理由 |
|---|---|---:|---:|---|
| [tozandoshop.com](https://tozandoshop.com/products.json?limit=250&page=1) | suspect | 1,160 | 4,917 | distinct比 0.9%、100の倍数 98%、500の倍数 78%。500g 刻みの梱包区分だが品目ごとに段が分かれる（弓 7,000 / 防具セット 5,000 / 面 2,500 / 垂 1,500 / 手拭い 100） |
| [www.seidoshop.com](https://www.seidoshop.com/products.json?limit=250&page=1) | suspect | 675 | 4,199 | distinct比 0.7%。刺繍・家紋・寸法直しなどの**加工サービス 1,800件が全部 10g** なので除外。残りの道着・袴・帯・木刀は東山堂と段が一致 |
| [kendostar.com](https://kendostar.com/products.json?limit=250&page=1) | suspect | 486 | 131 | distinct比 6.1%。486商品中 grams があるのは 131 variants のみ。防具 4,000g・竹刀 3,000g で東山堂に近い |

### 判定は通ったが不採用

| ドメイン | verdict | products | vg | 不採用の理由 |
|---|---|---:|---:|---|
| [www.kendo.co.jp](https://www.kendo.co.jp/products.json?limit=250&page=1) | suspect | 461 | 2,528 | **桁が 1,000倍ずれている。** 竹刀 200,000g（=200kg）、防具セット 600,000g、最大 5,000,000g。重量欄に別単位か価格を入れたとみられる。1/1000 して使うことも考えたが根拠がないのでやめた |

### pseudo / insufficient（数値は使わない）

| ドメイン | verdict | products | vg | 中身 |
|---|---|---:|---:|---|
| [japangolfclubs.com](https://japangolfclubs.com/products.json?limit=250&page=1) | pseudo | 5,000 | 2,592 | distinct=9、最頻値 78%。ドライバーもFWも **2,268g（5 lb）固定**、アイアンセットのみ 4,082g（9 lb） |
| [japangolfimport.com](https://japangolfimport.com/products.json?limit=250&page=1) | pseudo | 2 | 72 | distinct=1、全件 4,000g。実質 1商品のカスタム展開 |
| [golfpartnerusa.com](https://golfpartnerusa.com/products.json?limit=250&page=1) | insufficient | 4,944 | 45 | grams があるのは 45 variants のみ、全部 **1,361g（3 lb）**。n<50 |
| [taiwanbaseball.com.tw](https://taiwanbaseball.com.tw/products.json?limit=250&page=1) | pseudo | 156 | 168 | distinct=4、最頻値 91%。内野手・投手・捕手ミット・打者防具まで全部 **1,000g**。台湾の店 |
| [ballgloveblueprint.com](https://ballgloveblueprint.com/products.json?limit=250&page=1) | pseudo | 114 | 133 | distinct=2、全件 **907g（2 lb）**。日本製グラブを扱うが米国の店 |
| [japan-ballpark.com](https://japan-ballpark.com/products.json?limit=250&page=1) | insufficient | 250 | 0 | Shopify だが grams が全件 0 |
| [katanajp.co](https://katanajp.co/products.json?limit=250&page=1) | insufficient | 72 | 0 | 大阪の硬式グラブメーカー。Shopify だが grams が全件 0 |

### Shopify ではない / 取得できなかった

| ドメイン | 結果 | メモ |
|---|---|---|
| [en.kyujisensei.com](https://en.kyujisensei.com/products.json?limit=250&page=1) | 404 | 大阪の野球用品中古店。海外発送あり |
| [www.yabaibaseball.com](https://www.yabaibaseball.com/products.json?limit=250&page=1) | 400 | 野球用品 |
| [www.hatakeyama-jp.com](https://www.hatakeyama-jp.com/products.json?limit=250&page=1) | 404 | グラブメーカー |
| [sskbaseballshop.com](https://sskbaseballshop.com/products.json?limit=250&page=1) | 404 | SSK |
| [www.kozuji.com](https://www.kozuji.com/products.json?limit=250&page=1) | 403 | Winning のボクシング用品を世界発送する日本の店。ボット遮断で取得不可 |
| [www.nishohi.com](https://www.nishohi.com/products.json?limit=250&page=1) | 403 | 新体操・卓球・柔道・空手の日本メーカー直販。取得不可 |
| [www.tourspecgolf.com](https://www.tourspecgolf.com/products.json?limit=250&page=1) | 404 | Magento |
| [shop.golfdigest.co.jp](https://shop.golfdigest.co.jp/products.json?limit=250&page=1) | 403 | GDO |
| [japansoccer-jersey.com](https://japansoccer-jersey.com/products.json?limit=250&page=1) | 404 | Jリーグユニフォームを世界発送する日本の店 |
| [footballshop-fcfa.com](https://footballshop-fcfa.com/products.json?limit=250&page=1) | 接続不可 | 海外サッカー用品 |
| [www.sports-ws.com](https://www.sports-ws.com/products.json?limit=250&page=1) | 404 | サッカーショップ SWS |
| [www.sposaku.jp](https://www.sposaku.jp/products.json?limit=250&page=1) | 404 | スポーツサクライ |
| [zennihonbudougu.com](https://zennihonbudougu.com/products.json?limit=250&page=1) | 404 | 全日本武道具（EC-CUBE） |
| [www.e-bogu.jp](https://www.e-bogu.jp/products.json?limit=250&page=1) | 404 | 武道具 |
| [www.f-budogu.jp](https://www.f-budogu.jp/products.json?limit=250&page=1) | 404 | 福田武道具 |
| [kendoshop.com](https://kendoshop.com/products.json?limit=250&page=1) | 404 | 剣道用品 |
| [tanabesports.net](https://tanabesports.net/products.json?limit=250&page=1) | 403 | 日本ブランドのスキー用品 |
| [jpn.mizuno.com](https://jpn.mizuno.com/products.json?limit=250&page=1) | 404 | ミズノ公式 |
| [www.himaraya.co.jp](https://www.himaraya.co.jp/products.json?limit=250&page=1) | 403 | ヒマラヤ |
| gettozando.shop | 接続不可 | 東山堂の別ドメイン（プロキシで到達できず） |

## 作った lines（17本・合計 6,503 variants）

上から順に評価する前提で並べてある。`竹刀袋` を先に置かないと shinai に、
`空手着ズボン` を先に置かないと budo-jacket に取られる。

| id | 中央値 | P25 | P75 | n | ばらつき | tier |
|---|---:|---:|---:|---:|---:|---|
| budo-bag | 800 | 500 | 1,500 | 156 | 3.00x | unverified |
| budo-small-parts | 200 | 100 | 200 | 1,073 | 2.00x | estimate |
| kendo-bogu-set | 5,000 | 4,250 | 5,000 | 54 | 1.18x | estimate |
| kendo-men | 2,500 | 2,500 | 2,500 | 198 | **1.00x** | estimate |
| kendo-kote | 2,000 | 1,500 | 2,500 | 187 | 1.67x | estimate |
| kendo-do | 2,000 | 1,500 | 7,500 | 97 | 5.00x | unverified |
| kendo-tare | 1,500 | 1,500 | 1,500 | 67 | **1.00x** | estimate |
| budo-uniform-set | 2,500 | 2,000 | 2,500 | 792 | 1.25x | estimate |
| budo-pants | 2,100 | 800 | 2,200 | 185 | 2.75x | unverified |
| budo-jacket | 2,200 | 1,500 | 2,500 | 691 | 1.67x | estimate |
| hakama | 1,500 | 1,500 | 2,500 | 1,696 | 1.67x | estimate |
| budo-obi | 400 | 400 | 500 | 291 | 1.25x | estimate |
| budo-tabi | 500 | 300 | 500 | 151 | 1.67x | estimate |
| shinai | 3,000 | 1,500 | 3,000 | 202 | 2.00x | estimate |
| bokuto | 2,000 | 2,000 | 2,000 | 250 | **1.00x** | estimate |
| iaito | 2,500 | 2,000 | 3,500 | 143 | 1.75x | estimate |
| kyudo-yumi | 7,000 | 7,000 | 7,000 | 270 | **1.00x** | estimate |

分類は各店の `product_type` で切った。タイトル語より店が付けた分類のほうが誤爆しない。
`fallbackG` は採用3店の全体中央値 2,000g、`fallbackTier` は unverified。

## 限界（正直に）

1. **カテゴリの大半が空白。** 野球・サッカー・ゴルフ・テニス・スキーの重量はこのデータにない。
   `fallbackG=2,000` を当てるとサッカーボールやウェアでは大きく過大になる。
2. **grams は実測ではない。** 3店とも 500g 刻みが 78〜90%。東山堂の「面」は 198件すべて 2,500g、
   「弓」は 270件すべて 7,000g。ばらつき 1.00x は精度が高いのではなく**定数が入っている**という意味。
3. **同じ品目でも店で段が違う。** 袴は東山堂 2,500g / Seido 1,500g、竹刀は東山堂 2,500g / KendoStar 3,000g。
   統合中央値はその中間でしかない。
4. **kendo-do のばらつき 5.0x** は、単品の胴と「胴＋胴台一式」が同じ product_type に混ざっているため。
5. **長尺物は重量段では決まらない。** 竹刀 3,000g・木刀 2,000g・弓 7,000g は質量ではなく長尺梱包の値
   （竹刀の実重量は約 500g）。EMS は長さ 1.5m 上限なので、2m を超える弓はそもそも EMS で送れない。
   重量だけで見積もると必ず外れる。
6. 竹刀・木刀には 10本まとめ売り（26,000g / 25,000g）が混ざっていて、上側の裾を引き上げている。
7. Seido の 1,800件（刺繍・家紋・寸法直し）は全部 10g の**加工サービス**で商品ではない。除外済み。
   除外しないと店全体の中央値が 100g まで落ちる。
