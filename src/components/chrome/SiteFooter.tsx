import Link from 'next/link';
import { RATES_AS_OF, RATES_FETCHED_ON } from '@/lib/pricing/rates';
import { SERVICES_CHECKED_ON } from '@/lib/pricing/services';

const REPO = 'https://github.com/muras3/poc_proxycost';

/**
 * フッター。Mock v3 の `footer`（2段落 ＋ ナビ）。日付はマスタから。
 *
 * 開示文は main の事実（2026-09-15、PR #170）: 代行5社のどことも契約が無い。
 * Mock は「X pay us; Y don't」と社名を列挙する形だったが、全社 `paysUs=false` の
 * いまそれをやると主語の無い文になる（`andList([])` が空文字）ので、列挙はしない。
 * 払う社が現れたら、この文を書き換える（`SERVICES[].paysUs` と services.test.ts が
 * 全社 false を検査しているので、契約が入ればテストが先に落ちる）。
 */
export function SiteFooter() {
  return (
    <footer>
      <div>
        <p>
          Rows are ordered by total only. No company pays us for referrals today — and even if
          one did, payment would never move a row.
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
        <Link href="/about">About</Link>
        <a href={REPO} target="_blank" rel="noopener noreferrer">Source code</a>
      </nav>
    </footer>
  );
}
