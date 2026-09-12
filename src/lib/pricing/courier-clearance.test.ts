import { describe, expect, test } from 'vitest';
import { compare } from './compare';
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
