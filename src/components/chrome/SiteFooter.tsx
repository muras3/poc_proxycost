import Link from 'next/link';
import { SERVICES, SERVICES_CHECKED_ON } from '@/lib/pricing/services';

const REPO = 'https://github.com/muras3/poc_proxycost';

export function SiteFooter() {
  const pays = SERVICES.filter((s) => s.paysUs).map((s) => s.name);
  const free = SERVICES.filter((s) => !s.paysUs).map((s) => s.name);

  return (
    <footer className="mt-16 border-t border-neutral-200 dark:border-neutral-800">
      <div className="mx-auto w-full max-w-6xl space-y-3 px-4 py-8 text-xs text-neutral-600 dark:text-neutral-400">
        <p>
          <strong className="text-neutral-900 dark:text-neutral-100">
            The ranking is decided by total cost alone.
          </strong>{' '}
          It never looks at what a company pays us. {pays.join(', ')} pay us a referral fee.{' '}
          {free.join(' and ')} pay us nothing — and {free[0]} is often the cheapest.
          Outbound links are marked <code>rel=&quot;sponsored&quot;</code>.
        </p>
        <p>
          Fees checked on {SERVICES_CHECKED_ON}. Found a number that is wrong?{' '}
          <a className="underline" href={`${REPO}/issues`} target="_blank" rel="noopener noreferrer">
            Tell us on GitHub
          </a>.
        </p>
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          <Link href="/weights" className="underline">Shipping weights</Link>
          <Link href="/sources" className="underline">Sources and method</Link>
          <Link href="/privacy" className="underline">Privacy</Link>
          <a className="underline" href={REPO} target="_blank" rel="noopener noreferrer">Source code</a>
        </p>
      </div>
    </footer>
  );
}
