'use client';

import { useEffect, useRef, useState } from 'react';
import { isListingUrl, SITES } from '@/lib/search/sites';
import type { SiteId } from '@/lib/pricing/types';
import type { Candidate, SearchResponse } from '@/lib/search/types';
import { CandidateDialog } from './CandidateDialog';
import type { Draft } from './useCompare';

/**
 * 商品追加（Mock v3 `.add` / `.addsub` / `.notice` / `.manual`）。
 * 入力欄は1つ。`http` で始まれば URL 取得（確定値）、それ以外はキーワード検索（参考値）。
 * 判定は文字列の先頭だけ。利用者にモードを選ばせない（docs/UI-DESIGN.md §2）。
 */

interface Notice { head: string; rest: string }

export function AddBar({
  onAdd, onPending, manualOpen, onManualOpen,
}: {
  onAdd: (d: Draft) => void;
  /** URL を読んでいる間、その URL（カートの「Reading …」行に出る）。終わったら null。 */
  onPending: (url: string | null) => void;
  manualOpen: boolean;
  onManualOpen: (open: boolean) => void;
}) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  // 候補ダイアログ。見出しに検索語を出すので、結果と一緒に語も持つ。
  const [candidates, setCandidates] = useState<{ query: string; results: Candidate[] } | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (manualOpen) titleRef.current?.focus();
  }, [manualOpen]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = q.trim();
    if (!text || busy) return;
    setNotice(null);
    try {
      if (/^https?:\/\//i.test(text)) {
        // 一覧ページを貼られたら取りに行かない。**取っても値段は付かない**
        // （検索結果ページに商品の値段は書いていない）。形を知らないサイトは素通しする。
        if (!isListingUrl(text)) {
          setNotice({
            head: 'That looks like a search or category page, not one listing.',
            rest: 'Open a single item and paste its URL.',
          });
          return;
        }
        setBusy(true);
        onPending(text);
        const r = await fetch(`/api/product?url=${encodeURIComponent(text)}`);
        const body = (await r.json()) as {
          ok?: boolean; title?: string; priceYen?: number | null;
          site?: Draft['site']; imageUrl?: string | null;
          freeShipping?: boolean; reason?: string;
        };
        if (!r.ok || !body.ok || !body.title) {
          setNotice({
            head: 'We couldn’t read that page.',
            rest: body.reason
              ?? 'It may need a login, or it hides its price from us. Add it by hand — you’ll type the price.',
          });
        } else {
          onAdd({
            title: body.title,
            priceYen: body.priceYen ?? null,
            priceTier: 'fixed',
            site: body.site ?? 'other',
            url: text,
            imageUrl: body.imageUrl ?? null,
            // ページから読めたときだけ効かせる。読めなければ undefined で、利用者がトグルで決める。
            ...(body.freeShipping === undefined ? {} : { freeShipping: body.freeShipping }),
          });
          setQ('');
        }
      } else {
        setBusy(true);
        const r = await fetch(`/api/search?q=${encodeURIComponent(text)}`);
        const body = (await r.json()) as SearchResponse;
        if (!body.configured) {
          // キーが無いことを隠さない。URL を貼る道へ落とす。
          setNotice({
            head: 'Keyword search isn’t set up on this copy.',
            rest: body.reason ?? 'Paste a listing URL instead, or add it by hand.',
          });
        } else if (!body.results.length) {
          setNotice({ head: 'No listings found.', rest: 'Paste a listing URL instead, or add it by hand.' });
        } else {
          setCandidates({ query: text, results: body.results });
        }
      }
    } catch {
      setNotice({ head: 'Search is unavailable right now.', rest: 'Paste a listing URL instead, or add it by hand.' });
    } finally {
      setBusy(false);
      onPending(null);
    }
  }

  return (
    <section aria-label="Add items">
      <form className="add" onSubmit={submit} autoComplete="off">
        <label className="sr" htmlFor="q">Listing URL or keyword</label>
        <input
          id="q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Paste a listing URL, or search by keyword (例: ねんどろいど)"
        />
        <button className="btn" type="submit" aria-busy={busy}>
          {busy ? <><span className="spin" aria-hidden="true" />Reading…</> : 'Add'}
        </button>
      </form>
      <div className="addsub">
        <span>URL = the listing&rsquo;s own price · keyword = reference price</span>
        <button
          type="button"
          className="link"
          aria-expanded={manualOpen}
          aria-controls="manual"
          onClick={() => onManualOpen(!manualOpen)}
        >
          Add by hand
        </button>
      </div>
      {notice && (
        <p className="notice" role="alert">
          <span className="bang" aria-hidden="true">!</span>
          <span>
            <b>{notice.head}</b> {notice.rest}{' '}
            <button type="button" className="link act" onClick={() => onManualOpen(true)}>Add by hand</button>
          </span>
        </p>
      )}
      <ManualForm hidden={!manualOpen} titleRef={titleRef} onAdd={(d) => { onAdd(d); onManualOpen(false); }} />
      {candidates && (
        <CandidateDialog
          query={candidates.query}
          candidates={candidates.results}
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
    </section>
  );
}

/**
 * 手入力の口。**これが無いと詰む経路がある** — 検索キーが未設定なら検索は使えず、
 * URL 取得も相手が JSON-LD も OG も出していなければ落ちる。
 * 重量表に載らない商品名を入れれば、重量は 1,000 g の仮置きになり、カートでそう名乗る。
 */
function ManualForm({
  hidden, titleRef, onAdd,
}: { hidden: boolean; titleRef: React.RefObject<HTMLInputElement | null>; onAdd: (d: Draft) => void }) {
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [site, setSite] = useState<SiteId>('yahoo-auctions');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    const p = price.trim() === '' ? null : Number(price.replace(/[^\d]/g, ''));
    onAdd({
      title: t,
      // 手入力は我々の値でも店の値でもなく利用者の値。参考値として扱う。
      priceYen: p != null && Number.isFinite(p) && p > 0 ? p : null,
      priceTier: 'estimate',
      site,
      url: null,
      imageUrl: null,
    });
    setTitle('');
    setPrice('');
  }

  return (
    <form className="manual" id="manual" hidden={hidden} onSubmit={submit} aria-label="Add an item by hand">
      <div className="fld">
        <label className="lbl" htmlFor="mTitle">Item name</label>
        <input id="mTitle" className="jp" ref={titleRef} value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>
      <div className="fld">
        <label className="lbl" htmlFor="mPrice">Price ¥</label>
        <input id="mPrice" inputMode="numeric" placeholder="optional" value={price} onChange={(e) => setPrice(e.target.value)} />
      </div>
      <div className="fld">
        <label className="lbl" htmlFor="mSite">Site</label>
        <select id="mSite" value={site} onChange={(e) => setSite(e.target.value as SiteId)}>
          {SITES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <button className="btn ghost" type="submit">Add by hand</button>
    </form>
  );
}
