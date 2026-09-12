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

describe('courierPriceFor ── 測定点の間は区間（P2 1、2026-09-12 拡張）', () => {
  // FROM JAPAN, US, FedEx Economy を単純化した3点のフィクスチャ。**マスタの実データは
  // services.test.ts / courier-monotonicity.test.ts 側で検査する。**
  const fedexEconomyUs: MeasuredPostageRate = {
    kind: 'measured',
    volumetricDivisorCm3PerKg: 5000,
    weightPointsByCountry: {
      US: [{ g: 500, yen: 5109 }, { g: 600, yen: 5109 }, { g: 1000, yen: 5109 }],
    },
    tier: 'estimate',
    sourceUrl: 'https://www.fromjapan.co.jp/en/estimate/',
    checkedOn: '2026-09-12',
    labelRaw: 'FedEx - Economy',
  };

  test('ちょうど測定点に乗る重量は low === high（幅ゼロ）', () => {
    expect(courierPriceFor(fedexEconomyUs, 'US', 600, DEFAULT_PARCEL_DIMENSIONS_CM))
      .toEqual({ low: 5109, high: 5109 });
  });

  test('測定点の間は [下の点, 上の点] の区間', () => {
    expect(courierPriceFor(fedexEconomyUs, 'US', 700, DEFAULT_PARCEL_DIMENSIONS_CM))
      .toEqual({ low: 5109, high: 5109 }); // 600と1000の間だが両方とも5109なので幅ゼロ
    const wide: MeasuredPostageRate = {
      ...fedexEconomyUs,
      weightPointsByCountry: { US: [{ g: 500, yen: 5000 }, { g: 1000, yen: 6000 }] },
    };
    expect(courierPriceFor(wide, 'US', 700, DEFAULT_PARCEL_DIMENSIONS_CM))
      .toEqual({ low: 5000, high: 6000 });
  });

  test('データの無い国は null（0円にしない）', () => {
    expect(courierPriceFor(fedexEconomyUs, 'DE', 600, DEFAULT_PARCEL_DIMENSIONS_CM)).toBeNull();
  });

  test('測定範囲の外（下も上も）は null。外挿しない', () => {
    expect(courierPriceFor(fedexEconomyUs, 'US', 100, DEFAULT_PARCEL_DIMENSIONS_CM)).toBeNull();
    expect(courierPriceFor(fedexEconomyUs, 'US', 50000, DEFAULT_PARCEL_DIMENSIONS_CM)).toBeNull();
  });

  test('既定の箱と違う寸法では引けない（測ったのは既定の箱だけ）', () => {
    const bigBox = { lengthCm: 50, widthCm: 50, heightCm: 50 };
    expect(courierPriceFor(fedexEconomyUs, 'US', 600, bigBox)).toBeNull();
  });

  test('単調性が崩れている区間だけ high: null に落ちる', () => {
    const nonMonotonic: MeasuredPostageRate = {
      ...fedexEconomyUs,
      weightPointsByCountry: { US: [{ g: 500, yen: 6000 }, { g: 1000, yen: 5000 }] },
    };
    expect(courierPriceFor(nonMonotonic, 'US', 700, DEFAULT_PARCEL_DIMENSIONS_CM))
      .toEqual({ low: 6000, high: null });
  });
});
