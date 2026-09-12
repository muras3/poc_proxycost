import type { CompareResult } from '@/lib/pricing/types';
import { tierClass } from '@/lib/ui/tiers';

/** ラベルの重複を消しつつ順序を保つ。同じ費目名が複数社に出ても1回だけ言う。 */
function uniqueLabels(lines: { label: string }[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of lines) {
    if (seen.has(l.label)) continue;
    seen.add(l.label);
    out.push(l.label);
  }
  return out;
}

/**
 * 総額の何が弱いのかを、隠さずに列挙する。
 *
 * **2026-09-12 修正。**以前は1位の行（`result.rows[0]`）だけを見ていた——
 * #74 で足した入金手数料の `tier: 'estimate'`（Neokyo・FROM JAPAN・Buyee の3社）は、
 * その3社のどれも1位でなければ、ここに一度も出ない。**「実際に出るか確かめる」
 * という指示への答えは「出ない」だった。**比較可能な全行を見て、行のどこかに
 * 出た費目ラベルを1回だけ集める——1位に限定する理由（画面の主役は1位という
 * 見せ方）と、確度の開示（何が弱いか）は別の要求なので、後者は全行を対象にする。
 */
export function WhatCouldBeOff({ result }: { result: CompareResult }) {
  const rows = result.rows.filter((r) => r.comparable);
  if (!rows.length) return null;

  const allLines = rows.flatMap((r) => r.lines);
  const estimates = uniqueLabels(allLines.filter((l) => l.tier === 'estimate'))
    .map((label) => ({ label }));
  const second = uniqueLabels(allLines.filter((l) => l.tier === 'unverified'))
    .map((label) => ({ label }));
  const missing = uniqueLabels(allLines.filter((l) => l.amount == null))
    .map((label) => ({ label }));

  return (
    <section className="mt-8 rounded border border-neutral-200 p-4 text-xs dark:border-neutral-800">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        What could be off
      </h2>
      <ul className="mt-2 space-y-1 text-neutral-600 dark:text-neutral-400">
        {estimates.length > 0 && (
          <li>
            <span className={tierClass.estimate}>Estimated</span>:{' '}
            {estimates.map((l) => l.label).join(', ')}. These are our assumptions, not
            published figures.
          </li>
        )}
        {second.length > 0 && (
          <li>
            <span className={tierClass.unverified}>Second-hand</span>:{' '}
            {second.map((l) => l.label).join(', ')}. We have not read the original source.
          </li>
        )}
        {missing.length > 0 && (
          <li>
            <span className={tierClass.none}>Not included</span>:{' '}
            {missing.map((l) => l.label).join(', ')}. Your real bill will be higher, not lower.
          </li>
        )}
        <li>
          {/* **F5**: 以前は「勝つのは常に EMS」という前提でこの1文を書いていたが、
              宅配便が7カ国すべてに配線され、既定カートは常に宅配便が勝つように
              なった今、EMS を名指しするのは事実に反する（コーディネーター指摘
              2026-09-12）。方式に関係なく言える主張——公表された料率表を使って
              いる、こちらが仮定しているのは重量（宅配便なら箱の大きさも）——
              だけを残す。どの方式が実際に勝ったかはこの一覧では特定の1行に
              絞らない（複数行を比較しているため）ので、方式名は挙げない。 */}
          The order below is what we stand behind. Whichever method wins is priced from that
          method&apos;s published rate table, but the weight — and, for a courier, the box
          size — that decides it is ours. Shipping is most of a total.
        </li>
      </ul>
    </section>
  );
}
