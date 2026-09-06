import type { CountryCode } from './types';

// EMS 日本発（日本郵便 公表料金、全27段）
// https://www.post.japanpost.jp/send/oversea/charge/list-ems/all.html
// 確認日 2026-09-06。列 = 第1〜第5地帯。第4=米国、第3=ヨーロッパ・オセアニア・カナダ、第2=アジア。
export const EMS_SOURCE_URL =
  'https://www.post.japanpost.jp/send/oversea/charge/list-ems/all.html';
export const EMS_CHECKED_ON = '2026-09-06';

export const EMS_ZONE: Record<CountryCode, number> = {
  US: 4, GB: 3, DE: 3, FR: 3, AU: 3, CA: 3, SG: 2,
};

/** [上限g, 第1帯, 第2帯, 第3帯, 第4帯, 第5帯] */
export const EMS_TABLE: readonly (readonly number[])[] = [
  [500, 1450, 1900, 3150, 3900, 3600],    [600, 1600, 2150, 3400, 4180, 3900],
  [700, 1750, 2400, 3650, 4460, 4200],    [800, 1900, 2650, 3900, 4740, 4500],
  [900, 2050, 2900, 4150, 5020, 4800],    [1000, 2200, 3150, 4400, 5300, 5100],
  [1250, 2500, 3500, 5000, 5990, 5850],   [1500, 2800, 3850, 5550, 6600, 6600],
  [1750, 3100, 4200, 6150, 7290, 7350],   [2000, 3400, 4550, 6700, 7900, 8100],
  [2500, 3900, 5150, 7750, 9100, 9600],   [3000, 4400, 5750, 8800, 10300, 11100],
  [3500, 4900, 6350, 9850, 11500, 12600], [4000, 5400, 6950, 10900, 12700, 14100],
  [4500, 5900, 7550, 11950, 13900, 15600],[5000, 6400, 8150, 13000, 15100, 17100],
  [5500, 6900, 8750, 14050, 16300, 18600],[6000, 7400, 9350, 15100, 17500, 20100],
  [7000, 8200, 10350, 17200, 19900, 22500],[8000, 9000, 11350, 19300, 22300, 24900],
  [9000, 9800, 12350, 21400, 24700, 27300],[10000, 10600, 13350, 23500, 27100, 29700],
  [11000, 11400, 14350, 25600, 29500, 32100],[12000, 12200, 15350, 27700, 31900, 34500],
  [13000, 13000, 16350, 29800, 34300, 36900],[14000, 13800, 17350, 31900, 36700, 39300],
  [15000, 14600, 18350, 34000, 39100, 41700],
] as const;

export const EMS_MAX_INDEX = EMS_TABLE.length - 1;

/** 重量から段の添字を引く。15kg 超は最上段に丸める（EMS の受付上限が 30kg で、
 *  そこから先は国別に段が分かれるため、この表では持たない）。 */
export function emsStepIndex(grams: number): number {
  for (let i = 0; i < EMS_TABLE.length; i++) {
    const row = EMS_TABLE[i];
    if (row && grams <= row[0]!) return i;
  }
  return EMS_MAX_INDEX;
}

export function emsStepGrams(index: number): number {
  const i = Math.min(EMS_MAX_INDEX, Math.max(0, index));
  return EMS_TABLE[i]![0]!;
}

export function emsYen(index: number, zone: number): number {
  const i = Math.min(EMS_MAX_INDEX, Math.max(0, index));
  return EMS_TABLE[i]![zone]!;
}

export function emsFor(grams: number, zone: number, stepOffset = 0) {
  const i = Math.min(EMS_MAX_INDEX, Math.max(0, emsStepIndex(grams) + stepOffset));
  return { yen: emsYen(i, zone), stepG: emsStepGrams(i), index: i };
}

export function formatStep(grams: number): string {
  return grams >= 1000 ? `${(grams / 1000).toFixed(grams % 1000 === 0 ? 0 : 1)} kg` : `${grams} g`;
}

/** 重量が不明なときに提示する段。EMS 表の段からしか取らない
 *  （任意の刻みだと隣の行が同じ総額になり、表が水増しに見える。docs/UI-DESIGN.md §4）。
 *  15kg まで出す意味がないので 5kg で切る。 */
export const UNKNOWN_WEIGHT_STEPS_G = [500, 1000, 1500, 2000, 3000, 5000] as const;
