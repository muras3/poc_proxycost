import type { Line, ParcelBox, ParcelSplitReason, Row } from '@/lib/pricing/types';
import { yen, yenRounded } from '@/lib/ui/format';

/**
 * Mock v3（prototypes/mock-v3.html）の表示規則を、そのまま関数にしたもの。
 * 数値は一切作らない——`Row`/`Line` の値を文字列と % に写すだけ。
 */

/** 総額の見た目（Mock `totalParts`）。`high === null` は「¥X」＋ aria で「or more」。 */
export function totalParts(row: Row): { vis: string; plus: boolean; aria: string } {
  const t = row.total;
  if (t.high === null) {
    return { vis: yenRounded(t.low), plus: true, aria: `${yenRounded(t.low)} or more, upper bound unknown` };
  }
  if (yenRounded(t.high) === yenRounded(t.low)) {
    return { vis: yenRounded(t.low), plus: false, aria: yenRounded(t.low) };
  }
  return {
    vis: `${yenRounded(t.low)} – ${yenRounded(t.high).slice(1)}`,
    plus: false,
    aria: `${yenRounded(t.low)} to ${yenRounded(t.high)}`,
  };
}

/** 総額バーの2本の幅（%）。全行共通の `hiMax` スケール（Mock `totBarHTML`）。 */
export function totBarPcts(row: Row, hiMax: number): { lowPct: number; hiPct: number; unbounded: boolean } {
  const lowPct = Math.max(2, Math.round((100 * row.total.low) / hiMax));
  const hiPct = row.total.high == null ? 100 : Math.min(100, Math.round((100 * row.total.high) / hiMax));
  return { lowPct, hiPct, unbounded: row.total.high == null };
}

/** 到着日数バー（Mock `dayBarHTML`）。対数スケール 1〜90 日。 */
export const DAY_SCALE_MAX = 90;
export function dayPct(v: number): number {
  return Math.max(3, Math.min(100, (Math.log(Math.max(v, 1) + 1) / Math.log(DAY_SCALE_MAX + 1)) * 100));
}
/**
 * 日数の棒の両端。**`Row.days.text` を正規表現で読まない**——エンジンが一次情報
 * （`daysTier === 'fixed'`）のときだけ数値化した `minDays`/`maxDays` をそのまま使う。
 * 「N days or less」は `minDays: null` なので物差しの起点（1日）から `maxDays` まで。
 * 両方 `null`（宅配便の自称、"a week or less"、月表記）は「未公表」の形（点線）。
 * Mock は "a week or less" も数字が無いので同じく未公表の形に描いていた。
 */
export function dayBounds(d: Row['days']): { lo: number; hi: number } | null {
  if (d.minDays == null && d.maxDays == null) return null;
  const hi = d.maxDays ?? d.minDays!;
  return { lo: d.minDays ?? 1, hi };
}

/** 費目の金額表示（Mock `lineAmount`）。 */
export function lineAmount(l: Line): { txt: string; tag: string; cls: string; note?: string | null } {
  if (l.amount == null) {
    if (l.unknownCapYen != null) {
      return { txt: `≈ up to ${yen(l.unknownCapYen)}`, tag: 'unknown', cls: 'none', note: l.unknownCapNote };
    }
    return { txt: 'not published', tag: 'no upper bound', cls: 'none' };
  }
  const pre = l.tier === 'estimate' ? '≈' : '';
  if (l.amountKind === 'range' && l.amountHighYen != null) {
    return { txt: `${pre}${yen(l.amount)} – ${yen(l.amountHighYen).slice(1)}`, tag: l.tier, cls: l.tier };
  }
  const tag = { fixed: 'published', estimate: 'estimate', unverified: 'second-hand', none: '—' }[l.tier];
  return { txt: pre + yen(l.amount), tag, cls: l.tier };
}

/** 配達ログの段（Mock `STAGES`／`STAGE_OF`）。知らない key は Bought に黙って入れず Other へ。 */
export type StageKey = 'bought' | 'warehouse' | 'packed' | 'export' | 'import' | 'other' | 'door';
export const STAGES: readonly [StageKey, string][] = [
  ['bought', 'Bought'], ['warehouse', 'Warehouse'], ['packed', 'Packed'], ['export', 'Export clearance'],
  ['import', 'Import clearance'], ['other', 'Other (unmapped fee)'], ['door', 'Door'],
];
const STAGE_OF: Record<string, StageKey> = {
  items: 'bought', 'service-fee': 'bought', 'purchase-fee': 'bought', 'payment-inside-jp': 'bought',
  deposit: 'bought', 'bank-fee': 'bought', 'protection-plan': 'bought', 'ad-valorem': 'bought',
  'domestic-shipping': 'warehouse', storage: 'warehouse',
  packing: 'packed', 'consolidation-packing': 'packed', 'outsourced-packing': 'packed',
  'intl-shipping': 'export', 'export-clearance': 'export',
  duty: 'import', vat: 'import', 'province-tax': 'import', 'courier-clearance-fee': 'import',
  clearance: 'import', 'duty-prepayment': 'import', 'prepaid-import-tax': 'import',
};
export const stageOf = (key: string): StageKey => STAGE_OF[key] ?? 'other';

export const REASON: Record<ParcelSplitReason, string> = {
  single: 'all items together',
  'per-listing': 'one order per listing — sent on its own',
  'identified-shop': 'a different shop',
  'unresolved-shop': "shop unknown, so we don't combine — may read high",
  'weight-limit': "split at the method's weight limit",
};
export function dutyText(d: ParcelBox['tax']['duty']): string {
  switch (d.kind) {
    case 'flat': return `flat duty ${yen(d.yen ?? 0)} (even under the limit)`;
    case 'free': return 'under the duty-free limit';
    case 'no-duty': return 'no duty on this';
    case 'rate': return `duty ${yen(d.yen ?? 0)}`;
    case 'unknown': return 'duty rate unpublished';
  }
}
export function vatText(v: ParcelBox['tax']['vat']): string {
  switch (v.kind) {
    case 'no-rate': return 'no federal VAT/GST';
    case 'seller-collects': return 'tax collected at checkout';
    case 'free': return 'under the tax-free limit';
    case 'rate': return `tax ${yen(v.yen ?? 0)}`;
  }
}

export const kg = (g: number) => `${(g / 1000).toFixed(1)} kg`;
export const boxWord = (n: number) => (n === 1 ? '1 box' : `${n} boxes`);

/** 1位の言葉（旧 `RankBoard.leadWordFor` と同じ規則）。 */
export function leadWord(row: Row, rankIndeterminate: boolean): 'LEADS' | 'ESTIMATED CHEAPEST' | 'CHEAPEST' {
  if (rankIndeterminate) return 'LEADS';
  return row.closedByAssumption.length > 0 ? 'ESTIMATED CHEAPEST' : 'CHEAPEST';
}
