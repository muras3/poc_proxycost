import { describe, expect, test } from 'vitest';
import { yen, yenRounded, totalIntervalText, yenRange } from './format';

/**
 * 監査 (docs/audit/close-coverage-gaps-2026-09-13.md ④): `format.ts` の丸め関数
 * には専用のテストが無かった。`Math.round` の出現箇所の棚卸し（監査メモに表で残す）
 * と、丸め単位そのもの・`.5` の丸め方向を固定する。
 *
 * `yen()` は円単位（1円未満を丸める）。`yenRounded()` は総額表示専用で ¥100単位に
 * 丸める——`src/lib/pricing/compare.ts` の内部計算（`sum()`/`totalRange()`）はどこも
 * `yenRounded` を呼んでおらず、¥100単位の丸めは表示層だけで起き、計算に戻ってこない
 * （二重丸めが無いことは `compare.rounding.test.ts` 側で別途確認する）。
 */
describe('yen: rounds to the nearest whole yen', () => {
  test('rounds fractional yen amounts', () => {
    expect(yen(999.4)).toBe('¥999');
    expect(yen(999.5)).toBe('¥1,000'); // JS Math.round: .5 は +Infinity 方向（切り上げ）
    expect(yen(0)).toBe('¥0');
  });
});

describe('yenRounded: rounds to the nearest ¥100 (total display only)', () => {
  test('rounds down below the half-¥100 mark, up at and above it', () => {
    expect(yenRounded(149)).toBe('¥100');
    expect(yenRounded(150)).toBe('¥200'); // 半端 ¥50 は切り上げ方向（Math.round(1.5)=2 と同じ規則）
    expect(yenRounded(151)).toBe('¥200');
    expect(yenRounded(250)).toBe('¥300'); // 250/100=2.5 → Math.round は3（切り上げ）
  });

  test('the rounding unit is ¥100, not some other unit', () => {
    // これを ¥10 単位に変えても他のテストは気づかない、という監査の指摘に対する固定。
    // ¥149 は ¥100 単位なら ¥100 に丸まるが、¥10 単位なら ¥150 になる——単位を
    // 直接主張する。
    expect(yenRounded(149)).toBe('¥100');
    expect(yenRounded(1_049)).toBe('¥1,000');
    expect(yenRounded(1_050)).toBe('¥1,100');
  });
});

describe('totalIntervalText / yenRange: use the rounded formatter only when asked', () => {
  test('round=true uses ¥100 steps for both ends of the range', () => {
    expect(totalIntervalText({ low: 5_249, high: 19_849 }, true)).toBe('¥5,200 – 19,800');
    expect(totalIntervalText({ low: 5_249, high: 19_849 }, false)).toBe('¥5,249 – 19,849');
  });

  test('yenRange collapses a zero-width range to one number, in either rounding mode', () => {
    expect(yenRange([1_234, 1_234])).toBe('¥1,234');
    expect(yenRange([1_234, 1_234], true)).toBe('¥1,200');
  });
});
