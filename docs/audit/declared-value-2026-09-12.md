# F39「5社とも申告額ポリシーを公表していない」は事実か（2026-09-12）

`master/fees.json` F39 の `excluded_reason` / `display_reason`、`docs/MASTER.md`・`docs/ROADMAP.md`・
`docs/FEE-ITEMS.md`・`docs/FIT-GAP.md`・`docs/TODO-NEXT.md` に繰り返し出てくる
「**5社とも公表していない**」という主張の根拠を確認する。**この文書は監査のみ。
`master/fees.json` 等は一切変更していない**（別エージェントが編集中のため）。

---

## 0. 結論を先に

**「5社とも公表していない」は誤り。5社中5社とも、何らかの形で申告額に関する方針を
公開ページに書いている。**ただし内容の粒度はばらつく。F39 が聞いている3つの問い
（①商品代のみか手数料込みか　②過少申告・ギフト扱いの可否　③複数個口の按分）に
**3問とも直接答えている社は無い。**多くは②（過少申告はしない）だけを公言している。

| 社 | 公表しているか | 確認できた内容 | 確認日 |
|---|---|---|---|
| Buyee | **公表している**（②のみ、直接確認は不可） | 「the item price on the invoice cannot be edited - it will remain as the same price as when you bought it」 | 2026-09-12（検索エンジンのスニペット経由、直接 fetch は 403） |
| Neokyo | **公表している**（①②とも） | Pro Forma Invoice は商品代のみ・手数料は含まない。金額は変更不可 | 2026-09-12（検索エンジンのスニペット経由、直接 fetch は 403） |
| ZenMarket | **公表している**（②のみ） | 2022年10月以降、申告額の過少申告オプションを廃止し変更不可に | 2026-09-12（検索エンジンのスニペット経由、直接 fetch は 403） |
| Jauce | **公表している**（②、直接 fetch で確認できた唯一の社） | 「JAUCE describes items with accuracy and transparency. JAUCE does not reduce values on invoices or label items as gifts.」 | 2026-09-12（`jauce.com/terms` を WebFetch で直接取得） |
| FROM JAPAN | **公表している**（②、直接 fetch で確認できた） | 「The invoice value cannot be changed.」「FROM JAPAN staff will enter the appropriate HS code and invoice description based on the item name... must accurately match the item being shipped.」 | 2026-09-12（`blog.fromjapan.co.jp` の該当記事を WebFetch で直接取得） |

**5社とも「過少申告・ギフト偽装はしない／できない」という方針は明記している。**
①（商品代のみか手数料込みか）は Neokyo だけ明記。③（複数個口の按分）は
**5社とも公開ページで見当たらなかった**（後述、探した場所を明記）。

---

## 1. リポジトリ内の既存証拠 ── 無かった

`master/` と `docs/` を `declare|declared|CN22|CN23|customs value|invoice value|under-?declare|undervalue|gift|申告` で
全文検索した。ヒットは多数あったが、**すべて①免税閾値の判定式やVATベースの議論**
（`master/customs.json` の `declared_value_per_parcel_usd` 等）か、**F39 自身の同じ主張の
繰り返し**（`docs/MASTER.md:74`、`docs/ROADMAP.md:19,641,644`、`docs/FEE-ITEMS.md:104,191`、
`docs/FIT-GAP.md:129`、`docs/TODO-NEXT.md:311`）だった。**F39 の主張に外部一次情報の
`source`/`quote`/`checked_on` を付けている箇所は無い**——他の費目行と違う扱いのまま。
`docs/audit/` 配下の既存文書（`o2-courier-*.md`・`taxes.md`・`gaps.md`・`logic.md` 等)にも、
申告額ポリシーの一次情報への言及は無かった。

→ **「止まる条件」（リポジトリ内に F39 と食い違う記録が既にある）には該当しない。**
矛盾ではなく、**単に検証されていなかった**。

---

## 2. 到達性 ── 直接 fetch とスニペット経由の内訳

`robots.txt` を先に確認した（`curl` で直接取得、2026-09-12）。

| 社 | robots.txt | 備考 |
|---|---|---|
| buyee.jp | **取得不可（403）** | ルートも WAF 越し |
| neokyo.com | `Disallow: /*?*` 他 | **クエリ文字列付き URL は取得しない**（今回参照した zendesk 記事 URL はクエリ無し静的パスなので抵触しない） |
| zenmarket.jp | 多言語パスの Disallow のみ | `/en/...` は許可 |
| jauce.com | 空（制限なし） | |
| fromjapan.co.jp | ルートで 301（リダイレクト先未確認） | ブログサブドメインは別ホストのため今回は無関係 |

`o2-courier-webfetch-2026-09-11.md` が記録した制約（curl は WAF で 403、WebFetch は静的ページに届く）は、
**今回はそのまま再現しなかった**。今回は逆に、**WebFetch 自体が Buyee (`faq.buyee.jp`)・
Neokyo (`neokyohelp.zendesk.com`)・ZenMarket (`zenmarket.jp/en/...`) の該当ページに対して
毎回 403 を返した**（zendesk 系はボット判定、Buyee・ZenMarket は WAF と思われる）。
一方 **Jauce (`jauce.com/terms`) と FROM JAPAN のブログ (`blog.fromjapan.co.jp`) は
WebFetch で直接取得できた**。

直接 fetch できなかった3社については、**WebSearch が返す検索結果ページのスニペット**
（Google 等がクロールして得たキャッシュに基づく要約）で内容を確認した。
これは「代行が実際に公開している」ことの状況証拠としては十分だが、**このセッション自身が
ページ本文を見て確認したわけではない**——この限界は §5 に記す。

---

## 3. 社ごとの詳細

### Buyee
- URL: `https://faq.buyee.jp/article/131?lang=en`（タイトル「How can I change my package's invoice?」）
- 確認方法: WebSearch のスニペット（直接 fetch は 403）
- 引用: 「invoices are written based on the information published on the original product page, and it will serve as the official document for customs clearance」「the item price on the invoice cannot be edited - it will remain as the same price as when you bought it」
- 該当する問い: **②（過少申告不可）のみ**。①（手数料込みか）・③（個口按分）への言及は見つからなかった。

### Neokyo
- URL: `https://neokyohelp.zendesk.com/hc/en-us/articles/10988086624025-What-is-the-parcel-invoice-breakdown-What-does-it-include`
  および `.../10984075787033-...`
- 確認方法: WebSearch のスニペット（直接 fetch は 403、zendesk のボット対策と思われる）
- 引用: 「Neokyo always encloses a "Pro Forma Invoice" with your parcel...as well as their value. The Pro Forma Invoice does not include the Neokyo service fee.」「Your parcel value cannot be changed」「the edition of the Pro Forma Invoice is at the complete Neokyo discretion」
- 該当する問い: **①（商品代のみ・手数料は含まない、と明言）と②（変更不可）**。
  **5社の中で唯一、F39 の①に直接答えている。**③への言及は見つからなかった。

### ZenMarket
- URL: `https://zenmarket.jp/en/static/frequently-asked-questions`
- 確認方法: WebSearch のスニペット（直接 fetch は 403）
- 引用（要約、原文の逐語引用は取れず）: 「ZenMarket explicitly states in their FAQ that it is not possible to under-declare the value of items in a package」。2022年10月以前は申告額を利用者側で調整できたが、**現在は廃止**（`myfigurecollection.net` のユーザー記録と符合）。
- 該当する問い: **②のみ**。①・③は見つからなかった。**この社だけ逐語引用を直接ページから取れておらず、確度は他社より低い**（WebSearch の要約表現に依存）。

### Jauce
- URL: `https://www.jauce.com/terms`（User Agreement）
- 確認方法: **WebFetch で直接取得**（robots.txt 制限なし）
- 引用（原文ママ）: **「JAUCE describes items with accuracy and transparency. JAUCE does not reduce values on invoices or label items as gifts.」**
- 該当する問い: **②（過少申告・ギフト偽装はしない、と明言）**。①・③への言及は見つからなかった。
- 5社の中で、**このセッションが自分でページ本文を取得して確認できた数少ない例。**

### FROM JAPAN
- URL: `https://blog.fromjapan.co.jp/en/how-to/shipping-from-japan-to-the-u-s-new-customs-rules-and-your-qa.html`
- 確認方法: **WebFetch で直接取得**
- 引用（原文ママ）: **「The invoice value cannot be changed.」**「FROM JAPAN staff will enter the appropriate HS code and invoice description based on the item name... The invoice description and HS code must accurately match the item being shipped.」「If you would like to specify the invoice description or HS code before shipment, please contact Customer Service.」
- 該当する問い: **②のみ**。①・③・ギフト扱いへの明言は見つからなかった。
- 別ページ `www.fromjapan.co.jp/japan/en/help/fee/`・`.../help/logistics/` は本体ドメインが 403 で確認できず（これは `www.fromjapan.co.jp` 本体、上記ブログは別サブドメイン）。

---

## 4. F39 のどこが正しく、どこが誤りか

- **「公表していない」という部分は誤り。** 5社とも、**少なくとも「過少申告・ギフト扱いはしない」**という
  方針を利用規約または FAQ に明記している。これは F39 が言う②の問い（過少申告・ギフト扱いの可否）に
  対する直接の答えであり、しかもマスタの仮説2（ログインの内側にあるとは限らない）を裏づける形で、
  **アカウント作成なしの公開ページから取れた**。
- **F39 が本当に聞きたいのは①（商品代のみか手数料込みか）と③（複数個口の按分）**であり、
  この2点については **Neokyo が①にのみ明言している以外、5社とも公開ページで見つからなかった。**
  つまり、**「5社とも公表していない」を狭く「①と③については5社とも公表を確認できなかった」
  と読み替えれば、その部分は（今回の調査の範囲では）維持できる**——ただし「探したが無かった」
  であって「存在しないと断定できる」わけではない（§5）。
- **F39 の `excluded_reason`／`display_reason` の書き方は、①②③を区別せずに
  「5社とも公表していない」と一括りにしている点が不正確。** 少なくとも②については
  5社とも明言しており、これは「未取得（C）」という評価そのものを揺るがす——
  ②が分かれば「過少申告してくれない＝実額で申告される」という前提で
  免税閾値判定・VATベース計算を進められる可能性がある。

---

## 5. 直すべきこと（このPRでは実施しない。別エージェントが `master/fees.json` を編集中）

1. **F39 を①②③に分解する。** 現状の1行の `excluded_reason` は3つの異なる問いを
   まとめて「非公表」と書いており、②については誤り。
2. **②について `source`/`quote`/`checked_on` を追加する。** 本文書の§3にある5社分の
   引用とURLをそのまま転記できる。
3. **①は Neokyo のみ `source` 付きで記録し、残り4社は「探したが無かった」と明記する**
   （「非公表」と断定しない）。
4. **③（複数個口の按分）は5社とも見つからなかったので、`docs/O3-PLAN.md` のアカウント作成〜
   購入実測に委ねる、という現状の位置づけ（`docs/ROADMAP.md:641`）を維持してよい。**
   ただし「非公表」ではなく「公開ページの範囲では見つからなかった」という書き方に直す。
5. F39 の性質（費目でなく入力）自体は変える必要が無い。②が判明しても①③が未確定なら
   F31・F32・F34・F36 の計算は依然として開始できない、という結論は変わらない。

---

## 6. 自分自身の調査の弱点

- **Buyee・Neokyo・ZenMarket の3社は、このセッションが直接ページ本文を取得できていない。**
  WebFetch がいずれも 403 を返し（Buyee は WAF、zendesk はボット対策と思われる、ZenMarket も同様）、
  `curl` は今回試していない（`docs/audit/o2-courier-webfetch-2026-09-11.md` の記録により、
  この環境の `curl` は代行各社に対して概ね 403 になることが分かっているため省略した——
  この判断自体が検証不足の可能性がある）。**WebSearch のスニペットは検索エンジン側のキャッシュ・
  要約を経由しており、原文の逐語性・最新性を保証しない。** 特にZenMarketは逐語引用ではなく
  要約表現しか得られておらず、他の2社（Buyee・Neokyo）より確度が落ちる。
- **①（手数料込みか）と③（個口按分）について「見つからなかった」のは、
  各社のFAQ・利用規約の一部しか見ていないためである可能性が高い。**
  今回実際に見た（または見ようとした）ページは各社1〜3ページに留まる
  （Buyee: FAQ記事1本／Neokyo: FAQ記事2本／ZenMarket: FAQ一覧ページ1本／
  Jauce: 利用規約1本／FROM JAPAN: ヘルプページ2本・ブログ記事1本）。
  各社のヘルプセンターには数十〜百単位の記事があり、**網羅的に見たとは言えない。**
  特に Buyee の「注文別送（複数個口）」機能そのものの説明ページ（`buyee.jp/helpcenter/guide/shipping`
  等）は検索結果に出たが未確認。
- **US 向け Zonos 前払いについては、この監査では確認していない。**（依頼にあったが、
  リポジトリ内・公開ページとも今回の調査対象に含めきれなかった。）
- **CAPTCHA には遭遇しなかった。ログイン・アカウント作成もしていない。**
- **Neokyo の robots.txt の `Disallow: /*?*` は今回参照した静的パスの記事URLには
  抵触しないが、`neokyo.com` 本体サイト内でクエリ文字列を使う検索・比較ページ等は
  意図的に避けた**（見ていない）。
