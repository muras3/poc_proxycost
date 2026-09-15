import { describe, expect, test } from 'vitest';
import { compare } from './compare';
import { SERVICES } from './services';
import type { CompareInput, CompareResult, Item } from './types';

/**
 * REQUIREMENTS.md §5「順位は報酬額を一切参照しない」。
 *
 * `Service.paysUs` / `Service.referralNote` は `compare.ts` が `Row` へそのまま
 * 通すだけの pass-through フィールド（`compare.ts` L1899-1900, `services.ts` の
 * コメント「アフィリエイト報酬を払うか。**順位計算には一切使わない。**」）。
 * `rank()` 自身のコメントも同じ約束を書いている
 * （「総額の昇順で順位を付ける。**報酬額（paysUs）は一切参照しない。**」）。
 *
 * このテストはその約束を実際に検査する: `SERVICES`（5社）の `paysUs` を
 * true/false の全32通り（2^5）に、`referralNote` も combo ごとに変えて
 * `compare()` を都度走らせ、**`paysUs`/`referralNote` 自身を除いた出力**
 * （順位・総額・cheapest・tied・rankStable・rankIndeterminate・おすすめ枠 等
 * すべて）が32通りとも一致することを見る。
 *
 * ## 注入方法（コメント: 最小侵襲を選んだ理由）
 *
 * `compare()` は `SERVICES` をモジュール定数として直接読む（DI 用の引数は無い）。
 * 新しい注入口を `compare()` に足すことも考えたが、そのための型変更・呼び出し側
 * 全部への影響を避けるため、ここでは `SERVICES` の要素（`paysUs`/`referralNote`
 * だけ）をテスト内で一時的に書き換え、`finally` で必ず元の値へ戻す方法を取った。
 * `Service` 型は `readonly` を付けていないため実行時には書き換え可能で、
 * `SERVICES` は `Object.freeze` もされていない（`services.ts` 参照）。
 * 他のテストファイルは Vitest の既定（`isolate: true`）によりファイルごとに
 * 別のモジュールインスタンスを持つため、ここでの書き換えは他ファイルへ漏れない。
 *
 * 別 PR が全社の `paysUs` を false に揃える作業を進めている
 * （タスク指示）ので、このテストは**現在の `paysUs`/`referralNote` の値に依存しない**
 * ——値を毎回このテストが決め打ちし、書き換え前の値には一切アサートしない。
 */

function item(over: Partial<Item> & { id: string }): Item {
  const weightG = 'weightG' in over ? over.weightG : 600;
  return {
    title: over.id, priceYen: 3000, priceTier: 'fixed', site: 'yahoo-auctions',
    weightG: 600, weightTier: weightG == null ? 'none' : 'estimate', qty: 1, ...over,
  };
}

function items(n: number, weightG: number | null, priceYen = 3000): Item[] {
  return Array.from({ length: n }, (_, i) => item({ id: `i${i}`, priceYen, weightG }));
}

/** 5社ぶんの `paysUs`/`referralNote` の組。`referralNote` は combo ごとに巡回させて変える。 */
const REFERRAL_NOTES: (string | null)[] = [
  null,
  'pays us ¥100 if you sign up',
  '',
  'pays us a % of your purchase',
  'x'.repeat(80),
];

function comboFor(mask: number): { paysUs: boolean[]; referralNote: (string | null)[] } {
  return {
    paysUs: SERVICES.map((_, i) => Boolean(mask & (1 << i))),
    referralNote: SERVICES.map((_, i) => REFERRAL_NOTES[(mask + i) % REFERRAL_NOTES.length]!),
  };
}

/**
 * `SERVICES` の `paysUs`/`referralNote` を一時的に書き換えて `fn` を走らせ、
 * 必ず元の値に戻す。`SERVICES` は宣言順が固定（services.ts）なので配列添字で対応させる。
 */
function withAffiliateFields<T>(paysUs: boolean[], referralNote: (string | null)[], fn: () => T): T {
  if (paysUs.length !== SERVICES.length || referralNote.length !== SERVICES.length) {
    throw new Error(
      `withAffiliateFields: expected ${SERVICES.length} entries (SERVICES.length), `
      + `got paysUs=${paysUs.length} referralNote=${referralNote.length}`,
    );
  }
  const originals = SERVICES.map((s) => ({ paysUs: s.paysUs, referralNote: s.referralNote }));
  try {
    SERVICES.forEach((s, i) => {
      s.paysUs = paysUs[i]!;
      s.referralNote = referralNote[i]!;
    });
    return fn();
  } finally {
    SERVICES.forEach((s, i) => {
      s.paysUs = originals[i]!.paysUs;
      s.referralNote = originals[i]!.referralNote;
    });
  }
}

/** `paysUs`/`referralNote`（を含みうる全ての箇所）を再帰的に取り除いた値。深い等価比較用。 */
function stripAffiliate<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => stripAffiliate(v)) as unknown as T;
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === 'paysUs' || k === 'referralNote') continue;
      out[k] = stripAffiliate(v);
    }
    return out as T;
  }
  return value;
}

function runStripped(input: CompareInput, mask: number): CompareResult {
  const { paysUs, referralNote } = comboFor(mask);
  return stripAffiliate(withAffiliateFields(paysUs, referralNote, () => compare(input)));
}

// 代表的な入力: 複数国・複数重量・郵便（既定 cheapest / 明示 ems）・宅配便・重量不明（bands
// 経路）・1位タイの双方を含む。既存テスト（compare.test.ts）が使っている国・方式の組み合わせに
// 合わせた。
const SCENARIOS: { name: string; input: CompareInput }[] = [
  { name: 'US, 1 item 300g, cheapest（既定の郵便選択）', input: { items: items(1, 300), country: 'US' } },
  { name: 'GB, 3 items 600g, ems 明示', input: { items: items(3, 600), country: 'GB', method: 'ems' } },
  { name: 'AU, 1 item 3000g, cheapest', input: { items: items(1, 3000), country: 'AU' } },
  { name: 'CA, 5 items 200g, cheapest（州未指定）', input: { items: items(5, 200), country: 'CA' } },
  {
    name: 'SG, 1 item 5000g, courier-fedex（宅配便ケース）',
    input: { items: items(1, 5000), country: 'SG', method: 'courier-fedex' },
  },
  {
    name: 'US, 1 item 1000g, courier-ups（宅配便・別国のケース）',
    input: { items: items(1, 1000), country: 'US', method: 'courier-ups' },
  },
  {
    // 現行データでの実測: zenmarket と fromjapan が総額 ¥8,682 で1位タイになる
    // （scratchpad のグリッド走査で発見。docs/audit/ties-2026-09-07.md が記録した
    // 旧タイ実例はレート更新で崩れていたため、現行データで新たに探し直した）。
    // `rank()` の第2キー（社名辞書順・のちに報酬額）が悪さをしたのは**このタイの場面**
    // なので、この入力が無いと sabotage 検査（tiebreak mutation）に穴が空く。
    name: 'US, 1 item 500g, cheapest（1位タイ: zenmarket = fromjapan）',
    input: { items: items(1, 500), country: 'US' },
  },
  {
    // 重量不明 → bands 経路（Band.rows / Band.cheapestRowIds など）を通す。
    // 通常経路（rows 直下）としか比べないと、この経路だけの回帰を見逃す。
    name: 'US, 3 items 重量不明, cheapest（bands 経路）',
    input: { items: items(3, null), country: 'US' },
  },
];

describe('rank / totals ignore paysUs and referralNote (REQUIREMENTS.md §5)', () => {
  test('SERVICES has exactly 5 services — the 32-combo math (2^5) assumes this', () => {
    expect(SERVICES.length).toBe(5);
  });

  // **書き換えが実際に compare() の出力へ届いているかを検査する。**
  // これが無いと、下の「32通り全部一致する」というテストは、注入が黙って効いて
  // いなくても（例: SERVICES が凍結される・compare() が起動時のスナップショットを
  // 読むようリファクタされる、等の将来の変化で）同じく「全部一致」を返し、
  // 検査ゼロのまま緑になる（CLAUDE.md §4 が警告する「検査が検査になっていない」型）。
  test('withAffiliateFields actually reaches compare() output — the row carries the injected paysUs/referralNote', () => {
    const mask = 0b10101; // neokyo/fromjapan/jauce = true、zenmarket/buyee = false（SERVICES の宣言順）
    const { paysUs, referralNote } = comboFor(mask);
    const result = withAffiliateFields(paysUs, referralNote, () => compare({ items: items(1, 300), country: 'US' }));
    expect(result.rows.length).toBeGreaterThan(0);
    for (const row of result.rows) {
      const i = SERVICES.findIndex((s) => s.id === row.serviceId);
      expect(i, `unknown serviceId ${row.serviceId}`).toBeGreaterThanOrEqual(0);
      expect(row.paysUs, `row ${row.id} paysUs`).toBe(paysUs[i]);
      expect(row.referralNote, `row ${row.id} referralNote`).toBe(referralNote[i]);
    }
  });

  test.each(SCENARIOS)('$name: identical output across all 32 paysUs combos (referralNote varied too)', ({ input }) => {
    const baseline = runStripped(input, 0);
    // 少なくとも1行は比較可能でなければ、このシナリオは何も検査していないことになる。
    expect(baseline.rows.some((r) => r.comparable), 'scenario should produce at least one comparable row').toBe(true);

    for (let mask = 1; mask < 32; mask++) {
      const result = runStripped(input, mask);
      expect(result, `mask=${mask.toString(2).padStart(5, '0')}`).toEqual(baseline);
    }
  });
});
