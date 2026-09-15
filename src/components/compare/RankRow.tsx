'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { andList } from '@/lib/pricing/compare';
import { methodLabel } from '@/lib/ui/methodLabel';
import { yen } from '@/lib/ui/format';
import type { CompareResult, Row } from '@/lib/pricing/types';
import { DeliveryLog } from './DeliveryLog';
import { Flap } from './Flap';
import { Mark } from './Popover';
import { WeightNeedle } from './WeightNeedle';
import { dayBounds, dayPct, leadWord, totBarPcts, totalParts } from './mockFormat';
import type { Item, ProvinceCode } from '@/lib/pricing/types';

export interface BoardCtx {
  uniform: boolean;
  maxDiff: number;
  hiMax: number;
  showBracket: boolean;
  first: Row | undefined;
  /** default 行 id → その社の consolidated 行の総額差（「combine before shipping」の注意）。 */
  consol: Record<string, { save: number; unknown: boolean; name: string }>;
  /** 行 id → 対になる行の箱数（Buyee の 1⇄N）。 */
  pairs: Record<string, number>;
  /** 1位の札の横に出す秤の針の本文。決め手の重量が無ければ null。 */
  wobble: ReactNode | null;
  items: readonly Item[];
  province: ProvinceCode | null;
}

/** 総額（Mock `totalHTML`）。比べられない行は `—`。 */
export function TotalText({ row, className = 'tot' }: { row: Row; className?: string }) {
  if (!row.comparable) return <span className={`${className} none`} aria-label="no comparable total">—</span>;
  const p = totalParts(row);
  return (
    <span className={className} data-tier={row.approximate ? 'estimate' : 'fixed'} aria-label={p.aria}>
      <span aria-hidden="true">{p.vis}</span>
    </span>
  );
}

/** 総額の不確かさの棒（Mock `totBarHTML`）。全行が同じ 0..hiMax の物差し。 */
export function TotBar({ row, hiMax, className = 'totbar' }: { row: Row; hiMax: number; className?: string }) {
  if (!row.comparable || !hiMax) return null;
  const { lowPct, hiPct, unbounded } = totBarPcts(row, hiMax);
  return (
    <span
      className={className}
      aria-hidden="true"
      data-testid="total-bar"
      data-upper-unknown={unbounded ? 'true' : 'false'}
    >
      <i className={`hi${unbounded ? ' unb' : ''}`} style={{ width: `${hiPct}%` }} data-testid={unbounded ? 'total-bar-open-end' : undefined} />
      <i className="lo" style={{ width: `${lowPct}%` }} data-testid="total-bar-track" />
    </span>
  );
}

/**
 * 到着日数の棒（Mock `dayBarHTML`）。実線＝公表された日数、点線（長さ無し）＝日数が
 * 一次情報で数値化できていない（宅配便の自称・"a week or less"・月表記）、赤い輪＝追跡なし。
 * 両端は `Row.days.minDays/maxDays`（構造化フィールド）だけから決める——Mock が便名の
 * 括弧書きを正規表現で読んで破線にしていた宅配便の日数は、確度の無い数字なので描かない。
 */
function DayBar({ row }: { row: Row }) {
  const d = row.days;
  const bounds = dayBounds(d);
  if (!bounds) {
    return (
      <span className="daybar np" aria-hidden="true" data-testid="arrival-bar-track-wrap">
        <span className="track" data-testid="arrival-bar-track" />
        <span className="fill" data-testid="arrival-bar-segment" data-style="dotted" style={{ left: 0, width: '100%' }} />
        {!d.tracked && <span className="oring" data-testid="arrival-bar-end" data-end="untracked" style={{ left: '100%' }} />}
      </span>
    );
  }
  const loPct = dayPct(bounds.lo);
  const hiPct = Math.max(loPct + 3, dayPct(bounds.hi));
  return (
    <>
      <span className="daybar" aria-hidden="true">
        <span className="track" data-testid="arrival-bar-track" />
        <span
          className="fill"
          data-testid="arrival-bar-segment"
          data-style="solid"
          style={{ left: `${loPct}%`, width: `${hiPct - loPct}%` }}
        />
        {!d.tracked && <span className="oring" data-testid="arrival-bar-end" data-end="untracked" style={{ left: `${hiPct}%` }} />}
      </span>
      <span className="tag" style={{ fontSize: 10 }}>{d.text}</span>
    </>
  );
}

export function RankRow({
  row, result, ctx, open, onToggle, onProvince,
}: {
  row: Row;
  result: CompareResult;
  ctx: BoardCtx;
  open: boolean;
  onToggle: () => void;
  onProvince: DeliveryLogProps['onProvince'];
}) {
  const isFirst = row.comparable && row.cheapest;
  const lw = leadWord(row, result.rankIndeterminate);
  // 札は「1位が決まった」ときだけ押される（Mock `stamp.press`）。
  const stampKey = `${row.id}:${lw}`;
  const seenStamp = useRef<string | null>(null);
  const stampRef = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (!isFirst) return;
    if (seenStamp.current !== stampKey) {
      seenStamp.current = stampKey;
      const el = stampRef.current;
      if (el) { el.classList.remove('press'); void el.offsetWidth; el.classList.add('press'); }
    }
  }, [isFirst, stampKey]);

  const diffCell = !row.comparable
    ? <Flap text="NOT RANKED" className="diff nr" />
    : row.diff === 0
      ? <Flap text={result.rankIndeterminate ? 'LEADS' : '1ST'} className="diff lead" />
      : <Flap text={`+${yen(row.diff)}`} className="diff" />;

  const barUnbounded = row.comparable && row.total.high === null;
  const barFuzzy = row.comparable && result.rankIndeterminate
    && (row.cheapest || row.diff / (result.rows[0]?.total.low || 1) < 0.02);
  const inBracket = ctx.showBracket && (row.recommended || row.equivalent);
  const pairN = ctx.pairs[row.id];
  const mi = { label: methodLabel(row.method), days: row.days.text, tracked: row.days.tracked };

  const cav: ReactNode[] = [];
  if (row.tied) {
    const others = result.rows.filter((x) => x.id !== row.id && x.comparable && x.total.low === row.total.low).map((x) => x.label);
    cav.push(<p key="tied"><span className="bang" aria-hidden="true">!</span><span>Tied with {andList(others)} — the order between them means nothing.</span></p>);
  }
  if (!row.comparable) {
    cav.push(<p key="nr"><span className="bang" aria-hidden="true">!</span><span><b>Not ranked:</b> {row.notComparableReason}.</span></p>);
  }
  const c = ctx.consol[row.id];
  if (c) {
    cav.push(<p key="consol"><span className="bang" aria-hidden="true">!</span><span>Ask {c.name} to combine before shipping: saves about {yen(c.save)}{c.unknown ? ' (their fee for combining is unpublished)' : ''}.</span></p>);
  }
  if (row.comparable && !ctx.uniform && !mi.tracked) {
    const f = ctx.first;
    cav.push(<p key="utk"><span className="bang" aria-hidden="true">!</span><span>Untracked — {mi.days}.{f && f.id !== row.id ? '' : ' Cheapest, but you can’t follow the parcel.'}</span></p>);
  }

  const exList = row.comparable ? row.excluded : [];
  const exLine = exList.length === 0 ? null : exList.length <= 2
    ? <p className="exline">{exList.map((x) => `+ ${x}`).join(' · ')}</p>
    : (
      <p className="exline">
        +{exList.length} unpriced{' '}
        <Mark title="What is missing" body={<ul style={{ margin: '2px 0 0 16px', padding: 0 }}>{exList.map((x) => <li key={x}>{x}</li>)}</ul>} />
      </p>
    );

  const boxCell = pairN != null ? (
    <span
      className="c-box boxpair"
      data-testid="box-count"
      data-pair="true"
      aria-label={`${row.boxes.length === 1 ? '1 box' : `${row.boxes.length} boxes`}, or ${pairN} if combined`}
    >
      1<span className="ar" aria-hidden="true">⇄</span>{Math.max(row.boxes.length, pairN)}
    </span>
  ) : (
    <span className="c-box" data-testid="box-count" data-pair="false">
      {row.boxes.length === 1 ? '1 box' : `${row.boxes.length} boxes`}
    </span>
  );

  return (
    <li
      className={`row ${isFirst ? 'first' : ''} ${row.comparable ? '' : 'unranked'} ${inBracket ? 'bracket' : ''} ${pairN != null ? 'boxtie' : ''}`}
      data-row-id={row.id}
      data-open={open}
      data-indeterminate-group={result.rankIndeterminate && (row.recommended || row.equivalent) ? 'true' : undefined}
    >
      {isFirst && (
        <>
          <span className="stamp" ref={stampRef} aria-hidden="true">
            {lw === 'ESTIMATED CHEAPEST' ? <><small>estimated</small>cheapest</> : lw}
          </span>
          {ctx.wobble && <WeightNeedle body={ctx.wobble} label="This weight decides 1st place" />}
        </>
      )}
      <button type="button" className="rh" aria-expanded={open} aria-controls={`log-${row.id}`} onClick={onToggle}>
        <span className="c-rank" data-testid="row-rank">
          {row.comparable ? String(row.rank).padStart(2, '0') : '—'}
          {isFirst && <span className="sr">{lw}</span>}
        </span>
        <span className="c-svc" data-testid="row-service">
          <span className="svc">{row.serviceName}{row.variant && <small>{row.variant}</small>}</span>
        </span>
        {row.comparable ? (
          <span
            className="c-ship"
            data-testid="arrival-bar"
            data-published={row.days.tier === 'fixed' ? 'true' : 'false'}
            data-tracked={row.days.tracked ? 'true' : 'false'}
            role="img"
            aria-label={`Ships by ${mi.label} — ${row.days.text}${row.days.tracked ? '' : ', untracked'}${dayBounds(row.days) ? '' : ' (transit time not published as a figure)'}`}
          >
            <span className="m">{mi.label}</span>
            <DayBar row={row} />
          </span>
        ) : (
          <span className="c-ship" />
        )}
        {boxCell}
        <span className="c-diff" data-testid="row-diff">
          {diffCell}
          {row.comparable && (
            <span className={`dbar${barUnbounded ? ' unb' : ''}${barFuzzy ? ' fuzzy' : ''}`} aria-hidden="true">
              <i style={{ width: `${barFuzzy ? 100 : Math.round((100 * row.diff) / ctx.maxDiff)}%` }} />
            </span>
          )}
        </span>
        <span className="c-tot" data-testid="row-total">
          <TotalText row={row} />
          <TotBar row={row} hiMax={ctx.hiMax} />
        </span>
        <span className="chev" aria-hidden="true">›</span>
      </button>
      {exLine}
      <div className="cav">{cav}</div>
      {open && <DeliveryLog row={row} result={result} first={ctx.first} items={ctx.items} province={ctx.province} onProvince={onProvince} />}
    </li>
  );
}

type DeliveryLogProps = Parameters<typeof DeliveryLog>[0];
