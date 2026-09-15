import { Calculator } from '@/components/compare/Calculator';

// metadata は layout.tsx にある。ここは骨組みだけ。
export default function HomePage() {
  return (
    <>
      {/*
        報酬の開示はここに置く。順位に効かせていないことを先に言う（Mock v3 `.lede` の形）。
        文言は main の事実（2026-09-15、PR #170）: 代行5社のどことも契約が無い。
        Mock の例示文「Some pay us, some don't」は事実と食い違うので載せない。
      */}
      <p className="lede">
        What five Japanese proxies would charge you, landed at your door.{' '}
        <b>No company pays us — and even if that changes, it would never move a row.</b>
      </p>
      <Calculator />
    </>
  );
}
