'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { Amount, tierClass } from '@/lib/ui/tiers';
import { foreign, totalIntervalText, yen, yenRange } from '@/lib/ui/format';
import { andList } from '@/lib/pricing/compare';
import { rateLabel } from '@/lib/pricing/rates';
import type { CompareResult, Row } from '@/lib/pricing/types';
import { DiffBar } from './DiffBar';
import { RowBreakdown } from './RowBreakdown';

/** 報酬を払う社だけ sponsored。払わない社に付けると虚偽の開示になる。 */
const rel = (paysUs: boolean) =>
  paysUs ? 'sponsored nofollow noopener noreferrer' : 'nofollow noopener noreferrer';

function diffText(row: Row, result: CompareResult): string {
  // 比較できない行に差額を出したら、比べられるかのように見える。
  if (!row.comparable) return 'NOT COMPARABLE';
  if (result.rowDiffRange) {
    const r = result.rowDiffRange[row.id];
    if (r) return r[0] === 0 && r[1] === 0 ? 'CHEAPEST' : `+${yenRange(r)}`;
  }
  return row.diff === 0 ? 'CHEAPEST' : `+${yen(row.diff)}`;
}

/**
 * 同順位の行を名指しする。**縦の並びに意味が無いことを、その場で言う。**
 * 同額なら rank は同じ数字になる（compare.ts の `rank()`）が、数字が並んでいるだけでは
 * 「上が勝っている」と読まれる。誰と並んでいるのかまで書いて初めて打ち消せる。
 */
function tiedText(row: Row, rows: Row[]): string {
  const others = rows.filter((r) => r.id !== row.id && r.comparable && r.total.low === row.total.low);
  if (!others.length) return '';
  return `tied with ${andList(others.map((r) => r.label))}`
    + ' — the order between them means nothing';
}

function totalText(row: Row, result: CompareResult): string {
  // **比べられない行の総額は出さない。**`Row.total` は費目の合計なので、国際送料が
  // 取れていない行では**最大の費目を欠いた数字**になる。それを揃っている総額の隣に
  // 同じ書式で並べると、いちばん安い行に見える（米国の Neokyo は日本郵便を売って
  // いないので ¥22,100 と出ていた。送料の乗った最安は ¥30,000 台）。
  // 「¥0 と書かず `—` と書く」（Not included in the total — this is not zero）の
  // 総額版。差額側は既に 'NOT COMPARABLE' と言っているので、こちらも黙る。
  if (!row.comparable) return '—';
  if (result.rowTotalRange) {
    const r = result.rowTotalRange[row.id];
    if (r) return `${row.approximate ? '~' : ''}${yenRange(r, true)}`;
  }
  // **`high === null`（上限不明）に偽の上端を書かない**（P1-3、確定仕様5）。
  // 「¥X 〜 ¥Y」ではなく「¥X or more」——なぜ上限が不明かは行を開いた内訳
  // （RowBreakdown）の各行の note で辿れる。
  const interval = totalIntervalText(row.total, true);
  return `${row.approximate ? '~' : ''}${interval}`
    + (row.total.high === null ? ' (upper bound unknown)' : '');
}

/**
 * 画面の主役。**最大の文字は総額ではなく差額。**
 * 差額は総額より確かなので、確かな方を大きく出す。
 * **ただし順位そのものは重量で動く**（docs/DESIGN-NOTES.md §1）。
 * 動く条件では StabilityNote がそう書く。
 */
/** 順位の行が入れ替わったときの滑り（prototypes/README.md の +260ms）。
 *  **順位そのものは遅らせない。**遅らせたら、箱と表が新しい数字で、順位だけ古い
 *  数字を出している時間ができる。動かすのは見た目の位置だけ（FLIP）。 */
export const RANK_SLIDE_MS = 260;

function useRankSlide(listRef: React.RefObject<HTMLOListElement | null>, key: string) {
  const seen = useRef<Map<string, number>>(new Map());
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const lis = Array.from(list.querySelectorAll<HTMLLIElement>('li[data-row-id]'));
    const next = new Map<string, number>();
    for (const li of lis) next.set(li.dataset.rowId ?? '', li.getBoundingClientRect().top);
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!reduce) {
      for (const li of lis) {
        const id = li.dataset.rowId ?? '';
        const from = seen.current.get(id);
        const to = next.get(id);
        if (from == null || to == null || Math.abs(from - to) < 1) continue;
        if (typeof li.animate !== 'function') continue;
        li.animate(
          [{ transform: `translateY(${from - to}px)` }, { transform: 'translateY(0)' }],
          { duration: RANK_SLIDE_MS, easing: 'cubic-bezier(.2,.7,.3,1)' },
        );
      }
    }
    seen.current = next;
  }, [key, listRef]);
}

export function RankBoard({
  result, onFocusMethod,
}: {
  result: CompareResult;
  /** 判定不能のときだけ使う。配送方法の選択欄へ誘導する（下の注参照）。 */
  onFocusMethod?: (() => void) | null;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement | null>(null);
  const rows = result.rows;
  // 並びが変わったときだけ計り直す。開閉で行の高さが変わっても滑らせない。
  useRankSlide(listRef, rows.map((r) => r.id).join(','));
  if (!rows.length) return null;
  const cheapest = rows[0]!;
  const maxDiff = Math.max(0, ...rows.filter((r) => r.comparable).map((r) => r.diff));
  // **判定不能のときはバッジを出さない。**比較可能な全社がおすすめ枠＋同等に
  // 収まっている状態でそれぞれに「Recommended」「Equivalent」を付けると、
  // すぐ上の StabilityNote が「どこを選んでも大差ない・判別できない」と言っている
  // のと矛盾して見える（docs/ROADMAP.md P1「全社が重なったときの表示」）。
  // 判定不能の専用文言だけに語らせる。
  const showBracket = !result.rankIndeterminate;
  const recommendedCount = rows.filter((r) => r.recommended).length;

  return (
    <section aria-label="Ranking">
      {/* **配送方法の選択へ誘導する**（docs/ROADMAP.md P1 確定仕様、判定不能時）。
          `StabilityNote` の1行にこの文を足すと、デスクトップで既に折り返しの余白が
          無く（実測: 892px、900px 中）、1文字でも足せば2行目に溢れて Ranking
          セクションの開始位置ごと画面外へ押し出す（e2e/parcel.spec.ts の
          「順位表が最初の画面から押し出されている」が実測 908 > 900 で落ちた）。
          `rankStabilityNote` は既に「差が不確かさに収まっている・◯◯が最有力」を
          言っている（compare.ts の `indeterminateNote`）ので重複させず、ここでは
          `StabilityNote` の**外**（Ranking セクションの内側・一覧の直前）に
          「配送方法が効く」の1行だけを足す——セクションの開始位置は動かないので
          上の実測の制約を破らない。
          **`<button>` にしない。** `e2e/helpers.ts` の `rankButtons()` は
          「Ranking」領域の中の `role=button` を**行の数だけ**と決め打って
          `readRanking()` を組み立てている（`getByRole('button')`）。ここに
          ボタンを足すと1個多く数えて「row 0 has no approx. total」で全テストが
          落ちる（実測）。`role=link` の `<a>` は数えられないので、リンクにする。 */}
      {result.rankIndeterminate && (
        <p className="pb-2 text-xs text-amber-700 dark:text-amber-400">
          Shipping method moves the total more than company choice does.
          {onFocusMethod && (
            <>
              {' '}
              <a
                href="#ship-by-select"
                onClick={(e) => { e.preventDefault(); onFocusMethod(); }}
                className="underline"
              >
                Change shipping method
              </a>
            </>
          )}
        </p>
      )}
      <ol ref={listRef} className="divide-y divide-neutral-200 dark:divide-neutral-800">
        {rows.map((row) => {
          const isOpen = open === row.id;
          const inBracket = showBracket && row.recommended;
          return (
            <li
              key={row.id}
              data-row-id={row.id}
              className={inBracket ? 'border-l-2 border-emerald-500 dark:border-emerald-400' : ''}
            >
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : row.id)}
                aria-expanded={isOpen}
                className={`flex w-full items-start gap-3 py-3 text-left ${inBracket ? 'pl-2' : ''}`}
              >
                <span className="w-5 shrink-0 pt-0.5 text-sm text-neutral-500 dark:text-neutral-400 num">{row.rank}</span>

                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium">{row.serviceName}</span>
                    {row.variant && (
                      <span className="text-xs text-neutral-500">{row.variant}</span>
                    )}
                    {/* おすすめ枠（P1-2 の recommended/equivalent を初めて画面に出す、P1-3）。
                        1社だけなら「単独1位」、2社なら「どちらでもよい」と分かる文言にする
                        （docs/ROADMAP.md P1 確定仕様2）。枠には最大2社しか入らない。 */}
                    {inBracket && (
                      <span className="inline-flex items-center gap-1 rounded border border-emerald-600 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:border-emerald-500 dark:text-emerald-400">
                        ★ Recommended
                        {recommendedCount === 1 ? ' — sole top pick' : ' — either works'}
                      </span>
                    )}
                    {showBracket && row.equivalent && (
                      <span
                        className="inline-flex items-center gap-1 rounded border border-neutral-400 px-1.5 py-0.5 text-[10px] text-neutral-600 dark:border-neutral-600 dark:text-neutral-400"
                        title="Within the top pick's range, but the recommended box already holds two companies"
                      >
                        Equivalent
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-xs text-neutral-500">{row.tag}</span>
                  {/* 同額は同順位。並びの偶然を順位と読ませない（T26）。 */}
                  {row.tied && (
                    <span className="mt-0.5 block text-xs text-neutral-600 dark:text-neutral-400">
                      {tiedText(row, rows)}
                    </span>
                  )}
                  <span className="mt-0.5 block text-xs text-neutral-500">
                    {row.referralNote ?? 'pays us nothing'}
                  </span>
                  {/* なぜ比べられないのかを、その場に書く。黙って末尾に置かない。 */}
                  {!row.comparable && row.notComparableReason && (
                    <span className="mt-0.5 block text-xs text-amber-700 dark:text-amber-400">
                      {row.notComparableReason}
                    </span>
                  )}
                  {row.excluded.length > 0 && (
                    <span className={`mt-0.5 block text-xs ${tierClass.none}`}>
                      excl. {row.excluded.join(', ').toLowerCase()}
                    </span>
                  )}
                </span>

                {/* 差額が主役。総額はその下に小さく添える。 */}
                <span className="shrink-0 text-right">
                  <span
                    className={`block font-semibold num ${
                      !row.comparable
                        ? 'text-xs text-neutral-500'
                        : row.cheapest
                          ? 'text-lg text-emerald-700 dark:text-emerald-400'
                          : 'text-lg'
                    }`}
                  >
                    {diffText(row, result)}
                  </span>
                  {row.comparable && (
                    <span className="mt-1 block">
                      <DiffBar diff={row.diff} max={maxDiff} />
                    </span>
                  )}
                  <span className="mt-1 block text-xs text-neutral-500 num">
                    approx. total {totalText(row, result)}
                  </span>
                </span>
              </button>

              {isOpen && (
                <div className="pb-4">
                  <RowBreakdown row={row} cheapest={cheapest} />
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <a
                      href={row.outboundUrl}
                      target="_blank"
                      rel={rel(row.paysUs)}
                      className="inline-block rounded bg-neutral-900 px-3 py-1.5 text-xs text-white dark:bg-neutral-100 dark:text-neutral-900"
                    >
                      {row.outboundDirect
                        ? `Open this listing on ${row.serviceName} →`
                        : `Open ${row.serviceName} →`}
                    </a>
                    {/* 直接開けないなら黙って落とさず、何をすることになるかを書く。 */}
                    {!row.outboundDirect && row.itemLinks.length === 0 && (
                      <span className="text-xs text-neutral-500">
                        you will paste the listing URL there
                      </span>
                    )}
                  </div>

                  {/* 複数点のときは出品ごとに直接開けるものを並べる。 */}
                  {row.itemLinks.length > 1 && (
                    <ul className="mt-2 space-y-1">
                      {row.itemLinks.map((l) => (
                        <li key={l.itemId} className="text-xs">
                          <a
                            href={l.url}
                            target="_blank"
                            rel={rel(row.paysUs)}
                            className="underline"
                          >
                            Open “{l.title.slice(0, 48)}” on {row.serviceName} →
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function Summary({ result }: { result: CompareResult }) {
  // 比較できない行を混ぜて「一番安い」と言ってはいけない。
  const rows = result.rows.filter((r) => r.comparable);
  if (rows.length < 2) return null;
  const first = rows[0]!;
  // **同額なら1社を名指ししない。** 総額が同じなら最安は複数あり、そのうち1つを
  // 選んで「これが最安」と書けば、社名の辞書順や宣言順という無根拠な基準で
  // 1社を推したことになる（compare.ts の `rank()`）。
  const leaders = rows.filter((r) => r.cheapest);
  const rest = rows.filter((r) => !r.cheapest).slice(0, 3);
  // **段が割れているときに1社を言い切らない。** 重量不明のとき rows は代表段
  // （真ん中）の順位でしかなく、軽い段では別の社が最安になることがある。
  // 直下の StabilityNote が打ち消していても、一番大きい文が断定していたら嘘になる。
  const midBand = result.bands?.[Math.floor(result.bands.length / 2)];
  const qualify = !result.rankStable && midBand ? ` at ${midBand.label}` : '';
  return (
    <p className="text-sm">
      <strong>
        {leaders.length > 1
          ? `${andList(leaders.map((r) => r.label))} are tied cheapest${qualify}.`
          : `${first.serviceName} is cheapest${qualify}.`}
      </strong>{' '}
      {rest.map((r, i) => (
        <span key={r.id}>
          {/* 重量が不明なときは差額も幅になる。1点に丸めて言い切らない。 */}
          {r.label} costs {result.rowDiffRange?.[r.id]
            ? yenRange(result.rowDiffRange[r.id]!)
            : yen(r.diff)} more{i === rest.length - 1 ? '.' : ', '}
        </span>
      ))}{' '}
      <span className="text-neutral-500">
        approx. total{' '}
        <Amount amount={first.total.low} tier={first.approximate ? 'estimate' : 'fixed'} round />
        {' · '}
        {/* 「fixed <日付>」とだけ出していた頃は、実装日を出典日として名乗る嘘だった。
            出典名と参照日を出し、詳細は Sources の #fx に送る。 */}
        {foreign(first.total.low, result.currency.code, result.currency.rate)} at ¥
        {rateLabel(result.currency.rate)}/{result.currency.code} (ECB reference rate for{' '}
        {result.currency.asOf})
      </span>
    </p>
  );
}
