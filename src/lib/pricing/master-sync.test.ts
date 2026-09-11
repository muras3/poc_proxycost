/**
 * T-F0 / ロードマップ 0a ──「費目マスタ (master/fees.json) と計算エンジン
 * (src/lib/pricing/services.ts) の値が一致していること」を CI で検査する。
 *
 * ## なぜこの形にしたか
 *
 * 以前の検証器はマスタを読んでいなかった（docs/MASTER.md）。0.21 / 0.283 / 9.95 を
 * コードにベタ書きしていたので、customs.json を書き換えても PASS していた。
 * **同じ事故を繰り返さないため、この test は master/fees.json を毎回ファイルから
 * 読み込み、期待値は必ずその場で master の値から作る。期待値をこのファイルに
 * ベタ書きしない。**
 *
 * ## 行の識別鍵
 *
 * `master/fees.json` の `rows` は70行。同じ `id` が同じ `company` に複数行ある
 * ケースがある（例: F02/jauce が3行、F36/fromjapan が3行）ため、`id` 単体でも
 * `id + company` でも行を一意に指せない。**`id + company + name` の組を鍵にする。**
 * 下の「網羅性」テストで、この鍵がマスタ内で本当に一意であることも確認する。
 *
 * ## 3バケットとその意味
 *
 * - MAPPED      … コードに対応する値があり、一致しなければならない行。
 *                 期待値は必ず `findRow(...).rule` から動的に読む。
 * - CONFLICT    … マスタとコードが食い違っていると分かっている行。
 *                 「いまも食い違っていること」を assert する。誰かが片方を
 *                 直した瞬間にここが red になり、リストから消す作業が強制される。
 * - NOT_IN_CODE … マスタに値はあるが、意図的にコードへ繋いでいない行。
 *                 理由は必ず docs/FEE-ITEMS.md の catalog / display_reason、
 *                 または docs/FIT-GAP.md の記述から引く。
 *
 * **3バケットの和が、fees.json の行数ちょうどを重複無く覆うことを assert する
 * （行数はベタ書きせず fees.json から数える）。** これが無いと、マスタに行を
 * 足しても・コードの接続が抜けても、誰にも気づかれない。
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { EXPORT_DECLARATION_FEE_YEN, EXPORT_DECLARATION_FEE_THRESHOLD_JPY, SERVICE_BY_ID, SERVICES } from './services';
import type { Service } from './services';
import { compare } from './compare';
import type { Item } from './types';

// ── マスタ読み込み ──────────────────────────────────────────────
const FEES_JSON_PATH = path.join(__dirname, '../../../master/fees.json');
const master = JSON.parse(fs.readFileSync(FEES_JSON_PATH, 'utf8')) as {
  // fees.json の rule は行ごとに形が違う JSON なので、ここだけ any を許し、
  // 各エントリの expect() 側で個別のフィールドに絞り込む。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: Array<{ id: string; company: string; name: string; rule: any; tier: string }>;
  catalog: Array<{
    id: string; name: string;
    display: 'total' | 'hidden' | 'engine_only' | 'warning_only' | 'optional';
    display_reason?: string;
  }>;
};
const rows = master.rows;
const catalog = master.catalog;

interface RowKeyParts { id: string; company: string; name: string }

/** `id + company + name` の組。同じ id が同じ社に複数行あっても一意に定まる。 */
function rowKey(r: RowKeyParts): string {
  return `${r.id}::${r.company}::${r.name}`;
}

function findRow(id: string, company: string, name: string) {
  const r = rows.find((x) => x.id === id && x.company === company && x.name === name);
  if (!r) {
    throw new Error(`master row not found: ${rowKey({ id, company, name })} — fees.json のこの行が動いた`);
  }
  return r;
}

function svc(id: string): Service {
  const s = SERVICE_BY_ID.get(id);
  if (!s) throw new Error(`service not found in SERVICES: ${id}`);
  return s;
}

// ============================================================================
// ① MAPPED ── コードに対応する値があり、一致しなければならない
// ============================================================================
interface MappedEntry extends RowKeyParts {
  read: () => unknown;
  expect: () => unknown;
}

const MAPPED: MappedEntry[] = [
  {
    id: 'F02', company: 'buyee', name: '購入手数料',
    // マスタ: rule.amount 500 (fixed_per_order)
    read: () => svc('buyee').fee.perOrderYen,
    expect: () => findRow('F02', 'buyee', '購入手数料').rule.amount,
  },
  {
    id: 'F12', company: 'buyee', name: '保証プラン',
    // マスタ: rule.options.standard ¥500。オーナー決定(2026-09-11)で Standard を既定に積む
    read: () => svc('buyee').fee.protectionPlanPerOrderYen,
    expect: () => findRow('F12', 'buyee', '保証プラン').rule.options.standard,
  },
  {
    id: 'F26', company: 'buyee', name: '輸出通関手数料',
    // 0b（ロードマップ）で任意欄から総額へ移した。額は EXPORT_DECLARATION_FEE_YEN、
    // 閾値は EXPORT_DECLARATION_FEE_THRESHOLD_JPY（`compare.ts` の exportClearanceLine
    // が両方を使って行を作る。5社とも同じ定数を参照するので、この行だけで代表させる）。
    read: () => ({ amount: EXPORT_DECLARATION_FEE_YEN, over: EXPORT_DECLARATION_FEE_THRESHOLD_JPY }),
    expect: () => {
      const rule = findRow('F26', 'buyee', '輸出通関手数料').rule;
      return { amount: rule.amount, over: rule.when.declared_value_jpy_over };
    },
  },
  // T-F11a: ヤフオク(yahoo-auctions)の ¥800 はオーナー決定(2026-09-11)で B_inferred として
  // マスタに入った（金額は変えず、確度だけ「原文が名指ししていない推論」と印を付けた）。
  // コード側の tier も 'estimate' に落としてあるので、ここで両者の一致を assert する。
  // 単にドル額を比べるだけだと、片方だけ確度を戻されても落ちない ── 確度も突き合わせる。
  {
    id: 'F02', company: 'zenmarket', name: 'サービス料',
    // マスタ: rule.amounts.yahoo_auction 800（rule.inferred_marketplaces.yahoo_auction で
    // B_inferred と印付け）とrule.amounts.mercari 800 の両方が、コードの perItemBySite と
    // 一致すること。JSON.stringify で1エントリにまとめて比べる（片方のキーだけの
    // ズレも拾えるように、両方をまとめて1つの値として比較する）
    read: () => JSON.stringify({
      yahoo: svc('zenmarket').fee.perItemBySite?.['yahoo-auctions'],
      mercari: svc('zenmarket').fee.perItemBySite?.mercari,
    }),
    expect: () => {
      const rule = findRow('F02', 'zenmarket', 'サービス料').rule;
      return JSON.stringify({ yahoo: rule.amounts.yahoo_auction, mercari: rule.amounts.mercari });
    },
  },
  {
    id: 'F04', company: 'zenmarket', name: '同一商品の複数個',
    read: () => svc('zenmarket').fee.chargedPerDistinctItem,
    expect: () => findRow('F04', 'zenmarket', '同一商品の複数個').rule.type === 'fee_once_per_distinct_item',
  },
  {
    id: 'F07', company: 'zenmarket', name: '入金手数料',
    // マスタ: rule.documented_example_rate 0.035（fees ページ「from 1%」に対し
    // 実請求から逆算した値と同じ水準として一次情報側にも記録されている）
    read: () => svc('zenmarket').deposit!.rate,
    expect: () => findRow('F07', 'zenmarket', '入金手数料').rule.documented_example_rate,
  },
  {
    id: 'F09', company: 'zenmarket', name: '国内銀行送金料',
    // rule.type "zero" (reason: included_in F02) →
    // services.ts の zenmarket.fee に別建ての銀行送金手数料フィールドが無いこと
    read: () => (svc('zenmarket').fee as { bankFeePerOrderYen?: number }).bankFeePerOrderYen ?? null,
    expect: () => null,
  },
  {
    id: 'F14', company: 'zenmarket', name: '初回梱包・まとめ梱包',
    // rule.type "zero" (reason: free) → services.ts の zenmarket.packing が null
    read: () => svc('zenmarket').packing,
    expect: () => null,
  },
  {
    id: 'F20', company: 'zenmarket', name: '保管無料期間',
    // 0d（2026-09-11）: 保管が総額の行になり、無料期間・上限日数が
    // services.ts の StorageFee として独立フィールドを持つようになった。
    read: () => ({ freeDays: svc('zenmarket').storage.freeDays, maxDays: svc('zenmarket').storage.maxDays }),
    expect: () => {
      const rule = findRow('F20', 'zenmarket', '保管無料期間').rule;
      return { freeDays: rule.days, maxDays: rule.max_days };
    },
  },
  {
    id: 'F21', company: 'zenmarket', name: '保管超過',
    read: () => {
      const r = svc('zenmarket').storage.rate;
      return r.kind === 'per-day-per-item' ? r.yen : null;
    },
    expect: () => findRow('F21', 'zenmarket', '保管超過').rule.amount,
  },
  {
    id: 'F29', company: 'zenmarket', name: '輸送保険',
    // rule.type "zero" (included_in F02) → zenmarket に
    // 保険関連の unpricedFees が独立して存在しないこと
    read: () => (svc('zenmarket').unpricedFees ?? []).some((o) => o.key.includes('insurance')),
    expect: () => false,
  },
  {
    id: 'F36', company: 'zenmarket', name: '豪州 GST 代理徴収',
    read: () => svc('zenmarket').prepaidImportTax!.AU!.rate,
    expect: () => findRow('F36', 'zenmarket', '豪州 GST 代理徴収').rule.rate,
  },
  {
    id: 'F14', company: 'neokyo', name: '梱包料',
    // マスタ: rule.base 500 / threshold_g 2000 / per_kg_over 150
    read: () => {
      const p = svc('neokyo').packing!;
      return { base: p.perParcelYen, threshold_g: p.freeUpToG, per_kg_over: p.perKgYen };
    },
    expect: () => {
      const rule = findRow('F14', 'neokyo', '梱包料').rule;
      return { base: rule.base, threshold_g: rule.threshold_g, per_kg_over: rule.per_kg_over };
    },
  },
  {
    id: 'F02', company: 'fromjapan', name: '取扱手数料',
    read: () => svc('fromjapan').fee.perItemYen,
    expect: () => findRow('F02', 'fromjapan', '取扱手数料').rule.amount,
  },
  {
    id: 'F04', company: 'fromjapan', name: '同一商品の複数個',
    read: () => svc('fromjapan').fee.chargedPerDistinctItem,
    expect: () => findRow('F04', 'fromjapan', '同一商品の複数個').rule.type === 'fee_once_per_distinct_item',
  },
  {
    id: 'F06', company: 'fromjapan', name: '支払手数料（JDirectItems のみ）',
    read: () => svc('fromjapan').fee.paymentInsideJapanYen,
    expect: () => findRow('F06', 'fromjapan', '支払手数料（JDirectItems のみ）').rule.amount,
  },
  {
    id: 'F26', company: 'fromjapan', name: '輸出通関手数料',
    read: () => EXPORT_DECLARATION_FEE_YEN,
    expect: () => findRow('F26', 'fromjapan', '輸出通関手数料').rule.amount,
  },
  {
    id: 'F36', company: 'fromjapan', name: '豪州 GST 代理徴収',
    read: () => svc('fromjapan').prepaidImportTax!.AU!.rate,
    expect: () => findRow('F36', 'fromjapan', '豪州 GST 代理徴収').rule.rate,
  },
  {
    id: 'F02', company: 'jauce', name: '落札手数料（オークション）',
    read: () => ({ fixed: svc('jauce').fee.perItemYen, rate: svc('jauce').fee.adValoremRate }),
    expect: () => {
      const rule = findRow('F02', 'jauce', '落札手数料（オークション）').rule;
      return { fixed: rule.fixed, rate: rule.rate };
    },
  },
  {
    id: 'F02', company: 'jauce', name: 'サービス料（場外店舗）',
    read: () => ({ fixed: svc('jauce').fee.perItemBySite?.['suruga-ya'], rate: svc('jauce').fee.adValoremRate }),
    expect: () => {
      const rule = findRow('F02', 'jauce', 'サービス料（場外店舗）').rule;
      return { fixed: rule.fixed, rate: rule.rate };
    },
  },
  {
    id: 'F02', company: 'jauce', name: 'サービス料（モール・ベータ）',
    // rule.type "zero" (reason: beta, conditions.marketplace: shopping_mall) →
    // jauce.fee.freeForSites にモール枠（楽天・Yahoo!ショッピング）が入っていること
    read: () => {
      const sites = svc('jauce').fee.freeForSites ?? [];
      return sites.includes('rakuten') && sites.includes('yahoo-shopping');
    },
    expect: () => true,
  },
  {
    id: 'F07', company: 'jauce', name: '入金手数料',
    read: () => ({ flat: svc('jauce').deposit!.flatYen, rate: svc('jauce').deposit!.rate }),
    expect: () => {
      const rule = findRow('F07', 'jauce', '入金手数料').rule;
      return { flat: rule.fixed, rate: rule.rate };
    },
  },
  {
    id: 'F09', company: 'jauce', name: '出品者への銀行送金料',
    read: () => svc('jauce').fee.bankFeePerOrderYen,
    expect: () => findRow('F09', 'jauce', '出品者への銀行送金料').rule.amount,
  },
  {
    id: 'F14', company: 'jauce', name: '梱包（Smart）',
    read: () => {
      const p = svc('jauce').packing!;
      return { fixed: p.perParcelYen, perKg: p.perKgYen, freeUpToG: p.freeUpToG };
    },
    expect: () => {
      const rule = findRow('F14', 'jauce', '梱包（Smart）').rule;
      return { fixed: rule.fixed, perKg: rule.per_kg, freeUpToG: rule.from_g };
    },
  },
  {
    id: 'F26', company: 'jauce', name: '追加通関手数料',
    read: () => EXPORT_DECLARATION_FEE_YEN,
    expect: () => findRow('F26', 'jauce', '追加通関手数料').rule.amount,
  },
  {
    id: 'F26', company: 'zenmarket', name: '輸出通関手数料',
    read: () => EXPORT_DECLARATION_FEE_YEN,
    expect: () => findRow('F26', 'zenmarket', '輸出通関手数料').rule.amount,
  },
  {
    id: 'F26', company: 'neokyo', name: '輸出通関手数料',
    read: () => EXPORT_DECLARATION_FEE_YEN,
    expect: () => findRow('F26', 'neokyo', '輸出通関手数料').rule.amount,
  },
  {
    id: 'F05', company: 'buyee', name: '国内配送サービス料 ¥500 は存在しない',
    // rule.type "zero" (reason: not_applicable) → services.ts の buyee.fee に
    // 「国内配送サービス料」に相当するフィールドがそもそも無いこと
    read: () => (svc('buyee').fee as unknown as Record<string, unknown>).domesticServicePerOrder ?? null,
    expect: () => null,
  },
  {
    id: 'F36', company: 'buyee', name: 'SG GST 代理徴収',
    read: () => svc('buyee').prepaidImportTax!.SG!.rate,
    expect: () => findRow('F36', 'buyee', 'SG GST 代理徴収').rule.rate,
  },
  // ── T-F4（解消）: Neokyo の ¥350 に国内送料が含まれるか ───────────────
  // 2026-09-11 に https://neokyo.com/en/fees・https://neokyo.com/en/how-to-buy を再取得。
  // ORDER PAYMENT 節は (商品代+国内送料) + ¥350 という足し算の図で、¥350 の説明
  // （purchasing / support / 45日保管）にも国内送料は入っていない。**¥350 に国内送料は
  // 含まれない。マスタの includes:["domestic_shipping"] と F13 の included_in が誤りで、
  // services.ts の domesticIncluded: false が正しかった。** マスタ側を直した。
  {
    id: 'F02', company: 'neokyo', name: '注文手数料（国内送料込み）',
    read: () => svc('neokyo').domesticIncluded,
    expect: () => Boolean(findRow('F02', 'neokyo', '注文手数料（国内送料込み）').rule.includes?.includes('domestic_shipping')),
  },
  // 「同一商品の複数個は同一 Buy Request 内なら1回だけ」（quote 参照）。F04/neokyo を新規に
  // マスタへ追加し、コードの chargedPerDistinctItem と対応させる。
  {
    id: 'F04', company: 'neokyo', name: '同一商品の複数個',
    read: () => svc('neokyo').fee.chargedPerDistinctItem,
    expect: () => findRow('F04', 'neokyo', '同一商品の複数個').rule.type === 'fee_once_per_distinct_item',
  },
  // ── T-F6（解消）: 前徴収税(F36) で C だった3行をコードに合わせてマスタを更新 ──
  {
    id: 'F36', company: 'zenmarket', name: 'EU/UK VAT 前払い（2026-03-02から強制）',
    read: () => svc('zenmarket').prepaidImportTax?.DE !== undefined,
    expect: () => findRow('F36', 'zenmarket', 'EU/UK VAT 前払い（2026-03-02から強制）').rule.mandatory,
  },
  {
    id: 'F36', company: 'neokyo', name: '着地国の税を代理徴収',
    read: () => Object.keys(svc('neokyo').prepaidImportTax ?? {}),
    expect: () => findRow('F36', 'neokyo', '着地国の税を代理徴収').rule.countries,
  },
  {
    id: 'F36', company: 'buyee', name: 'AU GST 代理徴収',
    read: () => svc('buyee').prepaidImportTax?.AU?.rate,
    expect: () => findRow('F36', 'buyee', 'AU GST 代理徴収').rule.rate,
  },
  // ── T-F11b（解消）: F20/neokyo は /en/storage の表で額が判明済み ──────────
  // 0d（2026-09-11）: 保管が総額の行になり、無料期間（商品45日・R3）と週次の最小段額が
  // services.ts の StorageFee として独立フィールドを持つようになった。
  {
    id: 'F20', company: 'neokyo', name: '保管無料期間',
    read: () => {
      const st = svc('neokyo').storage;
      const r = st.rate;
      return { freeDays: st.freeDays, smallOrderYen: r.kind === 'per-week-per-order' ? r.yen : null };
    },
    expect: () => {
      const rule = findRow('F20', 'neokyo', '保管無料期間').rule;
      return { freeDays: rule.days.items, smallOrderYen: rule.after.amounts_by_size.small.order };
    },
  },
  // ── 0c: F27・F30 の接続 ──────────────────────────────────────────────
  // F27 ── 条件（carrier: FedEx・直配エリア外の住所）がどちらもこの計算機では
  // 成立しない（宅配便を価格化していない・住所が入力に無い）ので、画面にも総額にも
  // 出さない。**それでも「未接続」ではなく MAPPED**——存在・額・出典をデータとして
  // 持たせてあるので、マスタが動いた瞬間にここが落ちる（`services.ts` の
  // `DormantCourierFee` コメント、PR の判断3参照）。
  {
    id: 'F27', company: 'fromjapan', name: 'FedEx 直配エリア外',
    read: () => svc('fromjapan').dormantFees?.[0]?.amountYen,
    expect: () => findRow('F27', 'fromjapan', 'FedEx 直配エリア外').rule.amount,
  },
  // F30 ── `limits` のうち、この計算機が価格化している方式に対応するのは
  // `Small_Packet`（small-packet-air / small-packet-surface）だけ。
  // `Charge 1` は「注文/落札時点で払う、商品代を含む」額（en_help.txt の Charge 1/Charge 2
  // 定義を 2026-09-11 に取得して確認。Charge 2 が「plan fee, domestic shipping,
  // international shipping, payment fee」と明記しているので、それ以外＝ Charge 1 は
  // 商品代と読める）なので、行の itemsYen（商品代合計）と比べる `priceCapJpy` として繋ぐ。
  // ePacket_Light（¥10,000）・ePacket / IPA（$400）・PMI（$2,499.99）は、この計算機が
  // 価格化していない方式（`postage` にキーが無い）なので繋ぐ対象が無い——
  // `services.ts` の postage コメントが「宅配便・容積重量課金の方式は入れない」と
  // 書いている条件と同じ理由で、そもそも売っている方式の集合に入っていない。
  // 0d（2026-09-11）: F20/fromjapan（保管無料期間）と F20/jauce は、無料期間・上限日数が
  // services.ts の StorageFee として独立フィールドを持つようになったので MAPPED へ移した
  // （旧: optional storage の note 文字列にしか無かった時代の NOT_IN_CODE）。
  {
    id: 'F20', company: 'fromjapan', name: '保管無料期間',
    read: () => svc('fromjapan').storage.freeDays,
    expect: () => findRow('F20', 'fromjapan', '保管無料期間').rule.days,
  },
  {
    id: 'F20', company: 'jauce', name: '保管無料期間',
    read: () => ({ freeDays: svc('jauce').storage.freeDays, maxDays: svc('jauce').storage.maxDays }),
    expect: () => {
      const rule = findRow('F20', 'jauce', '保管無料期間').rule;
      return { freeDays: rule.days, maxDays: rule.max_days };
    },
  },
  {
    id: 'F30', company: 'fromjapan', name: '配送方法の可否（商品代に依存）',
    read: () => ({
      air: svc('fromjapan').postage['small-packet-air']?.priceCapJpy,
      surface: svc('fromjapan').postage['small-packet-surface']?.priceCapJpy,
    }),
    expect: () => {
      const cap = findRow('F30', 'fromjapan', '配送方法の可否（商品代に依存）').rule.limits.Small_Packet.charge1_jpy_max;
      return { air: cap, surface: cap };
    },
  },
  // ── 0e: catalog F14 は display: total。マスタ側の rule.amount は unknown（実費のみで
  // 上限・料金表が無い）なので額そのものは繋げないが、**額が出せないことは「行を作らない
  // 理由」にはならない**（docs/FEE-ITEMS.md §1、オーナー決定 2026-09-11 で「任意欄」は
  // 廃止された）。`services.ts` の `unpricedFees` として毎行の総額に amount: null
  // （画面「—」）で足し、excluded に名前を載せる（`compare.ts` の `buildRow`）。
  // 発生条件（50kg以上／30kg以上かつ30万円以上／壊れ物）はこの計算機では条件1・2が
  // 原理的に発生せず、条件3（壊れ物）は FROM JAPAN の主観判断で検出不能——だから
  // 条件判定そのものは繋がない。繋いだのは「行の存在」であって「条件」ではない。
  {
    id: 'F14', company: 'fromjapan', name: '外注梱包（Outsourced Packing）',
    read: () => (svc('fromjapan').unpricedFees ?? []).some((o) => o.key === 'outsourced-packing'),
    expect: () => true,
  },
];

// ============================================================================
// ② CONFLICT ── マスタとコードが食い違っていることが既知の行
//    「いまも食い違っていること」を assert する。どちらかが直った瞬間に
//    ここが落ち、このリストから消す作業が強制される。
// ============================================================================
interface ConflictEntry extends RowKeyParts {
  master: string;
  code: string;
  reason: string;
  task: string;
  assertStillConflicting: () => void;
}

const CONFLICT: ConflictEntry[] = [
];

// ============================================================================
// ③ NOT_IN_CODE ── マスタに値があるが、意図的にコードに無い行
//    理由は docs/FEE-ITEMS.md の catalog / display_reason、
//    docs/FIT-GAP.md の記述から引く（自分で理由を作らない）。
// ============================================================================
interface NotInCodeEntry extends RowKeyParts {
  reason: string;
  assertNotInCode: () => void;
}

const NOT_IN_CODE: NotInCodeEntry[] = [
  // ── 0e: catalog display: hidden の9費目。「任意欄」の枠ごと撤去した（オーナー決定
  // 2026-09-11、docs/FEE-ITEMS.md §1・§2）。利用者が選んだときだけ発生し、総額の精度に
  // 効かない。行を作らないことが正しい実装で、「未接続」ではなく「意図的に繋がない」。
  {
    id: 'F16', company: 'zenmarket', name: '梱包後の変更・キャンセル',
    reason: 'catalog F16 の変種（補強・保護梱包の再梱包。docs/FEE-ITEMS.md の表では F16）は'
      + ' display: hidden——利用者が選んだときだけ（オーナー決定 2026-09-11）。0e で撤去。',
    assertNotInCode: () => {
      expect((svc('zenmarket').unpricedFees ?? []).some((o) => o.key === 'repack')).toBe(false);
    },
  },
  {
    id: 'F18', company: 'zenmarket', name: '写真サービス',
    reason: 'catalog F18: display hidden（利用者が選んだときだけ。オーナー決定 2026-09-11）。0e で撤去。',
    assertNotInCode: () => {
      expect((svc('zenmarket').unpricedFees ?? []).some((o) => o.key === 'photos')).toBe(false);
    },
  },
  {
    id: 'F17', company: 'neokyo', name: '開梱',
    reason: 'catalog F17: display hidden（利用者が選んだときだけ。オーナー決定 2026-09-11）。0e で撤去。',
    assertNotInCode: () => {
      expect((svc('neokyo').unpricedFees ?? []).some((o) => o.key === 'unpacking')).toBe(false);
    },
  },
  {
    id: 'F08', company: 'neokyo', name: 'コンビニ払い',
    reason: 'catalog F08: display hidden（カード前提なので発生しない。オーナー決定 2026-09-11）。0e で撤去。',
    assertNotInCode: () => {
      expect((svc('neokyo').unpricedFees ?? []).some((o) => o.key === 'konbini')).toBe(false);
    },
  },
  {
    id: 'F08', company: 'fromjapan', name: 'コンビニ・郵便局払い',
    reason: 'catalog F08: display hidden（カード前提なので発生しない。オーナー決定 2026-09-11）。0e で撤去。',
    assertNotInCode: () => {
      expect((svc('fromjapan').unpricedFees ?? []).some((o) => o.key === 'konbini')).toBe(false);
    },
  },
  {
    id: 'F16', company: 'fromjapan', name: '再梱包',
    reason: 'catalog F16: display hidden（利用者が選んだときだけ。オーナー決定 2026-09-11）。0e で撤去。',
    assertNotInCode: () => {
      expect((svc('fromjapan').unpricedFees ?? []).some((o) => o.key === 'repack')).toBe(false);
    },
  },
  {
    id: 'F18', company: 'fromjapan', name: '写真サービス',
    reason: 'catalog F18: display hidden（利用者が選んだときだけ。オーナー決定 2026-09-11）。0e で撤去。',
    assertNotInCode: () => {
      expect((svc('fromjapan').unpricedFees ?? []).some((o) => o.key === 'photos')).toBe(false);
    },
  },
  {
    id: 'F14', company: 'jauce', name: '梱包（Fragile）',
    reason: 'catalog の変種（補強梱包。docs/FEE-ITEMS.md の表では F15）は display: hidden'
      + '（利用者が選んだときだけ。オーナー決定 2026-09-11）。0e で撤去——F14 自体は基本梱包'
      + '（display: total）として `packing` に残っているが、この Fragile 変種は繋がない。',
    assertNotInCode: () => {
      expect((svc('jauce').unpricedFees ?? []).some((o) => o.key === 'fragile-packing')).toBe(false);
    },
  },
  {
    id: 'F24', company: 'jauce', name: '特殊処理',
    reason: 'catalog F24: display hidden（利用者が選んだときだけ。オーナー決定 2026-09-11）。0e で撤去。',
    assertNotInCode: () => {
      expect((svc('jauce').unpricedFees ?? []).some((o) => o.key === 'customized-processing')).toBe(false);
    },
  },
  {
    id: 'F30', company: 'jauce', name: '速達処理',
    reason: 'catalog の変種（F24 と同じ「特殊処理」の枠。docs/FEE-ITEMS.md の表では F24）は'
      + ' display: hidden（利用者が選んだときだけ。オーナー決定 2026-09-11）。0e で撤去——'
      + 'F30 自体は配送方法の可否制約（engine_only）として別に接続されている（MAPPED の'
      + '「配送方法の可否（商品代に依存）」）。',
    assertNotInCode: () => {
      expect((svc('jauce').unpricedFees ?? []).some((o) => o.key === 'expedited')).toBe(false);
    },
  },
  {
    id: 'F02', company: 'buyee', name: '購入手数料（台湾）',
    reason: '対象国を7カ国に確定した（オーナー決定 2026-09-11）。TW はスコープ外なので繋がない。',
    assertNotInCode: () => {
      expect(svc('buyee').fee).not.toHaveProperty('perOrderYenByCountry');
    },
  },
  {
    id: 'F13', company: 'buyee', name: '国内送料',
    reason: 'rule.type が actual_cost_per_order（実費、範囲のみ）で確定額を持たない。実費の推定値'
      + '（ASSUMED_DOMESTIC_SHIPPING_YEN）は compare.ts 側にあり、本テストの対象である'
      + ' services.ts の SERVICES には対応する数値フィールドが無い。',
    assertNotInCode: () => {
      expect((svc('buyee').fee as unknown as Record<string, unknown>).domesticShippingYen).toBeUndefined();
    },
  },
  // ── T-F4（解消）: F13/neokyo は実費（他4社と同型）に直した ─────────────────
  {
    id: 'F13', company: 'neokyo', name: '国内送料',
    reason: 'rule.type が actual_cost_per_order（実費）で確定額を持たない。理由は F13/buyee と同じ。'
      + '旧マスタの zero/included_in（¥350に内包）は誤りだった（T-F4、2026-09-11再取得）。',
    assertNotInCode: () => {
      expect((svc('neokyo').fee as unknown as Record<string, unknown>).domesticShippingYen).toBeUndefined();
    },
  },
  {
    id: 'F13b', company: 'buyee', name: '「送料無料」でも国内送料が出る',
    reason: 'catalog F13b: occurrence C_conditional_no_input / display warning_only。'
      + '「発生率を持っていない。全件に足せば過大になるので、金額は動かさず警告だけ出す'
      + '（オーナー決定 2026-09-11、T-F10）」。まだ実装されていない。',
    assertNotInCode: () => {
      expect((svc('buyee').unpricedFees ?? []).some((o) => o.key.includes('free-shipping'))).toBe(false);
    },
  },
  {
    id: 'F14', company: 'buyee', name: 'まとめ梱包',
    reason: 'amount_tier C_unknown。額そのものが未取得（quote 未取得。code は'
      + ' consolidationOnRequest: true という真偽値だけを持ち、金額は持たない）。',
    assertNotInCode: () => {
      expect((svc('buyee').unpricedFees ?? []).some((o) => o.key.includes('consolidat'))).toBe(false);
    },
  },
  {
    id: 'F10', company: 'zenmarket', name: '無形物の追加手数料',
    reason: 'catalog F10:「無形物の取扱条件が違うので額も違う。額が未取得で、取れたら総額へ。」',
    assertNotInCode: () => {
      expect((svc('zenmarket').unpricedFees ?? []).some((o) => o.key.includes('intangible'))).toBe(false);
    },
  },
  {
    id: 'F13', company: 'zenmarket', name: '国内送料',
    reason: 'rule.type が actual_cost_per_order（実費）で確定額を持たない。理由は F13/buyee と同じ。',
    assertNotInCode: () => {
      expect((svc('zenmarket').fee as unknown as Record<string, unknown>).domesticShippingYen).toBeUndefined();
    },
  },
  {
    id: 'F15', company: 'zenmarket', name: '補強梱包',
    reason: 'catalog F15: display hidden, occurrence D_user_choice「利用者が選んだときだけ'
      + '（オーナー決定 2026-09-11）」。',
    assertNotInCode: () => {
      expect((svc('zenmarket').unpricedFees ?? []).some((o) => o.key.includes('reinforce'))).toBe(false);
    },
  },
  {
    id: 'F19', company: 'zenmarket', name: '検品',
    reason: 'catalog F19: display hidden, occurrence D_user_choice「利用者が選んだときだけで、'
      + '額も未取得（オーナー決定 2026-09-11）」。',
    assertNotInCode: () => {
      expect((svc('zenmarket').unpricedFees ?? []).some((o) => o.key.includes('inspect'))).toBe(false);
    },
  },
  {
    id: 'F22', company: 'zenmarket', name: '倉庫到着後のキャンセル',
    reason: 'catalog F22: display hidden, occurrence E_unpredictable「落札後はキャンセル不可。'
      + '発生すれば全損に近いが予測できない（オーナー決定 2026-09-11）」。',
    assertNotInCode: () => {
      expect((svc('zenmarket').unpricedFees ?? []).some((o) => o.key.includes('cancel'))).toBe(false);
    },
  },
  {
    id: 'F23', company: 'zenmarket', name: '廃棄',
    reason: 'catalog F23: display hidden「保管期限超過で廃棄される。額が未取得'
      + '（オーナー決定 2026-09-11）」。',
    assertNotInCode: () => {
      expect((svc('zenmarket').unpricedFees ?? []).some((o) => o.key.includes('dispos'))).toBe(false);
    },
  },
  {
    id: 'F07', company: 'zenmarket', name: '入金手数料（PayPal）',
    reason: 'catalog F07:「カード前提で率を取り直す（オーナー決定 2026-09-11、T-F9）。現在の'
      + '3.5%は支払方法が不明な逆算値」。支払方法別の内訳はまだ単一の推定値に統合されたままで、'
      + 'PayPal 個別の ¥40 + 3.2% は接続されていない。',
    assertNotInCode: () => {
      // PayPal専用の flatYen 40 が反映されていれば非0になるはずだが、単一推定値のまま
      expect(svc('zenmarket').deposit!.flatYen).toBe(0);
    },
  },
  // ── T-F5（解消）: F02とF12は別の¥500×2ではなく同一の¥500 ─────────────────
  // 2026-09-11 に https://www.fromjapan.co.jp/translate/en_help.txt を再取得。
  // help_fee_120「Handling Fees」→ help_fee_130「Product Protection Plan」→
  // help_fee_140「500 yen per item」という並びと help_fee_252/381/382 の対応から、
  // Handling Fees / Plan Fee / Product Protection Plan は同じ¥500/点の呼び分けで
  // 並立しないと判明。マスタ側を rule.type "zero"/"included_in" に直した
  // （services.ts のコメントが指摘していた統合の向きが正しかった）。
  {
    id: 'F12', company: 'fromjapan', name: 'Product Protection Plan',
    reason: 'T-F5: help_fee_120/130/140/150 と title_serviceRule_670 から、F02（取扱手数料）と'
      + '同一の¥500を指す1行と判明。独立費目として合計に加えない（services.ts の comment と一致）。',
    assertNotInCode: () => {
      const rule = findRow('F12', 'fromjapan', 'Product Protection Plan').rule;
      expect(rule.type).toBe('zero');
      expect(rule.fee_id).toBe('F02');
    },
  },
  {
    id: 'F11', company: 'fromjapan', name: '価格交渉手数料',
    reason: 'catalog F11: display hidden, occurrence D_user_choice「利用者が代行に値下げ交渉を'
      + '依頼したときだけ（オーナー決定 2026-09-11）」。',
    assertNotInCode: () => {
      expect((svc('fromjapan').unpricedFees ?? []).some((o) => o.key.includes('negotiat'))).toBe(false);
    },
  },
  {
    id: 'F13', company: 'fromjapan', name: '国内送料',
    reason: 'rule.type が actual_cost_per_order（zero_if_free_shipping）で確定額を持たない。'
      + '理由は F13/buyee と同じ。',
    assertNotInCode: () => {
      expect((svc('fromjapan').fee as unknown as Record<string, unknown>).domesticShippingYen).toBeUndefined();
    },
  },
  {
    id: 'F23', company: 'fromjapan', name: '廃棄',
    reason: 'catalog F23: display hidden「保管期限超過で廃棄される。額が未取得'
      + '（オーナー決定 2026-09-11）」。',
    assertNotInCode: () => {
      expect((svc('fromjapan').unpricedFees ?? []).some((o) => o.key.includes('dispos'))).toBe(false);
    },
  },
  // ── 0c（解消）: F27・F30 はマスタに A_confirmed で在ったのに未接続だった行。
  // F27 は MAPPED（dormantFees としてデータを繋いだ。画面には出さない）へ、
  // F30/fromjapan は下の MAPPED ── Small_Packet（charge1_jpy_max）だけを接続 ── へ
  // それぞれ移した。F30 の中で価格化していない方式（ePacket_Light 等）ぶんは、
  // その理由を MAPPED エントリのコメントに書く（この行自体は「未接続」ではなく
  // 「部分接続」なので、行の鍵を二重に使わないよう NOT_IN_CODE 側には置かない）。
  {
    id: 'F36', company: 'fromjapan', name: 'GST 15% 代理徴収',
    reason: '対象国を7カ国に確定した（オーナー決定 2026-09-11）。国名も原文に無く'
      + ' NZ_presumed（B_inferred）というスコープ外の推定国なので繋がない。',
    assertNotInCode: () => {
      expect((svc('fromjapan').prepaidImportTax as Record<string, unknown> | undefined)?.NZ).toBeUndefined();
    },
  },
  {
    id: 'F36', company: 'fromjapan', name: 'マレーシア SST 代理徴収',
    reason: '対象国を7カ国に確定した（オーナー決定 2026-09-11）ため、MY 向けの行は繋がない。',
    assertNotInCode: () => {
      expect((svc('fromjapan').prepaidImportTax as Record<string, unknown> | undefined)?.MY).toBeUndefined();
    },
  },
  {
    id: 'F13', company: 'jauce', name: '国内送料',
    reason: 'rule.type が actual_cost_per_order（実費）で確定額を持たない。理由は F13/buyee と同じ。',
    assertNotInCode: () => {
      expect((svc('jauce').fee as unknown as Record<string, unknown>).domesticShippingYen).toBeUndefined();
    },
  },
  {
    id: 'F29', company: 'jauce', name: '保険（標準・基本補償 ¥20,000 まで）',
    reason: '2026-09-11 に記録③として追加。標準の郵便保険（全発送に付く）の基本補償¥20,000までは'
      + '無料（日本郵便の公表）。基準ケース（5点×¥3,000＝¥15,000）はこの範囲内で影響が無いため、'
      + 'コードには未接続のまま（額は0で確定しているが行として繋いでいない）。',
    assertNotInCode: () => {
      const ins = (svc('jauce').unpricedFees ?? []).find((o) => o.key === 'premium-insurance');
      expect(ins).toBeDefined();
    },
  },
  {
    id: 'F29', company: 'jauce', name: '保険（標準・¥20,000 超過分。Jauce が自動付保・請求するかは未確定）',
    reason: '2026-09-11 に記録③として追加。日本郵便の増額表（¥20,000増ごとに¥50・上限¥200万）は'
      + 'あるが、Jauce がそれを利用者に自動で付保・請求するかどうかを一次情報から確認できていない'
      + '（開いた問い）。amount_tier C_unknown。基準ケースは¥20,000以内のため実害は無い。',
    assertNotInCode: () => {
      const ins = (svc('jauce').unpricedFees ?? []).find((o) => o.key === 'premium-insurance');
      expect(ins).toBeDefined();
    },
  },
  {
    id: 'F29', company: 'jauce', name: '保険（Premium・任意）',
    reason: 'catalog F29:「Jauce の Premium 1.9% は利用者が選ぶもので、かつ課税ベースが'
      + '原文から読めない」ため額を出さない（2026-09-11 に標準の郵便保険2行と区別するため改名）。'
      + '0e で display: total に従わせた——`unpricedFees` として毎行の総額に amount: null'
      + '（画面「—」）で載り、excluded に名前が出る。',
    assertNotInCode: () => {
      const ins = (svc('jauce').unpricedFees ?? []).find((o) => o.key === 'premium-insurance')!;
      expect(ins).toBeDefined();
      expect(ins.note).toContain('1.9%');
    },
  },
  {
    id: 'F36', company: 'buyee', name: 'NZ GST 代理徴収',
    reason: '対象国を7カ国に確定した（オーナー決定 2026-09-11）。NZ はスコープ外なので繋がない。',
    assertNotInCode: () => {
      expect((svc('buyee').prepaidImportTax as Record<string, unknown> | undefined)?.NZ).toBeUndefined();
    },
  },
  {
    id: 'F36', company: 'buyee', name: 'MY SST 代理徴収',
    reason: '対象国を7カ国に確定した（オーナー決定 2026-09-11）。MY はスコープ外なので繋がない'
      + '（base も unknown で amount_tier C_unknown）。',
    assertNotInCode: () => {
      expect((svc('buyee').prepaidImportTax as Record<string, unknown> | undefined)?.MY).toBeUndefined();
    },
  },
  {
    id: 'F21', company: 'jauce', name: '保管超過',
    reason: '0d（2026-09-11）で保管が総額の行になり、無料60日・最大保管120日は'
      + ' svc(\'jauce\').storage の freeDays/maxDays として接続した（MAPPED の F20/jauce）。'
      + 'だがこの行自体（F21 の月額）は依然未接続——月額はサイズ・価値で決まり一律ではないと'
      + '公式が明記しており、公表されている参考額（CD約¥200/月・ギター約¥700/月）は'
      + '「Very roughly」の前置き付きで料金表ではない。¥700 を上限として扱ってはいけない'
      + '（rule.amount は unknown・amount_tier C_unknown）。だから61日目以降は'
      + ' compare.ts の storageLine が amount:null / tier:none（画面は「—」、excluded に載る）'
      + 'を返し、参考値を点推定に使わない。',
    assertNotInCode: () => {
      expect(svc('jauce').storage.rate.kind).toBe('unpublished');
    },
  },
];

// ============================================================================
// テスト本体
// ============================================================================
describe('MAPPED ── マスタとコードが一致しなければならない行', () => {
  for (const e of MAPPED) {
    it(`${e.id}/${e.company} ${e.name}`, () => {
      expect(e.read()).toEqual(e.expect());
    });
  }
});

// 既知の食い違いは現在ゼロ件（#25 で4件・T-F11a で1件を解消）。
// 空の describe は vitest で失敗するので、CONFLICT が空でない場合だけ this describe を作る。
if (CONFLICT.length > 0) {
  describe('CONFLICT ── 既知の食い違い。まだ食い違っていることを assert する', () => {
    for (const e of CONFLICT) {
      it(`[${e.task}] ${e.id}/${e.company} ${e.name}`, () => {
        e.assertStillConflicting();
      });
    }
  });
}

describe('NOT_IN_CODE ── 意図的にコードに繋いでいない行', () => {
  for (const e of NOT_IN_CODE) {
    it(`${e.id}/${e.company} ${e.name}`, () => {
      e.assertNotInCode();
    });
  }
});

// ============================================================================
// T-F11a: 額だけでなく確度も、マスタとコードで整合していること。
// 片方だけ確定に戻されたときにここが落ちるように、額の一致とは別に確度を assert する。
// ============================================================================
describe('T-F11a ── ZenMarket ヤフオク¥800 の確度がマスタとコードで一致する', () => {
  it('マスタ: yahoo_auction は rule.inferred_marketplaces で B_inferred と印がある', () => {
    const rule = findRow('F02', 'zenmarket', 'サービス料').rule;
    expect(rule.inferred_marketplaces?.yahoo_auction?.tier).toBe('B_inferred');
    expect(rule.inferred_marketplaces?.yahoo_auction?.inference_basis).toBeTruthy();
    // unknown 扱いからは外れていること（¥800 は既知の値として置かれている）
    expect(rule.unknown_marketplaces ?? []).not.toContain('yahoo_auction');
  });

  it('マスタ: mercari は inferred_marketplaces に無い（原文が名指ししているため fixed）', () => {
    const rule = findRow('F02', 'zenmarket', 'サービス料').rule;
    expect(rule.inferred_marketplaces?.mercari).toBeUndefined();
  });

  it('コード: perItemBySiteTier でヤフオクだけ estimate、メルカリは fixed（未指定 = svc.fee.tier）', () => {
    const fee = svc('zenmarket').fee as {
      perItemBySiteTier?: Partial<Record<string, string>>;
      tier: string;
    };
    expect(fee.perItemBySiteTier?.['yahoo-auctions']).toBe('estimate');
    expect(fee.perItemBySiteTier?.mercari).toBeUndefined();
    expect(fee.tier).toBe('fixed'); // mercari はこの既定 tier に従う
  });
});

describe('網羅性 ── 70行すべてがちょうど1つのバケットに入る', () => {
  it('MAPPED / CONFLICT / NOT_IN_CODE の和が fees.json の行数とちょうど一致する（余りも重複も無い）', () => {
    const allKeys = rows.map(rowKey);

    // 前提: マスタ自身の中で id+company+name が重複していない
    // （重複していたら、この鍵の選び方自体が壊れる）
    expect(new Set(allKeys).size).toBe(allKeys.length);

    const bucketKeys = [
      ...MAPPED.map(rowKey),
      ...CONFLICT.map(rowKey),
      ...NOT_IN_CODE.map(rowKey),
    ];

    // 同じ行が2つのバケットに入っていないこと
    const seen = new Set<string>();
    for (const k of bucketKeys) {
      expect(seen.has(k)).toBe(false);
      seen.add(k);
    }

    // 各エントリが実在するマスタの行を指していること
    for (const e of [...MAPPED, ...CONFLICT, ...NOT_IN_CODE]) {
      expect(() => findRow(e.id, e.company, e.name)).not.toThrow();
    }

    // 件数をベタ書きしない。fees.json から数えた行数とちょうど一致することを見る
    expect(bucketKeys.length).toBe(rows.length);

    // マスタの行で、どのバケットにも入っていないものが無いこと（双方向一致）
    expect(new Set(bucketKeys)).toEqual(new Set(allKeys));
  });
});

// ============================================================================
// 0e ── `master/fees.json` の catalog（41項目）が持つ `display` を、コードに
// 効かせていることを突き合わせる。**これが本体。**
//
// 以前は T-F0 が「金額」しか突き合わせていなかった。そのせいで「マスタが
// `total`（載せる）と言っている費目が、コードでは `optionalLines`（任意欄）に
// 居る」というずれが誰にも気づかれなかった（0d の直前まで、F14 外注梱包・F29
// Premium insurance が任意欄のまま総額に入っていなかった）。**同じ事故を
// 二度と静かに起こさせないため、`display` もここで縛る。**
//
// 期待値はハードコードしない。`master/fees.json` の catalog から動的に読む。
// ============================================================================
describe('display ── マスタの `display` 分類がコードに効いていること（0e）', () => {
  const displayOf = (id: string): string =>
    catalog.find((c) => c.id === id)?.display
    ?? (() => { throw new Error(`catalog に id ${id} が無い`); })();

  // 総額行を1行だけ作る最小入力。全社・全国で同じ形を使う（`compare.test.ts` の `item`/`items` と同じ流儀）。
  const testItem: Item = {
    id: 'a', title: 'a', priceYen: 3000, priceTier: 'fixed', site: 'yahoo-auctions',
    weightG: 600, weightTier: 'estimate', qty: 1,
  };
  const rowsOf = (storageDays?: number) =>
    compare({ items: [testItem], country: 'US', storageDays }).rows;
  const allLineKeys = () => new Set(rowsOf().flatMap((r) => r.lines.map((l) => l.key)));

  it('catalog の display に `optional` は0件 ── 「任意欄」はマスタに存在しない', () => {
    // 将来1件でも `optional` が現れたら、ここが落ちて「どう扱うか」を決めることを強制する
    // （前回の指示・今回のコーディネーター指示のどちらにも明記されている、いま決めなくてよい話）。
    const optionalItems = catalog.filter((c) => c.display === 'optional');
    expect(optionalItems.map((c) => c.id)).toEqual([]);
  });

  it('display: total の2件（F14外注梱包・F29 Premium insurance）は、額が無くても総額の行になる', () => {
    // catalog 側の分類そのものが total であること（マスタを直接読む。ハードコードしない）。
    expect(displayOf('F14')).toBe('total');
    expect(displayOf('F29')).toBe('total');
    // コード側 ── `unpricedFees` として `compare.ts` の `buildRow` が毎行の `lines[]` に足す。
    // 額は公表されていないので amount: null（画面「—」）で、`excluded` に名前が載る。
    const fj = rowsOf().find((r) => r.serviceId === 'fromjapan')!;
    const outsourced = fj.lines.find((l) => l.key === 'outsourced-packing');
    expect(outsourced, 'F14 outsourced-packing must be a total line, not dropped').toBeDefined();
    expect(outsourced!.amount).toBeNull();
    expect(fj.excluded).toContain(outsourced!.label);

    const jauce = rowsOf().find((r) => r.serviceId === 'jauce')!;
    const premium = jauce.lines.find((l) => l.key === 'premium-insurance');
    expect(premium, 'F29 premium-insurance must be a total line, not dropped').toBeDefined();
    expect(premium!.amount).toBeNull();
    expect(jauce.excluded).toContain(premium!.label);
  });

  it('display: hidden の9件は、どのサービスの `unpricedFees` にも、どの行の key にも現れない', () => {
    // docs/FEE-ITEMS.md §2 の対応表 ── F08/F15/F16/F17/F18/F24 の変種として
    // 旧 `optional` に居た9キー。catalog 側がすべて hidden であることも突き合わせる。
    const HIDDEN_KEY_TO_ID: Record<string, string> = {
      photos: 'F18', repack: 'F16', konbini: 'F08', unpacking: 'F17',
      'special-packing': 'F15', 'protective-packing': 'F15', 'fragile-packing': 'F15',
      expedited: 'F24', 'customized-processing': 'F24',
    };
    for (const [key, id] of Object.entries(HIDDEN_KEY_TO_ID)) {
      expect(displayOf(id), `catalog ${id} (${key})`).toBe('hidden');
    }
    // コード側 ── `Service.optional` という枠そのものが無い。あるのは
    // `unpricedFees`（display: total の2件専用）だけなので、hidden の9キーは
    // どのサービスの `unpricedFees` にも、実際に組み立てた行の `lines[]` にも出ない。
    const keys = allLineKeys();
    for (const s of SERVICES) {
      expect(s as unknown as Record<string, unknown>).not.toHaveProperty('optional');
      for (const key of Object.keys(HIDDEN_KEY_TO_ID)) {
        expect((s.unpricedFees ?? []).some((u) => u.key === key), `${s.id}/${key}`).toBe(false);
        expect(keys.has(key), key).toBe(false);
      }
    }
  });

  it('display: engine_only の費目は独立した行にならない ── F04・F20・F30 で確認', () => {
    // F04（同一商品の複数個）: F02（service-fee）の課金回数に効くだけで、独立行にしない。
    expect(displayOf('F04')).toBe('engine_only');
    expect(allLineKeys().has('f04')).toBe(false);
    expect(allLineKeys().has('same-item')).toBe(false);
    // F20（保管無料期間）: F21（storage 行）の判定パラメータで、無料期間そのものの行は無い。
    expect(displayOf('F20')).toBe('engine_only');
    expect(allLineKeys().has('f20')).toBe(false);
    expect(allLineKeys().has('free-days')).toBe(false);
    expect(allLineKeys().has('storage')).toBe(true); // F21（total）の行はある
    // F30（配送方法の可否）: どの方式に価格を出すかを決めるだけで、行そのものは作らない。
    expect(displayOf('F30')).toBe('engine_only');
    expect(allLineKeys().has('f30')).toBe(false);
    expect(allLineKeys().has('method-eligibility')).toBe(false);
  });

  it('display: warning_only の F13b は、実装されても金額を一切動かさない（#29 を壊さない）', () => {
    expect(displayOf('F13b')).toBe('warning_only');
    // 「送料無料」の item でも国内送料は ¥0 のまま（Buyee は確度だけ estimate に落ちる）。
    const free: Item = { ...testItem, id: 'b', freeShipping: true };
    const buyee = compare({ items: [free], country: 'US' }).rows.find((r) => r.serviceId === 'buyee')!;
    const dom = buyee.lines.find((l) => l.key === 'domestic-shipping')!;
    expect(dom.amount).toBe(0);
  });
});
