# 代行業者5社の利用規約調査 — 自動化・アカウント操作・API・料金転記（2026-09-15）

## 目的

代行業者（Buyee, ZenMarket, FROM JAPAN, Neokyo, Jauce）5社の利用規約を対象に、以下4点を確認する。

1. 自動化・ボット・スクレイピングに関する条項
2. アカウント共有・第三者によるアカウント操作に関する条項
3. API の利用条件
4. 料金表の転記・再掲に関する条項

**2026-09-15 に、同じ調査項目を別々の環境で独立に実行した2つの実行（以下「実行A」「実行B」）の結果を統合したものである。**片方だけが取得できた条項が複数あり、本文中に**どちらの実行で取れたか**を必ず明記する。取得日はすべて 2026-09-15。

このタスク自体において、**アカウント作成・ログイン・規約への同意・購入・自動化の実行は一切行っていない**。規約ページの取得と読解のみを行った。

## 総括表

| 社 | 自動化 | アカウント操作 | 備考 |
|---|---|---|---|
| Buyee | 条項なし | **明示的に禁止** | 規約本文は**実行Aだけが取得**（`https://buyee.jp/help/common/terms?lang=en`）。実行Bでは `https://buyee.jp/help/common/terms` が HTTP 403 |
| ZenMarket | 条項なし | 禁止条項なし。**第三者アクセス時の免責あり** | 免責条項は**実行Bだけが発見** |
| FROM JAPAN | 条項なし | **明示的に禁止**（Art. 3.2） | 規約本文は実行A・実行B・本タスクのPlaywright再試行すべてで取得失敗。**オーナーが通常のブラウザで取得した本文を追加コミットで反映**（後述） |
| Neokyo | 条項なし | 条項なし | 両実行で一致 |
| Jauce | 条項なし | **委任・譲渡を禁止** | **実行Bだけが発見** |

### 最終分類（追加コミットで更新）

**第三者によるアカウント操作**
- 明示的に禁止: **Buyee**（Art. 2, 4(2)）／**FROM JAPAN**（Art. 3.2）／**Jauce**（委任・譲渡の禁止） ── **5社中3社**
- 禁止条項なし: ZenMarket（第三者アクセス時の免責のみ）／Neokyo

**自動化・ボット・スクレイピング**
- 明示的に禁止: なし
- 明示的に許可: なし
- 条項が見つからない: **5社すべて**（FROM JAPAN の本文確認により、「確認できなかった」は0社になった。「見つからない」は「禁止されていない」ではない。後述の留保を参照）

## 社ごとの逐語引用

### Buyee

- URL: `https://buyee.jp/help/common/terms?lang=en`（実行Aが取得。2026-09-15、`curl` にブラウザ UA を付けて再確認すると HTTP 200。素の UA では HTTP 403）
- Article 2:
  > "A Member may not loan, transfer, sell, pawn, or allow a third party to use the said Member's membership eligibility."
- Article 4(2):
  > "A Member may not allow his/her Member ID or password to be used by a third party or loan, transfer, sell, or pawn etc. his/her Member ID or password to a third party."
- Article 4(3):
  > "A Member shall be responsible for loss resulting from inadequate management of his/her Member ID and password...Use of the Service with a Member's Member ID and password shall be regarded as use by that Member."
- 自動化・ボット・スクレイピングに関する条項: **該当条項なし**（実行Aの取得範囲内では見つからず）。
- API の利用条件: **該当条項なし。**公開 API としての利用規約・レート制限・商用利用条件を定めた文書は確認できていない。
- 料金表の転記・再掲: **該当条項なし。**

### ZenMarket

- URL: `https://zenmarket.jp/en/responsibility.aspx`（実行Bが取得。2026-09-15、`curl` にブラウザ UA を付けて再確認すると HTTP 200）
  > "We are not responsible for acts of other parties, who with or without your permission accessed your account."
- URL: `https://zenmarket.jp/en/useragreement.aspx`
  > "Some purchases are automated, while others are processed manually during the business hours of ZenMarket's Japanese office."
  >
  > **これは ZenMarket 自身の購入処理の説明であって、利用者側の自動化を許可する条項ではない。**「ZenMarket が自動化していると書いてある」ことと「利用者がこのサービスへのアクセスを自動化してよい」ことは別であり、混同しないこと。
  > "Accounts can be suspended on grounds of actions such as non-payment, disputes initiated through third parties, threats, refusal to verify payment identity, and creating multiple accounts without agreement."
- アカウント共有・第三者操作に関する条項: **明示的な禁止条項は見つからなかった。**ただし上記の「第三者が許可の有無にかかわらずアクセスした行為について ZenMarket は責任を負わない」という免責条項があり、禁止そのものではないが、第三者によるアカウント操作を前提とした免責規定として記録する。
- 自動化・ボット・スクレイピングに関する条項: **該当条項なし。**
- API の利用条件: **該当条項なし。**ZenMarket には一般利用者向けの公式見積画面（`https://zenmarket.jp/en/calc.aspx`）が存在するが、**「公開 API として利用を許諾する」規約が公表されていることは確認できていない。**「一般利用者向けの計算機が公開されていること」と「非公開の内部エンドポイントをプログラムから利用できること」は別の話であり、この区別を明記する。**これは今のプロダクトが既に行っていることであり、将来の懸念ではない。**
- 料金表の転記・再掲: **該当条項なし。**

### FROM JAPAN

- URL: `https://www.fromjapan.co.jp/en/title/serviceRule/`（"Last updated" **April 30, 2026**）
- **取得経路**: この環境からの機械的な取得は、実行A・実行B・本タスクのPlaywright再試行を含めて**3回すべて失敗している**（WebFetch は HTTP 403／`curl` は HTTP 200 だが Vue の SPA でクライアントサイド描画のため本文なし／ヘッドレス Chromium は規約描画に必要なコアリソースが `net::ERR_TOO_MANY_RETRIES` で失敗。詳細は下記「タスク1」節）。**最終的に本文を取得できたのは、オーナーが自身の通常のブラウザで同URLを開き、本文を貼り付けたものである。**この環境の到達性の限界を示す実例として、経緯ごと記録する。
- Article 3.2（アカウント共有の明示的禁止 ── 最重要）:
  > "Members are prohibited from the sharing, lending, transfer, sale, etc. of their membership or ID, etc. to a third party."
- Article 3.3（第三者の不正利用でも会員の責任）:
  > "Upon confirmation of a registered user ID and password, we consider the user of the account to be the owner, and use of the account to be the member's full responsibility. We will not be liable for any losses even in the case of unauthorized use of an ID by a third party. Payment to cover any damages incurred to the member or our company will be the member's responsibility."
- Article 2.3（第三者による代理登録の禁止）:
  > "Users are prohibited from having third parties register to become a member on their behalf."
- Article 5.2（アカウント停止事由）:
  > "Using a user ID for illegal purposes, or having a third party use a member's account for illegal purposes."
  >
  > **この停止事由は「不正な目的での」第三者利用に限定されている点に注意。** Art. 3.2 の包括的な禁止とは適用範囲が異なる。
- Article 12 末尾（第三者を通じた禁止行為）:
  > "Additionally, members are prohibited from taking any action listed above through a third party."
- Article 12 の禁止行為のうち自動化に関係しうるもの:
  > "Intentionally interfering with the business operations of our service, or of a seller's site."
  > "Illegally entering our site server or other computers."
  >
  > **どちらもボット・スクレイピング・自動化を名指ししてはいない。**「自動化がここでいう業務妨害と読まれる余地はある」という指摘はできるが、**それは条文そのものではなく条文の解釈である**ことを明記する。
- Article 17（準拠法・管轄）:
  > "All Terms of Service and individual agreements conform to and will be interpreted in accordance with Japanese law only."
  > "it shall be submitted to the Tokyo District Court or Tokyo Summary Court as the exclusive agreement jurisdictional court of first instance."
  > "The application of the United Nations Convention on Contracts for the International Sale of Goods is expressly excluded."
- 自動化・ボット・スクレイピングに関する条項: 本文全体を確認した上で、**名指しした条項はなし。**「禁止されていない」とは書かない。
- アカウント共有・第三者操作に関する条項: **明示的に禁止**（Article 3.2）。
- API の利用条件: **該当条項なし。**
- 料金表の転記・再掲に関する条項: **該当条項なし。**Article 8 に自社の料金体系についての記載はあるが、これは料金の説明であって、料金表の転記・再掲を制限する条項ではない。
- **Buyee（Art. 4(3)）と FROM JAPAN（Art. 3.3）は、ほぼ同じ構造の条文を持っている**: 「登録済みのIDとパスワードでの利用は会員本人の利用とみなし、第三者による不正利用であっても会社は免責され、損害の負担は会員側」という設計である。この構造は2社共通で、**責任が利用者に降りる**設計であることを指摘しておく。
- FROM JAPAN のフッターには「[Notification Based on the Act on Specified Commercial Transactions](https://www.fromjapan.co.jp/en/title/transactionAct/)」（特定商取引法に基づく表記）へのリンクがある。**日本の代行業者が海外向け英語サービスにおいても特定商取引法に基づく表記を出している実例**であり、Article 17 が準拠法を日本法・専属管轄を東京地裁と定めていることと合わせて、自社の事業者表示のあり方を検討する際の参照点として記録する。

### Neokyo

- URL: `https://neokyo.com/en/term-of-use`（両実行で一致）
  > "Primarily, Neokyo (also referred to herein as "the Service") acts on requests on behalf of Members by bidding on and purchase goods from third party sites, and by sending purchased products to Members via their shipping carrier of choice."
  >
  > **これは Neokyo 自身が代行を行うという説明であり、利用者のアカウントを第三者が操作してよいという許可ではない。**
- 自動化・ボット・スクレイピングに関する条項: **該当条項なし。**
- アカウント共有・第三者操作に関する条項: **該当条項なし。**
- API の利用条件: **該当条項なし。**
- 料金表の転記・再掲: **該当条項なし。**

### Jauce

- URL: `https://www.jauce.com/terms`（実行Bが取得。2026-09-15、`curl` にブラウザ UA を付けて再確認すると HTTP 200）
  > "Users are prohibited from assigning or delegating their rights or obligations under this Agreement."
  > "Users are responsible for maintaining the confidentiality of their login details. Choose a strong password, change it periodically, and avoid sharing it with others."
  > "All content displayed on JAUCE's platform, including, but not limited to, text, graphics, logos, and images, is protected under applicable intellectual property laws. Any unauthorized use, reproduction, or distribution of content from JAUCE's platform is expressly forbidden."
- アカウント共有・第三者操作に関する条項: 「委任・譲渡の禁止」条項があり、ログイン情報を第三者と共有しないよう求める文言もある。**明示的に「第三者によるアカウント操作」という語で書かれているわけではないが、実質的にそれを禁じる方向の条項として記録する。**
- 自動化・ボット・スクレイピングに関する条項: **該当条項なし。**
- API の利用条件: **該当条項なし。**
- 料金表の転記・再掲: **条項なし。**ただしコンテンツ全般（テキスト・図版・ロゴ・画像を含む）の無断使用・複製・配布を禁じる一般的な知的財産条項があり、料金表がこれに含まれるかどうかは条項の文言からは断定できない。

## robots.txt（両実行で一致。各社 HTTP 200、ただし Buyee は実行Aでブラウザ UA を付けて初めて 200、素の UA では 403）

| サイト | 内容 |
|---|---|
| ZenMarket | 言語間の重複 URL のみ Disallow、`Crawl-delay: 5`。商品ページ・見積ページ・API パスの専用指定なし |
| FROM JAPAN | `/japan/tools/`、`/japan/s/`、`/japan/urlOrder/`、各言語の `api/yahoo_recommend*` を Disallow。`Allow: /japan/s/search/ajax/`。`Crawl-delay: 30`（5社中最長） |
| Neokyo | `Disallow: /*?*`（クエリ付き URL 全般）、`*/product/`、`/search-results` を Disallow。Googlebot のみ `*/product/mercari/` を Allow。`Crawl-delay: 10`。5社中最も広範 |
| Jauce | 汎用 UA には管理・内部ディレクトリのみ Disallow。**GoogleOther・Meta-ExternalAgent・FacebookBot・Bytespider は全面 Disallow**（AI 系クローラを名指しで排除している） |
| Buyee | `/api/v1/`、`/internalapi/`、会員専用ページ群を Disallow。出品ページ自体の Disallow は無い（`/mercari/item/description/` のみ例外）。`PetalBot`・`GoogleOther` は全面 Disallow |

## API について

**5社とも、公開 API としての利用規約・レート制限・商用利用条件・結果データの再配布条件を定めた文書は確認できなかった。**

ZenMarket には一般利用者向けの公式見積画面（`https://zenmarket.jp/en/calc.aspx`）があるが、繰り返しになるが、**我々が現在呼んでいる見積 API について「公開 API として利用を許諾する」規約が公表されていることは確認できていない。**「一般利用者向けの計算機が公開されていること」と「非公開の内部エンドポイントをプログラムから利用できること」は別であり、この区別を明記する。**これは今のプロダクトが既にやっていることなので、将来の話ではない。**

## タスク1: FROM JAPAN の利用規約取得（本調査での追加試行、2026-09-15）

### 前提

過去2回の独立調査（本ファイルの統合対象である実行A・実行B）のいずれも、FROM JAPAN の規約本文を取得できなかった。今回はこの1社に絞り、この環境に導入済みの Playwright + Chromium ヘッドレスブラウザで、JS 描画後の DOM からテキストを抽出することを試みた。スクリプトは `/tmp/.../scratchpad/` 配下（このセッションのスクラッチディレクトリ）に置き、リポジトリには一切コミットしていない（CLAUDE.md §5）。

### 試行内容と結果

- `https://www.fromjapan.co.jp/en/title/serviceRule/`
  - Playwright（プロキシ経由・`ignoreHTTPSErrors: true`）で `domcontentloaded` まで到達: **HTTP 200。**
  - JS 描画待ち（最大25秒、複数回ポーリング）後の `document.body.innerText` は、**Cookie バナーの文言のみ**（"This site uses cookies and similar technologies..." 等、171文字）で、規約本文は描画されなかった。
  - ネットワークログを確認すると、規約本文の描画に必要と見られる複数のリソースが `net::ERR_TOO_MANY_RETRIES` で失敗していた:
    - `https://www.fromjapan.co.jp/front/js/chunk-77489eb2.99a88156.js`（アプリ本体のコードチャンクと推測される）
    - `https://www.fromjapan.co.jp/front/css/chunk-vendors.c1503d04.css`
    - `https://www.fromjapan.co.jp/translate/en.txt` および `https://www.fromjapan.co.jp/translate/en_help.txt`（英語版の文言・翻訳データと推測される）
  - **これらの同一 URL を `curl`（同じプロキシ経由、ブラウザ UA、`--cacert` でこの環境の CA バンドルを指定）で個別に取得すると、いずれも HTTP 200 で成功した。** つまり、この環境のプロキシ・宛先サーバ自体はこれらのリソースへの到達を拒否していない。
  - 3回の再試行（プロセスを再起動しての再実行）のうち、1回は Cookie バナー文言のみ（171文字）、1回はそれより短い（本文0文字）結果になり、いずれも規約本文には到達しなかった。サードパーティのトラッカー・広告リクエストを `context.route()` で遮断して再試行したところ、今度は初回のナビゲーション自体が `ERR_TOO_MANY_RETRIES` で失敗した。
  - `--disable-http2` フラグを付けても改善しなかった。
- `https://www.fromjapan.co.jp/en/terms/`
  - 試行によって **HTTP 404**（今回）または以前の報告どおり **HTTP 403** が返るなど、結果が揺れた。いずれにせよ本文は取得できていない。

### 結論（正直な現状）

**この環境からの機械的な取得はすべて失敗した。** FROM JAPAN の利用規約本文は、Playwright での再試行を含め、この環境からは一度も取得できていない。

原因として観測できた事実は以下のとおりである。ここから先を推測で断定しない（CLAUDE.md §9）。

- 単体の `curl` リクエストでは、規約描画に必要とみられる JS/CSS/翻訳データを含め、個別には HTTP 200 で取得できている。
- Chromium（Playwright 経由、この環境のエージェントプロキシを通した接続）で同一ページを開くと、同じ一群のリソースの一部が `net::ERR_TOO_MANY_RETRIES` で失敗し、結果として Vue アプリが規約本文を描画しない。
- この失敗は再現性があるが、失敗するリソースの組み合わせは試行ごとに異なった（ある回は JS チャンクとフォント、別の回は翻訳データと CSS）。
- ネットワークレベルで何が起きているのか（プロキシ側の同時接続数制限か、ヘッドレス Chromium 特有の挙動か、サイト側の何らかの識別によるものか）は、この調査の範囲では特定できていない。技術的な原因を推測で断定することはしない。

**最終的に本文を得られたのは、この環境からの取得ではない。** オーナーが自身の通常のブラウザで同URLを直接開き、本文を貼り付けたものを、上の「FROM JAPAN」節に反映した。**3回の機械的な取得失敗の末に、この環境の外（オーナーの手元のブラウザ）から取得した**という経緯自体を、この環境の到達性の限界の実例として記録しておく。「この環境から取得できない」ことと「規約が存在しない・確認できない」ことは別であり、後者ではなく前者だった。

## 2つの実行で結果が食い違った箇所

均さずに記録する。

1. **Buyee の規約到達性**: 実行Aは `https://buyee.jp/help/common/terms?lang=en`（ブラウザ UA・`lang=en` クエリ付き）で HTTP 200 に到達し、本文を取得できた。実行Bは `https://buyee.jp/help/common/terms`（クエリなし）で HTTP 403 だった。本タスクで両方を `curl` で再確認したところ、素の UA では 403、ブラウザ UA + `lang=en` では 200 だった。**到達性は URL のクエリパラメータや UA、あるいは環境依存であり得る**という実例として記録する。
2. **Jauce の条項発見**: 実行Bだけが `https://www.jauce.com/terms` から「委任・譲渡の禁止」「ログイン情報の管理責任」条項を発見した。実行Aがこの URL に到達しなかったのか、到達したが読み落としたのかは、当時のログが本ファイルの統合元には残っていないため判別できない。
3. **ZenMarket の第三者アクセス免責条項**: 実行Bだけが `https://zenmarket.jp/en/responsibility.aspx` を発見・取得した。実行Aがこの URL を確認していない可能性が高いが、断定はしない。

## 必ず記載する留保

- **「条項が見つからない」は「禁止されていない」ではない。** 5社とも、規約に明文が無いことが、不正アクセス禁止法や規約の一般条項（信義則条項、包括的な禁止事項の拡張解釈など）によって禁止と評価される可能性は、この調査の範囲外である。この調査は「明文で何が書かれているか」のみを確認したものであり、法的な許諾の有無を判定するものではない。

## 設計への含意（コーディネーターの読みであり、法的判断ではない）

上記の逐語引用から読み取れる範囲では、禁じられているのは「第三者が利用者のアカウントを使うこと」であって、自動化や AI そのものを名指しで禁じている条項は5社中どこにも見つかっていない。この読みに基づくと:

- **(A) サーバ側のヘッドレスブラウザが利用者のセッション（ログイン済みアカウント）を操作する設計**は、**5社中3社**（Buyee: Article 2・4(2)、FROM JAPAN: Article 3.2、Jauce: 委任・譲渡の禁止、ログイン情報共有の禁止）の文言に触れる可能性がある。行為の主体が「利用者本人」ではなく「利用者に代わって動くサーバ側のプロセス」になるため。**残る2社（ZenMarket・Neokyo）は明文の禁止条項が無いだけであり、許可されているわけではない**（前述の留保のとおり）。
- **(B) 利用者自身のブラウザ上で動く設計（ブラウザ拡張機能等）**であれば、行為者が利用者本人のまま変わらないため、文言上は (A) と同じ形では抵触しない可能性がある。
- FROM JAPAN の本文確認により、この2択の判断材料が5社中3社（過半数）で「明文で禁止」に固まった。**したがって、サーバ側から利用者のアカウントを操作する設計を採る余地は、5社中3社について明文上ない。**残り2社も「許可されている」という積極的な根拠は無いため、実質的には (B) の利用者自身のブラウザ上で動く設計を軸に検討するのが妥当と考えられる。

**この区別はあくまでコーディネーターによる規約文言の読み方であり、法的な判断や助言ではない。**実際の設計判断の前には、必要に応じて法務的な確認を別途行うべきものとして扱う。

## 完了条件チェック

- ブランチ `claude/proxy-tos-survey-2026-09-15` を作成し、コミット・push 済み（後述の PR 参照）。
- `git diff --stat` で本ファイル（`docs/audit/proxy-tos-automation-2026-09-15.md`）のみが変更対象であることを確認済み。
- 一時ファイル（Playwright 実行スクリプト、取得結果 JSON）はすべてスクラッチディレクトリに置き、リポジトリにはコミットしていない。
