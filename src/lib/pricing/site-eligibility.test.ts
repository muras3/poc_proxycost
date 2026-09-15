import { describe, expect, test } from 'vitest';
import {
  ELIGIBILITY_ROWS,
  eligibilityFor,
  eligibilityForAllProxies,
  eligibilitySiteFromUrl,
  validateEligibilityRows,
  type EligibilityLevel,
  type EligibilityRow,
  type ProxyId,
} from './site-eligibility';

const PROXY_IDS: ProxyId[] = ['buyee', 'zenmarket', 'neokyo', 'fromjapan', 'jauce'];

const urlFor = (host: string) => `https://${host}/item/123`;

describe('eligibilityFor: table-driven over every published row', () => {
  for (const row of ELIGIBILITY_ROWS) {
    test(`${row.proxy}/${row.site} (${row.status}) resolves to the expected level`, () => {
      // p-bandai is blocked for everyone regardless of what the row says (site-level rule),
      // so it is covered by its own test below rather than here.
      if (row.site === 'p-bandai') return;

      const result = eligibilityFor(urlFor(hostForTest(row.site)), row.proxy);
      const expected = expectedLevel(row);
      expect(result.level, `${row.proxy}/${row.site}`).toBe(expected);
      if (expected !== 'none') {
        expect(result.reason, `${row.proxy}/${row.site}`).toBeTruthy();
        expect(result.sourceUrl, `${row.proxy}/${row.site}`).toBeTruthy();
        expect(result.checkedOn, `${row.proxy}/${row.site}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    });
  }
});

// A minimal, real host for each site id used only to drive the URL → site resolver in tests.
function hostForTest(site: string): string {
  const HOSTS: Record<string, string> = {
    'yahoo-auctions': 'auctions.yahoo.co.jp',
    mercari: 'jp.mercari.com',
    rakuten: 'item.rakuten.co.jp',
    'yahoo-shopping': 'store.shopping.yahoo.co.jp',
    'amazon-jp': 'amazon.co.jp',
    'suruga-ya': 'suruga-ya.jp',
    mandarake: 'mandarake.co.jp',
    zozo: 'zozo.jp',
    toranoana: 'ecs.toranoana.jp',
    'paypay-fleamarket': 'paypayfleamarket.yahoo.co.jp',
    rakuma: 'fril.jp',
    bookoff: 'shopping.bookoff.co.jp',
    animate: 'animate-onlineshop.jp',
    amiami: 'amiami.jp',
    '2ndstreet': '2ndstreet.jp',
    melonbooks: 'melonbooks.co.jp',
    'p-bandai': 'p-bandai.jp',
    yodobashi: 'yodobashi.com',
  };
  const host = HOSTS[site];
  if (!host) throw new Error(`no test host mapped for site '${site}'`);
  return host;
}

function expectedLevel(row: EligibilityRow): EligibilityLevel {
  if (row.status === 'unsupported' || row.status === 'suspended') return 'blocked';
  const policy = row.proxy === 'jauce' ? 'listed_only' : 'any_japanese_url';
  if (policy === 'listed_only' && row.status === 'not_listed') return 'caution';
  return 'none';
}

describe('p-bandai: blocked for every proxy, including those whose own row says listed', () => {
  for (const proxy of PROXY_IDS) {
    test(`${proxy} → blocked`, () => {
      const result = eligibilityFor(urlFor('p-bandai.jp'), proxy);
      expect(result.level).toBe('blocked');
      expect(result.reason).toMatch(/Premium Bandai/i);
    });
  }
});

describe('spec examples called out explicitly', () => {
  test('jauce + mercari → caution (listed_only, not_listed)', () => {
    expect(eligibilityFor(urlFor('jp.mercari.com'), 'jauce').level).toBe('caution');
  });

  test('jauce + amazon.co.jp → blocked (suspended)', () => {
    expect(eligibilityFor(urlFor('amazon.co.jp'), 'jauce').level).toBe('blocked');
  });

  test('jauce + zozo.jp → none (listed)', () => {
    expect(eligibilityFor(urlFor('zozo.jp'), 'jauce').level).toBe('none');
  });

  test('buyee + amiami.jp → none (not_listed, any_japanese_url policy)', () => {
    expect(eligibilityFor(urlFor('amiami.jp'), 'buyee').level).toBe('none');
  });
});

describe('unknown or unparseable URLs never alert', () => {
  test('unknown host', () => {
    for (const proxy of PROXY_IDS) {
      expect(eligibilityFor('https://example.com/product/1', proxy)).toEqual({ level: 'none' });
    }
  });

  test('unparseable URL', () => {
    for (const proxy of PROXY_IDS) {
      expect(eligibilityFor('not a url', proxy)).toEqual({ level: 'none' });
    }
  });
});

describe('eligibilityForAllProxies', () => {
  test('returns all 5 proxies for one URL', () => {
    const all = eligibilityForAllProxies(urlFor('jp.mercari.com'));
    expect(Object.keys(all).sort()).toEqual([...PROXY_IDS].sort());
    expect(all.buyee.level).toBe('none');
    expect(all.jauce.level).toBe('caution');
  });
});

describe('host matching mirrors the search resolver\'s safety rules', () => {
  test('subdomains resolve to their site', () => {
    expect(eligibilitySiteFromUrl(urlFor('item.rakuten.co.jp'))).toBe('rakuten');
    expect(eligibilitySiteFromUrl(urlFor('store.shopping.yahoo.co.jp'))).toBe('yahoo-shopping');
    expect(eligibilitySiteFromUrl(urlFor('www.amiami.jp'))).toBe('amiami');
  });

  test('amazon.jp and bookoffonline.co.jp are recognized alternate hosts', () => {
    expect(eligibilitySiteFromUrl(urlFor('amazon.jp'))).toBe('amazon-jp');
    expect(eligibilitySiteFromUrl(urlFor('bookoffonline.co.jp'))).toBe('bookoff');
  });

  test('a lookalike host must NOT match', () => {
    expect(eligibilitySiteFromUrl(urlFor('amazon.co.jp.evil.com'))).toBeNull();
  });

  test('unknown host resolves to null', () => {
    expect(eligibilitySiteFromUrl('https://example.com/x')).toBeNull();
  });
});

describe('schema check actually reads the data', () => {
  test('the real data passes', () => {
    expect(validateEligibilityRows(ELIGIBILITY_ROWS)).toEqual([]);
  });

  test('every listed/unsupported/suspended row has a source, a quote, and checkedOn', () => {
    for (const r of ELIGIBILITY_ROWS) {
      if (r.status === 'not_listed') continue;
      expect(r.sourceUrl, `${r.proxy}/${r.site}`).toBeTruthy();
      expect(r.quote, `${r.proxy}/${r.site}`).toBeTruthy();
      expect(r.checkedOn, `${r.proxy}/${r.site}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  test('a mutated row (quote removed) is caught, proving the check reads real data', () => {
    const good = ELIGIBILITY_ROWS.find(
      (r) => r.status === 'listed' && r.quote,
    );
    expect(good).toBeDefined();
    const mutated: EligibilityRow[] = ELIGIBILITY_ROWS.map((r) => (
      r === good ? { ...r, quote: undefined } : r
    ));
    const errors = validateEligibilityRows(mutated);
    expect(errors.some((e) => e.includes(`${good!.proxy}/${good!.site}`) && e.includes('quote')))
      .toBe(true);
  });

  test('a mutated row (sourceUrl removed) is caught too', () => {
    const good = ELIGIBILITY_ROWS.find(
      (r) => r.status === 'unsupported' && r.sourceUrl,
    );
    expect(good).toBeDefined();
    const mutated: EligibilityRow[] = ELIGIBILITY_ROWS.map((r) => (
      r === good ? { ...r, sourceUrl: undefined } : r
    ));
    const errors = validateEligibilityRows(mutated);
    expect(
      errors.some((e) => e.includes(`${good!.proxy}/${good!.site}`) && e.includes('sourceUrl')),
    ).toBe(true);
  });

  test('a bad checkedOn format is caught', () => {
    const first = ELIGIBILITY_ROWS[0]!;
    const rest = ELIGIBILITY_ROWS.slice(1);
    const mutated: EligibilityRow[] = [{ ...first, checkedOn: '15-09-2026' }, ...rest];
    const errors = validateEligibilityRows(mutated);
    expect(errors.some((e) => e.includes('checkedOn'))).toBe(true);
  });
});
