'use client';

import { useState } from 'react';
import type { Draft } from '@/components/compare/useCompare';
import type { Candidate, SearchResponse } from './types';
import { CandidateDialog } from './CandidateDialog';

/**
 * 入力欄は1つ。`http` で始まれば URL 取得（確定値）、それ以外はキーワード検索（参考値）。
 * 判定は文字列の先頭だけ。利用者にモードを選ばせない（docs/UI-DESIGN.md §2）。
 */
export function SearchBox({ onAdd }: { onAdd: (d: Draft) => void }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = q.trim();
    if (!text || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      if (/^https?:\/\//i.test(text)) {
        const r = await fetch(`/api/product?url=${encodeURIComponent(text)}`);
        const body = (await r.json()) as {
          ok?: boolean; title?: string; priceYen?: number | null;
          site?: Draft['site']; imageUrl?: string | null; reason?: string;
        };
        if (!r.ok || !body.ok || !body.title) {
          setNotice(body.reason ?? 'Could not read that page. Add it by hand below.');
        } else {
          onAdd({
            title: body.title,
            priceYen: body.priceYen ?? null,
            priceTier: 'fixed',
            site: body.site ?? 'other',
            url: text,
            imageUrl: body.imageUrl ?? null,
          });
          setQ('');
        }
      } else {
        const r = await fetch(`/api/search?q=${encodeURIComponent(text)}`);
        const body = (await r.json()) as SearchResponse;
        if (!body.configured) {
          // キーが無いことを隠さない。URL を貼る道へ落とす。
          setNotice(
            body.reason
            ?? 'Keyword search is not configured on this deployment. Paste a listing URL instead.',
          );
        } else if (!body.results.length) {
          setNotice('No listings found. Paste a listing URL instead.');
        } else {
          setCandidates(body.results);
        }
      }
    } catch {
      setNotice('Search is unavailable right now. Paste a listing URL instead.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <form onSubmit={submit} className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Paste a listing URL, or search by keyword"
          aria-label="Listing URL or keyword"
          className="min-w-0 flex-1 rounded border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
        />
        <button
          type="submit"
          disabled={busy}
          className="shrink-0 rounded bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {busy ? '…' : 'Add'}
        </button>
      </form>
      {notice && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">{notice}</p>
      )}
      {candidates && (
        <CandidateDialog
          candidates={candidates}
          onClose={() => setCandidates(null)}
          onPick={(c) => {
            onAdd({
              title: c.title,
              priceYen: c.priceYen,
              // 検索由来は参考値。商品ページ由来だけが確定値。
              priceTier: 'estimate',
              site: c.site,
              url: c.url,
              imageUrl: c.imageUrl,
            });
            setCandidates(null);
            setQ('');
          }}
        />
      )}
    </div>
  );
}
