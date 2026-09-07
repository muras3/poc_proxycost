import type { ReactNode } from 'react';
import { VIEW_W, VIEW_H, BASE } from './primitives';
import { SHAPES, type GlyphShape } from './shapes';
import { familyTone, familyName } from './families';
import type { Family } from './families';
import { drawBox } from './box';
import { drawCard } from './card';
import { drawMedia } from './media';
import { drawBag } from './bag';
import { drawShoe } from './shoe';
import { drawBottle } from './bottle';
import { drawPacket } from './packet';
import { drawBlister } from './blister';
import { drawReel } from './reel';
import { drawLong } from './long';
import { drawGarment } from './garment';
import { drawBogu } from './bogu';
import { drawUnknown } from './unknown';

export { SHAPES } from './shapes';
export type { GlyphShape } from './shapes';
export { familyTone, familyName, FAMILY_ORDER } from './families';
export type { Family } from './families';

function body(s: GlyphShape): ReactNode {
  switch (s.fam) {
    case 'box': return drawBox(s);
    case 'card': return drawCard(s);
    case 'media': return drawMedia(s);
    case 'bag': return drawBag(s);
    case 'shoe': return drawShoe(s);
    case 'bottle': return drawBottle(s);
    case 'packet': return drawPacket(s);
    case 'blister': return drawBlister(s);
    case 'reel': return drawReel(s);
    case 'long': return drawLong(s);
    case 'garment': return drawGarment(s);
    case 'bogu': return drawBogu(s);
  }
}

/** 重量ライン id から家族を引く。無ければ 'unknown'。 */
export function glyphFamily(lineId: string | null | undefined): Family | 'unknown' {
  const s = lineId == null ? undefined : SHAPES[lineId];
  return s ? s.fam : 'unknown';
}

export function hasGlyph(lineId: string): boolean {
  return SHAPES[lineId] !== undefined;
}

export interface GlyphProps {
  /** src/data/weights.ts の重量ライン id。引き当たらなければ「不明」の形になる。 */
  lineId?: string | null;
  /** 読み上げ用の名前。無ければ家族名。 */
  label?: string;
  /** 重量が推定のとき true。**どれが総額の不確実さを生んでいるかを形で言う。** */
  estimated?: boolean;
  /** px。既定は語彙の縦横比のまま。 */
  size?: number;
  className?: string;
  /** 装飾として使うとき true。読み上げから外す。 */
  decorative?: boolean;
}

/**
 * 形は固定のルックアップ。**生成しない。**同じ id は必ず同じ形になる。
 * 実寸は主張しない（寸法データを持っていない）。形は「何の種類か」だけを言う。
 */
export function Glyph({
  lineId, label, estimated = false, size, className = '', decorative = false,
}: GlyphProps) {
  const shape = lineId == null ? undefined : SHAPES[lineId];
  const fam: Family | 'unknown' = shape ? shape.fam : 'unknown';
  const name = label ?? familyName[fam];
  const inner = shape ? body(shape) : drawUnknown();

  // 推定重量は半透明にする。**SVG では群の opacity を使う。**
  // CSS 3D の試作が opacity を避けて色に透明度を混ぜたのは、面ごとに透かすと
  // 立体が潰れるからだった。SVG は群を先に合成してから透かすので面の重なりは保たれ、
  // 背景色を知らなくても効く。だから試作の理由はここでは当たらず、群 opacity の方が良い。
  const g = estimated ? <g opacity={0.62}>{inner}</g> : inner;

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      width={size}
      height={size == null ? undefined : (size * VIEW_H) / VIEW_W}
      className={`${familyTone[fam]} ${className}`}
      style={{ overflow: 'visible' }}
      role={decorative ? 'presentation' : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : name}
    >
      {decorative ? null : <title>{name}</title>}
      {/* 接地線。全家族が同じ高さに立つ。 */}
      <line
        x1={2}
        y1={BASE + 0.5}
        x2={98}
        y2={BASE + 0.5}
        stroke="currentColor"
        strokeOpacity={0.28}
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      {g}
    </svg>
  );
}
