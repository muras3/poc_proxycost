import { describe, expect, it } from 'vitest';
import { PACKING_ADD_G, PACKING_MULTIPLIER, singleParcelGrossG } from '@/lib/pricing/compare';
import { EMS_TABLE, EMS_ZONE, emsFor } from '@/lib/pricing/ems';
import type { Item } from '@/lib/pricing/types';
import { crossedStep, parcelStateFor, postageDelta, type ParcelState } from './ParcelView';

function item(over: Partial<Item> & { id: string }): Item {
  return {
    title: 'x', priceYen: 3000, priceTier: 'estimate', site: 'other',
    weightG: 500, weightTier: 'estimate', weightOrigin: 'table', qty: 1, ...over,
  };
}

describe('singleParcelGrossG', () => {
  it('1個口にまとめたときの梱包後重量。compare() と同じ組み立て', () => {
    const g = singleParcelGrossG([item({ id: 'a', weightG: 1000 }), item({ id: 'b', weightG: 500 })]);
    expect(g).toBe(Math.round(1500 * PACKING_MULTIPLIER + PACKING_ADD_G));
  });

  it('数量ぶん数える', () => {
    expect(singleParcelGrossG([item({ id: 'a', weightG: 400, qty: 3 })]))
      .toBe(singleParcelGrossG([
        item({ id: 'a', weightG: 400 }), item({ id: 'b', weightG: 400 }), item({ id: 'c', weightG: 400 }),
      ]));
  });

  it('重量が無ければ null。**0 で埋めない**', () => {
    expect(singleParcelGrossG([item({ id: 'a', weightG: null })])).toBeNull();
    expect(singleParcelGrossG([])).toBeNull();
  });
});

describe('parcelStateFor', () => {
  it('段と料金は emsFor から来る（画面で計算し直さない）', () => {
    const items = [item({ id: 'a', weightG: 1000 })];
    const st = parcelStateFor(items, 'US')!;
    const g = singleParcelGrossG(items)!;
    expect(st.grams).toBe(g);
    expect(st).toMatchObject(
      { stepIndex: emsFor(g, EMS_ZONE.US).index, yen: emsFor(g, EMS_ZONE.US).yen, overMax: false },
    );
  });

  it('表の外は最上段に丸めず、料金を null にする', () => {
    const st = parcelStateFor([item({ id: 'a', weightG: 40_000 })], 'US')!;
    expect(st.overMax).toBe(true);
    expect(st.yen).toBeNull();
  });

  it('行き先が変われば地帯が変わり、同じ重量でも料金が変わる', () => {
    const items = [item({ id: 'a', weightG: 1000 })];
    expect(parcelStateFor(items, 'US')!.yen).not.toBe(parcelStateFor(items, 'SG')!.yen);
    expect(parcelStateFor(items, 'US')!.stepIndex).toBe(parcelStateFor(items, 'SG')!.stepIndex);
  });
});

const st = (grams: number, zone = EMS_ZONE.US): ParcelState => {
  const e = emsFor(grams, zone);
  return { grams, stepIndex: e.index, overMax: e.overMax, yen: e.yen };
};

describe('postageDelta / crossedStep', () => {
  it('**同じ段の中で重くなっても送料は動かない（+¥0）**', () => {
    const a = st(EMS_TABLE[0]![0]! - 100);
    const b = st(EMS_TABLE[0]![0]!);
    expect(crossedStep(a, b)).toBe(false);
    expect(postageDelta(a, b)).toBe(0);
  });

  it('段を跨いだら、跨いだ分だけ動く', () => {
    const a = st(EMS_TABLE[0]![0]!);
    const b = st(EMS_TABLE[0]![0]! + 1);
    expect(crossedStep(a, b)).toBe(true);
    expect(postageDelta(a, b)).toBe(EMS_TABLE[1]![4]! - EMS_TABLE[0]![4]!);
  });

  it('軽くなれば負の差になる（符号を潰さない）', () => {
    const a = st(EMS_TABLE[1]![0]!);
    const b = st(EMS_TABLE[0]![0]!);
    expect(postageDelta(a, b)).toBeLessThan(0);
  });

  it('表の外が絡む差は null。**0 とは書かない**', () => {
    expect(postageDelta(st(1000), st(40_000))).toBeNull();
    expect(postageDelta(st(40_000), st(1000))).toBeNull();
    expect(crossedStep(st(1000), st(40_000))).toBe(true);
  });

  it('前が無い（最初の描画）なら差は出さない', () => {
    expect(postageDelta(null, st(1000))).toBeNull();
    expect(crossedStep(null, st(1000))).toBe(false);
  });
});
