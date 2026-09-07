import { describe, expect, test } from 'vitest';
import { WEIGHT_CATEGORIES } from '@/data/weights';
import { compare } from './compare';
import { weightFieldsFor } from './weights';
import {
  US_DUTY_BY_CATEGORY, US_SECTION_301_FLOOR, categoryIdOfLine, categoryIdsOf, readUsDuty,
} from './us-duty';
import { COUNTRIES } from './countries';
import type { Item, Row } from './types';

const item = (title: string, priceYen = 12000): Item => ({
  id: title, title, priceYen, priceTier: 'fixed', site: 'yahoo-auctions',
  qty: 1, ...weightFieldsFor(title),
});
const dutyOf = (items: Item[], cc: 'US' | 'GB' | 'AU' = 'US') => {
  const row = compare({ items, country: cc }).rows[0] as Row;
  return row.lines.find((l) => l.key === 'duty')!;
};

describe('the US 12.5% is checked against the tariff, category by category', () => {
  test('every weight category we cover has a verdict, and every verdict names its headings', () => {
    // 表にカテゴリを足したのにここを足し忘れると、そのカテゴリは黙って
    // 「分類できなかった」に落ちる。落ちること自体は安全側だが、気付けないと直せない。
    const covered = Object.keys(US_DUTY_BY_CATEGORY);
    const all = WEIGHT_CATEGORIES.map((c) => c.category);
    expect(covered.sort()).toEqual([...all].sort());
    for (const d of Object.values(US_DUTY_BY_CATEGORY)) {
      expect(d.headings.length, d.categoryId).toBeGreaterThan(0);
      for (const h of d.headings) expect(h.htsNo, d.categoryId).toMatch(/^\d{4}\.\d{2}(\.\d{2})?$/);
      expect(d.sayEn.length, d.categoryId).toBeGreaterThan(20);
    }
  });

  test("'at-or-below' really means every heading we listed is at or below the floor", () => {
    // 判定と、引いた率が食い違っていたら判定のほうが嘘になる。
    const pct = (g: string) => (g === 'Free' ? 0 : Number(g.replace('%', '')) / 100);
    for (const d of Object.values(US_DUTY_BY_CATEGORY)) {
      if (d.verdict !== 'at-or-below') continue;
      for (const h of d.headings) {
        expect(/^(Free|[\d.]+%)$/.test(h.general), `${d.categoryId} ${h.htsNo}`).toBe(true);
        expect(pct(h.general), `${d.categoryId} ${h.htsNo}`).toBeLessThanOrEqual(US_SECTION_301_FLOOR);
      }
    }
  });

  test("'can-exceed' really means at least one heading we listed is above the floor", () => {
    for (const d of Object.values(US_DUTY_BY_CATEGORY)) {
      if (d.verdict !== 'can-exceed') continue;
      const over = d.headings.some((h) => {
        const m = h.general.match(/([\d.]+)%/);
        return !!m && Number(m[1]) / 100 > US_SECTION_301_FLOOR;
      });
      expect(over, `${d.categoryId} claims it can exceed but no heading does`).toBe(true);
    }
  });

  test('a basket of figures is told the 12.5% is the rate, not a floor', () => {
    const duty = dutyOf([item('Hatsune Miku 1/7 scale figure')]);
    expect(duty.amount).toBe(Math.round(12000 * 0.125));
    expect(duty.note).toContain('9503.00.00');
    expect(duty.note).toContain('not a floor');
    // 我々の仮定ではないので確度は据え置き（countries.ts のまま）。
    expect(duty.tier).toBe(COUNTRIES.US.dutyTier);
  });

  test('a basket of sneakers is told the 12.5% is only a floor, and the line is drawn as ours', () => {
    const duty = dutyOf([item('sneaker casual')]);
    expect(duty.amount).toBe(Math.round(12000 * 0.125));
    expect(duty.note).toContain('only the floor');
    expect(duty.note).toContain('chapter 64');
    expect(duty.note).toContain('Your bill can be higher');
    // **下限だと分かっている数字を確定寄りの確度で描かない。**
    expect(duty.tier).toBe('estimate');
  });

  test('one item that can exceed drags the whole basket down to the weaker reading', () => {
    // 強いほうに合わせると、混ざった籠で「これが税率です」と嘘になる。
    const mixed = dutyOf([item('Hatsune Miku 1/7 scale figure'), item('sneaker casual')]);
    expect(mixed.note).toContain('only the floor');
    expect(mixed.tier).toBe('estimate');
  });

  test('a basket we cannot classify keeps the old confidence and says it is an assumption', () => {
    // 「分からない」は「超えると分かった」ではない。12.5% の出どころは USTR の措置で
    // あって我々の仮定ではないので、確度は据え置く。仮定であることは文で言う。
    const duty = dutyOf([item('mystery lot with no weight data')]);
    expect(duty.note).toContain('our assumption');
    expect(duty.tier).toBe(COUNTRIES.US.dutyTier);
  });

  test('sake is charged by the litre, so no percentage can be read off it', () => {
    const duty = dutyOf([item('junmai sake 720ml')]);
    expect(US_DUTY_BY_CATEGORY['food-tea-sake']!.verdict).toBe('not-ad-valorem');
    expect(duty.note).toContain('by the litre');
    expect(duty.tier).toBe('estimate');
  });

  test('the note only appears for the US — no other country gets a Section 301 sentence', () => {
    for (const cc of ['GB', 'AU'] as const) {
      expect(dutyOf([item('sneaker casual', 500000)], cc).note).not.toContain('Section 301');
    }
  });

  test('the category lookup reads the weight table, it does not carry its own copy', () => {
    expect(categoryIdOfLine('scale-1-7')).toBe('figures');
    expect(categoryIdOfLine('sake-720ml')).toBe('food-tea-sake');
    expect(categoryIdOfLine('not-a-line')).toBeNull();
    expect(categoryIdsOf([item('Hatsune Miku 1/7 scale figure'), item('junmai sake 720ml')]))
      .toEqual(['figures', 'food-tea-sake']);
    expect(readUsDuty([]).verdict).toBe('unclassified');
  });
});
