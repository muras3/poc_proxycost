'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { CompareResult, Item, ProvinceCode, Row } from '@/lib/pricing/types';
import { Mark } from './Popover';
import { RankRow, type BoardCtx } from './RankRow';

/** 順位の行が入れ替わったときの滑り（FLIP）。順位そのものは遅らせない。 */
export const RANK_SLIDE_MS = 260;
function useRankSlide(listRef: React.RefObject<HTMLOListElement | null>, key: string) {
  const seen = useRef<Map<string, number>>(new Map());
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const lis = Array.from(list.querySelectorAll<HTMLLIElement>('li[data-row-id]'));
    const next = new Map<string, number>();
    for (const li of lis) next.set(li.dataset.rowId ?? '', li.getBoundingClientRect().top);
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!reduce) {
      for (const li of lis) {
        const id = li.dataset.rowId ?? '';
        const from = seen.current.get(id);
        const to = next.get(id);
        if (from == null || to == null || Math.abs(from - to) < 1 || typeof li.animate !== 'function') continue;
        li.animate([{ transform: `translateY(${from - to}px)` }, { transform: 'translateY(0)' }],
          { duration: RANK_SLIDE_MS, easing: 'cubic-bezier(.2,.7,.3,1)' });
      }
    }
    seen.current = next;
  }, [key, listRef]);
}

/**
 * 順位ボード（Mock v3 `.board`）。列: 順位 / 社名＋札 / Ships by＋到着の棒 / 箱数 /
 * vs 1st の差＋棒 / 総額＋不確かさの棒。全行が同じ方式なら Ships by 列は消える（`uniform`）。
 * 比べられない行は順位の後ろに置く（エンジンもそうしているが、ここでも強制する）。
 */
export function Board({
  result, items, wobble, province, onProvince,
}: {
  result: CompareResult;
  items: readonly Item[];
  wobble: ReactNode | null;
  province: ProvinceCode | null;
  onProvince: ((p: ProvinceCode | null) => void) | null;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement | null>(null);
  const rows = result.rows;
  useRankSlide(listRef, rows.map((r) => r.id).join(','));

  const comp = rows.filter((r) => r.comparable);
  const ordered = [...comp, ...rows.filter((r) => !r.comparable)];
  const first = comp[0];
  const uniform = new Set(comp.map((r) => r.method)).size <= 1;
  const maxDiff = Math.max(1, ...comp.map((r) => r.diff));
  const hiMax = comp.length ? Math.max(...comp.map((r) => r.total.high ?? r.total.low)) : 0;

  const consol: BoardCtx['consol'] = {};
  for (const d of rows.filter((r) => r.variant === 'default' && r.comparable)) {
    const c = rows.find((r) => r.serviceId === d.serviceId && r.variant === 'consolidated' && r.comparable);
    if (c && d.total.low - c.total.low > 0) consol[d.id] = { save: d.total.low - c.total.low, unknown: c.total.high === null, name: d.serviceName };
  }
  const pairs: BoardCtx['pairs'] = {};
  for (const d of rows.filter((r) => r.variant === 'default')) {
    const c = rows.find((r) => r.serviceId === d.serviceId && r.variant === 'consolidated');
    if (c && d.boxes.length !== c.boxes.length) { pairs[d.id] = c.boxes.length; pairs[c.id] = d.boxes.length; }
  }
  const ctx: BoardCtx = {
    uniform, maxDiff, hiMax, showBracket: !result.rankIndeterminate, first, consol, pairs, wobble, items, province,
  };

  return (
    <section className={`board ${uniform ? 'uniform' : ''}`} aria-label="Ranking">
      <div className="bh">
        <span className="lbl">Rank</span>
        <span className="lbl">Service</span>
        <span className="lbl c-ship">Ships by / arrives</span>
        <span className="lbl">Boxes</span>
        <span className="lbl r">vs 1st</span>
        <span className="lbl r">
          Total{' '}
          <Mark
            title="How to read a total"
            body={<p><b>¥X – Y</b> the range we can stand behind. The bar under it: dark = the low end we can stand behind, pale = up to the high end, faded off the right edge = no published upper bound. Same scale on every row, so overlapping bars mean &ldquo;can&rsquo;t tell these two apart&rdquo;.</p>}
          />
        </span>
        <span />
      </div>
      <ol className="rows" ref={listRef}>
        {ordered.map((r: Row) => (
          <RankRow
            key={r.id}
            row={r}
            result={result}
            ctx={ctx}
            open={open === r.id}
            onToggle={() => setOpen(open === r.id ? null : r.id)}
            onProvince={onProvince}
          />
        ))}
      </ol>
    </section>
  );
}
