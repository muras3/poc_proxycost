import type { ReactNode } from 'react';
import { BASE, Parts, rect, circ, ell, ln, lnL, path, stroked, strokePath, strokePathL, limitLine } from './primitives';
import type { LongP } from './shapes';

// 幅より長いものを立てる。**長さが主軸**で、反り・鍔・継ぎ目・握りで振る。
// 'rod' は種類不明なので継ぎ目もガイドも描かず、輪郭を点線にする。
export function drawLong(s: LongP): ReactNode {
  const o: ReactNode[] = [];
  if (s.kind === 'lightstick') {
    o.push(rect(46, BASE - 24, 8, 24, 'd', 2));
    o.push(rect(44, BASE - 26, 12, 4, 'f', 1));
    o.push(ell(50, BASE - 40, 9, 13, 'l'), ell(50, BASE - 40, 4.5, 7, 'paper'));
  } else if (s.kind === 'bokuto') {
    o.push(...stroked(`M50 ${BASE} Q54 ${BASE - 46} 48 ${BASE - 86}`, 5, 'f'));
    o.push(strokePath(`M50 ${BASE} Q51 ${BASE - 11} 50 ${BASE - 22}`, 5, 'd'));
  } else if (s.kind === 'shinai') {
    o.push(...stroked(`M50 ${BASE} V${BASE - 98}`, 5, 'f'));
    o.push(strokePathL(`M50 ${BASE} V${BASE - 27}`, 4));
    o.push(ell(50, BASE - 28, 8, 2.4, 'd'));
    o.push(strokePathL(`M50 ${BASE - 93} V${BASE - 98}`, 5));
    o.push(lnL(47, BASE - 74, 53, BASE - 74));
  } else if (s.kind === 'iaito') {
    o.push(...stroked(`M50 ${BASE} Q54 ${BASE - 46} 48 ${BASE - 90}`, 5.5, 'd'));
    o.push(strokePathL(`M50 ${BASE} Q51.5 ${BASE - 12} 50.7 ${BASE - 24}`, 5));
    // 柄巻き。
    for (let i = 0; i < 5; i++) o.push(ln(48, BASE - 2 - i * 4.5, 53, BASE - 5 - i * 4.5));
    o.push(circ(51, BASE - 26, 4.8, 'lac'));
  } else if (s.kind === 'yumi') {
    o.push(...stroked(`M52 ${BASE} C40 ${BASE - 30} 36 ${BASE - 80} 50 ${BASE - 116}`, 3, 'f'));
    o.push(ln(50, BASE - 115, 52, BASE - 1));
    o.push(strokePath(`M45.6 ${BASE - 40} Q44.6 ${BASE - 46} 44.5 ${BASE - 52}`, 4, 'd'));
  } else {
    const L = s.len ?? 100;
    const u = s.unknown ? { dash: true } : {};
    o.push(path(`M48 ${BASE} L52 ${BASE} L50.6 ${BASE - L} L49.4 ${BASE - L}Z`, 'f', u));
    o.push(path(`M47.4 ${BASE} h5.2 v-16 h-5.2z`, 'd', u));
    o.push(rect(47.2, BASE - 24, 5.6, 8, 'paper', 1, u));
    for (let i = 1; i <= (s.ferrules ?? 0); i++) {
      const y = BASE - 24 - ((L - 24) * i) / ((s.ferrules ?? 0) + 1);
      o.push(rect(48.2, y - 1.5, 3.6, 3, 'paper', 0.5));
    }
    for (let i = 0; i < (s.guides ?? 0); i++) {
      const y = BASE - 30 - ((L - 36) * (i + 1)) / ((s.guides ?? 0) + 1);
      o.push(circ(52.6, y, 1.4, 'none'));
    }
  }
  // 送れる長さかどうかが怪しい品。**数字は出さない**（限度の一次情報を持っていない）。
  if (s.lengthCheck) o.push(limitLine());
  return <Parts of={o} />;
}
