import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compare } from '../src/calc.js';
import { depositSurcharge, packingFee, ASSUMED_DOMESTIC_SHIPPING } from '../src/fees.js';

const items = (n, price, opts = {}) =>
  Array.from({ length: n }, () => ({ price, ...opts }));
const by = (rows, name) => rows.find((r) => r.name === name);
const amount = (row, label) => row.lines.find((l) => l.label === label).amount;

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

test('Buyee の固定費は注文ごとに増える — 点数がそのまま注文数', () => {
  const one = by(compare({ items: items(1, 3000) }), 'Buyee');
  const five = by(compare({ items: items(5, 3000) }), 'Buyee');
  assert.equal(amount(one, 'Purchase fee'), 500);
  assert.equal(amount(five, 'Purchase fee'), 2500);
  assert.equal(amount(one, 'Domestic delivery service fee'), 500);
  assert.equal(amount(five, 'Domestic delivery service fee'), 2500);
});

test('内訳の合計は総額と一致する', () => {
  for (const r of compare({ items: items(4, 5000), internationalShipping: 4100, overWeightKg: 3.2 })) {
    const sum = r.lines.reduce((a, l) => a + l.amount, 0);
    assert.equal(sum, r.total, `${r.name} の内訳が総額と合わない`);
  }
});

test('国内送料は、指定が無ければ仮定値が入り est. として立つ', () => {
  const est = by(compare({ items: items(2, 3000) }), 'Buyee');
  assert.equal(amount(est, 'Domestic shipping'), ASSUMED_DOMESTIC_SHIPPING * 2);
  assert.ok(est.lines.find((l) => l.label === 'Domestic shipping').est,
    '出典の無い仮定値が est. として立っていない');

  const given = by(compare({ items: items(2, 3000, { domesticShipping: 300 }) }), 'Buyee');
  assert.equal(amount(given, 'Domestic shipping'), 600);
  assert.equal(given.lines.find((l) => l.label === 'Domestic shipping').est, false);
});

test('送料込み出品なら国内送料は 0 になる', () => {
  const free = by(compare({ items: items(3, 3000, { freeShipping: true }) }), 'ZenMarket');
  assert.equal(amount(free, 'Domestic shipping'), 0);
});

// --- ここから下は「判断」を固定するテスト ---

test('ヤフオクの料率では Neokyo が実質的に常に最安', () => {
  // ZenMarket のヤフオク料率は ¥800/点。以前 ¥300（おすすめストア料率）で
  // 計算していたときは勝者が入れ替わったが、正しい料率では入れ替わらない。
  // 「カート次第で最安が変わるから電卓が要る」という主張はヤフオク単体では成立しない。
  const losses = [];
  for (const n of [1, 2, 3, 5, 10])
    for (const price of [1000, 3000, 8000, 20000, 50000])
      for (const freeShipping of [true, false]) {
        const top = compare({ items: items(n, price, { freeShipping }) })[0];
        if (top.name !== 'Neokyo') losses.push(`${n}点 ¥${price} ${freeShipping}`);
      }
  assert.deepEqual(losses, [], `Neokyo が負けた条件: ${losses.join(' / ')}`);
});

test('差額は点数に対して開き、1 点でも無視できない', () => {
  const spread = (n) => {
    const r = compare({ items: items(n, 3000) });
    return r[r.length - 1].total - r[0].total;
  };
  assert.ok(spread(1) > 800, '1 点でも差は 800 円を超える');
  assert.ok(spread(10) > spread(1) * 10, '点数に対して差が線形以上に開いていない');
});

test('最安行には差額が出ず、他の行には最安との差が出る', () => {
  const rows = compare({ items: items(3, 3000) });
  assert.equal(rows[0].cheapest, true);
  assert.equal(rows[0].diff, 0);
  assert.ok(rows[1].diff > 0);
  assert.equal(rows[1].diffVs, rows[0].name);
});
