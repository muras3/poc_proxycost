import type { Metadata } from 'next';
import Link from 'next/link';
import { FeeTable } from '@/components/sources/FeeTable';
import { EmsTable } from '@/components/sources/EmsTable';
import { TaxTable } from '@/components/sources/TaxTable';
import { SERVICES_CHECKED_ON } from '@/lib/pricing/services';
import {
  ALTERNATIVE_SHIPPING, ALTERNATIVE_SHIPPING_CHECKED_ON,
} from '@/lib/pricing/shipping-methods';
import {
  RATES, RATES_AS_OF, RATES_FETCHED_ON, RATES_SOURCE_NAME, RATES_SOURCE_URL, RATES_STALE, rateLabel,
} from '@/lib/pricing/rates';
import { TierLegend, tierClass, tierTitle } from '@/lib/ui/tiers';
// **この節の数字は手で書かない。**measured.test.ts が compare() で測り直して縛る。
import {
  CONFIDENCE_SPLIT, CROSSOVER_G, GB_SPLIT, MEASURED_BASKET, WEIGHT_SHIFT, yen,
} from './measured';

export const metadata: Metadata = {
  title: 'Sources and method — proxycost',
  description:
    'Every fee, EMS price and import tax the calculator uses, with the page it was read from and '
    + 'the date. Plus what we measured: the largest line is a published EMS rate looked up with a '
    + 'weight we guessed, and the ranking itself changes with that weight.',
};

const ZENMARKET_INVOICE = 'https://nyamo.life/archives/zenmarket.html';

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-20 text-lg font-semibold tracking-tight">
      {children}
    </h2>
  );
}

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
              The order of the companies, and the gap between them, <em>for the weight you gave
              us</em>. Those come from published fee tables and one published postage table. If we
              say one service costs ¥1,500 more than another for your basket, that is the number to
              act on — and it is decided by the total alone, never by which company pays us.
            </p>
          </div>
          <div className="rounded-lg border border-dashed border-neutral-300 p-4 dark:border-neutral-700">
            <h2 className="text-sm font-semibold">What we do not stand behind</h2>
            <p className="mt-2 text-sm text-neutral-700 dark:text-neutral-300">
              The total. The EMS rate in it is published by Japan Post, but the weight we look it
              up with is a guess — and so is the domestic postage inside Japan, and what your
              customs will do. That is why totals are rounded and carry a{' '}
              <span className={tierClass.estimate}>~</span>. And because the weight is a
              guess, <strong>we do not promise the order holds if that guess is wrong</strong> —
              see below. Confirm the total on the proxy site before you pay.
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
        <p className="mt-3 max-w-3xl text-sm text-neutral-700 dark:text-neutral-300">
          EMS is also the only method we price, and it is not the cheapest one on offer. In the{' '}
          <a
            className="underline"
            href="https://www.post.japanpost.jp/int/charge/list/index.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            Japan Post rate tables
          </a>{' '}
          we read on {ALTERNATIVE_SHIPPING_CHECKED_ON}, EMS was cheapest at none of the weights we
          checked: small packet costs 40–50% less than EMS up to 2 kg, and surface mail runs a third
          to a half of the EMS price above that. Every service below sells methods we leave out, so
          a real order can come in under the totals on the front page. We quote none of those rates
          because each company only shows them inside a logged-in quote, and a guessed rate would be
          an unverified number printed as if it were theirs.
        </p>
        <ul className="mt-4 max-w-3xl space-y-3 text-sm text-neutral-700 dark:text-neutral-300">
          {ALTERNATIVE_SHIPPING.map((s) => (
            <li key={s.serviceId}>
              <span
                className={s.tier === 'fixed' ? 'font-semibold' : `font-semibold ${tierClass.unverified}`}
                title={s.tier === 'fixed' ? undefined : tierTitle.unverified}
              >
                {s.serviceName}
              </span>
              {' — besides EMS: '}
              {s.methods.join(', ')}.{' '}
              <a
                className="underline"
                href={s.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {s.serviceName} shipping page
              </a>
              {`, read ${s.checkedOn}`}
              {/* 保存版から読んだ社は、いつ採られた写しかまで書く。「read 2026-09-06」だけだと
                  9か月前の内容を今日の実測に見せてしまう（shipping-methods.ts の capturedOn）。 */}
              {s.capturedOn
                ? ` on an archived copy captured ${s.capturedOn}, because the live page blocks us`
                : ''}
              {s.note ? ` — ${s.note}` : '.'}
            </li>
          ))}
        </ul>
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
              <tr key={r.tier} className="border-b border-neutral-100 dark:border-neutral-900">
                <td className="py-2 pr-2 text-neutral-700 dark:text-neutral-300">{r.what}</td>
                <td className="px-2 py-2 text-right tabular-nums">{yen(r.yen)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{r.share}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 max-w-3xl text-sm text-neutral-700 dark:text-neutral-300">
          Most of a total is printed somewhere — but the biggest printed line, EMS, is picked by a
          weight we estimated, so the share above is not a promise about the total. For the United
          Kingdom the split is {GB_SPLIT.publishedShare} published against{' '}
          {GB_SPLIT.inferredShare} inferred — a published VAT rate moves more onto the known side. A tool that printed{' '}
          {yen(WEIGHT_SHIFT.find((r) => r.perItemG === MEASURED_BASKET.weightG)!.totalYen)} in
          large type would be claiming a precision it does not have, so the calculator rounds
          totals to ¥100 and prints the gap between companies to the yen instead.
        </p>
      </section>

      <section className="mt-12">
        <H2 id="stability">What happens when the weight guess is wrong</H2>
        <p className="mt-2 max-w-3xl text-sm text-neutral-700 dark:text-neutral-300">
          Five items at ¥3,000 from Yahoo! Auctions to the United States, with the per-item weight
          moved from a third of our estimate to five times it:
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
                <td className="px-2 py-2 text-right tabular-nums">{yen(r.totalYen)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{r.delta}</td>
                <td className="px-2 py-2">{r.cheapest}</td>
                <td className="px-2 py-2">{r.last}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 max-w-3xl text-sm text-neutral-700 dark:text-neutral-300">
          The total nearly doubles, and <strong>the first place changes too.</strong> Neokyo is
          cheapest up to about 1.6 kg per item; above that FROM JAPAN is. At 1,500 g the two are
          ¥50 apart — a tenth of a percent. We used to claim here that the ranking survived a
          five-fold weight error in all seven destinations. It does not. That claim came from an
          earlier version of this calculator that rounded parcels above 15 kg down to the 15 kg
          price, billed a Buyee fee that does not exist, and treated Neokyo&rsquo;s ¥350 as if it
          included domestic postage. Once those were corrected, the crossovers landed at{' '}
          {CROSSOVER_G[2]!.toLocaleString('en-US')} g for two items,{' '}
          {CROSSOVER_G[3]!.toLocaleString('en-US')} g for three and{' '}
          {CROSSOVER_G[5]!.toLocaleString('en-US')} g for five — ordinary weights for the things
          people buy through a proxy.
        </p>
        <p className="mt-3 max-w-3xl text-sm text-neutral-700 dark:text-neutral-300">
          So the calculator tells you when your result sits near a crossover, and the weight you type
          in matters more than any other number on the page. What still holds is that the ranking is
          decided by the total alone: some of these companies pay us and some do not, and that never
          moves a row.
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
          fixed rates: {Object.entries(RATES).map(([code, rate], i) => (
            <span key={code} className="tabular-nums">
              {i > 0 ? ', ' : ''}¥{rateLabel(rate)}/{code}
            </span>
          ))}.
        </p>
        <p className="mt-2 max-w-3xl text-sm text-neutral-700 dark:text-neutral-300">
          Those came from the{' '}
          <a className="underline" href={RATES_SOURCE_URL} target="_blank" rel="noopener noreferrer">
            {RATES_SOURCE_NAME}
          </a>
          , which is the reference rate for{' '}
          <span className="tabular-nums">{RATES_AS_OF}</span>; we read that file and copied the
          numbers across by hand on <span className="tabular-nums">{RATES_FETCHED_ON}</span>. The two
          dates differ because the ECB publishes on business days only, and the later one is the day
          we did the copying — not a day the bank quoted anything.
          {Object.keys(RATES_STALE).length === 0
            ? ' All six currencies come out of that one file, so none of them is older than the others.'
            : ` We could not read ${Object.keys(RATES_STALE).join(', ')} from it; those are still at`
              + ' their previous value and are not from the date above.'}
        </p>
        <p className="mt-2 max-w-3xl text-sm text-neutral-700 dark:text-neutral-300">
          The ECB quotes every currency against the euro, so the yen rates above are cross-rates:
          yen-per-euro divided by currency-per-euro, rounded to the sen. We do not fetch live rates:
          a live feed is one more thing that can be down, and it would move your total between two
          page loads for no gain. Your card issuer will use its own rate and add its own margin,
          which we do not model. These rates also decide which side of a country&rsquo;s duty-free
          threshold your goods fall on, so when they go stale the tax line can be wrong, not just the
          currency next to the total.
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
