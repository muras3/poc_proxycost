'use client';

import { useEffect, useMemo, useState } from 'react';
import { singleParcelGrossG } from '@/lib/pricing/compare';
import { EMS_SOURCE_URL, EMS_ZONE, emsFor } from '@/lib/pricing/ems';
import { grams as gramsText, yen } from '@/lib/ui/format';
import { Glyph } from '@/lib/ui/glyphs';
import type { CountryCode, Item } from '@/lib/pricing/types';
import { PackingBox, type PackedItem } from './PackingBox';
import { WeightLadder } from './WeightLadder';

/**
 * 箱・段・送料の差分を1つの区画にまとめる。**「詰める」絵ではない。**
 * EMS は重量だけで決まり体積は一切効かないので、箱は「いくら埋まったか」を言わない。
 * この区画が言うのは3つだけ:
 *   1. いま何が入っていて、どれが推定重量か（半透明）
 *   2. その重量が EMS のどの段に立っているか
 *   3. **直前の操作で送料が動いたか。動かなかったなら「+¥0」と書いて静止する**
 *
 * 数字は全部 `singleParcelGrossG()`（compare() と同じ組み立て）と `emsFor()`
 * ＝日本郵便の公表表から出る。ここで独自に足し引きした数字は無い。
 */

/** 追加1回の時間軸（ms、prototypes/README.md）。**直列。** */
export const LAND_MS = 410;   // 落ちて着地。箱が沈み、重量の数字が回り始める
export const JUDGE_MS = 970;  // 段判定。跨いだらここで初めて箱と段が動く
export const SETTLE_MS = 1230; // 静止（順位の行の滑りが終わる位置）

type Phase = 'idle' | 'falling' | 'landed' | 'judged';

/** 画面に立てる箱の状態。**すべて pricing から来る。** */
export interface ParcelState {
  grams: number;
  stepIndex: number;
  overMax: boolean;
  /** 表の外なら null。**0 とは書かない。** */
  yen: number | null;
}

export function parcelStateFor(items: readonly Item[], country: CountryCode): ParcelState | null {
  const g = singleParcelGrossG(items);
  if (g == null) return null;
  const zone = EMS_ZONE[country];
  const ems = emsFor(g, zone);
  return { grams: g, stepIndex: ems.index, overMax: ems.overMax, yen: ems.yen };
}

/**
 * 送料の差分。**段を跨がなかったら 0。**
 * 「重さは増えたのに値段は変わらない」を数字で言い切るための値で、
 * ここを「変化なし」で黙らせると、何も起きなかったことを画面が言わなくなる。
 */
export function postageDelta(prev: ParcelState | null, next: ParcelState): number | null {
  if (!prev) return null;
  if (prev.overMax || next.overMax) return null;
  if (prev.yen == null || next.yen == null) return null;
  return next.yen - prev.yen;
}

/** 段を跨いだか。跨いでいなければ箱も段も動かない。 */
export function crossedStep(prev: ParcelState | null, next: ParcelState): boolean {
  if (!prev) return false;
  return prev.stepIndex !== next.stepIndex || prev.overMax !== next.overMax;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** カートの1品 → 箱の中身。**推定重量なら半透明。** */
function packedItems(items: readonly Item[]): PackedItem[] {
  const out: PackedItem[] = [];
  for (const item of items) {
    // 数量は個数ぶん並べる。ただし箱の中は列で、詰まり具合は意味を持たない。
    const n = Math.max(1, Math.min(12, item.qty));
    for (let k = 0; k < n; k++) {
      out.push({
        id: item.weightLineId ?? 'unknown',
        key: `${item.id}#${k}`,
        label: item.title,
        // 'table'（重量表の中央値）も 'assumed'（仮置き）も実測ではない。
        // 実測でないものは全部半透明にする。利用者が自分で入れた値だけが不透明。
        estimated: item.weightOrigin !== 'user',
      });
    }
  }
  return out;
}

export function ParcelView({
  items,
  country,
  className = '',
}: {
  items: readonly Item[];
  country: CountryCode;
  className?: string;
}) {
  const target = useMemo(() => parcelStateFor(items, country), [items, country]);
  const packed = useMemo(() => packedItems(items), [items]);
  const signature = target
    ? `${target.grams}/${target.stepIndex}/${target.overMax}/${target.yen}/${packed.length}`
    : `none/${packed.length}`;

  /**
   * 描いている状態。**target より遅れて追いつく。**
   * `shown` を target と分けているのは、段判定（970ms）より前に箱と段を動かさないため。
   * 動かしてしまうと「落ちた瞬間に箱が大きくなった」＝重量ではなく体積で大きくなった、
   * と読める絵になる。
   */
  const [anim, setAnim] = useState<{
    sig: string;
    shown: ParcelState | null;
    phase: Phase;
    delta: { yen: number | null; crossed: boolean } | null;
    /** 今回落ちてきた品のキー。前回の描画に居なかったものだけ。 */
    entering: string[];
    keys: string[];
  }>(() => ({
    sig: signature,
    shown: target,
    phase: 'idle',
    delta: null,
    entering: [],
    keys: packed.map((p) => p.key),
  }));

  if (anim.sig !== signature) {
    // 入力が変わった描画。**ここではまだ箱も段も動かさない**（shown を据え置く）。
    const prev = anim.shown;
    const keys = packed.map((p) => p.key);
    const before = new Set(anim.keys);
    const entering = keys.filter((k) => !before.has(k));
    const d =
      prev && target ? { yen: postageDelta(prev, target), crossed: crossedStep(prev, target) } : null;
    const still = !prev || !target || prefersReducedMotion();
    setAnim({
      sig: signature,
      // **prefers-reduced-motion では全部飛ばして最終状態を出す。**
      shown: still ? target : prev,
      phase: still ? 'idle' : 'falling',
      delta: still ? d : null,
      entering: still ? [] : entering,
      keys,
    });
  }

  // 落下 → 着地 → 段判定 → 静止。**直列**（prototypes/README.md の時間軸）。
  useEffect(() => {
    if (anim.phase !== 'falling' || !target) return;
    const sig = anim.sig;
    const at = (ms: number, next: (a: typeof anim) => typeof anim) =>
      window.setTimeout(() => setAnim((a) => (a.sig === sig ? next(a) : a)), ms);
    // 着地。**重量の数字だけが先に動く。**段と箱は据え置き。
    const t1 = at(LAND_MS, (a) => ({
      ...a,
      phase: 'landed',
      shown: a.shown ? { ...a.shown, grams: target.grams } : target,
    }));
    // 段判定。跨いだときだけ、ここで箱の大きさと段が離散的に動く。
    // 跨がなくてもチップは出る（「+¥0」）。**黙って静止させない。**
    const t2 = at(JUDGE_MS, (a) => ({
      ...a,
      phase: 'judged',
      shown: target,
      delta: { yen: postageDelta(a.shown, target), crossed: crossedStep(a.shown, target) },
    }));
    const t3 = at(SETTLE_MS, (a) => ({ ...a, phase: 'idle' }));
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
    // **依存は sig だけ。** phase を依存に入れると、着地で effect が張り直されて
    // 掃除関数が段判定のタイマーを消し、箱が 'landed' のまま止まる。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anim.sig, target]);

  const { shown, phase, delta } = anim;
  if (!shown || !target) return null;

  const entering = new Set(anim.entering);
  const zone = EMS_ZONE[country];
  const estimatedCount = packed.filter((p) => p.estimated).length;

  return (
    <section
      aria-label="Parcel"
      data-testid="parcel"
      data-phase={phase}
      data-step={shown.overMax ? 'over' : String(shown.stepIndex)}
      className={className}
    >
      <h2 className="font-mono text-[11px] uppercase tracking-[0.12em] text-neutral-600 dark:text-neutral-400">
        Parcel — if everything ships together
      </h2>

      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <PackingBox
            stepIndex={shown.stepIndex}
            overMax={shown.overMax}
            items={packed}
            label={`Parcel box holding ${packed.length} item${packed.length === 1 ? '' : 's'}${
              estimatedCount > 0 ? `, ${estimatedCount} with an estimated weight` : ''
            }`}
            renderGlyph={(p) => (
              <div
                data-entering={entering.has(p.key) ? 'true' : 'false'}
                /* 落下は新しく入った品だけ。**reduced motion では落とさない。** */
                className={
                  entering.has(p.key)
                    ? 'motion-safe:animate-[parcel-drop_410ms_cubic-bezier(.3,.9,.4,1)_both]'
                    : undefined
                }
              >
                <Glyph lineId={p.id} label={p.label} estimated={p.estimated} size={56} />
              </div>
            )}
          />

          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-neutral-600 dark:text-neutral-400">Weight</dt>
            <dd data-testid="parcel-weight" className="num">
              ~{gramsText(shown.grams)}{' '}
              <span className="text-xs text-neutral-500">after our packing allowance</span>
            </dd>
            <dt className="text-neutral-600 dark:text-neutral-400">EMS postage</dt>
            <dd data-testid="parcel-postage" className="num">
              {shown.overMax || shown.yen == null ? (
                <span className="text-neutral-500 dark:text-neutral-400">
                  — no published rate above 30 kg
                </span>
              ) : (
                <>
                  {yen(shown.yen)}{' '}
                  <span className="text-xs text-neutral-500">zone {zone}, one parcel</span>
                </>
              )}
            </dd>
          </dl>

          {/* **跨がなかった回に「+¥0」を出す。**「何も起きなかった」を言葉で言う。 */}
          {delta && (
            <p
              data-testid="parcel-delta"
              data-crossed={delta.crossed ? 'true' : 'false'}
              className={[
                'mt-2 inline-flex flex-wrap items-baseline gap-x-2 rounded px-2 py-1 text-xs num',
                delta.crossed
                  ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
                  : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300',
              ].join(' ')}
            >
              <span className="font-semibold">
                {delta.yen == null
                  ? '—'
                  : `${delta.yen > 0 ? '+' : delta.yen < 0 ? '−' : '+'}${yen(Math.abs(delta.yen))}`}
              </span>
              <span>
                {delta.yen == null
                  ? 'postage unknown above the EMS table'
                  : delta.crossed
                    ? 'postage — the parcel crossed an EMS weight step'
                    : 'postage — same EMS weight step, so the box did not change'}
              </span>
            </p>
          )}

          <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">
            EMS is priced by weight alone — volume never enters the price, so this box is not a
            packing simulation. Faded items are weights we estimated, not measured.{' '}
            <a className="underline" href={EMS_SOURCE_URL} target="_blank" rel="noreferrer">
              Japan Post EMS rates ↗
            </a>
          </p>
        </div>

        <WeightLadder
          stepIndex={shown.stepIndex}
          overMax={shown.overMax}
          zone={zone}
          grams={shown.grams}
          className="w-full shrink-0 sm:w-56"
        />
      </div>
    </section>
  );
}
