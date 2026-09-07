import type { ReactNode } from 'react';
import { BASE, Parts, rect, circ, ln, path } from './primitives';
import type { ReelP } from './shapes';

// 足で立つリール。胴の断面（丸／低い／角ばった）とハンドル・液晶で3種を分ける。
// **種類が不明な 'reel' は、家族のシルエットから決め手（ハンドル・ベール・液晶）を
// 剥ぎ取って点線で描く。**「不明」を別の品ではなく状態として見せる。
export function drawReel(s: ReelP): ReactNode {
  const o: ReactNode[] = [];
  if (s.kind === 'unknown') {
    const u = { dash: true };
    o.push(rect(38, BASE - 58, 24, 3.5, 'd', 1, u), rect(47, BASE - 55, 6, 14, 'd', 0, u));
    o.push(circ(50, BASE - 26, 16, 'f', u), circ(50, BASE - 26, 5, 'l', u));
    o.push(rect(38, BASE - 4, 24, 4, 'd', 1, u));
  } else if (s.kind === 'spinning') {
    o.push(rect(30, BASE - 72, 26, 3.5, 'd', 1), rect(40, BASE - 69, 6, 22, 'd'));
    o.push(circ(43, BASE - 30, 15, 'f'), circ(43, BASE - 30, 4.5, 'l'));
    o.push(ln(28, BASE - 30, 20, BASE - 40, { sw: 1.6 }), rect(16, BASE - 44, 6, 4, 'd', 1));
    o.push(rect(58, BASE - 50, 18, 20, 'l', 3), rect(58, BASE - 40, 18, 7, 'd'));
    o.push(path(`M58 ${BASE - 30} q-16 -16 -3 -36 q10 -6 21 -4 q6 4 0 20`, 'none', { sw: 1.4 }));
    o.push(rect(30, BASE - 4, 40, 4, 'd', 1));
  } else if (s.kind === 'bait') {
    o.push(rect(27, BASE - 36, 46, 30, 'f', 13));
    o.push(rect(35, BASE - 40, 30, 6, 'd', 2));
    o.push(ln(31, BASE - 24, 69, BASE - 24));
    o.push(ln(73, BASE - 22, 84, BASE - 30, { sw: 1.6 }), rect(82, BASE - 34, 6, 4, 'd', 1), rect(70, BASE - 24, 6, 4, 'd', 1));
    o.push(rect(38, BASE - 6, 24, 6, 'd', 1));
  } else {
    o.push(rect(22, BASE - 44, 56, 38, 'f', 6));
    // 液晶。電動リールを電動リールたらしめている唯一の面。
    o.push(rect(27, BASE - 40, 24, 11, 'paper', 1), ln(30, BASE - 34, 46, BASE - 34), ln(30, BASE - 31.5, 40, BASE - 31.5));
    o.push(circ(64, BASE - 22, 10, 'l'), circ(64, BASE - 22, 3, 'd'));
    o.push(path(`M22 ${BASE - 30} q-8 0 -8 8 q0 4 4 10`, 'none', { sw: 1.6 }));
    o.push(ln(78, BASE - 22, 88, BASE - 30, { sw: 1.6 }), rect(86, BASE - 34, 6, 4, 'd', 1));
    o.push(rect(36, BASE - 6, 28, 6, 'd', 1));
  }
  return <Parts of={o} />;
}
