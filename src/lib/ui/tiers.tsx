import type { Tier } from '@/lib/pricing/types';
import { yen, yenRounded } from './format';

// 確度4段階の視覚規定（docs/UI-DESIGN.md §6）。
// **色だけに頼らない。**各段階に色以外の記号を1つ持たせる。
export const tierClass: Record<Tier, string> = {
  fixed: 'text-neutral-900 dark:text-neutral-100 tabular-nums',
  estimate: 'text-amber-700 dark:text-amber-400 tabular-nums',
  unverified:
    'text-neutral-900 dark:text-neutral-100 tabular-nums underline decoration-dotted decoration-1 underline-offset-[3px]',
  none: 'text-neutral-500 dark:text-neutral-400',
};

export const tierLabel: Record<Tier, string> = {
  fixed: 'Published',
  estimate: 'Estimated',
  unverified: 'Second-hand',
  none: 'Not included',
};

export const tierTitle: Record<Tier, string> = {
  fixed: 'From the published price list',
  estimate: 'Our estimate, not a published figure',
  unverified: 'Second-hand source — we have not seen the original',
  none: 'Not included in the total — this is not zero',
};

/** null → '—'。**0 とは書かない。** estimate は '~' を前置する。
 *  round は総額用。桁まで出すと確定値と同じ見た目になり、持っていない精度を主張する。 */
export function amountText(amount: number | null, tier: Tier, round = false): string {
  if (amount == null) return '—';
  const text = round ? yenRounded(amount) : yen(amount);
  return tier === 'estimate' ? `~${text}` : text;
}

export function Amount({
  amount, tier, edited = false, round = false, className = '',
}: {
  amount: number | null;
  tier: Tier;
  edited?: boolean;
  /** 総額のとき true。¥100 単位に丸める。 */
  round?: boolean;
  className?: string;
}) {
  return (
    <span className={`${tierClass[tier]} ${className}`} title={tierTitle[tier]}>
      {amountText(amount, tier, round)}
      {edited ? <span className="ml-0.5 not-italic">✎</span> : null}
    </span>
  );
}

export function TierLegend({ className = '' }: { className?: string }) {
  return (
    <p className={`text-xs text-neutral-600 dark:text-neutral-400 ${className}`}>
      <span className={tierClass.fixed}>Plain</span>
      {' = published price list. '}
      <span className={tierClass.estimate}>~amber</span>
      {' = our estimate. '}
      <span className={tierClass.unverified}>Dotted</span>
      {' = second-hand source. '}
      <span className={tierClass.none}>—</span>
      {' = not included, not zero.'}
    </p>
  );
}
