import type { Metadata } from 'next';
import { Big_Shoulders, Public_Sans, Spline_Sans_Mono } from 'next/font/google';
import { SiteHeader } from '@/components/chrome/SiteHeader';
import { SiteFooter } from '@/components/chrome/SiteFooter';
import { ConsentBanner } from '@/components/chrome/ConsentBanner';
import './globals.css';

// ロゴのみに使う見出し用フォント。本文には出さない。
const bigShoulders = Big_Shoulders({
  subsets: ['latin'],
  weight: ['700', '800'],
  variable: '--font-big-shoulders',
  display: 'swap',
});

// 本文用。和文フォールバックはシステムフォント（Hiragino Sans / Noto Sans JP）に任せ、
// IBM Plex Sans JP はセルフホストしない ── 和文サブセットをバンドルに乗せるコストを避ける。
const publicSans = Public_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-public-sans',
  display: 'swap',
});

// 数字・コード用の等幅フォント。
const splineMono = Spline_Sans_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-spline-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'proxycost — what a Japanese proxy order actually costs you',
  description:
    'Compare the landed cost of a Japanese proxy-buying order across Buyee, ZenMarket, '
    + 'Neokyo, FROM JAPAN and Jauce. Ranked by total cost only.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${bigShoulders.variable} ${publicSans.variable} ${splineMono.variable}`}
    >
      <body className="min-h-dvh bg-paper text-ink font-sans antialiased">
        <SiteHeader />
        <main className="mx-auto w-full max-w-6xl px-4 pb-16">{children}</main>
        <SiteFooter />
        <ConsentBanner />
      </body>
    </html>
  );
}
