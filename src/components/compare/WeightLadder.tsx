'use client';

import { useEffect, useRef } from 'react';
import { EMS_TABLE, emsStepGrams, emsYen, formatStep } from '@/lib/pricing/ems';
import { yen } from '@/lib/ui/format';

/**
 * EMS の段の目盛り。**段は `EMS_TABLE` から生成する。手で書かない。**
 * 現在段の塗りは「その段の中でどこまで重量が来たか」。**体積ではない。**
 * 表の外（30kg 超）は表の最上段に丸めず、`···` の先の別の段として出し、
 * 料金は持っていないので `—`（0 とは書かない）。
 */

export type Rung =
  | {
      kind: 'step';
      /** EMS_TABLE の添字。 */
      index: number;
      /** 段の上限（g）。 */
      grams: number;
      /** その帯の料金。 */
      yen: number;
      state: 'past' | 'now' | 'next';
      /** now のときだけ 0〜1。段の中の重量の進み。 */
      fill: number;
    }
  | { kind: 'gap' }
  | {
      kind: 'over';
      /** 表の外。料金は公表が無いので null。 */
      yen: null;
      state: 'now';
    };

/** 段の下限（g）。最初の段の下は 0。 */
export function stepLowerGrams(index: number): number {
  if (index <= 0) return 0;
  return emsStepGrams(index - 1);
}

/** 段の中の進み（0〜1）。**段の境界ちょうどは 1（その段を満たし切った）。** */
export function stepFill(grams: number, index: number): number {
  const low = stepLowerGrams(index);
  const up = emsStepGrams(index);
  if (up <= low) return 0;
  return Math.min(1, Math.max(0, (grams - low) / (up - low)));
}

/** 描画する段の並び。**表の全段 + 表の外の1段。** */
export function ladderRungs({
  stepIndex,
  overMax = false,
  zone,
  grams,
}: {
  stepIndex: number;
  overMax?: boolean;
  zone: number;
  grams: number;
}): Rung[] {
  const rungs: Rung[] = EMS_TABLE.map((row, i) => {
    // 表の外に出たら、表の段はすべて通り過ぎた段になる。最上段を「現在段」にしない。
    const state: 'past' | 'now' | 'next' = overMax
      ? 'past'
      : i < stepIndex
        ? 'past'
        : i === stepIndex
          ? 'now'
          : 'next';
    return {
      kind: 'step' as const,
      index: i,
      grams: row[0]!,
      yen: emsYen(i, zone),
      state,
      fill: state === 'now' ? stepFill(grams, i) : state === 'past' ? 1 : 0,
    };
  });
  if (overMax) {
    rungs.push({ kind: 'gap' }, { kind: 'over', yen: null, state: 'now' });
  }
  return rungs;
}

export function WeightLadder({
  stepIndex,
  overMax = false,
  zone,
  grams,
  className = '',
}: {
  stepIndex: number;
  overMax?: boolean;
  zone: number;
  grams: number;
  className?: string;
}) {
  const rungs = ladderRungs({ stepIndex, overMax, zone, grams });
  const listRef = useRef<HTMLOListElement | null>(null);
  const nowRef = useRef<HTMLLIElement | null>(null);

  // 現在段を視界に入れる。42段あるので、探させない。
  // **目盛りの中だけを動かす。** scrollIntoView() は祖先も動かすので、ページ全体が
  // 勝手にスクロールし、順位表の上に置いたはずの開示が画面から押し出される
  // （e2e/compare.spec.ts の 19・24 がそれを掴んだ）。ここは自分の中だけを送る。
  useEffect(() => {
    const list = listRef.current;
    const now = nowRef.current;
    if (!list || !now) return;
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const behavior: ScrollBehavior = reduce ? 'auto' : 'smooth';
    // 縦積み（sm 以上）と横並び（モバイル）の両方があるので、両軸を送る。
    const top = now.offsetTop - list.clientHeight / 2 + now.clientHeight / 2;
    const left = now.offsetLeft - list.clientWidth / 2 + now.clientWidth / 2;
    list.scrollTo({ top: Math.max(0, top), left: Math.max(0, left), behavior });
  }, [stepIndex, overMax]);

  return (
    <div className={className}>
      <h3 className="mb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-neutral-600 dark:text-neutral-400">
        EMS steps
      </h3>
      {/* **スクロールする領域はキーボードで届かなければならない**（WCAG 2.1.1）。
          42段あってスクロールするので、tabIndex と名前を持たせて焦点を当てられるようにする。
          axe の scrollable-region-focusable がここを serious で掴む。 */}
      <ol
        ref={listRef}
        data-testid="weight-ladder"
        tabIndex={0}
        aria-label="EMS weight steps"
        className="flex max-h-64 flex-row overflow-auto rounded-sm outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-700 sm:max-h-72 sm:flex-col dark:focus-visible:outline-neutral-300"
      >
        {rungs.map((rung) => {
          if (rung.kind === 'gap') {
            return (
              <li
                key="gap"
                aria-hidden="true"
                className="shrink-0 px-2 py-1 text-center tracking-[0.3em] text-neutral-500 dark:text-neutral-400"
              >
                ···
              </li>
            );
          }
          const isNow = rung.state === 'now';
          const over = rung.kind === 'over';
          const text = over ? 'Over 30 kg' : formatStep(rung.grams);
          const price = over ? '—' : yen(rung.yen);
          return (
            <li
              key={over ? 'over' : `s${rung.index}`}
              ref={isNow ? nowRef : undefined}
              data-testid="ladder-rung"
              data-state={rung.state}
              aria-current={isNow ? 'step' : undefined}
              className={[
                'relative flex shrink-0 flex-col items-start gap-0 border-b border-dotted border-neutral-300 px-2 py-1 text-xs tabular-nums sm:flex-row sm:items-baseline sm:justify-between sm:gap-2 dark:border-neutral-700',
                isNow
                  ? 'font-semibold text-neutral-900 dark:text-neutral-100'
                  : rung.state === 'past'
                    ? 'text-neutral-500 dark:text-neutral-500'
                    : 'text-neutral-600 dark:text-neutral-400',
              ].join(' ')}
            >
              {isNow ? (
                // 現在段の印。色だけに頼らず、左（モバイルは上）に棒を立てる。
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 top-0 h-[3px] bg-red-600 sm:inset-y-0 sm:left-[-10px] sm:right-auto sm:h-auto sm:w-[3px] dark:bg-red-400"
                />
              ) : null}
              {isNow && !over ? (
                // 段の中の重量の進み。**箱の中身の詰まり具合ではない。**
                <span
                  aria-hidden="true"
                  data-testid="ladder-fill"
                  className="absolute inset-y-0 left-0 -z-10 bg-red-100 transition-[width] duration-500 motion-reduce:transition-none dark:bg-red-950"
                  style={{ width: `${Math.round(rung.fill * 100)}%` }}
                />
              ) : null}
              <span>{text}</span>
              <span className={over ? 'text-neutral-500 dark:text-neutral-400' : undefined}>
                {price}
              </span>
            </li>
          );
        })}
      </ol>
      {overMax ? (
        <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">
          Above the published EMS table — no postage figure exists for this weight.
        </p>
      ) : null}
    </div>
  );
}
