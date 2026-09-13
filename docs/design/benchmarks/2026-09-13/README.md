# UI ベンチマーク 2026-09-13

類似プロダクト 20 と、類似ではないが UI の評価が高いプロダクト 10 のスクショと評価。

- `shots/<id>-{desktop,mobile}-{fold,full}.jpg` — **リポジトリには入れていない（`.gitignore`、約50MB）。撮影したマシンのローカルにだけある。** desktop は 1440×900、mobile は iPhone 13。full は最大 8000px で切っている
- `capture-log.json` / `capture-log-retry.json` — 撮影時の最終 URL・タイトル（retry は遮断されたサイトを実 Chrome で撮り直した分）
- 評価: [eval-proxy-services.md](eval-proxy-services.md) / [eval-comparison-tools.md](eval-comparison-tools.md) / [eval-acclaimed-ui.md](eval-acclaimed-ui.md)

撮影はヘッドレスブラウザ。Cookie バナーは同意しないまま撮った。CAPTCHA や bot 遮断は突破していない。

## 対象と取得状況

| id | サイト | 取得 |
|---|---|---|
| s01 | Buyee | mobile のみ（desktop は 403） |
| s02 | ZenMarket | mobile のみ（desktop は遮断） |
| s03 | Neokyo | ○ |
| s04 | FROM JAPAN | mobile のみ（desktop は 403） |
| s05 | Jauce | ○ |
| s06 | Tenso | ○ |
| s07 | Blackship | ○ |
| s08 | Sendico | × 遮断 |
| s09 | White Rabbit Express（Japan Rabbit へ転送） | ○ |
| s10 | Doorzo | ○ |
| s11 | Remambo | ○ |
| s12 | Easyship（トップ。計算機 URL は 404） | ○ |
| s13 | Parcel Monkey | × 遮断 |
| s14 | Zonos Landed Cost | ○ |
| s15 | Wise 比較 | ○ |
| s16 | Google Flights | ○ |
| s17 | Skyscanner | × 遮断 |
| s18 | PriceRunner | mobile のみ |
| s19 | NerdWallet | mobile のみ |
| s20 | Monito | ○ |
| a01 | Linear | ○ |
| a02 | Stripe（/jp へ転送） | ○ |
| a03 | Vercel | ○ |
| a04 | Raycast | ○ |
| a05 | Family | ○ |
| a06 | Framer | ○ |
| a07 | Arc | ○ |
| a08 | Superhuman | ○ |
| a09 | Perplexity | × 遮断 |
| a10 | teenage engineering | ○ |

撮影上の限界: Linear / Stripe / Raycast / teenage engineering は内側の要素でスクロールするため full が fold と同じ。Vercel の full は中盤以降が空白。Zonos の計算機部分は黒く写った。Google Flights / Monito は検索結果ページを撮っていない。

## proxycost としての総評

**類似 20 から取り入れるもの**
1. 総額の列を右端に太字で置いて並び順の基準にし、各行に 1 位との差額（+¥）を出す（Wise）
2. 1 位だけをカードで強調し、残りは短いリストにする。スマホではこの形が標準（Monito）
3. 前提条件・料金表の確認日・根拠へのリンクを表のすぐ下に置く（Wise / NerdWallet）
4. 支払いを「商品と一緒に払う分」と「発送時に払う分」の 2 回に分けて内訳を組む（FROM JAPAN / Doorzo）
5. 「推定」は小さな記号と注記で控えめに示す。色だけに頼らない（Blackship ほか）

**代行業界の共通点と、差別化の余地**
- 総額を最初の画面に出す代行は 1 社もない。割引ポップアップ・Cookie バナー・「0 Purchase Fees」のような一部費目の強調ばかり
- 差別化の余地: 総額の順位を最初の画面の主役にし、ポップアップを置かず、全費目に確度と出典を付ける

**非類似 10 から取り入れるもの（「Claude っぽさ」からの脱却）**
- 色を抑え、差し色を 1 色に絞る。等幅の数字で計器のように見せる。紙やノイズの質感で単色の地の安っぽさを消す
- 方向性 3 案（詳細は eval-acclaimed-ui.md）
  - A「Customs Ledger」: 税関の伝票の比喩。1 位の行にゴム印、内訳はミシン目から半券として開く
  - B「Freight Instrument」: 郵便の秤と計器盤の比喩。総額が桁ごとに回って止まる。既存の箱の絵とつながる
  - C「Terminal Manifest」: 空港の発着案内板の比喩。条件を変えると順位がフラップ式にめくれる

## 追加: 非類似 20（b01〜b20）

Cursor, Resend, Clerk, Supabase, PostHog, Attio, Granola, mymind, Things, Cosmos, Are.na, Poolsuite, tldraw, Rive, Spline, Nothing, Mercury, Ramp, Amie, Craft。全件取得。実 Chrome で撮り、ページ内スクロールに対応するため `scroll1〜3` を追加で撮った。

- 評価: [eval-acclaimed-ui-b1.md](eval-acclaimed-ui-b1.md)（b01〜b10） / [eval-acclaimed-ui-b2.md](eval-acclaimed-ui-b2.md)（b11〜b20）
- 限界: Ramp の desktop は AI 向けテキスト版が返り見た目は mobile のみ。Nothing は地域選択と Cookie 画面で本体が写っていない。Granola / PostHog / Attio は Cookie バナーが一部を隠す

**改訂版の 3 案は [proposals.md](proposals.md)**（上の総評の 3 案を置き換える）。
