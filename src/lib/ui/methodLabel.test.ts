import { describe, expect, test } from 'vitest';
import { methodLabel } from './methodLabel';

describe('methodLabel', () => {
  test('resolves a postal method id to its published label', () => {
    expect(methodLabel('ems')).toBe('EMS');
    expect(methodLabel('parcel-air')).toBe('International parcel (airmail)');
  });
  test('resolves a courier method id to the cleaned-up carrier + service name', () => {
    // **2026-09-16**: 各社の原文（`labelRaw`）ではなく、`methodDisplay.ts` で整形した
    // 表示名を返すようになった。原文は `methodRawNote()` が出す（そちらの検査は
    // `methodDisplay.test.ts`——原文と一字一句一致することを見ている）。
    expect(methodLabel('courier-fedex-lowcost')).toBe('FedEx Lowcost');
    expect(methodLabel('courier-dhl-express-worldwide')).toBe('DHL Express Worldwide');
    // 社が種別を書いていない便は、勝手に Standard と名乗らない。
    expect(methodLabel('courier-ups')).toBe('UPS (tier not published)');
  });
});
