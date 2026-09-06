import { describe, expect, it } from 'vitest';
import { isPublicHttpUrl, parseProductHtml, robotsBlocks } from './product';

const JSONLD = `<html><head>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product","name":"Nendoroid Miku",
 "image":["https://cdn.example.jp/a.jpg"],
 "offers":{"@type":"Offer","price":"4200","priceCurrency":"JPY"}}
</script></head><body></body></html>`;

const OG = `<html><head>
<meta property="og:title" content="1/7 scale figure">
<meta property="og:image" content="https://cdn.example.jp/b.jpg">
<meta property="product:price:amount" content="12800">
<meta property="product:price:currency" content="JPY">
</head><body></body></html>`;

describe('parseProductHtml', () => {
  it('JSON-LD の Product から名前・価格・画像を取る', () => {
    const r = parseProductHtml(JSONLD, 'https://jp.mercari.com/item/m1');
    expect(r.ok).toBe(true);
    expect(r.title).toBe('Nendoroid Miku');
    expect(r.priceYen).toBe(4200);
    expect(r.imageUrl).toBe('https://cdn.example.jp/a.jpg');
    expect(r.site).toBe('mercari');
  });

  it('JSON-LD が無ければ OpenGraph に落ちる', () => {
    const r = parseProductHtml(OG, 'https://item.rakuten.co.jp/shop/x/');
    expect(r.title).toBe('1/7 scale figure');
    expect(r.priceYen).toBe(12800);
    expect(r.site).toBe('rakuten');
  });

  it('円以外の通貨は換算せずに捨てる。勝手なレートで埋めない', () => {
    const usd = JSONLD.replace('"JPY"', '"USD"');
    expect(parseProductHtml(usd, 'https://jp.mercari.com/item/m1').priceYen).toBeNull();
  });

  it('価格が読めなければ null で、0 にはしない', () => {
    const noPrice = `<html><head><title>Some listing</title></head><body></body></html>`;
    const r = parseProductHtml(noPrice, 'https://suruga-ya.jp/product/x');
    expect(r.ok).toBe(true);
    expect(r.priceYen).toBeNull();
    expect(r.priceYen).not.toBe(0);
    expect(r.reason).toMatch(/type it in/i);
  });

  it('タイトルすら取れなければ ok:false', () => {
    expect(parseProductHtml('<html><body>x</body></html>', 'https://zozo.jp/x').ok).toBe(false);
  });

  it('ヤフオクの送料込みは読めたときだけ返し、読めなければ undefined', () => {
    const free = `<html><head><title>t</title></head><body>送料無料</body></html>`;
    const buyer = `<html><head><title>t</title></head><body>落札者負担</body></html>`;
    const silent = `<html><head><title>t</title></head><body></body></html>`;
    const u = 'https://auctions.yahoo.co.jp/jp/auction/x';
    expect(parseProductHtml(free, u).freeShipping).toBe(true);
    expect(parseProductHtml(buyer, u).freeShipping).toBe(false);
    expect(parseProductHtml(silent, u).freeShipping).toBeUndefined();
  });
});

describe('robotsBlocks', () => {
  it('User-agent: * の Disallow を見る', () => {
    expect(robotsBlocks('User-agent: *\nDisallow: /item/', '/item/1')).toBe(true);
    expect(robotsBlocks('User-agent: *\nDisallow: /admin', '/item/1')).toBe(false);
    expect(robotsBlocks('User-agent: *\nAllow: /', '/item/1')).toBe(false);
  });

  it('AI 学習系クローラだけを止めている robots は、我々を止めない', () => {
    // 駿河屋がこの形。ClaudeBot / GPTBot は名指しで禁止だが `*` は Allow: /。
    const txt = 'User-agent: ClaudeBot\nDisallow: /\n\nUser-agent: *\nAllow: /';
    expect(robotsBlocks(txt, '/product/x')).toBe(false);
  });

  it('最長一致が勝つ。Disallow: / に Allow の例外があれば取りに行ける', () => {
    const txt = 'User-agent: *\nDisallow: /\nAllow: /product/';
    expect(robotsBlocks(txt, '/product/x')).toBe(false);
    expect(robotsBlocks(txt, '/cart')).toBe(true);
  });

  it('同じ長さなら Allow が勝つ', () => {
    expect(robotsBlocks('User-agent: *\nDisallow: /item\nAllow: /item', '/item/1')).toBe(false);
  });

  it('User-agent が並んで1つの群を作る形でも * の規則を取り落とさない', () => {
    const txt = 'User-agent: Foo\nUser-agent: *\nDisallow: /item/';
    expect(robotsBlocks(txt, '/item/1')).toBe(true);
  });

  it('パスの * と 末尾 $ を読む', () => {
    expect(robotsBlocks('User-agent: *\nDisallow: /*/private', '/shop/private')).toBe(true);
    expect(robotsBlocks('User-agent: *\nDisallow: /item$', '/item')).toBe(true);
    expect(robotsBlocks('User-agent: *\nDisallow: /item$', '/item/1')).toBe(false);
  });

  it('値の無い Disallow は何も禁止しない。コメントは無視する', () => {
    expect(robotsBlocks('User-agent: *\nDisallow:', '/item/1')).toBe(false);
    expect(robotsBlocks('# note\nUser-agent: *\nDisallow: /item/ # why', '/item/1')).toBe(true);
  });

  it('他のクローラ向けの Disallow は我々に効かない', () => {
    const txt = 'User-agent: GPTBot\nDisallow: /item/\n\nUser-agent: *\nDisallow: /admin';
    expect(robotsBlocks(txt, '/item/1')).toBe(false);
  });
});

describe('isPublicHttpUrl', () => {
  it.each([
    'http://localhost/x', 'http://127.0.0.1/x', 'http://10.0.0.1/x',
    'http://192.168.1.1/x', 'http://172.16.0.1/x', 'http://169.254.169.254/latest',
    'file:///etc/passwd', 'ftp://example.com/x', 'not a url',
  ])('弾く: %s', (u) => expect(isPublicHttpUrl(u)).toBe(false));

  it.each([
    // IPv4 射影 IPv6。ドット形の正規表現だけでは素通りする。
    'http://[::ffff:127.0.0.1]/x',
    'http://[::ffff:7f00:1]/x',
    'http://[::ffff:169.254.169.254]/x',
    'http://[::]/x',
    'http://0.0.0.0/x',
    // CGNAT。クラウドのメタデータ代理に使われる。
    'http://100.64.0.1/x',
    'http://100.127.255.254/x',
    // 80 / 443 以外は内部サービスへの踏み台になる。
    'http://example.com:22/x',
    'http://example.com:8080/x',
  ])('弾く（射影IPv6・CGNAT・非標準ポート）: %s', (u) => expect(isPublicHttpUrl(u)).toBe(false));

  it.each([
    'https://auctions.yahoo.co.jp/jp/auction/x',
    'http://item.rakuten.co.jp/shop/x/',
    'https://example.com:443/x',
  ])('通す: %s', (u) => expect(isPublicHttpUrl(u)).toBe(true));
});
