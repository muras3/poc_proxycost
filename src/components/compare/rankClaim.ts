import type { CompareResult, Item, Row, WeightSensitivity } from '@/lib/pricing/types';
import { andList } from '@/lib/pricing/compare';

/**
 * **順位について断定してよいのは、1位の区間が誰の区間とも交わっていないときだけ。**
 *
 * この1つの規則を、見出し（`Results`）・順位バッジと差額の棒（`RankRow`）・
 * カートの文言（`Cart` / `AssumedWeightsNote`）で共有する。以前はこの3か所が
 * それぞれ別の条件で語彙を選んでいて、**engine が「区間が交わっていて1位を
 * 名指しできない」と知っている状態が、見出しに一切現れていなかった**——
 * `rankIndeterminate`（1位自身の上限が開いている）のときだけ断定をやめ、
 * それ以外は `X is cheapest — ¥N below Y` と言い切っていた。
 *
 * **判定は作り直さない。engine の出力を読むだけ。**根拠は
 * `CompareResult.contestedIds`（`compare.ts` の `computeContested()`）ただ1つ。
 *
 * **`recommended` / `equivalent` は見出しに使わない**（レビュー指摘、2026-09-15）。
 * あれは「1位と判別が付かない社の集合」ではない:
 *   1. `BRACKET_CAP = 2` は**画面に囲える数の上限**であって判定ではない。
 *      3社以上が本当に判別不能でも2社しか `recommended` にならないので、
 *      それを読んで見出しを書くと**3社目を黙殺**した上に、CAP が判定を
 *      打ち切っただけの結果を「判定」として見せることになる。
 *   2. 枠の重なり判定は**推移的**（`bound` が行を通すたびに伸びる）。
 *      1位とは直接重ならないが2社目とは重なる社も枠／同等に入りうる。
 * `contestedIds` は CAP 無し・非推移で、1位グループの `rankHigh` とだけ比べる。
 */

export type Headline =
  /** 比較可能な行が2社未満。比べる相手が居ないので、順位について何も言わない。 */
  | { kind: 'none' }
  /** 1位自身の上限が開いている（`rankIndeterminate`）。既存の文言のまま変えない。 */
  | { kind: 'indeterminate' }
  /** `contestedIds` が1社。**断定してよい唯一のケース。** */
  | { kind: 'clear'; leader: Row; next: Row | undefined }
  /** 下端が同額。1社を名指ししない（従来どおり）。 */
  | { kind: 'tie'; names: string[]; contested: number }
  /** `contestedIds` が2社以上。区間が交わっているので、どちらが安いかは言えない。 */
  | { kind: 'tooClose'; names: string[] };

/** `contestedIds` を行に解決する。**id の順（下端の昇順）を保つ。** */
export function contestedRows(result: CompareResult): Row[] {
  const by = new Map(result.rows.map((r) => [r.id, r]));
  return result.contestedIds.map((id) => by.get(id)).filter((r): r is Row => r != null);
}

/**
 * この行の区間が1位と交わっているか——つまり「1位より高い」と言い切れない行か。
 * **1位自身も `contestedIds` に入る**ので、`row.cheapest` の行はここで真になる。
 * 差額を数値で出してよいかの判定（`diffIsEstablished`）はこの否定。
 */
export function isContested(row: Row, result: CompareResult): boolean {
  return row.comparable && result.contestedIds.includes(row.id);
}

/**
 * 差額を数値で言い切ってよい行か。区間が1位と交わっていたら、その差は
 * 確かめられていない——点推定どうしの引き算は、実際の総額の並びと逆になりうる。
 */
export function diffIsEstablished(row: Row, result: CompareResult): boolean {
  return row.comparable && !row.cheapest && !isContested(row, result);
}

/**
 * 見出しが何を言えるかを、engine の出力だけから決める。
 *
 * 優先順位:
 * 1. `none` — 比較可能が2社未満。相手が居ない。
 * 2. `indeterminate` — 1位自身の上限が開いている。**この PR では文言を変えない。**
 * 3. `tie` — 下端が同額。既存の「are tied cheapest」を残す（同額は既に1社を
 *    名指ししない形で正しい。「too close to call」に寄せると、「たまたま同額」と
 *    「区間が交わっている」の区別が画面から消える）。**ただし同額の社の外にも
 *    交わっている社が居れば、その数は言う。**
 * 4. `tooClose` — `contestedIds` が2社以上。**ここが今回埋めた穴。**
 * 5. `clear` — `contestedIds` が1社。断定してよい。
 */
export function headlineFor(result: CompareResult): Headline {
  const comp = result.rows.filter((r) => r.comparable);
  if (comp.length < 2) return { kind: 'none' };
  if (result.rankIndeterminate) return { kind: 'indeterminate' };

  const contested = contestedRows(result);
  const leaders = comp.filter((r) => r.cheapest);
  if (leaders.length > 1) {
    return { kind: 'tie', names: leaders.map((r) => r.label), contested: contested.length };
  }
  if (contested.length > 1) {
    // **CAP を掛けない。**3社以上でも全部名前を出す（社数が多いときは
    // `tooCloseText` が「A, B and 3 others」にまとめるが、**件数は必ず伝わる**）。
    return { kind: 'tooClose', names: contested.map((r) => r.label) };
  }
  return { kind: 'clear', leader: comp[0]!, next: comp.find((r) => !r.cheapest) };
}

/**
 * 交わっている社の並べ方。**4社以上は「A, B and N others」にまとめるが、
 * 黙殺はしない**——名前を全部並べると見出しが1行に収まらないので畳むだけで、
 * 何社が判別できていないかは必ず数字で出る。
 */
export function tooCloseText(names: string[]): string {
  if (names.length <= 3) return andList(names);
  const shown = names.slice(0, 2);
  const restN = names.length - shown.length;
  return `${shown.join(', ')} and ${restN} others`;
}

/**
 * 「この品の重量を確かめれば決まる」を**同格で**言うための材料。
 *
 * `weightSensitivity[id].decisive` だけでは**向きが分からない**
 * （レビュー指摘 B-3、2026-09-15）。`decisive` は「おすすめ枠の集合が変わった」
 * としか言っておらず、{A} → {A,B} という**広がる**変化でも真になる。そのとき
 * 「確かめれば決まる」と書けば嘘で、実際は「確かめると決まらなくなりうる」。
 * `contestedAtLow` / `contestedAtHigh`（その端で1位と判別が付かない社の数）を
 * 今の社数と見比べて、2方向に分ける。
 */
export type WeightEffect =
  /** 今は判別できていないが、この品を測れば1社に絞れる端がある。 */
  | { kind: 'settles'; items: Item[] }
  /** 今は1社に絞れているが、この品の重量しだいでは絞れなくなる。 */
  | { kind: 'unsettles'; items: Item[] }
  | { kind: 'none' };

export function weightEffectFor(result: CompareResult, items: readonly Item[]): WeightEffect {
  const now = result.contestedIds.length;
  const sens = result.weightSensitivity;
  const decisive = items.filter((i) => sens[i.id]?.decisive);
  if (!decisive.length || now === 0) return { kind: 'none' };

  // 「測れば決まる」= 今は2社以上が判別できていないのに、どちらかの端では1社に絞れる。
  const settles = decisive.filter((i) => {
    const w = sens[i.id]!;
    return now > 1 && (w.contestedAtLow === 1 || w.contestedAtHigh === 1);
  });
  if (settles.length) return { kind: 'settles', items: settles };

  // 「測ると決まらなくなりうる」= 今は1社に絞れているのに、どちらかの端では増える。
  const unsettles = decisive.filter((i) => {
    const w = sens[i.id]!;
    return now === 1 && (w.contestedAtLow > 1 || w.contestedAtHigh > 1);
  });
  if (unsettles.length) return { kind: 'unsettles', items: unsettles };

  return { kind: 'none' };
}

/**
 * 同格に置く1文。**描画から切り離す**（vitest は node 環境なので、文はここで検査する）。
 * 効果が無ければ null（黙る）。
 */
export function weightEffectText(e: WeightEffect): string | null {
  if (e.kind === 'none') return null;
  const n = e.items.length;
  if (e.kind === 'settles') {
    return n === 1
      ? 'Weigh this one item and the order settles.'
      : `Weigh ${n} of these items and the order settles.`;
  }
  return n === 1
    ? 'One item’s weight is a guess — the true weight could put this too close to call.'
    : `${n} item weights are guesses — the true weights could put this too close to call.`;
}

/**
 * 1点の品について、その重量を確かめると順位の判別がどちらへ動くか。
 * **`decisive` だけでは向きが分からない**ので、両端の `contestedAtLow`/`High` と
 * 今の社数を見比べる（`weightEffectFor` と同じ規則の1品版。カートが使う）。
 *
 *   - `settles`   … 今は判別できていないが、どちらかの端では1社に絞れる
 *   - `unsettles` … 今は1社に絞れているが、どちらかの端では絞れなくなる
 *   - `shifts`    … 社数は変わらないが顔ぶれが変わる（`decisive` が真の残り）
 */
export function itemWeightEffectKind(
  w: WeightSensitivity, nowContested: number,
): 'settles' | 'unsettles' | 'shifts' {
  if (nowContested > 1 && (w.contestedAtLow === 1 || w.contestedAtHigh === 1)) return 'settles';
  if (nowContested === 1 && (w.contestedAtLow > 1 || w.contestedAtHigh > 1)) return 'unsettles';
  return 'shifts';
}

/** カート・順位の札で使う短い言い方。**「決まる」と言い切ってよいのは `settles` だけ。** */
export function itemWeightEffectPhrase(kind: 'settles' | 'unsettles' | 'shifts'): string {
  if (kind === 'settles') return 'This weight settles 1st place.';
  if (kind === 'unsettles') return 'This weight could put 1st place too close to call.';
  return 'This weight changes who is in contention for 1st.';
}
