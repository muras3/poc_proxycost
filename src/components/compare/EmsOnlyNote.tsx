import Link from 'next/link';
import {
  ALTERNATIVE_SHIPPING_SECOND_HAND,
  ALTERNATIVE_SHIPPING_VERIFIED,
  nameList,
} from '@/lib/pricing/shipping-methods';
import { POSTAL_METHODS } from '@/lib/pricing/postage';
import { courierCoverageFor } from '@/lib/pricing/services';
import { tierClass, tierTitle } from '@/lib/ui/tiers';
import type { CompareResult, CountryCode } from '@/lib/pricing/types';

/** `nameList` と同じ並べ方（'A, B and C'）だが、社名の文字列そのものを受け取る版。 */
function joinNames(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * **比べている範囲を、順位の隣で言う。**
 *
 * **2026-09-12、宅配便が米国だけ価格化された（P2）。**以前ここは「宅配便は
 * 一律で価格化していない」と言っていた——米国宛はもう嘘になる。**画面に出す
 * 対象国で実際に何が価格化されているかを `courierCoverageFor` から見て、
 * 国ごとに文言を分ける。**
 *
 * - 価格化されている社があれば、それを名指しして「選べる・既定にも入りうる」と言う。
 * - 価格化されていない社があれば、それも名指しする——「まだ調べていない」であって
 *   「無い」ではない。
 * - `svc.courier` 自体を持たない社（Jauce）は、国を問わず対象外だと名指しする。
 *
 * **`data-testid="scope-disclosure"` は固定。**文言（「Courier rates are not
 * priced」等）は国ごとに変わるが、e2e はこの id で開示そのものを掴む
 * （`e2e/helpers.ts` の `emsOnlyNote`）。
 */
export function EmsOnlyNote({ result, country }: { result: CompareResult; country: CountryCode }) {
  // 順位が無いときは範囲を語る対象も無い。RankBoard と同じ条件で消える。
  if (!result.rows.length) return null;

  const verified = nameList(ALTERNATIVE_SHIPPING_VERIFIED);
  const secondHand = nameList(ALTERNATIVE_SHIPPING_SECOND_HAND);
  const priced = POSTAL_METHODS.length;
  const coverage = courierCoverageFor(country);
  const anyCourierPriced = coverage.pricedServiceNames.length > 0;

  return (
    <p data-testid="scope-disclosure" className="text-xs text-neutral-600 dark:text-neutral-400">
      Priced across {priced} Japan Post methods — pick one above, or let each service use
      the cheapest that fits{' '}
      <span className="font-medium">by weight; a parcel&rsquo;s size is never checked</span>,
      and an oversize one is refused however light.{' '}
      {anyCourierPriced ? (
        <span className="font-medium">
          Courier rates are also priced for {joinNames(coverage.pricedServiceNames)}, US
          only — ranked alongside the postal methods above.
        </span>
      ) : (
        <span className="font-medium">Courier rates are not priced for this destination.</span>
      )}{' '}
      {coverage.unpricedServiceNames.length > 0 && (
        <>
          {joinNames(coverage.unpricedServiceNames)} also offer couriers here, but we have
          not priced them for this destination.{' '}
        </>
      )}
      {coverage.noCourierServiceNames.length > 0 && (
        <>{joinNames(coverage.noCourierServiceNames)} has no courier rate grid at all.{' '}</>
      )}
      {verified}
      {secondHand && (
        <>
          {' — and '}
          <span className={tierClass.unverified} title={tierTitle.unverified}>
            {secondHand}
          </span>
          {' —'}
        </>
      )}{' '}
      also sell FedEx, DHL and UPS, and where we have not priced them, an order sent that
      way can land away from the totals below in either direction — the postage is often
      lower, the customs handling higher (
      <Link href="/sources#ems" className="underline">
        why we leave couriers out
      </Link>
      ).
    </p>
  );
}
