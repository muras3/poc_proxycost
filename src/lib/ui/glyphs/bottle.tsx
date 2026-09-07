import type { ReactNode } from 'react';
import { BASE, Parts, rect, lnL, path, n2 } from './primitives';
import type { BottleP } from './shapes';

// 立てた瓶。高さ・肩の作り（なで肩／怒り肩）・首の長さ・ラベルの大きさで振る。
export function drawBottle(s: BottleP): ReactNode {
  const x = 50 - s.w / 2;
  const top = BASE - s.h;
  const nx = 50 - s.neckW / 2;
  const sy = top + s.neckH + s.shoulder;
  const shoulderL = s.round
    ? `Q${n2(x)} ${n2(top + s.neckH)} ${n2(nx)} ${n2(top + s.neckH)}`
    : `L${n2(nx)} ${n2(top + s.neckH)}`;
  const shoulderR = s.round
    ? `Q${n2(x + s.w)} ${n2(top + s.neckH)} ${n2(x + s.w)} ${n2(sy)}`
    : `L${n2(x + s.w)} ${n2(sy)}`;
  const [lw, lh] = s.label;
  const o: ReactNode[] = [
    path(`M${n2(x)} ${BASE} V${n2(sy)} ${shoulderL} V${n2(top + s.cap)} H${n2(nx + s.neckW)} V${n2(top + s.neckH)} ${shoulderR} V${BASE}Z`, 'f'),
    rect(nx - 0.6, top, s.neckW + 1.2, s.cap, 'd', 0.6),
    rect(50 - (s.w * lw) / 2, sy + (BASE - sy) * 0.32, s.w * lw, (BASE - sy) * lh, 'paper', 0.5),
    // ガラスの照り。
    lnL(x + 2.5, sy + 4, x + 2.5, BASE - 5),
  ];
  return <Parts of={o} />;
}
