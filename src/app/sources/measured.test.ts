import { describe, expect, test } from 'vitest';

import { compare } from '@/lib/pricing/compare';
import type { CountryCode, Item, Row } from '@/lib/pricing/types';
import {
  CONFIDENCE_SPLIT, CROSSOVER_G, GB_SPLIT, MEASURED_BASKET, WEIGHT_SHIFT,
} from './measured';

// ─────────────────────────────────────────────────────────────────────────────
// /sources は「これは実測だ」と名乗って数字を出す。**その主張をここで縛る。**
// 為替を ECB へ直したとき（4186822）この表を直し忘れ、公開ページが ¥58 古い総額を
// 2026-09-06 の実測として出していた。手で書いた数字は、測り直す仕掛けが無ければ腐る。
// ─────────────────────────────────────────────────────────────────────────────

function basket(weightG: number, units = MEASURED_BASKET.units): Item[] {
  return Array.from({ length: units }, (_, i) => ({
    id: `i${i}`,
    title: `i${i}`,
    priceYen: MEASURED_BASKET.priceYen,
    priceTier: 'fixed' as const,
    site: MEASURED_BASKET.site,
    weightG,
    weightTier: 'estimate' as const,
    qty: 1,
  }));
}

function rank(weightG: number, country: CountryCode = MEASURED_BASKET.country): Row[] {
  return compare({ items: basket(weightG), country }).rows;
}

const winner = (rows: Row[]): Row =>
  rows.find((r) => r.comparable) ?? (() => { throw new Error('no comparable row'); })();

describe('the numbers /sources calls measured are what compare() actually returns', () => {
  test('every weight row: total, cheapest, most expensive and the delta against 600 g', () => {
    const base = winner(rank(MEASURED_BASKET.weightG)).total;
    for (const row of WEIGHT_SHIFT) {
      const rows = rank(row.perItemG);
      const top = winner(rows);
      expect(top.total, `${row.perItemG}g total`).toBe(row.totalYen);
      expect(top.serviceName, `${row.perItemG}g cheapest`).toBe(row.cheapest);
      expect(rows[rows.length - 1]!.label, `${row.perItemG}g most expensive`).toBe(row.last);

      // '−17%' / '0%' / '+41%'。符号も画面に出る文字のまま突き合わせる。
      const pct = Math.round(((row.totalYen - base) / base) * 100);
      const shown = pct === 0 ? '0%' : pct > 0 ? `+${pct}%` : `−${Math.abs(pct)}%`;
      expect(shown, `${row.perItemG}g delta`).toBe(row.delta);
    }
  });

  test('the confidence split adds up to the 600 g total, slice by slice', () => {
    const top = winner(rank(MEASURED_BASKET.weightG));
    const sixHundred = WEIGHT_SHIFT.find((r) => r.perItemG === MEASURED_BASKET.weightG);
    expect(sixHundred?.totalYen, '600g の行が表に無い').toBe(top.total);

    const byTier: Record<string, number> = {};
    for (const l of top.lines) byTier[l.tier] = (byTier[l.tier] ?? 0) + (l.amount ?? 0);

    for (const slice of CONFIDENCE_SPLIT) {
      expect(byTier[slice.tier] ?? 0, `${slice.tier} の金額`).toBe(slice.yen);
      expect(`${Math.round((slice.yen / top.total) * 100)}%`, `${slice.tier} の割合`)
        .toBe(slice.share);
    }
    // 未取得（none）は 0 円なので、3つの確度で総額を説明しきれていること。
    expect(CONFIDENCE_SPLIT.reduce((a, s) => a + s.yen, 0)).toBe(top.total);
  });

  test('the United Kingdom split the page quotes is the United Kingdom, not the United States', () => {
    // 以前ここには米国の 47% / 53% が「英国では」と書かれていた。
    const top = winner(rank(MEASURED_BASKET.weightG, 'GB'));
    const published = top.lines
      .filter((l) => l.tier === 'fixed')
      .reduce((a, l) => a + (l.amount ?? 0), 0);
    const share = Math.round((published / top.total) * 100);
    expect(`${share}%`).toBe(GB_SPLIT.publishedShare);
    expect(`${100 - share}%`).toBe(GB_SPLIT.inferredShare);
  });

  test('the crossover weights the page names are where the first place actually changes', () => {
    for (const [units, at] of Object.entries(CROSSOVER_G)) {
      const n = Number(units);
      const cc = MEASURED_BASKET.country;
      const at25gBelow = compare({ items: basket(at - 25, n), country: cc }).rows;
      const atCross = compare({ items: basket(at, n), country: cc }).rows;
      expect(winner(at25gBelow).serviceId, `n=${n}: ${at - 25}g`).toBe('neokyo');
      expect(winner(atCross).serviceId, `n=${n}: ${at}g`).toBe('fromjapan');
    }
  });
});
