import type { Tier } from './types';

/**
 * **この計算機が値段を付けている国際配送方式は EMS の1つだけ。**
 * 各社はそれより安い方式も売っていて、我々はそれを price していない。
 * ここはその「price していない方式」の一覧で、順位表の開示（`EmsOnlyNote`）と
 * `/sources#ems` は同じこの1か所から文言を作る。片方だけ古くなるのを防ぐため。
 *
 * 入っているのは方式の名前だけで、料金は入れない。**料金を推測で置けば
 * 「各社が公表額をそのまま転嫁している」という未確認の主張になる**（docs/audit/gaps.md G14）。
 * 各社の非EMS請求額はログイン必須の見積りでしか出ないので、v1 は
 * 「他にもある」ことだけを言い、額は言わない（docs/COMPLETENESS.md §6）。
 */
export interface AlternativeShipping {
  /** `SERVICES[].id` と同じ。 */
  serviceId: string;
  serviceName: string;
  /** EMS の他に選べる方式。原文の呼び方に寄せる。 */
  methods: string[];
  /**
   * この一覧自体の確度。
   *   fixed      … その社の公式ページを自分で読んだ
   *   unverified … 原文に到達できず、二次情報から書いた（画面では点線）
   * **到達できない社を「EMS しか無い」とは書かない。** 書けば、その社だけ
   * 選択肢が少ないかのような嘘になる。
   */
  tier: Tier;
  /** 原文の URL。読めなかった社も、どこを読もうとしたかは残す。 */
  sourceUrl: string;
  checkedOn: string;
  /** 一次情報に届かなかった社だけ、なぜ届かなかったかを書く。 */
  note: string | null;
}

export const ALTERNATIVE_SHIPPING_CHECKED_ON = '2026-09-06';

export const ALTERNATIVE_SHIPPING: AlternativeShipping[] = [
  {
    serviceId: 'buyee',
    serviceName: 'Buyee',
    // 原文が EMS より安いと書いている方式がある:
    // Small Packet「almost as fast as EMS, but cheaper」、SAL「considerably cheaper」、
    // Surface「the cheapest shipping option we offer」、FedEx / DHL「cheaper than EMS」。
    // SAL は同ページに「currently suspended」とあるので、いま選べる方式には入れない。
    methods: [
      'Airmail (parcel, small packet, AIR Packet)',
      'Surface mail',
      'FedEx / FedEx Economy',
      'DHL',
      'UPS',
      'ECMS',
    ],
    tier: 'fixed',
    sourceUrl: 'https://buyee.jp/helpcenter/guide/shipping-method?lang=en',
    checkedOn: '2026-09-06',
    note: null,
  },
  {
    serviceId: 'neokyo',
    serviceName: 'Neokyo',
    // 原文「Neokyo offers you 6 different shipment methods」。EMS を除いた5つ。
    methods: ['Surface mail', 'Airmail', 'FedEx', 'UPS', 'DHL'],
    tier: 'fixed',
    sourceUrl: 'https://neokyo.com/en/shipping',
    checkedOn: '2026-09-06',
    note: null,
  },
  {
    serviceId: 'fromjapan',
    serviceName: 'FROM JAPAN',
    // en_help.txt の help_logistics_370-391, 442-443, 510, 520。
    methods: [
      'International parcel (air / surface)',
      'Small packet (air / surface)',
      'ePacket Light',
      'FedEx Priority / Economy',
      'DHL',
      'ECMS',
    ],
    tier: 'fixed',
    sourceUrl: 'https://www.fromjapan.co.jp/translate/en_help.txt',
    checkedOn: '2026-09-06',
    note: null,
  },
  {
    serviceId: 'jauce',
    serviceName: 'Jauce',
    // 日本郵便の3方式だけ。**5社で一番品揃えが少ない。**
    methods: ['SAL', 'Surface mail'],
    tier: 'fixed',
    sourceUrl: 'https://www.jauce.com/japan_auction_detail',
    checkedOn: '2026-09-06',
    note: null,
  },
  {
    serviceId: 'zenmarket',
    serviceName: 'ZenMarket',
    // **原文を読めていない。** 配送ページは Cloudflare が 403 を返し、Wayback にも
    // 届かなかった（2026-09-06）。方式名は検索エンジンが持っていた同ページの写しから。
    // 読めないことを理由に「EMS だけ」と書くのは、調べていない社を有利にも不利にもする。
    methods: ['Airmail small packet (AVIA)', 'Surface mail', 'DHL / FedEx / UPS'],
    tier: 'unverified',
    sourceUrl: 'https://zenmarket.jp/en/shipping.aspx',
    checkedOn: '2026-09-06',
    note: 'Cloudflare returns 403 to us; this list comes from a search-engine copy of that page, not from the page itself.',
  },
];

/** 一次情報を読めた社。順位表の開示はこの並びで名前を出す。 */
export const ALTERNATIVE_SHIPPING_VERIFIED = ALTERNATIVE_SHIPPING.filter((s) => s.tier === 'fixed');

/** 原文に届かず、二次情報で書いた社。画面では点線で描く（docs/UI-DESIGN.md §6）。 */
export const ALTERNATIVE_SHIPPING_SECOND_HAND = ALTERNATIVE_SHIPPING.filter(
  (s) => s.tier !== 'fixed',
);

/** 'A, B and C'。0件なら空文字（呼び手が節ごと落とせるように）。 */
export function nameList(services: AlternativeShipping[]): string {
  const names = services.map((s) => s.serviceName);
  if (names.length === 0) return '';
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
