'use client';

import { useConsent } from './ConsentBanner';

/**
 * 広告は結果の**下**（比較結果ブロック全体の後、フッターの前）でしか使わない。
 * 呼び出し側（`Calculator`）が「結果が無い」状態では描画しない
 * （§3.3「結果が無い状態で広告だけが残る表示」の禁止に対応）。
 * 同意が無い限り何も描画しない（外部スクリプトも読み込まない）。
 * AdSense のタグは審査が通ってから入れる。今はプレースホルダ。
 *
 * 禁止配置（docs/design/ad-placement.md §3.3。ここに書き写して以後の変更で
 * 見落とさないようにする ── 詳細な理由は原文参照）:
 * - 順位ボードの行間、行の上下に接する位置、配達ログの中、要約・条件行の近く
 * - 行の開閉トグル・「代行サイトへ」リンク・入力欄から 200px 未満
 * - sticky／フローティング／ポップアップ／自動リフレッシュ／点滅アニメ
 * - 広告の近くに代行会社名・ロゴ・順位番号・価格を置くこと（特定の行と
 *   対応付けて見えるため）
 * - 結果が無い（エラー・未入力）状態で広告だけが残る表示
 *
 * ラベル・余白・サイズは同 §3.4 の推奨に従う:
 * - ラベルは "Advertisement"（AdSense の見出し規定に適合する語）。中立性の注記は
 *   ラベルとは分け、枠の**下**に小さく置く。
 * - 上下 48px 以上の余白 + 全幅の罫線で結果ブロックと切り離す。
 * - 枠自体は 1px 実線・紙とは明確に違うフラットな灰（--color-ad-bg）、角丸は
 *   順位ボードの行（角丸無し）と違う値にする。
 * - 高さは `min-height` **と** `max-height` の両方で固定し、大きいクリエイティブが
 *   入っても枠が伸びない（`overflow-hidden`）。no-fill でも畳まない。
 *   `clientWidth` などJSでの幅判定はしない ── 判定自体がレイアウトを動かしうる。
 *   代わりに Tailwind の既定ブレークポイント（sm=640 / md=768、この main は
 *   px-4 なので本文カラム幅 ≒ viewport-32px）で本文カラム幅を近似する:
 *     - mobile（<640px）: 320×100
 *     - tablet/狭い desktop（640〜767px、本文カラムは概ね <728px）: 300×250
 *     - desktop（≥768px、本文カラムは概ね ≥728px）: 728×90
 */
export function AdSlot() {
  if (useConsent() !== 'granted') return null;

  return (
    <aside
      aria-label="Advertisement"
      className="my-12 flex flex-col items-center gap-1.5 border-y border-ink-2 py-12"
    >
      <span className="text-[11px] text-ink-2">Advertisement</span>
      <div
        className="flex min-h-[100px] max-h-[100px] w-[320px] max-w-full items-center justify-center overflow-hidden rounded-sm border border-ink-2 bg-ad-bg text-xs text-ink-2 sm:min-h-[250px] sm:max-h-[250px] sm:w-[300px] md:min-h-[90px] md:max-h-[90px] md:w-[728px]"
      >
        ad slot
      </div>
      <span className="text-[10.5px] text-ink-2">
        Ads are served by a third party and do not affect the ranking.
      </span>
    </aside>
  );
}
