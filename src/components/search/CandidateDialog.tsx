'use client';

import { useEffect } from 'react';
import { yen } from '@/lib/ui/format';
import type { Candidate } from './types';

/** デスクトップは中央ダイアログ、モバイルは全画面シート。 */
export function CandidateDialog({
  candidates, onPick, onClose,
}: {
  candidates: Candidate[];
  onPick: (c: Candidate) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Choose a listing"
        className="max-h-[85dvh] w-full max-w-2xl overflow-y-auto rounded-t-xl bg-white p-4 dark:bg-neutral-900 sm:rounded-xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Which listing?</h2>
          <button type="button" onClick={onClose} className="text-xs text-neutral-500 underline">
            Close
          </button>
        </div>
        <p className="mt-1 text-xs text-neutral-500">
          Prices here come from search results, so they are a reference. You can edit them,
          or paste the listing URL to get the exact price.
        </p>
        <ul className="mt-3 divide-y divide-neutral-100 dark:divide-neutral-800">
          {candidates.map((c) => (
            <li key={c.url}>
              <button
                type="button"
                onClick={() => onPick(c)}
                className="flex w-full items-center gap-3 py-2 text-left"
              >
                {c.imageUrl ? (
                  // 各ECのCDN画像。next/image は使わない（外部ドメインが無数にある）。
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.imageUrl}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded object-cover"
                    loading="lazy"
                  />
                ) : (
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded border border-neutral-200 text-[10px] text-neutral-400 dark:border-neutral-700">
                    no image
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{c.title}</span>
                  <span className="mt-0.5 inline-block rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                    {c.siteName}
                  </span>
                </span>
                <span className="shrink-0 text-right text-sm num">
                  {c.priceYen == null ? (
                    <span className="text-xs text-amber-700 dark:text-amber-400">
                      price not shown —<br />you&apos;ll enter it
                    </span>
                  ) : (
                    <span className="text-amber-700 dark:text-amber-400">~{yen(c.priceYen)}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
