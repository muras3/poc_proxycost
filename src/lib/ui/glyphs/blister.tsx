import type { ReactNode } from 'react';
import { BASE, Parts, rect, circ, ln, lnL, path } from './primitives';
import type { BlisterP } from './shapes';

// 吊り下げ台紙にブリスター。**台紙は共通で、中身の輪郭だけが変わる。**
export function drawBlister(s: BlisterP): ReactNode {
  const x = 50 - s.w / 2;
  const y = BASE - s.h;
  const [bw, bh] = s.bub;
  const bx = 50 - bw / 2;
  const by = y + 11 + (s.h - 14 - bh) / 2;
  const cx = 50;
  const cy = by + bh / 2;
  const o: ReactNode[] = [
    rect(x, y, s.w, s.h, 'paper', 2),
    circ(50, y + 5, 2, 'l'),
    rect(bx, by, bw, bh, 'l', 3),
  ];
  if (s.content === 'terminal') {
    o.push(circ(cx - 5, cy - 4, 2, 'd'), circ(cx + 5, cy - 4, 2, 'd'));
    o.push(path(`M${cx - 4} ${cy + 2} v6 q0 3 3 3 q3 0 3 -3`, 'none'));
    o.push(path(`M${cx + 5} ${cy + 1} v5 q0 3 -3 3`, 'none'));
  } else if (s.content === 'jig') {
    o.push(path(`M${cx} ${by + 5} L${cx + 3.5} ${cy - 4} L${cx + 2.5} ${by + bh - 6} L${cx - 2.5} ${by + bh - 6} L${cx - 3.5} ${cy - 4}Z`, 'd'));
    o.push(circ(cx, by + 4, 1.6, 'none'));
    o.push(lnL(cx, cy - 10, cx, cy + 10));
  } else if (s.content === 'minnow') {
    o.push(path(`M${cx - 12} ${cy} q4 -6 14 -6 q6 0 10 4 l3 -4 v10 l-3 -4 q-4 4 -10 4 q-10 0 -14 -4z`, 'd'));
    o.push(circ(cx - 7, cy - 1.8, 1.2, 'paper'));
    o.push(path(`M${cx - 2} ${cy + 4} v4 m-2.5 0 h5`, 'none'), path(`M${cx + 8} ${cy + 4} v4 m-2.5 0 h5`, 'none'));
  } else if (s.content === 'jighead') {
    o.push(circ(cx - 4, cy - 5, 5.5, 'd'), circ(cx - 6, cy - 6.5, 1.2, 'paper'));
    o.push(path(`M${cx + 1} ${cy - 4} h6 v9 q0 4 -4 4 q-3 0 -3 -3`, 'none', { sw: 1.3 }));
  } else if (s.content === 'egi') {
    o.push(path(`M${cx} ${by + 5} q6 8 5 22 q-1 12 -5 16 q-4 -4 -5 -16 q-1 -14 5 -22z`, 'd'));
    o.push(path(`M${cx - 5} ${cy + 2} l-5 5 l5 -1`, 'f'), path(`M${cx + 5} ${cy + 2} l5 5 l-5 -1`, 'f'));
    o.push(circ(cx - 2.5, by + 13, 1.2, 'paper'), circ(cx + 2.5, by + 13, 1.2, 'paper'));
    for (let i = 0; i < 5; i++) o.push(ln(cx - 6 + i * 3, by + bh - 5, cx - 8 + i * 4, by + bh - 2));
  } else {
    o.push(circ(cx, cy, 12, 'd'), circ(cx, cy, 7.5, 'f'), circ(cx, cy, 2.2, 'paper'));
    o.push(circ(cx, cy, 10, 'none', { extra: { stroke: 'var(--panel)' } }));
  }
  return <Parts of={o} />;
}
