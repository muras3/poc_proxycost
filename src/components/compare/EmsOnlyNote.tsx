import Link from 'next/link';
import {
  ALTERNATIVE_SHIPPING_SECOND_HAND,
  ALTERNATIVE_SHIPPING_VERIFIED,
  nameList,
} from '@/lib/pricing/shipping-methods';
import { POSTAL_METHODS } from '@/lib/pricing/postage';
import { courierCoverageFor } from '@/lib/pricing/services';
import { COUNTRIES } from '@/lib/pricing/countries';
import { tierClass, tierTitle } from '@/lib/ui/tiers';
import type { CompareResult, CountryCode } from '@/lib/pricing/types';

/** `nameList` と同じ並べ方（'A, B and C'）だが、社名の文字列そのものを受け取る版。 */
function joinNames(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** `courierCoverageFor` の返り値の形。描画側からはこれだけに依存する。 */
export interface CourierCoverage {
  pricedServiceNames: string[];
  unpricedServiceNames: string[];
  noCourierServiceNames: string[];
}

/**
 * 開示の本文。**描画から切り離す**（vitest は node 環境なので、文はここで検査する
 * ——`AssumedWeightsNote.tsx` の `assumedWeightsText` と同じ形）。
 *
 * **2026-09-12、六か国拡張で見つかった欠陥の再発防止。**以前はここが
 * `` `Courier rates are also priced for ${...}, US only` `` と、国名の片方だけ
 * `coverage`（データ由来）、もう片方 `US` が文字列決め打ちという非対称だった——
 * データを7か国ぶん配線しても、決め打ちの半分は動かず「米国限定」と嘘をつき続けた
 * （PR #87 で発覚）。**文全体を `coverage` と `countryName` から組み立てる**ことで、
 * 次に国やデータが増減しても、この関数を直さない限り文が古びない形にする。
 *
 * `pricedServiceNames.length === 0`（＝この国はどの社の宅配便も価格化されていない）
 * の分岐は、**2026-09-12時点でどの対応国からも到達できない**（全7か国が最低1社は
 * 価格化済み）。それでも消さない——次に国が増える／ある社のデータが取り下げられる
 * と、また現実の状態になる。だから分岐は残し、`EmsOnlyNote.test.ts` が
 * `courierScopeText` を直接呼んで（セレクタ経由ではなく）検査する。
 */
export function courierScopeText(coverage: CourierCoverage, countryName: string): {
  scope: string;
  unpriced: string | null;
  noGrid: string | null;
} {
  const scope = coverage.pricedServiceNames.length > 0
    ? `Courier rates are also priced for ${joinNames(coverage.pricedServiceNames)} for `
      + `${countryName} — ranked alongside the postal methods above.`
    : `Courier rates are not priced for ${countryName}.`;
  const unpriced = coverage.unpricedServiceNames.length > 0
    ? `${joinNames(coverage.unpricedServiceNames)} also offer couriers here, but we have`
      + ` not priced them for ${countryName}.`
    : null;
  const noGrid = coverage.noCourierServiceNames.length > 0
    ? `${joinNames(coverage.noCourierServiceNames)} has no courier rate grid at all.`
    : null;
  return { scope, unpriced, noGrid };
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
  const text = courierScopeText(coverage, COUNTRIES[country].name);

  return (
    <p data-testid="scope-disclosure">
      Priced across {priced} Japan Post methods — pick one above, or let each service use
      the cheapest that fits{' '}
      <span className="font-medium">by weight; a parcel&rsquo;s size is never checked</span>,
      and an oversize one is refused however light.{' '}
      <span className="font-medium">{text.scope}</span>{' '}
      {text.unpriced && <>{text.unpriced}{' '}</>}
      {text.noGrid && <>{text.noGrid}{' '}</>}
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
        what we price and what we leave out
      </Link>
      ).
    </p>
  );
}
