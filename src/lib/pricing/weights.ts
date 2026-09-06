import { WEIGHT_CATEGORIES, type WeightCategory, type WeightLine } from '@/data/weights';
import { UNKNOWN_WEIGHT_STEPS_G } from './ems';
import type { Item, Tier } from './types';

export interface WeightResolution {
  grams: number | null;
  tier: Tier;
  /** '1/7 scale · n=647 · Solaris Japan' */
  source: string | null;
  categoryId: string | null;
  lineId: string | null;
  /** ラインの P25–P75。ラインに当たったときだけ。カテゴリ平均には幅が無いので null。 */
  rangeG: [number, number] | null;
}

const UNRESOLVED: WeightResolution = {
  grams: null, tier: 'none', source: null, categoryId: null, lineId: null, rangeG: null,
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
      rangeG: [line.p25, line.p75],
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
        rangeG: null,
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


/**
 * 重量表に当たらないときの仮置き（g／点）。**実測でも統計でもない。**
 * 1,000 g にした理由:
 *  - EMS の段そのものの丸い数字なので、画面で「~1,000 g assumed」と出たとき測った値には見えない
 *    （584 g のような値は測ったように読まれる）。
 *  - 2〜5点のカートで1位が入れ替わる 1,150〜1,625 g／点のすぐ下にある。×1/3〜×3 の判定
 *    （333〜3,000 g）がその交差点を必ず跨ぐので、何も知らないカートで「安定」と出ることがない。
 *  - 表に当たった品と同じ入力欄に入り、その場で直せる（docs/UI-DESIGN.md §4）。
 * 単独の1点なら 500 g〜10 kg のどこでも1位は動かない（2026-09-06 実測）ので、
 * この数字が1位を決めるのは複数点のときだけで、そのときは画面がそう言う。
 */
export const ASSUMED_WEIGHT_G = 1000;

/** 仮置きの重量を動かして見る幅。段表と同じ 500 g〜10 kg（UNKNOWN_WEIGHT_STEPS_G の両端）。 */
export const ASSUMED_WEIGHT_RANGE_G: [number, number] = [
  UNKNOWN_WEIGHT_STEPS_G[0],
  UNKNOWN_WEIGHT_STEPS_G[UNKNOWN_WEIGHT_STEPS_G.length - 1]!,
];

export type ItemWeightFields = Pick<
  Item, 'weightG' | 'weightTier' | 'weightSource' | 'weightOrigin' | 'weightRangeG' | 'weightLineId'
>;

/**
 * 計算機がカートの1点に入れる重量。**null を返さない。**
 * 重量表のラインに当たればその中央値と P25–P75、当たらなければ ASSUMED_WEIGHT_G を
 * 'assumed' として入れる。どちらも tier は 'estimate' — 確定値のふりはしない。
 * 「重量不明なら段ごとの総額」から「推定値を既定で埋め、直してもらう」への変更
 * （docs/UI-DESIGN.md §4）。resolveWeight 自体は今もフォールバックを返さない。
 */
export function weightFieldsFor(title: string): ItemWeightFields {
  const w = resolveWeight(title);
  if (w.grams != null) {
    return {
      weightG: w.grams,
      weightTier: w.tier,
      weightSource: w.source,
      weightOrigin: 'table',
      weightRangeG: w.rangeG,
      weightLineId: w.lineId,
    };
  }
  return {
    weightG: ASSUMED_WEIGHT_G,
    weightTier: 'estimate',
    weightSource: null,
    weightOrigin: 'assumed',
    weightRangeG: null,
    weightLineId: null,
  };
}

export function categoryById(id: string): WeightCategory | undefined {
  return WEIGHT_CATEGORIES.find((c) => c.category === id);
}

export { WEIGHT_CATEGORIES };
