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
import { COURIER_CLEARANCE, COURIER_CLEARANCE_UNKNOWN, evalClearanceRuleYen } from './courier-clearance';
import type { CountryCode } from './types';

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
  // ── 外部レビュー2回目 A-1（解消）: Buyee の保管がマスタに無いままコードが課していた ──
  // 他4社（zenmarket/neokyo/fromjapan/jauce）はF20/F21が既にあったが、Buyeeだけ
  // 行が無く、この突き合わせにも入っていなかった。マスタにF20/F21/buyeeを追加し、
  // ここに他社と同じ形の突き合わせを足す。
  {
    id: 'F20', company: 'buyee', name: '保管無料期間',
    read: () => ({ freeDays: svc('buyee').storage.freeDays, maxDays: svc('buyee').storage.maxDays }),
    expect: () => {
      const rule = findRow('F20', 'buyee', '保管無料期間').rule;
      return { freeDays: rule.days, maxDays: rule.max_days };
    },
  },
  {
    id: 'F21', company: 'buyee', name: '保管超過',
    read: () => {
      const r = svc('buyee').storage.rate;
      return r.kind === 'per-day-per-parcel-by-weight'
        ? r.bands.map((b) => ({ maxG: b.maxG === Infinity ? null : b.maxG, amount: b.yen }))
        : null;
    },
    expect: () => {
      const rule = findRow('F21', 'buyee', '保管超過').rule;
      return rule.bands.map((b: { max_g: number | null; amount: number }) => ({ maxG: b.max_g, amount: b.amount }));
    },
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
  // ── F07（2026-09-12、payment-fee-rates）: Buyee/Neokyo/FROM JAPAN の
  // 「非公表・未取得」行そのものは、コードには繋がない ──────────────────────
  // この3行の rule は `{ type: 'not_included' }`——「この会社の実際の方法別料率は
  // 分かっていない」という**事実そのもの**を記録した行であって、額を持たない。
  // オーナー決定（`master/fees.json` conclusions.F07_payment_fee_working_treatment）で
  // コードに計上したのは「この行の値」ではなく、**別の会社（ZenMarket）が公表している
  // 3.5%を暫定的に借りてきた値**——この3行の「非公表・未取得」という事実は変わらない
  // ままなので、この行自体はMAPPEDにはできない（一致させるべき額が無い）。
  // 借用の経緯・出典は `svc(...).deposit.note` にコード側で書いてある
  // （`services.test.ts` の 'every fee line carries the page it came from' が検査）。
  {
    id: 'F07', company: 'buyee', name: '入金・決済手数料（方法別、非公表）',
    reason: 'マスタのこの行は「Buyee は方法別の入金・決済手数料を公表していない」という'
      + '事実の記録（rule.type: not_included、direct_fetchで確認済み）であって額を持たない。'
      + 'コードの deposit（3.5%, tier: estimate）はこの行の値ではなく、ZenMarketが公表する'
      + '3.5%をオーナー決定で暫定的に借用した値（conclusions.F07_payment_fee_working_treatment）。',
    assertNotInCode: () => {
      // 借りてきた値であって Buyee 自身の公表値ではないことが tier に必ず残ること。
      expect(svc('buyee').deposit!.tier).toBe('estimate');
      expect(svc('buyee').deposit!.sourceUrl).toBeNull();
    },
  },
  {
    id: 'F07', company: 'neokyo', name: '入金・決済手数料（方法別、非公表・処理会社任せ）',
    reason: 'マスタのこの行は「Neokyoは決済プロバイダ(PayPal/Stripe/Wise)自身の手数料に'
      + '委ねており、会社レベルの単一料率という前提自体が成り立たない」という事実の記録'
      + '（rule.type: not_included、direct_fetch）であって額を持たない。コードの deposit'
      + '（3.5%, tier: estimate）はZenMarketの公表値を借用した近似値'
      + '（conclusions.F07_payment_fee_working_treatment）。',
    assertNotInCode: () => {
      expect(svc('neokyo').deposit!.tier).toBe('estimate');
      expect(svc('neokyo').deposit!.sourceUrl).toBeNull();
      // 決済プロバイダ次第で本質的に変動するという構造上の注記がコードに残ること。
      expect(svc('neokyo').deposit!.note).toContain('PayPal');
    },
  },
  {
    id: 'F07', company: 'fromjapan', name: '入金・決済手数料（方法別、この環境では未取得）',
    reason: 'マスタのこの行は「FROM JAPANの該当ページはこの環境から終始403で、公表の有無'
      + 'そのものを確認できなかった」という第三の状態の記録（rule.type: not_included、'
      + 'confidence: null）であって額を持たない。コードの deposit（3.5%, tier: estimate）は'
      + 'ZenMarketの公表値を借用した暫定値（conclusions.F07_payment_fee_working_treatment）。',
    assertNotInCode: () => {
      expect(svc('fromjapan').deposit!.tier).toBe('estimate');
      expect(svc('fromjapan').deposit!.sourceUrl).toBeNull();
      // 「非公表と確認できた」ではなく「未検証」という区別がコードのnoteに残ること。
      expect(svc('fromjapan').deposit!.note).toContain('403');
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
      expect((svc('jauce').unpricedFees ?? []).length).toBe(0);
    },
  },
  {
    id: 'F29', company: 'jauce', name: '保険（標準・¥20,000 超過分。Jauce が自動付保・請求するかは未確定）',
    reason: '2026-09-11 に記録③として追加。日本郵便の増額表（¥20,000増ごとに¥50・上限¥200万）は'
      + 'あるが、Jauce がそれを利用者に自動で付保・請求するかどうかを一次情報から確認できていない'
      + '（開いた問い）。amount_tier C_unknown。基準ケースは¥20,000以内のため実害は無い。',
    assertNotInCode: () => {
      expect((svc('jauce').unpricedFees ?? []).length).toBe(0);
    },
  },
  {
    id: 'F29', company: 'jauce', name: '保険（Premium・任意）',
    reason: 'P1-4（オーナー確定 2026-09-11）: catalog F29 も `docs/FEE-ITEMS.md` も'
      + '「Premium 1.9% は利用者が選ぶ任意」と明記しており、既定では加入しない。'
      + '以前はここを `unpricedFees` として毎行の総額に無条件で乗せ、選んでいない利用者にも'
      + '常に上限不明（`total.high === null`）を課していた——閉区間同士で確定した差がある'
      + '社まで「判別不能」に巻き込む①の入口の一つだったため、既定では行を出さない形に直した'
      + '（この計算機はまだ Premium Insurance の加入有無を選ぶ UI を持たない）。',
    assertNotInCode: () => {
      expect((svc('jauce').unpricedFees ?? []).some((o) => o.key === 'premium-insurance')).toBe(false);
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

  it('display: total の F14外注梱包は、額が無くても総額の行になる', () => {
    // catalog 側の分類そのものが total であること（マスタを直接読む。ハードコードしない）。
    expect(displayOf('F14')).toBe('total');
    // コード側 ── `unpricedFees` として `compare.ts` の `buildRow` が毎行の `lines[]` に足す。
    // 額は公表されていないので amount: null（画面「—」）で、`excluded` に名前が載る。
    const fj = rowsOf().find((r) => r.serviceId === 'fromjapan')!;
    const outsourced = fj.lines.find((l) => l.key === 'outsourced-packing');
    expect(outsourced, 'F14 outsourced-packing must be a total line, not dropped').toBeDefined();
    expect(outsourced!.amount).toBeNull();
    expect(fj.excluded).toContain(outsourced!.label);
  });

  it('display: total だが**任意**の F29 Premium insurance は、選ばれていない既定では行にしない', () => {
    // P1-4（オーナー確定 2026-09-11）: catalog の display: total は「額が無くても
    // 総額の行として消さない」を意味するだけで、「常に発生する」ことは意味しない。
    // F29 Premium Insurance は catalog の display_reason・`docs/FEE-ITEMS.md` の
    // どちらも「利用者が選ぶ任意」と明記しており、選んでいなければ発生しない。
    // 以前はここを無条件で `unpricedFees` に乗せ、選んでいない利用者にも常に
    // 上限不明を課していた（①の入口の一つ）。この計算機はまだ加入するかどうかを
    // 選ぶ UI を持たないので、既定＝加入しない、の間は行を出さない。
    expect(displayOf('F29')).toBe('total');
    // rowsOf() は US 向け。US は Zonos 前払い利用料（duty-prepayment）が全社に乗り、
    // そちらのせいで `total.high` はどのみち null になる（設計どおりの別の理由）。
    // ここで見るのは premium-insurance 行そのものが既定では現れないことだけ。
    const jauce = rowsOf().find((r) => r.serviceId === 'jauce')!;
    const premium = jauce.lines.find((l) => l.key === 'premium-insurance');
    expect(premium, 'premium-insurance is opt-in — must not appear by default').toBeUndefined();
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

// ============================================================================
// F34（通関手数料・業者軸）── `master/customs.json#clearance` と
// `courier-clearance.ts` の `COURIER_CLEARANCE`/`COURIER_CLEARANCE_UNKNOWN` の
// 突き合わせ。
//
// **`services.ts`/`countries.ts` と同じパターン**（マスタの値を `src/` に
// 転記し、この test がマスタから読み直して突き合わせる）を、`clearance` にも
// 適用する。以前は `courier-clearance.ts` が転記した48行のうち28行（7か国×4社）に
// 対応する突き合わせが1件も無く、`master/customs.json` を書き換えても何も
// 落ちない状態だった——#95（F26のcarrier_in条件をコードが見ていなかった）や
// T-F0の発端（Fableが見つけた「マスタを読まない検証器」）と同じ形の欠陥。
//
// **対象は7か国（US/GB/DE/FR/AU/CA/SG）× 4社（FedEx/UPS/DHL Express/ECMS）の
// 28セルだけ**（3本の監査ノート `docs/audit/f34-*-seven-countries-2026-09-12.md`
// がこの28セルをスコープにしている）。郵便側の `clearance`（USPS/Royal Mail等）と、
// CA の古い一括レンジ行（`carrier: "UPS / FedEx / DHL"`、個社に分解済みのため
// 現在は参照していない）はこの28セルに含まれず、対象外——理由をここに明記して
// おく（黙って除外しない）。
// ============================================================================
const CUSTOMS_JSON_PATH = path.join(__dirname, '../../../master/customs.json');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const customsMaster = JSON.parse(fs.readFileSync(CUSTOMS_JSON_PATH, 'utf8')) as { countries: any[] };

const F34_COUNTRIES = ['US', 'GB', 'DE', 'FR', 'AU', 'CA', 'SG'] as const;
const F34_CARRIERS = ['FedEx', 'UPS', 'DHL', 'ECMS'] as const;
type F34Carrier = typeof F34_CARRIERS[number];

function f34Key(cc: CountryCode, carrier: F34Carrier): string {
  return `${cc}::${carrier}`;
}

/** その国の `clearance[]` から、この社1本を厳密一致で拾う（`UPS / FedEx / DHL` の
 * ような一括レンジ行は `carrier === 'UPS'` に一致しないので自動的に除外される）。 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findClearanceRow(cc: CountryCode, carrier: F34Carrier): any | undefined {
  const country = customsMaster.countries.find((c) => (c.code ?? c.country) === cc);
  if (!country) throw new Error(`customs.json に国 ${cc} が無い`);
  const rows = (country.clearance ?? []).filter((r: { carrier?: string }) => {
    const c = r.carrier ?? '';
    if (carrier === 'DHL') return c === 'DHL Express';
    if (carrier === 'FedEx') return c.startsWith('FedEx');
    return c === carrier; // UPS / ECMS は厳密一致
  });
  if (rows.length > 1) {
    throw new Error(`customs.json ${cc} に ${carrier} 行が複数ある（鍵の選び方を直すこと）`);
  }
  return rows[0];
}

/** master の rule から、`courier-clearance.ts` が持つべき rate/min/max/currency を
 * 動的に導く（ベタ書きしない）。account/non-account の2系統は、**row 自身が持つ
 * `variant_applicability.answer`（#102、DHLの一次資料から「どちらが適用されるか」を
 * 決着させた結論）に従って1つを選ぶ**——「高い方を機械的に採用する」という#101の
 * ヘッジは廃止済みなので、ここでも再導入しない。`variant_applicability.answer` が
 * 無いか、その値が variants のキーに存在しない行に出会ったら、このテストは例外を
 * 投げて落ちる（サイレントに「高い方」へフォールバックしない——それは撤回された
 * 挙動を密輸することになる）。 */
function expectedRuleFrom(row: {
  rule: Record<string, unknown>;
  variant_applicability?: { answer?: string };
  carrier?: string;
}): {
  kind: string; rate?: number; minLocal?: number; maxLocal?: number;
  valueLteLocal?: number; flatLocal?: number; aboveRate?: number; aboveMinLocal?: number;
  currency?: string;
} {
  const rule = row.rule as Record<string, unknown>;
  const type = rule.type as string;
  switch (type) {
    case 'greater_of':
    case 'rate_of_import_charges_with_min':
      // 'greater_of' はSG FedExだけ `max` フィールドも持つ（上限つき）——
      // その場合は rate_min_max として扱う（rate_of_import_charges_with_min_and_max と同型）。
      if (rule.max != null) {
        return {
          kind: 'rate_min_max', rate: rule.rate as number,
          minLocal: (rule.flat ?? rule.min) as number, maxLocal: rule.max as number,
          currency: rule.currency as string,
        };
      }
      return {
        kind: 'rate_min', rate: rule.rate as number,
        minLocal: (rule.flat ?? rule.min) as number, currency: rule.currency as string,
      };
    case 'rate_of_import_charges_with_min_and_max':
      return {
        kind: 'rate_min_max', rate: rule.rate as number, minLocal: rule.min as number,
        maxLocal: rule.max as number, currency: rule.currency as string,
      };
    case 'rate_of_import_charges':
      // ECMSの3%のみ（最低額そのものが無い＝0）。マスタはこの型に currency を持たない
      // （率だけの費目に通貨は意味を持たないため）——ここでも currency は突き合わせない。
      return { kind: 'rate_min', rate: rule.rate as number, minLocal: 0 };
    case 'rate_of_import_charges_with_min_variants': {
      const variants = rule.variants as Record<string, { rate: number; min: number; currency: string }>;
      const vs = Object.values(variants);
      const currencies = new Set(vs.map((v) => v.currency));
      expect(currencies.size, 'account/non-account variants must share one currency').toBe(1);
      const answer = row.variant_applicability?.answer;
      if (!answer || !(answer in variants)) {
        // #101の「高い方を採用」ヘッジは撤回済み（#102参照）。ここへフォールバックする
        // 代わりに、その撤回された挙動が密輸されないよう例外で落とす。
        throw new Error(
          `${row.carrier ?? '(carrier不明)'}: rate_of_import_charges_with_min_variants だが `
          + `variant_applicability.answer が無いか variants のキーに一致しない（answer=${String(answer)}）。`
          + ' master/customs.json 側に variant_applicability を追加するか、既存の値を修正すること'
          + '——「高い方を採用」への先祖返りは禁止（#101の欠陥、#102で撤回）。',
        );
      }
      const chosen = variants[answer]!;
      return {
        kind: 'rate_min',
        rate: chosen.rate,
        minLocal: chosen.min,
        currency: chosen.currency,
      };
    }
    case 'greater_of_by_service': {
      const minByService = rule.min_by_service as Record<string, number>;
      return {
        kind: 'rate_min', rate: rule.rate as number,
        minLocal: Math.max(...Object.values(minByService)), currency: rule.currency as string,
      };
    }
    case 'banded_by_value_mixed': {
      const bands = rule.bands as Array<{
        value_lte?: number; value_gt?: number;
        rule: { type: string; amount?: number; rate?: number; min?: number };
      }>;
      const low = bands.find((b) => b.value_lte != null)!;
      const high = bands.find((b) => b.value_gt != null)!;
      return {
        kind: 'banded_value_mixed', currency: rule.currency as string,
        valueLteLocal: low.value_lte, flatLocal: low.rule.amount,
        aboveRate: high.rule.rate, aboveMinLocal: high.rule.min,
      };
    }
    case 'banded_by_import_tax_mixed':
      // FedEx GB/DE 型（このPR、f34-clearance-tiered-band-schema）。帯ごとに
      // 式そのものが変わるため、単一の rate/minLocal には潰せない——帯配列同士の
      // 突き合わせは専用の `expectedDutyTaxBandsFrom()` + 下の describe が行う。
      // **master/customs.json のどの行もまだこの rule.type を使わない**
      // （GB/DE FedExはこのPR時点でも "unknown" のまま）ので、ここは
      // 「kindだけ一致すればよい」形にして、実データが来た日に対応漏れで
      // 落ちないようにしておく。
      return { kind: 'banded_duty_tax_mixed', currency: rule.currency as string };
    default:
      throw new Error(`未対応の rule.type: ${type}（master-sync.test.ts の expectedRuleFrom に追加すること）`);
  }
}

/** `banded_by_import_tax_mixed` 専用: master の帯配列を `Rule.kind:
 * 'banded_duty_tax_mixed'` の帯配列へ変換する（rate/minLocal 等への1点集約が
 * できないので `expectedRuleFrom` の汎用パスとは別に持つ）。 */
function expectedDutyTaxBandsFrom(rule: {
  bands: Array<{ duty_tax_max: number | null; rule: { type: string; rate?: number; min?: number; amount?: number } }>;
}): Array<
  | { maxLocal: number | null; formula: 'rate_with_min'; rate: number; minLocal: number }
  | { maxLocal: number | null; formula: 'flat'; amountLocal: number }
  | { maxLocal: number | null; formula: 'rate_only'; rate: number }
  > {
  return rule.bands.map((band) => {
    const sub = band.rule;
    if (sub.type === 'rate_of_import_charges_with_min') {
      return { maxLocal: band.duty_tax_max, formula: 'rate_with_min', rate: sub.rate!, minLocal: sub.min! };
    }
    if (sub.type === 'fixed_per_parcel') {
      return { maxLocal: band.duty_tax_max, formula: 'flat', amountLocal: sub.amount! };
    }
    if (sub.type === 'rate_of_import_charges') {
      return { maxLocal: band.duty_tax_max, formula: 'rate_only', rate: sub.rate! };
    }
    throw new Error(`banded_by_import_tax_mixed: 未対応の帯内 rule.type: ${sub.type}`);
  });
}

/** master row → 期待する per-parcel/per-shipment。**2026-09-13、オーナー確定でper_shipmentへ
 * 統一**——単位を明言する行が48行中shipmentのみでparcelがゼロという理由により、一次資料が
 * 沈黙している行も含めて `per_shipment` を採る（`courier-clearance.ts` 冒頭コメント参照）。
 * ここではマスタの生の値（`per`/`per_parcel_or_shipment`/`unit`のいずれか）をそのまま
 * `per_shipment`かどうかで突き合わせる——マスタ自体が今回この方針に沿って更新されている
 * ので、コード独自の既定値ロジックは持たない（無言のフォールバックを防ぐ、というF34の
 * 一貫方針）。マスタにこれらのキーが1つも無い行（=課金単位についての記述が一切見つかって
 * いない行）は、このテストの対象外（呼び出し側 `findClearanceRow` のフィルタで弾く）。 */
function expectedPerFrom(row: { per?: string; per_parcel_or_shipment?: string; unit?: string }): 'per_parcel' | 'per_shipment' {
  const raw = row.per ?? row.per_parcel_or_shipment ?? row.unit;
  if (raw !== 'per_shipment') {
    throw new Error(
      `master row の課金単位フィールド（per/per_parcel_or_shipment/unit）が 'per_shipment' ではない`
      + `（raw=${String(raw)}）── 2026-09-13のper-shipment統一で48行の沈黙行も含め全て`
      + `per_shipmentになったはず。per_parcelへの無言のフォールバックはしない。`,
    );
  }
  return 'per_shipment';
}

/** master row → 期待する unitConfidence。単位フィールドに専用の `*_tier` が
 * `'reasoned_judgement_unconfirmed'` として付いていれば、この行の一次資料自体は
 * 単位について沈黙しており、他行の傾向からの推論で per_shipment にした
 * （`courier-clearance.ts`: `unitConfidence: 'inferred'`）。それが無ければ、この行の
 * 一次資料自体が単位を述べている（`'sourced'`）——SG FedExの`search_snippet_no_verbatim_quote`
 * も「この行自体について"per shipment"を伝える情報源がある」という点で sourced 側に含む
 * （courier-clearance.ts の basisNote 参照）。 */
function expectedUnitConfidenceFrom(
  row: { per_parcel_or_shipment_tier?: string; unit_tier?: string; per_tier?: string },
): 'sourced' | 'inferred' {
  const tier = row.per_parcel_or_shipment_tier ?? row.unit_tier ?? row.per_tier;
  return tier === 'reasoned_judgement_unconfirmed' ? 'inferred' : 'sourced';
}

describe('F34 MAPPED ── master/customs.json#clearance と courier-clearance.ts が一致しなければならない行', () => {
  for (const cc of F34_COUNTRIES) {
    for (const carrier of F34_CARRIERS) {
      const row = findClearanceRow(cc, carrier);
      if (!row || row.tier !== 'A_confirmed' && row.tier !== 'B_inferred') continue;
      it(`${f34Key(cc, carrier)}: tier/rule/per が一致する（master tier=${row.tier}）`, () => {
        const code = COURIER_CLEARANCE[cc]?.[carrier];
        expect(code, `${f34Key(cc, carrier)} が COURIER_CLEARANCE に無い`).toBeDefined();
        // tier: A_confirmed→fixed、B_inferred→estimate
        expect(code!.tier).toBe(row.tier === 'A_confirmed' ? 'fixed' : 'estimate');
        const expectedRule = expectedRuleFrom(row);
        expect(code!.rule.kind).toBe(expectedRule.kind);
        if (expectedRule.rate != null && 'rate' in code!.rule) {
          expect(code!.rule.rate).toBeCloseTo(expectedRule.rate, 10);
        }
        if ('minLocal' in code!.rule && expectedRule.minLocal != null) {
          // DE DHL だけ VAT 込みに換算している（#99・courier-clearance.ts のコメント参照）。
          const vatMultiplier = cc === 'DE' && carrier === 'DHL' && row.rule.min_plus_vat ? 1.19 : 1;
          expect((code!.rule as { minLocal: number }).minLocal)
            .toBeCloseTo(expectedRule.minLocal * vatMultiplier, 10);
        }
        if ('maxLocal' in code!.rule && expectedRule.maxLocal != null) {
          expect((code!.rule as { maxLocal: number }).maxLocal).toBeCloseTo(expectedRule.maxLocal, 10);
        }
        if (expectedRule.kind === 'banded_value_mixed') {
          const r = code!.rule as {
            valueLteLocal: number; flatLocal: number; aboveRate: number; aboveMinLocal: number;
          };
          expect(r.valueLteLocal).toBe(expectedRule.valueLteLocal);
          expect(r.flatLocal).toBe(expectedRule.flatLocal);
          expect(r.aboveRate).toBeCloseTo(expectedRule.aboveRate!, 10);
          expect(r.aboveMinLocal).toBeCloseTo(expectedRule.aboveMinLocal!, 10);
        }
        if (expectedRule.currency != null) expect(code!.currency).toBe(expectedRule.currency);
        expect(code!.per).toBe(expectedPerFrom(row));
        // **2026-09-13、per-shipment統一の追加分**: 単位が「一次資料が明言した事実」
        // （sourced）なのか「他行の傾向からのこちらの推論」（inferred）なのかを、
        // `unitConfidence` が master の `*_tier` と一致していることまで確認する。
        // 一致しなければ、推論を確認済みの事実に見せてしまう（またはその逆）ので、
        // ここも他の軸と同じく無言のフォールバックを許さない。
        expect(
          code!.unitConfidence,
          `${f34Key(cc, carrier)}: unitConfidence がmasterの*_tier（`
          + `${JSON.stringify({
            per_parcel_or_shipment_tier: row.per_parcel_or_shipment_tier,
            unit_tier: row.unit_tier,
            per_tier: row.per_tier,
          })}）と食い違う`,
        ).toBe(expectedUnitConfidenceFrom(row));
      });
    }
  }
});

describe('F34 CA DHL ── 変種の大小関係がGB/FRと逆で、「高い方」でも偶然一致していたケースを固定する', () => {
  // CAはnon_account_holderの方がaccount_holderより高い（GB/FRは逆）。#101の「高い方」
  // ヘッジは撤回されたが、CAだけは撤回前も撤回後も同じ値(min=18.0)を返す——これは
  // 「たまたま」であって「正しい理由で」ではなかった、という事実そのものをここで
  // 固定する。将来どちらかの変種の数字が変わって大小関係が入れ替わっても、この
  // テストは「non_account_holderの値」を追いかけ続けるので、偶然の一致に頼った
  // 実装へ静かに戻ることはできない。
  it('CA::DHL: variant_applicabilityはnon_account_holder、その値min=18.0/rate=0.0275が採用される', () => {
    const row = findClearanceRow('CA', 'DHL');
    expect(row, 'CA::DHL が customs.json に無い').toBeDefined();
    expect(row.variant_applicability?.answer).toBe('non_account_holder');
    const variants = row.rule.variants as Record<string, { rate: number; min: number; currency: string }>;
    // 大小関係がGB/FRと逆であることそのものを確認する（このテストの存在理由）。
    expect(variants.non_account_holder!.min).toBeGreaterThan(variants.account_holder!.min);
    expect(variants.non_account_holder!.min).toBe(18.0);
    expect(variants.non_account_holder!.rate).toBe(0.0275);
    const code = COURIER_CLEARANCE.CA?.DHL;
    expect(code, 'CA::DHL が COURIER_CLEARANCE に無い').toBeDefined();
    expect((code!.rule as { minLocal: number }).minLocal).toBeCloseTo(18.0, 10);
    expect((code!.rule as { rate: number }).rate).toBeCloseTo(0.0275, 10);
  });
});

describe('F34 DELIBERATELY_UNPRICED ── C_unknown/schema_gap は点推定を出さない', () => {
  // マスタが `tier: 'C_unknown'` で、かつ「法人自体が無い」(counted_absence) では
  // ない行（= 一次資料が取得できなかった／既存スキーマで表現できない、のどちらか）。
  // これらは COURIER_CLEARANCE に値を持たず、代わりに COURIER_CLEARANCE_UNKNOWN に
  // 説明を持つ——「意図的に価格化していない」ことをここで assert する。
  const cases: Array<{ cc: CountryCode; carrier: F34Carrier }> = [
    { cc: 'GB', carrier: 'FedEx' }, // schema_gap（3段帯）
    { cc: 'GB', carrier: 'UPS' },   // C_unknown（一次資料未達）
    { cc: 'DE', carrier: 'FedEx' }, // schema_gap（3段帯）
  ];
  for (const { cc, carrier } of cases) {
    it(`${f34Key(cc, carrier)}: master が C_unknown ⇒ コードは意図的に未価格化`, () => {
      const row = findClearanceRow(cc, carrier);
      expect(row, `${f34Key(cc, carrier)} が customs.json に無い`).toBeDefined();
      expect(row.tier).toBe('C_unknown');
      // 「無いから未接続」ではなく「見つけた上で価格化を諦めた」ことを示す証跡が
      // マスタ側にあること（schema_gap フラグか、逐語引用が取れていない旨の記述）。
      expect(
        row.schema_gap === true || row.verbatim_quote_available === false,
        `${f34Key(cc, carrier)}: C_unknownの根拠（schema_gap または未逐語確認）が row に無い`,
      ).toBe(true);
      expect(COURIER_CLEARANCE[cc]?.[carrier]).toBeUndefined();
      expect(COURIER_CLEARANCE_UNKNOWN[cc]?.[carrier]).toBeTruthy();
    });
  }
});

describe('F34 tiered band schema (banded_by_import_tax_mixed ↔ banded_duty_tax_mixed) ── 能力の突き合わせ', () => {
  // GB/DE FedExの実行（`findClearanceRow`）は依然 `rule.type: "unknown"` のままで
  // customs.json を書き換えていない（このPRのスコープ外——PR本文参照）。したがって
  // ここは実データではなく、raw_findings（docs/audit/f34-fedex-seven-countries-
  // 2026-09-12.md）が記録した値をそのまま合成した master 形の row で
  // `expectedRuleFrom`/`expectedDutyTaxBandsFrom` を駆動し、それが
  // `courier-clearance.ts` 側の `Rule.kind: 'banded_duty_tax_mixed'` と
  // 一致することだけを確認する。実データが移行されたときにこの変換ロジック自体は
  // 対応済みであることの保証で、GB/DEの2セルを勝手に価格化するものではない
  // （それは下の DELIBERATELY_UNPRICED 及び courier-clearance.test.ts の
  // 別テストが固定している）。
  const syntheticGbFedexRow = {
    carrier: 'FedEx',
    rule: {
      type: 'banded_by_import_tax_mixed',
      currency: 'GBP',
      bands: [
        { duty_tax_max: 43, rule: { type: 'rate_of_import_charges_with_min', rate: 0.30, min: 10.50 } },
        { duty_tax_max: 524, rule: { type: 'fixed_per_parcel', amount: 12.90 } },
        { duty_tax_max: null, rule: { type: 'rate_of_import_charges', rate: 0.025 } },
      ],
    },
  };

  it('expectedRuleFrom() recognises banded_by_import_tax_mixed and reports the matching code-side kind', () => {
    const expected = expectedRuleFrom(syntheticGbFedexRow);
    expect(expected.kind).toBe('banded_duty_tax_mixed');
    expect(expected.currency).toBe('GBP');
  });

  it('expectedDutyTaxBandsFrom() converts the master bands into courier-clearance.ts\'s DutyTaxBand shape', () => {
    const bands = expectedDutyTaxBandsFrom(syntheticGbFedexRow.rule);
    expect(bands).toEqual([
      { maxLocal: 43, formula: 'rate_with_min', rate: 0.30, minLocal: 10.50 },
      { maxLocal: 524, formula: 'flat', amountLocal: 12.90 },
      { maxLocal: null, formula: 'rate_only', rate: 0.025 },
    ]);
  });

  it('a Rule built from those converted bands prices identically to master/test_tiered_band_schema.py\'s Python fixture', () => {
    // ここでの数値（20→10.50, 43→max(0.3*43,10.50), 43.01→12.90, 524→12.90,
    // 524.01→0.025*524.01, 10000→250.0）は master/test_tiered_band_schema.py の
    // GB_FEDEX_RULE アサーションと1件ずつ対応する——2言語の実装がずれていないことの
    // 確認がこのテストの目的なので、値は勝手に変えないこと。
    const bands = expectedDutyTaxBandsFrom(syntheticGbFedexRow.rule);
    const rule = { kind: 'banded_duty_tax_mixed' as const, bands };
    const CCY = 1; // local と yen を同一視（Pythonの生の import_tax 値と直接比較するため）
    expect(evalClearanceRuleYen(rule, 20, 0, CCY)).toBeCloseTo(10.50, 10);
    expect(evalClearanceRuleYen(rule, 43, 0, CCY)).toBeCloseTo(Math.max(0.30 * 43, 10.50), 10);
    expect(evalClearanceRuleYen(rule, 43.01, 0, CCY)).toBeCloseTo(12.90, 10);
    expect(evalClearanceRuleYen(rule, 524, 0, CCY)).toBeCloseTo(12.90, 10);
    expect(evalClearanceRuleYen(rule, 524.01, 0, CCY)).toBeCloseTo(0.025 * 524.01, 10);
    expect(evalClearanceRuleYen(rule, 10_000, 0, CCY)).toBeCloseTo(250.0, 10);
  });
});

describe('F34 NO_LINE (counted_absence) ── 法人が確認できない業者は行そのものを出さない', () => {
  // ECMS の DE/FR/AU/CA。「無いと確認した」のではなく「探したが法人・T&Cが
  // 見つからなかった」——DELIBERATELY_UNPRICEDとは違うので別バケットにする
  // （こちらは COURIER_CLEARANCE にも COURIER_CLEARANCE_UNKNOWN にも入らない）。
  const cases: CountryCode[] = ['DE', 'FR', 'AU', 'CA'];
  for (const cc of cases) {
    it(`${f34Key(cc, 'ECMS')}: master が counted_absence ⇒ コードは行を出さない（未価格化行とも別扱い）`, () => {
      const row = findClearanceRow(cc, 'ECMS');
      expect(row, `${f34Key(cc, 'ECMS')} が customs.json に無い`).toBeDefined();
      expect(row.tier).toBe('C_unknown');
      expect(row.evidence_class).toBe('counted_absence');
      expect(COURIER_CLEARANCE[cc]?.ECMS).toBeUndefined();
      // DELIBERATELY_UNPRICED（schema_gap/一次資料未達）とは異なり、
      // 「額不明」の注意書きすら持たない——法人がそもそも無いので費目自体が無い。
      expect(COURIER_CLEARANCE_UNKNOWN[cc]?.ECMS).toBeUndefined();
    });
  }
});

describe('F34 網羅性 ── 7か国×4社=28セルすべてが3つのバケット（MAPPED/UNPRICED/NO_LINE）のどれかに入る', () => {
  it('customs.json 側の tier/evidence_class から見て、28セルすべてに対応が付く', () => {
    const seen = new Set<string>();
    for (const cc of F34_COUNTRIES) {
      for (const carrier of F34_CARRIERS) {
        const key = f34Key(cc, carrier);
        const row = findClearanceRow(cc, carrier);
        expect(row, `${key}: customs.json にこのセルが無い（監査が確認した28セルの前提が崩れている）`).toBeDefined();
        seen.add(key);
        if (row.evidence_class === 'counted_absence') {
          expect(COURIER_CLEARANCE[cc]?.[carrier]).toBeUndefined();
          expect(COURIER_CLEARANCE_UNKNOWN[cc]?.[carrier]).toBeUndefined();
        } else if (row.tier === 'C_unknown') {
          expect(COURIER_CLEARANCE[cc]?.[carrier]).toBeUndefined();
          expect(COURIER_CLEARANCE_UNKNOWN[cc]?.[carrier]).toBeTruthy();
        } else {
          // A_confirmed / B_inferred
          expect(COURIER_CLEARANCE[cc]?.[carrier], `${key} は価格化されているはず`).toBeDefined();
        }
      }
    }
    expect(seen.size).toBe(F34_COUNTRIES.length * F34_CARRIERS.length); // 28
  });
});
