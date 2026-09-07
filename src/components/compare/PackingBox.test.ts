import { describe, expect, it } from 'vitest';
import { EMS_TABLE, emsFor, EMS_ZONE } from '@/lib/pricing/ems';
import {
  boxDims,
  boxNotch,
  boxScale,
  OVER_MAX_NOTCH,
  projectedSize,
  CAMERA_X_DEG,
  CAMERA_Y_DEG,
} from './PackingBox';

describe('boxNotch', () => {
  it('段の添字をそのまま使う', () => {
    expect(boxNotch(0, false)).toBe(0);
    expect(boxNotch(11, false)).toBe(11);
    expect(boxNotch(EMS_TABLE.length - 1, false)).toBe(EMS_TABLE.length - 1);
  });

  it('表の外は最上段に丸めず、その先の段になる', () => {
    expect(boxNotch(-1, true)).toBe(OVER_MAX_NOTCH);
    expect(OVER_MAX_NOTCH).toBeGreaterThan(EMS_TABLE.length - 1);
  });
});

describe('boxDims', () => {
  it('同じ段なら重量が違っても同じ大きさ（連続的に膨らませない）', () => {
    const zone = EMS_ZONE.US;
    const a = emsFor(1010, zone);
    const b = emsFor(1240, zone);
    expect(a.index).toBe(b.index);
    expect(boxDims(a.index)).toEqual(boxDims(b.index));
  });

  it('段を跨いだときだけ大きくなる', () => {
    const zone = EMS_ZONE.US;
    const below = emsFor(1000, zone); // 1000g 段の上限ちょうど
    const above = emsFor(1001, zone); // 次の段
    expect(above.index).toBe(below.index + 1);
    expect(boxDims(above.index).w).toBeGreaterThan(boxDims(below.index).w);
    expect(boxDims(above.index).h).toBeGreaterThan(boxDims(below.index).h);
    expect(boxDims(above.index).d).toBeGreaterThan(boxDims(below.index).d);
  });

  it('前面は低い開口箱（全高にすると中身が壁の裏に隠れる）', () => {
    for (const i of [0, 10, EMS_TABLE.length - 1]) {
      const dims = boxDims(i);
      expect(dims.frontH).toBeGreaterThan(0);
      expect(dims.frontH).toBeLessThan(dims.h / 2);
    }
  });

  it('表の外の箱は最上段より大きい', () => {
    const top = boxDims(EMS_TABLE.length - 1);
    const over = boxDims(-1, true);
    expect(over.w).toBeGreaterThan(top.w);
  });

  it('段の添字がおかしくても壊れない', () => {
    expect(boxDims(-1)).toEqual(boxDims(0));
    expect(boxDims(999)).toEqual(boxDims(EMS_TABLE.length - 1));
  });
});

describe('カメラ', () => {
  it('上から見下ろす（rotateX は負）。正だと下から見上げる向きになる', () => {
    expect(CAMERA_X_DEG).toBeLessThan(0);
    expect(CAMERA_Y_DEG).toBeLessThan(0);
  });

  it('奥行きが投影サイズに効く（平板にならない）', () => {
    const flat = projectedSize({ w: 250, h: 118, d: 0, frontH: 40 });
    const deep = projectedSize({ w: 250, h: 118, d: 112, frontH: 40 });
    expect(deep.w).toBeGreaterThan(flat.w);
    expect(deep.h).toBeGreaterThan(flat.h);
  });
});

describe('boxScale', () => {
  it('狭い画面では縮めて、投影幅が枠に収まる（画面外に出さない）', () => {
    for (const width of [280, 320, 360, 480]) {
      for (const index of [0, 20, EMS_TABLE.length - 1]) {
        const dims = boxDims(index);
        const s = boxScale(width, dims);
        expect(projectedSize(dims).w * s).toBeLessThanOrEqual(width + 0.001);
      }
    }
  });

  it('表の外の一番大きい箱でもモバイル幅に収まる', () => {
    const dims = boxDims(-1, true);
    expect(projectedSize(dims).w * boxScale(320, dims)).toBeLessThanOrEqual(320.001);
  });

  it('広い画面でも拡大はしない', () => {
    expect(boxScale(4000, boxDims(0))).toBe(1);
  });

  it('幅が測れないうちは 1', () => {
    expect(boxScale(0, boxDims(0))).toBe(1);
  });
});
