import { describe, expect, test } from 'vitest';
import { compare } from './compare';
import { markupYen } from './postage';
import {
  EXPORT_DECLARATION_FEE_SOURCE, EXPORT_DECLARATION_FEE_YEN,
  SERVICES, SERVICES_CHECKED_ON, SERVICE_BY_ID, type Service,
} from './services';
import type { Item, Line, Row, SiteId } from './types';

// 出品サイトは Jauce と ZenMarket で料金が変わる。全サイトを一度に回すために並べておく。
const SITES: SiteId[] = [
  'yahoo-auctions', 'mercari', 'rakuten', 'yahoo-shopping', 'amazon-jp',
  'suruga-ya', 'mandarake', 'zozo', 'hmv', 'toranoana', 'other',
];

function item(over: Partial<Item> & { id: string }): Item {
  return {
    title: over.id, priceYen: 10000, priceTier: 'fixed', site: 'yahoo-auctions',
    weightG: 600, weightTier: 'estimate', qty: 1, ...over,
  };
}
const rowsFor = (items: Item[]) => compare({ items, country: 'US' }).rows;
const byService = (rows: Row[], serviceId: string): Row =>
  rows.find((r) => r.serviceId === serviceId) ?? (() => { throw new Error(`no row ${serviceId}`); })();
const line = (row: Row, key: string): Line =>
  row.lines.find((l) => l.key === key) ?? (() => { throw new Error(`no line ${key} in ${row.id}`); })();
const amount = (row: Row, key: string) => row.lines.find((l) => l.key === key)?.amount;
const one = (serviceId: string, over: Partial<Item> = {}) =>
  byService(rowsFor([item({ id: 'a', ...over })]), serviceId);
const svc = (id: string): Service =>
  SERVICE_BY_ID.get(id) ?? (() => { throw new Error(`no service ${id}`); })();

describe('the service table itself', () => {
  test('five services, unique ids, and every rate cited from the company that charges it', () => {
    expect(SERVICES.map((s) => s.id)).toEqual(['neokyo', 'zenmarket', 'fromjapan', 'buyee', 'jauce']);
    expect(new Set(SERVICES.map((s) => s.id)).size).toBe(SERVICES.length);
    for (const s of SERVICES) {
      expect(s.url).toMatch(/^https:\/\//);
      expect(s.sourceUrl).toMatch(/^https:\/\//);
      // 一次情報とは「その社自身が公開したページ」のこと。まとめ記事を引いたら primarySource は嘘になる。
      expect(new URL(s.sourceUrl!).host).toBe(new URL(s.url).host);
      expect(s.primarySource).toBe(true);
    }
  });

  test('every fee line carries the page it came from, so a wrong number can be traced', () => {
    for (const s of SERVICES) {
      const row = one(s.id);
      // items / domestic-shipping は我々の入力と仮定なので出所は無い。社が請求する行には必ず出所が要る。
      const ours = new Set(['items', 'domestic-shipping']);
      for (const l of row.lines) {
        if (ours.has(l.key)) continue;
        expect(l.sourceUrl, `${s.id} / ${l.key}`).toBeTruthy();
      }
      const feeKeys = ['service-fee', 'purchase-fee', 'protection-plan', 'ad-valorem',
        'bank-fee', 'payment-inside-jp', 'packing', 'deposit'];
      for (const l of row.lines.filter((x) => feeKeys.includes(x.key))) {
        expect(l.sourceUrl, `${s.id} / ${l.key}`).toBe(s.sourceUrl);
      }
    }
  });

  test('the table records the day it was checked, and that day is not in the future', () => {
    // 料金を触ったらこの日付も動かす。動いていない表は「いつのものか分からない表」。
    expect(SERVICES_CHECKED_ON).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const checked = new Date(`${SERVICES_CHECKED_ON}T00:00:00Z`);
    expect(Number.isNaN(checked.getTime())).toBe(false);
    expect(checked.getTime()).toBeLessThanOrEqual(Date.now());
  });

  test('nobody marks up the published EMS rate — measured at all five, 2026-09-07', () => {
    // **5社とも ¥3,400 で公表額と1円まで一致した**（ドイツ宛 600g、公開計算機）。
    // これが「各社は公表額をそのまま転嫁している」という仮定の裏付けで、
    // 総額の 8〜24% がこの仮定に乗っている。だから確度は全社 `fixed`。
    for (const s of SERVICES) {
      const ems = s.postage.ems;
      expect(ems, `${s.id} が EMS を売っていない`).toBeDefined();
      expect(ems!.markup, s.id).toEqual({ kind: 'none' });
      expect(ems!.tier, s.id).toBe('fixed');
      expect(ems!.checkedOn, s.id).toBe('2026-09-07');
    }
  });

  test('the markup is per method and per country, and its shape came from the data', () => {
    // 以前は社ごとに1つの率だった。**フェーズ2（105見積）でどちらも崩れた。**
    // Jauce の船便は率で見ると 10.0% → 16.1% → 25.5% と動くが、
    // **kg段で割ると3点とも 250**。率ではなく「1kg 段ごとの定額」だった。
    const jauce = svc('jauce').postage['parcel-surface']!;
    expect(jauce.markup).toEqual({ kind: 'per-kg-step', yen: 250 });
    // **形が3点で決まったので確度は fixed。**推定のままにしない。
    expect(jauce.tier).toBe('fixed');
    expect(markupYen(jauce, 'DE', 600)).toBe(250);
    expect(markupYen(jauce, 'DE', 2000)).toBe(500);
    expect(markupYen(jauce, 'DE', 5000)).toBe(1250);

    // ZenMarket の国際小包は **US だけ**上乗せがある。他国は公表額どおり。
    const zenAir = svc('zenmarket').postage['parcel-air']!;
    expect(zenAir.markup).toEqual({ kind: 'none' });
    expect(markupYen(zenAir, 'DE', 5000)).toBe(0);
    expect(markupYen(zenAir, 'US', 600)).toBe(350);
    expect(markupYen(zenAir, 'US', 5000)).toBe(1750);
    const zenSea = svc('zenmarket').postage['parcel-surface']!;
    expect(markupYen(zenSea, 'DE', 5000)).toBe(0);
    expect(markupYen(zenSea, 'US', 5000)).toBe(500);
  });

  test('the one markup whose shape is unknown says so, and is not dressed up as a rate', () => {
    // **小形包装物は上限 2kg なので観測が2点しか取れない。**
    // 2点は必ず直線で結べるので「直線だ」は発見ではない。だから確度は estimate。
    const sp = svc('zenmarket').postage['small-packet-air']!;
    expect(sp.tier).toBe('estimate');
    expect(sp.markup.kind).toBe('observed');
    // 観測点そのものは再現する。
    expect(markupYen(sp, 'DE', 600)).toBe(637);
    expect(markupYen(sp, 'DE', 2000)).toBe(1015);
    expect(markupYen(sp, 'US', 600)).toBe(1281);
    expect(markupYen(sp, 'US', 2000)).toBe(2142);
    expect(markupYen(sp, 'SG', 600)).toBe(572);
    expect(markupYen(sp, 'SG', 2000)).toBe(824);
    // **国で違う。**1つの率で持っていたら US は半分しか乗らなかった。
    expect(markupYen(sp, 'US', 600)).toBeGreaterThan(markupYen(sp, 'DE', 600));
    // 観測の外は端を延ばす。**知らない範囲に勝手な曲線を引かない。**
    expect(markupYen(sp, 'DE', 100)).toBe(637);
    expect(markupYen(sp, 'DE', 1300)).toBeGreaterThan(637);
    expect(markupYen(sp, 'DE', 1300)).toBeLessThan(1015);
  });

  test('every markup that is not none carries what was observed', () => {
    for (const s of SERVICES) {
      for (const [m, r] of Object.entries(s.postage)) {
        const any = [r.markup, ...Object.values(r.byCountry ?? {})]
          .some((k) => k.kind !== 'none');
        if (any) expect(r.observed, `${s.id} ${m} に観測の中身が無い`).toBeTruthy();
      }
    }
  });

  test('the method line-up differs by service, and we do not invent methods they do not sell', () => {
    // 全社が全方式を出すことにしていたのは嘘だった（実測）。
    const count = (id: string) => Object.keys(svc(id).postage).length;
    expect(count('fromjapan')).toBe(5);
    expect(count('buyee')).toBe(4);
    expect(count('zenmarket')).toBe(4);
    expect(count('neokyo')).toBe(3);
    expect(count('jauce')).toBe(2);
    // Neokyo と Jauce は小形包装物を売っていない。**キーが無いことがその表明。**
    expect(svc('neokyo').postage['small-packet-air']).toBeUndefined();
    expect(svc('jauce').postage['small-packet-air']).toBeUndefined();
    expect(svc('jauce').postage['parcel-air']).toBeUndefined();
    // どの社も EMS は売っている。
    for (const s of SERVICES) expect(s.postage.ems, s.id).toBeDefined();
  });

  test('every rate carries the screen it was read from, and the company own wording', () => {
    for (const s of SERVICES) {
      for (const [m, r] of Object.entries(s.postage)) {
        expect(r.sourceUrl, `${s.id} ${m}`).toMatch(/^https:\/\//);
        expect(r.checkedOn, `${s.id} ${m}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        // **原文の呼び方を訳さずに持つ。**「Small Packet」を「小形包装物」に直すと、
        // その社がどう呼んでいるかが消える。
        expect(r.labelRaw.length, `${s.id} ${m}`).toBeGreaterThan(2);
      }
    }
  });

  test('who pays us is recorded, and the cheapest row is still allowed to pay us nothing', () => {
    expect(svc('neokyo').paysUs).toBe(false);
    expect(svc('jauce').paysUs).toBe(false);
    expect(svc('jauce').referralNote).toBeNull();
    for (const id of ['zenmarket', 'fromjapan', 'buyee']) {
      expect(svc(id).paysUs).toBe(true);
      expect(svc(id).referralNote).toBeTruthy();
    }
    // 5点 ¥3,000 200g では Neokyo が最安。**報酬を1円も払わない社が1位に立てること**が、
    // 順位が総額だけで決まっている証拠。
    // **宛先が米国からドイツに変わった。**Neokyo は米国宛に日本郵便を売っていないので
    // 米国の盤面に居らず、残る報酬ゼロの社（Jauce）はそこで最安にならない。
    // つまり「報酬ゼロの社が1位に立てる」は米国では実演できない。
    const rows = compare({
      items: Array.from({ length: 5 }, (_, i) => item({ id: `i${i}`, priceYen: 3000, weightG: 200 })),
      country: 'DE',
    }).rows;
    expect(rows[0]!.serviceId).toBe('neokyo');
    expect(rows[0]!.paysUs).toBe(false);
    expect(rows.map((r) => r.total)).toEqual([...rows.map((r) => r.total)].sort((a, b) => a - b));
  });

  test('Buyee alone ships per order, and nobody folds domestic shipping into their fee', () => {
    expect(SERVICES.filter((s) => s.parcelDefault === 'per-order').map((s) => s.id)).toEqual(['buyee']);
    expect(SERVICES.filter((s) => s.consolidationOnRequest).map((s) => s.id)).toEqual(['buyee']);
    // Neokyo の公式は「(商品代＋国内送料) ＋ ¥350」。¥350 に国内送料は入っていない。
    // ここが true に戻ると Neokyo だけ国内送料 ¥800/点 を無料にして不当に安く見える。
    expect(SERVICES.filter((s) => s.domesticIncluded).map((s) => s.id)).toEqual([]);
  });

  test('only ZenMarket and Jauce take a cut of the money you send them', () => {
    expect(SERVICES.filter((s) => s.deposit).map((s) => s.id)).toEqual(['zenmarket', 'jauce']);
    expect(SERVICES.filter((s) => s.packing?.mandatory).map((s) => s.id)).toEqual(['neokyo', 'jauce']);
  });

  test('ZenMarket is the only unverified parcel assumption', () => {
    expect(SERVICES.filter((s) => !s.parcelVerified).map((s) => s.id)).toEqual(['zenmarket']);
  });

  test("a number we do not have is never shown as ¥0 — tier 'none' always means null", () => {
    // 未取得（none）を 0 で埋めると総額が安い方向に嘘をつく。逆に null なのに tier が
    // 付いていると「取れているのに 0」と読めてしまう。両方向を塞ぐ。
    for (const country of ['US', 'GB', 'DE', 'FR', 'AU', 'CA', 'SG'] as const) {
      for (const weightG of [200, 3000, 30000]) {
        const rows = compare({
          items: [item({ id: 'a', weightG, priceYen: 200000 }), item({ id: 'b', weightG, site: 'rakuten' })],
          country,
        }).rows;
        for (const r of rows) {
          for (const l of r.lines) {
            if (l.tier === 'none') expect(l.amount, `${country} ${r.id} ${l.key}`).toBeNull();
            if (l.amount === null) {
              expect(l.tier, `${country} ${r.id} ${l.key}`).toBe('none');
              // 総額から漏れている費目は行の excluded に必ず出す。安く見えている理由を隠さない。
              expect(r.excluded).toContain(l.label);
            }
          }
        }
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T21: 任意欄が、各社の原文一覧（docs/audit/fees.md）と一致すること。
// 任意欄は総額に入らないので静かに腐る。**費目の在り／無しを社ごとに固定する。**
// ─────────────────────────────────────────────────────────────────────────────
describe('the optional extras match what each company publishes', () => {
  const keysOf = (serviceId: string) => one(serviceId).optionalLines.map((l) => l.key).sort();
  const optional = (serviceId: string, key: string, over: Partial<Item> = {}): Line =>
    one(serviceId, over).optionalLines.find((l) => l.key === key)
    ?? (() => { throw new Error(`no optional ${key} for ${serviceId}`); })();

  test('each service offers exactly the extras its own page lists', () => {
    // 0b: 輸出通関手数料は任意欄から総額（`lines`）へ移した。もう optionalLines には無い。
    // 0d: 保管料（storage）も同じ理由で任意欄から総額（`lines`）へ移した。
    expect(keysOf('neokyo')).toEqual(['konbini', 'unpacking']);
    expect(keysOf('zenmarket')).toEqual(['photos', 'repack']);
    expect(keysOf('fromjapan')).toEqual([
      'konbini', 'outsourced-packing', 'photos', 'repack',
    ]);
    expect(keysOf('buyee')).toEqual([
      'photos', 'protective-packing', 'special-packing',
    ]);
    expect(keysOf('jauce')).toEqual([
      'customized-processing', 'expedited', 'fragile-packing',
      'photos', 'premium-insurance',
    ]);
  });

  test('the ¥200,000 export clearance fee is a total line on every service that ships by Japan Post', () => {
    // 0b: 以前は任意欄で FROM JAPAN と Buyee にしか無かった。同じ EMS を使う5社で
    // 費目の在り無しが分かれていたら、それは料金差ではなく我々の調査量の差である。
    // いまは総額の行（`lines`）として5社すべてに条件判定つきで出る。
    // 額は日本郵便の「輸出申告代行手数料 2,800円／件」＝一次情報なので5社とも fixed。
    expect(EXPORT_DECLARATION_FEE_YEN).toBe(2800);
    // ¥200,000 ちょうどの商品代 → ¥0（超えていない）
    const at = rowsFor([item({ id: 'a', priceYen: 200000 })]);
    for (const r of at) {
      expect(line(r, 'export-clearance').amount, r.serviceId).toBe(0);
      expect(line(r, 'export-clearance').tier, r.serviceId).toBe('fixed');
    }
    // ¥200,001 → ¥2,800（超えた）
    const over = rowsFor([item({ id: 'a', priceYen: 200001 })]);
    for (const r of over) {
      expect(line(r, 'export-clearance').amount, r.serviceId).toBe(EXPORT_DECLARATION_FEE_YEN);
      expect(line(r, 'export-clearance').sourceUrl, r.serviceId).toBe(EXPORT_DECLARATION_FEE_SOURCE);
    }
    // 申告1件あたりで、個口あたりではない（原文「全ての梱包を合わせて1件となります」）。
    // Buyee は注文ごとに別送で個口が複数になるが、ここを取り違えると3点で ¥8,400 になる。
    const threeParcels = rowsFor([
      item({ id: 'a', priceYen: 200001 }), item({ id: 'b', priceYen: 1 }), item({ id: 'c', priceYen: 1 }),
    ]).find((r) => r.id === 'buyee:default')!;
    expect(threeParcels.parcels).toBe(3);
    expect(line(threeParcels, 'export-clearance').amount).toBe(2800);
  });

  test('Neokyo unpacking is ¥1,000 plus that parcel packing fee, not a flat ¥1,000', () => {
    // 原文の例:「500¥ Packing Fee, 1500¥ Unpacking Fee」。
    expect(optional('neokyo', 'unpacking', { weightG: 200 }).amount).toBe(1500);  // packing 500
    expect(optional('neokyo', 'unpacking', { weightG: 3000 }).amount).toBe(1800); // packing 800
    expect(optional('neokyo', 'unpacking').note).toContain('plus the packing fee');
  });

  test('Jauce fragile packing is ¥600 per package + ¥240/kg, and says what it replaces', () => {
    // 梱包後 1,020 g → 2 kg 開始 → 600 + 480。必須の Smart Packing は 300 + 240 = ¥540。
    const l = optional('jauce', 'fragile-packing', { weightG: 600 });
    expect(l.amount).toBe(1080);
    expect(amount(one('jauce', { weightG: 600 }), 'packing')).toBe(540);
    expect(l.note).toContain('instead of the Smart Packing already in the total');
  });

  test('Jauce premium insurance is offered without a number, because the base is not published', () => {
    const l = optional('jauce', 'premium-insurance');
    expect(l.amount).toBeNull();
    expect(l.tier).toBe('none');
    expect(l.note).toContain('1.9%');
  });

  test('Jauce expedited shipping follows the parcel weight', () => {
    expect(optional('jauce', 'expedited', { weightG: 600 }).amount).toBe(360); // 200 + 80×2kg
  });

  test('Buyee photo service is per package, so a split order pays it twice', () => {
    const split = rowsFor([item({ id: 'a' }), item({ id: 'b' })])
      .find((r) => r.id === 'buyee:default')!;
    expect(split.optionalLines.find((l) => l.key === 'photos')!.amount).toBe(600);
    expect(optional('buyee', 'photos').amount).toBe(300);
  });

  test('an optional fee we do not have an amount for is — and never ¥0', () => {
    // 総額の行と同じ規律を任意欄にも掛ける。「実費」「率の基数が不明」を 0 で埋めると、
    // 掛かる社を掛からない社として見せることになる。
    for (const s of SERVICES) {
      for (const l of one(s.id).optionalLines) {
        if (l.tier === 'none') expect(l.amount, `${s.id} ${l.key}`).toBeNull();
        if (l.amount === null) expect(l.tier, `${s.id} ${l.key}`).toBe('none');
        // 額が無い行は、なぜ無いかを note で言う。ラベルだけの「—」は読めない。
        if (l.amount === null) expect(l.note.length, `${s.id} ${l.key}`).toBeGreaterThan(0);
      }
    }
    expect(optional('fromjapan', 'outsourced-packing').amount).toBeNull();
    expect(optional('fromjapan', 'outsourced-packing').note).toContain('actual cost');
  });

  test('no optional line repeats a fee that is already in the total', () => {
    for (const s of SERVICES) {
      const row = one(s.id);
      const lineKeys = new Set(row.lines.map((l) => l.key));
      for (const l of row.optionalLines) {
        expect(lineKeys.has(l.key), `${s.id} ${l.key}`).toBe(false);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T19 / ロードマップ 0d: 保管超過（F21）。**利用者が選ぶ費目ではない**
// （区分 C_conditional_no_input）ので、任意欄ではなく総額の行にする。日数の入力欄が
// 足りなかっただけで、5社ぶんのルールはそろっている。既定は45日
// （`DEFAULT_STORAGE_DAYS`、docs/FEE-ITEMS.md §5 R2）。
// ─────────────────────────────────────────────────────────────────────────────
describe('storage is a total line for every service (0d)', () => {
  const storageOf = (serviceId: string, storageDays?: number, over: Partial<Item> = {}): Line => {
    const row = byService(
      compare({ items: [item({ id: 'a', ...over })], country: 'US', storageDays }).rows,
      serviceId,
    );
    return row.lines.find((l) => l.key === 'storage')
      ?? (() => { throw new Error(`no storage line for ${serviceId}`); })();
  };

  test('all five carry a storage line in the total, and none of it is in optionalLines', () => {
    for (const s of SERVICES) {
      const row = one(s.id);
      const storage = storageOf(s.id);
      expect(storage.label, s.id).toMatch(/^Storage/);
      expect(storage.sourceUrl, s.id).toMatch(/^https:\/\//);
      expect(row.optionalLines.some((l) => l.key === 'storage'), s.id).toBe(false);
      expect(row.total, s.id).toBe(row.lines.reduce((a, l) => a + (l.amount ?? 0), 0));
    }
  });

  test('each label names the free period and the unit it is charged in', () => {
    expect(storageOf('neokyo').label).toBe('Storage, per week after 45 free days');
    expect(storageOf('zenmarket').label).toBe('Storage, per day after 60 free days');
    expect(storageOf('fromjapan').label).toBe('Storage after 60 free days');
    expect(storageOf('buyee').label).toBe('Storage, per day after 30 free days');
    expect(storageOf('jauce').label).toBe('Storage after 60 free days');
  });

  // ── 既定45日: 無料期間が短い Buyee だけに課金が乗り、他4社は「正当な¥0」 ──────
  test('at the default 45 days, only Buyee is charged — the other four are a sourced ¥0, tier fixed', () => {
    for (const s of SERVICES) {
      const storage = storageOf(s.id);
      if (s.id === 'buyee') {
        expect(storage.amount, s.id).toBeGreaterThan(0);
      } else {
        expect(storage.amount, s.id).toBe(0);
      }
      // 取得できた0（またはBuyeeの確定額）であって未取得の「—」ではない。
      expect(storage.tier, s.id).toBe('fixed');
    }
  });

  // ── 境界値 ──────────────────────────────────────────────────────────────
  test('Buyee: ¥0 at 30 days, charged at 31 days', () => {
    expect(storageOf('buyee', 30).amount).toBe(0);
    expect(storageOf('buyee', 30).note).toContain('free for the first 30 days');
    expect(storageOf('buyee', 31).amount).toBeGreaterThan(0);
  });

  test('Neokyo: ¥0 at 45 days, charged at 46 days', () => {
    expect(storageOf('neokyo', 45).amount).toBe(0);
    expect(storageOf('neokyo', 46).amount).toBe(350);
  });

  test('ZenMarket / FROM JAPAN: ¥0 at 60 days, charged (or not) at 61 days', () => {
    expect(storageOf('zenmarket', 60).amount).toBe(0);
    expect(storageOf('zenmarket', 61).amount).toBe(50);
    expect(storageOf('fromjapan', 60).amount).toBe(0);
    // FROM JAPAN には有料延長がそもそも無いので、61日でも¥0のまま。
    expect(storageOf('fromjapan', 61).amount).toBe(0);
  });

  test('Jauce: ¥0 at 60 days (tier fixed), null from 61 days (tier none)', () => {
    const at60 = storageOf('jauce', 60);
    expect(at60.amount).toBe(0);
    expect(at60.tier).toBe('fixed');
    const at61 = storageOf('jauce', 61);
    expect(at61.amount).toBeNull();
    expect(at61.tier).toBe('none');
    expect(at61.note).toContain('does not publish the amount');
    // ¥700 を上限として扱わない・参考値を点推定に使わない、という判断がここに出る。
    expect(at61.note).toContain('not a ceiling');
  });

  // ── Buyee の重量帯 ──────────────────────────────────────────────────────
  test('Buyee charges by parcel weight band (10kg / 20kg / above)', () => {
    // 原文の表: ～10,000g ¥100/日、10,001〜20,000g ¥200/日、20,001g〜 ¥300/日。
    // 梱包後重量 = net × 1.2 + 300 g。1日ぶん（31日、無料30日超過1日）で額を見る。
    expect(storageOf('buyee', 31, { weightG: 600 }).amount).toBe(100);    // gross 1,020 g
    expect(storageOf('buyee', 31, { weightG: 8083 }).amount).toBe(100);   // gross 10,000 g ちょうど
    expect(storageOf('buyee', 31, { weightG: 8084 }).amount).toBe(200);   // gross 10,001 g
    expect(storageOf('buyee', 31, { weightG: 20000 }).amount).toBe(300); // gross 24,300 g
  });

  test('Buyee counts every parcel: two orders in the split row are two daily fees', () => {
    const split = compare({
      items: [item({ id: 'a' }), item({ id: 'b' })], country: 'US', storageDays: 31,
    }).rows.find((r) => r.id === 'buyee:default')!;
    expect(split.parcels).toBe(2);
    expect(split.lines.find((l) => l.key === 'storage')!.amount).toBe(200);
  });

  test('ZenMarket charges per item, so three items is ¥150 a day', () => {
    expect(storageOf('zenmarket', 61).amount).toBe(50);
    expect(storageOf('zenmarket', 61, { qty: 3 }).amount).toBe(150);
  });

  test('Neokyo charges per order, prints the smallest size step and says the rest of the range', () => {
    // 寸法は入力に無い。一番小さい段を出し、幅と「あなたの寸法は分からない」を note に書く。
    const storage = storageOf('neokyo', 46);
    expect(storage.amount).toBe(350);
    expect(storage.tier).toBe('fixed');
    expect(storage.note).toContain('¥1,400 large');
    expect(storage.note).toContain('We do not know your parcel size');
  });

  test('FROM JAPAN: ¥0 no matter how many days, but a discard warning past 60', () => {
    // help_logistics_110「it will be discarded. The storage period cannot be extended.」
    // 金額が¥0だから安全、ではない——60日を超えたら商品が廃棄される。
    expect(storageOf('fromjapan', 45).amount).toBe(0);
    expect(storageOf('fromjapan', 400).amount).toBe(0);
    expect(storageOf('fromjapan', 60).note).not.toContain('discarded');
    expect(storageOf('fromjapan', 61).note).toContain('discarded');
  });

  test('Jauce: past 120 days the note still warns about disposal even though the amount is null', () => {
    const at130 = storageOf('jauce', 130);
    expect(at130.amount).toBeNull();
    expect(at130.tier).toBe('none');
    expect(at130.note).toContain('abandoned');
  });

  // ── 90日／120日の上限 ───────────────────────────────────────────────────
  test('Buyee and ZenMarket cap billing at the 90-day maximum instead of billing past it', () => {
    const cappedBuyee = storageOf('buyee', 90);
    const overBuyee = storageOf('buyee', 200);
    expect(overBuyee.amount).toBe(cappedBuyee.amount); // 200日でも90日ぶんで頭打ち
    expect(overBuyee.note).toContain('capped at 90 days');

    const cappedZen = storageOf('zenmarket', 90);
    const overZen = storageOf('zenmarket', 200);
    expect(overZen.amount).toBe(cappedZen.amount);
    expect(overZen.note).toContain('capped at 90 days');
  });

  test('Jauce caps at 120 days — the amount stays null but the note names the maximum', () => {
    const at120 = storageOf('jauce', 120);
    const at500 = storageOf('jauce', 500);
    expect(at120.amount).toBeNull();
    expect(at500.amount).toBeNull();
    expect(at500.note).toContain('capped at 120 days');
  });

  test('excluded lists the storage label when Jauce cannot price it', () => {
    const row = byService(
      compare({ items: [item({ id: 'a' })], country: 'US', storageDays: 61 }).rows, 'jauce',
    );
    expect(row.excluded).toContain('Storage after 60 free days');
  });
});

describe('Neokyo — ¥350 per item, charged on top of the domestic shipping', () => {
  test('the ¥350 does not swallow the domestic shipping', () => {
    const row = one('neokyo');
    expect(amount(row, 'service-fee')).toBe(350);
    expect(line(row, 'service-fee').note).not.toMatch(/domestic/i);
    const dom = line(row, 'domestic-shipping');
    expect(dom.amount).toBe(800);   // 我々の仮定 ASSUMED_DOMESTIC_SHIPPING_YEN
    expect(dom.tier).toBe('estimate');
  });

  test('the fee counts distinct items — three of the same listing is still one ¥350', () => {
    expect(amount(one('neokyo', { qty: 3 }), 'service-fee')).toBe(350);
    expect(line(one('neokyo', { qty: 3 }), 'service-fee').note).toContain('same item counted once');
  });

  test('three different listings are three fees and three domestic shipments', () => {
    const three = byService(rowsFor([item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' })]), 'neokyo');
    expect(amount(three, 'service-fee')).toBe(1050);
    expect(amount(three, 'domestic-shipping')).toBe(2400);
  });

  test('the fee is the same ¥350 whatever shop the item came from', () => {
    for (const site of SITES) expect(amount(one('neokyo', { site }), 'service-fee'), site).toBe(350);
  });

  test('packing is ¥500 up to 2 kg, then ¥150 per started kg — the 2 kg mark itself is free', () => {
    // 梱包後重量 = net × 1.2 + 300 g で判定する。
    const pack = (weightG: number) => amount(one('neokyo', { weightG }), 'packing');
    expect(pack(200)).toBe(500);   // gross 540 g
    expect(pack(1417)).toBe(500);  // gross 2,000 g ちょうど。まだ超過ではない
    expect(pack(1418)).toBe(650);  // gross 2,002 g → 1 kg 超過
    expect(pack(3000)).toBe(800);  // gross 3,900 g → 2 kg 超過（切り上げ）
    expect(pack(5000)).toBe(1250); // gross 6,300 g → 5 kg 超過
  });

  test('no deposit fee at Neokyo', () => {
    expect(svc('neokyo').deposit).toBeNull();
    expect(one('neokyo').lines.some((l) => l.key === 'deposit')).toBe(false);
  });
});

describe('ZenMarket — ¥500 per item, ¥800 only where the company says ¥800', () => {
  test('Yahoo! Auctions and Mercari cost ¥800, every other shop ¥500', () => {
    // 原文は「500 yen … Amazon, Rakuten, and most other stores / 800 yen … all Mercari
    // items and JDirectItems Auction bids」。一律 ¥800 にすると ZenMarket を不当に高く見せる。
    const expected: Record<string, number> = { 'yahoo-auctions': 800, mercari: 800 };
    for (const site of SITES) {
      expect(amount(one('zenmarket', { site }), 'service-fee'), site).toBe(expected[site] ?? 500);
    }
  });

  test('three identical T-shirts are still one service fee', () => {
    const row = one('zenmarket', { site: 'mercari', qty: 3 });
    expect(amount(row, 'service-fee')).toBe(800);
    expect(line(row, 'service-fee').note).toContain('same item counted once');
  });

  test('a mixed basket names both rates instead of hiding one', () => {
    const row = byService(rowsFor([item({ id: 'a', site: 'rakuten' }), item({ id: 'b' })]), 'zenmarket');
    expect(amount(row, 'service-fee')).toBe(1300);
    // 'b' はデフォルトの yahoo-auctions なので、行には推論の根拠が付く（T-F11a）
    expect(line(row, 'service-fee').note).toBe(
      '¥500 / ¥800 by shop, 2 charged'
      + " — ZenMarket's fee page prices Mercari and JDirectItems Auction at ¥800 and"
      + ' never names Yahoo Auctions; we read JDirectItems Auction as Yahoo Auctions',
    );
    // ヤフオクの item が混じっているので行全体の確度は estimate に落ちる
    expect(line(row, 'service-fee').tier).toBe('estimate');
  });

  test('a Mercari-only basket keeps the service-fee line fixed', () => {
    const row = byService(rowsFor([item({ id: 'a', site: 'mercari' })]), 'zenmarket');
    expect(line(row, 'service-fee').tier).toBe('fixed');
  });

  test('a Yahoo!-Auctions-only basket marks the service-fee line as estimate', () => {
    const row = byService(rowsFor([item({ id: 'a', site: 'yahoo-auctions' })]), 'zenmarket');
    expect(line(row, 'service-fee').tier).toBe('estimate');
  });

  // 3.5% は「送金合計に対する率」なので gross-up。base × r / (1 - r) であって base × r ではない。
  test('a ¥10,590 subtotal costs ¥384, not the ¥371 a naive percentage gives', () => {
    // items 5,610 + fee 800 + domestic 0 + EMS 4,180 = 10,590
    const row = one('zenmarket', { priceYen: 5610, weightG: 200, domesticShippingYen: 0 });
    expect(amount(row, 'items')).toBe(5610);
    expect(amount(row, 'intl-shipping')).toBe(4180);
    expect(amount(row, 'deposit')).toBe(384);
    expect(Math.round(10590 * 0.035)).toBe(371); // 素の率で計算したときの値。これではない。
  });

  test('a ¥10,000 subtotal costs ¥363 — the published ¥10,363 charge, off by one yen', () => {
    // items 5,020 + fee 800 + domestic 0 + EMS 4,180 = 10,000
    const row = one('zenmarket', { priceYen: 5020, weightG: 200, domesticShippingYen: 0 });
    expect(amount(row, 'deposit')).toBe(363);
  });

  test('the deposit is always the gross-up of the lines above it', () => {
    for (const priceYen of [1200, 8000, 25000, 140000]) {
      const row = one('zenmarket', { priceYen });
      const idx = row.lines.findIndex((l) => l.key === 'deposit');
      const base = row.lines.slice(0, idx).reduce((a, l) => a + (l.amount ?? 0), 0);
      expect(amount(row, 'deposit')).toBe(Math.round(base / (1 - 0.035) - base));
    }
  });

  test('the deposit sits after EMS and before the taxes, so it grosses up the shipping too', () => {
    const keys = one('zenmarket').lines.map((l) => l.key);
    expect(keys.indexOf('deposit')).toBeGreaterThan(keys.indexOf('intl-shipping'));
    expect(keys.indexOf('deposit')).toBeLessThan(keys.indexOf('duty'));
  });
});

describe('FROM JAPAN — ¥500 per item, and ¥200 only on a Yahoo! Auctions win', () => {
  test('the item fee counts distinct items, not units', () => {
    expect(amount(one('fromjapan', { qty: 3 }), 'service-fee')).toBe(500);
    const three = byService(rowsFor([item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' })]), 'fromjapan');
    expect(amount(three, 'service-fee')).toBe(1500);
  });

  test('the ¥200 is charged per auction won — three units of one auction is one ¥200', () => {
    expect(amount(one('fromjapan', { qty: 3 }), 'payment-inside-jp')).toBe(200);
    const three = byService(rowsFor([item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' })]), 'fromjapan');
    expect(amount(three, 'payment-inside-jp')).toBe(600);
    expect(line(three, 'payment-inside-jp').note).toContain('Yahoo! Auctions only');
  });

  test('outside Yahoo! Auctions the payment fee is a sourced ¥0, not an unknown', () => {
    // 2023-01-31 11:00 JST に他サイトの支払手数料は廃止された。廃止を知っている 0 なので
    // tier は fixed。ここが unverified や null に戻ったら「調べていない」の意味になる。
    for (const site of SITES.filter((s) => s !== 'yahoo-auctions')) {
      const l = line(one('fromjapan', { site }), 'payment-inside-jp');
      expect(l.amount, site).toBe(0);
      expect(l.tier, site).toBe('fixed');
    }
    expect(line(one('fromjapan'), 'payment-inside-jp').tier).toBe('fixed');
  });

  test('the mixed basket charges ¥200 only for the auction half', () => {
    const row = byService(rowsFor([item({ id: 'a', site: 'rakuten' }), item({ id: 'b' })]), 'fromjapan');
    expect(amount(row, 'service-fee')).toBe(1000);
    expect(amount(row, 'payment-inside-jp')).toBe(200);
  });

  test('the 5% / 10% FROM USA rate never touches Japanese items', () => {
    // ¥500/点 は定額。価格に比例する費目を足したら FROM JAPAN を不当に高く見せる。
    for (const priceYen of [1000, 100000, 1000000]) {
      const row = one('fromjapan', { priceYen });
      expect(amount(row, 'service-fee'), String(priceYen)).toBe(500);
      expect(row.lines.some((l) => l.key === 'ad-valorem'), String(priceYen)).toBe(false);
    }
  });

  test('the product protection plan is mandatory, so it is charged once and never offered twice', () => {
    // 原文 title_serviceRule_670:「Use of the Product Protection Plan is mandatory for all
    // items.」その ¥500/点 は service-fee として総額に入っている。任意欄にも同じ費目を
    // 並べていたので、同じ ¥500 を二度見せていた（docs/audit/fees.md §3 の「幻」）。
    const row = one('fromjapan');
    expect(amount(row, 'service-fee')).toBe(500);
    expect(row.optionalLines.map((l) => l.key)).not.toContain('protection');
    expect(row.optionalLines.some((l) => /protection/i.test(l.label))).toBe(false);
    expect(row.total).toBe(row.lines.reduce((a, l) => a + (l.amount ?? 0), 0));
  });
});

describe('Buyee — per order, and the domestic handling fee that never existed', () => {
  test('no service charges a line called domestic handling', () => {
    // 「Domestic handling ¥500」は日本国内の住所へ送るサービスの料金で、海外発送には無い。
    // 実在するのは注文ごとの保証プラン。ここが戻ると Buyee に架空の ¥500 を積むことになる。
    const rows = rowsFor([item({ id: 'a' }), item({ id: 'b' })]);
    for (const r of rows) expect(r.lines.some((l) => l.key === 'domestic-handling'), r.id).toBe(false);
  });

  test('the purchase fee and the protection plan are both per order, never per item', () => {
    const row = one('buyee', { qty: 3 });
    expect(amount(row, 'purchase-fee')).toBe(500);
    expect(amount(row, 'protection-plan')).toBe(500);
    expect(row.lines.some((l) => l.key === 'service-fee')).toBe(false);
  });

  test('three separate orders are charged three times, in both lines', () => {
    const row = rowsFor([item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' })])
      .find((r) => r.id === 'buyee:consolidated')!;
    expect(amount(row, 'purchase-fee')).toBe(1500);
    expect(amount(row, 'protection-plan')).toBe(1500);
    expect(line(row, 'purchase-fee').note).toBe('¥500 × 3 orders');
  });

  test('the protection plan we charge is the recommended one, and the breakdown says Lite is ¥0', () => {
    // 既定で一番高いプランを積んでいるのだから、¥0 の逃げ道があることを利用者に見せる。
    const l = line(one('buyee'), 'protection-plan');
    expect(l.note).toContain('Standard');
    expect(l.note).toContain('the Lite plan is ¥0');
  });

  test('the fee is the same whatever shop the item came from', () => {
    for (const site of SITES) {
      expect(amount(one('buyee', { site }), 'purchase-fee'), site).toBe(500);
      expect(amount(one('buyee', { site }), 'protection-plan'), site).toBe(500);
    }
  });

  // 原文:「Shopping: Order / flat rate ¥500 * Even if multiple purchases are from the
  // same store, it is a flat rate of ¥500.」店舗は出品URLから引く（shops.ts）。
  describe('shopping from the same store is one order', () => {
    const rakuten = (id: string, shop: string) =>
      item({ id, site: 'rakuten', url: `https://item.rakuten.co.jp/${shop}/${id}/` });

    test('two listings from one Rakuten shop are one ¥500, not two', () => {
      const row = byService(rowsFor([rakuten('a', 'book'), rakuten('b', 'book')]), 'buyee');
      expect(amount(row, 'purchase-fee')).toBe(500);
      expect(amount(row, 'protection-plan')).toBe(500);
      expect(line(row, 'purchase-fee').note).toContain('1 order');
      expect(line(row, 'purchase-fee').note).toContain('same-shop items count as one order');
    });

    test('two shops are still two orders', () => {
      const row = byService(rowsFor([rakuten('a', 'book'), rakuten('b', 'other')]), 'buyee');
      expect(amount(row, 'purchase-fee')).toBe(1000);
      expect(amount(row, 'protection-plan')).toBe(1000);
    });

    test('a whole-domain shop needs no URL: two Suruga-ya items are one order', () => {
      const row = byService(rowsFor([
        item({ id: 'a', site: 'suruga-ya' }), item({ id: 'b', site: 'suruga-ya' }),
      ]), 'buyee');
      expect(amount(row, 'purchase-fee')).toBe(500);
    });

    test('one order also means one parcel in the default (split) row', () => {
      // 個口が減れば EMS の段も変わる。まとめたのに個口だけ2つ残ったら内訳が矛盾する。
      const rows = rowsFor([rakuten('a', 'book'), rakuten('b', 'book')]);
      const split = rows.find((r) => r.id === 'buyee:default')!;
      expect(split.parcels).toBe(1);
      expect(split.tag).toBe('1 order · 1 parcel');
    });

    test('when we cannot read the shop we keep charging per listing — and say so', () => {
      // 店舗が読めない出品はまとめない。**この向きの誤りは Buyee を高く見せる**
      // （＝我々に報酬を払う社に不利）。黙って安くせず、まとめ損ねたことを内訳に書く。
      const row = byService(rowsFor([
        item({ id: 'a', site: 'other', url: 'https://example.com/1' }),
        item({ id: 'b', site: 'other', url: 'https://example.com/2' }),
      ]), 'buyee');
      expect(amount(row, 'purchase-fee')).toBe(1000);
      expect(line(row, 'purchase-fee').note).toContain('could not read the shop from 2 listings');
    });

    test('an auction basket says nothing about shops — per bid is the published rule', () => {
      // ヤフオク・メルカリは原文が「落札・購入1件ごとに ¥500」。ここに「店舗が読めなかった」
      // と書くと、欠落でないものを欠落として見せることになる。
      const row = byService(rowsFor([item({ id: 'a' }), item({ id: 'b' })]), 'buyee');
      expect(amount(row, 'purchase-fee')).toBe(1000);
      expect(line(row, 'purchase-fee').note).toBe('¥500 × 2 orders');
    });

    test('nobody else changes: the per-item services still charge per listing', () => {
      const items = [rakuten('a', 'book'), rakuten('b', 'book')];
      expect(amount(byService(rowsFor(items), 'neokyo'), 'service-fee')).toBe(700);
      expect(amount(byService(rowsFor(items), 'zenmarket'), 'service-fee')).toBe(1000);
      expect(amount(byService(rowsFor(items), 'fromjapan'), 'service-fee')).toBe(1000);
    });
  });
});

describe('Jauce — ¥400 + 8% on the auction site, ¥1,000 + 8% off it', () => {
  const jauce = (site: SiteId) => one('jauce', { site, priceYen: 10000, weightG: 600 });

  test('¥10,000 from Yahoo! Auctions: ¥400 service fee, ¥800 commission, ¥300 bank fee, ¥540 packing', () => {
    const row = jauce('yahoo-auctions');
    expect(amount(row, 'service-fee')).toBe(400);
    expect(amount(row, 'ad-valorem')).toBe(800);
    expect(amount(row, 'bank-fee')).toBe(300);
    expect(amount(row, 'packing')).toBe(540);
  });

  test('shops outside the auction site cost ¥1,000 per item, not ¥400', () => {
    // 駿河屋・まんだらけ・ZOZO・HMV・とらのあな・Amazon・その他は場外扱いで ¥1,000。
    const offAuction: SiteId[] = ['suruga-ya', 'mandarake', 'zozo', 'hmv', 'toranoana', 'amazon-jp', 'other'];
    for (const site of offAuction) {
      expect(amount(jauce(site), 'service-fee'), site).toBe(1000);
      expect(amount(jauce(site), 'ad-valorem'), site).toBe(800);
    }
    for (const site of ['yahoo-auctions', 'mercari'] as SiteId[]) {
      expect(amount(jauce(site), 'service-fee'), site).toBe(400);
    }
  });

  test('Jauce charges per unit — three of the same item is three fees', () => {
    // Neokyo / ZenMarket / FROM JAPAN と違い「同一商品は1回」の明記が無い。落札ごとに課金する。
    const row = one('jauce', { site: 'suruga-ya', qty: 3 });
    expect(amount(row, 'service-fee')).toBe(3000);
    expect(amount(row, 'ad-valorem')).toBe(2400);
  });

  test('Rakuten and Yahoo! Shopping are free in beta — but the bank fee and packing are not', () => {
    for (const site of ['rakuten', 'yahoo-shopping'] as SiteId[]) {
      const row = jauce(site);
      expect(amount(row, 'service-fee'), site).toBe(0);
      expect(amount(row, 'ad-valorem'), site).toBe(0);
      expect(amount(row, 'bank-fee'), site).toBe(300);
      expect(amount(row, 'packing'), site).toBe(540);
      expect(line(row, 'service-fee').note, site).toContain('1 free');
    }
  });

  test('a mixed basket charges only the chargeable item and says how many were free', () => {
    const row = byService(rowsFor([
      item({ id: 'a', site: 'rakuten', priceYen: 10000 }),
      item({ id: 'b', site: 'yahoo-auctions', priceYen: 10000 }),
    ]), 'jauce');
    expect(amount(row, 'service-fee')).toBe(400);
    expect(amount(row, 'ad-valorem')).toBe(800);   // 8% は課金対象の ¥10,000 だけに掛かる
    expect(line(row, 'ad-valorem').note).toContain('free in beta');
  });

  test('the banking fee is ¥300 per payment and scales with orders, not items', () => {
    // 公式の計算例（落札 ¥50,000 → 合計 ¥54,820）にも入っている実在の費目。
    expect(amount(one('jauce', { qty: 5 }), 'bank-fee')).toBe(300);
    const two = byService(rowsFor([item({ id: 'a' }), item({ id: 'b' })]), 'jauce');
    expect(amount(two, 'bank-fee')).toBe(600);
    expect(line(two, 'bank-fee').tier).toBe('fixed');
    expect(line(two, 'bank-fee').note).toContain('once per seller per day');
  });

  test('packing is ¥300 per parcel plus ¥120 per started kg from the first gram', () => {
    const pack = (weightG: number) => amount(one('jauce', { weightG }), 'packing');
    expect(pack(200)).toBe(420);   // gross 540 g   → 1 kg 開始
    expect(pack(600)).toBe(540);   // gross 1,020 g → 2 kg 開始
    expect(pack(3000)).toBe(780);  // gross 3,900 g → 4 kg 開始
    expect(pack(5000)).toBe(1140); // gross 6,300 g → 7 kg 開始
  });

  test('the deposit is ¥40 flat then a 3.9% gross-up, and is still flagged unverified', () => {
    const row = one('jauce');
    const idx = row.lines.findIndex((l) => l.key === 'deposit');
    const base = row.lines.slice(0, idx).reduce((a, l) => a + (l.amount ?? 0), 0) + 40;
    expect(amount(row, 'deposit')).toBe(Math.round(40 + (base / (1 - 0.039) - base)));
    // 原文未確認の解釈。fixed に格上げするなら先に原文を取ること。
    expect(row.lines[idx]!.tier).toBe('unverified');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// **額の出どころが社のページでない費目は、そちらを指す。**
// 輸出申告代行手数料 ¥2,800 は日本郵便の額で、代行各社は取次いでいるだけ。
// 社のページを出典に立てると、額を社が決めているように読める。
// ─────────────────────────────────────────────────────────────────────────────
describe('an optional fee points at whoever sets the amount', () => {
  // 0b: 輸出通関手数料は任意欄から総額の行へ移った。「誰の額か」の検査はいまも
  // 生きているが、対象は `optional` ではなく `lines`（`services.test.ts` の他所で
  // 総額側は 'the ¥200,000 export clearance fee is a total line...' が見る）。
  test('the export declaration fee cites Japan Post on every row, not the service page', () => {
    const rows = rowsFor([item({ id: 'a', priceYen: 200001 })]);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      const l = line(r, 'export-clearance');
      expect(l.sourceUrl, `${r.serviceId}: the amount is Japan Post's, not the service's`)
        .toBe(EXPORT_DECLARATION_FEE_SOURCE);
      const svcDef = SERVICE_BY_ID.get(r.serviceId)!;
      expect(l.sourceUrl, r.serviceId).not.toBe(svcDef.sourceUrl);
    }
  });

  test("Neokyo's storage fee cites the storage page it was read from", () => {
    expect(SERVICES.find((s) => s.id === 'neokyo')!.storage.sourceUrl)
      .toBe('https://neokyo.com/en/storage');
  });

  test('an optional fee that names no source of its own falls back to the service page', () => {
    // 大半の任意費目は社の料金ページが原文。**そこは上書きしない。**
    for (const svc of SERVICES) {
      for (const o of svc.optional) {
        if (o.sourceUrl == null) continue;
        expect(o.sourceUrl, `${svc.id}/${o.key}`).toMatch(/^https:\/\//);
      }
    }
  });
});
