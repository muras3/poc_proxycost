import type { ReactNode } from 'react';
import { BASE, Parts, rect, circ, ln, lnL, path } from './primitives';
import type { GarmentP } from './shapes';

// 畳んだ武道衣。積みの高さ・襞・襟・腰板・巻きか折りかで振る。
export function drawGarment(s: GarmentP): ReactNode {
  const o: ReactNode[] = [];
  if (s.kind === 'obi') {
    // 帯だけは巻いた渦。畳んだ他の4つと一目で分かる。
    o.push(circ(50, BASE - 15, 15, 'f'));
    o.push(path(`M50 ${BASE - 15} m-11 0 a11 11 0 1 1 11 11 a7.5 7.5 0 1 1 7.5 -7.5 a4 4 0 1 1 -4 -4`, 'none'));
    o.push(path(`M62 ${BASE - 8} q8 2 12 8`, 'none', { sw: 4 }));
  } else if (s.kind === 'hakama') {
    o.push(rect(25, BASE - 42, 50, 42, 'f', 2));
    for (let i = 1; i < 6; i++) o.push(ln(25 + (i * 50) / 6, BASE - 42, 25 + (i * 50) / 6, BASE));
    o.push(rect(40, BASE - 48, 20, 7, 'd', 1));
    o.push(rect(25, BASE - 34, 50, 4, 'd'));
  } else if (s.kind === 'pants') {
    o.push(rect(28, BASE - 34, 21, 34, 'f', 2), rect(51, BASE - 34, 21, 34, 'f', 2));
    o.push(rect(28, BASE - 36, 44, 7, 'd', 1));
    o.push(lnL(46, BASE - 33, 54, BASE - 33));
  } else if (s.kind === 'jacket') {
    o.push(rect(24, BASE - 40, 52, 40, 'f', 2));
    o.push(rect(24, BASE - 40, 9, 40, 'l'), rect(67, BASE - 40, 9, 40, 'l'));
    o.push(path(`M40 ${BASE - 40} L50 ${BASE - 22} L60 ${BASE - 40}Z`, 'paper'));
  } else {
    // 上下一組。袴の上に上衣を重ね、帯を渡す。
    o.push(rect(24, BASE - 22, 52, 22, 'd', 2));
    for (let i = 1; i < 6; i++) o.push(ln(24 + (i * 52) / 6, BASE - 22, 24 + (i * 52) / 6, BASE));
    o.push(rect(24, BASE - 58, 52, 36, 'f', 2));
    o.push(rect(24, BASE - 58, 9, 36, 'l'), rect(67, BASE - 58, 9, 36, 'l'));
    o.push(path(`M40 ${BASE - 58} L50 ${BASE - 42} L60 ${BASE - 58}Z`, 'paper'));
    o.push(rect(46, BASE - 60, 8, 62, 'paper', 1));
  }
  return <Parts of={o} />;
}
