import type { CompareResult } from '@/lib/pricing/types';
import { tierClass } from '@/lib/ui/tiers';

/** 総額の何が弱いのかを、隠さずに列挙する。 */
export function WhatCouldBeOff({ result }: { result: CompareResult }) {
  const top = result.rows[0];
  if (!top) return null;

  const estimates = top.lines.filter((l) => l.tier === 'estimate');
  const second = top.lines.filter((l) => l.tier === 'unverified');
  const missing = top.lines.filter((l) => l.amount == null);

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
          The order below is what we stand behind. The totals are roughly half inference —
          weight and shipping dominate them.
        </li>
      </ul>
    </section>
  );
}
