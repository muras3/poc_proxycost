import Link from 'next/link';
import { COUNTRIES } from '@/lib/pricing/countries';
import {
  alcoholItems, LITHIUM_AIRMAIL_LISTED, restrictedList, weightLineLabel,
} from '@/lib/pricing/restricted-goods';
import type { CompareResult, CountryCode, Item } from '@/lib/pricing/types';

/**
 * **この計算機は「送れるか」を一度も見ていない。**
 * 黙って総額だけ出せば「これで届く」と読まれる。届かない品にもその表を出している
 * 以上、範囲の開示（`EmsOnlyNote`）と同じ場所・同じ作法で言う:
 * **畳まない・条件を付けない・順位が出ているあいだは常に出す**
 * （docs/UI-DESIGN.md §6、docs/COMPLETENESS.md §5 T27）。
 *
 * 出すのは2つだけ。
 *   1. 常時1行 … 原文が制限している品の名前と、我々が見ていないこと。
 *   2. 宛先の事実 … 日本郵便が「リチウム電池入りの航空郵便を出せる国」に挙げていない
 *      宛先（英国・ドイツ）では、そう足す。**品目の判定ではなく宛先の事実**なので、
 *      カートを見ずに言える。持っている事実を黙る理由が無い。
 * 品目そのものの判定はしない（内容品の申告も品目分類も持っていない）。
 * 例外は重量表が既に分類している酒だけで、それは `AlcoholInCartNote` が扱う。
 */
export function RestrictedGoodsNote({
  result, country,
}: { result: CompareResult; country: CountryCode }) {
  // 順位が無いときは語る対象も無い。RankBoard・EmsOnlyNote と同じ条件で消える。
  if (!result.rows.length) return null;
  const listed = LITHIUM_AIRMAIL_LISTED[country];

  return (
    <p className="text-xs text-neutral-600 dark:text-neutral-400">
      {restrictedList()} may not be shippable at all — Japan Post bars some of them
      worldwide and leaves the rest to your destination.{' '}
      <strong className="font-medium">We do not check</strong>, so a total here is not a
      promise that the parcel can be sent.{' '}
      {!listed && (
        <>
          Japan Post does not list {COUNTRIES[country].name} among the destinations that can
          receive air mail containing lithium batteries.{' '}
        </>
      )}
      <Link href="/sources#restricted" className="underline">
        What the rules say
      </Link>
      .
    </p>
  );
}

/**
 * カートに酒瓶が入っているときの、より強い警告。
 * **重量表が既に分類しているものだけを名指しする**（`Item.weightLineId` が酒のライン）。
 * 推測はしない: 当たった品を挙げるだけで、当たらなかった品を「酒ではない」とは言わない。
 *
 * ここだけ強い色を使うのは、この場合に限って**総額そのものが無意味になりうる**から。
 * 24% を超える酒は世界中どこにも郵送できないので、その品の総額は「送れない小包の値段」
 * であって、比較の役に立たない。常時の1行と同じ濃さで置いたら、その差が消える。
 *
 * **見逃す側に外している。**重量表の corroboration 規則（`weights.ts`
 * `REQUIRES_CORROBORATION`）は「容量だけでは酒と読まない」——'ジュース 700ml' を
 * 四合瓶にしないための規則で、これは正しい。裏返せば
 * 'Dassai 45 junmai daiginjo 720ml'（酒だが needs の語がローマ字しか無い）では鳴らない。
 * 鳴らせるようにするには重量表の needs を直すことになり、それは重量の当たり方も変える。
 * ここでは触らない。**鳴らない場合が在ることは常時の1行が引き受けている**
 * （「我々は見ていない」）ので、黙って漏れるのではなく、既に開示済みの範囲に収まる。
 */
export function AlcoholInCartNote({
  result, items,
}: { result: CompareResult; items: Item[] }) {
  if (!result.rows.length) return null;
  const hits = alcoholItems(items);
  if (!hits.length) return null;
  // 表のラインの見出しだけを出す。品名は利用者が打った文字列で、酒だと名乗る根拠は
  // そこではなく**当たったライン**のほうにある。
  const lines = [...new Set(
    hits.map((i) => (i.weightLineId && weightLineLabel(i.weightLineId)) ?? i.title),
  )];

  return (
    <p className="text-xs text-amber-700 dark:text-amber-400">
      {/* 記号は色だけに頼らないため（docs/UI-DESIGN.md §6）。 */}
      <span aria-hidden>⚠ </span>
      Your basket holds {hits.length === 1 ? 'a drink' : 'drinks'} we read as alcohol
      {lines.length ? ` (${lines.join(', ')})` : ''}. Japan Post accepts no drink over 24% ABV
      as international mail anywhere in the world, and below that the destination country
      decides. We priced this basket without checking either, so these totals may belong to a
      parcel that cannot be sent.{' '}
      <Link href="/sources#restricted" className="underline">
        What the rules say
      </Link>
      .
    </p>
  );
}
