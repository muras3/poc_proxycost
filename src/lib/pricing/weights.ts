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

  // **実際に当たった語**が長いものを採る。行が持つ最長語で並べると、
  // 'ねんどろいど CD' が cd（3文字で命中）ではなく nendoroid 行の
  // 最長語 'ねんどろいど' に負ける、といった取り違えが起きる。
  let best: { cat: WeightCategory; line: WeightLine; hit: number } | null = null;
  for (const cat of search) {
    for (const line of cat.lines) {
      for (const m of line.match) {
        if (!matches(t, m)) continue;
        const hit = m.trim().length;
        if (!best || hit > best.hit) best = { cat, line, hit };
      }
    }
  }
  if (best) {
    const { cat, line } = best;
    return {
      grams: line.medianG,
      tier: line.tier,
      source: describe(cat, line),
      categoryId: cat.category,
      lineId: line.id,
    };
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


export function categoryById(id: string): WeightCategory | undefined {
  return WEIGHT_CATEGORIES.find((c) => c.category === id);
}

export { WEIGHT_CATEGORIES };
