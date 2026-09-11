import { WEIGHT_CATEGORIES } from '@/data/weights';
import type { CountryCode, Item, Tier } from './types';

/**
 * **送れないかもしれない品の常時開示。**
 *
 * この計算機は総額を出すが、**その小包が送れるかは一度も見ていない。**
 * 黙っていれば「¥26,000 で届く」と読まれる表を、届かない品にも出していることになる。
 * `EmsOnlyNote`（比べている配送方式の範囲）と同じ場所・同じ作法で、**畳まず・条件を
 * 付けず**に出す（docs/UI-DESIGN.md §6、docs/COMPLETENESS.md §5 T27）。
 *
 * **判定はしない。** 品目分類も内容品の申告も持っていないので、「この品は送れる／送れない」
 * とは書けない。書けるのは「原文がこう言っている」と「我々は見ていない」の2つだけ。
 *
 * 原文は日本郵便の禁制品ページ。英語版に無い記述（アルコール 24%、刀剣等）は
 * 日本語版にしか無いので `sourceLang` でそう名乗る。**英語版に無いものを
 * 英語版の URL で出典と書かない。**
 */
export interface RestrictedGood {
  id: 'alcohol' | 'lithium-batteries' | 'blades';
  /** 順位表の1行に並ぶ短い名前（英語）。 */
  labelEn: string;
  /** 原文が言っていること（英語1〜2文）。**我々の判断ではない。** */
  ruleEn: string;
  /** この記述の確度。原文を自分で読めたものが fixed。 */
  tier: Tier;
  sourceUrl: string;
  /** その原文が英語で読めるか。'ja' は日本語版にしか無い記述。 */
  sourceLang: 'en' | 'ja';
  /** 我々が原文を読んだ日。 */
  checkedOn: string;
}

export const RESTRICTED_GOODS_CHECKED_ON = '2026-09-07';

export const RESTRICTED_GOODS: RestrictedGood[] = [
  {
    id: 'alcohol',
    labelEn: 'Alcohol',
    // 原文（日本語版の代表例）:「アルコール飲料 アルコール濃度24％を超えるもの」が
    // 「全世界共通で送れないもの」に並ぶ。さらに「あて先の国によって送れないもの」の
    // 「よく発送されてしまう禁止物品の例」の筆頭が「酒」。
    // **英語版の同じページにこの 24% の数字は無い**ので、出典は日本語版を指す。
    ruleEn:
      'Japan Post refuses any alcoholic drink stronger than 24% ABV as international mail'
      + ' anywhere in the world, and lists alcohol first among the goods most often posted'
      + ' to destinations that prohibit them.',
    tier: 'fixed',
    sourceUrl: 'https://www.post.japanpost.jp/int/use/restriction/index.html',
    sourceLang: 'ja',
    checkedOn: '2026-09-07',
  },
  {
    id: 'lithium-batteries',
    labelEn: 'Lithium batteries',
    // 原文（英語版）:「Lithium batteries installed inside equipment (limited to those
    // meeting certain criteria) can be posted as international mail. (This service is not
    // available to certain countries and territories.)」
    // 条件の全文は同ページからリンクされた PDF「国際郵便によるリチウム電池の郵送条件」:
    // ①機器に取り付け又は内蔵 ②容量・ワット時定格値が限度内 ③個数制限 ④宛先が制限して
    // いない国。**電池単体と「機器と別に同梱したもの」は郵送できない。**
    ruleEn:
      'A lithium battery can go only if it is installed inside the equipment and meets the'
      + ' capacity and quantity limits; loose cells and batteries packed beside the device'
      + ' cannot be posted at all. Air mail carrying them reaches only the destinations'
      + ' Japan Post lists.',
    tier: 'fixed',
    sourceUrl: 'https://www.post.japanpost.jp/int/use/restriction/upc_en.html',
    sourceLang: 'en',
    checkedOn: '2026-09-07',
  },
  {
    id: 'blades',
    labelEn: 'Blades',
    // 原文（日本語版）:「刀剣等を内容品とする航空郵便物については、その名宛面に
    // 『国際郵便用凶器類ラベル』の貼付をお願いいたします。【刀剣等に該当するもの】
    // A 刃渡り 15cm 以上の刀、槍およびなぎなた B 刃渡り 5.5cm 以上の剣、あいくちおよび
    // 飛び出しナイフ」「刀剣等を内容品とする航空郵便物は、国内では航空運送されないため
    // 通常よりも送達日数を要します。……航空便に搭載できない場合があり、このような場合は、
    // 郵便物はお客さまに返送されます」
    // **英語版にこの節は無い。**
    ruleEn:
      'A parcel holding a sword, spear or naginata with a blade of 15 cm or more, or a sword,'
      + ' dagger or switchblade with a blade of 5.5 cm or more, needs a weapons label, is not'
      + ' flown inside Japan, and is returned to the sender when an airline will not load it.',
    tier: 'fixed',
    sourceUrl: 'https://www.post.japanpost.jp/int/use/restriction/index.html',
    sourceLang: 'ja',
    checkedOn: '2026-09-07',
  },
];

/** 'Alcohol, lithium batteries and blades'。順位表の1行に入れる。 */
export function restrictedList(): string {
  const names = RESTRICTED_GOODS.map((g, i) => (i === 0 ? g.labelEn : g.labelEn.toLowerCase()));
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * 航空扱いでリチウム電池入りの郵便物を出せる国・地域の一覧に、この宛先が載っているか。
 *
 * 原文は上の `upc_en.html` の Note 2（国名の列挙）。**この計算機が扱う7カ国のうち、
 * 英国とドイツは列挙に無い。**残る5カ国（USA / Australia / Canada / Singapore / France）は在る。
 *
 * これは**品目の判定ではなく宛先の事実**である。カートの中身を見ずに言えるので、
 * 「判定はしない」と矛盾しない。載っていない宛先では常時開示の1行にそう足す
 * ——持っている事実を黙っていれば、載っていない国へ電池入りの品を買う人に
 * 「送れる」と読める総額だけを出すことになる。
 */
export const LITHIUM_AIRMAIL_LISTED: Record<CountryCode, boolean> = {
  US: true,
  GB: false,
  DE: false,
  FR: true,
  AU: true,
  CA: true,
  SG: true,
};

/**
 * 重量表の酒のライン。**分類は既に持っている**（`Item.weightLineId`）ので、
 * カートに酒瓶が入っていることは推測なしに言える。
 * 入っていたら、常時の1行より強い警告をその場で足す（T27）。
 * ここに無い品を「酒ではない」とは言わない——言えるのは「当たった」ことだけ。
 */
export const ALCOHOL_WEIGHT_LINE_IDS = ['sake-1800ml', 'sake-720ml', 'sake-300ml'] as const;

/** カートの中で酒のラインに当たった品。当たらなければ空。 */
export function alcoholItems(items: Item[]): Item[] {
  const ids: readonly string[] = ALCOHOL_WEIGHT_LINE_IDS;
  return items.filter((i) => i.weightLineId != null && ids.includes(i.weightLineId));
}

/**
 * **長さで方式が絞られうる品の、重量表のライン。**
 *
 * 2026-09-08 の実測（`docs/audit/o2-courier-2026-09-08.md` §2）で分かったこと:
 * **大きい箱を指定すると、見積画面から EMS・航空・船便が消える。**
 * つまり日本郵便の方式には、額ではなく**可否**として寸法が効く軸がある。
 * **我々のモデルは重量の上限しか持っていない**（`postage.ts` の `maxGramsFor`）ので、
 * 「軽いが長い」荷物に、**実際には引き受けられない方式の値段を付けている。**
 * 寸法は入力に無いので**額は直せない。直せないことを言う**のがここ（T27 と同じ作法）。
 *
 * **カテゴリ単位でやらない。**実データが誤爆を保証している:
 *   - `fishing-tackle` … 30g のルアーと 9,780g の1ピースロッドが同居
 *   - `sports-goods`  … 200g の手ぬぐいと 7,000g の弓が同居
 *   - `figures`       … 439g のねんどろいどと 3,000g の1/4スケールが同居
 * **効くのは重さではなく長さ**なので、重さでも絞れない（`budo-bag` は 800g だが竹刀の長さ）。
 * だから酒（`ALCOHOL_WEIGHT_LINE_IDS`）と同じく**行を名指しで列挙する。**
 *
 * 入れる基準は「**label だけで長さが定義的に大きいと言い切れる**」こと。
 * 1/4スケールのフィギュアは重いが箱であり、長さは label から言えないので**入れていない。**
 * 見逃す側に外している——漏れる分は常時開示の「我々は寸法を見ていない」が引き受ける。
 */
export const LONG_ITEM_WEIGHT_LINE_IDS = [
  'rod-1piece',      // Rod, 1-piece                        9,780g
  'rod-2piece',      // Rod, 2-piece                        6,660g
  'rod-multipiece',  // Rod, 3-piece or more / telescopic   5,890g
  'rod',             // Rod (piece count unknown)           6,660g
  'kyudo-yumi',      // Kyudo yumi (bow)                    7,000g
  'budo-bag',        // Bogu bag / shinai bag / weapon case   800g
] as const;

/**
 * カートの中で「長さで絞られうる」ラインに当たった品。当たらなければ空。
 * `alcoholItems` と同じ形で、**推測はしない**——当たった品を挙げるだけで、
 * 当たらなかった品を「短い」とは言わない。
 */
export function longItems(items: Item[]): Item[] {
  const ids: readonly string[] = LONG_ITEM_WEIGHT_LINE_IDS;
  return items.filter((i) => i.weightLineId != null && ids.includes(i.weightLineId));
}

/**
 * 重量表のラインの見出し（'Sake / spirits, 700-750ml bottle'）。
 * `Item.weightSource` は出典と件数まで含む長い文字列なので、警告文には向かない。
 * **表の1か所から引く。**画面に文字列を書き写すと、表を直したとき片方だけ古くなる。
 */
export function weightLineLabel(lineId: string): string | null {
  for (const cat of WEIGHT_CATEGORIES) {
    for (const line of cat.lines) if (line.id === lineId) return line.labelEn;
  }
  return null;
}
