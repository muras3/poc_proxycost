import type { ReactNode } from 'react';
import type { WeightCategory, WeightLine } from '@/data/weights';
import { emsFor, formatStep } from '@/lib/pricing/ems';
import { grams } from '@/lib/ui/format';
import { tierClass } from '@/lib/ui/tiers';

// 米国は第4地帯。段の例示に使う地帯を1つに固定しないと列が増える（docs/UI-DESIGN.md §5）。
const ZONE_FOR_DISPLAY = 4;

const HEAD = [
  'Product line', 'Median g', 'P25–P75', 'Spread', 'n',
  `EMS step (zone ${ZONE_FOR_DISPLAY})`, 'Source', 'Fetched',
];

/** n を記録できていない行は 0 ではなく「—」。**0 と書けば実測 0 件が実測値に見える。** */
function count(n: number): ReactNode {
  if (n <= 0) return <span className={tierClass.none} title="We did not record a sample size">—</span>;
  return <span className="tabular-nums">{n.toLocaleString('en-US')}</span>;
}

/** ばらつきは標本から出る数字なので、標本数が無い行では出さない。 */
function spread(line: WeightLine): ReactNode {
  if (line.n <= 0) return <span className={tierClass.none}>—</span>;
  return <span className="tabular-nums">{line.spread.toFixed(1)}x</span>;
}

function Cell({ label, children, className = '' }: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <td className={`block py-0.5 lg:table-cell lg:px-2 lg:py-2 lg:align-top ${className}`}>
      <span className="mr-2 inline-block w-28 align-top text-[11px] uppercase tracking-wide text-neutral-500 lg:hidden">
        {label}
      </span>
      <span className="inline-block align-top">{children}</span>
    </td>
  );
}

function CategoryTable({ cat }: { cat: WeightCategory }) {
  const source = cat.sources[0];

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-base font-semibold">{cat.labelEn}</h3>
        <span className="text-xs text-neutral-500" lang="ja">{cat.labelJa}</span>
        {cat.measured ? null : (
          <span
            className="rounded border border-amber-600/40 px-1.5 py-0.5 text-[11px] text-amber-700 dark:text-amber-400"
            title="These grams come from a shop catalogue, not from a scale"
          >
            not measured — shop-declared grams
          </span>
        )}
      </div>

      <table className="mt-3 w-full border-collapse text-sm">
        <thead className="hidden lg:table-header-group">
          <tr className="border-b border-neutral-300 text-left text-[11px] uppercase tracking-wide text-neutral-500 dark:border-neutral-700">
            {HEAD.map((h) => <th key={h} scope="col" className="px-2 py-2 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody className="block lg:table-row-group">
          {cat.lines.map((line) => {
            const step = emsFor(line.medianG, ZONE_FOR_DISPLAY);
            return (
              <tr
                key={line.id}
                id={line.id}
                className="mb-3 block scroll-mt-20 rounded-lg border border-neutral-200 p-3 target:border-amber-500 lg:mb-0 lg:table-row lg:rounded-none lg:border-0 lg:border-b lg:p-0 dark:border-neutral-800"
              >
                <Cell label="Line" className="font-medium">
                  {line.labelEn}
                  <span className="ml-2 text-[11px] font-normal text-neutral-500">
                    matches {line.match.join(', ')}
                  </span>
                </Cell>
                <Cell label="Median">
                  <span className={tierClass[line.tier]}>
                    {line.tier === 'estimate' ? '~' : ''}{grams(line.medianG)}
                  </span>
                </Cell>
                <Cell label="P25–P75">
                  <span className="tabular-nums text-neutral-600 dark:text-neutral-400">
                    {line.p25.toLocaleString('en-US')}–{line.p75.toLocaleString('en-US')} g
                  </span>
                </Cell>
                <Cell label="Spread">{spread(line)}</Cell>
                <Cell label="n">{count(line.n)}</Cell>
                <Cell label="EMS step">
                  <span className="tabular-nums">
                    {step.stepG == null ? '—' : formatStep(step.stepG)}
                  </span>
                </Cell>
                <Cell label="Source">
                  {source ? (
                    <a className="underline" href={source.url} target="_blank" rel="noopener noreferrer">
                      {source.domain}
                    </a>
                  ) : (
                    <span className={tierClass.none}>—</span>
                  )}
                </Cell>
                <Cell label="Fetched">
                  <span className="tabular-nums text-neutral-600 dark:text-neutral-400">{cat.checkedOn}</span>
                </Cell>
              </tr>
            );
          })}
        </tbody>
      </table>

      {cat.lines.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">No product lines recorded for this category yet.</p>
      ) : null}

      <p className="mt-3 text-xs text-neutral-600 dark:text-neutral-400">
        When a title matches none of these lines, the calculator does not guess a weight for you.
        It falls back to totals per EMS weight step.
        {cat.fallbackG == null
          ? ' There is no category fallback.'
          : ` Picking this category by hand uses ~${grams(cat.fallbackG)} as a stated assumption.`}
      </p>
    </section>
  );
}

export function WeightTable({ categories }: { categories: WeightCategory[] }) {
  if (categories.length === 0) {
    return (
      <p className="mt-6 text-sm text-neutral-500">
        No weight data has been collected yet. The calculator shows totals per EMS weight step
        for every category until it has.
      </p>
    );
  }
  return <div>{categories.map((cat) => <CategoryTable key={cat.category} cat={cat} />)}</div>;
}
