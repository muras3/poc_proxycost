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
 * 到着バーの2点（下限%・上限%）。`minDays`/`maxDays` のどちらかが無ければ
 * `null`——呼び出し側は数字の棒を描かず、テキストだけのフォールバックにする。
 */
export function arrivalBarStops(
  days: { minDays: number | null; maxDays: number | null },
  minDomain: number,
  maxDomain: number,
): { lowPct: number; highPct: number } | null {
  if (days.minDays == null || days.maxDays == null) return null;
  return {
    lowPct: logPct(days.minDays, minDomain, maxDomain),
    highPct: logPct(days.maxDays, minDomain, maxDomain),
  };
}
