import { describe, expect, test } from 'vitest';
import {
  DEFAULT_PARCEL_DIMENSIONS_CM, MAX_CUBE_SIDE_CM,
  billableWeightG, courierPriceFor, dimensionsExceedCube, volumetricWeightG,
} from './postage';
import type { MeasuredPostageRate } from './services';

// P2: 器そのものの単体テスト。**このPR時点でどの社にも実データを入れていない**
// （コーディネーターの指示——データ取り込みは別PR）ので、ここは全部フィクスチャ。

describe('DEFAULT_PARCEL_DIMENSIONS_CM ── 既定の箱', () => {
  test('20×15×10cm。最大辺は日本郵便のどの寸法上限（30/40cm）も下回る', () => {
    expect(DEFAULT_PARCEL_DIMENSIONS_CM).toEqual({ lengthCm: 20, widthCm: 15, heightCm: 10 });
    const maxSide = Math.max(
      DEFAULT_PARCEL_DIMENSIONS_CM.lengthCm,
      DEFAULT_PARCEL_DIMENSIONS_CM.widthCm,
      DEFAULT_PARCEL_DIMENSIONS_CM.heightCm,
    );
    for (const cap of Object.values(MAX_CUBE_SIDE_CM)) {
      expect(maxSide, 'default box must stay under every known cap').toBeLessThan(cap!);
    }
  });
});

describe('dimensionsExceedCube ── 寸法による「送れない」（額ではなく可否）', () => {
  test('既定の箱では、寸法上限を持つどの方式でも false（今日の挙動を変えない理由）', () => {
    for (const m of Object.keys(MAX_CUBE_SIDE_CM) as (keyof typeof MAX_CUBE_SIDE_CM)[]) {
      expect(dimensionsExceedCube(m, DEFAULT_PARCEL_DIMENSIONS_CM), m).toBe(false);
    }
  });

  test('実測の bulky 相当（60×50×40）は EMS・国際小包・小形包装物のいずれも超える', () => {
    const bulky = { lengthCm: 60, widthCm: 50, heightCm: 40 };
    expect(dimensionsExceedCube('ems', bulky)).toBe(true);
    expect(dimensionsExceedCube('parcel-air', bulky)).toBe(true);
    expect(dimensionsExceedCube('parcel-surface', bulky)).toBe(true);
    expect(dimensionsExceedCube('small-packet-air', bulky)).toBe(true);
  });

  test('上限を持たない方式（small-packet-surface）は常に false ── 未確認を送れないに倒さない', () => {
    expect(dimensionsExceedCube('small-packet-surface', { lengthCm: 200, widthCm: 200, heightCm: 200 }))
      .toBe(false);
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
