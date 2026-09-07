import { describe, expect, it } from 'vitest';
import { ASSUMED_WEIGHT_G, weightFieldsFor } from '@/lib/pricing/weights';
import type { Item, WeightSensitivity } from '@/lib/pricing/types';
import { assumedWeightsSummary, assumedWeightsText } from './AssumedWeightsNote';

function item(over: Partial<Item> & { id: string }): Item {
  return {
    title: 'x', priceYen: 3000, priceTier: 'estimate', site: 'other',
    weightG: 500, weightTier: 'estimate', weightOrigin: 'table', qty: 1, ...over,
  };
}

/** 重量表に当たらない品。**仮置きの値も出どころも weightFieldsFor から取る**（決め打ちしない）。 */
function offTable(id: string, over: Partial<Item> = {}): Item {
  return item({ id, title: 'no such thing in the table', ...weightFieldsFor('zzz qqq'), ...over });
}

const decisive: WeightSensitivity = {
  lowG: 500, highG: 10_000,
  winnerAtLow: 'Neokyo', winnerAtHigh: 'ZenMarket',
  onlyPricedAtLow: false, onlyPricedAtHigh: false,
  decisive: true,
};

describe('assumedWeightsSummary — 引き当たっているカートでは黙る', () => {
  it('仮置きが1点も無ければ null。**注記そのものを出さない**', () => {
    expect(assumedWeightsSummary([item({ id: 'a' }), item({ id: 'b' })])).toBeNull();
  });

  it('利用者が入れた重量は仮置きではない', () => {
    const typed = item({ id: 'a', weightOrigin: 'user', weightG: 750 });
    expect(assumedWeightsSummary([typed])).toBeNull();
  });

  it('空のカートでも null（0 点中 0 点と言わない）', () => {
    expect(assumedWeightsSummary([])).toBeNull();
  });

  it('1点でも仮置きが混ざれば出す', () => {
    const s = assumedWeightsSummary([item({ id: 'a' }), offTable('b')])!;
    expect(s.count).toBe(1);
    expect(s.totalCount).toBe(2);
    expect(s.all).toBe(false);
  });
});

describe('assumedWeightsSummary — 数はカートから数える', () => {
  it('本番で見逃された形（3点中3点が仮置き）をそのまま数える', () => {
    const s = assumedWeightsSummary([offTable('a'), offTable('b'), offTable('c')])!;
    expect(s).toMatchObject({ count: 3, totalCount: 3, all: true, share: 1 });
    expect(s.assumedG).toBe(ASSUMED_WEIGHT_G * 3);
    expect(s.perItemG).toBe(ASSUMED_WEIGHT_G);
  });

  it('**数量ぶん重い。**1行に3個なら仮置きも3個ぶん', () => {
    const one = assumedWeightsSummary([offTable('a')])!;
    const three = assumedWeightsSummary([offTable('a', { qty: 3 })])!;
    expect(three.count).toBe(1);
    expect(three.assumedG).toBe(one.assumedG * 3);
    // 1点あたりの値は数量で薄まらない（「~1 kg each」の each は1個あたり）。
    expect(three.perItemG).toBe(one.perItemG);
  });

  it('割合はカート全体の重量に対して出す', () => {
    const s = assumedWeightsSummary([
      item({ id: 'a', weightG: ASSUMED_WEIGHT_G }), offTable('b'),
    ])!;
    expect(s.share).toBeCloseTo(0.5);
  });

  it('重量の分からない品を 0 g として分母に混ぜない', () => {
    const s = assumedWeightsSummary([item({ id: 'a', weightG: null }), offTable('b')])!;
    expect(s.share).toBe(1);
  });

  it('重量が1つも分からなければ割合は null。**0% とは書かない**', () => {
    const s = assumedWeightsSummary([offTable('a', { weightG: null })])!;
    expect(s.share).toBeNull();
    expect(s.assumedG).toBe(0);
  });

  it('仮置きの値が揃っていなければ「1点につき」は言わない', () => {
    const s = assumedWeightsSummary([offTable('a'), offTable('b', { weightG: 2000 })])!;
    expect(s.perItemG).toBeNull();
  });

  it('飛ばす先は最初の仮置きの品（引き当たった品を飛ばす先にしない）', () => {
    const s = assumedWeightsSummary([item({ id: 'a' }), offTable('b'), offTable('c')])!;
    expect(s.focusId).toBe('b');
  });

  it('1位を決めている仮置きだけを数える', () => {
    const s = assumedWeightsSummary(
      [offTable('a'), offTable('b'), item({ id: 'c' })],
      { a: decisive, c: decisive },
    )!;
    // c は仮置きではないので数えない。
    expect(s.decisive).toBe(1);
  });
});

describe('assumedWeightsText — 何点中何点かを1文で言う', () => {
  const textFor = (items: Item[], s: Record<string, WeightSensitivity> = {}) =>
    assumedWeightsText(assumedWeightsSummary(items, s)!);

  it('**3点のうち3点**が仮置きだと分かる形で言う', () => {
    const t = textFor([offTable('a'), offTable('b'), offTable('c')]);
    expect(t.headline).toBe('None of the 3 items in your cart have weight data.');
    // 仮置きの値は weightFieldsFor から来る。文言に埋め込まない。
    expect(t.placeholder).toContain('~1 kg each');
    expect(t.placeholder).toContain('whole parcel');
  });

  it('一部だけなら割合を言う（全部と同じ文にしない）', () => {
    const t = textFor([item({ id: 'a', weightG: ASSUMED_WEIGHT_G }), offTable('b')]);
    expect(t.headline).toBe('1 of the 2 items in your cart has no weight data.');
    expect(t.placeholder).toContain('50%');
    expect(t.placeholder).not.toContain('whole parcel');
  });

  it('2点以上なら複数形で数える', () => {
    const t = textFor([item({ id: 'a' }), offTable('b'), offTable('c')]);
    expect(t.headline).toBe('2 of the 3 items in your cart have no weight data.');
  });

  it('1点だけのカートは「1点中1点」と言わない', () => {
    expect(textFor([offTable('a')]).headline).toBe('This item has no weight data.');
  });

  it('総額と順位への影響を必ず言う', () => {
    const t = textFor([offTable('a'), offTable('b')]);
    expect(t.impact).toContain('totals');
    expect(t.impact).toContain('ranking');
  });

  it('1位を決めている仮置きがあるときだけ、その一文が増える', () => {
    expect(textFor([offTable('a'), offTable('b')]).decisive).toBeNull();
    expect(textFor([offTable('a'), offTable('b')], { a: decisive }).decisive)
      .toContain('cheapest');
    expect(textFor([offTable('a'), offTable('b')], { a: decisive, b: decisive }).decisive)
      .toBe('2 of them each decide which service comes out cheapest.');
  });

  it('重量を入れてもらう導線の文言は点数で単複が変わる', () => {
    expect(textFor([offTable('a')]).action).toBe('Enter the real weight');
    expect(textFor([offTable('a'), offTable('b')]).action).toBe('Enter the real weights');
  });

  it('**日本語をUIに混ぜない**（E2E が検出する散文の規約）', () => {
    const t = textFor([offTable('a'), offTable('b')], { a: decisive });
    const all = [t.headline, t.placeholder, t.impact, t.decisive ?? '', t.action].join(' ');
    expect(all).not.toMatch(/[ぁ-んァ-ヶ一-龠]/);
  });
});

describe('割合の丸め — 0% と 100% を軽々しく書かない', () => {
  it('丸めて 0% になる割合は「under 1%」', () => {
    const heavy = item({ id: 'a', weightG: 500_000 });
    const t = assumedWeightsText(assumedWeightsSummary([heavy, offTable('b')])!);
    expect(t.placeholder).toContain('under 1%');
    expect(t.placeholder).not.toContain('0%');
  });

  it('全部が仮置きでないのに 100% と丸まる割合は「over 99%」', () => {
    const light = item({ id: 'a', weightG: 1 });
    const t = assumedWeightsText(assumedWeightsSummary([light, offTable('b')])!);
    expect(t.placeholder).toContain('over 99%');
    expect(t.placeholder).not.toContain('100%');
  });
});
