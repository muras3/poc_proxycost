'use client';

import { useEffect, useMemo, useState } from 'react';
import { singleParcelGrossG } from '@/lib/pricing/compare';
import { EMS_SOURCE_URL, EMS_ZONE, emsFor, formatStep } from '@/lib/pricing/ems';
import { maxGramsFor } from '@/lib/pricing/postage';
import { grams as gramsText, yen } from '@/lib/ui/format';
import { Glyph } from '@/lib/ui/glyphs';
import type { CountryCode, Item } from '@/lib/pricing/types';
import { computeBoxSplit, type SplitBox } from './boxSplit';
import { PackingBox, type PackedItem } from './PackingBox';
import { WeightLadder } from './WeightLadder';

/**
 * 箱・段・送料の差分を1つの区画にまとめる。**「詰める」絵ではない。**
 * EMS は重量だけで決まり体積は一切効かないので、箱の大きさで「いくら埋まったか」は
 * 言わない（=中身の詰まり具合を面積で見せることはしない）。
 *
 * ただし **カートが複数箱に分かれるときは、その分かれ方自体を見せる**
 * （2026-09-12、オーナー指示）。1箱のときは従来どおり3つ:
 *   1. いま何が入っていて、どれが推定重量か（半透明）
 *   2. その重量が EMS のどの段に立っているか
 *   3. **直前の操作で送料が動いたか。動かなかったなら「+¥0」と書いて静止する**
 *
 * 複数箱に分かれるときは、箱ごとに言う（`computeBoxSplit`、`docs/DESIGN-BOX-SIZE.md`
 * §2④⑤）: なぜ分かれたか・詰めた順（重い順）・その箱の申告額・その箱の免税しきい値。
 * **「なぜ分かれたか」は今は EMS の重量上限超えしか出さない。**店舗の切れ目による
 * 分割は `compare.ts` の `buildRow` が既に計算しているが `Row` の外に出ておらず
 * （`Row.parcels` は個数のみ）、しかも実際に効くのは Buyee の default 変種だけ
 * ——この区画は特定の `Row` に紐付いていないので、店舗分割を一律に見せると
 * 「価格の根拠にしていない分かれ方」を見せることになる（`boxSplit.ts` の doc
 * comment 参照、2026-09-12 オーナー指摘で一度実装して撤回）。
 * **代行が実際に箱をどう分けるかは私たちには分からない**——この分割は「私たちが
 * 仮に置いた前提」であって実測ではない、という前提そのものを開示文で先に言う
 * （`SplitDisclosure`）。
 *
 * 数字は全部 `singleParcelGrossG()`／`computeBoxSplit()`（どちらも compare() と
 * 同じ組み立て）と `emsFor()` ＝日本郵便の公表表から出る。ここで独自に足し引きした
 * 数字は無い。
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

/** 箱に立てる個数。数量ぶん並べるが、列は12個で打ち止め（詰まり具合は意味を持たない）。 */
function copiesOf(item: Item): number {
  return Math.max(1, Math.min(12, item.qty));
}

/**
 * 重量表に当たらず仮置きが入っている品の、箱の中での個数。
 * **これは「推定」より弱い。**表の中央値は数百件の出品から出た数字だが、
 * こちらは何も知らずに置いた 1 kg で、形も「不明」（点線）で描かれる。
 * 箱の但し書きと読み上げの両方で、その点線が何なのかを名指しするために数える。
 */
function placeholderCount(items: readonly Item[]): number {
  return items.reduce((n, i) => n + (i.weightOrigin === 'assumed' ? copiesOf(i) : 0), 0);
}

/** カートの1品 → 箱の中身。**推定重量なら半透明。** */
function packedItems(items: readonly Item[]): PackedItem[] {
  const out: PackedItem[] = [];
  for (const item of items) {
    const n = copiesOf(item);
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
  // **箱が複数に分かれるなら、それを見せる。**単箱（または EMS が使えず判定不能）
  // なら null/長さ1 が返り、その場合は下の従来どおりの単箱表示にフォールバックする。
  const split = useMemo(() => computeBoxSplit(items, country), [items, country]);
  const multiBox = split != null && split.length > 1 ? split : null;
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
  // カートが空。**箱そのものは出しておく。**箱は入力のすぐ隣に置いてあり、
  // 足した品がここに落ちる。空のあいだ箱ごと消すと、落ちる先が画面に無い状態から
  // 始まって「どこに落ちたのか」が見えなくなる。数字は1つも出さない（持っていない）。
  if (items.length === 0) return <EmptyParcel className={className} />;
  // 重量の無い品が混ざっている（段が決まらない）。空の箱は「何も入っていない」と
  // 言う絵なので、ここでそれを出すのは嘘になる。何も描かない。
  if (!shown || !target) return null;

  const entering = new Set(anim.entering);
  const zone = EMS_ZONE[country];
  const estimatedCount = packed.filter((p) => p.estimated).length;
  // 重量表に当たらなかった品。**推定より弱い**ので、推定とは別に数えて別に言う。
  const placeholders = placeholderCount(items);

  return (
    <section
      aria-label="Parcel"
      data-testid="parcel"
      data-phase={phase}
      data-step={shown.overMax ? 'over' : String(shown.stepIndex)}
      className={className}
    >
      <ParcelHeading />

      {multiBox && <MultiBoxView boxes={multiBox} items={items} country={country} />}

      {/* **単箱のときだけマウントする。**以前は `hidden` クラスで隠すだけだったため、
          分割時にこの単箱と `MultiBoxView` の箱が両方 DOM に残り、
          `packing-box-scene` などの locator が複数要素にヒットしていた
          （strict mode violation、CI で発覚）。「隠す」ではなく「描かない」。 */}
      {!multiBox && (
      <>
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <PackingBox
            stepIndex={shown.stepIndex}
            overMax={shown.overMax}
            items={packed}
            label={`Parcel box holding ${packed.length} item${packed.length === 1 ? '' : 's'}${
              estimatedCount > 0 ? `, ${estimatedCount} with an estimated weight` : ''
            }${
              // 読み上げでも点線を名指しする。形の違いは目で見た人にしか届かない。
              placeholders > 0 ? `, ${placeholders} of them at a placeholder weight we chose` : ''
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

        </div>

        {/* lg では箱と目盛りは入力の隣の列に入る（Calculator）。そこで目盛りを広く取ると
            **箱が縮んで中身が読めなくなる。**箱は段が上がるほど大きく描かれ、収まらなければ
            場面の幅に合わせて縮む。縮むと線画の線が1画素を割ってにじみ、中身と段ボールの
            コントラストが 3:1（WCAG 1.4.11）を切る（8kg・6点で 2.6:1 まで落ちた）。
            目盛りは「27 kg ¥30,350」が収まれば足りるので、幅は目盛りより箱に回す。 */}
        <WeightLadder
          stepIndex={shown.stepIndex}
          overMax={shown.overMax}
          zone={zone}
          grams={shown.grams}
          className="w-full shrink-0 sm:w-56 lg:w-36"
        />
      </div>

      {/* 但し書きは箱と目盛りの両方に掛かるので、2つの下に幅いっぱいで置く。
          箱の側の列に入れておくと、縦積み（モバイル）で数字と目盛りのあいだに
          3行の散文が挟まり、**段が最初の視界から押し出される。** */}
      <p className="mt-3 text-xs text-neutral-600 dark:text-neutral-400">
        EMS is priced by weight alone — volume never enters the price, so this box is not a packing
        simulation. Faded items are weights we estimated, not measured.{' '}
        {/* 点線の輪郭（`drawUnknown`）は「重量表に当たらなかった」の形。箱に居るときだけ
            説明する。居ないときに説明すると、画面に無いものを指すことになる。 */}
        {placeholders > 0 && (
          <>
            A dashed outline means we have no weight for that item at all — it is standing in the
            box at a placeholder we chose, not at anything we looked up.{' '}
          </>
        )}
        <a className="underline" href={EMS_SOURCE_URL} target="_blank" rel="noreferrer">
          Japan Post EMS rates ↗
        </a>
      </p>
      </>
      )}
    </section>
  );
}

/** 箱1つぶんの中身。`box.itemIndices` の順（重い順）をそのまま `order` に写す。 */
function packedItemsForBox(items: readonly Item[], box: SplitBox): (PackedItem & { order: number })[] {
  const out: (PackedItem & { order: number })[] = [];
  let order = 0;
  for (const idx of box.itemIndices) {
    const item = items[idx];
    if (!item) continue;
    const n = copiesOf(item);
    for (let k = 0; k < n; k++) {
      order += 1;
      out.push({
        id: item.weightLineId ?? 'unknown',
        key: `${item.id}#${k}`,
        label: item.title,
        estimated: item.weightOrigin !== 'user',
        order,
      });
    }
  }
  return out;
}

/**
 * **箱の分かれ方そのものを見せる区画。**
 * 前提（`docs/DESIGN-BOX-SIZE.md` §5、オーナー確定 #76）を先に言い、箱ごとに
 * 4つの事実を出す: 分かれた理由・詰めた順（重い順）・その箱の申告額・その箱の
 * 免税しきい値。すべて文字と数字で言うので `prefers-reduced-motion` でも全部
 * 読める（この区画自体はアニメーションを使っていない）。
 */
function MultiBoxView({
  boxes,
  items,
  country,
}: {
  boxes: readonly SplitBox[];
  items: readonly Item[];
  country: CountryCode;
}) {
  const limit = maxGramsFor('ems', country);
  return (
    <div data-testid="parcel-split" className="mt-3 min-w-0">
      <SplitDisclosure />
      <div className="mt-3 grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
        {boxes.map((box) => {
          const boxItems = packedItemsForBox(items, box);
          return (
            <div
              key={box.boxIndex}
              data-testid="split-box"
              data-reason={box.reason}
              data-over-threshold={box.overThreshold ? 'true' : 'false'}
              className="min-w-0 rounded border border-amber-400 p-2 dark:border-amber-700"
            >
              <p
                data-testid="split-box-reason"
                className="text-xs font-semibold text-neutral-700 dark:text-neutral-300"
              >
                Box {box.boxIndex + 1} of {boxes.length}
                {' — '}
                split: this shipment was over EMS&apos;s {formatStep(limit)} limit
              </p>

              <PackingBox
                stepIndex={0}
                items={boxItems}
                label={`Box ${box.boxIndex + 1} of ${boxes.length}, ${boxItems.length} item${
                  boxItems.length === 1 ? '' : 's'
                }, packed heaviest first, declared value ${yen(box.declaredYen)}`}
                renderGlyph={(p) => (
                  <div className="relative">
                    <span
                      data-testid="pack-order"
                      className="absolute -left-1 -top-1 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-neutral-800 text-[9px] font-bold text-white dark:bg-neutral-200 dark:text-neutral-900"
                      aria-hidden="true"
                    >
                      {(p as PackedItem & { order: number }).order}
                    </span>
                    <Glyph lineId={p.id} label={p.label} estimated={p.estimated} size={44} />
                  </div>
                )}
              />

              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                <dt className="text-neutral-600 dark:text-neutral-400">Packed order</dt>
                <dd className="num">heaviest first (1 = heaviest)</dd>
                <dt className="text-neutral-600 dark:text-neutral-400">Declared value</dt>
                <dd data-testid="split-box-declared" className="num">
                  {yen(box.declaredYen)}{' '}
                  <span className="text-neutral-500">sum of what is actually in this box</span>
                </dd>
                <dt className="text-neutral-600 dark:text-neutral-400">Duty-free threshold</dt>
                <dd data-testid="split-box-threshold" className="num">
                  {box.dutyFreeThresholdYen == null ? (
                    'no threshold for this destination'
                  ) : (
                    <>
                      ~{yen(box.dutyFreeThresholdYen)}{' '}
                      <span
                        data-testid="split-box-threshold-state"
                        className={
                          box.overThreshold
                            ? 'font-semibold text-amber-700 dark:text-amber-400'
                            : 'font-semibold text-emerald-700 dark:text-emerald-400'
                        }
                      >
                        {box.overThreshold ? 'OVER' : 'under'}
                      </span>
                    </>
                  )}
                </dd>
              </dl>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-neutral-600 dark:text-neutral-400">
        Each box is priced and duty-checked separately from the others.
      </p>
    </div>
  );
}

/** 開示文。**owner が確定した文言をそのまま使う（#76）。書き換えない。** */
function SplitDisclosure() {
  return (
    <div
      data-testid="split-disclosure"
      className="rounded bg-neutral-100 p-2 text-xs text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
    >
      <p className="font-semibold">
        箱を何個に分けるかは代行会社が決めます。私たちはそれを知ることができないため、次の前提で仮に分けて計算しています。
      </p>
      <ul className="mt-1 list-disc pl-4">
        <li>配送方式の上限を超えたら箱を増やす</li>
        <li>重い商品から順に詰める</li>
        <li>各口の申告額は、その口に入っている商品の合計金額（全体を均等に割ってはいません）</li>
      </ul>
      <p className="mt-1">実際の分け方が違えば、関税・消費税も変わります。</p>
    </div>
  );
}

/** 区画の見出し。空でも中身が入っていても同じ場所に同じ文言で立つ。 */
function ParcelHeading() {
  return (
    <h2 className="font-mono text-[11px] uppercase tracking-[0.12em] text-neutral-600 dark:text-neutral-400">
      Parcel — if everything ships together
    </h2>
  );
}

/**
 * 空のカートの箱。**段も重量も送料も出さない。**
 * 空の箱に段（大きさ）の意味は無いので、目盛りも出さず、いちばん小さい箱を
 * 「落ちてくる先」として置くだけ。ここに数字を出すと、無い数字を出すことになる。
 */
function EmptyParcel({ className = '' }: { className?: string }) {
  return (
    <section
      aria-label="Parcel"
      data-testid="parcel"
      data-phase="idle"
      data-step="empty"
      className={className}
    >
      <ParcelHeading />
      <div className="mt-3">
        <PackingBox stepIndex={0} items={[]} label="Empty parcel box" />
        <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">
          Nothing to ship yet — add a listing above and it lands in this box.
        </p>
      </div>
    </section>
  );
}
