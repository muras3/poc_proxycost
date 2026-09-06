import {
  SERVICES, COUNTRIES, RATES, EMS_ZONE, EMS_TABLE, emsStepIndex, emsAt,
  ASSUMED_DOMESTIC_SHIPPING, PACKING_MULTIPLIER, PACKING_ADD_G,
} from './data.js';

// tier: 'fixed' 公開料金表 / 'estimate' 我々の仮定・利用者の値 / 'unverified' 二次情報 / 'none' 未取得
const L = (label, amount, note, tier = 'fixed') => ({ label, amount, note, tier });

const domOf = (i) => (i.freeShipping ? 0 : (i.domesticShipping ?? ASSUMED_DOMESTIC_SHIPPING));
const grossG = (g) => Math.round(g * PACKING_MULTIPLIER + PACKING_ADD_G);

// 総重量から EMS の段を引く。step オフセットで1段上/下を試せる（順位の安定性チェック用）
function ems(grams, zone, stepOffset = 0) {
  const i = Math.min(EMS_TABLE.length - 1, Math.max(0, emsStepIndex(grams) + stepOffset));
  return { yen: emsAt(i, zone), stepG: EMS_TABLE[i][0] };
}

// 受取国の税。未取得は null を返し、画面で「—」にする。0 と書かない。
function taxOf(cc, { itemsYen, domYen, emsYen, n, parcels }) {
  const c = COUNTRIES[cc];
  const rate = RATES[c.ccy];                      // 1通貨あたりの円
  const cif = itemsYen + domYen + emsYen;
  const baseYen = c.base === 'CIF' ? cif : itemsYen;
  const declared = baseYen / rate;                // 現地通貨での申告額
  const out = [];

  // 関税
  let dutyYen = 0;
  if (c.flatDutyPerItem != null && declared <= c.dutyFreeLimit) {
    dutyYen = c.flatDutyPerItem * n * rate;
    out.push(L('Duty', Math.round(dutyYen),
      `${c.ccy} ${c.flatDutyPerItem} flat × ${n} item${n > 1 ? 's' : ''}`, 'fixed'));
  } else if (declared <= c.dutyFreeLimit) {
    out.push(L('Duty', 0, `under the ${c.ccy} ${c.dutyFreeLimit} threshold`, 'fixed'));
  } else if (c.dutyRate != null) {
    dutyYen = baseYen * c.dutyRate;
    out.push(L('Duty', Math.round(dutyYen), `${(c.dutyRate * 100).toFixed(1)}% of the item price`,
      c.dutyVerified ? 'fixed' : 'unverified'));
  } else {
    out.push(L('Duty', null, `over the ${c.ccy} ${c.dutyFreeLimit} threshold — rate not included`, 'none'));
  }

  // VAT / GST
  if (c.vatRate == null) {
    out.push(L('Sales tax / VAT', null, 'none at federal level', 'none'));
  } else if (c.vatFreeLimit && declared <= c.vatFreeLimit) {
    out.push(L('Sales tax / VAT', 0, `under the ${c.ccy} ${c.vatFreeLimit} threshold`, 'fixed'));
  } else {
    const vatBase = c.base === 'CIF' ? cif + dutyYen : itemsYen + emsYen;
    out.push(L(cc === 'US' ? 'Sales tax' : cc === 'AU' || cc === 'SG' || cc === 'CA' ? 'GST' : 'VAT',
      Math.round(vatBase * c.vatRate), `${(c.vatRate * 100).toFixed(0)}%`, 'fixed'));
  }
  if (c.notes.includes('province_tax_not_included')) {
    out.push(L('Provincial tax', null, 'depends on your province — not included', 'none'));
  }

  // 通関手数料は小包ごと
  if (c.clearanceFeePerParcel == null) {
    out.push(L('Customs clearance fee', null, 'not included', 'none'));
  } else {
    out.push(L('Customs clearance fee',
      Math.round(c.clearanceFeePerParcel * RATES[c.clearanceCcy] * parcels),
      `${c.clearanceCcy} ${c.clearanceFeePerParcel} × ${parcels} parcel${parcels > 1 ? 's' : ''}`,
      c.clearanceVerified ? 'fixed' : 'unverified'));
  }
  return out;
}

function buildRow(svc, variant, { items, cc, stepOffset }) {
  const n = items.length;
  const zone = EMS_ZONE[cc];
  const itemsYen = items.reduce((a, i) => a + (i.price || 0), 0);
  const domYen = items.reduce((a, i) => a + domOf(i), 0);
  const domEst = items.some((i) => !i.freeShipping && i.domesticShipping == null);
  const split = variant === 'default' && svc.parcelDefault === 'per-order';
  const parcels = split ? n : 1;

  let emsYen = 0, stepLabel = '';
  if (split) {
    const each = items.map((i) => ems(grossG(i.weight), zone, stepOffset));
    emsYen = each.reduce((a, e) => a + e.yen, 0);
    stepLabel = `${n} parcels`;
  } else {
    const e = ems(grossG(items.reduce((a, i) => a + i.weight, 0)), zone, stepOffset);
    emsYen = e.yen; stepLabel = `1 parcel, ~${(e.stepG / 1000).toFixed(1)} kg`;
  }

  const lines = [L('Items', itemsYen, `${n} item${n > 1 ? 's' : ''}`)];

  if (svc.perOrder != null) {
    lines.push(L('Purchase fee', svc.perOrder * n, `¥${svc.perOrder} × ${n} order${n > 1 ? 's' : ''}`));
    lines.push(L('Domestic handling', svc.domesticServicePerOrder * n,
      `¥${svc.domesticServicePerOrder} × ${n} order${n > 1 ? 's' : ''} — charged per order`));
  } else {
    lines.push(L('Service fee', svc.perItem * n, `¥${svc.perItem} × ${n}`
      + (svc.domesticIncluded ? ' — domestic shipping included' : ''),
      svc.perItemVerified === false ? 'unverified' : 'fixed'));
  }

  lines.push(svc.domesticIncluded
    ? L('Domestic shipping', 0, 'included in the service fee')
    : L('Domestic shipping', domYen, domEst ? `~¥${ASSUMED_DOMESTIC_SHIPPING} each where the buyer pays`
        : 'from each listing', domEst ? 'estimate' : 'fixed'));

  if (svc.packing) {
    const gross = grossG(items.reduce((a, i) => a + i.weight, 0));
    const over = Math.max(0, Math.ceil((gross - 2000) / 1000));
    lines.push(L('Packing', svc.packing.base + svc.packing.perExtraKg * over,
      over ? `¥${svc.packing.base} + ¥${svc.packing.perExtraKg} × ${over} kg over 2 kg` : 'up to 2 kg'));
  }

  lines.push(L(`EMS to ${COUNTRIES[cc].name}`, emsYen, `zone ${zone}, ${stepLabel}`, 'estimate'));

  if (svc.depositRate) {
    const base = lines.reduce((a, l) => a + (l.amount || 0), 0);
    lines.push(L('Deposit fee', Math.round(base / (1 - svc.depositRate) - base),
      `${(svc.depositRate * 100).toFixed(1)}% of everything you top up`));
  }

  lines.push(...taxOf(cc, { itemsYen, domYen, emsYen, n, parcels }));

  const total = lines.reduce((a, l) => a + (l.amount || 0), 0);
  const label = variant === 'consolidated' ? `${svc.name}, consolidated`
              : variant === 'default' ? `${svc.name}, default` : svc.name;
  const tag = split ? `${n} orders · ${n} parcels`
            : `${n} item${n > 1 ? 's' : ''} · 1 parcel`
              + (svc.parcelVerified ? '' : ' assumed')
              + (variant === 'consolidated' ? ' · you must request this' : '');
  return { id: svc.id + (variant ? ':' + variant : ''), svc, variant, label, tag, lines, total, parcels };
}

export function compare({ items, country = 'US', stepOffset = 0 }) {
  if (!items.length) return [];
  const n = items.length;
  const rows = [];
  for (const svc of SERVICES) {
    if (svc.parcelDefault === 'per-order' && n > 1) {
      rows.push(buildRow(svc, 'consolidated', { items, cc: country, stepOffset }));
      rows.push(buildRow(svc, 'default', { items, cc: country, stepOffset }));
    } else {
      rows.push(buildRow(svc, null, { items, cc: country, stepOffset }));
    }
  }
  rows.sort((a, b) => a.total - b.total || a.svc.name.localeCompare(b.svc.name));
  const low = rows[0].total;
  return rows.map((r) => ({ ...r, cheapest: r.total === low, diff: r.total - low }));
}

// 一番大きく一番弱い数字（重量）を1段動かして、順位が変わるか見る。
export function stability({ items, country }) {
  const base = compare({ items, country })[0];
  const up = compare({ items, country, stepOffset: 1 })[0];
  const down = compare({ items, country, stepOffset: -1 })[0];
  const stable = base.id === up.id && base.id === down.id;
  return { stable, base: base.label, ifHeavier: up.label, ifLighter: down.label };
}
