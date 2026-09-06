import { COUNTRIES } from './countries';
import { EMS_ZONE, EMS_SOURCE_URL, EMS_MAX_GRAMS, UNKNOWN_WEIGHT_STEPS_G, emsFor, formatStep } from './ems';
import { rateFor, RATES_AS_OF } from './rates';
import { outboundFor } from './deeplink';
import { SERVICES, type Service } from './services';
import type { Band, CompareInput, CompareResult, Item, Line, Row, Tier } from './types';

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
  const declared = baseYen / rate;
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

  // Jauce のベータ無料は出品元サイトで決まるので、点数を課金対象で割る。
  const chargeableUnits = ctx.items
    .filter((i) => !free.has(i.site))
    .reduce((a, i) => a + i.qty, 0);
  const chargeableYen = ctx.items
    .filter((i) => !free.has(i.site))
    .reduce((a, i) => a + i.priceYen * i.qty, 0);
  const freeUnits = units - chargeableUnits;

  if (f.perOrderYen != null) {
    out.push(L('purchase-fee', 'Purchase fee', f.perOrderYen * orders,
      `¥${f.perOrderYen} × ${plural(orders, 'order')}`, f.tier, svc.sourceUrl));
  }
  if (f.domesticServicePerOrderYen != null) {
    out.push(L('domestic-handling', 'Domestic handling',
      f.domesticServicePerOrderYen * orders,
      `¥${f.domesticServicePerOrderYen} × ${plural(orders, 'order')}`, f.tier, svc.sourceUrl));
  }
  if (f.perItemYen != null) {
    const note = `¥${f.perItemYen} × ${chargeableUnits}`
      + (svc.domesticIncluded ? ', domestic shipping incl.' : '')
      + (freeUnits > 0 ? ` (${freeUnits} free — Rakuten / Yahoo! Shopping beta)` : '');
    out.push(L('service-fee', 'Service fee', f.perItemYen * chargeableUnits, note,
      f.tier, svc.sourceUrl));
  }
  if (f.adValoremRate != null) {
    out.push(L('ad-valorem', 'Commission',
      Math.round(chargeableYen * f.adValoremRate),
      `${(f.adValoremRate * 100).toFixed(0)}% of the winning price`
      + (freeUnits > 0 ? ' (Rakuten / Yahoo! Shopping free in beta)' : ''),
      f.tier, svc.sourceUrl));
  }
  if (f.paymentInsideJapanYen != null) {
    out.push(L('payment-inside-jp', 'Payment fee inside Japan',
      f.paymentInsideJapanYen * orders,
      `¥${f.paymentInsideJapanYen} × ${plural(orders, 'order')} — per order or per item is not stated`,
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

  // **表の外（15kg 超）の重量では料金を持っていない。丸めない。**
  // 以前は最上段に丸めていたので、20kg の小包を 15kg の料金で安く見せていた。
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

export function compare({ items, country }: CompareInput): CompareResult {
  const currency = {
    code: COUNTRIES[country].ccy,
    rate: rateFor(COUNTRIES[country].ccy),
    asOf: RATES_AS_OF,
  };
  const empty: CompareResult = {
    rows: [], bands: null, rowTotalRange: null, rowDiffRange: null,
    rankStable: true, rankStabilityNote: '', totalRangeYen: null,
    currency, hasUnknownWeight: false,
  };
  if (!items.length) return empty;

  const hasUnknownWeight = items.some((i) => i.weightG == null);

  if (!hasUnknownWeight) {
    const base = rowsFor({ items, cc: country, assumeUnknownG: null, weightScale: 1 });
    // 一番大きく一番弱い数字（重量）を 1/3・3倍 に振って、1位が動くか見る。
    // **5倍まで振らないのは、5倍にすると同梱後の重量が EMS 公表表（15kg）を
    // 超えて「順位が変わる」のではなく「比べられなくなる」ため。**
    // 比較可能な行が無くなった倍率は「動いた」ではなく「判定できない」として扱う。
    const winners = [1 / 3, 3].map((sc) => {
      const rows = rowsFor({ items, cc: country, assumeUnknownG: null, weightScale: sc });
      return rows.find((r) => r.comparable)?.id ?? null;
    });
    const first = base.find((r) => r.comparable);
    const stable = !!first && winners.every((w) => w === null || w === first.id);
    const outOfTable = winners.some((w) => w === null);
    return {
      ...empty,
      rows: base,
      rankStable: stable,
      rankStabilityNote: !first
        ? 'No published EMS rate covers this parcel, so we cannot compare these totals.'
        : stable
          ? `${first.label} stays cheapest even if we are off by 3x on weight.`
            + (outOfTable ? ' Beyond that the parcel leaves the published EMS table.' : '')
          : 'The cheapest option changes if the weight estimate is off — see the weight steps.',
      hasUnknownWeight: false,
    };
  }

  // 重量不明。EMS の段ごとに総額を出す。1つの数字を押し付けない。
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
  };
}
