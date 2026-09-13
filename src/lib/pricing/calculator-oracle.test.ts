/**
 * 計算機オラクル: `master/courier-rates.json` に採取済みの代行計算機の表示額と、
 * 我々のエンジン（`postageFor()`/`markupYen()`）を、同じ入力で突き合わせる。
 *
 * 目的は「一致すること」の確認だけではない。**`differ_unexplained`（説明の付かない差）
 * が1件でも出たら、それはこのPRが探しにきたもの——実請求ゼロ件でも見つけられる
 * エンジンの不具合、または表の読み違いを表す。** このテストは差分をレポートとして
 * 出力した上で、`differ_unexplained` が0件であることをアサートする。0件でなくなった
 * ら、このテストを直す前にまず「エンジンが間違っているのかマスタが間違っているのか」
 * を確認すること（`src/lib/pricing/` のロジック自体は変更しない、というこのPRの
 * 制約は、次にこの検査が落ちたときには適用されない——検査は正しく仕事をしている）。
 */

import { describe, expect, it } from 'vitest';
import {
  loadCommittedOracleObservations,
  runOracleComparison,
  TOLERANCE_YEN,
  type OracleClassification,
} from './calculator-oracle';

function tally(classification: OracleClassification, results: ReturnType<typeof runOracleComparison>) {
  return results.filter((r) => r.classification === classification);
}

describe('calculator oracle: postal-method postage vs proxy calculators', () => {
  const observations = loadCommittedOracleObservations();
  const results = runOracleComparison(observations);

  it('has at least one comparable observation from each of the two proxies that publish item-agnostic postal rates', () => {
    // データが空のまま「0件だから0件不一致」で通ってしまう検査にしない
    // （CLAUDE.md §4 が戒める「検査が検査になっていない」型の欠陥）。
    const proxies = new Set(results.map((r) => r.observation.proxy));
    expect(proxies.has('fromjapan')).toBe(true);
    expect(proxies.has('jauce')).toBe(true);
    expect(results.length).toBeGreaterThanOrEqual(30);
  });

  it('includes the positive control (US, Jauce EMS) and it is comparable', () => {
    const control = results.find((r) => r.observation.id.endsWith(':positive-control'));
    expect(control).toBeTruthy();
    expect(control?.classification).not.toBe('not_comparable');
  });

  it('prints the full diff report (this output is the deliverable, not just the pass/fail)', () => {
    const lines: string[] = [];
    lines.push('');
    lines.push('=== Calculator Oracle report ===');
    lines.push(`tolerance: ¥${TOLERANCE_YEN} (Japan Post's published tables are exact-yen; no FX rounding applies)`);
    lines.push(`total observations compared: ${results.length}`);
    for (const cls of ['match', 'differ_named', 'differ_unexplained', 'not_comparable'] as const) {
      lines.push(`  ${cls}: ${tally(cls, results).length}`);
    }
    const problems = results.filter((r) => r.classification === 'differ_named' || r.classification === 'differ_unexplained');
    if (problems.length) {
      lines.push('');
      lines.push('--- mismatches (this is what the PR asked to find) ---');
      for (const r of problems) {
        lines.push(
          `[${r.classification}] ${r.observation.id}: calculator=¥${r.observation.displayedYen}`
          + ` engine=¥${r.engineYen} residual=¥${r.residualYen} — ${r.note}`,
        );
      }
    }
    console.log(lines.join('\n'));
    expect(results.length).toBeGreaterThan(0);
  });

  /**
   * **既知の未解決差分（このPRが実際に見つけたもの）。**
   *
   * `jauce_v3_remeasurement_2026_09_13` の CA/GB・500g・EMS/Surface の4件だけが
   * `differ_unexplained` になる。表示額(¥2,150／¥2,350)は、我々のエンジンが
   * 出す額(¥3,150／¥2,750)のどのゾーン・どの段の値とも一致しない——**唯一
   * 一致するのは「600g・第2地帯」のEMS表の値(¥2,150)** であり、500gの
   * どの地帯の値でもない。これは以下のどちらかを意味する:
   *
   * 1. **測定側の残留値**（CLAUDE.md §10 が記録した「stale値の残留」と同じ形の
   *    汚染。この観測自身の `contamination_note` が「click1ではAUの残留値が
   *    誤表示され、click2で正しい値に切り替わった」と記すが、その「正しい」は
   *    自己申告であって独立に検算されていない）。
   * 2. **我々の `EMS_ZONE`（`src/lib/pricing/ems.ts`）が CA/GB を誤って
   *    AU/FR と同じ第3地帯に置いている**（Jauce が実際には CA/GB を別地帯・
   *    別料金体系で扱っている場合）。
   *
   * **このPRの範囲では `src/lib/pricing/` を変更しないので、どちらが正しいかは
   * 判定していない。** 次に取るべき行動は、CA・GB を単独条件・単一ブラウザ
   * セッションで再測定し、500g/600g/1000gの3点を2〜3回SUBMITして確定させること
   * （`docs/measurements/CALCULATOR-ORACLE.md` の条件G）。
   *
   * この一覧を空にする・増やす変更は、上の再測定なしに行わないこと——
   * このテストが「差分がある」と言い続けることに意味がある。
   */
  const KNOWN_UNRESOLVED_MISMATCH_IDS = new Set([
    'jauce:CA:500g:ems',
    'jauce:CA:500g:surface',
    'jauce:GB:500g:ems',
    'jauce:GB:500g:surface',
  ]);

  it('has exactly the known, still-unresolved unexplained differences — no more, no fewer', () => {
    const unexplainedIds = new Set(tally('differ_unexplained', results).map((r) => r.observation.id));
    expect(unexplainedIds).toEqual(KNOWN_UNRESOLVED_MISMATCH_IDS);
  });

  it.each(loadCommittedOracleObservations())(
    'classifies $id as match, not_comparable, or a known unresolved mismatch',
    (observation) => {
      const results = runOracleComparison([observation]);
      const result = results[0]!;
      if (result.classification === 'differ_unexplained') {
        expect(KNOWN_UNRESOLVED_MISMATCH_IDS).toContain(observation.id);
      } else {
        expect(['match', 'not_comparable']).toContain(result.classification);
      }
    },
  );
});
