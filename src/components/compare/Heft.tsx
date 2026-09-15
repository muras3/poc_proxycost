'use client';

import { useLayoutEffect, useRef } from 'react';
import type { Item, Row } from '@/lib/pricing/types';
import { BoxArt } from './BoxArt';
import { boxWord, kg } from './mockFormat';

const SINK = 16;
const BAR_Y = 62 - 12;

function reduceMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * 秤（Mock v3 `#heft`）。1位の行の実際の箱（`Row.boxes`）が台に乗り、総重量ぶん沈む。
 * 右の目盛りは 5・10・20・40・80 kg のうち総重量が収まる最小の枠。
 * **箱・重量・方式は `compare()` の値をそのまま描くだけ**で、ここでは何も再計算しない。
 */
export function Heft({ row, items }: { row: Row | null; items: readonly Item[] }) {
  const boxesRef = useRef<HTMLDivElement | null>(null);
  const prevN = useRef<number | null>(null);
  const prevSig = useRef<string | null>(null);

  const bs = row?.boxes ?? [];
  const total = bs.reduce((s, b) => s + b.weightG, 0);
  const n = bs.length;
  const scale = [5, 10, 20, 40, 80].find((v) => v * 1000 >= total) ?? Math.ceil(total / 20000) * 20;
  const sig = row ? `${row.id}|${bs.map((b) => `${b.weightG}:${b.itemIndices.join(',')}`).join('/')}` : null;

  // 箱が落ちてくる／2箱目が横へ滑り出る（Mock `renderHeft`）。reduced-motion では動かない。
  useLayoutEffect(() => {
    const hb = boxesRef.current;
    if (!hb || !sig) { prevN.current = null; prevSig.current = null; return; }
    const els = [...hb.children] as HTMLElement[];
    if (!reduceMotion() && sig !== prevSig.current && typeof els[0]?.animate === 'function') {
      els.forEach((e, i) => e.animate(
        [{ transform: 'translateY(-26px)', opacity: 0 }, { opacity: 1, offset: 0.4 }, { transform: 'none', opacity: 1 }],
        { duration: 380, delay: i * 60, easing: 'cubic-bezier(.5,0,.9,.6)', fill: 'backwards' },
      ));
      if (prevN.current !== null && prevN.current < n && els.length > 1) {
        const x0 = els[0]!.getBoundingClientRect().left;
        els.slice(1).forEach((e) => {
          const dx = x0 - e.getBoundingClientRect().left;
          e.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }],
            { duration: 560, delay: 420, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
        });
      }
    }
    prevN.current = n;
    prevSig.current = sig;
  }, [sig, n]);

  if (!row || !n || !items.length) return null;

  const ticks = [0, 1, 2, 3, 4].map((k) => ({ v: (scale * k) / 4, y: BAR_Y - SINK + (k / 4) * SINK, major: k % 2 === 0, label: k % 4 === 0 }));
  const text = `${kg(total)} in ${boxWord(n)}${n > 1 ? ` (${bs.map((b) => (b.weightG / 1000).toFixed(1)).join(' + ')})` : ''} · ${row.label}`;

  return (
    <div className="heft" id="heft" data-testid="scale">
      <div className="hstage" aria-hidden="true">
        <div
          className="hplat"
          id="hplat"
          data-testid="scale-platform"
          style={{ transform: `translateY(${(Math.min(total / 1000 / scale, 1) - 1) * SINK}px)` }}
        >
          <div className="hboxes" id="hboxes" ref={boxesRef}>
            {bs.map((b, i) => <span key={i} data-testid="scale-box"><BoxArt box={b} items={items} k={0.5} /></span>)}
          </div>
          <i className="hbar" />
          <i className="hptr" />
        </div>
        <i className="hbase" />
        <div className="hscale" id="hscale">
          {ticks.map((t, k) => (
            <span key={k} style={{ display: 'contents' }}>
              <i className={t.major ? 'm' : ''} style={{ top: t.y }} />
              {t.label && <span style={{ top: t.y }}>{t.v}</span>}
            </span>
          ))}
          <span style={{ top: BAR_Y + 9 }}>kg</span>
        </div>
      </div>
      <div className="htxt">
        <span className="lbl">On the scale · 1st place</span>
        <span className="num" id="heftTxt" data-testid="scale-summary" aria-live="polite">{text}</span>
      </div>
    </div>
  );
}
