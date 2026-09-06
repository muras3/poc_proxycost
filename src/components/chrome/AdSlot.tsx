'use client';

import { useConsent } from './ConsentBanner';

/**
 * 広告は結果の**下**でしか使わない。比較表の中・横には置かない。
 * 同意が無い限り何も描画しない（外部スクリプトも読み込まない）。
 * AdSense のタグは審査が通ってから入れる。今はプレースホルダ。
 */
export function AdSlot() {
  if (useConsent() !== 'granted') return null;

  return (
    <aside className="mt-10">
      <p className="mb-1 text-[11px] uppercase tracking-wide text-neutral-500">
        Ad · unrelated to the ranking
      </p>
      <div className="flex h-24 items-center justify-center rounded border border-dashed border-neutral-300 text-xs text-neutral-400 dark:border-neutral-700">
        ad slot
      </div>
    </aside>
  );
}
