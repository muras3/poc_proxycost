import { describe, expect, test } from 'vitest';
import { compare } from './compare';
import type { CountryCode, Item } from './types';

/**
 * 監査 (docs/audit/close-coverage-gaps-2026-09-13.md ④):
 *
 * `Math.round` の出現箇所（`src/lib/pricing/compare.ts`）を棚卸しした表:
 *
 * | 箇所（関数/行の目的）                          | 何を                          | 何の単位に |
 * |------------------------------------------------|-------------------------------|-----------|
 * | `grossG`                                        | 梱包後重量                     | グラム    |
 * | `itemWeightG`（2箇所）                          | 商品重量                       | グラム    |
 * | `province-tax`（州指定あり/人口加重平均の2箇所）| 州税額                          | 円        |
 * | `duty`（flat / free-no-duty-rate混在 / rate単独 の3箇所） | 関税額                | 円        |
 * | `vat`                                           | VAT/GST額                      | 円        |
 * | `clearance`                                     | 通関手数料                     | 円        |
 * | `prepaid-import-tax`（ad valorem / estimated の2箇所） | 決済時徴収の推定税額     | 円        |
 * | `provincialTaxLine` 内の `base * p.rate`        | （↑と同じ行、再掲）             | 円        |
 * | `courier-clearance-fee`（low/high/note内の3箇所）| 宅配便の通関手数料の下端・上端  | 円        |
 * | `deposit`                                       | デポジット手数料               | 円        |
 * | `src/lib/ui/format.ts` `yen()`                  | 表示用の円額                   | 円        |
 * | `src/lib/ui/format.ts` `yenRounded()`           | 表示用の総額                   | **¥100**  |
 * | `src/lib/ui/format.ts` `foreign()`              | 表示用の外貨換算額             | 現地通貨の整数単位 |
 *
 * **単位の混在は見つからなかった。** 金額系はすべて「円の整数」に丸めており、
 * `yenRounded()` の ¥100 だけが例外だが、これは表示専用（`totalIntervalText`/
 * `yenRange` の `round` 引数）で、丸めた後の値が計算に戻ることは無い
 * （`compare.ts` 側は `yen`/`yenRounded` を import すらしていない——
 * `grep -rn "yenRounded" src/lib/pricing/` はゼロ件）。
 *
 * **二重丸めも見つからなかった。** `Line.amount` はどの行も一度だけ `Math.round`
 * され、`sum()`/`totalRange()`（`Row.total`）はその整数を単純合計するだけで
 * 再度丸めない。VAT の課税ベースに足す関税額（`dutyYenP`）も、表示用に丸めた
 * `duty.amount` ではなく丸め前の `dutyPerParcel[i].yen` を使っている
 * （`tax-order.test.ts` が別途、この生の値がVATベースに入ることを確認している）。
 *
 * 下のテストはこの2点（①各行の金額は必ず整数円である／② `Row.total.low` は
 * 各行の金額を丸めずに単純合計した値と一致する＝合計側で追加の丸めが起きていない）
 * を、複数国・複数カートで横断的に固定する。
 */

function item(over: Partial<Item> & { id: string }): Item {
  return {
    title: over.id, priceYen: 3000, priceTier: 'fixed', site: 'yahoo-auctions',
    weightG: 600, weightTier: 'estimate', qty: 1, ...over,
  };
}

const COUNTRIES_ALL: CountryCode[] = ['US', 'GB', 'DE', 'FR', 'AU', 'CA', 'SG'];

describe('rounding: every money line is a whole yen, and totals are not re-rounded', () => {
  test('every Line.amount across all countries is an integer (no fractional yen leaks through)', () => {
    // 端数が出やすいよう、割り切れない価格・複数点・複数国で横断的に確認する。
    const prices = [3333, 12_345, 99_999, 40_007];
    for (const cc of COUNTRIES_ALL) {
      for (const priceYen of prices) {
        const items = [item({ id: 'a', priceYen }), item({ id: 'b', priceYen: priceYen + 1, qty: 1 })];
        const rows = compare({ method: 'ems', items, country: cc }).rows;
        for (const row of rows) {
          for (const line of row.lines) {
            if (line.amount != null) {
              expect(Number.isInteger(line.amount), `${cc} ${row.id} ${line.key}`).toBe(true);
            }
          }
        }
      }
    }
  });

  test('Row.total.low is the exact sum of the row\'s own line amounts — the total is not independently re-rounded', () => {
    // これは「合計行が個々の行と食い違わない」という内部一貫性の確認であって、
    // それ単体では丸め単位の変化（下のテスト）は捕まえない——`total` は
    // `sum(lines)` の定義そのものなので、個々の行がどんな単位で丸まっていても
    // この等式自体は常に成り立ってしまう。ここでは「崩れていないこと」の
    // 最低限の保証として残す。
    const items = [item({ id: 'a', priceYen: 40_007, weightG: 1234 }), item({ id: 'b', priceYen: 12_345, weightG: 555 })];
    for (const cc of COUNTRIES_ALL) {
      const rows = compare({ method: 'ems', items, country: cc }).rows;
      for (const row of rows) {
        const sumOfLines = row.lines.reduce((a, l) => a + (l.amount ?? 0), 0);
        expect(row.total.low, `${cc} ${row.id}`).toBe(sumOfLines);
      }
    }
  });

  test('the duty line rounds to the nearest yen, not to some coarser unit (US, FOB base)', () => {
    // **これが実際に丸め単位そのものを主張するテスト。**上のテストは
    // 「合計＝内訳の合計」という同語反復なので、行1本の丸め粒度が変わっても
    // 検出できない。ここでは US（`base: 'FOB'`）で、$0.125 の関税が
    // ちょうど整数円に丸まらない商品代を選び、期待値を独立に計算して比較する。
    //
    // 6667円 × 12.5% = 833.375円 → 最も近い1円は833円（¥100単位に丸めれば
    // 誤って800円になる——このテストはその取り違えを捕まえるためにある）。
    const items = [item({ id: 'a', priceYen: 3_333 }), item({ id: 'b', priceYen: 3_334 })];
    const rows = compare({ method: 'ems', items, country: 'US' }).rows;
    const row = rows.find((r) => r.serviceId === 'zenmarket')!;
    const duty = row.lines.find((l) => l.key === 'duty')!;
    expect(row.boxes!.reduce((a, b) => a + b.declaredYen, 0)).toBe(6_667);
    expect(duty.amount).toBe(833); // Math.round(6667 * 0.125) = Math.round(833.375) = 833
  });
});
