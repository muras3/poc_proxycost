# 本人がやること

最終更新 2026-09-06。Claude 側の作業は含まない。

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
Buyee, ZenMarket, Neokyo and FROM JAPAN, and shows which is cheapest for a given
cart. Ranked by total cost only. Currently in development; launching on Cloudflare.
```

サイトURLを求められたら `https://github.com/muras3/poc_proxycost` を出す。

## いつでも（審査なし）

- [ ] **ZenMarket のアフィリエイトに登録し、現行の報酬額を確認する**
      https://zenmarket.jp/ja/profile/ の左メニュー「アフィリエイト」
      （`/en/affiliate.aspx` は Claude からは 403 で見えない）
      **持っている情報は「¥100/登録」だが 2016 年のソース。**現行が定額か率かで
      収益の見積もりが変わる。

## 実装が始まったら

- [ ] **Cloudflare に GitHub リポジトリを接続** — https://dash.cloudflare.com/
      **Workers で接続する。Pages ではない。**（`@opennextjs/cloudflare` を使うため）

## 公開の直前・直後

- [ ] **ドメインを取得**
      候補: `proxycost` / `landedjp` / `japanlanded` / `finalprice` / `proxytotal`
      **Cloudflare Registrar で取れば DNS 設定が不要。**
      ※ Claude の環境からは DNS が引けないため、空き状況は未確認。
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
