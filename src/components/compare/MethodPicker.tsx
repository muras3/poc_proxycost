'use client';

import { COURIER_METHODS, POSTAL_METHODS, courierMethodAvailable } from '@/lib/pricing/postage';
import type { CountryCode, CourierMethod, PostalMethod } from '@/lib/pricing/types';

/**
 * 国際配送の方式の選択。**方式は利用者が選ぶもの**で、代行はメニューを出すだけ
 * （Neokyo 原文「please select Japan Post as the shipment method」）。
 *
 * **既定は `cheapest`（運べる中で最安、Surface を除く）。**（P2、オーナー確定
 * 2026-09-12）——郵便4方式に加え、価格化した宅配便もこの既定の候補に入る
 * （`compare.ts` の `DEFAULT_METHOD`）。Surface は1〜3か月かかるので既定候補
 * から外し、`Row.surface` に別枠で出す（`RankBoard`/`RowBreakdown` 参照）。
 *
 * **額をここに出さない。**額は個口の数で決まり、個口の数は社ごとに違う
 * （Buyee の既定は注文ごとに別送）。1つの数字を選択肢に書くと、5社のうち1社にしか
 * 当たらない額を全社の額として見せることになる。**額と可否は各行の表が持つ**
 * ——運べない方式を選んだ行は `compare()` が比較不能にして理由を書く。
 *
 * 出すのは**日数と追跡**。船便は 3kg で EMS より ¥5,100 安いが 1〜3 か月かかるので、
 * 選ぶ前に時間が見えていないと、安いほうを選ばせる誤誘導になる。
 *
 * **宅配便は国ごとに価格化の有無が違う**（いまは米国のみ、`courierMethodAvailable`）。
 * 未測定の国でその便を選べる顔をすると「選べるのに¥0/空欄」という嘘になるので、
 * **選べなくし、理由をその場に書く**（隠して消すと「そんな便は無い」に見えるので、
 * 一覧からは消さない——docs/UI-DESIGN.md の「無い」と「選べない」を混同しない規律）。
 */
export function MethodPicker({
  value, onChange, country,
}: {
  value: PostalMethod | CourierMethod | 'cheapest';
  onChange: (m: PostalMethod | CourierMethod | 'cheapest') => void;
  country: CountryCode;
}) {
  return (
    <label className="flex min-w-0 items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
      Ship by
      <select
        id="ship-by-select"
        value={value}
        onChange={(e) => onChange(e.target.value as PostalMethod | CourierMethod | 'cheapest')}
        className="min-w-0 max-w-full rounded border border-neutral-300 bg-transparent px-2 py-1 text-xs dark:border-neutral-700"
      >
        {/* **既定ではないが隠さない。**総額を一番小さくする選び方を知りたい人は多いはず。
            行ごとに「運べる中で最安」を選ぶので、社によって違う方式になりうる。 */}
        <option value="cheapest">Cheapest that fits — per service</option>
        <optgroup label="Japan Post">
          {POSTAL_METHODS.map((m) => (
            <option key={m.id} value={m.id}>
              {`${m.label} · ${m.days}${m.tracked ? '' : ' · no tracking'}`}
            </option>
          ))}
        </optgroup>
        <optgroup label="Courier">
          {COURIER_METHODS.map((m) => {
            const available = courierMethodAvailable(m.id, country);
            return (
              <option key={m.id} value={m.id} disabled={!available}>
                {available
                  ? `${m.label} · ${m.days}`
                  : `${m.label} — not priced for this destination`}
              </option>
            );
          })}
        </optgroup>
      </select>
    </label>
  );
}
