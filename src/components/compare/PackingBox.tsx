'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * 段ボール箱。**中身を「詰める」絵ではない。**
 * この箱の見た目（`stepIndex`＝段）は EMS 固有の概念ではない——呼び出し側が
 * 「この箱がどれだけ大きく見えるべきか」を渡す添字で、EMS の行を使うときは
 * `emsFor()` の段をそのまま渡すが、宅配便のように段表そのものが無い方式では
 * 呼び出し側が固定の添字（0）を渡す（`ParcelView.tsx` の `MultiBoxView`／
 * `CourierSingleBoxView` 参照）。**このファイル自身は EMS の表を持たない**
 * ——以前は `EMS_TABLE.length` を大きさの上限に借りていたが、見た目の段数と
 * EMS 表の段数を混ぜる理由が無い（2026-09-12、`ParcelView` の EMS 依存を
 * 外す作業で分離）。ここでやることは2つだけ:
 *   1. 呼び出し側が渡した段を、大きさで（離散的に）示す
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

/**
 * 見た目の段の総数。**EMS 表の段数（42）をそのまま流用しているだけ**——箱の
 * 大きさの見た目のレンジを決める定数であって、EMS の料金表を参照しているわけ
 * ではない（このファイルは EMS を import しない）。
 */
const VISUAL_NOTCH_COUNT = 42;

/** 表の外（EMS なら 30kg 超）は最上段の1つ先の「余白の段」として扱う。
 *  **最上段に丸めない。** */
export const OVER_MAX_NOTCH = VISUAL_NOTCH_COUNT;

/** 段の添字 → 箱の段（notch）。重量からは計算しない。 */
export function boxNotch(stepIndex: number, overMax: boolean): number {
  if (overMax) return OVER_MAX_NOTCH;
  return Math.min(VISUAL_NOTCH_COUNT - 1, Math.max(0, stepIndex));
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
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  /** 中身の列が箱の内寸に収まる縮尺。**箱から漏れさせないためだけの値。** */
  const [rowScale, setRowScale] = useState(1);

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

  /**
   * **中身は箱の中に収める。**
   * 列は横一列で折り返さない（折り返すと「詰めている」絵になる）ので、
   * 品数が増えると自然幅が内寸を超え、両端の品が箱の外の壁の上に載る。
   * 品の大きさは実寸を主張していない（形は種類だけを言う）ので、
   * 列ごと縮めて収める方が、箱から漏れさせるより嘘が少ない。
   *
   * 箱のローカル座標で測る。offsetWidth はレイアウト幅なので、
   * この要素自身にかけた scale には影響されない（測って掛けても振動しない）。
   */
  useLayoutEffect(() => {
    const row = rowRef.current;
    const holder = row?.parentElement;
    if (!row || !holder) return;
    const fit = () => {
      const pad = getComputedStyle(holder);
      const avail =
        holder.clientWidth - parseFloat(pad.paddingLeft || '0') - parseFloat(pad.paddingRight || '0');
      const natural = row.offsetWidth;
      setRowScale(natural > 0 && avail > 0 ? Math.min(1, avail / natural) : 1);
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(fit);
    ro.observe(row);
    ro.observe(holder);
    return () => ro.disconnect();
  }, [dims.w, items.length]);

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
        {/* 奥の壁。**内側は紙の内側の色。**中身の語彙は明るい地を前提に
            currentColor を 0.14〜0.42 の塗り不透明度で置くので、
            ここを茶色にすると中身のコントラストが 1.1:1 まで落ちて消える。 */}
        <div
          className={`${face} inset-0 bg-[#f0e3d1] dark:bg-[#2b2119]`}
          style={{ transform: `translateZ(${-dims.d / 2}px)` }}
          aria-hidden="true"
        />
        {/* 床 */}
        <div
          className={`${face} bottom-0 left-0 right-0 bg-[#e4d3ba] dark:bg-[#221a13]`}
          style={{
            height: dims.d,
            transformOrigin: '50% 100%',
            transform: `translateZ(${dims.d / 2}px) rotateX(90deg)`,
          }}
          aria-hidden="true"
        />
        {/* 左の壁。前へ行くほど低く落ちる（開口） */}
        <div
          className={`${face} bottom-0 left-0 top-0 bg-[#e9dcc8] dark:bg-[#261d15]`}
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
          {/* 収めるための縮尺。原点は床の中央なので、縮めても接地したまま。 */}
          <div
            ref={rowRef}
            data-testid="packing-box-row"
            className="flex items-end gap-2"
            style={{
              transform: `scale(${rowScale})`,
              transformOrigin: '50% 100%',
              transformStyle: 'preserve-3d',
            }}
          >
          {items.map((item) => (
            <div
              key={item.key}
              data-testid="packed-item"
              data-estimated={item.estimated ? 'true' : 'false'}
              /* **推定重量は半透明。**確定重量は不透明。
                 ただし薄めるのは一度だけ。renderGlyph を渡す呼び出し側（ParcelView →
                 Glyph）は自分で群 opacity を掛けるので、ここで重ねると 0.5 x 0.62 = 0.31
                 になり、推定の品が「薄い」ではなく「見えない」になる。 */
              className={!renderGlyph && item.estimated ? 'opacity-50' : 'opacity-100'}
            >
              {renderGlyph ? renderGlyph(item) : <PlaceholderGlyph />}
            </div>
          ))}
          </div>
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
