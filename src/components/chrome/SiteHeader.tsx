import Link from 'next/link';

export function SiteHeader() {
  return (
    <header className="border-b border-neutral-200 dark:border-neutral-800">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          proxycost
        </Link>
        <nav className="flex gap-4 text-xs text-neutral-600 dark:text-neutral-400">
          <Link href="/weights" className="hover:underline">Weights</Link>
          <Link href="/sources" className="hover:underline">Sources</Link>
        </nav>
      </div>
    </header>
  );
}
