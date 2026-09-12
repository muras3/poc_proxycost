import { describe, expect, test } from 'vitest';
import { SERVICES } from './services';

/**
 * **P2 1、オーナー確定 2026-09-12。**測定点の間を区間として見せる（`courierPriceFor`）
 * のは、各社・各便の価格が重量について単調非減少（軽いほうが安いか同額）だと
 * 分かっているときだけ安全——そうでなければ「下端」自体が嘘になりうる。
 *
 * `master/courier-rates.json` を直接検査するのではなく、そこから転記した
 * `services.ts` の `weightPointsByCountry` を検査する——**転記そのもの
 * （マスタの数字と一致しているか）は `master/validate.py` の役割**で、こちらは
 * 「転記された値が単調か」だけを見る。**この2つがずれたら、将来のデータ取り込みが
 * 静かに壊れたベースを作る**——それを CI で止めるのがこのテストの目的。
 */
describe('courier weight curves are monotonic in weight (per proxy, per method)', () => {
  for (const svc of SERVICES) {
    if (!svc.courier) continue;
    for (const [methodId, rate] of Object.entries(svc.courier)) {
      if (!rate) continue;
      for (const [cc, points] of Object.entries(rate.weightPointsByCountry)) {
        if (!points || points.length === 0) continue;
        test(`${svc.id} / ${methodId} / ${cc}: weight-ascending points are price-non-decreasing`, () => {
          const sorted = [...points].sort((a, b) => a.g - b.g);
          // 昇順で保持している前提そのものも検査する——降順や飛び順で入っていれば
          // `courierPriceFor` の「直下・直上の点」探索が壊れる。
          expect(points.map((p) => p.g)).toEqual(sorted.map((p) => p.g));
          for (let i = 1; i < sorted.length; i++) {
            expect(sorted[i]!.yen, `${svc.id}/${methodId}/${cc} at ${sorted[i]!.g}g`)
              .toBeGreaterThanOrEqual(sorted[i - 1]!.yen);
          }
        });
      }
    }
  }

  // **今日取り込んだ4社×USの全便が実際に単調だったことを固定する。**
  // `master/courier-rates.json` を 20×15×10cm の既定箱だけに絞って集計した結果
  // （2026-09-12 調査）——このPRでは単調性が崩れている便は1つも無かった。
  // 崩れる便が出た瞬間、`courierPriceFor` は自動でその区間だけ `high: null` に
  // 落ちる（上のテストではなく `courier-postage.test.ts` の単体テストが保証）。
  test('every US courier method wired in this PR is monotonic — no fallback-to-unknown was needed', () => {
    let checked = 0;
    for (const svc of SERVICES) {
      if (!svc.courier) continue;
      for (const rate of Object.values(svc.courier)) {
        const points = rate?.weightPointsByCountry.US;
        if (!points || points.length === 0) continue;
        checked++;
        const sorted = [...points].sort((a, b) => a.g - b.g);
        for (let i = 1; i < sorted.length; i++) {
          expect(sorted[i]!.yen).toBeGreaterThanOrEqual(sorted[i - 1]!.yen);
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
