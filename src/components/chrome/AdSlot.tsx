'use client';

import { useConsent } from './ConsentBanner';

/**
 * 広告は結果の**下**・フッターの**上**でしか使わない（docs/design/ad-placement.md §3）。
 * 同意が無い限り何も描画しない（外部スクリプトも読み込まない）。
 * 見た目は Mock v3 `.adzone`: 紙ではないフラットな灰・1px 実線・system font。
 * 幅の判定は CSS の container query（`.adslot` が 320×100 に切り替わる）に任せ、JS で測らない。
 */
export function AdSlot() {
  if (useConsent() !== 'granted') return null;

  return (
    <aside className="adzone" aria-label="Advertisement">
      <span className="adlabel">Advertisement</span>
      <div className="adslot">reserved · renders only after ad consent</div>
      <span className="adnote">Ads are served by Google and do not affect the ranking.</span>
    </aside>
  );
}
