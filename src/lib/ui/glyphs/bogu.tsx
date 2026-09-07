import type { ReactNode } from 'react';
import { BASE, Parts, rect, circ, ell, ln, lnL, path, pathL, n2 } from './primitives';
import type { BoguP } from './shapes';

// **ここだけシルエットではなく材質で括っている。**藍（f・d）と漆（lac）の対比が
// 剣道具であることを言い、部位の輪郭が種類を言う。

function tare(cx: number, by: number, sc = 1): ReactNode[] {
  const o: ReactNode[] = [
    path(`M${n2(cx - 27 * sc)} ${n2(by - 40 * sc)} h${n2(54 * sc)} l${n2(-3 * sc)} ${n2(11 * sc)} h${n2(-48 * sc)}z`, 'd'),
  ];
  for (let i = 0; i < 5; i++) o.push(rect(cx - 24 * sc + i * 10 * sc, by - 29 * sc, 8.4 * sc, 29 * sc, 'f', 1.5 * sc));
  o.push(rect(cx - 9 * sc, by - 24 * sc, 18 * sc, 8 * sc, 'paper', 0.8));
  return o;
}

function kote(cx: number, by: number, sc = 1): ReactNode[] {
  const o: ReactNode[] = [];
  for (const off of [-13, 13]) {
    o.push(rect(cx + off * sc - 8 * sc, by - 48 * sc, 16 * sc, 40 * sc, 'f', 4 * sc));
    o.push(rect(cx + off * sc - 8 * sc, by - 48 * sc, 16 * sc, 13 * sc, 'd', 3 * sc));
    o.push(circ(cx + off * sc, by - 9 * sc, 8.5 * sc, 'l'));
    o.push(ln(cx + off * sc - 7 * sc, by - 28 * sc, cx + off * sc + 7 * sc, by - 28 * sc));
  }
  return o;
}

function dou(cx: number, by: number, sc = 1): ReactNode[] {
  // 胴台: 漆の広い殻。上辺は平ら、下は丸く絞る。
  const o: ReactNode[] = [
    path(`M${n2(cx - 30 * sc)} ${n2(by - 26 * sc)} h${n2(60 * sc)} v${n2(6 * sc)} q${n2(-4 * sc)} ${n2(18 * sc)} ${n2(-30 * sc)} ${n2(20 * sc)} q${n2(-26 * sc)} ${n2(-2 * sc)} ${n2(-30 * sc)} ${n2(-20 * sc)}z`, 'lac'),
    // 胸: 藍の帯。首元に浅い切れ込みと乳革が2つ。
    path(`M${n2(cx - 30 * sc)} ${n2(by - 26 * sc)} v${n2(-10 * sc)} q${n2(4 * sc)} ${n2(-3 * sc)} ${n2(12 * sc)} ${n2(-3 * sc)} q${n2(12 * sc)} 0 ${n2(18 * sc)} ${n2(6 * sc)} q${n2(6 * sc)} ${n2(-6 * sc)} ${n2(18 * sc)} ${n2(-6 * sc)} q${n2(8 * sc)} 0 ${n2(12 * sc)} ${n2(3 * sc)} v${n2(10 * sc)}z`, 'd'),
    circ(cx - 22 * sc, by - 34 * sc, 2 * sc, 'paper'),
    circ(cx + 22 * sc, by - 34 * sc, 2 * sc, 'paper'),
    pathL(`M${n2(cx - 18 * sc)} ${n2(by - 20 * sc)} q${n2(-3 * sc)} ${n2(8 * sc)} ${n2(4 * sc)} ${n2(14 * sc)}`),
  ];
  return o;
}

function men(cx: number, by: number, sc = 1): ReactNode[] {
  const o: ReactNode[] = [
    path(`M${n2(cx - 22 * sc)} ${n2(by - 30 * sc)} a${n2(22 * sc)} ${n2(22 * sc)} 0 0 1 ${n2(44 * sc)} 0 v${n2(22 * sc)} l${n2(10 * sc)} ${n2(8 * sc)} h${n2(-64 * sc)} l${n2(10 * sc)} ${n2(-8 * sc)}z`, 'f'),
    path(`M${n2(cx - 22 * sc)} ${n2(by - 8 * sc)} l${n2(-10 * sc)} ${n2(8 * sc)} h${n2(64 * sc)} l${n2(-10 * sc)} ${n2(-8 * sc)}z`, 'd'),
    ell(cx, by - 30 * sc, 15 * sc, 20 * sc, 'lac'),
  ];
  // 面金。横桟を楕円の内側に収める。
  for (let i = 0; i < 7; i++) {
    const yy = by - 46 * sc + i * 5.2 * sc;
    const hw = Math.sqrt(Math.max(0, 1 - ((yy - (by - 30 * sc)) / (20 * sc)) ** 2)) * 15 * sc;
    o.push(lnL(cx - hw + 1, yy, cx + hw - 1, yy));
  }
  o.push(lnL(cx, by - 49 * sc, cx, by - 11 * sc));
  return o;
}

export function drawBogu(s: BoguP): ReactNode {
  if (s.kind === 'tare') return <Parts of={tare(50, BASE)} />;
  if (s.kind === 'kote') return <Parts of={kote(50, BASE)} />;
  if (s.kind === 'do') return <Parts of={dou(50, BASE)} />;
  if (s.kind === 'men') return <Parts of={men(50, BASE)} />;
  // 一式: 垂の上に胴、その上に面。小手は両脇。
  return (
    <Parts
      of={[
        ...tare(50, BASE, 0.8),
        ...kote(22, BASE - 2, 0.5),
        ...kote(78, BASE - 2, 0.5),
        ...dou(50, BASE - 28, 0.72),
        ...men(50, BASE - 52, 0.72),
      ]}
    />
  );
}
