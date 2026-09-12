// カテゴリごとの密度（g/cm³）。梱包後重量から体積を出すための入力。
// `docs/DESIGN-BOX-SIZE.md` の設計に対応するデータ構造。**この PR では計算に接続しない。**
//
// `src/data/weights.ts` と違い、この表は `scripts/weights-build.ts` のような生成物ではない。
// 実請求（`CALIBRATION_INVOICES`）が今 1 件しかなく、ビルドで自動導出するほどの母数が無いため、
// 当面は手で編集する。実請求が増えて `docs/DESIGN-BOX-SIZE.md` §6 の件数条件を超えたら、
// 重量表と同じ 3 層（生データ → build スクリプト → 生成物）に切り替えることを検討する。
//
// **密度を決め打ちの定数として置かない。** `CategoryDensity` は必ず
// 「何件の実請求から出したか」（`n` / `calibrationInvoiceIds`）を持つ。
// `n = 0` の値は較正されていない置き物であることが型からも読める（`provisional: true`）。

/**
 * `docs/MASTER.md` の確度語彙に合わせる（`A_confirmed` / `B_inferred` / `C_unknown`）。
 * `src/data/weights.ts` の `WeightTier`（fixed/estimate/unverified）とは別の語彙 ──
 * こちらは実請求という一次情報からの較正件数で確度を決めるため、値の出どころを
 * 「引用できるか／論理的に導いたか／情報が無いか」で分ける MASTER.md の語彙のほうが合う。
 */
export type DensityTier = 'A_confirmed' | 'B_inferred' | 'C_unknown';

export interface BoxDimsCm {
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}

/**
 * 較正の入力1件。**梱包後重量と実際の寸法が両方分かっているもの。**
 * 増える前提で持つ ── いま `CALIBRATION_INVOICES` に入っているのは2件だが、
 * 2件目は `isPrimarySource: false`（寸法がコーディネーターの仮定であって
 * 実請求の記載ではない）なので、較正件数（`n`）には数えない。
 */
export interface CalibrationInvoice {
  id: string;
  /** 'ZenMarket / DE / 2026-05' のような出所の短い記述。 */
  source: string;
  obtainedOn: string;
  /**
   * カート内のカテゴリ構成。**分かるときだけ埋める。**
   * 'unknown' は「何点かは分かるが中身のカテゴリ内訳が記録に無い」——
   * 密度を推測で特定のカテゴリに帰属させない、という開示原則。
   */
  categoryMix: 'unknown' | Partial<Record<string, number>>;
  packedWeightG: number;
  dimsCm: BoxDimsCm;
  /**
   * **実測・実請求の記載に基づく寸法か。** false なら参考値であり、
   * どんなに数字が確からしくても `n`（較正件数）に数えない。
   */
  isPrimarySource: boolean;
  notes: string;
}

function volumeCm3(d: BoxDimsCm): number {
  return d.lengthCm * d.widthCm * d.heightCm;
}

/** `packedWeightG / volumeCm3`。呼ぶたびに計算する ── 生の数値を二重に持たない。 */
export function impliedDensity(inv: CalibrationInvoice): number {
  return inv.packedWeightG / volumeCm3(inv.dimsCm);
}

export const CALIBRATION_INVOICES: CalibrationInvoice[] = [
  {
    id: 'inv-2026-05-de-zenmarket',
    source: 'ZenMarket / DE / 2026-05 の実請求',
    obtainedOn: '2026-05',
    // 7点のカートだが、請求書にカテゴリ内訳（フィギュアが何点・トレカが何点、等）の
    // 記載が無い。**推測でどれかのカテゴリに割り当てない。**
    categoryMix: 'unknown',
    packedWeightG: 3210,
    dimsCm: { lengthCm: 42, widthCm: 31, heightCm: 24 },
    isPrimarySource: true,
    notes:
      '`master/courier-rates.json` 系列とは別経路で集まった実請求（背景セクション参照）。'
      + '体積 31,248cm³、密度 3,210/31,248 ≈ 0.103 g/cm³。'
      + 'カテゴリ内訳が無いので、特定カテゴリの `CategoryDensity` の `n` には数えない。'
      + '数えるのは `GENERAL_MIX_DENSITY`（下記）だけ。',
  },
  {
    id: 'ref-figures-1-7-scale-assumed-box',
    source: '重量表の 1/7 スケールフィギュア（`src/data/weights.ts` figures / scale-1-7、medianG 1,500）',
    obtainedOn: '2026-09-12',
    categoryMix: { figures: 1 },
    packedWeightG: 1500,
    // **この寸法は実請求の記載ではない。** コーディネーターが「よくある箱」として
    // 仮定した 30×20×25cm。一次情報ではないので isPrimarySource: false。
    dimsCm: { lengthCm: 30, widthCm: 20, heightCm: 25 },
    isPrimarySource: false,
    notes:
      '重量 1,500g は測定（Solaris Japan カタログ、tier estimate）だが、箱の寸法は仮定。'
      + '密度 1,500/15,000 = 0.100 g/cm³ は ZenMarket実請求の 0.103 g/cm³ に近く、'
      + 'オーダーとしての参考にはなるが、**較正件数には数えない**（`isPrimarySource: false`）。',
  },
];

/**
 * カテゴリ不明のカート全体を通した密度。**現状ではこれが唯一の実請求由来の値。**
 * カテゴリ別の `CategoryDensity` とは別枠 ── どのカテゴリにも帰属させられないため。
 * `docs/DESIGN-BOX-SIZE.md` §4 の「弱点」参照。
 */
export const GENERAL_MIX_DENSITY: CategoryDensity = {
  category: 'unknown-mix',
  densityGPerCm3: 0.103,
  n: 1,
  tier: 'C_unknown', // 1件では較正と呼ばない（§6 の規則）
  provisional: false, // 実請求から直接出した値そのものではある（順序の当てずっぽうではない）
  basis:
    'ZenMarket / DE / 2026-05 の実請求1件（`inv-2026-05-de-zenmarket`）から直接算出。'
    + 'カテゴリ内訳が無いので特定カテゴリには使わない。カテゴリが分からないときの器として置く。',
  calibrationInvoiceIds: ['inv-2026-05-de-zenmarket'],
};

/**
 * カテゴリごとの密度。`category` は `src/data/weights.ts` の `WeightCategory.category` と揃える。
 *
 * **`n = 0` の11件すべてが暫定値。** 実請求で較正されたカテゴリはまだ無い。
 * `densityGPerCm3` は「この順に高いはず／低いはず」という物理的な順序づけから、
 * `GENERAL_MIX_DENSITY`（0.103）を中心に割り付けた**当てずっぽうの置き物**で、
 * 較正が1件でも入るまでは動かす前提の値（`docs/DESIGN-BOX-SIZE.md` §3・§6）。
 */
export interface CategoryDensity {
  category: string;
  /** 現在の点推定（g/cm³）。`provisional: true` なら較正されていない置き物。 */
  densityGPerCm3: number;
  /** 較正に使った実請求の件数（`isPrimarySource: true` かつこのカテゴリに帰属できたもの）。 */
  n: number;
  p25?: number;
  p75?: number;
  tier: DensityTier;
  /** `n = 0` またはオーダーだけで決めた値なら true。 */
  provisional: boolean;
  /** なぜこの値・この順位か。物理的な理由を書く。 */
  basis: string;
  /** この値を導いた `CalibrationInvoice.id` の一覧。`provisional` なら空。 */
  calibrationInvoiceIds: string[];
}

export const CATEGORY_DENSITIES: CategoryDensity[] = [
  {
    category: 'books-manga',
    densityGPerCm3: 0.35,
    n: 0,
    tier: 'C_unknown',
    provisional: true,
    basis: '紙は密度が高い媒体で、単行本・漫画は平積みで隙間がほぼ無い。11カテゴリ中もっとも高い側に置く。',
    calibrationInvoiceIds: [],
  },
  {
    category: 'tcg-singles',
    densityGPerCm3: 0.30,
    n: 0,
    tier: 'C_unknown',
    provisional: true,
    basis:
      '薄いカードをスリーブ・トップローダーに入れて出荷するため、重量のわりに専有体積が小さい。'
      + 'ただし鑑定スラブ（graded-slab）は厚みのある樹脂ケースで密度が下がる方向 ── '
      + 'この密度はカテゴリ内で最も点数の多い single-card 側に寄せた値。',
    calibrationInvoiceIds: [],
  },
  {
    category: 'music',
    densityGPerCm3: 0.20,
    n: 0,
    tier: 'C_unknown',
    provisional: true,
    basis: 'CD/LPは重いが、プラスチックケースの厚みぶん空隙がある。書籍・トレカより一段低く置く。',
    calibrationInvoiceIds: [],
  },
  {
    category: 'games',
    densityGPerCm3: 0.18,
    n: 0,
    tier: 'C_unknown',
    provisional: true,
    basis:
      'ソフト単体（カセット・ディスク）はCD/LPに近い密度のはずだが、本体（ゲーム機）は'
      + '筐体内部に空洞が多く密度を下げる。カテゴリの大半を占めるソフトの重量分布に寄せた値。',
    calibrationInvoiceIds: [],
  },
  {
    category: 'food-tea-sake',
    densityGPerCm3: 0.15,
    n: 0,
    tier: 'C_unknown',
    provisional: true,
    basis:
      '酒は液体で密度が高い一方、茶葉・菓子は軽くてかさばる。カテゴリ内の幅が大きいことを'
      + 'そのまま反映できないので、中央よりやや上に置く（酒瓶の実重量が中央値を押し上げているため）。',
    calibrationInvoiceIds: [],
  },
  {
    category: 'figures',
    densityGPerCm3: 0.10,
    n: 0,
    tier: 'C_unknown',
    provisional: true,
    basis:
      '`ref-figures-1-7-scale-assumed-box` が示唆する 0.100 g/cm³ に寄せた値だが、'
      + 'この参考値自体は箱の寸法が仮定であり較正件数に数えていない（`n = 0`）ため、依然として暫定。'
      + '樹脂製で密度は中程度、台座や外箱の空隙で書籍・カードより下という順序だけは確度がある。',
    calibrationInvoiceIds: [],
  },
  {
    category: 'kpop',
    densityGPerCm3: 0.09,
    n: 0,
    tier: 'C_unknown',
    provisional: true,
    basis:
      'アルバム本体（CD+フォトブック）はCD類に近いが、ペンライトは箱の中に空洞の多い成形品で'
      + '密度を下げる。カテゴリにペンライトが混ざる分、musicより低く置く。',
    calibrationInvoiceIds: [],
  },
  {
    category: 'used-luxury',
    densityGPerCm3: 0.08,
    n: 0,
    tier: 'C_unknown',
    provisional: true,
    basis:
      'バッグ・財布は空洞の多い形状（袋そのものが空気を含む）で、詰め紙をして出荷される。'
      + '腕時計は密度が高いはずだが、専用箱の緩衝材で相殺されると見て、カテゴリ全体は低めに置く。',
    calibrationInvoiceIds: [],
  },
  {
    category: 'sports-goods',
    densityGPerCm3: 0.07,
    n: 0,
    tier: 'C_unknown',
    provisional: true,
    basis:
      '道着・防具・バッグなど布地中心の品が多く、畳んでも空気を含む。木刀や竹刀など密度の'
      + '高い個品もあるが、カテゴリの大半（道着セット等）はかさばる方に寄るとみて低めに置く。',
    calibrationInvoiceIds: [],
  },
  {
    category: 'fishing-tackle',
    densityGPerCm3: 0.05,
    n: 0,
    tier: 'C_unknown',
    provisional: true,
    basis:
      '釣り竿は細長く、専有体積のほとんどが空気（梱包箱は竿の長さに合わせるため断面積は小さいのに'
      + '長さが長い）。リールは密度が高いはずだが、カテゴリの体積は竿が支配的とみて低く置く。',
    calibrationInvoiceIds: [],
  },
  {
    category: 'sneakers',
    densityGPerCm3: 0.04,
    n: 0,
    tier: 'C_unknown',
    provisional: true,
    basis:
      'シューボックスは中身の靴に対してかなり大きく、緩衝材や空洞が多い。11カテゴリ中もっとも'
      + '低い側に置く（`docs/audit` 側でも sneakers の重量が「箱込みか裸か」で5倍以上ぶれることが'
      + '`src/data/weights.ts` の notes に記録されている ── 箱が体積の大半を占める傍証）。',
    calibrationInvoiceIds: [],
  },
];

export function densityForCategory(category: string): CategoryDensity | undefined {
  return CATEGORY_DENSITIES.find((d) => d.category === category);
}

/**
 * 予測と実際のずれ。実請求が新しく来たとき、その時点のカテゴリ密度で予測した体積と、
 * 請求書の実際の体積を突き合わせる。`docs/ROADMAP.md` P4-4c（実請求検証）と対応する。
 * **この PR では計算に接続しない。**将来、較正スクリプトやテストがこの形で誤差を記録する。
 */
export interface DensityPredictionCheck {
  invoiceId: string;
  category: string;
  densityUsedGPerCm3: number;
  predictedVolumeCm3: number;
  actualVolumeCm3: number;
  /** (predicted - actual) / actual * 100 */
  errorPct: number;
}

export function checkPrediction(
  inv: CalibrationInvoice,
  category: string,
  densityUsed: number,
): DensityPredictionCheck {
  const actual = volumeCm3(inv.dimsCm);
  const predicted = inv.packedWeightG / densityUsed;
  return {
    invoiceId: inv.id,
    category,
    densityUsedGPerCm3: densityUsed,
    predictedVolumeCm3: predicted,
    actualVolumeCm3: actual,
    errorPct: ((predicted - actual) / actual) * 100,
  };
}
