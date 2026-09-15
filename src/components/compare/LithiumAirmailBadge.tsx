import { COUNTRIES } from '@/lib/pricing/countries';
import type { CompareResult, CountryCode } from '@/lib/pricing/types';

/**
 * **監査 #83（`docs/internal/caveat-register.csv`）: リチウム電池の航空郵便を
 * 受けない宛先（このツールが扱う7カ国では GB・DE）は常時表示。**
 *
 * grammar.md §1.1 の判定どおり「宛先の事実は記号にできない」——赤い `!` だけを
 * 重ねても、何が変わるかまでは読めない。だから記号（`!`）と短い1語ラベル
 * （`Li-ion: no airmail`）を必ず両方出す。`AlwaysOnIcons` の `<details>` の
 * 中には**置かない**——送れるかどうかが変わる段1の情報を押さないと読めない
 * 場所に置いたら、それは開示ではなく隠蔽になる（main では常時表示だった、
 * コーディネーター指摘 2026-09-15）。
 *
 * 判定は `result.destinationFacts.lithiumAirmailListed`（`compare()` が国だけで
 * 決めて転記した事実、`src/lib/pricing/types.ts` の doc comment 参照）を
 * そのまま読むだけ——**国コードの文字列判定はしない**。
 */
export function LithiumAirmailBadge({
  result, country, className = '',
}: { result: CompareResult; country: CountryCode; className?: string }) {
  if (!result.rows.length) return null;
  if (result.destinationFacts.lithiumAirmailListed) return null;

  return (
    <p
      data-testid="lithium-airmail-badge"
      className={`flex items-center gap-1.5 text-xs font-medium text-post-red dark:text-red-400 ${className}`}
    >
      <span
        aria-hidden
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-post-red text-[10px] font-bold leading-none text-white dark:bg-red-600"
      >
        !
      </span>
      <span>
        Li-ion: no airmail —{' '}
        <span className="font-normal text-neutral-600 dark:text-neutral-400">
          Japan Post does not list {COUNTRIES[country].name} among the destinations that can
          receive air mail containing lithium batteries.
        </span>
      </span>
    </p>
  );
}
