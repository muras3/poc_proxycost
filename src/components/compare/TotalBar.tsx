import { totalBarStops } from '@/lib/ui/scales';
import { yen } from '@/lib/ui/format';

/** 上限不明の「開いた終端」の固定長（px）。下限の位置に関係なく常にこの長さで描く。 */
const OPEN_END_PX = 16;

/**
 * 総額＋不確かさの棒。**全行共通のスケール**（`domainMax` は呼び出し側が
 * 全行の `total.high ?? total.low` の最大から一度だけ計算して渡す）で、
 * 行間で長さを比べられるようにする。
 *
 * 下限までは濃く塗り、下限〜上限は薄く塗る。**上限不明のときは、下限の終端から
 * 固定長の途切れた点線を右へ延ばす（開いた終端）。**以前の右端フェード
 * （92→100% の13px）は `lowPct` が高い行でほぼ見えず、点推定＝偽の上限に
 * 見えていた（Fable レビュー）。点線は目盛り（160px）の外側に予約した
 * `OPEN_END_PX` の余白へはみ出せるので、`lowPct` が100%でも必ず見える。
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
  const label = upperUnknown
    ? `at least ${yen(total.low)}, no upper bound`
    : total.high != null && total.high > total.low
      ? `${yen(total.low)} to ${yen(total.high)}`
      : yen(total.low);
  return (
    <div
      data-testid="total-bar"
      data-upper-unknown={upperUnknown ? 'true' : 'false'}
      role="img"
      aria-label={label}
      // 目盛り（`w-40`＝160px）＋開いた終端用の予約（全行共通）。
      // 行によって幅を変えない——共通スケールの前提。
      className="relative h-1.5 shrink-0"
      style={{ width: 160 + OPEN_END_PX + 2 }}
    >
      <div
        data-testid="total-bar-track"
        className="absolute inset-y-0 left-0 w-40 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800"
      >
        {/* 下限まで濃く。 */}
        <div
          className="absolute inset-y-0 left-0 bg-neutral-600 dark:bg-neutral-400"
          style={{ width: `${lowPct}%` }}
        />
        {!upperUnknown && highPct != null && highPct > lowPct && (
          <div
            className="absolute inset-y-0 bg-neutral-400/70 dark:bg-neutral-500/60"
            style={{ left: `${lowPct}%`, width: `${highPct - lowPct}%` }}
          />
        )}
      </div>
      {upperUnknown && (
        // 開いた終端: 下限の右端から固定長の点線。閉じた端点を描かない。
        <div
          data-testid="total-bar-open-end"
          className="absolute border-t-2 border-dotted border-neutral-600 dark:border-neutral-400"
          style={{
            left: `calc(${(lowPct / 100) * 160}px + 2px)`,
            width: OPEN_END_PX,
            top: '50%',
            marginTop: -1,
          }}
        />
      )}
    </div>
  );
}
