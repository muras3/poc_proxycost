import type { CompareResult, CountryCode } from '@/lib/pricing/types';
import { RemoteAreaSurchargeNote } from './RemoteAreaSurchargeNote';
import { RestrictedGoodsNote } from './RestrictedGoodsNote';

/**
 * **常時の2つの開示を、文章の帯ではなく小さなアイコン2つにする**（mock-v3 §5
 * 「the two always-on lines become 2 icon buttons; wording only inside the popover」）。
 *
 * 文言そのもの（`RestrictedGoodsNote`/`RemoteAreaSurchargeNote`）は一切変えない
 * ——e2e が一言一句で掴んでいる本文をここで書き換えると数値以外でも壊れる。
 * このコンポーネントは**見せ方だけ**を変える薄いラッパー: `<details>` を使うので
 * タップでもキーボード（Enter/Space、Tab で `<summary>` にフォーカス）でも開閉できる。
 *
 * 常時出す条件は元のコンポーネントと同じ（`result.rows.length` が無ければ両方とも
 * 何も描かない）——順位が無いときに「見ていない」と言う対象も無い。
 */
export function AlwaysOnIcons({
  result, country,
}: { result: CompareResult; country: CountryCode }) {
  if (!result.rows.length) return null;

  return (
    <div
      role="group"
      aria-label="Always-on notes"
      className="flex flex-wrap items-center gap-2 border-t border-b border-neutral-200 py-2 dark:border-neutral-800"
    >
      <details className="group relative">
        <summary
          data-testid="icon-shippability"
          className="flex h-7 w-7 cursor-pointer list-none items-center justify-center rounded-full border border-neutral-400 text-xs text-neutral-700 marker:content-none dark:border-neutral-600 dark:text-neutral-300"
          aria-label="Whether this parcel can actually be shipped — not checked"
          title="Whether this parcel can actually be shipped — not checked"
        >
          <span aria-hidden>?</span>
        </summary>
        <div className="absolute left-0 z-10 mt-2 w-72 rounded border border-neutral-300 bg-neutral-50 p-3 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
          <RestrictedGoodsNote result={result} country={country} />
        </div>
      </details>

      <details className="group relative">
        <summary
          data-testid="icon-fuel-remote"
          className="flex h-7 w-7 cursor-pointer list-none items-center justify-center rounded-full border border-neutral-400 text-xs text-neutral-700 marker:content-none dark:border-neutral-600 dark:text-neutral-300"
          aria-label="Fuel and remote-area surcharges — what is and is not included"
          title="Fuel and remote-area surcharges — what is and is not included"
        >
          <span aria-hidden>⛽</span>
        </summary>
        <div className="absolute left-0 z-10 mt-2 w-72 rounded border border-neutral-300 bg-neutral-50 p-3 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
          <RemoteAreaSurchargeNote result={result} />
        </div>
      </details>
    </div>
  );
}
