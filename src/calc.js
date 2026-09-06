import {
  SERVICES, BUYEE_PLANS, depositSurcharge, packingFee, ASSUMED_DOMESTIC_SHIPPING,
} from './fees.js';

// 買い物 1 回ぶん。
//   items: [{ price, domesticShipping, freeShipping }]   1 行 = 1 出品
//   internationalShipping: 利用者の見積り。0 なら総額は「国際送料を除く」
//   overWeightKg: 2kg を超える場合の梱包重量（Neokyo の梱包超過に効く）
//   buyeePlan: 既定は lite（最も安い前提でも Buyee が最高額、という事実のほうが強い）

const domOf = (i) => (i.freeShipping ? 0 : (i.domesticShipping ?? ASSUMED_DOMESTIC_SHIPPING));

function line(label, amount, note, est) {
  return { label, amount, note, est: Boolean(est) };
}

export function compare({ items, internationalShipping = 0, overWeightKg = 0, buyeePlan = 'lite' }) {
  const n = items.length;
  if (!n) return [];

  const goods = items.reduce((a, i) => a + (i.price || 0), 0);
  const dom = items.reduce((a, i) => a + domOf(i), 0);
  const domIsEstimated = items.some((i) => !i.freeShipping && i.domesticShipping == null);
  const freeCount = items.filter((i) => i.freeShipping).length;
  const intl = internationalShipping || 0;
  const intlEst = intl > 0;

  const neo = SERVICES.neokyo;
  const pack = packingFee(overWeightKg || 1, neo.packing);
  const neokyo = {
    key: 'neokyo',
    name: neo.name,
    source: neo.source,
    why: `¥350 per item covers domestic shipping. Packing ¥${pack.toLocaleString('en-US')} is the only extra.`,
    lines: [
      line('Items', goods),
      line('Service fee', 350 * n, `¥350 × ${n} — domestic shipping included`),
      line('Packing', pack, overWeightKg > 2 ? `2kg + ${Math.ceil(overWeightKg - 2)}kg` : 'up to 2kg'),
      line('International shipping', intl, intlEst ? 'your estimate' : 'not included', intlEst),
    ],
  };

  const zen = SERVICES.zenmarket;
  const zenSub = goods + zen.serviceFeePerItem * n + dom + intl;
  const zenDeposit = Math.round(depositSurcharge(zenSub, zen.depositFeeRate));
  const zenmarket = {
    key: 'zenmarket',
    name: zen.name,
    source: zen.source,
    why: `Per-item fee is highest, but domestic shipping is free on ${freeCount} of ${n} item${n > 1 ? 's' : ''}. `
       + `The 3.5% deposit fee applies to the whole amount.`,
    lines: [
      line('Items', goods),
      line('Service fee', zen.serviceFeePerItem * n, `¥${zen.serviceFeePerItem} × ${n} — Yahoo! Auctions tier`),
      line('Domestic shipping', dom, 'seller’s rate, charged as-is', domIsEstimated),
      line('International shipping', intl, intlEst ? 'your estimate' : 'not included', intlEst),
      line('Deposit fee', zenDeposit, '3.5% of everything you top up'),
    ],
  };

  const bue = SERVICES.buyee;
  const plan = BUYEE_PLANS[buyeePlan] * n;
  const buyee = {
    key: 'buyee',
    name: bue.name,
    source: bue.source,
    why: `Every listing is a separate order: ¥1,000 in fixed fees per item before shipping.`,
    lines: [
      line('Items', goods),
      line('Purchase fee', bue.serviceFeePerOrder * n, `¥500 × ${n} order${n > 1 ? 's' : ''}`),
      line('Domestic delivery service fee', bue.domesticServiceFeePerOrder * n,
           `¥500 × ${n} order${n > 1 ? 's' : ''} — per order, not per parcel`),
      line('Domestic shipping', dom, 'seller’s rate', domIsEstimated),
      ...(plan ? [line('Guarantee plan', plan, buyeePlan)] : []),
      line('International shipping', intl, intlEst ? 'your estimate' : 'not included', intlEst),
    ],
  };

  const rows = [neokyo, zenmarket, buyee]
    .map((s) => ({ ...s, total: s.lines.reduce((a, l) => a + l.amount, 0) }))
    .sort((a, b) => a.total - b.total);

  return rows.map((r, i) => ({
    ...r,
    cheapest: i === 0,
    diff: r.total - rows[0].total,
    diffVs: rows[0].name,
    hasEstimate: r.lines.some((l) => l.est && l.amount > 0),
  }));
}
