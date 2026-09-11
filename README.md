# proxycost

日本の購入代行 5 社（**Buyee / ZenMarket / Neokyo / FROM JAPAN / Jauce**）で、
商品が**自分の国の玄関に届くまでの総額**を並べて比べる。

対象は既に代行を使っている海外の買い手。「代行とは何か」は書かない。

## 約束すること / しないこと

| | |
|---|---|
| 約束する | **持っている一次情報の範囲で最も正確な総額**と、それで決まる **順位**・**差額** |
| 約束しない | **実請求と一致すること**／**重量を外しても順位が動かないこと** |

**総額を可能な限り正確に出して順位づけする**、がこのプロダクトの定義。
7 カ国それぞれの 1 位の行を合計したとき、金額のうちどこまでが公表の料金表から
来ているかは次の通り（生成元は `src/app/sources/measured.ts`。手で数字を書かない
——書くとまたずれる）。

<!-- generated:BEGIN measured-basket -->
測定条件：5 点 × ¥3,000・600 g/点・yahoo-auctions、7 カ国それぞれの1位の行の合計 ¥264,209。

| 確度 | 金額 | 割合 |
|---|---:|---:|
| 公表の料金表 | ¥221,703 | 84% |
| 推定 | ¥37,578 | 14% |
| 二次情報 | ¥4,928 | 2% |

国別の公表側の割合：US 84% / GB 86% / DE 81% / FR 84% / AU 88% / CA 84% / SG 79%
<!-- generated:END measured-basket -->

**この集計は以前も README にあったが、手で計算した値だった。**当時は「合計
¥263,981・公表側 84%」と書いており、コードのどこからもその値を再現できなかった
（`CONFIDENCE_SPLIT` は米国 1 カ国の内訳しか測り直しておらず、7 カ国の集計自体は
`measured.ts` に無かった）。今回 `CONFIDENCE_SPLIT_BY_COUNTRY` / `CONFIDENCE_TOTAL`
として測り直しの対象に加えたので、上の数字は当時と少し違う（輸出通関の総額化・
保管料の追加・ZenMarket の確度変更など、この間に入った費目修正の積み重ね）。
以後は費目・為替を直せば `measured.test.ts` 経由でここも自動的に動く。

**実額との一致は約束しない。**代行 5 社の費目を実請求と突き合わせた検証は **0 件**
（`docs/TODO-NEXT.md` §「残っている差分」）。

**順位も重量の推定に対して頑健ではない。**「1/3〜5 倍に外しても順位は 1 つも動かなかった」と
以前ここに書いていたのは 2026-09-06 の再測定で否定された。1 位が入れ替わる重量と、
既定の推定値（5 点 × 600 g）での国別 `rankStable` は次の通り
（米国・¥3,000/点・ヤフオクで測った重量を、現象の見える国に移して確認している。
詳細は `docs/DESIGN-NOTES.md`）。

<!-- generated:BEGIN weight-rank -->
| 点数 | 1 位が入れ替わる重量 |
|---:|---:|
| 2 | 1,150 g |
| 3 | 1,325 g |
| 5 | 1,625 g |

| 国 | `rankStable` | 状態 | 動かない1位 |
|---|---|---|---|
| US | true | 安定 | FROM JAPAN and ZenMarket |
| GB | false | 不安定（重量で変わる） | — |
| DE | false | 不安定（重量で変わる） | — |
| FR | false | 不安定（重量で変わる） | — |
| AU | true | 安定 | Neokyo |
| CA | false | 不安定（重量で変わる） | — |
| SG | true | 安定 | Neokyo |
<!-- generated:END weight-rank -->

半数以上の国で「安定」と言い切れないのは変わらない（4カ国が重量で1位が変わる不安定、
1カ国は上限不明の1位が全社を飲み込んで**どの社が安いか判別できない「判定不能」**——
安定と同じ `true` には潰さない。P1-2、コーディネーター判断3、2026-09-11）ので、
この節の見出しは維持する。だから画面は `rankStable`（と `rankIndeterminate`）をそのまま出す。

**ここには以前「7 カ国すべてで `rankStable=false`」と書いていた。**それは間違いだった。
2026-09-06 の測定以降、Neokyo の国内送料・FROM JAPAN の ¥200・ZenMarket のサイト別費目・
輸出通関の総額化などの修正が重なって値が動いたのに、`rankStable` だけは誰も測り直していなかった
——`CONFIDENCE_SPLIT` や `WEIGHT_SHIFT` のような他の実測値は `src/app/sources/measured.ts` が
`compare()` で測り直してテストで縛っているが、`rankStable` にはその仕掛けが無かったので静かに
ずれた。今回 `RANK_STABILITY`（`src/app/sources/measured.ts`）に7カ国分の実測を載せ、
`measured.test.ts` で縛ったので、以後は料金を直して値が変わると自動的にテストが落ちる。
測定の中身は `docs/DESIGN-NOTES.md`、約束の全文は `REQUIREMENTS.md` §2。

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
| `npm test` | Vitest |
| `python3 master/validate.py` | 費目マスタのスキーマ検証＋実請求の再現 |
| `python3 master/render-docs.py --check` | `docs/MASTER.md` と、この README の生成節（測定値）がマスタ／実測とずれていないか |
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
  ems.ts             日本郵便 EMS 公表料金 42 段（30 kg まで）× 5 ゾーン
  postage.ts         EMS 以外の日本郵便 4 方式（小形包装物・国際小包 × 航空・船便）
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
| 国際送料 | 日本郵便の公表料金表。EMS は全 42 段（30 kg）、他 4 方式は方式ごとの段。**EMS と他方式で地帯の割り方が違う**（米国は EMS 第 4・他方式 第 3） |
| 関税・VAT・免税限度 | 各国税関・政府ページ |
| 商品重量 | 海外発送する日本の小売の公開商品 JSON（Shopify `products.json` の `grams`） |
| 商品価格 | 検索結果は**参考値**、商品ページから取ったものは**確定値**。画面で区別する |

料金は比較記事を信じない。実際に二次情報は ZenMarket について 3 項目とも外していた
（手数料「¥300 一律」→ 実際は 1 点ごと ¥300〜800、入金手数料「1%」→ 3.5%、
国内送料「込み」→ 別途）。
数字の正確さが唯一の価値なので、一次情報だけを入れる。全部 `/sources` に出典 URL つきで出す。

**計算に LLM を使わない。**総額・順位・差額のどの数字も、実行時に推論 API を呼んで決めていない。
非決定性が致命的で、価値の源が数字の正確さなので。**計算エンジンの外側は別**——カート構築の自動化（`docs/FIT-GAP.md` §6）はエージェントとして LLM を使うが、
そこで出た結果がこの計算機の数字に戻ることはない。

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
  公開カタログに商品ごとの重量を持つ店が見つかっていない。計算機は 1,000 g を「仮置き」と
  名乗って入れ、カートの重量欄でその場で直してもらう（docs/UI-DESIGN.md §4）。
- 為替は固定値。実装日に転記したもので、自動更新しない（利用者は画面で変更できる）。
- 未解決の数字は「二次情報」「未確認」の見た目で描き分けている。`REQUIREMENTS.md` §8 に一覧がある。
- **宅配便（FedEx / DHL / UPS 等）を 1 円も価格化していない。**実請求の言及数では発送の約半数が
  宅配便で、その 0% を出していない（理由と塞ぎ方は `docs/COMPLETENESS.md` §6 と `docs/O2-COURIER-RUN.md`）。
- **「大きすぎて送れない」を表現できない。**重量上限しか持たないので、軽くて嵩張る荷物に
  日本郵便が引き受けない方式の値段を付ける（`docs/TODO-NEXT.md` §0b）。
- **費目マスタ（`master/`）と計算エンジンの値を突き合わせる検査が無い。**実際に 3 件ずれている
  （`docs/FIT-GAP.md` §4）。

## 数字が間違っていたら

料金表は変わる。**間違いを見つけたら issue を立ててほしい。**

https://github.com/muras3/poc_proxycost/issues

各社の料金は `src/lib/pricing/services.ts` に出典 URL つきで書いてある。
値を直す PR には、**その社の公式ページの URL と確認日**を添えてほしい。
重量データを足す PR は `node scripts/shopify-probe.mjs <domain>` の出力と、
`research/weights-<category>.md` に叩いたドメインの一覧（不採用も含む）を付けてほしい。
