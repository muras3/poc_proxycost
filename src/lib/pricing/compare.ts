import { COUNTRIES } from './countries';
import { EMS_ZONE, EMS_SOURCE_URL, EMS_MAX_GRAMS, UNKNOWN_WEIGHT_STEPS_G, emsFor, formatStep } from './ems';
import { rateFor, RATES_AS_OF, RATES_FETCHED_ON, RATES_SOURCE_URL } from './rates';
import { outboundFor } from './deeplink';
import { SERVICES, type Service } from './services';
import { ASSUMED_WEIGHT_RANGE_G } from './weights';
import type {
  Band, CompareInput, CompareResult, Item, Line, Row, Tier, WeightSensitivity,
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

interface Ctx {
  items: Item[];
  cc: CompareInput['country'];
  /** 重量不明の item にこの値（g／点）を仮置きする。null なら仮置きしない。 */
  assumeUnknownG: number | null;
  /** 既知の重量にこの倍率を掛ける（順位の頑健性チェック用）。 */
  weightScale: number;
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

// ── 受取国の税。未取得は null を返し、画面で「—」にする。0 と書かない。
function taxLines(
  cc: CompareInput['country'],
  a: { itemsYen: number; domYen: number; emsYen: number; units: number; parcels: number },
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
  const out: Line[] = [];

  let dutyYen = 0;
  if (c.flatDutyPerItem != null && declared <= c.dutyFreeLimit) {
    dutyYen = c.flatDutyPerItem * a.units * rate;
    out.push(L('duty', 'Duty', Math.round(dutyYen),
      `${c.ccy} ${c.flatDutyPerItem} flat × ${plural(a.units, 'item')}`, c.dutyTier, c.sourceUrl));
  } else if (declared <= c.dutyFreeLimit) {
    out.push(L('duty', 'Duty', 0, `under the ${c.ccy} ${c.dutyFreeLimit} threshold`, 'fixed', c.sourceUrl));
  } else if (c.dutyRate != null) {
    dutyYen = baseYen * c.dutyRate;
    out.push(L('duty', 'Duty', Math.round(dutyYen),
      `${(c.dutyRate * 100).toFixed(1)}% of the item price`, c.dutyTier, c.sourceUrl));
  } else {
    out.push(L('duty', 'Duty', null,
      `over the ${c.ccy} ${c.dutyFreeLimit} threshold — rate not included`, 'none', c.sourceUrl));
  }

  const vatLabel = cc === 'US' ? 'Sales tax'
    : cc === 'AU' || cc === 'SG' || cc === 'CA' ? 'GST' : 'VAT';
  if (c.vatRate == null) {
    out.push(L('vat', 'Sales tax / VAT', null, 'none at federal level', 'none', c.sourceUrl));
  } else if (c.vatFreeLimit && declared <= c.vatFreeLimit) {
    out.push(L('vat', vatLabel, 0, `under the ${c.ccy} ${c.vatFreeLimit} threshold`, 'fixed', c.sourceUrl));
  } else {
    const vatBase = c.base === 'CIF' ? cif + dutyYen : a.itemsYen + a.emsYen;
    out.push(L('vat', vatLabel, Math.round(vatBase * c.vatRate),
      `${(c.vatRate * 100).toFixed(0)}%`, 'fixed', c.sourceUrl));
  }

  if (c.notes.includes('province_tax_not_included')) {
    out.push(L('province-tax', 'Provincial tax', null,
      'depends on your province — not included', 'none', c.sourceUrl));
  }

  if (c.clearanceFeePerParcel == null) {
    out.push(L('clearance', 'Customs clearance fee', null, 'not included', 'none', c.sourceUrl));
  } else {
    out.push(L('clearance', 'Customs clearance fee',
      Math.round(c.clearanceFeePerParcel * rateFor(c.clearanceCcy) * a.parcels),
      `${c.clearanceCcy} ${c.clearanceFeePerParcel} × ${plural(a.parcels, 'parcel')}`,
      c.clearanceTier, c.sourceUrl));
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

function feeLines(svc: Service, ctx: Ctx, orders: number, units: number): Line[] {
  const f = svc.fee;
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
      `¥${f.perOrderYen} × ${plural(orders, 'order')}`, f.tier, svc.sourceUrl));
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

function buildRow(svc: Service, variant: Row['variant'], ctx: Ctx): Row | null {
  const items = ctx.items;
  const orders = items.length;
  const units = items.reduce((a, i) => a + i.qty, 0);
  const itemsYen = items.reduce((a, i) => a + i.priceYen * i.qty, 0);
  const zone = EMS_ZONE[ctx.cc];

  const weights = items.map((i) => itemWeightG(i, ctx));
  if (weights.some((w) => w == null)) return null; // 重量が決まらない。呼び出し側が段に落とす。
  const netPerItem = items.map((i, idx) => (weights[idx] as number) * i.qty);

  const dom = items.map(domesticFor);
  const domYen = dom.reduce((a, d) => a + d.yen, 0);
  const domEstimated = dom.some((d) => d.estimated);

  const split = variant === 'default' && svc.parcelDefault === 'per-order';
  const parcels = split ? orders : 1;
  const parcelGross = split
    ? netPerItem.map((g) => grossG(g))
    : [grossG(netPerItem.reduce((a, g) => a + g, 0))];

  // **表の外（30kg 超）の重量では料金を持っていない。丸めない。**
  // 以前は最上段に丸めていたので、20kg の小包を 15kg の料金で安く見せていた
  // （当時は表を 15kg までしか転記していなかった）。
  const each = parcelGross.map((g) => emsFor(g, zone));
  const overMax = each.some((e) => e.overMax);
  const emsYen: number | null = overMax
    ? null
    : Math.round(each.reduce((a, e) => a + (e.yen ?? 0), 0) * (1 + svc.emsMarkup));
  const stepLabel = overMax
    ? `over ${formatStep(EMS_MAX_GRAMS)} — no published rate`
    : split
      ? `${plural(parcels, 'parcel')}`
      : `1 parcel, ${formatStep(each[0]!.stepG!)} step`;

  const priceEstimated = items.some((i) => i.priceTier === 'estimate');
  const lines: Line[] = [
    L('items', 'Items', itemsYen, plural(units, 'item'),
      priceEstimated ? 'estimate' : 'fixed'),
  ];

  lines.push(...feeLines(svc, ctx, orders, units));

  lines.push(svc.domesticIncluded
    ? L('domestic-shipping', 'Domestic shipping', 0, 'included in the service fee', 'fixed', svc.sourceUrl)
    : L('domestic-shipping', 'Domestic shipping', domYen,
        domEstimated ? `~¥${ASSUMED_DOMESTIC_SHIPPING_YEN} each, paste the URL to know` : 'from each listing',
        domEstimated ? 'estimate' : 'fixed'));

  const pack = packingLine(svc, parcelGross);
  if (pack) lines.push(pack);

  lines.push(L('ems', `EMS to ${COUNTRIES[ctx.cc].name}`, emsYen,
    `zone ${zone}, ${stepLabel}`
    + (overMax ? '' : svc.emsMarkup === 0 ? ', published rate' : `, +${(svc.emsMarkup * 100).toFixed(0)}% markup`),
    overMax ? 'none' : 'estimate', EMS_SOURCE_URL));

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
  lines.push(...taxLines(ctx.cc, { itemsYen, domYen: domCharged, emsYen: emsYen ?? 0, units, parcels }));

  const total = sum(lines);
  const excluded = lines.filter((l) => l.amount == null).map((l) => l.label);
  const approximate = priceEstimated || lines.some((l) => l.tier === 'estimate');

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
    serviceName: svc.name,
    variant,
    label,
    tag,
    lines,
    total,
    optionalLines: svc.optional.map((o) =>
      L(o.key, o.label, o.amountYen, o.note, o.tier, svc.sourceUrl)),
    excluded,
    parcels,
    rank: 0,
    diff: 0,
    cheapest: false,
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
    comparable: emsYen != null,
    notComparableReason: emsYen == null
      ? `Japan Post publishes no EMS rate above ${formatStep(EMS_MAX_GRAMS)} in our table, so this total is missing its largest line`
      : null,
  };
}

/**
 * 総額の昇順で順位を付ける。**報酬額（paysUs）は一切参照しない。**
 * 比べられない行（国際送料が取れていない）は末尾に回し、順位も差額も付けない。
 * 最大の費目が欠けた総額を、揃っている総額と並べたら順位が嘘になる。
 */
function rank(rows: Row[]): Row[] {
  const byTotal = (a: Row, b: Row) =>
    a.total - b.total || a.serviceName.localeCompare(b.serviceName);
  const ok = rows.filter((r) => r.comparable).sort(byTotal);
  const notOk = rows.filter((r) => !r.comparable).sort(byTotal);
  const low = ok[0]?.total ?? 0;
  return [
    ...ok.map((r, i) => ({
      ...r, rank: i + 1, diff: r.total - low, cheapest: r.total === low,
    })),
    ...notOk.map((r, i) => ({
      ...r, rank: ok.length + i + 1, diff: 0, cheapest: false,
    })),
  ];
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
  items: Item[], cc: CompareInput['country'], base: Row[],
): Record<string, WeightSensitivity> {
  const out: Record<string, WeightSensitivity> = {};
  const first = base.find((r) => r.comparable);
  if (!first) return out;
  const baseComparable = base.filter((r) => r.comparable).length;

  for (const item of items) {
    const range = sensitivityRange(item);
    if (!range) continue;
    const at = (g: number) => {
      const rows = rowsFor({
        items: items.map((i) => (i.id === item.id ? { ...i, weightG: g } : i)),
        cc, assumeUnknownG: null, weightScale: 1,
      });
      const comparable = rows.filter((r) => r.comparable);
      return { winner: comparable[0] ?? null, shrank: comparable.length < baseComparable };
    };
    const lo = at(range[0]);
    const hi = at(range[1]);
    out[item.id] = {
      lowG: range[0],
      highG: range[1],
      winnerAtLow: lo.winner?.label ?? null,
      winnerAtHigh: hi.winner?.label ?? null,
      onlyPricedAtLow: lo.shrank,
      onlyPricedAtHigh: hi.shrank,
      // 「比べられなくなった」端は「替わった」に数えない（rankStable と同じ）。
      decisive: [lo, hi].some((w) => w.winner != null && w.winner.id !== first.id),
    };
  }
  return out;
}

export function compare({ items, country }: CompareInput): CompareResult {
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
    const base = rowsFor({ items, cc: country, assumeUnknownG: null, weightScale: 1 });
    // 一番大きく一番弱い数字（重量）を 1/3・3倍 に振って、1位が動くか見る。
    // **5倍まで振らないのは、5倍にすると同梱後の重量が EMS 公表表（30kg）を
    // 超えて「順位が変わる」のではなく「比べられなくなる」ため。**
    // 比較可能な行が無くなった倍率は「動いた」ではなく「判定できない」として扱う。
    const baseComparable = base.filter((r) => r.comparable).length;
    const winners = [1 / 3, 3].map((sc) => {
      const rows = rowsFor({ items, cc: country, assumeUnknownG: null, weightScale: sc });
      const comparable = rows.filter((r) => r.comparable);
      // **「最安が替わった」と「他が比べられなくなった」を混ぜない。**
      // 重い側では同梱する社が EMS 表を出て脱落する。残った1社は安いのではなく、
      // 値段が付く唯一の社というだけ。そう書かないと嘘になる。
      return { id: comparable[0]?.id ?? null, shrank: comparable.length < baseComparable };
    });
    const first = base.find((r) => r.comparable);
    const stable = !!first && winners.every((w) => w.id === null || w.id === first.id);
    const outOfTable = winners.some((w) => w.id === null || w.shrank);
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
          ? `${first.label} stays cheapest even if we are off by 3x on weight.`
            + (outOfTable ? ' Beyond that the parcel leaves the published EMS table.' : '')
          // **不安定なときに「段の表を見ろ」と言ってはいけない。** 重量が分かって
          // いるときは段の表を出していないので、画面に無いものを指すことになる。
          // どの倍率で誰に替わるかは winners に持っているので、それを名指しする。
          : `The cheapest option changes with the weight: ${
            ['a third of', 'three times']
              .map((word, i) => {
                const w = winners[i]!;
                const name = w.id == null ? null : base.find((r) => r.id === w.id)?.label ?? w.id;
                const label = name == null
                  ? 'no published EMS rate covers the parcel'
                  : w.shrank
                    // 「唯一値段が付く社」を「最安」と書かない。
                    ? `${name} is the only one we can still price`
                    : `${name} is cheapest`;
                return `at ${word} ${basis}, ${label}`;
              })
              .join('; ')
          }.`,
      hasUnknownWeight: false,
      weightSensitivity: weightSensitivityFor(items, country, base),
    };
  }

  // 重量不明。EMS の段ごとに総額を出す。1つの数字を押し付けない。
  // **計算機の UI はもうここに来ない**（表に当たらなければ仮置きを入れて、そう書く）。
  // null を渡す呼び出し側のために残す。
  const bands: Band[] = [];
  for (const stepG of UNKNOWN_WEIGHT_STEPS_G) {
    const rows = rowsFor({ items, cc: country, assumeUnknownG: stepG, weightScale: 1 });
    const top = rows[0];
    if (!top) continue;
    bands.push({
      stepG,
      label: formatStep(stepG),
      rows,
      cheapestRowId: top.id,
      cheapestServiceName: top.label,
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
  const stable = bands.every((b) => b.cheapestRowId === first.cheapestRowId);
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
      ? `Cheapest at every step from ${first.label} to ${bands[bands.length - 1]!.label}: ${first.cheapestServiceName}.`
      : `The cheapest option changes with weight — ${bands.map((b) => `${b.label}: ${b.cheapestServiceName}`).join(', ')}.`,
    totalRangeYen: [Math.min(...totals), Math.max(...totals)],
    currency,
    hasUnknownWeight: true,
    // 重量が無い点がある間は、1点ずつ動かす基準の重量も無い。
    weightSensitivity: {},
  };
}
