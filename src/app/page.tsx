import { Calculator } from '@/components/compare/Calculator';

// metadata は layout.tsx にある。ここは骨組みだけ。
export default function HomePage() {
  return (
    <>
      {/* 報酬の開示はここに置く。順位に効かせていないことを先に言う（Mock v3 `.lede`）。 */}
      <p className="lede">
        What five Japanese proxies would charge you, landed at your door.{' '}
        <b>Some pay us, some don&rsquo;t — that never moves a row.</b>
      </p>
      <Calculator />
    </>
  );
}
