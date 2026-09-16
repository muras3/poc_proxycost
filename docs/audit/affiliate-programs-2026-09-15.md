# 代行5社のアフィリエイトプログラム調査（Buyee / ZenMarket / FROM JAPAN / Neokyo / Jauce）

調査日 2026-09-15。オーナー指示で実施した「代行5社に affiliate プログラムがあるか」の
調査結果を記録する。**このPRはドキュメントのみ。`src/` と `master/` は一切変更していない。
コードへの配線もこのPRでは行わない。**

## 結論を先に

**5社すべてに公開型の affiliate プログラムがあるとは確認できなかった。**

| 社 | affiliate の確認 | 扱い |
|---|---|---|
| Buyee | 公式の友達紹介あり（クーポン建て）。通常の affiliate は ASP 掲載を確認。公式申込ページ・広告主規約は未確認 | ASP を使う場合のみ affiliate |
| ZenMarket | 公式 affiliate あり。申込フォーム公開 | affiliate 可能（条件の細部は公表なし） |
| FROM JAPAN | Rakuten LinkShare の広告主掲載あり（第三者データベース経由の確認） | affiliate 可能 |
| Neokyo | 公式申込・ASP 掲載とも確認できず | 素のリンク |
| Jauce | 公式申込・ASP 掲載とも確認できず | 素のリンク |

## 各社の詳細

### Buyee

- 公式の友達紹介制度は**金銭報酬ではなくクーポン**。紹介者は紹介相手の初回購入完了（注文商品が
  Buyee 倉庫に到着した時点）で商品価格10%引きクーポンを受け取る。紹介 URL はマイページから
  発行、紹介相手は**トップページ経由で登録**する。
  出典（一次・Buyee 公式）: https://media.buyee.jp/campaign/refer_a_friend/en/?rc=yshop
- 別途 ASP の Indoleads に CPS 案件: 成果=購入、報酬は具体額非公表（"competitive commissions"）、
  承認保留45日、cookie 30日、deeplink 可、通貨・最低支払額は公表なし、申込は Indoleads
  経由、PPC/クーポン/cashback/incentive は ASP 側案件情報では禁止、開示指定文言は確認できず。
  出典（**第三者・ASP 掲載情報**）: https://indoleads.com/blog/new-offer-launched-buyee-exclusive-affiliate-program/
- **Cuelinks には条件の異なる別案件**: CPC・最大 ₹0.18/クリック、cookie 30分、deeplink 不可、
  cashback 等禁止。出典（**第三者・ASP 掲載情報**）: https://www.cuelinks.com/campaigns/buyee-affiliate-program
- Indoleads と Cuelinks で成果条件（CPS vs CPC）・cookie 期間・deeplink 可否がまったく異なる。
  **したがって「採用する ASP と案件を先に固定しないと条件が確定しない」。** 両方とも
  Buyee 公式ページではなく **ASP 側の掲載情報である**点を明記する。広告主自身の規約文書は
  未確認。
- 出品 URL: 既存の `https://buyee.jp/item/yahoo/auction/{id}` は実在ID 200・架空ID 404 で
  検証済み（`src/lib/pricing/deeplink.ts` 既存記述どおり）。**affiliate ID 付き URL の形式は
  未検証。**

### ZenMarket（唯一、条件がある程度公開されている社）

- 運営: ZenMarket 自社（一次情報）。
  出典: https://zenmarket.jp/en/blog/post/11835/zenmarket-affiliate-program-japan?affid=ZMENLP23&en_linkpage=affiliate
- 申込フォーム（公開）: https://docs.google.com/forms/d/e/1FAIpQLSfiW4quc-KS5ueeXlrJTmzofnl9K-x24SYlDbfixE1WjobCqg/viewform?usp=sf_link
- 成果: 新規登録1件につき最大 ¥150。追加で、紹介ユーザーが購入した商品1個につき最大 ¥50。
- ボーナス: 10人 ¥1,000 / 20人 ¥3,000 / 50人 ¥5,000 / 100人 ¥10,000 / 200人 ¥20,000。
  6か月ごとにリセット。
- 支払: 日本円、本人の ZenMarket アカウントへ。将来的に一定ランク以上なら銀行振込または
  PayPal。月次または条件達成後の請求。**最低支払額は公表なし。**
- 申請は30日以内に連絡がなければ不合格扱い。**成果承認期間は公表なし。cookie 有効期間も
  公表なし。**
- 計測: 個別登録 URL＋紹介コード。**出品ページ用リンクは公表なし。出品 URL に affiliate ID
  を載せられるかも公表なし。**
- 申込に要るもの: 氏名、住所、国、宣伝予定チャネル、チャネル URL、ZenMarket アカウントの
  メールアドレス、申込理由。審査あり（フォロワー・SNS・ブログ等を考慮）。
- **規約本文（Google ドキュメント）は公開 HTML として取得できなかった**:
  https://docs.google.com/document/d/1P_10nvtgFbPX-kcFq3zS1WUM0NNTbDZCMpMyXCFZ-Xk/edit
  ── したがって価格比較・PPC・クーポン・cashback・代理カート構築の可否は**すべて公表なし**。
- 出品 URL: `https://zenmarket.jp/en/auction.aspx?itemCode={id}` は Cloudflare 403 で
  実在ID・架空IDとも検証不能のまま（既存 `src/lib/pricing/deeplink.ts` の記述どおり）。

### FROM JAPAN

- 自社サイトに公開された直接申込ページは確認できず。Rakuten LinkShare に広告主掲載。
  **プログラム ID 50570、開始2024年5月、LinkShare のみ ── これは第三者データベースの情報**:
  https://www.affilitizer.com/programs/fromjapan.co.jp
- 成果条件・報酬・承認期間・cookie・deeplink 設定・個別の最低支払額・通貨: **すべて公表なし**
  （LinkShare 会員画面内の広告主詳細が要る。今回はそこへログインしていない）。
- 公式 cookie policy には一般的な marketing cookie の記載のみで、affiliate cookie の期間・
  パラメータの記載なし: https://corporate.fromjapan.co.jp/en/cookiepolicy.html
- 出品 URL: `https://www.fromjapan.co.jp/japan/en/auction/yahoo/input/{id}` は検証済み
  （実在ID 200・架空ID 404、既存 `deeplink.ts` の記述どおり）。**ただし LinkShare の
  トラッキング URL 経由で出品ページへ直接着地できるかは未検証。**

### Neokyo

公式サイト・FAQ・利用規約・ヘルプセンターを確認したが、affiliate program・紹介制度・
広告主向け申込・ASP 掲載への公式リンクいずれも確認できなかった。報酬条件・計測・cookie・
規約・開示文言・申込条件は**すべて公表なし**。**「affiliate が無い」と断定はできず、
「公式に公開された affiliate 導線を確認できなかった」と書く。**

通常サービスの料金（1件350円のサービス料、45日無料保管）は公開されている:
https://neokyo.com/en/fees

出品 deeplink は Cloudflare 403 で形の正否も判定できていない（既存 `deeplink.ts` のとおり）。

### Jauce

同様に、公式 affiliate・紹介制度・ASP 経由の公開申込ページいずれも確認できなかった。
**すべて公表なし。**

公式のサービス案内は公開されている: https://www.jauce.com/japan_auction_detail

出品 deeplink `https://www.jauce.com/auction/{id}` は検証済み（実在ID 200・架空ID 404、
初回に bot ゲートの確認画面が挟まるが対象出品に着地する。既存 `deeplink.ts` のとおり）。

## 現時点でわかっている帰結（提案。オーナーの決定ではない）

以下は今回の調査結果を踏まえた、**現時点での安全側の扱いの提案**であり、オーナーが決定した
方針ではない。

1. 順位計算は affiliate 情報を一切読まない。
2. Neokyo / Jauce は素のリンク。
3. Buyee / ZenMarket / FROM JAPAN は、申込後に取得した正式リンク形式が分かるまで素のリンク
   または未掲載。
4. `noreferrer` を外す判断は、最終的な計測方式が確定してから行う（現状
   `src/components/compare/ItemList.tsx:238` は `rel="noopener noreferrer"`）。
5. 「代理カート構築」は、各社または ASP から明示的な許可を得るまで affiliate 対象外として
   扱う。

## 見落とされやすい構造的な論点

- **収益化できる社とできない社の非対称が生まれる。** 5社中3社（Buyee / ZenMarket /
  FROM JAPAN）が潜在的に収益化可能、2社（Neokyo・Jauce）は不可。これは順位づけの中立性に
  直接効く利益相反であり、「報酬を順位に反映させない」という規則を**コードを書く前に
  固定する必要がある**という帰結を明記する。

- **我々は価格比較サイトである。** 価格比較サイトの可否は affiliate 規約で最も一般的に
  制限される区分のひとつだが、**3社（Buyee / ZenMarket / FROM JAPAN）すべてについて
  この可否が未確認**である。Buyee は ASP 側の案件情報にこの点の記載を確認できず、
  ZenMarket は規約本文が取得できず、FROM JAPAN は LinkShare 広告主詳細に到達していない。
  **掲載資格そのものが無い可能性が残っている**ことを、独立した未解決の問いとして残す。

- **Buyee の友達紹介はビジネスモデルにならない。** 報酬が「紹介者（＝我々）のアカウントに
  付く10%引きクーポン」であり、利用者に渡す手段が確認できていない。加えて紹介相手は
  **トップページ経由で登録**する必要があり、これは `deeplink.ts` が「トップページに落とす
  のは動線として明確に劣る」として出品直接リンクを選んだ既存の設計判断と衝突する。

- **ZenMarket の計測方式（個別登録 URL＋紹介コード）も、出品への直接リンクと衝突する
  可能性が高い。** 同じ衝突が FROM JAPAN（ASP のリダイレクト方式）にも起こりうる。
  **「出品に直接着地させる」ことと「成果を計測させる」ことが両立するかは、3社とも
  未確認の問い**としてまとめて残す。

- **現時点で画面には代行5社への外部リンクが1本も存在しない。** `grep` で確認した:
  - `DEEP_LINKS` を参照しているのは `src/lib/pricing/deeplink.ts` 自身と、その
    `src/lib/pricing/deeplink.test.ts` のみ。
  - `src/components/` と `src/app/` を5社名（buyee/zenmarket/fromjapan/neokyo/jauce）で
    横断検索すると、`href` として実際に5社ドメインへ張られているのは
    `src/components/compare/FreeShippingDomesticNote.tsx` の `BUYEE_FREE_SHIPPING_SOURCE_URL`
    （Buyee公式ヘルプページ `buyee.jp/helpcenter/guide/fees` への**出典引用リンク**）と、
    `src/app/sources/page.tsx:546` の `ZENMARKET_INVOICE`（`src/app/sources/page.tsx:35` で
    定義されている `https://nyamo.life/archives/zenmarket.html` という**第三者ブログ**への
    リンク）の2件のみ。いずれも「出典としての参照リンク」であり、ユーザーを代行サービスの
    出品ページへ誘導する動線（＝affiliate として計測される可能性のあるリンク）ではない。
  - `item.url`（`src/components/compare/ItemList.tsx:236`、`rel="noopener noreferrer"`）は
    出品元サイト（Yahoo Auctions / Mercari / Rakuten 等、`SiteId` 参照）へのリンクであり、
    代行5社のドメインではない。
  - したがって「代行5社への出品直接リンクは画面上に1本も配線されていない」という前提は
    今回の grep で確認できた。affiliate の配線はゼロから行うことになる。

## 守った制約

- 一次情報（各社公式）と第三者情報（ASP 掲載、第三者データベース）を区別して書いた。
  ASP の掲載情報は広告主自身の規約ではない。Affilitizer は第三者データベースである。
- 未確認のものは「公表なし」「未検証」「確認できなかった」のいずれかで書き、確定として
  書いていない。
- 申込・規約同意・支払い情報の入力は一切行っていない。
