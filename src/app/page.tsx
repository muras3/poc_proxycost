import { Calculator } from '@/components/compare/Calculator';

// metadata は layout.tsx にある。ここは骨組みだけ。
export default function HomePage() {
  return (
    <div className="py-6">
      <h1 className="text-lg font-semibold tracking-tight">
        What five Japanese proxies would charge you, landed
      </h1>
      {/* 報酬の開示はここに置く。順位に効かせていないことを先に言う。 */}
      <p className="mt-1 max-w-2xl text-xs text-neutral-600 dark:text-neutral-400">
        Buyee, ZenMarket, Neokyo, FROM JAPAN and Jauce, ranked by the total that reaches your
        door. No company pays us — and even if that changes, it would never move a row.
      </p>
      <Calculator />
    </div>
  );
}
