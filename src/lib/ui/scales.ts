/**
 * PR-B（順位ボード）の棒グラフが使う純粋なスケール関数。
 *
 * **全行共通のスケールにする。**行ごとに最大値を取ってスケールすると、
 * 「棒の長さ」が行間で比較できなくなる（1位の総額バーが2位のそれより
 * 短く見えるのに、実額は2位の方が大きい、といった逆転が起きうる）。
 * ここに置く関数は呼び出し側（RankBoard）が一度だけ計算した
 * 「全行を通した domain」を受け取り、1行分の位置だけを返す。
 *
 * DOM に触れない・React に依存しない。単体テストは
 * `src/lib/ui/scales.test.ts` を見よ。
 */

/** 0..domainMax を 0..100(%) に写す線形スケール。domainMax <= 0 のときは常に 0。 */
export function linearPct(value: number, domainMax: number): number {
  if (!(domainMax > 0)) return 0;
  return Math.max(0, Math.min(100, (value / domainMax) * 100));
}

/**
 * 総額＋不確かさの棒の3点（下限%・上限%・上限不明か）を返す。
 * **上限不明（`high === null`）のときに偽の上限を作らない**——`totalIntervalText`
 * と同じ規則をバーにも適用する。呼び出し側はこの3点目（`upperUnknown`）を見て
 * 右端をフェードさせる（不透明→透明のグラデーション）。
 */
export function totalBarStops(
  total: { low: number; high: number | null },
  domainMax: number,
): { lowPct: number; highPct: number | null; upperUnknown: boolean } {
  const lowPct = linearPct(total.low, domainMax);
  if (total.high === null) return { lowPct, highPct: null, upperUnknown: true };
  return { lowPct, highPct: linearPct(total.high, domainMax), upperUnknown: false };
}

/**
 * 到着日数の対数スケール。**日数は線形に伸びない**——1〜3日と28〜84日を
 * 同じ棒の中に線形で置くと、短い方が視認できないほど潰れる
 * （ミニマム1桁〜最大3桁を1つの棒に収める必要があるための対数化）。
 *
 * `minDomain`/`maxDomain` は全行を通した最小・最大日数（1以上に丸めた値、
 * `days.minDays`/`maxDays` の全行 min/max を呼び出し側が渡す）。
 * `maxDomain <= minDomain` のときは常に 0（棒を潰さないための安全策）。
 */
export function logPct(value: number, minDomain: number, maxDomain: number): number {
  const v = Math.max(1, value);
  const lo = Math.max(1, minDomain);
  const hi = Math.max(lo + 1e-9, maxDomain);
  const t = (Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo));
  return Math.max(0, Math.min(100, t * 100));
}

/**
 * 到着バーの全行共通ドメイン。**固定**（コーディネーター指摘、Fable レビュー）
 * ——行ごとの実測 min/max から作ると、全行が同じ方式のときに棒が常に全幅
 * （0%〜100%）に張り付き、「対数スケールで比べている」という体裁だけが残って
 * 実際には何も比較できなくなる。1日〜90日の固定レンジなら、日本郵便の
 * EMS（最速級）から宅配便のサーフェス便（最遅級、月単位）まで、実在する
 * 全方式がこの中に収まる。
 */
export const ARRIVAL_DOMAIN_MIN_DAYS = 1;
export const ARRIVAL_DOMAIN_MAX_DAYS = 90;

/**
 * 到着バーの4点（下限%・上限%・下端ぼかし・上端ぼかし）。
 *
 * - **両方数値**（"12–26 days" 等）: そのまま区間として描く。
 * - **上限だけ数値**（"10 days or less" 等）: 下限はドメインの最小値に置き、
 *   `fadeLow: true` にする——「速ければここまで速い」という主張を作らない
 *   ためにぼかす。
 * - **下限だけ数値**（"at least N days" 型。今のマスタには実例が無いが、
 *   型としては起こりうる）: 上限をドメインの最大値に置き、`fadeHigh: true`。
 * - **どちらも無い**（宅配便の "not yet modeled" 等、真に未知）: ドメイン
 *   全域を覆う超薄の帯として返し、両端をぼかす（`fadeLow`/`fadeHigh` 両方
 *   true）——「速いとも遅いとも言っていない」ことを、特定の長さを主張せずに示す。
 *
 * **`tracked === false`（追跡なし）は常に `fadeHigh` を追加で立てる**——
 * 呼び出し側で `days.tracked` と OR すること（この関数自身は `tracked` を
 * 受け取らない。日数の解釈と追跡の有無は別の軸なので混ぜない）。
 */
export function arrivalBarStops(
  days: { minDays: number | null; maxDays: number | null },
  minDomain: number = ARRIVAL_DOMAIN_MIN_DAYS,
  maxDomain: number = ARRIVAL_DOMAIN_MAX_DAYS,
): { lowPct: number; highPct: number; fadeLow: boolean; fadeHigh: boolean } {
  const { minDays, maxDays } = days;
  if (minDays != null && maxDays != null) {
    return {
      lowPct: logPct(minDays, minDomain, maxDomain),
      highPct: logPct(maxDays, minDomain, maxDomain),
      fadeLow: false,
      fadeHigh: false,
    };
  }
  if (maxDays != null) {
    return { lowPct: 0, highPct: logPct(maxDays, minDomain, maxDomain), fadeLow: true, fadeHigh: false };
  }
  if (minDays != null) {
    return { lowPct: logPct(minDays, minDomain, maxDomain), highPct: 100, fadeLow: false, fadeHigh: true };
  }
  return { lowPct: 0, highPct: 100, fadeLow: true, fadeHigh: true };
}

/**
 * `Row.days.text` から、日数の構造化フィールド（`minDays`/`maxDays`）が
 * 拾えていない場合に、**単位の曖昧さを増やさない範囲でだけ**追加で数字を拾う
 * UI 専用のフォールバック。`src/lib/pricing/compare.ts` の `daysNumeric` は
 * 触らない（このPRは `src/lib/pricing` 配下を一切変更しない）——同じ理由
 * （月単位は日数に換算しない、換算すると我々が作った数字になる）は月表記
 * （"1–3 months" 等）にもそのまま適用し、ここでも変換しない。
 *
 * **「a week」は変換する。**「1週間＝7日」は単位の定義そのもの（1ヶ月と違って
 * 日数が可変ではない）なので、これは推測ではなく単位変換——"a week or less"
 * を `{ minDays: null, maxDays: 7 }` にする。それ以外（月表記・"not yet
 * modeled"・"transit time not published" 等）は素通しで両方 `null` のまま返す。
 */
export function parseDaysDisplay(
  days: { minDays: number | null; maxDays: number | null; text: string },
): { minDays: number | null; maxDays: number | null } {
  if (days.minDays != null || days.maxDays != null) {
    return { minDays: days.minDays, maxDays: days.maxDays };
  }
  if (/\ba week or less\b/i.test(days.text)) return { minDays: null, maxDays: 7 };
  return { minDays: null, maxDays: null };
}
