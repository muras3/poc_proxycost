import {
  CA_POPULATION_AS_OF, CA_POPULATION_SOURCE_URL, CA_PROVINCES,
  CA_PROVINCE_AVERAGE_RATE, CA_PROVINCE_SOURCE_URL, COUNTRIES,
} from './countries';
import { EMS_SOURCE_URL, UNKNOWN_WEIGHT_STEPS_G, formatStep } from './ems';
import {
  POSTAGE_SOURCE_URL, POSTAL_METHODS, markupYen, maxGramsFor, postageFor, zoneFor,
} from './postage';
import { rateFor, RATES_AS_OF, RATES_FETCHED_ON, RATES_SOURCE_URL } from './rates';
import { outboundFor } from './deeplink';
import { SERVICES, type OptionalFeeContext, type Service } from './services';
import { groupByShop, oneOrderPerItem, type ShopGrouping } from './shops';
import { ASSUMED_WEIGHT_RANGE_G } from './weights';
import { alcoholItems } from './restricted-goods';
import { US_HTS_SOURCE_URL, readUsDuty } from './us-duty';
import type {
  PostalMethod,
  Band, CompareInput, CompareResult, Item, Line, ProvinceCode, Row, Tier, WeightSensitivity,
} from './types';

// 出品ページに重量は書いていない。以下は仮定であって実測ではない。
export const ASSUMED_DOMESTIC_SHIPPING_YEN = 800; // 実勢 ¥150〜1,500 の中の仮定
export const PACKING_MULTIPLIER = 1.2;            // 梱包で増える分
export const PACKING_ADD_G = 300;                 // 緩衝材・外箱

const L = (
  key: string, label: string, amount: number | null, note: string,
  tier: Tier = 'fixed', sourceUrl: string | null = null,
): Line => ({ key, label, amount, note, tier, sourceUrl });

const sum = (lines: Line[]) => lines.reduce((a, l) => a + (l.amount ?? 0), 0);
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
}

function itemWeightG(item: Item, ctx: Ctx): number | null {
  if (item.weightG == null) return ctx.assumeUnknownG;
  return Math.max(1, Math.round(item.weightG * ctx.weightScale));
}

function domesticFor(item: Item): { yen: number; estimated: boolean } {
  if (item.freeShipping) return { yen: 0, estimated: false };
  if (item.domesticShippingYen != null) return { yen: item.domesticShippingYen, estimated: false };
  return { yen: ASSUMED_DOMESTIC_SHIPPING_YEN, estimated: true };
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
    out.push(L('duty', 'Duty', null,
      `over the ${c.ccy} ${c.dutyFreeLimit} threshold — rate not included`, 'none', c.sourceUrl));
  }

  const vatLabel = cc === 'US' ? 'Sales tax'
    : cc === 'AU' || cc === 'SG' || cc === 'CA' ? 'GST' : 'VAT';
  // AU（≤A$1,000）と SG（<S$400）は、**国境ではなく代行が販売時点で徴収する**帯がある。
  // その帯で税関側の行に金額を出すと、代行が取る分と二重に積むことになる。
  // 実際にいくら取られるかは社ごとに違うので、社ごとの行（prepaid-import-tax）が持つ。
  const sellerCollects = companyCollects
    || (c.sellerCollectsBelow != null && declaredPerParcel <= c.sellerCollectsBelow);
  if (c.vatRate == null) {
    out.push(L('vat', 'Sales tax / VAT', null, 'none at federal level', 'none', c.sourceUrl));
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
    const vatBase = c.base === 'CIF' ? cif + dutyYen : a.itemsYen + a.emsYen;
    out.push(L('vat', vatLabel, Math.round(vatBase * c.vatRate),
      `${(c.vatRate * 100).toFixed(0)}%`, 'fixed', c.sourceUrl));
  }

  // **カナダの州税は連邦 GST とは別の行。**合計（HST 13% など）ではなく州の取り分だけを
  // 出す——GST 5% の行が既に在るので、合計を出すと二重に積む。
  const caTaxed = c.vatFreeLimit == null || declaredPerParcel > c.vatFreeLimit;
  if (cc === 'CA') {
    out.push(provincialTaxLine(province, c.base === 'CIF' ? cif : a.itemsYen + a.emsYen, caTaxed));
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
    out.push(L('clearance', 'Customs clearance fee', null, 'not included', 'none', c.sourceUrl));
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
    out.push(L('excise', 'UK excise duty on alcohol — rate depends on the ABV', null,
      'The UK charges excise duty on alcohol sent from abroad at any value — neither the £135'
      + ' nor the £39 threshold exempts it. The rate is per litre of pure alcohol and depends'
      + ' on the strength, which no listing tells us.',
      'none', 'https://www.gov.uk/goods-sent-from-abroad/tax-and-duty'));
  }

  // 関税の事前納付（米国）。**「発生するが額を知らない」を画面に出すための行。**
  // 額を持っていないので null。0 と書けば「無料」という嘘になり、行ごと省けば
  // 「そんな費目は無い」という嘘になる。excluded に名前が載るのが目的。
  // 閾値は郵便物1個の内容品価格なので、個口に割ってから測る。割り切れない分は
  // **費目を出す側に倒す**（持っている情報を隠すより、余分に開示するほうが安全）。
  const dp = c.dutyPrepayment;
  if (dp && declaredPerParcel <= dp.upTo) {
    out.push(L('duty-prepayment', dp.label, null, dp.note, 'none', dp.sourceUrl));
  }
  return out;
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
    const note = (distinct.length > 1
      ? `${distinct.map((v) => `¥${v}`).join(' / ')} by shop, ${chargeableUnits} charged`
      : `¥${distinct[0] ?? f.perItemYen} × ${chargeableUnits}`)
      + (f.chargedPerDistinctItem && units > chargeableUnits + freeUnits
        ? ' (same item counted once)' : '')
      + (freeUnits > 0 ? ` (${freeUnits} free — Rakuten / Yahoo! Shopping beta)` : '');
    out.push(L('service-fee', 'Service fee', total, note, f.tier, svc.sourceUrl));
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

  const dom = items.map(domesticFor);
  const domYen = dom.reduce((a, d) => a + d.yen, 0);
  const domEstimated = dom.some((d) => d.estimated);

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
  // **その社が売っていない方式は値段が付かない。**2026-09-07 の実測で品揃えが社で
  // 大きく違うことが分かった（FROM JAPAN 5方式 / Jauce 2方式、Neokyo は小形包装物なし）。
  // 売っていない方式に公表額を当てると、使えない選択肢を最安に見せることになる。
  const priceAll = (m: PostalMethod): number | null => {
    const rate = svc.postage[m];
    if (!rate) return null;                        // その社はこの方式を売っていない
    if (rate.unavailableIn?.includes(ctx.cc)) return null;  // その国へは出していない
    const each = parcelGross.map((g) => postageFor(m, ctx.cc, g));
    if (each.some((e) => e == null)) return null;  // 1個口でも運べなければ使えない
    // **上乗せは個口ごとに足す。**1kg 段の定額なので、個口を分ければその数だけ乗る。
    return parcelGross.reduce(
      (a, g, i) => a + each[i]!.yen + markupYen(rate, ctx.cc, g), 0);
  };
  const method: PostalMethod = wanted === 'cheapest'
    // その社が売っていて、全個口を運べる方式の中で最安。個口が複数なら合計で比べる。
    ? (POSTAL_METHODS
        .map((s) => ({ id: s.id, yen: priceAll(s.id) }))
        .filter((x): x is { id: PostalMethod; yen: number } => x.yen != null)
        .sort((a, b) => a.yen - b.yen || a.id.localeCompare(b.id))[0]?.id ?? 'ems')
    : wanted;
  const spec = POSTAL_METHODS.find((s) => s.id === method)!;
  const rate = svc.postage[method];
  // **方式ごとの地帯を使う。**EMS は米国が第4地帯で、他方式は第3地帯。
  // ここが `POSTAL_ZONE` 固定だったので、米国の EMS 行は第4地帯の額を出しながら
  // 「zone 3」と書いていた。
  const zone = zoneFor(method, ctx.cc);

  // **表の外の重量では料金を持っていない。丸めない。**
  // 以前は最上段に丸めていたので、20kg の小包を 15kg の料金で安く見せていた。
  const each = parcelGross.map((g) => postageFor(method, ctx.cc, g));
  const overMax = each.some((e) => e == null);
  const shipYen: number | null = priceAll(method);
  // **「その社が売っていない」と「重すぎる」は違う理由なので、書き分ける。**
  const stepLabel = !rate
    ? `${svc.name} does not offer this method`
    : rate.unavailableIn?.includes(ctx.cc)
      ? `${svc.name} does not ship this method to ${COUNTRIES[ctx.cc].name}`
    : overMax
      ? `over ${formatStep(maxGramsFor(method, ctx.cc))} — outside this method's table`
      : split
        ? `${plural(parcels, 'parcel')}`
        : `1 parcel, ${formatStep(each[0]!.stepGrams)} step`;

  const priceEstimated = items.some((i) => i.priceTier === 'estimate');
  const lines: Line[] = [
    L('items', 'Items', itemsYen, plural(units, 'item'),
      priceEstimated ? 'estimate' : 'fixed'),
  ];

  lines.push(...feeLines(svc, ctx, grouping, units));

  lines.push(svc.domesticIncluded
    ? L('domestic-shipping', 'Domestic shipping', 0, 'included in the service fee', 'fixed', svc.sourceUrl)
    : L('domestic-shipping', 'Domestic shipping', domYen,
        domEstimated ? `~¥${ASSUMED_DOMESTIC_SHIPPING_YEN} each, paste the URL to know` : 'from each listing',
        domEstimated ? 'estimate' : 'fixed'));

  const pack = packingLine(svc, parcelGross);
  if (pack) lines.push(pack);

  // **EMS 行の tier は「料金の出どころ」だけを表す。**
  // 料金表は日本郵便の公表値（一次情報）で、そこに入れる重量は我々の推定である。
  // 2つを1つの tier に潰していたので `approximate` が常に true になり、画面の `~` が
  // 何も言わなくなっていた（docs/audit/logic.md C4）。重量の確度は Items 行の重量 tier
  // と `Row.approximate` が持つ。**段に入れた重量が梱包後の仮定（×1.2 + 300 g）である
  // ことは、この行の note に必ず書く**（tier からは読めないので、文字で書く）。
  const shipTier: Tier = shipYen == null ? 'none' : rate!.tier;
  const markupNote = shipYen == null ? ''
    : markupYen(rate!, ctx.cc, parcelGross[0]!) !== 0
      ? `, +¥${markupYen(rate!, ctx.cc, parcelGross[0]!).toLocaleString('en-US')}`
        + ` per parcel over the published rate`
    : ', published rate, no markup';
  // **速さと追跡を額と同じ行に出す。**船便は 3kg で EMS より ¥5,100 安いが 1〜3 か月かかる。
  // 額だけ出して日数を出さなければ、安いほうを選ばせる誤誘導になる。
  lines.push(L('intl-shipping', `${spec.label} to ${COUNTRIES[ctx.cc].name}`, shipYen,
    `zone ${zone}, ${stepLabel}`
    + (shipYen == null ? '' : ' (weight after our packing allowance)')
    + markupNote
    + (shipYen == null ? '' : ` — ${spec.days}${spec.tracked ? ', tracked' : ', no tracking'}`),
    shipTier, method === 'ems' ? EMS_SOURCE_URL : POSTAGE_SOURCE_URL));

  // 入金手数料は送金合計額に対する率なので gross-up。
  // ¥10,000 をチャージするには 10000/(1-0.035) = ¥10,363 が要る。
  if (svc.deposit) {
    const base = sum(lines) + svc.deposit.flatYen;
    const fee = svc.deposit.flatYen + (base / (1 - svc.deposit.rate) - base);
    lines.push(L('deposit', 'Deposit fee', Math.round(fee), svc.deposit.note,
      svc.deposit.tier, svc.sourceUrl));
  }

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

  const total = sum(lines);
  const excluded = lines.filter((l) => l.amount == null).map((l) => l.label);
  // **重量は費目ではないので、行の tier には現れない。** EMS 行が「公表料金」になった今、
  // 重量が推定であることをここで別に数えないと、推定の重量で引いた総額が確定値の顔をする。
  // 重量表のライン・仮置き・利用者の入力はすべて tier 'estimate'（weights.ts）なので、
  // ここが false になるのは呼び出し側が「この重量は確かだ」と言った入力だけ。
  const weightEstimated = items.some((i) => i.weightTier !== 'fixed');
  const approximate = priceEstimated || weightEstimated || lines.some((l) => l.tier === 'estimate');

  const optionalCtx: OptionalFeeContext = {
    parcels,
    parcelGrossG: parcelGross,
    units,
    packingYen: pack?.amount ?? 0,
  };

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
    // 任意費目。**総額には入れない。** 個口・重量・点数で決まる費目は、この行の実際の
    // 姿から実額にする（「per parcel」と書いてあるものを1個口ぶんだけ出したら、
    // 個口が分かれる行で嘘になる）。額が公表されていない費目は null のまま。
    optionalLines: svc.optional.map((o) => L(
      o.key, o.label,
      o.amountFor ? o.amountFor(optionalCtx) : o.amountYen,
      // **額の出どころが社のページでない費目は、そちらを指す。**
      // 輸出申告代行手数料は日本郵便の額で、社は取次いでいるだけ。
      o.note, o.tier, o.sourceUrl ?? svc.sourceUrl,
    )),
    excluded,
    parcels,
    rank: 0,
    diff: 0,
    cheapest: false,
    // rank() が総額を見てから付ける。ここでは何も主張しない。
    tied: false,
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
      : !rate
        ? `${svc.name} does not sell ${spec.label}, so there is no total to compare`
      : rate.unavailableIn?.includes(ctx.cc)
        ? `${svc.name} does not ship ${spec.label} to ${COUNTRIES[ctx.cc].name}`
          + ' — its options there are couriers, which we do not price'
        : `${spec.label} has no published rate above ${formatStep(maxGramsFor(method, ctx.cc))}`
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
function rank(rows: Row[]): Row[] {
  // 第2キーを持たない。同額の並びは入力順（SERVICES の宣言順）のまま残る
  // ——Array#sort は安定なので。その並びに意味は無く、意味が無いことは画面が書く。
  const byTotal = (a: Row, b: Row) => a.total - b.total;
  const ok = rows.filter((r) => r.comparable).sort(byTotal);
  const notOk = rows.filter((r) => !r.comparable).sort(byTotal);
  const low = ok[0]?.total ?? 0;
  return [
    ...ok.map((r) => ({
      ...r,
      rank: ok.filter((o) => o.total < r.total).length + 1,
      diff: r.total - low,
      cheapest: r.total === low,
      tied: ok.some((o) => o.id !== r.id && o.total === r.total),
    })),
    // 比べられない行の総額は最大の費目を欠いている。同額でも「並んだ」ことにならない
    // ので tied は立てない（比べていないものを「同じ」と書かない）。
    ...notOk.map((r, i) => ({
      ...r, rank: ok.length + i + 1, diff: 0, cheapest: false, tied: false,
    })),
  ];
}

/**
 * 比較可能な行のうち総額が最小の行の id。**同額なら複数返る。**
 * 「1位が動いたか」を `rows[0]` で見ると、同額の中でどれが先頭に来たかという
 * 並びの偶然を「順位が動いた」と読んでしまう。集合で見る。
 */
function cheapestIds(rows: Row[]): string[] {
  const ok = rows.filter((r) => r.comparable);
  if (!ok.length) return [];
  const low = Math.min(...ok.map((r) => r.total));
  return ok.filter((r) => r.total === low).map((r) => r.id);
}

/** 'A' / 'A and B' / 'A, B and C'。英語UIにそのまま出る。 */
export function andList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
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
  method: PostalMethod | 'cheapest',
): Record<string, WeightSensitivity> {
  const out: Record<string, WeightSensitivity> = {};
  const baseIds = cheapestIds(base);
  if (!baseIds.length) return out;
  const baseComparable = base.filter((r) => r.comparable).length;

  for (const item of items) {
    const range = sensitivityRange(item);
    if (!range) continue;
    const at = (g: number) => {
      const rows = rowsFor({
        items: items.map((i) => (i.id === item.id ? { ...i, weightG: g } : i)),
        cc, province, assumeUnknownG: null, weightScale: 1, method,
      });
      const ids = cheapestIds(rows);
      return {
        ids,
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
      // 「比べられなくなった」端は「替わった」に数えない（rankStable と同じ）。
      // **同額は「替わった」ではない。**基準の重量で最安だった行が1つでも
      // その端で最安のままなら、選ぶべき社は変わっていない。
      decisive: [lo, hi].some(
        (w) => w.ids.length > 0 && !w.ids.some((id) => baseIds.includes(id))),
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
function assertUsableInput({ items, country, province }: CompareInput): void {
  if (!COUNTRIES[country]) {
    throw new RangeError(`compare(): unknown destination country ${String(country)}`);
  }
  // 知らない州コードを黙って「未選択」に落とすと、代表値を「あなたの州の率」として
  // 出すことになる。呼び出し側の不具合なので、そこで止める。
  if (province != null && !CA_PROVINCES[province]) {
    throw new RangeError(`compare(): unknown province ${String(province)}`);
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
  { items, country, province = null, method = DEFAULT_METHOD }: CompareInput,
): CompareResult {
  assertUsableInput({ items, country, province });
  const currency = {
    code: COUNTRIES[country].ccy,
    rate: rateFor(COUNTRIES[country].ccy),
    asOf: RATES_AS_OF,
    fetchedOn: RATES_FETCHED_ON,
    sourceUrl: RATES_SOURCE_URL,
  };
  const empty: CompareResult = {
    rows: [], bands: null, rowTotalRange: null, rowDiffRange: null,
    rankStable: true, rankStabilityNote: '', totalRangeYen: null,
    currency, hasUnknownWeight: false, weightSensitivity: {},
  };
  if (!items.length) return empty;

  const hasUnknownWeight = items.some((i) => i.weightG == null);

  if (!hasUnknownWeight) {
    const base = rowsFor({ items, cc: country, province, assumeUnknownG: null, weightScale: 1, method });
    // 一番大きく一番弱い数字（重量）を 1/3・3倍 に振って、1位が動くか見る。
    // **5倍まで振らないのは、5倍にすると同梱後の重量が EMS 公表表（30kg）を
    // 超えて「順位が変わる」のではなく「比べられなくなる」ため。**
    // 比較可能な行が無くなった倍率は「動いた」ではなく「判定できない」として扱う。
    const baseComparable = base.filter((r) => r.comparable).length;
    const winners = [1 / 3, 3].map((sc) => {
      const rows = rowsFor({ items, cc: country, province, assumeUnknownG: null, weightScale: sc, method });
      const comparable = rows.filter((r) => r.comparable);
      // **「最安が替わった」と「他が比べられなくなった」を混ぜない。**
      // 重い側では同梱する社が EMS 表を出て脱落する。残った1社は安いのではなく、
      // 値段が付く唯一の社というだけ。そう書かないと嘘になる。
      // 最安は**集合**で持つ（同額があるので）。
      return { rows, ids: cheapestIds(rows), shrank: comparable.length < baseComparable };
    });
    const baseIds = cheapestIds(base);
    // 「1位が動かない」＝ **基準の重量で最安だった社のうち、両端でも最安のままの社が
    // 1つでも在る**こと。同額の中でどれが先頭に来たかは並びの偶然なので、
    // それで判定すると動いていない順位が動いたことになる。
    // 値段の付く行が消えた端（ids が空）は「判定できない」として飛ばす（従来どおり）。
    const holds = winners.reduce(
      (keep, w) => (w.ids.length === 0 ? keep : keep.filter((id) => w.ids.includes(id))),
      baseIds);
    const first = base.find((r) => r.comparable);
    const stable = holds.length > 0;
    // 基準で同額だったのに片端で落ちた社は、黙って消さずに名指しする。
    const dropped = baseIds.filter((id) => !holds.includes(id));
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
      rankStabilityNote: !first
        ? 'No published EMS rate covers this parcel, so we cannot compare these totals.'
        : stable
          ? `${andList(holds.map(labelOf))} stay${holds.length === 1 ? 's' : ''} cheapest`
            + ' even if we are off by 3x on weight.'
            + (dropped.length
              ? ` ${andList(dropped.map(labelOf))} ${dropped.length === 1 ? 'ties' : 'tie'}`
                + ' with it at this weight but not at both ends.'
              : '')
            + (outOfTable ? ' Beyond that the parcel leaves the published EMS table.' : '')
          // **不安定なときに「段の表を見ろ」と言ってはいけない。** 重量が分かって
          // いるときは段の表を出していないので、画面に無いものを指すことになる。
          // どの倍率で誰に替わるかは winners に持っているので、それを名指しする。
          : `The cheapest option changes with the weight: ${
            ['a third of', 'three times']
              .map((word, i) => {
                const w = winners[i]!;
                const names = w.ids.map((id) => w.rows.find((r) => r.id === id)?.label ?? id);
                const many = names.length > 1;
                const label = names.length === 0
                  ? 'no published EMS rate covers the parcel'
                  : w.shrank
                    // 「唯一値段が付く社」を「最安」と書かない。
                    ? `${andList(names)} ${many ? 'are' : 'is'} the only`
                      + ` ${many ? 'ones' : 'one'} we can still price`
                    : `${andList(names)} ${many ? 'are tied cheapest' : 'is cheapest'}`;
                return `at ${word} ${basis}, ${label}`;
              })
              .join('; ')
          }.`,
      hasUnknownWeight: false,
      weightSensitivity: weightSensitivityFor(items, country, province, base, method),
    };
  }

  // 重量不明。EMS の段ごとに総額を出す。1つの数字を押し付けない。
  // **計算機の UI はもうここに来ない**（表に当たらなければ仮置きを入れて、そう書く）。
  // null を渡す呼び出し側のために残す。
  const bands: Band[] = [];
  for (const stepG of UNKNOWN_WEIGHT_STEPS_G) {
    const rows = rowsFor({ items, cc: country, province, assumeUnknownG: stepG, weightScale: 1, method });
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

  const rowTotalRange: Record<string, [number, number]> = {};
  const rowDiffRange: Record<string, [number, number]> = {};
  for (const band of bands) {
    for (const r of band.rows) {
      const t = rowTotalRange[r.id];
      rowTotalRange[r.id] = t ? [Math.min(t[0], r.total), Math.max(t[1], r.total)] : [r.total, r.total];
      const d = rowDiffRange[r.id];
      rowDiffRange[r.id] = d ? [Math.min(d[0], r.diff), Math.max(d[1], r.diff)] : [r.diff, r.diff];
    }
  }

  const first = bands[0]!;
  // 全段で最安のままの行が1つでも在れば「動かない」。同額は「動いた」ではない。
  const holdsAcrossBands = bands.reduce<string[]>(
    (keep, b) => keep.filter((id) => b.cheapestRowIds.includes(id)),
    first.cheapestRowIds);
  const stable = holdsAcrossBands.length > 0;
  const totals = bands.flatMap((b) => b.rows.map((r) => r.total));
  // 代表として真ん中の段を rows に据える。1つの数字を主役にはしないが、
  // 画面が何も出せないと困るので順序の代表は要る。
  const mid = bands[Math.floor(bands.length / 2)]!;

  return {
    rows: mid.rows,
    bands,
    rowTotalRange,
    rowDiffRange,
    rankStable: stable,
    rankStabilityNote: stable
      ? `Cheapest at every step from ${first.label} to ${bands[bands.length - 1]!.label}: `
        + `${andList(holdsAcrossBands.map((id) => first.rows.find((r) => r.id === id)?.label ?? id))}.`
      : 'The cheapest option changes with weight — '
        + `${bands.map((b) => `${b.label}: ${andList(b.cheapestServiceNames)}`).join(', ')}.`,
    totalRangeYen: [Math.min(...totals), Math.max(...totals)],
    currency,
    hasUnknownWeight: true,
    // 重量が無い点がある間は、1点ずつ動かす基準の重量も無い。
    weightSensitivity: {},
  };
}
