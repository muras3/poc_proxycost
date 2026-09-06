import { Amount, TierLegend } from '@/lib/ui/tiers';
import { SERVICE_BY_ID } from '@/lib/pricing/services';
import type { CompareResult } from '@/lib/pricing/types';

/**
 * デスクトップ（lg 以上）のみ。費目=行・会社=列、列順は順位。
 * モバイルでは使わない（RankBoard の行展開に落とす）。
 */
export function CostTable({ result }: { result: CompareResult }) {
  const rows = result.rows;
  if (!rows.length) return null;

  // 行の並びは1位の内訳の順を正とし、他社にしか無い費目を後ろに足す。
  const keys: string[] = [];
  for (const r of rows) {
    for (const l of r.lines) if (!keys.includes(l.key)) keys.push(l.key);
  }
  const labelOf = (key: string) =>
    rows.flatMap((r) => r.lines).find((l) => l.key === key)?.label ?? key;

  return (
    <section className="mt-10 hidden lg:block" aria-label="Cost breakdown">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        Breakdown
      </h2>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="py-2 text-left font-normal text-neutral-500">Cost</th>
              {rows.map((r) => {
                // 破線は「その会社の料金表の出所が二次情報」の印（UI-DESIGN §6）。
                // 行内の tier で判定すると、全社共通の関税・通関手数料（二次）で
                // 全列が破線になり印として機能しない。会社の primarySource だけを見る。
                const secondary = SERVICE_BY_ID.get(r.serviceId)?.primarySource === false;
                return (
                  <th
                    key={r.id}
                    title={
                      secondary
                        ? 'fee schedule from a second-hand source, not the company\u2019s own page'
                        : 'fee schedule read from the company\u2019s own page'
                    }
                    className={`py-2 pl-3 text-right font-medium border-b border-neutral-400 ${
                      secondary ? 'border-dashed' : 'border-solid'
                    }`}
                  >
                    <span className="block">{r.serviceName}</span>
                    {r.variant && (
                      <span className="block text-[11px] font-normal text-neutral-500">
                        {r.variant}
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-900">
            {keys.map((key) => (
              <tr key={key}>
                <td className="py-1.5 pr-3">{labelOf(key)}</td>
                {rows.map((r) => {
                  const l = r.lines.find((x) => x.key === key);
                  return (
                    <td key={r.id} className="py-1.5 pl-3 text-right num">
                      {l ? <Amount amount={l.amount} tier={l.tier} /> : <span className="text-neutral-500 dark:text-neutral-400">—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-neutral-300 font-medium dark:border-neutral-700">
              <td className="py-2 pr-3">approx. total</td>
              {rows.map((r) => (
                <td key={r.id} className="py-2 pl-3 text-right num">
                  <Amount amount={r.total} tier={r.approximate ? 'estimate' : 'fixed'} round />
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <TierLegend className="mt-3" />
    </section>
  );
}
