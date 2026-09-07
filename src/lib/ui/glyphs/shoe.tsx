import type { ReactNode } from 'react';
import { BASE, Parts, rect, ln, path, n2 } from './primitives';
import type { ShoeP } from './shapes';

// 横から見た片足、つま先は左。丈・履き口の高さ・底の厚み・こはぜの数で振る。
export function drawShoe(s: ShoeP): ReactNode {
  const { len, h } = s;
  const sh = s.sole;
  const x0 = 50 - len / 2;
  const yb = BASE - sh;
  const body = s.tone === 'p' ? 'paper' : s.tone === 'l' ? 'l' : 'f';
  const o: ReactNode[] = [];
  o.push(rect(x0, yb, len, sh, s.whitesole ? 'paper' : 'd', Math.min(sh / 2, 2.5)));
  if (s.lugs) {
    for (let i = 1; i < 7; i++) o.push(ln(x0 + (i * len) / 7, yb + 1, x0 + (i * len) / 7 - 1.5, yb + sh - 1));
  }
  o.push(
    path(
      `M${n2(x0)} ${n2(yb)} Q${n2(x0)} ${n2(yb - h * 0.55)} ${n2(x0 + len * 0.28)} ${n2(yb - h * 0.62)} L${n2(x0 + len * 0.6)} ${n2(yb - h * 0.76)} Q${n2(x0 + len * 0.66)} ${n2(yb - h)} ${n2(x0 + len * 0.78)} ${n2(yb - h)} L${n2(x0 + len * 0.95)} ${n2(yb - h)} Q${n2(x0 + len)} ${n2(yb - h)} ${n2(x0 + len)} ${n2(yb - h * 0.82)} L${n2(x0 + len)} ${n2(yb)} Z`,
      body,
    ),
  );
  if (s.toecap) {
    o.push(path(`M${n2(x0)} ${n2(yb)} Q${n2(x0)} ${n2(yb - h * 0.55)} ${n2(x0 + len * 0.28)} ${n2(yb - h * 0.62)} L${n2(x0 + len * 0.3)} ${n2(yb)}Z`, 'd'));
  }
  // 足袋の親指の割れ。足袋かスニーカーかを分ける唯一の決め手。
  if (s.split) o.push(path(`M${n2(x0 + len * 0.14)} ${n2(yb)} q1 ${n2(-h * 0.2)} ${n2(len * 0.06)} ${n2(-h * 0.42)}`, 'none'));
  if (s.laces) {
    for (let i = 0; i < 3; i++) {
      o.push(ln(x0 + len * (0.36 + i * 0.09), yb - h * (0.66 + i * 0.045), x0 + len * (0.42 + i * 0.09), yb - h * (0.56 + i * 0.045)));
    }
  }
  if (s.kohaze) {
    for (let i = 0; i < s.kohaze; i++) {
      o.push(ln(x0 + len * 0.86, yb - h * 0.92 + (i * (h * 0.6)) / s.kohaze, x0 + len * 0.94, yb - h * 0.92 + (i * (h * 0.6)) / s.kohaze));
    }
  }
  return <Parts of={o} />;
}
