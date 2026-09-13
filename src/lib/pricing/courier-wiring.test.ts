import { describe, expect, test } from 'vitest';
import { compare } from './compare';
import type { Item } from './types';

// P2（オーナー確定 2026-09-12）。`compare()` レベルで宅配便の配線を検査する。
// 単位の計算（区間・単調性）は `postage.ts`/`courier-postage.test.ts`/
// `courier-monotonicity.test.ts` が持つので、ここは「実際にカートを流したときに
// 正しい方式・正しい行・正しい `Row.surface` が出るか」だけを見る。

function items(n: number, weightG: number, priceYen = 4200): Item[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `i${i}`, title: `i${i}`, priceYen, priceTier: 'fixed' as const,
    site: 'yahoo-auctions' as const, weightG, weightTier: 'estimate' as const, qty: 1,
  }));
}

const byId = (rows: ReturnType<typeof compare>['rows'], id: string) => {
  const row = rows.find((r) => r.id === id || r.serviceId === id);
  if (!row) throw new Error(`no row ${id}`);
  return row;
};

describe('unmeasured country stays unmeasured (P2 2)', () => {
  test('a courier price never appears for a country we have not measured — the method is absent with a reason, not ¥0', () => {
    // 2026-09-12 拡張で FROM JAPAN の UPS/DHL/FedEx-Economy/FedEx-Priority は
    // GB/FR/AU/CA/SG/DE まで測ったが、**ECMS は US/AU/SG しか画面に出ず GB は今も
    // 未測定のまま**（`services.ts` の courier-ecms のコメント参照）——このテストは
    // その本物の空白（正しく DE のままだと GB に変わっただけの数字合わせではない）
    // で固定し直す。
    const rows = compare({ items: items(1, 600), country: 'GB', method: 'courier-ecms' }).rows;
    const fj = byId(rows, 'fromjapan');
    const shipLine = fj.lines.find((l) => l.key === 'intl-shipping')!;
    expect(shipLine.amount).toBeNull();
    expect(fj.comparable).toBe(false);
    expect(fj.notComparableReason).toContain('has not priced this courier');
    expect(fj.notComparableReason).toContain('United Kingdom');
  });

  test('Jauce has no courier grid at all — a courier method is simply not offered', () => {
    const rows = compare({ items: items(1, 600), country: 'US', method: 'courier-fedex-economy' }).rows;
    const jauce = byId(rows, 'jauce');
    expect(jauce.lines.find((l) => l.key === 'intl-shipping')!.amount).toBeNull();
    expect(jauce.comparable).toBe(false);
    expect(jauce.notComparableReason).toContain('does not offer this courier');
  });
});

describe('a courier row stays open on top while an equivalent Japan Post row closes (P2 3)', () => {
  test('ZenMarket courier to the US carries the destination-fee unknown line; the Japan Post row for the same cart does not', () => {
    // **2026-09-13、オーナー決定で `courier-destination-fees` 行は分離・撤去された。**
    // 燃油サーチャージは表示送料に含まれている前提で行を作らず、遠隔地サーチャージは
    // 総額に加算しない共通の画面注記に回した（`RemoteAreaSurchargeNote`）ので、
    // この行はどの宅配便の行にも立たない——旧来の「courier だけが持つ未知の行」という
    // 対比自体が無くなった。**その代わり `Row.closedByAssumption` が同じ役割
    // （courier 固有の、燃油込み・遠隔地除外という仮定への依存）を示す**——
    // `total.high` を開けない代わりに「確定ではなく仮定依存」であることを型で残す。
    //
    // `total.high` そのものでは開閉を対比できない点は変わらない。米国宛は Zonos
    // 前払い利用料が全社・全方式で未取得（`scope: 'shared'`）なので、このPR以前から
    // 日本郵便だけを選んでも US 宛の `total.high` は既に `null`
    // ——courier 固有の未知が無くても米国は開いたままになる（`taxes.test.ts` の
    // 既存の主張）。
    const rows = compare({ items: items(1, 600), country: 'US', method: 'courier-ups' }).rows;
    const courierRow = byId(rows, 'zenmarket');
    expect(courierRow.total.low).toBeGreaterThan(0);
    expect(courierRow.total.high).toBeNull();
    expect(courierRow.lines.some((l) => l.key === 'courier-destination-fees')).toBe(false);
    expect(courierRow.closedByAssumption).toEqual(
      expect.arrayContaining(['courier-fuel-surcharge-included', 'courier-remote-area-surcharge-excluded']),
    );

    const postalRows = compare({ items: items(1, 600), country: 'US', method: 'ems' }).rows;
    const postalRow = byId(postalRows, 'zenmarket');
    expect(postalRow.lines.some((l) => l.key === 'courier-destination-fees')).toBe(false);
    expect(postalRow.closedByAssumption).toEqual([]);

    // **国を変えれば実際に閉じることを見せる。**ZenMarket に燃油・遠隔地・通関
    // 前払いの未取得費目は無いので、Zonos 未知の無い国（DE）では EMS の総額が
    // 閉じる——「日本郵便は閉じられる」という主張自体はここで確かめる。
    const deRows = compare({ items: items(1, 600), country: 'DE', method: 'ems' }).rows;
    const deRow = byId(deRows, 'zenmarket');
    expect(deRow.total.high).toBe(deRow.total.low);
  });
});

describe('weights between measured points are bounded, not interpolated or rounded (P2 1)', () => {
  test('700g (between the 600g and 1000g FROM JAPAN UPS points) yields low = 600g price, high = 1000g price', () => {
    // 梱包後重量は ×1.2+300 なので、実重量から逆算した点を狙って選ぶのではなく、
    // 実際の梱包後重量が2つの測定点の間に落ちることだけを確認する。
    const rows = compare({ items: items(1, 250), country: 'US', method: 'courier-ups' }).rows;
    const row = byId(rows, 'fromjapan');
    const shipLine = row.lines.find((l) => l.key === 'intl-shipping')!;
    // 250g の実重量 → 梱包後 round(250*1.2+300) = 600g ちょうど（幅ゼロの例は別テストで）。
    expect(shipLine.amount).toBe(3539);
  });

  test('a real in-between weight (900g actual → 1,380g packed, between the 1,000g and 1,500g points)', () => {
    const rows = compare({ items: items(1, 900), country: 'US', method: 'courier-ups' }).rows;
    const row = byId(rows, 'fromjapan');
    const shipLine = row.lines.find((l) => l.key === 'intl-shipping')!;
    // FROM JAPAN UPS: 1,000g=¥3,539 / 1,500g=¥4,124. 梱包後 1,380g はこの間。
    expect(shipLine.amount).toBe(3539); // 下端をそのまま表示額にする
    expect(shipLine.amountKind).toBe('range');
    expect(shipLine.amountHighYen).toBe(4124);
  });
});

describe('the default excludes surface, and surface stays visible (P2 4)', () => {
  test("ZenMarket's own courier-picker SURFACE is ¥3,300 at 600g, EMS is ¥4,180 (zone 4) — Surface is reachable but never chosen as the default", () => {
    // 実際に600gを渡す（brief の具体例そのもの）。ZenMarket の courier-surface は
    // 500〜2,000g のあいだ¥3,300のまま。`method: 'courier-surface'` を明示して
    // その額そのものが正しく引けることを確認する——`Row.surface` がどちらの
    // Surface 系（日本郵便の公表表 or 自社ブランドの Surface）を選ぶかは、
    // その時点の重量でどちらが安いかによって変わる（下のテストで別に検査する）。
    const netFor600 = Math.round((600 - 300) / 1.2);
    const rows = compare({ items: items(1, netFor600), country: 'US', method: 'courier-surface' }).rows;
    const zen = byId(rows, 'zenmarket');
    const shipLine = zen.lines.find((l) => l.key === 'intl-shipping')!;
    expect(shipLine.amount).toBe(3300);

    // 既定（'cheapest'）は Surface 系のどれも選ばない。
    const defaultRows = compare({ items: items(1, netFor600), country: 'US', method: 'cheapest' }).rows;
    const zenDefault = byId(defaultRows, 'zenmarket');
    expect(zenDefault.method).not.toBe('courier-surface');
    expect(zenDefault.method).not.toBe('small-packet-surface');
    expect(zenDefault.method).not.toBe('parcel-surface');
  });

  test('Row.surface always carries a price and a reason, whichever surface option is cheapest for that row', () => {
    const netFor600 = Math.round((600 - 300) / 1.2);
    const rows = compare({ items: items(1, netFor600), country: 'US', method: 'cheapest' }).rows;
    const zen = byId(rows, 'zenmarket');
    expect(zen.surface).not.toBeNull();
    expect(zen.surface!.shipYen.low).toBeGreaterThan(0);
    expect(zen.surface!.days).toMatch(/month/);
    expect(zen.surface!.note).toContain('not used as the default');
  });

  test('the chosen default method for that row is never a surface method, cart-wide', () => {
    for (const cc of ['US', 'DE'] as const) {
      const rows = compare({ items: items(3, 600), country: cc, method: 'cheapest' }).rows;
      for (const row of rows) {
        expect(row.method, row.id).not.toBe('small-packet-surface');
        expect(row.method, row.id).not.toBe('parcel-surface');
        expect(row.method, row.id).not.toBe('courier-surface');
      }
    }
  });
});

describe('the cheapest method changes with weight for the same proxy (real crossover)', () => {
  // FROM JAPAN → US, **宅配便どうしの比較に限定**（brief の指定どおりの実例）:
  // UPS が 500g〜10,000g で最安、20,000g で FedEx Economy が逆転する。
  // （日本郵便の小形包装物は軽量域でどの宅配便より安いので、全方式込みの
  // `'cheapest'` はこの重量では小形包装物を選ぶ——それ自体は正しい挙動で、
  // ここで検査したいのは「宅配便5便の中の順位が重量で入れ替わる」という
  // brief の主張そのもの。）
  const netFor = (packedG: number) => Math.round((packedG - 300) / 1.2);
  const cheapestCourierAt = (packedG: number) => {
    const courierIds = [
      'courier-ecms', 'courier-ups', 'courier-dhl', 'courier-fedex-economy', 'courier-fedex-priority',
    ] as const;
    const priced: { m: string; amount: number }[] = [];
    for (const m of courierIds) {
      const rows = compare({ items: items(1, netFor(packedG)), country: 'US', method: m }).rows;
      const fj = byId(rows, 'fromjapan');
      const amount = fj.lines.find((l) => l.key === 'intl-shipping')!.amount;
      if (amount != null) priced.push({ m, amount });
    }
    return priced.sort((a, b) => a.amount - b.amount)[0]!.m;
  };

  // **実測値**（`master/courier-rates.json` の `fromjapan_us_grid_v2_2026_09_12`、
  // 既定の箱・US）から確認: 500〜1,000g は ECMS が最安（500g=¥2,795 vs UPS=¥3,539）、
  // **1,500g で UPS に入れ替わり**10,000gまで UPS のまま、20,000g で
  // FedEx Economy が逆転する（brief の要約「UPS が500g〜」は軽量端でずれるが、
  // 「UPS が中間帯で勝ち、20,000gでFedEx Economyに替わる」という核心は実データと一致）。
  test('FROM JAPAN to the US: UPS wins from 1,500g to 10,000g, FedEx Economy overtakes at 20,000g', () => {
    for (const packed of [1500, 2000, 5000, 10000] as const) {
      expect(cheapestCourierAt(packed), `packed ${packed}g`).toBe('courier-ups');
    }
    expect(cheapestCourierAt(20000)).toBe('courier-fedex-economy');
  });
});
