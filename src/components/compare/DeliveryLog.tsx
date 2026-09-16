'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { track } from '@/lib/analytics/events';
import { CA_PROVINCE_AVERAGE_RATE } from '@/lib/pricing/countries';
import { methodLabel } from '@/lib/ui/methodLabel';
import { TRACKED, UNTRACKED, methodDisplay, methodRawNote } from '@/lib/ui/methodDisplay';
import { foreign, yen } from '@/lib/ui/format';
import type { CompareResult, Item, ProvinceCode, Row } from '@/lib/pricing/types';
import { BoxArt } from './BoxArt';
import { Mark } from './Popover';
import { ProvinceOptions } from './Waybill';
import {
  REASON, STAGES, boxWord, dutyText, kg, lineAmount, stageOf, totalParts, vatText,
} from './mockFormat';

/** 報酬を払う社だけ sponsored。払わない社に付けると虚偽の開示になる。 */
const rel = (paysUs: boolean) =>
  paysUs ? 'sponsored nofollow noopener noreferrer' : 'nofollow noopener noreferrer';

function reduceMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * 箱の絵（Mock `packHTML`）。**箱は絵であって梱包の計算ではない。**
 * 分割は箱と箱の間の線種で言う（破線＝重量上限、点線＝店が不明、実線＝別の店）。
 */
function Pack({ row, items }: { row: Row; items: readonly Item[] }) {
  const bs = row.boxes;
  const n = bs.length;
  const root = useRef<HTMLDivElement | null>(null);
  const sig = `${row.id}|${bs.map((b) => `${b.weightG}:${b.itemIndices.join(',')}`).join('/')}`;

  // 品が上から落ちて箱に入り、分割なら2箱目が横へ滑り出る（Mock `animatePack`）。
  useLayoutEffect(() => {
    const pack = root.current;
    if (!pack || reduceMotion()) return;
    const figs = [...pack.querySelectorAll<HTMLElement>('.bx')];
    const its = [...pack.querySelectorAll<SVGGElement>('.it')].sort((a, b) => Number(a.dataset.i) - Number(b.dataset.i));
    if (typeof figs[0]?.animate !== 'function') return;
    const T0 = 250;
    const STEP = Math.min(440, 2400 / Math.max(1, its.length));
    const DROP = 410;
    const tEnd = T0 + STEP * Math.max(0, its.length - 1) + DROP;
    its.forEach((g, i) => {
      const d = T0 + i * STEP;
      g.animate([{ transform: 'translateY(-64px)', opacity: 0 }, { opacity: 1, offset: 0.3 }, { transform: 'translateY(0)', opacity: 1 }],
        { duration: DROP, delay: d, easing: 'cubic-bezier(.5,0,.9,.6)', fill: 'backwards' });
      g.closest('.bxart')?.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(2px)' }, { transform: 'translateY(0)' }],
        { duration: 220, delay: d + DROP, easing: 'ease-out' });
    });
    const split = figs.length > 1;
    const tCap = split ? tEnd + 1100 : tEnd;
    figs.forEach((f) => f.querySelector('figcaption')?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, delay: tCap, fill: 'backwards' }));
    if (split) {
      const x0 = figs[0]!.getBoundingClientRect().left;
      figs.slice(1).forEach((f) => {
        const dx = x0 - f.getBoundingClientRect().left;
        f.animate([{ transform: `translateX(${dx}px)` }, { transform: `translateX(${dx}px)`, offset: (tEnd + 500) / (tEnd + 1060) }, { transform: 'translateX(0)' }],
          { duration: tEnd + 1060, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
        f.querySelectorAll('.shell').forEach((s) => s.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: tEnd + 420, fill: 'backwards' }));
      });
    }
  }, [sig]);

  if (!n) return null;
  const why = bs[0]!.reason;
  const k = why === 'per-listing' ? 0.78 : 1;
  const big = Math.max(...bs.map((b) => b.weightG));
  return (
    <div className="pack" data-why={why} data-testid="pack" ref={root}>
      <span className="lbl pk-note">
        {boxWord(n)} · {REASON[why]}{' '}
        <Mark
          title="Boxes are illustrative"
          body={<p>The box is a picture, not a packing simulation. Pale dashed items = weights we estimated; solid = weights you entered. Weight shown is after our packing allowance. The bar under each box is relative to the heaviest box; the method&rsquo;s weight limit is not in our data, so it is not drawn. The line between boxes: dashed = split to fit the method&rsquo;s weight limit, dotted = shop unknown so not combined, solid = a different shop.</p>}
        />
      </span>
      <div className="pk-row">
        {bs.map((b, i) => (
          <figure
            key={i}
            className={`bx bxsep-${i === 0 ? 'first' : b.reason === 'weight-limit' ? 'wl' : b.reason === 'unresolved-shop' ? 'un' : 'shop'}`}
            data-testid="split-box"
            data-reason={b.reason}
            data-duty-kind={b.tax.duty.kind}
            data-vat-kind={b.tax.vat.kind}
          >
            <div className="bxart"><BoxArt box={b} items={items} k={k} /></div>
            <figcaption>
              <span className="bxw">{kg(b.weightG)}</span>
              <span className="gauge" aria-hidden="true">
                <i style={{ width: `${(100 * b.weightG) / big}%` }} />
                {[25, 50, 75].map((v) => <s key={v} style={{ left: `${v}%` }} />)}
              </span>
              <span data-testid="split-box-reason">
                {b.itemIndices.length} item{b.itemIndices.length === 1 ? '' : 's'}{b.reason !== why ? ` · ${REASON[b.reason]}` : ''}
              </span>
              <br />
              <span data-testid="split-box-declared">declared {yen(b.declaredYen)}</span>
              {(n > 1 || b.tax.duty.kind !== 'rate') && (
                <> · <span data-testid="split-box-duty">{dutyText(b.tax.duty)}</span> · <span data-testid="split-box-vat">{vatText(b.tax.vat)}</span></>
              )}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

/**
 * 配達ログ（Mock `logHTML`）。行を開くと出る。費目を Bought → Warehouse → Packed →
 * Export → Import → (Other) → Door の段に分け、1位以外の行では1位との差を右端に出す。
 * `role="table"`/`row`/`cell` は見た目の grid に表の意味を残すため（e2e も表として読む）。
 */
export function DeliveryLog({
  row, result, first, items, province, onProvince,
}: {
  row: Row;
  result: CompareResult;
  first: Row | undefined;
  items: readonly Item[];
  province: ProvinceCode | null;
  onProvince: ((p: ProvinceCode | null) => void) | null;
}) {
  const cmp = first && first.id !== row.id && row.comparable ? first : null;
  const byKey = cmp ? new Map(cmp.lines.map((l) => [l.key, l])) : null;
  const groups: Record<string, typeof row.lines> = {};
  for (const [k] of STAGES) groups[k] = [];
  for (const l of row.lines) groups[stageOf(l.key)]!.push(l);
  // 方式名・日数・追跡の言い回しは `methodDisplay.ts` の1箇所から出す。エンジンの
  // `row.days.text` は宅配便で内部語（'not yet modeled'）になるうえ、郵便でも社ごとの
  // 原文のままなので、画面の中で Ship by・順位ボードと字が食い違っていた。
  const daysText = methodDisplay(row.method).days;
  const mi = { label: methodLabel(row.method), days: daysText, tracked: row.days.tracked };
  const avg = `${(CA_PROVINCE_AVERAGE_RATE * 100).toFixed(1)}%`;

  const stages = STAGES.filter(([k]) => k !== 'other' || groups.other!.length).map(([k, name], si) => {
    const ls = groups[k]!;
    const sub = ls.reduce((s, l) => s + (l.amount ?? 0), 0);
    const openEnd = ls.some((l) => l.amount == null && l.unknownCapYen == null);
    let body: ReactNode[] = ls.map((l) => {
      const a = lineAmount(l);
      const o = byKey?.get(l.key);
      const v1 = cmp
        ? (l.amount != null && o?.amount != null && l.amount !== o.amount
          ? `${l.amount > o.amount ? '+' : '−'}${yen(Math.abs(l.amount - o.amount))}`
          : (!o ? 'only here' : ''))
        : '';
      const notes = [l.note, l.rangeNote, l.unknownReason, a.note].filter(Boolean) as string[];
      const uncapped = l.amount == null && l.unknownCapYen == null;
      const note = (
        <>
          {notes.map((t, i) => <p key={i}>{t}</p>)}
          {uncapped && <p>No upper bound — this is what leaves the total open-ended.</p>}
          {l.key === 'intl-shipping' && (
            <p data-testid="intl-days">Arrival: {daysText}{row.days.tracked ? '' : ` — ${UNTRACKED}`}</p>
          )}
          {l.sourceUrl && <p><a href={l.sourceUrl} target="_blank" rel="noopener noreferrer">Source →</a></p>}
        </>
      );
      return (
        <div key={l.key}>
          {/* `fixed` は Tailwind の `position:fixed` と衝突するので class には出さない（Mock に `.ln.fixed` の規則は無い）。 */}
          <div className={`ln${a.cls === 'fixed' ? '' : ` ${a.cls}`}`} role="row" data-cost-key={l.key} data-tier={l.tier}>
            <span className="l" role="cell">{l.label}</span>
            <span className="lead" aria-hidden="true" />
            <span className="t">{a.tag} <Mark title={l.label} body={note} /></span>
            <span className="a" role="cell">{a.txt}</span>
            <span className="v1" role="cell">{v1}</span>
          </div>
          {/* 整形した表示名の横に、社の原文（`labelRaw`）をそのまま残す——
              読みやすさのために整えた名前が、原文を消してしまわないように。 */}
          {l.key === 'intl-shipping' && (
            <p className="lnote" data-testid="intl-line-note">
              {mi.label} · {mi.days} · {mi.tracked ? TRACKED : UNTRACKED} · {methodRawNote(row.method)}
            </p>
          )}
          {l.key === 'province-tax' && onProvince && (
            <label className="provpick">
              Pick your province{' '}
              <select aria-label="Province" value={province ?? ''} onChange={(e) => onProvince(e.target.value === '' ? null : (e.target.value as ProvinceCode))}>
                <ProvinceOptions avg={avg} />
              </select>
            </label>
          )}
        </div>
      );
    });
    if (k === 'packed') {
      body = [<Pack key="pack" row={row} items={items} />, ...body];
      if (!ls.length && !row.boxes.length) body = [<p key="np" className="lnote">No packing fee.</p>];
    }
    if (k === 'export' && row.surface) {
      const sy = row.surface.shipYen;
      body.push(
        <div className="ln surf" role="row" key="surf" data-testid="surface-alternative">
          <span className="l" role="cell">Can wait {row.surface.days}? {row.surface.label}</span>
          <span className="lead" aria-hidden="true" />
          <span className="t">not ranked <Mark title="Surface option" body={<><p>{row.surface.note}.</p><p>Shipping alone, not a full total.</p></>} /></span>
          <span className="a" role="cell">{sy.high === null ? `${yen(sy.low)}+` : sy.high === sy.low ? yen(sy.low) : `${yen(sy.low)} – ${yen(sy.high).slice(1)}`}</span>
          <span className="v1" role="cell" />
        </div>,
      );
    }
    if (k === 'door') {
      const tp = row.comparable ? totalParts(row) : null;
      body = [
        <div className="door" key="door">
          <span className="lbl">
            {row.comparable
              // **2026-09-15、着地総額の断定をやめた（文言のみ）。**`Results.tsx` の
              // 「1st, known and estimated charges」と揃える。未取得の費目（Zonos 利用料・
              // `not published` の売上税）がある以上、着地総額だとは言い切れない。
              // 上限が無い分岐も同じ言い方に揃える。
              ? (row.total.high === null
                ? 'Known and estimated charges · no upper bound'
                : 'Known and estimated charges · your destination may add more')
              : 'No comparable total — the largest cost is missing'}
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
            <span className="v" aria-label={tp?.aria} data-testid="door-total">
              {tp ? <span aria-hidden="true">{tp.vis}{tp.plus && <span className="plus">+</span>}</span> : '—'}
            </span>
            {tp && <span className="fx">{foreign(row.total.low, result.currency.code, result.currency.rate)} at ECB rate of {result.currency.asOf}</span>}
          </span>
        </div>,
        <div className="out" key="out">
          {/* ファネル3段目・**最重要**。押されたことだけを送る——どの社を押したかも、
              その行の URL も送らない（`src/lib/analytics/events.ts`）。`sendBeacon` なので
              新しいタブが開いてもこの1件は落ちない。 */}
          <a
            className="go"
            href={row.outboundUrl}
            target="_blank"
            rel={rel(row.paysUs)}
            onClick={() => track('outbound')}
          >
            {row.outboundDirect ? `Open this listing at ${row.serviceName} →` : `Open at ${row.serviceName} →`}
          </a>
          <span className={`ref ${row.paysUs ? 'pays' : ''}`}>{row.referralNote ?? 'pays us nothing'} · never moves a row</span>
          {!row.outboundDirect && row.itemLinks.length === 0 && <span className="wsrc">you will paste the listing URL there</span>}
          {row.itemLinks.length > 1 && (
            <ul>
              {row.itemLinks.map((l) => (
                <li key={l.itemId}>
                  <a href={l.url} target="_blank" rel={rel(row.paysUs)} onClick={() => track('outbound')}>Open <span className="jp">“{l.title.slice(0, 40)}”</span> at {row.serviceName} →</a>
                </li>
              ))}
            </ul>
          )}
        </div>,
      ];
    }
    const subTxt = k === 'door' ? '' : k === 'packed' && !ls.length ? '' : `${yen(sub)}${openEnd ? '+' : ''}`;
    return (
      <li className={`stage ${k}`} key={k} role="presentation">
        <div className="rail" aria-hidden="true"><span className="node" /><span className="lk" /></div>
        <div className="sbody">
          <h3 className="sname"><span><small>{String(si + 1).padStart(2, '0')}</small>{name}</span><span className="num">{subTxt}</span></h3>
          {k === 'bought' && cmp && (
            <div className="lhead lbl" aria-hidden="true"><span /><span /><span className="r">{row.serviceName}</span><span className="r">vs {cmp.serviceName}</span></div>
          )}
          {body.length ? body : (k === 'door' ? null : <p className="lnote">Nothing charged here.</p>)}
        </div>
      </li>
    );
  });

  return (
    <div className="log" id={`log-${row.id}`} role="table" aria-label={`Delivery log · ${row.label}`}>
      <div className="login">
        <div className="loghead">
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="lbl">Delivery log · {row.label} · {boxWord(row.boxes.length)}</span>
            <span className="tag">{row.tag.split(' · ').filter((t) => t !== 'you must request this').join(' · ')}</span>
            <span className={`ref ${row.paysUs ? 'pays' : ''}`}>{row.referralNote ?? 'pays us nothing'} · never moves a row</span>
          </span>
          <span className="legend">
            <span><i />published</span>
            <span className="e"><i />estimate</span>
            <span className="u"><i />second-hand</span>
            <span className="n" style={{ color: 'var(--red)' }}><i />not published</span>
          </span>
        </div>
        <ol className="stages" role="presentation">{stages}</ol>
      </div>
    </div>
  );
}
