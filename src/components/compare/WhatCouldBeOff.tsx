import type { CompareResult } from '@/lib/pricing/types';

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
 * 総額の何が弱いのかを、隠さずに列挙する（Mock v3 `wcboHTML`: 折りたたみ `details.fold#what-could-be-off`）。
 *
 * 比較可能な全行を見て、行のどこかに出た費目ラベルを1回だけ集める——1位だけを見ると、
 * 1位でない社にしか無い推定費目（入金手数料など）がここに一度も出ない（2026-09-12 の修正）。
 */
export function WhatCouldBeOff({ result }: { result: CompareResult }) {
  const rows = result.rows.filter((r) => r.comparable);
  if (!rows.length) return null;

  const all = rows.flatMap((r) => r.lines);
  const e = uniqueLabels(all.filter((l) => l.tier === 'estimate'));
  const s = uniqueLabels(all.filter((l) => l.tier === 'unverified'));
  const m = uniqueLabels(all.filter((l) => l.amount == null));
  const courier = rows.some((r) => r.closedByAssumption.length > 0);

  return (
    <details className="fold" id="what-could-be-off">
      <summary data-testid="what-could-be-off-toggle">
        <h2>What could be off</h2>
        <span className="lbl">{e.length + s.length + m.length} fees</span>
      </summary>
      <ul className="wcbo">
        {e.length > 0 && (
          <li><span className="k e">Estimated</span><span>{e.join(', ')}. Our assumptions, not published figures.</span></li>
        )}
        {s.length > 0 && (
          <li><span className="k">Second-hand</span><span>{s.join(', ')}. We have not read the original source.</span></li>
        )}
        {m.length > 0 && (
          <li><span className="k n">Not included</span><span>{m.join(', ')}. Your real bill will be higher, not lower.</span></li>
        )}
        {courier && (
          <li><span className="k e">Courier rates</span><span>Rows priced by courier assume the listed rate already includes fuel surcharge; that&rsquo;s why 1st place can read &ldquo;estimated cheapest&rdquo;.</span></li>
        )}
        <li>
          <span className="k">Order</span>
          <span>
            The order is what we stand behind. Whichever method wins is priced from its published rate table,
            but the weight — and, for a courier, the box size — that decides it is ours. Shipping is most of a total.
          </span>
        </li>
      </ul>
    </details>
  );
}
