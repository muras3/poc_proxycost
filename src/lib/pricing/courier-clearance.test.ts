import { describe, expect, test } from 'vitest';
import { compare } from './compare';
import { evalClearanceRuleYen } from './courier-clearance';
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

describe('F34: a zero-duty courier row does not present as bounded', () => {
  test('SG DHL under the S$400 GST-free / duty-free threshold cannot assert a point clearance fee', () => {
    // シンガポールは duty が常に0（dutyRate:0）、GST は S$400 以下で免税。
    // 安いカートなら duty+tax は文字通り0——このとき「立て替えるものが無いから
    // 手数料も0」なのか「最低額は無条件に課される」のか、DHLのどの一次資料にも
    // 書かれていない（docs/audit/f34-dhl-seven-countries-2026-09-12.md）。
    const rows = compare({ items: items(1, 600, 3000), country: 'SG', method: 'courier-dhl' }).rows;
    const row = byId(rows, 'fromjapan');
    const fee = row.lines.find((l) => l.key === 'courier-clearance-fee');
    expect(fee).toBeDefined();
    expect(fee!.amount).toBeNull(); // 0円と決め打ちしない——total.high を開く
    expect(fee!.note).toContain('nothing to advance');
    expect(row.total.high).toBeNull();
  });

  test('the same route above the threshold (duty/tax > 0) resolves to a real fixed amount', () => {
    const rows = compare({ items: items(1, 600, 300_000), country: 'SG', method: 'courier-dhl' }).rows;
    const row = byId(rows, 'fromjapan');
    const fee = row.lines.find((l) => l.key === 'courier-clearance-fee')!;
    expect(fee.amount).not.toBeNull();
    expect(fee.amount).toBeGreaterThan(0);
    expect(fee.tier).toBe('fixed'); // DHL SGはA_confirmed
  });
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
