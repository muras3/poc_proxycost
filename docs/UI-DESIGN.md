# UI 設計

最終更新 2026-09-06。実装はしない。決定と根拠だけを残す。
前提は REQUIREMENTS.md §1〜2、根拠は docs/DESIGN-NOTES.md §1。

UI の文言は英語（利用者は Reddit から来る海外の買い手。現素案 index.html も英語）。
本書の画面例は英語のまま書く。

---

## 0. 全体方針（1行ずつ）

| | |
|---|---|
| 主役 | 順位と差額。総額は「概算」として添える |
| 画面数 | 3。`/`（入力→結果、1画面）、`/weights`（重量表）、`/sources`（料金・EMS・税の出典） |
| 比較の行 | 「会社 × 小包状態」。Buyee は `n ≥ 2` で consolidated / default の2行 → 最大6行 |
| 並び | 総額の昇順のみ。報酬は参照しない。各行に「払う／払わない」を書く |
| モバイル | 順位リスト＋行ごとの展開（最安との2列比較）。横スクロール表は使わない |
| デスクトップ（`lg` 以上） | 順位リストの下に 費目×会社 の全表。列順＝順位 |
| 確度 | 確定／推定／二次／未取得 の4段階。色だけに頼らず記号・線種を併用 |
| 広告 | 結果ブロックの下に1枠だけ。「順位と無関係」を枠に書く |

---

## 1. 強調の反転 — 順位と差額を主役にする

**決めたこと**

- 結果の最上部は「順位リスト」。1行 = 会社×小包状態。行の最大の数字は **最安との差額**（`+¥2,950`）。最安行には差額の代わりに `CHEAPEST` と、最高値との差（`¥5,250 less than the most expensive`）。
- 総額は差額の右に小さく `~¥33,500` と書き、見出しを `approx. total` とする。**¥100 単位に丸め、`~` を付ける。**差額は円単位で出す（差額は主に公表料金の差から生じ、総額より確か）。
- 差額を長さで見せる細いバー（`DiffBar`）を各行に置く。最安 = 長さ0。**バーは差額を符号化し、総額は符号化しない**（不確かな数字を面積で強調しない）。
- 1行目の要約文を「Neokyo is cheapest. ZenMarket costs ¥2,950 more, Buyee (default) ¥5,250 more.」の形にする。総額はその下に 13px で。
- 順位の頑健性を1行で添える（既存 `stability()` の結果）。「The order doesn't change one weight step up or down.」／変わるときは「If the parcel is one step heavier, FROM JAPAN comes out cheapest.」
- 費目の内訳は二次情報として下へ。デスクトップは全表を常時表示、モバイルは行を叩いて展開（§3）。

**理由**

- 重量を 1/3〜5倍に外しても7カ国で順位は動かず、総額は −19%〜+85% 動いた（DESIGN-NOTES §1）。最も確かな情報を最も大きく、最も不確かな情報を最も小さく。
- 意思決定に要るのは「どれを選ぶか」。総額は代行サイトで確定する。
- 丸めと `~` は「精度がこの程度」を数字自身に言わせるため。桁まで書くと確定値に見える。

**却下した案**

| 案 | 却下理由 |
|---|---|
| 総額を主役のまま、順位バッジを足す | 最大の文字が最も不確かな数字である構造が変わらない |
| 差額を % で出す | 分母が不確かな総額。円で払うので円で見せる |
| 総額を幅（min–max）で出す（重量が分かる場合も） | 重量が分かるカテゴリでは幅が狭く、情報量より雑音。幅は重量不明のときだけ使う（§4） |
| 総額を桁まで表示（`¥33,528`） | 確定値と同じ見た目になる。約半分が推論（DESIGN-NOTES §1）という事実と矛盾 |

---

## 2. 入口が検索 — 参考値と確定値の見せ分け

**決めたこと**

- 入力欄は**1つ**。`http` で始まれば URL 取得、それ以外はキーワード検索（判定は決定的）。プレースホルダ「Paste a listing URL, or search by keyword」。
- 検索結果は**ポップアップ**（デスクトップ: 中央ダイアログ、モバイル: 全画面シート）。1クエリ分（最大20件）を出し、**ページングしない**（次ページ = 追加課金 $0.005。REQUIREMENTS §8.5）。
- 結果カード: 画像／タイトル／**サイト名（ドメイン表記のテキストチップ、常時表示）**／価格。価格は推定表記 `~¥3,000`（§6）。画像や価格が返らないケースは設計上の一級状態として持つ（Brave の `thumbnail` `product.price` は返却保証なし）。
  - 画像なし: 灰色枠に「no image」。
  - 価格なし: 「price not shown — you'll enter it」。選択後、価格欄が空のまま推定色で開く。
- 結果セットに2サイト以上あれば、上部にサイト絞り込みチップ（クライアント側のフィルタ。追加クエリなし）。
- カート行は価格の出どころで**3状態**を持つ。見た目は §6 の確度表現に従う。

| 状態 | 数字 | 出所行 | 国内送料 |
|---|---|---|---|
| URL 取得 | `¥3,000`（確定・黒） | `Yahoo! Auctions listing · read 2026-09-06` | `chargeForShipping` から確定。送料込みなら `shipping included by seller` を確定で表示 |
| 検索から選択 | `~¥3,000`（推定・琥珀） | `from mercari.com search result · reference price` ＋ リンク「Paste the listing URL for the exact price」 | 不明 → `~¥800 assumed` |
| 利用者が編集 | `~¥3,200`（推定・琥珀）＋鉛筆記号 | `edited by you` | 変更なし |

- **国内送料の確定は URL 貼付でしか得られない**ことを、カート行の国内送料欄に書く（「paste the URL to know」）。順位が入れ替わる唯一の条件が「国内送料 ¥0」（DESIGN-NOTES §1）なので、ここが URL への昇格動機になる。
- 価格が推定の項目が1つでもあれば、`Items` 行と総額は推定表記を継承する（総額は EMS が常に推定なので常に `~`。`Items` 行の `~` が価格の確度を示す）。

**理由**

- URL か検索かを利用者に選ばせない。貼れる人は貼る、貼れない人は探す。判定は文字列の先頭だけで足りる。
- ポップアップにするのは「選ぶ」が離散的な1手順で、閉じれば元の安定した画面に戻るため。結果をページ内に流し込むと比較結果が押し下げられ、カートと混ざる。
- サイト名をロゴでなくテキストにするのは、取得不要・商標非使用・10サイト前後で視認できるため。

**却下した案**

| 案 | 却下理由 |
|---|---|
| URL 欄とキーワード欄を分ける | 利用者に分類を強いる。判定は機械でできる |
| 検索前にサイトを選ばせる | どのサイトにあるか分からないから検索する。順序が逆 |
| 結果をページ内リストで表示 | 比較表を押し下げ、カートと視覚的に混ざる。モバイルでは結局全画面になる |
| 検索結果に「もっと見る」 | 1クリック = 1課金。20件で足りないなら語を変えて検索し直す方が安い |
| 検索価格をそのまま確定色で出す | 検索結果の価格は出品時点・別サイト・別コンディションの可能性がある。確度を偽る |

---

## 3. モバイルで最大6列をどう見せるか

**決めたこと**

- **`lg`（1024px）未満: 表を使わない。**順位リスト（§1）がそのまま「会社=行」の一覧になる。行を叩くと下に展開し、**「この行 vs 最安」の2列**で費目を並べる（最安行を展開したときは1列）。差がある費目は右端に `+¥2,600` を添える。
- **`lg` 以上:** 順位リストの下に 費目=行・会社=列 の全表（最大 132 + 118×6 = 840px、`lg` に収まる）。列順 = 順位。sticky 先頭列は不要（収まるため）。
- Buyee の2行は順位で離れうる。グルーピングはしない。代わりに既存の `ConsolidationCallout`（「Buyee を使うなら同梱を申請」）をリストの直下に置く。

**理由（ベストプラクティスとの対応）**

- 比較表のモバイル対応で定石は「3列以下に落とす」か「行列を入れ替えてカードにする」。6列は横スクロールでも列ピッカーでも解決しない。
- 順位リストが既に「会社=行」なので、入れ替えは追加設計なしに成立する。展開の2列比較は「最安を基準列に固定する」定石（anchor comparison）。利用者の問い「なぜこっちが高い？」に、列を横断せず答えられる。
- 360px 幅で 3列（費目 40% / この行 30% / 最安 30%）は tabular-nums で収まる。

**却下した案**

| 案 | 却下理由 |
|---|---|
| 横スクロール表（現素案）＋ sticky 先頭列 | 360px で見えるデータ列は約1.5列。主役の差額が画面外。スクロール可能であることの手がかりも弱い |
| 列ピッカー（比べる会社を2〜3社選ぶ） | 「どこを選ぶべきか分からないから来た」利用者に、先に会社を選ばせる |
| 行列入れ替え（会社=行・費目=列） | 費目は最大19。列が増える方向に倒す |
| 会社ごとのカルーセル（スワイプ） | 一覧性が消える。順位が1画面で見えない |
| 総額だけ見せて費目を隠す | 「計算の中身を全部見せる」（REQUIREMENTS §1.8）に反する |
| `md`〜`lg` で横スクロール表 | 幅ごとに別の振る舞いが2つ増える。タブレットは展開型で足りる |

---

## 4. 重量は既定で埋め、その場で直してもらう（2026-09-06 改訂）

> 旧版のこの節は「重量が分からないカテゴリは段ごとの総額（`WeightStepTable`）に落とし、
> 1つの数字を押し付けない」だった。**順位が重量の推定誤差に対して頑健だという前提が
> 実測で否定された**（DESIGN-NOTES §1: 2〜5点で 1,150〜1,625 g／点に1位の交差点がある）ので、
> 「表に当たれば1つの数字を信じてよい」も「当たらなければ段表で済む」も成立しない。
> 重量表 69 ラインのうち 14 ラインで P25–P75 が交差点を跨ぎ、サンプルを増やしても縮まらない
> （剣道の胴は本当に品ごとに 1.5〜7.5 kg）。**重量は利用者に入力してもらうしかない。**
> ただし全員に入力を強制するのは動線として最悪なので、推定値を既定で入れて直せるようにする。

**決めたこと**

- カートの各品に**最初から数字の入った重量入力**を置く。空欄で開かない。値は:
  - 重量表のラインに当たれば**中央値**（`weightOrigin: 'table'`）。横に `1/7 scale · n=647 · 1.0x · solarisjapan.com`（`/weights#scale-1-7` へリンク）と **P25–P75**
    （`middle half of listings: 380 g–600 g`。幅が無ければ `all 1.5 kg`）。
  - 当たらなければ **1,000 g を「仮置き」**（`weightOrigin: 'assumed'`）。横に
    `assumed — no weight data for this title. Type it if you know it.`。仮置きの根拠は `src/lib/pricing/weights.ts` の `ASSUMED_WEIGHT_G` のコメント
    （EMS の段の丸い数字で測った値に見えない／交差点のすぐ下なので ×1/3〜×3 の判定が必ず跨ぐ）。
  - 利用者が打てば `weightOrigin: 'user'`。`~` に `✎` を後置し `entered by you · reset to ~439 g`。表の出所・幅・リンクは外す（利用者の数字に `n=647` を添えたら出所の偽装）。
- 確度は全部 **推定**（`~`・琥珀）。仮置きも推定であって未取得（`—`）ではない — 数字が入っている以上、`none` は使えない。
- **「直すべき品」を名指しする。** `compare()` が `weightSensitivity` を返す: 他の点を固定し、**その品だけ**を典型的な幅の両端（表のラインは P25–P75、仮置きは 500 g〜10 kg、利用者入力は見ない）に置いて1位が替わるか。替わる品にだけ、重量欄の下に
  `⚠ This weight decides the cheapest: Neokyo at 380 g, FROM JAPAN at 600 g.` を出す。替わらない品には何も足さない。
- `StabilityNote`（カート全体を ×1/3・×3）が不安定なときは `⚠` を前置し、**`Check the weights in your cart`** ボタンを添える。押すとカートを開き（モバイルでは畳まれている）、1位を決めている品の入力にフォーカスして選択する。文だけ出して欄を探させるのは、見逃されるのと同じ。
- 文言は「the weight you gave us」ではなく **「our weight estimate」**（表の中央値・仮置きのとき）。
- **`WeightStepTable` は撤去。** 全点に重量が入って直せる今、「重量が X なら総額は」に答えるのは重量欄そのもの。全点を同じ重量に置く表は、全点が不明だったときにしか意味が無かった。`compare()` の `bands` 経路は `weightG: null` を渡す呼び出し側のために残す（計算機の UI は null を渡さない）。

**実測（2026-09-06、米国、`compare()` を走らせた値）**

| カート | 1位 | `rankStable` | 名指しされる品 |
|---|---|---|---|
| 既定の2点（1/7 ¥12,800 + ねんどろいど ¥4,200） | FROM JAPAN（7カ国とも） | true | なし。ねんどろいど 380–600 g でも動かない |
| 既定の2点 + 表に無い品 ¥3,000（仮置き 1,000 g） | Neokyo | false | 仮置き品（500 g: Neokyo / 10 kg: FROM JAPAN）**と、ねんどろいど**（380 g: Neokyo / 600 g: FROM JAPAN） |
| 表に無い品 1点だけ | FROM JAPAN | true | なし。500 g〜10 kg のどこでも FROM JAPAN → 聞かない |
| K-Pop フォトブック ×2（各 800–1,600 g） | Neokyo | false | 両方（800 g: Neokyo / 1.6 kg: FROM JAPAN） |
| 剣道 胴・袴・垂（胴 1.5–7.5 kg） | FROM JAPAN | false（×1/3 で Neokyo） | なし。1点ずつなら四分位の幅で動かない |
| 和弓 7 kg ×3 + 仮置き 1点 | FROM JAPAN | false | 仮置き品。10 kg では同梱行が 30 kg を超え、Buyee default が「唯一値段が付く社」（`onlyPricedAtHigh`）— 「最安」とは書かない |

**理由**

- 押し付けと見逃しを同時に避けるには、**警告の強さを「実際に順位が動くか」で決める**しかない。それを決めるのは推定の確度（`n`・`spread`）ではなく `compare()` の結果。spread 5.0 の胴が名指しされず、spread 1.6 のねんどろいどが名指しされるカートが実在する。
- 単独1点では何を入れても FROM JAPAN なので、重量を聞くこと自体が雑音。聞かない。
- 1点ずつの判定と全体の判定は別の問いに答える。前者は「どれを直せば固まるか」、後者は「推定がまとめて外れたら」。両方出す。
- 数字はすべて `compare()` から来る。文言に社名・重量をハードコードしない（E2E は関係だけを固定し、実測値は `compare.test.ts` に固定）。

**却下した案**

| 案 | 却下理由 |
|---|---|
| 段ごとの総額の表を残す（従来） | 全点を同じ重量に置く前提が、点ごとに重量が入った今は成り立たない。1点だけ不明のとき既知の点まで段に乗せていた |
| 全員に重量入力を必須にする | 動線として最悪。2点カートでは FROM JAPAN が7カ国で安定しており、聞く必要すら無い |
| `spread` が大きいラインだけ警告 | 順位が動くかはカートの構成で決まる。胴（5.0x）は動かず、ねんどろいど（1.6x）は動くカートがある |
| 仮置きを表全体の中央値（n 加重）にする | ルアーとカードに引かれて 200〜400 g になり、5点でも ×3 が交差点に届かず「安定」と出る。何も知らないカートで安定と言うのは嘘 |
| 仮置きをカテゴリの選択で決めさせる | 選ぶ前の既定が要る点は変わらない。ラインの照合語を増やす方が筋 |
| 交差点の重量（「1,325 g までは Neokyo」）を計算して出す | 有用だが、複数点の重量を1つの倍率で振る近似になる。まず1点ずつの両端で名指しし、必要なら次に足す |

---

## 5. 重量表の公開ページ

**決めたこと**

- ルート `/weights`。静的生成（データはリポジトリ内 JSON）。
- 導線: (a) カートの重量チップ → 該当行のアンカー、(b) 段表の見出し「no weight data for this category — what we have」→ `/weights`、(c) フッター、(d) `/sources` と相互リンク。
- 構造:

```
/weights
├─ 見出し: Shipping weights we use
│  1文: 「代行の見積りで最大の費目は国際送料。EMS は重量段で決まる。ここにその重量の出所を全部置く」
├─ 表（商品ライン単位）
│  列: Product line | Median g | P25–P75 | Spread | n | EMS step (zone 4) | Source | Fetched
│  例: 1/7 scale | 1,500 | 1,500–1,500 | 1.0x | 647 | 1,500 g | Solaris Japan | 2026-09-06
│  Source は店名＋公開 JSON への URL。二次情報の行は §6 の点線表記
├─ 出典カード（源ごと）: 店名、URL、取得件数、取得日、品質判定の結果（distinct 数・丸い値の比率）
├─ 取れていないカテゴリの一覧（楽器・カメラ・書籍・漫画・ゲーム専業）
│  「ここは計算機が段ごとの総額を出す」と1文。GitHub issue への「源を知っていたら教えて」リンク
├─ 方法の注記（3点）: Shopify grams は送料計算用の入力値で実測ではない／
│  分布で品質判定してから採用／生カタログは再配布せず集計のみ
└─ 更新履歴（取得日のリスト。git の履歴から生成できる）
```

- `/sources`: 代行各社の料金（出典 URL・確認日・確度）、EMS 全段表、国別の税と免税限度（未取得は「—」で行を残す）。現素案の `details.about` の中身をここへ移す。
- `/weights` への広告掲載は未決（§9）。

**理由**

- 「出典・件数・取得日つきで計算の中身を全部見せる」（REQUIREMENTS §1.8）。表の各行に3つとも列で持たせる。
- AdSense 審査の「独自コンテンツ」材料（TODO-USER.md）。5,000件から導いた集計は他に無い。
- 計算機の重量チップから1タップで根拠に着けることで、「なぜこの重量か」を画面内で説明しない（結果画面を短く保つ）。

**却下した案**

| 案 | 却下理由 |
|---|---|
| 結果画面の折りたたみに全部入れる（現素案） | 検索エンジンから独立して到達できない。AdSense の材料にならない |
| 重量表と料金出典を1ページにまとめる | 重量は「集計した独自データ」、料金は「転記した一次情報」で性質が別。更新頻度も別 |
| カテゴリ別の子ページ（`/weights/figure` 等） | 現時点で実データはフィギュアとレコードの2カテゴリ。分ける量がない。増えたら再検討 |

---

## 6. 確度4段階の視覚表現（規定）

色だけに頼らない。**各段階に色以外の記号を1つ持たせる。**

| 段階 | 記号 | 色（light / dark） | Tailwind | 例 | 出所行 |
|---|---|---|---|---|---|
| 確定 fixed | なし | ink | `text-neutral-900 dark:text-neutral-100 tabular-nums` | `¥800` | 料金表名・確認日 |
| 推定 estimate | 前置 `~` | amber | `text-amber-700 dark:text-amber-400 tabular-nums` | `~¥7,900` | 何から推定したか（`n=647` 等）／`edited by you` |
| 二次 unverified | **点線下線** | ink | `underline decoration-dotted decoration-1 underline-offset-[3px]` | <u>¥3,278</u> | 二次情報の出所名。`title` 属性に「second-hand source」 |
| 未取得 none | `—` | dim | `text-neutral-500 dark:text-neutral-400` | `—` | `not included` の1文。**0 とは書かない** |

追加規則:

- 推定かつ利用者編集: `~` に加えて鉛筆記号（`✎`）を後置。色は推定と同じ。
- 一次／二次の線種は数字以外にも適用する。会社列の見出し下線: 一次 `border-b border-solid`、料金が二次の会社（現状 FROM JAPAN）は `border-b border-dashed`。`/sources` の行区切りも同じ。
- 総額: 推定を含めば `~`（実質常に）。未取得を含めば行の下に `excl. duty` のように**何が入っていないか**を列挙する（総額が低く見える方向の誤りは特に明示する）。
- 凡例（`TierLegend`）を順位リストの直下に常設。1行: `Plain = published price list. ~amber = our estimate. Dotted = second-hand source. — = not included, not zero.`
- 差額は総額と同じ規則で継承する（比較する2行のどちらかに推定があれば `~`）。

Tailwind v4 の `dark:` は `prefers-color-scheme` に従う。テーマ切替は現素案の `data-theme` を継承する場合 `@custom-variant dark` で対応可。

---

## 7. 画面レイアウト

### 7.1 `/` 結果あり（デスクトップ `lg` 以上・重量が分かる場合）

```
┌──────────────────────────────────────────────────────────────────────────┐
│ proxycost                                              Ship to [United States ▾] │
├──────────────────────────────────────────────────────────────────────────┤
│ [ Paste a listing URL, or search by keyword                    ] [Add]   │
│                                                                          │
│ CART                                                                     │
│  1/7 scale figure ...     ¥3,000   Yahoo! Auctions · read 09-06        ✕ │
│                           shipping included by seller                    │
│                           ~1,500 g · 1/7 scale · n=647 → /weights        │
│  Nendoroid ...           ~¥2,800 ✎  from mercari.com search · reference ✕ │
│                           ~¥800 domestic assumed · paste URL to know     │
│                           ~440 g · Nendoroid · n=426 → /weights          │
├──────────────────────────────────────────────────────────────────────────┤
│ Neokyo is cheapest. FROM JAPAN costs ¥1,250 more, ZenMarket ¥2,950,      │
│ Buyee (default) ¥5,250.                                                  │
│ approx. total ~¥33,500 · ≈ $223 at ¥150/USD (fixed 09-06)               │
│ The order doesn't change one weight step up or down.                     │
│                                                                          │
│ #  company · parcels               difference        approx. total       │
│ 1  Neokyo · 1 parcel               CHEAPEST          ~¥33,500  [Open →]  │
│    pays us nothing                 ¥5,250 less than the most expensive   │
│ 2  FROM JAPAN · 1 parcel assumed   +¥1,250 ▌         ~¥34,800  [Open →]  │
│    pays us a % of your purchase                                          │
│ 3  ZenMarket · 1 parcel assumed    +¥2,950 ▌▌        ~¥36,500  [Open →]  │
│    pays us ¥100 if you sign up                                           │
│ 4  Buyee · consolidated (request)  +¥3,100 ▌▌        ~¥36,600  [Open →]  │
│    pays us a % of your purchase                                          │
│ 5  Buyee · default (2 parcels)     +¥5,250 ▌▌▌▌      ~¥38,800  [Open →]  │
│    pays us a % of your purchase                                          │
│ Plain = published price list. ~amber = estimate. Dotted = second-hand. — = not included │
│                                                                          │
│ ▸ If you use Buyee, request consolidation. (callout)                     │
│                                                                          │
│ BREAKDOWN                    Neokyo   FROM JAPAN  ZenMarket  Buyee c.  Buyee d. │
│                              ──────   ┄┄┄┄┄┄┄┄┄┄  ─────────  ────────  ──────── │
│  Items                        ~¥5,800   ~¥5,800    ~¥5,800    ~¥5,800   ~¥5,800 │
│  Service fee                    ¥700      ¥1,000̤     ¥1,600        —         —  │
│  Purchase fee                     —          —          —      ¥1,000    ¥1,000 │
│  Domestic shipping               ¥0       ~¥800      ~¥800      ~¥800     ~¥800 │
│  Packing                        ¥500         —          —          —         —  │
│  EMS to United States        ~¥7,900    ~¥7,900    ~¥7,900    ~¥7,900  ~¥10,500 │
│  Deposit fee                      —          —       ~¥600        —         —  │
│  Duty                          ¥725̤       ¥725̤       ¥725̤       ¥725̤      ¥725̤ │
│  Customs clearance fee       ¥1,403̤     ¥1,403̤     ¥1,403̤     ¥1,403̤    ¥2,805̤ │
│  Sales tax / VAT                  —          —          —          —         —  │
│  approx. total              ~¥33,500   ~¥34,800   ~¥36,500   ~¥36,600  ~¥38,800 │
│                                                                          │
│ OPTIONAL EXTRAS (not in the totals)   Buyee protective packing +¥1,500 · ... │
│ WHAT COULD BE OFF  ・weight ... ・domestic shipping ... ・US duty 12.5% is second-hand │
│                                                                          │
│ ┌──────────────────── Ad · unrelated to the ranking ─────────────────┐   │
│ └────────────────────────────────────────────────────────────────────┘   │
│ footer: sources · /weights · /sources · referral disclosure · privacy    │
└──────────────────────────────────────────────────────────────────────────┘
```

（`̤` は点線下線の代用。FROM JAPAN の見出し下線 `┄` は二次情報の破線。）

### 7.2 `/` 結果あり（モバイル `< lg`）

```
┌────────────────────────────┐
│ proxycost    Ship to [US ▾]│
│ [Paste URL or search    ][+]│
│ CART (2)  ▸                │
├────────────────────────────┤
│ Neokyo is cheapest.        │
│ ZenMarket +¥2,950,         │
│ Buyee (default) +¥5,250.   │
│ approx. total ~¥33,500     │
│ Order holds ±1 weight step.│
│                            │
│ 1 Neokyo            CHEAPEST│
│   1 parcel · pays us nothing│
│   ~¥33,500 approx  [Open →]│
│ ─────────────────────────  │
│ 2 FROM JAPAN        +¥1,250│
│   ▌                        │
│   ~¥34,800 approx  [Open →]│
│ ─────────────────────────  │
│ 3 ZenMarket         +¥2,950│
│   ▌▌                       │
│   ~¥36,500 approx  [Open →]│
│ ▾ (expanded)               │
│   line          this  Neokyo│
│   Service fee  ¥1,600   ¥700 │
│                       +¥900 │
│   Domestic      ~¥800    ¥0 │
│                       +¥800 │
│   Packing          —   ¥500 │
│                       −¥500 │
│   EMS          ~¥7,900 ~¥7,900│
│   Deposit fee   ~¥600     — │
│                       +¥600 │
│   ...                      │
│ ─────────────────────────  │
│ 4 Buyee · consolidated +¥3,100│
│ 5 Buyee · default    +¥5,250│
│                            │
│ legend (1 line, wraps)     │
│ ▸ Buyee: request consolidation│
│ OPTIONAL EXTRAS ▸          │
│ WHAT COULD BE OFF ▸        │
│ ┌── Ad · unrelated ──────┐ │
│ └────────────────────────┘ │
│ footer                     │
└────────────────────────────┘
```

- カートはモバイルでは折りたたみ（件数表示）。編集時に開く。
- 展開は複数行同時に開けてよい（閉じる操作を強いない）。

### 7.3 `/` 重量が分からない場合（差分のみ）— **廃止（2026-09-06、§4 改訂）**

> 以下は旧設計の記録。計算機は重量を null にせず、段表も出さない。カートの重量欄が
> `~ [1000] g · assumed — no weight data for this title …` と `⚠ This weight decides the
> cheapest: …` を出す（§4）。

デスクトップ、順位リストの各行と段表（旧）:

```
│ 1  Neokyo · 1 parcel          CHEAPEST                ~¥27,100 – 62,200 │
│ 2  FROM JAPAN · 1 parcel      +¥1,250                 ~¥28,400 – 63,500 │
│ 3  ZenMarket · 1 parcel       +¥2,900 – 3,600         ~¥30,000 – 65,800 │
│ 5  Buyee · default (2 pcs)    +¥5,250 – 19,800        ~¥32,400 – 82,000 │
│                                                                          │
│ We don't have weight data for "楽器". Totals by EMS weight step:          │
│ Cheapest at every step from 500 g to 5 kg: Neokyo   → what we have /weights │
│                                                                          │
│   step     Neokyo    FROM JAPAN  ZenMarket   Buyee c.   Buyee d.         │
│   500 g   [~¥27,100]  ~¥28,400   ~¥30,000    ~¥30,100    ~¥32,400        │
│   1 kg    [~¥29,600]  ~¥30,900   ~¥32,600    ~¥32,600    ~¥37,200        │
│   2 kg    [~¥33,500]  ~¥34,800   ~¥36,500    ~¥36,600    ~¥44,900        │
│   3 kg    [~¥48,800]  ~¥50,100   ~¥52,300    ~¥51,900    ~¥63,100        │
│   5 kg    [~¥62,200]  ~¥63,500   ~¥65,800    ~¥65,300    ~¥82,000        │
│   [ ] = cheapest at that step.  A straight column means the order never changes. │
│   I know the weight: [_____] g                                            │
```

モバイルの段表（3列）:

```
│ step   cheapest              spread          │
│ 500 g  Neokyo ~¥27,100       +¥5,300 to worst│
│ 1 kg   Neokyo ~¥29,600       +¥7,600         │
│ 2 kg   Neokyo ~¥33,500      +¥11,400         │
│ 3 kg   Neokyo ~¥48,800      +¥14,300         │
│ 5 kg   Neokyo ~¥62,200      +¥19,800         │
```

（表中の段の刻みと範囲は例。実際の段の集合は未決 §9。数値は例示で計算結果ではない。）

### 7.4 検索結果ポップアップ

デスクトップ（中央ダイアログ、幅 720px、4列グリッド）／モバイル（全画面シート、2列）:

```
┌─ Results for "ねんどろいど 初音ミク" ───────────────── ✕ ┐
│ sites: [all] [mercari.com] [suruga-ya.jp] [auctions.yahoo.co.jp] │
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐             │
│ │ image  │ │no image│ │ image  │ │ image  │             │
│ │        │ │        │ │        │ │        │             │
│ ├────────┤ ├────────┤ ├────────┤ ├────────┤             │
│ │title…  │ │title…  │ │title…  │ │title…  │             │
│ │mercari │ │suruga  │ │yahoo   │ │mercari │             │
│ │~¥2,800 │ │price   │ │~¥3,100 │ │~¥2,600 │             │
│ │        │ │not     │ │        │ │        │             │
│ │        │ │shown   │ │        │ │        │             │
│ └────────┘ └────────┘ └────────┘ └────────┘             │
│  … up to 20 …                                             │
│ Prices here are reference values from search results.     │
│ Paste the listing URL afterwards for the exact price.     │
└───────────────────────────────────────────────────────────┘
```

- カードのタップで即カートへ追加、ポップアップは閉じる（確認ステップなし。カートで編集できる）。
- ESC／背景タップで閉じる。フォーカスは入力欄へ戻す。

### 7.5 `/weights`

```
┌──────────────────────────────────────────────────────────────┐
│ proxycost › Shipping weights we use                          │
│ 1文の説明。最終取得 2026-09-06。                                 │
│                                                              │
│ Product line   Median  P25–P75      Spread  n    EMS step  Source          Fetched   │
│ 1/7 scale      1,500 g 1,500–1,500  1.0x    647  1,500 g   Solaris Japan ↗ 09-06     │
│ 1/6 scale      1,800 g 1,800–1,800  1.0x    641  2,000 g   Solaris Japan ↗ 09-06     │
│ Nendoroid        439 g   380–600    1.6x    426    500 g   Solaris Japan ↗ 09-06     │
│ CD               ~100 g   80–120      —       —    500 g   Snow Records ↗  09-06     │
│ …                                                            │
│                                                              │
│ SOURCES                                                      │
│ ┌ Solaris Japan ─ products.json · 5,000 items · fetched 09-06 ┐ │
│ │ quality check: distinct values 41 · round-value ratio 0.97  │ │
│ │ note: grams is a shipping input, not a measurement          │ │
│ └─────────────────────────────────────────────────────────────┘ │
│ NOT COVERED: musical instruments, cameras, books, manga, games. │
│ The calculator shows totals per weight step for these. Know a   │
│ source? → GitHub issue                                          │
│ METHOD (3 bullets) · CHANGELOG (dates)                          │
└──────────────────────────────────────────────────────────────┘
```

（Snow Records 行の n と Spread は research/README に無いので「—」。取れたら埋める。）

モバイルは表を「商品ライン」ごとのカード（3行: 名前＋中央値 / 幅・ばらつき・n / 出典・取得日）に落とす。列は8つあり横スクロールにしない（§3 と同じ理由）。

---

## 8. コンポーネント一覧（名前と責務）

| コンポーネント | 責務 |
|---|---|
| `Amount` | 金額を4段階の規定（§6）で描く唯一の場所。tier と note を受け、記号・色・下線・`—` を出す。全ての金額表示はこれを通す |
| `TierLegend` | 凡例1行 |
| `SearchField` | 単一入力欄。URL／キーワードの判定、送信 |
| `ResultPicker` | 検索結果ポップアップ（ダイアログ／シート）。サイト絞り込み、選択でカートへ |
| `ResultCard` | 画像（なし状態含む）・タイトル・サイトチップ・価格（推定）／価格なし状態 |
| `Cart` / `CartItem` | 品目行。価格の3状態、出所行、国内送料の確度、重量欄、削除。`focusWeight(id)` を命令的ハンドルで公開 |
| ~~`WeightChip`~~ | `WeightBox` に統合（読むだけのチップから、直せる入力へ） |
| `DestinationSelect` | 国選択 |
| `FxNote` | 固定レートでの現地通貨換算と `asOf` |
| `Verdict` / `StabilityNote` | 要約1〜2文（最安・差額）＋概算総額＋頑健性の1行。不安定なら `⚠` と `Check the weights in your cart`（カートの該当欄へフォーカス） |
| `RankList` / `RankRow` | 順位リストと行。差額（幅対応）、`DiffBar`、概算総額、払う／払わない、Open ボタン、展開トグル |
| `DiffBar` | 差額に比例する細バー。最安は0 |
| `BreakdownPair` | モバイルの展開。この行 vs 最安の2列＋差 |
| `BreakdownMatrix` | `lg` 以上の全表。列順＝順位。一次／二次で見出し下線の線種を変える |
| ~~`WeightStepTable`~~ | 撤去（§4 改訂）。重量欄が常時編集可能になったため |
| `WeightBox`（`ItemList` 内） | 重量入力（常に数字入り）。出どころ（表のライン／仮置き／利用者）、P25–P75、`reset to ~439 g`、`⚠ This weight decides the cheapest: …`（`weightSensitivity`） |
| `ConsolidationCallout` | Buyee 同梱の呼びかけ（`n ≥ 2` のときのみ） |
| `OptionalExtras` | 任意費目を「選ぶと +¥」で列挙（総額に入れない。DESIGN-NOTES §2） |
| `WhatCouldBeOff` | 外れうる点の箇条書き（国別） |
| `PayerBadge` | 「pays us ¥100 if you sign up」／「pays us nothing」 |
| `AdSlot` | 結果ブロック下の1枠。ラベル「Ad · unrelated to the ranking」 |
| `ConsentBanner` | EU/UK 同意 |
| `SiteFooter` | 出典・開示・プライバシー・issue 窓口 |
| `WeightsPage` / `WeightTable` / `SourceCard` / `MissingCategories` / `MethodNote` / `Changelog` | `/weights` の構成要素 |
| `SourcesPage` | 料金・EMS・税の出典表 |

---

## 9. 未決（決めるのに必要な情報）

| 未決 | 必要な情報 |
|---|---|
| ~~段表に出す EMS 段の集合と範囲~~ | 段表を撤去したので消滅（§4 改訂）。`UNKNOWN_WEIGHT_STEPS_G` は仮置きの重量を動かす幅（500 g〜10 kg）としてだけ残る |
| 1位が入れ替わる重量そのものを出すか（「1,325 g／点までは Neokyo」） | 複数点の重量を1つの倍率で振る近似の是非。まず1点ずつの両端の名指しで様子を見る |
| ばらつき 1.0x のデータ裏付け重量を「確定」に昇格させるか | 方針決定。research/README は「確定値として扱える」と「実測ではない」の両方を書いている |
| 検索結果に画像・価格がどの割合で返るか | Brave の実測（REQUIREMENTS §8）。割合が低ければグリッドではなくリスト表示に切り替える |
| 価格の誤差に対する順位の頑健性 | 未測定。`stability()` は重量のみ。価格は ZenMarket の 3.5% を通じてのみ順位に効くはずだが、測ってから言う |
| Jauce の料金構造と小包の既定挙動 | `src/data.js` に Jauce が無い。列の見出し・行数（1行か2行か）が決まらない |
| FROM JAPAN の手数料が定額か率か | 確定すれば見出し下線を破線から実線へ |
| `/weights` に広告を置くか | 方針決定。REQUIREMENTS は計算機の結果下しか規定していない |
| UI の言語（英語のみか、日本語を併記するか） | 対象利用者の言語分布。現素案は英語のみ |
| 対象ショッピングサイトの一覧（「10前後」の中身） | サイトチップの表記と、URL 取得で確定値になるサイトの範囲 |
| 総額の丸め単位（本書は ¥100） | 利用者反応。差額を円単位で出す一方で総額を丸める違和感が出たら見直す |
| 名前・ドメイン | REQUIREMENTS §8 |
