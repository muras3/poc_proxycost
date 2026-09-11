'use client';

import { POSTAL_METHODS } from '@/lib/pricing/postage';
import type { PostalMethod } from '@/lib/pricing/types';

/**
 * 国際配送の方式の選択。**方式は利用者が選ぶもの**で、代行はメニューを出すだけ
 * （Neokyo 原文「please select Japan Post as the shipment method」）。
 *
 * **既定は EMS のまま。**「運べる中で最安」を既定にすると、最安はたいてい船便
 * （1〜3か月）なので**ほぼ誰も払わない額を総額として出す**ことになる。各社の画面が
 * 既定で何を選んでいるかは未取得（`docs/O2-CALCULATOR-RUN.md` フェーズ1）。
 * 答えが出たら `compare()` の `DEFAULT_METHOD` を変える。
 *
 * **額をここに出さない。**額は個口の数で決まり、個口の数は社ごとに違う
 * （Buyee の既定は注文ごとに別送）。1つの数字を選択肢に書くと、5社のうち1社にしか
 * 当たらない額を全社の額として見せることになる。**額と可否は各行の表が持つ**
 * ——運べない方式を選んだ行は `compare()` が比較不能にして理由を書く。
 *
 * 出すのは**日数と追跡**。船便は 3kg で EMS より ¥5,100 安いが 1〜3 か月かかるので、
 * 選ぶ前に時間が見えていないと、安いほうを選ばせる誤誘導になる。
 */
export function MethodPicker({
  value, onChange,
}: {
  value: PostalMethod | 'cheapest';
  onChange: (m: PostalMethod | 'cheapest') => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
      Ship by
      <select
        id="ship-by-select"
        value={value}
        onChange={(e) => onChange(e.target.value as PostalMethod | 'cheapest')}
        className="rounded border border-neutral-300 bg-transparent px-2 py-1 text-xs dark:border-neutral-700"
      >
        {/* **既定ではないが隠さない。**総額を一番小さくする選び方を知りたい人は多いはず。
            行ごとに「運べる中で最安」を選ぶので、社によって違う方式になりうる。 */}
        <option value="cheapest">Cheapest that fits — per service</option>
        {POSTAL_METHODS.map((m) => (
          <option key={m.id} value={m.id}>
            {`${m.label} · ${m.days}${m.tracked ? '' : ' · no tracking'}`}
          </option>
        ))}
      </select>
    </label>
  );
}
