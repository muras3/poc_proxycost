import { describe, expect, it } from 'vitest';
import { REMOTE_AREA_SURCHARGE_NOTE_TEXT } from './RemoteAreaSurchargeNote';

/**
 * **2026-09-13、オーナー確定文言（訂正3が最終版）を一言一句で固定する。**
 * 日本語原文: 「表示送料は燃油サーチャージ込みとして推定しています。
 * 遠隔地追加料金は含みません。」——意味を足す・弱めることを禁じられている。
 */
describe('REMOTE_AREA_SURCHARGE_NOTE_TEXT', () => {
  it('states fuel is estimated as included', () => {
    expect(REMOTE_AREA_SURCHARGE_NOTE_TEXT).toContain('estimated as fuel-surcharge inclusive');
  });

  it('states remote-area surcharges are not included', () => {
    expect(REMOTE_AREA_SURCHARGE_NOTE_TEXT).toContain('Remote-area surcharges are not included');
  });

  it('does not claim the total is exact, does not mention rank, does not weaken to "may be"', () => {
    expect(REMOTE_AREA_SURCHARGE_NOTE_TEXT.toLowerCase()).not.toContain('exact');
    expect(REMOTE_AREA_SURCHARGE_NOTE_TEXT.toLowerCase()).not.toContain('rank');
  });
});
