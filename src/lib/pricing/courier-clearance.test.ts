import { describe, expect, test } from 'vitest';
import { compare } from './compare';
import { aggregateClearanceFee, COURIER_CLEARANCE, evalClearanceRuleYen } from './courier-clearance';
import type { Item, Row } from './types';

// F34（通関手数料・業者軸）の配線を pin する。`courier-clearance.ts` のデータそのものは
// `master/customs.json#clearance` の転記で、出典・tier の決め方はそのファイルのコメントに
// ある——ここは compare() レベルで「4つの区別を混同していないか」だけを見る
// （タスク指示: C_unknown は点推定を出さない／counted_absence は行自体を出さない／
// AU は税関(ABF)とキャリア自身の2本立て／税ゼロは区間で閉じない）。

function items(n: number, weightG: number, priceYen = 4200): Item[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `i${i}`, title: `i${i}`, priceYen, priceTier: 'fixed' as const,
    site: 'yahoo-auctions' as const, weightG, weightTier: 'estimate' as const, qty: 1,
  }));
}

const byId = (rows: Row[], id: string) => {
  const row = rows.find((r) => r.id === id || r.serviceId === id);
  if (!row) throw new Error(`no row ${id}`);
  return row;
};

describe('F34: C_unknown carrier×country cells never produce a point figure', () => {
  test('GB UPS (C_unknown, one-time acquisition failure — #81) opens without a computed amount', () => {
    const rows = compare({ items: items(1, 600), country: 'GB', method: 'courier-ups' }).rows;
    const row = byId(rows, 'fromjapan');
    const ship = row.lines.find((l) => l.key === 'intl-shipping')!;
    expect(ship.amount).not.toBeNull(); // 便自体は実測済み、無いのは通関手数料の一次資料だけ
    const fee = row.lines.find((l) => l.key === 'courier-clearance-fee');
    expect(fee).toBeDefined();
    expect(fee!.amount).toBeNull(); // C_unknown — 点推定を出さない
    expect(fee!.note.toLowerCase()).toContain('c_unknown');
    expect(row.total.high).toBeNull(); // 額不明の行が total.high を開く
  });
});

describe('F34: counted_absence produces no clearance line at all', () => {
  test('DE ECMS (ECMS has no corporate entity/T&C in Germany) has no courier-clearance-fee line', () => {
    const rows = compare({ items: items(1, 600), country: 'DE', method: 'courier-ecms-express' }).rows;
    const row = byId(rows, 'zenmarket');
    const ship = row.lines.find((l) => l.key === 'intl-shipping')!;
    expect(ship.amount).not.toBeNull(); // 便自体は実測済み
    // counted_absence: 「無いと確認した」わけではないので null 行も出さず、行自体が無い。
    expect(row.lines.some((l) => l.key === 'courier-clearance-fee')).toBe(false);
    // ただし燃油/遠隔地サーチャージの一般的な未知は引き続き残る。
    expect(row.lines.some((l) => l.key === 'courier-destination-fees')).toBe(true);
  });
});

describe('F34: Australia composes the customs authority charge and the carrier\'s own fee', () => {
  test('AU DHL carries both the ABF Import Processing Charge (clearance) and the DHL destination fee', () => {
    // 高額カート（AUD 1,000超）にして ABF の帯を確実に非ゼロにする。
    const rows = compare({ items: items(1, 600, 300_000), country: 'AU', method: 'courier-dhl' }).rows;
    const row = byId(rows, 'fromjapan');
    const abf = row.lines.find((l) => l.key === 'clearance');
    const carrierFee = row.lines.find((l) => l.key === 'courier-clearance-fee');
    expect(abf).toBeDefined(); // ABF は 'any-carrier' なので宅配便でも立つ（既存ロジック）
    expect(abf!.amount).not.toBeNull();
    expect(carrierFee).toBeDefined(); // DHLのDuty Tax Processingは別建てで加わる
    expect(carrierFee!.amount).not.toBeNull();
    expect(abf!.key).not.toBe(carrierFee!.key); // 別費目として両方残る（片方に吸収されない）
  });
});

describe('F34: a zero-duty courier row does not present as bounded (owner-decided working treatment,' +
  ' docs/audit/zero-duty-clearance-fee-working-treatment-2026-09-13.md)', () => {
  test('SG DHL under the S$400 GST-free / duty-free threshold assumes no fee, but keeps the line' +
    ' and an open total.high (F28/F40-shaped working treatment, opposite direction of risk)', () => {
    // シンガポールは duty が常に0（dutyRate:0）、GST は S$400 以下で免税。
    // 安いカートなら duty+tax は文字通り0——一次資料はどちらとも書いていないが
    // （docs/audit/f34-dhl-seven-countries-2026-09-12.md）、オーナーは
    // 「立て替えるものが無いから手数料も0」を working treatment として採用した。
    const rows = compare({ items: items(1, 600, 3000), country: 'SG', method: 'courier-dhl' }).rows;
    const row = byId(rows, 'fromjapan');
    const fee = row.lines.find((l) => l.key === 'courier-clearance-fee');
    expect(fee).toBeDefined();
    // no fee amount is asserted under the assumption (low side of the range is 0)...
    expect(fee!.amount).toBe(0);
    expect(fee!.amountKind).toBe('range');
    // ...but the line stays (never silently dropped) and total.high stays open above total.low,
    // quantifying exactly what this assumption is worth if it turns out to be wrong: DHL SG's own
    // minimum fee (S$20 -> ~¥2,467 at the fixed rate used in tests).
    expect(fee!.amountHighYen).toBeGreaterThan(fee!.amount!);
    // `total.high` は courier 行に常に付随する `courier-destination-fees`（燃油/遠隔地の
    // 未知、F28/F40）で既に無条件に開いている——この行の range 自体が `total.high` を
    // 開閉するわけではないが、その開いた状態は正しく維持される（決して閉じない）。
    expect(row.total.high).toBeNull();
    expect(fee!.note).toContain('nothing to advance');
    expect(fee!.note).toContain('owner-decided working treatment');
    expect(fee!.tier).toBe('estimate'); // 仮定に基づく行——DHL SGのtier: 'fixed'をそのまま流用しない
  });

  test('the same route above the threshold (duty/tax > 0) resolves to a real fixed amount, unchanged', () => {
    const rows = compare({ items: items(1, 600, 300_000), country: 'SG', method: 'courier-dhl' }).rows;
    const row = byId(rows, 'fromjapan');
    const fee = row.lines.find((l) => l.key === 'courier-clearance-fee')!;
    expect(fee.amount).not.toBeNull();
    expect(fee.amount).toBeGreaterThan(0);
    expect(fee.amountKind ?? 'point').not.toBe('range'); // 仮定を通らない——ただの実額
    expect(fee.tier).toBe('fixed'); // DHL SGはA_confirmed
  });

  test("ECMS's zero-duty behaviour comes from its own source (a conditional advance-payment fee)," +
    ' not from the DHL/UPS/FedEx working treatment', () => {
    // ECMS SG（tier: fixed, rateMin(0.03, 0)）: 最低額そのものが0円なので、
    // duty+tax=0のときは式を評価するだけで正しく0円になる——working treatmentの
    // 仮定を経由していない。amountKind: 'range' にならず、tierも'fixed'のまま。
    // ECMS EXPRESS は ZenMarket のみが扱う便名（courier-ecms は他社、postage.ts 参照）。
    const rows = compare({ items: items(1, 600, 3000), country: 'SG', method: 'courier-ecms-express' }).rows;
    const row = byId(rows, 'zenmarket');
    const fee = row.lines.find((l) => l.key === 'courier-clearance-fee')!;
    expect(fee.amount).toBe(0);
    expect(fee.amountKind ?? 'point').not.toBe('range'); // 仮定の器（range）を経由していない
    expect(fee.tier).toBe('fixed'); // sourced（ECMS自身のT&Cの条件文）——'estimate'に落とさない
    expect(fee.note).not.toContain('owner-decided working treatment');
  });

  test('a cart whose parcels straddle duty-free — one owes duty/tax, the other does not — is priced' +
    ' per parcel, not rounded up or down to the whole cart (the PR #93-shaped failure, reproduced' +
    ' here for the clearance fee instead of prepaid-import-tax)', () => {
    // `aggregateClearanceFee`（`compare.ts` が実際に呼ぶのと同じ関数）を、DHL SGの
    // 実データ（`COURIER_CLEARANCE.SG.DHL`）で直接叩く。**実際の5社の master データには
    // 「per-order分割 かつ DHL/UPS/FedEx を扱う」組み合わせが1つも無い**——per-order
    // 分割ができるのはBuyeeだけで、Buyeeは自社便（courier-buyee-air）とECMSしか
    // 扱わない（ECMSはこの working treatment の対象外）。そのため `compare()` 経由では
    // この状況（per_parcel かつ working-treatment対象の carrier で複数小包がまたがる）
    // を今のmasterデータで再現できない——ここでは集計関数そのものを直接検証する
    // （F34の帯構造テスト・`evalClearanceRuleYen` の単体テストと同じ立て付け）。
    const dhlSg = COURIER_CLEARANCE.SG!.DHL!;
    const ccyToJpy = 123.33; // SGD、`master/rates.ts` の固定レートと同オーダーの値（テスト用）
    const units = [
      { dutyPlusTaxYen: 30_000, declaredLocal: 300_000 / ccyToJpy }, // 課税小包
      { dutyPlusTaxYen: 0, declaredLocal: 3000 / ccyToJpy },          // 免税小包（S$400未満）
    ];
    const agg = aggregateClearanceFee(dhlSg.rule, 'DHL', units, ccyToJpy);
    // 免税小包1つだけに仮定が適用され、課税小包はそのまま実額——カート全体を
    // 「1件でも税があるから全部課税」（過大計上）や「税ゼロの小包があるから全部
    // 免除」（過小計上）のどちらにも丸めていない。
    expect(agg.assumedZeroCount).toBe(1);
    expect(agg.totalCount).toBe(2);
    expect(agg.knownFeeYen).toBeGreaterThan(0); // 課税小包の実額
    expect(agg.assumedZeroCapYen).toBeGreaterThan(0); // 免税小包に本来課され得た最低額
    // 免税小包を「税ゼロ」判定から漏らして両方に最低額を課していたら knownFeeYen が
    // 2倍近くになる——それとは違う値であることも合わせて確認する。
    const bothChargedYen = evalClearanceRuleYen(dhlSg.rule, units[0]!.dutyPlusTaxYen, units[0]!.declaredLocal, ccyToJpy)
      + evalClearanceRuleYen(dhlSg.rule, units[1]!.dutyPlusTaxYen, units[1]!.declaredLocal, ccyToJpy);
    expect(agg.knownFeeYen).toBeLessThan(bothChargedYen);
    expect(agg.knownFeeYen + agg.assumedZeroCapYen).toBeCloseTo(bothChargedYen, 6);
  });
});

test('a per_shipment assumption-carrier route (SG FedEx) composes with the whole-shipment' +
  ' grouping: a single-shop cart with zero duty/tax gets exactly one assumed-zero unit,' +
  ' amountKind: \'range\', and stays tier: \'estimate\'', () => {
  const rows = compare({ items: items(1, 600, 3000), country: 'SG', method: 'courier-fedex' }).rows;
  const row = byId(rows, 'zenmarket');
  const fee = row.lines.find((l) => l.key === 'courier-clearance-fee')!;
  expect(fee.amountKind).toBe('range');
  expect(fee.amount).toBe(0);
  expect(fee.amountHighYen).toBeGreaterThan(0);
  expect(fee.label).toContain('assumed zero on 1 of 1 shipment');
  expect(fee.tier).toBe('estimate');
});

// F34（能力の追加、値の移行はしない）── FedEx GB/DE の3段帯構造は現行の
// clearance スキーマ（fixed_per_parcel / banded_by_value / greater_of 等）で
// 表現できないと#98が確認した（docs/audit/f34-fedex-seven-countries-2026-09-12.md、
// schema_gap: true）。このPRは `Rule.kind: 'banded_duty_tax_mixed'` として
// **能力だけ**を追加する。`master/customs.json` のGB/DE FedEx行はまだ
// `rule.type: "unknown"` のままで、このPRでは書き換えない——値の移行は別PR。
// したがって以下の rule はすべて**合成 fixture**で、`COURIER_CLEARANCE` の
// 実データからは引かない。GB/DEの raw_findings（同監査ノート）が記録した
// 実際の帯の値をそのまま使い、`master/test_tiered_band_schema.py` が同じ値を
// Python の `eval_clearance()` に通した結果と一致することを担保する
// （2言語間の実装が食い違わないようにするのが目的）。
describe('F34 tiered band schema (banded_duty_tax_mixed) — capability only, no master row uses this yet', () => {
  // GB FedEx Disbursement Fee（raw_findings）: 帯1 ≤£43 30%・下限£10.50 /
  // 帯2 £43〜£524 定額£12.90 / 帯3 £524超 2.5%のみ。
  const gbFedexRule = {
    kind: 'banded_duty_tax_mixed' as const,
    bands: [
      { maxLocal: 43, formula: 'rate_with_min' as const, rate: 0.30, minLocal: 10.50 },
      { maxLocal: 524, formula: 'flat' as const, amountLocal: 12.90 },
      { maxLocal: null, formula: 'rate_only' as const, rate: 0.025 },
    ],
  };
  // DE FedEx（同一の3段構造、通貨と数値だけ違う）: 帯1 ≤€50 30%・下限€5 /
  // 帯2 €50〜€600 定額€15 / 帯3 €600超 2.5%のみ。
  const deFedexRule = {
    kind: 'banded_duty_tax_mixed' as const,
    bands: [
      { maxLocal: 50, formula: 'rate_with_min' as const, rate: 0.30, minLocal: 5.0 },
      { maxLocal: 600, formula: 'flat' as const, amountLocal: 15.0 },
      { maxLocal: null, formula: 'rate_only' as const, rate: 0.025 },
    ],
  };
  // ccyToJpy=1 にして local と yen を数値的に同一視する（master/test_tiered_band_schema.py
  // の Python 側テストと同じ数値をそのまま突き合わせられるようにするため）。
  const CCY = 1;

  test('band 1 (rate_with_min): min applies below the rate crossover, rate applies above it', () => {
    expect(evalClearanceRuleYen(gbFedexRule, 20, 0, CCY)).toBeCloseTo(10.50, 10); // 0.3*20=6 < 10.50
    expect(evalClearanceRuleYen(gbFedexRule, 40, 0, CCY)).toBeCloseTo(12.0, 10); // 0.3*40=12 > 10.50
  });

  test('band 1/2 boundary at duty+tax=43 is inclusive on band 1 (<=), matching eval_clearance()', () => {
    expect(evalClearanceRuleYen(gbFedexRule, 43, 0, CCY)).toBeCloseTo(Math.max(0.30 * 43, 10.50), 10);
    expect(evalClearanceRuleYen(gbFedexRule, 43.01, 0, CCY)).toBeCloseTo(12.90, 10); // 帯2側（定額）
  });

  test('band 2 (flat) is constant across its whole range', () => {
    expect(evalClearanceRuleYen(gbFedexRule, 200, 0, CCY)).toBeCloseTo(12.90, 10);
  });

  test('band 2/3 boundary at duty+tax=524 is inclusive on band 2 (<=)', () => {
    expect(evalClearanceRuleYen(gbFedexRule, 524, 0, CCY)).toBeCloseTo(12.90, 10);
    expect(evalClearanceRuleYen(gbFedexRule, 524.01, 0, CCY)).toBeCloseTo(0.025 * 524.01, 10); // 帯3側
  });

  test('band 3 (rate_only, unbounded above) has no upper limit', () => {
    expect(evalClearanceRuleYen(gbFedexRule, 10_000, 0, CCY)).toBeCloseTo(250.0, 10);
  });

  test('DE mirrors the same 3-band shape with its own currency/thresholds', () => {
    expect(evalClearanceRuleYen(deFedexRule, 10, 0, CCY)).toBeCloseTo(5.0, 10); // 下限適用
    expect(evalClearanceRuleYen(deFedexRule, 30, 0, CCY)).toBeCloseTo(9.0, 10); // rate適用
    expect(evalClearanceRuleYen(deFedexRule, 50, 0, CCY)).toBeCloseTo(Math.max(0.30 * 50, 5.0), 10);
    expect(evalClearanceRuleYen(deFedexRule, 50.01, 0, CCY)).toBeCloseTo(15.0, 10);
    expect(evalClearanceRuleYen(deFedexRule, 600, 0, CCY)).toBeCloseTo(15.0, 10);
    expect(evalClearanceRuleYen(deFedexRule, 600.01, 0, CCY)).toBeCloseTo(0.025 * 600.01, 10);
  });

  test('a cart whose parcels straddle two bands after box-splitting sums per-parcel fees', () => {
    // 小包A: duty+tax=20 → 帯1（下限適用、10.50）。小包B: duty+tax=700 → 帯3（rate_only）。
    // #85（箱分割）で個口が増えると、どの帯に落ちるかは小包ごとに変わりうる——
    // ここではその2小包が別々の帯に落ちるケースを固定する。
    const feeA = evalClearanceRuleYen(gbFedexRule, 20, 0, CCY);
    const feeB = evalClearanceRuleYen(gbFedexRule, 700, 0, CCY);
    expect(feeA).toBeCloseTo(10.50, 10);
    expect(feeB).toBeCloseTo(0.025 * 700, 10);
    expect(feeA + feeB).toBeCloseTo(10.50 + 0.025 * 700, 10);
  });

  test('GB/DE FedEx still produce no figure through compare() — this PR adds the shape, not the data', () => {
    // #5（タスク指示）の最重要アサーション: スキーマが表現できるようになったことが、
    // GB/DEの実際の行を勝手に価格化してしまう副作用を持たないことを固定する。
    // `master/customs.json` のGB/DE FedEx行は依然 `rule.type: "unknown"`（tier:
    // C_unknown, schema_gap: true）のままで、COURIER_CLEARANCE にもエントリを
    // 追加していない。
    for (const cc of ['GB', 'DE'] as const) {
      const rows = compare({ items: items(1, 600, 300_000), country: cc, method: 'courier-fedex' }).rows;
      const row = byId(rows, 'zenmarket'); // fromjapan/neokyo/buyee/jauceはFedEx×GB/DEの便レート自体が未収載
      const fee = row.lines.find((l) => l.key === 'courier-clearance-fee');
      expect(fee, `${cc} FedEx: courier-clearance-fee 行が消えている`).toBeDefined();
      expect(fee!.amount, `${cc} FedEx: 額不明のはずが数値を返している——スキーマ追加が誤って値の移行を伴ってしまった`)
        .toBeNull();
      expect(row.total.high, `${cc} FedEx: total.high が閉じている——C_unknownの費目がある間は開いたままのはず`)
        .toBeNull();
    }
  });
});

// #106（通関手数料の課金単位: per shipment = Air Waybill 1枚）。
// FedEx自身のConditions of Carriage（オーナーが直接フェッチ）は GB/DE で
// 「'Shipment' means one or more Packages or Freight, moving on a single Air Waybill.」
// と定義し、DE DHLは既に "pro abgefertigter Sendung" で同じ単位を一次資料で確認済み。
// per_shipmentの行は「カート全体で1回」ではなく「Air Waybill（＝ここでは箱の分割理由から
// 推定した『注文』単位）ごとに1回」課金しなければならない——箱分割の理由が店舗違いなら
// 別Shipment（別Air Waybill、1回ずつ）、重量上限による継続なら同一Shipment（1回のみ）、
// というのがオーナーが決めた開示された仮定（`courier-clearance.ts` の doc comment 参照）。
describe('F34/#106: per_shipment fee is charged once per shipment (Air Waybill), not once per cart', () => {
  test('a single-shop cart (no split) still gets exactly one per-shipment fee — behaviour'
    + ' unchanged from before #106 when there is nothing to split', () => {
    // DE DHL は per_shipment を一次資料で確認済み（"pro abgefertigter Sendung"）。
    const oneItem = compare({ items: items(1, 600, 300_000), country: 'DE', method: 'courier-dhl' }).rows;
    const twoItemsSameOrder = compare(
      { items: items(2, 600, 150_000), country: 'DE', method: 'courier-dhl' }).rows;
    const feeOne = byId(oneItem, 'fromjapan').lines.find((l) => l.key === 'courier-clearance-fee')!;
    const feeTwo = byId(twoItemsSameOrder, 'fromjapan').lines.find((l) => l.key === 'courier-clearance-fee')!;
    // 同じ申告総額・同じ税額になるようにしてあるので、1回課金なら金額は同じはず
    // （2箱に分かれていても、店舗違いでの分割ではないので同じShipmentのまま）。
    expect(feeOne.amount).not.toBeNull();
    expect(feeTwo.amount).toBeCloseTo(feeOne.amount!, -1);
  });

  test('the disclosed-assumption note is present whenever a per_shipment fee is charged —'
    + ' the Air Waybill count must never read as a fact', () => {
    const rows = compare({ items: items(1, 600, 300_000), country: 'DE', method: 'courier-dhl' }).rows;
    const fee = byId(rows, 'fromjapan').lines.find((l) => l.key === 'courier-clearance-fee')!;
    expect(fee.note).toContain('our assumption');
    expect(fee.note).toContain('cannot observe how many Air Waybills');
  });
});

// #106: 「重量上限で増えた箱は同じMulti-Piece Shipmentとして1回だけ課金する」という
// ルールは、宅配便のコードパスでは今日時点で到達不能——`compare.ts` の
// `methodBoxes = isCourier ? baseBoxes : boxesForPostal(...)` が、宅配便には
// `splitByWeightLimit` を一切通させないため。到達不能であること自体をピン留めする
// （タスク指示: 「到達可能かを確認し、そうでないなら曖昧にせずテストで固定する」）。
describe('F34/#106: the weight-limit multi-piece-shipment rule is unreachable for couriers today', () => {
  test('a huge single-shop courier cart that would exceed any postal weight limit is never'
    + ' split into multiple boxes by weight — couriers always keep one box per shop group', () => {
    // 20点×2kg=40kgの巨大カート。郵便なら確実に複数箱に分割される重さだが、
    // 宅配便はbaseBoxes（下地=店舗単位、未分割）をそのまま使うので1箱のまま。
    const rows = compare({ items: items(20, 2000, 4200), country: 'DE', method: 'courier-dhl' }).rows;
    const row = byId(rows, 'fromjapan');
    expect(row.boxes).toHaveLength(1); // 割れていない——'weight-limit'は発生しようがない
    expect(row.boxes[0]!.reason).not.toBe('weight-limit');
  });

  test('a multi-shop courier cart (Buyee, shop split) never reports a weight-limit box either'
    + ' — courier boxes are only ever a shop-split reason or \'single\', confirming the'
    + ' branch this PR added for weight-limit shipments has no live caller yet', () => {
    const cart: Item[] = [
      {
        id: 's1', title: 's1', priceYen: 3000, priceTier: 'fixed',
        site: 'rakuten', url: 'https://item.rakuten.co.jp/shop-a/s1/',
        weightG: 300, weightTier: 'estimate', qty: 1,
      },
      {
        id: 's2', title: 's2', priceYen: 3000, priceTier: 'fixed',
        site: 'rakuten', url: 'https://item.rakuten.co.jp/shop-b/s2/',
        weightG: 300, weightTier: 'estimate', qty: 1,
      },
    ];
    // Buyeeはショップごとに別送がデフォルト（'default'変種）で、`split`が効く唯一の社。
    // Buyeeが持つ宅配便は courier-buyee-air（自社便、carrierOfがnull、通関データ無し）と
    // courier-ecms。ECMSは2026-09-13のper-shipment統一で `per: 'per_shipment'`（inferred）に
    // なったが、店舗違いの分割は既に「別Shipment」としてグループ化される（compare.tsの
    // `shipmentGroups`はgi=店舗グループ単位）ため、店舗分割1つにつき箱も1つ・shipmentも1つ
    // ——per_parcelだった頃と同じ分割になり、金額は変わらない（下の
    // 'F34/#106是正 per-shipment統一' 参照）。ここでは「箱の理由に'weight-limit'は出ない」
    // ことだけを確認する。
    const rows = compare({ items: cart, country: 'DE', method: 'courier-ecms' }).rows;
    const row = byId(rows, 'buyee:default');
    expect(row.boxes.length).toBeGreaterThan(1); // 店舗違いで2箱に分かれている
    expect(row.boxes.every((b) => b.reason !== 'weight-limit')).toBe(true);
    expect(row.boxes.map((b) => b.reason).sort()).toEqual(['identified-shop', 'identified-shop']);
  });
});

// #112（per-shipment統一、オーナー確定2026-09-13）── 48行を読み直した結果、単位を
// 明言する行は全てshipment・parcelはゼロなので、一次資料が沈黙している行も
// per_shipmentへ統一した。だが「一次資料が単位を明言している」(sourced) 行と
// 「他行の傾向からの推論」(inferred) 行を混同してはいけない——タスク指示
// 「未来の読み手が推論を根拠と取り違えないように」。
describe('#112: sourced vs inferred per_shipment rows must be distinguishable in the output note', () => {
  test('DE DHL (sourced: "pro abgefertigter Sendung") does not read as an inference', () => {
    const rows = compare({ items: items(1, 600, 300_000), country: 'DE', method: 'courier-dhl' }).rows;
    const fee = byId(rows, 'fromjapan').lines.find((l) => l.key === 'courier-clearance-fee')!;
    expect(fee.note).toContain('stated by the carrier\'s own source');
    expect(fee.note).not.toContain('NOT stated by this route\'s own source');
  });

  test('US DHL (inferred: DHL\'s own US rate guide is silent on the unit) reads as our inference,'
    + ' not a confirmed fact', () => {
    const rows = compare({ items: items(1, 600, 300_000), country: 'US', method: 'courier-dhl' }).rows;
    const fee = byId(rows, 'fromjapan').lines.find((l) => l.key === 'courier-clearance-fee')!;
    expect(fee.note).toContain('NOT stated by this route\'s own source');
    expect(fee.note).toContain('our inference');
    expect(fee.note).not.toContain('stated by the carrier\'s own source');
  });

  test('US FedEx and US ECMS (both silent, both inferred) read the same way as US DHL', () => {
    for (const method of ['courier-fedex', 'courier-ecms'] as const) {
      const rows = compare({ items: items(1, 600, 300_000), country: 'US', method }).rows;
      const row = rows.find((r) => r.lines.some((l) => l.key === 'courier-clearance-fee'));
      expect(row, `${method}: courier-clearance-fee 行を持つ行が無い`).toBeDefined();
      const fee = row!.lines.find((l) => l.key === 'courier-clearance-fee')!;
      expect(fee.note, method).toContain('NOT stated by this route\'s own source');
    }
  });
});

// #112: 実際に何が動いたか（タスク指示: 「動くと期待し、実際にcompare()を走らせて
// 報告する」）。**答えは「動かない」——ただし#111と同じ理由ではなく、その理由が
// この統一によっても解消されていないことを確認する。**
// per_shipmentは「shipmentグループ（=店舗ごとのbaseGroups）ごとに1回課金」で実装されて
// いる（compare.tsのshipmentGroups）。宅配便のbaseBoxesは常に「店舗グループ=1箱」
// （重量超過分割が宅配便に到達しないため、#106で確認済み）なので、**shipmentの単位と
// 箱の単位が今日のコードでは常に一致する**——店舗違いの分割は「別のshipment」に
// なるが、それは同時に「別の箱（別のparcel）」でもある。したがってper_parcelから
// per_shipmentへ切り替えても、**同じ箱の集合に同じ回数だけ課金することになり、
// 合計は変わらない。** これは「#111のグルーピング修正がBuyeeで実質no-opだった」のと
// 表面上は似ているが理由が違う: #111はBuyeeにShipment単位確定済みの宅配便が無かった
// ことがno-opの理由だったが、このPRでBuyeeのECMSがper_shipment(inferred)になった今も
// なお金額は動かない——動かない理由が「shipment単位の宅配便が無いから」から
// 「shipment＝店舗グループ＝箱、という一致が崩れる分割方法（重量超過）が宅配便に
// 存在しないから」に変わっただけで、**両者とも最終的には同じ到達不能ブランチ
// （'weight-limit'分割）に帰着する。**
describe('#112: totals do not move for shop-split carts, and why', () => {
  const shopSplitCart: Item[] = [
    {
      id: 's1', title: 's1', priceYen: 30_000, priceTier: 'fixed',
      site: 'rakuten', url: 'https://item.rakuten.co.jp/shop-a/s1/',
      weightG: 500, weightTier: 'estimate', qty: 1,
    },
    {
      id: 's2', title: 's2', priceYen: 30_000, priceTier: 'fixed',
      site: 'rakuten', url: 'https://item.rakuten.co.jp/shop-b/s2/',
      weightG: 500, weightTier: 'estimate', qty: 1,
    },
  ];

  test('Buyee ECMS in the US: a 2-shop cart produces 2 boxes = 2 shipment groups —'
    + ' per_shipment charges once per group, which is once per box, same as per_parcel would', () => {
    const splitRows = compare({ items: shopSplitCart, country: 'US', method: 'courier-ecms' }).rows;
    const splitRow = splitRows.find((r) => r.id === 'buyee:default')!;
    expect(splitRow.boxes).toHaveLength(2); // 店舗違いで2箱

    // 同じ合計duty+taxを1店舗にまとめたカートと比較する:
    // 1店舗なら1箱=1shipment、feeは1回分（duty+taxの合計に対して評価）。
    // 2店舗なら2箱=2shipment、feeは2回分（duty+taxをそれぞれの箱ごとに評価して合算）。
    // rate_of_import_charges（ECMS、下限なしの単純比率）は線形なので、
    // 「合計に1回」と「2つに分けて2回、合算」が一致する——これが「動かない」ことの
    // 数式的な理由（下限つきのrateだと一般には一致しないが、ECMSの下限は0）。
    const singleShopCart: Item[] = [
      { ...shopSplitCart[0]!, url: shopSplitCart[0]!.url },
      { ...shopSplitCart[1]!, url: shopSplitCart[0]!.url }, // 同じ店舗URLに揃える
    ];
    const oneRows = compare({ items: singleShopCart, country: 'US', method: 'courier-ecms' }).rows;
    const oneRow = oneRows.find((r) => r.id === 'buyee:default')!;
    expect(oneRow.boxes).toHaveLength(1); // 同一店舗なので1箱

    const splitFee = splitRow.lines.find((l) => l.key === 'courier-clearance-fee')!;
    const oneFee = oneRow.lines.find((l) => l.key === 'courier-clearance-fee')!;
    expect(splitFee.amount).not.toBeNull();
    expect(oneFee.amount).not.toBeNull();
    // 数量・単価が同一なので合計duty+taxも同一——**clearance feeそのものは分割方法に
    // 依らず一致する**（他の行——送料など——は店舗数で変わり得るので、ここで比べるのは
    // clearance fee単体に留める）。
    expect(splitFee.amount).toBe(oneFee.amount);
  });
});

// 監査（docs/audit/formula-vs-master-2026-09-13.md）が見つけたギャップの再発防止:
// SG UPS (`ups_disbursement`) の `rate_min_max` は master/customs.json が
// 「5.6%、下限S$22.50、上限S$100 per shipment」と明記しているが、上限
// （`Math.min(..., maxLocal*ccyToJpy)`）を丸ごと削除しても既存の927件のテストは
// 1件も落ちなかった（`master/validate.py` も同じ行を「評価器はあるが fixture 無し」
// と独立に報告している）。ここで上限が実際に効く額を直接 `evalClearanceRuleYen`
// に通し、下限・rate・上限の3領域すべてを1つのテストでピン留めする。
describe('#formula-vs-master-2026-09-13: rate_min_max caps at maxLocal even when rate*base exceeds it', () => {
  const CCY = 110; // 便宜上の SGD→JPY レート（このテストは比率のみを見る）
  const rule = { kind: 'rate_min_max' as const, rate: 0.056, minLocal: 22.5, maxLocal: 100 };

  test('下限未満の duty+tax では minLocal が効く', () => {
    // rate*base = 0.056*100 = 5.6 < minLocal(22.5)
    expect(evalClearanceRuleYen(rule, 100 * CCY, 0, CCY)).toBeCloseTo(22.5 * CCY, 6);
  });

  test('rate 帯では rate*base がそのまま出る', () => {
    // rate*base = 0.056*1000 = 56 は 22.5 と 100 の間
    expect(evalClearanceRuleYen(rule, 1000 * CCY, 0, CCY)).toBeCloseTo(0.056 * 1000 * CCY, 6);
  });

  test('上限を超える duty+tax では maxLocal(S$100) で頭打ちになる', () => {
    // rate*base = 0.056*10000 = 560 は maxLocal(100) を大きく超える
    const dutyPlusTaxYen = 10_000 * CCY;
    const result = evalClearanceRuleYen(rule, dutyPlusTaxYen, 0, CCY);
    expect(result).toBeCloseTo(100 * CCY, 6);
    expect(result).toBeLessThan(0.056 * dutyPlusTaxYen); // 上限が無ければもっと高いはず
  });
});
