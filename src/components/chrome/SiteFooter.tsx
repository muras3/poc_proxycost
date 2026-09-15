import Link from 'next/link';
import { SERVICES_CHECKED_ON } from '@/lib/pricing/services';

const REPO = 'https://github.com/muras3/poc_proxycost';

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-rule">
      <div className="mx-auto w-full max-w-6xl space-y-3 px-4 py-8 font-mono text-xs text-ink-2">
        <p>
          <strong className="font-sans font-semibold text-ink">
            The ranking is decided by total cost alone.
          </strong>{' '}
          It never looks at what a company pays us. No company pays us today — this line will name
          any that do, the day that changes.
        </p>
        <p>
          Fees checked on {SERVICES_CHECKED_ON}. Found a number that is wrong?{' '}
          <a className="underline" href={`${REPO}/issues`} target="_blank" rel="noopener noreferrer">
            Tell us on GitHub
          </a>.
        </p>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-4 gap-y-1">
          <Link href="/weights" className="underline">Shipping weights</Link>
          <Link href="/sources" className="underline">Sources and method</Link>
          <Link href="/privacy" className="underline">Privacy</Link>
          <Link href="/about" className="underline">About</Link>
          <a className="underline" href={REPO} target="_blank" rel="noopener noreferrer">Source code</a>
        </nav>
      </div>
    </footer>
  );
}
