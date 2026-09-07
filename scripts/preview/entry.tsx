import { createRoot } from 'react-dom/client';
import { SiteHeader } from '@/components/chrome/SiteHeader';
import { SiteFooter } from '@/components/chrome/SiteFooter';
import { ConsentBanner } from '@/components/chrome/ConsentBanner';
import { Calculator } from '@/components/compare/Calculator';

// 本体と同じ部品をそのまま並べる。layout.tsx の中身と同じ構成。
function App() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 pb-16">
        <Calculator />
      </main>
      <SiteFooter />
      <ConsentBanner />
    </>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
