import type { CompareResult } from '@/lib/pricing/types';

/** Buyee だけが「既定で注文ごとに別送」の外れ値。申請すれば無料で同梱できる。 */
export function ConsolidationCallout({ result }: { result: CompareResult }) {
  const def = result.rows.find((r) => r.variant === 'default');
  const con = result.rows.find((r) => r.variant === 'consolidated');
  if (!def || !con) return null;
  const saving = def.total - con.total;
  if (saving <= 0) return null;
  return (
    <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      If you use {def.serviceName}, ask them to consolidate before shipping. It is free and
      saves about ¥{saving.toLocaleString('en-US')} here — they ship each order separately
      unless you request it.
    </p>
  );
}
