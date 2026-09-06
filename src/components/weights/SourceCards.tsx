import type { ReactNode } from 'react';
import type { WeightCategory, WeightSource } from '@/data/weights';
import { tierClass } from '@/lib/ui/tiers';

// verdict は取り込み判定そのもの（scripts/shopify-probe.mjs）。都合の悪い判定も出す。
const VERDICT_STYLE: Record<string, string> = {
  usable: 'border-neutral-400 text-neutral-700 dark:border-neutral-600 dark:text-neutral-300',
  suspect: 'border-amber-600/50 text-amber-700 dark:text-amber-400',
  pseudo: 'border-red-600/50 text-red-700 dark:text-red-400',
};

const VERDICT_TITLE: Record<string, string> = {
  usable: 'The distribution looks like real per-product data. Used in the calculator.',
  suspect: 'Partly usable. Read the note before trusting it.',
  pseudo: 'The shop puts the same grams on everything. Not used.',
};

function num(n: number): ReactNode {
  if (n <= 0) return <span className={tierClass.none} title="Not recorded">—</span>;
  return <span className="tabular-nums">{n.toLocaleString('en-US')}</span>;
}

function Card({ cat, src }: { cat: WeightCategory; src: WeightSource }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h3 className="text-sm font-semibold">{src.domain}</h3>
        <span
          className={`rounded border px-1.5 py-0.5 text-[11px] ${VERDICT_STYLE[src.verdict] ?? 'border-neutral-400 text-neutral-700 dark:border-neutral-600 dark:text-neutral-300'}`}
          title={VERDICT_TITLE[src.verdict] ?? src.verdict}
        >
          {src.verdict}
        </span>
        <span className="text-xs text-neutral-500">for {cat.labelEn}</span>
      </div>

      <p className="mt-2 break-all text-xs">
        <a className="underline" href={src.url} target="_blank" rel="noopener noreferrer">{src.url}</a>
      </p>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
        <div>
          <dt className="text-neutral-500">Products read</dt>
          <dd>{num(src.products)}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Variants with grams</dt>
          <dd>{num(src.variantsWithGrams)}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Fetched</dt>
          <dd className="tabular-nums">{cat.checkedOn}</dd>
        </div>
      </dl>

      <p className="mt-3 text-xs text-neutral-600 dark:text-neutral-400">
        <span className="text-neutral-500">Quality check: </span>
        <span lang="ja">{src.reason}</span>
      </p>
      {cat.notes ? (
        <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
          <span className="text-neutral-500">Note: </span>
          <span lang="ja">{cat.notes}</span>
        </p>
      ) : null}
    </div>
  );
}

export function SourceCards({ categories }: { categories: WeightCategory[] }) {
  const pairs = categories.flatMap((cat) => cat.sources.map((src) => ({ cat, src })));

  if (pairs.length === 0) {
    return <p className="mt-3 text-sm text-neutral-500">No sources recorded yet.</p>;
  }

  return (
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      {pairs.map(({ cat, src }) => (
        <Card key={`${cat.category}:${src.url}`} cat={cat} src={src} />
      ))}
    </div>
  );
}
