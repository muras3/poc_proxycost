import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compare } from '../src/calc.js';
import { depositSurcharge, packingFee } from '../src/fees.js';

const items = (n, price, dom) => Array.from({ length: n }, () => ({ price, domesticShipping: dom }));
const by = (rows, name) => rows.find((r) => r.name === name);

test('入金手数料は送金合計額ベース（実際に入る額の 3.5% ではない）', () => {
  // 公式の説明どおり、net 1000 を入れるには 1000/0.965 を送る必要がある
  assert.equal(Math.round(depositSurcharge(1000, 0.035)), 36);
  assert.ok(depositSurcharge(1000, 0.035) > 35);   // 素朴な 3.5% では足りない
});

test('梱包料は 2kg を超えると 1kg ごとに切り上げ', () => {
  const p = { baseUpTo2kg: 500, perExtraKg: 150 };
  assert.equal(packingFee(2, p), 500);
  assert.equal(packingFee(2.1, p), 650);
  assert.equal(packingFee(3, p), 650);
  assert.equal(packingFee(4.5, p), 500 + 150 * 3);
});

test('1 点だけなら差はほとんど出ない（作る価値が無い領域）', () => {
  const rows = compare({ items: items(1, 3000, 500), weightKg: 1, internationalShipping: 2200 });
  const spread = rows[rows.length - 1].total - rows[0].total;
  assert.ok(spread < 1000, `1 点での差が ${spread} 円と大きすぎる`);
});

test('点数が増えるほど差が開く — Buyee の注文ごと課金が効く', () => {
  const three = compare({ items: items(3, 3000, 500), weightKg: 2, internationalShipping: 3000 });
  const ten = compare({ items: items(10, 3000, 500), weightKg: 2, internationalShipping: 5000 });
  const spread = (r) => r[r.length - 1].total - r[0].total;
  assert.ok(spread(ten) > spread(three) * 3, '点数に対して差が広がっていない');
  assert.equal(three[0].name, 'Neokyo');
});

test('国内送料が全部無料なら勝者が入れ替わる（静的な記事では答えが出せない理由）', () => {
  const paid = compare({ items: items(3, 3000, 500), weightKg: 2, internationalShipping: 3000, zenTier: 300 });
  const free = compare({ items: items(3, 3000, 0), weightKg: 2, internationalShipping: 3000, zenTier: 300 });
  assert.equal(paid[0].name, 'Neokyo');
  assert.equal(free[0].name, 'ZenMarket');
});

test('Buyee の国内配送サービス料は注文ごとに増える', () => {
  const one = by(compare({ items: items(1, 3000, 0), weightKg: 1, internationalShipping: 2000 }), 'Buyee');
  const five = by(compare({ items: items(5, 3000, 0), weightKg: 2, internationalShipping: 2000 }), 'Buyee');
  const fee = (r) => r.breakdown.find((b) => b.label === 'Domestic delivery service fee').amount;
  assert.equal(fee(one), 500);
  assert.equal(fee(five), 2500);
});

test('内訳の合計は総額と一致する', () => {
  for (const r of compare({ items: items(4, 5000, 300), weightKg: 3.2, internationalShipping: 4100 })) {
    const sum = r.breakdown.reduce((a, b) => a + b.amount, 0);
    assert.equal(sum, r.total, `${r.name} の内訳が総額と合わない`);
  }
});
