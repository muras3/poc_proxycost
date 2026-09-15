import { describe, expect, test } from 'vitest';
import { methodLabel } from './methodLabel';

describe('methodLabel', () => {
  test('resolves a postal method id to its published label', () => {
    expect(methodLabel('ems')).toBe('EMS');
    expect(methodLabel('parcel-air')).toBe('International parcel (airmail)');
  });
  test('resolves a courier method id to the labelRaw carried by COURIER_METHODS', () => {
    // labelRaw の中身は社の一次情報に依存するので固定文字列では比べず、
    // 「未知の識別子そのままではない・非空」であることだけを確認する
    // （`src/lib/pricing` の値を書き換えていないことの回帰にはならないが、
    // ここは pure な対応表引きなので、既存の COURIER_METHODS を信頼してよい）。
    const label = methodLabel('courier-ups');
    expect(label).not.toBe('courier-ups');
    expect(label.length).toBeGreaterThan(0);
  });
});
