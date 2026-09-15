import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { compare } from './compare';
import type { CompareInput, CountryCode, Item, ProvinceCode } from './types';

/**
 * このPR（`claude/engine-caveat-fields`）は `Row`/`Line`/`WeightSensitivity`/
 * `CompareResult` に構造化フィールドを**追加のみ**する——総額・順位・差額・
 * どの方式が選ばれるか・箱の分かれ方・費目の額は1円も動かさない、というのが
 * このPRの前提（CLAUDE.md §8 と同じ理由: 数値を動かす変更とUI/構造を足す変更を
 * 混ぜない）。
 *
 * 数値が動いていないことを検査するテスト。**巨大な固定JSONはコミットしない**
 * ——決定的な条件リスト（下の `COUNTRIES`/`WEIGHTS_G`/`METHODS`/`PRICES_YEN`/
 * `PROVINCES`）から `compare()` を呼び、総額・順位・差額・方式・箱の分かれ方・
 * 費目の額だけを拾った射影（`project*`）を国ごとにまとめて SHA-256 を取り、
 * 下の `EXPECTED_DIGEST` と比較する——射影そのものは日ごと変わりうる出力なので
 * 保存せず、変更前の main（`72bae6b`）でこのテストと同じロジックを走らせて
 * 得た digest だけをここに固定する。
 *
 * **`project*` は手で列挙したフィールドだけを拾う。**`JSON.stringify(row)` のような
 * 丸ごとシリアライズにすると、このPRで足した新フィールドがそのまま射影に混ざり、
 * 「新フィールドを足しただけ」でも digest が変わってしまい、このテストが検査したい
 * こと（数値が動いていないか）を検査できなくなる。
 */

const COUNTRIES: CountryCode[] = ['US', 'GB', 'DE', 'FR', 'AU', 'CA', 'SG'];
const WEIGHTS_G = [200, 500, 1000, 3000, 5000, 10000, 20000, 30000, 40000];
const METHODS: NonNullable<CompareInput['method']>[] = [
  'cheapest', 'ems', 'small-packet-air', 'courier-dhl', 'courier-fedex', 'courier-ups',
];
const PRICES_YEN = [3000, 30000, 200000];
const PROVINCES: (ProvinceCode | null)[] = [null, 'ON', 'AB', 'BC'];

function mkItem(priceYen: number, weightG: number): Item {
  return {
    id: 'i1', title: 'Test item', priceYen, priceTier: 'fixed', site: 'yahoo-auctions',
    weightG, weightTier: 'fixed', qty: 1,
  };
}

/** `Row` の数値部分だけを手で列挙して拾う。新フィールドが増えてもここには出ない。 */
function projectRow(r: ReturnType<typeof compare>['rows'][number]) {
  return {
    id: r.id,
    totalLow: r.total.low,
    totalHigh: r.total.high,
    rank: r.rank,
    diff: r.diff,
    method: r.method,
    cheapest: r.cheapest,
    comparable: r.comparable,
    boxesReasons: r.boxes.map((b) => b.reason),
    boxesCount: r.boxes.length,
    lines: r.lines.map((l) => ({ id: l.key, amount: l.amount, tier: l.tier })),
  };
}

function projectResult(res: ReturnType<typeof compare>) {
  return {
    rows: res.rows.map(projectRow),
    rankStable: res.rankStable,
    rankIndeterminate: res.rankIndeterminate,
    totalRangeYen: res.totalRangeYen,
  };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function digestFor(cc: CountryCode): string {
  const results: unknown[] = [];
  for (const w of WEIGHTS_G) {
    for (const method of METHODS) {
      for (const price of PRICES_YEN) {
        if (cc === 'CA') {
          for (const province of PROVINCES) {
            const res = compare({ items: [mkItem(price, w)], country: cc, method, province });
            results.push({ w, method, price, province, res: projectResult(res) });
          }
        } else {
          const res = compare({ items: [mkItem(price, w)], country: cc, method });
          results.push({ w, method, price, res: projectResult(res) });
        }
      }
    }
  }
  return createHash('sha256').update(canonical(results)).digest('hex');
}

// **これらは変更前の main（`72bae6b`）で、上と同じロジックを走らせて得た digest。**
// 変更後にこの値と一致すれば、上に列挙した数値射影（総額・順位・差額・方式・
// 箱の分かれ方・費目の額）は1件も変わっていない。
const EXPECTED_DIGEST: Record<CountryCode, string> = {
  US: 'f3f0990ce0a56df94604aa38b3945942a9e5cfb6804316729add8b46726b77e5',
  GB: '6b268c81ff09ed6aca44a54bedec02de296ae503e623b228ad4767efb2e9b389',
  DE: '18fb9a38f52d941246537c095a7609fcd4d958c3ced0b328b56c8e2bf3b1f950',
  FR: '37e06f3a6000833edcadd1e56b53684a2067665064bf58b267fb9682e49473af',
  AU: 'deccf3fca21ce384654bdcd6e3a39129e0f177b2798d09d48ac9c420d78d43fd',
  CA: 'a0420f7ce7c3ef032a33a2e498faba0d6027cd62caa635562c8fbfa8e5892836',
  SG: 'c3e0d759f3d5f47019e9383cfa429a584e4846b1c626346378a1b7262d204e07',
};

describe('compare() 数値不変（エンジンにフィールドを足しただけで数値は動いていない）', () => {
  for (const cc of COUNTRIES) {
    it(`${cc}: 総額・順位・差額・方式・箱・費目額の射影が変更前 main と一致する`, () => {
      expect(digestFor(cc)).toBe(EXPECTED_DIGEST[cc]);
    });
  }
});
