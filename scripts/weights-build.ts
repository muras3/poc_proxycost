// data/weights/*.json を 1 本の TypeScript モジュール src/data/weights.ts にまとめる。
//
//   npm run weights:build
//
// なぜ生成にするか: カテゴリごとの調査は別々に走っていて、成果物は JSON で置かれる。
// TS を手で継ぎ足すと、後から 1 カテゴリ再取得したときに他のカテゴリを壊す。
// JSON を唯一の原本にして、TS と data/weights/index.json はここから出す。
//
// フィギュアとレコード・CD は TS に直接書かれていた（この生成の前からある）。
// JSON が無ければ SEED から書き出してから読み直す。そうしないと再生成で消える。

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, 'data', 'weights');
const INDEX_PATH = join(DATA_DIR, 'index.json');
const OUT_PATH = join(ROOT, 'src', 'data', 'weights.ts');

type WeightTier = 'fixed' | 'estimate' | 'unverified';

interface WeightLine {
  id: string;
  labelEn: string;
  match: string[];
  medianG: number;
  p25: number;
  p75: number;
  n: number;
  spread: number;
  tier: WeightTier;
  /** カテゴリの総称ライン。他のどのラインも当たらなかったときだけ使う。 */
  generic?: boolean;
  /** このラインを出した店。カテゴリが複数の店を持つとき、行ごとに出所が違う。 */
  sourceDomain?: string;
}

interface WeightSource {
  domain: string;
  url: string;
  products: number;
  variantsWithGrams: number;
  verdict: string;
  reason: string;
}

interface WeightCategory {
  category: string;
  labelEn: string;
  labelJa: string;
  checkedOn: string;
  measured: boolean;
  sources: WeightSource[];
  lines: WeightLine[];
  fallbackG: number | null;
  fallbackTier: 'estimate' | 'none' | 'unverified';
  notes: string;
  /** JSON にだけある。取得手法。TS には出さない。 */
  method?: string;
}

// ── 出力順。調査した順ではなく、利用者が探す順（小さい物から大きい物へ）に並べる。
const CATEGORY_ORDER = [
  'figures',
  'music',
  'books-manga',
  'tcg-singles',
  'kpop',
  'used-luxury',
  'sneakers',
  'food-tea-sake',
  'fishing-tackle',
  'sports-goods',
  'games',
];

// ── 誤爆する match 語を落とす。**数値は一切いじらない。**当てる語を狭めるだけ。
// resolveWeight は全カテゴリを横断して当てるので、他カテゴリの出品タイトルに
// 出てくる普通の語が入っていると、無関係な商品に重量が付く。
// 各カテゴリの調査で明示的に「残す」と判断した語（食品の「そば」、トレカの
// 'psa'/'sar'/'csr'/'ssr'）はその判断を尊重して残してある。
const MATCH_DENYLIST: Record<string, Record<string, [string, string][]>> = {
  kpop: {
    // K-POP の 28g より トレカは tcg-singles の 50g で引くべき。
    photocard: [['トレカ', 'tcg-singles と衝突する（日本語では TCG のカードもトレカ）']],
    magazine: [['dazed', '普通の英単語。雑誌名としてしか当たらない保証が無い']],
    'platform-album': [['nemo', 'Finding Nemo のグッズに当たる']],
  },
  'tcg-singles': {
    'single-card': [['1枚', 'どのカテゴリの出品タイトルにも出る（「Tシャツ 1枚」）']],
    'graded-slab': [['鑑定', '中古ブランド品の「鑑定書付き」に当たる']],
  },
  'fishing-tackle': {
    'hard-lure': [
      ['ペンシル', '文房具のシャープペンシルに当たる'],
      ['pencil', '同上'],
      ['スプーン', '食器のスプーンに当たる'],
      ['spoon', '同上'],
      ['プラグ', '電源プラグ・スパークプラグに当たる'],
    ],
    'terminal-tackle': [
      ['フック', '衣類の「フック付き」等に当たる'],
      ['hook', '同上'],
      ['スナップ', 'スナップボタン・スナップバックに当たる'],
      ['snap', '同上'],
      ['リーダー', '普通の日本語（「リーダー」）'],
    ],
  },
  'used-luxury': {
    // 腕時計 / wristwatch / ウォッチ は残す。単独の 'watch' だけ落とす。
    'luxury-watch': [['watch', 'ゲーム・玩具のタイトルに当たる（Watch Dogs, Apple Watch）']],
  },
};

// ── 重量が取れなかったカテゴリ。**推定で埋めない。**
// 出典: REQUIREMENTS.md §4 / README.md「今できないこと」。
const NOT_OBTAINED = [
  {
    id: 'cameras',
    labelEn: 'Cameras and lenses',
    labelJa: 'カメラ・レンズ',
    reason: 'Every camera store probed publishes one constant for the whole catalogue (1,500 g), which is a shipping band, not a weight. Webcams and other PC peripherals sit here too and were not attempted separately.',
  },
  {
    id: 'apparel',
    labelEn: 'Clothing and outfit sets',
    labelJa: 'アパレル・コーデセット',
    reason: 'Not attempted yet. The live search returns outfit sets (three garments in one listing), which no single-garment weight would answer anyway.',
  },
  {
    id: 'instruments',
    labelEn: 'Musical instruments',
    labelJa: '楽器',
    reason: 'No public catalogue carries a per-product weight. The stores that do publish grams charge a flat band (a guitar came back as 180 kg).',
  },
];

// ── 取得済みだが、まだ src/data/weights.ts に出さないもの。
//
// **データは他と同じ検査を通す。門は緩めない。**出さないのは、ラインを1本足すたびに
// 別の表がそれを覆わなければならないからで（グリフの形・米国関税の見出し）、
// その表はこの調査の担当外にある。空欄のまま画面に出すより、取れたことを記録して
// 出さないほうが正しい。待ちが片付いたらここから消す。それだけで表に入る。
//
// data/weights/index.json の `obtainedNotWiredUp` に理由ごと出るので、
// 「測ったのに表に無い」が黙って埋もれることはない。
const PENDING_CATEGORIES: { id: string; waitingOn: string }[] = [
];

// ── 出さないライン。カテゴリごとではなく1本だけ待たせるときに使う。
const PENDING_LINES: { category: string; line: string; waitingOn: string }[] = [
  {
    category: 'figures',
    line: 'prize-figure',
    waitingOn: 'a glyph shape in src/lib/ui/glyphs/shapes.ts, and a decision on the two corpus rows (h-b7780a18, h-b8cf7c0e) whose labels say the generic figure line is the closest population because no prize line existed.',
  },
];

// ── 取れたカテゴリの中の穴。カテゴリごと欠けているわけではないので上とは分けて出す。
// 出典: 各 research/weights-<category>.md と data/weights/<category>.json の notes。
const PARTIAL_GAPS = [
  { category: 'sneakers', gap: 'Mainstream athletic shoes (Nike, adidas, New Balance)', reason: 'Every sneaker store that publishes grams charges a flat band (1,000 / 3,000 / 4,000 g). Only traditional and work footwear survived the check.' },
  { category: 'sports-goods', gap: 'Baseball, soccer and golf', reason: 'Only martial-arts equipment came through. Baseball and golf stores publish pound-rounded constants; no Shopify soccer store was found.' },
  { category: 'food-tea-sake', gap: 'Chilled, frozen and fresh food', reason: 'Stores that ship abroad stock shelf-stable goods only, so fish, wagyu and fresh sweets are absent from the sample.' },
  { category: 'kpop', gap: 'Video discs outside K-pop', reason: 'The 1,750 g DVD / Blu-ray line was read in K-pop shops, where a release is a concert box with a photobook. A film on one disc is roughly a tenth of that, and no catalogue publishing per-title grams for video was found, so src/lib/pricing/weights.ts refuses a bare DVD or Blu-ray rather than lending it the K-pop number.' },
  { category: 'kpop', gap: 'A Japan-based seller', reason: 'The adopted stores are Korean or US based. The one Japan-based store found publishes grams=0 for all 1,432 products.' },
  { category: 'used-luxury', gap: 'Used watches', reason: 'The 839 g line comes from a new-watch store and includes the presentation box; a used watch shipped without its box is far lighter.' },
  { category: 'games', gap: 'Handheld consoles', reason: 'The adopted shop has only 26 handheld rows, below the threshold of 50, and they range from 400 g to 4,100 g. A Chinese pocket handheld and a boxed Game Boy are not the same object, and there is nothing to separate them with, so nothing is claimed.' },
  { category: 'games', gap: 'Current-generation consoles', reason: 'The console line is built from retro systems (Famicom through Wii) sold as boxed sets. No shop publishing grams for a Switch or a PS5 console was found.' },
  { category: 'books-manga', gap: 'Illustrated reference books', reason: 'The general-book line comes from 84 novels. A 図鑑 or a 教科書 is a different object, so titles that name one resolve to nothing rather than to the novel median.' },
  { category: 'figures', gap: 'Capsule-toy and gashapon figures', reason: 'The 800 g generic line was measured on finished figures around 1/7 scale. A 20-50 g capsule-toy figure is twenty times lighter and no catalogue publishing grams for them was found, so the resolver refuses ガシャポン and 食玩 rather than lending them the generic number.' },
  { category: 'figures', gap: 'Garage kits', reason: 'Every figure line was measured on finished figures. japan-figure.com has 3 resin-kit rows, so an unpainted unassembled kit is still unanswered.' },
];

// ── フィギュア / レコード・CD の種。JSON が無いときだけ書き出す。
const SEED: Record<string, WeightCategory> = {
  figures: {
    category: 'figures',
    labelJa: 'フィギュア',
    labelEn: 'Figures',
    checkedOn: '2026-09-06',
    method: 'shopify-products-json',
    measured: false,
    sources: [
      {
        domain: 'www.solarisjapan.com',
        url: 'https://www.solarisjapan.com/products.json?limit=250&page=1',
        products: 5000,
        variantsWithGrams: 4747,
        verdict: 'usable',
        reason: 'Every product carries grams. Lines with a scale in the title have a spread of 1.0x',
      },
    ],
    lines: [
      { id: 'scale-1-4', labelEn: '1/4 scale', match: ['1/4'], medianG: 3000, p25: 3000, p75: 3800, n: 198, spread: 1.3, tier: 'estimate' },
      { id: 'scale-1-6', labelEn: '1/6 scale', match: ['1/6'], medianG: 1800, p25: 1800, p75: 1800, n: 641, spread: 1.0, tier: 'estimate' },
      { id: 'scale-1-7', labelEn: '1/7 scale', match: ['1/7'], medianG: 1500, p25: 1500, p75: 1500, n: 647, spread: 1.0, tier: 'estimate' },
      { id: 'scale-1-8', labelEn: '1/8 scale', match: ['1/8'], medianG: 1300, p25: 1230, p75: 1500, n: 105, spread: 1.2, tier: 'estimate' },
      { id: 'pop-up-parade', labelEn: 'Pop Up Parade', match: ['pop up parade', 'ポップアップパレード'], medianG: 800, p25: 800, p75: 1000, n: 104, spread: 1.2, tier: 'estimate' },
      { id: 'figma', labelEn: 'figma', match: ['figma'], medianG: 800, p25: 550, p75: 800, n: 78, spread: 1.5, tier: 'estimate' },
      { id: 'nendoroid', labelEn: 'Nendoroid', match: ['nendoroid', 'ねんどろいど'], medianG: 439, p25: 380, p75: 600, n: 426, spread: 1.6, tier: 'estimate' },
    ],
    fallbackG: 1000,
    fallbackTier: 'estimate',
    notes:
      '5,000 products from the Solaris Japan public catalogue. The grams look like one standard '
      + 'value per packing class rather than a measurement — every 1/7 scale is exactly 1,500 g. '
      + 'Good enough to pick an EMS step, but we never call it a measured weight.',
  },
  music: {
    category: 'music',
    labelJa: 'レコード・CD',
    labelEn: 'Records and CDs',
    checkedOn: '2026-09-06',
    method: 'published-range',
    measured: false,
    sources: [
      {
        domain: 'snowrecords.com',
        url: 'https://snowrecords.com/',
        products: 0,
        variantsWithGrams: 0,
        verdict: 'suspect',
        reason: 'Recorded as a range only; the sample count was not kept',
      },
    ],
    lines: [
      { id: 'cd', labelEn: 'CD', match: ['cd', 'compact disc'], medianG: 100, p25: 80, p75: 120, n: 0, spread: 1.5, tier: 'estimate' },
      { id: 'lp', labelEn: 'LP / vinyl', match: ['lp', 'vinyl', 'レコード'], medianG: 270, p25: 240, p75: 300, n: 0, spread: 1.25, tier: 'estimate' },
    ],
    fallbackG: 200,
    fallbackTier: 'estimate',
    notes: 'Ranges published by Snow Records (CD 80-120 g, LP 240-300 g). We did not keep the sample count, so n is 0 here. Needs re-fetching.',
  },
};

// ─────────────────────────────────────────────────────────────
// 読み込みと検証
// ─────────────────────────────────────────────────────────────

function fail(msg: string): never {
  console.error(`weights:build failed — ${msg}`);
  process.exit(1);
}

const TIERS = new Set(['fixed', 'estimate', 'unverified']);
const FALLBACK_TIERS = new Set(['estimate', 'none', 'unverified']);

function check(cond: unknown, file: string, msg: string): void {
  if (!cond) fail(`${file}: ${msg}`);
}

function readCategory(file: string): WeightCategory {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8'));
  } catch (e) {
    return fail(`${file}: not valid JSON (${(e as Error).message})`);
  }
  check(raw && typeof raw === 'object', file, 'top level is not an object');
  const c = raw as WeightCategory;

  for (const k of ['category', 'labelEn', 'labelJa', 'checkedOn', 'notes'] as const) {
    check(typeof c[k] === 'string' && c[k].length > 0, file, `missing string field "${k}"`);
  }
  check(typeof c.measured === 'boolean', file, 'measured must be a boolean');
  check(Array.isArray(c.sources) && c.sources.length > 0, file, 'sources must be a non-empty array');
  check(Array.isArray(c.lines) && c.lines.length > 0, file, 'lines must be a non-empty array');
  check(c.fallbackG === null || (typeof c.fallbackG === 'number' && c.fallbackG > 0), file, 'fallbackG must be null or a positive number');
  check(FALLBACK_TIERS.has(c.fallbackTier), file, `fallbackTier "${c.fallbackTier}" is not one of ${[...FALLBACK_TIERS].join('/')}`);
  if (c.fallbackG === null) check(c.fallbackTier === 'none', file, 'fallbackG is null but fallbackTier is not "none"');

  const seen = new Set<string>();
  for (const l of c.lines) {
    check(typeof l.id === 'string' && l.id.length > 0, file, 'a line has no id');
    check(!seen.has(l.id), file, `duplicate line id "${l.id}"`);
    seen.add(l.id);
    check(typeof l.labelEn === 'string' && l.labelEn.length > 0, file, `line "${l.id}" has no labelEn`);
    check(Array.isArray(l.match) && l.match.length > 0, file, `line "${l.id}" has no match words`);
    check(l.match.every((m) => typeof m === 'string' && m.trim().length > 0), file, `line "${l.id}" has an empty match word`);
    for (const k of ['medianG', 'p25', 'p75', 'n', 'spread'] as const) {
      check(typeof l[k] === 'number' && Number.isFinite(l[k]), file, `line "${l.id}" field "${k}" is not a number`);
    }
    check(l.medianG > 0, file, `line "${l.id}" medianG must be > 0`);
    // 四分位が中央値を挟んでいないと、画面の「幅」が嘘になる。
    check(l.p25 <= l.medianG && l.p75 >= l.medianG, file, `line "${l.id}": p25 <= median <= p75 does not hold`);
    check(TIERS.has(l.tier), file, `line "${l.id}" tier "${l.tier}" is not one of ${[...TIERS].join('/')}`);
    check(l.generic === undefined || l.generic === true, file, `line "${l.id}" generic must be true or absent`);
    // 行ごとの出所は、そのカテゴリが実際に叩いた店でなければならない。
    if (l.sourceDomain !== undefined) {
      check(
        c.sources.some((s) => s.domain === l.sourceDomain),
        file,
        `line "${l.id}" sourceDomain "${l.sourceDomain}" is not one of this category's sources`,
      );
    }
  }
  // 総称ラインはカテゴリに1本まで。2本あるとどちらが受け皿か決まらない。
  const generics = c.lines.filter((l) => l.generic === true);
  check(generics.length <= 1, file, `${generics.length} generic lines; a category may have at most one`);

  // 英語で出す欄に日本語の散文を混ぜない。UI は英語で、e2e が仮名6文字以上の連なりを
  // 検出する（e2e/pages.spec.ts の noJapanese）。**そこで落ちる前にここで落とす。**
  // 照合語（match）とカテゴリ和名（labelJa）は日本の出品にそのまま出る名称なので対象外。
  const KANA_RUN = /[\u3040-\u309f\u30a0-\u30ff]{6,}/;
  const prose: [string, string][] = [['notes', c.notes], ...c.lines.map((l): [string, string] => [`line "${l.id}" labelEn`, l.labelEn])];
  for (const [where, text] of prose) {
    const m = KANA_RUN.exec(text);
    check(!m, file, `${where} has Japanese prose ("${m?.[0]}"); the published page is English`);
  }

  for (const s of c.sources) {
    for (const k of ['domain', 'url', 'verdict', 'reason'] as const) {
      check(typeof s[k] === 'string' && s[k].length > 0, file, `source "${s.domain}" has no ${k}`);
    }
    for (const k of ['products', 'variantsWithGrams'] as const) {
      check(typeof s[k] === 'number' && Number.isFinite(s[k]), file, `source "${s.domain}" field "${k}" is not a number`);
    }
    const m = KANA_RUN.exec(s.reason);
    check(!m, file, `source "${s.domain}" reason has Japanese prose ("${m?.[0]}"); the published page is English`);
  }
  return c;
}

/** 誤爆語を落とす。落とした結果 match が空になるなら、それは落としすぎなので止める。 */
function applyDenylist(c: WeightCategory): { dropped: number; log: string[] } {
  const perLine = MATCH_DENYLIST[c.category];
  if (!perLine) return { dropped: 0, log: [] };
  let dropped = 0;
  const log: string[] = [];
  for (const line of c.lines) {
    const rules = perLine[line.id];
    if (!rules) continue;
    const bad = new Map(rules.map(([word, why]) => [word.toLowerCase(), why]));
    const kept = line.match.filter((m) => !bad.has(m.toLowerCase()));
    for (const m of line.match) {
      const why = bad.get(m.toLowerCase());
      if (why) log.push(`${c.category}/${line.id}: dropped "${m}" — ${why}`);
    }
    check(kept.length > 0, `${c.category}.json`, `line "${line.id}" has no match words left after the denylist`);
    dropped += line.match.length - kept.length;
    line.match = kept;
  }
  const unusedLines = Object.keys(perLine).filter((id) => !c.lines.some((l) => l.id === id));
  if (unusedLines.length > 0) {
    fail(`${c.category}: denylist points at lines that no longer exist: ${unusedLines.join(', ')}`);
  }
  return { dropped, log };
}

// ─────────────────────────────────────────────────────────────
// TypeScript の書き出し
// ─────────────────────────────────────────────────────────────

function q(s: string): string {
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
}

/** 長い notes は行ごとに切って連結で出す。1行 3,000 文字のリテラルは読めない。 */
function longString(s: string, indent: string): string {
  const parts = s.split('\n');
  if (parts.length === 1) return q(s);
  const body = parts
    .map((p, i) => q(i === parts.length - 1 ? p : `${p}\n`))
    .map((p, i) => (i === 0 ? `${indent}  ${p}` : `${indent}  + ${p}`))
    .join('\n');
  return `\n${body}`;
}

function emitLine(l: WeightLine): string {
  const match = l.match.map(q).join(', ');
  const extra = (l.generic === true ? ', generic: true' : '')
    + (l.sourceDomain ? `, sourceDomain: ${q(l.sourceDomain)}` : '');
  return `      { id: ${q(l.id)}, labelEn: ${q(l.labelEn)}, match: [${match}],`
    + ` medianG: ${l.medianG}, p25: ${l.p25}, p75: ${l.p75}, n: ${l.n}, spread: ${l.spread},`
    + ` tier: ${q(l.tier)}${extra} },`;
}

function emitSource(s: WeightSource): string {
  return [
    '      {',
    `        domain: ${q(s.domain)},`,
    `        url: ${q(s.url)},`,
    `        products: ${s.products},`,
    `        variantsWithGrams: ${s.variantsWithGrams},`,
    `        verdict: ${q(s.verdict)},`,
    `        reason: ${longString(s.reason, '        ')},`,
    '      },',
  ].join('\n');
}

function emitCategory(c: WeightCategory): string {
  return [
    '  {',
    `    category: ${q(c.category)},`,
    `    labelEn: ${q(c.labelEn)},`,
    `    labelJa: ${q(c.labelJa)},`,
    `    checkedOn: ${q(c.checkedOn)},`,
    `    measured: ${c.measured},`,
    '    sources: [',
    ...c.sources.map(emitSource),
    '    ],',
    '    lines: [',
    ...c.lines.map(emitLine),
    '    ],',
    `    fallbackG: ${c.fallbackG === null ? 'null' : c.fallbackG},`,
    `    fallbackTier: ${q(c.fallbackTier)},`,
    `    notes: ${longString(c.notes, '    ')},`,
    '  },',
  ].join('\n');
}

const HEADER = `// 商品の発送重量。実データから導いた集計だけを持つ（生カタログは再配布しない）。
//
// **Shopify の grams は送料計算用の入力値であって実測ではない。** 店が一律送料・帯別送料を
// 使っていると擬似値になる（カメラ店で全件1,500g、楽器店でギター180kg が実在した）。
// だから scripts/shopify-probe.mjs の分布判定（distinct比・最頻値シェア・丸い値の比率）で
// usable / suspect / pseudo を決め、pseudo は採らない。
//
// このファイルは scripts/weights-build.ts が data/weights/*.json から生成する。
// 手で編集するな。\`npm run weights:build\` を走らせろ。`;

const TYPES = `
export type WeightTier = 'fixed' | 'estimate' | 'unverified';

export interface WeightLine {
  id: string;
  labelEn: string;
  /** 商品タイトルに含まれれば、このラインとみなす語。小文字で比較する。 */
  match: string[];
  medianG: number;
  p25: number;
  p75: number;
  n: number;
  /** P75 / P25。1.0 に近いほど事実上の定数。 */
  spread: number;
  tier: WeightTier;
  /**
   * カテゴリの総称ライン。**他のどのラインにも当たらなかったときだけ**使う。
   * 'フィギュア' は '1/7' より長いので、当たった語の長さで決めると総称が
   * 個別ラインを食う。だから長さではなく段階で分ける。
   */
  generic?: boolean;
  /** このラインを出した店。カテゴリが複数の店を持つとき、行ごとに出所が違う。 */
  sourceDomain?: string;
}

export interface WeightSource {
  domain: string;
  url: string;
  products: number;
  variantsWithGrams: number;
  verdict: string;
  reason: string;
}

export interface WeightCategory {
  category: string;
  labelEn: string;
  labelJa: string;
  checkedOn: string;
  /** 実測値か。Shopify の grams は実測ではないので false。 */
  measured: boolean;
  sources: WeightSource[];
  lines: WeightLine[];
  fallbackG: number | null;
  fallbackTier: 'estimate' | 'none' | 'unverified';
  notes: string;
}

/** 重量が取れなかったカテゴリ。**推定で埋めない。**画面にはそのまま「取れていない」と出す。 */
export interface MissingWeightCategory {
  id: string;
  labelEn: string;
  labelJa: string;
  reason: string;
}
`;

function emitModule(cats: WeightCategory[], checkedOn: string): string {
  return [
    HEADER,
    TYPES,
    '// 実データが取れたカテゴリのみ。取れていないカテゴリはここに無く、',
    '// 計算機は「段ごとの総額」に落ちる。空欄をでっち上げない。',
    'export const WEIGHT_CATEGORIES: WeightCategory[] = [',
    ...cats.map(emitCategory),
    '];',
    '',
    '// 叩いたが商品ごとの重量が取れなかったカテゴリ。/weights はこれも出す。',
    'export const WEIGHT_CATEGORIES_NOT_OBTAINED: MissingWeightCategory[] = [',
    ...NOT_OBTAINED.map((m) => [
      '  {',
      `    id: ${q(m.id)},`,
      `    labelEn: ${q(m.labelEn)},`,
      `    labelJa: ${q(m.labelJa)},`,
      `    reason: ${q(m.reason)},`,
      '  },',
    ].join('\n')),
    '];',
    '',
    `export const WEIGHTS_CHECKED_ON = ${q(checkedOn)};`,
    '',
  ].join('\n');
}

// ─────────────────────────────────────────────────────────────
// main
// ─────────────────────────────────────────────────────────────

function main(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

  // 種を先に書く。無いまま生成すると、TS にしか無かった figures / music が消える。
  for (const [id, cat] of Object.entries(SEED)) {
    const path = join(DATA_DIR, `${id}.json`);
    if (existsSync(path)) continue;
    writeFileSync(path, `${JSON.stringify(cat, null, 2)}\n`, 'utf8');
    console.log(`seeded data/weights/${id}.json (it only existed inside src/data/weights.ts)`);
  }

  const files = readdirSync(DATA_DIR)
    .filter((f) => f.endsWith('.json') && f !== 'index.json')
    .sort();
  if (files.length === 0) fail('data/weights/ has no category JSON');

  const cats: WeightCategory[] = [];
  const all: WeightCategory[] = [];
  // 外したラインは cats からも all からも消える（同じ実体）ので、外す前に控えておく。
  const heldLines = new Map<string, WeightLine>();
  const denylog: string[] = [];
  let droppedWords = 0;
  for (const f of files) {
    const c = readCategory(f);
    check(`${c.category}.json` === f, f, `category id "${c.category}" does not match the file name`);
    const d = applyDenylist(c);
    droppedWords += d.dropped;
    denylog.push(...d.log);
    all.push(c);
    // **検査は済ませてから外す。**待っているだけで、質が落ちているわけではない。
    if (PENDING_CATEGORIES.some((p) => p.id === c.category)) continue;
    const held = PENDING_LINES.filter((p) => p.category === c.category);
    if (held.length > 0) {
      for (const h of held) {
        check(c.lines.some((l) => l.id === h.line), f, `PENDING_LINES names a line that does not exist: ${h.line}`);
      }
      for (const h of held) heldLines.set(`${c.category}/${h.line}`, c.lines.find((l) => l.id === h.line)!);
      c.lines = c.lines.filter((l) => !held.some((h) => h.line === l.id));
      check(c.lines.length > 0, f, 'every line in this category is held back; hold the category instead');
    }
    cats.push(c);
  }

  for (const p of PENDING_CATEGORIES) {
    if (!all.some((c) => c.category === p.id)) fail(`PENDING_CATEGORIES names a category with no JSON: ${p.id}`);
  }
  for (const p of PENDING_LINES) {
    if (!all.some((c) => c.category === p.category)) fail(`PENDING_LINES names a category with no JSON: ${p.category}`);
  }

  const ids = cats.map((c) => c.category);
  const dup = ids.find((id, i) => ids.indexOf(id) !== i);
  if (dup) fail(`two files claim the category "${dup}"`);

  cats.sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a.category);
    const ib = CATEGORY_ORDER.indexOf(b.category);
    // 並び順に載っていないカテゴリは末尾へ。名前順で安定させる。
    if (ia === -1 && ib === -1) return a.category.localeCompare(b.category);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  const checkedOn = cats.map((c) => c.checkedOn).sort().at(-1) ?? '';
  writeFileSync(OUT_PATH, emitModule(cats, checkedOn), 'utf8');

  const lines = cats.reduce((a, c) => a + c.lines.length, 0);
  const domains = cats.reduce((a, c) => a + c.sources.length, 0);
  const adopted = cats.reduce(
    (a, c) => a + c.sources.filter((s) => s.verdict === 'usable' || s.verdict === 'suspect').length,
    0,
  );

  const index = {
    generatedBy: 'scripts/weights-build.ts',
    generatedOn: new Date().toISOString().slice(0, 10),
    checkedOn,
    // grams は全カテゴリで送料計算用の入力値。実測ではない。
    measured: false,
    totals: {
      categories: cats.length,
      lines,
      domainsProbed: domains,
      domainsWithUsableData: adopted,
      matchWordsDropped: droppedWords,
      notObtained: NOT_OBTAINED.length,
    },
    categoryIds: cats.map((c) => c.category),
    // 取れているが表に出していないもの。理由つき。**測ったことを黙らせない。**
    obtainedNotWiredUp: {
      categories: PENDING_CATEGORIES.map((p) => {
        const c = all.find((x) => x.category === p.id)!;
        return {
          id: p.id,
          labelEn: c.labelEn,
          labelJa: c.labelJa,
          lineCount: c.lines.length,
          sampleN: c.lines.reduce((a, l) => a + l.n, 0),
          waitingOn: p.waitingOn,
        };
      }),
      lines: PENDING_LINES.map((p) => {
        const l = heldLines.get(`${p.category}/${p.line}`)!;
        return {
          category: p.category, line: p.line, labelEn: l.labelEn,
          medianG: l.medianG, n: l.n, spread: l.spread, waitingOn: p.waitingOn,
        };
      }),
    },
    notObtained: NOT_OBTAINED,
    partialGaps: PARTIAL_GAPS,
    matchWordsDropped: denylog,
    categories: cats.map((c) => ({
      category: c.category,
      labelEn: c.labelEn,
      labelJa: c.labelJa,
      checkedOn: c.checkedOn,
      measured: c.measured,
      method: c.method ?? null,
      lineCount: c.lines.length,
      sampleN: c.lines.reduce((a, l) => a + l.n, 0),
      fallbackG: c.fallbackG,
      fallbackTier: c.fallbackTier,
      sources: c.sources,
      lines: c.lines,
      notes: c.notes,
    })),
  };
  writeFileSync(INDEX_PATH, `${JSON.stringify(index, null, 2)}\n`, 'utf8');

  for (const l of denylog) console.log(`  ${l}`);
  console.log(
    `wrote src/data/weights.ts — ${cats.length} categories, ${lines} lines, `
    + `${adopted}/${domains} domains adopted, ${droppedWords} match words dropped`,
  );
  console.log(`wrote data/weights/index.json — ${NOT_OBTAINED.length} categories still not obtained`);
}

main();
