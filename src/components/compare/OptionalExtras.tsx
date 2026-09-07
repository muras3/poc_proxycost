import { Amount } from '@/lib/ui/tiers';
import type { Row } from '@/lib/pricing/types';

/** 「金額は確定だが発生が不確実」な費目。**総額には入れない。** */
export function OptionalExtras({ rows }: { rows: Row[] }) {
  const shown = rows.filter((r) => r.optionalLines.length && r.variant !== 'default');
  if (!shown.length) return null;
  return (
    <section className="mt-8">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        Optional extras — not in the totals
      </h2>
      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((r) => (
          <div key={r.id} className="rounded border border-neutral-200 p-3 dark:border-neutral-800">
            <p className="text-xs font-medium">{r.serviceName}</p>
            <ul className="mt-1 space-y-1">
              {r.optionalLines.map((l) => (
                <li key={l.key} className="text-xs text-neutral-600 dark:text-neutral-400">
                  <span className="flex justify-between gap-2">
                    <span>{l.label}</span>
                    <span className="shrink-0">
                      {/* 額を持っていない費目に「+」は付けない。「+—」は足し算に読める。 */}
                      {l.amount == null ? null : '+'}
                      <Amount amount={l.amount} tier={l.tier} />
                    </span>
                  </span>
                  {/* 単位と条件は note にしか無い（「per day」「max 90 days」など）。
                      畳むと、額だけが一人歩きする。 */}
                  <span className="block text-[11px] text-neutral-500">{l.note}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
