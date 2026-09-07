import type { ReactNode } from 'react';
import { BASE, Parts, rect, circ, ln, lnL, path, pathL } from './primitives';
import type { PacketP } from './shapes';

// 柔らかい袋。**封の作り**（合掌／ガゼット／ジッパー／折り）と中身の印で5種を分ける。
export function drawPacket(s: PacketP): ReactNode {
  const o: ReactNode[] = [];
  if (s.kind === 'pillow') {
    const x = 27, w = 46, y = BASE - 38, h = 38;
    o.push(path(`M${x} ${y + 3} Q${x - 3} ${y + h / 2} ${x} ${y + h - 3} L${x + w} ${y + h - 3} Q${x + w + 3} ${y + h / 2} ${x + w} ${y + 3}Z`, 'f'));
    o.push(rect(x, y, w, 3.5, 'd'), rect(x, y + h - 3.5, w, 3.5, 'd'));
    o.push(lnL(x + 2, y + 1.7, x + w - 2, y + 1.7, { dash: true }));
    o.push(lnL(x + 2, y + h - 1.7, x + w - 2, y + h - 1.7, { dash: true }));
    o.push(circ(50, y + h / 2, 7, 'l'));
  } else if (s.kind === 'standup') {
    const w = 34, h = 52, x = 50 - w / 2, y = BASE - h;
    o.push(path(`M${x + 3} ${BASE} Q50 ${BASE - 4} ${x + w - 3} ${BASE} L${x + w} ${y + 5} L${x} ${y + 5}Z`, 'f'));
    o.push(rect(x, y, w, 5, 'd'));
    o.push(path(`M${x + 3} ${BASE - 8} Q50 ${BASE - 12} ${x + w - 3} ${BASE - 8}`, 'none'));
    o.push(rect(x + 6, y + 16, w - 12, 16, 'paper', 0.5), circ(50, y + 24, 4, 'l'));
  } else if (s.kind === 'brick') {
    const w = 46, h = 44, x = 50 - w / 2, y = BASE - h;
    o.push(path(`M${x - 4} ${y + 4} l4 -2 v${h - 4} l-4 -2z`, 'd'));
    o.push(path(`M${x + w + 4} ${y + 4} l-4 -2 v${h - 4} l4 -2z`, 'd'));
    o.push(rect(x, y, w, h, 'f', 2));
    o.push(path(`M${x} ${y + h * 0.42} L${x + w} ${y + h * 0.2} V${y + h * 0.5} L${x} ${y + h * 0.72}Z`, 'd'));
    o.push(pathL(`M${x + 6} ${y + h * 0.9} q4 -4 8 0 q4 4 8 0 q4 -4 8 0 q4 4 8 0`));
  } else if (s.kind === 'zip') {
    const w = 34, h = 56, x = 50 - w / 2, y = BASE - h;
    o.push(rect(x, y + 8, w, h - 8, 'l', 1));
    o.push(rect(x, y, w, 8, 'd', 1), circ(50, y + 4, 1.8, 'paper'));
    o.push(ln(x + 2, y + 12, x + w - 2, y + 12, { dash: true }));
    o.push(path(`M${x + 6} ${y + 40} q5 -10 10 0 t10 0 t8 -4`, 'none', { sw: 3.6, extra: { strokeOpacity: 0.42 } }));
    o.push(path(`M${x + 6} ${y + 26} q5 -10 10 0 t10 0 t8 -4`, 'none', { sw: 3.6 }));
  } else {
    const w = 30, h = 40, x = 50 - w / 2, y = BASE - h;
    o.push(rect(x, y + 6, w, h - 6, 'l', 1));
    o.push(rect(x - 1, y, w + 2, 7, 'd', 0.6));
    o.push(circ(x + w * 0.35, y + h * 0.52, 6, 'd'), circ(x + w * 0.35, y + h * 0.52, 1.6, 'paper'));
    o.push(path(`M${x + w * 0.6} ${y + h * 0.3} q10 8 -2 18 q8 4 6 12`, 'none'));
  }
  return <Parts of={o} />;
}
