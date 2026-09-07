import { describe, expect, it } from 'vitest';
import { DEEP_LINKS, listingIdFrom, outboundFor, verifiedDeepLinkCount } from './deeplink';
import type { Item } from './types';

const item = (over: Partial<Item> = {}): Item => ({
  id: 'i0', title: 't', priceYen: 1000, priceTier: 'fixed',
  site: 'yahoo-auctions', url: 'https://page.auctions.yahoo.co.jp/jp/auction/s1243168909',
  weightG: 600, weightTier: 'estimate', qty: 1, ...over,
});

describe('listingIdFrom', () => {
  it.each([
    ['https://page.auctions.yahoo.co.jp/jp/auction/s1243168909', 's1243168909'],
    ['https://auctions.yahoo.co.jp/jp/auction/b1243418061', 'b1243418061'],
    ['https://auctions.yahoo.co.jp/jp/auction/1243512667', '1243512667'],
    ['https://auctions.yahoo.co.jp/item?aID=s1243168909', 's1243168909'],
  ])('ヤフオク %s → %s', (url, id) =>
    expect(listingIdFrom(url, 'yahoo-auctions')).toBe(id));

  it('メルカリの item id を取る', () =>
    expect(listingIdFrom('https://jp.mercari.com/item/m12345678901', 'mercari'))
      .toBe('m12345678901'));

  it.each([
    ['https://auctions.yahoo.co.jp/search/search?p=x'],
    ['https://auctions.yahoo.co.jp/jp/auction/'],
    ['not a url'],
    [''],
  ])('形が違えば null を返し、組み立てない: %s', (url) =>
    expect(listingIdFrom(url, 'yahoo-auctions')).toBeNull());

  it('URL が無ければ null', () => {
    expect(listingIdFrom(null, 'yahoo-auctions')).toBeNull();
    expect(listingIdFrom(undefined, 'yahoo-auctions')).toBeNull();
  });

  it('対応していないサイトでは null（当て推量で作らない）', () =>
    expect(listingIdFrom('https://item.rakuten.co.jp/shop/x/', 'rakuten')).toBeNull());
});

describe('outboundFor', () => {
  it('検証済みの組み合わせは出品を直接開く', () => {
    const fj = outboundFor('fromjapan', 'https://www.fromjapan.co.jp/', item());
    expect(fj.direct).toBe(true);
    expect(fj.url).toBe('https://www.fromjapan.co.jp/japan/en/auction/yahoo/input/s1243168909');

    const buyee = outboundFor('buyee', 'https://buyee.jp/', item());
    expect(buyee.direct).toBe(true);
    expect(buyee.url).toBe('https://buyee.jp/item/yahoo/auction/s1243168909');

    // 2026-09-06 に 2条件を満たした（実在ID2件で 200・題名が別、架空IDで 404）。
    const jauce = outboundFor('jauce', 'https://www.jauce.com/', item());
    expect(jauce.direct).toBe(true);
    expect(jauce.url).toBe('https://www.jauce.com/auction/s1243168909');
  });

  it('**未検証の組み合わせはトップに落とす。** 404 に飛ばす方がトップより悪い', () => {
    for (const id of ['zenmarket', 'neokyo']) {
      const r = outboundFor(id, `https://${id}.example/`, item());
      expect(r.direct, `${id} は未検証なので直接開いてはいけない`).toBe(false);
      expect(r.url).toBe(`https://${id}.example/`);
    }
  });

  it('**verified が false の社は、形を持っていても使わない。**', () => {
    // ZenMarket は pattern を持っている。それでも直接開かないことが要点。
    expect(DEEP_LINKS.zenmarket?.['yahoo-auctions']?.pattern).toContain('zenmarket.jp');
    expect(DEEP_LINKS.zenmarket?.['yahoo-auctions']?.verified).toBe(false);
    expect(outboundFor('zenmarket', 'https://zenmarket.jp/', item()).direct).toBe(false);
  });

  it('URL を持たない項目（検索や手入力）はトップに落とす', () => {
    const r = outboundFor('fromjapan', 'https://www.fromjapan.co.jp/', item({ url: null }));
    expect(r.direct).toBe(false);
  });

  it('検証済みでもサイトが違えばトップに落とす', () => {
    const r = outboundFor('fromjapan', 'https://www.fromjapan.co.jp/',
      item({ site: 'mercari', url: 'https://jp.mercari.com/item/m12345678901' }));
    expect(r.direct).toBe(false);
  });

  it('項目が無ければトップ', () =>
    expect(outboundFor('fromjapan', 'https://x/', null).direct).toBe(false));
});

describe('DEEP_LINKS の整合', () => {
  it('verified な項目には確認日と根拠が要る', () => {
    for (const [svc, bySite] of Object.entries(DEEP_LINKS)) {
      for (const [site, d] of Object.entries(bySite)) {
        if (!d?.verified) continue;
        expect(d.checkedOn, `${svc}/${site}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(d.note.length, `${svc}/${site} に根拠が無い`).toBeGreaterThan(10);
      }
    }
  });

  it('検証できた組み合わせの数が、表の verified と一致する', () => {
    const counted = Object.values(DEEP_LINKS)
      .flatMap((bySite) => Object.values(bySite))
      .filter((d) => d?.verified).length;
    expect(verifiedDeepLinkCount()).toBe(counted);
    // fromjapan / buyee / jauce の3件。**減ったら直接開ける社が黙って減っている。**
    expect(verifiedDeepLinkCount()).toBe(3);
  });

  it('pattern には必ず {id} が入っている', () => {
    for (const bySite of Object.values(DEEP_LINKS)) {
      for (const d of Object.values(bySite)) {
        if (d) expect(d.pattern).toContain('{id}');
      }
    }
  });
});
