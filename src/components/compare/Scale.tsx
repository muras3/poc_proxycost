import type { Item, Row, WeightSensitivity } from '@/lib/pricing/types';
import { grams } from '@/lib/ui/format';

/**
 * **秤（mock-v3 `#heft`）。**「秤」の実装はこれ——`ParcelView`（箱の3D絵）を
 * 並べ替えただけでは秤にならない、というコーディネーター指摘（2026-09-15）を受けて
 * 分離した小さな部品。条件欄のすぐ下に置く。
 *
 * 台（`hplat`）は1位の実際の箱の総重量ぶんだけ沈む（`SINK` px、mock と同じ値）。
 * 分割時は2箱目以降が台の上に並ぶ（`hboxes`）。右の目盛り（`hscale`）は
 * 5・10・20・40・80kg のうち総重量が収まる最小の枠を選び、無ければ20kg刻みで
 * 切り上げる（mock の `renderHeft` と同じ規則）。**箱の内訳・重量・方式は
 * すべて `row.boxes`（`compare()` が計算した実際の値）をそのまま読むだけで、
 * ここでは何も再計算しない**（`ParcelView.tsx` module doc と同じ規律）。
 *
 * 針（`hptr` 相当）は既定で静止。**1位を左右する重量の商品がカートにあるときだけ**
 * 揺れる（`wneedle`/`wfan` と同じ考え方——揺れの幅そのものに意味はなく
 * 「不確かだ」という事実だけを示す）。`prefers-reduced-motion` では揺れずに、
 * 同じ角度幅の静止した扇形を出す（CSS の `motion-reduce:`/`motion-safe:` で
 * 切り替え——JS で `matchMedia` を読まない）。
 */
export function Scale({
  items, sensitivity, row, className = '',
}: {
  /** 価格が付いている品だけ（`Calculator` の `priced`）。 */
  items: readonly Item[];
  sensitivity: Record<string, WeightSensitivity>;
  /** 1位の実際の行。`row.boxes` が空、または存在しなければ何も描かない。 */
  row: Row | null;
  /** 置き場所は親（`Calculator`）が決める——desktop では条件欄の横に並ぶ。 */
  className?: string;
}) {
  if (!row || !row.boxes.length || items.length === 0) return null;

  const boxes = row.boxes;
  const totalG = boxes.reduce((sum, b) => sum + b.weightG, 0);
  // mock の `renderHeft` と同じ枠選び。
  const scaleKg = [5, 10, 20, 40, 80].find((v) => v * 1000 >= totalG)
    ?? Math.ceil(totalG / 20000) * 20;
  const SINK = 16; // px。mock と同じ値。
  const sinkPx = (Math.min(totalG / 1000 / scaleKg, 1) - 1) * SINK;
  const decisive = items.some((i) => sensitivity[i.id]?.decisive);

  const weightsText = boxes.length > 1
    ? ` (${boxes.map((b) => (b.weightG / 1000).toFixed(1)).join(' + ')})`
    : '';
  const summary =
    `${grams(totalG)} in ${boxes.length} box${boxes.length === 1 ? '' : 'es'}${weightsText} · ${row.serviceName}`;

  const ticks = [0, 1, 2, 3, 4].map((k) => (scaleKg * k) / 4);

  return (
    <div
      data-testid="scale"
      className={`mt-2 flex items-center gap-4 border-t border-neutral-200 pt-2 dark:border-neutral-800 ${className}`}
    >
      {/* ローカルな keyframe だけをこのコンポーネントに閉じて持つ（globals.css は
          PR-A の管轄なので触らない）。針の揺れ幅そのものに数値上の意味は無く、
          「不確かだ」という事実だけを示す（mock の `wneedle`/`wobble` と同じ）。 */}
      <style>{'@keyframes scale-needle-wobble{0%,100%{transform:rotate(-14deg)}50%{transform:rotate(14deg)}}@keyframes scale-box-slide{from{transform:translateX(var(--slide-from))}to{transform:none}}'}</style>
      {/* 狭い幅では台ごと 3/4 に縮めて縦の高さを削る（器の高さも合わせて詰める）。 */}
      <div className="h-[47px] w-[98px] shrink-0 lg:h-[62px] lg:w-[130px]" aria-hidden="true">
      <div className="relative h-[62px] w-[130px] origin-top-left scale-75 lg:scale-100">
        {/* 台。重量ぶんだけ translateY で沈む。 */}
        <div
          data-testid="scale-platform"
          className="absolute left-0 right-8 top-0 h-[62px] transition-transform duration-500 motion-reduce:transition-none"
          style={{ transform: `translateY(${sinkPx}px)` }}
        >
          <div className="absolute bottom-[11px] left-2 right-0 flex items-end gap-1">
            {boxes.map((b, i) => (
              <span
                key={i}
                data-testid="scale-box"
                // 分割で2箱目以降が増えたときは、1箱目の位置から横へ滑り出る
                // （mock-v3 `renderHeft` と同じ動き）。reduced-motion では動かない。
                className={
                  i > 0
                    ? 'motion-safe:animate-[scale-box-slide_560ms_cubic-bezier(.2,.8,.2,1)_420ms_backwards] block rounded-[1px] border border-[#8f6537] bg-[#d8ae7c] dark:border-[#543918] dark:bg-[#a5773f]'
                    : 'block rounded-[1px] border border-[#8f6537] bg-[#d8ae7c] dark:border-[#543918] dark:bg-[#a5773f]'
                }
                style={{
                  width: 14 + Math.min(30, b.weightG / 500),
                  height: 10 + Math.min(20, b.weightG / 800),
                  ['--slide-from' as string]: `-${i * 24}px`,
                }}
              />
            ))}
          </div>
          <i className="absolute bottom-[11px] left-0 right-0 h-[3px] bg-[currentColor] text-neutral-900 dark:text-neutral-100" />
          {/* 針。1位を左右する重量があるときだけ揺れる。reduced-motion は静止した扇形。 */}
          <svg
            viewBox="0 0 18 18"
            className="absolute -right-[26px] bottom-2 h-[18px] w-[18px]"
            aria-hidden="true"
          >
            {decisive ? (
              <>
                <path
                  data-testid="scale-needle-fan"
                  className="hidden fill-red-600/20 motion-reduce:block"
                  d="M9,11 L6.8,2.3 A9 9 0 0 1 11.2,2.3 Z"
                />
                <line
                  data-testid="scale-needle"
                  x1="9" y1="11" x2="9" y2="2"
                  stroke="currentColor"
                  className="origin-[9px_11px] text-red-600 motion-safe:animate-[scale-needle-wobble_1.6s_ease-in-out_infinite] motion-reduce:hidden"
                  strokeWidth="1.6"
                />
              </>
            ) : (
              <line x1="9" y1="11" x2="9" y2="2" stroke="currentColor" className="text-neutral-500" strokeWidth="1.2" />
            )}
            <circle cx="9" cy="11" r="1.5" fill="currentColor" className="text-neutral-900 dark:text-neutral-100" />
          </svg>
        </div>
        {/* 台座（固定）。 */}
        <i className="absolute bottom-0 left-[9px] right-8 h-2 border border-t-0 border-neutral-900 dark:border-neutral-100" />
        {/* 右の目盛り。 */}
        <div className="absolute bottom-0 right-0 top-0 w-[34px] whitespace-nowrap border-l border-neutral-900 text-[8.5px] leading-none text-neutral-500 dark:border-neutral-100">
          {ticks.map((v, k) => (
            <span key={k} className="absolute left-1" style={{ top: `${100 - (k / 4) * 100}%`, transform: 'translateY(-50%)' }}>
              {k === 4 ? `${v} kg` : k === 0 ? '0' : ''}
            </span>
          ))}
        </div>
      </div>
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
          On the scale &middot; 1st place
        </div>
        <div data-testid="scale-summary" aria-live="polite" className="num text-sm text-neutral-900 dark:text-neutral-100">
          {summary}
        </div>
      </div>
    </div>
  );
}
