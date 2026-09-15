'use client';

import type { ReactNode } from 'react';
import { NoteButton } from './Popover';

/**
 * 秤の針（Mock v3 `wmk`）。カートのどれかの重量が1位を決めているときに出す。
 * 針は一定の角度で揺れる（揺れ幅そのものに意味は無く「不確かだ」を形で言う）。
 * `prefers-reduced-motion` では同じ角度幅の静止した扇形になる（CSS の `.wfan`）。
 */
export function WeightNeedle({
  body, label = 'How sensitive this is to weight',
}: { body: ReactNode; label?: string }) {
  const amp = 14;
  const rad = (amp * Math.PI) / 180;
  const r = 9;
  const cx = 9;
  const cy = 11;
  const lx = (cx + r * Math.sin(-rad)).toFixed(1);
  const ly = (cy - r * Math.cos(-rad)).toFixed(1);
  const rx = (cx + r * Math.sin(rad)).toFixed(1);
  const ry = (cy - r * Math.cos(rad)).toFixed(1);
  return (
    <NoteButton
      className="wmk"
      title={label}
      label={label}
      body={body}
      style={{ ['--wamp' as string]: `${amp}deg` }}
      testId="weight-needle"
    >
      <svg viewBox="0 0 18 18" aria-hidden="true">
        <path className="wfan" d={`M${cx},${cy} L${lx},${ly} A${r} ${r} 0 0 1 ${rx},${ry} Z`} />
        <line x1="1" y1="15" x2="17" y2="15" stroke="var(--ink2)" strokeWidth="1.2" />
        <line className="wneedle" x1={cx} y1={cy} x2={cx} y2="2" stroke="var(--red)" strokeWidth="1.6" />
        <circle cx={cx} cy={cy} r="1.5" fill="var(--ink)" />
      </svg>
    </NoteButton>
  );
}
