import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'About — proxycost',
  description:
    'What proxycost is, who runs it, and how the ranking is decided. Independent, not affiliated '
    + 'with any proxy-buying service, and not funded by any of them.',
};

const UPDATED = '2026-09-15';
const ISSUES = 'https://github.com/muras3/poc_proxycost/issues';
const REPO = 'https://github.com/muras3/poc_proxycost';
const CONTACT_EMAIL = 'contact@japanproxyguide.com';

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-10 text-lg font-semibold tracking-tight">{children}</h2>;
}

export default function AboutPage() {
  return (
    <article className="max-w-3xl py-8 text-sm text-neutral-700 dark:text-neutral-300">
      <header>
        <p className="text-xs uppercase tracking-wide text-neutral-500">proxycost</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
          About
        </h1>
        <p className="mt-3">
          proxycost is a calculator that compares what five Japanese proxy-buying services — Buyee,
          ZenMarket, Neokyo, FROM JAPAN and Jauce — would charge to land the same item at your door,
          including service fees, domestic and international shipping, and import tax where we could
          confirm it. It ranks them by that total alone.
        </p>
        <p className="mt-2 text-xs text-neutral-500">Last updated {UPDATED}.</p>
      </header>

      <H2>Who runs this</H2>
      <p className="mt-2">
        proxycost is built and run independently by a single individual developer in Japan. It is not
        a company, and it is not staffed. There is no editorial team and no customer support line —
        just the person who maintains the code and the numbers.
      </p>

      <H2>Not affiliated with any proxy service</H2>
      <p className="mt-2">
        proxycost is not affiliated with, endorsed by, or operated on behalf of Buyee, ZenMarket,
        Neokyo, FROM JAPAN, Jauce, or any other proxy-buying service it compares. We read each
        company&rsquo;s own published price list and, where we could confirm it, its tax and shipping
        terms — nothing about the comparison comes from those companies vouching for us or us for
        them.
      </p>
      <p className="mt-2">
        As explained on the{' '}
        <Link href="/privacy" className="underline">Privacy</Link> page, no company pays us a
        referral fee today. If that ever changes for a specific company, we will say so by name,
        with the date it started, on that page and next to that company&rsquo;s row.
      </p>

      <H2>How the ranking works</H2>
      <p className="mt-2">
        The ranking is decided by total landed cost alone — the sum of every fee we could confirm,
        for the item, weight and destination you enter. It is never adjusted for who pays us,
        who advertises, or who we like. The code that sorts the rows is public; read it in the{' '}
        <a className="underline" href={REPO} target="_blank" rel="noopener noreferrer">repository</a>{' '}
        or see <Link href="/sources" className="underline">how every number is sourced</Link>.
      </p>

      <H2>Contact</H2>
      <p className="mt-2">
        Write to{' '}
        <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>{' '}
        with questions about the site or this page. To correct a number on the site, use our{' '}
        <a className="underline" href={ISSUES} target="_blank" rel="noopener noreferrer">
          GitHub issue tracker
        </a>{' '}
        instead, so the fix and its source are visible to everyone.
      </p>
    </article>
  );
}
