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
import { EXPORT_DECLARATION_FEE_YEN, SERVICE_BY_ID } from './services';
import type { Service } from './services';

// ── マスタ読み込み ──────────────────────────────────────────────
const FEES_JSON_PATH = path.join(__dirname, '../../../master/fees.json');
const master = JSON.parse(fs.readFileSync(FEES_JSON_PATH, 'utf8')) as {
  // fees.json の rule は行ごとに形が違う JSON なので、ここだけ any を許し、
  // 各エントリの expect() 側で個別のフィールドに絞り込む。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: Array<{ id: string; company: string; name: string; rule: any; tier: string }>;
};
const rows = master.rows;

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

/** 個口1kg・1点の共通コンテキスト。amountFor() を使う行の比較に使う。 */
const CTX_1KG = { parcels: 1, parcelGrossG: [1000], units: 1, packingYen: 0 };

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
    read: () => EXPORT_DECLARATION_FEE_YEN,
    expect: () => findRow('F26', 'buyee', '輸出通関手数料').rule.amount,
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
    id: 'F16', company: 'zenmarket', name: '梱包後の変更・キャンセル',
    // マスタ tiers の最初の段（〜4,999g）= ¥1,000。code の optional 'repack' の
    // base 額（note に「from ¥1,000 to ¥4,000」とある最小額）と一致するはず
    read: () => svc('zenmarket').optional.find((o) => o.key === 'repack')!.amountYen,
    expect: () => findRow('F16', 'zenmarket', '梱包後の変更・キャンセル').rule.tiers[0][1],
  },
  {
    id: 'F18', company: 'zenmarket', name: '写真サービス',
    read: () => svc('zenmarket').optional.find((o) => o.key === 'photos')!.amountYen,
    expect: () => findRow('F18', 'zenmarket', '写真サービス').rule.amount,
  },
  {
    id: 'F21', company: 'zenmarket', name: '保管超過',
    read: () => svc('zenmarket').optional.find((o) => o.key === 'storage')!.amountYen,
    expect: () => findRow('F21', 'zenmarket', '保管超過').rule.amount,
  },
  {
    id: 'F29', company: 'zenmarket', name: '輸送保険',
    // rule.type "zero" (included_in F02) → zenmarket の optional に
    // 保険関連キーが独立して存在しないこと
    read: () => svc('zenmarket').optional.some((o) => o.key.includes('insurance')),
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
    id: 'F17', company: 'neokyo', name: '開梱',
    read: () => svc('neokyo').optional.find((o) => o.key === 'unpacking')!.amountYen,
    expect: () => findRow('F17', 'neokyo', '開梱').rule.amount,
  },
  {
    id: 'F08', company: 'neokyo', name: 'コンビニ払い',
    read: () => svc('neokyo').optional.find((o) => o.key === 'konbini')!.amountYen,
    expect: () => findRow('F08', 'neokyo', 'コンビニ払い').rule.amount,
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
    id: 'F08', company: 'fromjapan', name: 'コンビニ・郵便局払い',
    read: () => svc('fromjapan').optional.find((o) => o.key === 'konbini')!.amountYen,
    expect: () => findRow('F08', 'fromjapan', 'コンビニ・郵便局払い').rule.amount,
  },
  {
    id: 'F16', company: 'fromjapan', name: '再梱包',
    read: () => svc('fromjapan').optional.find((o) => o.key === 'repack')!.amountYen,
    expect: () => findRow('F16', 'fromjapan', '再梱包').rule.amount,
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
    id: 'F14', company: 'jauce', name: '梱包（Fragile）',
    // amountFor() は個口重量から実額を作る関数なので、1kg で実行して比較する
    read: () => svc('jauce').optional.find((o) => o.key === 'fragile-packing')!.amountFor!(CTX_1KG),
    expect: () => {
      const rule = findRow('F14', 'jauce', '梱包（Fragile）').rule;
      return rule.fixed + rule.per_kg * Math.ceil(CTX_1KG.parcelGrossG[0]! / 1000);
    },
  },
  {
    id: 'F24', company: 'jauce', name: '特殊処理',
    read: () => svc('jauce').optional.find((o) => o.key === 'customized-processing')!.amountYen,
    expect: () => findRow('F24', 'jauce', '特殊処理').rule.amount,
  },
  {
    id: 'F26', company: 'jauce', name: '追加通関手数料',
    read: () => EXPORT_DECLARATION_FEE_YEN,
    expect: () => findRow('F26', 'jauce', '追加通関手数料').rule.amount,
  },
  {
    id: 'F30', company: 'jauce', name: '速達処理',
    read: () => svc('jauce').optional.find((o) => o.key === 'expedited')!.amountFor!(CTX_1KG),
    expect: () => {
      const rule = findRow('F30', 'jauce', '速達処理').rule;
      return rule.fixed + rule.per_kg * Math.ceil(CTX_1KG.parcelGrossG[0]! / 1000);
    },
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
  {
    id: 'F18', company: 'fromjapan', name: '写真サービス',
    read: () => svc('fromjapan').optional.find((o) => o.key === 'photos')!.amountYen,
    expect: () => findRow('F18', 'fromjapan', '写真サービス').rule.amount,
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
  {
    id: 'F20', company: 'neokyo', name: '保管無料期間',
    read: () => svc('neokyo').optional.find((o) => o.key === 'storage')!.amountYen,
    expect: () => findRow('F20', 'neokyo', '保管無料期間').rule.after.amounts_by_size.small.order,
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
      expect(svc('buyee').optional.some((o) => o.key.includes('free-shipping'))).toBe(false);
    },
  },
  {
    id: 'F14', company: 'buyee', name: 'まとめ梱包',
    reason: 'amount_tier C_unknown。額そのものが未取得（quote 未取得。code は'
      + ' consolidationOnRequest: true という真偽値だけを持ち、金額は持たない）。',
    assertNotInCode: () => {
      expect(svc('buyee').optional.some((o) => o.key.includes('consolidat'))).toBe(false);
    },
  },
  {
    id: 'F10', company: 'zenmarket', name: '無形物の追加手数料',
    reason: 'catalog F10:「無形物の取扱条件が違うので額も違う。額が未取得で、取れたら総額へ。」',
    assertNotInCode: () => {
      expect(svc('zenmarket').optional.some((o) => o.key.includes('intangible'))).toBe(false);
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
      expect(svc('zenmarket').optional.some((o) => o.key.includes('reinforce'))).toBe(false);
    },
  },
  {
    id: 'F19', company: 'zenmarket', name: '検品',
    reason: 'catalog F19: display hidden, occurrence D_user_choice「利用者が選んだときだけで、'
      + '額も未取得（オーナー決定 2026-09-11）」。',
    assertNotInCode: () => {
      expect(svc('zenmarket').optional.some((o) => o.key.includes('inspect'))).toBe(false);
    },
  },
  {
    id: 'F20', company: 'zenmarket', name: '保管無料期間',
    reason: 'catalog F20:「F21 の判定パラメータ...独立行にはしない」。無料日数自体は optional'
      + ' の note 文字列にのみ現れ、コードの独立した数値フィールドとしては存在しない。',
    assertNotInCode: () => {
      expect((svc('zenmarket') as unknown as Record<string, unknown>).freeStorageDays).toBeUndefined();
    },
  },
  {
    id: 'F22', company: 'zenmarket', name: '倉庫到着後のキャンセル',
    reason: 'catalog F22: display hidden, occurrence E_unpredictable「落札後はキャンセル不可。'
      + '発生すれば全損に近いが予測できない（オーナー決定 2026-09-11）」。',
    assertNotInCode: () => {
      expect(svc('zenmarket').optional.some((o) => o.key.includes('cancel'))).toBe(false);
    },
  },
  {
    id: 'F23', company: 'zenmarket', name: '廃棄',
    reason: 'catalog F23: display hidden「保管期限超過で廃棄される。額が未取得'
      + '（オーナー決定 2026-09-11）」。',
    assertNotInCode: () => {
      expect(svc('zenmarket').optional.some((o) => o.key.includes('dispos'))).toBe(false);
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
      expect(svc('fromjapan').optional.some((o) => o.key.includes('negotiat'))).toBe(false);
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
      expect(svc('fromjapan').optional.some((o) => o.key.includes('dispos'))).toBe(false);
    },
  },
  {
    id: 'F27', company: 'fromjapan', name: 'FedEx 直配エリア外',
    reason: 'catalog F27:「住所で決まる（FJ の FedEx 直配エリア外 ¥2,710）。マスタに'
      + ' A_confirmed で値があるのにコードに接続されていない」（docs/FIT-GAP.md §5 T-F3/T-F8）。',
    assertNotInCode: () => {
      expect(svc('fromjapan').optional.some((o) => o.key.includes('fedex'))).toBe(false);
    },
  },
  {
    id: 'F30', company: 'fromjapan', name: '配送方法の可否（商品代に依存）',
    reason: 'catalog F30:「FJ の価格別可否はマスタに A_confirmed で在るのに未接続」'
      + '（docs/FIT-GAP.md §5 T-F3/T-F8）。postage の型には価格帯による method_eligibility を'
      + '表すフィールドが無い。',
    assertNotInCode: () => {
      expect(svc('fromjapan').postage['small-packet-air']).not.toHaveProperty('priceEligibility');
    },
  },
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
    id: 'F20', company: 'jauce', name: '保管無料期間',
    reason: 'catalog F20 と同型（F21相当のパラメータで独立行にしない）。額自体も amount_tier'
      + ' C_unknown で、コードの optional storage も amountYen: null のまま未取得で一致している。',
    assertNotInCode: () => {
      const storage = svc('jauce').optional.find((o) => o.key === 'storage')!;
      expect(storage.amountYen).toBeNull();
    },
  },
  {
    id: 'F29', company: 'jauce', name: '保険（Premium）',
    reason: 'catalog F29:「Jauce の Premium 1.9% は利用者が選ぶもので、かつ課税ベースが'
      + '原文から読めない」ため額を出さない。',
    assertNotInCode: () => {
      const ins = svc('jauce').optional.find((o) => o.key === 'premium-insurance')!;
      expect(ins.amountYen).toBeNull();
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
    id: 'F20', company: 'fromjapan', name: '保管無料期間',
    reason: 'catalog F20 と同型（F21相当のパラメータで独立行にしない）。60日の無料期間自体は'
      + ' optional storage の note 文字列にしか無く、独立した数値フィールドとしては存在しない。',
    assertNotInCode: () => {
      expect((svc('fromjapan') as unknown as Record<string, unknown>).freeStorageDays).toBeUndefined();
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

describe('CONFLICT ── 既知の食い違い。まだ食い違っていることを assert する', () => {
  for (const e of CONFLICT) {
    it(`[${e.task}] ${e.id}/${e.company} ${e.name}`, () => {
      e.assertStillConflicting();
    });
  }
});

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
