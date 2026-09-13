/**
 * 計算機オラクル比較ハーネス（docs/measurements/CALCULATOR-ORACLE.md 参照）。
 *
 * 代行の公開計算機は「送料を採取するための道具」としてだけでなく、**入力を揃えれば
 * 我々のエンジンと同じ答えを出すはずの、もう一つの計算機**として使える。同じ入力
 * （国・重量・寸法・方式）を我々の `postageFor()`/`markupYen()`（日本郵便の公式料金
 * 表そのままの実装、`src/lib/pricing/postage.ts`）に通し、`master/courier-rates.json`
 * にすでに採取・確定済みの計算機の表示額と突き合わせる。
 *
 * **このファイルは `src/lib/pricing/` の既存ロジック・`master/*.json` の数値を
 * 一切変更しない。** `postageFor`/`markupYen` を読み出し専用で呼ぶだけで、
 * `master/courier-rates.json` も読み出し専用で読む。
 *
 * **スコープの正直な線引き**（PRの依頼文書に対応）:
 * 現在 `master/courier-rates.json` に採取済みの観測は、いずれも「送料そのもの」の
 * 表示額であって、商品代・関税・決済手数料等を含む「チェックアウト合計」ではない。
 * したがって、このハーネスが比較できるのは `compare()` が組み立てる総額全体では
 * なく、**日本郵便の方式（EMS・AirMail・Surface・Small Packet の4系統×船便/航空便）
 * を採取した代行2社（FROM JAPAN・Jauce）の郵送料そのもの**に限られる。宅配便
 * （UPS/DHL/FedEx/ECMS/SF Express）や International ePacket Light は、代行が
 * 独自レートテーブルとして「測定値」をそのままマスタに転記している
 * （`kind: 'measured'`）ため、比較すると採取元と同じ数値同士を比べる循環になり、
 * 意味のある検査にならない——これらは `not_comparable` として明示的に除外する。
 */

import fs from 'node:fs';
import path from 'node:path';
import type { CountryCode } from './types';
import { markupYen, postageFor, type PostalMethod } from './postage';

const COURIER_RATES_JSON_PATH = path.join(__dirname, '..', '..', '..', 'master', 'courier-rates.json');

export type OracleClassification =
  | 'match'
  | 'differ_named'
  | 'differ_unexplained'
  | 'not_comparable';

export interface OracleObservation {
  /** 追跡用の一意id。診断メッセージにそのまま出す。 */
  readonly id: string;
  readonly proxy: 'fromjapan' | 'jauce';
  readonly country: CountryCode;
  readonly weightG: number;
  readonly method: PostalMethod;
  /** その方式に我々のモデルが乗せる上乗せ（円）。無ければ 0。 */
  readonly markupYen: number;
  readonly displayedYen: number;
  /** 元データの場所（`master/courier-rates.json` 内のキー）。 */
  readonly source: string;
}

export interface OracleResult {
  readonly observation: OracleObservation;
  readonly engineYen: number | null;
  readonly classification: OracleClassification;
  /** displayedYen - engineYen。エンジン側が算出不能なら null。 */
  readonly residualYen: number | null;
  readonly note: string;
}

/**
 * 許容誤差。**0円。** 日本郵便の公式料金表は円建ての整数表であり、為替換算や
 * 四捨五入が入る他の費目（関税・カード手数料等）と違って、丸め誤差が生じる理由が
 * ない。0円以外の差が出たら、それは「許容誤差の範囲」ではなく「エンジンかマスタの
 * どちらかが表を読み違えている」ことを意味する。
 */
export const TOLERANCE_YEN = 0;

function classify(displayed: number, engine: number | null): { classification: OracleClassification; residualYen: number | null; note: string } {
  if (engine == null) {
    return {
      classification: 'not_comparable',
      residualYen: null,
      note: 'engine could not price this observation (postageFor() returned null — out of table range for this method/country/weight)',
    };
  }
  const residual = displayed - engine;
  if (Math.abs(residual) <= TOLERANCE_YEN) {
    return { classification: 'match', residualYen: residual, note: `within tolerance (¥${TOLERANCE_YEN})` };
  }
  return {
    classification: 'differ_unexplained',
    residualYen: residual,
    note: `engine=¥${engine} vs calculator=¥${displayed}, residual=¥${residual} — no named line item explains this gap`,
  };
}

export function runOracleComparison(observations: readonly OracleObservation[]): OracleResult[] {
  return observations.map((observation) => {
    const priced = postageFor(observation.method, observation.country, observation.weightG);
    const engineYen = priced == null ? null : priced.yen + observation.markupYen;
    const { classification, residualYen, note } = classify(observation.displayedYen, engineYen);
    return { observation, engineYen, classification, residualYen, note };
  });
}

// ---------------------------------------------------------------------------
// master/courier-rates.json から比較可能な観測を抽出する。
// ---------------------------------------------------------------------------

interface CourierRatesShape {
  observations: Record<string, unknown>;
}

let cached: CourierRatesShape | null = null;
function loadCourierRates(): CourierRatesShape {
  if (!cached) {
    cached = JSON.parse(fs.readFileSync(COURIER_RATES_JSON_PATH, 'utf8')) as CourierRatesShape;
  }
  return cached;
}

/** 表示名 → 我々の PostalMethod 語彙。両社とも同じ4系統の呼び名を使う。 */
const METHOD_MAP: Record<string, PostalMethod> = {
  EMS: 'ems',
  AirMail: 'parcel-air',
  Surface: 'parcel-surface',
  'AirMail (Small Packet)': 'small-packet-air',
  'Surface (Small Packet)': 'small-packet-surface',
};

/** Jauce の Surface には 1kg段ごと¥250のマークアップが乗る（services.ts の jauce.postage['parcel-surface']）。 */
// `markupYen()` only ever reads `.markup`/`.byCountry` — the rest of `MarkupPostageRate`
// (source metadata) is irrelevant to computing the number, so we don't reconstruct it here.
const JAUCE_SURFACE_MARKUP = {
  markup: { kind: 'per-kg-step', yen: 250 },
} as unknown as import('./services').MarkupPostageRate;

interface JauceCurvePoint {
  country: string;
  weight_g: number;
  EMS?: number;
  Surface?: number | string;
}

function jauceObservations(): OracleObservation[] {
  const obs = loadCourierRates().observations as Record<string, {
    grid_b_au_ca_fr_gb_weight_curve_2026_09_13?: JauceCurvePoint[];
    positive_control_us_20x15x10?: Omit<JauceCurvePoint, 'country'>[];
  }>;
  const v3 = obs['jauce_v3_remeasurement_2026_09_13'];
  if (!v3) return [];
  const out: OracleObservation[] = [];
  for (const p of v3.grid_b_au_ca_fr_gb_weight_curve_2026_09_13 ?? []) {
    const cc = p.country as CountryCode;
    if (typeof p.EMS === 'number') {
      out.push({
        id: `jauce:${cc}:${p.weight_g}g:ems`, proxy: 'jauce', country: cc, weightG: p.weight_g,
        method: 'ems', markupYen: 0, displayedYen: p.EMS,
        source: `courier-rates.json observations.jauce_v3_remeasurement_2026_09_13.grid_b… (${cc}, ${p.weight_g}g)`,
      });
    }
    if (typeof p.Surface === 'number') {
      out.push({
        id: `jauce:${cc}:${p.weight_g}g:surface`, proxy: 'jauce', country: cc, weightG: p.weight_g,
        method: 'parcel-surface', markupYen: markupYen(JAUCE_SURFACE_MARKUP, cc, p.weight_g), displayedYen: p.Surface,
        source: `courier-rates.json observations.jauce_v3_remeasurement_2026_09_13.grid_b… (${cc}, ${p.weight_g}g)`,
      });
    }
  }
  // 陽性対照（US・EMSのみ）。CLAUDE.md §10 が要求する「答えを既に知っている条件」——
  // 手順が変化を検知できているかの確認用に、比較にも同じ形で含める。
  for (const p of v3.positive_control_us_20x15x10 ?? []) {
    if (typeof p.EMS === 'number') {
      out.push({
        id: `jauce:US:${p.weight_g}g:ems:positive-control`, proxy: 'jauce', country: 'US', weightG: p.weight_g,
        method: 'ems', markupYen: 0, displayedYen: p.EMS,
        source: 'courier-rates.json observations.jauce_v3_remeasurement_2026_09_13.positive_control_us_20x15x10',
      });
    }
  }
  return out;
}

interface SinglePoint {
  proxy: string;
  country: string;
  weight_g: number;
  method_name: string;
  price_jpy: number;
}

function fromjapanSinglePoints(): OracleObservation[] {
  const obs = loadCourierRates().observations as { single_points?: SinglePoint[] };
  const out: OracleObservation[] = [];
  for (const p of obs.single_points ?? []) {
    if (p.proxy !== 'fromjapan') continue;
    const method = METHOD_MAP[p.method_name];
    if (!method) continue; // ECMS / International ePacket Light 等: 我々のモデルに無い方式
    out.push({
      id: `fromjapan:${p.country}:${p.weight_g}g:${method}:single-point`,
      proxy: 'fromjapan', country: p.country as CountryCode, weightG: p.weight_g,
      method, markupYen: 0, displayedYen: p.price_jpy,
      source: `courier-rates.json observations.single_points (${p.proxy}, ${p.country}, ${p.weight_g}g, "${p.method_name}")`,
    });
  }
  return out;
}

interface SevenCountriesShape {
  raw_by_country: Record<string, Record<string, {
    methods: { method_name_as_displayed: string; price_jpy: number }[];
  }>>;
}

function fromjapanSevenCountries(): OracleObservation[] {
  const obs = loadCourierRates().observations as { fromjapan_seven_countries_2026_09_13?: SevenCountriesShape };
  const sc = obs.fromjapan_seven_countries_2026_09_13;
  if (!sc) return [];
  const out: OracleObservation[] = [];
  for (const [cc, byWeight] of Object.entries(sc.raw_by_country)) {
    for (const [weightKey, block] of Object.entries(byWeight)) {
      // 'repeat_measurement_note' 等の非計量キーや、SGの `500g_run1`/`500g_run2`
      // （同一条件の再測定で、これ自体が§10の安定性確認）はここでは除外する——
      // 単純な `<数字>g` の形のキーだけを重量点として扱う。
      const match = /^(\d+)g$/.exec(weightKey);
      if (!match) continue;
      const weightG = Number(match[1]);
      for (const m of block.methods) {
        const method = METHOD_MAP[m.method_name_as_displayed];
        if (!method) continue; // ECMS / UPS / DHL / FedEx / International ePacket Light / SF Express
        out.push({
          id: `fromjapan:${cc}:${weightG}g:${method}:seven-countries`,
          proxy: 'fromjapan', country: cc as CountryCode, weightG,
          method, markupYen: 0, displayedYen: m.price_jpy,
          source: `courier-rates.json observations.fromjapan_seven_countries_2026_09_13.raw_by_country.${cc}.${weightKey} ("${m.method_name_as_displayed}")`,
        });
      }
    }
  }
  return out;
}

/** `master/courier-rates.json` の観測から、比較可能な全観測を組み立てる。 */
export function loadCommittedOracleObservations(): OracleObservation[] {
  return [...jauceObservations(), ...fromjapanSinglePoints(), ...fromjapanSevenCountries()];
}
