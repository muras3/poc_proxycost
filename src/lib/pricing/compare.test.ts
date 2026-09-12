import { describe, expect, test } from 'vitest';
import { compare } from './compare';
import { SERVICES } from './services';
import { CA_PROVINCES, CA_PROVINCE_AVERAGE_RATE, PROVINCE_CODES } from './countries';
import { EMS_MAX_GRAMS, UNKNOWN_WEIGHT_STEPS_G } from './ems';
import { rateFor } from './rates';
import { weightFieldsFor } from './weights';
import type { CompareInput, CountryCode, Item, ProvinceCode, Row } from './types';

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
          for (const row of compare({ method: 'ems', items: items(n, w), country: cc }).rows) {
            expect(row.total.low, `${cc} n=${n} w=${w} ${row.id}`).toBe(sumLines(row));
          }
        }
      }
    }
  });

  test('an unfetched line is null — never 0 — and never enters the total', () => {
    // US には連邦の売上税が無い。0 と書けば「税は0円」という嘘になる。
    const row = compare({ method: 'ems', items: items(1, 600), country: 'US' }).rows[0]!;
    const vat = line(row, 'vat');
    expect(vat.amount).toBeNull();
    expect(vat.tier).toBe('none');
    expect(vat.label).toBe('Sales tax / VAT');
    expect(row.total.low).toBe(sumLines(row));
  });

  test('excluded names exactly the null lines, so the shortfall is visible', () => {
    for (const cc of COUNTRIES_ALL) {
      for (const row of compare({ method: 'ems', items: items(3, 600), country: cc }).rows) {
        expect(row.excluded, `${cc} ${row.id}`)
          .toEqual(row.lines.filter((l) => l.amount == null).map((l) => l.label));
      }
    }
  });

  test('Canada has no unknowns left: all three lines carry a number', () => {
    // 以前は Duty・Provincial tax・Customs clearance fee の3つとも `—` だった。
    // 州税と Canada Post の手数料は確実に発生するので `—` は誤り（T23）。
    // **Duty も 2026-09-07 に埋めた。**品目分類は持っていないので、WTO のカナダ
    // プロファイルの非農産品 MFN 単純平均 2.0% を推定として出す。
    // **反証**: 同プロファイルでカナダは非農産品の税表の行の 79.2% が無税。
    // 最頻値は 0% で、2.0% は分布の平均でしかない。だから tier は estimate。
    const row = compare({ method: 'ems', items: items(1, 600), country: 'CA' }).rows[0]!;
    const duty = line(row, 'duty');
    expect(duty.amount).toBeGreaterThan(0);
    expect(duty.tier).toBe('estimate');
    expect(duty.note).toContain('2.0%');
    expect(line(row, 'province-tax').amount).toBeGreaterThan(0);
    expect(line(row, 'clearance').amount).toBeGreaterThan(0);
    // 0e: `display: total` の2件（外注梱包・Premium insurance）は額を公表していない社に
    // 常時 excluded として現れる。それ以外は excluded に残らないことを見る
    // （duty・province-tax・clearance の3つが埋まった、というこのテストの主張は変わらない）。
    expect(row.excluded.filter((e) => e !== 'Outsourced packing' && e !== 'Premium insurance'))
      .toEqual([]);
  });

  test('a fetched zero stays a zero: under-threshold duty is 0 with its reason', () => {
    const duty = line(compare({ method: 'ems', items: items(1, 600), country: 'GB' }).rows[0]!, 'duty');
    expect(duty.amount).toBe(0);
    expect(duty.tier).toBe('fixed');
    expect(duty.note).toContain('threshold');
  });

  test('no country is left with a null customs clearance fee', () => {
    // **7カ国すべてに額が入った**（`docs/TODO-NEXT.md` 課題1）。
    //   US   USPS $9.35 / GB Royal Mail £8 / CA Canada Post C$9.95（T23）
    //   AU   ABF の Import Processing Charge（T24）
    //   DE   Deutsche Post の Auslagepauschale €7.50
    //   FR   La Poste の frais de gestion €8
    //   SG   SingPost の handling fee S$10.90（S$400 以下は 0）
    //
    // **`—` を使ってよいのは発生しないものだけ。**通関手数料はどの国でも発生するので、
    // `—` は「手数料が無い」ではなく「我々が調べていない」であり、
    // 調べていない国だけが安く見えるという嘘になっていた。
    // **この test は、その嘘に戻らないための歯止め。**
    for (const cc of COUNTRIES_ALL) {
      const clearance = line(compare({ method: 'ems', items: items(1, 600), country: cc }).rows[0]!, 'clearance');
      expect(clearance.amount, cc).not.toBeNull();
      expect(clearance.tier, cc).not.toBe('none');
      // 額が在るなら出典と確認日も在る。無ければ「いつの値か」を言えない。
      expect(clearance.sourceUrl, cc).toBeTruthy();
    }
  });

  test('the Singapore handling fee is zero at or below SGD 400 — a fetched zero, not a missing number', () => {
    // 税関自身は通関手数料を取らない。取るのは SingPost で、名目は「税関に代わって
    // GST を徴収する手数料」。**S$400 以下は OVR で決済時に GST が済んでいるので
    // 徴収するものが無く、手数料も発生しない。**この 0 は取得できた 0。
    const low = line(compare({ method: 'ems', items: items(1, 600), country: 'SG' }).rows[0]!, 'clearance');
    expect(low.amount).toBe(0);
    expect(low.note).toContain('OVR');
    // 閾値を越えれば S$10.90 が乗る（¥400,000 の1点なら CIF は S$400 を確実に超える）。
    const high = compare({ method: 'ems',
      items: [{ ...items(1, 600)[0]!, priceYen: 400_000 }], country: 'SG',
    }).rows[0]!;
    const fee = line(high, 'clearance');
    expect(fee.amount).not.toBe(0);
    expect(fee.note).toContain('SGD 10.9');
  });

  test('the German Auslagepauschale is EUR 7.50 per consignment — the 2026-03-10 amount, not the 2018 one', () => {
    // €6 は 2018-03-01 の導入時の額で、**2026-03-10 に €7.50 へ上がっている。**
    // 「一次情報だから正しい」ではなく「いつの一次情報か」を見ないと、7年前の値を今日の値として出す。
    // **手数料が立つ行を選ぶ。**ZenMarket は IOSS で決済時に VAT を払うので国境で
    // 徴収するものが無く、この社だけ 0 になる（別テストで見ている）。
    const rows = compare({ method: 'ems', items: items(1, 600), country: 'DE' }).rows;
    const fee = line(byId(rows, 'neokyo'), 'clearance');
    expect(fee.amount).not.toBeNull();
    expect(fee.note).toContain('EUR 7.5 × 1 parcel');
    // 原典（Deutsche Post「Leistungen und Preise」）には当たれていない。二次情報として出す。
    expect(fee.tier).toBe('unverified');
  });

  test('the Canada Post handling fee is a published number, per parcel, and zero below CAD 20', () => {
    const row = compare({ method: 'ems', items: items(1, 600), country: 'CA' }).rows[0]!;
    const fee = line(row, 'clearance');
    expect(fee.tier).toBe('fixed');
    expect(fee.note).toContain('CAD 9.95 × 1 parcel');
    expect(fee.sourceUrl).toContain('canadapost-postescanada.ca');
    // 個口が割れる行では個口ぶん。原文が「per dutiable or taxable mail item」。
    const split = byId(compare({ method: 'ems', items: items(3, 600), country: 'CA' }).rows, 'buyee:default');
    expect(split.parcels).toBe(3);
    expect(line(split, 'clearance').note).toContain('CAD 9.95 × 3 parcels');
    // 丸めは合計に1回だけ掛ける（個口ごとに丸めて足すと ¥1 ずれる）。
    expect(line(split, 'clearance').amount).toBe(Math.round(9.95 * rateFor('CAD') * 3));
    expect(fee.amount).toBe(Math.round(9.95 * rateFor('CAD')));
    // C$20 以下は課税自体が無いので手数料も 0。**未取得の 0 ではないので tier は fixed。**
    const tiny = line(compare({ method: 'ems', items: items(1, 200, 1500), country: 'CA' }).rows[0]!, 'clearance');
    expect(tiny.amount).toBe(0);
    expect(tiny.tier).toBe('fixed');
    expect(tiny.note).toContain('nothing is charged for collecting it');
  });

  test('a display:total fee we cannot price is still a line, not a dropped feature', () => {
    // 0e: 「任意欄」はマスタに存在しない（`optionalLines` は撤去した）。額を公表していない
    // 費目（FROM JAPAN の外注梱包・Jauce の Premium insurance）も総額の行として現れ、
    // amount: null（画面「—」）で excluded に名前が載る。行ごと消えたら「そんな費目は
    // 無い」という嘘になる。
    const fj = byId(compare({ method: 'ems', items: items(1, 600), country: 'US' }).rows, 'fromjapan');
    const outsourced = fj.lines.find((l) => l.key === 'outsourced-packing');
    expect(outsourced).toBeDefined();
    expect(outsourced!.amount).toBeNull();
    expect(fj.excluded).toContain(outsourced!.label);
    expect(fj.total.low).toBe(sumLines(fj));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 順位は総額のみ。報酬（paysUs）は並びに一切効かない。
// ─────────────────────────────────────────────────────────────────────────────
describe('ranking uses the total and nothing else', () => {
  test('the order equals a plain sort by total, wherever every row is comparable', () => {
    for (const cc of COUNTRIES_ALL) {
      for (const n of [1, 2, 3, 5]) {
        // **比較不能な行は順位の対象外**なので、順位の不変条件もその外で確かめる。
        // 米国では Neokyo・FROM JAPAN・Buyee の3社が日本郵便（EMS含む）を売っていない
        // （2026-09-12、`master/courier-rates.json` の `conclusions.courier_lineup_diffs`
        // を配線。以前は FROM JAPAN・Buyee に `unavailableIn` が無く、実際には
        // 売っていない米国向けEMSに値段が付いていた）ので3行落ちる。
        const all = compare({ method: 'ems', items: items(n, 600), country: cc }).rows;
        const rows = all.filter((r) => r.comparable);
        // **落ちる行は米国の Neokyo・FROM JAPAN・Buyee**で、他は6カ国とも全行が比較可能。
        // n=1 では Buyee は1行（既定行と同梱行が同じ姿になる）なので3行、
        // n>1 では Buyee が default/consolidated の2行に分かれるので4行落ちる。
        expect(all.length - rows.length, `${cc} n=${n}`).toBe(cc !== 'US' ? 0 : n === 1 ? 3 : 4);
        // **総額だけが並べ替えの鍵。** 第2の鍵（社名の辞書順など）は無い。
        const bySort = [...rows].sort((a, b) => a.total.low - b.total.low);
        expect(rows.map((r) => r.id), `${cc} n=${n}`).toEqual(bySort.map((r) => r.id));
        // 順位は「自分より厳密に安い行の数 + 1」。同額が無い入力ではこれが 1..n になる。
        expect(rows.map((r) => r.rank), `${cc} n=${n}`)
          .toEqual(rows.map((r) => rows.filter((o) => o.total.low < r.total.low).length + 1));
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
          const rows = compare({ method: 'ems', items: items(1, w, 4200, { site }), country: cc }).rows
            .filter((r) => r.comparable);
          for (const a of rows) {
            for (const b of rows) {
              if (a.id === b.id || a.total.low !== b.total.low) continue;
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
    // **国が米国からドイツに変わったのは、この不変条件が米国で実証できなくなったから。**
    // Neokyo は米国宛に日本郵便を売っていないので米国の盤面から落ち、残る報酬ゼロの社
    // （Jauce）はそこで最安にならない。ドイツは 6 社そろう帯。
    const rows = compare({ method: 'ems', items: items(5, 200), country: 'DE' }).rows;
    expect(rows[0]!.serviceId).toBe('neokyo');
    expect(rows[0]!.paysUs).toBe(false);
    expect(rows[0]!.cheapest).toBe(true);
    expect(rows.filter((r) => r.paysUs).every((r) => r.rank > 1)).toBe(true);
  });

  test('paysUs never reorders a board: dropping it from the sort key changes nothing', () => {
    for (const w of [200, 600, 1500, 3000]) {
      // 比較不能な行（米国の Neokyo）は総額が最大の費目を欠いているので、昇順の
      // 検査に混ぜられない。順位が付いている行だけが並びの対象。
      const rows = compare({ method: 'ems', items: items(5, w), country: 'US' }).rows
        .filter((r) => r.comparable);
      const paying = rows.filter((r) => r.paysUs).map((r) => r.total.low);
      const free = rows.filter((r) => !r.paysUs).map((r) => r.total.low);
      // 報酬を払う行だけを集めても総額の昇順のまま＝並びが報酬で歪んでいない。
      expect(paying, `w=${w}`).toEqual([...paying].sort((a, b) => a - b));
      expect(free, `w=${w}`).toEqual([...free].sort((a, b) => a - b));
      expect(rows.map((r) => r.total.low)).toEqual([...rows.map((r) => r.total.low)].sort((a, b) => a - b));
    }
  });

  test('diff is the gap to the cheapest, and exactly one row is cheapest', () => {
    // diff は比較可能な行にしか無い（比較不能な行は diff=0・cheapest=false 固定）。
    const rows = compare({ method: 'ems', items: items(5, 600), country: 'US' }).rows
      .filter((r) => r.comparable);
    const low = rows[0]!.total.low;
    for (const row of rows) expect(row.diff).toBe(row.total.low - low);
    expect(rows[0]!.diff).toBe(0);
    expect(rows.filter((r) => r.cheapest)).toHaveLength(1);
  });

  test('each country reports its own currency at the fixed rate', () => {
    const seen = COUNTRIES_ALL.map((cc) => compare({ method: 'ems', items: items(1, 600), country: cc }).currency.code);
    expect(seen).toEqual(['USD', 'GBP', 'EUR', 'EUR', 'AUD', 'CAD', 'SGD']);
    expect(compare({ method: 'ems', items: items(1, 600), country: 'US' }).currency.rate).toBe(156.25);
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
    const fee = line(compare({ method: 'ems', items: items(1, 600), country: 'AU' }).rows[0]!, 'clearance');
    expect(fee.amount).toBe(0);
    expect(fee.tier).toBe('fixed');
    expect(fee.note).toContain('no import declaration is required');
    expect(fee.sourceUrl).toContain('abf.gov.au');
  });

  test('above AUD 1,000 it is a number, and it steps again above AUD 10,000', () => {
    // ¥150,000 ≒ A$1,515、¥1,500,000 ≒ A$15,151（rates.ts の転記値）。
    const mid = line(compare({ method: 'ems', items: items(1, 600, 150000), country: 'AU' }).rows[0]!, 'clearance');
    const high = line(compare({ method: 'ems', items: items(1, 600, 1500000), country: 'AU' }).rows[0]!, 'clearance');
    expect(mid.amount).toBeGreaterThan(0);
    expect(mid.note).toContain('AUD 98');
    expect(mid.note).toContain('biosecurity');
    expect(high.amount!).toBeGreaterThan(mid.amount!);
    expect(high.note).toContain('AUD 200');
  });

  test('the band is chosen per parcel, because the charge is per declaration', () => {
    // 3点を3個口に割る Buyee default では、1個口あたりの価格で帯が決まる。
    // 籠の合計で決めると、安い小包にまで A$98 を積むことになる。
    const rows = compare({ method: 'ems', items: items(3, 600, 150000), country: 'AU' }).rows;
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
    const row = compare({ method: 'ems', items: [sake()], country: 'GB' }).rows[0]!;
    const excise = line(row, 'excise');
    expect(excise.amount).toBeNull();
    expect(excise.tier).toBe('none');
    expect(excise.note).toContain('at any value');
    expect(excise.note).toContain('litre of pure alcohol');
    // 総額から抜けている費目の一覧に名前が載る。載らなければ黙って安く見せたことになる。
    expect(row.excluded).toContain(excise.label);
  });

  test('no bottle, no line — and no other destination gets one', () => {
    expect(compare({ method: 'ems', items: items(1, 600), country: 'GB' }).rows[0]!.lines
      .some((l) => l.key === 'excise')).toBe(false);
    for (const cc of COUNTRIES_ALL.filter((c) => c !== 'GB')) {
      expect(compare({ method: 'ems', items: [sake()], country: cc }).rows[0]!.lines
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
    compare({ method: 'ems', items: items(n, 600), country: 'CA', province }).rows[0]!;

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
    expect(ca('QC').total.low).toBeGreaterThan(ca('ON').total.low);
    expect(ca('ON').total.low).toBeGreaterThan(ca('AB').total.low);
    // 代表値はその間のどこか。
    expect(ca(null).total.low).toBeGreaterThan(ca('AB').total.low);
    expect(ca(null).total.low).toBeLessThan(ca('QC').total.low);
  });

  test('below CAD 20 nothing is charged — and that zero keeps its reason', () => {
    const row = compare({ method: 'ems', items: items(1, 200, 1500), country: 'CA', province: 'QC' }).rows[0]!;
    for (const key of ['duty', 'vat', 'province-tax', 'clearance']) {
      const l = line(row, key);
      expect(l.amount, key).toBe(0);
      expect(l.tier, key).toBe('fixed');
      expect(l.note, key).toMatch(/CAD 20|threshold/);
    }
    // 0e: `display: total` の2件（外注梱包・Premium insurance）は額を公表していない社に
    // 常時 excluded として現れる。それ以外は残らないことを見る。
    expect(row.excluded.filter((e) => e !== 'Outsourced packing' && e !== 'Premium insurance'))
      .toEqual([]);
  });

  test('the province is ignored outside Canada, and an unknown one is rejected', () => {
    for (const cc of ['US', 'GB', 'DE', 'FR', 'AU', 'SG'] as const) {
      const withProvince = compare({ method: 'ems', items: items(1, 600), country: cc, province: 'ON' }).rows;
      const without = compare({ method: 'ems', items: items(1, 600), country: cc }).rows;
      expect(withProvince.map((r) => r.total.low), cc).toEqual(without.map((r) => r.total.low));
      // 州税の行はカナダにしか出ない。
      expect(without[0]!.lines.some((l) => l.key === 'province-tax'), cc).toBe(false);
    }
    // 知らないコードを黙って「未選択」に落とすと、代表値を「あなたの州の率」として
    // 出すことになる。呼び出し側の不具合なので投げる。
    expect(() => compare({ method: 'ems',
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
  /**
   * 1点 1,450 g・DE。Buyee と Neokyo がちょうど同額（**3位タイ**）になる実在の入力。
   *
   * **以前は同じ形を US で取っていた。**移したのは Neokyo が米国宛に日本郵便を
   * 売っていないと確認できたから（自社の計算機が全3方式に
   * "Not available or suspended in your country." を返す）。米国では Neokyo が
   * 盤面から落ちるので、この同額は米国では起きない。ドイツでは同じ 1,450 g で
   * 同じ2社が同額になる。
   *
   * **`storageDays: 30` を明示する。**0d で保管が総額に入り、既定45日では
   * 無料期間30日の Buyee だけに課金が乗るので、既定のままだとこの同額が崩れる。
   * ここで検査しているのは同額・同順位の仕組みであって保管日数の効きではないので、
   * 両社とも無料期間の内側（Buyee ¥0・Neokyo ¥0）になる日数に固定する。
   */
  const midTie = () => compare({ method: 'ems', items: items(1, 1450), country: 'DE', storageDays: 30 }).rows;
  /**
   * 1点 100 g・¥1,000・楽天・CA。ZenMarket と FROM JAPAN が**1位で**同額になる入力。
   *
   * **F07（2026-09-12）で数値が動き、以前の組み合わせ（200g・¥4,500・楽天・AU、
   * Neokyo と ZenMarket の同額）が崩れたので、修正後の値で探し直した。**
   * Neokyo が新たに推定 deposit を負って押し上げられ、ZenMarket との同額が
   * 全域で崩れたため（`Neokyo`/`ZenMarket` の crossing が消えた）、別の2社
   * （ZenMarket・FROM JAPAN）が同額になる組み合わせに差し替えた。
   */
  const topTie = () => compare({ method: 'ems',
    items: items(1, 100, 1000, { site: 'rakuten' }), country: 'CA',
  }).rows;

  test('two rows with the same total carry the same rank, and the next rank skips', () => {
    const rows = midTie();
    const a = byId(rows, 'neokyo');
    const b = byId(rows, 'buyee');
    expect(a.total.low).toBe(b.total.low);
    expect(a.rank).toBe(b.rank);
    // 競技順位。同額が2つあれば次は2つ飛ぶ（3-3 のあと 5）。
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 3, 5]);
    expect(a.tied).toBe(true);
    expect(b.tied).toBe(true);
    expect(rows.filter((r) => r.tied).map((r) => r.serviceId).sort())
      .toEqual(['buyee', 'neokyo']);
  });

  test('**the alphabetical tiebreak used to hand first place to the service that pays us**', () => {
    // 旧実装は `a.total.low - b.total.low || a.serviceName.localeCompare(b.serviceName)` だった。
    // 'Buyee' < 'Neokyo' なので、同額のとき**報酬を払う Buyee が、報酬ゼロの Neokyo を
    // 常に押しのけて上に来ていた。**順位に報酬を使わないという約束を第2の鍵が破っていた。
    const rows = midTie();
    const buyee = byId(rows, 'buyee');
    const neokyo = byId(rows, 'neokyo');
    expect(buyee.paysUs).toBe(true);
    expect(neokyo.paysUs).toBe(false);
    expect(buyee.total.low).toBe(neokyo.total.low);
    // いまはどちらも同じ順位で、報酬を払う社が上の順位を取れない。
    expect(buyee.rank).toBe(neokyo.rank);
  });

  test('CHEAPEST goes on **every** row at the lowest total, not on one of them', () => {
    const rows = topTie();
    const leaders = rows.filter((r) => r.cheapest);
    expect(leaders.map((r) => r.serviceId).sort()).toEqual(['fromjapan', 'zenmarket']);
    expect(leaders.map((r) => r.rank)).toEqual([1, 1]);
    expect(leaders.map((r) => r.diff)).toEqual([0, 0]);
    expect(new Set(leaders.map((r) => r.total.low)).size).toBe(1);
    // 最安が2つあるとき、3位は2つ飛んで 3。
    expect(rows.map((r) => r.rank)).toEqual([1, 1, 3, 4, 5]);
  });

  test('a tied row says so, so the vertical order cannot be read as a ranking', () => {
    for (const rows of [midTie(), topTie()]) {
      const tied = rows.filter((r) => r.tied);
      expect(tied.length).toBe(2);
      // 同額でない行は tied を立てない（全行に付けたら印として機能しない）。
      for (const r of rows.filter((x) => !x.tied)) {
        expect(rows.filter((o) => o.id !== r.id && o.total.low === r.total.low), r.id).toEqual([]);
      }
    }
  });

  test('a tie at the top puts both tied companies in the bracket, whether or not the bracket is stable', () => {
    // F07（2026-09-12）: 以前はここで {Neokyo, ZenMarket} の1位タイが不安定
    // （×⅓・×3 で枠の集合が変わる）例になっていた。Neokyo が新たに推定 deposit
    // を負ったことで Neokyo/ZenMarket の同額そのものが崩れ、**この形の「タイなのに
    // 不安定」という組み合わせは、広く走査しても実カートには1件も見つからなかった**
    // （1点の価格・重量・サイト・国を総当たりしても再現しない）。この事実自体を
    // 記録する——「タイなら両方が枠に入る」という主張は `topTie`（ZenMarket・
    // FROM JAPAN、CA・楽天）で確認できるが、いまはこの入力で安定でもある。
    const r = topTie();
    expect(r.filter((x) => x.cheapest).map((x) => x.serviceId).sort())
      .toEqual(['fromjapan', 'zenmarket']);
    for (const x of r.filter((row) => row.cheapest)) expect(x.recommended, x.id).toBe(true);
  });

  test('a tie below the top never makes the ranking look unstable', () => {
    // 2位が同額なだけ。1位（ZenMarket, タイなので枠は1社）は両端で枠のままなので安定。
    // 旧実装は `rows[0]` を比べていたので、同額の中で先頭が入れ替わっただけでも
    // 「1位が替わった」と読む余地があった。集合で見ることでそれを塞ぐ。
    // storageDays: 30 の理由は midTie() のコメントと同じ。
    const r = compare({ method: 'ems', items: items(1, 1450), country: 'DE', storageDays: 30 });
    expect(r.rows.filter((x) => x.tied).length).toBe(2);
    expect(r.rankStable).toBe(true);
    expect(r.rankStabilityNote)
      .toBe('ZenMarket stays in the recommended range even if we are off by 3x on weight.');
  });

  test('rank never has a hole: every rank from 1 up to the last is either used or skipped by a tie', () => {
    for (const cc of COUNTRIES_ALL) {
      for (const n of [1, 2, 3, 5]) {
        for (const w of [200, 450, 600, 1450, 1900, 3000]) {
          const rows = compare({ method: 'ems', items: items(n, w), country: cc }).rows
            .filter((r) => r.comparable);
          const ranks = rows.map((r) => r.rank);
          // 先頭は必ず 1。ある順位 k が使われた回数だけ、その後の順位が飛ぶ。
          expect(Math.min(...ranks), `${cc} n=${n} w=${w}`).toBe(1);
          for (const r of rows) {
            expect(r.rank, `${cc} n=${n} w=${w} ${r.id}`)
              .toBe(rows.filter((o) => o.total.low < r.total.low).length + 1);
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
    // **社が Neokyo から ZenMarket に変わった。額は1円も変わっていない。**
    // Neokyo は米国宛に日本郵便を売っていないので、米国の 30kg 段を Neokyo で
    // 測ると「重すぎる」ではなく「売っていない」を測ることになる。
    const inside = byId(compare({ method: 'ems', items: items(1, 24750), country: 'US' }).rows, 'zenmarket');
    expect(inside.comparable).toBe(true);
    expect(line(inside, 'intl-shipping').amount).toBe(75100);
    const outside = byId(compare({ method: 'ems', items: items(1, 24751), country: 'US' }).rows, 'zenmarket');
    expect(outside.comparable).toBe(false);
    expect(line(outside, 'intl-shipping').amount).toBeNull();
    expect(line(outside, 'intl-shipping').note).toContain(`over ${EMS_MAX_GRAMS / 1000} kg`);
    expect(line(outside, 'intl-shipping').tier).toBe('none');
  });

  test('**the zone in the note is the zone the price came from** — EMS puts the US in 4', () => {
    // 額は最初から方式ごとの地帯で計算していたが、注記だけが通常郵便の地帯表を
    // 見ていた。米国の EMS 30kg は第4地帯の ¥75,100（第3地帯なら ¥65,500）なのに
    // 「zone 3」と書いていて、**額と根拠が食い違っていた。**
    const emsNote = (cc: CountryCode) =>
      line(byId(compare({ method: 'ems', items: items(1, 24750), country: cc }).rows, 'zenmarket'),
        'intl-shipping').note!;
    expect(emsNote('US')).toContain('zone 4');
    for (const cc of COUNTRIES_ALL.filter((c) => c !== 'US' && c !== 'SG')) {
      expect(emsNote(cc), cc).toContain('zone 3');
    }
    expect(emsNote('SG')).toContain('zone 2');
    // 他方式では同じ米国が第3地帯。ここが EMS と同じになったら取り違えが再発している。
    const parcel = line(byId(compare({
      items: items(1, 600), country: 'US', method: 'parcel-air',
    }).rows, 'zenmarket'), 'intl-shipping');
    expect(parcel.note).toContain('zone 3');
  });

  test('**docs/DESIGN-BOX-SIZE.md §2④ implemented: a group over the EMS table now splits'
    + ' into more boxes instead of dropping out**', () => {
    // 5点 × 5,000g = 梱包後 30.15kg。**このPR以前**は同梱する社（1個口のまま）が
    // 公表表（30kg）を出て脱落し、注文ごとに分ける Buyee default だけが表に残った
    // ——このテストはかつてそれを固定していた。
    //
    // **§2④（`docs/DESIGN-BOX-SIZE.md` 184〜190行、`splitByWeightLimit`）を
    // 実装した結果、この固定は成立しなくなった。**5,000g の商品は1点だけなら
    // 梱包後6.3kgでEMSに十分収まるので、上限を超えた個口は「箱を増やせば収まる」
    // ケースになる——Buyee default の「注文ごとに元から分かれている」利点が
    // 消え、他の4社も自前で2箱に分けて同じ土俵に乗る。この変化は
    // このPRが正しく動いていることの証拠であって、退行ではない。
    const rows = compare({ method: 'ems', items: items(5, 5000), country: 'US' }).rows;
    // **Neokyo・FROM JAPAN・Buyee(default/consolidated) が比較不能。**理由は重量では
    // なく、この3社が米国宛にEMS（日本郵便）を売っていないこと（2026-09-12、
    // `master/courier-rates.json` の `conclusions.courier_lineup_diffs` を配線。
    // 以前は FROM JAPAN・Buyee に `unavailableIn` が無く、実際には売っていない
    // 米国向けEMSに値段を付けて比較していた欠陥）。
    const blocked = rows.filter((r) => !r.comparable);
    expect(blocked.map((r) => r.id).sort()).toEqual(
      ['buyee:consolidated', 'buyee:default', 'fromjapan', 'neokyo']);
    for (const row of blocked) {
      expect(row.notComparableReason, row.id).toContain('does not ship EMS to United States');
    }

    const comparable = rows.filter((r) => r.comparable);
    // 米国宛にEMSを売っているのは ZenMarket と Jauce の2社だけ。
    expect(comparable).toHaveLength(2);
    // **1位は ZenMarket。**FROM JAPAN が脱落した今、日本郵便をUS向けに出す
    // 2社（ZenMarket・Jauce）だけの比較になる。
    const top = comparable.sort((a, b) => a.total.low - b.total.low)[0]!;
    expect(top.id).toBe('zenmarket');
    expect(byId(rows, 'zenmarket').parcels).toBe(2);
    expect(byId(rows, 'jauce').parcels).toBe(2);
  });

  test('when nothing is comparable we say so instead of ranking the leftovers', () => {
    const r = compare({ method: 'ems', items: items(5, 25000), country: 'US' });
    expect(r.rows.every((row) => !row.comparable)).toBe(true);
    expect(r.rows.every((row) => !row.cheapest)).toBe(true);
    expect(r.rankStabilityNote).toBe(
      'No published rate covers this parcel for EMS, so we cannot compare these totals.');
  });

  /**
   * ⑤-d（外部レビュー、2026-09-11）: 選んでいる方式の名前を注記に出す。
   * 小形包装物を選んでいて全社が重量上限を超えたとき、以前は実際には
   * 選んでいない「EMS」の名前が出ていた。
   */
  test('the note names the shipping method actually selected, not always "EMS"', () => {
    const r = compare({ items: items(5, 25000), country: 'US', method: 'small-packet-air' });
    expect(r.rows.every((row) => !row.comparable)).toBe(true);
    expect(r.rankStabilityNote).toContain('Small packet (airmail)');
    expect(r.rankStabilityNote).not.toContain('EMS');
  });

  test('with §2④ implemented, no country drops every non-Buyee row at this weight any more', () => {
    // **このテストの旧タイトルは「every country stops at the same table edge」だった。**
    // 5点×5,000gはどの国でも梱包後30.15kgで、以前はEMS表を出て全社が脱落し
    // Buyee default だけが残った——`splitByWeightLimit`（§2④）を実装した今、
    // 上限超の個口は箱を増やして収まるので、もう「表の同じ端で全社が止まる」
    // ことは無い。米国だけ Neokyo・FROM JAPAN・Buyee(2行) が引き続き比較不能だが、
    // 理由は重量ではなく「米国宛にEMSを売っていない」という事実（2026-09-12、
    // `master/courier-rates.json` の `conclusions.courier_lineup_diffs` を配線）。
    const EXPECT_NOT_COMPARABLE: Partial<Record<CountryCode, number>> = { US: 4 };
    for (const cc of COUNTRIES_ALL) {
      const rows = compare({ method: 'ems', items: items(5, 5000), country: cc }).rows;
      expect(rows.filter((r) => !r.comparable).length, cc).toBe(EXPECT_NOT_COMPARABLE[cc] ?? 0);
      expect(winnerOf(rows)!.id, cc).not.toBe('buyee:default');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// **順位は重量の推定誤差に対して頑健ではない。** 交差点は 1〜2kg の現実的な帯にある。
// rankStable=false は不具合ではなく、その事実を画面に出すための仕様。
// 実測: docs/audit/measured-2026-09-06.md
// ─────────────────────────────────────────────────────────────────────────────
describe('rank stability is measured, not assumed — and it is often false', () => {
  test('**600 g per item is unstable in four of the seven countries — this is the spec, not a bug**', () => {
    // **AU と SG だけが安定側にいる。理由は税の徴収者が違うこと。**
    // どちらも低額品の GST を国境ではなく代行が販売時点で徴収する国で、その課税ベースが
    // 社ごとに違う（Neokyo・ZenMarket は内容品価格のみ、FROM JAPAN・Jauce・Buyee は
    // 手数料や送料も含む）。重くすると送料を課税ベースに入れている社ほど税も増えるので、
    // 1/3〜3倍では1位が動かなかった。
    // **SG の安定は我々の無知にも助けられている。** 徴収を確認できたのは Buyee と
    // FROM JAPAN だけで、残る3社の行には税が乗っていない（その3社の総額は税のぶん低い）。
    // 確認できる社が増えれば、ここは不安定に転じうる。
    //
    // **US（下で別に検査する）は安定。**ただし理由がP1-4当時から変わった:
    // 2026-09-12、`master/courier-rates.json` の `conclusions.courier_lineup_diffs`
    // を配線した結果、FROM JAPAN・Neokyo・Buyee はいずれも米国宛にEMS（日本郵便）
    // を売っていないと確認済みで比較不能になり、米国でEMSを比較できるのは
    // ZenMarket と Jauce の2社だけになった——「1位がFROM JAPAN」という以前の
    // 前提自体が、実際には売っていない方式に値段を付けていた欠陥の産物だった。
    const stable: CountryCode[] = ['AU', 'SG'];
    for (const cc of COUNTRIES_ALL.filter((c) => !stable.includes(c) && c !== 'US')) {
      const r = compare({ method: 'ems', items: items(5, 600), country: cc });
      expect(r.rankStable, cc).toBe(false);
      expect(r.rankIndeterminate, cc).toBe(false);
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
      const r = compare({ method: 'ems', items: items(5, 600), country: cc });
      expect(r.rankStable, cc).toBe(true);
      expect(r.rankIndeterminate, cc).toBe(false);
      expect(r.rankStabilityNote, cc).toBe(
        'Neokyo stays in the recommended range even if we are off by 3x on weight.');
    }
    const us = compare({ method: 'ems', items: items(5, 600), country: 'US' });
    expect(us.rankStable).toBe(true);
    expect(us.rankIndeterminate).toBe(false);
    expect(us.rankStabilityNote).toBe(
      'ZenMarket stays in the recommended range even if we are off by 3x on weight.');
  });

  test('**§2④ implemented: 3,000 g/item no longer destabilizes the ranking at 3x weight**', () => {
    // **このテストは以前、3,000 g/点を3倍（9,000 g/点）にすると同梱する社が
    // EMS 公表表（30kg）を出て脱落し、注文ごとに分ける Buyee default だけが
    // 残る——という不安定さを固定していた。**
    //
    // `splitByWeightLimit`（§2④、`docs/DESIGN-BOX-SIZE.md` 184〜190行）を
    // 実装した今、9,000 g/点は1点あたりでは十分軽い（梱包後 11.1kg）ので、
    // 上限を超えた5点の個口は箱を2つに分ければ収まる——3倍にしても Buyee
    // default の専売にならない。この安定化はこのPRの意図した効果である
    // （「唯一値段が付く社≠最安」という主張そのものは、なお個別に
    // `weightSensitivity` の `onlyPricedAtLow`/`onlyPricedAtHigh` で縛って
    // いる——本当に1点だけで方式の上限を超える商品があれば、いまも同じ
    // 注記が出る）。
    const r = compare({ method: 'ems', items: items(5, 3000), country: 'US' });
    expect(r.rankStable).toBe(true);
    expect(r.rankIndeterminate).toBe(false);
    expect(r.rankStabilityNote).toBe(
      'ZenMarket stays in the recommended range even if we are off by 3x on weight.');
  });

  test('200 g per item is stable in all seven countries (P1-4: US too)', () => {
    // **US も含めて全国が安定側。**米国でEMSを比較できるのは ZenMarket と Jauce の
    // 2社だけ（FROM JAPAN・Neokyo・Buyee は米国宛にEMSを売っていない、
    // 2026-09-12 配線）——ZenMarket が明確な1位で枠に残る。
    for (const cc of COUNTRIES_ALL) {
      const r = compare({ method: 'ems', items: items(5, 200), country: cc });
      expect(r.rankStable, cc).toBe(true);
      expect(r.rankIndeterminate, cc).toBe(false);
      expect(r.rankStabilityNote, cc).toBe(
        cc === 'US'
          ? 'ZenMarket stays in the recommended range even if we are off by 3x on weight.'
          : 'Neokyo stays in the recommended range even if we are off by 3x on weight.');
    }
  });

  test('a 9,000 g single item in the US: ZenMarket leads, Jauce a clear second (not indeterminate)', () => {
    // FROM JAPAN・Neokyo・Buyee は米国宛にEMSを売っていない（2026-09-12配線）ので、
    // 比較に残るのは ZenMarket と Jauce の2社だけ。ZenMarket が明確な1位。
    const r = compare({ method: 'ems', items: items(1, 9000), country: 'US' });
    expect(r.rankStable).toBe(true);
    expect(r.rankIndeterminate).toBe(false);
    expect(r.rankStabilityNote).toBe(
      'ZenMarket stays in the recommended range even if we are off by 3x on weight.'
      + ' Beyond that the parcel leaves the published EMS table.');
  });

  test('the cheapest service flips at 1,150 g / 1,325 g / 1,625 g by basket size', () => {
    // 実測の交差点。ここが動いたら費目モデルが変わったということ。
    //
    // **国が米国からカナダに変わった。重量は1gも変わっていない。**
    // この3つの交差は「Neokyo → FROM JAPAN」で、Neokyo が米国宛に日本郵便を
    // 売っていないと確認できた（自社の計算機が3方式すべてに
    // "Not available or suspended in your country." を返す）ので、米国では
    // 交差の片側が盤面に存在しない。同じ3点はカナダでそのまま成り立ち、
    // 3点・5点は独・英・仏でも同じ重量で起きる（`docs/audit/` の走査）。
    const winnerAt = (n: number, weightG: number) =>
      winnerOf(compare({ method: 'ems', items: items(n, weightG), country: 'CA' }).rows)!.id;
    const CROSSINGS: [number, number][] = [[2, 1150], [3, 1325], [5, 1625]];
    for (const [n, at] of CROSSINGS) {
      expect(winnerAt(n, at - 25), `n=${n} just below ${at}g`).toBe('neokyo');
      expect(winnerAt(n, at), `n=${n} at ${at}g`).toBe('fromjapan');
    }
  });

  test('in the US the winner never changes with weight — the crossover needs Neokyo or FROM JAPAN', () => {
    // **米国では1位が重量で動かない。**上の交差はどれも Neokyo/FROM JAPAN が片側で、
    // その両社（Buyee も含め3社）が米国では日本郵便（EMS）を売っていないため
    // （2026-09-12、`master/courier-rates.json` の `conclusions.courier_lineup_diffs`
    // を配線）。「米国は安定」という結論は、我々のモデルが良くなったからではなく
    // **比べる相手が ZenMarket と Jauce の2社だけに減ったから**であることをここに残す。
    for (const n of [1, 2, 3, 5]) {
      const winners = new Set<string>();
      for (let g = 100; g <= 4000; g += 100) {
        const rows = compare({ method: 'ems', items: items(n, g), country: 'US' }).rows;
        const comparableIds = rows.filter((r) => r.comparable).map((r) => r.id).sort();
        // 同梱組が公表表を出た帯は「順位が動いた」ではないので数えない。
        if (comparableIds.join(',') !== 'jauce,zenmarket') continue;
        winners.add(winnerOf(rows)!.id);
      }
      expect([...winners], `n=${n}`).toEqual(['zenmarket']);
    }
  });

  test('a single item never crosses: ZenMarket wins at every weight the table covers', () => {
    // FROM JAPAN・Neokyo・Buyee は米国宛にEMSを売っていない（2026-09-12配線）ので、
    // 米国でEMSを比較できるのは ZenMarket と Jauce の2社だけ——ZenMarket が常に安い。
    for (const w of [100, 500, 1000, 1625, 3000, 8000, 24750]) {
      expect(winnerOf(compare({ method: 'ems', items: items(1, w), country: 'US' }).rows)!.id, `${w}g`)
        .toBe('zenmarket');
    }
  });

  test('§2④ implemented: crossing 30kg at 4,975 g/item no longer knocks everyone else out', () => {
    // **このテストは以前、5点×4,975g（梱包後30.15kg）でEMS表を出た同梱行が
    // 全社脱落し、Buyee default だけが値段を持つことを固定していた。**
    // `splitByWeightLimit`（§2④）を実装した今、4,975gは1点あたり十分軽い
    // （梱包後 6.27kg）ので、上限を超えた個口は箱を2つに分ければ収まる——
    // 表の端をまたいでも勝者は変わらない（そもそも誰も脱落しない）。
    // **米国でEMSを比較できるのは ZenMarket と Jauce の2社だけ**
    // （FROM JAPAN・Neokyo・Buyee は米国宛にEMSを売っていない、2026-09-12配線）。
    const below = compare({ method: 'ems', items: items(5, 4950), country: 'US' }).rows;
    expect(winnerOf(below)!.id).toBe('zenmarket');
    const above = compare({ method: 'ems', items: items(5, 4975), country: 'US' }).rows;
    expect(winnerOf(above)!.id).toBe('zenmarket');
    expect(above.filter((r) => r.comparable)).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 免税限度は intrinsic value（商品代のみ）で測る。CIF で測ると帯を誤判定する。
// ─────────────────────────────────────────────────────────────────────────────
describe('tax thresholds are judged on intrinsic value, not on CIF', () => {
  test('GBP 135 is measured on the item price alone — GBP 211.40/¥ → ¥28,539', () => {
    const dutyAt = (priceYen: number) =>
      compare({ method: 'ems', items: items(1, 500, priceYen), country: 'GB' }).rows
        .map((r) => line(r, 'duty').amount);
    // 商品代 ¥28,539 = £135.0。送料込みなら £150 相当だが、判定には混ぜない。
    // **境界は為替そのもの。**転記前の ¥190/£ では ¥25,650 に置かれていた（約 ¥2,900 手前）。
    // 限度以下は**取得できた 0**（原文が「£135 以下は関税なし」と書いている）。
    expect(dutyAt(28539)).toEqual([0, 0, 0, 0, 0]);
    // 限度超は数字になる。**以前ここは null（「—」）だった。**関税は VAT の課税ベースに
    // 入るので、null が 0 に畳まれて VAT まで縮んでいた（EU・カナダと同じ欠陥）。
    // 額は WTO 英国プロファイルの非農産品 MFN 単純平均 2.9%。
    for (const amount of dutyAt(28540)) expect(amount).toBeGreaterThan(0);
  });

  test('the threshold is per consignment, so splitting into parcels can put every parcel under it', () => {
    // **制度がどれも「1個口あたり」と書いている。**
    //   GB「The £135 limit applies to the value of a **total consignment** that is imported」
    //      「**Unless sent individually**, the seller must add the individual values of all
    //       items in a consignment together」
    //   EU「in **consignments** ≤ EUR 150. **This threshold applies per consignment**」
    //
    // **以前はカート全額で判定していた。**Buyee の既定は注文ごとに別送するので、
    // 3点 × ¥20,000 が 1個口 €110 ずつ（€150 以下）なのに「€330 超」と判定され、
    // 4.1% を掛けていた。**個口を分けたほうが税は安いのに、逆に高く出していた。**
    const de = compare({ method: 'ems', items: items(3, 600, 20_000), country: 'DE' }).rows;
    const one = byId(de, 'buyee:consolidated');   // 1個口 = €330
    const three = byId(de, 'buyee:default');      // 3個口 = 1個口あたり €110
    expect(one.parcels).toBe(1);
    expect(three.parcels).toBe(3);
    expect(line(one, 'duty').note).toContain('4.1%');
    expect(line(three, 'duty').note).toContain('EUR 3 flat');
    // 同梱すると関税は上がる。**個口の数が税を決めている**ことがこの不等号に出る。
    expect(line(one, 'duty').amount!).toBeGreaterThan(line(three, 'duty').amount!);

    // 英国も同じ。1個口 £330 は限度超、3個口なら1個口 £110 で限度以下＝取得できた 0。
    const gb = compare({ method: 'ems', items: items(3, 600, 20_000), country: 'GB' }).rows;
    expect(line(byId(gb, 'buyee:consolidated'), 'duty').amount!).toBeGreaterThan(0);
    expect(line(byId(gb, 'buyee:default'), 'duty').amount).toBe(0);
  });

  test('splitting is not automatically cheaper — the postage eats the tax saving', () => {
    // **「個口を分ければ安い」と断言してはいけない。**分けると EMS が個口ごとに乗る。
    // 上のテストで税は下がるが、総額は上がる。両方を計算しないと助言にならない。
    const de = compare({ method: 'ems', items: items(3, 600, 20_000), country: 'DE' }).rows;
    const one = byId(de, 'buyee:consolidated');
    const three = byId(de, 'buyee:default');
    expect(line(three, 'intl-shipping').amount!).toBeGreaterThan(line(one, 'intl-shipping').amount!);
    expect(three.total.low).toBeGreaterThan(one.total.low);
  });

  test('SGD 400 likewise: GST stays 0 while CIF is over but the goods are not', () => {
    const rows = compare({ method: 'ems', items: items(1, 600, 46000), country: 'SG' }).rows;
    // 商品代 SGD 373.0 < 400。CIF は社により 413〜466 で超えているが、限度は商品代で測る。
    for (const r of rows) expect(line(r, 'vat').amount, r.id).toBe(0);
    // 商品代自体が超えれば課税され、そのときの課税ベースは CIF。
    const over = compare({ method: 'ems', items: items(1, 600, 50000), country: 'SG' }).rows;
    for (const r of over) expect(line(r, 'vat').amount, r.id).toBeGreaterThan(0);
  });

  test('**every service on the board makes the same threshold decision**', () => {
    // 社ごとに送料も手数料も違う。CIF で判定していたら、同じ商品なのに
    // 社によって課税されたりされなかったりして、順位が税の誤判定で歪む。
    for (const priceYen of [25000, 25650, 25700, 30000]) {
      const notes = compare({ method: 'ems', items: items(1, 500, priceYen), country: 'GB' }).rows
        .map((r) => line(r, 'duty').note);
      expect(new Set(notes).size, `¥${priceYen}`).toBe(1);
    }
  });

  test('Germany charges its flat duty per item, counted from the item count', () => {
    const row = compare({ method: 'ems', items: items(2, 600), country: 'DE' }).rows[0]!;
    const duty = line(row, 'duty');
    expect(duty.note).toBe('EUR 3 flat × 2 items');
    expect(duty.amount).toBe(Math.round(3 * 2 * 181.59));
  });

  test('a FOB country taxes the goods only: domestic shipping never enters US duty', () => {
    const paid = compare({ method: 'ems', items: items(2, 600), country: 'US' }).rows[0]!;
    const free = compare({ method: 'ems', items: items(2, 600, 3000, { freeShipping: true }), country: 'US' }).rows[0]!;
    expect(line(paid, 'duty').amount).toBe(750); // 12.5% × ¥6,000
    expect(line(free, 'duty').amount).toBe(750);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F1（外部レビュー）: 個口が決済時徴収の帯をまたぐと、帯の中の個口が払う税は
// 「決済時に集めた」ことになって国境側の行では0になる（二重計上を避けるため、
// これ自体は正しい）。**その分を `prepaid-import-tax` が拾わないと、税額が
// どの行にも `excluded` にも現れず消える。**以前は「カート最大の個口」だけを
// 見て行を出す/出さないを決めていたため、最大の個口が帯の外（＝国境課税）だと
// 判定が「集めない」に倒れ、帯の中の小さい個口が実際に払った税がまるごと消えた。
// ─────────────────────────────────────────────────────────────────────────────
describe('F1: a checkout-collected VAT/GST parcel is never invisible, even when parcels straddle the threshold', () => {
  test('AU: one parcel over AUD 1,000 and several under it — the under-threshold parcels\' GST' +
    ' still shows up as a prepaid-import-tax line, not nowhere', () => {
    const straddle = [
      item({ id: 'big', priceYen: 200_000, weightG: 3000 }),
      ...Array.from({ length: 5 }, (_, i) => item({ id: `small${i}`, priceYen: 3000, weightG: 500 })),
    ];
    const row = byId(compare({ items: straddle, country: 'AU' }).rows, 'buyee:default');
    expect(row.parcels).toBe(6);
    // 大きい個口は国境課税（vat 行）、小さい5個口は決済時徴収（vat行はseller-collectsで0）。
    expect(line(row, 'vat').note).toContain('the other 5 parcels owe none');
    // F1 本体: 消えていた税が prepaid-import-tax として出ている。
    const prepaid = line(row, 'prepaid-import-tax');
    expect(prepaid.amount).not.toBeNull();
    expect(prepaid.amount!).toBeGreaterThan(0);
    expect(prepaid.note).toContain('collected at checkout on 5 parcels of 6');
    // 合計はその行を含めて閉じている（消えていない——`sum(lines)` と一致）。
    expect(row.total.low).toBe(sumLines(row));
    // 箱ごとの判定（#88 の `ParcelBox.tax`）も嘘をつかない: 小さい個口は
    // 確かに seller-collects と判定されている。
    for (let i = 1; i < 6; i++) expect(row.boxes[i]!.tax.vat.kind).toBe('seller-collects');
    expect(row.boxes[0]!.tax.vat.kind).toBe('rate');
  });

  test('ZenMarket to DE after a weight-limit split (§2④): the sub-EUR-150 parcel\'s IOSS VAT' +
    ' is not lost when another parcel in the same shipment is taxed at the border', () => {
    const straddle = [
      item({ id: 'big', priceYen: 260_000, weightG: 1000 }),
      ...Array.from({ length: 8 }, (_, i) => item({ id: `cheap${i}`, priceYen: 4000, weightG: 3500 })),
    ];
    const row = byId(compare({ items: straddle, country: 'DE' }).rows, 'zenmarket');
    expect(row.parcels).toBeGreaterThan(1);
    const prepaid = row.lines.find((l) => l.key === 'prepaid-import-tax');
    expect(prepaid).toBeDefined();
    expect(prepaid!.amount).not.toBeNull();
    expect(prepaid!.amount!).toBeGreaterThan(0);
    expect(row.total.low).toBe(sumLines(row));
  });

  test('never double-counts: a straddling parcel is never taxed by both the border VAT line' +
    ' and prepaid-import-tax at once', () => {
    const straddle = [
      item({ id: 'big', priceYen: 200_000, weightG: 3000 }),
      ...Array.from({ length: 5 }, (_, i) => item({ id: `small${i}`, priceYen: 3000, weightG: 500 })),
    ];
    const row = byId(compare({ items: straddle, country: 'AU' }).rows, 'buyee:default');
    // seller-collects の個口は taxLines() 側で厳密に0円（二重計上防止のコメントどおり）。
    for (let i = 1; i < 6; i++) expect(row.boxes[i]!.tax.vat.yen).toBe(0);
  });

  // **コーディネーター指摘（2026-09-12）への回答として追加。**外部レビューが実際に
  // 見た症状（3個口・「the other 2 parcels owe none」・首位の逆転）を、3店舗の
  // 別注文（Buyee default は注文ごとに個口を分ける）で再現する。1店舗だけ
  // AUD 1,000 超、残り2店舗はそれぞれ単独で閾値未満——均等割りでは絶対に
  // 起きない構図で、これが実際の運用（買い物は複数店舗にまたがる）で普通に
  // 起こりうることを示す。
  test('AU: a 3-order cart reproduces the review\'s exact symptom — before the fix, the missing'
    + ' checkout tax made Buyee\'s default variant a false #1 ahead of FROM JAPAN', () => {
    const shopItem = (id: string, shop: string, priceYen: number, weightG: number): Item => item({
      id, priceYen, weightG, site: 'rakuten', url: `https://item.rakuten.co.jp/${shop}/${id}/`,
    });
    const cart = [
      shopItem('a', 'shop-a', 150_000, 2000), // 1店舗だけ AUD 1,000（≈¥112,550）超。
      shopItem('b', 'shop-b', 90_000, 1500),  // 残り2店舗は単独で閾値未満。
      shopItem('c', 'shop-c', 90_000, 1500),
    ];
    const rows = compare({ items: cart, country: 'AU' }).rows.filter((r) => r.comparable);
    const buyee = byId(rows, 'buyee:default');
    const fj = byId(rows, 'fromjapan');
    expect(buyee.parcels).toBe(3);
    // レビューが引用した原文どおりの文言。
    expect(line(buyee, 'vat').note).toContain('the other 2 parcels owe none (collected at checkout by the service)');
    // F1修正後: 消えていた決済時徴収分が prepaid-import-tax に出る。
    const prepaid = line(buyee, 'prepaid-import-tax');
    expect(prepaid.amount).toBeGreaterThan(0);
    // 本体の主張: 修正後、Buyee default は FROM JAPAN より高くなる
    // （消えていた税を足し戻すと、実際には最安ではない）。
    expect(buyee.total.low).toBeGreaterThan(fj.total.low);
    // 合計はその行を含めて閉じている。
    expect(buyee.total.low).toBe(sumLines(buyee));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 国内送料。どの社も込みではないので、CIF 国では課税額に乗る。
// ─────────────────────────────────────────────────────────────────────────────
describe('domestic shipping is charged by every service, and taxed where the base is CIF', () => {
  test('no service folds domestic shipping into its fee — every row shows the line', () => {
    for (const row of compare({ method: 'ems', items: items(2, 600), country: 'US' }).rows) {
      expect(line(row, 'domestic-shipping').amount, row.id).toBe(1600);
      expect(line(row, 'domestic-shipping').tier, row.id).toBe('estimate');
    }
  });

  test('**the domestic shipping a row actually pays raises its VAT** (GB, 20%)', () => {
    for (const n of [1, 2, 3]) {
      const paid = compare({ method: 'ems', items: items(n, 600), country: 'GB' }).rows;
      const free = compare({ method: 'ems', items: items(n, 600, 3000, { freeShipping: true }), country: 'GB' }).rows;
      // **税を運んでいる行で測る。**ZenMarket は閾値の中では決済時に払う（IOSS）ので
      // 国境 VAT が 0 になり、代わりに prepaid-import-tax が同じ課税ベースを持つ。
      // どちらの経路でも「実際に払う国内送料が課税ベースに入る」ことは変わらない。
      const taxOf = (row: Row) => (line(row, 'vat').amount ?? 0)
        + (row.lines.find((l) => l.key === 'prepaid-import-tax')?.amount ?? 0);
      for (const row of paid) {
        const delta = taxOf(row) - taxOf(byId(free, row.id));
        // **外部レビュー⑤-a で入金手数料の位置を直した**（`compare.ts` の deposit
        // ブロック）。以前は入金手数料が VAT/GST の課税ベースより前で計算されて
        // いたせいで、ZenMarket の IOSS 課税ベース（`preTaxYen`）に入金手数料の
        // gross-up が混ざり、国内送料の増分がその分だけ余計に VAT へ乗っていた
        // （国内送料 → 入金手数料 → 課税ベース、という存在してはいけない循環）。
        // 入金手数料を税の行より後ろに移した今、この循環は無く、ZenMarket も
        // 他社と同じ単純な式になる。
        expect(delta, `${row.id} n=${n}`).toBe(Math.round(0.2 * 800 * n));
      }
    }
  });

  test('free shipping zeroes the line without touching the service fee', () => {
    const rows = compare({ method: 'ems', items: items(2, 600, 3000, { freeShipping: true }), country: 'US' }).rows;
    const fj = byId(rows, 'fromjapan');
    expect(line(fj, 'domestic-shipping').amount).toBe(0);
    expect(line(fj, 'domestic-shipping').tier).toBe('fixed');
    expect(line(fj, 'service-fee').amount).toBe(1000);
  });

  test('free shipping does not change the winner, but it can swap rows below it', () => {
    // 送料は全社に同額で乗るので1位は動かない。動くのは送金額に率で乗る費目
    // （F07、5社とも）で、その動く量は社ごとの deposit の値（率・確定額かどうか）が
    // 違うので、社同士の順位が入れ替わりうる。
    // storageDays: 30 で保管を無料期間の内側に固定する（0d、全社¥0）——
    // ここで検査しているのは送料無料の効きであって保管日数の効きではない。
    // **F07（2026-09-12）で5点200g・米国の組み合わせは入れ替わりが起きなく
    // なった**（ZenMarket が3位のまま動かない）ので、英国・5点1,000g・¥5,500に
    // 差し替えた——同じ「1位は動かず、下の2社が入れ替わる」形が残る。
    const paid = compare({ method: 'ems', items: items(5, 1000, 5500), country: 'GB', storageDays: 30 }).rows;
    const free = compare({ method: 'ems',
      items: items(5, 1000, 5500, { freeShipping: true }), country: 'GB', storageDays: 30,
    }).rows;
    expect(free[0]!.id).toBe(paid[0]!.id);
    // ZenMarket と FROM JAPAN の順位が入れ替わる（3位⇄2位）。
    expect(byId(paid, 'zenmarket').rank).toBe(3);
    expect(byId(free, 'zenmarket').rank).toBe(2);
    expect(byId(paid, 'fromjapan').rank).toBe(2);
    expect(byId(free, 'fromjapan').rank).toBe(3);
  });

  test('a given domestic shipping cost is fixed, an assumed one is an estimate', () => {
    const assumed = byId(compare({ method: 'ems', items: [item({ id: 'a' })], country: 'US' }).rows, 'zenmarket');
    expect(line(assumed, 'domestic-shipping').amount).toBe(800);
    expect(line(assumed, 'domestic-shipping').tier).toBe('estimate');
    const known = byId(
      compare({ method: 'ems', items: [item({ id: 'a', domesticShippingYen: 250 })], country: 'US' }).rows, 'zenmarket');
    expect(line(known, 'domestic-shipping').amount).toBe(250);
    expect(line(known, 'domestic-shipping').tier).toBe('fixed');
  });
});

// ───────────────────────────────────────────────────────────────────────────────────
// T-F10: 「送料無料」の￥0を確定値として出さない。金額は1円も動かさない。
// master/fees.json F13b（company: buyee）だけにある識だしで、対象は Buyee の行だけ。
// ───────────────────────────────────────────────────────────────────────────────────
describe('Buyee: "free shipping" does not mean the domestic leg is confirmed at zero (T-F10)', () => {
  test('Buyee\'s domestic-shipping line stays at \u00a50 but is no longer `fixed`', () => {
    const withFree = compare({ method: 'ems', items: [item({ id: 'a', freeShipping: true })], country: 'US' }).rows;
    const buyee = byId(withFree, 'buyee');
    expect(line(buyee, 'domestic-shipping').amount).toBe(0);
    expect(line(buyee, 'domestic-shipping').tier).not.toBe('fixed');
    expect(line(buyee, 'domestic-shipping').sourceUrl).toBeTruthy();
  });

  test('other services keep the confirmed \u00a50 for the same free-shipping item', () => {
    const withFree = compare({ method: 'ems', items: [item({ id: 'a', freeShipping: true })], country: 'US' }).rows;
    for (const id of ['zenmarket', 'neokyo', 'fromjapan', 'jauce']) {
      const row = byId(withFree, id);
      expect(line(row, 'domestic-shipping').amount, id).toBe(0);
      expect(line(row, 'domestic-shipping').tier, id).toBe('fixed');
    }
  });

  test('**the total does not move** \u2014 only the tier and note change', () => {
    // freeShipping: true と domesticShippingYen: 0 は、domestic-shipping の金額として
    // どちらも 0。T-F10 が変えたのは確度（tier）と note だけなので、totalは全行一致するはず
    // ——一致しなければ金額が動いたということ。
    const free = compare({ method: 'ems', items: [item({ id: 'a', freeShipping: true })], country: 'US' }).rows;
    const confirmedZero = compare(
      { method: 'ems', items: [item({ id: 'a', domesticShippingYen: 0 })], country: 'US' }).rows;
    expect(free.length).toBeGreaterThan(0);
    for (const row of free) {
      expect(row.total.low, row.id).toBe(byId(confirmedZero, row.id).total.low);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Buyee だけが既定で注文ごとに別送する。同梱は申請しないと得られない。
// ─────────────────────────────────────────────────────────────────────────────
describe('the international method is an input, and the default is now cheapest-excluding-surface', () => {
  const shipOf = (r: Row) => line(r, 'intl-shipping');

  // **2026-09-12、オーナー確定（P2 4）で既定が変わった。**以前は実請求の利用実績
  // （EMS 11 / FedEx 12 / UPS 7 / DHL 7 / 船便 3 / Airmail 1）を根拠に EMS 固定
  // だったが、その議論は `DEFAULT_METHOD` のコメントに残したまま、オーナーが
  // 「条件ごとに再計算する最安（Surface は除く）」に置き換えた。
  test('with nothing chosen every row goes by the cheapest non-surface method for that condition', () => {
    for (const row of compare({ items: items(5, 600), country: 'DE' }).rows) {
      expect(row.method, row.id).not.toBe('small-packet-surface');
      expect(row.method, row.id).not.toBe('parcel-surface');
    }
  });

  test('choosing a method changes the postage, the label and the total', () => {
    const de = (m: CompareInput['method']) =>
      byId(compare({ items: items(5, 600), country: 'DE', method: m }).rows, 'neokyo');
    const ems = de('ems');
    const surface = de('parcel-surface');
    // 5点×600g = 梱包後 3.9kg。EMS は 4.0kg 段、国際小包(船便)も 4.0kg 段。
    expect(shipOf(ems).amount).toBe(10900);
    expect(shipOf(surface).amount).toBe(4300);
    expect(shipOf(surface).label).toContain('International parcel (surface)');
    expect(surface.total.low).toBeLessThan(ems.total.low);
    // **輸入側にも波及する。**ドイツは CIF 課税なので、送料が下がれば VAT も下がる。
    expect(line(surface, 'vat').amount!).toBeLessThan(line(ems, 'vat').amount!);
  });

  test('the row says how long it takes and whether it is tracked, next to the price', () => {
    // 額だけ出して日数を出さなければ、遅いほうを選ばせる誤誘導になる。
    const row = byId(compare({ items: items(5, 600), country: 'DE', method: 'parcel-surface' }).rows, 'neokyo');
    expect(shipOf(row).note).toContain('1–3 months');
    expect(shipOf(row).note).toContain('tracked');
    // **Neokyo は小形包装物を売っていない**（2026-09-07 実測）ので、売っている社で見る。
    const air = byId(compare({ items: items(1, 300), country: 'DE', method: 'small-packet-air' }).rows, 'buyee');
    expect(shipOf(air).note).toContain('10 days or less');
    expect(shipOf(air).note).toContain('no tracking');
  });

  test('a method whose limit the group exceeds now splits into more boxes instead of dropping'
    + ' out — docs/DESIGN-BOX-SIZE.md §2④', () => {
    // 小形包装物は 2kg まで。5点×600g は同梱すると梱包後 3.9kg で1個口には入らない。
    //
    // **このテストは以前、上限超は「送れない」で終わる（Buyee default だけが
    // 生き残る）ことを固定していた。**`splitByWeightLimit`（§2④）を実装した今、
    // 600gの商品は1点あたり十分軽いので、上限超のグループは箱を3つに分ければ
    // 収まる——FROM JAPAN・ZenMarket・Buyee consolidated も同じ方式を選べる
    // ようになった。
    const rows = compare({ items: items(5, 600), country: 'DE', method: 'small-packet-air' }).rows;
    const comparable = rows.filter((r) => r.comparable);
    // **Neokyo と Jauce は引き続き比較不能。**理由は重量ではなく、
    // Neokyo は小形包装物そのものを売っておらず（2026-09-07実測）、Jauce も
    // この方式をこの国へ出していない——このPRの変更点とは無関係の既存事実。
    expect(comparable.map((r) => r.id).sort()).toEqual(
      ['buyee:consolidated', 'buyee:default', 'fromjapan', 'zenmarket'].sort());
    for (const row of comparable) {
      expect(shipOf(row).amount, row.id).not.toBeNull();
      expect(row.parcels, row.id).toBeGreaterThan(1);
    }
    // **箱を分けても店舗の下地は保たれる。**Buyee default は注文ごとに
    // 元から5個口（1点=1注文、方式の上限より軽いので追加分割は無い）、
    // 他の3社は同梱1グループを3箱に分ける（下の「conservation」テストで
    // 中身の保全を別に確認する）。
    expect(byId(rows, 'buyee:default').parcels).toBe(5);
    expect(byId(rows, 'fromjapan').parcels).toBe(3);
    expect(byId(rows, 'zenmarket').parcels).toBe(3);
    expect(byId(rows, 'buyee:consolidated').parcels).toBe(3);
    for (const id of ['neokyo', 'jauce']) {
      expect(byId(rows, id).comparable, id).toBe(false);
    }
  });

  test("'cheapest' picks per row — and docs/DESIGN-BOX-SIZE.md §2④ now lets a"
    + ' consolidated row split its own way into the same method too', () => {
    // Buyee の既定は注文ごとに別送するので**1個口が軽い**——3点なら1個口 0.6kg
    // ×3個口で、もとから小形包装物（2kg 上限）に入る。
    //
    // **このテストは以前、同梱する社（1個口3.0kgのまま）は小形包装物に入らず、
    // EMSに回ることを固定していた。**`splitByWeightLimit`（§2④）を実装した今、
    // 600gの商品は1点あたり十分軽いので、同梱する社も自分で2箱に分けて
    // 小形包装物に収まる——**これがこのPRで見つかった具体的な方式の入れ替わり
    // （ranking flip の一種、同じ社の同じカートで最安の方式そのものが変わる）**:
    // Buyee consolidated は以前 EMS だったが、いまは small-packet-air が最安。
    const rows = compare({ items: items(3, 600), country: 'DE', method: 'cheapest' }).rows;
    const split = byId(rows, 'buyee:default');
    const together = byId(rows, 'buyee:consolidated');
    expect(split.parcels).toBe(3);
    // **箱数は違う（下地が違う）が、選ぶ方式は同じになった。**
    expect(together.parcels).toBe(2);
    expect(split.method).toBe('small-packet-air');
    expect(together.method).toBe('small-packet-air');
  });

  test('a service that does not ship Japan Post to a country is not priced there as if it did', () => {
    // **Neokyo は米国宛に日本郵便を出していない。**自社の計算機が `country_to=US` で
    // EMS / Airmail / Surface の3方式すべてに
    // 「Not available or suspended in your country.」を返す（2026-09-07 確認）。
    // 同じ計算機で `country_to=DE` は3方式とも額を返すので、国の問題であって
    // 方式の問題ではない。
    //
    // 背景: 日本郵便は 2025-08 に米国宛を停止し、2026-04 に「差出人が Zonos で関税を
    // 事前納付すること」を条件に再開した。**その条件を飲まなかった社がある。**
    const us = compare({ method: 'ems', items: items(5, 600), country: 'US' }).rows;
    const neokyo = byId(us, 'neokyo');
    expect(line(neokyo, 'intl-shipping').amount).toBeNull();
    expect(neokyo.comparable).toBe(false);
    // **理由が「重すぎる」ではないことを言う。**同じ扱いでも原因が違う。
    expect(neokyo.notComparableReason).toContain('does not ship');
    expect(neokyo.notComparableReason).toContain('United States');
    expect(neokyo.notComparableReason).toContain('couriers, which we do not price');

    // 他の国では普通に出る。**国を消したのではなく、その国のその方式が無い。**
    for (const cc of ['GB', 'DE', 'FR', 'AU', 'CA', 'SG'] as CountryCode[]) {
      const row = byId(compare({ method: 'ems', items: items(5, 600), country: cc }).rows, 'neokyo');
      expect(line(row, 'intl-shipping').amount, cc).toBeGreaterThan(0);
      expect(row.comparable, cc).toBe(true);
    }

    // **他社の米国は消さない、ただし実際に売っている方式に限る。**
    // 2026-09-12、`master/courier-rates.json` の `conclusions.courier_lineup_diffs` を
    // 配線した結果、FROM JAPAN・Buyee も Neokyo と同じく米国宛にはEMS（日本郵便）を
    // 売っていないと確認済みなので、この2社もEMSでは比較不能になる——
    // ZenMarket と Jauce の2社だけが米国向けEMSを持つ。
    for (const id of ['zenmarket', 'jauce']) {
      expect(byId(us, id).comparable, id).toBe(true);
    }
    for (const id of ['buyee:consolidated', 'fromjapan']) {
      expect(byId(us, id).comparable, id).toBe(false);
      expect(byId(us, id).notComparableReason, id).toContain('does not ship');
    }
  });

  test("'cheapest' skips a method the service does not ship there, rather than falling back to it", () => {
    // 米国では Neokyo に選べる日本郵便が1つも無い。**だがP2 1で宅配便を繋いだので、
    // Neokyo は米国では日本郵便の代わりに宅配便で比較可能になる**——「日本郵便が
    // 無い＝比較不能」ではなく「その社がその国で売っている経路（宅配便）で見る」。
    const row = byId(compare({ items: items(5, 600), country: 'US', method: 'cheapest' }).rows, 'neokyo');
    expect(row.comparable).toBe(true);
    expect(row.method).toMatch(/^courier-/);
    // だが宅配便の目的地側手数料は未公表なので、上限は必ず開いたまま（P2 3）。
    expect(row.total.high).toBeNull();
  });

  test("'cheapest' never picks a method that costs more than another eligible non-surface one", () => {
    // **Surface はこの比較から外す**（P2 4）——最安の定義そのものが Surface を
    // 除外しているので、Surface と比べて負けることは意図した挙動（ZenMarket→US
    // 600g で EMS ¥7,900 が Surface ¥3,300 より高いまま選ばれるのがまさにこの例）。
    for (const cc of COUNTRIES_ALL) {
      for (const n of [1, 3, 5]) {
        for (const row of compare({ items: items(n, 600), country: cc, method: 'cheapest' }).rows) {
          const chosen = shipOf(row).amount;
          if (chosen == null) continue;
          for (const m of ['ems', 'small-packet-air', 'parcel-air'] as const) {
            const alt = line(byId(compare({ items: items(n, 600), country: cc, method: m }).rows,
              row.id), 'intl-shipping').amount;
            if (alt != null) expect(chosen, `${cc} ${n}点 ${row.id} vs ${m}`).toBeLessThanOrEqual(alt);
          }
        }
      }
    }
  });
});

describe('Buyee splits parcels by order', () => {
  test('two rows once there is more than one order', () => {
    const rows = compare({ method: 'ems', items: items(3, 600), country: 'US' }).rows;
    const consolidated = byId(rows, 'buyee:consolidated');
    const dflt = byId(rows, 'buyee:default');
    expect(consolidated.variant).toBe('consolidated');
    expect(dflt.variant).toBe('default');
    expect(consolidated.parcels).toBe(1);
    expect(dflt.parcels).toBe(3);
    expect(dflt.tag).toBe('3 orders · 3 parcels');
    expect(consolidated.tag).toContain('you must request this');
  });

  test('splitting costs more on the courier — but not on the US clearance fee, which is zero here', () => {
    // **method を EMS からBuyeeの実測宅配便（`courier-buyee-air`）に変更した**
    // （2026-09-12）。Buyee は米国宛に EMS（日本郵便）を一切出していないと確認済み
    // （`master/courier-rates.json` の `conclusions.courier_lineup_diffs` を配線）ので、
    // 以前この場所で使っていた `method: 'ems'` は今は US で Buyee を比較不能にする
    // ——実際に Buyee が米国へ売っている宅配便で同じ「個口を増やすほど高くなる」
    // 性質を確かめる。
    const rows = compare({ method: 'courier-buyee-air', items: items(3, 600), country: 'US' }).rows;
    const consolidated = byId(rows, 'buyee:consolidated');
    const dflt = byId(rows, 'buyee:default');
    expect(line(consolidated, 'intl-shipping').amount).toBe(4607);
    expect(line(dflt, 'intl-shipping').amount).toBe(13578);
    // **3点×¥3,000 は $2,500 の事前納付帯の中**。Zonos で関税が事前納付されるので
    // 配達時に徴収するものが無く、USPS の手数料も立たない（IMM 712.11）。
    // 個口を増やしても 0 のまま——**個口が効くのは手数料が立つ帯だけ**。
    expect(line(consolidated, 'clearance').amount).toBe(0);
    expect(line(dflt, 'clearance').amount).toBe(0);
    expect(dflt.total.low).toBeGreaterThan(consolidated.total.low);
  });

  test('above the $2,500 prepayment band the clearance fee is per parcel, so splitting triples it', () => {
    // 1点 ¥500,000 × 3点。個口あたりの申告額が $2,500 を超えるので $9.35 が立つ。
    const rows = compare({ method: 'ems', items: items(3, 600, 500_000), country: 'US' }).rows;
    const consolidated = byId(rows, 'buyee:consolidated');
    const dflt = byId(rows, 'buyee:default');
    // USD 9.35 × ¥156.25 × 3個口を最後に一度だけ丸める（¥1,461 の3倍ではない）。
    expect(line(consolidated, 'clearance').amount).toBe(1461);
    expect(line(dflt, 'clearance').amount).toBe(4383);
    expect(line(dflt, 'clearance').note).toContain('USD 9.35 × 3 parcels');
  });

  test('the purchase fee is per order, so splitting does not change it', () => {
    const rows = compare({ method: 'ems', items: items(3, 600), country: 'US' }).rows;
    expect(line(byId(rows, 'buyee:consolidated'), 'purchase-fee').amount).toBe(1500);
    expect(line(byId(rows, 'buyee:default'), 'purchase-fee').amount).toBe(1500);
  });

  test('a single order gives one Buyee row and no variant', () => {
    const rows = compare({ method: 'ems', items: items(1, 600), country: 'US' }).rows;
    expect(rows.filter((r) => r.serviceId === 'buyee')).toHaveLength(1);
    const only = byId(rows, 'buyee');
    expect(only.variant).toBeNull();
    expect(only.label).toBe('Buyee');
    expect(only.parcels).toBe(1);
  });

  // ── docs/DESIGN-BOX-SIZE.md §2⑤（オーナー確定 2026-09-12）: 各口の申告額はその口に
  // 実際に入っている商品の合計額であって、カート全額の均等割りではない。
  // ここでは店舗が違う2点セットを作り、均等割りだったら免税限度をまたがない額
  // （€150 の半分ずつ）でも、実際の内訳（安い店の2点／高い店の1点）で判定すると
  // 高いほうの個口だけが限度を超えることを確認する——これが均等割りの誤り。
  describe('per-parcel declared value replaces the even split (§2⑤)', () => {
    const shopItem = (id: string, shop: string, priceYen: number): Item => item({
      id, priceYen, weightG: 600, site: 'rakuten',
      url: `https://item.rakuten.co.jp/${shop}/${id}/`,
    });

    test('conservation: the sum of per-parcel declared values equals the cart total exactly', () => {
      // 店A2点（安い）＋店B1点（高い）＝2注文＝2個口。
      const cart = [
        shopItem('a1', 'shop-a', 3000), shopItem('a2', 'shop-a', 3000), shopItem('b1', 'shop-b', 30_000),
      ];
      const rows = compare({ method: 'ems', items: cart, country: 'DE' }).rows;
      const dflt = byId(rows, 'buyee:default');
      expect(dflt.parcels).toBe(2);
      // 商品行（Items）は依然カート全額——申告額の按分だけを変えたのであって、
      // 買い手が払う商品代の合計自体は動かさない。
      expect(line(dflt, 'items').amount).toBe(36_000);
      // **T1: このテストが本来 conservation と呼んでいるのは Items 行（カート合計）
      // ではなく、個口ごとの申告額（`Row.boxes[].declaredYen`）の合計がカート全額と
      // 1円もずれずに一致すること。** Items 行は `items` から直接合計しているだけで、
      // 個口分割（`packOfGroup`）の実装を一切通らない——`declaredYen` が壊れても
      // Items 行は無傷で、このテストは検知できなかった（ミューテーション実証はPR参照）。
      expect(dflt.boxes.reduce((a, b) => a + b.declaredYen, 0)).toBe(36_000);
    });

    test('a high-value order is taxed on its own declared value, not on an averaged-down figure', () => {
      const cart = [
        shopItem('a1', 'shop-a', 3000), shopItem('a2', 'shop-a', 3000), shopItem('b1', 'shop-b', 30_000),
      ];
      const rows = compare({ method: 'ems', items: cart, country: 'DE' }).rows;
      const dflt = byId(rows, 'buyee:default');
      // 均等割りなら ¥36,000 ÷ 2 = ¥18,000/個口（≈€99）——EU の €150 免税限度の
      // どちらの個口も下回り、DE の「限度以下は€3定額」の枝にしか入らなかった
      // （このテストが以前は「定額のみ」で通っていた形）。実際の内訳は店Aの個口
      // ¥6,000（≈€33、定額€3×2点のまま）／店Bの個口 ¥30,000（≈€165、限度超）
      // ——店Bの個口だけ 4.1% の従価税に切り替わるはずで、定額だけの場合より高くなる。
      const flatOnlyYen = Math.round(3 * 3 * rateFor('EUR')); // 3点すべてが€3定額だった場合
      expect(line(dflt, 'duty').amount).toBeGreaterThan(flatOnlyYen);
    });

    test('when every order is individually under the threshold, both get the flat per-item duty (even split agrees here too)', () => {
      // DE は €150 以下では均等割り・実際の内訳のどちらで判定しても
      // 「1点あたり€3定額」という同じ枝に入る——ここは新旧のロジックが一致する場合。
      const cart = [
        shopItem('a1', 'shop-a', 3000), shopItem('a2', 'shop-a', 3000), shopItem('b1', 'shop-b', 3000),
      ];
      const rows = compare({ method: 'ems', items: cart, country: 'DE' }).rows;
      const dflt = byId(rows, 'buyee:default');
      const eurYen = rateFor('EUR');
      expect(line(dflt, 'duty').amount).toBe(Math.round(3 * 3 * eurYen));
    });

    test('a single parcel (no split) is unaffected: declared value is simply the cart total', () => {
      const rows = compare({ method: 'ems', items: items(2, 600, 30_000), country: 'DE' }).rows;
      const row = byId(rows, 'neokyo'); // 個口を割らない社
      expect(row.parcels).toBe(1);
      expect(line(row, 'items').amount).toBe(60_000);
    });
  });

  test('the other four services stay at one parcel', () => {
    const rows = compare({ method: 'ems', items: items(4, 600), country: 'US' }).rows;
    for (const id of ['neokyo', 'zenmarket', 'fromjapan', 'jauce']) {
      expect(byId(rows, id).parcels, id).toBe(1);
    }
    // 一次情報で確認できていない社にはその旨を出す。
    expect(byId(rows, 'zenmarket').tag).toContain('assumed');
    expect(byId(rows, 'neokyo').tag).not.toContain('assumed');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// **docs/DESIGN-BOX-SIZE.md §2④（184〜190行、オーナー確定 2026-09-12）ここから実装。**
// 「配送方式の上限（重量: 小形包装物2kg / EMS・国際小包30kg。寸法: 別途）を超えたら
// 箱を増やす」。`splitByWeightLimit`（`./parcels.ts`）が実際の分割を行う——
// このブロックは conservation・決定性・タイブレーク・Buyee の店舗分割との合成を固定する。
// ─────────────────────────────────────────────────────────────────────────────
describe('§2④: adding a box when a method\'s own limit is exceeded', () => {
  const shopItem = (id: string, shop: string, weightG: number, priceYen: number): Item => item({
    id, priceYen, weightG, site: 'rakuten', url: `https://item.rakuten.co.jp/${shop}/${id}/`,
  });

  test('composes with the per-shop split: a shop group that itself exceeds the limit'
    + ' splits further, but never merges with another shop\'s items', () => {
    // 店A: 4点×600g（同梱すると梱包後3.18kgで小形包装物2kg超）。店B: 1点×600g（単独で収まる）。
    // Buyee default は店ごとに個口を分ける（§2⑤の下地）。店Aの個口は、その下地の
    // **内側**でさらに方式の上限により分割される（§2④）——店Bの商品と混ざらない。
    const cart = [
      shopItem('a1', 'shop-a', 600, 1000), shopItem('a2', 'shop-a', 600, 1000),
      shopItem('a3', 'shop-a', 600, 1000), shopItem('a4', 'shop-a', 600, 1000),
      shopItem('b1', 'shop-b', 600, 1000),
    ];
    const rows = compare({ items: cart, country: 'DE', method: 'small-packet-air' }).rows;
    const dflt = byId(rows, 'buyee:default');
    // 店Aの下地（4点2.4kg）が2箱に分かれ、店Bの下地（1点0.6kg）はそのまま1箱——
    // 合計3個口。「箱を増やす」がゼロか全部かではなく、超えた下地だけに効くことを示す。
    expect(dflt.parcels).toBe(3);
    // consolidated 変種（店の下地が無く、全5点が最初から1グループ）も、
    // 同じ方式の上限で分割される——店の区別が無いので、5点が方式の上限だけで分かれる。
    const together = byId(rows, 'buyee:consolidated');
    expect(together.parcels).toBeGreaterThan(1);
    // 保全: 申告額（Items行）は分割の有無によらずカート全額のまま。
    expect(line(dflt, 'items').amount).toBe(5000);
    expect(line(together, 'items').amount).toBe(5000);
  });

  test('conservation: splitting a single-parcel service\'s group changes which parcel'
    + ' each item\'s declared value lands in, but the cart-wide duty base is exact', () => {
    // ZenMarket（店の下地を持たない=1グループ）: 重い安物×2 + 軽い高額品×1。
    // 3点合計の梱包後重量が EMS の 30kg を超えるので2箱に分かれる
    // （`splitByWeightLimit` のタイブレーク: 重量降順・同点は入力順）。
    // **重い順に詰めるので、最初の箱に高額の軽い商品が相乗りし、もう一方の箱は
    // 安い重量物だけになる**——均等割りなら両方の個口がEUの€150免税限度を
    // 下回っていたはずが、実際の内訳では片方だけが限度を超える。
    const cart = [
      item({ id: 'heavy1', priceYen: 1000, weightG: 15_000, site: 'zenmarket' as never }),
      item({ id: 'heavy2', priceYen: 1000, weightG: 15_000, site: 'zenmarket' as never }),
      item({ id: 'light-expensive', priceYen: 40_000, weightG: 100, site: 'zenmarket' as never }),
    ];
    const rows = compare({ method: 'ems', items: cart, country: 'DE' }).rows;
    const row = byId(rows, 'zenmarket');
    expect(row.parcels).toBe(2);
    expect(line(row, 'items').amount).toBe(42_000); // 保全: 商品代の合計は動かない
    // **T1**: Items 行ではなく箱ごとの申告額（`declaredYen`）の合計で確かめる——
    // ここが本来「conservation」というテスト名が指しているもの。上のテストと同じ理由。
    expect(row.boxes.reduce((a, b) => a + b.declaredYen, 0)).toBe(42_000);
    // 均等割り（¥14,000/個口 ≈ €77、どちらも限度以下）なら定額分だけで済んだはずの
    // 関税が、実際の内訳（片方の個口が限度超）では定額のみより高くなる。
    const eurYen = rateFor('EUR');
    const flatOnlyYen = Math.round(3 * 3 * eurYen); // 3点すべてが€3定額だった場合
    expect(line(row, 'duty').amount).toBeGreaterThan(flatOnlyYen);
  });

  test('determinism: the same cart always produces the same split, including weight ties', () => {
    const cart = items(6, 3000, 2000);
    const run = () => compare({ method: 'ems', items: cart, country: 'US' });
    const a = run();
    const b = run();
    expect(JSON.stringify(a.rows)).toBe(JSON.stringify(b.rows));
    for (const id of ['fromjapan', 'zenmarket', 'jauce']) {
      expect(byId(a.rows, id).parcels, id).toBe(byId(b.rows, id).parcels);
    }
  });

  test('a single item heavier than the method\'s own limit makes that method unusable, even'
    + ' after splitting — not an oversized parcel we still price', () => {
    // docs/DESIGN-BOX-SIZE.md §2④ 自体は、1点だけで方式の上限を超える場合の扱いを
    // 明記していなかった（PR依頼文が挙げる未解決点の一つ）。「箱を増やしても
    // 解決しない以上、その方式は使えない」という読み方を採用し、ここで固定する
    // （`splitByWeightLimit` のコメント参照）。
    const rows = compare({ method: 'ems', items: items(1, 30_500), country: 'US' }).rows;
    for (const id of ['fromjapan', 'zenmarket', 'jauce']) {
      const row = byId(rows, id);
      expect(row.comparable, id).toBe(false);
      expect(line(row, 'intl-shipping').amount, id).toBeNull();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// **`Row.boxes`（オーナー確定 2026-09-12）**: `buildRow` が実際に使った個口の
// 内訳を、捨てずに公開する。これが無いあいだ、UI 側（`ParcelView`、当時の `boxSplit.ts`——後に削除）
// はこの分解を自前で再計算しようとして、この行が実際に選んだ方式・下地と
// 食い違うバグを2種類作った（EMSの上限を無条件に使う／店舗の切れ目を一律に
// 適用する）。ここで固定するのは「Row を見ればいい」が成り立つこと。
// ─────────────────────────────────────────────────────────────────────────────
describe('Row.boxes: the per-parcel breakdown this row actually used', () => {
  test('**回帰フィクスチャ**: DE/3点×600g/cheapest は Buyee の方式を ems ではなく'
    + ' small-packet-air に決める（#85）——boxes は small-packet-air の上限（2kg）'
    + ' で計算されていて、EMS の30kg基準の絵とは箱数・申告額が違って当然', () => {
    const rows = compare({ items: items(3, 600), country: 'DE', method: 'cheapest' }).rows;
    const split = byId(rows, 'buyee:default');
    const together = byId(rows, 'buyee:consolidated');
    expect(split.method).toBe('small-packet-air');
    expect(together.method).toBe('small-packet-air');

    // split（店ごと=商品ごと、yahoo-auctions は per-listing）: 3個口、
    // どれも小形包装物の2kg上限（600g×1.2+300=1,020g）を大きく下回るので
    // 重量では分かれない——箱ごとの理由は per-listing。
    expect(split.boxes).toHaveLength(3);
    expect(split.boxes.every((b) => b.reason === 'per-listing')).toBe(true);
    expect(split.boxes.every((b) => b.itemIndices.length === 1)).toBe(true);
    expect(split.boxes.reduce((a, b) => a + b.declaredYen, 0)).toBe(9000); // 保全

    // consolidated（店の下地が無い=1グループ）: 3点まとめて梱包後
    // 1,800g×1.2+300=2,460g が小形包装物の2kg上限を超えるので、
    // **重量上限で**2箱に分かれる——店舗とは無関係な理由。
    expect(together.boxes.length).toBeGreaterThan(1);
    expect(together.boxes.every((b) => b.reason === 'weight-limit')).toBe(true);
    expect(together.boxes.reduce((a, b) => a + b.declaredYen, 0)).toBe(9000); // 保全
    expect(together.boxes.length).toBe(together.parcels);
    expect(split.boxes.length).toBe(split.parcels);
  });

  test('identified-shop: two items resolved to the same rakuten shop share one box'
    + ' and are told apart from a per-listing singleton in the same cart', () => {
    const cart = [
      item({
        id: 's1', priceYen: 2000, weightG: 300,
        site: 'rakuten', url: 'https://item.rakuten.co.jp/shop-a/s1/',
      }),
      item({
        id: 's2', priceYen: 3000, weightG: 300,
        site: 'rakuten', url: 'https://item.rakuten.co.jp/shop-a/s2/',
      }),
      item({ id: 'auction', priceYen: 4000, weightG: 300, site: 'yahoo-auctions' }),
    ];
    const row = byId(compare({ items: cart, country: 'DE', method: 'small-packet-air' }).rows, 'buyee:default');
    expect(row.boxes).toHaveLength(2);
    const shopBox = row.boxes.find((b) => b.itemIndices.length === 2)!;
    const auctionBox = row.boxes.find((b) => b.itemIndices.length === 1)!;
    expect(shopBox.reason).toBe('identified-shop');
    expect(shopBox.declaredYen).toBe(5000); // s1+s2 の合計、均等割りではない
    expect(auctionBox.reason).toBe('per-listing');
    expect(auctionBox.declaredYen).toBe(4000);
  });

  test('unresolved-shop: a listing we cannot read a shop from is its own box,'
    + ' labeled as unresolved — not claimed to be a known different shop', () => {
    // 2点以上ないと Buyee の default/consolidated 変種自体が生まれない
    // （`rowsFor`——1点だけなら変種の区別が無い `null` variant になり、店舗分割
    // 自体が効かない）。もう1点は識別できる店（rakuten）にして、同じカートの中で
    // 'unresolved-shop' と他の理由が混ざらないことも一緒に見る。
    const cart = [
      item({ id: 'mystery', priceYen: 1000, weightG: 300, site: 'other' }),
      item({
        id: 'known', priceYen: 2000, weightG: 300,
        site: 'rakuten', url: 'https://item.rakuten.co.jp/shop-a/known/',
      }),
    ];
    const row = byId(compare({ items: cart, country: 'DE', method: 'small-packet-air' }).rows, 'buyee:default');
    expect(row.boxes).toHaveLength(2);
    const mysteryBox = row.boxes.find((b) => b.declaredYen === 1000)!;
    const knownBox = row.boxes.find((b) => b.declaredYen === 2000)!;
    expect(mysteryBox.reason).toBe('unresolved-shop');
    expect(knownBox.reason).toBe('identified-shop');
  });

  test('a row with no shop split at all (variant: null, single item) still reports'
    + ' its box(es) via Row.boxes, conserving the cart total', () => {
    const row = byId(compare({ items: items(1, 600), country: 'DE', method: 'small-packet-air' }).rows, 'buyee');
    expect(row.boxes.length).toBe(row.parcels);
    expect(row.boxes.reduce((a, b) => a + b.declaredYen, 0)).toBe(3000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// **`ParcelBox.tax`（コーディネーター指摘 2026-09-12）**: 「免税限度未満＝無税」は
// 5カ国中5カ国で誤る（GB/DE/FR/AU は VAT 免税限度が実質0、DE/FR は免税限度以下でも
// 定額関税、SG は関税の限度が無限大）。画面がしきい値と申告額を自分で比べるのではなく、
// `taxLines()` が個口ごとに出した判定（`kind`+`yen`）をそのまま渡せていることを固定する。
// ─────────────────────────────────────────────────────────────────────────────
describe('ParcelBox.tax: the box-level duty/VAT verdict, not a threshold the UI re-derives', () => {
  test('GB: a box under the £135 duty line is duty-free, but VAT still applies from'
    + ' the first pound (vatFreeLimit: 0) — under the duty line does not mean untaxed', () => {
    const row = byId(compare({ items: items(1, 300, 3000), country: 'GB', method: 'small-packet-air' }).rows, 'buyee');
    expect(row.boxes).toHaveLength(1);
    const box = row.boxes[0]!;
    expect(box.tax.duty.kind).toBe('free');
    expect(box.tax.duty.yen).toBe(0);
    expect(box.tax.vat.kind).toBe('rate');
    expect(box.tax.vat.yen).toBeGreaterThan(0);
  });

  test('DE/FR: a box under the €150 duty line still owes a flat €3/item duty —'
    + ' \'flat\' is not \'free\', and must not render as duty-free', () => {
    for (const cc of ['DE', 'FR'] as const) {
      const row = byId(compare({ items: items(1, 300, 3000), country: cc, method: 'small-packet-air' }).rows, 'buyee');
      const box = row.boxes[0]!;
      expect(box.tax.duty.kind, cc).toBe('flat');
      expect(box.tax.duty.yen, cc).toBeGreaterThan(0);
      expect(box.tax.duty.kind, cc).not.toBe('free');
      expect(box.tax.vat.kind, cc).toBe('rate'); // vatFreeLimit: 0 — always taxed
    }
  });

  test("SG: duty is 'no-duty' (the limit is infinite — there is no duty line to draw),"
    + ' distinct from being merely under a real threshold', () => {
    const row = byId(compare({ items: items(1, 300, 3000), country: 'SG', method: 'small-packet-air' }).rows, 'buyee');
    const box = row.boxes[0]!;
    expect(box.tax.duty.kind).toBe('no-duty');
    expect(box.tax.duty.kind).not.toBe('free'); // 'free' would wrongly imply a threshold line exists
    expect(box.tax.duty.yen).toBe(0);
    // 400 SGD 未満は代行が決済時に GST を徴収する（seller-collects）。
    expect(box.tax.vat.kind).toBe('seller-collects');
  });

  test('US: the duty-free limit is 0, so nothing can ever be classified \'free\' —'
    + " every box is 'rate' (or 'unknown'), which itself says the box is taxed", () => {
    const row = byId(compare({ items: items(1, 300, 100), country: 'US', method: 'small-packet-air' }).rows, 'buyee');
    const box = row.boxes[0]!;
    expect(box.tax.duty.kind).not.toBe('free');
    expect(['rate', 'unknown']).toContain(box.tax.duty.kind);
  });

  test('CA: the naive mental model (duty and VAT thresholds equal, at 20) actually holds'
    + ' — both free under CAD 20', () => {
    const row = byId(compare({ items: items(1, 300, 500), country: 'CA', method: 'small-packet-air' }).rows, 'buyee');
    const box = row.boxes[0]!;
    expect(box.tax.duty.kind).toBe('free');
    expect(box.tax.vat.kind).toBe('free');
  });

  test('a cart split into boxes on either side of a duty threshold shows each box\'s'
    + ' own verdict, not one verdict for the whole shipment', () => {
    // DE の下限 €150 をまたぐよう、安い個口と高い個口を店舗違いで分ける
    // （Buyee default は店舗ごとに別送——`groupByShop`）。
    const cheap = item({
      id: 'cheap', priceYen: 3000, weightG: 300,
      site: 'rakuten', url: 'https://item.rakuten.co.jp/shop-a/cheap/',
    });
    const pricey = item({
      id: 'pricey', priceYen: 40_000, weightG: 300,
      site: 'rakuten', url: 'https://item.rakuten.co.jp/shop-b/pricey/',
    });
    const row = byId(
      compare({ items: [cheap, pricey], country: 'DE', method: 'small-packet-air' }).rows,
      'buyee:default',
    );
    expect(row.boxes).toHaveLength(2);
    const cheapBox = row.boxes.find((b) => b.declaredYen === 3000)!;
    const priceyBox = row.boxes.find((b) => b.declaredYen === 40_000)!;
    expect(cheapBox.tax.duty.kind).toBe('flat'); // 免税限度以下でも定額関税
    expect(priceyBox.tax.duty.kind).toBe('rate'); // 限度超なので税率課税
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

  test('the example cart: ZenMarket wins, and the US total is not indeterminate (P1-4)', () => {
    // **FROM JAPAN は米国宛にEMS（日本郵便）を売っていない**（2026-09-12、
    // `master/courier-rates.json` の `conclusions.courier_lineup_diffs` を配線。
    // 以前はここに `unavailableIn` が無く、実際には売っていない米国向けEMSで
    // FROM JAPAN を1位にしていた欠陥）ので、EMSでの米国比較に残るのは
    // ZenMarket と Jauce の2社だけになり、ZenMarket が1位になる。
    const r = compare({ method: 'ems', items: EXAMPLE, country: 'US' });
    expect(r.rankStable).toBe(true);
    expect(r.rankIndeterminate).toBe(false);
    expect(r.rows[0]!.id).toBe('zenmarket');
    // 幅の無いライン（P25=P75）は動かしても同じなので、見ない。
    expect(r.weightSensitivity['i0']).toBeUndefined();
    expect(r.weightSensitivity['i1']).toEqual({
      lowG: 380, highG: 600,
      winnerAtLow: 'ZenMarket', winnerAtHigh: 'ZenMarket',
      onlyPricedAtLow: false, onlyPricedAtHigh: false,
      decisive: false,
    });
  });

  test('add one item off the table and **two** weights start deciding: the assumed one and the Nendoroid', () => {
    // **国が米国からカナダに変わった。境界（380–600 g / 500 g–10 kg）も勝者も同じ。**
    // この反転は軽い側が Neokyo で、Neokyo は米国宛に日本郵便を売っていないため
    // 米国では片側が存在しない。**F07（2026-09-12）でドイツはこの形を失った**
    // （Neokyo・FROM JAPAN の新しい推定 deposit で ZenMarket が全域を独占するように
    // なったため）——同じ形が残るのはカナダ。
    const r = compare({ method: 'ems', items: [...EXAMPLE, assumed('i2')], country: 'CA' });
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

  test('a single item off the table: ZenMarket always wins, and the US total is not indeterminate (P1-4)', () => {
    // FROM JAPAN は米国宛にEMSを売っていない（2026-09-12配線）ので、EMSでの米国
    // 比較に残るのは ZenMarket と Jauce の2社だけ。ZenMarket が500g〜10kgの全域で
    // 1位のまま（winnerAtLow/High とも ZenMarket、`decisive` は false）。
    const r = compare({ method: 'ems', items: [assumed('i2')], country: 'US' });
    expect(r.rankStable).toBe(true);
    expect(r.rankIndeterminate).toBe(false);
    expect(r.weightSensitivity['i2']).toMatchObject({
      lowG: 500, highG: 10000, winnerAtLow: 'ZenMarket', winnerAtHigh: 'ZenMarket', decisive: false,
    });
  });

  test('two K-Pop photobooks (800–1,600 g each): either one alone flips the winner', () => {
    // **国が米国からカナダに変わった。**反転の軽い側は Neokyo で、Neokyo は米国宛に
    // 日本郵便を売っていない。独・英・仏ではこの荷物の1位が両端とも ZenMarket に
    // なって反転しないので、**同じ形が残るのはカナダ**（実測で7カ国を走査）。
    const r = compare({ method: 'ems',
      items: [table('a', 1000, [800, 1600]), table('b', 1000, [800, 1600])], country: 'CA',
    });
    for (const id of ['a', 'b']) {
      expect(r.weightSensitivity[id], id).toMatchObject({
        winnerAtLow: 'Neokyo', winnerAtHigh: 'FROM JAPAN', decisive: true,
      });
    }
  });

  test('kendo armour: the胴 alone reshuffles the (now 2-company) bracket; the cart as a whole is not indeterminate', () => {
    // F07（2026-09-12、payment-fee-rates）: 以前はドイツで胴（1,500–7,500 g）が
    // 単独で枠を動かしていたが、Neokyo/FROM JAPAN の新しい推定 deposit（3.5%）で
    // 独・英・仏では ZenMarket が全域で1位を独占するようになり、この形が崩れた。
    // 同じ形（1位 FROM JAPAN が上限不明のまま全域で勝ち、袴の狭い方は動かないが
    // 胴の広いスプレッドだけで枠が動く）が残るのはカナダ。袴の帯も
    // 1,500–2,500 g だと胴と一緒に枠を動かしてしまうようになったので、
    // 1,500–2,000 g に狭めて「動かない」方を保った。
    const r = compare({ method: 'ems',
      items: [table('do', 2000, [1500, 7500]), table('hakama', 1500, [1500, 2000]), table('tare', 1500, [1500, 1500])],
      country: 'CA',
    });
    expect(r.rows[0]!.id).toBe('fromjapan');
    // 胴の spread（1,500–7,500 g）はそれだけで枠（FROM JAPAN・ZenMarket 入れ替わり）を
    // 動かすほど広い。袴（1,500–2,000 g）は動かさない。
    expect(r.weightSensitivity['do']!.decisive).toBe(true);
    expect(r.weightSensitivity['hakama']!.decisive).toBe(false);
    expect(r.weightSensitivity['tare']).toBeUndefined();
    // 基準の重量（1x）では FROM JAPAN が1位で総額が上限不明だが、ZenMarket
    // （閉区間・確定額）が明確に2位で、Neokyo 以下とは確定した差がある
    // ——**P1-4（オーナー確定 2026-09-11）:** 上限不明の1位がいても、閉区間
    // 同士で確実に差が付く社は「同等」にしない。`isIndeterminate` は「比較可能な
    // 全社の上端が置けない」ときだけ真になるよう絞ったので、このケースは
    // 「不安定」（`rankStable: false`）ではあっても「判定不能」ではない。
    expect(r.rankStable).toBe(false);
    expect(r.rankIndeterminate).toBe(false);
    expect(r.rankStabilityNote).toContain('at a third of our weight estimate');
    expect(r.rankStabilityNote).not.toContain('sit within the same uncertainty');
  });

  test('a weight the user typed is theirs: we do not second-guess it', () => {
    const r = compare({ method: 'ems', items: [user('a', 200), user('b', 200)], country: 'US' });
    expect(r.weightSensitivity).toEqual({});
  });

  test('§2④ implemented: the heavy end no longer leaves the EMS table for this cart', () => {
    // 和弓 7 kg × 3 + 仮置き1点（500〜10,000gの間で動く）。
    //
    // **このテストは以前、仮置きを10 kgにすると同梱行の梱包後重量が30 kgを
    // 超えてEMS公表表を出て脱落し、注文ごとに分けるBuyee defaultだけが
    // 値段を持つ——という「唯一値段が付く社」の勝ち方を固定していた。**
    //
    // `splitByWeightLimit`（§2④）を実装した今、7,000g・10,000gという
    // 個々の商品重量はどちらも単体では十分軽い（梱包後 8.7kg・12.3kg、
    // どちらも30kg以下）ので、4点の同梱グループが上限を超えても箱を2つに
    // 分ければ収まる——Buyee default の専売は起きず、1位（ZenMarket。FROM JAPAN は
    // 米国宛にEMSを売っていないため2026-09-12配線後は比較から外れる）は
    // 仮置きの重量が動いても変わらない（`decisive: false`）。
    const r = compare({ method: 'ems',
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
      winnerAtLow: 'ZenMarket', winnerAtHigh: 'ZenMarket',
      onlyPricedAtLow: false, onlyPricedAtHigh: false,
      decisive: false,
    });
  });

  test('with an unknown weight in the cart there is no base weight to move, so the map is empty', () => {
    const r = compare({ method: 'ems', items: [item({ id: 'a', weightG: null, weightTier: 'none' })], country: 'US' });
    expect(r.bands).not.toBeNull();
    expect(r.weightSensitivity).toEqual({});
  });

  test('the sensitivity map never contradicts a direct run at that weight', () => {
    for (const cc of COUNTRIES_ALL) {
      const items = [...EXAMPLE, assumed('i2')];
      const r = compare({ method: 'ems', items, country: cc });
      for (const [id, s] of Object.entries(r.weightSensitivity)) {
        for (const [g, expected] of [[s.lowG, s.winnerAtLow], [s.highG, s.winnerAtHigh]] as const) {
          const moved = items.map((i) => (i.id === id ? { ...i, weightG: g } : i));
          const direct = winnerOf(compare({ method: 'ems', items: moved, country: cc }).rows);
          expect(direct?.label ?? null, `${cc} ${id} at ${g} g`).toBe(expected);
        }
      }
    }
  });
});

describe('unknown weight falls back to EMS steps', () => {
  /**
   * **国が米国からカナダに変わった。段（500 g〜10 kg）も帯の数も同じ。**
   * 帯をまたぐ反転は軽い帯の勝者が Neokyo で、Neokyo は米国宛に日本郵便を
   * 売っていない（自社の計算機が3方式すべてに
   * "Not available or suspended in your country."）。米国では2点でも全帯で
   * FROM JAPAN のまま＝「重量が分からないと1位が決まらない」という現象自体が
   * 米国では観測できないので、観測できる国で縛る。
   */
  const unknown = (n: number) => compare({ method: 'ems',
    items: Array.from({ length: n }, (_, i) => item({ id: `u${i}`, weightG: null, weightTier: 'none' })),
    country: 'CA',
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
    // 代表段（3kg）は FROM JAPAN が1位で総額が上限不明だが、比較可能な行の中に
    // 閉区間同士で確定した差が残っている（P1-4、オーナー確定 2026-09-11:
    // `isIndeterminate` は「比較可能な全社の上端が置けない」ときだけ真）ので、
    // 「不安定」ではあっても「判定不能」ではない。1位が段で入れ替わること自体は
    // 変わっていない（上の cheapestRowIds の並びがそれを示す）。
    expect(r.rankStable).toBe(false);
    expect(r.rankIndeterminate).toBe(false);
    expect(r.rankStabilityNote).not.toContain('sit within the same uncertainty');
  });

  test('in the US every band keeps the same bracket — ZenMarket leads throughout', () => {
    // 米国には Neokyo・FROM JAPAN・Buyee が居ない（いずれもEMS/日本郵便を売って
    // いないと2026-09-12確認、`master/courier-rates.json` の
    // `conclusions.courier_lineup_diffs` を配線）ので、EMSでの米国比較に残るのは
    // ZenMarket と Jauce の2社だけ——どの帯でも1位は ZenMarket のまま。
    const r = compare({ method: 'ems',
      items: Array.from({ length: 2 }, (_, i) => item({ id: `u${i}`, weightG: null, weightTier: 'none' })),
      country: 'US',
    });
    expect(r.bands!.every((b) => b.cheapestRowIds.join() === 'zenmarket')).toBe(true);
    expect(r.rankStable).toBe(true);
    expect(r.rankIndeterminate).toBe(false);
    expect(r.rankStabilityNote).toBe(
      'In the recommended range at every step from 500 g to 10 kg: ZenMarket.');
    // どの帯でも Neokyo・FROM JAPAN・Buyee は値段を持たない。
    for (const band of r.bands!) {
      for (const id of ['neokyo', 'fromjapan', 'buyee:default', 'buyee:consolidated']) {
        expect(band.rows.find((x) => x.id === id)?.comparable ?? false, id).toBe(false);
      }
    }
  });

  test('one unknown item: FROM JAPAN leads every band, and the CA total is not indeterminate', () => {
    // F07（2026-09-12、payment-fee-rates）: Neokyo が新たに負った推定 deposit で
    // Neokyo が枠から外れ、代わりに ZenMarket が FROM JAPAN と組んで全帯を通しで
    // 枠に残るようになった——枠の集合が両端で変わらないので、以前の「不安定」から
    // 「安定」に変わった。「判定不能」ではない、という主張自体は変わっていない。
    const r = unknown(1);
    expect(r.bands!.every((b) => b.cheapestRowIds.join() === 'fromjapan')).toBe(true);
    expect(r.rankStable).toBe(true);
    expect(r.rankIndeterminate).toBe(false);
    expect(r.rankStabilityNote).toBe(
      'In the recommended range at every step from 500 g to 10 kg: FROM JAPAN and ZenMarket.');
    expect(r.rankStabilityNote).not.toContain('sit within the same uncertainty');
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
    const cheapestPerBand = r.bands!.map((b) => b.rows[0]!.total.low);
    expect(cheapestPerBand).toEqual([...cheapestPerBand].sort((a, b) => a - b));
  });

  test('ranges cover every band, and the mid band is the representative board', () => {
    const r = unknown(2);
    for (const id of Object.keys(r.rowTotalRange!)) {
      const lows = r.bands!.flatMap((b) => b.rows.filter((x) => x.id === id).map((x) => x.total.low));
      const highs = r.bands!.flatMap((b) => b.rows.filter((x) => x.id === id).map((x) => x.total.high));
      // **上端が置けない行は `null` のまま**（外部レビュー⑤-c）——段のどれか1つでも
      // `total.high === null` なら、全段を通じた上端も `null`。段ごとの下端の最大に
      // 丸めて閉区間の顔をさせない。
      const expectedHigh = highs.some((h) => h === null) ? null : Math.max(...(highs as number[]));
      expect(r.rowTotalRange![id]).toEqual([Math.min(...lows), expectedHigh]);
      const diffs = r.bands!.flatMap((b) => b.rows.filter((x) => x.id === id).map((x) => x.diff));
      expect(r.rowDiffRange![id]).toEqual([Math.min(...diffs), Math.max(...diffs)]);
    }
    const all = r.bands!.flatMap((b) => b.rows.map((x) => x.total.low));
    expect(r.totalRangeYen).toEqual([Math.min(...all), Math.max(...all)]);
    expect(r.rows).toEqual(r.bands![3]!.rows);
  });

  /**
   * ⑤-c（外部レビュー、2026-09-11）: `compare()` を直接呼ぶ利用者に、
   * 「上限不明」を閉区間の嘘として渡さない。FROM JAPAN は全国・全段で
   * 外注梱包費（`unpricedFees`）が未取得のまま——`total.high` は常に `null`。
   * `rowTotalRange` にその事実が伝わらなければ、`totalText`（RankBoard）が
   * 「¥23,700 – 54,500」のような**存在しない閉区間**を描いてしまう
   * （UI は必ず重量を入れるのでこの経路に到達しないが、`compare()` を直接
   * 呼ぶ利用者には嘘になる）。
   */
  test('an uncapped row (FROM JAPAN) keeps high: null across every band — no false closed interval', () => {
    const r = unknown(2);
    for (const band of r.bands!) {
      const fj = band.rows.find((x) => x.id === 'fromjapan')!;
      expect(fj.total.high).toBeNull();
    }
    expect(r.rowTotalRange!['fromjapan']![1]).toBeNull();
  });

  test('one unknown item among known ones still drops the whole board to bands', () => {
    const r = compare({ method: 'ems',
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
  /**
   * **実測の総額として並べるのは比較可能な行だけ。**
   * 比較不能な行も `total` に数字を持っているが、それは**最大の費目（国際送料）を
   * 欠いた合計**で、実測値と並べたら米国の Neokyo が ¥23,425 で最安に見える。
   * 落ちた行は行数と理由のほうで縛る（下の `dropped`）。
   */
  const board = (cc: CountryCode, n: number, w: number, over: Partial<Item> = {}, priceYen = 3000) =>
    compare({ method: 'ems', items: items(n, w, priceYen, over), country: cc }).rows.filter((r) => r.comparable);
  /** その国で日本郵便を売っていない社の行。米国は Neokyo の1行だけ。 */
  const dropped = (cc: CountryCode, n: number, w: number) =>
    compare({ method: 'ems', items: items(n, w), country: cc }).rows.filter((r) => !r.comparable);

  test('5 items x ¥3,000, 200 g each, to the US', () => {
    // **Neokyo が消えたのは値段が高いからではなく、米国宛に日本郵便を売っていないから。**
    // 以前ここは Neokyo を ¥29,725 で1位に置いていた。
    // **2026-09-12、FROM JAPAN・Buyee も同じ理由で消えた。**
    // `master/courier-rates.json` の `conclusions.courier_lineup_diffs` を配線した
    // 結果、FROM JAPAN・Buyee は米国宛にEMS（日本郵便）を一切出していないと
    // 実測で確認済みだったと分かった——以前はこの `unavailableIn` が無く、
    // 実際には売っていない米国向けEMSに値段を付けて比較していた欠陥。
    // 米国でEMSを売っているのは ZenMarket と Jauce の2社だけになった。
    expect(board('US', 5, 200).map((r) => [r.id, r.total.low])).toEqual([
      ['zenmarket', 32549],
      ['jauce', 34008],
    ]);
    expect(dropped('US', 5, 200).map((r) => r.id).sort())
      .toEqual(['buyee:consolidated', 'buyee:default', 'fromjapan', 'neokyo']);
  });

  test('the same basket at 600 g, 1,500 g and 3,000 g — the top two swap on the way', () => {
    // **国が米国からカナダに変わった。入れ替わりの形も ¥50 差もそのまま。**
    // 入れ替わる2社は Neokyo と FROM JAPAN で、Neokyo は米国宛に日本郵便を
    // 売っていない。米国では 600 g / 1,500 g / 3,000 g のどこでも
    // FROM JAPAN → Buyee(同梱) の並びが動かない（＝入れ替わりが観測できない）。
    // **外部レビュー⑤-b で CA の GST・州税ベースを直した**（`taxLines`。CBSA
    // Memorandum D13-3-3/D13-3-4 の value for duty は国際送料を含まないが
    // 国内送料は含む——`master/customs.json` の CA.vat.base_note どおりに
    // 揃えた）ので、CA の総額が下がった。
    // 外部レビュー2回目 A-6（2026-09-11）: CA の関税ベースを GST・州税と揃え
    // （`items + dom`、以前は `items` のみ）、全社 +¥90（国内送料への 2% 分）動いた。
    // F07（2026-09-12）: Neokyo・FROM JAPAN が新たに推定 deposit（3.5%）を負ったぶん
    // 総額が動いた。3,000g の2位は Neokyo から ZenMarket に替わった——ZenMarket は
    // 自社公表値のまま動かないが、Neokyo は推定 deposit の分だけ Neokyo 自身の総額が
    // 押し上げられ、逆転した。
    const top2 = (w: number) => board('CA', 5, w).slice(0, 2).map((r) => [r.id, r.total.low]);
    expect(top2(600)).toEqual([['neokyo', 37517], ['fromjapan', 38501]]);
    // 為替を直しても両者に同じ通関手数料が乗るだけなので、この幅は動かなかった。
    expect(top2(1500)).toEqual([['neokyo', 51507], ['fromjapan', 51558]]);
    expect(top2(3000)).toEqual([['fromjapan', 71144], ['zenmarket', 71662]]);
    // 0d: 既定45日ぶんの保管料（Buyee、無料30日超過15日×5個口）が乗って上がった。
    expect(board('CA', 5, 600)[5]).toMatchObject({ id: 'buyee:default', total: { low: 66945 } });
    // **米国では上位2社が ZenMarket・Jauce に変わった。**FROM JAPAN は米国宛に
    // EMSを売っていないと2026-09-12に確認済み（`master/courier-rates.json` の
    // `conclusions.courier_lineup_diffs` を配線）——以前ここに残っていた
    // 「FROM JAPAN → Buyee(同梱)」の並びは、実際には売っていない米国向けEMSに
    // 値段を付けていた欠陥の産物だった。
    for (const w of [600, 1500, 3000]) {
      expect(board('US', 5, w).slice(0, 2).map((r) => r.id), `${w}g`)
        .toEqual(['zenmarket', 'jauce']);
    }
  });

  test('one ¥5,000 Yahoo! Auctions item, 500 g, to the US', () => {
    // **2026-09-12: FROM JAPAN・Buyee も米国宛にEMSを売っていないと確認済みで
    // 落ちた**（`master/courier-rates.json` の `conclusions.courier_lineup_diffs`
    // を配線）。米国でEMSを比較できるのは ZenMarket と Jauce の2社だけ。
    expect(board('US', 1, 500, {}, 5000).map((r) => [r.serviceName, r.total.low])).toEqual([
      ['ZenMarket', 12666],
      ['Jauce', 13507],
    ]);
    // 以前ここに ['Neokyo', 12295] が2位で入っていた。
    expect(dropped('US', 1, 500).map((r) => r.serviceName).sort())
      .toEqual(['Buyee', 'FROM JAPAN', 'Neokyo']);
  });

  test('the same item on Rakuten reshuffles the middle — per-site fees are real', () => {
    // Jauce は楽天のサービス料がベータで無料、ZenMarket は楽天が ¥500（ヤフオクは ¥800）。
    // **2026-09-12: FROM JAPAN・Buyee は米国宛にEMSを売っていないと確認済みで
    // 落ちた**（`master/courier-rates.json` の `conclusions.courier_lineup_diffs`
    // を配線）ので、米国でEMSを比較できるのは ZenMarket と Jauce の2社だけ。
    const rows = board('US', 1, 500, { site: 'rakuten' }, 5000);
    expect(rows.map((r) => [r.serviceName, r.total.low])).toEqual([
      ['ZenMarket', 12356],
      ['Jauce', 12675],
    ]);
    expect(line(byId(rows, 'jauce'), 'service-fee').amount).toBe(0);
    expect(line(byId(rows, 'jauce'), 'ad-valorem').amount).toBe(0);
  });

  test('5 items x 600 g in all seven countries', () => {
    // **比較可能な行だけを並べる。**米国は Neokyo が日本郵便を売っていないので5行。
    const totals = Object.fromEntries(COUNTRIES_ALL.map((cc) => [
      cc, board(cc, 5, 600).map((r) => r.total.low),
    ]));
    // **CA は T23 で動いた**（州税の代表値 7.3% と Canada Post の C$9.95 が入った）。
    // 以前ここは「CA がびた一文動いていない」と書いてあり、それは州税も手数料も
    // `—` だったからで、動かないことは正しさの証拠ではなく欠落の証拠だった。
    // **AU と SG は T15（代行の前徴収 GST）で動いた。** 費目モデルが変わったので
    // ここが動くのは正しい。AU は5社とも徴収を明記しているので全行に税が乗り、
    // 課税ベースの違い（内容品価格のみ／総額）で並びまで変わった。
    // **SG は5社そろって GST が乗った。**以前は徴収を確認できた Buyee・FROM JAPAN に
    // だけ税が乗り、他3社は「—」で**その3社が税のぶん安い表**になっていた。
    // 確認できていないのは「誰が集めるか」だけで「いくら払うか」は同じなので、
    // 残り3社は国の課税ベースで推定して出す（`docs/TODO-NEXT.md` 課題1）。
    // 並びも変わる——安く見えていた3社が本来の位置に落ちた。
    // **DE は Auslagepauschale €7.50、FR は frais de gestion €8 が入って動いた**
    // （DE 全行 +¥1,362 / FR 全行 +¥1,453。Buyee の別送だけ5個口ぶん）。
    // 以前この2カ国が安く見えていたのは手数料が安いからではなく、
    // **我々が独仏の手数料を1円も入れていなかったから。**
    // **SG はこの帯（5点×¥12,800＝CIF が S$400 超）で S$10.90 が乗る。**
    // **US から1行消えた。**Neokyo が米国宛に日本郵便を売っていないと確認できたため
    // （以前ここは Neokyo を ¥36,125 で先頭に置いていた）。
    // **2026-09-12: US からさらに2行（FROM JAPAN・Buyee）消えた。**
    // `master/courier-rates.json` の `conclusions.courier_lineup_diffs` を配線した
    // 結果、この2社も米国宛にEMSを売っていないと確認済みだったと分かった——
    // 米国に残るのは ZenMarket と Jauce の2行だけ。
    // **0d（2026-09-11）で7カ国すべてが動いた。**既定45日の保管料が入り、無料期間
    // 30日の Buyee だけに課金が乗る（他4社は無料60日／Neokyo無料45日の内側で¥0）。
    // Buyee は2行（consolidated 1個口 / default 5個口）持つので、個口の数だけ額が違う
    // 形で両方が上がった——これが「全社に等しく乗らない」ことの実例。
    // **外部レビュー⑤-a（入金手数料の課税ベース）・⑤-b（CA の課税ベース）で
    // 数字が動いた。**⑤-a は決済時に徴収する VAT/GST を入金手数料の対象に含めた
    // ので ZenMarket・Jauce の総額を持つ国がわずかに上がり（GB/DE/FR の ¥1 単位の
    // ずれ）、⑤-b は CA の GST・州税ベースから国際送料だけを抜いた（国内送料は
    // 含める、コーディネーター指摘で訂正済み）ので CA が下がった。
    // 外部レビュー2回目（2026-09-11）:
    // - A-2: 保管を注文単位（5点＝5注文）で計算するよう直したので、Buyee
    //   consolidated の保管料が5倍になり、順位が下がった（各国とも consolidated の
    //   総額が上がる形で並びが変わる）。
    // - A-6: CA の関税ベースを国内送料込みに揃えたので、CA の全行が動いた。
    // F07（2026-09-12）: Neokyo・Buyee・FROM JAPAN が新たに推定 deposit（3.5%）を
    // 負ったぶん、その3社の総額が全7カ国で上がった（ZenMarket・Jauce は既に
    // deposit を持っていたので動いていない）。並びは複数国で動いた——
    // AU/CA/SG は3位以降が Neokyo→Buyee(consolidated) の逆転を含む形で入れ替わった。
    expect(totals).toEqual({
      US: [38870, 40605],
      GB: [41298, 42155, 42282, 44528, 51609, 75805],
      DE: [43912, 44528, 44896, 47142, 54223, 76961],
      FR: [44329, 44879, 45313, 47559, 54640, 77882],
      AU: [35181, 36684, 38073, 40539, 46788, 61399],
      CA: [37517, 38501, 39020, 40747, 47828, 66945],
      SG: [31954, 33265, 33457, 35178, 43431, 55347],
    });
  });
});

describe('edges', () => {
  test('no items → an empty board, not a crash', () => {
    const r = compare({ method: 'ems', items: [], country: 'US' });
    expect(r.rows).toEqual([]);
    expect(r.bands).toBeNull();
    expect(r.totalRangeYen).toBeNull();
    expect(r.hasUnknownWeight).toBe(false);
    expect(r.currency.code).toBe('USD');
  });

  test('quantity multiplies price and weight, but a repeat buy is still one order', () => {
    const rows = compare({ method: 'ems', items: [item({ id: 'a', weightG: 200, qty: 3 })], country: 'US' }).rows;
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
      // F07（2026-09-12）: Neokyo は新たに推定 deposit（`tier: 'estimate'`）を負ったので、
      // 「全行 fixed」の実演には使えなくなった——Neokyo で確定値だけの実例を示すことは、
      // まさにこの費目が Neokyo にとって推定であるという主張と両立しない。
      // **Jauce に差し替えた。**Jauce は自社公表値の deposit（`tier: 'unverified'`。
      // ¥40 の定額と率の組み合わせ方の解釈のみ未確認で、率・ベース自体は公表値。
      // `estimate` ではないので「我々の推定」扱いの行としては数えない）を持ち、
      // GB では他に estimate 行も無い。
      const row = byId(compare({ method: 'ems', items: [certain()], country: 'GB' }).rows, 'jauce');
      expect(row.lines.filter((l) => l.tier === 'estimate')).toEqual([]);
      expect(line(row, 'intl-shipping').tier).toBe('fixed');
      expect(line(row, 'intl-shipping').note).toContain('published rate');
      expect(row.approximate).toBe(false);
    });

    test('an estimated weight brings the ~ back, even though the EMS rate stays published', () => {
      // 重量は費目ではないので行の tier には出ない。ここを数えていないと、推定の重量で
      // 引いた総額が確定値の顔をする。
      const row = byId(compare({ method: 'ems',
        items: [certain({ weightTier: 'estimate' })], country: 'GB',
      }).rows, 'jauce');
      expect(line(row, 'intl-shipping').tier).toBe('fixed');
      expect(row.approximate).toBe(true);
    });

    test('an assumed domestic postage brings it back too', () => {
      const row = byId(compare({ method: 'ems',
        items: [certain({ domesticShippingYen: null })], country: 'GB',
      }).rows, 'jauce');
      expect(line(row, 'domestic-shipping').tier).toBe('estimate');
      expect(row.approximate).toBe(true);
    });

    test('the EMS line is published for all five now, so the ~ can only come from the weight', () => {
      // **この前提は 2026-09-07 に変わった。**以前は FROM JAPAN と ZenMarket が
      // `estimate`、Buyee が `unverified` で、国際送料の行が `~` の出どころだった。
      // 5社の公開計算機で EMS が公表額と1円まで一致したので、全社 `fixed` に上がった。
      //
      // **国際送料の行は5社とも `fixed`。**
      for (const s of SERVICES) {
        const row = byId(compare({ method: 'ems', items: [certain()], country: 'GB' }).rows, s.id);
        expect(line(row, 'intl-shipping').tier, s.id).toBe('fixed');
      }
      // **`~` が残る社は、国際送料以外に推定を持っている社だけ。**
      // ZenMarket は既定のサイト（ヤフオク）のサービス料が estimate（`services.ts`
      // の `perItemBySiteTier`）で、これは変わらず推定のまま——「国際送料が確定した」
      // を「行全体が確定した」と読み替えないこと。
      // **F07（2026-09-12）で ZenMarket の入金手数料自体は自社公表値の確定額
      // （`tier: 'fixed'`）に上がった**が、Neokyo が新たに推定 deposit を負ったので
      // 「確定額だけの社」の実例は Jauce に替わった。
      const rows = compare({ method: 'ems', items: [certain()], country: 'GB' }).rows;
      for (const s of SERVICES) {
        const row = byId(rows, s.id);
        const otherEstimates = row.lines
          .filter((l) => l.key !== 'intl-shipping' && l.tier === 'estimate' && l.amount !== 0);
        expect(row.approximate, `${s.id}: ~ と推定行の有無が食い違う`)
          .toBe(otherEstimates.length > 0);
      }
      expect(byId(rows, 'zenmarket').approximate).toBe(true);
      expect(line(byId(rows, 'zenmarket'), 'service-fee').tier).toBe('estimate');
      expect(line(byId(rows, 'zenmarket'), 'deposit').tier).toBe('fixed');
      expect(byId(rows, 'jauce').approximate).toBe(false);
      // 上乗せがある方式を選べば、その行だけが推定に戻る（ZenMarket の小形包装物 +45.2%）。
      const marked = byId(compare({
        items: [certain()], country: 'GB', method: 'small-packet-air',
      }).rows, 'zenmarket');
      expect(line(marked, 'intl-shipping').tier).toBe('estimate');
      // **率ではなく円で書く。**実測で分かった形は「1kg 段ごとの定額」で、
      // 率にすると重量で動いてしまう（Jauce の船便は 10.0%→16.1%→25.5%）。
      expect(line(marked, 'intl-shipping').note).toMatch(/\+¥[\d,]+ per parcel over the published rate/);
      expect(marked.approximate).toBe(true);
    });

    test('the EMS note always says the weight went through our packing allowance', () => {
      // **額が乗っている行と、乗っていない行で言うことが違う。**片方だけ縛ると、
      // 「注記が消えた」のと「その方式を売っていない」の区別が付かなくなるので両方縛る。
      let priced = 0;
      let dropped = 0;
      for (const row of compare({ method: 'ems', items: [certain()], country: 'US' }).rows) {
        const l = line(row, 'intl-shipping');
        if (l.amount == null) {
          // 額の無い行は 0 と書かず、代わりに**なぜ無いのか**を必ず言う。
          expect(row.comparable, row.id).toBe(false);
          expect(row.notComparableReason, row.id).toBeTruthy();
          expect(l.note, row.id).toContain('does not ship this method');
          dropped += 1;
        } else {
          expect(l.note, row.id).toContain('after our packing allowance');
          priced += 1;
        }
      }
      // **米国ではEMSが Neokyo・FROM JAPAN・Buyee の3行で落ちる**（2026-09-12、
      // `master/courier-rates.json` の `conclusions.courier_lineup_diffs` を配線。
      // 3社とも米国宛にはEMS/日本郵便を一切出していないと確認済み）。
      // 額が付くのは ZenMarket・Jauce の2行だけ。ここが 0 になったら上の分岐は
      // 空回りしている。
      expect([priced, dropped]).toEqual([2, 3]);
    });

    test('over the top EMS step there is no rate at all, so the line is neither published nor an estimate', () => {
      const row = byId(compare({ method: 'ems', items: [certain({ weightG: 30000 })], country: 'US' }).rows, 'neokyo');
      expect(line(row, 'intl-shipping').amount).toBeNull();
      expect(line(row, 'intl-shipping').tier).toBe('none');
      expect(row.comparable).toBe(false);
    });
  });

  test('an estimated price marks the row approximate', () => {
    const exact = compare({ method: 'ems', items: [item({ id: 'a', priceTier: 'fixed', freeShipping: true })], country: 'SG' }).rows;
    const guess = compare({ method: 'ems', items: [item({ id: 'a', priceTier: 'estimate', freeShipping: true })], country: 'SG' }).rows;
    expect(line(byId(exact, 'neokyo'), 'items').tier).toBe('fixed');
    expect(line(byId(guess, 'neokyo'), 'items').tier).toBe('estimate');
    expect(byId(guess, 'neokyo').approximate).toBe(true);
  });

  test('every row carries an outbound url and a stable id', () => {
    const rows = compare({ method: 'ems', items: items(2, 600), country: 'US' }).rows;
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    for (const r of rows) expect(r.outboundUrl).toMatch(/^https:\/\//);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ロードマップ 0b / 0c ── F26 輸出通関手数料（総額）と F30 小形包装物の価格上限。
// ─────────────────────────────────────────────────────────────────────────────
describe('F26 export clearance fee is a total line with a per-row threshold', () => {
  test('¥200,000 exactly is under the threshold: ¥0', () => {
    const rows = compare({ method: 'ems', items: [item({ id: 'a', priceYen: 200000 })], country: 'US' }).rows;
    for (const r of rows) expect(line(r, 'export-clearance').amount, r.serviceId).toBe(0);
  });

  test('¥200,001 is over the threshold: ¥2,800', () => {
    const rows = compare({ method: 'ems', items: [item({ id: 'a', priceYen: 200001 })], country: 'US' }).rows;
    for (const r of rows) expect(line(r, 'export-clearance').amount, r.serviceId).toBe(2800);
  });

  test('multiple parcels still charge the fee once per row, not once per parcel', () => {
    // Buyee は既定で注文ごとに別送する（複数個口）。それでも輸出通関は行につき1回。
    const rows = compare({ method: 'ems',
      items: [
        item({ id: 'a', priceYen: 200001 }),
        item({ id: 'b', priceYen: 1 }),
        item({ id: 'c', priceYen: 1 }),
      ],
      country: 'US',
    }).rows;
    const buyee = rows.find((r) => r.id === 'buyee:default')!;
    expect(buyee.parcels).toBeGreaterThan(1);
    expect(line(buyee, 'export-clearance').amount).toBe(2800);
  });
});

describe('F30 FROM JAPAN small packet is only selectable at or under ¥30,000 declared value', () => {
  test('¥30,000 exactly is still eligible', () => {
    const rows = compare({
      items: [item({ id: 'a', priceYen: 30000, weightG: 100 })],
      country: 'DE',
      method: 'small-packet-air',
    }).rows;
    const fj = rows.find((r) => r.id === 'fromjapan')!;
    expect(fj.comparable).toBe(true);
    expect(line(fj, 'intl-shipping').amount).not.toBeNull();
  });

  test('¥30,001 is no longer eligible for small packet — a different reason than weight or country', () => {
    const rows = compare({
      items: [item({ id: 'a', priceYen: 30001, weightG: 100 })],
      country: 'DE',
      method: 'small-packet-air',
    }).rows;
    const fj = rows.find((r) => r.id === 'fromjapan')!;
    expect(fj.comparable).toBe(false);
    expect(fj.notComparableReason).toContain('declared value');
    expect(line(fj, 'intl-shipping').amount).toBeNull();
  });

  test('the price cap does not affect other companies without that limit', () => {
    const rows = compare({
      items: [item({ id: 'a', priceYen: 30001, weightG: 100 })],
      country: 'DE',
      method: 'small-packet-air',
    }).rows;
    const buyee = rows.find((r) => r.id === 'buyee')!;
    expect(buyee.comparable).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P1: 総額を点から区間にする。**区間が常に [x, x] にならないことをここで縛る。**
// ─────────────────────────────────────────────────────────────────────────────
describe('the total is an interval, not a point (P1)', () => {
  test('Jauce storage past day 60 gets a cappable unknownCapYen (line level)', () => {
    // Jauce は無料60日・上限120日。既定45日では無料期間の内側なので何も乗らない。
    // 70日に伸ばすと有料期間（10日）に入り、単価は非公表（unpublished）——
    // 「額×期間」で上端が置ける。**Jauce は premium insurance も別に未取得(上端なし)を
    // 持つので、行全体の total.high はこのケースでも null のまま**——それは正しい
    // (premium insurance の上端は本当に置けない)。ここでは保管の行そのものが
    // 個別に上端を持てていることを確かめる。
    const rows = compare({ method: 'ems',
      items: [item({ id: 'a', weightG: 600 })],
      country: 'DE',
      storageDays: 70,
    }).rows;
    const jauce = byId(rows, 'jauce');
    const storage = line(jauce, 'storage');
    expect(storage.amount).toBeNull();
    expect(storage.unknownCapYen).not.toBeNull();
    expect(storage.unknownCapYen).toBeGreaterThan(0);
    // low は sumLines と同じ式（未取得=0）── 挙動を変えていないことの直接の確認。
    expect(jauce.total.low).toBe(sumLines(jauce));
  });

  test('the Jauce storage cap is "up to 2 months × the guitar reference", not the reference itself', () => {
    const rows = compare({ method: 'ems',
      items: [item({ id: 'a', weightG: 600 })],
      country: 'DE',
      storageDays: 70,
    }).rows;
    const storage = line(byId(rows, 'jauce'), 'storage');
    // 有料期間は maxDays(120) - freeDays(60) = 60日 = 2か月に閉じている。
    // 参考額 ¥700/月（上限ではない）× 2か月 = ¥1,400。
    expect(storage.unknownCapYen).toBe(1400);
    expect(storage.unknownCapNote).toMatch(/not a published cap/);
    expect(storage.unknownCapNote).toMatch(/¥700/);
  });

  test('a row with no unknown line keeps a closed interval (low === high, not null)', () => {
    // 保管が無料期間の内側（既定45日）なら、この籠に未取得の費目は無い —— 区間は閉じたまま。
    const rows = compare({ method: 'ems',
      items: [item({ id: 'a', weightG: 600 })],
      country: 'DE',
    }).rows;
    for (const row of rows.filter((r) => r.comparable)) {
      if (row.excluded.length === 0) {
        expect(row.total.high, row.id).toBe(row.total.low);
      }
    }
  });

  test('a truly uncappable unknown line (US Zonos prepayment fee) makes total.high null, not a number', () => {
    // Zonos の利用料は額もキャップも無い（一次情報3ページで確認済み）ので unknownCapYen が無い。
    // その行を持つ社は total.high が **null**（上限不明）になる。
    // **`{ high: 数値, highUnbounded: true }` のような矛盾した状態を作れないことがここの主張。**
    const rows = compare({ method: 'ems',
      items: [item({ id: 'a', weightG: 600 })],
      country: 'US',
    }).rows;
    const withZonos = rows.filter((r) =>
      r.lines.some((l) => l.key === 'duty-prepayment' && l.amount == null));
    expect(withZonos.length).toBeGreaterThan(0);
    for (const row of withZonos) {
      expect(row.total.high, row.id).toBeNull();
      // ranking は low だけで決まる —— この PR では挙動を変えない。
      expect(row.total.low).toBe(sumLines(row));
    }
  });

  test('the Neokyo storage line is a real range (small size low, large size high) once it is paid', () => {
    // 寸法が入力に無いので amount は小型段の点推定。上端は最大段(¥1,400/order)——
    // これは「額×期間」ではなく「額×寸法の幅」だが、期間(6週上限)は閉じているので
    // 同じ理屈で上端が出せる。
    const rows = compare({ method: 'ems',
      items: [item({ id: 'a', weightG: 600 })],
      country: 'DE',
      storageDays: 60, // Neokyo 無料45日を15日超過 → 3週ぶん課金
    }).rows;
    const storage = line(byId(rows, 'neokyo'), 'storage');
    expect(storage.amount).toBe(3 * 350); // small, 1 order, 3 weeks
    expect(storage.amountKind).toBe('range');
    expect(storage.amountHighYen).toBe(3 * 1400); // large
    expect(storage.amountHighYen).toBeGreaterThan(storage.amount!);
  });

  test('ranking, cheapest, tied and diff are computed from total.low only (behaviour unchanged)', () => {
    const rows = compare({ method: 'ems', items: items(3, 600), country: 'DE' }).rows;
    const comparable = rows.filter((r) => r.comparable);
    for (const row of comparable) {
      const cheaperCount = comparable.filter((o) => o.total.low < row.total.low).length;
      expect(row.rank).toBe(cheaperCount + 1);
      expect(row.diff).toBe(row.total.low - comparable[0]!.total.low);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // **実カートで幅が本当に出ることの確認。**テストが通ることと、目的が達成される
  // ことを一致させる（コーディネーターからの指摘）。既定設定・全7カ国で測る。
  // ───────────────────────────────────────────────────────────────────────────
  describe('the default real cart actually shows a live interval, in every country', () => {
    const COUNTRIES_HERE: CountryCode[] = ['US', 'GB', 'DE', 'FR', 'AU', 'CA', 'SG'];
    const defaultRows = (cc: CountryCode) =>
      compare({ method: 'ems', items: items(5, 600), country: cc }).rows.filter((r) => r.comparable);

    test('not every row is a trivially closed interval — some are open, some are unbounded', () => {
      // docs/ROADMAP.md P1 確定仕様どおりの表現: 総額は「¥X 以上」(high===null) か、
      // 具体的な区間(high>low)か、幅が無い(high===low, 未取得の費目が無い)かのどれか。
      // **全行が high===low だけなら、区間化が何も効いていないということ**——それを禁止する。
      const all = COUNTRIES_HERE.flatMap((cc) => defaultRows(cc));
      const notTriviallyClosed = all.filter((r) => r.total.high === null || r.total.high > r.total.low);
      expect(notTriviallyClosed.length).toBeGreaterThan(0);
      // US・Jauce・FROM JAPAN の行は既定でも Zonos 利用料・Premium insurance・
      // 外注梱包のいずれかを持ち、上端が置けないので total.high は null になる
      // ——「¥X 以上」と出せる状態が既定カートで実際に生じることの確認。
      const unbounded = all.filter((r) => r.total.high === null);
      expect(unbounded.length).toBeGreaterThan(0);
    });

    test('a genuinely open interval (high > low, not null) is reachable within the published rules', () => {
      // 既定45日ちょうどでは Neokyo も Jauce も無料期間の内側で幅が出ない。
      // だが「額×期間／額×寸法」の上端は公表されたルールの範囲内で実際に開く
      // ——これが「増やした上端」が意味を持つことの確認(60日/70日で実演)。
      const neokyo = byId(
        compare({ method: 'ems', items: items(5, 600), country: 'DE', storageDays: 60 }).rows, 'neokyo',
      );
      expect(neokyo.total.high).not.toBeNull();
      expect(neokyo.total.high!).toBeGreaterThan(neokyo.total.low);
    });

    test('every row is either high===low (nothing unknown), high>low (all unknowns capped), or high===null (unbounded)', () => {
      for (const cc of COUNTRIES_HERE) {
        for (const row of defaultRows(cc)) {
          if (row.excluded.length === 0) {
            // 未取得の費目が無い行は、幅ゼロが正しい —— これは「幅を出せていない」不具合ではない。
            expect(row.total.high, `${cc} ${row.id}`).toBe(row.total.low);
          } else if (row.total.high !== null) {
            // 未取得の費目があってなお high が数値なら、全ての未取得に上端が置けたということ。
            // このとき high は low より厳密に大きくなければならない
            // （さもなくば「未取得なのに0円加算」という無意味な状態になる）。
            expect(row.total.high, `${cc} ${row.id}`).toBeGreaterThan(row.total.low);
          } else {
            // high === null。上端が置けない未取得費目を最低1つ持つはず。
            const uncappable = row.lines.some((l) => l.amount == null && l.unknownCapYen == null);
            expect(uncappable, `${cc} ${row.id}`).toBe(true);
          }
        }
      }
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P1-2: 区間に基づく順位づけ。「重なる」の定義、おすすめ枠、同等の印、
// おすすめ枠に基づく rankStable。
//
// **「重なる」の定義**（`docs/ROADMAP.md` P1）: 候補行が1位（同額タイを含む）の
// 区間 `[low, high ?? +Infinity]` と重なるかを、**候補行自身の下端 `low` だけ**で
// 判定する（候補行自身の `high` は一切見ない——確定仕様6「下端のみで比較する」）。
// `high === null`（上限不明）は「上端が無い」ではなく「上端が分からない」ので
// **+Infinity として扱う**——これはコーディネーター判断1（2026-09-11）で
// 「不確かさを隠さない」ために明示的に維持されている。1位自身が上限不明なら
// 誰でも重なりうる（1位がどこまで高くなるか分からない以上、他社が1位より
// 確実に高いとは言えない）。ただし枠には最大2社という上限があるので、
// それだけで枠が全社を飲み込むことはない（3社目以降は「同等」に落ちる）。
// ─────────────────────────────────────────────────────────────────────────────
describe('the recommended bracket and the equivalent mark (P1-2)', () => {
  test('no overlap: the leader stands alone (recommended solo, nobody else marked)', () => {
    // ドイツ・英・仏・豪・加・星は5点600gの既定でNeokyoが単独で閉じた区間の1位を取り、
    // 他社はどれも重ならない（実測、docs/ROADMAP.md P1 の全社重なりの反例でもある）。
    const rows = compare({ method: 'ems', items: items(5, 600), country: 'DE' }).rows.filter((r) => r.comparable);
    const neokyo = byId(rows, 'neokyo');
    expect(neokyo.recommended).toBe(true);
    expect(neokyo.equivalent).toBe(false);
    for (const row of rows.filter((r) => r.id !== 'neokyo')) {
      expect(row.recommended, row.id).toBe(false);
      expect(row.equivalent, row.id).toBe(false);
    }
  });

  test('an unbounded leader does not swallow the rest into "equivalent" (P1-4)', () => {
    // **米国・5点600gでは FROM JAPAN・Neokyo・Buyee がEMSを売っておらず比較不能**
    // （2026-09-12、`master/courier-rates.json` の `conclusions.courier_lineup_diffs`
    // を配線）ので、米国でEMSを比較できるのは ZenMarket と Jauce の2社だけになった。
    // ZenMarket が1位で、自身の総額は上限不明（連邦売上税等、社を問わず同じに
    // かかる共通の未知は `rankHigh` から無視される、P1-4）——それでも Jauce との
    // 間には確定した差があるので、Jauce は「同等」にも「枠入り」にもならない。
    const rows = compare({ method: 'ems', items: items(5, 600), country: 'US' }).rows.filter((r) => r.comparable);
    const recommended = rows.filter((r) => r.recommended);
    const equivalent = rows.filter((r) => r.equivalent);
    expect(recommended.map((r) => r.id)).toEqual(['zenmarket']);
    expect(recommended.length).toBeLessThanOrEqual(2); // 1位 + 最大1社 = 2社
    expect(equivalent).toEqual([]);
    // 枠と同等は互いに排他。
    for (const row of rows) expect(row.recommended && row.equivalent, row.id).toBe(false);
  });

  test('a candidate row\'s own high === null never enters the overlap test (low only, per spec 6)', () => {
    // 判定は「候補行の下端 vs 1位側の上端」だけで行う。候補行自身が上限不明でも、
    // 下端が1位の上端以下なら重なる——上限不明であることが枠入りを妨げも
    // 助けもしない。US の ZenMarket (total.high===null、枠の2社目) が枠に入って
    // いることが、候補側の high を見ていないことの直接の証拠。
    const rows = compare({ method: 'ems', items: items(5, 600), country: 'US' }).rows.filter((r) => r.comparable);
    const zenmarket = byId(rows, 'zenmarket');
    expect(zenmarket.total.high).toBeNull();
    expect(zenmarket.recommended).toBe(true);
  });

  test('genuine closed-interval overlap still marks a 3rd company "equivalent" (the mechanism is not dead)', () => {
    // **④（外部レビュー、オーナー確定 2026-09-11）で「共通の未知」を無視するように
    // なったからといって、`equivalent` の仕組みそのものが働かなくなったわけではない。**
    // **国を米国からドイツに変更した**（2026-09-12）。米国では FROM JAPAN・Buyee が
    // EMS（日本郵便）を売っていないと確認済みで比較不能になり（`master/courier-rates.json`
    // の `conclusions.courier_lineup_diffs` を配線）、このテストが検証したい
    // 「Buyeeは重ならない」という対照そのものが米国では作れなくなった——同じ形は
    // ドイツで成り立つ。1点・150 g・¥500・保管90日（ドイツ）は Jauce の保管超過
    // （額に幅がある）が ZenMarket の総額と実際に重なる、閉区間同士の正真正銘の重なり。
    const rows = compare({ method: 'ems', items: items(1, 150, 500), country: 'DE', storageDays: 90 })
      .rows.filter((r) => r.comparable);
    const zenmarket = byId(rows, 'zenmarket');
    const buyee = byId(rows, 'buyee');
    expect(zenmarket.recommended).toBe(false);
    expect(zenmarket.equivalent).toBe(true); // 枠には入らないが、閉区間で確かに重なる
    // 重ならない社（Buyee）は同等にもならない——重なりの判定が働いている証拠。
    expect(buyee.recommended).toBe(false);
    expect(buyee.equivalent).toBe(false);
  });

  test('an unbounded leader (leader.total.high === null) does not swallow everyone — the 2-company cap still holds', () => {
    // 1点9,000g・米国: FROM JAPAN・Neokyo・Buyee はEMSを売っておらず比較不能
    // （2026-09-12、`master/courier-rates.json` の `conclusions.courier_lineup_diffs`
    // を配線）ので、比較に残るのは ZenMarket・Jauce の2社。ZenMarket が1位で
    // 上限不明。全社が「重なりうる」状態でも、枠は依然として最大2社
    // （1位を含む）に収まる。
    const rows = compare({ method: 'ems', items: items(1, 9000), country: 'US' }).rows.filter((r) => r.comparable);
    expect(byId(rows, 'zenmarket').total.high).toBeNull();
    const recommended = rows.filter((r) => r.recommended);
    expect(recommended.length).toBeLessThanOrEqual(2);
    expect(recommended.map((r) => r.id)).toEqual(['zenmarket']);
  });

  test('a tie for 1st exactly at the 2-company cap: both tied companies go in the bracket', () => {
    // 1位のタイが2社ちょうどなら両方とも枠に入ってよい（枠の定員を使い切るだけ）。
    // **3社以上の同額タイは実カートに存在しない**（走査済み）ので、「タイが2社を
    // 超えたら先頭2社だけ枠、残りは同等」という分岐（`computeBracket` の
    // `leadersOverflow`）はコードの構造上保証されるが、実カートのフィクスチャでは
    // 直接は踏めない——`leaders.slice(2)` は2社ちょうどのときと3社のときで
    // 同じコードパスを通るので、ここでの検証は目的に対して十分な代理になる。
    // F07（2026-09-12）で数値が動き、以前の組み合わせ（200g・¥4,500・楽天・AU）の
    // 同額が崩れたので修正後の値で探し直した（`topTie` と同じ入力、
    // `equal totals get equal rank`）。
    const rows = compare({ method: 'ems',
      items: [item({ id: 'a', priceYen: 1000, weightG: 100, site: 'rakuten' })], country: 'CA',
    }).rows.filter((r) => r.comparable);
    const tiedLow = Math.min(...rows.map((r) => r.total.low));
    const tied = rows.filter((r) => r.total.low === tiedLow);
    expect(tied.length).toBe(2);
    for (const r of tied) expect(r.recommended, r.id).toBe(true);
    expect(rows.filter((r) => r.recommended).length).toBeLessThanOrEqual(2);
  });

  test('comparable: false rows are never recommended or equivalent', () => {
    // 米国では Neokyo が comparable: false（日本郵便を売っていない）。
    // おすすめ枠の判定は比較可能な行だけを対象にする。
    const rows = compare({ method: 'ems', items: items(5, 600), country: 'US' }).rows;
    const neokyo = byId(rows, 'neokyo');
    expect(neokyo.comparable).toBe(false);
    expect(neokyo.recommended).toBe(false);
    expect(neokyo.equivalent).toBe(false);
  });
});

describe('rankStable is judged on the recommended bracket as a set (P1-2, coordinator judgment 2)', () => {
  /**
   * **旧い実装**（本 PR の最初の版）は「基準の枠のうち1社でも両端の枠に残れば安定」
   * だった。枠は最大3社なので、5社中3社が枠に入る局面ではこれがほぼ自明に成立し、
   * 判定として機能しなかった——実測で7カ国すべて `rankStable=true` になった。
   *
   * **新しい定義**: 枠の**集合**が ×⅓・×3 の両端で基準と完全に一致するかどうか。
   * 集合なので枠の中の順序（誰が下端最小か）が入れ替わっても「動いた」に数えない。
   * だが枠に出入りする社が1社でもあれば `false`。
   */
  test('the bracket set changing at even one extreme makes rankStable false', () => {
    // ドイツ・5点600g: 基準の枠は {Neokyo}（単独、重なる社なし）。×3 では
    // 枠が {Neokyo} から {ZenMarket} に変わる——集合が変わるので false。
    // **F07（2026-09-12）で×3側の顔ぶれが変わった**（以前は {FROM JAPAN, Neokyo}
    // だったが、Neokyo・FROM JAPAN が新たに負った推定 deposit で押し上げられ、
    // 自社公表値のまま確定額の ZenMarket 単独に替わった）。
    // （米国の例を避けたのは、米国は FROM JAPAN の上限不明のせいでほぼ常に
    // `rankIndeterminate` になり、この describe の主張——安定 vs 「枠の顔ぶれが
    // 変わる」不安定——を混ぜてしまうため。）
    const r = compare({ method: 'ems', items: items(5, 600), country: 'DE' });
    const base = r.rows.filter((row) => row.recommended).map((row) => row.id);
    expect(base).toEqual(['neokyo']);
    expect(r.rankStable).toBe(false);
    expect(r.rankIndeterminate).toBe(false);
    expect(r.rankStabilityNote).toContain('Neokyo is the recommended range');
    expect(r.rankStabilityNote).toContain('ZenMarket is the recommended range');
  });

  // **「枠の中の順序が入れ替わっても『動いた』に数えない」という主張は
  // `bracketChanged` が `Set` で比較する実装（コード参照）で保証されているが、
  // ×⅓・×3 の走査（7カ国 × 1〜5点 × 100g〜10,000g 刻み、値も複数試した）では
  // **「同じ2社の枠のまま、下端最小の順序だけが入れ替わる」実カートが1件も
  // 見つからなかった。**この規則は「枠の集合が変わらなければ安定」という
  // `bracketChanged` の実装そのものでカバーされており（上のテストが逆側＝
  // 集合が変わるケースを縛っている）、実カートでの正例が無いことは欠陥ではない
  // ——2社という枠が小さいので、下端が入れ替わる局面はほぼ必ず3社目の出入りを
  // 伴う、というのがこのデータセットの実際の形だった。

  test('a lone-leader bracket (no overlap) is the simplest stable case', () => {
    // AU: Neokyo が単独1位（重なる社なし）で、×1/3・×3 でも同じ単独枠が保たれる。
    const r = compare({ method: 'ems', items: items(5, 600), country: 'AU' });
    expect(r.rows.filter((row) => row.recommended).map((row) => row.id)).toEqual(['neokyo']);
    expect(r.rankStable).toBe(true);
    expect(r.rankIndeterminate).toBe(false);
  });

  test('weightSensitivity.decisive follows the same set-equality rule as rankStable', () => {
    // カナダ・胴（1,500–7,500 g）: 基準重量では1位が FROM JAPAN で枠は
    // {FROM JAPAN, Neokyo}。この品の重量だけを両端に振ると枠の顔ぶれが変わる
    // ——「1位が動くか」なら FROM JAPAN が全域で1位のままなので decisive=false
    // だが、「枠の集合が動くか」では decisive=true になる（旧実装からの回帰の
    // 直接検査。`kendo armour` テストと同じ入力で、ここでは decisive の規則
    // そのものに焦点を当てる）。**F07（2026-09-12）でこの形が残るのはドイツから
    // カナダに変わった**（`kendo armour` テストのコメント参照）。
    const table = (id: string, weightG: number, range: [number, number]) =>
      item({ id, weightG, weightOrigin: 'table', weightRangeG: range });
    const r = compare({ method: 'ems',
      items: [
        table('do', 2000, [1500, 7500]),
        table('hakama', 1500, [1500, 2000]),
        table('tare', 1500, [1500, 1500]),
      ],
      country: 'CA',
    });
    expect(r.weightSensitivity['do']!.winnerAtLow).toBe('FROM JAPAN');
    expect(r.weightSensitivity['do']!.winnerAtHigh).toBe('FROM JAPAN');
    expect(r.weightSensitivity['do']!.decisive).toBe(true);
  });
});
