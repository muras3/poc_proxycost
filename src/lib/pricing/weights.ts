import { WEIGHT_CATEGORIES, type WeightCategory, type WeightLine } from '@/data/weights';
import type { Tier } from './types';

export interface WeightResolution {
  grams: number | null;
  tier: Tier;
  /** '1/7 scale · n=647 · Solaris Japan' */
  source: string | null;
  categoryId: string | null;
  lineId: string | null;
}

const UNRESOLVED: WeightResolution = {
  grams: null, tier: 'none', source: null, categoryId: null, lineId: null,
};

function describe(cat: WeightCategory, line: WeightLine): string {
  const domain = cat.sources[0]?.domain ?? 'unknown source';
  const spread = line.spread === 1 ? '1.0x' : `${line.spread}x`;
  // n=0 は「0件で測った」ではなく「件数を記録していない」。0 と書くと嘘になる。
  const n = line.n > 0 ? `n=${line.n}` : 'sample size not recorded';
  return `${line.labelEn} · ${n} · ${spread} · ${domain}`;
}

/**
 * 商品タイトルから重量を引く。**推測でフォールバックを返さない。**
 * どのラインにも当たらなければ null を返し、呼び出し側は「段ごとの総額」に落ちる。
 * カテゴリを明示されたときだけ、そのカテゴリのフォールバックを使う。
 */
export function resolveWeight(title: string, categoryId?: string | null): WeightResolution {
  const t = title.toLowerCase();

  const search = categoryId
    ? WEIGHT_CATEGORIES.filter((c) => c.category === categoryId)
    : WEIGHT_CATEGORIES;

  // 語が長いラインを先に当てる（'1/7' より 'pop up parade' を優先する）。
  const candidates = search
    .flatMap((cat) => cat.lines.map((line) => ({ cat, line })))
    .sort((a, b) => longest(b.line.match) - longest(a.line.match));

  for (const { cat, line } of candidates) {
    if (line.match.some((m) => matches(t, m))) {
      return {
        grams: line.medianG,
        tier: line.tier,
        source: describe(cat, line),
        categoryId: cat.category,
        lineId: line.id,
      };
    }
  }

  if (categoryId) {
    const cat = WEIGHT_CATEGORIES.find((c) => c.category === categoryId);
    if (cat && cat.fallbackG != null) {
      return {
        grams: cat.fallbackG,
        tier: cat.fallbackTier === 'none' ? 'none' : 'estimate',
        source: `${cat.labelEn} category average`,
        categoryId: cat.category,
        lineId: null,
      };
    }
  }

  return UNRESOLVED;
}


// 短い語の誤爆を防ぐ。'lp' は 'sculpture' に、'cd' は語中に当たってしまう。
// ASCII の語は前後が英数字でないことを要求し、日本語のようにスペースで切れない語は
// そのまま部分一致で見る（\b が効かないため）。
const ASCII = /^[\x20-\x7e]+$/;
function matches(title: string, raw: string): boolean {
  const m = raw.trim().toLowerCase();
  if (!m) return false;
  if (!ASCII.test(m)) return title.includes(m);
  const esc = m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // 前後が英数字でなければ当たり。'1/7' のように記号を含む語も通る。
  return new RegExp(`(?<![a-z0-9])${esc}(?![a-z0-9])`, 'i').test(title);
}

function longest(xs: string[]): number {
  return xs.reduce((a, x) => Math.max(a, x.length), 0);
}

export function categoryById(id: string): WeightCategory | undefined {
  return WEIGHT_CATEGORIES.find((c) => c.category === id);
}

export { WEIGHT_CATEGORIES };
