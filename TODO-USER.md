# 本人がやること

最終更新 2026-09-07。Claude 側の作業は含まない。

## 今すぐ（審査待ちが長いので、着手が遅れるほど公開が遅れる）

- [ ] **Skimlinks に登録** — https://hub.skimlinks.com/signup
      登録後、管理画面で `buyee` を検索してプログラムに申請する。
      **ASP の審査 → 広告主の承認、と二段階あるので一番時間がかかる。**
- [ ] **Sovrn Commerce に登録** — https://www.sovrn.com/commerce/
      FROM JAPAN のプログラムはここにある：
      https://commerce.sovrn.com/merchants/10274/fromjapan.co.jp-affiliate-program
      Sovrn は米国企業なので **W-8BEN（非居住者の税務書類）の提出**を求められる可能性がある。
- [ ] **Brave Search API のキーを取得** — https://brave.com/search/api/
      **無料プランは無く、カード登録が必要。**月 $5 のクレジットが自動付与され、
      $5 / 1,000 requests。実装フェーズ2で必要になる。
- [ ] **Brave に問い合わせる：$5/1,000 の Search プランに storage rights が含まれるか**
      公式FAQ に「結果を保存するには storage rights を明示的に付与するプランが必要」とあり、
      Search プランに含まれるかは明記が無い。**含まれないと検索結果をキャッシュできず、
      1検索ごとに必ず課金される。**設計に直結するので早めに。

申請時の説明文（コピペ用）:

```
A Japanese proxy-buying cost comparison tool. It calculates the total landed cost —
item price, proxy fees, domestic and international shipping, duty and VAT — across
Buyee, ZenMarket, Neokyo, FROM JAPAN and Jauce, and shows which is cheapest for a
given cart. Ranked by total cost only. Currently in development; launching on Cloudflare.
```

サイトURLを求められたら `https://github.com/muras3/poc_proxycost` を出す。

## 判断が要る（2026-09-07 の検索の実測から。根拠は `docs/audit/search-reality.md`）

- [ ] **検索から価格を出す道をどうするか。**Brave は価格を返さない（55 クエリ
      1,090 件で 0 件）。候補を選んだ瞬間に `/api/product` を1回だけ叩いて
      確定価格に置き換える案があるが、**価格が取れるサイトは実測で 10/32 件**で、
      Amazon（候補の 40%）は取れない。1クリックごとに外部サイトへ1往復する。
      → 選択肢と費用は報告に整理済み。
- [ ] **Amazon の商品ページを UA を偽ってでも取りに行くか。**
      いまの UA `proxycost/0.1` には bot 判定ページしか返らない。
      **偽ると robots を尊重する現在の方針と矛盾する。**
- [ ] **Brave の追加課金を使うか。**`offset` を 1 増やすごとに +$0.005。
      一覧ページを除いたあと 1 クエリあたり中央値 12 件（55 クエリ中 2 件は 0 件）。
      20 件に戻したいなら 2 ページ目を取る＝1 検索あたり $0.010 になる。
- [ ] **検索対象サイトを入れ替えるか。**代行5社の対応サイト一覧は
      `npm run sites:fetch` で機械取得できるようにした（`data/proxy-sites.json`）。
      **足すには `SiteId` の追加と、5社それぞれのそのサイトでの料率の一次情報が要る。**

## いつでも（審査なし）

- [ ] **ZenMarket のアフィリエイトに登録し、現行の報酬額を確認する**
      https://zenmarket.jp/ja/profile/ の左メニュー「アフィリエイト」
      （`/en/affiliate.aspx` は Claude からは 403 で見えない）
      **持っている情報は「¥100/登録」だが 2016 年のソース。**現行が定額か率かで
      収益の見積もりが変わる。

## デプロイ（Cloudflare Workers）

**Cloudflare のダッシュボードで GitHub リポジトリを接続する方式はやめた。**
`cloudflare-api` の MCP は OAuth 認可が必要で、非対話セッションからは認可できなかったため、
**デプロイは GitHub Actions（`.github/workflows/deploy.yml`）から行う。**
main への push と手動実行（workflow_dispatch）で、lint → typecheck → test → e2e →
`opennextjs-cloudflare build` → `wrangler deploy` が走る。

> **トークンや API キーの実値を、この会話・issue・PR・リポジトリ内のファイルに書かないこと。**
> 置き場所は GitHub の Secrets と Cloudflare の Worker Secret だけ。
> 一度でもリポジトリに入れたら、そのトークンは失効させて作り直す。

### 1. Cloudflare で API トークンを作る

https://dash.cloudflare.com/profile/api-tokens → **Create Token** → Custom token。
権限は 3 つだけ。これ以上与えない。

| 種別 | 対象 | 権限 |
|---|---|---|
| Account | Workers Scripts | **Edit** |
| Account | Workers KV Storage | **Edit** |
| Account | Account Settings | **Read** |

Account Resources は対象のアカウントだけに絞る。
**表示されるトークン文字列はこの画面でしか見られない。**そのまま次の手順へ運ぶ。

アカウント ID も控える（ダッシュボードの Workers & Pages 画面の右側、または
`https://dash.cloudflare.com/<ここがアカウントID>/...` の URL から読める）。

### 2. GitHub に Secrets を登録する

リポジトリの **Settings → Secrets and variables → Actions → New repository secret**。

| 名前 | 中身 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | 手順 1 で作ったトークン |
| `CLOUDFLARE_ACCOUNT_ID` | アカウント ID |

名前はこの 2 つで固定（`deploy.yml` がこの名前で読む）。

### 3. KV 名前空間を作り、wrangler.jsonc の id を差し替える

検索結果と商品ページのキャッシュに使う。**id を入れるまでデプロイは通らない。**

```
npx wrangler login                          # またはローカルで CLOUDFLARE_API_TOKEN を渡す
npx wrangler kv namespace create CACHE
```

出力に `id = "..."` が出るので、`wrangler.jsonc` の

```
{ "binding": "CACHE", "id": "PLACEHOLDER_REPLACE_ME" }
```

の `PLACEHOLDER_REPLACE_ME` をその id に差し替えて commit する。
**KV の id は秘密ではない**ので、これはリポジトリに入れてよい。

### 4. Brave のキーを Worker Secret に入れる

`BRAVE_API_KEY` は**リポジトリにも GitHub Secrets にも置かない。**
Cloudflare 側の Worker Secret に直接入れる（`deploy.yml` は触らない）。

```
npx wrangler secret put BRAVE_API_KEY
```

対話で値を貼る。**Worker が一度もデプロイされていないと置き場所が無い**ので、
先に main へ push して deploy を 1 回通してから実行する。

キーが無い状態でもサイトは動く。**キーワード検索だけが無効になり、
「URL を貼れ」と表示される。**商品 URL を貼る道と手入力はそのまま使える。

### 5. 確認

GitHub の Actions タブで `deploy` が緑になり、Cloudflare の Workers & Pages に
`proxycost` が出ていること。以降は main に push するたびに自動で出る。

- [ ] API トークンを作った
- [ ] GitHub に `CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` を登録した
- [ ] KV を作り `wrangler.jsonc` の id を差し替えた
- [ ] `wrangler secret put BRAVE_API_KEY` を入れた

## 公開の直前・直後

- [ ] **ドメインを取得**
      候補: `proxycost` / `landedjp` / `japanlanded` / `finalprice` / `proxytotal`
      **Cloudflare Registrar で取れば DNS 設定が不要。**
      ※ Claude の環境からは DNS が引けないため、空き状況は未確認。
      取った後、Workers の `proxycost` に **Custom Domain** として紐づける
      （ダッシュボードの Worker → Settings → Domains & Routes）。
- [ ] **GitHub の issue テンプレートを用意し、Twitter アカウントを窓口として明記**
      「数字が間違っていたら教えてほしい」の受け皿。画面のフッターから貼る。
- [ ] **AdSense を申請** — https://adsense.google.com/start/
      **サイト公開後。中身が無いと落ちる。**
      公式の審査期間: *"usually takes a few days, but in some cases it can take 2-4 weeks"*
      要件: 18歳以上／独自で読者を集める内容／サイトの所有／ポリシー遵守。
      **公開する重量表（実データ・出典つき）が「独自コンテンツ」の材料になる。**

## 会社は不要

AdSense・Skimlinks・Sovrn・Brave・ZenMarket いずれも個人で登録できる。
日本側は開業届も必須ではなく、雑所得として申告できる。
※ 税務は税理士ではないため、金額が出てきたら確認すること。
