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
      if (namesSomethingElse(t, cat, line)) continue;
      for (const m of line.match) {
        if (!matches(t, m)) continue;
        if (!corroborated(t, m)) continue;
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
// ASCII の語は前後が「同じ種類の文字」でないことを要求し、日本語のようにスペースで
// 切れない語はそのまま部分一致で見る（\b が効かないため）。
//
// 英字と数字の切れ目も境界とみなす。出品は 'PSA10' 'BGS9.5' と詰めて書くので、
// 前後を英数字ひとまとめで禁じると鑑定済みカードに当たらない（docs/audit/logic.md 第5節
// の取りこぼし）。同じ種類の文字が続くときだけ弾けば 'sculpture' の 'lp'、
// '11/4' の中の '1/4' は今までどおり落ちる。
const ASCII = /^[\x20-\x7e]+$/;
function matches(title: string, raw: string): boolean {
  const m = raw.trim().toLowerCase();
  if (!m) return false;
  if (!ASCII.test(m)) return title.includes(m);
  const esc = m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const left = boundary(m[0]!, 'left');
  const right = boundary(m[m.length - 1]!, 'right');
  return new RegExp(`${left}${esc}${right}`, 'i').test(title);
}

/** 語の端が英字なら英字を、数字なら数字を隣に許さない。記号なら何も要求しない。 */
function boundary(char: string, side: 'left' | 'right'): string {
  const cls = /[a-z]/i.test(char) ? '[a-z]' : /[0-9]/.test(char) ? '[0-9]' : null;
  if (!cls) return '';
  return side === 'left' ? `(?<!${cls})` : `(?!${cls})`;
}

// ── ここから下は「当て方」の門。docs/audit/logic.md 第5節の誤爆一覧への対処。
// 重量の数値は一切いじらない。**当たる条件を狭めるだけ。**
// src/data/weights.ts は scripts/weights-build.ts の生成物なので、
// 「この語だけでは決められない」という判断はデータではなくここに置く。

interface Corroboration {
  /** この語で当たったとき、 */
  tokens: string[];
  /** タイトルに needs のどれかが無ければ当てない。 */
  needs: string[];
  why: string;
}

/**
 * その語だけでは行を決められないもの。**裏付けの語を同じタイトルに要求する。**
 * 無ければ当てずに null に落とす（段ごとの総額に戻る）。当てて 30 倍外すより安全。
 */
const REQUIRES_CORROBORATION: Corroboration[] = [
  {
    // '【1/7(火)まで】' は締切、'2024/1/8' は発売日。どちらも 1/7・1/8 スケールではない。
    tokens: ['1/4', '1/6', '1/7', '1/8'],
    needs: ['scale', 'スケール', 'figure', 'figures', 'フィギュア', 'フィギア', '完成品'],
    why: 'A bare fraction is a date or a deadline as often as it is a figure scale',
  },
  {
    // 'ジュース 700ml' を四合瓶（1,420 g）として読んでいた。容量は酒に限らない。
    tokens: ['1800ml', '1,800ml', '1.8l', '1800ｍｌ', '720ml', '750ml', '700ml', '720ｍｌ', '300ml', '300ｍｌ'],
    needs: [
      '日本酒', 'sake', '酒', '焼酎', 'shochu', '梅酒', 'ウイスキー', 'ウィスキー', 'whisky', 'whiskey',
      '純米', '吟醸', '本醸造', '原酒', '清酒', 'リキュール', 'liqueur', 'ワイン', 'wine', '泡盛', 'awamori',
    ],
    why: 'A bottle size alone does not say the bottle holds sake',
  },
  {
    // 'SSR ウマ娘 缶バッジ' はカードではない。SSR/SAR/CSR はレア度の記号でしかない。
    tokens: ['sar', 'csr', 'ssr'],
    needs: ['カード', 'card', 'cards', 'トレカ', 'シングル', 'ポケカ', 'tcg'],
    why: 'A rarity code names the print run, not the object being sold',
  },
  {
    // '杖 ステッキ 高齢者用' は介護用の杖であって杖道の杖（2,000 g）ではない。
    tokens: ['杖'],
    needs: ['杖道', '杖術', '木刀', '木剣', '武道', '剣道', '合気道', 'jodo', 'bokuto', 'bokken'],
    why: 'On its own the character means a walking cane, not a martial-arts staff',
  },
  {
    // 'OBI 帯のみ' はレコードの帯（数 g）。武道の帯（400 g）と綴りが同じ。
    tokens: ['obi'],
    needs: ['空手', '柔道', '剣道', '合気道', '武道', '道着', 'karate', 'judo', 'kendo', 'aikido', 'martial'],
    why: 'A record obi strip and a martial-arts belt share the same romanisation',
  },
];

interface Exclusion {
  /** 効かせる行。行 id で名指すか、カテゴリごと（except で穴を開ける）。 */
  lineIds?: string[];
  categoryId?: string;
  exceptLineIds?: string[];
  /** タイトルがこの語を持つなら、その行は当てない。 */
  when: string[];
  why: string;
}

/**
 * 行には当たったが、**タイトルが別の物を名指ししている**とき。
 * 中身ではなく容れ物・機械・付属品・別サイズを売っている出品を落とす。
 */
const EXCLUSIONS: Exclusion[] = [
  {
    // 'compact disc player' は 2 kg 前後の機械、'Vinyl sticker' は 30 g のシール。
    lineIds: ['cd', 'lp'],
    when: [
      'player', 'プレーヤー', 'プレイヤー', 'turntable', 'ターンテーブル', 'deck', 'デッキ',
      'case', 'ケース', 'rack', 'ラック', 'stand', 'スタンド', 'sleeve', 'スリーブ',
      'sticker', 'ステッカー', 'cleaner', 'クリーナー', '収納',
    ],
    why: 'The listing sells the machine, the case or the sticker, not the disc',
  },
  {
    // 'snack box japan' は詰め合わせ。1 個 90 g の菓子ではない。
    lineIds: ['snack-sweets'],
    when: ['box', 'ボックス', '詰め合わせ', '詰合せ', 'assortment', 'assorted', 'variety pack', 'bulk'],
    why: 'An assortment box is many snacks, and we have no count to multiply by',
  },
  {
    // '空手着 上下セット 女児 120cm' に大人用の 2,500 g を当てていた。
    // 帯・袋・小物は寸法でほとんど変わらないので、そこには効かせない。
    categoryId: 'sports-goods',
    exceptLineIds: ['budo-bag', 'budo-small-parts', 'budo-obi'],
    when: ['女児', '男児', '子供', '子ども', 'こども', 'キッズ', 'ジュニア', '幼児', '小学生', 'kids', 'junior', 'youth'],
    why: 'Every median in this category was taken from adult sizes',
  },
];

/** 当たった語に裏付けが要るなら、それがタイトルにあるか。 */
function corroborated(title: string, raw: string): boolean {
  const m = raw.trim().toLowerCase();
  const rule = REQUIRES_CORROBORATION.find((r) => r.tokens.includes(m));
  if (!rule) return true;
  return rule.needs.some((w) => matches(title, w));
}

/** タイトルがこの行とは別の物を名指ししていないか。 */
function namesSomethingElse(title: string, cat: WeightCategory, line: WeightLine): boolean {
  for (const rule of EXCLUSIONS) {
    const named = rule.lineIds?.includes(line.id) === true
      || (rule.categoryId === cat.category && rule.exceptLineIds?.includes(line.id) !== true);
    if (!named) continue;
    if (rule.when.some((w) => matches(title, w))) return true;
  }
  return false;
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
