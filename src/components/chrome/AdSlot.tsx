'use client';

import { useConsent } from './ConsentBanner';

/**
 * 広告は結果の**下**でしか使わない。比較表の中・横には置かない。
 * 同意が無い限り何も描画しない（外部スクリプトも読み込まない）。
 * AdSense のタグは審査が通ってから入れる。今はプレースホルダ。
 *
 * ラベル・余白・サイズは docs/design/ad-placement.md §3 の推奨に従う:
 * - ラベルは "Advertisement"（AdSense の見出し規定に適合する語）
 * - 上下 48px 以上の余白 + 全幅の罫線で結果ブロックと切り離す
 * - 枠自体は 1px 実線・紙とは明確に違うフラットな灰（--color-ad-bg）
 * - desktop 728×90 / mobile 320×100 を `min-height` で高さ予約（CLS ゼロ）。
 *   `clientWidth` などJSでの幅判定はしない ── 判定自体がレイアウトを動かしうる。
 */
export function AdSlot() {
  if (useConsent() !== 'granted') return null;

  return (
    <aside
      aria-label="Advertisement"
      className="my-12 flex flex-col items-center gap-1.5 border-y border-ink-2 py-12"
    >
      <span className="text-[11px] text-ink-2">Advertisement</span>
      <div className="flex min-h-[100px] w-[320px] max-w-full items-center justify-center rounded-sm border border-ink-2 bg-ad-bg text-xs text-ink-2 md:min-h-[90px] md:w-[728px]">
        ad slot
      </div>
      <span className="text-[10.5px] text-ink-2">
        Ads are served by Google and do not affect the ranking.
      </span>
    </aside>
  );
}
