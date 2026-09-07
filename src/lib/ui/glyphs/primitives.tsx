import type { ReactNode } from 'react';
import { Fragment } from 'react';

// 形の語彙の下地。**12家族はすべてこの数個のプリミティブで組む。**
// 69品目ぶんのパスを列挙しない（バンドルが品目数に比例して伸びるのを避ける）。
//
// 色は一切書かない。塗りは currentColor の濃度段だけで作り、
// 「紙」（窓・ラベル）だけ globals.css の --panel を借りる。
// これでダーク／ライトは呼び出し側の text- クラスとテーマトークンに従う。

/** 描画箱は 100 x 130、接地線は y=120。全家族で共通。 */
export const BASE = 120;
export const VIEW_W = 100;
export const VIEW_H = 130;

/** 面の濃度段。currentColor の不透明度だけで立体を作る。 */
export type Tone = 'l' | 'f' | 'd' | 'lac' | 'paper' | 'none';

const FILL_OPACITY: Record<Exclude<Tone, 'paper' | 'none'>, number> = {
  l: 0.14, // 天面（光が当たる側）
  f: 0.26, // 正面
  d: 0.42, // 側面・帯
  lac: 0.62, // 漆・金具などの最も濃い面
};

const n2 = (v: number) => Math.round(v * 100) / 100;

interface Opt {
  /** 種類が不明なときに輪郭を点線にする。「不明」を状態として描くための唯一の手段。 */
  dash?: boolean;
  sw?: number;
  /** 塗りの濃さを一律に薄める。「不明」を空っぽに見せるために使う。 */
  fillScale?: number;
  extra?: Record<string, string | number>;
}

function paint(t: Tone, o: Opt = {}) {
  const fill =
    t === 'none' ? 'none' : t === 'paper' ? 'var(--panel)' : 'currentColor';
  const base: Record<string, string | number> = {
    fill,
    stroke: 'currentColor',
    strokeOpacity: 0.62,
    strokeWidth: o.sw ?? 0.9,
    strokeLinejoin: 'round',
    strokeLinecap: 'round',
    vectorEffect: 'non-scaling-stroke',
  };
  if (t !== 'paper' && t !== 'none') base.fillOpacity = FILL_OPACITY[t] * (o.fillScale ?? 1);
  if (o.dash) base.strokeDasharray = '2 1.4';
  return { ...base, ...o.extra };
}

/** 紙色の細線。濃い面の上に置く目地・ハイライト。 */
function paintLight(o: Opt = {}) {
  return {
    fill: 'none',
    stroke: 'var(--panel)',
    strokeWidth: o.sw ?? 0.9,
    strokeLinecap: 'round' as const,
    vectorEffect: 'non-scaling-stroke' as const,
    ...(o.dash ? { strokeDasharray: '2 1.4' } : {}),
    ...o.extra,
  };
}

export const rect = (
  x: number, y: number, w: number, h: number, t: Tone, r = 0, o: Opt = {},
): ReactNode => (
  <rect x={n2(x)} y={n2(y)} width={n2(w)} height={n2(h)} rx={r} {...paint(t, o)} />
);

export const path = (d: string, t: Tone, o: Opt = {}): ReactNode => (
  <path d={d} {...paint(t, o)} />
);

export const circ = (cx: number, cy: number, r: number, t: Tone, o: Opt = {}): ReactNode => (
  <circle cx={n2(cx)} cy={n2(cy)} r={n2(r)} {...paint(t, o)} />
);

export const ell = (cx: number, cy: number, rx: number, ry: number, t: Tone, o: Opt = {}): ReactNode => (
  <ellipse cx={n2(cx)} cy={n2(cy)} rx={n2(rx)} ry={n2(ry)} {...paint(t, o)} />
);

export const ln = (x1: number, y1: number, x2: number, y2: number, o: Opt = {}): ReactNode => (
  <line x1={n2(x1)} y1={n2(y1)} x2={n2(x2)} y2={n2(y2)} {...paint('none', o)} />
);

/** 紙色の線。 */
export const lnL = (x1: number, y1: number, x2: number, y2: number, o: Opt = {}): ReactNode => (
  <line x1={n2(x1)} y1={n2(y1)} x2={n2(x2)} y2={n2(y2)} {...paintLight(o)} />
);

export const pathL = (d: string, o: Opt = {}): ReactNode => <path d={d} {...paintLight(o)} />;

/** 線そのものが形になる棒状の品（竹刀・竿）用。太さを図と一緒に拡縮させる。 */
export const strokePath = (d: string, w: number, t: Tone, o: Opt = {}): ReactNode => (
  <path
    d={d}
    fill="none"
    stroke="currentColor"
    strokeOpacity={t === 'lac' ? 0.72 : t === 'd' ? 0.52 : 0.34}
    strokeWidth={w}
    strokeLinecap="round"
    {...(o.dash ? { strokeDasharray: '2 1.4' } : {})}
  />
);

/** 紙色の太線。柄・鍔元の抜き。 */
export const strokePathL = (d: string, w: number): ReactNode => (
  <path d={d} fill="none" stroke="var(--panel)" strokeWidth={w} strokeLinecap="round" />
);

/** 輪郭を一段濃く重ねてから芯を描く。棒が背景に溶けないようにする。 */
export const stroked = (d: string, w: number, t: Tone = 'f', o: Opt = {}): ReactNode[] => [
  <path
    key="o"
    d={d}
    fill="none"
    stroke="currentColor"
    strokeOpacity={0.62}
    strokeWidth={w + 1.6}
    strokeLinecap="round"
    {...(o.dash ? { strokeDasharray: '2 1.4' } : {})}
  />,
  strokePath(d, w, t, o),
];

export const mark = (x: number, y: number, s: string): ReactNode => (
  <text
    x={n2(x)}
    y={n2(y)}
    fill="var(--panel)"
    fontSize={6}
    fontWeight={500}
    fontFamily="ui-monospace, SFMono-Regular, monospace"
    textAnchor="middle"
  >
    {s}
  </text>
);

/** 送れるかどうかが怪しい長さの品につける赤い破線。数字は出さない（持っていない）。 */
export const limitLine = (): ReactNode => (
  <line
    x1={30}
    y1={6}
    x2={70}
    y2={6}
    stroke="currentColor"
    strokeWidth={1}
    strokeDasharray="3 2"
    vectorEffect="non-scaling-stroke"
    className="text-red-600 dark:text-red-400"
  />
);

/** 正面・天面・右側面の三面。箱・カード・平物の共通の下地。 */
export interface Prism {
  node: ReactNode;
  x: number; y: number; w: number; h: number; dx: number; dy: number;
}

export function prism(
  cx: number, bottom: number, w: number, h: number, d: number, r = 1.2, o: Opt = {},
): Prism {
  const dx = d * 0.55;
  const dy = d * 0.32;
  const x = cx - w / 2;
  const y = bottom - h;
  return {
    node: (
      <>
        {path(`M${n2(x + w)} ${n2(y)} l${n2(dx)} ${n2(-dy)} v${n2(h)} l${n2(-dx)} ${n2(dy)}z`, 'd', o)}
        {path(`M${n2(x)} ${n2(y)} l${n2(dx)} ${n2(-dy)} h${n2(w)} l${n2(-dx)} ${n2(dy)}z`, 'l', o)}
        {rect(x, y, w, h, 'f', r, o)}
      </>
    ),
    x, y, w, h, dx, dy,
  };
}

/** 配列を key つきで並べる。描画関数はこれに部品を渡す。 */
export function Parts({ of }: { of: ReactNode[] }) {
  return (
    <>
      {of.map((node, i) => (
        <Fragment key={i}>{node}</Fragment>
      ))}
    </>
  );
}

export { n2 };
