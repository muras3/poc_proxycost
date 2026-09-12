import type { CompareResult } from '@/lib/pricing/types';

/**
 * Buyee だけが「既定で注文ごとに別送」の外れ値。申請すれば同梱できるが、それが
 * 無料かどうかはこちらでは確認できていない（F14 — services.ts の Buyee 該当行を
 * 参照）。**「無料」と言い切ってよいかどうかは、この行の `total.high` を見て決める。**
 * `con.total.high === null` は上限が青天井であることの表明そのもの（原則1・原則2）
 * なので、それが立っている間は「free」という定数の主張を書けない。F14 の階層が
 * 変わって上限が閉じれば、ここは自動的に「free」側の文面に戻る——文言を持ち替える
 * 判断はここではなく `con.total.high` に置く。
 */
export interface ConsolidationCalloutData {
  serviceName: string;
  savingText: string;
  /** `con.total.high === null` そのもの。true の間は「free」と言い切れない。 */
  feeUnconfirmed: boolean;
}

/**
 * 表示するかどうか・何を言うかを、行から純粋に導く。**コンポーネント本体から
 * 切り出しているのはテストのため**——このリポジトリの慣習（`ParcelView.test.ts`
 * 等）は DOM を render せず、判断ロジックを純関数として直接検査する。
 */
export function consolidationCalloutData(result: CompareResult): ConsolidationCalloutData | null {
  const def = result.rows.find((r) => r.variant === 'default');
  const con = result.rows.find((r) => r.variant === 'consolidated');
  if (!def || !con) return null;
  const saving = def.total.low - con.total.low;
  if (saving <= 0) return null;
  return {
    serviceName: def.serviceName,
    savingText: `¥${saving.toLocaleString('en-US')}`,
    // `con.total.high === null` は上限が青天井であることの表明そのもの
    // （原則1・原則2）——それが立っている間は「free」という定数の主張を書けない。
    feeUnconfirmed: con.total.high === null,
  };
}

export function ConsolidationCallout({ result }: { result: CompareResult }) {
  const data = consolidationCalloutData(result);
  if (!data) return null;
  return (
    <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      If you use {data.serviceName}, ask them to consolidate before shipping. It may reduce
      the total by about {data.savingText} here — they ship each order separately unless you
      request it.{' '}
      {/* 「¥X or more (upper bound unknown)」と同じ語彙（RankBoard / totalIntervalText）
          を使う。ここだけ別の不確実性の言い回しを新しく作らない。 */}
      {data.feeUnconfirmed
        ? 'Whether they charge for consolidating is unconfirmed (upper bound unknown).'
        : 'Consolidating is free.'}
    </p>
  );
}
