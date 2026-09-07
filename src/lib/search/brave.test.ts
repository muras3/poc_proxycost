import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { braveSearch, isSearchConfigured } from './brave';

/** Brave の返却をそのまま模す。**実物の形（web.results[]）から離れないため。** */
function reply(results: unknown[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ web: { results } }),
  } as unknown as Response;
}

describe('braveSearch', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env['BRAVE_API_KEY'];
  });

  it('キーが無ければ configured: false。例外にしない（画面は URL 貼付へ落ちる）', async () => {
    const r = await braveSearch('nendoroid');
    expect(isSearchConfigured()).toBe(false);
    expect(r.configured).toBe(false);
    expect(r.results).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('一覧ページ・終了済み・記事は候補から外す', async () => {
    process.env['BRAVE_API_KEY'] = 'k';
    // 実測で返ってきた形をそのまま並べる（docs/audit/search-reality.md）。
    fetchMock.mockResolvedValue(reply([
      { title: '【2026年最新】Yahoo!オークション -ポケモンカード リザードンの中古品',
        url: 'https://auctions.yahoo.co.jp/closedsearch/closedsearch/x' },
      { title: 'ねんどろいど | メルカリ', url: 'https://jp.mercari.com/search?keyword=x' },
      { title: 'HMV&BOOKS online ニュース', url: 'https://www.hmv.co.jp/news/article/2601010001/' },
      { title: '本物の出品', url: 'https://jp.mercari.com/item/m84660218944' },
    ]));
    const r = await braveSearch('ポケモンカード リザードン');
    expect(r.results.map((c) => c.url)).toEqual(['https://jp.mercari.com/item/m84660218944']);
  });

  it('対象外のサイトは出さない', async () => {
    process.env['BRAVE_API_KEY'] = 'k';
    fetchMock.mockResolvedValue(reply([
      { title: 'よそ', url: 'https://example.com/item/1' },
      { title: '楽天の出品', url: 'https://item.rakuten.co.jp/zootrope/8570/' },
    ]));
    const r = await braveSearch('nendoroid');
    expect(r.results.map((c) => c.site)).toEqual(['rakuten']);
  });

  it('価格は円と分かる表記だけ受ける。**通貨の分からない数字は null。**', async () => {
    process.env['BRAVE_API_KEY'] = 'k';
    fetchMock.mockResolvedValue(reply([
      { title: 'a', url: 'https://jp.mercari.com/item/m1', product: { price: '¥12,800' } },
      { title: 'b', url: 'https://jp.mercari.com/item/m2', product: { price: '$85.00' } },
      { title: 'c', url: 'https://jp.mercari.com/item/m3', product: { price: '3200' } },
      { title: 'd', url: 'https://jp.mercari.com/item/m4' },
    ]));
    const r = await braveSearch('price-shapes');
    expect(r.results.map((c) => c.priceYen)).toEqual([12800, null, null, null]);
  });

  it('HTTP エラーは理由を返して空にする（0 件と嘘をつかない）', async () => {
    process.env['BRAVE_API_KEY'] = 'k';
    fetchMock.mockResolvedValue({ ok: false, status: 429 } as Response);
    // **クエリはテストごとに変える。**キャッシュは 1 クエリ 24h で効くので、
    // 使い回すと上流を叩く前にキャッシュが返ってきて、この分岐を試せない。
    const r = await braveSearch('http-error');
    expect(r.results).toEqual([]);
    expect(r.reason).toContain('429');
  });

  it('キャッシュに当たれば上流を叩かない（1 クエリ = 1 課金なので）', async () => {
    process.env['BRAVE_API_KEY'] = 'k';
    fetchMock.mockResolvedValue(reply([
      { title: '出品', url: 'https://jp.mercari.com/item/m9' },
    ]));
    const first = await braveSearch('cache-hit');
    expect(first.results).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 2 回目は上流に行かない。**キャッシュがある間は上流のエラーより
    // キャッシュが勝つ。**課金を増やさないための設計で、事故ではない。
    fetchMock.mockResolvedValue({ ok: false, status: 500 } as Response);
    const second = await braveSearch('cache-hit');
    expect(second.results).toEqual(first.results);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
