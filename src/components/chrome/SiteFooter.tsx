import Link from 'next/link';
import { RATES_AS_OF, RATES_FETCHED_ON } from '@/lib/pricing/rates';
import { SERVICES, SERVICES_CHECKED_ON } from '@/lib/pricing/services';
import { andList } from '@/lib/pricing/compare';

const REPO = 'https://github.com/muras3/poc_proxycost';

/** フッター。Mock v3 の `footer`（2段落 ＋ ナビ）。社名と日付はマスタから。 */
export function SiteFooter() {
  const pays = SERVICES.filter((s) => s.paysUs).map((s) => s.name);
  const free = SERVICES.filter((s) => !s.paysUs).map((s) => s.name);

  return (
    <footer>
      <div>
        <p>
          Rows are ordered by total only. {andList(pays)} pay us for referrals; {andList(free)}{' '}
          don&rsquo;t. Payment never moves a row.
        </p>
        <p>
          Fees checked {SERVICES_CHECKED_ON} · rates read {RATES_FETCHED_ON} · currency: ECB
          reference rate for {RATES_AS_OF} · all totals in yen.{' '}
          <a href={`${REPO}/issues`} target="_blank" rel="noopener noreferrer">
            Found a number that is wrong?
          </a>
        </p>
      </div>
      <nav aria-label="Footer">
        <Link href="/weights">Weights</Link>
        <Link href="/sources">Sources</Link>
        <Link href="/privacy">Privacy</Link>
        <a href={REPO} target="_blank" rel="noopener noreferrer">Source code</a>
      </nav>
    </footer>
  );
}
