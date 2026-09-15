import {
  ARRIVAL_DOMAIN_MAX_DAYS, ARRIVAL_DOMAIN_MIN_DAYS, arrivalBarStops, parseDaysDisplay,
} from '@/lib/ui/scales';
import { methodLabel } from '@/lib/ui/methodLabel';
import type { CourierMethod, PostalMethod, Row } from '@/lib/pricing/types';

/**
 * 「Ships by」＋到着日数の棒。全行共通の固定対数ドメイン
 * （`ARRIVAL_DOMAIN_MIN_DAYS`〜`ARRIVAL_DOMAIN_MAX_DAYS`）、固定幅160px。
 *
 * **1つの手段に1つの意味**（caveat-ui-grammar）。終端の形で分ける:
 *   - `closed`      … 公表された日数の上端。短い縦線（キャップ）で閉じる
 *   - `untracked`   … 追跡なし（`tracked === false`）。終端を**開いた丸**（mock-v3 の ring）
 *   - `unpublished` … 日数が未公表。棒を点線にし、終端を**途切れさせる**（キャップなし・隙間）
 *   - `open`        … 上限だけ未知（"at least N days" 型）。点線を固定長で延ばす
 * 線種: 公表＝実線、未公表＝点線。
 * 日数の原文は閉じた行に出さない——開いた中（RowBreakdown の国際配送の段）に出す。
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
  const unpublished = !published || (numeric.minDays == null && numeric.maxDays == null);
  const end: 'untracked' | 'unpublished' | 'open' | 'closed' = !days.tracked
    ? 'untracked'
    : unpublished
      ? 'unpublished'
      : stops.fadeHigh
        ? 'open'
        : 'closed';
  const width = Math.max(2, stops.highPct - stops.lowPct);
  const endPct = stops.lowPct + width;
  const label = methodLabel(method);
  const aria = [
    `Ships by ${label}`,
    unpublished ? 'transit time not published' : days.text,
    days.tracked ? null : 'untracked',
  ].filter(Boolean).join(', ');

  return (
    <div
      data-testid="arrival-bar"
      data-published={published ? 'true' : 'false'}
      data-tracked={days.tracked ? 'true' : 'false'}
      className="flex w-44 flex-col gap-0.5"
    >
      {/* 長い方式名は省略し、全文は title へ（棒の列幅を行ごとに変えない）。 */}
      <span className="block truncate text-xs text-neutral-500" title={`Ships by ${label}`}>
        Ships by {label}
      </span>
      <div
        data-testid="arrival-bar-track"
        role="img"
        aria-label={aria}
        className="relative h-1.5 w-40 rounded-full bg-neutral-200 dark:bg-neutral-800"
      >
        <div
          data-testid="arrival-bar-segment"
          className={`absolute border-t-2 ${
            unpublished ? 'border-dotted' : 'border-solid'
          } ${published ? 'border-post-blue' : 'border-neutral-500'}`}
          style={{
            left: `${stops.lowPct}%`,
            // 未公表は終端を途切れさせる（右端に隙間を残す）。
            width: `calc(${width}% - ${end === 'unpublished' ? 8 : 0}px)`,
            top: '50%',
            marginTop: -1,
          }}
        />
        {stops.fadeLow && !unpublished && (
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
        {end === 'untracked' && (
          <span
            data-testid="arrival-bar-end"
            data-end="untracked"
            className="absolute size-2 rounded-full border-2 border-red-600 bg-white dark:border-red-400 dark:bg-neutral-950"
            style={{ left: `${endPct}%`, top: '50%', transform: 'translate(-50%, -50%)' }}
          />
        )}
        {end === 'unpublished' && (
          <span data-testid="arrival-bar-end" data-end="unpublished" className="sr-only" />
        )}
        {end === 'open' && (
          <span
            data-testid="arrival-bar-end"
            data-end="open"
            className="absolute w-3 border-t-2 border-dotted border-post-blue"
            style={{ left: `${endPct}%`, top: '50%', marginTop: -1 }}
          />
        )}
        {end === 'closed' && (
          <span
            data-testid="arrival-bar-end"
            data-end="closed"
            className="absolute h-2 w-0.5 bg-post-blue"
            style={{ left: `${endPct}%`, top: '50%', transform: 'translate(-50%, -50%)' }}
          />
        )}
      </div>
    </div>
  );
}
