import Link from 'next/link';
import type { Item, WeightSensitivity } from '@/lib/pricing/types';
import { grams } from '@/lib/ui/format';

/**
 * 「この総額は、我々が勝手に置いた重量で出ている」を**カートで1回だけ**言う。
 *
 * 重量表に当たらない品には仮置き（`weightFieldsFor` の ASSUMED_WEIGHT_G）が黙って入る。
 * 行ごとには `assumed` と書いてあったが、**3点入れて3点とも仮置きだった利用者が、
 * 合計 ~3.9 kg が全部作り話だと気づかなかった。**行を1つずつ読まないと分からない
 * 形は、言っていないのと同じ。だからここで「何点中何点か」を1か所で言う。
 *
 * 推論を出すこと自体は禁じていない（このプロダクトは推論を推論と分かる形で出す）。
 * 足りなかったのは**推論だと分かる強さ**なので、強くするのはそこだけにする:
 *   ・引き当たっている品しか無いカートでは**何も出さない**（summary が null）
 *   ・数字は全部カートの中身から数える。**文言に埋め込まない**
 *   ・総額と順位への影響を言い、直す欄まで連れて行く
 */

export interface AssumedWeightsSummary {
  /** 仮置きの品数（**数量ではなく行数**）。 */
  count: number;
  /** カートの品数。 */
  totalCount: number;
  /** カートの全部が仮置きか。文言が変わる（割合ではなく「全部」と言う）。 */
  all: boolean;
  /** 仮置きぶんの重量（g）。**数量を掛ける。** */
  assumedG: number;
  /** 仮置き1点あたりの重量（g）。全点で揃っていなければ null。 */
  perItemG: number | null;
  /**
   * 仮置きが占める割合（0〜1）。重量の分かる品が1つも無ければ null。
   * **0 とは書かない**（持っていない割合は `—` ではなく、句ごと出さない）。
   */
  share: number | null;
  /** 仮置きのうち、その1点の重量だけで1位が替わる品数（compare() の weightSensitivity）。 */
  decisive: number;
  /** 「重量を入れる」で飛ばす先。最初の仮置きの品。 */
  focusId: string;
}

/**
 * カートから仮置きの状況を数える。**仮置きが1点も無ければ null**（＝画面に何も出さない）。
 * 引き当たっている品しか無いカートで注記を出すのは、静かにしろという約束を破ることになる。
 */
export function assumedWeightsSummary(
  items: readonly Item[],
  sensitivity: Record<string, WeightSensitivity> = {},
): AssumedWeightsSummary | null {
  const assumed = items.filter((i) => i.weightOrigin === 'assumed');
  if (assumed.length === 0 || items.length === 0) return null;

  const qty = (i: Item) => Math.max(1, i.qty);
  const weightOf = (i: Item) => (i.weightG == null ? null : i.weightG * qty(i));

  let assumedG = 0;
  for (const i of assumed) assumedG += weightOf(i) ?? 0;

  // 重量の分かっている品だけを分母にする。null の重量を 0 として足すと、
  // 「仮置きが占める割合」を実際より高く言うことになる。
  let cartG = 0;
  for (const i of items) cartG += weightOf(i) ?? 0;

  // 1点あたりの値。全点で揃っているときだけ「1点につき ~1 kg」と言える。
  const per = new Set(assumed.map((i) => i.weightG));
  const perItemG = per.size === 1 ? [...per][0] ?? null : null;

  return {
    count: assumed.length,
    totalCount: items.length,
    all: assumed.length === items.length,
    assumedG,
    perItemG,
    share: cartG > 0 ? assumedG / cartG : null,
    decisive: assumed.filter((i) => sensitivity[i.id]?.decisive).length,
    focusId: assumed[0]!.id,
  };
}

/** 四捨五入で 0% になる割合を「0%」と書かない。持っていない精度を主張しない。 */
function percent(share: number): string {
  const pct = Math.round(share * 100);
  if (pct < 1) return 'under 1%';
  if (pct > 99 && share < 1) return 'over 99%';
  return `${pct}%`;
}

/**
 * 注記の本文。**描画から切り離す**（vitest は node 環境なので、文はここで検査する）。
 * 数字は summary から来る。ここで足し引きしない。
 */
export function assumedWeightsText(s: AssumedWeightsSummary): {
  headline: string;
  placeholder: string;
  impact: string;
  decisive: string | null;
  action: string;
} {
  const them = s.count === 1 ? 'it' : 'them';
  const headline = s.all
    ? s.totalCount === 1
      ? 'This item has no weight data.'
      : `None of the ${s.totalCount} items in your cart have weight data.`
    : s.count === 1
      ? `1 of the ${s.totalCount} items in your cart has no weight data.`
      : `${s.count} of the ${s.totalCount} items in your cart have no weight data.`;

  // 仮置きの中身。1点ずつの値が揃っているなら「~1 kg each」、揃っていなければ合計だけ。
  const put = s.perItemG != null
    ? `We are pricing ${them} at a placeholder ~${grams(s.perItemG)}${s.count === 1 ? '' : ' each'}`
    : `We are pricing ${them} at placeholder weights totalling ~${grams(s.assumedG)}`;
  const scope = s.all
    ? ' — that is the whole parcel. Nothing in this box was measured or looked up.'
    : s.share != null
      ? ` — ~${grams(s.assumedG)}, ${percent(s.share)} of this parcel's weight.`
      : '.';

  return {
    headline,
    placeholder: `${put}${scope}`,
    impact:
      'Postage is most of what you pay, so the totals and the ranking below rest on'
      + ` ${s.count === 1 ? 'that number' : 'those numbers'}, not on data.`,
    decisive: s.decisive === 0
      ? null
      : s.decisive === 1
        ? `${s.count === 1 ? 'This weight' : 'One of them'} alone decides which service comes out cheapest.`
        : `${s.decisive} of them each decide which service comes out cheapest.`,
    action: s.count === 1 ? 'Enter the real weight' : 'Enter the real weights',
  };
}

/**
 * 仮置きの印。**色以外の記号**（docs/UI-DESIGN.md §6 は各段階に記号を1つ求める）。
 * `~` は推定、`✎` は利用者編集、`⚠` は1位を決める品に既に使っているので、
 * 「そもそも数字を持っていない」にはまだ空いている `?` を当てる。
 * 文字で同じことを書いてある場所にしか置かないので、読み上げからは外す。
 */
export function AssumedMark({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden
      data-testid="assumed-mark"
      title="No weight data for this title — the number is our placeholder"
      className={
        'inline-flex h-[1.05em] w-[1.05em] shrink-0 items-center justify-center rounded-full'
        + ` border border-current text-[0.8em] font-semibold leading-none ${className}`
      }
    >
      ?
    </span>
  );
}

/**
 * カートの見出しの直下に置く。**畳まれる `ul` の中には入れない** — 畳んだ開示は開示ではない。
 * 呼び出し側（ItemList）が `aria-live` の器を先に置いておく。器ごと現れる領域は
 * 読み上げられないので、ここで器を持つと「足したら仮置きだった」が読み上げから漏れる。
 */
export function AssumedWeightsNote({
  summary, onEnterWeights,
}: {
  summary: AssumedWeightsSummary | null;
  /** 最初の仮置きの品の重量欄へフォーカスを飛ばす。カートが畳まれていれば開いてから。 */
  onEnterWeights?: (() => void) | null;
}) {
  if (!summary) return null;
  const t = assumedWeightsText(summary);

  return (
    <div
      data-testid="assumed-weights"
      data-count={summary.count}
      data-total={summary.totalCount}
      className={
        'mt-2 rounded border border-amber-300 bg-amber-100 px-2 py-1.5 text-xs text-amber-900'
        + ' dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200'
      }
    >
      <p>
        <AssumedMark className="mr-1 translate-y-[0.1em]" />
        <strong className="font-semibold">{t.headline}</strong>{' '}
        {t.placeholder} {t.impact}
      </p>
      {/* 1位を決めている仮置きが在るときだけ。記号は色に頼らないため（§6）。 */}
      {t.decisive && (
        <p className="mt-1">
          <span aria-hidden>⚠ </span>
          {t.decisive}
        </p>
      )}
      <p className="mt-1">
        {/* 直す欄まで連れて行く。文だけ出して欄を探させるのは見逃されるのと同じ。 */}
        {onEnterWeights && (
          <>
            <button type="button" onClick={onEnterWeights} className="underline">
              {t.action}
            </button>
            {' · '}
          </>
        )}
        <Link href="/weights" className="underline">
          What weights we have
        </Link>
      </p>
    </div>
  );
}
