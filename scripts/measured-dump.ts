/**
 * `master/render-docs.py`（Python）が README の実測値の節を生成するために呼ぶ。
 *
 * **やることはこれだけ**: `src/app/sources/measured.ts` が export している値を
 * そのまま JSON にして標準出力へ流す。値そのものをここに書き写さない
 * （書き写すと `/sources` の実測とまた静かにずれる——README がやった失敗そのもの）。
 *
 *   npx tsx scripts/measured-dump.ts
 */
import {
  MEASURED_BASKET,
  CONFIDENCE_SPLIT,
  CONFIDENCE_SPLIT_BY_COUNTRY,
  CONFIDENCE_TOTAL,
  WEIGHT_SHIFT,
  CROSSOVER_G,
  RANK_STABILITY,
} from '../src/app/sources/measured';

process.stdout.write(JSON.stringify({
  MEASURED_BASKET,
  CONFIDENCE_SPLIT,
  CONFIDENCE_SPLIT_BY_COUNTRY,
  CONFIDENCE_TOTAL,
  WEIGHT_SHIFT,
  CROSSOVER_G,
  RANK_STABILITY,
}));
