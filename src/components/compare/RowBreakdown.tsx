import { Amount, tierClass } from '@/lib/ui/tiers';
import { totalIntervalText, yen } from '@/lib/ui/format';
import { totalIsCertain } from '@/lib/pricing/compare';
import type { Row } from '@/lib/pricing/types';

/**
 * モバイルの内訳。**表ではなく「この行 vs 最安」の2列**にする
 * （lg 未満で6列の表は読めない。docs/UI-DESIGN.md §3）。
 * 最安行を開いたときは1列。
 */
export function RowBreakdown({ row, cheapest }: { row: Row; cheapest: Row }) {
  const isCheapest = row.id === cheapest.id;
  const byKey = new Map(cheapest.lines.map((l) => [l.key, l]));

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-neutral-500">
          <th className="py-1 text-left font-normal">Cost</th>
          <th className="py-1 text-right font-normal">{row.serviceName}</th>
          {!isCheapest && (
            <th className="py-1 text-right font-normal">{cheapest.serviceName}</th>
          )}
          {!isCheapest && <th className="py-1 text-right font-normal">diff</th>}
        </tr>
      </thead>
      <tbody className="divide-y divide-neutral-100 dark:divide-neutral-900">
        {row.lines.map((l) => {
          const other = byKey.get(l.key);
          const d = (l.amount ?? 0) - (other?.amount ?? 0);
          // **上限不明の理由をここで辿れるようにする**（P1-3、確定仕様5）。
          // 額が未取得（`amount: null`）かつ「額×期間」等の推定上限も置けていない
          // （`unknownCapYen` が無い）行が、この行の総額を「¥X or more」にしている当人。
          // `l.note` はどの行でも常に出しているので、そこに一言足すだけで
          // 「なぜ上限が不明か」に辿り着けない状態を作らない。
          const isUncapped = l.amount == null && l.unknownCapYen == null;
          return (
            <tr key={l.key} data-cost-key={l.key}>
              <td className="py-1 pr-2 align-top">
                <span className="block">{l.label}</span>
                <span className="block text-[11px] text-neutral-500">
                  {l.note}
                  {l.key === 'intl-shipping' && (
                    // 日数の原文（閉じた行には出さない。棒の形の根拠をここで読めるようにする）。
                    <span data-testid="intl-days" className="block">
                      Arrival: {row.days.tier === 'fixed' || /not published/i.test(row.days.text) ? row.days.text : `transit time not published (${row.days.text})`}
                      {row.days.tracked ? '' : ' — untracked'}
                    </span>
                  )}
                  {isUncapped && (
                    <span className={`ml-1 ${tierClass.none}`}>— no upper bound</span>
                  )}
                </span>
              </td>
              <td className="py-1 text-right align-top num">
                <Amount amount={l.amount} tier={l.tier} />
              </td>
              {!isCheapest && (
                <td className="py-1 text-right align-top num text-neutral-500">
                  <Amount amount={other?.amount ?? null} tier={other?.tier ?? 'none'} />
                </td>
              )}
              {!isCheapest && (
                <td className="py-1 text-right align-top num text-neutral-500">
                  {d === 0 ? '' : `${d > 0 ? '+' : '−'}${yen(Math.abs(d))}`}
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr className="border-t border-neutral-300 font-medium dark:border-neutral-700">
          <td className="py-1">approx. total</td>
          <td className="py-1 text-right num">
            {/* **区間で出す。**`high === null`（上限不明）に偽の上端を書かない
                （P1-3、確定仕様5）——「¥X 〜 ¥Y」ではなく「¥X or more」。 */}
            <span className={row.approximate ? tierClass.estimate : tierClass.fixed}>
              {totalIntervalText(row.total, true)}
            </span>
            {row.total.high === null && (
              <span className={`block text-[11px] font-normal ${tierClass.none}`}>
                upper bound unknown — see “no upper bound” rows above
              </span>
            )}
          </td>
          {!isCheapest && (
            <td className="py-1 text-right num text-neutral-500">
              <span className={cheapest.approximate ? tierClass.estimate : tierClass.fixed}>
                {totalIntervalText(cheapest.total, true)}
              </span>
              {cheapest.total.high === null && (
                <span className={`block text-[11px] font-normal ${tierClass.none}`}>
                  upper bound unknown
                </span>
              )}
            </td>
          )}
          {!isCheapest && (
            <td className="py-1 text-right num">
              {/* 1位（cheapest）の総額が確定していなければ「少なくとも」
                  （外部レビュー④、RankBoard の diffText と同じ規則）。
                  **row 自身が確定していなくても「少なくとも」**（外部レビュー2回目 A-4）。 */}
              {totalIsCertain(cheapest.total) && totalIsCertain(row.total) ? '+' : 'at least +'}
              {yen(row.total.low - cheapest.total.low)}
            </td>
          )}
        </tr>
      </tfoot>
    </table>
  );
}
