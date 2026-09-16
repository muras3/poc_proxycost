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
 * 総額の何が弱いのかを、隠さずに列挙する（Mock v3 `wcboHTML` の `ul.wcbo`）。
 * 器の折りたたみ `details.fold#what-could-be-off`（見出しと件数）は `Calculator` の `Folds` が持つ。
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

  // **「未取得の費目がある ＝ 実際の請求は必ず上振れる」ではない**（2026-09-16）。
  // 同じ画面に推定の費目（`tier === 'estimate'`）と、運送会社レートの仮定で閉じた行
  // （`closedByAssumption`）が並んでいる。それらが上振れしていれば、未取得分を足しても
  // 総額は下がりうる。**engine が推定を出しているかどうかで言い方を変える**——
  // 推定が1つも無ければ、残りは published の値だけなので「下がらない」と言い切ってよい。
  const mayOverstate = e.length > 0 || courier;

  // **順位について言えることは engine の `contestedIds` が決める**（`rankClaim` と同じ
  // 根拠、判定は作り直さない）。2社以上入っていれば、その範囲は交わっていて1位を
  // 名指しできない——#176 の実測で 392条件中106条件（27%）がこれに当たる。
  const contested = result.contestedIds.length;
  // 仮定した重量のうち、その1点だけで1位候補の顔ぶれが替わる品数（`weightSensitivity`）。
  const decisiveN = Object.values(result.weightSensitivity).filter((w) => w.decisive).length;

  return (
    <ul className="wcbo">
      {e.length > 0 && (
        <li><span className="k e">Estimated</span><span>{e.join(', ')}. Our assumptions, not published figures.</span></li>
      )}
      {s.length > 0 && (
        <li><span className="k">Second-hand</span><span>{s.join(', ')}. We have not read the original source.</span></li>
      )}
      {m.length > 0 && (
        <li>
          <span className="k n">Not included</span>
          <span>
            {m.join(', ')}. These are absent from every total above, so they can only push the real
            bill up.{' '}
            {mayOverstate
              ? 'That does not make a total a floor: the estimated lines above can be over as well as under, so a real bill can still land lower.'
              : 'Every other line above is a published figure, so nothing above is standing in for them.'}
          </span>
        </li>
      )}
      {courier && (
        <li><span className="k e">Courier rates</span><span>Rows priced by courier assume the listed rate already includes fuel surcharge; that&rsquo;s why 1st place can read &ldquo;estimated cheapest&rdquo;.</span></li>
      )}
      <li>
        <span className="k">Order</span>
        <span>
          {contested > 1
            ? `The order is not settled: ${contested} services' ranges overlap here, so we cannot tell you which of them is cheapest.`
            : 'Only 1st place is separated by the ranges here; the order below it is not something we have established.'}
            {' '}Whichever method wins is priced from its published rate table, but the weight — and,
          for a courier, the box size — that decides it is ours, and shipping is most of a total.
          {decisiveN > 0 && (
            <>
              {' '}{decisiveN === 1
                ? 'One weight we assumed is enough, on its own, to change who is in contention for 1st.'
                : `${decisiveN} of the weights we assumed are each enough, on their own, to change who is in contention for 1st.`}
            </>
          )}
        </span>
      </li>
    </ul>
  );
}
