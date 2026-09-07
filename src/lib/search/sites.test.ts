import { describe, expect, it } from 'vitest';
import { isListingUrl, siteFilter, siteFromUrl } from './sites';

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

describe('isListingUrl', () => {
  // 「1点の出品」だけを候補にする。実測 790 件のうち 316 件は一覧・カテゴリ・記事で、
  // 籠に入れても値段が付かない（docs/audit/search-reality.md）。
  it.each([
    ['https://auctions.yahoo.co.jp/jp/auction/1242770204'],
    ['https://jp.mercari.com/item/m84660218944'],
    ['https://jp.mercari.com/en/item/m55279778135'],
    ['https://jp.mercari.com/shops/product/abc123'],
    ['https://item.rakuten.co.jp/zootrope/8570/'],
    ['https://store.shopping.yahoo.co.jp/digitamin/yf158679.html'],
    ['https://www.amazon.co.jp/-/en/Nendoroid-G12951/dp/B0B3N1KXLK'],
    ['https://www.amazon.co.jp/gp/product/B0B3N1KXLK'],
    ['https://www.suruga-ya.jp/product/detail/123456789'],
    ['https://order.mandarake.co.jp/order/detailPage/item?itemCode=1265543993'],
    ['https://zozo.jp/shop/commedesgarconshomme/goods/12345678/'],
    ['https://www.hmv.co.jp/artist_x_000/item_y-z_1234/'],
    ['https://ecs.toranoana.jp/joshi/ec/item/040031234567/'],
  ])('出品ページは残す: %s', (url) => expect(isListingUrl(url)).toBe(true));

  it.each([
    // ヤフオクは実測で 129 件すべてがこの形だった。closedsearch は終了済み＝買えない。
    ['https://auctions.yahoo.co.jp/search/search/%E3%81%AD%E3%82%93'],
    ['https://auctions.yahoo.co.jp/closedsearch/closedsearch/nendoroid'],
    ['https://auctions.yahoo.co.jp/category/list/26318/'],
    ['https://jp.mercari.com/search?keyword=nendoroid'],
    ['https://jp.mercari.com/s/695642'],
    ['https://search.rakuten.co.jp/search/mall/nendoroid/'],
    ['https://shopping.yahoo.co.jp/search/mg/0/'],
    ['https://www.amazon.co.jp/s?k=nendoroid'],
    ['https://www.suruga-ya.jp/search?category=&search_word=x'],
    ['https://order.mandarake.co.jp/order/listPage/list?categoryCode=020101'],
    ['https://zozo.jp/men-shop/commedesgarconshomme/tops/'],
    // HMV は記事が 25 件中 18 件を占めていた。記事は出品ではない。
    ['https://www.hmv.co.jp/news/article/2601234567/'],
    ['https://ecs.toranoana.jp/joshi/ec/'],
  ])('一覧・記事は落とす: %s', (url) => expect(isListingUrl(url)).toBe(false));

  it('形を確かめていないサイト（other）は落とさない', () => {
    expect(isListingUrl('https://example.com/anything')).toBe(true);
  });

  it('URL でないものは false（例外を投げない）', () => {
    expect(isListingUrl('ねんどろいど')).toBe(false);
  });
});
