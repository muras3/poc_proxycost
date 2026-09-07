import type { ReactNode } from 'react';
import { BASE, Parts, prism, rect, circ, ln, path, n2 } from './primitives';
import type { MediaP } from './shapes';

// 棚に挿す平物。正方形か縦長か・厚み・面の分割（盤面・帯・背・題字）で振る。
export function drawMedia(s: MediaP): ReactNode {
  const p = prism(50 - (s.d * 0.55) / 2, BASE, s.w, s.h, s.d, 1);
  const { x, y, w, h } = p;
  const o: ReactNode[] = [p.node];
  if (s.disc === 'ring') {
    o.push(circ(x + w / 2, y + h / 2, w * 0.38, 'l'), circ(x + w / 2, y + h / 2, w * 0.09, 'paper'));
  }
  if (s.disc === 'label') {
    o.push(circ(x + w / 2, y + h / 2, w * 0.16, 'd'), circ(x + w / 2, y + h / 2, w * 0.03, 'paper'));
    o.push(ln(x + 2, y + h - 2.5, x + w - 2, y + h - 2.5));
  }
  if (s.qr) {
    const q = w * 0.44;
    const cell = (q - 3) / 3;
    o.push(rect(x + w * 0.28, y + h * 0.62, q, q, 'paper', 0.5));
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        if ((i + j) % 2 === 0) {
          o.push(rect(x + w * 0.28 + 1.5 + i * cell, y + h * 0.62 + 1.5 + j * cell, cell, cell, 'd'));
        }
      }
    }
  }
  if (s.band) {
    o.push(rect(x, y + h * 0.62, w, h * 0.16, 'd'));
    o.push(path(`M${n2(x + w)} ${n2(y + h * 0.62)} l${n2(p.dx)} ${n2(-p.dy)} v${n2(h * 0.16)} l${n2(-p.dx)} ${n2(p.dy)}z`, 'lac'));
  }
  if (s.topband) {
    o.push(rect(x, y, w, h * 0.12, 'd'), rect(x + w * 0.2, y + h * 0.3, w * 0.6, h * 0.5, 'l', 0.8));
  }
  if (s.spine) {
    o.push(rect(x, y, w * 0.12, h, 'd'), rect(x + w * 0.3, y + h * 0.14, w * 0.55, h * 0.42, 'l', 0.8));
  }
  if (s.masthead) {
    o.push(rect(x, y, w, h * 0.14, 'd'), rect(x + w * 0.12, y + h * 0.22, w * 0.76, h * 0.6, 'l', 0.8));
    o.push(ln(x + w * 0.12, y + h * 0.9, x + w * 0.6, y + h * 0.9));
  }
  return <Parts of={o} />;
}
