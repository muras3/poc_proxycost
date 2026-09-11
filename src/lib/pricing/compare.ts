import {
  CA_POPULATION_AS_OF, CA_POPULATION_SOURCE_URL, CA_PROVINCES,
  CA_PROVINCE_AVERAGE_RATE, CA_PROVINCE_SOURCE_URL, COUNTRIES,
} from './countries';
import { EMS_SOURCE_URL, UNKNOWN_WEIGHT_STEPS_G, formatStep } from './ems';
import {
  DEFAULT_PARCEL_DIMENSIONS_CM, DEFAULT_PARCEL_DIMENSIONS_NOTE, DEFAULT_PARCEL_DIMENSIONS_TIER,
  POSTAGE_SOURCE_URL, POSTAL_METHODS, courierPriceFor, dimensionsExceedCube,
  markupYen, maxGramsFor, postageFor, zoneFor,
} from './postage';
import { rateFor, RATES_AS_OF, RATES_FETCHED_ON, RATES_SOURCE_URL } from './rates';
import { outboundFor } from './deeplink';
import {
  EXPORT_DECLARATION_FEE_SOURCE, EXPORT_DECLARATION_FEE_THRESHOLD_JPY,
  EXPORT_DECLARATION_FEE_YEN, SERVICES, type Service,
} from './services';
import { groupByShop, oneOrderPerItem, type ShopGrouping } from './shops';
import { ASSUMED_WEIGHT_RANGE_G } from './weights';
import { alcoholItems } from './restricted-goods';
import { US_HTS_SOURCE_URL, readUsDuty } from './us-duty';
import type {
  CourierMethod, PostalMethod,
  Band, CompareInput, CompareResult, Item, Line, ProvinceCode, Row, Tier, WeightSensitivity,
} from './types';

// 出品ページに重量は書いていない。以下は仮定であって実測ではない。
export const ASSUMED_DOMESTIC_SHIPPING_YEN = 800; // 実勢 ¥150〜1,500 の中の仮定
export const PACKING_MULTIPLIER = 1.2;            // 梱包で増える分
export const PACKING_ADD_G = 300;                 // 緩衝材・外箱

/**
 * 倉庫に置く既定日数。**45 日**（オーナー決定 2026-09-11）。
 * 「貯めてまとめ発送」の実態に寄せた我々の仮定で、一次情報ではない
 * （docs/FEE-ITEMS.md §5 R2）。45 という数字はここ一箇所だけに置く。
 */
export const DEFAULT_STORAGE_DAYS = 45;

const L = (
  key: string, label: string, amount: number | null, note: string,
  tier: Tier = 'fixed', sourceUrl: string | null = null,
  /**
   * P1-4: この行が輸入側（買主側）で発生する費目——「どの社を使っても同じように
   * かかる」もの——のときだけ `'shared'` を渡す。`Line.scope` のコメント参照。
   */
  scope?: 'shared',
): Line => ({ key, label, amount, note, tier, sourceUrl, ...(scope ? { scope } : {}) });

// 確度の強さの順（弱い順）。複数サイトの行をまとめるとき、含まれる中で最も弱い確度を行の確度にする。
const TIER_STRENGTH: Record<Tier, number> = { none: 0, unverified: 1, estimate: 2, fixed: 3 };
const weakestTier = (tiers: Tier[]): Tier =>
  tiers.reduce((worst, t) => (TIER_STRENGTH[t] < TIER_STRENGTH[worst] ? t : worst), 'fixed' as Tier);

const sum = (lines: Line[]) => lines.reduce((a, l) => a + (l.amount ?? 0), 0);

/**
 * 総額の区間（P1）。`low` は `sum()` と同じ式（未取得 = 0）。
 *
 * `high` は **`null` = 上限不明**（docs/ROADMAP.md P1 確定仕様5）。上端が置けない
 * 未取得の費目（`unknownCapYen` が無い null 行）が1件でも残っていれば、他がどれだけ
 * 確定していても `high` は `null` にする。**「上限不明」と言いながら数値を返す
 * 矛盾した状態を作らない**——真偽値のフラグ（`highUnbounded`）は持たず、
 * `high` 自身の型（`number | null`）で不正な状態を排除する。
 *
 * 未取得の費目が1つも無ければ `high === low`（幅ゼロが正しい）。
 * 額に幅のある行（`amountKind: 'range'`、寸法未入力の Neokyo 保管料など）は
 * `amountHighYen` を high 側に足す。
 */
function totalRange(lines: Line[]): Row['total'] {
  const low = sum(lines);
  let high = low;
  for (const l of lines) {
    if (l.amount != null) {
      if (l.amountKind === 'range' && l.amountHighYen != null) {
        high += l.amountHighYen - l.amount; // low に既に入っている分との差だけ足す
      }
      continue;
    }
    // 未取得。上端が置けなければ、この行のせいで総額の上限は分からない。
    if (l.unknownCapYen == null) return { low, high: null };
    high += l.unknownCapYen;
  }
  return { low, high };
}

/**
 * `Row.rankHigh`（P1-4、外部レビュー、オーナー確定 2026-09-11）。**画面には出ない
 * 内部専用の上端**——順位・おすすめ枠・`rankIndeterminate` の判定にだけ使う。
 *
 * `totalRange()` とほぼ同じだが、`Line.scope === 'shared'` な未取得行（社を問わず
 * 輸入側でかかる未知——米国の Zonos 前払い利用料・連邦売上税の不在など）は
 * **無視して 0 として畳む。**「どの社を使っても同じようにかかる未知」は、
 * どの社が安いかという相対的な順位には効かない——全社の真の総額を同じだけ
 * 押し上げるだけで、差を作りも消しもしない。社固有の未取得行（FROM JAPAN の
 * 外注梱包など。`scope` 無し）は `totalRange()` と同じく `null` を返す。
 *
 * **`total.high`（画面表示）はこの関数の影響を受けない。**共通の未知があっても
 * 総額の「以上（上限不明）」という表示は消さない——絶対値の不確かさは本物だから。
 */
function rankHighFor(lines: Line[]): number | null {
  let high = sum(lines);
  for (const l of lines) {
    if (l.amount != null) {
      if (l.amountKind === 'range' && l.amountHighYen != null) {
        high += l.amountHighYen - l.amount;
      }
      continue;
    }
    if (l.scope === 'shared') continue; // 共通の未知は順位に効かせない（0 として畳む）
    if (l.unknownCapYen == null) return null;
    high += l.unknownCapYen;
  }
  return high;
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** 梱包後の重量。仮定であって実測ではない。 */
const grossG = (netG: number) => Math.round(netG * PACKING_MULTIPLIER + PACKING_ADD_G);

/**
 * 方式を指定しなかったときの既定。**EMS。**
 *
 * 2026-09-07 に5社の公開計算機を実測して（`docs/O2-CALCULATOR-RUN.md` フェーズ1）、
 * **各社の UI に「EMS を既定にしている社」は無いことが分かった:**
 *   - FROM JAPAN … 最安を自動選択（International ePacket Light）。5社で唯一の既定
 *   - Buyee … EMS に `Recommended` バッジ。ただし選択済みではない
 *   - ZenMarket / Neokyo / Jauce … 既定選択なし。安い順に並べるだけ
 *
 * **それでも既定は EMS にする。**「運べる中で最安」を既定にしかけて、
 * こちらの実データと矛盾することに気づいて戻した:
 *
 * 実請求の収集（`research/real-invoices.md`）で数えた実際の発送方式は
 * **FedEx 12 / EMS 11 / UPS 7 / DHL 7 / 船便 3 / Airmail 1**。
 * **船便は約40言及中3件しかない。**最安はたいてい船便なので、それを既定にすると
 * 実際にはほとんど使われていない方式の総額を見出しに出すことになる
 * （US 5点600g で ¥36,125 → ¥27,725、−23%）。
 *
 * **各社UIの並び順は弱い証拠で、実際の発送実績のほうが強い。**EMS は価格化できる
 * 方式の中で実績が最も多く、Buyee も EMS を推している。
 *
 * **反証**: 実請求の標本はスペインの掲示板に偏り、「通関で驚いた人が投稿する」
 * バイアスがある（宅配便が過剰に出る）。約40言及と小さい。フェーズ2で各国・各重量の
 * 観測が増えたら、この既定は再検討に値する。
 */
const DEFAULT_METHOD: PostalMethod | 'cheapest' = 'ems';

/**
 * カート全体を1個口にまとめたときの梱包後重量（g）。
 * **画面の箱はこの重量に立つ。**箱の中身は「1個口にまとめたら」の姿であって、
 * 注文ごとに分ける社（Buyee の既定）の姿ではない。画面はそう書く。
 * 個口を分けない行（`parcelGross` の else 側）と**同じ組み立て**を使う。
 * 重量が1点でも無ければ null。**0 で埋めない。**
 */
export function singleParcelGrossG(items: readonly Item[]): number | null {
  if (items.length === 0) return null;
  let net = 0;
  for (const item of items) {
    if (item.weightG == null) return null;
    net += Math.max(1, Math.round(item.weightG)) * item.qty;
  }
  return grossG(net);
}

interface Ctx {
  items: Item[];
  cc: CompareInput['country'];
  /** カナダ宛のときの州。null = 未選択（代表値を出す）。他国では使わない。 */
  province: ProvinceCode | null;
  /** 重量不明の item にこの値（g／点）を仮置きする。null なら仮置きしない。 */
  assumeUnknownG: number | null;
  /** 既知の重量にこの倍率を掛ける（順位の頑健性チェック用）。 */
  weightScale: number;
  /** 国際配送の方式。'cheapest' なら行ごとに「運べる中で最安」を選ぶ。 */
  method: PostalMethod | 'cheapest';
  /** 倉庫に置く日数。未指定は `DEFAULT_STORAGE_DAYS`。 */
  storageDays: number;
}

function itemWeightG(item: Item, ctx: Ctx): number | null {
  if (item.weightG == null) return ctx.assumeUnknownG;
  return Math.max(1, Math.round(item.weightG * ctx.weightScale));
}

/**
 * Buyee 自身の料金ページ（`master/fees.json` F13b、tier A_confirmed）:
 * 「出品ページに "Free shipping" とあっても、配送方法の変更で国内送料が発生しうる」。
 * ￥0 は出品ページの記載どおりの値であって未取得ではないが、Buyee 自身が確定を
 * 否定している以上 `fixed` は描けない。発生率は公表されていないので額は動かさず、
 * 確度だけ `estimate` に落とす（オーナー決定 2026-09-11、T-F10。docs/FEE-ITEMS.md §5 R1）。
 *
 * **対象は Buyee だけ。**この記載を公表しているのは Buyee のみで、他4社については
 * 何も持っていない。他社の freeShipping ￥0 を今回変えないのは「発生しない」と
 * 判定したからではなく、材料が無いから（確認できていない社を有利に描かない一方、
 * 確認できていない主張を確認済みとして広げもしない。`master/fees.json` の rows でも
 * F13b は company: buyee にしか無い）。
 */
export const BUYEE_FREE_SHIPPING_SOURCE_URL = 'https://buyee.jp/helpcenter/guide/fees?lang=en';

function domesticFor(
  item: Item, isBuyee: boolean,
): { yen: number; tier: Tier; freeShippingRisk: boolean } {
  if (item.freeShipping) {
    return isBuyee
      ? { yen: 0, tier: 'estimate', freeShippingRisk: true }
      : { yen: 0, tier: 'fixed', freeShippingRisk: false };
  }
  if (item.domesticShippingYen != null) {
    return { yen: item.domesticShippingYen, tier: 'fixed', freeShippingRisk: false };
  }
  return { yen: ASSUMED_DOMESTIC_SHIPPING_YEN, tier: 'estimate', freeShippingRisk: false };
}

/**
 * カナダの州税。**発生は確実なので、州を選んでいなくても `—` にしない。**
 *
 * 選んでいれば CBSA が実際に徴収する率（D2-3-6 Appendix A）で tier fixed。
 * 選んでいなければ人口加重の代表値で tier estimate ——「州を選ぶと確定する」と note に書く。
 * `—` は**発生しないものだけ**に使う（docs/DESIGN-NOTES.md §2）。
 *
 * 徴収協定が無い州（AB・準州3つ）を選んだときの 0 は**取得できた 0** なので tier fixed。
 * 未取得の 0 ではないから、そう描き分ける。
 */
function provincialTaxLine(
  province: ProvinceCode | null, baseYen: number, taxed: boolean,
): Line {
  const src = CA_PROVINCE_SOURCE_URL;
  if (!taxed) {
    // C$20 以下は国境で何も課されない。州税も同じ帯で 0（取得できた 0）。
    return L('province-tax', 'Provincial tax', 0,
      'under the CAD 20 threshold — the CBSA assesses nothing on this parcel', 'fixed', src);
  }
  if (province) {
    const p = CA_PROVINCES[province];
    const label = p.taxName ?? 'Provincial tax';
    return L('province-tax', 'Provincial tax', Math.round(baseYen * p.rate),
      p.rate === 0
        // 0 を黙って出さない。**なぜ 0 なのか**を書かないと未取得と区別が付かない。
        ? `${p.name}: the CBSA collects no provincial tax at the border there`
        : `${p.name}: ${label} ${(p.rate * 100).toFixed(p.rate === 0.09975 ? 3 : 0)}%`
          + ` on top of the 5% GST (${(p.totalWithGst * 100).toFixed(3).replace(/\.?0+$/, '')}% together)`,
      'fixed', src);
  }
  return L('province-tax', 'Provincial tax',
    Math.round(baseYen * CA_PROVINCE_AVERAGE_RATE),
    `${(CA_PROVINCE_AVERAGE_RATE * 100).toFixed(1)}% — our estimate across all provinces,`
    + ` weighted by population (${CA_POPULATION_AS_OF}).`
    + ' Pick your province above and this becomes the rate the CBSA actually charges'
    + ' (0% in Alberta and the territories, 9.975% in Quebec).',
    'estimate', CA_POPULATION_SOURCE_URL);
}

// ── 受取国の税。未取得は null を返し、画面で「—」にする。0 と書かない。
function taxLines(
  cc: CompareInput['country'],
  province: ProvinceCode | null,
  /** カートそのもの。**品目カテゴリでしか言えないこと**（米国の関税・英国の酒税）に使う。 */
  items: Item[],
  a: { itemsYen: number; domYen: number; emsYen: number; units: number; parcels: number },
  /**
   * **この社がこの荷物の輸入税を決済時に取るか。**国側の `sellerCollectsBelow`
   * （豪・星）は制度がその国の全社に課すもので、社では割れない。EU/UK の IOSS は
   * 任意なので**社で割れる**——だから国の表では表せず、呼び出し側から渡す。
   */
  companyCollects = false,
): Line[] {
  const c = COUNTRIES[cc];
  const rate = rateFor(c.ccy);
  const cif = a.itemsYen + a.domYen + a.emsYen;
  const baseYen = c.base === 'CIF' ? cif : a.itemsYen;
  // **免税限度は intrinsic value（商品代）で測る。** 英国の £135 も EU の €150 も
  // 運賃・保険を除いた値で判定する規定で、送料込みの CIF で測ると £110〜135 の帯を
  // 必ず誤判定する。しかも社ごとに送料が違うので、同じ商品で社ごとに限度をまたぐ／
  // またがないが分かれ、順位が歪む。課税ベース自体は従来どおり CIF / FOB。
  const declared = a.itemsYen / rate;
  // **免税限度は「1個口あたり」で測る。**制度がどれもそう書いている:
  //   GB「The £135 limit applies to the value of a **total consignment** that is imported,
  //      not the separate value of individual items」／「**Unless sent individually**, the seller
  //      must add the individual values of all items in a consignment together」
  //   EU「in **consignments** ≤ EUR 150. **This threshold applies per consignment**」
  //   CA「The CBSA doesn't assess duty or tax on **mail items** valued at CAN$20 or less」
  //   SG「the **postal parcel** contains goods of a total CIF value exceeding S$400」
  //   AU  ABF 原文に到達できず。代行の運用文言が「**parcels** containing Low-Value Goods
  //      (1000 AUD or less)」なので、観測できる挙動は個口単位（B推論）
  //
  // **以前はカート全額で判定していた。**そのせいで、注文ごとに別送する Buyee の既定
  // （3注文＝3個口）で、1個口 €110 ずつなのに「€150 超」と判定して 4.1% を掛けていた
  // ——**個口を分けたほうが税は安くなるのに、逆に高く出していた。**
  //
  // 個口ごとの額が違う場合は表せない（この計算機は全個口を等額とみなす）。
  // `clearanceBands` は元から個口で割っていたので、そちらと単位が揃った。
  const declaredPerParcel = declared / a.parcels;
  /** 限度の文言。個口が2つ以上あるときは「1個口あたり」だと分かるように書く。 */
  const per = a.parcels > 1 ? ' per parcel' : '';
  const out: Line[] = [];

  let dutyYen = 0;
  if (c.flatDutyPerItem != null && declaredPerParcel <= c.dutyFreeLimit) {
    dutyYen = c.flatDutyPerItem * a.units * rate;
    out.push(L('duty', 'Duty', Math.round(dutyYen),
      `${c.ccy} ${c.flatDutyPerItem} flat × ${plural(a.units, 'item')}`, c.dutyTier, c.sourceUrl));
  } else if (declaredPerParcel <= c.dutyFreeLimit) {
    // **限度が無い国（SG）に「限度」の文言を出すな。** `Infinity` を文字列に混ぜると
    // `under the SGD Infinity threshold` になり、画面に意味不明な単語が出ていた。
    // 限度が無いのは「際限なく免税」なのではなく、この品目に関税が無いということ。
    out.push(L('duty', 'Duty', 0,
      Number.isFinite(c.dutyFreeLimit)
        ? `under the ${c.ccy} ${c.dutyFreeLimit} threshold${per}`
        : 'no duty on this category',
      'fixed', c.sourceUrl));
  } else if (c.dutyRate != null) {
    dutyYen = baseYen * c.dutyRate;
    // **米国だけは、重量表のカテゴリから HTS を引き直して 12.5% の意味を言える**（T24）。
    // 12.5% は Section 301 が日本産品に置いた**下限**で、MFN がそれを超える品目
    // （靴・鞄・衣類）では税率ではない。額は変えない——見出しを1つに決めるのは推測で、
    // 我々は品目分類を持っていない。**言えるのは「下限だ」と「どの見出しを引いたか」だけ。**
    const us = cc === 'US' ? readUsDuty(items) : null;
    out.push(L('duty', 'Duty', Math.round(dutyYen),
      `${(c.dutyRate * 100).toFixed(1)}% of the item price`
      + (us ? ` — ${us.noteEn}` : ''),
      // 下限でしかないと分かっている数字を確度そのままで描かない。
      // **我々の仮定**なので estimate（画面では `~` と琥珀）に落とす。
      us?.knownFloor ? 'estimate' : c.dutyTier,
      us ? US_HTS_SOURCE_URL : (c.dutyRateSourceUrl ?? c.sourceUrl)));
  } else {
    // P1-4: 税率が未公表であること自体は国の制度の話で、どの社を使っても同じ。
    // 「輸入側でかかる共通の未知」として scope: 'shared' を付ける。
    out.push(L('duty', 'Duty', null,
      `over the ${c.ccy} ${c.dutyFreeLimit} threshold — rate not included`, 'none', c.sourceUrl,
      'shared'));
  }

  const vatLabel = cc === 'US' ? 'Sales tax'
    : cc === 'AU' || cc === 'SG' || cc === 'CA' ? 'GST' : 'VAT';
  // AU（≤A$1,000）と SG（<S$400）は、**国境ではなく代行が販売時点で徴収する**帯がある。
  // その帯で税関側の行に金額を出すと、代行が取る分と二重に積むことになる。
  // 実際にいくら取られるかは社ごとに違うので、社ごとの行（prepaid-import-tax）が持つ。
  const sellerCollects = companyCollects
    || (c.sellerCollectsBelow != null && declaredPerParcel <= c.sellerCollectsBelow);
  if (c.vatRate == null) {
    // P1-4: 連邦売上税が無いこと自体は国の制度の話で、どの社を使っても同じ。
    out.push(L('vat', 'Sales tax / VAT', null, 'none at federal level', 'none', c.sourceUrl,
      'shared'));
  } else if (sellerCollects) {
    out.push(L('vat', vatLabel, 0,
      c.sellerCollectsBelow != null
        ? `under the ${c.ccy} ${c.sellerCollectsBelow} threshold${per}`
          + ' — collected at checkout by the service, not at the border'
        : 'collected at checkout by the service, not at the border',
      'fixed', c.sourceUrl));
  } else if (c.vatFreeLimit && declaredPerParcel <= c.vatFreeLimit) {
    out.push(L('vat', vatLabel, 0, `under the ${c.ccy} ${c.vatFreeLimit} threshold${per}`, 'fixed', c.sourceUrl));
  } else {
    // **カナダの GST ベースは「関税込みの申告額」（duty paid value）で、国際送料を
    // 含まない**（外部レビュー⑤-b、`master/customs.json` CA.vat.base:
    // "duty_paid_value"。CBSA の value for duty は輸入運賃を含まない）。
    // FOB の他国（豪・米）は根拠が未確認（豪は `base: "varies_by_collector"` で
    // A$1,000 超の課税ベースを記録していない）なので、**カナダだけ**を分けて直す
    // ——一次情報の無い国のベースを一緒に動かさない。
    const vatBase = c.base === 'CIF' ? cif + dutyYen
      : cc === 'CA' ? a.itemsYen + dutyYen
      : a.itemsYen + a.emsYen;
    out.push(L('vat', vatLabel, Math.round(vatBase * c.vatRate),
      `${(c.vatRate * 100).toFixed(0)}%`, 'fixed', c.sourceUrl));
  }

  // **カナダの州税は連邦 GST とは別の行。**合計（HST 13% など）ではなく州の取り分だけを
  // 出す——GST 5% の行が既に在るので、合計を出すと二重に積む。
  // **ベースは GST と同じ duty paid value**（外部レビュー⑤-b。CBSA は GST・州税を
  // 同じ value for duty から計算する——実請求 `ca-canadapost-forum` の GST/PST が
  // 同じ申告額 CAD 1,988.7 に対する率で一致することでも確認できる）。
  const caTaxed = c.vatFreeLimit == null || declaredPerParcel > c.vatFreeLimit;
  if (cc === 'CA') {
    out.push(provincialTaxLine(province, a.itemsYen + dutyYen, caTaxed));
  }

  // 通関手数料。**帯は郵便物1個ぶんの内容品価格で選ぶ**（手数料は郵便物ごとに課される）。
  // 帯の 0 は**原文がその帯で 0 と書いている**＝取得できた 0 なので tier はそのまま。
  // 未取得は帯そのものを持たないことで表す（そのときだけ null＝「—」）。
  const clearanceSrc = c.clearanceSourceUrl ?? c.sourceUrl;
  const band = c.clearanceBands?.find((b) => declaredPerParcel <= b.upTo);
  // **手数料は税の徴収に従属する。**5カ国の原文が同じことを言っている
  // （GB「If there is no duty or tax to pay, you will not be charged a handling fee」／
  //  DE Auslagepauschale ／ FR frais de gestion ／ SG SingPost ／
  //  US IMM 712.11「each item on which customs duty ... is collected」）。
  // 決済時に払い済みなら国境で徴収するものが無く、手数料も立たない。
  if (sellerCollects && band && band.amount > 0) {
    out.push(L('clearance', 'Customs clearance fee', 0,
      'nothing is collected at delivery — the tax was paid at checkout, and the fee is'
      + ' charged only on parcels the carrier has to collect tax on',
      c.clearanceTier, clearanceSrc));
  } else if (!band) {
    // P1-4: 帯そのものが無いことは国の制度の話で、どの社を使っても同じ。
    out.push(L('clearance', 'Customs clearance fee', null, 'not included', 'none', c.sourceUrl,
      'shared'));
  } else if (band.amount === 0) {
    out.push(L('clearance', 'Customs clearance fee', 0, band.note, c.clearanceTier, clearanceSrc));
  } else {
    out.push(L('clearance', 'Customs clearance fee',
      Math.round(band.amount * rateFor(c.clearanceCcy) * a.parcels),
      `${c.clearanceCcy} ${band.amount} × ${plural(a.parcels, 'parcel')} — ${band.note}`,
      c.clearanceTier, clearanceSrc));
  }

  // **英国の酒税。**gov.uk 原文「If you're sent alcohol or tobacco from outside the UK,
  // you'll be charged Excise Duty at current rates」——**金額にかかわらず**課され、
  // £135 も £39 の贈答免除も効かない。つまり酒が入っていれば**確実に発生する**。
  // それでも額は出さない: 税率は ABV の帯と純アルコールのリットル数で決まり、
  // **ABV を我々は持っていない**（重量表が持っているのは瓶の容量だけ）。
  // 推測で ABV を置けば、その1つの仮定で税額が丸ごと決まってしまう。
  // だから null 行にして、`excluded` に名前を載せる——「発生するのに額を知らない」を
  // 画面に出すための行（米国の Zonos 利用料と同じ形）。
  if (cc === 'GB' && alcoholItems(items).length > 0) {
    // P1-4: 酒税がかかるかどうかはカートの中身（品目）で決まり、どの社を使っても
    // 同じ——輸入側の話。scope: 'shared'。
    out.push(L('excise', 'UK excise duty on alcohol — rate depends on the ABV', null,
      'The UK charges excise duty on alcohol sent from abroad at any value — neither the £135'
      + ' nor the £39 threshold exempts it. The rate is per litre of pure alcohol and depends'
      + ' on the strength, which no listing tells us.',
      'none', 'https://www.gov.uk/goods-sent-from-abroad/tax-and-duty', 'shared'));
  }

  // 関税の事前納付（米国）。**「発生するが額を知らない」を画面に出すための行。**
  // 額を持っていないので null。0 と書けば「無料」という嘘になり、行ごと省けば
  // 「そんな費目は無い」という嘘になる。excluded に名前が載るのが目的。
  // 閾値は郵便物1個の内容品価格なので、個口に割ってから測る。割り切れない分は
  // **費目を出す側に倒す**（持っている情報を隠すより、余分に開示するほうが安全）。
  const dp = c.dutyPrepayment;
  if (dp && declaredPerParcel <= dp.upTo) {
    // P1-4: Zonos の前払い利用料は日本郵便が米国宛に課す条件で、どの社を使っても
    // 同じようにかかる——輸入側の話。scope: 'shared'。
    out.push(L('duty-prepayment', dp.label, null, dp.note, 'none', dp.sourceUrl, 'shared'));
  }
  return out;
}

/**
 * F26 輸出通関手数料。**日本郵便の費目であって代行の費目ではない**ので、
 * 5社すべてに同額・同条件で出す（`EXPORT_DECLARATION_FEE_YEN` のコメント参照）。
 *
 * 条件は行の商品代合計（`itemsYen`）が ¥200,000 を超えるかどうかだけ。
 * **個口の数では倍にしない**（同じ受取人あてに2個以上は「全ての梱包を合わせて1件」）。
 * よって行につき1回。発生しないとき（¥200,000 以下）も額 0 の行を出す——
 * 消すと「調べていない」と区別が付かない。
 */
function exportClearanceLine(itemsYen: number): Line {
  const over = itemsYen > EXPORT_DECLARATION_FEE_THRESHOLD_JPY;
  return L(
    'export-clearance', 'Export clearance fee',
    over ? EXPORT_DECLARATION_FEE_YEN : 0,
    over
      ? `¥${EXPORT_DECLARATION_FEE_YEN.toLocaleString('en-US')} — declared value over`
        + ` ¥${EXPORT_DECLARATION_FEE_THRESHOLD_JPY.toLocaleString('en-US')}, charged once per`
        + ' shipment (Japan Post treats parcels sent together to the same recipient as one)'
      : `only over ¥${EXPORT_DECLARATION_FEE_THRESHOLD_JPY.toLocaleString('en-US')}`,
    'fixed',
    EXPORT_DECLARATION_FEE_SOURCE,
  );
}

function packingLine(svc: Service, parcelWeights: number[]): Line | null {
  if (!svc.packing) return null;
  const p = svc.packing;
  let yen = 0;
  for (const g of parcelWeights) {
    const over = Math.max(0, Math.ceil((g - p.freeUpToG) / 1000));
    yen += p.perParcelYen + p.perKgYen * over;
  }
  const note = p.freeUpToG > 0
    ? `¥${p.perParcelYen} up to ${p.freeUpToG / 1000} kg, then ¥${p.perKgYen}/kg`
    : `¥${p.perParcelYen} per parcel + ¥${p.perKgYen}/kg`;
  return L('packing', 'Packing', yen, note, p.tier, svc.sourceUrl);
}

/**
 * F21 保管超過。**総額の行。**以前は `optional`（任意欄）にあったが、
 * 「倉庫に貯めてまとめ発送」という主要な使い方では既定で発生する費目であり、
 * 利用者が選ぶものではない（`docs/FEE-ITEMS.md` §1 の区分 C）。
 *
 * **上限日数は頭打ちにする。**超過分をそのまま計上すると、存在しない請求を出す
 * ことになる（Buyee・ZenMarket 90日、Jauce 120日、Neokyo は未払い6週、FROM JAPAN は
 * 無料期間そのものが上限）。上限を超えたら note に「何が起きるか」を書く——
 * 金額が ¥0 や `—` でも安全とは限らない（FROM JAPAN・Jauce は廃棄される）。
 */
function storageLine(
  svc: Service, days: number, orders: number, parcels: number,
  parcelGrossG: number[], units: number,
): Line {
  const st = svc.storage;
  const overMax = days > st.maxDays;
  const cappedDays = Math.min(days, st.maxDays);
  const daysOver = Math.max(0, cappedDays - st.freeDays);
  const freeDaysLeft = Math.max(0, st.freeDays - days);
  const capSuffix = overMax ? ` — capped at ${st.maxDays} days; ${st.maxDaysConsequence}` : '';
  const freeSuffix = daysOver === 0 && freeDaysLeft > 0
    ? `, ${plural(freeDaysLeft, 'day')} of the free period left` : '';

  const rate = st.rate;
  switch (rate.kind) {
    case 'per-day-per-parcel-by-weight': {
      const rateFor = (g: number) => rate.bands.find((b) => g <= b.maxG)!.yen;
      const amount = daysOver === 0 ? 0
        : parcelGrossG.reduce((a, g) => a + daysOver * rateFor(g), 0);
      const note = daysOver === 0
        ? `free for the first ${st.freeDays} days${freeSuffix}${capSuffix}`
        : `¥100 a day up to 10 kg, ¥200 to 20 kg, ¥300 above — per parcel,`
          + ` ${plural(daysOver, 'day')} over the free period${capSuffix}`;
      return L('storage', `Storage, per day after ${st.freeDays} free days`, amount,
        note, 'fixed', st.sourceUrl);
    }
    case 'per-day-per-item': {
      const amount = daysOver === 0 ? 0 : daysOver * rate.yen * units;
      const note = daysOver === 0
        ? `free for the first ${st.freeDays} days${freeSuffix}${capSuffix}`
        : `¥${rate.yen} a day per item, ${plural(daysOver, 'day')} over the free period`
          + ` × ${plural(units, 'item')}${capSuffix}`;
      return L('storage', `Storage, per day after ${st.freeDays} free days`, amount,
        note, 'fixed', st.sourceUrl);
    }
    case 'per-week-per-order': {
      const weeksOver = Math.min(Math.ceil(daysOver / 7), rate.unpaidWeeksLimit);
      const amount = weeksOver === 0 ? 0 : weeksOver * rate.yen * orders;
      const amountHigh = weeksOver === 0 ? 0 : weeksOver * rate.maxYen * orders;
      const sizeNote = 'per order: ¥350 small / ¥700 average / ¥1,400 large — parcels'
        + ' ¥210 / ¥490 / ¥980. We do not know your parcel size, so this is the smallest step'
        + ' (measured on the item, not the packed parcel)';
      const note = daysOver === 0
        ? `free for the first ${st.freeDays} days${freeSuffix}. ${sizeNote}${capSuffix}`
        : `${sizeNote} — ${plural(weeksOver, 'week')} over the free period${capSuffix}`;
      const line = L('storage', `Storage, per week after ${st.freeDays} free days`, amount,
        note, 'fixed', st.sourceUrl);
      // **区間（P1）**: 寸法が入力に無いので amount は「small」の点推定。実際の寸法が
      // large なら本当の額はこれより高く、上端は最大段（¥1,400/order）で置ける
      // ——期間（unpaid_weeks_limit=6週）が公表されて閉じているので、寸法という
      // もう1つの未知数があっても上端は出せる。daysOver===0 の無料期間内は両端とも0円。
      if (amountHigh > amount) {
        return {
          ...line,
          amountKind: 'range',
          amountHighYen: amountHigh,
          rangeNote: 'the low figure assumes the smallest size band; the high figure'
            + ' uses the largest published band (¥1,400/order) for the same number of weeks'
            + ' — the real amount depends on the parcel size, which we do not have',
        };
      }
      return line;
    }
    case 'none': {
      const note = overMax
        ? `¥0 — but ${st.maxDaysConsequence}`
        : `there is no paid extension after the ${st.freeDays}-day free period${freeSuffix}`;
      return L('storage', `Storage after ${st.freeDays} free days`, 0, note, 'fixed', st.sourceUrl);
    }
    case 'unpublished': {
      if (daysOver === 0) {
        return L('storage', `Storage after ${st.freeDays} free days`, 0,
          `free for the first ${st.freeDays} days${freeSuffix}`, 'fixed', st.sourceUrl);
      }
      const unknownReason = 'the company does not publish the amount — it depends on item size'
        + ' and value; reference examples (~¥200/month for a CD, ~¥700/month for a guitar) are'
        + ' "very roughly" and not a price list, so we do not use them as a point estimate';
      const note = `${unknownReason} and ¥700 is not a ceiling`
        + (overMax ? ` — capped at ${st.maxDays} days; ${st.maxDaysConsequence}` : '');
      // 上端（P1）: 単価は非公表でも、有料になりうる期間は maxDays - freeDays で閉じている
      // （Jauce「Maximum storage time is 120 days」）ので「額×期間」で上端が置ける。
      // `referenceMonthlyYen` は上限ではなく参考額（R2）——ここでも上限としては使わない。
      // 使うのは「この額を月あたりの上端の見積りとして掛け合わせる」という一段別の判断。
      const paidPeriodDays = st.maxDays - st.freeDays;
      const paidMonths = Math.ceil(paidPeriodDays / 30);
      const capYen = paidMonths * rate.referenceMonthlyYen;
      const capNote = `estimated upper bound, not a published cap: ¥${rate.referenceMonthlyYen}`
        + `/month (the guitar reference figure, not a ceiling) × up to ${paidMonths} paid`
        + ` month(s) before the ${st.maxDays}-day maximum storage period is reached`;
      return {
        ...L('storage', `Storage after ${st.freeDays} free days`, null, note, 'none', st.sourceUrl),
        unknownReason,
        unknownCapYen: capYen,
        unknownCapNote: capNote,
      };
    }
  }
}

function feeLines(
  svc: Service, ctx: Ctx, grouping: ShopGrouping, units: number,
): Line[] {
  const f = svc.fee;
  const orders = grouping.groups.length;
  // 同一店舗をまとめる社で、店舗を特定できなかった点があるなら**そう書く**。
  // まとめられていない点は1点＝1注文で課金しているので、この社の総額は高く出ている。
  // 黙って安くも高くもせず、どちらに外しているかを画面に出す（AGENTS.md の開示規則）。
  const shopNote = f.ordersGroupedByShop
    ? (grouping.merged > 0 ? ' — same-shop items count as one order' : '')
      + (grouping.unknownShopItems > 0
        ? ` — we could not read the shop from ${plural(grouping.unknownShopItems, 'listing')},`
          + ' so those are charged separately'
        : '')
    : '';
  const out: Line[] = [];
  const free = new Set(f.freeForSites ?? []);
  const chargeable = ctx.items.filter((i) => !free.has(i.site));

  // **同一商品を複数個買っても手数料は1回**の社は、点数ではなく品数で数える。
  // Neokyo / ZenMarket / FROM JAPAN が自社ページで明記している。
  const countOf = (i: (typeof ctx.items)[number]) => (f.chargedPerDistinctItem ? 1 : i.qty);
  const chargeableUnits = chargeable.reduce((a, i) => a + countOf(i), 0);
  const freeUnits = units - chargeable.reduce((a, i) => a + i.qty, 0);
  const chargeableYen = chargeable.reduce((a, i) => a + i.priceYen * i.qty, 0);
  const rateFor = (i: (typeof ctx.items)[number]) =>
    f.perItemBySite?.[i.site] ?? f.perItemYen ?? 0;
  const tierFor = (i: (typeof ctx.items)[number]) =>
    f.perItemBySiteTier?.[i.site] ?? f.tier;

  if (f.perOrderYen != null) {
    out.push(L('purchase-fee', 'Purchase fee', f.perOrderYen * orders,
      `¥${f.perOrderYen} × ${plural(orders, 'order')}${shopNote}`, f.tier, svc.sourceUrl));
  }
  if (f.protectionPlanPerOrderYen != null) {
    out.push(L('protection-plan', 'Protection plan', f.protectionPlanPerOrderYen * orders,
      `Standard plan, ¥${f.protectionPlanPerOrderYen} × ${plural(orders, 'order')}`
      + ' — the Lite plan is ¥0',
      f.tier, svc.sourceUrl));
  }
  if (f.perItemYen != null) {
    // サイトごとに額が違う社では、実際に当てた額を内訳の説明に出す。
    const amounts = chargeable.map((i) => rateFor(i) * countOf(i));
    const total = amounts.reduce((a, b) => a + b, 0);
    const distinct = [...new Set(chargeable.map((i) => rateFor(i)))].sort((a, b) => a - b);
    const lineTier = f.perItemBySiteTier
      ? weakestTier(chargeable.map(tierFor))
      : f.tier;
    // ヤフオク（JDirectItems Auction 相当）が混じっていて、行の確度が推定に落ちるときだけ
    // 根拠を書く。断定にしない ── 「解釈している」であって「そうである」ではない。
    const hasInferredYahoo = chargeable.some(
      (i) => i.site === 'yahoo-auctions' && tierFor(i) === 'estimate',
    );
    const note = (distinct.length > 1
      ? `${distinct.map((v) => `¥${v}`).join(' / ')} by shop, ${chargeableUnits} charged`
      : `¥${distinct[0] ?? f.perItemYen} × ${chargeableUnits}`)
      + (f.chargedPerDistinctItem && units > chargeableUnits + freeUnits
        ? ' (same item counted once)' : '')
      + (freeUnits > 0 ? ` (${freeUnits} free — Rakuten / Yahoo! Shopping beta)` : '')
      + (hasInferredYahoo
        ? ' — ZenMarket\'s fee page prices Mercari and JDirectItems Auction at ¥800 and'
          + ' never names Yahoo Auctions; we read JDirectItems Auction as Yahoo Auctions'
        : '');
    out.push(L('service-fee', 'Service fee', total, note, lineTier, svc.sourceUrl));
  }
  if (f.adValoremRate != null) {
    out.push(L('ad-valorem', 'Commission',
      Math.round(chargeableYen * f.adValoremRate),
      `${(f.adValoremRate * 100).toFixed(0)}% of the winning price`
      + (freeUnits > 0 ? ' (Rakuten / Yahoo! Shopping free in beta)' : ''),
      f.tier, svc.sourceUrl));
  }
  if (f.bankFeePerOrderYen != null) {
    out.push(L('bank-fee', 'Banking fee', f.bankFeePerOrderYen * orders,
      `¥${f.bankFeePerOrderYen} per payment — once per seller per day`,
      f.bankFeeTier ?? 'unverified', svc.sourceUrl));
  }
  if (f.paymentInsideJapanYen != null) {
    // **課される出品サイトが限られる社がある。** FROM JAPAN はヤフオクの落札1件ごとだけ。
    const sites = f.paymentInsideJapanSites;
    const n = sites
      ? ctx.items.filter((i) => sites.includes(i.site)).length
      : orders;
    out.push(L('payment-inside-jp', 'Payment fee inside Japan',
      f.paymentInsideJapanYen * n,
      sites
        ? `¥${f.paymentInsideJapanYen} × ${plural(n, 'auction')} — Yahoo! Auctions only`
        : `¥${f.paymentInsideJapanYen} × ${plural(n, 'order')}`,
      f.paymentInsideJapanTier ?? 'unverified', svc.sourceUrl));
  }
  return out;
}

/**
 * 代行が販売時点で徴収する輸入税（AU/SG）。**確認できた社だけ金額を出す。**
 *
 * 未確認の社を 0 として扱ってはいけない。それをやると、単に我々が調べていない社が
 * その国で 9〜10% 安く見えるだけの表になり、順位が「調査量の差」で決まる。
 * だから未確認の社は null（画面では「—」）にして、**ラベル自体に「確認できていない」と書く**
 * ——ラベルはそのまま excluded に並び、総額から何が抜けているかの一覧になる。
 */
function prepaidImportTaxLine(
  svc: Service, cc: CompareInput['country'],
  a: { itemsYen: number; declared: number; preTaxYen: number; shippingYen: number;
       cifYen: number; shippingKnown: boolean },
): Line | null {
  const c = COUNTRIES[cc];
  const p = svc.prepaidImportTax?.[cc];
  // 制度がその国の全社に課す帯（豪 A$1,000・星 S$400）と、社が自分で言っている帯
  // （EU/UK の IOSS）の**どちらか**に入っていれば行を出す。
  const byCountry = c.sellerCollectsBelow != null && a.declared <= c.sellerCollectsBelow;
  const byCompany = p?.collectsBelow != null && a.declared <= p.collectsBelow;
  // `a.declared` は呼び出し側で**個口あたり**に割ってから渡している（上の `declaredPerParcel`
  // と同じ理由。IOSS も UK も consignment 単位）。
  if (!byCountry && !byCompany) return null;

  const taxName = cc === 'AU' || cc === 'SG' || cc === 'CA' ? 'GST' : 'VAT';
  if (!p) {
    // **確認できていないのは「誰が集めるか」だけで、「いくら払うか」ではない。**
    // その社が決済時に集めるなら決済時に、集めないなら国境で SingPost / 税関が集める。
    // どちらでも買い手が出す額は同じ税率ぶん。**だから `—` にしてはいけない。**
    // `—` にすると、確認できた社にだけ税が乗り、確認できなかった社が
    // **その税額ぶん安い**表になる——調べていないことが安さに化ける
    // （`docs/TODO-NEXT.md` 課題1）。
    //
    // ベースは**その国の課税ベース**を使う。徴収者が誰であれ、国境で課すなら
    // この額に掛かるからで、社ごとの内部ベース（Charge1+Charge2 等）は
    // 集めると分かっている社にしか適用できない。
    //
    // **幅**: 集める社の実際のベースは商品代のみ〜総額まで割れており
    // （`services.ts` の `prepaidImportTax[].base`）、その差ぶんは上下しうる。
    // tier `estimate` にして画面で `~` と出す。
    //
    // **なお不足がもう1つ残る**: 国境で集められる場合、SingPost の手数料
    // （`countries.ts` の `clearanceBands`）も乗るが、そこは S$400 以下を
    // 「OVR で徴収済み＝0」として置いている。この社ではその前提が立たない。
    // 額を足さずに、ここに書いて開示する。
    const est = c.base === 'CIF' ? a.cifYen : a.itemsYen;
    if (c.vatRate == null || !a.shippingKnown) {
      return L('prepaid-import-tax', `${taxName} collected at checkout`, null,
        'we cannot complete the base for this parcel', 'none', c.sourceUrl);
    }
    return L('prepaid-import-tax',
      `${taxName} — estimated: we could not confirm who collects it`,
      Math.round(est * c.vatRate),
      `${(c.vatRate * 100).toFixed(0)}% either way — ${svc.name} does not say whether it collects at checkout,`
      + ` so this is ${c.name}'s own base. If it is collected at the border instead,`
      + ` the carrier's handling fee is added on top and we do not show that here.`,
      'estimate', c.sourceUrl);
  }

  const base = p.base === 'declared' ? a.itemsYen
    : p.base === 'before-shipping' ? a.preTaxYen - a.shippingYen
    : a.preTaxYen;
  // 送料込みのベースなのに国際送料が取れていない行では、税額も出せない。
  // 送料抜きの額で掛けたら、その社だけ税が安く出る。
  if (!a.shippingKnown && p.base !== 'declared') {
    return L('prepaid-import-tax', `${taxName} collected at checkout`, null,
      `${(p.rate * 100).toFixed(0)}% of a total we cannot complete —`
      + ' we have no published EMS rate for this parcel',
      'none', p.sourceUrl);
  }
  return L('prepaid-import-tax', `${taxName} collected at checkout`,
    Math.round(base * p.rate), p.note, p.tier, p.sourceUrl);
}

function buildRow(svc: Service, variant: Row['variant'], ctx: Ctx): Row | null {
  const items = ctx.items;
  // **注文の数は社ごとに違う。** Buyee のショッピングは同一店舗の複数点で1注文
  // （原文「Even if multiple purchases are from the same store, it is a flat rate of ¥500」）。
  // 店舗が URL から引けない点はまとめず、1点＝1注文のまま（過大なほうに残す）。
  const grouping = svc.fee.ordersGroupedByShop ? groupByShop(items) : oneOrderPerItem(items);
  const orders = grouping.groups.length;
  const units = items.reduce((a, i) => a + i.qty, 0);
  const itemsYen = items.reduce((a, i) => a + i.priceYen * i.qty, 0);

  const weights = items.map((i) => itemWeightG(i, ctx));
  if (weights.some((w) => w == null)) return null; // 重量が決まらない。呼び出し側が段に落とす。
  const netPerItem = items.map((i, idx) => (weights[idx] as number) * i.qty);

  const isBuyee = svc.id === 'buyee';
  const dom = items.map((i) => domesticFor(i, isBuyee));
  const domYen = dom.reduce((a, d) => a + d.yen, 0);
  const domTier = weakestTier(dom.map((d) => d.tier));
  const domFreeShippingRisk = dom.some((d) => d.freeShippingRisk);

  const split = variant === 'default' && svc.parcelDefault === 'per-order';
  const parcels = split ? orders : 1;
  // 個口も注文の単位で割る。同一店舗の2点が1注文なら、届くのも1個口
  // （Buyee 原文「we process each order respectively … separate domestic shipment fees
  //  for each order」＝**注文ごと**であって点ごとではない）。
  const parcelGross = split
    ? grouping.groups.map((g) => grossG(g.reduce((a, idx) => a + netPerItem[idx]!, 0)))
    : [grossG(netPerItem.reduce((a, g) => a + g, 0))];

  // **国際配送の方式を決める。**利用者が指定していなければ、この行の荷物を
  // **実際に運べる**方式のうち最安を選ぶ（`method: 'cheapest'`）。
  // 以前は EMS 固定だったが、EMS は日本郵便の中でどの重量でも最安ではない。
  //
  // **個口ごとに料金が決まるので、方式の可否も個口ごとに見る。**注文ごとに別送する
  // Buyee の既定は1個口が軽くなるので、同梱では上限を超える小形包装物が使えることがある
  // ——これは実在する差で、モデルから落とすと Buyee の既定が不当に高く出る。
  const wanted = ctx.method ?? 'cheapest';
  // **箱は仮定する**（P2 2a）。日本郵便4方式は寸法に一切依存しないと実測済み
  // （`docs/audit/o2-courier-2026-09-08.md` §2）なので額の計算には使わない。
  // 使うのは (a) 寸法での「送れない」判定と (b) 宅配便の容積重量の2箇所だけ。
  const parcelDims = DEFAULT_PARCEL_DIMENSIONS_CM;
  // **その社が売っていない方式は値段が付かない。**2026-09-07 の実測で品揃えが社で
  // 大きく違うことが分かった（FROM JAPAN 5方式 / Jauce 2方式、Neokyo は小形包装物なし）。
  // 売っていない方式に公表額を当てると、使えない選択肢を最安に見せることになる。
  const priceAll = (m: PostalMethod): number | null => {
    const rate = svc.postage[m];
    if (!rate) return null;                        // その社はこの方式を売っていない
    if (rate.unavailableIn?.includes(ctx.cc)) return null;  // その国へは出していない
    // F30: 商品価格（Charge 1）がこの方式の上限を超えたら選べない。重量や国とは別の理由。
    if (rate.priceCapJpy != null && itemsYen > rate.priceCapJpy) return null;
    // P2 3: 寸法による「送れない」（額ではなく可否）。既定の箱は全方式の上限を
    // 下回るので、いまはここで常に false になる（`dimensionsExceedCube` のコメント）。
    if (dimensionsExceedCube(m, parcelDims)) return null;
    const each = parcelGross.map((g) => postageFor(m, ctx.cc, g));
    if (each.some((e) => e == null)) return null;  // 1個口でも運べなければ使えない
    // **上乗せは個口ごとに足す。**1kg 段の定額なので、個口を分ければその数だけ乗る。
    return parcelGross.reduce(
      (a, g, i) => a + each[i]!.yen + markupYen(rate, ctx.cc, g), 0);
  };
  // **宅配便（P2）。**`svc.courier` は現時点でどの社も未設定——データが入るまで
  // このループは常に空を返し、既存の挙動（0e）を1円も変えない。データが入っても
  // 「値段が付かない国」は `courierPriceFor` が null を返すのでここで自然に落ちる
  // （0円にしない。`courierPriceFor` のコメント参照）。
  const priceCourier = (m: CourierMethod): number | null => {
    const rate = svc.courier?.[m];
    if (!rate) return null;
    if (rate.unavailableIn?.includes(ctx.cc)) return null;
    if (rate.priceCapJpy != null && itemsYen > rate.priceCapJpy) return null;
    const each = parcelGross.map((g) => courierPriceFor(rate, ctx.cc, g, parcelDims));
    if (each.some((e) => e == null)) return null;
    return each.reduce((a: number, e) => a + (e as number), 0);
  };
  const COURIER_METHOD_IDS: readonly CourierMethod[] =
    ['courier-fedex', 'courier-ups', 'courier-dhl', 'courier-sf-express', 'courier-ecms'];
  const method: PostalMethod | CourierMethod = wanted === 'cheapest'
    // その社が売っていて、全個口を運べる方式の中で最安。個口が複数なら合計で比べる。
    // **郵便と宅配便を同じ土俵で比べる**——「宅配便は最終価格を正とする」という
    // オーナー決定（2026-09-11）により、宅配便も総額としては郵便の各方式と対等。
    ? ([
        ...POSTAL_METHODS.map((s) => ({ id: s.id as PostalMethod | CourierMethod, yen: priceAll(s.id) })),
        ...COURIER_METHOD_IDS.map((id) => ({ id: id as PostalMethod | CourierMethod, yen: priceCourier(id) })),
      ]
        .filter((x): x is { id: PostalMethod | CourierMethod; yen: number } => x.yen != null)
        .sort((a, b) => a.yen - b.yen || a.id.localeCompare(b.id))[0]?.id ?? 'ems')
    : wanted;
  const isCourier = COURIER_METHOD_IDS.includes(method as CourierMethod);
  const courierRate = isCourier ? svc.courier?.[method as CourierMethod] : undefined;
  const spec = isCourier
    // 宅配便は `PostalMethodSpec` の表に無い。ラベルは料金データ自身の `labelRaw`
    // から作る——各社が法人契約している宅配ブランド名は社ごとに違うので、
    // 郵便のような共通の日数表は持たない（データが入るまで到達しない分岐）。
    ? {
        id: method, label: courierRate?.labelRaw ?? method, days: 'not yet modeled',
        daysSourceUrl: courierRate?.sourceUrl ?? svc.sourceUrl ?? '', daysTier: 'none' as Tier,
        tracked: true,
      }
    : POSTAL_METHODS.find((s) => s.id === method)!;
  const rate = isCourier ? undefined : svc.postage[method as PostalMethod];
  // **方式ごとの地帯を使う。**EMS は米国が第4地帯で、他方式は第3地帯。
  // ここが `POSTAL_ZONE` 固定だったので、米国の EMS 行は第4地帯の額を出しながら
  // 「zone 3」と書いていた。**宅配便には地帯の概念が無い**（最終価格を国別に直接
  // 持つので、地帯で束ねる必要がない）。
  const zone = isCourier ? null : zoneFor(method as PostalMethod, ctx.cc);

  // **表の外の重量では料金を持っていない。丸めない。**
  // 以前は最上段に丸めていたので、20kg の小包を 15kg の料金で安く見せていた。
  // 宅配便はここに当たらない（`courierPriceFor` が帯の外を自分で null にする）。
  const each = isCourier ? [] : parcelGross.map((g) => postageFor(method as PostalMethod, ctx.cc, g));
  const overMax = !isCourier && each.some((e) => e == null);
  // F30: 商品価格の上限超は「重すぎる」でも「売っていない」でもなく「選べない」。
  const priceCapExceeded = !!(rate ?? courierRate)?.priceCapJpy
    && itemsYen > (rate ?? courierRate)!.priceCapJpy!;
  const shipYen: number | null = isCourier
    ? priceCourier(method as CourierMethod)
    : priceAll(method as PostalMethod);
  // **「その社が売っていない」「重すぎる」「商品価格が高すぎる」は違う理由なので、書き分ける。**
  const stepLabel = isCourier
    ? (!courierRate
      ? `${svc.name} does not offer this courier`
      : courierRate.unavailableIn?.includes(ctx.cc)
        ? `${svc.name} does not ship this courier to ${COUNTRIES[ctx.cc].name}`
      : priceCapExceeded
        ? `not eligible above ¥${courierRate.priceCapJpy!.toLocaleString('en-US')} declared value`
      : shipYen == null
        // **未価格。0円にしない。**「大きすぎる／重すぎる」ではなく「まだ調べていない」。
        ? `${svc.name} has not priced this courier for ${COUNTRIES[ctx.cc].name} yet`
        : split ? `${plural(parcels, 'parcel')}` : '1 parcel')
    : (!rate
      ? `${svc.name} does not offer this method`
      : rate.unavailableIn?.includes(ctx.cc)
        ? `${svc.name} does not ship this method to ${COUNTRIES[ctx.cc].name}`
      : priceCapExceeded
        ? `not eligible above ¥${rate.priceCapJpy!.toLocaleString('en-US')} declared value`
      // P2 3: 寸法による「送れない」。額ではなく可否——理由が違うので文言も分ける。
      : dimensionsExceedCube(method as PostalMethod, parcelDims)
        ? `over our assumed ${Math.max(parcelDims.lengthCm, parcelDims.widthCm, parcelDims.heightCm)}cm`
          + " box side — outside this method's size limit (estimate)"
      : overMax
        ? `over ${formatStep(maxGramsFor(method as PostalMethod, ctx.cc))} — outside this method's table`
        : split
          ? `${plural(parcels, 'parcel')}`
          : `1 parcel, ${formatStep(each[0]!.stepGrams)} step`);

  const priceEstimated = items.some((i) => i.priceTier === 'estimate');
  const lines: Line[] = [
    L('items', 'Items', itemsYen, plural(units, 'item'),
      priceEstimated ? 'estimate' : 'fixed'),
  ];

  lines.push(...feeLines(svc, ctx, grouping, units));

  lines.push(svc.domesticIncluded
    ? L('domestic-shipping', 'Domestic shipping', 0, 'included in the service fee', 'fixed', svc.sourceUrl)
    : L('domestic-shipping', 'Domestic shipping', domYen,
        domFreeShippingRisk
          ? 'listing says free shipping; Buyee notes this can still be charged'
            + ' if the shipping method changes'
          : domTier === 'estimate'
            ? `~¥${ASSUMED_DOMESTIC_SHIPPING_YEN} each, paste the URL to know`
            : 'from each listing',
        domTier,
        domFreeShippingRisk ? BUYEE_FREE_SHIPPING_SOURCE_URL : null));

  const pack = packingLine(svc, parcelGross);
  if (pack) lines.push(pack);

  // F21。既定45日では無料期間30日のBuyeeだけに課金が乗る（他4社は無料期間の内側）。
  lines.push(storageLine(svc, ctx.storageDays, orders, parcels, parcelGross, units));

  // **`display: total` だが額を公表していない費目。**マスタに「任意欄」は存在しない
  // （0e、docs/FEE-ITEMS.md §1）ので、額が出せなくても行そのものは消さない——
  // `amount: null`（画面「—」）で毎行に足し、`excluded` に名前を載せる。
  for (const u of svc.unpricedFees ?? []) {
    lines.push(L(u.key, u.label, null, u.note, 'none', u.sourceUrl ?? svc.sourceUrl));
  }

  // **EMS 行の tier は「料金の出どころ」だけを表す。**
  // 料金表は日本郵便の公表値（一次情報）で、そこに入れる重量は我々の推定である。
  // 2つを1つの tier に潰していたので `approximate` が常に true になり、画面の `~` が
  // 何も言わなくなっていた（docs/audit/logic.md C4）。重量の確度は Items 行の重量 tier
  // と `Row.approximate` が持つ。**段に入れた重量が梱包後の仮定（×1.2 + 300 g）である
  // ことは、この行の note に必ず書く**（tier からは読めないので、文字で書く）。
  const shipTier: Tier = shipYen == null ? 'none' : (rate ?? courierRate)!.tier;
  // **宅配便は最終価格を正とする。分解しない**（オーナー確定 2026-09-11）——
  // 公表額への上乗せという概念が無いので `markupYen` を呼ばない。
  const markupNote = isCourier
    ? (shipYen == null ? '' : ', carrier\'s final price, not broken into a published rate + markup')
    : (shipYen == null ? ''
      : markupYen(rate!, ctx.cc, parcelGross[0]!) !== 0
        ? `, +¥${markupYen(rate!, ctx.cc, parcelGross[0]!).toLocaleString('en-US')}`
          + ` per parcel over the published rate`
      : ', published rate, no markup');
  // **速さと追跡を額と同じ行に出す。**船便は 3kg で EMS より ¥5,100 安いが 1〜3 か月かかる。
  // 額だけ出して日数を出さなければ、安いほうを選ばせる誤誘導になる。
  const boxNote = isCourier && shipYen != null ? `, ${DEFAULT_PARCEL_DIMENSIONS_NOTE}` : '';
  lines.push(L('intl-shipping', `${spec.label} to ${COUNTRIES[ctx.cc].name}`, shipYen,
    (isCourier ? stepLabel : `zone ${zone}, ${stepLabel}`)
    + (shipYen == null ? '' : ' (weight after our packing allowance)')
    + markupNote
    + boxNote
    + (shipYen == null ? '' : ` — ${spec.days}${spec.tracked ? ', tracked' : ', no tracking'}`),
    isCourier && shipYen != null
      ? (TIER_STRENGTH[shipTier] < TIER_STRENGTH[DEFAULT_PARCEL_DIMENSIONS_TIER]
        ? shipTier : DEFAULT_PARCEL_DIMENSIONS_TIER)
      : shipTier,
    isCourier ? (courierRate?.sourceUrl ?? svc.sourceUrl) : (method === 'ems' ? EMS_SOURCE_URL : POSTAGE_SOURCE_URL)));

  // F26。日本郵便の全便が対象（EMS・小形包装物・国際小包の別を問わない）。
  lines.push(exportClearanceLine(itemsYen));

  // **この行が実際に払う国内送料**を課税ベースに使う。以前は domesticIncluded の社でも
  // 生の domYen を渡していたので、画面のどの行にも出ない ¥800 が CIF に混ざっていた。
  const domCharged = svc.domesticIncluded ? 0 : domYen;
  // 税を除く支払総額と、そのうちの送料。代行が前徴収する税の課税ベースに使う。
  // **税の行を積む前に測る**（社の原文がそろって「before GST」と書いている）。
  const preTaxYen = sum(lines);
  const shippingYen = lines
    .filter((l) => l.key === 'domestic-shipping' || l.key === 'packing' || l.key === 'intl-shipping')
    .reduce((acc, l) => acc + (l.amount ?? 0), 0);
  // **その社がこの国で自分で税を取るか。**閾値は intrinsic value（商品代）で測る
  // ——IOSS も UK も運賃を除いた値で判定する規定で、`taxLines` の `declared` と同じ。
  const declaredForCc = itemsYen / rateFor(COUNTRIES[ctx.cc].ccy);
  const ownPrepaid = svc.prepaidImportTax?.[ctx.cc];
  const companyCollects = ownPrepaid?.collectsBelow != null
    && declaredForCc / parcels <= ownPrepaid.collectsBelow;
  lines.push(...taxLines(ctx.cc, ctx.province, items,
    { itemsYen, domYen: domCharged, emsYen: shipYen ?? 0, units, parcels }, companyCollects));
  const prepaid = prepaidImportTaxLine(svc, ctx.cc, {
    itemsYen,
    // **個口あたり**。閾値は consignment 単位なので、カート全額で渡すと
    // 個口を分けた行で前徴収の帯を誤判定する。
    declared: itemsYen / rateFor(COUNTRIES[ctx.cc].ccy) / parcels,
    preTaxYen,
    shippingYen,
    // その国の課税ベース（CIF）。徴収者が確認できない社の推定に使う。
    // `taxLines` が使っているのと同じ組み立て（実際に払う国内送料＋国際送料）。
    cifYen: itemsYen + domCharged + (shipYen ?? 0),
    shippingKnown: shipYen != null,
  });
  if (prepaid) lines.push(prepaid);

  // 入金手数料は送金合計額に対する率なので gross-up（外部レビュー⑤-a、2026-09-11）。
  // ¥10,000 をチャージするには 10000/(1-0.035) = ¥10,363 が要る。
  //
  // **ベースは「この社の決済を通る額」。**マスタ F07（`master/fees.json`）は
  // どちらの社も「決済時に支払う総額」をベースにすると書いている——ZenMarket
  // 「3.5% of the **total transaction amount**」、Jauce「3.9% over the **deposit
  // amount**」（口座に入金する額＝決済時に払う全額）。この社が決済時に徴収する
  // VAT/GST（`prepaidImportTaxLine` の実額）は、利用者がこの社に払う総額の
  // 一部なのでベースに含める。**以前はこのブロックが税の行より前（`sum(lines)`）
  // にあったため、決済時に徴収する VAT/GST が入金手数料の対象から漏れていた**
  // （ZenMarket DE ¥12,800 の IOSS VAT、Jauce AU の GST など。
  // `master/validate.py` の実請求書再現で確認済み）。
  //
  // **`preTaxYen` に足すだけで `sum(lines)` は使わない。**関税（`duty`）・
  // 通関手数料（決済で 0 にならない場合の `clearance`）・州税（CA）・酒税
  // （GB excise）は、この社が決済で集めるのではなく**国境・配達時に別途
  // 徴収される**額（`taxLines` のコメント参照）——この社の送金合計には含まれない
  // ので、それらを足すと逆に過大請求になる。決済時に集める税は
  // `prepaidImportTaxLine` が1本にまとめて持っている（`prepaid`）ので、
  // それだけを `preTaxYen` に足せば「決済を通る額」が過不足なく揃う。
  if (svc.deposit) {
    const depositBase = preTaxYen + (prepaid?.amount ?? 0);
    const base = depositBase + svc.deposit.flatYen;
    const fee = svc.deposit.flatYen + (base / (1 - svc.deposit.rate) - base);
    lines.push(L('deposit', 'Deposit fee', Math.round(fee), svc.deposit.note,
      svc.deposit.tier, svc.sourceUrl));
  }

  const total = totalRange(lines);
  const rankHigh = rankHighFor(lines);
  const excluded = lines.filter((l) => l.amount == null).map((l) => l.label);
  // **重量は費目ではないので、行の tier には現れない。** EMS 行が「公表料金」になった今、
  // 重量が推定であることをここで別に数えないと、推定の重量で引いた総額が確定値の顔をする。
  // 重量表のライン・仮置き・利用者の入力はすべて tier 'estimate'（weights.ts）なので、
  // ここが false になるのは呼び出し側が「この重量は確かだ」と言った入力だけ。
  const weightEstimated = items.some((i) => i.weightTier !== 'fixed');
  const approximate = priceEstimated || weightEstimated || lines.some((l) => l.tier === 'estimate');

  const label = variant === 'consolidated' ? `${svc.name}, consolidated`
    : variant === 'default' ? `${svc.name}, default`
    : svc.name;
  const tag = split
    ? `${plural(orders, 'order')} · ${plural(parcels, 'parcel')}`
    : `${plural(units, 'item')} · 1 parcel`
      + (svc.parcelVerified ? '' : ' assumed')
      + (variant === 'consolidated' ? ' · you must request this' : '');

  return {
    id: svc.id + (variant ? `:${variant}` : ''),
    serviceId: svc.id,
    method,
    serviceName: svc.name,
    variant,
    label,
    tag,
    lines,
    total,
    rankHigh,
    excluded,
    parcels,
    rank: 0,
    diff: 0,
    cheapest: false,
    // rank() が総額を見てから付ける。ここでは何も主張しない。
    tied: false,
    recommended: false,
    equivalent: false,
    paysUs: svc.paysUs,
    referralNote: svc.referralNote,
    // 1点だけなら、その社でその出品を直接開く（検証済みの組み合わせのみ）。
    ...(() => {
      const one = items.length === 1 ? outboundFor(svc.id, svc.url, items[0]) : null;
      return { outboundUrl: one?.url ?? svc.url, outboundDirect: one?.direct ?? false };
    })(),
    itemLinks: items
      .map((i) => ({ item: i, link: outboundFor(svc.id, svc.url, i) }))
      .filter((x) => x.link.direct)
      .map((x) => ({ itemId: x.item.id, title: x.item.title, url: x.link.url })),
    approximate,
    // 国際送料が取れていない行は、取れている行と総額を比べられない。
    comparable: shipYen != null,
    notComparableReason: shipYen != null ? null
      : isCourier
        // **未価格の宅配便は「比較不能」として落とす。0円にも安く見せもしない**
        // （P2 4、これが最重要）。データが無い間は `wanted: 'cheapest'` がこの方式を
        // 選ばないので、この分岐は利用者が明示的に宅配便を指定したときだけ到達する
        // （このPRではそのUIは無いので、今日は到達しない）。
        ? `${svc.name} has not priced this courier for ${COUNTRIES[ctx.cc].name} yet`
          + ' — we do not invent a price for it'
      : !rate
        ? `${svc.name} does not sell ${spec.label}, so there is no total to compare`
      : rate.unavailableIn?.includes(ctx.cc)
        ? `${svc.name} does not ship ${spec.label} to ${COUNTRIES[ctx.cc].name}`
          + ' — its options there are couriers, which we do not price'
      : priceCapExceeded
        ? `${spec.label} can only be selected under ¥${rate.priceCapJpy!.toLocaleString('en-US')}`
          + ' declared value at this company, and this cart is over that'
      : dimensionsExceedCube(method as PostalMethod, parcelDims)
        ? `${spec.label} has no published rate for our assumed box size — outside this method's`
          + ' size limit (estimate)'
        : `${spec.label} has no published rate above ${formatStep(maxGramsFor(method as PostalMethod, ctx.cc))}`
          + ' in our table, so this total is missing its largest line',
  };
}

/**
 * 総額の昇順で順位を付ける。**報酬額（paysUs）は一切参照しない。**
 * 比べられない行（国際送料が取れていない）は末尾に回し、順位も差額も付けない。
 * 最大の費目が欠けた総額を、揃っている総額と並べたら順位が嘘になる。
 *
 * ## 同額は同順位（T26）
 *
 * 以前はここが `a.total - b.total || a.serviceName.localeCompare(b.serviceName)` で、
 * **同額を社名の辞書順で割っていた。**社名の辞書順に順位の根拠は無い。
 * しかも害は抽象的ではなかった: 7カ国 × 1/2/3/5点 × 25〜6,000 g を走査すると同額は
 * 904 組あり（`docs/audit/ties-2026-09-07.md`）、その大半が **Buyee と Neokyo の同額**で、
 * `localeCompare('Buyee', 'Neokyo') < 0` なので**報酬を払う社（Buyee）が、報酬ゼロの社
 * （Neokyo）を常に押しのけて1位**になっていた。順位に報酬を使わないという約束
 * （REQUIREMENTS §2）を、並べ替えの第2キーが事実上破っていた。
 *
 * だから rank は「自分より**厳密に**安い比較可能な行の数 + 1」にする（競技順位）。
 * 同額の行は同じ数字になり、次の行はその分だけ飛ぶ（1-1-3）。
 *
 * ## CHEAPEST は同額の全行に付ける
 *
 * 「どちらにも付けない」（両方 `+¥0` と描く）も検討したが、**それは「最安が存在しない」
 * と読める。**事実は「最安が2つある」。CHEAPEST は「これより安い選択肢は無い」という
 * 事実の表明であって、1社を推すバッジではない。事実が2社で成り立つなら2社に付く。
 * 消す方を選ぶと、このツールが答えるべき唯一の問い（どれを選ぶか）に対して、
 * 答えを持っているのに黙ることになる。
 *
 * ただし付けるだけでは足りない: 縦に並べれば上の行が勝っているように読める。
 * **同順位の行の縦の並び（＝ SERVICES の宣言順。安定ソートがそのまま残す）は
 * 何も意味しない。**だから `tied` を立て、画面がその場で `tied` と書いて打ち消す。
 */
/**
 * 「重なる」の定義（P1-2、`docs/ROADMAP.md` P1 確定仕様2・6）。
 *
 * 各行の区間を `[low, high ?? Infinity]` として扱う——`high === null`（上限不明）は
 * 「上端が無い」ではなく「**上端が分からない**」なので、上端の候補を +Infinity に
 * 開けておくのが安全側（そう置かないと、上限不明の行を「1位より確実に高い」と
 * 決めつけることになり、実際には最安になりうる行を枠から締め出す）。
 *
 * **判定は候補行の下端 1点と、1位側の区間だけで行う**（確定仕様6「下端のみで比較」）。
 * 候補行自身の上端は使わない——`row.total.low <= leaderHigh` の1本の不等式だけで、
 * `row.total.high` を一切参照しない。だから候補行が上限不明でも判定は変わらない
 * （`docs/ROADMAP.md` の論点「`high === null` の行はどう扱うか」への回答）。
 *
 * 1位側（`leaderHigh`）は「1位（同額タイを含む）のうちどれか1社でもその値まで
 * 高くなりうるなら重なるとみなす」ため、タイの中の最大の上端を使う。**1位自身が
 * 上限不明なら leaderHigh は Infinity になり、下端で1位に並ぶ・それより高い社は
 * 全て重なる**——1位の総額がどこまで伸びるか分からない以上、「他社は1位より
 * 確実に高い」とは言えないので、これは意図した挙動（総額に効くのは配送方法、
 * という P1 の全社重なり表示につながる）。
 */
function overlapsLeader(rowLow: number, leaderHigh: number): boolean {
  return rowLow <= leaderHigh;
}

/**
 * おすすめ枠・同等の印（P1-2）。**下端の昇順に並んだ比較可能な行だけを見る。**
 *
 * **枠は1位を含めて最大2社。**「1位＋重なる社2社まで＝最大3社」ではない
 * （最初の実装のバグ。コーディネーター指摘、2026-09-11）。オーナーの言葉は
 * 「おすすめは上位**二つ**まで」「**二つとも**囲って」——枠に入るのは1位と
 * もう1社までで、1位の区間と重なる社があれば**そのうち1社だけ**を枠に足す。
 * それ以上重なる社（3社目以降）には枠を広げず、`equivalent` の印だけ付ける
 * （確定仕様4「3社目以降で1位と幅が重なっている社には『同等』の印を付ける。
 * 枠には入れない」）。重なる社が無ければ1位だけの単独枠になる（確定仕様3）。
 *
 * **1位が同額タイで2社を超える場合も、枠は2社を超えない。**下端の昇順
 * （タイの中では入力順）で先頭2社だけを枠に入れ、残りは「同等」に落とす——
 * 全員が同着1位であっても、画面に囲えるのは2社までという制約は変わらない。
 */
function computeBracket(ok: Row[]): { recommended: Set<string>; equivalent: Set<string> } {
  const BRACKET_CAP = 2; // 1位を含めて最大2社（確定仕様2）
  const recommended = new Set<string>();
  const equivalent = new Set<string>();
  if (!ok.length) return { recommended, equivalent };
  const leadLow = ok[0]!.total.low;
  const leaders = ok.filter((r) => r.total.low === leadLow);
  // タイが枠の上限を超えるときは、下端の昇順（＝同額の中では入力順）で先頭だけ枠へ。
  const leadersInBracket = leaders.slice(0, BRACKET_CAP);
  const leadersOverflow = leaders.slice(BRACKET_CAP);
  for (const r of leadersInBracket) recommended.add(r.id);
  for (const r of leadersOverflow) equivalent.add(r.id);
  // **境界は既知の上限だけで伸ばす（P1-4、オーナー確定 2026-09-11）。**
  // 以前は1位グループに `high === null` の行が1つでもあれば境界を Infinity にし、
  // それ以降の全社を無条件で `overlapsLeader` に通していた——枠は2社で打ち止めでも、
  // 溢れた行は上限の無い `equivalent` に落ち、`isIndeterminate` がそれを「全社が
  // 枠か同等に収まっている」と読んで、閉区間同士で確実に差がある社まで
  // 「判別不能」に巻き込んでいた（実例: GB で Neokyo ¥35,921 と Buyee default
  // ¥44,982 ―― 確定差 ¥9,061 ―― が両方 `equivalent` になっていた）。
  //
  // 直したのはここ:境界（`bound`）は「既知の上限（`high !== null`）を持つ行」からのみ
  // 更新する。`high === null` の行を枠や同等に入れることはこれまでどおり認めるが、
  // その行の「上限が分からない」という事実を他社の重なり判定に持ち込まない
  // ――上限不明の1社を通したからといって、境界が Infinity に飛ぶことはない。
  // 1位グループ自身が全員 `high === null`（例: US）なら `bound` は最後まで `null`
  // のままで、その場合だけ実務上 Infinity 相当（＝全員を通す）にフォールバックする
  // ――「本当に誰の上限も置けない」ときは、今までどおり安全側に倒す。
  //
  // **P1-4 で `total.high` ではなく `rankHigh` を見るようにした。** `total.high`
  // は共通の未知（`Line.scope === 'shared'`。米国の Zonos・連邦売上税など、
  // どの社を使っても同じようにかかる未取得行）が1件でもあれば `null` になる
  // ――画面の「以上（上限不明）」表示はそれで正しい。だが順位判定にまで
  // 同じ `null` を使うと、**社同士の差を作らない未知のせいで全社の順位が
  // 判定不能になる**という別の巻き込みが起きる（米国で FROM JAPAN が1位でも、
  // 他社の閉じた総額同士の差は本来判定できるはずだった）。`rankHigh` は
  // 共通の未知を「差を生まない」ものとして無視し、社固有の未知（FROM JAPAN の
  // 外注梱包など）だけを引き続き `null` として扱う。
  let bound: number | null = null;
  for (const r of leaders) {
    if (r.rankHigh != null) bound = bound == null ? r.rankHigh : Math.max(bound, r.rankHigh);
  }
  const rest = ok.filter((r) => r.total.low > leadLow);
  let remainingSlots = Math.max(0, BRACKET_CAP - leadersInBracket.length);
  for (const r of rest) {
    // `rest` は下端の昇順。`bound` は既知の上限を持つ行を通すたびにしか伸びないので、
    // ある行がここで弾かれた後、それより下端が大きい後続の行が通ることはない
    // ――弾かれた時点の `bound` を後続の行の下端がすでに超えており、`bound` を
    // 伸ばせる（＝下端がそれ以下の）行はもう出てこない。早期 break は最適化に
    // すぎず、判定の正しさには影響しない。
    if (!overlapsLeader(r.total.low, bound ?? Infinity)) continue;
    if (remainingSlots > 0) {
      recommended.add(r.id);
      remainingSlots -= 1;
    } else {
      equivalent.add(r.id);
    }
    // 上限不明の行を通しても境界は伸ばさない――伸ばせば旧来の「1件の上限不明が
    // 全社を飲み込む」経路が別の場所（1位グループ以外）で復活してしまう。
    if (r.rankHigh != null) bound = bound == null ? r.rankHigh : Math.max(bound, r.rankHigh);
  }
  return { recommended, equivalent };
}

function rank(rows: Row[]): Row[] {
  // 第2キーを持たない。同額の並びは入力順（SERVICES の宣言順）のまま残る
  // ——Array#sort は安定なので。その並びに意味は無く、意味が無いことは画面が書く。
  const byTotal = (a: Row, b: Row) => a.total.low - b.total.low;
  const ok = rows.filter((r) => r.comparable).sort(byTotal);
  const notOk = rows.filter((r) => !r.comparable).sort(byTotal);
  const low = ok[0]?.total.low ?? 0;
  const { recommended, equivalent } = computeBracket(ok);
  return [
    ...ok.map((r) => ({
      ...r,
      rank: ok.filter((o) => o.total.low < r.total.low).length + 1,
      diff: r.total.low - low,
      cheapest: r.total.low === low,
      tied: ok.some((o) => o.id !== r.id && o.total.low === r.total.low),
      recommended: recommended.has(r.id),
      equivalent: equivalent.has(r.id),
    })),
    // 比べられない行の総額は最大の費目を欠いている。同額でも「並んだ」ことにならない
    // ので tied は立てない（比べていないものを「同じ」と書かない）。おすすめ枠の
    // 判定も比較可能な行だけが対象なので、ここは常に false。
    ...notOk.map((r, i) => ({
      ...r, rank: ok.length + i + 1, diff: 0, cheapest: false, tied: false,
      recommended: false, equivalent: false,
    })),
  ];
}

/** おすすめ枠に入っている行の id（下端の昇順）。rankStable・weightSensitivity が使う。 */
function bracketIds(rows: Row[]): string[] {
  return rows.filter((r) => r.recommended).map((r) => r.id);
}

/**
 * 「安定」ではなく「判定不能」（P1-2 → **P1-4 で範囲を絞った**。オーナー確定
 * 2026-09-11）。
 *
 * **旧定義（P1-2）**は「比較可能な社が2社以上あって、その全員がおすすめ枠か
 * 同等の印に収まっている」だった。これは実害を生んだ: `computeBracket` が
 * 上限不明の1位を Infinity として扱うせいで、比較可能な行が1件でも溢れれば
 * 無条件で `equivalent` に落ち、**閉区間同士で確実に差が付いている社まで
 * 「判別不能」に巻き込んでいた**（実測: UI の既定カートで GB・DE・FR・CA・SG の
 * 7カ国中5カ国が該当。GB は Neokyo ¥35,921 と Buyee default ¥44,982 ―― 確定差
 * ¥9,061 ―― が両方 `equivalent` になり、「どこを選んでも総額はほぼ変わらない」
 * と表示していた）。
 *
 * **新定義（P1-4 でさらに絞った）:** 比較可能な社が2社以上あって、その**全員の
 * `rankHigh` が置けない**ときだけ真。`rankHigh` は `total.high` と違い、
 * 「どの社を使っても同じようにかかる共通の未知」（`Line.scope === 'shared'`。
 * 米国の Zonos 前払い利用料・連邦売上税の不在など）を無視する（`rankHighFor`
 * 参照）。「本当に誰の順位も置けない」（米国: 全行が共通の未知しか無く、
 * 社固有の未知も0件で、それでも `rankHigh` が全員 `null`……という状況は
 * 実装上は起きない。米国は現状これに該当しないので `rankIndeterminate` は
 * `false` になる。もし将来、社固有の未知しか無い社ばかりになれば、そのときは
 * 真にこの定義が真になる）場合のみ、確度をもって順位を言えないので判定不能とする。
 *
 * **なぜこの絞り方か:** `computeBracket`／`overlapsLeader` は「上限不明を偽の
 * 上端で塞がない」という P1 の大原則を保つため、上限不明の1位を Infinity 扱い
 * する経路を引き続き**持つ**（P1-4 でその Infinity が枠の外へ伝播しないように
 * 直しただけで、Infinity 自体は消していない）。だから `recommended`／
 * `equivalent` だけを見て判定不能を測ると、上限不明の1位が絡むたびに「巻き込み」
 * が起きうる構造は残る。**閉区間同士に確定した差がある限り、それは判定不能では
 * ない**という一次の事実を、`recommended`／`equivalent` という派生した印を経由
 * せずに `rankHigh` から直接測ることで、①のような巻き込みが再発する経路そのもの
 * を断つ。
 *
 * **④（外部レビュー、オーナー確定 2026-09-11）:** `total.high` をそのまま使うと、
 * 米国のように「全社に同じようにかかる共通の未知」（Zonos・連邦売上税）だけで
 * 全社が `total.high === null` になる国が、閉区間同士の確定した差があっても
 * 「判定不能」になってしまっていた。**共通の未知は総額の絶対値を本当に不確かに
 * するが、社同士の相対順位には効かない**（全社を同じだけ押し上げるだけなので）。
 * `rankHigh` を使うことでこれを区別する——`total.high`（画面表示）は共通の未知
 * があるかぎり `null` のまま（「以上（上限不明）」は消えない）だが、順位判定は
 * その未知を無視して進められる。社固有の未知（FROM JAPAN の外注梱包など）は
 * `rankHigh` でも引き続き `null` を強制する——その社**自身**の順位は不確かな
 * ままでよい、というのは変わらない。
 *
 * 一方で、上限不明の行が1件でも残っていれば、その行**自身の順位**は依然として
 * 「他社より高いかもしれない」という不確かさを持ち続ける（`comparable` から
 * 除外しない・`recommended`／`equivalent` の対象から外さない、という P1 の原則は
 * そのまま）。この関数が変えたのは「判定不能」という**要約の文言を出す条件**だけ。
 */
function isIndeterminate(rows: Row[]): boolean {
  const comparable = rows.filter((r) => r.comparable);
  // **1社しか比較可能な社が無いときは「判別できない」ではない。**選べる社が1つしか
  // 無いだけで、区別すべき相手がいない——「唯一値段が付く社」（`outOfTable` と同じ
  // 状況）であって、複数社が不確かさの中で見分けられない状態とは違う。
  return comparable.length > 1 && comparable.every((r) => r.rankHigh == null);
}

/**
 * 判定不能の文言（P1-2、判断3）。**社名を全部並べない。**
 * 比較可能な社の数と、1位（下端最小）の名だけを言う——`docs/ROADMAP.md` の
 * 全社重なり表示（「最安を狙える可能性が最も高い: Neokyo」）と同じ要約の仕方で、
 * 5社の正式名を毎回並べると文が長くなりすぎ、他の場所（既定カートの画面）で
 * 折り返しが増えてレイアウトを押し下げる実害があった。
 */
function indeterminateNote(comparable: Row[]): string {
  const n = comparable.length;
  const leader = comparable[0]!.label;
  // **「is cheapest」という文字列を含めない。** 画面の別の場所（1位が確定している
  // ときの Summary）が `/is cheapest/` で照合しており、同じ文言をここに混ぜると
  // 2箇所が一致してテストが `strict mode violation` で落ちる——「最安」を
  // 言い切れない状態なのだから、そもそも「is cheapest」と書くこと自体が適切でない。
  return `These ${n} companies sit within the same uncertainty — we can't tell which one`
    + ` wins. ${leader} looks the most likely.`;
}

/**
 * おすすめ枠の**集合**が変わったか（P1-2、コーディネーター判断2、2026-09-11）。
 *
 * 最初の実装は「基準の枠のうち1社でも両端の枠に残っていれば安定」だったが、
 * **枠は1位を含めて最大2社なので、5社中2社が枠に入っていれば「誰か1人残る」は
 * 十分高い確率で成立し、判定として機能しなかった**
 * （7カ国すべて `rankStable=true` になった実測がその欠陥そのもの）。
 *
 * 新しい定義は**集合の完全一致**。枠の中で誰が下端最小か（内部の順序）が入れ替わる
 * のは「動いた」に数えない——`Set` として比較するので中の並びは見ない。だが
 * **枠に入る／出る顔ぶれが1社でも変われば、それは「重量次第で薦める会社が変わる」
 * という事実そのものなので `false`。**
 *
 * 比較可能な行が両端で1つも残らない（`other` が空）ときは、以前と同じく
 * 「判定できない」として `false`（変わった）扱いにしない——比べられなくなったことを
 * 「不安定」と混同しない、という既存の規則を維持する。
 */
function bracketChanged(base: string[], other: string[]): boolean {
  if (other.length === 0) return false;
  if (base.length !== other.length) return true;
  const b = new Set(base);
  return other.some((id) => !b.has(id));
}

/**
 * 比較可能な行のうち総額が最小の行の id。**同額なら複数返る。**
 * 「1位が動いたか」を `rows[0]` で見ると、同額の中でどれが先頭に来たかという
 * 並びの偶然を「順位が動いた」と読んでしまう。集合で見る。
 */
function cheapestIds(rows: Row[]): string[] {
  const ok = rows.filter((r) => r.comparable);
  if (!ok.length) return [];
  const low = Math.min(...ok.map((r) => r.total.low));
  return ok.filter((r) => r.total.low === low).map((r) => r.id);
}

/** 'A' / 'A and B' / 'A, B and C'。英語UIにそのまま出る。 */
export function andList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * この総額は「確定した点」か（外部レビュー④、2026-09-11）。
 *
 * `high === low`（幅ゼロ）かつ `high !== null`（上限不明ではない）のときだけ真。
 * **差額（`Row.diff`）は常に下端どうしの差でしかない。**片方の総額がこの意味で
 * 確定していない（`high === null` で上限不明、または `high > low` で幅を持つ）
 * 限り、その社の実際の総額は表示している下端より高くなりうる——つまり
 * 「ちょうどこれだけ違う」とは言えず、「少なくともこれだけ違う」としか言えない。
 * 呼び出し側（`RankBoard`／`RowBreakdown`／`Summary`）はこれで1位（下端最小の
 * 行、同額なら全員）の総額を調べ、真でなければ差額の文言に「少なくとも」を足す。
 */
export function totalIsCertain(total: { low: number; high: number | null }): boolean {
  return total.high !== null && total.high === total.low;
}

function rowsFor(ctx: Ctx): Row[] {
  const out: Row[] = [];
  for (const svc of SERVICES) {
    if (svc.parcelDefault === 'per-order' && ctx.items.length > 1) {
      const c = buildRow(svc, 'consolidated', ctx);
      const d = buildRow(svc, 'default', ctx);
      if (c) out.push(c);
      if (d) out.push(d);
    } else {
      const r = buildRow(svc, null, ctx);
      if (r) out.push(r);
    }
  }
  return rank(out);
}

/** この点の重量を動かして見る幅。動かす根拠が無い点は null。 */
function sensitivityRange(item: Item): [number, number] | null {
  // 利用者が入れた重量は、その人が知っている数字。我々に幅を当てる根拠が無い。
  if (item.weightOrigin === 'user') return null;
  // 表に当たらなかった仮置きは、何も知らないので段表と同じ 500 g〜10 kg で見る。
  if (item.weightOrigin === 'assumed') return ASSUMED_WEIGHT_RANGE_G;
  // 表のラインは P25–P75（真ん中の50%）。幅が無いライン（P25=P75）は動かしても同じ。
  const r = item.weightRangeG;
  return r && r[0] < r[1] ? r : null;
}

/**
 * 1点ずつ、その点の重量だけを典型的な幅の両端に置いて1位が替わるかを見る。
 * rankStable（全点を ×1/3・×3）は「重量の推定がまとめて外れたら」を答え、こちらは
 * 「**どの品の**重量を確かめれば順位が固まるか」を答える。14ラインで P25–P75 が
 * 1位の交差点を跨ぐ（docs/DESIGN-NOTES.md §1）ので、カートの中で効く品を名指しする。
 * 両端の2点しか見ない（rankStable と同じ規則）。
 */
function weightSensitivityFor(
  items: Item[], cc: CompareInput['country'], province: ProvinceCode | null, base: Row[],
  method: PostalMethod | 'cheapest', storageDays: number,
): Record<string, WeightSensitivity> {
  const out: Record<string, WeightSensitivity> = {};
  const baseIds = cheapestIds(base);
  if (!baseIds.length) return out;
  const baseComparable = base.filter((r) => r.comparable).length;
  const baseBracket = bracketIds(base);

  for (const item of items) {
    const range = sensitivityRange(item);
    if (!range) continue;
    const at = (g: number) => {
      const rows = rowsFor({
        items: items.map((i) => (i.id === item.id ? { ...i, weightG: g } : i)),
        cc, province, assumeUnknownG: null, weightScale: 1, method, storageDays,
      });
      const ids = cheapestIds(rows);
      return {
        ids,
        bracket: bracketIds(rows),
        // 同額なら全部並べる。1つだけ名指しすると、並びの偶然で選んだ社を
        // 「その重量での最安」と言い切ることになる。
        label: ids.length
          ? andList(ids.map((id) => rows.find((r) => r.id === id)?.label ?? id))
          : null,
        shrank: rows.filter((r) => r.comparable).length < baseComparable,
      };
    };
    const lo = at(range[0]);
    const hi = at(range[1]);
    out[item.id] = {
      lowG: range[0],
      highG: range[1],
      winnerAtLow: lo.label,
      winnerAtHigh: hi.label,
      onlyPricedAtLow: lo.shrank,
      onlyPricedAtHigh: hi.shrank,
      // **判定基準はおすすめ枠の集合が変わるかどうか**（`rankStable` と同じ規則、
      // P1-2・判断2）。「1社でも重なれば動いていない」ではなく集合の完全一致を見る
      // ——枠は1位を含めて最大2社なので前者はほぼ常に成立してしまい判定にならない
      // （`bracketChanged` のコメント参照）。「比べられなくなった」端（枠が空）は
      // 「替わった」に数えない。
      decisive: [lo, hi].some((w) => bracketChanged(baseBracket, w.bracket)),
    };
  }
  return out;
}

/**
 * 入口の入力検査。**壊れた入力は投げる。空の結果を返さない。**
 *
 * どちらにするかの判断: 空の結果は「まだ何も入れていない」状態と画面で見分けが
 * 付かない。順位表が黙って消え、なぜ消えたのか誰にも分からないまま「比較できない」
 * とだけ読まれる。このツールの価値は数字の正しさだけなので、壊れた入力を黙って
 * 飲むのは「持っていない数字を 0 と書く」のと同じ種類の嘘になる。
 * 投げれば、テストと開発中に必ず気付く場所で止まる。
 *
 * ここに NaN / Infinity / qty=0 が来るのは利用者の操作ではなく呼び出し側の不具合である。
 * 計算機の UI は数値欄を toYen() に通し、価格の無い項目を compare() に渡さない
 * （src/components/compare/useCompare.ts）。つまりこれは利用者に見せるエラーではなく、
 * 我々が直すべき不具合の通報である。
 */
function assertUsableInput({ items, country, province, storageDays }: CompareInput): void {
  if (!COUNTRIES[country]) {
    throw new RangeError(`compare(): unknown destination country ${String(country)}`);
  }
  // 知らない州コードを黙って「未選択」に落とすと、代表値を「あなたの州の率」として
  // 出すことになる。呼び出し側の不具合なので、そこで止める。
  if (province != null && !CA_PROVINCES[province]) {
    throw new RangeError(`compare(): unknown province ${String(province)}`);
  }
  if (storageDays != null
    && (!Number.isInteger(storageDays) || storageDays < 0)) {
    throw new RangeError(`compare(): unusable storageDays: ${String(storageDays)}`);
  }
  for (const i of items) {
    const bad = (field: string, v: unknown) =>
      new RangeError(`compare(): item ${i.id} has an unusable ${field}: ${String(v)}`);
    // 価格は 0 を許す（送料込みの ¥0 出品ではなく、価格未取得の項目を
    // 呼び出し側が 0 で置いている場合がある）。負とNaNとInfinityは許さない。
    if (!Number.isFinite(i.priceYen) || i.priceYen < 0) throw bad('price', i.priceYen);
    // 0個の注文は存在しない。小数個も存在しない。
    if (!Number.isInteger(i.qty) || i.qty < 1) throw bad('quantity', i.qty);
    // 重量は null（不明＝段に落とす）か、正の有限値。0g の小包は無い。
    if (i.weightG != null && (!Number.isFinite(i.weightG) || i.weightG <= 0)) {
      throw bad('weight', i.weightG);
    }
    if (i.domesticShippingYen != null
      && (!Number.isFinite(i.domesticShippingYen) || i.domesticShippingYen < 0)) {
      throw bad('domestic shipping', i.domesticShippingYen);
    }
  }
}

export function compare(
  {
    items, country, province = null, method = DEFAULT_METHOD,
    storageDays = DEFAULT_STORAGE_DAYS,
  }: CompareInput,
): CompareResult {
  assertUsableInput({ items, country, province, storageDays });
  const currency = {
    code: COUNTRIES[country].ccy,
    rate: rateFor(COUNTRIES[country].ccy),
    asOf: RATES_AS_OF,
    fetchedOn: RATES_FETCHED_ON,
    sourceUrl: RATES_SOURCE_URL,
  };
  const empty: CompareResult = {
    rows: [], bands: null, rowTotalRange: null, rowDiffRange: null,
    rankStable: true, rankIndeterminate: false, rankStabilityNote: '', totalRangeYen: null,
    currency, hasUnknownWeight: false, weightSensitivity: {},
  };
  if (!items.length) return empty;

  const hasUnknownWeight = items.some((i) => i.weightG == null);

  if (!hasUnknownWeight) {
    const base = rowsFor({ items, cc: country, province, assumeUnknownG: null, weightScale: 1, method, storageDays });
    // 一番大きく一番弱い数字（重量）を 1/3・3倍 に振って、1位が動くか見る。
    // **5倍まで振らないのは、5倍にすると同梱後の重量が EMS 公表表（30kg）を
    // 超えて「順位が変わる」のではなく「比べられなくなる」ため。**
    // 比較可能な行が無くなった倍率は「動いた」ではなく「判定できない」として扱う。
    const baseComparable = base.filter((r) => r.comparable).length;
    const winners = [1 / 3, 3].map((sc) => {
      const rows = rowsFor({ items, cc: country, province, assumeUnknownG: null, weightScale: sc, method, storageDays });
      const comparable = rows.filter((r) => r.comparable);
      // **「最安が替わった」と「他が比べられなくなった」を混ぜない。**
      // 重い側では同梱する社が EMS 表を出て脱落する。残った1社は安いのではなく、
      // 値段が付く唯一の社というだけ。そう書かないと嘘になる。
      // 最安は**集合**で持つ（同額があるので）。おすすめ枠も同じ規則で集合で持つ。
      return { rows, ids: cheapestIds(rows), bracket: bracketIds(rows), shrank: comparable.length < baseComparable };
    });
    const baseBracket = bracketIds(base);
    // **「1位が動かないか」ではなく「おすすめ枠の集合が変わるか」で安定を判定する**
    // （P1-2、コーディネーター判断2、2026-09-11）。
    //
    // 最初の実装は「基準の枠のうち1社でも両端に残れば安定」だったが、**枠は1位を
    // 含めて最大2社なので5社中2社が枠に入る局面でも『誰か1人残る』は十分高い
    // 確率で成立し、判定として機能しなかった**（7カ国すべて `rankStable=true`
    // になった実測がそれ）。
    // 集合の完全一致に変える——枠の中で誰が下端最小かの入れ替わりは見ないが
    // （`bracketChanged` は `Set` で比べるので内部の順序は無視する）、
    // **顔ぶれが1社でも変われば `false`。**値段の付く行が消えた端（枠が空）だけは
    // 従来どおり「判定できない」として除外する。
    const first = base.find((r) => r.comparable);
    const changedAt = winners.filter((w) => bracketChanged(baseBracket, w.bracket));
    // **「判定不能」を「安定」に潰さない**（判断3）。全社が枠＋同等に収まっているなら、
    // 枠の集合はどう重量を動かしても「全員」のままなので `bracketChanged` は
    // 機械的に false を返す——それを「安定」と読んではいけない。
    const indeterminate = isIndeterminate(base);
    const stable = !indeterminate && changedAt.length === 0;
    const labelOf = (id: string) => base.find((r) => r.id === id)?.label ?? id;
    const outOfTable = winners.some((w) => w.ids.length === 0 || w.shrank);
    // 表の中央値や仮置きを「あなたがくれた重量」と呼ぶのは嘘。出どころを知らない
    // 呼び出し側（origin 未設定）と利用者入力だけ「you gave us」と言う。
    const ours = items.some((i) => i.weightOrigin === 'table' || i.weightOrigin === 'assumed');
    const basis = ours ? 'our weight estimate' : 'the weight you gave us';
    return {
      ...empty,
      rows: base,
      rankStable: stable,
      rankIndeterminate: indeterminate,
      // **「1位が動くか」ではなく「おすすめ枠の集合が動くか」を言う**（P1-2、判断2）。
      // `stable` はいま枠の完全一致で決まっているので、安定なら基準の枠がそのまま
      // 両端でも枠だと言い切ってよい（`dropped` は不安定側でだけ使う）。
      // **判定不能（判断3）は独立の分岐**——「動くか動かないか」の問いの前に、
      // そもそも1位が区別できていないことを言う。
      rankStabilityNote: !first
        // **選んでいる方式の名前を言う**（外部レビュー⑤-d）。以前はここが常に
        // 「EMS」と決め打っていたため、小形包装物など EMS 以外の方式を選んで
        // 全社が重量上限を超えたときも「No published EMS rate」と出ていた——
        // 実際には EMS を選んでいないのに、選んでいない方式の名前を注記に出す
        // 誤り。`ctx.method` が `'cheapest'`（利用者が方式を指定していない）
        // ときは特定の1方式を名指しできないので、方式を問わない言い方にする。
        ? `No published rate covers this parcel for ${
            method === 'cheapest'
              ? 'any shipping method we price'
              : (POSTAL_METHODS.find((s) => s.id === method)?.label ?? method)
          }, so we cannot compare these totals.`
        : indeterminate
          ? indeterminateNote(base.filter((r) => r.comparable))
        : stable
          ? `${andList(baseBracket.map(labelOf))} stay${baseBracket.length === 1 ? 's' : ''} in the`
            + ' recommended range even if we are off by 3x on weight.'
            + (outOfTable ? ' Beyond that the parcel leaves the published EMS table.' : '')
          // **不安定なときに「段の表を見ろ」と言ってはいけない。** 重量が分かって
          // いるときは段の表を出していないので、画面に無いものを指すことになる。
          // どの倍率で誰に替わるかは winners に持っているので、それを名指しする。
          : `The recommended range changes with the weight: ${
            ['a third of', 'three times']
              .map((word, i) => {
                const w = winners[i]!;
                const names = w.bracket.map((id) => w.rows.find((r) => r.id === id)?.label ?? id);
                const many = names.length > 1;
                const label = names.length === 0
                  ? 'no published EMS rate covers the parcel'
                  : w.shrank
                    // 「唯一値段が付く社」を「最安」と書かない。
                    ? `${andList(names)} ${many ? 'are' : 'is'} the only`
                      + ` ${many ? 'ones' : 'one'} we can still price`
                    : `${andList(names)} ${many ? 'are the recommended range' : 'is the recommended range'}`;
                return `at ${word} ${basis}, ${label}`;
              })
              .join('; ')
          }.`,
      hasUnknownWeight: false,
      weightSensitivity: weightSensitivityFor(items, country, province, base, method, storageDays),
    };
  }

  // 重量不明。EMS の段ごとに総額を出す。1つの数字を押し付けない。
  // **計算機の UI はもうここに来ない**（表に当たらなければ仮置きを入れて、そう書く）。
  // null を渡す呼び出し側のために残す。
  const bands: Band[] = [];
  for (const stepG of UNKNOWN_WEIGHT_STEPS_G) {
    const rows = rowsFor({ items, cc: country, province, assumeUnknownG: stepG, weightScale: 1, method, storageDays });
    if (!rows.length) continue;
    // 段ごとの最安も**集合**で持つ。同額のとき `rows[0]` を最安と呼ぶと、
    // 並びの偶然を段ごとの答えとして出すことになる。
    const ids = cheapestIds(rows);
    bands.push({
      stepG,
      label: formatStep(stepG),
      rows,
      cheapestRowIds: ids,
      cheapestServiceNames: ids.map((id) => rows.find((r) => r.id === id)?.label ?? id),
    });
  }
  if (!bands.length) return empty;

  const rowTotalRange: Record<string, [number, number | null]> = {};
  const rowDiffRange: Record<string, [number, number]> = {};
  for (const band of bands) {
    for (const r of band.rows) {
      const t = rowTotalRange[r.id];
      // **上端不明（`total.high === null`）はどの段でも1回でも出たら伝染させる**
      // （外部レビュー⑤-c）。以前はここが `r.total.low` だけで組まれていたので、
      // 段ごとに閉じているように見えても、この行自身の上限が不明という事実が
      // `rowTotalRange` を経由すると消えていた（`totalText` がそこから閉区間を
      // 描いていた）。
      rowTotalRange[r.id] = t
        ? [Math.min(t[0], r.total.low), (t[1] === null || r.total.high === null) ? null : Math.max(t[1], r.total.high)]
        : [r.total.low, r.total.high];
      const d = rowDiffRange[r.id];
      rowDiffRange[r.id] = d ? [Math.min(d[0], r.diff), Math.max(d[1], r.diff)] : [r.diff, r.diff];
    }
  }

  const first = bands[0]!;
  // **おすすめ枠の集合が全段で変わらないか**（P1-2、判断2）で「動かない」を判定する。
  // 「1社でも残れば安定」は枠が最大2社ある時点でも十分な確率で成立して判定として
  // 機能しない（`bracketChanged` のコメント参照）ので、集合の完全一致を見る。
  const firstBracket = bracketIds(first.rows);
  // 代表として真ん中の段を rows に据える。1つの数字を主役にはしないが、
  // 画面が何も出せないと困るので順序の代表は要る。判定不能の判定もこの代表段で見る
  // （段ごとに全社が重なっているかは変わりうるが、代表段を画面の主張の基準にする）。
  const mid = bands[Math.floor(bands.length / 2)]!;
  const indeterminate = isIndeterminate(mid.rows);
  const stable = !indeterminate && bands.every((b) => !bracketChanged(firstBracket, bracketIds(b.rows)));

  const totals = bands.flatMap((b) => b.rows.map((r) => r.total.low));

  return {
    rows: mid.rows,
    bands,
    rowTotalRange,
    rowDiffRange,
    rankStable: stable,
    rankIndeterminate: indeterminate,
    rankStabilityNote: indeterminate
      ? indeterminateNote(mid.rows.filter((r) => r.comparable))
      : stable
        ? `In the recommended range at every step from ${first.label} to ${bands[bands.length - 1]!.label}: `
          + `${andList(firstBracket.map((id) => first.rows.find((r) => r.id === id)?.label ?? id))}.`
        : 'The recommended range changes with weight — '
          + `${bands.map((b) => `${b.label}: ${andList(bracketIds(b.rows).map((id) => b.rows.find((r) => r.id === id)?.label ?? id))}`).join(', ')}.`,
    totalRangeYen: [Math.min(...totals), Math.max(...totals)],
    currency,
    hasUnknownWeight: true,
    // 重量が無い点がある間は、1点ずつ動かす基準の重量も無い。
    weightSensitivity: {},
  };
}
