import type { Metadata } from 'next';
import { SiteHeader } from '@/components/chrome/SiteHeader';
import { SiteFooter } from '@/components/chrome/SiteFooter';
import { ConsentBanner } from '@/components/chrome/ConsentBanner';
import './globals.css';

export const metadata: Metadata = {
  title: 'proxycost — what a Japanese proxy order actually costs you',
  description:
    'Compare the landed cost of a Japanese proxy-buying order across Buyee, ZenMarket, '
    + 'Neokyo, FROM JAPAN and Jauce. Ranked by total cost only.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh text-neutral-900 dark:text-neutral-100 antialiased">
        <SiteHeader />
        <main className="mx-auto w-full max-w-6xl px-4 pb-16">{children}</main>
        <SiteFooter />
        <ConsentBanner />
      </body>
    </html>
  );
}
