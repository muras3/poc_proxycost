/**
 * 断定不能（rankIndeterminate）台帳の生成スクリプト。
 *
 * 目的（オーナー、2026-09-13）:「なぜ断定できないのかを表で管理し、何が分かれば
 * 断定できるのかを管理して、それを潰していけば精度が上がる」。一度きりの表ではなく、
 * 費目を1つ埋めるたびに再生成して「断定不能が何件に減ったか」を追える台帳にする。
 *
 * **既存のエンジン（`compare()`、src/lib/pricing/compare.ts）を呼ぶだけ**——
 * 計算式はここに一切複製しない。
 *
 * 既定の条件格子は `docs/audit/fable-fix-readiness-2026-09-13.md` §3 の記述
 * （「グリッド: 7か国 × 重量 {200,500,1000,2000,3000,5000,8000}g ×
 * 商品価格 {3000,10000,30000,60000,100000,150000,250000}円、1品目、
 * `storageDays: 0`、`method: 'cheapest'`」）をそのまま踏襲する。343条件
 * （7×7×7）になる。
 *
 * **`Item.site` の既定は `'mercari'`。** `yahoo-auctions` では 292/343
 * （85.1%）、`mercari` では **297/343（86.6%）**——後者がオーナー言及の
 * 「297/343 (86.6%)」（Fable 5.1）と一致したため、既定を `mercari` にした。
 * `fable-fix-readiness-2026-09-13.md` 本文は 288/343（84%）と書いているが、
 * これは +25% の燃油サーチャージ仮置きを適用した後の数字（同文書 A2/δ-2 節）
 * で、site 抜きのベース `cheapest` 呼び出しの数字ではない——単純な site
 * 違いとは別の食い違いなので、直接の比較対象にしていない。`--site` で
 * `yahoo-auctions` にも切り替えられる。
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { compare } from '../src/lib/pricing/compare';
import type { CountryCode, Item, Line, Row, SiteId } from '../src/lib/pricing/types';

// ── 条件格子（引数で上書き可能） ─────────────────────────────────────────

const DEFAULT_COUNTRIES: CountryCode[] = ['US', 'GB', 'DE', 'FR', 'AU', 'CA', 'SG'];
const DEFAULT_WEIGHTS_G = [200, 500, 1000, 2000, 3000, 5000, 8000];
const DEFAULT_PRICES_YEN = [3000, 10000, 30000, 60000, 100000, 150000, 250000];
const DEFAULT_ITEM_COUNT = 1;
const DEFAULT_STORAGE_DAYS = 0;
const DEFAULT_SITE: SiteId = 'mercari';

interface Args {
  countries: CountryCode[];
  weights: number[];
  prices: number[];
  itemCount: number;
  storageDays: number;
  site: SiteId;
  outDir: string;
  date: string;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const csv = (v: string | undefined) => (v ? v.split(',').map((s) => s.trim()) : undefined);
  const nums = (v: string | undefined) => csv(v)?.map(Number);

  const countries = (csv(get('--countries')) as CountryCode[] | undefined) ?? DEFAULT_COUNTRIES;
  const weights = nums(get('--weights')) ?? DEFAULT_WEIGHTS_G;
  const prices = nums(get('--prices')) ?? DEFAULT_PRICES_YEN;
  const itemCount = Number(get('--items') ?? DEFAULT_ITEM_COUNT);
  const storageDays = Number(get('--storage-days') ?? DEFAULT_STORAGE_DAYS);
  const site = (get('--site') as SiteId | undefined) ?? DEFAULT_SITE;
  const date = get('--date') ?? new Date().toISOString().slice(0, 10);
  const outDir = get('--out-dir') ?? 'docs/ledger';

  return { countries, weights, prices, itemCount, storageDays, site, outDir, date };
}

// ── 条件1件ぶんの計算 ──────────────────────────────────────────────────

interface LedgerRow {
  country: CountryCode;
  weightG: number;
  priceYen: number;
  itemCount: number;
  storageDays: number;
  site: SiteId;
  leaderCompany: string;
  leaderMethod: string;
  leaderLow: number;
  leaderHigh: number | null;
  rankIndeterminate: boolean;
  blockingKeys: string;
  blockingLabels: string;
  blockingTiers: string;
  blockingUnknownReasons: string;
  blockingSourceUrls: string;
  runnerUpCompany: string | null;
  runnerUpLow: number | null;
}

function itemsFor(priceYen: number, weightG: number, itemCount: number, site: SiteId): Item[] {
  const items: Item[] = [];
  for (let i = 0; i < itemCount; i += 1) {
    items.push({
      id: `item-${i}`,
      title: `item ${i}`,
      priceYen,
      priceTier: 'fixed',
      site,
      weightG,
      weightTier: 'estimate',
      qty: 1,
    });
  }
  return items;
}

/**
 * 1位の行を「不確定にしている `Line`」を特定する。
 *
 * **`docs/audit/fable-fix-readiness-round2-2026-09-13.md` §「297条件の内訳」の
 * 方法論に合わせた**: 同監査は「297条件すべてが1位自身の未取得費目で説明できた」
 * と確認しており（1位が閉じていても2位以下との重なりで不確定になるケースは
 * 見つからなかった、と明記）、原因の集計は**1位行自身**の未取得行
 * （`amount === null` かつ `scope !== 'shared'`）だけを見ている。本関数もそれに
 * 合わせ、次点行は見ない——次点を含めると「その2位行が1位の幅に重なる」原因まで
 * 拾ってしまい、同監査の内訳（courier-destination-fees 266 / outsourced-packing 97 /
 * courier-clearance-fee 51）と数が合わなくなる。
 */
function blockingLines(leader: Row): Line[] {
  return leader.lines.filter((l) => l.amount == null && l.scope !== 'shared');
}

function runOne(args: Args, country: CountryCode, weightG: number, priceYen: number): LedgerRow {
  const items = itemsFor(priceYen, weightG, args.itemCount, args.site);
  const result = compare({
    items, country, storageDays: args.storageDays, method: 'cheapest',
  });
  const comparable = result.rows.filter((r) => r.comparable).sort((a, b) => a.total.low - b.total.low);
  const leader = comparable[0];
  const runnerUp = comparable[1];

  if (!leader) {
    return {
      country, weightG, priceYen, itemCount: args.itemCount, storageDays: args.storageDays,
      site: args.site, leaderCompany: '(none)', leaderMethod: '', leaderLow: NaN, leaderHigh: null,
      rankIndeterminate: result.rankIndeterminate, blockingKeys: '', blockingLabels: '',
      blockingTiers: '', blockingUnknownReasons: '', blockingSourceUrls: '',
      runnerUpCompany: null, runnerUpLow: null,
    };
  }

  const blocking = result.rankIndeterminate ? blockingLines(leader) : [];

  return {
    country,
    weightG,
    priceYen,
    itemCount: args.itemCount,
    storageDays: args.storageDays,
    site: args.site,
    leaderCompany: leader.serviceId,
    leaderMethod: leader.method,
    leaderLow: leader.total.low,
    leaderHigh: leader.total.high,
    rankIndeterminate: result.rankIndeterminate,
    blockingKeys: blocking.map((l) => l.key).join(';'),
    blockingLabels: blocking.map((l) => l.label).join(';'),
    blockingTiers: blocking.map((l) => l.tier).join(';'),
    blockingUnknownReasons: blocking.map((l) => l.unknownReason ?? '').join(';'),
    blockingSourceUrls: blocking.map((l) => l.sourceUrl ?? '').join(';'),
    runnerUpCompany: runnerUp ? runnerUp.serviceId : null,
    runnerUpLow: runnerUp ? runnerUp.total.low : null,
  };
}

// ── メイン ────────────────────────────────────────────────────────────

function csvEscape(v: string | number | boolean | null): string {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const CSV_HEADER = [
  'country', 'weightG', 'priceYen', 'itemCount', 'storageDays', 'site',
  'leaderCompany', 'leaderMethod', 'leaderLow', 'leaderHigh',
  'rankIndeterminate',
  'blockingKeys', 'blockingLabels', 'blockingTiers', 'blockingUnknownReasons', 'blockingSourceUrls',
  'runnerUpCompany', 'runnerUpLow',
];

function toCsvRow(r: LedgerRow): string {
  return [
    r.country, r.weightG, r.priceYen, r.itemCount, r.storageDays, r.site,
    r.leaderCompany, r.leaderMethod, r.leaderLow, r.leaderHigh,
    r.rankIndeterminate,
    r.blockingKeys, r.blockingLabels, r.blockingTiers, r.blockingUnknownReasons, r.blockingSourceUrls,
    r.runnerUpCompany, r.runnerUpLow,
  ].map(csvEscape).join(',');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const rows: LedgerRow[] = [];
  for (const country of args.countries) {
    for (const weightG of args.weights) {
      for (const priceYen of args.prices) {
        rows.push(runOne(args, country, weightG, priceYen));
      }
    }
  }

  const total = rows.length;
  const indeterminate = rows.filter((r) => r.rankIndeterminate);
  const determinate = total - indeterminate.length;

  mkdirSync(args.outDir, { recursive: true });
  const csvPath = `${args.outDir}/indeterminacy-${args.date}.csv`;
  const bom = '﻿'; // Excel が UTF-8 として開けるように BOM を付ける
  const csv = bom + [CSV_HEADER.join(','), ...rows.map(toCsvRow)].join('\n') + '\n';
  writeFileSync(csvPath, csv, 'utf8');

  // 集計データを summary/xlsx 生成スクリプトに渡すための中間 JSON。
  const jsonPath = `${args.outDir}/.indeterminacy-${args.date}.rows.json`;
  writeFileSync(jsonPath, JSON.stringify({ args, rows, total, indeterminateCount: indeterminate.length }, null, 2), 'utf8');

  console.log(`grid: ${total} conditions (${args.countries.length} countries x ${args.weights.length} weights x ${args.prices.length} prices, itemCount=${args.itemCount}, storageDays=${args.storageDays}, site=${args.site})`);
  console.log(`rankIndeterminate: ${indeterminate.length}/${total} (${((indeterminate.length / total) * 100).toFixed(1)}%)`);
  console.log(`determinate: ${determinate}/${total}`);
  console.log(`wrote ${csvPath}`);
  console.log(`wrote ${jsonPath} (intermediate, for summary/xlsx generation)`);
}

main();
