import { describe, expect, test } from 'vitest';
import { SERVICES } from './services';
import {
  ALTERNATIVE_SHIPPING,
  ALTERNATIVE_SHIPPING_SECOND_HAND,
  ALTERNATIVE_SHIPPING_VERIFIED,
  nameList,
} from './shipping-methods';

// 順位表の開示（EmsOnlyNote）と /sources#ems はこの表から文言を作る。
// **表が崩れると、画面の開示が黙って弱くなる。**そこを固定する。

describe('the methods we do not price', () => {
  test('every service in the ranking has a row — nobody is silently left out', () => {
    expect(ALTERNATIVE_SHIPPING).toHaveLength(SERVICES.length);
    const ids = ALTERNATIVE_SHIPPING.map((s) => s.serviceId).sort();
    expect(ids).toEqual(SERVICES.map((s) => s.id).sort());
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of ALTERNATIVE_SHIPPING) {
      const service = SERVICES.find((x) => x.id === s.serviceId)!;
      expect(s.serviceName).toBe(service.name);
    }
  });

  test('every row names at least one cheaper method — a row with none would read as “EMS only”', () => {
    for (const s of ALTERNATIVE_SHIPPING) {
      expect(s.methods.length, `${s.serviceName} lists no alternative to EMS`).toBeGreaterThan(0);
      // EMS はこの表の外。ここに混ぜると「EMS 以外にこれだけある」が数えられなくなる。
      for (const m of s.methods) expect(m).not.toMatch(/\bEMS\b/);
    }
  });

  test('every row cites the page it came from and the day we read it', () => {
    for (const s of ALTERNATIVE_SHIPPING) {
      expect(s.sourceUrl, s.serviceName).toMatch(/^https:\/\//);
      expect(s.checkedOn, s.serviceName).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  test('a row we could not read the original for is second-hand and says why', () => {
    for (const s of ALTERNATIVE_SHIPPING) {
      // 確度は2値だけ。'estimate' や 'none' を置くと画面の描き分けが決まらない。
      expect(['fixed', 'unverified']).toContain(s.tier);
      if (s.tier === 'fixed') {
        expect(s.note, `${s.serviceName} is first-hand, so it needs no excuse`).toBeNull();
      } else {
        expect(s.note, `${s.serviceName} is second-hand and must say why`).toBeTruthy();
      }
    }
    // 二次情報のまま置いてある社は画面で点線になる。分け方が壊れていないこと。
    expect(ALTERNATIVE_SHIPPING_VERIFIED.every((s) => s.tier === 'fixed')).toBe(true);
    expect(ALTERNATIVE_SHIPPING_SECOND_HAND.every((s) => s.tier !== 'fixed')).toBe(true);
    expect(ALTERNATIVE_SHIPPING_VERIFIED.length + ALTERNATIVE_SHIPPING_SECOND_HAND.length)
      .toBe(ALTERNATIVE_SHIPPING.length);
    // 一次情報が1件も無くなったら、開示の主語（社名）が消える。
    expect(ALTERNATIVE_SHIPPING_VERIFIED.length).toBeGreaterThan(0);
  });

  test('nameList writes an English list, not a comma dump', () => {
    const pick = (n: number) => ALTERNATIVE_SHIPPING.slice(0, n);
    expect(nameList([])).toBe('');
    expect(nameList(pick(1))).toBe('Buyee');
    expect(nameList(pick(2))).toBe('Buyee and Neokyo');
    expect(nameList(pick(3))).toBe('Buyee, Neokyo and FROM JAPAN');
  });
});
