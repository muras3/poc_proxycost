import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy — proxycost',
  description:
    'What proxycost collects (almost nothing), what the consent banner stores, which third parties '
    + 'are involved, and how referral fees work.',
};

const UPDATED = '2026-09-15';
const ISSUES = 'https://github.com/muras3/poc_proxycost/issues';
const REPO = 'https://github.com/muras3/poc_proxycost';
const CONTACT_EMAIL = 'contact@japanproxyguide.com';

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-10 text-lg font-semibold tracking-tight">{children}</h2>;
}

export default function PrivacyPage() {
  return (
    <article className="max-w-3xl py-8 text-sm text-neutral-700 dark:text-neutral-300">
      <header>
        <p className="text-xs uppercase tracking-wide text-neutral-500">proxycost</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
          Privacy
        </h1>
        <p className="mt-3">
          proxycost is a calculator. There is no account, no sign-up and no newsletter, and we have
          no interest in knowing who you are. This page says exactly what happens to the little data
          that does move around, including the parts we have not built yet.
        </p>
        <p className="mt-2 text-xs text-neutral-500">Last updated {UPDATED}.</p>
      </header>

      <H2>What we do not collect</H2>
      <p className="mt-2">
        No name, no email, no address, no payment details — the site never asks for any of them. We
        do not have a user database. We do not sell or share data with data brokers, and we do not
        run any tracking pixel or social widget.
      </p>

      <H2>Your basket stays in your browser</H2>
      <p className="mt-2">
        The items you add, the destination country and any weight or price you type live in the
        memory of the open page. They are not sent to us to be stored and they are not saved to your
        device: close or reload the tab and they are gone. The comparison itself is computed in your
        browser from tables that ship with the page.
      </p>

      <H2>Searching and pasting links</H2>
      <p className="mt-2">
        Two things do leave your browser, and only when you ask for them:
      </p>
      <ul className="mt-2 list-disc space-y-2 pl-5">
        <li>
          <span className="font-medium text-neutral-900 dark:text-neutral-100">A keyword search.</span>{' '}
          The words you type are sent to our server, which forwards them to the Brave Search API to
          get results back. Brave receives the query text and our request, not your identity.
        </li>
        <li>
          <span className="font-medium text-neutral-900 dark:text-neutral-100">A listing URL.</span>{' '}
          Our server fetches that page to read the price, the shipping terms and any weight it
          states. The shop sees a request from our server, not from you.
        </li>
      </ul>
      <p className="mt-2">
        We keep no database of what people searched for. Our host, Cloudflare, keeps ordinary request
        logs (IP address, time, path) for a short period as part of running and protecting the
        service, in the same way any web server does.
      </p>

      <H2>Cookies and local storage</H2>
      <p className="mt-2">
        The site sets no cookies of its own. The consent banner writes a single value in your
        browser local storage, <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">proxycost.consent.v1</code>,
        holding nothing but the word granted or denied. It stays on your device, is never sent to us,
        and exists only so the banner does not ask again on every page.
      </p>
      <p className="mt-2">
        To change your answer, clear this site from your browser storage settings. The banner will
        ask again and nothing else is lost, because nothing else is stored.
      </p>

      <H2>Advertising</H2>
      <p className="mt-2">
        We intend to fund the site with display advertising from Google AdSense, in one slot below
        the results. <span className="font-medium text-neutral-900 dark:text-neutral-100">The
        AdSense tag is not on the site yet</span> — the slot is a placeholder while we apply. When it
        goes live it will behave as follows, and we will update this page with the date it changed:
      </p>
      <ul className="mt-2 list-disc space-y-2 pl-5">
        <li>
          Nothing from an ad network loads until you press Accept. Press Reject and no ad script is
          requested at all, which means no advertising cookie is set.
        </li>
        <li>
          With consent, Google and its partners may set cookies or read device identifiers to select
          and measure ads. Their handling is covered by{' '}
          <a
            className="underline"
            href="https://policies.google.com/technologies/partner-sites"
            target="_blank"
            rel="noopener noreferrer"
          >
            how Google uses information from sites that use its services
          </a>.
        </li>
        <li>
          Ads are never placed inside the comparison, and an advertiser cannot buy a position in the
          ranking. The slot is labelled as unrelated to the ranking.
        </li>
      </ul>

      <H2>Analytics</H2>
      <p className="mt-2">
        We plan to add Cloudflare Web Analytics, which counts page views without cookies and without
        fingerprinting visitors. It is not installed yet either. If we ever want something that needs
        a cookie, it goes behind the consent banner like the ads do.
      </p>

      <H2>If you are in the EU or the UK</H2>
      <p className="mt-2">
        Germany, France and the United Kingdom are destinations this calculator supports, so we
        assume EU and UK visitors. Nothing that requires consent is loaded before you give it: the
        banner appears first, both buttons are equally available, and Reject is a real answer that we
        remember. The lawful basis for the ad and analytics scripts is your consent; for serving the
        page itself it is our legitimate interest in running a working website.
      </p>
      <p className="mt-2">
        Because we hold no account data, there is normally nothing personal of yours for us to show,
        correct or erase. If you believe we hold something about you, write to us and we will look.
      </p>

      <H2>Referral fees</H2>
      <p className="mt-2">
        <span className="font-medium text-neutral-900 dark:text-neutral-100">
          No proxy service pays us anything today.
        </span>{' '}
        As of {UPDATED} we have no affiliate contract with any of the five companies this
        calculator compares, so no outbound link earns us a referral fee, and none is marked{' '}
        <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">rel=&quot;sponsored&quot;</code>{' '}
        — links to the five proxy services carry plain{' '}
        <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">rel=&quot;nofollow noopener noreferrer&quot;</code>{' '}
        and none is marked sponsored. If that ever changes for a company, this page will say so,
        by name, with the date it started.
      </p>
      <p className="mt-2 font-medium text-neutral-900 dark:text-neutral-100">
        The ranking is decided by total cost alone. Whether a company pays us is displayed on its
        row, and it is never an input to the sort — the code never reads that field when it orders
        rows. The code that does the sorting is public — read it in the{' '}
        <a className="underline" href={REPO} target="_blank" rel="noopener noreferrer">repository</a>{' '}
        and check for yourself, or read{' '}
        <Link href="/sources" className="underline">how every number is sourced</Link>.
      </p>

      <H2>Children</H2>
      <p className="mt-2">
        The site is not directed at children and collects nothing that would identify anyone,
        whatever their age.
      </p>

      <H2>Changes</H2>
      <p className="mt-2">
        When this page changes, the date at the top changes with it, and the edit is a commit in the
        public repository. The two changes we already expect are the AdSense tag and Cloudflare Web
        Analytics going live.
      </p>

      <H2>Contact</H2>
      <p className="mt-2">
        Write to{' '}
        <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>{' '}
        for anything private — a data question, a correction you would rather not post publicly, or
        anything else about this page. For a public correction to a number on the site, use our{' '}
        <a className="underline" href={ISSUES} target="_blank" rel="noopener noreferrer">
          GitHub issue tracker
        </a>{' '}
        instead, so the fix and its source are visible to everyone. See also{' '}
        <Link href="/about" className="underline">who runs this site</Link>.
      </p>
    </article>
  );
}
