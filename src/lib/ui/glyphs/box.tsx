import type { ReactNode } from 'react';
import { BASE, Parts, prism, rect, ln, lnL, mark } from './primitives';
import type { BoxP } from './shapes';

// 立てた化粧箱。窓・帯・比率だけで7種のフィギュアと箱入り時計を分ける。
export function drawBox(s: BoxP): ReactNode {
  const p = prism(50 - (s.d * 0.55) / 2, BASE, s.w, s.h, s.d, 1.2);
  const { x, y, w, h } = p;
  const o: ReactNode[] = [p.node];
  if (s.win) {
    const [fx, fy, fw, fh] = s.win;
    o.push(rect(x + w * fx, y + h * fy, w * fw, h * fh, 'paper', 1));
    // 窓ガラスの反射。中身があることを一本の線で言う。
    o.push(lnL(x + w * fx + 2, y + h * fy + h * fh - 3, x + w * fx + w * fw * 0.45, y + h * fy + 2));
  }
  if (s.band === 'bottom') o.push(rect(x, y + h * 0.84, w, h * 0.16, 'd'));
  if (s.band === 'top') o.push(rect(x, y, w, h * 0.1, 'd'));
  if (s.mark) o.push(mark(x + w / 2, y + h * 0.84 + h * 0.16 * 0.72, s.mark));
  if (s.lid) {
    o.push(ln(x, y + h * 0.38, x + w, y + h * 0.38));
    o.push(ln(x + w, y + h * 0.38, x + w + p.dx, y + h * 0.38 - p.dy));
    o.push(rect(x + w / 2 - 3.5, y + h * 0.38 - 3, 7, 6, 'paper', 0.8));
  }
  return <Parts of={o} />;
}
