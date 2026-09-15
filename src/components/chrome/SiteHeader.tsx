import Link from 'next/link';

export function SiteHeader() {
  return (
    <header className="border-b-[3px] border-double border-ink pt-6 pb-2">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-baseline justify-between gap-x-5 gap-y-3 px-4">
        <Link
          href="/"
          className="font-display text-[32px] font-extrabold uppercase leading-none tracking-wide text-ink sm:text-[38px]"
        >
          proxy<span className="text-post-red">cost</span>
        </Link>
        <nav aria-label="Site" className="flex items-center gap-4 font-mono text-xs text-ink">
          <Link href="/weights" className="hover:underline">Weights</Link>
          <Link href="/sources" className="hover:underline">Sources</Link>
        </nav>
      </div>
      <p className="mx-auto mt-2 w-full max-w-6xl px-4 text-sm text-ink-2">
        What five Japanese proxies would charge you, landed at your door.{' '}
        <strong className="font-semibold text-ink">
          Some pay us, some don&apos;t — that never moves a row.
        </strong>
      </p>
    </header>
  );
}
