import { totalBarStops } from '@/lib/ui/scales';

/**
 * 総額＋不確かさの棒。**全行共通のスケール**（`domainMax` は呼び出し側が
 * 全行の `total.high ?? total.low` の最大から一度だけ計算して渡す）で、
 * 行間で長さを比べられるようにする。
 *
 * 下限までは濃く塗り、下限〜上限は薄く塗る（「本当に確定した部分」と
 * 「幅の中のどこか」を塗り分ける）。**上限不明のときは右端をフェードさせる**
 * ——確定した右端がある絵にしない（`totalIntervalText` の「or more」と同じ規則）。
 */
export function TotalBar({
  total,
  domainMax,
}: {
  total: { low: number; high: number | null };
  domainMax: number;
}) {
  if (!(domainMax > 0)) return null;
  const { lowPct, highPct, upperUnknown } = totalBarStops(total, domainMax);
  return (
    <div
      data-testid="total-bar"
      data-upper-unknown={upperUnknown ? 'true' : 'false'}
      className="relative h-1.5 w-full max-w-[160px] overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800"
    >
      {/* 下限まで濃く。 */}
      <div
        className="absolute inset-y-0 left-0 bg-neutral-600 dark:bg-neutral-400"
        style={{ width: `${lowPct}%` }}
      />
      {upperUnknown ? (
        // 上限不明: 下限から右端まで、濃→透明のグラデーションでフェードさせる。
        // 確定した右端を描かない。
        <div
          data-testid="total-bar-fade"
          className="absolute inset-y-0"
          style={{
            left: `${lowPct}%`,
            right: 0,
            background: 'linear-gradient(to right, currentColor, transparent)',
            opacity: 0.35,
          }}
        />
      ) : (
        highPct != null &&
        highPct > lowPct && (
          <div
            className="absolute inset-y-0 bg-neutral-400/70 dark:bg-neutral-500/60"
            style={{ left: `${lowPct}%`, width: `${highPct - lowPct}%` }}
          />
        )
      )}
    </div>
  );
}
