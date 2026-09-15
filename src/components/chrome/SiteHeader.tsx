import Link from 'next/link';

// 「1行の説明」（"Some pay us, some don't — that never moves a row."）は
// src/app/page.tsx のヒーロー文（同趣旨の開示）と重複するため、ここでは
// 出さない。ヘッダーは複数ページ（/weights /sources /privacy）で共通に
// 出るので、丈を Mock 相当まで太らせるとどのページでも最初の画面が
// 圧迫される（desktop layout の e2e が実測していた: 順位表が最初の
// 画面から押し出される）。ロゴ + ナビだけの一段に絞る。
export function SiteHeader() {
  return (
    <header className="border-b border-ink py-2">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-baseline justify-between gap-x-5 gap-y-1 px-4">
        <Link
          href="/"
          className="font-display text-xl font-extrabold uppercase leading-none tracking-wide text-ink"
        >
          proxy<span className="text-post-red">cost</span>
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-4 font-mono text-xs text-ink">
          <Link href="/weights" className="hover:underline">Weights</Link>
          <Link href="/sources" className="hover:underline">Sources</Link>
        </nav>
      </div>
    </header>
  );
}
