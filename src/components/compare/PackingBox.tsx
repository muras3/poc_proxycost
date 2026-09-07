'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { EMS_TABLE } from '@/lib/pricing/ems';

/**
 * 段ボール箱。**中身を「詰める」絵ではない。**
 * EMS は重量だけで料金が決まり体積は一切効かないので、満杯に見える箱は
 * 存在しない費用モデルを教えることになる。ここで箱がやることは2つだけ:
 *   1. いま立っている EMS の段を、大きさで（離散的に）示す
 *   2. どの品が推定重量なのかを、半透明で示す
 * 中身の並べ方は「床に一列に置く」だけで、隙間を埋めにいかない。
 */

export type PackedItem = {
  /** 形の語彙のキー。renderGlyph に渡す。 */
  id: string;
  /** 一意キー（同じ品を複数入れられる）。 */
  key: string;
  /** 読み上げ用の名前。 */
  label: string;
  /** **推定重量なら true → 半透明。** どれが総額の不確実さを生んでいるかが箱で分かる。 */
  estimated: boolean;
};

export type BoxDims = { w: number; h: number; d: number; frontH: number };

/** カメラ角。上・前・右から見下ろす（rotateX 負 = 上から覗く）。
 *  rotateX(+n) にすると下から見上げる向きになり、床が見えなくなる。 */
export const CAMERA_X_DEG = -30;
export const CAMERA_Y_DEG = -26;

const RAD = Math.PI / 180;
const COS_Y = Math.cos(CAMERA_Y_DEG * RAD);
const SIN_Y = Math.abs(Math.sin(CAMERA_Y_DEG * RAD));
const COS_X = Math.cos(CAMERA_X_DEG * RAD);
const SIN_X = Math.abs(Math.sin(CAMERA_X_DEG * RAD));

/** 表の外（30kg 超）は表の段ではないので、最上段の1つ先の「余白の段」として扱う。
 *  **最上段に丸めない。** */
export const OVER_MAX_NOTCH = EMS_TABLE.length;

/** 段の添字 → 箱の段（notch）。重量からは計算しない。 */
export function boxNotch(stepIndex: number, overMax: boolean): number {
  if (overMax) return OVER_MAX_NOTCH;
  return Math.min(EMS_TABLE.length - 1, Math.max(0, stepIndex));
}

/** **箱の大きさは段の添字からだけ決まる。**重量から連続的に膨らませない。
 *  前面は低い開口箱（frontH < h）。全高にすると中身が壁の裏に隠れる。 */
export function boxDims(stepIndex: number, overMax = false): BoxDims {
  const notch = boxNotch(stepIndex, overMax);
  const h = 118 + notch * 4;
  return {
    w: 250 + notch * 7,
    h,
    d: 112 + notch * 3,
    frontH: Math.round(h * 0.34),
  };
}

/** 回転後の投影サイズ。場面に収める計算に使う。 */
export function projectedSize(dims: BoxDims): { w: number; h: number } {
  return {
    w: dims.w * COS_Y + dims.d * SIN_Y,
    h: dims.h * COS_X + dims.d * SIN_X,
  };
}

/** **モバイルで箱が画面外に出ないための縮尺。**拡大はしない（1 を超えない）。 */
export function boxScale(availableWidth: number, dims: BoxDims): number {
  const proj = projectedSize(dims);
  if (!(availableWidth > 0) || proj.w <= 0) return 1;
  return Math.min(1, availableWidth / proj.w);
}

/** 差し替え可能な仮の中身。形の語彙が入るまでの矩形。**実寸を主張しない。** */
function PlaceholderGlyph() {
  return (
    <div
      className="rounded-[2px] border border-neutral-500/60 bg-neutral-400 dark:bg-neutral-500"
      style={{ width: 26, height: 44 }}
      aria-hidden="true"
    />
  );
}

export function PackingBox({
  stepIndex,
  overMax = false,
  items,
  renderGlyph,
  label,
  className = '',
}: {
  /** `emsFor()` が返す段の添字。 */
  stepIndex: number;
  /** `emsFor()` の overMax。表の外。 */
  overMax?: boolean;
  items: readonly PackedItem[];
  /** 形の語彙。未指定なら仮の矩形。 */
  renderGlyph?: (item: PackedItem) => ReactNode;
  /** スクリーンリーダー向けの説明。 */
  label?: string;
  className?: string;
}) {
  const dims = boxDims(stepIndex, overMax);
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const el = sceneRef.current;
    if (!el) return;
    const fit = () => setScale(boxScale(el.clientWidth, dims));
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [dims.w, dims.h, dims.d, dims.frontH]); // eslint-disable-line react-hooks/exhaustive-deps

  const proj = projectedSize(dims);
  // 段ボールの4面。前面だけ低い。z は全部 ±d/2 に揃える（揃えないと箱が平板に見える）。
  const face = 'absolute border border-[#8f6537] dark:border-[#543918]';
  const style = { width: dims.w, height: dims.h } as const;

  return (
    <div
      ref={sceneRef}
      data-testid="packing-box-scene"
      className={`relative w-full overflow-hidden ${className}`}
      style={{ height: Math.max(140, proj.h * scale + 24) }}
      role="img"
      aria-label={
        label ??
        `Parcel box, ${items.length} item${items.length === 1 ? '' : 's'}, weight step ${
          overMax ? 'above the EMS table' : String(boxNotch(stepIndex, overMax) + 1)
        }`
      }
    >
      <div
        data-testid="packing-box"
        className="absolute left-1/2 top-1/2 transition-transform duration-500 motion-reduce:transition-none"
        style={{
          ...style,
          transformStyle: 'preserve-3d',
          transform: `translate(-50%, -50%) scale(${scale}) rotateX(${CAMERA_X_DEG}deg) rotateY(${CAMERA_Y_DEG}deg)`,
        }}
      >
        {/* 奥の壁 */}
        <div
          className={`${face} inset-0 bg-[#b0845a] dark:bg-[#6e4d28]`}
          style={{ transform: `translateZ(${-dims.d / 2}px)` }}
          aria-hidden="true"
        />
        {/* 床 */}
        <div
          className={`${face} bottom-0 left-0 right-0 bg-[#9d7247] dark:bg-[#5c3f1f]`}
          style={{
            height: dims.d,
            transformOrigin: '50% 100%',
            transform: `translateZ(${dims.d / 2}px) rotateX(90deg)`,
          }}
          aria-hidden="true"
        />
        {/* 左の壁。前へ行くほど低く落ちる（開口） */}
        <div
          className={`${face} bottom-0 left-0 top-0 bg-[#b0845a] dark:bg-[#6e4d28]`}
          style={{
            width: dims.d,
            transformOrigin: '0 50%',
            transform: `translateZ(${dims.d / 2}px) rotateY(90deg)`,
            clipPath: `polygon(0 calc(100% - ${dims.frontH}px), 100% 0, 100% 100%, 0 100%)`,
          }}
          aria-hidden="true"
        />
        {/* 中身。床に一列に置くだけ。**隙間を埋めにいかない。** */}
        <div
          data-testid="packing-box-contents"
          className="pointer-events-none absolute bottom-0 left-0 right-0 flex items-end justify-center gap-2 px-3 pb-1"
          style={{ transform: `translateZ(${-dims.d / 6}px)`, transformStyle: 'preserve-3d' }}
        >
          {items.map((item) => (
            <div
              key={item.key}
              data-testid="packed-item"
              data-estimated={item.estimated ? 'true' : 'false'}
              /* **推定重量は半透明。**確定重量は不透明。 */
              className={item.estimated ? 'opacity-50' : 'opacity-100'}
            >
              {renderGlyph ? renderGlyph(item) : <PlaceholderGlyph />}
            </div>
          ))}
        </div>
        {/* 右の側面 */}
        <div
          className={`${face} bottom-0 right-0 top-0 bg-[#c1935f] dark:bg-[#8a6132]`}
          style={{
            width: dims.d,
            transformOrigin: '100% 50%',
            transform: `translateZ(${dims.d / 2}px) rotateY(-90deg)`,
            clipPath: `polygon(0 0, 100% calc(100% - ${dims.frontH}px), 100% 100%, 0 100%)`,
          }}
          aria-hidden="true"
        />
        {/* 前面。**全高にしない** — 全高だと中身が壁の裏に隠れる。 */}
        <div
          className={`${face} bottom-0 left-0 right-0 bg-[#d8ae7c] dark:bg-[#a5773f]`}
          style={{ height: dims.frontH, transform: `translateZ(${dims.d / 2}px)` }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
