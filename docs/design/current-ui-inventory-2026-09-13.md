# 現状 UI 棚卸し（2026-09-13）

`src/components/` 配下のコードを実際に読んで書いた。推測箇所は明示する。対象:
`src/components/{chrome,search,weights,sources,compare}/*` と `e2e/{compare,parcel,assumed-weights,a11y}.spec.ts`。

## 1. コンポーネント一覧と責務

| ディレクトリ | ファイル | 責務 |
|---|---|---|
| chrome | `SiteHeader.tsx` / `SiteFooter.tsx` / `ConsentBanner.tsx` / `AdSlot.tsx` | サイト全体の枠。`AdSlot` は比較セクションの最後、CostTable/WhatCouldBeOff の後にのみ置かれる（`Calculator.tsx` 末尾）。中身は未確認（このタスクでは開いていない）。 |
| search | `SearchBox.tsx` | 商品 URL / 検索語からの候補取得。 |
| | `CandidateDialog.tsx` | 検索候補の一覧。デスクトップは中央ダイアログ、モバイルは全画面シート（下から出るシート、`items-end` / `sm:items-center`）。各候補の画像・タイトル・価格を表示し選択すると `onPick`。 |
| | `ManualAdd.tsx` | URL 取得に頼らず手動で品目を追加する入力（未読了、`Calculator.tsx` から `onAdd` 経由で使われることのみ確認）。 |
| weights | `SourceCards.tsx` / `WeightTable.tsx` | `/sources` 系ページ用（比較画面本体ではない）。 |
| sources | `TaxTable.tsx` / `FeeTable.tsx` / `EmsTable.tsx` | 同上、根拠データを見せる別ページ用。 |
| compare | 下記 | 比較画面（`/`）の本体。 |

### `compare/` の構成要素と親子関係

`Calculator.tsx` が全体の結線を持つ唯一の場所（コメント: 「画面の結線だけを持つ」）。子は次の通りで、**上から下に描画順＝画面上の並び順**（`Calculator.tsx` のコメント: 「順位 → 凡例 → 内訳 → 弱点 → 広告の順で、確かな情報ほど上に置く」）。

```
Calculator
├─ 入力行（横並び、モバイルは折り返し）
│   ├─ CountryPicker（Ship to）
│   ├─ StorageDaysInput（Storage days）
│   ├─ MethodPicker（Ship by）
│   └─ ProvincePicker（Province, country==='CA' のときだけ）
├─ SearchBox / ManualAdd（商品追加）
├─ ParcelView（箱の絵。lg以上でItemListと横並び、モバイルはItemListの上）
│   └─ PackingBox（箱そのものの描画。ParcelViewの子として使用）
├─ ItemList（カート＝品目一覧、各品に重量入力あり）
│   └─ AssumedWeightsNote / AssumedMark（重量が未入力＝仮定であることの注記）
├─ （カートが空でない、かつ1点以上に価格がある場合のみ以下）
│   ├─ unpriced件数の注記（インライン、tierClass.none）
│   ├─ Summary（1行要約：最安の会社名 or tie、総額、外貨換算）
│   ├─ StabilityNote（順位が重量で入れ替わりうるかの注記＋「Check the weights」導線）
│   ├─ EmsOnlyNote（比較範囲＝郵便4方式＋価格化済み宅配便の開示）
│   ├─ RestrictedGoodsNote / AlcoholInCartNote（配送可否を確認していない旨の注記）
│   ├─ LongItemsInCartNote（寸法未入力ゆえ方式が絞られる可能性の注記）
│   ├─ FreeShippingDomesticNote（Buyeeの「送料無料」表示に対する注記、該当時のみ）
│   ├─ RankBoard（ランキング本体。TierLegendを直後に併置）
│   │   └─ RowBreakdown（行を開いたときの内訳、DiffBarも使用）
│   ├─ ConsolidationCallout（Buyeeの同梱案内、該当時のみ）
│   ├─ CostTable（lg以上のみ表示。費目×会社の全社横断表）
│   └─ WhatCouldBeOff（総額の弱点の列挙：estimate/unverified/missingの費目名）
└─ AdSlot（広告。比較の中・横には置かない、と明記）
```

`WeightLadder.tsx` は `compare/` にあるが `Calculator.tsx` からは import されていない（grep で `Calculator.tsx` 内に参照なし）。コード内コメントに「段ごとの総額の表（WeightStepTable）はここに居たが外した」とあり、現状は使われていない過去のコンポーネントである可能性が高い（このタスクでは呼び出し元を全リポジトリ検索していないため断定はしない）。

## 2. 画面上の情報の並び順（上から）

1. 入力行（Ship to / Storage days / Ship by / [Province]）+ 商品追加欄
2. 箱の絵（ParcelView、lg以上ではカートと横並びで同じ視界）
3. カート（ItemList、各品の価格・重量・確度マーク）
4. 未価格化品目数の注記（該当時）
5. Summary（1行要約）
6. StabilityNote（順位の安定性）
7. EmsOnlyNote（比較範囲の開示）
8. RestrictedGoodsNote / AlcoholInCartNote / LongItemsInCartNote / FreeShippingDomesticNote（各種注記、該当時のみ）
9. RankBoard（ランキング、TierLegend）
10. ConsolidationCallout（該当時）
11. CostTable（lg以上のみ）
12. WhatCouldBeOff（総額の弱点）
13. AdSlot

## 3. 入力

コードで確認できた入力は以下（`Calculator.tsx` / `ItemList.tsx` / 各 Picker から）:

- 行き先国（`CountryPicker`、`CountryCode`、7カ国）
- 保管日数（`StorageDaysInput`、既定 45 日、`tier: estimate` の琥珀色で表示）
- 配送方式（`MethodPicker`、既定 `cheapest`。郵便4方式＋価格化済み宅配便。宅配便は国ごとに価格化状況が違い、未価格化の便は選択肢に残しつつ `disabled` で理由を表示）
- 州（`ProvincePicker`、カナダ宛のときのみ表示。既定は未選択＝人口加重平均税率）
- 商品（`SearchBox` / `ManualAdd` 経由で `Item` を追加。各品目に価格・重量の入力欄があり、`ItemList.tsx` の `weightFieldsFor` が扱う）
- 重量（`ItemList` の各行にある重量入力。`weightInputId` でDOM idが振られ、`StabilityNote`の「Check the weights」からフォーカスされる）

寸法（縦横高さ）の直接入力欄は `Calculator.tsx` / `ItemList.tsx` の読了範囲では見つからなかった。`LongItemsInCartNote` のコメントに「寸法は入力にすら無い」と明記されている——**寸法は入力ではなく、`PackingBox`/`ParcelView` が箱の詰め方を計算する内部ロジックの中だけにある可能性が高い**が、`PackingBox.tsx`/`ParcelView.tsx`本体（827行・276行）は冒頭のみ確認しており、寸法計算式の由来までは検証していない。ドメスティック送料（`ASSUMED_DOMESTIC_SHIPPING_YEN`）は `ItemList.tsx` がimportしているが、画面上でユーザーが入力する欄かどうかはこの棚卸しでは確認できていない。

## 4. 出力

- ランキング（`RankBoard`）: 各社の差額（主役、大きい文字）・約総額（小さい文字）・確度に応じた強調（recommended/equivalent バッジ、または判定不能時は専用文言）。行を開くと内訳（`RowBreakdown`）。
- 内訳（`RowBreakdown`＝モバイル向け2列比較、`CostTable`＝デスクトップ向け全社横断表）
- 総額の弱点一覧（`WhatCouldBeOff`）
- 各種注記（比較範囲、安定性、配送可否未確認、寸法未確認、送料無料表示への注意、同梱案内）
- 箱の絵（`ParcelView`/`PackingBox`）と、重量変化に伴うアニメーション（`data-phase`, `data-crossed` などのdata属性でe2eが検証）

## 5. 信頼度の軸：画面に出ているもの／出ていないもの

| 軸 | 画面に出ているか | 根拠 |
|---|---|---|
| `tier`（`fixed` / `estimate` / `unverified` / `none`） | **出ている** | `src/lib/ui/tiers.tsx` の `tierClass`/`tierLabel`/`tierTitle`/`Amount`/`TierLegend` が全額・全費目に適用され、色＋記号（下線点線＝`unverified`、`~`接頭辞＝`estimate`、`—`＝`none`）で区別。`RankBoard`・`RowBreakdown`・`CostTable`・`WhatCouldBeOff`・`StorageDaysInput` 全てで使用。 |
| `confidence` | **出ていない** | `types.ts` にそのような名前のフィールドは無い（grep で確認）。`src/app/sources/page.tsx` に文中で "confidence" という単語が1回出るのみで、UI上の値やフィールドではない。信頼度は `tier` の4段階として表現されており、`confidence` という独立した軸は無い。 |
| `invoice_check` | **出ていない** | `src/lib/pricing/types.ts` にフィールドが無い。`invoice_check` という語は `docs/` の監査文書やテストファイル名にのみ現れ、比較画面のコンポーネントからは参照されていない（grep で確認）。 |
| `amountKind` | **出ていない（値として直接は）** | `types.ts:131` に `amountKind?: AmountKind` があり、`'range'` のときの上端（`134`）や `rangeNote`（`135`）と対になっている。これは `Row`/`CostLine` の内部フィールドで、画面には `amountKind` という文字列そのものではなく、`totalIntervalText`（「¥X 〜 ¥Y」「¥X or more」等）や `RowBreakdown` の「no upper bound」表示として**間接的に反映**されている。フィールド名や `range`/`fixed` といった生の値は画面テキストに出ない。 |
| `unknownCapYen` | **出ていない（値として直接は）** | `types.ts:147` にフィールドあり。`RowBreakdown.tsx` がこれを使って「この費目に上限が置けているか」を判定し、置けていなければ「— no upper bound」という注記を出す（`isUncapped` 判定）。数値そのものは画面に出ない。 |
| `rangeNote` | **出ていない（文字列は間接利用の可能性、未確認）** | `types.ts:135` にコメントで「amountKind が 'range' のときの…根拠（英語）」とあるが、`RowBreakdown.tsx`/`RankBoard.tsx` の読了範囲では `rangeNote` を直接参照する箇所は見つけていない。使用箇所を全文検索していないため「出ていない」と断定はできず、**未確認**として扱う。 |

**重要な観察**: 画面のあらゆる箇所（総額・差額・内訳・入力欄ですら`StorageDaysInput`）が例外なく `tier` の4色/記号規約に従っている。一方で `confidence` や `invoice_check` という名の独立した軸はコードベース自体に存在せず、`amountKind`・`unknownCapYen`・`rangeNote` という「範囲・上限不明の理由」を表す内部フィールドは、生の値やフィールド名としては画面に出ず、`totalIntervalText` や個別の注記文（「no upper bound」「upper bound unknown」等）に変換されてから出る。**つまり「確実／推定／二次情報／未収録」の4段階は前面に出ているが、「なぜ上限が不明か」「どの範囲の根拠か」という、より細かい理由の軸は、内訳を開いた後のnote文でしか読めず、ランキング一覧の見た目そのもの（バッジや色）には出ていない。**

## 6. e2e から読み取れる仕様

- `e2e/parcel.spec.ts`: 重量入力に応じて箱の絵（`data-phase`, `data-crossed`）と送料表示（`parcel-postage`, `parcel-delta`）が更新される。段（EMSの重量ステップ）を跨がない限り差額は「+¥0」「same EMS weight step」、跨ぐと「crossed an EMS weight step」。未価格の状態では `parcel-postage` に「—」（¥0ではない）。Tabキーだけで重量欄に到達できることを検証（キーボード操作性）。ダークモードでも箱の中身が描画されることを検証。
- `e2e/assumed-weights.spec.ts`: `gotoCompare()` ヘルパーを使いモバイル判定のテストがある（CLAUDE.md §6の事故の震源）。
- `e2e/helpers.ts` の `rankButtons()` は Ranking 領域内の `role=button` を「行の数だけ」という前提で数える——このため `RankBoard` 内の「Change shipping method」リンクは `<a>`（role=link）にしてあり `<button>` にしていない（コード内コメントで明記）。
- `e2e/helpers.ts` の `emsOnlyNote` は `data-testid="scope-disclosure"` で開示を掴む。
- `Summary` は `data-testid="summary"` で要素そのものを掴む（文言変更に強くするため、とコメントにあり）。

## 7. レスポンシブの現状

- 入力行: モバイルでは行き先（Country）が先頭（`order-first`）、デスクトップでは末尾（`sm:order-last`）——狭い画面では行き先を先に決めさせる設計（コメントで明言）。
- 箱とカート: `lg` 未満は縦積み（箱が上、カートが下）、`lg` 以上は横並び。DOM順=画面順=フォーカス順を保つため、`order-*` での入れ替えはしていない。
- `RankBoard` の各行: `sm` 未満は縦積み（左のサービス名列と右の差額/総額列を上下に）、`sm` 以上は横並び。412px幅で右列の長い文字列（「or more (upper bound unknown)」等）が左列を潰すバグが過去にあり、それを理由に縦積みへ変更したとコメントにある。
- `CostTable`: `hidden lg:block`——**lg未満では一切表示されない**。モバイル・タブレットでは全社横断の内訳表は見られず、`RowBreakdown`（行を開いたときの2列比較）のみで代替する設計。
- `CandidateDialog`: モバイルは下からの全画面シート（`items-end`、`rounded-t-xl`）、デスクトップは中央ダイアログ（`sm:items-center`、`sm:rounded-xl`）。

## 8. スタイリングの仕組み

**Tailwind CSS のユーティリティクラスのみ**。全コンポーネントのJSXに `className="..."` として直接クラス文字列が書かれている（例: `text-xs text-neutral-500 dark:text-neutral-400`）。CSS Modules（`*.module.css`）はリポジトリ内で検索してもヒットしない。`src/app/globals.css` が存在するが、その中身はこの棚卸しでは開いていない（Tailwindのベース/ディレクティブである可能性が高いが未確認）。ダークモードは `dark:` バリアントで全面的に対応している。数値表示には `num`（tabular-nums相当と思われるクラス、定義箇所は未確認）が多用されている。
