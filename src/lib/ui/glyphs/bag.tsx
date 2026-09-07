import type { ReactNode } from 'react';
import { BASE, Parts, rect, circ, ln, path } from './primitives';
import type { BagP } from './shapes';

// 柔らかい胴。**持ち手がどの鞄かを言う**（無し／アーチ／長い肩紐／二本／短い二本／紐）。
export function drawBag(s: BagP): ReactNode {
  const o: ReactNode[] = [];
  if (s.kind === 'wallet') {
    o.push(rect(31, BASE - 24, 38, 24, 'f', 3));
    o.push(ln(31, BASE - 12, 69, BASE - 12));
    o.push(circ(62, BASE - 6, 1.6, 'paper'));
  } else if (s.kind === 'pouch') {
    o.push(rect(28, BASE - 28, 44, 28, 'f', 5));
    o.push(ln(31, BASE - 22, 69, BASE - 22, { dash: true }));
    o.push(path(`M66 ${BASE - 22} l3 -4 l3 4`, 'none'));
  } else if (s.kind === 'handbag') {
    o.push(path(`M27 ${BASE} v-28 q0 -6 5 -6 h36 q5 0 5 6 v28z`, 'f'));
    o.push(path(`M36 ${BASE - 34} q0 -18 14 -18 q14 0 14 18`, 'none', { sw: 2.2 }));
    o.push(rect(46, BASE - 36, 8, 4, 'd', 1));
  } else if (s.kind === 'shoulder') {
    o.push(path(`M30 ${BASE} v-26 q0 -4 4 -4 h32 q4 0 4 4 v26z`, 'f'));
    o.push(path(`M30 ${BASE - 30} h40 v12 q0 3 -3 3 h-34 q-3 0 -3 -3z`, 'd'));
    o.push(path(`M33 ${BASE - 30} q0 -46 17 -52 q17 6 17 52`, 'none', { sw: 1.6 }));
    o.push(circ(50, BASE - 17, 1.6, 'paper'));
  } else if (s.kind === 'tote') {
    o.push(path(`M25 ${BASE} l2 -42 h46 l2 42z`, 'f'));
    o.push(path(`M34 ${BASE - 42} q0 -18 8 -18 q8 0 8 18`, 'none', { sw: 2 }));
    o.push(path(`M50 ${BASE - 42} q0 -18 8 -18 q8 0 8 18`, 'none', { sw: 2 }));
    o.push(rect(27, BASE - 42, 46, 5, 'd'));
  } else if (s.kind === 'boston') {
    o.push(rect(20, BASE - 34, 60, 34, 'f', 15));
    o.push(ln(28, BASE - 30, 72, BASE - 30, { dash: true }));
    o.push(path(`M42 ${BASE - 34} q0 -12 8 -12 q8 0 8 12`, 'none', { sw: 2.2 }));
    o.push(ln(33, BASE - 30, 33, BASE - 4), ln(67, BASE - 30, 67, BASE - 4));
  } else {
    // 竹刀袋。細長い胴に肩紐。鞄の家族に入るのは「梱包される物として」同じだから。
    o.push(rect(39, BASE - 98, 22, 98, 'f', 5));
    o.push(path(`M41 ${BASE - 92} q9 -6 18 0`, 'none'));
    o.push(circ(50, BASE - 101, 2.4, 'd'));
    o.push(rect(39, BASE - 46, 22, 6, 'd'));
    o.push(path(`M61 ${BASE - 88} q26 20 0 44`, 'none', { sw: 1.6 }));
  }
  return <Parts of={o} />;
}
