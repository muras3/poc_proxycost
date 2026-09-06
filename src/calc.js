import { SERVICES, BUYEE_PLANS, depositSurcharge, packingFee } from './fees.js';

// 買い物 1 回ぶんの条件。
//   items: [{ price, domesticShipping }]  domesticShipping は「送料込み」出品なら 0
//   weightKg: まとめた後の梱包重量
//   internationalShipping: 国際送料（v1 はユーザー入力）
//   zenTier: ZenMarket の 1 点あたり手数料（出品元で 300〜800 と幅がある）
//   buyeePlan: 'lite' | 'inspection' | 'standard' | 'insured'

function line(label, amount, note) {
  return note ? { label, amount, note } : { label, amount };
}

function neokyo({ items, weightKg, internationalShipping }) {
  const s = SERVICES.neokyo;
  const goods = items.reduce((a, i) => a + i.price, 0);
  const service = s.serviceFeePerItem * items.length;
  const pack = packingFee(weightKg, s.packing);
  return {
    name: s.name,
    source: s.source,
    breakdown: [
      line('Item price', goods),
      line('Service fee', service, `¥350 x ${items.length} items (domestic shipping included)`),
      line('Packing', pack, weightKg <= 2 ? 'up to 2kg' : `2kg + ${Math.ceil(weightKg - 2)}kg`),
      line('International shipping', internationalShipping, 'carrier price, no markup'),
    ],
    total: goods + service + pack + internationalShipping,
  };
}

function zenmarket({ items, internationalShipping, zenTier }) {
  const s = SERVICES.zenmarket;
  const goods = items.reduce((a, i) => a + i.price, 0);
  const service = zenTier * items.length;
  const domestic = items.reduce((a, i) => a + (i.domesticShipping || 0), 0);
  // 入金手数料は商品代・手数料・送料を含めた入金額全体にかかる。
  const subtotal = goods + service + domestic + internationalShipping;
  const deposit = Math.round(depositSurcharge(subtotal, s.depositFeeRate));
  return {
    name: s.name,
    source: s.source,
    breakdown: [
      line('Item price', goods),
      line('Service fee', service, `¥${zenTier} x ${items.length} items`),
      line('Domestic shipping', domestic, 'charged separately'),
      line('International shipping', internationalShipping),
      line('Deposit fee', deposit, '3.5% of the total you top up'),
    ],
    total: subtotal + deposit,
  };
}

function buyee({ items, internationalShipping, buyeePlan = 'lite' }) {
  const s = SERVICES.buyee;
  const goods = items.reduce((a, i) => a + i.price, 0);
  const n = items.length;              // 注文ごとに個別処理される
  const service = s.serviceFeePerOrder * n;
  const domesticService = s.domesticServiceFeePerOrder * n;
  const domestic = items.reduce((a, i) => a + (i.domesticShipping || 0), 0);
  const plan = BUYEE_PLANS[buyeePlan] * n;
  return {
    name: s.name,
    source: s.source,
    breakdown: [
      line('Item price', goods),
      line('Purchase fee', service, `¥500 x ${n} orders`),
      line('Domestic delivery service fee', domesticService, `¥500 x ${n} orders — charged per order, not per parcel`),
      line('Domestic shipping', domestic),
      line('Guarantee plan', plan, buyeePlan),
      line('International shipping', internationalShipping),
    ],
    total: goods + service + domesticService + domestic + plan + internationalShipping,
  };
}

export function compare(input) {
  const zenTier = input.zenTier ?? 800;   // ヤフオク/メルカリは上限側
  const results = [
    neokyo(input),
    zenmarket({ ...input, zenTier }),
    buyee(input),
  ].sort((a, b) => a.total - b.total);
  const cheapest = results[0];
  return results.map((r) => ({ ...r, diffFromCheapest: r.total - cheapest.total }));
}
