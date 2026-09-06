# proxycost

日本の購入代行 5 社（**Buyee / ZenMarket / Neokyo / FROM JAPAN / Jauce**）で、
商品が**自分の国の玄関に届くまでの総額**を並べて比べる。

対象は既に代行を使っている海外の買い手。「代行とは何か」は書かない。

## 約束すること / しないこと

| | |
|---|---|
| 約束する | **どれが安いか（順位）** と **いくら差が出るか（差額）** |
| 約束しない | **いくら払うか（総額）**。総額の約半分は推論 |

5 点 × ¥3,000 を米国へ送る場合、金額まで確定しているのは総額の 50%。
残りは国内送料・国際送料の推定（40%）と二次情報（10%）。

一方、重量の推定を 1/3〜5 倍に外しても、対応 7 カ国すべてで**順位は 1 つも動かなかった**。
総額だけが −19%〜+85% 動いた。推定の誤差が全社に等しく乗るため。
測定の中身は `docs/DESIGN-NOTES.md`。

だから画面の主役は順位と差額で、総額は概算として添える。

**未取得の数字は「—」と描く。0 とは書かない。**「無料」と「まだ調べていない」は別のことなので。

**順位は総額だけで決める。**報酬を払う社（ZenMarket / Buyee / FROM JAPAN）と
払わない社（Neokyo / Jauce）を画面に書くが、並び順には一切効かせない。
実際、最もよく最安になる Neokyo は我々に何も払わない。

## 動かし方

Node 22 / npm。

```
npm install
npm run dev        # http://localhost:3000
```

キーが無くても動く。キーワード検索だけが無効になり（「URL を貼れ」と表示される）、
商品 URL を貼る道と手入力は使える。検索を使うなら:

```
BRAVE_API_KEY=... npm run dev
```

## テスト

| | |
|---|---|
| `npm run lint` | ESLint（flat config） |
| `npm run typecheck` | `tsc --noEmit`。strict + `noUncheckedIndexedAccess` |
| `npm test` | Vitest。139 件（2026-09-06 時点） |
| `npm run build` | Next のプロダクションビルド |
| `npm run test:e2e` | Playwright（desktop / Pixel 7 の 2 プロジェクト）。**先に `npx playwright install chromium` が要る** |

lint / typecheck / test / build は 2026-09-06 時点で通る（e2e はこの環境では未実行）。
CI（`.github/workflows/ci.yml`）は main 以外の push と PR で lint / typecheck / Vitest /
Playwright を回す。e2e の webServer が本番ビルドを起こすので、ビルドもここで通る。
main への push は `deploy.yml` が同じ検査を通してから Cloudflare へ出す。

## 構成

```
src/lib/pricing/     計算エンジン（UI から独立。ここが本体）
  types.ts           Item / Row / Line / Band / Tier / CompareResult
  services.ts        代行 5 社の料金モデル（各社公式ページの URL つき）
  ems.ts             日本郵便 EMS 公表料金 27 段 × ゾーン
  countries.ts       宛先 7 カ国の関税・VAT・免税限度・課税ベース（FOB / CIF）
  rates.ts           為替（固定値。ライブ取得は障害点なので使わない）
  weights.ts         商品タイトル → 重量ライン → EMS の段
  compare.ts         compare() 一本。総額・内訳・順位・差額・順位の頑健性
src/lib/search/      Brave Search、商品ページ取得、KV キャッシュ、サイト判定
src/lib/ui/          確度 4 段階の見た目（tiers.tsx）と数値整形（format.ts）
src/data/weights.ts  重量表（data/weights/*.json から起こした集計）
src/components/      compare / search / weights / sources / chrome
src/app/             / （計算機） /weights /sources /privacy
data/weights/*.json  カテゴリごとの重量調査の成果物
research/            調査ログ。叩いたドメインを不採用も含めて全部残してある
scripts/             shopify-probe.mjs（重量データの品質判定）
e2e/                 Playwright
docs/                UI-DESIGN.md（UI の決定）/ DESIGN-NOTES.md（測定）
```

デプロイは Cloudflare Workers（`@opennextjs/cloudflare`）。GitHub Actions 経由。
手順は `TODO-USER.md`。

## データの出どころ

| データ | 源 |
|---|---|
| 代行 5 社の料金 | **各社の公式ページのみ。**二次情報は入れない |
| EMS 料金 | 日本郵便の公表料金表（全 27 段） |
| 関税・VAT・免税限度 | 各国税関・政府ページ |
| 商品重量 | 海外発送する日本の小売の公開商品 JSON（Shopify `products.json` の `grams`） |
| 商品価格 | 検索結果は**参考値**、商品ページから取ったものは**確定値**。画面で区別する |

料金は比較記事を信じない。実際に二次情報は ZenMarket について 3 項目とも外していた
（手数料「¥300 一律」→ 実際は 1 点ごと ¥300〜800、入金手数料「1%」→ 3.5%、
国内送料「込み」→ 別途）。
数字の正確さが唯一の価値なので、一次情報だけを入れる。全部 `/sources` に出典 URL つきで出す。

**LLM は使わない。**実行時に外部の推論 API を呼ぶコードは無い。非決定性が致命的なので。

### 重量データの但し書き

Shopify の `grams` は**送料計算用の入力値であって実測ではない**。
店が一律送料・帯別送料を使っていると擬似値になる（カメラ店で全件 1,500 g、
楽器店でギター 180 kg が実在した）。だから `scripts/shopify-probe.mjs` の分布判定
（distinct 比・最頻値シェア・丸い値の比率）で usable / suspect / pseudo を決め、
**pseudo は採らない。**採否は不採用の理由まで `research/weights-*.md` に残してある。

実データが取れたカテゴリと、取れなかったカテゴリは `/weights` に両方書いてある。
**取れていないカテゴリを推定で埋めることはしない。**重量が分からないときは
1 つの総額を押し付けず、EMS の段（500 g / 1 kg / 1.5 kg / 2 kg / 3 kg / 5 kg）ごとに
総額を並べる。段が変わっても順位が動かないなら、それを見出しに書く。

## 今できないこと（正直に）

- **`BRAVE_API_KEY` が無いとキーワード検索は動かない。**この場合は URL を貼る道だけになる。
  キーの取得は `TODO-USER.md`。
- **重量が取れていないカテゴリがある。**楽器・カメラ・書籍・漫画・ゲームは、
  公開カタログに商品ごとの重量を持つ店が見つかっていない。段ごとの総額に落ちる。
- `package.json` の `weights:fetch` / `weights:build` / `fees:check` は**まだ実体が無い**
  （`scripts/` に該当ファイルが無く、実行するとエラーになる）。
  そのため週次の `fees-watch` Action も現状は落ちる。重量表は手で起こしている。
- 為替は固定値。実装日に転記したもので、自動更新しない（利用者は画面で変更できる）。
- 未解決の数字（FROM JAPAN の決済手数料が点ごとか注文ごとか、など）は
  「二次情報」「未確認」の見た目で描き分けている。`REQUIREMENTS.md` §8 に一覧がある。

## 数字が間違っていたら

料金表は変わる。**間違いを見つけたら issue を立ててほしい。**

https://github.com/muras3/poc_proxycost/issues

各社の料金は `src/lib/pricing/services.ts` に出典 URL つきで書いてある。
値を直す PR には、**その社の公式ページの URL と確認日**を添えてほしい。
重量データを足す PR は `node scripts/shopify-probe.mjs <domain>` の出力と、
`research/weights-<category>.md` に叩いたドメインの一覧（不採用も含む）を付けてほしい。
