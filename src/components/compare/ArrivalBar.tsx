import {
  ARRIVAL_DOMAIN_MAX_DAYS, ARRIVAL_DOMAIN_MIN_DAYS, arrivalBarStops, parseDaysDisplay,
} from '@/lib/ui/scales';
import { methodLabel } from '@/lib/ui/methodLabel';
import type { CourierMethod, PostalMethod, Row } from '@/lib/pricing/types';

/**
 * 「Ships by」＋到着日数の棒。**必ず方式名＋棒を出す**（台帳 #15/#56
 * 「方式名が無い」「到着の棒がどこにも出ていない」への対応、Fable レビュー）。
 * 全行共通の固定ドメイン（`ARRIVAL_DOMAIN_MIN_DAYS`〜`ARRIVAL_DOMAIN_MAX_DAYS`、
 * 対数）。
 *
 * 線種・端の形で確度を分ける（小さな日数文字だけに頼らない）:
 *   - 公表（`tier === 'fixed'`）… 実線
 *   - 未公表（それ以外）… 点線。**生の `days.text`（"not yet modeled" 等）は
 *     行に出さない**——方式名だけ見せ、棒の点線で「未公表」を示す。
 *   - 上限だけ分かる／未知の下端 … 開始側をぼかす（`fadeLow`）
 *   - 追跡なし（`tracked === false`）／未知の上端 … 終端を開いた形にする
 *     （`fadeHigh`）
 */
export function ArrivalBar({
  days,
  method,
}: {
  days: Row['days'];
  method: PostalMethod | CourierMethod;
}) {
  const published = days.tier === 'fixed';
  const numeric = parseDaysDisplay(days);
  const stops = arrivalBarStops(numeric, ARRIVAL_DOMAIN_MIN_DAYS, ARRIVAL_DOMAIN_MAX_DAYS);
  const fadeHigh = stops.fadeHigh || !days.tracked;
  const width = Math.max(2, stops.highPct - stops.lowPct);
  const label = methodLabel(method);

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-neutral-500">Ships by {label}</span>
      <div
        data-testid="arrival-bar"
        data-published={published ? 'true' : 'false'}
        data-tracked={days.tracked ? 'true' : 'false'}
        className="relative h-1.5 w-full max-w-[160px] rounded-full bg-neutral-200 dark:bg-neutral-800"
      >
        <div
          data-testid="arrival-bar-segment"
          className={`absolute inset-y-0 rounded-full border-t-2 ${
            published ? 'border-solid' : 'border-dotted'
          } border-post-blue`}
          style={{ left: `${stops.lowPct}%`, width: `${width}%`, top: '50%', marginTop: -1 }}
        />
        {stops.fadeLow && (
          // 下端が未知（"X or less" の下限、または完全未知）: 開始側をぼかす。
          // 「これより速い」という主張を作らない。
          <div
            data-testid="arrival-bar-fade-low"
            className="absolute inset-y-0"
            style={{
              left: `${stops.lowPct}%`,
              width: `${Math.min(10, width)}%`,
              background: 'linear-gradient(to left, currentColor, transparent)',
              opacity: 0.4,
            }}
          />
        )}
        {fadeHigh && (
          // 追跡なし／上端が未知: 終端を開いた形にする——閉じた端点を描かない。
          <div
            data-testid="arrival-bar-open-end"
            className="absolute inset-y-0"
            style={{
              left: `${Math.max(0, stops.lowPct + width - Math.min(10, width))}%`,
              width: `${Math.min(10, width) + 2}%`,
              background: 'linear-gradient(to right, currentColor, transparent)',
              opacity: 0.4,
            }}
          />
        )}
      </div>
    </div>
  );
}
