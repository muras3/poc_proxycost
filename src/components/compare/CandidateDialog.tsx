'use client';

import { useEffect, useRef } from 'react';
import type { Candidate } from '@/lib/search/types';
import { yen } from '@/lib/ui/format';

/**
 * キーワード検索の候補（Mock v3 `openCandidates`: `.scrim > .dlg`）。
 * デスクトップは中央のダイアログ、狭い幅（`@container (max-width:760px)`）では下からのシート。
 * どちらにするかは CSS の container query が決めるので、`sheet` は常に付ける。
 * Esc・「Close」・幕のクリックで閉じ、開く前にフォーカスがあった要素へ戻す。Tab は中に閉じ込める。
 */
export function CandidateDialog({
  query, candidates, onPick, onClose,
}: {
  query: string;
  candidates: Candidate[];
  onPick: (c: Candidate) => void;
  onClose: () => void;
}) {
  const layer = useRef<HTMLDivElement | null>(null);
  const restore = useRef<Element | null>(null);

  useEffect(() => {
    restore.current = document.activeElement;
    layer.current?.querySelector<HTMLButtonElement>('.cand')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab' || !layer.current) return;
      const f = Array.from(layer.current.querySelectorAll<HTMLElement>('button,input'));
      if (!f.length) return;
      const i = f.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1]!.focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0]!.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const r = restore.current;
      if (r instanceof HTMLElement && document.body.contains(r)) r.focus();
    };
  }, [onClose]);

  return (
    <div
      ref={layer}
      className="scrim sheet"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="dlg" role="dialog" aria-modal="true" aria-labelledby="dlgT">
        <header>
          <h2 id="dlgT">Results for &ldquo;<span className="jp">{query}</span>&rdquo;</h2>
          <button type="button" className="link" onClick={onClose}>Close</button>
        </header>
        <div className="body">
          {candidates.map((c) => (
            <button type="button" className="cand" key={c.url} onClick={() => onPick(c)}>
              {c.imageUrl ? (
                // 各ECのCDN画像。next/image は使わない（外部ドメインが無数にある）。
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.imageUrl} alt="" className="thumb" style={{ objectFit: 'cover' }} loading="lazy" />
              ) : (
                <span className="thumb" aria-hidden="true">img</span>
              )}
              <span style={{ minWidth: 0 }}>
                <span className="ititle">{c.title}</span>
                <span className="imeta"><span className="chip">{c.siteName}</span></span>
              </span>
              {c.priceYen == null ? (
                <span className="p none">no price —<br />you&rsquo;ll enter it</span>
              ) : (
                <span className="p" aria-label={`reference price about ${yen(c.priceYen)}`}>≈{yen(c.priceYen)}</span>
              )}
            </button>
          ))}
        </div>
        <footer>Prices here are reference prices; paste the listing URL for the exact one. One query, no paging.</footer>
      </div>
    </div>
  );
}
