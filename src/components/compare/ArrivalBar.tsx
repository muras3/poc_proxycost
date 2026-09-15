import { arrivalBarStops } from '@/lib/ui/scales';
import type { Row } from '@/lib/pricing/types';

/**
 * 「Ships by」＋到着日数の棒。**全行共通の対数スケール**
 * （`minDomain`/`maxDomain` は呼び出し側が全行の `days.minDays`/`maxDays` の
 * min/max から一度だけ計算して渡す）。
 *
 * 線種で確度を分ける（小さな日数文字だけに頼らない、というPR-Bの要件）:
 *   - 公表（`tier === 'fixed'`）… 実線
 *   - 未公表（それ以外の tier）… 点線、**途切れて見えるように**
 *   - 追跡なし（`tracked === false`）… 終端を開いた形（右端に矢印を出さず、
 *     フェードで切る）
 *
 * `minDays`/`maxDays` のどちらかが無い（数字に変換できない表記）ときは、
 * 数字の棒を描かない——`arrivalBarStops` が `null` を返すので、テキストだけの
 * フォールバック（`days.text` をそのまま出す控えめな行）にする。
 */
export function ArrivalBar({
  days,
  minDomain,
  maxDomain,
}: {
  days: Row['days'];
  minDomain: number;
  maxDomain: number;
}) {
  const stops = arrivalBarStops(days, minDomain, maxDomain);
  const published = days.tier === 'fixed';
  const untracked = !days.tracked;

  if (!stops) {
    return (
      <div data-testid="arrival-bar" data-mode="text-only" className="text-xs text-neutral-500">
        Ships by {days.text}
      </div>
    );
  }

  const width = Math.max(2, stops.highPct - stops.lowPct);
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-neutral-500">Ships by {days.text}</span>
      <div
        data-testid="arrival-bar"
        data-mode="numeric"
        data-published={published ? 'true' : 'false'}
        data-untracked={untracked ? 'true' : 'false'}
        className="relative h-1.5 w-full max-w-[160px] rounded-full bg-neutral-200 dark:bg-neutral-800"
      >
        <div
          data-testid="arrival-bar-segment"
          className={`absolute inset-y-0 rounded-full border-t-2 ${
            published ? 'border-solid' : 'border-dotted'
          } border-post-blue`}
          style={{ left: `${stops.lowPct}%`, width: `${width}%`, top: '50%', marginTop: -1 }}
        />
        {untracked && (
          // 追跡なし: 終端を開いた形にする——閉じた矢印・端点を描かず、フェードで切る。
          <div
            data-testid="arrival-bar-open-end"
            className="absolute inset-y-0"
            style={{
              left: `${stops.lowPct + width}%`,
              width: '10%',
              background: 'linear-gradient(to right, currentColor, transparent)',
              opacity: 0.4,
            }}
          />
        )}
      </div>
    </div>
  );
}
