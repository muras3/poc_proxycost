# Mock v3 移し替え — board / cart 担当への引き継ぎ（`claude/ui-mock-port` から）

**board / cart 担当は、`origin/claude/ui-mock-port` を取り込んだらまずこれを読むこと。**

書き手: ui-mock-port（ページ枠・条件欄・秤・要約・常時アイコン・広告・比較画像の担当）。
最終更新: 2026-09-15、コミット f212eff 以降。

## 1. 何が入っているか

- `src/app/compare.css` — Mock v3（`prototypes/mock-v3.html`）の CSS を丸ごと移し、`html[data-makeup=light]` の節をそのまま常時適用にしたもの。`globals.css` が `@import` する。**各部品の節はその部品の担当が持つ**（board: `.board` `.bh` `.rh` `.row` `.c-*` `.dbar` `.tot*` `.daybar` `.stamp` `.flap` `.log` `.stage` `.ln` `.pack` `.bx` `.gauge` `.door` `.out` / cart: `.cartline` `.item` `.fin` `.qty` `.chip` `.decisive` `.add` `.addsub` `.notice` `.manual` `.scrim` `.dlg` `.cand` `.cmd` `.tscroll` `.ct` `.wcbo` / ui-mock-port: それ以外）。
- 新規コンポーネント（すべて `src/components/compare/`）:
  - board 担当が引き継ぐ: `Board.tsx`（`.board` ＋ FLIP）、`RankRow.tsx`（1行。`TotalText` / `TotBar` / `DayBar` も中）、`DeliveryLog.tsx`（配達ログ ＋ `Pack`）、`BoxArt.tsx`（箱の SVG）、`Flap.tsx`、`WeightNeedle.tsx`、`mockFormat.ts` の順位ボード部分（`totalParts` `totBarPcts` `dayBounds` `dayPct` `lineAmount` `STAGES` `stageOf` `REASON` `dutyText` `vatText` `leadWord`）。
  - cart 担当が引き継ぐ: `Cart.tsx`（`.cartline` / `.cond` / `.item`）、`AddBar.tsx`（`.add` / `.addsub` / `.notice` / `.manual`。`CandidateDialog` は旧 Tailwind 版のまま呼んでいる）、`Popover.tsx`（`.mk` ＋ `#pop`。**Results / Waybill も使うので、API を変えるときは知らせること**）。
  - ui-mock-port が持つ: `Calculator.tsx`、`Results.tsx`（要約・`.cond`・常時アイコン・`norank`）、`Waybill.tsx`、`Heft.tsx`、`src/app/layout.tsx`、`SiteHeader` / `SiteFooter` / `AdSlot`。
- **旧コンポーネントは残置・未使用**（削除は各担当で）: `RankBoard` `RowBreakdown` `DiffBar` `TotalBar` `ArrivalBar` `PackingBox` `ParcelView` `WeightLadder` `ItemList` `SearchBox` `ManualAdd` `ConditionsBar` `Scale` `AlwaysOnIcons` `LithiumAirmailBadge` `CountryPicker` `MethodPicker` `StorageDaysInput` `StabilityNote` `ConsolidationCallout` `AssumedWeightsNote`（`assumedWeightsSummary` の純関数と unit test は残っている）。
- `Calculator` が呼ぶ props（変えるときはコミットメッセージに明記）:
  - `<Cart items readOn unpriced sensitivity pending open onToggle onPatch onRemove onFocusWeight />`
  - `<AddBar onAdd onPending manualOpen onManualOpen />`
  - `<Board result items wobble province onProvince />`（`Results.tsx` から）
  - `<CostTable result />` `<WhatCouldBeOff result />`（`Calculator` の `Folds` が閉じた `<details class="fold" id="all-fees|what-could-be-off">` に包む。見出しと件数は `Folds` が出すので、中身の `<section>`/`<h2>` は不要になる）

## 2. 見つかった罠（必ず読む）

1. **tier 名 `fixed` をクラスにすると Tailwind の `position:fixed` に食われて行が画面外へ飛ぶ。**`DeliveryLog` は `fixed` のときクラスを付けないように直した（Mock の CSS に `.ln.fixed` の規則は無い）。`CostTable` の `td.fixed` 等でも同じ。同様に Tailwind の既存ユーティリティ名（`hidden` `block` `flex` `border` `r`…）を Mock の class 名と混ぜないこと。
2. **1位の札の横の秤の針（`.wmk`）は `li` 直下の `button[aria-expanded]`。**`li > button[aria-expanded]` で行の見出しを引くと針が混ざる。e2e の `rankButtons` は `button[aria-controls^="log-"]` にした。行の見出しボタンには必ず `aria-controls="log-<rowId>"` を付けること。
3. **`--red` / `--color-post-red` を `#B9201A` に落とした**（紙 `#F2EDE3` の上で `#D7261E` は 4.1:1 で、ゴム印・順位番号・「1ST」の小さい字が AA を割る。axe 実測）。`docs/design/ui-tokens.md` 参照。
4. **注釈（`.mk` / `#pop`）は外側クリックで閉じる。**e2e で注釈の中身を読むときは、操作のたびに開き直す（`openScopeNote` / `openRestrictedNote` のヘルパーが例）。
5. `Board` の見出し行 `.bh` は `aria-hidden` にしない（§ の注釈ボタンがフォーカス可能で axe の `aria-hidden-focus` に当たる）。
6. `.log` は `role="table"`、`.ln` は `role="row"`、その中の `.l` `.t` `.a` `.v1` は `role="cell"`、`ol.stages` / `li.stage` は `role="presentation"`。e2e の `openRankRow` / `costRow` / `costRowByKey` / `rowCells` はこれを前提に読む。

## 3. e2e ヘルパー（`e2e/helpers.ts`）の現状

- `rankButtons` = 行の見出しボタンだけ。`readRanking` は行の地の文を正規表現で読まず、`[data-testid="row-rank"]`（順位）、`.tot` の `aria-label`（総額）、`.flap.diff` の `aria-label`（差額。`1ST` / `LEADS` / `NOT RANKED`）を構造的に読む。
- `openCart`（「Edit cart」）、`closeCart`（「Done」）、`shipTo(page, code)`（送り先ボタンを開いて select）、`setProvince(page, code)`、`destination(page)`、`openScopeNote`、`openRestrictedNote`、`openBreakdown`（`#all-fees` / `#what-could-be-off` を開く）、`breakdownTable` = `#all-fees`。
- `addByHand` は足したあと `openCart` する（Mock は足してもカートを開かない）。
- `DECIDES = /This weight decides 1st place/`。

## 4. compare.spec などで board / cart 側の更新が要る断言（desktop 実行、f212eff 時点）

board 担当:
- 配達ログのセル書式: 旧 `~¥0` / `~¥4,000` を1セルで期待（テスト 3・7・28 など）。Mock は `.t`（`estimate §`）と `.a`（`≈¥4,000`）の別セル。`rowCells` の添字を見直す。
- `tied with FROM JAPAN`（テスト 22・23）: Mock は `.cav` に「Tied with … — the order between them means nothing.」（大文字 T）。`readRanking` は `Tied with` で読むよう直してある。
- `pays us` の開示（テスト 2・10・23）: Mock では行を閉じているとき `pays us …` は出ず、配達ログの `loghead` と `.out` にだけ出る。`sponsored` の rel も `.out a.go` にある。
- `surface-alternative`（1b・rank-board-v2）: Mock は `.ln.surf`（「Can wait 1–3 months? International parcel (surface)」）で、注記本文は § の注釈の中。`<p>` ではない。
- `getByTitle(TITLE.estimate)`（3b）: Mock の行に `title` 属性は無い。線種（`.ln.estimate`）で判定する。
- 18b: `costRow(li, /International parcel \(surface\)/)` が `.ln.surf` と `intl-shipping` の2行に当たる。
- 18c / rank-board-v2「全行 not comparable」: Mock は比べられる行が無いとき `.board` を出さず `norank`（「Can't compare」＋社ごとの理由）に置き換える。`readRanking` は行が無いので使えない。
- rank-board-v2: `arrival-bar` に `Ships by` の文字は無い（列見出しにある）。`arrival-bar-segment` の線種は `data-style="solid|dashed"`（クラス `border-solid` ではない）。未公表は `.daybar.np`（track のみ、segment 無し）。`total-bar-open-end` は `.hi.unb`（右端がフェード）。
- Recommended / Equivalent の札は無い（`.row.bracket` の左罫線）。`LEADS` / `1ST` / `NOT RANKED`。
- parcel.spec / parcel-split.spec / assumed-weights.spec の箱テスト（`region 'Parcel'`、`packing-box-scene`、`weight-ladder`、`parcel-postage`、`parcel-delta`、`split-box-*`）: Mock には `ParcelView` / `WeightLadder` が無い。秤（`#heft`、`data-testid="scale"`）と配達ログの `Pack`（`data-testid="pack"`、`split-box`、`split-box-reason`、`split-box-duty`、`split-box-vat`、`packed-item`）に写せるものは写し、写せないもの（段の梯子・送料の差）は理由を付けて削る。

cart 担当:
- `[aria-label="edited by you"]`（テスト 8・16・その他 7 箇所）: Mock は文字列 `edited by you`（価格）と `entered by you`（重量）。`aria-label` は無い。
- `middle half of listings: …`（16）: Mock は § の注釈の中（「Weight from our table」）。
- `assumed`（5）: Mock は `placeholder — no weight data for this title` ＋ `?` の注釈（`data-testid="assumed-mark"`）。
- `assumed-weights` の文言（assumed-weights.spec）: 現状 `Cart.tsx` は「N of M items use a placeholder weight (1 kg each) — the totals and the ranking rest on it[, and it decides the winner].」を、**カートを開いたときだけ**出す（Mock と同じ。オーナー指示で畳んだときには出さない）。`data-count` / `data-total` は付けてある。
- `Or add an item by hand`（旧トグル名）: Mock は「Add by hand」のリンク（`aria-controls="manual"`）と `<form aria-label="Add an item by hand">` の中の送信ボタン「Add by hand」。ヘルパー `addByHand` は直してある。
- CostTable / WhatCouldBeOff: `breakdownTable` は `#all-fees`。`approx. total` の行は Mock では「Total」。

## 5. 比較画像

`/private/tmp/mock-port-compare/` に `<state>-<desktop|mobile>-{mock,app,side}.png`（state = initial / editing / method / tied / indet / norate / empty）、`anim/` に秤の連続フレーム。撮り直しは `shot-mock.mjs` / `shot-app.mjs` / `side.mjs`（ui-mock-port のスクラッチ）。本体側は Mock と同じ商品・国・方式を UI 操作で入れている（Mock のデータは埋め込んでいない）。
