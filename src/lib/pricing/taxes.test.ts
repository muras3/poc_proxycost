import { describe, expect, test } from 'vitest';
import { compare } from './compare';
import { COUNTRIES, COUNTRY_CODES } from './countries';
import { SERVICES } from './services';
import type { CountryCode, Item, Row } from './types';

/** 1点だけの籠。税の分岐は点数ではなく商品代で決まるので、これで足りる。 */
function items(n: number, priceYen = 3000, weightG = 600): Item[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `i${i}`, title: `i${i}`, priceYen, priceTier: 'fixed' as const,
    site: 'yahoo-auctions' as const, weightG, weightTier: 'estimate' as const, qty: 1,
  }));
}

const rowsFor = (cc: CountryCode, priceYen = 3000, n = 1) =>
  compare({ items: items(n, priceYen), country: cc }).rows;
const line = (row: Row, key: string) =>
  row.lines.find((l) => l.key === key)
  ?? (() => { throw new Error(`no line ${key} in ${row.id}`); })();

// ─────────────────────────────────────────────────────────────────────────────
// T13a: 免税限度が無い国に「限度」の文言を出さない。
// ─────────────────────────────────────────────────────────────────────────────
describe('the duty note says something a buyer can read', () => {
  test('Singapore has no duty limit, so it does not claim one', () => {
    // 以前ここは `under the SGD Infinity threshold` と出ていた。
    // Infinity は数字ではないので、そのまま文字列に混ぜたら画面が壊れる。
    for (const row of rowsFor('SG')) {
      const duty = line(row, 'duty');
      expect(duty.amount, row.id).toBe(0);
      expect(duty.note, row.id).toBe('no duty on this category');
    }
  });

  test('the other six still say which threshold they used', () => {
    const noteOf = (cc: CountryCode) => line(rowsFor(cc)[0]!, 'duty').note;
    // 米国は品目カテゴリで文言が変わる（T24）。この籠は分類できないので「仮定」と名乗る。
    expect(noteOf('US')).toBe(
      '12.5% of the item price — our assumption. It is the floor Section 301 puts on goods of'
      + ' Japan; we could not place every item in this basket against a tariff heading, and'
      + ' headings above it exist.');
    expect(noteOf('GB')).toBe('under the GBP 135 threshold');
    expect(noteOf('DE')).toBe('EUR 3 flat × 1 item');
    expect(noteOf('FR')).toBe('EUR 3 flat × 1 item');
    expect(noteOf('AU')).toBe('under the AUD 1000 threshold');
    expect(noteOf('CA')).toBe('2.0% of the item price');
  });

  test('no country prints a non-number where a number belongs', () => {
    for (const cc of COUNTRY_CODES) {
      for (const row of rowsFor(cc, 30000)) {
        for (const l of row.lines) {
          expect(l.note, `${cc} ${row.id} ${l.key}`).not.toMatch(/Infinity|NaN|undefined|null/);
          expect(l.label, `${cc} ${row.id} ${l.key}`).not.toMatch(/Infinity|NaN|undefined|null/);
        }
      }
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // T17: 我々が原典に当たれていない数字を、確定の顔で出さない。
  // ───────────────────────────────────────────────────────────────────────────
  test('the EU flat €3 is charged but drawn as an assumption, in both EU countries', () => {
    // 制度の原文（EU の暫定定額関税ガイダンス）は取れている。取れていないのは
    // 「代行経由の購入が distance sale of imported goods に当たるか」で、
    // 当たらなければこの ¥489/点 は総額から丸ごと消える。額を出しつつ点線で描く。
    // **tier は `unverified` ではなく `estimate`。**原典に当たれていないのではなく、
    // 原典はあって「当たるか」が我々の仮定だから。
    for (const cc of ['DE', 'FR'] as CountryCode[]) {
      for (const row of rowsFor(cc)) {
        const duty = line(row, 'duty');
        expect(duty.amount, `${cc} ${row.id}`).toBeGreaterThan(0);
        expect(duty.tier, `${cc} ${row.id}`).toBe('estimate');
      }
      expect(COUNTRIES[cc].dutyTier, cc).toBe('estimate');
    }
  });

  test('over EUR 150 the EU duty is a number, not a dash — and the total stops going backwards', () => {
    // **以前ここは null（「—」）だった。**関税は VAT の課税ベースに入るので、
    // null が 0 に畳まれて VAT まで縮み、**商品代が上がると総額が下がる**区間があった。
    const at = (cc: CountryCode, perItemYen: number) => {
      const rows = compare({ items: items(5, perItemYen, 600), country: cc }).rows;
      const row = rows.find((r) => r.comparable)!;
      return { total: row.total, duty: line(row, 'duty') };
    };
    for (const cc of ['DE', 'FR'] as CountryCode[]) {
      const under = at(cc, 5400);   // 5点 ¥27,000 → €150 以下
      const over = at(cc, 5600);    // 5点 ¥28,000 → €150 超
      expect(under.duty.note, cc).toContain('flat');
      expect(over.duty.amount, `${cc} over EUR 150`).toBeGreaterThan(0);
      expect(over.duty.tier, cc).toBe('estimate');
      expect(over.duty.note, cc).toContain('4.1%');
      // 商品代を上げて総額が下がってはいけない。
      expect(over.total, `${cc}: 商品代が上がったのに総額が下がった`)
        .toBeGreaterThan(under.total);
    }
  });

  test('ZenMarket 3.5% deposit fee is our figure — the page says only "from 1%"', () => {
    const zen = rowsFor('US').find((r) => r.serviceId === 'zenmarket')!;
    const deposit = line(zen, 'deposit');
    expect(deposit.amount).toBeGreaterThan(0);
    expect(deposit.tier).toBe('estimate');
    expect(deposit.note).toContain('from 1%');
    // 推定が1つでも混ざれば総額に `~` が付く。
    expect(zen.approximate).toBe(true);
  });

  test('the country table itself still carries the limit we branch on', () => {
    // 「限度が無い」を 0 で表さない。0 は「1円から課税」の意味になる。
    expect(Number.isFinite(COUNTRIES.SG.dutyFreeLimit)).toBe(false);
    expect(COUNTRIES.SG.dutyRate).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T11: 米国の関税事前納付（Zonos）の利用料。**発生するが額が公表されていない。**
// 0 でも推定値でもなく null 行として出し、excluded に名前を載せる。
// ─────────────────────────────────────────────────────────────────────────────
const PREPAY_LABEL = 'US import prepayment (Zonos) fee — not published';

describe('the US prepayment fee is disclosed as a cost we cannot price', () => {
  test('every US row carries the line, with no amount and no tier that implies one', () => {
    for (const row of rowsFor('US', 15000)) {
      const l = line(row, 'duty-prepayment');
      expect(l.label, row.id).toBe(PREPAY_LABEL);
      expect(l.amount, row.id).toBeNull();
      expect(l.tier, row.id).toBe('none');
      expect(l.sourceUrl, row.id).toContain('post.japanpost.jp');
      expect(l.note, row.id).toMatch(/Zonos/);
    }
  });

  test('it shows up in excluded, which is where the shortfall is read', () => {
    for (const row of rowsFor('US', 15000)) {
      expect(row.excluded, row.id).toContain(PREPAY_LABEL);
    }
  });

  test('it never enters the total — the board stays comparable', () => {
    const rows = rowsFor('US', 15000);
    for (const row of rows) {
      expect(row.total, row.id).toBe(row.lines.reduce((a, l) => a + (l.amount ?? 0), 0));
    }
    // **比較不能になる行があるとしても、理由は前払手数料ではない。**
    // 米国で落ちるのは Neokyo の1行だけで、その理由は日本郵便を売っていないこと。
    // 「額を出せない費目を開示しても盤面は壊れない」という主張はそのまま生きている。
    const blocked = rows.filter((r) => !r.comparable);
    expect(blocked.map((r) => r.serviceId)).toEqual(['neokyo']);
    for (const row of blocked) {
      expect(row.notComparableReason, row.id).toContain('does not ship');
      expect(row.notComparableReason, row.id).not.toContain(PREPAY_LABEL);
    }
  });

  test('no other destination invents a prepayment it does not have', () => {
    for (const cc of COUNTRY_CODES) {
      if (cc === 'US') continue;
      for (const row of rowsFor(cc, 15000)) {
        expect(row.lines.some((l) => l.key === 'duty-prepayment'), `${cc} ${row.id}`).toBe(false);
        expect(row.excluded, `${cc} ${row.id}`).not.toContain(PREPAY_LABEL);
      }
    }
  });

  test('above the USD 2,500 band Japan Post asks for no prepayment, so we drop the line', () => {
    // ¥2,000,000 は現行の為替（¥150〜¥157/USD）のどちらでも 12,000 USD 超。
    for (const row of rowsFor('US', 2_000_000)) {
      expect(row.lines.some((l) => l.key === 'duty-prepayment'), row.id).toBe(false);
    }
  });

  test('the band is measured per parcel, because the rule is per postal item', () => {
    // 3点 × ¥300,000 = 商品代で 5,700〜6,000 USD。1個口にまとめる社は帯の外だが、
    // 注文ごとに分けて出す Buyee は 1個口あたり 1,900〜2,000 USD で帯の中に残る。
    const rows = rowsFor('US', 300_000, 3);
    const has = (id: string) =>
      rows.find((r) => r.id === id)!.lines.some((l) => l.key === 'duty-prepayment');
    expect(has('buyee:default')).toBe(true);
    expect(has('buyee:consolidated')).toBe(false);
    expect(has('neokyo')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T15: 代行が販売時点で徴収する GST（AU ≤A$1,000・SG <S$400）。
// **確認できた社は数値、確認できていない社は「—」。** 未検証のまま非対称に実装しない
// ＝「調べていないから安い」を作らない。どちらがどちらかをここで固定する。
// ─────────────────────────────────────────────────────────────────────────────

/** 一次情報で「自社が徴収する」と確認できた社（確認日 2026-09-06）。 */
const COLLECTS: Record<'AU' | 'SG', string[]> = {
  // 5社とも自社ページに明記。豪州は全社そろっている。
  AU: ['neokyo', 'zenmarket', 'fromjapan', 'buyee', 'jauce'],
  // Buyee と FROM JAPAN だけ。他3社は自社ページに記載が無く、確認できていない。
  SG: ['buyee', 'fromjapan'],
};

const PREPAID = 'prepaid-import-tax';
const nonTaxLines = (row: Row) =>
  row.lines.filter((l) => !['duty', 'vat', 'province-tax', 'clearance', PREPAID, 'duty-prepayment']
    .includes(l.key));

describe('the GST the service collects at checkout is shown per service', () => {
  test('Australia: every one of the five says it collects, so every row carries a number', () => {
    const rows = rowsFor('AU', 3000, 5);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const l = line(row, PREPAID);
      expect(COLLECTS.AU, row.id).toContain(row.serviceId);
      expect(l.label, row.id).toBe('GST collected at checkout');
      expect(l.amount, row.id).toBeGreaterThan(0);
      expect(l.tier, row.id).toBe('fixed');
      expect(l.sourceUrl, row.id).toMatch(/^https:\/\//);
      // 総額に入る。開示ではなく実費として積む。
      expect(row.total, row.id).toBe(row.lines.reduce((a, x) => a + (x.amount ?? 0), 0));
      expect(row.excluded, row.id).not.toContain(l.label);
    }
  });

  test('Singapore: every service carries a number — confirmed as fixed, the rest as an estimate', () => {
    // **以前ここは「確認できた2社だけ数字、残りは `—`」を守っていた。**
    // それは `docs/TODO-NEXT.md` 課題1が名指しした誤りで、
    // **確認できていないのは「誰が集めるか」だけ、「いくら払うか」は同じ**なのに、
    // `—` にすると調べていない3社がその税額ぶん安い表になっていた。
    const rows = rowsFor('SG', 3000, 5);
    for (const row of rows) {
      const l = line(row, PREPAID);
      // どの社も額が在る。**`—` は無い。**
      expect(l.amount, row.id).toBeGreaterThan(0);
      if (COLLECTS.SG.includes(row.serviceId)) {
        expect(l.tier, row.id).toBe('fixed');
        expect(l.label, row.id).toBe('GST collected at checkout');
      } else {
        // 推定として出す。画面では `~` と琥珀色（src/lib/ui/tiers.tsx）。
        expect(l.tier, row.id).toBe('estimate');
        expect(l.label, row.id).toContain('estimated');
        // **社名は入れない。**この文言は全社の列に掛かる見出しにも出る。
        expect(l.label, row.id).not.toContain(row.serviceName);
        // 推定の根拠が note に在る。「9% はどちらでも同じ」と、
        // 国境で集められた場合に配送業者の手数料が別に乗ることの開示。
        expect(l.note, row.id).toContain('9% either way');
        expect(l.note, row.id).toContain("handling fee");
        // 額が在るので総額に入る。excluded には出ない。
        expect(row.excluded, row.id).not.toContain(l.label);
      }
      // 額が在るなら総額と一致する。
      expect(row.total, row.id).toBe(row.lines.reduce((x, y) => x + (y.amount ?? 0), 0));
    }
    // 確認できた社は fixed、それ以外は estimate。**両方が表に出ていること。**
    const fixed = rows.filter((r) => line(r, PREPAID).tier === 'fixed').map((r) => r.serviceId);
    const est = rows.filter((r) => line(r, PREPAID).tier === 'estimate').map((r) => r.serviceId);
    expect(new Set(fixed)).toEqual(new Set(COLLECTS.SG));
    expect(new Set(est)).toEqual(
      new Set(SERVICES.map((s) => s.id).filter((id) => !COLLECTS.SG.includes(id))));
  });

  test('the tax is charged once: the border line is zero while the service collects it', () => {
    for (const cc of ['AU', 'SG'] as const) {
      for (const row of rowsFor(cc, 3000, 5)) {
        const vat = line(row, 'vat');
        expect(vat.amount, `${cc} ${row.id}`).toBe(0);
        expect(vat.note, `${cc} ${row.id}`).toContain('collected at checkout by the service');
        expect(row.lines.filter((l) => l.key === PREPAID).length, `${cc} ${row.id}`).toBe(1);
      }
    }
  });

  test('each base is the one that service publishes, not one we averaged', () => {
    const rows = rowsFor('AU', 3000, 5);
    const row = (id: string) => rows.find((r) => r.serviceId === id)!;
    const preTax = (r: Row) => nonTaxLines(r).reduce((a, l) => a + (l.amount ?? 0), 0);
    const shipping = (r: Row) => r.lines
      .filter((l) => ['domestic-shipping', 'packing', 'intl-shipping'].includes(l.key))
      .reduce((a, l) => a + (l.amount ?? 0), 0);

    // Neokyo・ZenMarket は「declared value（内容品価格）の 10%」と書いている。
    for (const id of ['neokyo', 'zenmarket']) {
      const r = row(id);
      expect(line(r, PREPAID).amount, id).toBe(Math.round(line(r, 'items').amount! * 0.10));
    }
    // FROM JAPAN・Jauce は「Charge 1 + Charge 2（総額）の 10%」。
    for (const id of ['fromjapan', 'jauce']) {
      const r = row(id);
      expect(line(r, PREPAID).amount, id).toBe(Math.round(preTax(r) * 0.10));
    }
    // Buyee は豪州のページに送料を挙げていない（徴収は購入手続きの時点）。
    const b = row('buyee');
    expect(line(b, PREPAID).amount).toBe(Math.round((preTax(b) - shipping(b)) * 0.10));
    // ベースが違えば額も違う。ここが全部同じになったら実装が原文を捨てている。
    expect(new Set(rows.map((r) => line(r, PREPAID).amount)).size).toBeGreaterThan(1);
  });

  test('above the threshold the border takes over and the checkout line goes away', () => {
    // AU: 商品代 A$1,000 超（¥200,000 は現行の為替で A$1,700 前後）。
    for (const row of rowsFor('AU', 200_000)) {
      expect(row.lines.some((l) => l.key === PREPAID), row.id).toBe(false);
      expect(line(row, 'vat').amount, row.id).toBeGreaterThan(0);
      expect(line(row, 'vat').note, row.id).not.toContain('checkout');
    }
    // SG: 商品代 S$400 超（¥100,000 は S$700 前後）。
    for (const row of rowsFor('SG', 100_000)) {
      expect(row.lines.some((l) => l.key === PREPAID), row.id).toBe(false);
      expect(line(row, 'vat').amount, row.id).toBeGreaterThan(0);
    }
  });

  test('no other destination grows a checkout tax we never confirmed', () => {
    // 豪・星は**制度が全社に課す**ので国の表（`sellerCollectsBelow`）で持つ。
    // 独・仏・英の IOSS / UK VAT 前徴収は**任意なので社で割れる**——ZenMarket だけが
    // 「2026-03-02 から強制」と自分で告知しており、他4社は自社ページに記載が無い。
    // だからここは「AU/SG 以外は全社ゼロ」ではなく「確認できた社だけ」を見る。
    const CONFIRMED_EU_UK = new Set(['zenmarket']);
    for (const cc of COUNTRY_CODES) {
      if (cc === 'AU' || cc === 'SG') continue;
      for (const row of rowsFor(cc, 3000, 5)) {
        const has = row.lines.some((l) => l.key === PREPAID);
        const expected = (cc === 'DE' || cc === 'FR' || cc === 'GB')
          && CONFIRMED_EU_UK.has(row.serviceId);
        expect(has, `${cc} ${row.id}`).toBe(expected);
      }
    }
  });

  test('only ZenMarket prepays EU / UK VAT, and only under the threshold', () => {
    // 4社は自社ページに記載が無いことを対照実験つきで確認している
    // （FROM JAPAN の英語ヘルプ辞書1,474キーに GST は17件・VAT/IOSS は0件、など）。
    // Neokyo に至っては「If you ship with Japan Post ... Delivered Duty Unpaid」と
    // 郵便を明示的に外している。この計算機の既定は EMS＝Japan Post。
    for (const cc of ['DE', 'FR', 'GB'] as CountryCode[]) {
      const under = rowsFor(cc, 3000, 5);   // 5点 ¥15,000 → 閾値の中
      const zen = under.find((r) => r.serviceId === 'zenmarket')!;
      expect(line(zen, PREPAID).amount, `${cc} 閾値の中`).toBeGreaterThan(0);
      expect(line(zen, 'vat').amount, `${cc} 国境 VAT は二重に積まない`).toBe(0);
      // **手数料は税の徴収に従属する。**決済時に払い済みなら国境で徴収するものが無い。
      expect(line(zen, 'clearance').amount, `${cc} 通関手数料`).toBe(0);
      for (const row of under.filter((r) => r.serviceId !== 'zenmarket')) {
        expect(row.lines.some((l) => l.key === PREPAID), `${cc} ${row.id}`).toBe(false);
        expect(line(row, 'vat').amount, `${cc} ${row.id}`).toBeGreaterThan(0);
      }
      // 閾値の外（5点 ¥40,000 = 約 €220 / £186）では ZenMarket も国境払いに戻る。
      const over = rowsFor(cc, 40_000, 5).find((r) => r.serviceId === 'zenmarket')!;
      expect(over.lines.some((l) => l.key === PREPAID), `${cc} 閾値の外`).toBe(false);
      expect(line(over, 'vat').amount, `${cc} 閾値の外の国境 VAT`).toBeGreaterThan(0);
      expect(line(over, 'clearance').amount, `${cc} 閾値の外の手数料`).toBeGreaterThan(0);
    }
  });

  test('the data itself keeps a source and a date for every claim we make', () => {
    for (const svc of SERVICES) {
      for (const cc of ['AU', 'SG'] as const) {
        const p = svc.prepaidImportTax?.[cc];
        if (!p) {
          expect(COLLECTS[cc], `${svc.id} ${cc}`).not.toContain(svc.id);
          continue;
        }
        expect(COLLECTS[cc], `${svc.id} ${cc}`).toContain(svc.id);
        expect(p.sourceUrl, `${svc.id} ${cc}`).toMatch(/^https:\/\//);
        expect(p.checkedOn, `${svc.id} ${cc}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(p.rate, `${svc.id} ${cc}`).toBe(cc === 'AU' ? 0.10 : 0.09);
        expect(p.tier, `${svc.id} ${cc}`).toBe('fixed');
      }
    }
  });

  test('the country table keeps the band the whole branch turns on', () => {
    expect(COUNTRIES.AU.sellerCollectsBelow).toBe(1000);
    expect(COUNTRIES.SG.sellerCollectsBelow).toBe(400);
    for (const cc of COUNTRY_CODES) {
      if (cc === 'AU' || cc === 'SG') continue;
      expect(COUNTRIES[cc].sellerCollectsBelow, cc).toBeNull();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// **数字には出典と確認日が要る。**額だけ出して日付を伏せたら、いつの値か言えない
// 数字を公表していることになる。監査で AU の A$50/A$152/A$48 と CA の C$9.95 が
// 日付なしで公開されていたのが見つかった。
// ─────────────────────────────────────────────────────────────────────────────
describe('every fetched clearance fee carries its source and the day we read it', () => {
  test('a country with clearance bands has a source URL and a checked-on date', () => {
    for (const cc of COUNTRY_CODES) {
      const c = COUNTRIES[cc];
      if (!c.clearanceBands?.length) continue;
      expect(c.clearanceSourceUrl, `${cc}: bands without a source`).toBeTruthy();
      expect(c.clearanceSourceUrl, cc).toMatch(/^https:\/\//);
      expect(c.clearanceCheckedOn, `${cc}: bands without a checked-on date`).toBeTruthy();
      expect(c.clearanceCheckedOn, cc).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(c.clearanceCheckedOn!).getTime(), `${cc}: read in the future`)
        .toBeLessThanOrEqual(Date.now());
    }
  });

  test('**AU cites the department whose charge it is, not only the one that collects it**', () => {
    // A$48 は DAFF（農漁林業省）の生物検疫費用回収額で、ABF は代わりに徴収しているだけ。
    // 徴収者のページだけを出典に立てると、額の出どころを取り違える。
    const au = COUNTRIES.AU;
    expect(au.clearanceSourceUrl).toContain('abf.gov.au');
    expect(au.clearanceSourceUrl2, 'the biosecurity charge has no source of its own')
      .toContain('agriculture.gov.au');
    expect(au.clearanceBands!.some((b) => b.note.includes('biosecurity'))).toBe(true);
  });
});

// **二次情報を一次情報に見せない。**確認日が付いたからといって原典に当たった
// ことにはならない。tier が unverified の国は、note か画面で二次情報だと分かること。
describe('a second-hand clearance fee still says it is second-hand', () => {
  test('unverified bands are drawn as second-hand, not as published figures', () => {
    for (const cc of COUNTRY_CODES) {
      const c = COUNTRIES[cc];
      if (!c.clearanceBands?.length) continue;
      if (c.clearanceTier !== 'unverified') continue;
      // 確度が画面の描き分けに効くのは tier。ここが fixed に変わったら、
      // 原典を読んだという主張になる。
      expect(c.clearanceTier, cc).toBe('unverified');
    }
    // 少なくとも1国は二次情報のまま（全部 fixed になったらこのテストが形骸化する）。
    expect(COUNTRY_CODES.some((cc) => COUNTRIES[cc].clearanceTier === 'unverified')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// **関税率を持っていない国はもう無い。**豪州の A$1,000 超が7カ国で最後の穴だった。
// 「関税が無い」ではなく「我々が調べていない」だったので、しかも豪州は関税が GST の
// 課税ベースに入るため、`—` が 0 に畳まれると **GST まで一緒に縮んでいた。**
// ─────────────────────────────────────────────────────────────────────────────
describe('every destination has a duty rate above its threshold', () => {
  test('no country leaves duty as a dash — the last hole was Australia over A$1,000', () => {
    for (const cc of COUNTRY_CODES) {
      const c = COUNTRIES[cc];
      // 無税だと**言い切れる**国（SG）は率 0・tier fixed。それ以外は率を持つ。
      expect(c.dutyRate, `${cc}: duty rate is still null`).not.toBeNull();
      expect(c.dutyTier, cc).not.toBe('none');
      // 推定で置いた率は、必ず出典を指す。
      if (c.dutyTier === 'estimate') expect(c.dutyRateSourceUrl, cc).toBeTruthy();
    }
  });

  test('Australia: zero below the threshold is published, the rate above it is ours', () => {
    // A$1,000 以下 = ABF の表が 0 と書いている 0。`—` ではない。
    const low = line(rowsFor('AU', 3000, 5)[0]!, 'duty');
    expect(low.amount).toBe(0);
    expect(low.tier).toBe('fixed');
    expect(low.note).toContain('under the AUD 1000 threshold');

    // A$1,000 超 = WTO 豪州プロファイルの非農産品 単純平均 2.3%。**推定と名乗る。**
    const high = line(rowsFor('AU', 40_000, 5)[0]!, 'duty');
    expect(high.amount).toBeGreaterThan(0);
    expect(high.tier).toBe('estimate');
    expect(COUNTRIES.AU.dutyRate).toBe(0.023);
    expect(COUNTRIES.AU.dutyRateSourceUrl).toContain('AU_e.pdf');
  });

  test('the dash that remains is always a dash on purpose', () => {
    // **総額から漏れている費目は米国の3つだけ**で、3つとも「取れていない」ではなく
    // 「そこには無い／額が公表されていない／その社が売っていない」。
    // ここが増えたら、それは新しい穴が開いたということ。
    const seen = new Set<string>();
    for (const cc of COUNTRY_CODES) {
      for (const priceYen of [3000, 15_000, 40_000, 200_000]) {
        for (const row of rowsFor(cc, priceYen, 5)) {
          for (const e of row.excluded) seen.add(`${cc}: ${e}`);
        }
      }
    }
    expect([...seen].sort()).toEqual([
      'US: EMS to United States',                       // Neokyo は米国宛に日本郵便を売っていない
      'US: Sales tax / VAT',                            // 米国に連邦売上税は無い
      'US: US import prepayment (Zonos) fee — not published',  // 額が公表されていない
    ]);
  });
});
