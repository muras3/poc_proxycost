'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { Amount, tierClass } from '@/lib/ui/tiers';
import { foreign, totalIntervalText, yen, yenRange } from '@/lib/ui/format';
import { andList, totalIsCertain } from '@/lib/pricing/compare';
import { rateLabel } from '@/lib/pricing/rates';
import type { CompareResult, Row } from '@/lib/pricing/types';
import { DiffBar } from './DiffBar';
import { RowBreakdown } from './RowBreakdown';
import { TotalBar } from './TotalBar';
import { ArrivalBar } from './ArrivalBar';

/** 報酬を払う社だけ sponsored。払わない社に付けると虚偽の開示になる。 */
const rel = (paysUs: boolean) =>
  paysUs ? 'sponsored nofollow noopener noreferrer' : 'nofollow noopener noreferrer';

/**
 * **判定不能では「CHEAPEST」と言い切らない**（コーディネーター指摘、P1-3 追修正）。
 * `rankIndeterminate` は「比較可能な全社が枠＋同等に収まっていて、どの社が安いか
 * 判別できていない」状態そのものなので、下端最小の行にだけ「CHEAPEST」を付けると
 * すぐ下の `StabilityNote`（「we can't tell which one wins」）と同じ画面の中で
 * 自己矛盾する——このプロダクトが最も避けるべき欠陥。**「LEADS」に変える**
 * ——下端が最小である事実（`row.cheapest`）自体は本当なので消さないが、
 * 「安いと確定した」ではなく「今のところ先頭」だと分かる言葉にする。
 */
/**
 * この結果の1位（下端最小、同額ならその全員）の総額が「確定した点」か
 * （外部レビュー④）。確定していなければ、差額は下端どうしの差でしかなく
 * 「少なくとも」でしか言えない——`diffText` が使う。
 */
function leaderDiffCertain(result: CompareResult): boolean {
  const comparable = result.rows.filter((r) => r.comparable);
  if (!comparable.length) return true;
  const leadLow = comparable[0]!.total.low;
  const leaders = comparable.filter((r) => r.total.low === leadLow);
  return leaders.every((r) => totalIsCertain(r.total));
}

/**
 * 差額そのものが確定した点かどうか（外部レビュー2回目 A-4）。
 * `leaderDiffCertain` は1位側だけを見ていたが、**1位が確定していても、比べる
 * 相手の行自身が上限不明（`high === null`）や幅あり（`high > low`）なら、
 * 差額は下端どうしの差でしかない。**両方が確定しているときだけ言い切る。
 */
function diffCertainFor(row: Row, result: CompareResult): boolean {
  return leaderDiffCertain(result) && totalIsCertain(row.total);
}

/**
 * **2026-09-13、オーナー修正。**燃油込み・遠隔地除外という未確認の仮定に依存して
 * `total.high` が閉じた行を、一次情報で確定した行と同じ強さの「CHEAPEST」で
 * 呼ばない——正しくは「燃油込み・遠隔地除外という共通条件での推定最安」でしかない。
 *
 * **仮定に依存しない行は `CHEAPEST` のまま残す。**「全部 ESTIMATED CHEAPEST に
 * 寄せる」選択肢も検討したが、それだと一次情報で確定している46条件と、
 * 仮定に依存する266条件の区別が画面から消え、今回わざわざ `Row.closedByAssumption`
 * を足して区別できるようにした意味が無くなる。**迷ったときに弱い方へ寄せる**の
 * 対象は「仮定に依存する行の言い方」（CHEAPEST → ESTIMATED CHEAPEST）であって、
 * 「確定している行まで一律に弱める」ことではないと判断した。
 */
export function leadWordFor(row: Row, result: CompareResult): string {
  if (result.rankIndeterminate) return 'LEADS';
  return row.closedByAssumption.length > 0 ? 'ESTIMATED CHEAPEST' : 'CHEAPEST';
}

function diffText(row: Row, result: CompareResult): string {
  // 比較できない行に差額を出したら、比べられるかのように見える。
  if (!row.comparable) return 'NOT COMPARABLE';
  const leadWord = leadWordFor(row, result);
  if (result.rowDiffRange) {
    const r = result.rowDiffRange[row.id];
    if (r) return r[0] === 0 && r[1] === 0 ? leadWord : `+${yenRange(r)}`;
  }
  if (row.diff === 0) return leadWord;
  // **1位の総額が確定していなければ「少なくとも」**（外部レビュー④）。1位が
  // 上限不明（`total.high === null`）か幅を持つ（`high > low`）とき、1位の実際の
  // 総額はこの下端より高くなりうる——下端どうしの差はその分だけ縮む・逆転しうる。
  // 「ちょうどこれだけ高い」とは言えないので、そう断言しない。
  return diffCertainFor(row, result) ? `+${yen(row.diff)}` : `at least +${yen(row.diff)}`;
}

/**
 * **閉じた行専用の差額表示。**「at least」の言い回しを落とす（台帳 #22/#30、
 * Fable レビュー）——確度は `TotalBar` のフェードが形で伝えるので、閉じた行の
 * 文言は数字を二重に弱めない。全文（"at least +¥X" とその根拠）は
 * `RowBreakdown` の footer に残る（開いた中）。
 */
function diffTextClosed(row: Row, result: CompareResult): string {
  return diffText(row, result).replace(/^at least /, '');
}

/**
 * **閉じた行専用の総額表示。**「or more」「(upper bound unknown)」を落とす
 * （台帳 #22/#30）——`TotalBar` の右端フェードが同じ情報を形で伝えている。
 * 全文は `RowBreakdown` の footer に残る。
 */
function totalTextClosed(row: Row, result: CompareResult): string {
  return totalText(row, result)
    .replace(/\s*\(upper bound unknown\)/, '')
    .replace(/\s*or more$/, '');
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
    // **`r[1] === null`（上限不明）に偽の上端を書かない**（外部レビュー⑤-c）。
    // 段（重量不明）を通じても `totalIntervalText` に一本化し、下の閉じた経路と
    // 同じ「¥X or more」を出す。
    if (r) return `${row.approximate ? '~' : ''}${totalIntervalText({ low: r[0], high: r[1] }, true)}`
      + (r[1] === null ? ' (upper bound unknown)' : '');
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
  // **総額＋不確かさの棒は全行共通のスケール。**行ごとに最大を取ると、行間で
  // 棒の長さを比べられなくなる（scales.ts の TotalBar 参照）。上限不明の行は
  // `total.high` が無いので `total.low` で domain に参加する（実際の絵は
  // フェードで「その先」を示す——偽の上限を domain にも作らない）。
  const totalDomainMax = Math.max(
    0,
    ...rows.filter((r) => r.comparable).map((r) => r.total.high ?? r.total.low),
  );
  // **到着日数のドメインは固定**（`ArrivalBar` が `ARRIVAL_DOMAIN_MIN_DAYS`〜
  // `ARRIVAL_DOMAIN_MAX_DAYS` を使う）。行の実測 min/max から作ると、全行が
  // 同じ方式のときに棒が常に全幅へ張り付き、対数スケールの意味が消える
  // （Fable レビュー指摘）。
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
          // **判定不能のグループ化。**`showBracket` が false の間は緑の「おすすめ」枠を
          // 出さない代わりに、「1位と誤差で重なっている」という事実そのものは
          // 藍（indigo）の罫線で見せる——`recommended`/`equivalent` は
          // `rankIndeterminate` に関わらず同じ重なり判定（`computeBracket()`）から
          // 来ているので、バッジ（断定色の緑）だけを隠して、罫線（グルーピングの
          // 事実）は残す。
          const inIndeterminateGroup =
            result.rankIndeterminate && (row.recommended || row.equivalent);
          const boxCount = row.boxes.length;
          // **Buyee の 1⇄5**: 同じ社の default/consolidated の2行を、箱数の対比として
          // 見せる（P-B担当範囲）。相方の行を探し、両方の箱数を並べて出す。
          const sibling =
            row.variant && (row.variant === 'default' || row.variant === 'consolidated')
              ? rows.find((r) => r.serviceId === row.serviceId && r.id !== row.id)
              : null;
          return (
            <li
              key={row.id}
              data-row-id={row.id}
              data-indeterminate-group={inIndeterminateGroup ? 'true' : undefined}
              className={
                // **全行で左罫線の幅を予約する**（透明）——グループ行だけ 2px+pl-2 ずれると、
                // モバイルで棒の左端が行ごとにずれて共通スケールが崩れる。
                inBracket
                  ? 'border-l-2 border-emerald-500 dark:border-emerald-400'
                  : inIndeterminateGroup
                    ? 'border-l-2 border-indigo-500 dark:border-indigo-400'
                    : 'border-l-2 border-transparent'
              }
            >
              {/* **412px で右列（差額・総額）の長い文字列が左列を1語幅まで潰していた**
                  （コーディネーター指摘、P1-3 追修正）。上限不明の
                  「or more (upper bound unknown)」が右列の内容幅を押し広げ、
                  `shrink-0` の右列がそれを保とうとして、`min-w-0 flex-1` の
                  左列に負の残り幅を強い、単語ごとの折り返しに壊れていた
                  （e2e は Ranking セクションの y 座標しか見ていないので検出できず、
                  実測スクリーンショットで見つかった）。**`sm` 未満では縦積みにする**
                  ——右列が横幅いっぱいで自然に折り返せるようにし、左列を潰さない。 */}
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : row.id)}
                aria-expanded={isOpen}
                className={`flex w-full flex-col gap-1 py-3 text-left sm:flex-row sm:items-start sm:gap-3 pl-2`}
              >
                <span className="flex w-full items-start gap-3 sm:contents">
                {/* **比べられない行は順位の列から外す。**`row.comparable === false` の
                    行は総額を持たず並び替えにも参加していない（compare.ts の
                    `ok`/`notOk` で末尾に固定）ので、順位の数字を出すと
                    「この位置に順位がある」という嘘になる。 */}
                <span className="w-5 shrink-0 pt-0.5 text-sm text-neutral-500 dark:text-neutral-400 num">
                  {row.comparable ? row.rank : ''}
                </span>

                <span className="min-w-0 flex-1" data-testid="row-info">
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
                  {/* **船便の代案は開いた中へ**（PR-B、担当範囲の指示）。文章の段落を
                      閉じた行に残さない——中身は下の `isOpen` ブロックに移した。 */}
                </span>
                </span>

                {/* 差額が主役。総額はその下に小さく添える。
                    **412px 未満は横幅いっぱい・左寄せで折り返す。**`shrink-0` のまま
                    幅を持たせなかったのが崩れの原因だった（上のコメント）。 */}
                <span className="w-full text-left sm:w-48 sm:shrink-0 sm:text-right" data-testid="row-figures">
                  <span
                    className={`block font-semibold num ${
                      !row.comparable
                        ? 'text-xs text-neutral-500'
                        // **判定不能では緑（断定の色）を使わない。**「LEADS」の文字だけ
                        // 変えても、隣の「CHEAPEST」と同じ強い緑のままでは断定に見える。
                        : row.cheapest && !result.rankIndeterminate
                          ? 'text-lg text-emerald-700 dark:text-emerald-400'
                          : 'text-lg'
                    }`}
                  >
                    {diffTextClosed(row, result)}
                  </span>
                  {row.comparable && (
                    <span className="mt-1 block">
                      <DiffBar diff={row.diff} max={maxDiff} />
                    </span>
                  )}
                  <span className="mt-1 block text-xs text-neutral-500 num">
                    approx. total {totalTextClosed(row, result)}
                  </span>
                  {/* 総額＋不確かさの棒。全行共通スケール（`totalDomainMax`）。
                      比べられない行は総額そのものを名乗らないので棒も出さない。 */}
                  {row.comparable && (
                    <span className="mt-1 flex justify-start">
                      <TotalBar total={row.total} domainMax={totalDomainMax} />
                    </span>
                  )}
                  {/* Ships by ＋到着の棒。全行共通の固定対数スケール。
                      **比べられない行には出さない**（台帳、Fable レビュー）——
                      その方式ではそもそも送れないので、到着日数を出すと
                      「この方式で送れる」かのように見える。 */}
                  {row.comparable && (
                    <span className="mt-1.5 flex justify-start">
                      <ArrivalBar days={row.days} method={row.method} />
                    </span>
                  )}
                  {/* 箱数。Buyee の default/consolidated は 1⇄5 の対比で見せ、
                      左罫線（`inIndeterminateGroup`/`inBracket` と同じ場所を使わず、
                      専用の testid で対にする）で2行を結ぶ。 */}
                  <span
                    data-testid="box-count"
                    data-pair={sibling ? 'true' : 'false'}
                    className="mt-1 block text-xs text-neutral-500 num"
                  >
                    {sibling
                      ? `${boxCount} ⇄ ${sibling.boxes.length} box${
                          Math.max(boxCount, sibling.boxes.length) === 1 ? '' : 'es'
                        }`
                      : `${boxCount} box${boxCount === 1 ? '' : 'es'}`}
                  </span>
                </span>
              </button>

              {isOpen && (
                <div className="pb-4">
                  <RowBreakdown row={row} cheapest={cheapest} />
                  {/* **P2 4（オーナー確定 2026-09-12）: Surface は隠さず、別行も作らない。**
                      待てる利用者のための代替として、この社の行の中に副次行で出す
                      ——別 Row にすると1社が2回現れて5社比較が壊れる（オーナー明示）。
                      額は Surface 便**単体の送料**（`Row.surface.shipYen` のコメント）。
                      **PR-B: 閉じた行には文章の段落を置かないので、ここ（開いた中）に
                      移した。** */}
                  {row.surface && (
                    <p
                      data-testid="surface-alternative"
                      className="mt-2 text-xs text-neutral-500 dark:text-neutral-400"
                    >
                      Surface option — {row.surface.label}: {totalIntervalText(row.surface.shipYen)}
                      {' shipping, '}{row.surface.days}. {row.surface.note}.
                    </p>
                  )}
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
  // **1位の総額が確定していなければ「少なくとも」**（外部レビュー④、`diffText` と同じ規則）。
  // **相手の行自身が確定していなくても「少なくとも」**（外部レビュー2回目 A-4）。
  const leadersDiffCertain = leaders.every((r) => totalIsCertain(r.total));
  // **判定不能では「is cheapest」「are tied cheapest」と言い切らない**
  // （コーディネーター指摘、P1-3 追修正）。すぐ下の `StabilityNote` が
  // 「we can't tell which one wins」と言っているのと同じ画面内で「最安」と
  // 断定したら自己矛盾になる——CHEAPEST バッジ（`diffText`）と同じ欠陥。
  // `StabilityNote` に断定を任せ、ここは総額・換算だけを黙って出す
  // （`data-testid="summary"` は e2e が文言ではなく要素そのものを掴むための
  // フック——本文言を変えるたびにセレクタが壊れる P1-2 の事故と同じ形を
  // 繰り返さないため）。
  return (
    <p className="text-sm" data-testid="summary">
      {!result.rankIndeterminate && (
        <>
          <strong>
            {leaders.length > 1
              ? `${andList(leaders.map((r) => r.label))} are tied cheapest${qualify}.`
              : `${first.serviceName} is cheapest${qualify}.`}
          </strong>{' '}
        </>
      )}
      {!result.rankIndeterminate && rest.map((r, i) => (
        <span key={r.id}>
          {/* 重量が不明なときは差額も幅になる。1点に丸めて言い切らない。 */}
          {r.label} costs {result.rowDiffRange?.[r.id]
            ? yenRange(result.rowDiffRange[r.id]!)
            : leadersDiffCertain && totalIsCertain(r.total) ? yen(r.diff) : `at least ${yen(r.diff)}`} more{i === rest.length - 1 ? '.' : ', '}
        </span>
      ))}{' '}
      <span className="text-neutral-500">
        approx. total{' '}
        {/* **一番目立つ数字が上限不明を隠していた**（コーディネーター指摘、
            P1-3 追修正）。各行には「or more (upper bound unknown)」を付けているのに、
            要約のこの1数字だけ確定した額に見えていた——ページで最も目立つ数字が
            一番強く嘘をついている状態。`Amount` は単一の数値しか表せないので、
            `first.total.high === null` のときは `Amount` を使わず、区間テキスト
            （`totalIntervalText`）に「or more」を含めて出す。閉じている国（DE等）は
            従来どおり `Amount` の単一値のまま。 */}
        {first.total.high === null ? (
          <span className={first.approximate ? tierClass.estimate : tierClass.fixed}>
            {totalIntervalText(first.total, true)}
          </span>
        ) : (
          <Amount amount={first.total.low} tier={first.approximate ? 'estimate' : 'fixed'} round />
        )}
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
