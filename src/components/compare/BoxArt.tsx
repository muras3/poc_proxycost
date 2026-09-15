import type { Item, ParcelBox } from '@/lib/pricing/types';

/**
 * 段ボールの絵（Mock v3 `boxSVG`）。大きさは重量の帯でしか変わらない。
 * 中身は `Row.boxes[].itemIndices`（価格の付いた品への添字）。利用者が重量を
 * 入れていない品（表／仮置き）は薄く破線で描く。**箱は絵であって梱包の計算ではない。**
 */
export function BoxArt({
  box, items, k = 1,
}: { box: ParcelBox; items: readonly Item[]; k?: number }) {
  const g = box.weightG;
  const W0 = g <= 2000 ? 64 : g <= 10000 ? 84 : g <= 20000 ? 104 : 120;
  const H0 = g <= 2000 ? 34 : g <= 10000 ? 40 : g <= 20000 ? 48 : 54;
  const W = W0 * k;
  const H = H0 * k;
  const ox = Math.round(W * 0.22);
  const oy = Math.round(H * 0.3);
  const p = 2;
  const base = p + oy + H;
  const yb = p;
  const yf = base - H * 0.45;
  const floor = base - oy * 0.5;
  const sw = k < 1 ? 0.8 : 1.1;
  const n = Math.max(1, box.itemIndices.length);
  const span = W - 6 * k;
  const gap = 2 * k;
  const iw = Math.max(2, (span - gap * (n - 1)) / n);
  const IH = [0.92, 0.62, 0.8, 0.7, 0.96];
  const stroke = { stroke: '#1B1A17', strokeWidth: sw, strokeLinejoin: 'round' as const };

  return (
    <svg
      width={W + ox + p * 2}
      height={base + p}
      viewBox={`0 0 ${W + ox + p * 2} ${base + p}`}
      aria-hidden="true"
    >
      <g className="shell">
        <polygon points={`${ox},${yb} ${W + ox},${yb} ${W + ox},${base - oy} ${ox},${base - oy}`} fill="#A98B5E" {...stroke} />
        <polygon points={`0,${yf} ${ox},${yb} ${ox},${base - oy} 0,${base}`} fill="#9A7C50" {...stroke} />
      </g>
      {box.itemIndices.map((ix, j) => {
        const it = items[ix];
        const ih = H * IH[ix % 5]!;
        const fix = it?.weightOrigin === 'user';
        return (
          <g
            key={`${ix}-${j}`}
            className={`it ${fix ? 'fix' : 'est'}`}
            data-i={ix}
            data-testid="packed-item"
            data-estimated={fix ? 'false' : 'true'}
          >
            <rect
              x={(ox * 0.5 + 3 * k + j * (iw + gap)).toFixed(1)}
              y={(floor - ih).toFixed(1)}
              width={iw.toFixed(1)}
              height={ih.toFixed(1)}
            />
          </g>
        );
      })}
      <g className="shell">
        <polygon points={`${W},${yf} ${W + ox},${yb} ${W + ox},${base - oy} ${W},${base}`} fill="#BE9F6E" {...stroke} />
        <rect x={0} y={yf} width={W} height={base - yf} fill="#D3B888" {...stroke} />
        <rect
          x={W * 0.12}
          y={yf + (base - yf) * 0.3}
          width={W * 0.3}
          height={(base - yf) * 0.36}
          fill="#F2EDE3"
          stroke="#D7261E"
          strokeWidth={sw * 0.8}
        />
      </g>
    </svg>
  );
}
