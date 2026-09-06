'use client';

import { useState } from 'react';
import { Amount, tierClass } from '@/lib/ui/tiers';
import { foreign, yen, yenRange, yenRounded } from '@/lib/ui/format';
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

function totalText(row: Row, result: CompareResult): string {
  if (result.rowTotalRange) {
    const r = result.rowTotalRange[row.id];
    if (r) return `${row.approximate ? '~' : ''}${yenRange(r, true)}`;
  }
  return `${row.approximate ? '~' : ''}${yenRounded(row.total)}`;
}

/**
 * 画面の主役。**最大の文字は総額ではなく差額。**
 * 差額は総額より確かなので、確かな方を大きく出す。
 * **ただし順位そのものは重量で動く**（docs/DESIGN-NOTES.md §1）。
 * 動く条件では StabilityNote がそう書く。
 */
export function RankBoard({ result }: { result: CompareResult }) {
  const [open, setOpen] = useState<string | null>(null);
  const rows = result.rows;
  if (!rows.length) return null;
  const cheapest = rows[0]!;
  const maxDiff = Math.max(0, ...rows.filter((r) => r.comparable).map((r) => r.diff));

  return (
    <section aria-label="Ranking">
      <ol className="divide-y divide-neutral-200 dark:divide-neutral-800">
        {rows.map((row) => {
          const isOpen = open === row.id;
          return (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : row.id)}
                aria-expanded={isOpen}
                className="flex w-full items-start gap-3 py-3 text-left"
              >
                <span className="w-5 shrink-0 pt-0.5 text-sm text-neutral-500 dark:text-neutral-400 num">{row.rank}</span>

                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium">{row.serviceName}</span>
                    {row.variant && (
                      <span className="text-xs text-neutral-500">{row.variant}</span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-xs text-neutral-500">{row.tag}</span>
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
  const rest = rows.slice(1, 4);
  // **段が割れているときに1社を言い切らない。** 重量不明のとき rows は代表段
  // （真ん中）の順位でしかなく、軽い段では別の社が最安になることがある。
  // 直下の StabilityNote が打ち消していても、一番大きい文が断定していたら嘘になる。
  const midBand = result.bands?.[Math.floor(result.bands.length / 2)];
  const qualify = !result.rankStable && midBand ? ` at ${midBand.label}` : '';
  return (
    <p className="text-sm">
      <strong>{first.serviceName} is cheapest{qualify}.</strong>{' '}
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
        <Amount amount={first.total} tier={first.approximate ? 'estimate' : 'fixed'} round />
        {' · '}
        {foreign(first.total, result.currency.code, result.currency.rate)} at ¥
        {result.currency.rate}/{result.currency.code} (fixed {result.currency.asOf})
      </span>
    </p>
  );
}
