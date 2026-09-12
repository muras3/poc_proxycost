'use client';

import { useEffect, useMemo, useState } from 'react';
import { singleParcelGrossG } from '@/lib/pricing/compare';
import { EMS_SOURCE_URL, EMS_ZONE, emsFor } from '@/lib/pricing/ems';
import {
  COURIER_METHODS, DEFAULT_PARCEL_DIMENSIONS_CM, POSTAL_METHODS,
} from '@/lib/pricing/postage';
import { grams as gramsText, yen } from '@/lib/ui/format';
import { Glyph } from '@/lib/ui/glyphs';
import type {
  CountryCode, CourierMethod, Item, ParcelBox, ParcelDutyKind, ParcelSplitReason, ParcelVatKind,
  PostalMethod, Row,
} from '@/lib/pricing/types';
import { PackingBox, type PackedItem } from './PackingBox';
import { WeightLadder } from './WeightLadder';

/**
 * 箱・段・送料の差分を1つの区画にまとめる。**「詰める」絵ではない。**
 *
 * **体積が効くかどうかは、この行が実際に使った方式（`row.method`）で分かれる**
 * （2026-09-12、宅配便が7カ国すべてに配線されてから書き直し。以前のこの
 * コメントは「EMS は重量だけで決まり体積は一切効かない」を区画全体の前提として
 * 書いていたが、それは日本郵便の4方式（`PostalMethod`）にしか成り立たない。
 * 宅配便（`CourierMethod`）は容積重量で課金されるので、**同じ荷物でも箱が
 * 大きいほど高くなりうる**——「体積は一切効かない」は宅配便の行では単純に嘘になる）。
 *
 * - **`row.method` が `PostalMethod`（日本郵便4方式）のとき**: 重量だけで決まり、
 *   体積は一切効かない。EMS の重量表・段・日本郵便の出典リンクをそのまま出す
 *   （従来どおり）。
 * - **`row.method` が `CourierMethod`（宅配便）のとき**: 課金は「実重量」と
 *   「容積重量（箱の大きさから出す重量）」の大きい方（chargeable weight）。
 *   **その実際の値・どちらが勝ったかはこのコンポーネントでは計算しない**——
 *   除数・端数処理は各社ごとに違う一次情報で、`Row`/`ParcelBox` にまだ
 *   出ていない（`docs/DESIGN-BOX-SIZE.md` 参照）。ここでは「体積が効く」という
 *   事実だけを説明し、具体的な容積重量・EMS の段・EMS の料金は一切出さない。
 *   宅配便には EMS のような段表（step ladder）が無いので、`WeightLadder` も
 *   描かない——無い物を EMS のもので埋めない。
 *
 * 1箱のときは（方式に応じて）:
 *   1. いま何が入っていて、どれが推定重量か（半透明）
 *   2-postal. その重量が EMS のどの段に立っているか。**直前の操作で送料が
 *      動いたか。動かなかったなら「+¥0」と書いて静止する**
 *   2-courier. 体積が価格に効くという事実の説明（数値は出さない）
 *
 * 複数箱に分かれるときは、箱ごとに言う: なぜ分かれたか・詰めた順（重い順）・
 * その箱の申告額・その箱の関税/VAT・GST の判定。**箱の内訳（`row.boxes`）は一切ここで
 * 再計算しない。**`compare()`/`buildRow`（`src/lib/pricing/compare.ts`）が
 * その行に実際に選んだ方式・グルーピングで計算した `Row.boxes` を、そのまま
 * 描くだけ（2026-09-12、オーナー確定）。この方式非依存な描画は宅配便でも
 * そのまま正しい——EMS 固有の値を含んでいない。
 *
 * **経緯（同じ欠陥を3回作った）**: 最初はこの区画が独自に `groupByShop` や
 * `splitByWeightLimit` を呼び直していた。1回目は店舗が分からない商品を1点ずつ
 * 別箱にする版で、ほぼ全カートが常に「店舗で分割」して見えた。2回目はそれを
 * 緩めて店舗不明をまとめる版にしたが、今度は実際の課金（1点＝1注文で高めに
 * 計算される）と絵（1箱）が食い違った。3回目は店舗分割を諦めて EMS の重量上限
 * だけを見せたが、選ばれた方式が EMS でない行（例: DE/3点×600g/cheapest は
 * `small-packet-air`）では上限が実際と違い、箱数・申告額が計算と食い違ったまま
 * だった。**3回とも同じ形の欠陥——計算はしているが Row の外に出していない値を、
 * 画面側が当てずっぽうで再現しようとした。**`Row.boxes` を追加して、この区画は
 * それを受け取るだけの純粋な描画にした。これで箱の内訳が「その行が実際に使った
 * もの」からズレることは構造的に無くなる。宅配便の配線（#87）でも同じ教訓を
 * 踏まないよう、容積重量の実値・勝敗はここで計算せず「効く」という事実だけを言う。
 *
 * **代行が実際に箱をどう分けるかは私たちには分からない**——この分割は「私たちが
 * 仮に置いた前提」であって実測ではない、という前提そのものを開示文で先に言う
 * （`SplitDisclosure`）。箱の寸法そのものも同じ理由で仮定（`DEFAULT_PARCEL_DIMENSIONS_CM`）
 * であり、利用者が触れる入力にはしない（`docs/DESIGN-BOX-SIZE.md` §3、オーナー確定）。
 *
 * `row` が渡されない、または `row.boxes.length <= 1`（分かれていない）ときは、
 * 単箱プレビューになる。**単箱でも `row.method` が宅配便なら、EMS ではなく
 * 宅配便向けの単箱プレビュー（`CourierSingleBoxView`）を出す。**`row` 自体が
 * 渡されない（比較可能な行がまだ無い）ときだけ、従来どおり日本郵便 EMS の
 * 単箱プレビュー（`singleParcelGrossG()`／`emsFor()`）にフォールバックする。
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

/**
 * この行が宅配便で決まったか。**`CourierMethod` の全メンバーは `'courier-'` で
 * 始まる**（`src/lib/pricing/types.ts` の union を見よ）ので、文字列の接頭辞だけで
 * 判定できる——価格を再計算しているわけではなく、`Row` が既に決めた `method`
 * （文字列）をそのまま読んでいるだけ。
 */
function isCourierMethod(method: PostalMethod | CourierMethod): method is CourierMethod {
  return method.startsWith('courier-');
}

/** `PostalMethod` の表示名。マスタ（`POSTAL_METHODS`）から引く——ここでベタ書きしない。 */
function postalMethodLabel(method: PostalMethod): string {
  return POSTAL_METHODS.find((m) => m.id === method)?.label ?? method;
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
  row = null,
  className = '',
}: {
  items: readonly Item[];
  country: CountryCode;
  /**
   * この行に実際に価格が計算された `Row`（`compare()` の結果）。渡すと
   * `row.boxes` をそのまま描き、複数箱ならその分かれ方を見せる。渡さない、
   * または `row.boxes.length <= 1` なら、従来どおりの単箱プレビューになる。
   * **ここでは箱の内訳を再計算しない**——上のモジュール doc comment 参照。
   */
  row?: Row | null;
  className?: string;
}) {
  const target = useMemo(() => parcelStateFor(items, country), [items, country]);
  const packed = useMemo(() => packedItems(items), [items]);
  // **箱が複数に分かれるなら、それを見せる。**`row` が無い、または1箱のままなら
  // 下の従来どおりの単箱表示にフォールバックする。
  const multiBox = row && row.boxes.length > 1 ? row.boxes : null;
  // **この行が宅配便で決まっているか。**宅配便には EMS のような段表が無く、
  // 体積が価格に効く——EMS 前提の描画（段・EMS 料金）をそのまま出すと、
  // このコンポーネントの前提そのものが逆転する（モジュール doc comment 参照）。
  const courier = row ? isCourierMethod(row.method) : false;
  // 単箱・宅配便のときだけ使う専用ビュー。複数箱は `MultiBoxView` が既に
  // 方式非依存（EMS 固有の値を含まない）なので、そちらに任せる。
  const singleCourierBox = row && !multiBox && courier ? (row.boxes[0] ?? null) : null;
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
  // **宅配便・単箱は EMS の段判定アニメーションを一切使わない。**`shown`/`target`
  // は EMS 前提の状態機械なので、ここでは見ない——`row.boxes[0]` を直接描く。
  // ただし「点線の輪郭が何か」「薄い品が何か」は**方式に関係なく我々のデータに
  // ついての開示**（コーディネーター指摘 2026-09-12）——重量を推測したことは
  // 郵便でも宅配便でも同じ意味を持つので、ここでも渡す。
  if (singleCourierBox) {
    return (
      <section aria-label="Parcel" data-testid="parcel" data-phase="idle" data-step="courier" className={className}>
        <ParcelHeading />
        <CourierSingleBoxView
          box={singleCourierBox}
          items={items}
          method={row!.method as CourierMethod}
          placeholders={placeholderCount(items)}
        />
      </section>
    );
  }
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
      <ParcelHeading split={!!multiBox} />

      {multiBox && <MultiBoxView boxes={multiBox} items={items} />}

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
            label={`Parcel box holding ${packed.length} item${packed.length === 1 ? '' : 's'}`
              // 読み上げでも点線を名指しする。形の違いは目で見た人にしか届かない。
              + estimatedDataLabelSuffix(estimatedCount, placeholders)}
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
            {/* **F5**: この行が実際に使った方式が EMS とは限らない
                （`row.method` が他の3つの `PostalMethod` のこともある）。
                「EMS postage」は EMS 以外の方式の行にとって偽の名指しなので、
                `row` が無い（フォールバック既定は EMS）ときだけそう呼び、
                それ以外は実際の方式名で呼ぶ。 */}
            <dt className="text-neutral-600 dark:text-neutral-400">
              {!row || row.method === 'ems' ? 'EMS postage' : `${postalMethodLabel(row.method as PostalMethod)} postage`}
            </dt>
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
        simulation.{' '}
        <EstimatedDataDisclosure placeholders={placeholders} />
        <a className="underline" href={EMS_SOURCE_URL} target="_blank" rel="noreferrer">
          Japan Post EMS rates ↗
        </a>
      </p>
      </>
      )}
    </section>
  );
}

/**
 * **重量データそのものについての開示。方式に関係なく常に出す。**
 * 「薄い品は推定重量」「点線は重量表にすら当たらなかった品の仮置き」は、
 * 我々がその品の重さをどう知ったか（郵便で送るか宅配便で送るかとは無関係）の
 * 話であって、方式ごとに変えてよい情報ではない（コーディネーター指摘
 * 2026-09-12——`CourierSingleBoxView` が旧来の説明段落を丸ごと入れ替えたとき、
 * 方式に依存する部分（EMS は重量だけで決まる・日本郵便の出典）と、我々の
 * データについての部分（この disclosure）を区別せずに落としてしまい、
 * 宅配便の行でこの開示が消える回帰を作った——それを二度と作らないため、
 * 単箱の postal 分岐・courier 分岐の両方から同じこの関数を呼ぶ）。
 */
function EstimatedDataDisclosure({ placeholders }: { placeholders: number }) {
  return (
    <>
      Faded items are weights we estimated, not measured.{' '}
      {/* 点線の輪郭（`drawUnknown`）は「重量表に当たらなかった」の形。箱に居るときだけ
          説明する。居ないときに説明すると、画面に無いものを指すことになる。 */}
      {placeholders > 0 && (
        <>
          A dashed outline means we have no weight for that item at all — it is standing in the
          box at a placeholder we chose, not at anything we looked up.{' '}
        </>
      )}
    </>
  );
}

/**
 * `EstimatedDataDisclosure` の読み上げ版（`PackingBox` の `aria-label` に渡す
 * 素のテキスト）。**同じ理由で存在を分けて持つのではなく、同じ2つの値
 * （`estimatedCount`/`placeholders`）から同じ判断で組む**——これを2回目に
 * 別々に組んだ結果、見た目の文言（`EstimatedDataDisclosure`）だけ直して
 * 読み上げ側（旧来の courier の `aria-label` はここを一切持っていなかった）を
 * 直し忘れる、という同じ形の回帰をもう一度作った（コーディネーター指摘
 * 2026-09-12、2回目）。**方式に関係なく必ず付く**——郵便・宅配便のどちらの
 * `label` を組むときも、必ずこの関数を通す。
 */
function estimatedDataLabelSuffix(estimatedCount: number, placeholders: number): string {
  return (estimatedCount > 0 ? `, ${estimatedCount} with an estimated weight` : '')
    + (placeholders > 0 ? `, ${placeholders} of them at a placeholder weight we chose` : '');
}

/** 箱1つぶんの中身。`box.itemIndices` の順（重い順）をそのまま `order` に写す。 */
function packedItemsForBox(items: readonly Item[], box: ParcelBox): (PackedItem & { order: number })[] {
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
 * 箱がなぜ他の箱と別なのかの文言。**`ParcelSplitReason` の4種は対称ではない**
 * （`src/lib/pricing/types.ts` の doc comment 参照）——特に `'unresolved-shop'` を
 * `'identified-shop'`（"a different shop"）のように書いてはいけない。知らないことを
 * 知っているかのように主張することになる。
 */
const REASON_TEXT: Record<ParcelSplitReason, string> = {
  'identified-shop': 'a different shop',
  'per-listing': 'a separate listing — this site bills one order per listing',
  'unresolved-shop': "we couldn't tell if this is the same shop as another box, so we kept it "
    + 'separate — this can push the total higher than the real one',
  'weight-limit': "over this shipping method's weight limit",
};

/**
 * `box.tax` の文言。**しきい値と申告額を比べ直さない**——`taxLines()`
 * （`src/lib/pricing/compare.ts`）が個口ごとに出した `kind` をそのまま文にするだけ。
 *
 * **なぜ「免税しきい値の下＝無税」で描かないか（コーディネーター指摘 2026-09-12）**:
 * 7か国中5か国でその読みが崩れる——GB/DE/FR/AU は VAT/GST の免税限度が実質0
 * （`vatFreeLimit: 0`、金額が1円でもあれば課税）、DE/FR は関税の免税限度以下でも
 * 1点あたり定額課税（`flatDutyPerItem`）、SG は関税の免税限度が無限大（`no-duty`
 * ——限度という概念自体が無く、線を引く意味がない）。だから「しきい値の絵」では
 * なく「`taxLines` が実際に出した結論」を見せる。
 */
const DUTY_TEXT: Record<ParcelDutyKind, (amountYen: number | null) => string> = {
  flat: (y) => `${yen(y ?? 0)} flat per-item duty — still charged under the duty-free line`,
  free: () => 'none — under the duty-free line',
  'no-duty': () => 'no duty on this category (no duty-free line applies)',
  rate: (y) => `${yen(y ?? 0)}`,
  unknown: () => 'rate not published',
};
const VAT_TEXT: Record<ParcelVatKind, (amountYen: number | null) => string> = {
  'no-rate': () => 'none at federal level',
  'seller-collects': () => 'collected at checkout, not at the border',
  free: () => 'none — under the threshold',
  rate: (y) => `${yen(y ?? 0)}`,
};
/** 「何かかかっている」か。色分けの根拠は `kind` そのもの——金額の大小ではない。 */
function dutyIsCharged(kind: ParcelBox['tax']['duty']['kind']): boolean {
  return kind === 'flat' || kind === 'rate';
}
function vatIsCharged(kind: ParcelBox['tax']['vat']['kind']): boolean {
  return kind === 'rate';
}

/**
 * **箱の分かれ方そのものを見せる区画。**
 * 前提（`docs/DESIGN-BOX-SIZE.md` §5、オーナー確定 #76）を先に言い、箱ごとに
 * 4つの事実を出す: 分かれた理由・詰めた順（重い順）・その箱の申告額・その箱の
 * 関税/VAT・GST の判定（**しきい値との比較は component 側でやり直さない**——
 * `taxLines()` が個口ごとに出した結論をそのまま渡す。理由は下の `DUTY_TEXT`/
 * `VAT_TEXT` の doc comment）。すべて文字と数字で言うので `prefers-reduced-motion` でも全部
 * 読める（この区画自体はアニメーションを使っていない）。
 * **`boxes` はそのまま `row.boxes`（`compare()` の出力）を描くだけ。** 分割・
 * グルーピングの計算はここには一切無い。
 */
function MultiBoxView({
  boxes,
  items,
}: {
  boxes: readonly ParcelBox[];
  items: readonly Item[];
}) {
  return (
    <div data-testid="parcel-split" className="mt-3 min-w-0">
      <SplitDisclosure />
      <div className="mt-3 grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
        {boxes.map((box, boxIndex) => {
          const boxItems = packedItemsForBox(items, box);
          return (
            <div
              key={boxIndex}
              data-testid="split-box"
              data-reason={box.reason}
              data-duty-kind={box.tax.duty.kind}
              data-vat-kind={box.tax.vat.kind}
              className={[
                'min-w-0 rounded border p-2',
                box.reason === 'weight-limit'
                  ? 'border-amber-400 dark:border-amber-700'
                  : 'border-neutral-300 dark:border-neutral-700',
              ].join(' ')}
            >
              <p
                data-testid="split-box-reason"
                className="text-xs font-semibold text-neutral-700 dark:text-neutral-300"
              >
                Box {boxIndex + 1} of {boxes.length}
                {' — '}
                split: {REASON_TEXT[box.reason]}
              </p>

              <PackingBox
                stepIndex={0}
                items={boxItems}
                label={`Box ${boxIndex + 1} of ${boxes.length}, ${boxItems.length} item${
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
                <dt className="text-neutral-600 dark:text-neutral-400">Duty</dt>
                <dd data-testid="split-box-duty" className="num">
                  <span
                    className={
                      dutyIsCharged(box.tax.duty.kind)
                        ? 'font-semibold text-amber-700 dark:text-amber-400'
                        : 'font-semibold text-emerald-700 dark:text-emerald-400'
                    }
                  >
                    {DUTY_TEXT[box.tax.duty.kind](box.tax.duty.yen)}
                  </span>
                </dd>
                <dt className="text-neutral-600 dark:text-neutral-400">VAT / GST</dt>
                <dd data-testid="split-box-vat" className="num">
                  <span
                    className={
                      vatIsCharged(box.tax.vat.kind)
                        ? 'font-semibold text-amber-700 dark:text-amber-400'
                        : 'font-semibold text-emerald-700 dark:text-emerald-400'
                    }
                  >
                    {VAT_TEXT[box.tax.vat.kind](box.tax.vat.yen)}
                  </span>
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

/**
 * **宅配便・単箱（分かれていない）のときの区画。**EMS の段表・EMS 料金は一切出さない
 * ——宅配便には段表という概念自体が無い（`docs/DESIGN-BOX-SIZE.md`）。
 *
 * 出すのは: 箱の絵（段ではなく実際の中身）・梱包後重量（`row.boxes[0].weightG`、
 * `compare()` の計算そのまま）・使った便名・関税/VAT・GST の判定（`box.tax`、
 * `taxLines()` の結論そのまま）・そして「体積が価格に効く」という事実の説明。
 *
 * **出さないもの（エンジンが出していない値）**: 実際の容積重量、実重量と
 * 容積重量のどちらが勝ったか、除数・端数処理（会社ごとに違う一次情報 ——
 * Buyee は 5000・端数処理なし、FROM JAPAN は 5000・0.5kg 単位で切り上げ、
 * 同じ除数でも規則が違う）。**これらは `Row`/`ParcelBox` にまだ無い値**——
 * 画面側で寸法から計算し直すことはしない（それは他の行が実際に使った方式を
 * 画面が当てずっぽうで再現する、この区画が過去3回作った欠陥そのものになる）。
 * 欲しい値としてレポートに記録する。
 */
function CourierSingleBoxView({
  box,
  items,
  method,
  placeholders,
}: {
  box: ParcelBox;
  items: readonly Item[];
  method: CourierMethod;
  /** 重量表に当たらなかった品の数。方式に関係ない開示（`EstimatedDataDisclosure`）に渡す。 */
  placeholders: number;
}) {
  const boxItems = packedItemsForBox(items, box);
  const methodLabel = COURIER_METHODS.find((m) => m.id === method)?.label ?? method;
  // **推定重量の点数。方式に関係ない事実**（`estimatedDataLabelSuffix` 参照）。
  const estimatedCount = boxItems.filter((p) => p.estimated).length;
  // **箱の見た目の大きさは `box.weightG`（`compare()` が既に出した梱包後重量、
  // 再計算ではない）だけで決める、点数ではなく重さで大きさを言う装飾。**
  // 値段には一切関係ない——宅配便には EMS の「段」のような価格の刻みが無いので、
  // ここでの大きさは「中身が見えるだけの余白」でしかなく、値段の根拠を主張しない
  // （プロースも同様に「仮定の大きさ」とだけ言い、価格には結び付けない）。500g
  // 刻みは EMS の段とは無関係な、この描画だけの目盛り。
  //
  // **点数だけで決める版を最初に試したが、実測でコントラストが直らなかった**
  // （6点・うち5点が推定重量＝半透明のカートで 2.45:1 しか出なかった。半透明の
  // 品が増えても、箱の床幅が点数ほどには増えず、行の縮尺（`rowScale`）が
  // 効いて中身の輪郭がにじんだままだった）。重量ベースにして箱そのものを
  // 十分大きくし、縮尺を 1 に近づける方が効いた（同条件で 3.x:1 まで回復、
  // 実測値は PR 本文参照）。
  const visualNotch = Math.min(41, Math.max(0, Math.floor(box.weightG / 200)));
  return (
    <div data-testid="parcel-courier" className="mt-3 min-w-0">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <PackingBox
            stepIndex={visualNotch}
            items={boxItems}
            label={`Parcel box holding ${boxItems.length} item${boxItems.length === 1 ? '' : 's'}`
              // **方式に関係ない事実を先に。**この行を最初に書いたとき「priced by
              // courier...」の一文しか無く、点線・推定重量の読み上げが courier の
              // 行だけ消えていた（コーディネーター指摘 2026-09-12、2回目）。
              // 見た目の文言（`EstimatedDataDisclosure`）と同じ2つの値から
              // 同じ関数で組む——ここだけ別に組み直さない。
              + estimatedDataLabelSuffix(estimatedCount, placeholders)
              + ', priced by courier chargeable weight, not by weight alone'}
            renderGlyph={(p) => <Glyph lineId={p.id} label={p.label} estimated={p.estimated} size={56} />}
          />

          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-neutral-600 dark:text-neutral-400">Weight</dt>
            <dd data-testid="parcel-weight" className="num">
              ~{gramsText(box.weightG)}{' '}
              <span className="text-xs text-neutral-500">after our packing allowance</span>
            </dd>
            <dt className="text-neutral-600 dark:text-neutral-400">Shipping method</dt>
            <dd data-testid="parcel-courier-method" className="num">
              {methodLabel} <span className="text-xs text-neutral-500">courier, not Japan Post</span>
            </dd>
          </dl>
        </div>
      </div>

      {/* **短くする。**この段落が長くなるほど、この区画の下にある順位表が下へ
          押される——過去に prose の長さだけで desktop の900px折り返しアサーションを
          壊したことがある（#77、e2e/parcel.spec.ts の fold テスト）。EMS 側の
          段落（`EMS is priced by weight alone…`）と同程度の長さに抑える。 */}
      <p className="mt-3 text-xs text-neutral-600 dark:text-neutral-400" data-testid="parcel-courier-explainer">
        {/* **方式に関係ない開示を先に言う。**旧来の説明段落を丸ごと入れ替えたときに
            ここが消える回帰を一度作った——重量の出どころは郵便でも宅配便でも
            同じ意味を持つデータの話であって、方式ごとの説明ではない。 */}
        <EstimatedDataDisclosure placeholders={placeholders} />
        Couriers charge by <strong>chargeable weight</strong> — actual weight or{' '}
        <strong>volumetric weight</strong> (size-based), whichever is larger. Unlike EMS,{' '}
        <strong>volume can raise the price</strong>, so a half-empty box can cost more than its contents weigh.
        The box shown ({DEFAULT_PARCEL_DIMENSIONS_CM.lengthCm}×{DEFAULT_PARCEL_DIMENSIONS_CM.widthCm}×
        {DEFAULT_PARCEL_DIMENSIONS_CM.heightCm} cm) is our assumption, not a measurement — the courier decides the
        real one.
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

/**
 * 区画の見出し。空でも中身が入っていても同じ場所に立つが、**「everything ships
 * together」は分かれていない箱にしか言えない主張**（F5、コーディネーター指摘
 * 2026-09-12）。分かれている（`split`）ときにこの文言を出すと、「まとめて送る
 * 前提の見積もり」という嘘を見出しが言うことになる——分かれる理由（重量上限・
 * 出品ごとの1注文・店舗不明など）は箱ごとに `REASON_TEXT` が既に言っている
 * ので、見出し側で新しく理由を作らない。分かれているときは中立な見出しにする。
 */
function ParcelHeading({ split = false }: { split?: boolean }) {
  return (
    <h2 className="font-mono text-[11px] uppercase tracking-[0.12em] text-neutral-600 dark:text-neutral-400">
      {split ? 'Parcel — split into separate boxes' : 'Parcel — if everything ships together'}
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
