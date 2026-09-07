import { describe, expect, it } from 'vitest';
import { EMS_TABLE, EMS_ZONE, emsFor, emsYen } from '@/lib/pricing/ems';
import { ladderRungs, stepFill, stepLowerGrams, type Rung } from './WeightLadder';

const zone = EMS_ZONE.US;
const steps = (rungs: Rung[]) => rungs.filter((r) => r.kind === 'step');
const now = (rungs: Rung[]) => rungs.filter((r) => r.kind !== 'gap' && r.state === 'now');

describe('描画される段', () => {
  it('EMS_TABLE の全段を出す（手で書いた段は無い）', () => {
    const rungs = ladderRungs({ stepIndex: 0, zone, grams: 100 });
    expect(steps(rungs)).toHaveLength(EMS_TABLE.length);
    expect(steps(rungs).map((r) => r.grams)).toEqual(EMS_TABLE.map((row) => row[0]));
  });

  it('料金は EMS_TABLE の地帯列から取る', () => {
    const rungs = steps(ladderRungs({ stepIndex: 0, zone, grams: 100 }));
    expect(rungs[0]!.yen).toBe(emsYen(0, zone));
    expect(rungs.at(-1)!.yen).toBe(emsYen(EMS_TABLE.length - 1, zone));
  });

  it('表の外のときだけ、表の先に段が1つ増える', () => {
    const inside = ladderRungs({ stepIndex: 3, zone, grams: 800 });
    expect(inside.some((r) => r.kind === 'over')).toBe(false);
    const outside = ladderRungs({ stepIndex: -1, overMax: true, zone, grams: 31000 });
    expect(steps(outside)).toHaveLength(EMS_TABLE.length);
    expect(outside.filter((r) => r.kind === 'over')).toHaveLength(1);
  });
});

describe('現在段の判定', () => {
  it('現在段はちょうど1つ', () => {
    for (const grams of [1, 500, 501, 4321, 15000, 30000]) {
      const { index } = emsFor(grams, zone);
      expect(now(ladderRungs({ stepIndex: index, zone, grams }))).toHaveLength(1);
    }
  });

  it('現在段の前が past、後ろが next', () => {
    const rungs = steps(ladderRungs({ stepIndex: 5, zone, grams: 950 }));
    expect(rungs[4]!.state).toBe('past');
    expect(rungs[5]!.state).toBe('now');
    expect(rungs[6]!.state).toBe('next');
  });

  it('表の外では表の最上段を現在段にしない（丸めない）', () => {
    const rungs = ladderRungs({ stepIndex: -1, overMax: true, zone, grams: 31000 });
    expect(steps(rungs).every((r) => r.state === 'past')).toBe(true);
    const over = rungs.find((r) => r.kind === 'over');
    expect(over?.state).toBe('now');
    // **持っていない数字を 0 と書かない。** null で持つ。
    expect(over?.yen).toBeNull();
  });
});

describe('段の境界', () => {
  it('段の下限は1つ前の段の上限。最初の段の下は 0', () => {
    expect(stepLowerGrams(0)).toBe(0);
    expect(stepLowerGrams(1)).toBe(EMS_TABLE[0]![0]);
    expect(stepLowerGrams(EMS_TABLE.length - 1)).toBe(EMS_TABLE.at(-2)![0]);
  });

  it('上限ちょうどは同じ段のまま満ちる。1g 超えると次の段の入口', () => {
    const up = EMS_TABLE[0]![0]!; // 500g
    const at = emsFor(up, zone);
    const over = emsFor(up + 1, zone);
    expect(at.index).toBe(0);
    expect(stepFill(up, at.index)).toBe(1);
    expect(over.index).toBe(1);
    expect(stepFill(up + 1, over.index)).toBeGreaterThan(0);
    expect(stepFill(up + 1, over.index)).toBeLessThan(0.05);
  });

  it('段の中ほどはおよそ半分', () => {
    // 1000g→1250g の段の真ん中
    const index = emsFor(1125, zone).index;
    expect(stepFill(1125, index)).toBeCloseTo(0.5, 5);
  });

  it('塗りは 0〜1 に収まる', () => {
    expect(stepFill(-100, 0)).toBe(0);
    expect(stepFill(999999, 3)).toBe(1);
  });

  it('通り過ぎた段は満ち、これからの段は空', () => {
    const rungs = steps(ladderRungs({ stepIndex: 5, zone, grams: 950 }));
    expect(rungs[0]!.fill).toBe(1);
    expect(rungs[10]!.fill).toBe(0);
  });
});
