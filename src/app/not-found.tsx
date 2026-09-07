import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="py-24 text-center">
      <p className="text-sm text-neutral-500">404</p>
      <h1 className="mt-2 text-xl font-semibold">Nothing here.</h1>
      <Link href="/" className="mt-4 inline-block text-sm underline">
        Back to the calculator
      </Link>
    </div>
  );
}
