'use client';

import { useSyncExternalStore } from 'react';

const KEY = 'proxycost.consent.v1';
const EVENT = 'proxycost:consent';

/** 'unknown' はサーバ側＝まだ利用者の選択を知りようがない状態。 */
export type Consent = 'granted' | 'denied' | null | 'unknown';

function read(): Consent {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === 'granted' || v === 'denied' ? v : null;
  } catch {
    // プライベートウィンドウ等でストレージが使えなくても画面を壊さない。同意なし扱い。
    return null;
  }
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener('storage', cb);
  };
}

/**
 * 同意はブラウザ側にしか無い外部ストア。effect で setState すると
 * カスケード再描画になるので useSyncExternalStore で読む。
 *
 * サーバ側は 'unknown' を返す。ここで null（＝未選択）を返すと、
 * **既に選択済みの再訪者にも一瞬バナーが描画されて hydration 後に消える。**
 * 選択済みの相手に同意を訊き直す見た目になるので、知らないうちは何も出さない。
 */
export function useConsent(): Consent {
  return useSyncExternalStore(subscribe, read, () => 'unknown' as const);
}

export function setConsent(v: Exclude<Consent, null>) {
  try {
    window.localStorage.setItem(KEY, v);
  } catch {
    // 保存できなくても、この描画の間は選択を反映する。
  }
  window.dispatchEvent(new Event(EVENT));
}

export function ConsentBanner() {
  // null（未選択）のときだけ訊く。'unknown'（サーバ側）では何も出さない。
  const consent = useConsent();
  if (consent !== null) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-neutral-200 bg-white/95 p-4 backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/95"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 text-xs sm:flex-row sm:items-center sm:justify-between">
        <p className="text-neutral-700 dark:text-neutral-300">
          We show ads below the results. Ads may set cookies. Nothing is set until you
          choose. The calculator itself works either way and stores nothing about you.
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => setConsent('denied')}
            className="rounded border border-neutral-300 px-3 py-1.5 dark:border-neutral-700"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={() => setConsent('granted')}
            className="rounded bg-neutral-900 px-3 py-1.5 text-white dark:bg-neutral-100 dark:text-neutral-900"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
