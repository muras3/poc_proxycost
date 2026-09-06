import { describe, test, expect } from 'vitest';

import {
  RATES, RATES_AS_OF, RATES_FETCHED_ON, RATES_SOURCE_URL, RATES_STALE, ECB_PER_EUR, rateLabel,
} from './rates';

// ─────────────────────────────────────────────────────────────────────────────
// 為替は「出典から転記した」と画面で名乗る。**その主張をここで縛る。**
// 以前は転記していない日付だけが今日になっていた（docs/audit/gaps.md G3）。
// ─────────────────────────────────────────────────────────────────────────────
describe('rates are a transcription of the ECB reference rates, not a guess', () => {
  test('every rate is the ECB cross-rate, rounded to the sen', () => {
    // 円/通貨 = 円/EUR ÷ 通貨/EUR。ECB の原文から独立に組み直して突き合わせる。
    const jpy = ECB_PER_EUR['JPY']!;
    for (const [ccy, yen] of Object.entries(RATES)) {
      const perEur = ccy === 'EUR' ? 1 : ECB_PER_EUR[ccy];
      expect(perEur, `${ccy} が ECB_PER_EUR に無い`).toBeTypeOf('number');
      expect(yen, ccy).toBe(Math.round((jpy / perEur!) * 100) / 100);
    }
  });

  test('the six currencies the app quotes all come from the same document', () => {
    expect(Object.keys(RATES).sort()).toEqual(['AUD', 'CAD', 'EUR', 'GBP', 'SGD', 'USD']);
    // 同じ1枚の XML から取っているので、通貨ごとに時点がばらけない。
    expect(Object.keys(RATES_STALE)).toEqual([]);
  });

  test('the source is a central bank at a fixed machine-readable URL', () => {
    expect(RATES_SOURCE_URL).toBe('https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml');
  });

  test('the reference date and the day we read it are separate, and both are real dates', () => {
    // ECB は土日を公表しない。**取得日を参照日として名乗ったのが元の嘘だった。**
    for (const d of [RATES_AS_OF, RATES_FETCHED_ON]) {
      expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10)).toBe(d);
    }
    // 参照日が取得日より後になることはない。
    expect(RATES_AS_OF <= RATES_FETCHED_ON).toBe(true);
    // 参照日は ECB の営業日（土日ではない）。
    expect(new Date(`${RATES_AS_OF}T00:00:00Z`).getUTCDay()).not.toBe(0);
    expect(new Date(`${RATES_AS_OF}T00:00:00Z`).getUTCDay()).not.toBe(6);
  });

  test('rates are shown to the sen, so 211.4 does not read as "we only know the ten-yen"', () => {
    expect(rateLabel(RATES['GBP']!)).toBe('211.40');
    expect(rateLabel(RATES['EUR']!)).toBe('181.59');
  });
});
