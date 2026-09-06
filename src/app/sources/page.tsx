import type { Metadata } from 'next';
import Link from 'next/link';
import { FeeTable } from '@/components/sources/FeeTable';
import { EmsTable } from '@/components/sources/EmsTable';
import { TaxTable } from '@/components/sources/TaxTable';
import { SERVICES_CHECKED_ON } from '@/lib/pricing/services';
import { RATES, RATES_AS_OF } from '@/lib/pricing/rates';
import { TierLegend, tierClass } from '@/lib/ui/tiers';

export const metadata: Metadata = {
  title: 'Sources and method — proxycost',
  description:
    'Every fee, EMS price and import tax the calculator uses, with the page it was read from and '
    + 'the date. Plus what we measured: about half of a total is inferred, and the ranking still holds.',
};

const ZENMARKET_INVOICE = 'https://nyamo.life/archives/zenmarket.html';

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-20 text-lg font-semibold tracking-tight">
      {children}
    </h2>
  );
}

// DESIGN-NOTES §1 の測定。5点 × ¥3,000 を米国へ送った場合の内訳。
const CONFIDENCE_SPLIT = [
  { what: 'Published price lists — the fee exists and the amount is printed', yen: 16750, share: '50%' },
  { what: 'The fee certainly applies, the amount is our estimate — domestic and international shipping', yen: 13500, share: '40%' },
  { what: 'Second-hand figures — US duty 12.5%, USPS handling $9.35', yen: 3278, share: '10%' },
];

// 重量を 1/3〜5倍 に外しても順位は動かない（7カ国すべてで）。
const WEIGHT_SHIFT = [
  { weight: '200 g', total: '¥27,128', delta: '−19%' },
  { weight: '600 g (our estimate)', total: '¥33,528', delta: '0%' },
  { weight: '1,500 g', total: '¥48,828', delta: '+46%' },
  { weight: '3,000 g', total: '¥62,178', delta: '+85%' },
];

export default function SourcesPage() {
  return (
    <article className="py-8">
      <header>
        <p className="text-xs uppercase tracking-wide text-neutral-500">proxycost</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Sources and method</h1>

        <div className="mt-4 grid max-w-4xl gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-neutral-300 p-4 dark:border-neutral-700">
            <h2 className="text-sm font-semibold">What we stand behind</h2>
            <p className="mt-2 text-sm text-neutral-700 dark:text-neutral-300">
              The order of the companies, and the gap between them. Those come from published fee
              tables and one published postage table, and they survive being wrong about the weight
              by a factor of five. If we say one service costs ¥2,950 more than another for your
              basket, that is the number to act on.
            </p>
          </div>
          <div className="rounded-lg border border-dashed border-neutral-300 p-4 dark:border-neutral-700">
            <h2 className="text-sm font-semibold">What we do not stand behind</h2>
            <p className="mt-2 text-sm text-neutral-700 dark:text-neutral-300">
              The total. About half of it is inferred — the weight of your parcel, the domestic
              postage inside Japan, and what your customs will do. That is why totals are rounded and
              carry a <span className={tierClass.estimate}>~</span>. Confirm the total on the proxy
              site before you pay.
            </p>
          </div>
        </div>

        <TierLegend className="mt-4" />
        <p className="mt-2 text-xs text-neutral-500">
          Fees read on {SERVICES_CHECKED_ON}.{' '}
          <Link href="/weights" className="underline">Where the weights come from</Link>
        </p>
      </header>

      <section className="mt-12">
        <H2 id="fees">Proxy service fees</H2>
        <p className="mt-2 max-w-3xl text-sm text-neutral-700 dark:text-neutral-300">
          Each row is read from the company page linked at the end of the row.
        </p>
        <div className="mt-4">
          <FeeTable />
        </div>

        <div className="mt-6 grid max-w-4xl gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-neutral-200 p-4 text-sm dark:border-neutral-800">
            <h3 className="font-semibold">Jauce</h3>
            <ul className="mt-2 space-y-2 text-neutral-700 dark:text-neutral-300">
              <li>
                The only one of the five that charges on value: ¥400 per item plus 8% of the winning
                bid. On a cheap item it is the cheapest fee here; on an expensive one it is not.
              </li>
              <li>
                International postage is the Japan Post EMS price with no markup. We checked that
                against the published table rather than assuming it.
              </li>
              <li>
                Rakuten and Yahoo! Shopping carry no service fee while that part of the site is in
                beta, so a Jauce total for those two shops can change without warning.
              </li>
              <li>
                The deposit fee is written as ¥40 plus 3.9%. We read it as a flat ¥40 first and the
                percentage grossed up on top,{' '}
                <span className={tierClass.unverified}>but we have not seen the original wording</span>.
              </li>
            </ul>
          </div>

          <div className="rounded-lg border border-neutral-200 p-4 text-sm dark:border-neutral-800">
            <h3 className="font-semibold">FROM JAPAN</h3>
            <ul className="mt-2 space-y-2 text-neutral-700 dark:text-neutral-300">
              <li>
                You will find a 5% fee, and 10% above $50, quoted for this company in a lot of
                places. Those belong to FROM USA, a different service for American goods. They do not
                apply to anything bought in Japan. We charge ¥500 per item, which is what the
                official help text says.
              </li>
              <li>
                Payment Fees Inside Japan of ¥200 is real, but the original does not say whether it
                is charged once per order or once per item. We apply it once per order and mark it{' '}
                <span className={tierClass.unverified}>second-hand</span> so you can see the
                assumption.
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mt-12">
        <H2 id="ems">EMS postage from Japan</H2>
        <p className="mt-2 max-w-3xl text-sm text-neutral-700 dark:text-neutral-300">
          All five services quote EMS for the parcels this calculator covers, and none of them adds a
          markup that we could find. So the postage line is the same table for everybody, and what
          differs is how many parcels each company sends and how much packing weight it adds.
        </p>
        <div className="mt-4">
          <EmsTable />
        </div>
      </section>

      <section className="mt-12">
        <H2 id="tax">Import duty and tax</H2>
        <p className="mt-2 max-w-3xl text-sm text-neutral-700 dark:text-neutral-300">
          This is the weakest part of the calculation and we would rather say so than paper over it.
          Rows stay in the table even when we have nothing for them.
        </p>
        <div className="mt-4">
          <TaxTable />
        </div>
      </section>

      <section className="mt-12">
        <H2 id="measured">How much of a total is actually known</H2>
        <p className="mt-2 max-w-3xl text-sm text-neutral-700 dark:text-neutral-300">
          Five items at ¥3,000 each, shipped to the United States. We split the total by where each
          yen came from:
        </p>
        <table className="mt-4 w-full max-w-3xl border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-300 text-left text-[11px] uppercase tracking-wide text-neutral-500 dark:border-neutral-700">
              <th scope="col" className="py-2 pr-2 font-medium">Where the number comes from</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">Amount</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">Share</th>
            </tr>
          </thead>
          <tbody>
            {CONFIDENCE_SPLIT.map((r) => (
              <tr key={r.share} className="border-b border-neutral-100 dark:border-neutral-900">
                <td className="py-2 pr-2 text-neutral-700 dark:text-neutral-300">{r.what}</td>
                <td className="px-2 py-2 text-right tabular-nums">¥{r.yen.toLocaleString('en-US')}</td>
                <td className="px-2 py-2 text-right tabular-nums">{r.share}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 max-w-3xl text-sm text-neutral-700 dark:text-neutral-300">
          About half of a total is inference. For the United Kingdom the split is 47% published
          against 53% inferred. A tool that printed ¥33,528 in large type would be claiming a
          precision it does not have, so the calculator rounds totals to ¥100 and prints the gap
          between companies to the yen instead.
        </p>
      </section>

      <section className="mt-12">
        <H2 id="stability">What happens when the weight guess is wrong</H2>
        <p className="mt-2 max-w-3xl text-sm text-neutral-700 dark:text-neutral-300">
          Same basket, same destination, with the per-item weight moved from a third of our estimate
          to five times it:
        </p>
        <table className="mt-4 w-full max-w-3xl border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-300 text-left text-[11px] uppercase tracking-wide text-neutral-500 dark:border-neutral-700">
              <th scope="col" className="py-2 pr-2 font-medium">Weight per item</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">Total</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">Against our estimate</th>
              <th scope="col" className="px-2 py-2 font-medium">Cheapest</th>
              <th scope="col" className="px-2 py-2 font-medium">Most expensive</th>
            </tr>
          </thead>
          <tbody>
            {WEIGHT_SHIFT.map((r) => (
              <tr key={r.weight} className="border-b border-neutral-100 dark:border-neutral-900">
                <td className="py-2 pr-2 tabular-nums">{r.weight}</td>
                <td className="px-2 py-2 text-right tabular-nums">{r.total}</td>
                <td className="px-2 py-2 text-right tabular-nums">{r.delta}</td>
                <td className="px-2 py-2">Neokyo</td>
                <td className="px-2 py-2">Buyee, default</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 max-w-3xl text-sm text-neutral-700 dark:text-neutral-300">
          The total moves by 85%. The first place and the last place do not move at all, and they do
          not move in any of the seven destinations either. The estimate lands on every company at
          once, so it cancels out of the comparison. That is the whole reason this site leads with
          the ranking and the gap rather than with the total.
        </p>
      </section>

      <section className="mt-12">
        <H2 id="reversal">The one thing that changes the winner</H2>
        <p className="mt-2 max-w-3xl text-sm text-neutral-700 dark:text-neutral-300">
          Neokyo includes domestic shipping inside Japan in its service fee, which is most of why it
          usually wins. When the seller ships free, that advantage disappears and FROM JAPAN comes
          first instead. This is the only reversal we have found — and it is not a guess: whether the
          seller charges for shipping is stated on the listing page, so pasting the listing URL
          settles it. Picking an item from search results cannot settle it, which is why the
          calculator asks for the URL at that point rather than quietly assuming ¥800.
        </p>
      </section>

      <section className="mt-12">
        <H2 id="verified">A number we checked against a real invoice</H2>
        <p className="mt-2 max-w-3xl text-sm text-neutral-700 dark:text-neutral-300">
          ZenMarket takes 3.5% of the whole payment, which means the fee has to be grossed up: to end
          up with ¥10,000 of balance you must send 10,000 / (1 − 0.035) = ¥10,362.7. A user in Taiwan
          published the invoice they actually received: <span className="tabular-nums">¥10,363</span>.
          One yen apart. Our deposit-fee model reproduces that, so we use gross-up rather than a flat
          3.5% of the goods.{' '}
          <a className="underline" href={ZENMARKET_INVOICE} target="_blank" rel="noopener noreferrer">
            The published invoice
          </a>
        </p>
      </section>

      <section className="mt-12">
        <H2 id="fx">Exchange rates</H2>
        <p className="mt-2 max-w-3xl text-sm text-neutral-700 dark:text-neutral-300">
          Everything is computed in yen. Conversions shown next to a total are a convenience, at
          fixed rates read on {RATES_AS_OF}: {Object.entries(RATES).map(([code, rate], i) => (
            <span key={code} className="tabular-nums">
              {i > 0 ? ', ' : ''}¥{rate}/{code}
            </span>
          ))}. We do not fetch live rates: a live feed is one more thing that can be down, and it
          would move your total between two page loads for no gain. Your card issuer will use its own
          rate and add its own margin, which we do not model.
        </p>
      </section>

      <section className="mt-12">
        <H2 id="wrong">Found something wrong</H2>
        <p className="mt-2 max-w-3xl text-sm text-neutral-700 dark:text-neutral-300">
          These figures go stale — companies change fees and Japan Post changes postage. If a number
          here does not match what a company charged you, that is worth more to us than anything
          else on this page.{' '}
          <a
            className="underline"
            href="https://github.com/muras3/poc_proxycost/issues"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open an issue on GitHub
          </a>{' '}
          and say which line and what you were charged.
        </p>
      </section>
    </article>
  );
}
