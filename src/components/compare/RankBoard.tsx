'use client';

import { useState } from 'react';
import { Amount, tierClass } from '@/lib/ui/tiers';
import { foreign, yen, yenRange, yenRounded } from '@/lib/ui/format';
import type { CompareResult, Row } from '@/lib/pricing/types';
import { DiffBar } from './DiffBar';
import { RowBreakdown } from './RowBreakdown';

function diffText(row: Row, result: CompareResult): string {
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
 * 重量を1/3〜5倍に外しても順位は動かないが総額は −19%〜+85% 動く
 * （docs/DESIGN-NOTES.md §1）。確かな方を大きく出す。
 */
export function RankBoard({ result }: { result: CompareResult }) {
  const [open, setOpen] = useState<string | null>(null);
  const rows = result.rows;
  if (!rows.length) return null;
  const cheapest = rows[0]!;
  const maxDiff = rows[rows.length - 1]!.diff;

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
                  {row.excluded.length > 0 && (
                    <span className={`mt-0.5 block text-xs ${tierClass.none}`}>
                      excl. {row.excluded.join(', ').toLowerCase()}
                    </span>
                  )}
                </span>

                {/* 差額が主役。総額はその下に小さく添える。 */}
                <span className="shrink-0 text-right">
                  <span
                    className={`block text-lg font-semibold num ${
                      row.cheapest ? 'text-emerald-700 dark:text-emerald-400' : ''
                    }`}
                  >
                    {diffText(row, result)}
                  </span>
                  <span className="mt-1 block">
                    <DiffBar diff={row.diff} max={maxDiff} />
                  </span>
                  <span className="mt-1 block text-xs text-neutral-500 num">
                    approx. total {totalText(row, result)}
                  </span>
                </span>
              </button>

              {isOpen && (
                <div className="pb-4">
                  <RowBreakdown row={row} cheapest={cheapest} />
                  <a
                    href={row.outboundUrl}
                    target="_blank"
                    rel={row.paysUs ? 'sponsored nofollow noopener noreferrer' : 'nofollow noopener noreferrer'}
                    className="mt-3 inline-block rounded bg-neutral-900 px-3 py-1.5 text-xs text-white dark:bg-neutral-100 dark:text-neutral-900"
                  >
                    Open {row.serviceName} →
                  </a>
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
  const rows = result.rows;
  if (rows.length < 2) return null;
  const first = rows[0]!;
  const rest = rows.slice(1, 4);
  return (
    <p className="text-sm">
      <strong>{first.serviceName} is cheapest.</strong>{' '}
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
