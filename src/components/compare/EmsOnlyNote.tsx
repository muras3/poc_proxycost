import Link from 'next/link';
import {
  ALTERNATIVE_SHIPPING_SECOND_HAND,
  ALTERNATIVE_SHIPPING_VERIFIED,
  nameList,
} from '@/lib/pricing/shipping-methods';
import { POSTAL_METHODS } from '@/lib/pricing/postage';
import { tierClass, tierTitle } from '@/lib/ui/tiers';
import type { CompareResult } from '@/lib/pricing/types';

/**
 * **比べている範囲を、順位の隣で言う。**
 *
 * 以前ここは「EMS でしか比べていない」と言っていた。**2026-09-07 に範囲が狭まった**
 * ——日本郵便の他方式（小形包装物・国際小包の航空/船便）を価格化したので、
 * いま出せないのは**宅配便だけ**。だから開示もそこだけに絞る。
 *
 * **宅配便を出せない理由は3つ同時**（`docs/COMPLETENESS.md` §6）:
 *   ① 料率が非公開（各社が個別交渉。公表された料金表が無い）
 *   ② 通関が別モデル（自社が通関業者になり、郵便の通関手数料が当たらない）
 *   ③ 容積重量課金で、寸法が入力に無い
 * **送料だけ差し替えると、送料は下がり通関は上がるという向きが逆の2つの誤りが
 * 総額に同居する。**だから「まだ出せない」であって「忘れている」ではない。
 *
 * **範囲は方式の一覧だけではない。方式の選び方にも範囲がある。**
 * 2026-09-08 の実測（`docs/audit/o2-courier-2026-09-08.md` §2）で、
 * **大きい箱を指定すると見積画面から EMS・航空・船便が消える**ことが分かった。
 * 寸法は額ではなく**可否**として効く。ところが我々が持っているのは重量の上限だけ
 * （`postage.ts` の `maxGramsFor`）で、寸法は入力にすら無い。だから
 * **「cheapest that fits」の fits は重量にしか当たっていない。**それをここで言う。
 *
 * **数値の寸法制限は書かない。**実測で EMS が消えたのは 45cm 立方だが、それは
 * ZenMarket の画面の挙動であって、**日本郵便自身の EMS 制限は遥かに大きい**（長さ1.5m）。
 * 他社の制限を日本郵便の名前で出すのが、このリポジトリが最も避けている誤り。
 * **制限値は未取得**なので、`—` の規律どおり**持っていないことを書く**
 * （docs/TODO-NEXT.md §0b、docs/COMPLETENESS.md §5）。
 *
 * 畳まない・条件を付けない。順位が出ているときは常に出す。原文を読めていない社は
 * 点線で描く（`docs/UI-DESIGN.md` §6）。
 */
export function EmsOnlyNote({ result }: { result: CompareResult }) {
  // 順位が無いときは範囲を語る対象も無い。RankBoard と同じ条件で消える。
  if (!result.rows.length) return null;

  const verified = nameList(ALTERNATIVE_SHIPPING_VERIFIED);
  const secondHand = nameList(ALTERNATIVE_SHIPPING_SECOND_HAND);
  const priced = POSTAL_METHODS.length;

  return (
    <p className="text-xs text-neutral-600 dark:text-neutral-400">
      Priced across {priced} Japan Post methods — pick one above, or let each service use
      the cheapest that fits{' '}
      <span className="font-medium">by weight; a parcel&rsquo;s size is never checked</span>,
      and an oversize one is refused however light.{' '}
      <span className="font-medium">Courier rates are not priced.</span> {verified}
      {secondHand && (
        <>
          {' — and '}
          <span className={tierClass.unverified} title={tierTitle.unverified}>
            {secondHand}
          </span>
          {' —'}
        </>
      )}{' '}
      also sell FedEx, DHL and UPS, and none of them publishes what it charges for
      them (
      <Link href="/sources#ems" className="underline">
        why we leave couriers out
      </Link>
      ), so an order sent by courier can land away from the totals below in either
      direction — the postage is often lower, the customs handling higher.
    </p>
  );
}
