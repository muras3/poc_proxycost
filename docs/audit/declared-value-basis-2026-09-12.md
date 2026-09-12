# F39a・F39c 深掘り監査 — 課税ベースと複数個口の按分（2026-09-12）

`docs/audit/declared-value-2026-09-12.md`（前回監査）の続き。今回はF39aとF39cの2問だけを、
各社の公開ページをより広く見て確認する。**本文書は監査のみ。`master/` は一切変更していない。**

---

## 0. 結論を先に

| # | 問い | Buyee | Neokyo | ZenMarket | Jauce | FROM JAPAN |
|---|---|---|---|---|---|---|
| **F39a** | 商品代のみか手数料込みか | 未取得 | **取得済み（前回どおり）** | 未取得 | 未取得 | 未取得 |
| **F39c** | 複数個口の按分 | 未取得 | 未取得 | 未取得 | 未取得 | 未取得 |

**F39aはNeokyoの1社のみ、今回も追加は無かった。F39cは5社とも公開ページで見つからなかった。**
ただし「見つからなかった」の中身は社によって調査の深さが違う（後述）。**今回新たに、
Buyee利用規約に①寄りの記述（下記）とJauceのFAQ記事の逐語引用が取れた**が、いずれも
F39a・F39cの直接の答えにはなっていない。

**前回の監査と食い違う記述は見つからなかった。**（止まる条件には該当しない。）

---

## 1. 到達性（今回の追加分）

| URL種別 | 結果 |
|---|---|
| `neokyohelp.zendesk.com/...`（記事直接） | 今回もWebFetch/`curl`とも403（Cloudflareチャレンジページ）。前回と同じ |
| `neokyo.com/en/faq`, `/en/shipping` | WebFetchで直接取得**できた**（本体ドメインは403にならない。zendeskサブドメインだけ403） |
| `faq.buyee.jp/article/131?lang=en` | 今回もWebFetch 403（前回と同じ） |
| `buyee.jp/helpcenter/guide/*`, `buyee.jp/help/common/terms` | WebFetchで直接取得**できた**（`buyee.jp`本体は403にならず、`faq.buyee.jp`サブドメインだけWAFが強い） |
| `zenmarket.jp/en/static/frequently-asked-questions`, `zenmarket.jp/fees.aspx` | 今回もWebFetch 403（前回と同じ） |
| `jauce.com/help/*`（knowledgebase） | WebFetchで直接取得**できた**（`terms`ページと同様、jauce.comは制限が緩い） |
| `blog.fromjapan.co.jp/...`, `support.fromjapan.co.jp/...` | WebFetchで直接取得**できた** |
| `web.archive.org/...` | **このセッションのWebFetchはweb.archive.orgに到達不可**（ツール自体が明示的に拒否した。403ではなくツール制限） |

**分かったこと: 各社とも「本体ドメイン」と「ヘルプ専用サブドメイン（zendesk・faq.buyee.jp）」で
到達性が違う。** Neokyo/Buyeeは本体ドメインの静的ページはWebFetchで読めるが、ヘルプ記事は
別サブドメインでボット対策が強く読めない。ZenMarketは両方とも読めなかった。

robots.txtは前回確認済みのものをそのまま踏襲し、`Disallow: /*?*`（Neokyo）に該当する
クエリ文字列付きURLは今回も参照していない。

---

## 2. F39a: 課税ベース（商品代のみか、手数料込みか）

### Neokyo — **取得済み（前回と同一の結論、追加情報なし）**
- 前回引用のとおり: "the Pro Forma Invoice does not include the Neokyo service fee"
- 今回`neokyo.com/en/faq`と`neokyo.com/en/shipping`を直接取得して確認したが、
  ①に関する追加の記述は無かった（②③寄りの内容のみ）。
- 確認方法: 前回はWebSearchスニペット経由。**今回はページ本体を直接読めていない**
  （zendesk記事はWebFetch/`curl`とも403のまま）。**逐語引用は前回のスニペット由来のまま、
  今回このセッションが原文を目視で確認したわけではない**——この点は前回から状況が変わっていない。

### Buyee — **未取得。ただし関連する新しい逐語引用を1件取得**
- URL: `https://buyee.jp/help/common/terms?lang=en`（利用規約、直接WebFetchで取得・逐語）
- 引用（逐語）: **「the Company shall not bear any responsibility whatsoever for information relating to export and import, such as the product name, product price and product quantity etc. written on the invoice」**
- この記述は「インボイスに何を書くか」の**責任の所在**を述べているだけで、
  **①（商品代のみか手数料込みか）には直接答えていない。** F39aの答えではない。
- `buyee.jp/helpcenter/guide/fees?lang=en`（配送・手数料ガイド、逐語で直接取得）にも
  ①に該当する記述は無かった。関連する記述は通関手数料（2,800円、EMS等で申告額20万円超の場合）の
  みで、インボイス記載額の構成には触れていない。
- `faq.buyee.jp/article/131?lang=en`（前回の一次情報）は今回も直接取得できず（403）。

### ZenMarket — **未取得**
- `zenmarket.jp/en/static/frequently-asked-questions`・`zenmarket.jp/fees.aspx`とも
  今回もWebFetch 403。**このセッションは一度もZenMarketの本文を直接読めていない**
  （前回・今回ともWebSearchのスニペットに依存）。①に該当する記述はスニペットにも見当たらなかった。

### Jauce — **未取得**
- `jauce.com/help/knowledgebase.php?category=4`（Shipments & Handling、逐語で直接取得）を見たが、
  該当記事9本のタイトルはいずれも①に触れていない（「Do you ship anywhere」「storage fee」
  「lithium batteries」「food」「low price on invoice / gift」等）。
- `jauce.com/help/knowledgebase.php?article=36`（「Can you put a low price on my invoice and mark
  the item as a gift?」、逐語で直接取得）
  引用（逐語）: **「Jauce respects and abides by the law, and we will record the actual values of
  your items on invoices and describe them accurately.」**
  → これは②（過少申告不可）の再確認であり、①には答えていない。
- `jauce.com/terms`（前回取得済み）にも①の記述は無い。

### FROM JAPAN — **未取得**
- `support.fromjapan.co.jp/en/support/solutions/folders/154000749684`
  （"US Custom, DDU, DDP Information" フォルダ）配下の記事5本を全て直接取得（逐語）:
  - `.../154000235430-us-customs-latest-`
  - `.../154000236327-understanding-the-difference-between-ddu-and-ddp`
  - `.../154000236329-how-to-pay-for-fedex-ups-dhl-import-duties-and-fees-usa-only-`
  （`154000248394`＝DDP Service Update、`154000255496`＝CPSC Import Requirementsはタイトルのみ確認、本文未取得）
  いずれにも①（インボイス記載額の構成）への言及は無かった。
  唯一の関連記述（逐語）: **「Whether duties and customs fees are charged, as well as the amount,
  is determined by the nature and value of the goods and by U.S. Customs.」**
  ——これは関税の課税判断基準の話で、①の答えではない。
- 上記記事内で「What is included in "Import Duties and Fees" and how is it calculated?」という
  タイトルの関連記事が言及されていたが、**URLを特定できず本文を取得できなかった**
  （site内検索・WebSearchとも該当ページのURLを返さなかった）。**これは「探したが無かった」ではなく
  「存在は示唆されたが到達できなかった」に分類する。**
- `blog.fromjapan.co.jp/en/how-to/shipping-from-japan-to-the-u-s-new-customs-rules-and-your-qa.html`
  （前回の一次情報）は今回も再確認したが、①に該当する追加記述は無かった。

---

## 3. F39c: 複数個口に分けたときの按分

**5社とも、公開ページで直接の答えは見つからなかった。** 見た場所を社ごとに記録する。

### Buyee
- `buyee.jp/helpcenter/guide/consolidate?lang=en`（Package Consolidation Service、逐語で直接取得）
  引用（逐語、按分そのものではないが関連）: **「Customs duty is calculated according to the value
  of the package. ... By grouping items together, you may incur additional or increased customs
  charges.」**「If the total value of the same customer's packages scheduled to be shipped on the
  same day exceeds 200,000 yen, Buyee will postpone the shipping of some of the packages...」
  → **これは「まとめる（統合）」場合の話であり、依頼が聞いている「1注文が複数荷物に分かれた
  ときの按分」の逆方向。** Buyeeのこのページは統合サービスの説明で、**分割時に各荷物へ
  いくら申告するかには触れていない。**
- `buyee.jp/helpcenter/guide/shipping?lang=en`（逐語で直接取得）にも按分の記述は無かった。
- **Buyeeは「注文ごとに別送」が既定だが、それを直接説明するページ
  （依頼文が触れている`buyee.jp/helpcenter/guide/shipping`相当）を見ても、
  複数梱包時の申告額の決め方は書かれていなかった。** より深いFAQ個別記事
  （`faq.buyee.jp`配下）は403で到達できておらず、**そこに答えがある可能性は排除できない。**

### Neokyo
- `neokyo.com/en/shipping`（逐語で直接取得）: DDP関税（15.5%、米国向け）や豪州・EUの関税制度の
  説明はあったが、**1回の購入が複数パーセルに分かれた場合の各パーセルの申告額には触れていない。**
- `neokyohelp.zendesk.com`配下の記事本文（前回・今回とも403）に、
  「if you wish to modify a package content... packing fee shall be applied again」という
  **梱包後の分割・変更に関する記述がWebSearchのスニペットに現れた**が、これは
  **要約であり逐語ではない**。また内容も「分割すると梱包料が再度かかる」という料金の話で、
  **各パーセルへの申告額の割り振り方には触れていない。**
- 結論: **Neokyoも③は公開ページで見つからなかった。**

### ZenMarket
- 到達できたページが無い（§1参照）。WebSearchのスニペットにも③に該当する記述は現れなかった。
- **ZenMarketは③についても①同様、このセッションが本文を一度も読めていない。**

### Jauce
- `jauce.com/help/knowledgebase.php?category=4`の記事一覧（9本、上記§2に列挙）を全件確認したが、
  複数パーセル・分割配送に関するタイトルの記事は無かった。
- 他のカテゴリ（`category=2`＝Auctions等）は今回は見ていない
  （**探していない**、③に絞ったため——次回の課題として§5に記す）。

### FROM JAPAN
- `support.fromjapan.co.jp`の"US Custom, DDU, DDP"フォルダ5記事、`blog.fromjapan.co.jp`の
  該当記事、いずれにも③に該当する記述は無かった。
- FROM JAPANのヘルプセンターには他にも多数のフォルダがあると見られるが、
  **③に直接関係しそうなフォルダ名（配送・梱包関連）を特定できておらず、今回は見ていない。**

---

## 4. 見たページの一覧（今回のセッション分。前回分は前回の文書を参照）

**直接取得できた（逐語）:**
- `https://neokyo.com/en/faq`
- `https://neokyo.com/en/shipping`
- `https://buyee.jp/helpcenter/guide/consolidate?lang=en`
- `https://buyee.jp/helpcenter/guide/shipping?lang=en`
- `https://buyee.jp/helpcenter/guide/fees?lang=en`
- `https://buyee.jp/help/common/terms?lang=en`
- `https://www.jauce.com/help/knowledgebase.php?category=4`
- `https://www.jauce.com/help/knowledgebase.php?article=36`
- `http://www.jauce.com/help/`（記事タイトル一覧のみ、本文なし）
- `https://blog.fromjapan.co.jp/en/how-to/shipping-from-japan-to-the-u-s-new-customs-rules-and-your-qa.html`（再確認）
- `https://support.fromjapan.co.jp/en/support/solutions/folders/154000749684`
- `https://support.fromjapan.co.jp/en/support/solutions/articles/154000235430-us-customs-latest-`
- `https://support.fromjapan.co.jp/en/support/solutions/articles/154000236327-understanding-the-difference-between-ddu-and-ddp`
- `https://support.fromjapan.co.jp/en/support/solutions/articles/154000236329-how-to-pay-for-fedex-ups-dhl-import-duties-and-fees-usa-only-`
- `https://support.fromjapan.co.jp/en/support/home`

**到達できなかった（403等）:**
- `https://neokyohelp.zendesk.com/hc/en-us/articles/10988086624025-...`（WebFetch 403、`curl`もCloudflareチャレンジで403）
- `https://faq.buyee.jp/article/131?lang=en`（WebFetch 403）
- `https://zenmarket.jp/en/static/frequently-asked-questions`（WebFetch 403）
- `https://zenmarket.jp/fees.aspx`（WebFetch 403）
- `https://support.fromjapan.co.jp/en/support/solutions/154000000000`（URL推測、404）
- `https://web.archive.org/web/2026/https://faq.buyee.jp/article/131?lang=en`（ツール自体が拒否、403ではない）

**要約のみ取得（WebSearchスニペット経由、逐語ではない）:**
- Neokyo zendesk記事2本（前回と同一URL、今回も本文は取れず）
- ZenMarket FAQ・fees（前回と同一）
- Buyee `faq.buyee.jp/article/131`（前回と同一の引用を再確認、今回の新規取得ではない）

---

## 5. 結論: 公開ページで解けるか、アカウントが要るか（社ごと）

| 社 | F39a | F39c | 結論 |
|---|---|---|---|
| **Neokyo** | **公開ページで解決済み**（前回のスニペット由来の逐語引用のみ、原文未確認のまま） | **公開ページの範囲では見つからず** | ①は現状の引用で運用可。③は`docs/O3-PLAN.md`のアカウント作成〜実測に委ねるほかない |
| **Buyee** | 未取得 | 未取得 | `faq.buyee.jp`が一貫して403。**`docs/O3-PLAN.md`のアカウント作成・実注文フェーズが必要**（特に③は複数個口サービスの実物確認が要る） |
| **ZenMarket** | 未取得 | 未取得 | **このセッションは公開ページ本文を一度も直接読めていない**（403一貫）。「公開ページに無い」と断定する根拠が無い——**到達できなかった**が正確な記録。`docs/O3-PLAN.md`のアカウント作成が必要 |
| **Jauce** | 未取得（関連FAQ9本を全件確認したが該当なし） | 未取得（同上） | Shipments&Handlingカテゴリは網羅したが他カテゴリ未確認。それでも見つからなければ`docs/O3-PLAN.md`のアカウント作成が必要 |
| **FROM JAPAN** | 未取得（関連記事群を確認したが該当なし。1記事はURL特定できず未到達） | 未取得 | `docs/O3-PLAN.md`のアカウント作成、または`support.fromjapan.co.jp`のサイト内検索機能（今回試していない）を先に試す余地あり |

**総括: F39aは前回同様Neokyoの1社のみ。F39cは5社ともゼロのまま。**
今回の追加調査で「①②③のうち②だけが公開されている」という前回の見立てが再確認された形になる。
**「探したが無かった」であって、5社全部について「存在しないと断定できる」わけではない**
（特にBuyee・ZenMarketは主要ヘルプページ自体に到達できていない）。

---

## 6. 自分自身の調査の弱点

1. **Buyee・ZenMarketのヘルプ本体（`faq.buyee.jp`・`zenmarket.jp/en/static/...`）に
   このセッションは一度も到達できていない。** WebFetchは一貫して403、`curl`もNeokyoのzendeskで
   Cloudflareチャレンジページを返しており、この環境のネットワーク経路では
   これらのサブドメインに到達する手段が今回は見つからなかった。**「見つからなかった」の
   相当部分は「探す場所に到達できなかった」であり、内容が無いことの証明にはならない。**
2. **`web.archive.org`はこのセッションのWebFetchが明示的に拒否するため、
   到達不能ページの代替経路として使えなかった。**（403のページのアーカイブ版を見る、
   という手段が今回は封じられていた。）
3. **FROM JAPANの「What is included in "Import Duties and Fees" and how is it calculated?」
   というタイトルの記事は、存在が示唆されながらURLを特定できず本文を取得できなかった。**
   タイトルからすると①に最も近い可能性がある記事であり、**これが今回最大の心残り**。
   `support.fromjapan.co.jp`にはサイト内検索機能があると思われるが、今回は試していない
   （WebFetchはJavaScript実行を伴う検索フォームの操作ができないため）。
4. **Jauceは`category=4`（Shipments & Handling）のみ全件確認し、他のカテゴリ
   （`category=2`＝Auctions等、他にも未確認のカテゴリがある可能性）は見ていない。**
   ③に関係しそうなカテゴリを網羅していない。
5. **Neokyoの①（F39a）は、今回も前回同様「WebSearchのスニペット」に依存したままで、
   このセッションが原文ページを直接見て確認したことは一度も無い。**
   zendeskサブドメインへの到達性が改善されない限り、この状態は変わらない。
6. **CAPTCHAには遭遇しなかった。ログイン・アカウント作成もしていない。**
   robots.txtの`Disallow: /*?*`（Neokyo）に該当するURLは意図的に避けた。
7. **5社とも、ヘルプセンター全体のインデックス（サイトマップ・全記事一覧）を
   網羅的に列挙していない。** 個別に見つかったフォルダ・カテゴリの中だけを見ており、
   依頼文にある「体系的に」を完全には達成できていない——特にBuyeeとZenMarketは
   そもそも一覧ページ自体に到達できていないため、体系的な探索が構造的に不可能だった。
