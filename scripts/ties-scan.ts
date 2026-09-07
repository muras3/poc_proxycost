/**
 * 同額（タイ）の実測。`docs/audit/ties-2026-09-07.md` の数字はこの出力そのもの。
 *
 * 測るのは2つ:
 *   (a) 総額がちょうど一致する組み合わせがどれだけ在るか（同額は例外か、常態か）
 *   (b) 旧実装の第2キー（社名の辞書順）が、同額のとき誰を上に置いていたか
 *       ——報酬を払う社が上に来ていたなら、順位は総額だけで決まっていなかったことになる。
 *
 * `npm run ties:scan`。プロダクトのコードは1行も呼び分けていない（compare() をそのまま叩く）。
 */
import { compare } from '../src/lib/pricing/compare';
import { COUNTRY_CODES } from '../src/lib/pricing/countries';
import type { Item, Row, SiteId } from '../src/lib/pricing/types';

const SITES: SiteId[] = ['yahoo-auctions', 'mercari', 'rakuten'];
const PRICES = [1000, 3000, 4200, 5000, 12800, 30000, 50000];
const COUNTS = [1, 2, 3, 5];
const STEP_G = 25;
const MAX_G = 8000;

const mk = (i: number, priceYen: number, weightG: number, site: SiteId): Item => ({
  id: `i${i}`, title: `x${i}`, priceYen, priceTier: 'fixed', site,
  weightG, weightTier: 'fixed', weightOrigin: 'user', qty: 1,
});

const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

const pairs = new Map<string, number>();
const topPairs = new Map<string, number>();
let combos = 0;
let anyTie = 0;
let topTie = 0;
// 旧実装（辞書順）が同額の先頭に置いた社の報酬の有無。
let paying = 0;
let free = 0;
let neutral = 0;

for (const cc of COUNTRY_CODES) {
  for (const site of SITES) {
    for (const n of COUNTS) {
      for (let g = STEP_G; g <= MAX_G; g += STEP_G) {
        for (const price of PRICES) {
          combos++;
          const items = Array.from({ length: n }, (_, i) => mk(i, price, g, site));
          const rows = compare({ items, country: cc }).rows;
          const tied = rows.filter((r) => r.tied);
          if (!tied.length) continue;
          anyTie++;
          bump(pairs, tied.map((r) => r.id).sort().join(' = '));
          if (tied.some((r) => r.cheapest)) {
            topTie++;
            bump(topPairs, rows.filter((r) => r.cheapest).map((r) => r.id).sort().join(' = '));
          }
          // 旧実装の第2キーを再現して、それが誰を上に置いていたかを数える。
          const old = [...tied].sort((a: Row, b: Row) => a.serviceName.localeCompare(b.serviceName));
          const top = old[0]!;
          const rest = old.slice(1);
          if (top.paysUs && rest.some((r) => !r.paysUs)) paying++;
          else if (!top.paysUs && rest.some((r) => r.paysUs)) free++;
          else neutral++;
        }
      }
    }
  }
}

const show = (m: Map<string, number>) =>
  [...m].sort((a, b) => b[1] - a[1]).map(([k, v]) => `  ${k}: ${v}`).join('\n');

console.log(`combinations scanned: ${combos}`);
console.log(`combinations with a tie: ${anyTie}`);
console.log(`combinations where the tie is at rank 1: ${topTie}`);
console.log(`\ntie pairs (any rank):\n${show(pairs)}`);
console.log(`\ntie pairs (rank 1):\n${show(topPairs)}`);
console.log(`\nwho the old alphabetical tiebreak put on top: ${
  JSON.stringify({ groups: anyTie, paying, free, neutral })}`);
