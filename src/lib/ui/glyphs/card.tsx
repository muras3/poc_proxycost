import type { ReactNode } from 'react';
import { BASE, Parts, prism, rect, ln, lnL } from './primitives';
import type { CardP } from './shapes';

// 1枚のカード。厚みと外枠だけが変わる。
export function drawCard(s: CardP): ReactNode {
  const p = prism(50 - (s.d * 0.55) / 2, BASE, s.w, s.h, s.d, s.r);
  const { x, y, w, h } = p;
  const o: ReactNode[] = [];
  if (s.kind === 'photo') {
    o.push(p.node, rect(x + 3, y + 3, w - 6, h - 9, 'd', 1.5));
  } else if (s.kind === 'sleeve') {
    // 硬質スリーブ。カードより一回り大きい透明の外枠。
    o.push(rect(x - 4.5, y - 3, w + 9, h + 6, 'paper', 1.5));
    o.push(p.node);
    o.push(rect(x + 3, y + 3, w - 6, h - 9, 'd', 1));
    o.push(lnL(x - 4.5, y - 3, x + w + 4.5, y - 3));
  } else {
    // スラブ。厚い枠・上にラベル板・下の窓にカード。
    o.push(p.node);
    o.push(rect(x + 4, y + 4, w - 8, 13, 'paper', 1));
    o.push(ln(x + 7, y + 8.5, x + w - 7, y + 8.5), ln(x + 7, y + 12.5, x + w - 14, y + 12.5));
    o.push(rect(x + 6, y + 21, w - 12, h - 27, 'paper', 1));
    o.push(rect(x + 8, y + 23, w - 16, h - 31, 'd', 1));
  }
  return <Parts of={o} />;
}
