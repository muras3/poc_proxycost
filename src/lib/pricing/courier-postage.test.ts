import { describe, expect, test } from 'vitest';
import {
  DEFAULT_PARCEL_DIMENSIONS_CM,
  billableWeightG, courierPriceFor, dimensionsExceedLimit, volumetricWeightG,
} from './postage';
import { SERVICES, type MeasuredPostageRate } from './services';
import type { BoxDimensionsCm } from './types';

// P2: 器そのものの単体テスト。**このPR時点でどの社にも宅配便の実データを入れていない**
// （コーディネーターの指示——データ取り込みは別PR）ので、`courierPriceFor` 系は
// 引き続きフィクスチャ。寸法上限（`dimensionLimit`）は方式ごとの実データが入ったので、
// ここでは `SERVICES` 本体を使い、2026-09-12 の実測（社ごとに一辺を5cm刻みで走査した
// ドイツ・600g）を再現する。

const cube = (sideCm: number): BoxDimensionsCm =>
  ({ lengthCm: sideCm, widthCm: sideCm, heightCm: sideCm });

const findService = (id: string) => {
  const svc = SERVICES.find((s) => s.id === id);
  if (!svc) throw new Error(`fixture bug: no service ${id}`);
  return svc;
};

describe('DEFAULT_PARCEL_DIMENSIONS_CM ── 既定の箱', () => {
  test('20×15×10cm。既知の寸法上限をすべて下回る（3辺の和45cm・最長辺+胴回り70cm）', () => {
    expect(DEFAULT_PARCEL_DIMENSIONS_CM).toEqual({ lengthCm: 20, widthCm: 15, heightCm: 10 });
    for (const svc of SERVICES) {
      for (const rate of Object.values(svc.postage)) {
        expect(
          dimensionsExceedLimit(DEFAULT_PARCEL_DIMENSIONS_CM, rate?.dimensionLimit),
          `${svc.id}/${rate?.labelRaw}`,
        ).toBe(false);
      }
    }
  });
});

describe('dimensionsExceedLimit ── 寸法による「送れない」（額ではなく可否）', () => {
  test('上限を持たない社・方式は常に false ── 未確認を送れないに倒さない', () => {
    expect(dimensionsExceedLimit(cube(200), undefined)).toBe(false);
  });

  test('maxLengthCm / maxLengthPlusGirthCm / maxSumCm を独立に判定する', () => {
    expect(dimensionsExceedLimit(cube(50), { maxLengthCm: 40, tier: 'fixed', note: '' })).toBe(true);
    expect(dimensionsExceedLimit(cube(40), { maxLengthCm: 40, tier: 'fixed', note: '' })).toBe(false);
    // 30cm立方体: 3辺の和90cm ── ちょうど上限
    expect(dimensionsExceedLimit(cube(30), { maxSumCm: 90, tier: 'fixed', note: '' })).toBe(false);
    expect(dimensionsExceedLimit({ lengthCm: 31, widthCm: 30, heightCm: 30 },
      { maxSumCm: 90, tier: 'fixed', note: '' })).toBe(true);
    // 45cm立方体: 最長辺+胴回り = 45+2×(45+45) = 225cm
    expect(dimensionsExceedLimit(cube(45), { maxLengthPlusGirthCm: 225, tier: 'fixed', note: '' }))
      .toBe(false);
    expect(dimensionsExceedLimit(cube(45), { maxLengthPlusGirthCm: 224, tier: 'fixed', note: '' }))
      .toBe(true);
  });

  test('maxSecondLongestCm / maxShortestCm（ZenMarket ECMS の「2番目/3番目」表示専用）', () => {
    const limit = { maxLengthCm: 60, maxSecondLongestCm: 40, maxShortestCm: 40, tier: 'fixed' as const, note: '' };
    expect(dimensionsExceedLimit({ lengthCm: 60, widthCm: 40, heightCm: 40 }, limit)).toBe(false);
    expect(dimensionsExceedLimit({ lengthCm: 60, widthCm: 41, heightCm: 40 }, limit)).toBe(true);
  });

  // --- ここから2026-09-12実測の再現。「まだ送れた一辺」で false、「消えた一辺」で true。---

  test('Buyee: Small Packet (AIR) は30cmで残り35cmで消える（3辺の和≤90cm）', () => {
    const rate = findService('buyee').postage['small-packet-air']!;
    expect(dimensionsExceedLimit(cube(30), rate.dimensionLimit)).toBe(false);
    expect(dimensionsExceedLimit(cube(35), rate.dimensionLimit)).toBe(true);
  });

  test('Buyee: EMS・国際小包は40cmで残り、表示上の上限(150/300cm)は45cmでもまだ満たす', () => {
    // **注意**: 2026-09-12実測ではBuyeeのEMS・国際小包も45cmで全滅したと記録されているが、
    // 表示された制限値（最大長150cm・長さ+胴回り300cm）だけからは45cmでの消滅を説明できない
    // （45+2×90=225cm < 300cm）。指示どおり画面の表示値をそのまま使うため、このテストは
    // 「表示値による判定」を縛るもので、45cmの実測消滅そのものは再現できない
    // （`docs/ROADMAP.md` P2 に食い違いとして記録済み）。
    for (const id of ['ems', 'parcel-air', 'parcel-surface'] as const) {
      const rate = findService('buyee').postage[id]!;
      expect(dimensionsExceedLimit(cube(40), rate.dimensionLimit), id).toBe(false);
      expect(dimensionsExceedLimit(cube(45), rate.dimensionLimit), id).toBe(false);
    }
  });

  test('ZenMarket: ECMS EXPRESS(small-packet-air)は40cmで残り45cmで消える（2番目/3番目≤40cm）', () => {
    const rate = findService('zenmarket').postage['small-packet-air']!;
    expect(dimensionsExceedLimit(cube(40), rate.dimensionLimit)).toBe(false);
    expect(dimensionsExceedLimit(cube(45), rate.dimensionLimit)).toBe(true);
  });

  test('ZenMarket: ems / parcel-air / parcel-surface はブランド名を対応付けていないので寸法上限なし', () => {
    for (const id of ['ems', 'parcel-air', 'parcel-surface'] as const) {
      const rate = findService('zenmarket').postage[id]!;
      expect(rate.dimensionLimit, id).toBeUndefined();
    }
  });

  test('Neokyo: parcel-air / parcel-surface は40cmで残り45cmで消える（推定・日本郵便公式の国際小包制限）', () => {
    for (const id of ['parcel-air', 'parcel-surface'] as const) {
      const rate = findService('neokyo').postage[id]!;
      expect(rate.dimensionLimit?.tier, id).toBe('estimate');
      expect(dimensionsExceedLimit(cube(40), rate.dimensionLimit), id).toBe(false);
      expect(dimensionsExceedLimit(cube(45), rate.dimensionLimit), id).toBe(true);
    }
  });

  test('Neokyo: EMSは45cm・50cmでも残る（推定・日本郵便公式のEMS制限）', () => {
    const rate = findService('neokyo').postage['ems']!;
    expect(rate.dimensionLimit?.tier).toBe('estimate');
    expect(dimensionsExceedLimit(cube(45), rate.dimensionLimit)).toBe(false);
    expect(dimensionsExceedLimit(cube(50), rate.dimensionLimit)).toBe(false);
  });

  test('Jauce: EMS・Surfaceは表示値(105/200cm)では45cmで既に「送れない」と出る（過小評価・安全側）', () => {
    // 実測ではJauceのEMS/SAL/Surfaceは45cm・50cmでも生き残り（50cmで初めてNot available）、
    // 実際の閾値は225〜250cmのどこかにある。だが指示どおり画面の表示値（105/200cm）を
    // そのまま使うので、このコードは45cmの時点で「送れない」と判定する——
    // 過小評価（安全側）であって実測の再現ではない。食い違いはコメントとROADMAPに記録済み。
    for (const id of ['ems', 'parcel-surface'] as const) {
      const rate = findService('jauce').postage[id]!;
      expect(dimensionsExceedLimit(cube(40), rate.dimensionLimit), id).toBe(false);
      expect(dimensionsExceedLimit(cube(45), rate.dimensionLimit), id).toBe(true);
    }
  });
});

describe('容積重量 ── 宅配便は容積重量が効く（監査 §5）', () => {
  test('volumetricWeightG は縦×横×高さ÷除数をgに換算する', () => {
    // 20×15×10 = 3,000cm³。除数5000なら 0.6kg = 600g。
    expect(volumetricWeightG(DEFAULT_PARCEL_DIMENSIONS_CM, 5000)).toBe(600);
  });

  test('billableWeightG は実重量と容積重量の重いほう', () => {
    const dims = { lengthCm: 42, widthCm: 31, heightCm: 24 }; // 実請求で報告された寸法
    const vol = volumetricWeightG(dims, 5000); // 31,248cm³ / 5000 * 1000 ≈ 6,250g
    expect(vol).toBeGreaterThan(3210); // 同じ実請求の実重量 3,210g より重い
    expect(billableWeightG(3210, dims, 5000)).toBe(vol);
    expect(billableWeightG(999999, dims, 5000)).toBe(999999); // 実重量が重ければそちら
  });
});

describe('courierPriceFor ── 最終価格をそのまま引く（分解しない）', () => {
  // コーディネーターが2026-09-11に伝えた外部実測（GPT引き継ぎ文書）の実例が
  // 素直に載るかを確かめる。**この値をマスタには入れない。**フィクスチャのみ。
  const fedexEconomyDe600g: MeasuredPostageRate = {
    kind: 'measured',
    volumetricDivisorCm3PerKg: 5000,
    bandsByCountry: {
      DE: [{ maxG: 1000, yen: 5309 }], // FROM JAPAN, FedEx Economy, DE 600g = ¥5,309
    },
    tier: 'unverified', // 実データではなくフィクスチャなので unverified
    sourceUrl: 'https://www.fromjapan.co.jp/en/estimate/',
    checkedOn: '2026-09-07',
    labelRaw: 'FedEx Economy',
  };

  test('実測の1点がそのまま帯に載る', () => {
    expect(courierPriceFor(fedexEconomyDe600g, 'DE', 600, DEFAULT_PARCEL_DIMENSIONS_CM)).toBe(5309);
  });

  test('データの無い国は null（0円にしない）', () => {
    expect(courierPriceFor(fedexEconomyDe600g, 'US', 600, DEFAULT_PARCEL_DIMENSIONS_CM)).toBeNull();
  });

  test('帯の外の重量は null（送れない。丸めない）', () => {
    expect(courierPriceFor(fedexEconomyDe600g, 'DE', 5000, DEFAULT_PARCEL_DIMENSIONS_CM)).toBeNull();
  });

  test('容積重量が実重量を超えれば、それで帯を判定する', () => {
    const bigBox = { lengthCm: 50, widthCm: 50, heightCm: 50 }; // 125,000cm³
    // 125,000 / 5000 * 1000 = 25,000g ── 上の帯(1000g)を超えるので送れない扱い
    expect(courierPriceFor(fedexEconomyDe600g, 'DE', 100, bigBox)).toBeNull();
  });
});
