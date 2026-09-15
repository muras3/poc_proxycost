import { Calculator } from '@/components/compare/Calculator';

// metadata は layout.tsx にある。ここは骨組みだけ。
export default function HomePage() {
  return (
    <>
      {/*
        報酬の開示はここに置く。順位に効かせていないことを先に言う（Mock v3 `.lede` の形）。
        文言は main の事実（2026-09-15、PR #170）: 代行5社のどことも契約が無い。
        Mock の例示文「Some pay us, some don't」は事実と食い違うので載せない。

        **2026-09-15、着地総額の断定をやめた。**以前は「landed at your door」と言い切って
        いたが、同じ画面に売上税・VAT が `not published` の国があり、Jauce の Zonos 利用料も
        未算入で、`total.high` が閉じない行がある。既知＋推定であること・宛先側で足され得る
        ことが分かる言い方にする（数値・順位は変えていない）。
      */}
      <p className="lede">
        What five Japanese proxies would charge you, counted through to import tax — every charge
        we could find or estimate. Some are published nowhere, so your destination can still add to
        these totals.{' '}
        <b>No company pays us — and even if that changes, it would never move a row.</b>
      </p>
      <Calculator />
    </>
  );
}
