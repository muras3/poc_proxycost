# 出品ページの構造化データ調査 — サイトが宣言したカテゴリは読めるか

確認日: **2026-09-07**（この日に実際に取得した HTML だけを根拠にしている）
調査者環境: Claude Code Remote コンテナ（日本国外・データセンター IP・egress プロキシ経由）

## 0. この調査の問い

いま重量は `src/lib/pricing/weights.ts` の `resolveWeight(title, categoryId?)` が
**商品タイトルの文字列**を `src/data/weights.ts` の手書き辞書（11カテゴリ・75ライン、
2026-09-07 時点で実測）に当てて引いている。網羅は 70% 程度で、
「正しいラインに当たったか」は測れていない。

サイト自身が宣言したカテゴリが読めるなら、それは推測ではなく事実であり、
出典として画面に出せる。**読めるのか**を実測した。

## 1. 結論（先に書く）

- **カテゴリは「取れるサイト」と「そもそもページに触れないサイト」にはっきり割れる。**
  10サイト中、この環境から実際にカテゴリを読めたのは **6サイト**。
  4サイト（メルカリ・駿河屋・ZOZOTOWN・まんだらけ）は**ページ本文に到達できなかった**。
- **JSON-LD の `Product` に `category` を持っているサイトは、10サイト中 0 だった。**
  カテゴリは全て `BreadcrumbList`、独自の埋め込み JSON、HTML のパンくず、
  あるいは `<meta name="keywords">` から来る。「`Product.category` を読む」という
  設計にすると、どのサイトでも1件も取れない。
- **粒度はサイトによって桁違い。**ヤフオクは 3〜6段でブランド・サイズまで降りる。
  Amazon は 1〜3段。とらのあなの JSON-LD パンくずは実質1段（同人誌／同人アイテム）。
- **カテゴリだけでは重量ラインは決まらない。**ヤフオクのフィギュア枝は
  「作品名」で分岐していて「スケール」では分岐しない。ねんどろいど 439g と
  1/4 スケール 3,000g が同じカテゴリに同居する（7倍差）。
  **カテゴリは「どのカテゴリ表を見るか」を決め、ラインはタイトルが決める。**
- **ただしカテゴリには辞書に無い価値が1つある。誤爆を止められる。**
  実例（後述 §3.3）: 楽天の「一升瓶を縦置きできる日本酒冷蔵庫」は
  タイトルに「一升瓶」を含むので辞書は `sake-1800ml`（3.1kg）に当てるが、
  サイトのカテゴリは `家電 > キッチン家電 > ワインセラー` だと宣言している。
  カテゴリはこれを**否認**できる。辞書にはできない。

---

## 2. サイト別の実測結果

取得方法はサイトごとに違う（下表の「取得」欄）。使った User-Agent は2種類:

- **UA-A** = `proxycost/0.1 (+https://github.com/muras3/poc_proxycost)`（本番と同じ、`product.ts` の `UA`）
- **UA-B** = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36`

いずれも `Accept-Language: ja,en-US;q=0.9,en;q=0.8` を付け、リダイレクトを追った。

| サイト | 取得 | JSON-LD | `Product.category` | `BreadcrumbList` | カテゴリの段数 |
|---|---|---|---|---|---|
| yahoo-auctions | ○ UA-B | `BreadcrumbList` + `Product` | **無し** | **有り** | **3〜6段** |
| mercari | **×**（本文に到達できず） | — | — | — | — |
| rakuten | ○ UA-A（UA-B は遮断） | `BreadcrumbList` のみ（`Product` 無し） | **`Product` ノード自体が無い** | **有り** | **3〜5段** |
| yahoo-shopping | ○ UA-B | `BreadcrumbList` + `Product` | **無し** | 有り（**店の自作分類**） | JSON-LD は 1〜3段（店独自）／埋め込み JSON に**公式3〜4段** |
| amazon-jp | ○ UA-B | **JSON-LD 0件** | — | — | HTML のみ 1〜3段 |
| suruga-ya | **×** 403（Cloudflare チャレンジ） | — | — | — | — |
| mandarake | **×**（URL が1件しか集まらず、そのホストは egress で拒否） | — | — | — | — |
| zozo | **×** 403 / タイムアウト | — | — | — | — |
| hmv | ○ UA-B（Cookie 2回目で本体） | `Product` のみ | **無し** | **無し** | HTML のみ 1〜2段 + `meta keywords` |
| toranoana | ○ UA-A | `BreadcrumbList` + `Product` | **無し** | **有り**（ただし2段目だけが分類、3段目はサークル名） | 実質 **1段** |

### 2.1 Yahoo! Auctions — **一番良い。JSON-LD の `BreadcrumbList` が 3〜6段。**

取得: UA-B で 200。`auctions.yahoo.co.jp/jp/auction/<id>` は取れる。
`page.auctions.yahoo.co.jp/...`（Brave が返す旧ホスト）は 404 になったものがある
（`https://page.auctions.yahoo.co.jp/jp/auction/q1132398731` → 404、28,842バイト）。

JSON-LD は **2ブロック**。`BreadcrumbList` と `Product`。
`Product` のキーは `description / image / name / offers / url` の5つだけで、
**`category` は無い**。`brand`・`weight`・`size` も無い。

実測したパンくず（すべて 2026-09-07 取得）:

| URL | パンくず |
|---|---|
| `https://auctions.yahoo.co.jp/jp/auction/n1128099422` | オークショントップ > **おもちゃ、ゲーム > ゲーム > トレーディングカードゲーム > 遊戯王（コナミ） > シングルカード** |
| `https://auctions.yahoo.co.jp/jp/auction/k1156252744` | オークショントップ > **おもちゃ、ゲーム > フィギュア > ゲームキャラクター > その他** |
| `https://auctions.yahoo.co.jp/jp/auction/t1222204510` | オークショントップ > **ファッション > メンズシューズ > スニーカー > ナイキ > 28.0cm** |
| `https://auctions.yahoo.co.jp/jp/auction/q1230591623` | オークショントップ > **音楽 > レコード > その他** |
| `https://auctions.yahoo.co.jp/jp/auction/e1056372662` | オークショントップ > **おもちゃ、ゲーム > ゲーム > テレビゲーム > ファミコン > タイトル > アクション** |

値の形: 各段は `{"position":n, "name":"...", "item":{"@id":"https://auctions.yahoo.co.jp/list4/25464-category.html"}}`。
**名前は日本語の文字列、URL に数値のカテゴリIDが入る**（`25464`, `2084005483` など）。
ブランド段だけ `https://auctions.yahoo.co.jp/brand/1319/` という別形式になる。

`<meta name="keywords">` にも同じ情報が入るが、**3語だけ・逆順**（葉、親、ルート）。
例: `keywords = " 28.0cm,ナイキ,ファッション "`。
パンくずの方が完全なので keywords を使う理由は無い。

注意点2つ:
- **葉が `その他` になることがある**（上の2件）。その場合、最下段は情報量ゼロ。
  使うなら「`その他` は1段上に落とす」処理が要る。
- **最下段が重量と無関係なことがある**。`ファミコン > タイトル > アクション` の
  「アクション」はゲームのジャンルであって梱包とは関係ない。
  一方で `ナイキ > 28.0cm` の「28.0cm」は靴のサイズで、重量に効く。
  **枝ごとに「使う段」が違う。**

### 2.2 Mercari — **本文に到達できなかった。**

- `https://jp.mercari.com/item/m84660218944` → **HTTP 404**（483,353 バイト）
- `https://jp.mercari.com/item/m50293866314` → **HTTP 404**（483,353 バイト）

返ってきたのは Next.js のエラーシェル（`<html ... id="__next_error__">`）。
サイズが両方同一なので、商品ごとの中身ではなく共通のエラーページ。
UA-A / UA-B の両方で同じ。`Accept-Language: ja` 付き、リダイレクト追跡あり。
過去の実測（`docs/audit/search-reality.md` の系列）と整合する遮断。

- `https://jp.mercari.com/shops/product/2JNwZVvT5beCpZJoVUEPPm` → **HTTP 200**（533,987 バイト）

こちらは 200 だが、**中身はアプリのシェルと i18n の文言バンドルだけ**だった。
実測:
- `application/ld+json` は **0件**
- `og:type` = `article`（`product` ではない）
- `og:title` = `NIKE ナイキ スニーカー FREE 579959-380 27cm - ブックオフ総合リユースストア`
- HTML 全文（359,492文字）を `categoryId` / `category_id` / `productCategory` / `Breadcrumb` で
  grep して **0件**。`カテゴリ` は46件ヒットするが、全て UI 文言
  （`"カテゴリーで絞り込む"`, `"{{category}}カテゴリーの商品は選択できません"` 等）の
  翻訳辞書であって、この商品の分類ではない。

**つまりメルカリは、シェルが返ってきても商品カテゴリは HTML に無い。**
カテゴリはクライアント側で API から取っている。
Wayback の写しも試したが、`m84660218944` はスナップショット無し
（`archive.org/wayback/available` が `NO SNAPSHOT`）。
さらに **この環境からは `web.archive.org` 自体が egress ポリシーで拒否される**
（本文が `Blocked by egress policy` の 24バイト、または接続リセット）。
`arquivo.pt` は該当 URL のスナップショットを持っていなかった（404）。

### 2.3 Rakuten — **JSON-LD の `BreadcrumbList` が 3〜5段。ただし `Product` ノードが無い。**

**取得できる UA が本番と同じ UA-A の方だった。**
UA-B（Chrome）だと Akamai に弾かれ、HTTP 200 だが本文 42 バイトの
`Reference #18.49a4c017.1788823607.4bfe539` だけが返る。
UA-A に戻すと 117KB〜172KB の実ページが返った。**ここは記録しておく価値がある。**

JSON-LD は `BreadcrumbList` が1ブロック（1件は `VideoObject` も同居）。
**`Product` ノードは4件中0件。**したがって
`src/lib/search/product.ts` の `fromJsonLd()` は楽天では何も拾えず、
タイトルは `og:title` に落ちる。さらに `product:price:amount` の meta も
**4件すべてに無い**ので、**楽天は現状どの経路でも価格が読めていない**（本題外だが実測事実）。

実測したパンくず（すべて 2026-09-07 取得）:

| URL | パンくず（`www.rakuten.co.jp/category/<id>/`） |
|---|---|
| `https://item.rakuten.co.jp/sanrokuen/yame-matcha/` | 楽天市場 > **水・ソフトドリンク(100316) > お茶・紅茶(565598) > 茶葉・ティーバッグ(565600) > 日本茶(100361)** |
| `https://item.rakuten.co.jp/gekkeikan/sake01711/` | 楽天市場 > **日本酒・焼酎(510901) > 日本酒(100337) > 純米大吟醸酒(302863)** |
| `https://item.rakuten.co.jp/nishinihonbudogu/m-5/` | 楽天市場 > **スポーツ・アウトドア(101070) > 格闘技・武術(565738) > 剣道(205075) > 竹刀・木刀(214700) > 竹刀(214701)** |
| `https://item.rakuten.co.jp/thanko/000000003717/` | 楽天市場 > **家電(562637) > キッチン家電(100644) > ワインセラー(208343)** |

値の形: 日本語の文字列 + URL 中の数値ジャンルID。
同じジャンルIDがページ内のカート用埋め込み JSON にも `genreId: 302863` として出るので、
**パンくずの葉＝楽天の商品ジャンルID**であることが二重に確認できる。

`meta keywords` はカテゴリではなく「楽天市場,通信販売,通販,…」の定型語 + 商品名なので使えない。

### 2.4 Yahoo! Shopping — **JSON-LD のパンくずは店の自作分類。公式カテゴリは埋め込み JSON にある。**

JSON-LD は `BreadcrumbList` + `Product` の2ブロック。
`Product` のキー: `name / description / image / offers` に加えて
`brand`（`{"@type":"Brand","name":"ANIPLEX"}`）、`gtin13`（`"4571452943406"`）、
`aggregateRating`、`review`。**`category` は無い。**

`BreadcrumbList` は**店が自分で作った棚**であって、Yahoo の分類ではない:

| URL | JSON-LD パンくず |
|---|---|
| `https://store.shopping.yahoo.co.jp/amiami/figure-169911.html` | あみあみ Yahoo!店 > **フィギュア** |
| `https://store.shopping.yahoo.co.jp/nishinihonbudogu/k-39-h.html` | 西日本武道具Yahoo!ショッピング店 > **剣道-竹刀** |
| `https://store.shopping.yahoo.co.jp/notoaji/syouyu-koi6.html` | 能登うまいもんの里 のと味 > **深海の恵み 能登の調味料 > 醤油・魚醤 > 能登醤油** |

3件目の「深海の恵み 能登の調味料」で分かるとおり、**店ごとに語彙がバラバラで、
横断的な分類として使えない。**

ただし**同じページの埋め込み JSON に Yahoo 公式のジャンルツリーが入っている**
（`"genreCategory":{"categoryId":"...","categoryPathsIgnoreShopping":[{"id":..,"name":".."}…]}`）。
実測:

| URL | `genreCategory` の完全パス |
|---|---|
| amiami/figure-169911 | **ゲーム、おもちゃ(2511) > フィギュア(15160) > フィギュア本体(15170)** |
| nishinihonbudogu/k-39-h | **スポーツ(2512) > 武道、格闘技(3001) > 剣道(3020) > 竹刀(3025)** |
| notoaji/syouyu-koi6 | **食品(2498) > 調味料、料理の素、油(1273) > 醤油(19010) > 濃口醤油(41753)** |

`genreCategoryIds` にも同じIDの配列（`[1,2511,15160,15170]` 等）が入る。
**これは構造化データではなく、Yahoo のフロントエンドの内部 JSON。**
仕様が変わればいつでも壊れる。JSON-LD と同じ扱いはできない。

**重量に関係しそうな属性:**
- `shipWeight` というフィールドが存在する。しかし実測値は
  **`50000`（1/7 スケールのフィギュア）/ `null`（竹刀）/ `0`（醤油1L×6本）**。
  50kg のフィギュアも 0g の醤油6本も現実ではない。
  **`src/data/weights.ts` 冒頭が Shopify の `grams` について書いている擬似値の問題と全く同じ。使えない。**
- `janCode`（= JAN/EAN13）は 3件中1件に入っていた（`4571452943406`）。
- `Product.gtin13` も同じ値を持つ。

### 2.5 Amazon.co.jp — **JSON-LD は1件も無い。パンくずは HTML の DOM だけ。**

UA-B で 200（0.8〜1.7MB）。**`application/ld+json` は3ページとも 0件。**
`og:` のカテゴリ系 meta も無い（`<meta name="description">` はタイトルの繰り返し）。

カテゴリは `wayfinding-breadcrumbs_feature_div` という **HTML の div** の中にしかない:

| URL | HTML パンくず |
|---|---|
| `https://www.amazon.co.jp/dp/B000ZGMF8O`（ねんどろいど初音ミク） | **ホビー > フィギュア・コレクタードール** |
| `https://www.amazon.co.jp/dp/B07QKT83H3`（純米大吟醸 1800ml） | **お酒 > 日本酒 > 純米大吟醸酒** |
| `https://www.amazon.co.jp/dp/B0CCRVLP7S`（素振り竹刀） | **武術・格闘技 > 剣道 > 竹刀** |

`売れ筋ランキング` のブロックにも葉のカテゴリ名が出る
（例: `フィギュア・コレクタードール (ホビー) - 23,081位`、`竹刀 - 98位`）。

**重量に関係する属性（HTML の仕様表、JSON ではない）:**
- B07QKT83H3: `梱包サイズ  40.1 x 11.7 x 10.3 cm; 2.77 kg` ← **梱包後の実重量。1800ml 瓶として妥当。**
- B000ZGMF8O: `品目寸法（L x W x H） 15.2長さ x 10.2幅 x 10.2高さ cm` /
  `商品の重量 **0.01 オンス**` / `サイズ 全高約10cm`
  → **0.01 オンス = 0.28g。ねんどろいどが 0.28g のはずがない。出品者入力のゴミ。**
- B0CCRVLP7S: 寸法も重量も無し。

つまり Amazon の重量欄は**当たれば本物、外れれば桁が狂っている**。
`梱包サイズ` の `; N kg` の形だけを採るなら使える可能性はあるが、3件中1件しか無かった。

### 2.6 Suruga-ya — **取れなかった。Cloudflare のチャレンジで全滅。**

`https://www.suruga-ya.jp/product/detail/602230137` / `/109003725` / `/160000523` の3件。

試したこと（すべて 403）:
- UA-A（本番の UA）→ 403、5,671バイト
- UA-B（Chrome）→ 403、5,820バイト
- iPhone Safari の UA → 403
- Googlebot の UA → 403
- `curl/8.5.0` → 403

返るのは `<title>Just a moment...</title>` の Cloudflare 対話型チャレンジ。
JavaScript を実行しないと通らない。

Wayback には `109003725` の写し（`20250922152343`）が存在することは
`archive.org/wayback/available` で確認したが、**この環境から `web.archive.org` へは
egress ポリシーで接続できない**（`Blocked by egress policy` / 接続リセット）。
`arquivo.pt` にはスナップショット無し。**したがって駿河屋については何も測れていない。**

### 2.7 Mandarake — **取れなかった。URL がそもそも集まらない。**

**本番 `/api/search` に 61 クエリ投げて、まんだらけの出品 URL は 1件しか返らなかった**
（全230件中1件。内訳は §4）。その1件は
`https://k.mandarake.co.jp/auction/item/itemInfoJa.html?index=736234`。

このホストは**この環境の egress プロキシに拒否される**
（`k.mandarake.co.jp:443 — connect_rejected (organization policy)`）。

`https://order.mandarake.co.jp/order/` は 302 で `https://www.mandarake.co.jp/` に
飛ばされた（トップページ 200、10,359バイト）。
`order/detailPage/item` 形式の実在 URL は検索から1件も得られなかったので、
**まんだらけの商品ページの構造化データは1件も確認していない。推測で埋めない。**

### 2.8 ZOZOTOWN — **取れなかった。Akamai が全部落とす。**

`https://zozo.jp/shop/newbalance/goods/67503725/` ほか3件。

- UA-B（Chrome）→ **403**、本文は Akamai の `<TITLE>Access Denied</TITLE>`
  （`https://errors.edgesuite.net/18.47a4c017...`）
- iPhone Safari の UA → 403
- UA-A / Googlebot / `curl` → **25秒でタイムアウト、0バイト**（接続すら返らない）
- `https://zozo.jp/robots.txt` すら **403**

Wayback に `67503725` の写し（`20230623142856`）はあるが、上記のとおり
`web.archive.org` に到達できない。**ZOZO についても何も測れていない。**

### 2.9 HMV — **JSON-LD の `Product` はあるが `category` が無い。カテゴリは HTML と `meta keywords`。**

取得に2段階要る:
1回目のリクエストは **21KB の中継ページ**が返り、本文は
`<a href="/product/detail/3998036">商品ページへ遷移する</a>` だけ。
`ld+json` は0件。**Cookie を保存して同じ URL をもう一度取ると 66KB の本体が返る**
（`curl -c/-b` の Cookie jar + `Referer: https://www.hmv.co.jp/`）。
文字コードは **Shift_JIS**。

本体の JSON-LD は **1ブロック、`Product` のみ**。キー:
`name / description / image / url / sku / productID / brand / manufacturer / seller /
offers / itemCondition / releaseDate / availabilityDate`。
**`category` は無い。`BreadcrumbList` も無い。**
`brand` は `{"@type":"Brand","name":""}` で**空文字**だった（2件とも）。
`itemCondition` は `http://schema.org/NewCondition`。

カテゴリが読めるのは次の2か所:

| URL | HTML パンくず | `meta keywords` |
|---|---|---|
| `https://www.hmv.co.jp/product/detail/3998036` | トップ > **グッズ** > LPビニールカバー 100枚1セット | `LPビニールカバー 100枚1セット, グッズ` |
| `https://www.hmv.co.jp/product/detail/12974788` | トップ > **映像DVD・BD > 洋画** | `モービウス ブルーレイ&DVDセット, **Blu-ray Disc, 映画**` |

**`meta keywords` の2番目が「フォーマット」なのが効く。**`Blu-ray Disc` は
`weights.ts` の `dvd-bluray` ラインに文字列としてはそのまま対応する
（ただし §3.1 の注記のとおり、そのラインの中央値 1,750g は K-POP のボックス盤で
測った値なので、洋画1枚にそのまま当ててはいけない）。
パンくずの「映像DVD・BD」だけだと DVD か Blu-ray か箱物かが分からない。

なお `og:type` は `article`、`og:title` は商品名のみ。

### 2.10 Toranoana — **`BreadcrumbList` はあるが、分類は実質1段。HTML の「種別/サイズ」の方が有用。**

UA-A で 200（209KB〜219KB）。JSON-LD は `BreadcrumbList` + `Product` の2ブロック。
`Product` のキー: `name / description / image / offers / sku / brand`。
`sku` は12桁の商品コード（`"040030373207"`）、`brand` は
`{"@type":"Organization","name":"ロバミミ★カンパニー"}` = **サークル名**。
**`category` は無い。**

パンくずの実測:

| URL | パンくず |
|---|---|
| `https://ecs.toranoana.jp/tora/ec/item/040030373207/` | とらのあな通販 > **同人誌** > ロバミミ★カンパニー > マリみて ～投げっぱなし劇場7～ |
| `https://ecs.toranoana.jp/tora/ec/item/040031212438/` | とらのあな通販 > **同人アイテム** > 月猫創意 > 【非公式】ブルーアーカイブ 同人吸水コースター 陸八魔アル |
| `https://ecs.toranoana.jp/joshi/ec/item/040030710499/` | とらのあな通販 > **同人誌** > ペルソナ４ １０周年記念アンソロジー企画部 > ペルソナ４ １０周年記念アンソロジー １０thHAPPY!! |

**2段目だけが分類**（`同人誌` / `同人アイテム`）で、3段目はサークル名、4段目は商品名。
分類としては2択しかない。

一方、**HTML の仕様表に「種別/サイズ」がある**:

- `040030373207` → **`同人誌 - 漫画/ Ａ５ 36p`**
- `040031212438` → **`同人グッズ - その他/ その他`**

「Ａ５ 36p」は**判型とページ数**で、紙束の重さそのものである。
`weights.ts` の `books-manga` は `manga-volume` / `manga-set` / `book-general` の3ラインしか
持っていないが、とらのあなは判型 × ページ数を宣言している。
**カテゴリよりこちらの方が重量に効く。**ただし構造化データではなく HTML の表。

---

## 3. 判断

### 3.1 カテゴリで重量が絞れるか（問7）

`src/data/weights.ts` は 2026-09-07 時点で **11カテゴリ・75ライン**
（`figures / music / books-manga / tcg-singles / kpop / used-luxury / sneakers /
food-tea-sake / fishing-tackle / sports-goods / games`。
別に「取れていない」印の3カテゴリ=楽器・カメラ/レンズ・アパレルがある）。

**カテゴリ同士は 1対1 にならない。多対多でもない。「粗さの方向が違う」。**

サイトのカテゴリツリーはどれも**用途で切ってある**（何に使う物か）。
`weights.ts` のラインは**梱包で切ってある**（どれくらいの箱に入るか）。
この2つは重なる枝もあれば、直交する枝もある。

**重なる枝（サイトのカテゴリがそのままラインに落ちる）:**

| サイトのカテゴリ | `weights.ts` のライン | 備考 |
|---|---|---|
| 楽天 `剣道 > 竹刀・木刀 > 竹刀(214701)` | `shinai`（sports-goods） | 一意 |
| Yahoo!ショッピング `スポーツ > 武道、格闘技 > 剣道 > 竹刀(3025)` | `shinai` | 一意 |
| Amazon `武術・格闘技 > 剣道 > 竹刀` | `shinai` | 一意 |
| 楽天 `日本酒・焼酎 > 日本酒 > 純米大吟醸酒` | `sake-1800ml` か `sake-720ml` | **容量が分からないので決まらない** |
| ヤフオク `おもちゃ、ゲーム > ゲーム > トレーディングカードゲーム > 遊戯王（コナミ） > シングルカード` | `single-card`（tcg-singles） | 一意。ただし PSA スラブかどうかは分からない |
| HMV `keywords` の `Blu-ray Disc` | `dvd-bluray` | フォーマットは一意に決まる。**ただしこのラインは中央値 1,750g・`kpop` カテゴリ所属で、K-POP のボックス盤で測った値。洋画1枚に当てるのは間違い。**サイトのカテゴリが合っても、辞書側のラインが別物を測っていることがある |

**直交する枝（カテゴリでは決まらない）:**

| サイトのカテゴリ | 中に同居する `weights.ts` ライン | 幅 |
|---|---|---|
| ヤフオク `おもちゃ、ゲーム > フィギュア > ゲームキャラクター > その他` | `nendoroid` 439g / `figma` 800g / `pop-up-parade` 800g / `scale-1-8` 1,300g / `scale-1-7` 1,500g / `scale-1-6` 1,800g / `scale-1-4` 3,000g | **439g〜3,000g = 6.8倍** |
| Yahoo!ショッピング `ゲーム、おもちゃ > フィギュア > フィギュア本体(15170)` | 同上 | 同上 |
| 楽天 `日本酒 > 純米大吟醸酒` | `sake-300ml` / `sake-720ml` / `sake-1800ml` | 300ml〜1.8L |
| ヤフオク `音楽 > レコード > その他` | `lp` 270g（1枚）だが実物は「まとめ」複数枚 | 数量が入らない |

**この対応表を作れる根拠になったのは、ヤフオクのフィギュア枝が
「作品名」（`ゲームキャラクター`）で分岐していて「スケール」では分岐していない、
という実測結果である。**サイト側はコレクター向けに作品で分類しているのであって、
梱包で分類していない。当然といえば当然だが、**推測ではなく現物で確認できた。**

### 3.2 カテゴリだけで足りるか（問8）

**足りない。カテゴリ単独では上の「直交する枝」で 6.8倍の幅が残る。**

課題文の仮説（「メルカリの『ホビー > フィギュア』は 28g〜3kg を含むのでカテゴリだけでは足りない」）は、
**メルカリでは検証できなかった**（§2.2 のとおりページに到達できない）。
ただし**ヤフオクと Yahoo!ショッピングの実測で、同じ結論が別のサイトで確認できた。**
ヤフオクの `フィギュア > ゲームキャラクター` は 439g〜3,000g を含む。

**正しい形は「置き換え」ではなく「絞り込み」。**
`src/lib/pricing/weights.ts` の `resolveWeight(title, categoryId?)` は
**すでに第2引数でカテゴリを受ける設計になっている**:

- `categoryId` を渡すと `WEIGHT_CATEGORIES` をそのカテゴリに絞ってからライン検索する
- どのラインにも当たらなければ、そのカテゴリの `fallbackG` を返す

つまり**サイトのカテゴリは、この既存の `categoryId` に流し込むのが素直。**
新しい仕組みは要らない。役割分担はこうなる:

- **サイトのカテゴリ** → どのカテゴリ表を見るかを決める（＝誤爆を防ぐ／総称の受け皿を用意する）
- **タイトルの語** → その表の中でどのラインかを決める（＝スケール・容量・判型）

### 3.3 カテゴリにしかできないこと — 辞書の誤爆を止める

**実測で見つかった最良の例:**

`https://item.rakuten.co.jp/thanko/000000003717/`（2026-09-07 取得）

- タイトル: `日本酒セラー 小型 日本酒 冷蔵庫 セラー コンプレッサー式 **一升瓶** 家庭用 保管 保冷 …
  [公式]**一升瓶**を縦置きできる日本酒冷蔵庫・セラー「俺の酒蔵」 JPSABRSBK 送料無料`
- 辞書の挙動: `sake-1800ml` の `match` に `'一升瓶'` があるので**命中する**。
  返る重量は **3,300g**（`sake-1800ml`、`food-tea-sake`、n=583、p25 2,200 / p75 3,355）。
- サイトの宣言: **`家電(562637) > キッチン家電(100644) > ワインセラー(208343)`**

**これは日本酒ではなく冷蔵庫である。**辞書はタイトルしか見ないので絶対に気付けない。
カテゴリは「食品ではない」と宣言している。
`resolveWeight` に `categoryId` を渡す形にすれば、`家電` は
`WEIGHT_CATEGORIES` のどのカテゴリにも対応しないので**ラインに当たらず `null` を返し、
計算機は「段ごとの総額」に落ちる**。これは今の「3.1kg と言い切る」より正しい。

**これがカテゴリを読む一番の見返りだと思う。**「より正確な重量」ではなく
**「間違った重量を出さない」**。網羅70%という数字は「30%が取れない」を意味するが、
残り70%のうち何%が誤爆かは測れていない。カテゴリはその誤爆を測れるようにする。

### 3.4 取れないサイトが多いが、方針は成立するか（問9）

**成立する。ただし範囲は「URL を貼った経路」に限られ、そこでも 6/10 サイトまで。**

まず、**カテゴリはページを取らないと読めない。**
現状 `/api/search` は Brave の結果（タイトル・URL・画像）をそのまま返していて
ページを取っていない（`parseProductHtml` を呼ぶのは `src/app/api/product/route.ts` だけ）。
だから**キーワード検索の行にカテゴリは付けられない。追加のfetchが必要になる。**

一方 **URL を貼った経路はすでに1回ページを取っている。**
そこでカテゴリを一緒に読むのは**追加コストがゼロ**。
`fromJsonLd()` は現在 `@type: Product` のノードしか見ておらず、
`BreadcrumbList` のノードを素通りしている。**同じ HTML の同じループで拾える。**

到達可能性の実測（2026-09-07、この環境から）:

| 経路 | カテゴリが取れるサイト |
|---|---|
| **JSON-LD `BreadcrumbList` だけで取れる**（サイト非依存の実装1本で済む） | yahoo-auctions（3〜6段）、rakuten（3〜5段）、toranoana（実質1段） |
| **サイト固有の実装が要る** | yahoo-shopping（埋め込み JSON の `genreCategory`）、amazon-jp（HTML の div）、hmv（`meta keywords` + Cookie 2回リクエスト） |
| **この環境からは到達できない** | mercari、suruga-ya、zozo、mandarake |

**「JSON-LD の `BreadcrumbList` を読む」という1本の実装だけで 3サイト。**
うち **ヤフオクと楽天は横断検索の主力2サイト**で、しかもカテゴリが3〜6段と深い。
これは十分に見合う。

**Yahoo!ショッピングは判断が要る。**公式ジャンルパスは取れるが、
それは JSON-LD ではなく**フロントエンドの内部 JSON** で、
`src/data/weights.ts` 冒頭の「Shopify の grams は擬似値」と同じ理由で
「サイトが公開しているデータ」とは呼びにくい。
JSON-LD の `BreadcrumbList` の方は**店が自作した棚**なので横断分類にならない。
どちらを採るにせよ、**画面には「Yahoo!ショッピングの店が付けた分類」と
「Yahoo! のジャンル」を区別して出さないと嘘になる。**

**Amazon と HMV は JSON-LD が無い/`category` が無いので、HTML のスクレイピングになる。**
`product.ts` の方針（「価格の抽出は決定的にやる」「サイト別の限定的な正規表現」）に
照らせば、やること自体は既存の `freeShippingHint()` と同じ性質だが、
壊れやすさは JSON-LD と段違いなので**別 tier で扱う**べき。

**4サイトが取れないのは方針を否定しない。**
その4サイトは**いま既にカテゴリ以外も取れていない**（メルカリはそもそも本文が404、
駿河屋・ZOZO は403）。カテゴリを読む機能を足しても、そこが悪化することはない。
**ただし「カテゴリが出典として出せるのはこのサイト、出せないのはこのサイト」を
画面で区別しないと、ユーザーは全サイトで同じ根拠があると誤解する。**

### 3.5 重量に関係する他の属性（問6のまとめ）

実測で見つかったもの:

| サイト | 属性 | 実測値 | 使えるか |
|---|---|---|---|
| yahoo-auctions | パンくずの靴サイズ段 | `28.0cm` | **使える。**スニーカーの重量に効く |
| yahoo-auctions | パンくずのブランド段 | `ナイキ` | 直接は効かない |
| yahoo-shopping | `Product.gtin13` / `janCode` | `4571452943406` | JAN。外部カタログと突き合わせるなら鍵になるが、単独では重量にならない |
| yahoo-shopping | `shipWeight` | `50000` / `null` / `0` | **使えない。**擬似値（1/7フィギュアが50kg、醤油6本が0g） |
| yahoo-shopping | `Product.brand` | `ANIPLEX` | 直接は効かない |
| amazon-jp | `梱包サイズ` | `40.1 x 11.7 x 10.3 cm; 2.77 kg` | **梱包後の実重量。3件中1件のみ存在。** |
| amazon-jp | `商品の重量` | `0.01 オンス`（ねんどろいど） | **使えない。**出品者入力のゴミ |
| amazon-jp | `品目寸法` | `15.2 x 10.2 x 10.2 cm` | 箱の寸法。容積重量なら使えるが重量そのものではない |
| hmv | `meta keywords` の2語目 | `Blu-ray Disc` | **使える。**フォーマット＝梱包クラス。ただし対応する `dvd-bluray` ラインは K-POP ボックス盤で測った 1,750g なので、辞書側の再測定が要る |
| hmv | `Product.itemCondition` | `http://schema.org/NewCondition` | 新品/中古。梱包の有無に効くが今の辞書には入り口が無い |
| toranoana | HTML の `種別/サイズ` | `同人誌 - 漫画/ Ａ５ 36p` | **使える。**判型＋ページ数は紙束の重さそのもの |
| toranoana | `Product.sku` | `040030373207` | 商品コード。重量ではない |
| toranoana | `Product.brand` | サークル名 | 重量ではない |
| yahoo-auctions | `Product` | `description/image/name/offers/url` のみ | 重量に効く属性は**無い** |
| rakuten | JSON-LD | `BreadcrumbList` のみ | 重量に効く属性は**無い** |

**「サイトが宣言した重量」は、Yahoo!ショッピングも Amazon も擬似値/ゴミを混ぜてくる。**
`src/data/weights.ts` が Shopify の `grams` に対して立てた基準（分布を見て
usable/suspect/pseudo を判定し pseudo は採らない）を、これらにも同じように適用しない限り採れない。
**今回の3件・3件というサンプルでは、その判定を下せるだけの数が無い。**

---

## 4. この調査で取れなかったもの／限界

- **本番 `/api/search` に 61クエリ（キャッシュバスター付き）を投げ、出品 URL 230件を得た。**
  サイト別内訳: yahoo-shopping 87 / amazon-jp 33 / rakuten 28 / yahoo-auctions 24 /
  mercari 22 / toranoana 16 / suruga-ya 8 / hmv 6 / zozo 5 / **mandarake 1**。
  **まんだらけは 61クエリで1件しか出ない。**これは遮断の問題ではなく、
  Brave のインデックスにまんだらけの商品ページがほとんど無いということ。
- **実際に本文を取得できたのは 10サイト中 6サイト。**
  メルカリ（404 / シェルのみ）、駿河屋（Cloudflare 403）、
  ZOZOTOWN（Akamai 403 / タイムアウト）、まんだらけ（egress 拒否）は本文ゼロ。
- **Wayback / arquivo.pt での代替は失敗した。**
  `web.archive.org` はこの環境の egress ポリシーで拒否される
  （本文 `Blocked by egress policy`）。`arquivo.pt` は該当 URL の写しを持っていなかった。
- **サンプル数が少ない。**サイトあたり 2〜5ページ。
  「同じサイトの違う商品で粒度がどれくらいか」は、ヤフオク5件・楽天4件・
  Yahoo!ショッピング3件・Amazon 3件・とらのあな3件・HMV 2件の範囲でしか言えていない。
  **カテゴリツリー全体の深さの分布は測っていない。**
- **`Product.category` が「無い」と言えるのは、取得できた6サイトについてだけ。**
  メルカリ・駿河屋・ZOZO・まんだらけの `Product` に `category` があるかは**分からない**。
- Yahoo!ショッピングの `genreCategory` は3件しか見ていないので、
  **全商品に必ず入るのかは確認していない。**
- Amazon の `梱包サイズ` は3件中1件にしか無かった。**出現率は測れていない。**

## 5. 参照した URL（全件、確認日 2026-09-07）

**取得できた（HTTP 200 + 本文あり）:**
- https://auctions.yahoo.co.jp/jp/auction/n1128099422
- https://auctions.yahoo.co.jp/jp/auction/k1156252744
- https://auctions.yahoo.co.jp/jp/auction/t1222204510
- https://auctions.yahoo.co.jp/jp/auction/q1230591623
- https://auctions.yahoo.co.jp/jp/auction/e1056372662
- https://item.rakuten.co.jp/sanrokuen/yame-matcha/
- https://item.rakuten.co.jp/gekkeikan/sake01711/
- https://item.rakuten.co.jp/nishinihonbudogu/m-5/
- https://item.rakuten.co.jp/thanko/000000003717/
- https://store.shopping.yahoo.co.jp/amiami/figure-169911.html
- https://store.shopping.yahoo.co.jp/nishinihonbudogu/k-39-h.html
- https://store.shopping.yahoo.co.jp/notoaji/syouyu-koi6.html
- https://www.amazon.co.jp/dp/B000ZGMF8O
- https://www.amazon.co.jp/dp/B07QKT83H3
- https://www.amazon.co.jp/dp/B0CCRVLP7S
- https://www.hmv.co.jp/product/detail/3998036
- https://www.hmv.co.jp/product/detail/12974788
- https://ecs.toranoana.jp/tora/ec/item/040030373207/
- https://ecs.toranoana.jp/tora/ec/item/040031212438/
- https://ecs.toranoana.jp/joshi/ec/item/040030710499/
- https://jp.mercari.com/shops/product/2JNwZVvT5beCpZJoVUEPPm （200 だがシェルのみ）

**取得できなかった:**
- https://page.auctions.yahoo.co.jp/jp/auction/q1132398731 — 404
- https://jp.mercari.com/item/m84660218944 — 404
- https://jp.mercari.com/item/m50293866314 — 404
- https://www.suruga-ya.jp/product/detail/602230137 — 403 Cloudflare
- https://www.suruga-ya.jp/product/detail/109003725 — 403 Cloudflare
- https://www.suruga-ya.jp/product/detail/160000523 — 403 Cloudflare
- https://zozo.jp/shop/newbalance/goods/67503725/ — 403 Akamai / timeout
- https://zozo.jp/shop/nanouniverse/goods/85488954/ — 403 Akamai / timeout
- https://zozo.jp/shop/zozoused/goods/39967363/ — 403 Akamai / timeout
- https://k.mandarake.co.jp/auction/item/itemInfoJa.html?index=736234 — egress 拒否

**検索の出所:** `https://proxycost.3amoncall.workers.dev/api/search?q=<query>&_cb=<random>`
（61クエリ、すべてキャッシュバスター付き）
