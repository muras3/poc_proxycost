import Link from 'next/link';
import { yenRounded } from '@/lib/ui/format';
import { Amount, TierLegend } from '@/lib/ui/tiers';
import type { CompareResult } from '@/lib/pricing/types';

/**
 * 重量が分からないときの本体。行 = EMS の重量段、列 = 会社（順位順）、セル = 総額。
 * **各行の最安セルを塗る。**順位が段をまたいで変わらなければ塗りが縦一直線に並ぶ。
 * 「順位は頑健」と文で言うより、利用者自身が目で確認できる方が強い（docs/UI-DESIGN.md §4）。
 */
export function WeightStepTable({ result }: { result: CompareResult }) {
  const bands = result.bands;
  if (!bands || !bands.length) return null;

  // 列の順序は代表段の順位に固定する。段ごとに並べ替えると縦の一直線が読めない。
  const cols = result.rows.map((r) => ({ id: r.id, name: r.serviceName, variant: r.variant }));

  return (
    <section className="mt-8" aria-label="Totals by weight step">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {result.rankStabilityNote}
      </h2>
      <p className="mt-1 text-xs text-neutral-500">
        We have no weight data for this cart, so we do not push one number at you. Each row
        assumes that weight per item.{' '}
        <Link href="/weights" className="underline">
          What we do have
        </Link>
        .
      </p>

      {/* デスクトップ: 全列 */}
      <div className="mt-3 hidden overflow-x-auto lg:block">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-neutral-500">
              <th className="py-2 text-left font-normal">Weight / item</th>
              {cols.map((c) => (
                <th key={c.id} className="py-2 pl-3 text-right font-normal">
                  {c.name}
                  {c.variant ? <span className="block text-[11px]">{c.variant}</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-900">
            {bands.map((b) => (
              <tr key={b.stepG}>
                <td className="py-1.5 pr-3 num">{b.label}</td>
                {cols.map((c) => {
                  const row = b.rows.find((r) => r.id === c.id);
                  const win = b.cheapestRowId === c.id;
                  return (
                    <td
                      key={c.id}
                      className={`py-1.5 pl-3 text-right num ${
                        win ? 'bg-emerald-50 font-medium dark:bg-emerald-950/40' : ''
                      }`}
                    >
                      {row ? <Amount amount={row.total} tier="estimate" round /> : '—'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* モバイル: 3列（段 / 最安 / 幅） */}
      <table className="mt-3 w-full text-xs lg:hidden">
        <thead>
          <tr className="text-neutral-500">
            <th className="py-2 text-left font-normal">Weight</th>
            <th className="py-2 text-left font-normal">Cheapest</th>
            <th className="py-2 text-right font-normal">Range</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100 dark:divide-neutral-900">
          {bands.map((b) => {
            const totals = b.rows.map((r) => r.total);
            return (
              <tr key={b.stepG}>
                <td className="py-1.5 num">{b.label}</td>
                <td className="py-1.5">
                  <span className="block">{b.cheapestServiceName}</span>
                  <span className="block num">
                    <Amount amount={Math.min(...totals)} tier="estimate" round />
                  </span>
                </td>
                <td className="py-1.5 text-right num text-amber-700 dark:text-amber-400">
                  ~{yenRounded(Math.min(...totals))} – {yenRounded(Math.max(...totals)).replace('¥', '')}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <TierLegend className="mt-3" />
    </section>
  );
}
