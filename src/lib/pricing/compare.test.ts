import { describe, expect, test } from 'vitest';
import { compare } from './compare';
import { SERVICES } from './services';
import { CA_PROVINCES, CA_PROVINCE_AVERAGE_RATE, PROVINCE_CODES } from './countries';
import { EMS_MAX_GRAMS, UNKNOWN_WEIGHT_STEPS_G } from './ems';
import { rateFor } from './rates';
import { weightFieldsFor } from './weights';
import type { CountryCode, Item, ProvinceCode, Row } from './types';

const COUNTRIES_ALL: CountryCode[] = ['US', 'GB', 'DE', 'FR', 'AU', 'CA', 'SG'];

function item(over: Partial<Item> & { id: string }): Item {
  return {
    title: over.id, priceYen: 3000, priceTier: 'fixed', site: 'yahoo-auctions',
    weightG: 600, weightTier: 'estimate', qty: 1, ...over,
  };
}

/** n 点・全点同一価格/同一重量。実測（docs/audit/measured-2026-09-06.md）と同じ形。 */
function items(n: number, weightG: number | null, priceYen = 3000, over: Partial<Item> = {}): Item[] {
  return Array.from({ length: n }, (_, i) => item({ id: `i${i}`, priceYen, weightG, ...over }));
}

const byId = (rows: Row[], id: string): Row =>
  rows.find((r) => r.id === id) ?? (() => { throw new Error(`no row ${id}`); })();
const line = (row: Row, key: string) =>
  row.lines.find((l) => l.key === key) ?? (() => { throw new Error(`no line ${key}`); })();
const sumLines = (row: Row) => row.lines.reduce((a, l) => a + (l.amount ?? 0), 0);
/** 比較可能な行のうち1位。**表の外に出た行を1位に数えたら順位が嘘になる。** */
const winnerOf = (rows: Row[]) => rows.find((r) => r.comparable);

// ─────────────────────────────────────────────────────────────────────────────
// 内訳が総額を説明できているか。ここが崩れたら画面の数字は根拠を失う。
// ─────────────────────────────────────────────────────────────────────────────
describe('the breakdown explains the total', () => {
  test('the total is the sum of the lines — for every country, size and weight', () => {
    for (const cc of COUNTRIES_ALL) {
      for (const n of [1, 3, 5]) {
        for (const w of [200, 600, 3000]) {
          for (const row of compare({ items: items(n, w), country: cc }).rows) {
            expect(row.total, `${cc} n=${n} w=${w} ${row.id}`).toBe(sumLines(row));
          }
        }
      }
    }
  });

  test('an unfetched line is null — never 0 — and never enters the total', () => {
    // US には連邦の売上税が無い。0 と書けば「税は0円」という嘘になる。
    const row = compare({ items: items(1, 600), country: 'US' }).rows[0]!;
    const vat = line(row, 'vat');
    expect(vat.amount).toBeNull();
    expect(vat.tier).toBe('none');
    expect(vat.label).toBe('Sales tax / VAT');
    expect(row.total).toBe(sumLines(row));
  });

  test('excluded names exactly the null lines, so the shortfall is visible', () => {
    for (const cc of COUNTRIES_ALL) {
      for (const row of compare({ items: items(3, 600), country: cc }).rows) {
        expect(row.excluded, `${cc} ${row.id}`)
          .toEqual(row.lines.filter((l) => l.amount == null).map((l) => l.label));
      }
    }
  });

  test('Canada is down to one unknown: the two lines that certainly happen now carry numbers', () => {
    // 以前は Duty・Provincial tax・Customs clearance fee の3つとも `—` だった。
    // **州税と Canada Post の手数料は確実に発生する**ので、`—` は誤り（T23）。
    // 残る Duty は品目分類が要る（T24）ので、これだけが未取得のまま。
    const row = compare({ items: items(1, 600), country: 'CA' }).rows[0]!;
    expect(line(row, 'duty').amount).toBeNull();
    expect(line(row, 'province-tax').amount).toBeGreaterThan(0);
    expect(line(row, 'clearance').amount).toBeGreaterThan(0);
    expect(row.excluded).toEqual(['Duty']);
  });

  test('a fetched zero stays a zero: under-threshold duty is 0 with its reason', () => {
    const duty = line(compare({ items: items(1, 600), country: 'GB' }).rows[0]!, 'duty');
    expect(duty.amount).toBe(0);
    expect(duty.tier).toBe('fixed');
    expect(duty.note).toContain('threshold');
  });

  test('a clearance fee we never fetched is null in every country that lacks one', () => {
    // **CA・AU・DE はここから抜けた**（CA/AU は T23 / T24、DE は Auslagepauschale €7.50）。
    // 抜けたことを空振りにしないため、下の test がそれぞれに数字と出典が在ることを見る。
    // **FR に残っているのは「手数料が無い」ではない。**La Poste の frais de dossier は
    // 実在するが、額（€2 / €5 / €8 という報告）を公式で裏づけられなかったので入れていない。
    // 推測で置けば、DE を €6（2018年の値）のまま置いていたのと同じ誤りになる。
    for (const cc of ['FR', 'SG'] as const) {
      const clearance = line(compare({ items: items(1, 600), country: cc }).rows[0]!, 'clearance');
      expect(clearance.amount, cc).toBeNull();
      expect(clearance.tier, cc).toBe('none');
    }
  });

  test('the German Auslagepauschale is EUR 7.50 per consignment — the 2026-03-10 amount, not the 2018 one', () => {
    // €6 は 2018-03-01 の導入時の額で、**2026-03-10 に €7.50 へ上がっている。**
    // 「一次情報だから正しい」ではなく「いつの一次情報か」を見ないと、7年前の値を今日の値として出す。
    const fee = line(compare({ items: items(1, 600), country: 'DE' }).rows[0]!, 'clearance');
    expect(fee.amount).not.toBeNull();
    expect(fee.note).toContain('EUR 7.5 × 1 parcel');
    // 原典（Deutsche Post「Leistungen und Preise」）には当たれていない。二次情報として出す。
    expect(fee.tier).toBe('unverified');
  });

  test('the Canada Post handling fee is a published number, per parcel, and zero below CAD 20', () => {
    const row = compare({ items: items(1, 600), country: 'CA' }).rows[0]!;
    const fee = line(row, 'clearance');
    expect(fee.tier).toBe('fixed');
    expect(fee.note).toContain('CAD 9.95 × 1 parcel');
    expect(fee.sourceUrl).toContain('canadapost-postescanada.ca');
    // 個口が割れる行では個口ぶん。原文が「per dutiable or taxable mail item」。
    const split = byId(compare({ items: items(3, 600), country: 'CA' }).rows, 'buyee:default');
    expect(split.parcels).toBe(3);
    expect(line(split, 'clearance').note).toContain('CAD 9.95 × 3 parcels');
    // 丸めは合計に1回だけ掛ける（個口ごとに丸めて足すと ¥1 ずれる）。
    expect(line(split, 'clearance').amount).toBe(Math.round(9.95 * rateFor('CAD') * 3));
    expect(fee.amount).toBe(Math.round(9.95 * rateFor('CAD')));
    // C$20 以下は課税自体が無いので手数料も 0。**未取得の 0 ではないので tier は fixed。**
    const tiny = line(compare({ items: items(1, 200, 1500), country: 'CA' }).rows[0]!, 'clearance');
    expect(tiny.amount).toBe(0);
    expect(tiny.tier).toBe('fixed');
    expect(tiny.note).toContain('nothing is charged for collecting it');
  });

  test('optional extras are offered but kept out of the total', () => {
    const row = byId(compare({ items: items(1, 600), country: 'US' }).rows, 'neokyo');
    expect(row.optionalLines.length).toBeGreaterThan(0);
    expect(row.optionalLines.every((l) => !row.lines.some((x) => x.key === l.key))).toBe(true);
    expect(row.total).toBe(sumLines(row));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 順位は総額のみ。報酬（paysUs）は並びに一切効かない。
// ─────────────────────────────────────────────────────────────────────────────
describe('ranking uses the total and nothing else', () => {
  test('the order equals a plain sort by total, wherever every row is comparable', () => {
    for (const cc of COUNTRIES_ALL) {
      for (const n of [1, 2, 3, 5]) {
        const rows = compare({ items: items(n, 600), country: cc }).rows;
        expect(rows.every((r) => r.comparable), `${cc} n=${n}`).toBe(true);
        // **総額だけが並べ替えの鍵。** 第2の鍵（社名の辞書順など）は無い。
        const bySort = [...rows].sort((a, b) => a.total - b.total);
        expect(rows.map((r) => r.id), `${cc} n=${n}`).toEqual(bySort.map((r) => r.id));
        // 順位は「自分より厳密に安い行の数 + 1」。同額が無い入力ではこれが 1..n になる。
        expect(rows.map((r) => r.rank), `${cc} n=${n}`)
          .toEqual(rows.map((r) => rows.filter((o) => o.total < r.total).length + 1));
        expect(rows.every((r) => !r.tied), `${cc} n=${n}`).toBe(true);
      }
    }
  });

  test('nothing but the total distinguishes two rows with the same total', () => {
    // 同額が実在する以上、第2の鍵（社名の辞書順など）は「たまたま使われない鍵」では
    // なく、在れば必ず効く。**順位・差額・CHEAPEST のどれも同額の行を区別しない**
    // ことをここで縛る。縦の並びだけは残るが、それは `tied` が意味を持たないと書く。
    for (const cc of COUNTRIES_ALL) {
      for (const w of [450, 1425, 1450, 1900]) {
        for (const site of ['yahoo-auctions', 'rakuten'] as const) {
          const rows = compare({ items: items(1, w, 4200, { site }), country: cc }).rows
            .filter((r) => r.comparable);
          for (const a of rows) {
            for (const b of rows) {
              if (a.id === b.id || a.total !== b.total) continue;
              const where = `${cc} w=${w} ${site} ${a.id}/${b.id}`;
              expect(a.rank, where).toBe(b.rank);
              expect(a.diff, where).toBe(b.diff);
              expect(a.cheapest, where).toBe(b.cheapest);
              expect(a.tied, where).toBe(true);
              expect(b.tied, where).toBe(true);
            }
          }
        }
      }
    }
  });

  test('the row that pays us nothing is first whenever it is cheapest', () => {
    // 200g では Neokyo（報酬ゼロ）が1位。繰り上げも繰り下げもしない。
    const rows = compare({ items: items(5, 200), country: 'US' }).rows;
    expect(rows[0]!.serviceId).toBe('neokyo');
    expect(rows[0]!.paysUs).toBe(false);
    expect(rows[0]!.cheapest).toBe(true);
    expect(rows.filter((r) => r.paysUs).every((r) => r.rank > 1)).toBe(true);
  });

  test('paysUs never reorders a board: dropping it from the sort key changes nothing', () => {
    for (const w of [200, 600, 1500, 3000]) {
      const rows = compare({ items: items(5, w), country: 'US' }).rows;
      const paying = rows.filter((r) => r.paysUs).map((r) => r.total);
      const free = rows.filter((r) => !r.paysUs).map((r) => r.total);
      // 報酬を払う行だけを集めても総額の昇順のまま＝並びが報酬で歪んでいない。
      expect(paying, `w=${w}`).toEqual([...paying].sort((a, b) => a - b));
      expect(free, `w=${w}`).toEqual([...free].sort((a, b) => a - b));
      expect(rows.map((r) => r.total)).toEqual([...rows.map((r) => r.total)].sort((a, b) => a - b));
    }
  });

  test('diff is the gap to the cheapest, and exactly one row is cheapest', () => {
    const rows = compare({ items: items(5, 600), country: 'US' }).rows;
    const low = rows[0]!.total;
    for (const row of rows) expect(row.diff).toBe(row.total - low);
    expect(rows[0]!.diff).toBe(0);
    expect(rows.filter((r) => r.cheapest)).toHaveLength(1);
  });

  test('each country reports its own currency at the fixed rate', () => {
    const seen = COUNTRIES_ALL.map((cc) => compare({ items: items(1, 600), country: cc }).currency.code);
    expect(seen).toEqual(['USD', 'GBP', 'EUR', 'EUR', 'AUD', 'CAD', 'SGD']);
    expect(compare({ items: items(1, 600), country: 'US' }).currency.rate).toBe(156.25);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AU の輸入処理手数料と GB の酒税（T24）。
// **どちらも「発生するかどうか」は原文から言える。**額を出せるのは AU だけ。
// ─────────────────────────────────────────────────────────────────────────────
describe('Australia: the import processing charge, including the band where it is zero', () => {
  test('at or below AUD 1,000 the charge is a published zero, not a dash', () => {
    // ABF の表は「Electronic / ≤$1,000 / Sea·Air·Post / $0.00」という行を持っている。
    // **原文が 0 と書いている 0** なので `—` にしない。この帯はちょうど代行が
    // 販売時点で GST を取る帯でもあり、この計算機が扱う買い物のほとんどがここに入る。
    const fee = line(compare({ items: items(1, 600), country: 'AU' }).rows[0]!, 'clearance');
    expect(fee.amount).toBe(0);
    expect(fee.tier).toBe('fixed');
    expect(fee.note).toContain('no import declaration is required');
    expect(fee.sourceUrl).toContain('abf.gov.au');
  });

  test('above AUD 1,000 it is a number, and it steps again above AUD 10,000', () => {
    // ¥150,000 ≒ A$1,515、¥1,500,000 ≒ A$15,151（rates.ts の転記値）。
    const mid = line(compare({ items: items(1, 600, 150000), country: 'AU' }).rows[0]!, 'clearance');
    const high = line(compare({ items: items(1, 600, 1500000), country: 'AU' }).rows[0]!, 'clearance');
    expect(mid.amount).toBeGreaterThan(0);
    expect(mid.note).toContain('AUD 98');
    expect(mid.note).toContain('biosecurity');
    expect(high.amount!).toBeGreaterThan(mid.amount!);
    expect(high.note).toContain('AUD 200');
  });

  test('the band is chosen per parcel, because the charge is per declaration', () => {
    // 3点を3個口に割る Buyee default では、1個口あたりの価格で帯が決まる。
    // 籠の合計で決めると、安い小包にまで A$98 を積むことになる。
    const rows = compare({ items: items(3, 600, 150000), country: 'AU' }).rows;
    const split = byId(rows, 'buyee:default');
    const together = byId(rows, 'buyee:consolidated');
    expect(split.parcels).toBe(3);
    expect(line(split, 'clearance').note).toContain('3 parcels');
    // まとめた1個口は A$4,545 で同じ帯、割った1個口は A$1,515 でやはり同じ帯。
    // 帯が同じでも個口が3つなら3倍取られる。
    expect(line(split, 'clearance').amount).toBeGreaterThan(line(together, 'clearance').amount!);
  });
});

describe('the UK excise duty on alcohol is named even though we cannot price it', () => {
  const sake = () => item({
    id: 'sake', title: 'junmai sake 720ml', priceYen: 5000,
    ...weightFieldsFor('junmai sake 720ml'),
  });

  test('a bottle in the basket adds a null line, so the shortfall is on the screen', () => {
    // gov.uk 原文「you'll be charged Excise Duty at current rates」——金額にかかわらず
    // 課され、£135 も £39 も効かない。**発生は確実。額だけが分からない。**
    const row = compare({ items: [sake()], country: 'GB' }).rows[0]!;
    const excise = line(row, 'excise');
    expect(excise.amount).toBeNull();
    expect(excise.tier).toBe('none');
    expect(excise.note).toContain('at any value');
    expect(excise.note).toContain('litre of pure alcohol');
    // 総額から抜けている費目の一覧に名前が載る。載らなければ黙って安く見せたことになる。
    expect(row.excluded).toContain(excise.label);
  });

  test('no bottle, no line — and no other destination gets one', () => {
    expect(compare({ items: items(1, 600), country: 'GB' }).rows[0]!.lines
      .some((l) => l.key === 'excise')).toBe(false);
    for (const cc of COUNTRIES_ALL.filter((c) => c !== 'GB')) {
      expect(compare({ items: [sake()], country: cc }).rows[0]!.lines
        .some((l) => l.key === 'excise'), cc).toBe(false);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// カナダの州（T23）。**州税は確実に発生するので `—` にしない。**
// 選んでいれば CBSA が実際に取る率（D2-3-6 Appendix A）、選んでいなければ人口加重の
// 代表値を tier estimate で出す。
// ─────────────────────────────────────────────────────────────────────────────
describe('Canada: the province decides the bill, and not choosing one is not an excuse', () => {
  const ca = (province: ProvinceCode | null, n = 1) =>
    compare({ items: items(n, 600), country: 'CA', province }).rows[0]!;

  test('the provincial rates add up to the totals the CBSA publishes', () => {
    // ここが崩れたら、州の取り分と合計のどちらかを書き写し間違えている。
    for (const code of PROVINCE_CODES) {
      const p = CA_PROVINCES[code];
      expect(+(p.rate + 0.05).toFixed(5), code).toBe(+p.totalWithGst.toFixed(5));
    }
    expect(CA_PROVINCES.ON.totalWithGst).toBe(0.13);
    expect(CA_PROVINCES.NS.totalWithGst).toBe(0.14);
    expect(CA_PROVINCES.QC.rate).toBe(0.09975);
  });

  test('picking Ontario makes the line a number: HST 8% on top of the 5% GST = 13%', () => {
    const row = ca('ON');
    const gst = line(row, 'vat');
    const prov = line(row, 'province-tax');
    expect(prov.amount).toBeGreaterThan(0);
    expect(prov.tier).toBe('fixed');
    expect(prov.note).toContain('Ontario');
    expect(prov.note).toContain('13% together');
    // 州の取り分と連邦 GST を足すと、原文の合計率になる。**合計を1行で出して
    // 二重に積んでいない**ことをここで縛る。
    expect(gst.amount! + prov.amount!).toBe(Math.round((gst.amount! / 0.05) * 0.13));
  });

  test('not choosing a province still produces a number, drawn as an estimate', () => {
    const row = ca(null);
    const prov = line(row, 'province-tax');
    // **`—` にしない。**発生が確実なものを未取得として落とすほうが誤りが大きい。
    expect(prov.amount).not.toBeNull();
    expect(prov.amount).toBeGreaterThan(0);
    expect(prov.tier).toBe('estimate');
    expect(prov.note).toContain('weighted by population');
    expect(prov.note).toContain('Pick your province');
    // 総額から漏れている費目の一覧にも入らない（漏れていないので）。
    expect(row.excluded).not.toContain('Provincial tax');
    // 代表値は全州の間に収まる。どの州の値でもない。
    const rates = PROVINCE_CODES.map((c) => CA_PROVINCES[c].rate);
    expect(CA_PROVINCE_AVERAGE_RATE).toBeGreaterThan(Math.min(...rates));
    expect(CA_PROVINCE_AVERAGE_RATE).toBeLessThan(Math.max(...rates));
  });

  test('the estimate is the population-weighted average, not a simple one', () => {
    // 単純平均だと人口 4 万の準州がオンタリオと同じ重みになる。実際に払う人の
    // 分布から離れるので、重みは人口で置く。**その差が実際に在ること**を見る。
    const rows = PROVINCE_CODES.map((c) => CA_PROVINCES[c]);
    const simple = rows.reduce((a, p) => a + p.rate, 0) / rows.length;
    const pop = rows.reduce((a, p) => a + p.populationOn20260401, 0);
    const weighted = rows.reduce((a, p) => a + p.rate * p.populationOn20260401, 0) / pop;
    expect(CA_PROVINCE_AVERAGE_RATE).toBeCloseTo(weighted, 10);
    expect(Math.abs(weighted - simple)).toBeGreaterThan(0.005);
  });

  test('a province with no collection agreement is a real zero, with the reason on the line', () => {
    for (const code of ['AB', 'YT', 'NT', 'NU'] as const) {
      const prov = line(ca(code), 'province-tax');
      // **0 は「調べていない」ではない。**tier fixed のままで、理由が note に在る。
      expect(prov.amount, code).toBe(0);
      expect(prov.tier, code).toBe('fixed');
      expect(prov.note, code).toContain('no provincial tax at the border');
    }
  });

  test('Quebec costs more than Ontario, and Alberta costs less than both', () => {
    // 州が総額を動かすこと自体を、順位表の数字で見る。
    expect(ca('QC').total).toBeGreaterThan(ca('ON').total);
    expect(ca('ON').total).toBeGreaterThan(ca('AB').total);
    // 代表値はその間のどこか。
    expect(ca(null).total).toBeGreaterThan(ca('AB').total);
    expect(ca(null).total).toBeLessThan(ca('QC').total);
  });

  test('below CAD 20 nothing is charged — and that zero keeps its reason', () => {
    const row = compare({ items: items(1, 200, 1500), country: 'CA', province: 'QC' }).rows[0]!;
    for (const key of ['duty', 'vat', 'province-tax', 'clearance']) {
      const l = line(row, key);
      expect(l.amount, key).toBe(0);
      expect(l.tier, key).toBe('fixed');
      expect(l.note, key).toMatch(/CAD 20|threshold/);
    }
    expect(row.excluded).toEqual([]);
  });

  test('the province is ignored outside Canada, and an unknown one is rejected', () => {
    for (const cc of ['US', 'GB', 'DE', 'FR', 'AU', 'SG'] as const) {
      const withProvince = compare({ items: items(1, 600), country: cc, province: 'ON' }).rows;
      const without = compare({ items: items(1, 600), country: cc }).rows;
      expect(withProvince.map((r) => r.total), cc).toEqual(without.map((r) => r.total));
      // 州税の行はカナダにしか出ない。
      expect(without[0]!.lines.some((l) => l.key === 'province-tax'), cc).toBe(false);
    }
    // 知らないコードを黙って「未選択」に落とすと、代表値を「あなたの州の率」として
    // 出すことになる。呼び出し側の不具合なので投げる。
    expect(() => compare({
      items: items(1, 600), country: 'CA', province: 'XX' as ProvinceCode,
    })).toThrow(RangeError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 同額（T26）。**同額なら同順位。**社名の辞書順で1位を割り当てない。
//
// 同額は珍しくない: 7カ国 × 3サイト × 1/2/3/5点 × 25〜8,000 g × 7価格の走査で
// 同額を含む組み合わせが 3,938、そのうち**1位が同額**のものが 15 ある
// （docs/audit/ties-2026-09-07.md）。
// ─────────────────────────────────────────────────────────────────────────────
describe('equal totals get equal rank', () => {
  /** 1点 1,450 g・US。Buyee と Neokyo がちょうど同額（2位タイ）になる実在の入力。 */
  const midTie = () => compare({ items: items(1, 1450, 12800), country: 'US' }).rows;
  /** 1点 450 g・¥4,200・楽天・AU。Neokyo と ZenMarket が**1位で**同額になる実在の入力。 */
  const topTie = () => compare({
    items: items(1, 450, 4200, { site: 'rakuten' }), country: 'AU',
  }).rows;

  test('two rows with the same total carry the same rank, and the next rank skips', () => {
    const rows = midTie();
    const a = byId(rows, 'neokyo');
    const b = byId(rows, 'buyee');
    expect(a.total).toBe(b.total);
    expect(a.rank).toBe(b.rank);
    // 競技順位（1-1-3）。同額が2つあれば次は2つ飛ぶ。
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 2, 4, 5]);
    expect(a.tied).toBe(true);
    expect(b.tied).toBe(true);
    expect(rows.filter((r) => r.tied).map((r) => r.serviceId).sort())
      .toEqual(['buyee', 'neokyo']);
  });

  test('**the alphabetical tiebreak used to hand first place to the service that pays us**', () => {
    // 旧実装は `a.total - b.total || a.serviceName.localeCompare(b.serviceName)` だった。
    // 'Buyee' < 'Neokyo' なので、同額のとき**報酬を払う Buyee が、報酬ゼロの Neokyo を
    // 常に押しのけて上に来ていた。**順位に報酬を使わないという約束を第2の鍵が破っていた。
    const rows = midTie();
    const buyee = byId(rows, 'buyee');
    const neokyo = byId(rows, 'neokyo');
    expect(buyee.paysUs).toBe(true);
    expect(neokyo.paysUs).toBe(false);
    expect(buyee.total).toBe(neokyo.total);
    // いまはどちらも同じ順位で、報酬を払う社が上の順位を取れない。
    expect(buyee.rank).toBe(neokyo.rank);
  });

  test('CHEAPEST goes on **every** row at the lowest total, not on one of them', () => {
    const rows = topTie();
    const leaders = rows.filter((r) => r.cheapest);
    expect(leaders.map((r) => r.serviceId).sort()).toEqual(['neokyo', 'zenmarket']);
    expect(leaders.map((r) => r.rank)).toEqual([1, 1]);
    expect(leaders.map((r) => r.diff)).toEqual([0, 0]);
    expect(new Set(leaders.map((r) => r.total)).size).toBe(1);
    // 最安が2つあるとき、3位は2つ飛んで 3。
    expect(rows.map((r) => r.rank)).toEqual([1, 1, 3, 4, 5]);
  });

  test('a tied row says so, so the vertical order cannot be read as a ranking', () => {
    for (const rows of [midTie(), topTie()]) {
      const tied = rows.filter((r) => r.tied);
      expect(tied.length).toBe(2);
      // 同額でない行は tied を立てない（全行に付けたら印として機能しない）。
      for (const r of rows.filter((x) => !x.tied)) {
        expect(rows.filter((o) => o.id !== r.id && o.total === r.total), r.id).toEqual([]);
      }
    }
  });

  test('a tie at the top is not a rank change: stability is judged on the whole tied set', () => {
    // 1位が {Neokyo, ZenMarket} で、片端で ZenMarket、他端で Neokyo になる。
    // **どちらを選んでも両端で最安のままにはならない**ので不安定。
    const r = compare({
      items: items(1, 450, 4200, { site: 'rakuten', weightOrigin: 'user' }), country: 'AU',
    });
    expect(r.rows.filter((x) => x.cheapest).map((x) => x.serviceId).sort())
      .toEqual(['neokyo', 'zenmarket']);
    expect(r.rankStable).toBe(false);
    expect(r.rankStabilityNote).toContain('Neokyo is cheapest');
    expect(r.rankStabilityNote).toContain('ZenMarket is cheapest');
  });

  test('a tie below the top never makes the ranking look unstable', () => {
    // 2位が同額なだけ。1位（FROM JAPAN）は両端で1位のままなので安定。
    // 旧実装は `rows[0]` を比べていたので、同額の中で先頭が入れ替わっただけでも
    // 「1位が替わった」と読む余地があった。集合で見ることでそれを塞ぐ。
    const r = compare({ items: items(1, 1450, 12800), country: 'US' });
    expect(r.rows.filter((x) => x.tied).length).toBe(2);
    expect(r.rankStable).toBe(true);
    expect(r.rankStabilityNote)
      .toBe('FROM JAPAN stays cheapest even if we are off by 3x on weight.');
  });

  test('rank never has a hole: every rank from 1 up to the last is either used or skipped by a tie', () => {
    for (const cc of COUNTRIES_ALL) {
      for (const n of [1, 2, 3, 5]) {
        for (const w of [200, 450, 600, 1450, 1900, 3000]) {
          const rows = compare({ items: items(n, w), country: cc }).rows
            .filter((r) => r.comparable);
          const ranks = rows.map((r) => r.rank);
          // 先頭は必ず 1。ある順位 k が使われた回数だけ、その後の順位が飛ぶ。
          expect(Math.min(...ranks), `${cc} n=${n} w=${w}`).toBe(1);
          for (const r of rows) {
            expect(r.rank, `${cc} n=${n} w=${w} ${r.id}`)
              .toBe(rows.filter((o) => o.total < r.total).length + 1);
          }
        }
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EMS 公表表（30kg）の外。**総額が最大の費目を欠いたまま1位になってはいけない。**
// ─────────────────────────────────────────────────────────────────────────────
describe('a parcel above the published EMS table drops out of the comparison', () => {
  test('the step boundary is the gross weight, not the item weight', () => {
    // 梱包後 = round(net × 1.2 + 300)。24,750g がちょうど 30kg。
    const inside = byId(compare({ items: items(1, 24750), country: 'US' }).rows, 'neokyo');
    expect(inside.comparable).toBe(true);
    expect(line(inside, 'ems').amount).toBe(75100);
    const outside = byId(compare({ items: items(1, 24751), country: 'US' }).rows, 'neokyo');
    expect(outside.comparable).toBe(false);
    expect(line(outside, 'ems').amount).toBeNull();
    expect(line(outside, 'ems').note).toContain(`over ${EMS_MAX_GRAMS / 1000} kg`);
    expect(line(outside, 'ems').tier).toBe('none');
  });

  test('**a row missing its EMS line has a lower total and must still rank last**', () => {
    // 5点 × 5,000g。同梱する社は梱包後 30.3kg で公表料金が無い。
    // 注文ごとに分ける Buyee default だけが表の中に残る。
    const rows = compare({ items: items(5, 5000), country: 'US' }).rows;
    const top = rows[0]!;
    expect(top.id).toBe('buyee:default');
    expect(top.comparable).toBe(true);
    expect(top.cheapest).toBe(true);

    const blocked = rows.filter((r) => !r.comparable);
    expect(blocked).toHaveLength(5);
    for (const row of blocked) {
      // 国際送料を欠いた総額は 1位の 1/4 以下。安く見えるが順位には出さない。
      expect(row.total, row.id).toBeLessThan(top.total);
      expect(row.rank, row.id).toBeGreaterThan(top.rank);
      expect(row.cheapest, row.id).toBe(false);
      expect(row.diff, row.id).toBe(0);
      expect(line(row, 'ems').amount, row.id).toBeNull();
      expect(row.notComparableReason, row.id).toContain('EMS');
      expect(row.excluded, row.id).toContain('EMS to United States');
    }
  });

  test('when nothing is comparable we say so instead of ranking the leftovers', () => {
    const r = compare({ items: items(5, 25000), country: 'US' });
    expect(r.rows.every((row) => !row.comparable)).toBe(true);
    expect(r.rows.every((row) => !row.cheapest)).toBe(true);
    expect(r.rankStabilityNote).toBe(
      'No published EMS rate covers this parcel, so we cannot compare these totals.');
  });

  test('every country stops at the same table edge', () => {
    for (const cc of COUNTRIES_ALL) {
      const rows = compare({ items: items(5, 5000), country: cc }).rows;
      expect(winnerOf(rows)!.id, cc).toBe('buyee:default');
      expect(rows.filter((r) => !r.comparable).length, cc).toBe(5);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// **順位は重量の推定誤差に対して頑健ではない。** 交差点は 1〜2kg の現実的な帯にある。
// rankStable=false は不具合ではなく、その事実を画面に出すための仕様。
// 実測: docs/audit/measured-2026-09-06.md
// ─────────────────────────────────────────────────────────────────────────────
describe('rank stability is measured, not assumed — and it is often false', () => {
  test('**600 g per item is unstable in five of the seven countries — this is the spec, not a bug**', () => {
    // **AU と SG だけが安定側にいる。理由は税の徴収者が違うこと。**
    // どちらも低額品の GST を国境ではなく代行が販売時点で徴収する国で、その課税ベースが
    // 社ごとに違う（Neokyo・ZenMarket は内容品価格のみ、FROM JAPAN・Jauce・Buyee は
    // 手数料や送料も含む）。重くすると送料を課税ベースに入れている社ほど税も増えるので、
    // 1/3〜3倍では1位が動かなかった。
    // **SG の安定は我々の無知にも助けられている。** 徴収を確認できたのは Buyee と
    // FROM JAPAN だけで、残る3社の行には税が乗っていない（その3社の総額は税のぶん低い）。
    // 確認できる社が増えれば、ここは不安定に転じうる。
    const stable: CountryCode[] = ['AU', 'SG'];
    for (const cc of COUNTRIES_ALL.filter((c) => !stable.includes(c))) {
      const r = compare({ items: items(5, 600), country: cc });
      expect(r.rankStable, cc).toBe(false);
      // **不安定だと言うだけでは足りない。誰に替わるかを名指しすること。**
      // 以前この文言は 'see the weight steps' と書いていたが、重量が分かって
      // いるときは段の表を出していない。画面に無いものを指していた。
      const note = r.rankStabilityNote!;
      expect(note, cc).toContain('at a third of the weight you gave us');
      expect(note, cc).toContain('at three times the weight you gave us');
      expect(note, cc).not.toContain('see the weight steps');
      const named = SERVICES.some((s) => note.includes(s.name));
      expect(named, `${cc}: note names no company — ${note}`).toBe(true);
    }
    for (const cc of stable) {
      const r = compare({ items: items(5, 600), country: cc });
      expect(r.rankStable, cc).toBe(true);
      expect(r.rankStabilityNote, cc).toBe(
        'Neokyo stays cheapest even if we are off by 3x on weight.');
    }
  });

  test('**「唯一値段が付く社」を「最安」と書かない**', () => {
    // 3,000 g/点。×3 すると同梱する社が EMS 公表表（30kg）を出て脱落し、
    // 注文ごとに分ける Buyee default だけが残る。安いのではなく、値段が付く
    // 唯一の社というだけ。ここを取り違えると、費目が欠けた行を薦めることになる。
    const r = compare({ items: items(5, 3000), country: 'US' });
    expect(r.rankStable).toBe(false);
    expect(r.rankStabilityNote).toContain('is the only one we can still price');
    expect(r.rankStabilityNote).not.toContain('Buyee, default is cheapest');
  });

  test('200 g per item is stable, and the note names the winner and the 3x span', () => {
    for (const cc of COUNTRIES_ALL) {
      const r = compare({ items: items(5, 200), country: cc });
      expect(r.rankStable, cc).toBe(true);
      expect(r.rankStabilityNote, cc).toBe(
        'Neokyo stays cheapest even if we are off by 3x on weight.');
    }
  });

  test('stability is judged at x1/3 and x3 — no wider, or the parcel leaves the table', () => {
    // 1点 9,000g は表の中だが、3倍にすると梱包後 32.7kg で公表料金が消える。
    // 「順位が動いた」ではなく「判定できない」として扱い、そう書く。
    const r = compare({ items: items(1, 9000), country: 'US' });
    expect(r.rankStable).toBe(true);
    expect(r.rankStabilityNote).toBe(
      'FROM JAPAN stays cheapest even if we are off by 3x on weight.'
      + ' Beyond that the parcel leaves the published EMS table.');
  });

  test('the cheapest service flips at 1,150 g / 1,325 g / 1,625 g by basket size', () => {
    // 実測の交差点。ここが動いたら費目モデルが変わったということ。
    const winnerAt = (n: number, weightG: number) =>
      winnerOf(compare({ items: items(n, weightG), country: 'US' }).rows)!.id;
    const CROSSINGS: [number, number][] = [[2, 1150], [3, 1325], [5, 1625]];
    for (const [n, at] of CROSSINGS) {
      expect(winnerAt(n, at - 25), `n=${n} just below ${at}g`).toBe('neokyo');
      expect(winnerAt(n, at), `n=${n} at ${at}g`).toBe('fromjapan');
    }
  });

  test('a single item never crosses: FROM JAPAN wins at every weight the table covers', () => {
    for (const w of [100, 500, 1000, 1625, 3000, 8000, 24750]) {
      expect(winnerOf(compare({ items: items(1, w), country: 'US' }).rows)!.id, `${w}g`)
        .toBe('fromjapan');
    }
  });

  test('at 4,975 g per item the winner changes because everyone else leaves the table', () => {
    // 価格の逆転ではない。同梱行が 30kg を越え、比較可能な行が Buyee default だけになる。
    const below = compare({ items: items(5, 4950), country: 'US' }).rows;
    expect(winnerOf(below)!.id).toBe('fromjapan');
    const above = compare({ items: items(5, 4975), country: 'US' }).rows;
    expect(winnerOf(above)!.id).toBe('buyee:default');
    expect(above.filter((r) => r.comparable)).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 免税限度は intrinsic value（商品代のみ）で測る。CIF で測ると帯を誤判定する。
// ─────────────────────────────────────────────────────────────────────────────
describe('tax thresholds are judged on intrinsic value, not on CIF', () => {
  test('GBP 135 is measured on the item price alone — GBP 211.40/¥ → ¥28,539', () => {
    const dutyAt = (priceYen: number) =>
      compare({ items: items(1, 500, priceYen), country: 'GB' }).rows
        .map((r) => line(r, 'duty').amount);
    // 商品代 ¥28,539 = £135.0。送料込みなら £150 相当だが、判定には混ぜない。
    // **境界は為替そのもの。**転記前の ¥190/£ では ¥25,650 に置かれていた（約 ¥2,900 手前）。
    expect(dutyAt(28539)).toEqual([0, 0, 0, 0, 0]);
    expect(dutyAt(28540)).toEqual([null, null, null, null, null]);
  });

  test('SGD 400 likewise: GST stays 0 while CIF is over but the goods are not', () => {
    const rows = compare({ items: items(1, 600, 46000), country: 'SG' }).rows;
    // 商品代 SGD 373.0 < 400。CIF は社により 413〜466 で超えているが、限度は商品代で測る。
    for (const r of rows) expect(line(r, 'vat').amount, r.id).toBe(0);
    // 商品代自体が超えれば課税され、そのときの課税ベースは CIF。
    const over = compare({ items: items(1, 600, 50000), country: 'SG' }).rows;
    for (const r of over) expect(line(r, 'vat').amount, r.id).toBeGreaterThan(0);
  });

  test('**every service on the board makes the same threshold decision**', () => {
    // 社ごとに送料も手数料も違う。CIF で判定していたら、同じ商品なのに
    // 社によって課税されたりされなかったりして、順位が税の誤判定で歪む。
    for (const priceYen of [25000, 25650, 25700, 30000]) {
      const notes = compare({ items: items(1, 500, priceYen), country: 'GB' }).rows
        .map((r) => line(r, 'duty').note);
      expect(new Set(notes).size, `¥${priceYen}`).toBe(1);
    }
  });

  test('Germany charges its flat duty per item, counted from the item count', () => {
    const row = compare({ items: items(2, 600), country: 'DE' }).rows[0]!;
    const duty = line(row, 'duty');
    expect(duty.note).toBe('EUR 3 flat × 2 items');
    expect(duty.amount).toBe(Math.round(3 * 2 * 181.59));
  });

  test('a FOB country taxes the goods only: domestic shipping never enters US duty', () => {
    const paid = compare({ items: items(2, 600), country: 'US' }).rows[0]!;
    const free = compare({ items: items(2, 600, 3000, { freeShipping: true }), country: 'US' }).rows[0]!;
    expect(line(paid, 'duty').amount).toBe(750); // 12.5% × ¥6,000
    expect(line(free, 'duty').amount).toBe(750);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 国内送料。どの社も込みではないので、CIF 国では課税額に乗る。
// ─────────────────────────────────────────────────────────────────────────────
describe('domestic shipping is charged by every service, and taxed where the base is CIF', () => {
  test('no service folds domestic shipping into its fee — every row shows the line', () => {
    for (const row of compare({ items: items(2, 600), country: 'US' }).rows) {
      expect(line(row, 'domestic-shipping').amount, row.id).toBe(1600);
      expect(line(row, 'domestic-shipping').tier, row.id).toBe('estimate');
    }
  });

  test('**the domestic shipping a row actually pays raises its VAT** (GB, 20%)', () => {
    for (const n of [1, 2, 3]) {
      const paid = compare({ items: items(n, 600), country: 'GB' }).rows;
      const free = compare({ items: items(n, 600, 3000, { freeShipping: true }), country: 'GB' }).rows;
      for (const row of paid) {
        const delta = line(row, 'vat').amount! - line(byId(free, row.id), 'vat').amount!;
        expect(delta, `${row.id} n=${n}`).toBe(Math.round(0.2 * 800 * n));
      }
    }
  });

  test('free shipping zeroes the line without touching the service fee', () => {
    const rows = compare({ items: items(2, 600, 3000, { freeShipping: true }), country: 'US' }).rows;
    const fj = byId(rows, 'fromjapan');
    expect(line(fj, 'domestic-shipping').amount).toBe(0);
    expect(line(fj, 'domestic-shipping').tier).toBe('fixed');
    expect(line(fj, 'service-fee').amount).toBe(1000);
  });

  test('free shipping does not change the winner, but it can swap rows below it', () => {
    // 送料は全社に同額で乗るので1位は動かない。動くのは送金額に率で乗る社
    // （ZenMarket の 3.5%）だけで、そこは順位が入れ替わりうる。
    const paid = compare({ items: items(5, 200), country: 'US' }).rows;
    const free = compare({ items: items(5, 200, 3000, { freeShipping: true }), country: 'US' }).rows;
    expect(free[0]!.id).toBe(paid[0]!.id);
    expect(byId(paid, 'zenmarket').rank).toBe(4);
    expect(byId(free, 'zenmarket').rank).toBe(3);
  });

  test('a given domestic shipping cost is fixed, an assumed one is an estimate', () => {
    const assumed = byId(compare({ items: [item({ id: 'a' })], country: 'US' }).rows, 'zenmarket');
    expect(line(assumed, 'domestic-shipping').amount).toBe(800);
    expect(line(assumed, 'domestic-shipping').tier).toBe('estimate');
    const known = byId(
      compare({ items: [item({ id: 'a', domesticShippingYen: 250 })], country: 'US' }).rows, 'zenmarket');
    expect(line(known, 'domestic-shipping').amount).toBe(250);
    expect(line(known, 'domestic-shipping').tier).toBe('fixed');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Buyee だけが既定で注文ごとに別送する。同梱は申請しないと得られない。
// ─────────────────────────────────────────────────────────────────────────────
describe('Buyee splits parcels by order', () => {
  test('two rows once there is more than one order', () => {
    const rows = compare({ items: items(3, 600), country: 'US' }).rows;
    const consolidated = byId(rows, 'buyee:consolidated');
    const dflt = byId(rows, 'buyee:default');
    expect(consolidated.variant).toBe('consolidated');
    expect(dflt.variant).toBe('default');
    expect(consolidated.parcels).toBe(1);
    expect(dflt.parcels).toBe(3);
    expect(dflt.tag).toBe('3 orders · 3 parcels');
    expect(consolidated.tag).toContain('you must request this');
  });

  test('splitting costs more on EMS and on the clearance fee', () => {
    const rows = compare({ items: items(3, 600), country: 'US' }).rows;
    const consolidated = byId(rows, 'buyee:consolidated');
    const dflt = byId(rows, 'buyee:default');
    expect(line(consolidated, 'ems').amount).toBe(9100);
    expect(line(dflt, 'ems').amount).toBe(17970);
    // USD 9.35 × ¥156.25 × 3個口を最後に一度だけ丸める（¥1,461 の3倍ではない）。
    expect(line(consolidated, 'clearance').amount).toBe(1461);
    expect(line(dflt, 'clearance').amount).toBe(4383);
    expect(line(dflt, 'clearance').note).toContain('USD 9.35 × 3 parcels');
    expect(dflt.total).toBeGreaterThan(consolidated.total);
  });

  test('the purchase fee is per order, so splitting does not change it', () => {
    const rows = compare({ items: items(3, 600), country: 'US' }).rows;
    expect(line(byId(rows, 'buyee:consolidated'), 'purchase-fee').amount).toBe(1500);
    expect(line(byId(rows, 'buyee:default'), 'purchase-fee').amount).toBe(1500);
  });

  test('a single order gives one Buyee row and no variant', () => {
    const rows = compare({ items: items(1, 600), country: 'US' }).rows;
    expect(rows.filter((r) => r.serviceId === 'buyee')).toHaveLength(1);
    const only = byId(rows, 'buyee');
    expect(only.variant).toBeNull();
    expect(only.label).toBe('Buyee');
    expect(only.parcels).toBe(1);
  });

  test('the other four services stay at one parcel', () => {
    const rows = compare({ items: items(4, 600), country: 'US' }).rows;
    for (const id of ['neokyo', 'zenmarket', 'fromjapan', 'jauce']) {
      expect(byId(rows, id).parcels, id).toBe(1);
    }
    // 一次情報で確認できていない社にはその旨を出す。
    expect(byId(rows, 'zenmarket').tag).toContain('assumed');
    expect(byId(rows, 'neokyo').tag).not.toContain('assumed');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 重量不明。1つの数字を押し付けず、EMS の段ごとに出す。
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// 1点ずつ: どの品の重量を確かめれば1位が固まるか。
// 14ラインで P25–P75 が1位の交差点を跨ぐ（docs/DESIGN-NOTES.md §1）ので、
// 「重量が効く」だけでなく「**この品の**重量が効く」と名指しできなければならない。
// 数値は 2026-09-06 に compare() を走らせて得たもの。
// ─────────────────────────────────────────────────────────────────────────────
describe('one item at a time: whose weight decides the winner', () => {
  const table = (id: string, weightG: number, range: [number, number], over: Partial<Item> = {}) =>
    item({ id, weightG, weightOrigin: 'table', weightRangeG: range, ...over });
  const assumed = (id: string, over: Partial<Item> = {}) =>
    item({ id, weightG: 1000, weightOrigin: 'assumed', weightRangeG: null, ...over });
  const user = (id: string, weightG: number) =>
    item({ id, weightG, weightOrigin: 'user', weightRangeG: null });

  // 既定の2点: 1/7 フィギュア ¥12,800（全件 1,500 g）+ ねんどろいど ¥4,200（380–600 g）。
  const EXAMPLE = [
    table('i0', 1500, [1500, 1500], { priceYen: 12800 }),
    table('i1', 439, [380, 600], { priceYen: 4200, site: 'mercari' }),
  ];

  test('the example cart: FROM JAPAN wins, and the Nendoroid range does not move it', () => {
    const r = compare({ items: EXAMPLE, country: 'US' });
    expect(r.rankStable).toBe(true);
    expect(r.rows[0]!.id).toBe('fromjapan');
    // 幅の無いライン（P25=P75）は動かしても同じなので、見ない。
    expect(r.weightSensitivity['i0']).toBeUndefined();
    expect(r.weightSensitivity['i1']).toEqual({
      lowG: 380, highG: 600,
      winnerAtLow: 'FROM JAPAN', winnerAtHigh: 'FROM JAPAN',
      onlyPricedAtLow: false, onlyPricedAtHigh: false,
      decisive: false,
    });
  });

  test('add one item off the table and **two** weights start deciding: the assumed one and the Nendoroid', () => {
    const r = compare({ items: [...EXAMPLE, assumed('i2')], country: 'US' });
    expect(r.rows[0]!.id).toBe('neokyo');
    expect(r.rankStable).toBe(false);
    // 仮置きは 500 g〜10 kg で見る。軽ければ Neokyo、重ければ FROM JAPAN。
    expect(r.weightSensitivity['i2']).toEqual({
      lowG: 500, highG: 10000,
      winnerAtLow: 'Neokyo', winnerAtHigh: 'FROM JAPAN',
      onlyPricedAtLow: false, onlyPricedAtHigh: false,
      decisive: true,
    });
    // **ねんどろいどの真ん中50%（380–600 g）だけで1位が替わる。** 表の精度を上げても消えない。
    expect(r.weightSensitivity['i1']).toMatchObject({
      lowG: 380, highG: 600, winnerAtLow: 'Neokyo', winnerAtHigh: 'FROM JAPAN', decisive: true,
    });
  });

  test('a single item off the table: the weight does not matter, and we say so instead of nagging', () => {
    const r = compare({ items: [assumed('i2')], country: 'US' });
    expect(r.rankStable).toBe(true);
    expect(r.weightSensitivity['i2']).toMatchObject({
      lowG: 500, highG: 10000, winnerAtLow: 'FROM JAPAN', winnerAtHigh: 'FROM JAPAN', decisive: false,
    });
  });

  test('two K-Pop photobooks (800–1,600 g each): either one alone flips the winner', () => {
    const r = compare({
      items: [table('a', 1000, [800, 1600]), table('b', 1000, [800, 1600])], country: 'US',
    });
    for (const id of ['a', 'b']) {
      expect(r.weightSensitivity[id], id).toMatchObject({
        winnerAtLow: 'Neokyo', winnerAtHigh: 'FROM JAPAN', decisive: true,
      });
    }
  });

  test('kendo armour: no single item flips it within its quartiles, but the cart as a whole is unstable', () => {
    // 胴 1,500–7,500 g（spread 5.0）ですら、他の2点を固定すると1位は FROM JAPAN のまま。
    // 一方 ×1/3 では Neokyo に替わる。2つの判定は別の問いに答えている。
    const r = compare({
      items: [table('do', 2000, [1500, 7500]), table('hakama', 1500, [1500, 2500]), table('tare', 1500, [1500, 1500])],
      country: 'US',
    });
    expect(r.rows[0]!.id).toBe('fromjapan');
    expect(r.weightSensitivity['do']!.decisive).toBe(false);
    expect(r.weightSensitivity['hakama']!.decisive).toBe(false);
    expect(r.weightSensitivity['tare']).toBeUndefined();
    expect(r.rankStable).toBe(false);
    // 表から引いた重量を「あなたがくれた重量」とは呼ばない。
    expect(r.rankStabilityNote).toContain('at a third of our weight estimate, Neokyo is cheapest');
    expect(r.rankStabilityNote).not.toContain('you gave us');
  });

  test('a weight the user typed is theirs: we do not second-guess it', () => {
    const r = compare({ items: [user('a', 200), user('b', 200)], country: 'US' });
    expect(r.weightSensitivity).toEqual({});
  });

  test('when the heavy end leaves the EMS table, the survivor is named as the only one priced, not as cheapest', () => {
    // 和弓 7 kg × 3 + 仮置き1点。仮置きを 10 kg にすると同梱行が 30 kg を超え、
    // 注文ごとに分ける Buyee default だけが値段を持つ。
    const r = compare({
      items: [
        table('y0', 7000, [7000, 7000], { priceYen: 30000 }),
        table('y1', 7000, [7000, 7000], { priceYen: 30000 }),
        table('y2', 7000, [7000, 7000], { priceYen: 30000 }),
        assumed('p'),
      ],
      country: 'US',
    });
    expect(r.weightSensitivity['p']).toEqual({
      lowG: 500, highG: 10000,
      winnerAtLow: 'FROM JAPAN', winnerAtHigh: 'Buyee, default',
      onlyPricedAtLow: false, onlyPricedAtHigh: true,
      decisive: true,
    });
  });

  test('with an unknown weight in the cart there is no base weight to move, so the map is empty', () => {
    const r = compare({ items: [item({ id: 'a', weightG: null, weightTier: 'none' })], country: 'US' });
    expect(r.bands).not.toBeNull();
    expect(r.weightSensitivity).toEqual({});
  });

  test('the sensitivity map never contradicts a direct run at that weight', () => {
    for (const cc of COUNTRIES_ALL) {
      const items = [...EXAMPLE, assumed('i2')];
      const r = compare({ items, country: cc });
      for (const [id, s] of Object.entries(r.weightSensitivity)) {
        for (const [g, expected] of [[s.lowG, s.winnerAtLow], [s.highG, s.winnerAtHigh]] as const) {
          const moved = items.map((i) => (i.id === id ? { ...i, weightG: g } : i));
          const direct = winnerOf(compare({ items: moved, country: cc }).rows);
          expect(direct?.label ?? null, `${cc} ${id} at ${g} g`).toBe(expected);
        }
      }
    }
  });
});

describe('unknown weight falls back to EMS steps', () => {
  const unknown = (n: number) => compare({
    items: Array.from({ length: n }, (_, i) => item({ id: `u${i}`, weightG: null, weightTier: 'none' })),
    country: 'US',
  });

  test('six bands, taken from the EMS table itself', () => {
    const r = unknown(2);
    expect(r.hasUnknownWeight).toBe(true);
    expect(r.bands).toHaveLength(6);
    expect(r.bands!.map((b) => b.stepG)).toEqual([...UNKNOWN_WEIGHT_STEPS_G]);
    expect(r.bands!.map((b) => b.label)).toEqual(['500 g', '1 kg', '2 kg', '3 kg', '5 kg', '10 kg']);
  });

  test('**two unknown items already change winner between bands**', () => {
    const r = unknown(2);
    expect(r.bands!.map((b) => b.cheapestRowIds))
      .toEqual([['neokyo'], ['neokyo'], ['fromjapan'], ['fromjapan'], ['fromjapan'], ['fromjapan']]);
    expect(r.rankStable).toBe(false);
    expect(r.rankStabilityNote).toContain('changes with weight');
    expect(r.rankStabilityNote).toContain('500 g: Neokyo');
    expect(r.rankStabilityNote).toContain('10 kg: FROM JAPAN');
  });

  test('one unknown item keeps the same winner in every band', () => {
    const r = unknown(1);
    expect(r.bands!.every((b) => b.cheapestRowIds.join() === 'fromjapan')).toBe(true);
    expect(r.rankStable).toBe(true);
    expect(r.rankStabilityNote).toBe(
      'Cheapest at every step from 500 g to 10 kg: FROM JAPAN.');
  });

  test('each band is itself a ranked board and totals grow with the step', () => {
    const r = unknown(2);
    for (const band of r.bands!) {
      // 2注文なので Buyee が consolidated / default に割れて 6 行。
      expect(band.rows).toHaveLength(6);
      expect(band.rows.map((x) => x.rank)).toEqual([1, 2, 3, 4, 5, 6]);
      // この入力では同額が無いので最安は1つ。集合で持っていることまで固定する。
      expect(band.cheapestRowIds).toEqual([band.rows[0]!.id]);
      expect(band.cheapestServiceNames).toEqual([band.rows[0]!.label]);
    }
    const cheapestPerBand = r.bands!.map((b) => b.rows[0]!.total);
    expect(cheapestPerBand).toEqual([...cheapestPerBand].sort((a, b) => a - b));
  });

  test('ranges cover every band, and the mid band is the representative board', () => {
    const r = unknown(2);
    for (const id of Object.keys(r.rowTotalRange!)) {
      const totals = r.bands!.flatMap((b) => b.rows.filter((x) => x.id === id).map((x) => x.total));
      expect(r.rowTotalRange![id]).toEqual([Math.min(...totals), Math.max(...totals)]);
      const diffs = r.bands!.flatMap((b) => b.rows.filter((x) => x.id === id).map((x) => x.diff));
      expect(r.rowDiffRange![id]).toEqual([Math.min(...diffs), Math.max(...diffs)]);
    }
    const all = r.bands!.flatMap((b) => b.rows.map((x) => x.total));
    expect(r.totalRangeYen).toEqual([Math.min(...all), Math.max(...all)]);
    expect(r.rows).toEqual(r.bands![3]!.rows);
  });

  test('one unknown item among known ones still drops the whole board to bands', () => {
    const r = compare({
      items: [item({ id: 'a', weightG: 600 }), item({ id: 'b', weightG: null, weightTier: 'none' })],
      country: 'US',
    });
    expect(r.hasUnknownWeight).toBe(true);
    expect(r.bands).not.toBeNull();
    expect(r.rows.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 実測の回帰（docs/audit/measured-2026-09-06.md）。ここが動いたら費目モデルが変わった。
//
// **注意: 為替の転記（T13b）でこの表は audit ログと ¥58〜1,100 ずれている。**
// audit ログは ¥150/USD・¥163/EUR・¥190/GBP という転記前の値で走らせた記録で、
// 記録なので直さない。差の中身は米国の通関手数料（USD 9.35 → ¥1,403 が ¥1,461）と
// EU の定額関税（EUR 3 → ¥489 が ¥545）で、費目モデルは動いていない。
// **7か国どれも順位は変わらなかった**（変わるのは免税限度の境界のほう。上の
// 「GBP 135 …」を見よ）。
// ─────────────────────────────────────────────────────────────────────────────
describe('measured totals — 2026-09-06 basket, at the ECB rates of 2026-09-04', () => {
  test('5 items x ¥3,000, 200 g each, to the US', () => {
    const rows = compare({ items: items(5, 200), country: 'US' }).rows;
    expect(rows.map((r) => [r.id, r.total])).toEqual([
      ['neokyo', 31186],
      ['fromjapan', 32436],
      ['buyee:consolidated', 33936],
      ['zenmarket', 34010],
      ['jauce', 35469],
      ['buyee:default', 54080],
    ]);
  });

  test('the same basket at 600 g, 1,500 g and 3,000 g — the top two swap on the way', () => {
    const board = (w: number) =>
      compare({ items: items(5, w), country: 'US' }).rows.map((r) => [r.id, r.total]);
    expect(board(600).slice(0, 2)).toEqual([['neokyo', 37586], ['fromjapan', 38536]]);
    // ¥50 差。1位の根拠がこの幅しかない、ということ自体が結果の一部。
    // 為替を直しても両者に同じ通関手数料が乗るだけなので、この ¥50 は動かなかった。
    expect(board(1500).slice(0, 2)).toEqual([['neokyo', 52886], ['fromjapan', 52936]]);
    expect(board(3000).slice(0, 2)).toEqual([['fromjapan', 74536], ['neokyo', 75836]]);
    expect(board(600)[5]).toEqual(['buyee:default', 63130]);
  });

  test('one ¥5,000 Yahoo! Auctions item, 500 g, to the US', () => {
    const rows = compare({ items: items(1, 500, 5000), country: 'US' }).rows;
    expect(rows.map((r) => [r.serviceName, r.total])).toEqual([
      ['FROM JAPAN', 13606],
      ['Neokyo', 13756],
      ['Buyee', 13906],
      ['ZenMarket', 14127],
      ['Jauce', 14968],
    ]);
  });

  test('the same item on Rakuten reshuffles the middle — per-site fees are real', () => {
    // Jauce は楽天のサービス料がベータで無料、ZenMarket は楽天が ¥500（ヤフオクは ¥800）、
    // FROM JAPAN はヤフオク限定の ¥200 が消える。
    const rows = compare({ items: items(1, 500, 5000, { site: 'rakuten' }), country: 'US' }).rows;
    expect(rows.map((r) => [r.serviceName, r.total])).toEqual([
      ['FROM JAPAN', 13406],
      ['Neokyo', 13756],
      ['ZenMarket', 13817],
      ['Buyee', 13906],
      ['Jauce', 14136],
    ]);
    expect(line(byId(rows, 'jauce'), 'service-fee').amount).toBe(0);
    expect(line(byId(rows, 'jauce'), 'ad-valorem').amount).toBe(0);
  });

  test('5 items x 600 g in all seven countries', () => {
    const totals = Object.fromEntries(COUNTRIES_ALL.map((cc) => [
      cc, compare({ items: items(5, 600), country: cc }).rows.map((r) => r.total),
    ]));
    // **CA は T23 で動いた**（州税の代表値 7.3% と Canada Post の C$9.95 が入った）。
    // 以前ここは「CA がびた一文動いていない」と書いてあり、それは州税も手数料も
    // `—` だったからで、動かないことは正しさの証拠ではなく欠落の証拠だった。
    // **AU と SG は T15（代行の前徴収 GST）で動いた。** 費目モデルが変わったので
    // ここが動くのは正しい。AU は5社とも徴収を明記しているので全行に税が乗り、
    // 課税ベースの違い（内容品価格のみ／総額）で並びまで変わった。
    // SG は徴収を確認できた Buyee・FROM JAPAN にだけ税が乗り、他3社は「—」なので
    // **その3社の総額は税のぶん低いまま**（excluded にそう書いてある）。
    // **DE は Auslagepauschale €7.50 が入って全行 +¥1,362 動いた**（Buyee の別送だけ
    // 5個口ぶんで +¥6,810）。以前 DE が安く見えていたのは手数料が安いからではなく、
    // **我々がドイツの手数料を1円も入れていなかったから。**
    expect(totals).toEqual({
      US: [37586, 38536, 40036, 40331, 42066, 63130],
      GB: [40121, 41071, 42571, 42801, 44528, 66256],
      DE: [42735, 43685, 45185, 45415, 47142, 67412],
      FR: [41699, 42649, 44149, 44379, 46106, 61069],
      AU: [33950, 36630, 36740, 36900, 40543, 51000],
      CA: [36762, 37712, 39212, 39442, 41169, 59552],
      SG: [28500, 31036, 32101, 32747, 33736, 45235],
    });
  });
});

describe('edges', () => {
  test('no items → an empty board, not a crash', () => {
    const r = compare({ items: [], country: 'US' });
    expect(r.rows).toEqual([]);
    expect(r.bands).toBeNull();
    expect(r.totalRangeYen).toBeNull();
    expect(r.hasUnknownWeight).toBe(false);
    expect(r.currency.code).toBe('USD');
  });

  test('quantity multiplies price and weight, but a repeat buy is still one order', () => {
    const rows = compare({ items: [item({ id: 'a', weightG: 200, qty: 3 })], country: 'US' }).rows;
    expect(line(byId(rows, 'neokyo'), 'items').amount).toBe(9000);
    expect(byId(rows, 'neokyo').tag).toBe('3 items · 1 parcel');
    // 同一商品を3個でも手数料は1回だと明記している社。
    expect(line(byId(rows, 'neokyo'), 'service-fee').note).toContain('same item counted once');
    expect(line(byId(rows, 'neokyo'), 'service-fee').amount).toBe(350);
    // Buyee は注文ごとなので購入手数料も1回。
    expect(line(byId(rows, 'buyee'), 'purchase-fee').amount).toBe(500);
    // Jauce は点ごとに課金する（¥400 × 3）。
    expect(line(byId(rows, 'jauce'), 'service-fee').amount).toBe(1200);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // `~`（approximate）が情報を持つこと。EMS 行の tier を丸ごと 'estimate' に固定して
  // いたころは全行・全国・全重量で常に true で、画面の `~` は何も言っていなかった
  // （docs/audit/logic.md C4 / COMPLETENESS T16）。
  // ───────────────────────────────────────────────────────────────────────────
  describe('the ~ on a total means something', () => {
    /** 価格・重量・国内送料がすべて確定した入力。**これが作れることが T16 の完了条件。** */
    const certain = (over: Partial<Item> = {}): Item => item({
      id: 'a', priceYen: 5000, priceTier: 'fixed',
      weightG: 600, weightTier: 'fixed', weightOrigin: 'user',
      domesticShippingYen: 700, ...over,
    });

    test('a total built only from published numbers is not approximate', () => {
      // Neokyo は自社ページで「国際送料に上乗せしない」と書いている唯一の社なので、
      // EMS 行が公表料金として立つ。
      const row = byId(compare({ items: [certain()], country: 'GB' }).rows, 'neokyo');
      expect(row.lines.filter((l) => l.tier === 'estimate')).toEqual([]);
      expect(line(row, 'ems').tier).toBe('fixed');
      expect(line(row, 'ems').note).toContain('published rate');
      expect(row.approximate).toBe(false);
    });

    test('an estimated weight brings the ~ back, even though the EMS rate stays published', () => {
      // 重量は費目ではないので行の tier には出ない。ここを数えていないと、推定の重量で
      // 引いた総額が確定値の顔をする。
      const row = byId(compare({
        items: [certain({ weightTier: 'estimate' })], country: 'GB',
      }).rows, 'neokyo');
      expect(line(row, 'ems').tier).toBe('fixed');
      expect(row.approximate).toBe(true);
    });

    test('an assumed domestic postage brings it back too', () => {
      const row = byId(compare({
        items: [certain({ domesticShippingYen: null })], country: 'GB',
      }).rows, 'neokyo');
      expect(line(row, 'domestic-shipping').tier).toBe('estimate');
      expect(row.approximate).toBe(true);
    });

    test('a company that does not publish its markup keeps the ~ on the same input', () => {
      // FROM JAPAN は会員ランクで国際送料が %OFF になると書いているが率が読めない。
      // ZenMarket は実請求1件が公表額と一致し1件が一致しない。どちらも我々の仮定。
      for (const id of ['fromjapan', 'zenmarket']) {
        const row = byId(compare({ items: [certain()], country: 'GB' }).rows, id);
        expect(line(row, 'ems').tier, id).toBe('estimate');
        expect(row.approximate, id).toBe(true);
      }
      // Buyee は社の記述が無く、実請求（二次情報）が一致しただけ。点線で描く。
      const buyee = byId(compare({ items: [certain()], country: 'GB' }).rows, 'buyee');
      expect(line(buyee, 'ems').tier).toBe('unverified');
      expect(buyee.approximate).toBe(false);
    });

    test('the EMS note always says the weight went through our packing allowance', () => {
      for (const row of compare({ items: [certain()], country: 'US' }).rows) {
        expect(line(row, 'ems').note, row.id).toContain('after our packing allowance');
      }
    });

    test('over the top EMS step there is no rate at all, so the line is neither published nor an estimate', () => {
      const row = byId(compare({ items: [certain({ weightG: 30000 })], country: 'US' }).rows, 'neokyo');
      expect(line(row, 'ems').amount).toBeNull();
      expect(line(row, 'ems').tier).toBe('none');
      expect(row.comparable).toBe(false);
    });
  });

  test('an estimated price marks the row approximate', () => {
    const exact = compare({ items: [item({ id: 'a', priceTier: 'fixed', freeShipping: true })], country: 'SG' }).rows;
    const guess = compare({ items: [item({ id: 'a', priceTier: 'estimate', freeShipping: true })], country: 'SG' }).rows;
    expect(line(byId(exact, 'neokyo'), 'items').tier).toBe('fixed');
    expect(line(byId(guess, 'neokyo'), 'items').tier).toBe('estimate');
    expect(byId(guess, 'neokyo').approximate).toBe(true);
  });

  test('every row carries an outbound url and a stable id', () => {
    const rows = compare({ items: items(2, 600), country: 'US' }).rows;
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    for (const r of rows) expect(r.outboundUrl).toMatch(/^https:\/\//);
  });
});
