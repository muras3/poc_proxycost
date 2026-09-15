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
      // **`w-full` ではなく固定幅にする。**右列の親（`sm:w-auto sm:shrink-0`）は
      // デスクトップで内容にあわせて縮む幅だけを持つので、`w-full` は「その行の
      // 中身の幅」を指すことになり、行ごとに違う値になる（実測: 行によって
      // 160px/135px と割れた——「全行共通スケール」という前提そのものが
      // 見た目で壊れていた、ローカル e2e で検出）。`w-40`（160px）で固定し、
      // どの親幅の下でも同じ実測幅になるようにする。
      className="relative h-1.5 w-40 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800"
    >
      {/* 下限まで濃く。 */}
      <div
        className="absolute inset-y-0 left-0 bg-neutral-600 dark:bg-neutral-400"
        style={{ width: `${lowPct}%` }}
      />
      {upperUnknown ? (
        // 上限不明: 下限から右端まで、濃→透明のグラデーションでフェードさせる。
        // 確定した右端を描かない。
        // **`lowPct` が100%に張り付く行がある**（domain の最大値自身がこの行の
        // `low` のとき）——そのままだと幅0のフェードになり「フェードしている」
        // という絵そのものが描けない。フェードの開始位置だけ92%で頭打ちにし、
        // 常に見える幅を残す（下限バー自体の位置・幅は変えない——`lowPct` の
        // 素の値のまま）。
        <div
          data-testid="total-bar-fade"
          className="absolute inset-y-0"
          style={{
            left: `${Math.min(lowPct, 92)}%`,
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
