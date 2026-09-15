import { describe, expect, test } from 'vitest';
import { POSTAL_METHODS, RANKED_COURIER_METHOD_IDS, courierMethodAvailable } from '@/lib/pricing/postage';
import type { CountryCode, CourierMethod, PostalMethod } from '@/lib/pricing/types';
import {
  CARRIERS, COURIER_RAW_LABELS, DAYS_NOT_PUBLISHED, TIER_NOT_PUBLISHED,
  methodDisplay, methodFullLabel, methodGroups, methodRawNote, notPricedFor,
} from './methodDisplay';

const ALL: readonly (PostalMethod | CourierMethod)[] = [
  ...POSTAL_METHODS.map((m) => m.id), ...RANKED_COURIER_METHOD_IDS,
];

describe('methodDisplay: 表示名は整形、原文は捨てない', () => {
  test('原文（raw）はマスタの labelRaw と一字一句一致する', () => {
    // **これが要**: 表示名を整えたことで原文との対応が切れていないかを、
    // マスタ（`COURIER_METHODS` = 各社の `labelRaw`）と突き合わせて検査する。
    for (const id of RANKED_COURIER_METHOD_IDS) {
      expect(methodDisplay(id).raw, id).toBe(COURIER_RAW_LABELS[id]);
    }
  });

  test('すべての方式に表示名・日数・原文の出どころがある', () => {
    for (const id of ALL) {
      const d = methodDisplay(id);
      expect(d.service.length, id).toBeGreaterThan(0);
      expect(d.days.length, id).toBeGreaterThan(0);
      expect(d.rawFrom.length, id).toBeGreaterThan(0);
      expect(CARRIERS).toContain(d.carrier);
    }
  });

  test('便名に会社名を重ねない・全部大文字を残さない・括弧の日数を名前に残さない', () => {
    for (const id of ALL) {
      const d = methodDisplay(id);
      if (d.carrier !== 'Japan Post') {
        expect(d.service.toLowerCase(), id).not.toContain(d.carrier.toLowerCase());
      }
      // 全部大文字の単語（EMS のような略語は郵便側のみ許す）を宅配便の便名に残さない。
      if (d.carrier !== 'Japan Post') {
        expect(d.service, id).not.toMatch(/\b[A-Z]{3,}\b/);
      }
      expect(d.service, id).not.toMatch(/\(\s*\d/); // 「(3-5 days)」のような括弧の日数
    }
  });

  test('日数の書式は1つ（ダッシュは – のみ、内部語は出さない）', () => {
    for (const id of ALL) {
      const d = methodDisplay(id);
      if (d.days === DAYS_NOT_PUBLISHED) continue;
      expect(d.days, id).toMatch(/^(≤\d+ (days|week)|\d+–\d+ (days|months))$/);
      expect(d.days, id).not.toContain('-'); // ハイフンではなく en dash
    }
    for (const id of ALL) expect(methodDisplay(id).days).not.toContain('not yet modeled');
  });

  test('種別が公表されていない便は Standard と決めつけない', () => {
    expect(methodDisplay('courier-fedex').service).toBe(TIER_NOT_PUBLISHED);
    expect(methodDisplay('courier-ups').service).toBe(TIER_NOT_PUBLISHED);
    expect(methodDisplay('courier-dhl').service).toBe(TIER_NOT_PUBLISHED);
    for (const id of ALL) expect(methodDisplay(id).service).not.toBe('Standard');
  });

  test('原文の注釈は社名と原文を両方出す', () => {
    expect(methodRawNote('courier-fedex-lowcost')).toBe('ZenMarket: “FEDEX LOWCOST”');
    expect(methodRawNote('ems')).toContain('Japan Post');
  });

  test('単独で読む名前（順位ボード・配達ログ）は会社名を付ける', () => {
    expect(methodFullLabel('courier-fedex-economy')).toBe('FedEx Economy');
    expect(methodFullLabel('courier-dhl-express-1200')).toBe('DHL Express 12:00');
    expect(methodFullLabel('courier-ups')).toBe(`UPS ${TIER_NOT_PUBLISHED}`);
    expect(methodFullLabel('ems')).toBe('EMS'); // 郵便はグループ名を重ねない
  });
});

describe('methodGroups: 束ねない・落とさない', () => {
  test('全方式を選ぶと、ID の集合はマスタと完全に一致する（束ねも取りこぼしも無い）', () => {
    const got = methodGroups(() => true).flatMap((g) => g.methods.map((m) => m.id));
    expect([...got].sort()).toEqual([...ALL].sort());
    expect(got.length).toBe(ALL.length); // 重複が無い
  });

  test('グループの並びは CARRIERS の順、グループ内はマスタの順', () => {
    const groups = methodGroups(() => true);
    const order = groups.map((g) => g.carrier);
    expect(order).toEqual([...order].sort((a, b) => CARRIERS.indexOf(a) - CARRIERS.indexOf(b)));
    expect(groups[0]!.carrier).toBe('Japan Post');
    expect(groups[0]!.methods.map((m) => m.id)).toEqual(POSTAL_METHODS.map((m) => m.id));
  });

  test('価格の付く便だけを選ぶと、その宛先の実際の可用性と一致する', () => {
    for (const cc of ['US', 'GB', 'DE', 'FR', 'AU', 'CA', 'SG'] as const) {
      const priced = methodGroups((id) => !id.startsWith('courier-')
        || courierMethodAvailable(id as CourierMethod, cc as CountryCode))
        .flatMap((g) => g.methods.map((m) => m.id));
      // 郵便5方式は常に居る。
      for (const m of POSTAL_METHODS) expect(priced, cc).toContain(m.id);
      for (const id of RANKED_COURIER_METHOD_IDS) {
        expect(priced.includes(id), `${cc} ${id}`).toBe(courierMethodAvailable(id, cc));
      }
    }
  });

  test('価格の付かない便は 1件以上あり、国名を添えた1つの言い方で説明される', () => {
    const hidden = methodGroups((id) => id.startsWith('courier-')
      && !courierMethodAvailable(id as CourierMethod, 'DE'));
    expect(hidden.flatMap((g) => g.methods).length).toBeGreaterThan(0);
    expect(notPricedFor('DE')).toBe('not priced for Germany');
  });
});
