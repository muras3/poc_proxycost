import { describe, expect, it } from 'vitest';
import { courierScopeText } from './EmsOnlyNote';

describe('courierScopeText — 国名も含めて coverage だけから組み立てる', () => {
  it('価格化済みの社があれば、その国名を名指しする（決め打ちの国名を混ぜない）', () => {
    const t = courierScopeText(
      { pricedServiceNames: ['Neokyo', 'ZenMarket'], unpricedServiceNames: [], noCourierServiceNames: [] },
      'United Kingdom',
    );
    expect(t.scope).toBe(
      'Courier rates are also priced for Neokyo and ZenMarket for United Kingdom'
      + ' — ranked alongside the postal methods above.',
    );
    expect(t.unpriced).toBeNull();
    expect(t.noGrid).toBeNull();
  });

  it(
    '価格化された社が1つも無い国は「価格化していない」と言う——2026-09-12時点で全対応国が'
    + '最低1社は価格化済みなので、この分岐は画面のセレクタからは到達できないが、次に国が増える'
    + 'かデータが取り下げられると現実になる。ここで直接検査して分岐を生かす（PR #87 の欠陥の再発防止）。',
    () => {
      const t = courierScopeText(
        { pricedServiceNames: [], unpricedServiceNames: ['Buyee', 'Neokyo'], noCourierServiceNames: ['Jauce'] },
        'Wakanda',
      );
      expect(t.scope).toBe('Courier rates are not priced for Wakanda.');
      expect(t.unpriced).toBe(
        'Buyee and Neokyo also offer couriers here, but we have not priced them for Wakanda.',
      );
      expect(t.noGrid).toBe('Jauce has no courier rate grid at all.');
    },
  );

  it('一部だけ価格化（DE の実際の形: Buyee だけ未測定、他は価格化済み）', () => {
    const t = courierScopeText(
      {
        pricedServiceNames: ['FROM JAPAN', 'Neokyo', 'ZenMarket'],
        unpricedServiceNames: ['Buyee'],
        noCourierServiceNames: ['Jauce'],
      },
      'Germany',
    );
    expect(t.scope).toContain('for Germany');
    expect(t.scope).toContain('FROM JAPAN, Neokyo and ZenMarket');
    expect(t.unpriced).toBe('Buyee also offer couriers here, but we have not priced them for Germany.');
    expect(t.noGrid).toBe('Jauce has no courier rate grid at all.');
  });

  it('価格化・未価格化のどちらも無ければ、それぞれの句を出さない（null）', () => {
    const t = courierScopeText(
      { pricedServiceNames: ['ZenMarket'], unpricedServiceNames: [], noCourierServiceNames: [] },
      'Singapore',
    );
    expect(t.unpriced).toBeNull();
    expect(t.noGrid).toBeNull();
  });
});
