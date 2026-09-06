import { describe, expect, test } from 'vitest';
import { groupByShop, oneOrderPerItem, shopIdFor } from './shops';
import type { SiteId } from './types';

const at = (site: SiteId, url: string | null) => ({ site, url });

describe('reading the shop out of a listing URL', () => {
  test('Rakuten puts the shop in the first path segment', () => {
    // https://item.rakuten.co.jp/{shop}/{itemcode}/
    expect(shopIdFor(at('rakuten', 'https://item.rakuten.co.jp/book/12345/')))
      .toBe('rakuten:book');
    expect(shopIdFor(at('rakuten', 'https://item.rakuten.co.jp/BOOK/12345/')))
      .toBe('rakuten:book');
    expect(shopIdFor(at('rakuten', 'https://www.rakuten.co.jp/kaguya/98765/')))
      .toBe('rakuten:kaguya');
  });

  test('two listings from the same Rakuten shop share one id, two shops do not', () => {
    const a = shopIdFor(at('rakuten', 'https://item.rakuten.co.jp/book/1/'));
    const b = shopIdFor(at('rakuten', 'https://item.rakuten.co.jp/book/2/'));
    const c = shopIdFor(at('rakuten', 'https://item.rakuten.co.jp/other/2/'));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  test('Yahoo! Shopping has two URL shapes and both name the store', () => {
    expect(shopIdFor(at('yahoo-shopping', 'https://store.shopping.yahoo.co.jp/tanaka/abc-1.html')))
      .toBe('yahoo-shopping:tanaka');
    expect(shopIdFor(at('yahoo-shopping', 'https://shopping.yahoo.co.jp/store/tanaka/item/abc-1/')))
      .toBe('yahoo-shopping:tanaka');
  });

  test('a whole-domain shop needs no URL at all', () => {
    for (const site of ['suruga-ya', 'mandarake', 'zozo', 'hmv', 'toranoana'] as SiteId[]) {
      expect(shopIdFor(at(site, null)), site).toBe(`${site}:${site}`);
    }
  });

  test('auctions, flea markets, Amazon and unknown shops give null — we do not guess', () => {
    // ヤフオク・メルカリは出品者ごと（Buyee も落札・購入1件ごとに課金すると書いている）。
    // Amazon は1ドメインに多数の出品者がいるので「同一店舗」と読める根拠が無い。
    expect(shopIdFor(at('yahoo-auctions', 'https://page.auctions.yahoo.co.jp/jp/auction/x1'))).toBeNull();
    expect(shopIdFor(at('mercari', 'https://jp.mercari.com/item/m12345678901'))).toBeNull();
    expect(shopIdFor(at('amazon-jp', 'https://www.amazon.co.jp/dp/B000000000'))).toBeNull();
    expect(shopIdFor(at('other', 'https://example.com/x'))).toBeNull();
  });

  test('a Rakuten listing with no URL, a broken URL or a search path is not a shop', () => {
    expect(shopIdFor(at('rakuten', null))).toBeNull();
    expect(shopIdFor(at('rakuten', 'not a url'))).toBeNull();
    expect(shopIdFor(at('rakuten', 'https://search.rakuten.co.jp/search/mall/figure/'))).toBeNull();
    // ホスト名の詐称を店舗として読まない。
    expect(shopIdFor(at('rakuten', 'https://item.rakuten.co.jp.evil.example/book/1/'))).toBeNull();
  });
});

describe('grouping a basket into orders', () => {
  const rakuten = (shop: string) => at('rakuten', `https://item.rakuten.co.jp/${shop}/1/`);

  test('two listings from one shop are one order, and we count what we merged', () => {
    const g = groupByShop([rakuten('book'), rakuten('book')]);
    expect(g.groups).toEqual([[0, 1]]);
    expect(g.merged).toBe(1);
    expect(g.unknownShopItems).toBe(0);
  });

  test('different shops stay different orders', () => {
    const g = groupByShop([rakuten('book'), rakuten('other')]);
    expect(g.groups).toEqual([[0], [1]]);
    expect(g.merged).toBe(0);
  });

  test('listings whose shop we cannot read stay one order each, and are counted as such', () => {
    const g = groupByShop([
      at('rakuten', null),
      rakuten('book'),
      rakuten('book'),
    ]);
    expect(g.groups).toEqual([[0], [1, 2]]);
    expect(g.unknownShopItems).toBe(1);
    expect(g.merged).toBe(1);
  });

  test('an auction is one order per listing by the company rule, not a shop we failed to read', () => {
    const g = groupByShop([
      at('yahoo-auctions', 'https://page.auctions.yahoo.co.jp/jp/auction/x1'),
      at('mercari', 'https://jp.mercari.com/item/m12345678901'),
    ]);
    expect(g.groups).toEqual([[0], [1]]);
    expect(g.unknownShopItems).toBe(0);
  });

  test('the ungrouped list is one order per item', () => {
    expect(oneOrderPerItem([1, 2, 3]).groups).toEqual([[0], [1], [2]]);
    expect(oneOrderPerItem([1, 2, 3]).merged).toBe(0);
  });
});
