import { Amount } from '@/lib/ui/tiers';
import { yen } from '@/lib/ui/format';
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
          return (
            <tr key={l.key}>
              <td className="py-1 pr-2 align-top">
                <span className="block">{l.label}</span>
                <span className="block text-[11px] text-neutral-500">{l.note}</span>
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
            <Amount amount={row.total.low} tier={row.approximate ? 'estimate' : 'fixed'} round />
          </td>
          {!isCheapest && (
            <td className="py-1 text-right num text-neutral-500">
              <Amount amount={cheapest.total.low} tier={cheapest.approximate ? 'estimate' : 'fixed'} round />
            </td>
          )}
          {!isCheapest && (
            <td className="py-1 text-right num">+{yen(row.total.low - cheapest.total.low)}</td>
          )}
        </tr>
      </tfoot>
    </table>
  );
}
