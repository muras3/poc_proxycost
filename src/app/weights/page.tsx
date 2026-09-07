import type { Metadata } from 'next';
import Link from 'next/link';
import { WEIGHT_CATEGORIES, WEIGHTS_CHECKED_ON } from '@/data/weights';
import { ASSUMED_WEIGHT_G } from '@/lib/pricing/weights';
import { grams } from '@/lib/ui/format';
import { WeightTable } from '@/components/weights/WeightTable';
import { SourceCards } from '@/components/weights/SourceCards';
import { TierLegend } from '@/lib/ui/tiers';

export const metadata: Metadata = {
  title: 'Shipping weights we use — proxycost',
  description:
    'Median shipping weight per product line, with sample size, spread, source and fetch date. '
    + 'These are the weights the proxy-cost calculator puts through the EMS table.',
};

const ISSUES = 'https://github.com/muras3/poc_proxycost/issues';

// 実データが無いカテゴリ。**データをでっち上げない。**計算機は 1,000 g を「仮置き」と
// 名乗って入れ、その場で直してもらう（docs/UI-DESIGN.md §4）。
// 他のエージェントが WEIGHT_CATEGORIES に追記しうるので、id が入ってきたら自動で消える。
const NOT_COVERED = [
  { id: 'instruments', label: 'Musical instruments', why: 'the one catalogue we probed put 180 kg on every guitar' },
  { id: 'cameras', label: 'Cameras and lenses', why: 'the shop we probed puts 1,500 g on every item' },
  { id: 'games', label: 'Games and consoles', why: 'no catalogue with per-product grams found yet' },
  { id: 'apparel', label: 'Clothing and outfit sets', why: 'not attempted yet' },
  { id: 'books-manga-illustrated', label: 'Illustrated reference books', why: 'the book line was read from novels; a large-format art book or encyclopedia is a different object' },
  { id: 'games-handheld', label: 'Handheld consoles', why: 'only 26 rows in the one catalogue that publishes console weights, under our threshold of 50' },
];

export default function WeightsPage() {
  const covered = WEIGHT_CATEGORIES.map((c) => c.labelEn);
  const missing = NOT_COVERED.filter(
    (m) => !WEIGHT_CATEGORIES.some((c) => c.category === m.id),
  );
  const fetchDates = Array.from(
    new Set([WEIGHTS_CHECKED_ON, ...WEIGHT_CATEGORIES.map((c) => c.checkedOn)]),
  ).sort().reverse();

  return (
    <article className="py-8">
      <header>
        <p className="text-xs uppercase tracking-wide text-neutral-500">proxycost</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Shipping weights we use</h1>
        <p className="mt-3 max-w-3xl text-sm text-neutral-700 dark:text-neutral-300">
          The biggest line in a proxy quote is the international postage, and EMS is priced by weight
          step, not by the gram. So the weight decides the quote. Every weight this calculator uses
          is on this page, with the shop it came from, how many products it was read from, and when.
        </p>
        <p className="mt-2 text-xs text-neutral-500">
          Last fetched {WEIGHTS_CHECKED_ON}.{' '}
          {covered.length > 0 ? `Covered so far: ${covered.join(', ')}.` : 'Nothing covered yet.'}{' '}
          <Link href="/sources" className="underline">Fees, EMS and tax sources</Link>
        </p>
        <TierLegend className="mt-3" />
      </header>

      <WeightTable categories={WEIGHT_CATEGORIES} />

      <section className="mt-12">
        <h2 className="text-lg font-semibold tracking-tight">Sources</h2>
        <p className="mt-2 max-w-3xl text-sm text-neutral-700 dark:text-neutral-300">
          One card per catalogue we read. The verdict is the automated distribution check, not our
          opinion, and a bad verdict is printed here rather than quietly dropped.
        </p>
        <SourceCards categories={WEIGHT_CATEGORIES} />
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold tracking-tight">Not covered</h2>
        <p className="mt-2 max-w-3xl text-sm text-neutral-700 dark:text-neutral-300">
          We have no weight data we trust for these. The calculator does not pretend otherwise: it
          starts such an item at an assumed {grams(ASSUMED_WEIGHT_G)}, labels it as assumed right next
          to the weight box, and tells you when that one number is what decides the cheapest option.
          Type the real weight there and the ranking follows.
        </p>
        {missing.length > 0 ? (
          <ul className="mt-3 space-y-1 text-sm">
            {missing.map((m) => (
              <li key={m.id} className="text-neutral-700 dark:text-neutral-300">
                <span className="font-medium text-neutral-900 dark:text-neutral-100">{m.label}</span>
                <span className="text-neutral-500"> — {m.why}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-neutral-500">Every category on our list now has data.</p>
        )}
        <p className="mt-3 text-sm">
          Know a shop that publishes per-product weights for one of these?{' '}
          <a className="underline" href={ISSUES} target="_blank" rel="noopener noreferrer">
            Tell us on GitHub
          </a>{' '}
          and we will read it and put the numbers here.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold tracking-tight">Method</h2>
        <ol className="mt-3 max-w-3xl space-y-3 text-sm text-neutral-700 dark:text-neutral-300">
          <li>
            <span className="font-medium text-neutral-900 dark:text-neutral-100">
              1. Shopify grams is an input to a shipping calculator, not a measurement.
            </span>{' '}
            A shop types it in so its own checkout can quote postage. When a shop uses flat or banded
            rates the field becomes a placeholder — every 1/7 scale figure at exactly 1,500 g is that
            pattern. Good enough to pick an EMS step, not a measured weight, and we never call it one.
          </li>
          <li>
            <span className="font-medium text-neutral-900 dark:text-neutral-100">
              2. We judge the distribution before we use it.
            </span>{' '}
            For each catalogue we look at how many distinct values there are, how large a share the
            single most common value takes, and what fraction of values are suspiciously round. That
            gives usable, suspect or pseudo. Pseudo catalogues are thrown away, not averaged in.
          </li>
          <li>
            <span className="font-medium text-neutral-900 dark:text-neutral-100">
              3. We keep the aggregate, not the catalogue.
            </span>{' '}
            The raw product listings belong to the shops that published them, so we store only the
            per-line median, quartiles and count you see above, and we link to the source so you can
            re-read it yourself.
          </li>
        </ol>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold tracking-tight">Fetch history</h2>
        <ul className="mt-3 space-y-1 text-sm tabular-nums text-neutral-700 dark:text-neutral-300">
          {fetchDates.map((d) => <li key={d}>{d}</li>)}
        </ul>
        <p className="mt-2 text-xs text-neutral-500">
          Each date is when the catalogue behind the rows above was last read. Every change to these
          numbers is a commit in the public repository.
        </p>
      </section>
    </article>
  );
}
