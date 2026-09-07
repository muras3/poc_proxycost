import { describe, expect, test } from 'vitest';
import {
  EMS_CHECKED_ON, EMS_MAX_GRAMS, EMS_MAX_INDEX, EMS_SOURCE_URL, EMS_TABLE, EMS_ZONE,
  UNKNOWN_WEIGHT_STEPS_G, emsFor, emsStepGrams, emsStepIndex, emsYen, formatStep,
} from './ems';
import { COUNTRY_CODES } from './countries';

describe('the published EMS table', () => {
  test('42 steps up to 30 kg — the whole published table, not the 15 kg excerpt', () => {
    // 以前は 27段（15kg）までしか転記しておらず、その先を「公表が無い」と扱っていた。
    // 実際の公表は 30kg まである。段数が減ったらまた同じ取りこぼしが起きる。
    expect(EMS_TABLE).toHaveLength(42);
    expect(EMS_MAX_INDEX).toBe(41);
    expect(EMS_MAX_GRAMS).toBe(30000);
    expect(EMS_MAX_GRAMS).toBe(EMS_TABLE[EMS_MAX_INDEX]![0]);
  });

  test('every row is one weight limit plus five zone prices, all real positive yen', () => {
    for (const row of EMS_TABLE) {
      expect(row).toHaveLength(6); // [上限g, 第1〜第5帯]
      for (const n of row) {
        expect(Number.isFinite(n)).toBe(true);
        expect(n).toBeGreaterThan(0); // 0 円の段があると「無料で送れる」表示になる
      }
    }
  });

  test('the weight limits climb from 500 g to the 30 kg EMS ceiling without repeating', () => {
    const limits = EMS_TABLE.map((r) => r[0]!);
    expect(limits[0]).toBe(500);
    expect(limits[limits.length - 1]).toBe(30000);
    for (let i = 1; i < limits.length; i++) expect(limits[i]!).toBeGreaterThan(limits[i - 1]!);
  });

  test('inside a zone the price never falls as the parcel gets heavier', () => {
    // 単調でない段があると「重くすると安くなる」比較結果を出してしまう。
    for (let zone = 1; zone <= 5; zone++) {
      for (let i = 1; i < EMS_TABLE.length; i++) {
        expect(EMS_TABLE[i]![zone]!).toBeGreaterThan(EMS_TABLE[i - 1]![zone]!);
      }
    }
  });

  test('spot checks against the Japan Post sheet we transcribed', () => {
    // 転記ミスを拾うための照合。行そのものと、旧表の外側（15kg 超）を数点。
    expect(EMS_TABLE[0]).toEqual([500, 1450, 1900, 3150, 3900, 3600]);
    expect(EMS_TABLE[EMS_MAX_INDEX]).toEqual([30000, 26600, 33350, 65500, 75100, 77700]);
    expect(emsFor(15000, 4).yen).toBe(39100);  // 旧表の最上段。いまは途中の段。
    expect(emsFor(18000, 4).yen).toBe(46300);  // 旧表なら 39100 に丸めていた重量
    expect(emsFor(30000, 4).yen).toBe(75100);
    expect(emsFor(5000, 2).yen).toBe(8150);
    expect(emsFor(10000, 3).yen).toBe(23500);
  });

  test('the table says where it came from and when it was checked', () => {
    // 料金表を差し替えるときは出典と確認日も一緒に更新する、という取り決め。
    expect(EMS_SOURCE_URL).toContain('post.japanpost.jp');
    expect(EMS_CHECKED_ON).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('step boundaries', () => {
  test('500 g exactly is still the first step; 501 g falls into the next', () => {
    // 「以下」で切る表なので、境界ちょうどは下の段。ここが「未満」になると
    // ぴったりの重量で一段高い料金を出す。
    expect(emsStepIndex(500)).toBe(0);
    expect(emsStepIndex(501)).toBe(1);
    expect(emsFor(500, 4).yen).toBe(3900);
    expect(emsFor(501, 4).yen).toBe(4180);
    expect(emsFor(500, 4).stepG).toBe(500);
    expect(emsFor(501, 4).stepG).toBe(600);
  });

  test('a step covers everything above the previous limit up to its own limit', () => {
    expect(emsStepIndex(1)).toBe(0);
    expect(emsStepIndex(600)).toBe(1);
    expect(emsStepIndex(1000)).toBe(5);
    expect(emsStepIndex(1001)).toBe(6);   // 1,250 g の段
    expect(emsStepIndex(1250)).toBe(6);
    expect(emsStepIndex(1251)).toBe(7);   // 1,500 g の段
    // 段の中はどこを取っても同じ料金・同じ段重量になる（1kg 刻みの領域で確認）
    for (const g of [15001, 15100, 15999, 16000]) {
      expect(emsFor(g, 4).stepG).toBe(16000);
      expect(emsFor(g, 4).yen).toBe(41500);
    }
  });

  test('15 kg is no longer the ceiling — 15,001 g gets a real price', () => {
    // 旧表では 15kg 超が「送れない」扱いになっていた（表の転記が足りなかっただけ）。
    expect(emsStepIndex(15000)).toBe(26);
    expect(emsStepIndex(15001)).toBe(27);
    expect(emsStepIndex(30000)).toBe(EMS_MAX_INDEX);
    const over15 = emsFor(15001, 4);
    expect(over15.overMax).toBe(false);
    expect(over15.yen).toBe(41500);
  });

  test('**past the 30 kg ceiling there is no price — not a rounded-down one, not zero**', () => {
    // EMS の引受上限。ここを最上段に丸めると 40kg の小包を 30kg の料金で見せることになり、
    // null を 0 に潰すと「送料タダ」で1位に躍り出る。どちらも起こしてはいけない。
    expect(emsStepIndex(30001)).toBe(-1);
    expect(emsStepIndex(99999)).toBe(-1);

    for (const g of [30001, 99999]) {
      const over = emsFor(g, 4);
      expect(over.overMax).toBe(true);
      expect(over.yen).toBeNull();
      expect(over.yen).not.toBe(0);
      expect(over.stepG).toBeNull();
      expect(over.index).toBe(-1);
    }

    const at = emsFor(30000, 4);
    expect(at.overMax).toBe(false);
    expect(at.yen).toBe(75100);
  });

  test('the zone column is read straight off the table', () => {
    expect(emsYen(0, 1)).toBe(1450);
    expect(emsYen(0, 2)).toBe(1900);
    expect(emsYen(0, 3)).toBe(3150);
    expect(emsYen(0, 4)).toBe(3900);
    expect(emsYen(0, 5)).toBe(3600);
    expect(emsYen(1, 4)).toBe(4180);
    expect(emsYen(EMS_MAX_INDEX, 4)).toBe(75100);
  });

  test('indices out of range are clamped, not thrown', () => {
    // 呼び出し側が段をずらした結果はみ出しても、例外や undefined を返さない。
    expect(emsYen(-5, 4)).toBe(3900);
    expect(emsYen(999, 4)).toBe(75100);
    expect(emsStepGrams(-1)).toBe(500);
    expect(emsStepGrams(999)).toBe(30000);
  });

  test('a step offset moves by whole steps and stays inside the table', () => {
    // 重量が読めないときに「一段上／下だといくらか」を出すための仕組み。
    expect(emsFor(500, 4, 1).yen).toBe(4180);
    expect(emsFor(500, 4, 1).stepG).toBe(600);
    expect(emsFor(500, 4, 2).stepG).toBe(700);
    expect(emsFor(500, 4, 2).yen).toBe(4460);
    expect(emsFor(18000, 4, 1).stepG).toBe(19000);
    expect(emsFor(18000, 4, 1).yen).toBe(48700);
    expect(emsFor(500, 4, -3).yen).toBe(3900);        // 下にはみ出しても第1段
    expect(emsFor(30000, 4, 3).stepG).toBe(30000);    // 上にはみ出しても最上段
    expect(emsFor(30000, 4, 3).yen).toBe(75100);
  });

  test('an offset cannot rescue a parcel that is over the ceiling', () => {
    // 上限超の判定はオフセットより前。負のオフセットで表の中に引き戻せてしまうと、
    // 送れない小包に料金がついてしまう。
    const rescued = emsFor(50000, 4, -41);
    expect(rescued.overMax).toBe(true);
    expect(rescued.yen).toBeNull();
  });
});

describe('zones and labels', () => {
  test('every country we ship to has a zone', () => {
    for (const cc of COUNTRY_CODES) {
      expect(EMS_ZONE[cc]).toBeGreaterThanOrEqual(1);
      expect(EMS_ZONE[cc]).toBeLessThanOrEqual(5);
    }
    expect(EMS_ZONE.US).toBe(4);
    expect(EMS_ZONE.SG).toBe(2);
    expect([EMS_ZONE.GB, EMS_ZONE.DE, EMS_ZONE.FR, EMS_ZONE.AU, EMS_ZONE.CA]).toEqual([3, 3, 3, 3, 3]);
  });

  test('the US is more expensive than Singapore at the same weight', () => {
    expect(emsFor(1000, EMS_ZONE.US).yen!).toBeGreaterThan(emsFor(1000, EMS_ZONE.SG).yen!);
    expect(emsFor(1000, EMS_ZONE.US).yen!).toBeGreaterThan(emsFor(1000, EMS_ZONE.GB).yen!);
  });

  test('labels read as grams below a kilo and kilos above', () => {
    expect(formatStep(500)).toBe('500 g');
    expect(formatStep(900)).toBe('900 g');
    expect(formatStep(1000)).toBe('1 kg');
    expect(formatStep(1250)).toBe('1.3 kg');
    expect(formatStep(1500)).toBe('1.5 kg');
    expect(formatStep(15000)).toBe('15 kg');
    expect(formatStep(EMS_MAX_GRAMS)).toBe('30 kg');
  });
});

describe('the steps we show when the weight is unknown', () => {
  test('six of them, each a real EMS step', () => {
    // 任意の刻みだと隣の行が同じ総額になり、表が水増しに見える（docs/UI-DESIGN.md §4）。
    expect([...UNKNOWN_WEIGHT_STEPS_G]).toEqual([500, 1000, 2000, 3000, 5000, 10000]);
    const limits = new Set(EMS_TABLE.map((r) => r[0]!));
    for (const g of UNKNOWN_WEIGHT_STEPS_G) expect(limits.has(g)).toBe(true);
  });

  test('no two of them land on the same EMS row', () => {
    const idx = UNKNOWN_WEIGHT_STEPS_G.map((g) => emsStepIndex(g));
    expect(new Set(idx).size).toBe(idx.length);
  });

  test('all of them are inside the table, so every row we show has a price', () => {
    // 上限超の段を選択肢に混ぜると、料金欄が空の行を並べることになる。
    for (const g of UNKNOWN_WEIGHT_STEPS_G) {
      const step = emsFor(g, EMS_ZONE.US);
      expect(step.overMax).toBe(false);
      expect(step.yen).toBeGreaterThan(0);
    }
    expect(UNKNOWN_WEIGHT_STEPS_G[UNKNOWN_WEIGHT_STEPS_G.length - 1]!)
      .toBeLessThanOrEqual(EMS_MAX_GRAMS);
  });
});
