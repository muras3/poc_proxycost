import Link from 'next/link';
import {
  ALTERNATIVE_SHIPPING_SECOND_HAND,
  ALTERNATIVE_SHIPPING_VERIFIED,
  nameList,
} from '@/lib/pricing/shipping-methods';
import { tierClass, tierTitle } from '@/lib/ui/tiers';
import type { CompareResult } from '@/lib/pricing/types';

/**
 * **比べている範囲を、順位の隣で言う。**
 * この計算は全社を EMS で送る前提で、EMS はどの重量帯でも各社の最安手段ではない
 * （docs/audit/gaps.md §2）。黙っていれば、実際より高い総額の表を
 * 「これが全部です」と出していることになる。
 *
 * だから**畳まない・条件を付けない。**順位が出ているときは常に出す。
 * 文言は `ALTERNATIVE_SHIPPING` から作る。原文を読めていない社（ZenMarket）は
 * 点線で描く（docs/UI-DESIGN.md §6。線種の規定は数字以外にも適用する）。
 */
export function EmsOnlyNote({ result }: { result: CompareResult }) {
  // 順位が無いときは範囲を語る対象も無い。RankBoard と同じ条件で消える。
  if (!result.rows.length) return null;

  const verified = nameList(ALTERNATIVE_SHIPPING_VERIFIED);
  const secondHand = nameList(ALTERNATIVE_SHIPPING_SECOND_HAND);

  return (
    <p className="text-xs text-neutral-600 dark:text-neutral-400">
      Compared using Japan Post EMS only. {verified}
      {secondHand && (
        <>
          {' — and '}
          <span className={tierClass.unverified} title={tierTitle.unverified}>
            {secondHand}
          </span>
          {' —'}
        </>
      )}{' '}
      all sell cheaper ways to send the same parcel (
      <Link href="/sources#ems" className="underline">
        small packet, surface mail, couriers
      </Link>
      ) that we do not price, so a real order can come in under the totals below.
    </p>
  );
}
