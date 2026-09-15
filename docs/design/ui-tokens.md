# デザイントークン契約（PR-A / PR-B / PR-C 共通）

PR-A（このPR）が `src/app/globals.css` に定義した。PR-B（順位ボード）・PR-C（条件欄・カート・要約）はこの名前をそのまま使う前提で並行作業している。**名前を変えるとマージ前提が崩れる。**

正: `git show origin/claude/mock-v3-shapes:prototypes/mock-v3.html` （Mock v3）。

## 色（`@theme` の `--color-*`）

| トークン | 値 | 用途 |
|---|---|---|
| `--color-paper` | `#F2EDE3` | 紙の地色（body 背景） |
| `--color-paper-2` | `#E9E2D3` | 1段濃い紙（Mock の `--paper2`。カード・行の交互背景など） |
| `--color-ink` | `#1B1A17` | 本文の文字色 |
| `--color-ink-2` | `#5B574E` | 補助文字（Mock の `--ink2`。注記・ラベル・薄い罫線寄りの文字） |
| `--color-rule` | `rgba(27, 26, 23, 0.28)` | 罫線（Mock の `--hair`）。`rgba` なのでそのまま `border-rule` 等で使う。Tailwind の不透明度修飾子（`border-rule/50` 等）とは合成できない前提で扱うこと |
| `--color-post-red` | `#D7261E` | アクセント（警告・ロゴの一部・注意喚起） |
| `--color-post-blue` | `#2B3A8C` | アクセント（リンク・強調数値。Mock の `--indigo`） |
| `--color-ad-bg` | `#DEDEDE` | 広告枠のフラットな灰。紙（paper/paper-2）と明確に区別するための専用トークン |

Tailwind のユーティリティは `bg-paper` / `text-ink` / `border-rule` のように使える（`@theme` の `--color-*` は自動的に `bg-*`/`text-*`/`border-*` などを生成する）。

**既存のトークン（emerald/amber 等、tier の色。`src/lib/ui/tiers.tsx` 等が Tailwind デフォルトパレットを直接使っている）は消していない。** B・C がそれぞれ自分の担当箇所で置き換える。

## フォント（`@theme inline` の `--font-*`）

next/font/google（`src/app/layout.tsx`）で読み込み、`variable` 経由で `<html>` に CSS 変数として渡している。`@theme inline` 側でその変数を Tailwind のフォントトークンに接続する（プレーンな `@theme` だとスコープ変数の解決が一段遅れるため、フォントのブロックだけ `inline` にしてある）。

| Tailwind トークン | next/font エクスポート | 変数名 | 用途 |
|---|---|---|---|
| `--font-display` | `Big_Shoulders`（weight 700/800） | `--font-big-shoulders` | ロゴのみ（`SiteHeader` の "proxycost"）。本文には使わない |
| `--font-sans` | `Public_Sans`（weight 400/500/600/700） | `--font-public-sans` | 本文。和文フォールバックはシステムフォント（`Hiragino Sans`, `Noto Sans JP`）任せ ── IBM Plex Sans JP はセルフホストしない（和文サブセットをバンドルに乗せるコストを避ける判断） |
| `--font-mono` | `Spline_Sans_Mono`（weight 400/500/600/700） | `--font-spline-mono` | 数字・コード。`.num`（`tabular-nums`）と併用する |

`body` は `bg-paper text-ink font-sans` を既定にした（`src/app/layout.tsx`）。数字用ユーティリティは既存の `.num`（`font-variant-numeric: tabular-nums`）をそのまま使う。`font-mono` にも `tabular-nums`（Spline Sans Mono の等幅数字）を使ってよい。

## ダークモード

`prefers-color-scheme: dark` のときも `paper`/`ink` 系トークンは固定値のまま切り替えない（Mock 自体がライトのみの一枚の見た目を志向しているため）。既存の `--bg` / `--panel` / `--line`（`:root` の非トークン変数。`src/lib/ui/glyphs/*` などが直接 `var(--panel)` 等を参照）はダーク時に切り替わる値のまま残してある ── `body` の背景だけがそれらを使わなくなった。`SiteHeader` / `SiteFooter` / `AdSlot` / `ConsentBanner` に `dark:` バリアントは付けていない。他のコンポーネントの `dark:` クラスは B・C の担当なので触っていない。

## 広告枠

`docs/design/ad-placement.md` §3 の推奨に従う。詳細は `src/components/chrome/AdSlot.tsx` のコメント参照:
- ラベルは `Advertisement`
- 結果ブロックとの間に上下 48px 以上の余白 + 全幅の罫線（`border-y`）
- 枠は 1px 実線・`--color-ad-bg`
- desktop 728×90 / mobile 320×100 を `min-height`/`width` で高さ・幅を予約（CLS ゼロ）。幅の切り替えは CSS のブレークポイントのみで行い、`clientWidth` 等の JS 判定はしない
- 同意前は描画しない現行方式（`useConsent() !== 'granted' → null`）を維持。呼び出し位置（`Calculator` 内）は変えていない
