import { describe, expect, it } from 'vitest';
import { siteFilter, siteFromUrl } from './sites';

describe('siteFromUrl', () => {
  it.each([
    ['https://auctions.yahoo.co.jp/jp/auction/x1', 'yahoo-auctions'],
    ['https://jp.mercari.com/item/m1', 'mercari'],
    ['https://item.rakuten.co.jp/shop/code/', 'rakuten'],
    ['https://store.shopping.yahoo.co.jp/shop/item.html', 'yahoo-shopping'],
    ['https://www.amazon.co.jp/dp/B000', 'amazon-jp'],
    ['https://www.suruga-ya.jp/product/detail/1', 'suruga-ya'],
    ['https://order.mandarake.co.jp/order/detailPage/item', 'mandarake'],
    ['https://zozo.jp/shop/x/goods/1/', 'zozo'],
    ['https://www.hmv.co.jp/artist_x/item_y/', 'hmv'],
    ['https://ecs.toranoana.jp/tora/ec/item/1/', 'toranoana'],
    ['https://example.com/x', 'other'],
  ])('%s → %s', (url, id) => expect(siteFromUrl(url).id).toBe(id));

  it('shopping.yahoo.co.jp を auctions.yahoo.co.jp に取られない', () => {
    expect(siteFromUrl('https://store.shopping.yahoo.co.jp/a/b').id).toBe('yahoo-shopping');
    expect(siteFromUrl('https://auctions.yahoo.co.jp/a/b').id).toBe('yahoo-auctions');
  });

  it('Jauce のベータ無料は楽天と Yahoo!ショッピングだけ', () => {
    expect(siteFromUrl('https://item.rakuten.co.jp/a/b/').jauceFree).toBe(true);
    expect(siteFromUrl('https://store.shopping.yahoo.co.jp/a/b').jauceFree).toBe(true);
    expect(siteFromUrl('https://auctions.yahoo.co.jp/a/b').jauceFree).toBe(false);
    expect(siteFromUrl('https://jp.mercari.com/item/m1').jauceFree).toBe(false);
  });

  it('URL でないものは other に落ちて例外を投げない', () => {
    expect(siteFromUrl('銀魂').id).toBe('other');
  });

  it('本物のドメインを名前に含めただけの詐称ホストは other', () => {
    expect(siteFromUrl('https://auctions.yahoo.co.jp.example.com/x').id).toBe('other');
    expect(siteFromUrl('https://not-zozo.jp/x').id).toBe('other');
    expect(siteFromUrl('https://evil.com/?u=jp.mercari.com').id).toBe('other');
  });
});

describe('siteFilter', () => {
  it('1クエリに収める（ページングは追加課金なので site: を並べる）', () => {
    const f = siteFilter();
    expect(f).toContain('site:auctions.yahoo.co.jp');
    expect(f).toContain('site:item.rakuten.co.jp');
    expect(f.split(' OR ').length).toBe(10);
  });
});
