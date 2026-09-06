import { describe, expect, test } from 'vitest';
import { UNKNOWN_WEIGHT_STEPS_G } from './ems';
import {
  ASSUMED_WEIGHT_G, ASSUMED_WEIGHT_RANGE_G, WEIGHT_CATEGORIES, categoryById, resolveWeight,
  weightFieldsFor,
} from './weights';

describe('resolving a weight from a title', () => {
  test('a Nendoroid is 439 g, with the sample behind it', () => {
    const r = resolveWeight('Nendoroid Hatsune Miku');
    expect(r.grams).toBe(439);
    expect(r.tier).toBe('estimate');
    expect(r.categoryId).toBe('figures');
    expect(r.lineId).toBe('nendoroid');
    expect(r.source).toContain('Nendoroid');
    expect(r.source).toContain('n=426');
  });

  test('a 1/7 scale figure is 1,500 g', () => {
    const r = resolveWeight('1/7 scale figure');
    expect(r.grams).toBe(1500);
    expect(r.lineId).toBe('scale-1-7');
  });

  test('a line carries its P25–P75 — the range the winner may move in', () => {
    // ねんどろいどは 380–600 g。この幅だけで1位が替わるカートが実在する（compare.test.ts）。
    expect(resolveWeight('Nendoroid Hatsune Miku').rangeG).toEqual([380, 600]);
    // 1/7 は全件 1,500 g。幅が無いことも幅として返す（0 や null にしない）。
    expect(resolveWeight('1/7 scale figure').rangeG).toEqual([1500, 1500]);
    expect(resolveWeight('剣道胴 胴単品').rangeG).toEqual([1500, 7500]);
  });

  test('Japanese titles hit the same lines', () => {
    expect(resolveWeight('ねんどろいど 初音ミク').grams).toBe(439);
    expect(resolveWeight('ポップアップパレード ネズコ').lineId).toBe('pop-up-parade');
  });

  test('the longer word wins when two lines match', () => {
    // 'pop up parade' と '1/7' の両方に当たる。長い方を採る。
    const r = resolveWeight('Pop Up Parade 1/7 scale Rem');
    expect(r.lineId).toBe('pop-up-parade');
    expect(r.grams).toBe(800);
  });

  test('matching ignores case', () => {
    expect(resolveWeight('NENDOROID MIKU').grams).toBe(439);
    expect(resolveWeight('nendoroid miku').grams).toBe(439);
  });
});

// ── 当たらないときに何かを返してはいけない。ここが崩れると総額が嘘になる。
describe('a title we cannot resolve stays unresolved', () => {
  test('no fallback, no guess, no zero', () => {
    const r = resolveWeight('ぬいぐるみ');
    expect(r.grams).toBeNull();
    expect(r.grams).not.toBe(0);
    expect(r.tier).toBe('none');
    expect(r.source).toBeNull();
    expect(r.categoryId).toBeNull();
    expect(r.lineId).toBeNull();
  });

  test('an unrelated title gets nothing either', () => {
    for (const title of ['qwertyuiop zxcvbnm', '', '   ']) {
      expect(resolveWeight(title).grams).toBeNull();
      expect(resolveWeight(title).tier).toBe('none');
    }
  });

  test('an unknown category id does not open a fallback', () => {
    const r = resolveWeight('ぬいぐるみ', 'plushies-we-never-measured');
    expect(r.grams).toBeNull();
    expect(r.tier).toBe('none');
    expect(r.rangeG).toBeNull();
  });
});

// ── 計算機がカートに入れる重量。**null は入れない。**当たらなければ仮置きと名乗る。
describe('the weight the calculator puts on a cart item', () => {
  test('a title on the table gets the line: median, P25–P75, origin table, link id', () => {
    const w = weightFieldsFor('Nendoroid Kagamine Rin (example)');
    expect(w).toEqual({
      weightG: 439,
      weightTier: 'estimate',
      weightSource: 'Nendoroid · n=426 · 1.6x · www.solarisjapan.com',
      weightOrigin: 'table',
      weightRangeG: [380, 600],
      weightLineId: 'nendoroid',
    });
  });

  test('a title off the table gets the assumed weight and says so', () => {
    const w = weightFieldsFor('plush toy, no weight data');
    expect(w.weightG).toBe(ASSUMED_WEIGHT_G);
    expect(w.weightG).not.toBeNull();
    expect(w.weightG).not.toBe(0);
    // 仮置きは推定。確定に見せない。'none' は「—」の段階で、数字が入る以上は使わない。
    expect(w.weightTier).toBe('estimate');
    expect(w.weightOrigin).toBe('assumed');
    // 出所・ライン・幅は無い。**でっち上げない。**
    expect(w.weightSource).toBeNull();
    expect(w.weightLineId).toBeNull();
    expect(w.weightRangeG).toBeNull();
  });

  test('the assumed weight is the 1 kg EMS step, and the range we test it over is the step table', () => {
    // 1,000 g: 丸い数字なので測った値に見えない。2〜5点で1位が替わる 1,150〜1,625 g のすぐ下に
    // あるので、×1/3〜×3 の判定（333〜3,000 g）が交差点を必ず跨ぐ（docs/UI-DESIGN.md §4）。
    expect(ASSUMED_WEIGHT_G).toBe(1000);
    expect(ASSUMED_WEIGHT_RANGE_G).toEqual([500, 10000]);
    expect(ASSUMED_WEIGHT_RANGE_G).toEqual([
      UNKNOWN_WEIGHT_STEPS_G[0], UNKNOWN_WEIGHT_STEPS_G[UNKNOWN_WEIGHT_STEPS_G.length - 1],
    ]);
  });

  test('resolveWeight itself still refuses to guess — the assumption lives one layer up', () => {
    expect(resolveWeight('plush toy, no weight data').grams).toBeNull();
    expect(weightFieldsFor('plush toy, no weight data').weightG).toBe(ASSUMED_WEIGHT_G);
  });
});

describe('a category the user picked by hand', () => {
  test('the category average is used only when the user names the category', () => {
    expect(resolveWeight('ぬいぐるみ').grams).toBeNull();
    const r = resolveWeight('ぬいぐるみ', 'figures');
    expect(r.grams).toBe(1000);
    expect(r.tier).toBe('estimate');
    expect(r.source).toBe('Figures category average');
    expect(r.categoryId).toBe('figures');
    expect(r.lineId).toBeNull();
  });

  test('a named category does not borrow lines from another one', () => {
    // 'cd' は music のライン。figures を指定したら当ててはいけない。
    expect(resolveWeight('CD box set').lineId).toBe('cd');
    const r = resolveWeight('CD box set', 'figures');
    expect(r.categoryId).toBe('figures');
    expect(r.lineId).toBeNull();
    expect(r.grams).toBe(1000);
  });

  test('a line inside the named category still wins over its average', () => {
    const r = resolveWeight('Nendoroid Miku', 'figures');
    expect(r.lineId).toBe('nendoroid');
    expect(r.grams).toBe(439);
  });
});

describe('the weight data itself', () => {
  test('categories are unique and carry their sources', () => {
    const ids = WEIGHT_CATEGORIES.map((c) => c.category);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('figures');
    expect(ids).toContain('music');
    for (const c of WEIGHT_CATEGORIES) {
      expect(c.lines.length).toBeGreaterThan(0);
      expect(c.sources.length).toBeGreaterThan(0);
      // Shopify の grams は実測ではない。measured を勝手に立てない。
      expect(typeof c.measured).toBe('boolean');
    }
  });

  test('every line has a usable median between its quartiles', () => {
    for (const c of WEIGHT_CATEGORIES) {
      for (const l of c.lines) {
        expect(l.medianG).toBeGreaterThan(0);
        expect(l.p25).toBeLessThanOrEqual(l.medianG);
        expect(l.p75).toBeGreaterThanOrEqual(l.medianG);
        expect(l.match.length).toBeGreaterThan(0);
        expect(l.match.every((m) => m.length > 0)).toBe(true);
      }
    }
  });

  test('a fallback is either a real number of grams or refused outright', () => {
    for (const c of WEIGHT_CATEGORIES) {
      if (c.fallbackG == null) expect(c.fallbackTier).toBe('none');
      else expect(c.fallbackG).toBeGreaterThan(0);
    }
  });

  test('categoryById finds what exists and nothing else', () => {
    expect(categoryById('figures')?.labelEn).toBe('Figures');
    expect(categoryById('music')?.lines.map((l) => l.id)).toEqual(['cd', 'lp']);
    expect(categoryById('nope')).toBeUndefined();
  });
});
