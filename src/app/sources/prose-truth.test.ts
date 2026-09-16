import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { POSTAL_METHODS } from '@/lib/pricing/postage';
import { SERVICES } from '@/lib/pricing/services';

/**
 * **散文が engine から乖離する事故を捕まえる。**
 *
 * 2026-09-15 に見つかった実例（どちらも「engine が正、散文が古い」）:
 *
 * 1. `/sources` §ems が「EMS is also the only method we price」と書いていた。実際には
 *    `POSTAL_METHODS` は5方式あり、さらに `Service.courier` の実測運賃まで価格化して
 *    ランキングに入れている。`EmsOnlyNote` は同じ事実を正しく出していたので、
 *    **画面の2箇所が互いに矛盾していた。**
 * 2. `/sources` §reversal が「Neokyo includes domestic shipping inside Japan in its service
 *    fee」と書き、それを「Neokyo がだいたい勝つ理由の大半」として挙げていた。engine 上
 *    そんな事実は無い——`domesticIncluded` は5社すべて false で、`compare.ts` の
 *    `domCharged` は Neokyo にも国内送料を課している（T-F4、2026-09-11 に neokyo.com の
 *    料金ページを再取得して**マスタ側の誤りと確定**した）。
 *
 * **なぜ文字列の検査なのか。**この2つはどちらも「engine を読めば嘘だと分かるのに、
 * 誰も読み直さなかった」型の欠陥で、engine の値が正しいかどうかでは捕まらない
 * （engine はずっと正しかった）。捕まえたいのは散文のほうなので、散文を読むしかない。
 *
 * **空振りしない形にしてある。**禁止する言い回しは engine の値から条件づけている——
 * 方式が1つしか無くなれば①の検査は自分から降り、国内送料込みの社が現れれば②の検査も
 * 降りる。マスタを読まずに固定文字列を弾くだけの検査（書き換えても常に PASS する類）
 * にはしない（CLAUDE.md §4 の Fable の件）。
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

/**
 * 検査対象は**画面に出る散文だけ**。コメントは先に落とす——落とさないと、
 * 「昔こう書いてあった」と経緯を引用しているコメント（この検査を足した理由そのもの）に
 * 自分で引っかかり、経緯を書き残せなくなる。JSX の途中改行・インデントも畳んで、
 * 1行の文として検査できる形にする。
 */
const prose = (rel: string) => read(rel)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*$/gm, '$1 ')
  .replace(/\s+/g, ' ');

describe('the prose on /sources matches what the engine actually does', () => {
  test('it does not claim EMS is the only method we price, while we price more than one', () => {
    // 方式が本当に1つだけなら、この主張は正しいので検査しない。
    expect(POSTAL_METHODS.length).toBeGreaterThan(1);

    const text = prose('src/app/sources/page.tsx');
    expect(
      text,
      `POSTAL_METHODS が ${POSTAL_METHODS.length} 方式あるのに、散文が「EMS だけを価格化している」`
      + ' と言っている。engine が正で散文が古い。',
    ).not.toMatch(/EMS is (also )?the only method we price/i);
    expect(text).not.toMatch(/only method we price/i);
  });

  test('it does not claim we quote none of the non-EMS rates, while couriers are priced', () => {
    const withGrid = SERVICES.filter((s) => s.courier && Object.keys(s.courier).length > 0);
    // 宅配便を1社も価格化していないなら「どれも見積もっていない」は正しい。
    expect(withGrid.length).toBeGreaterThan(0);

    expect(
      prose('src/app/sources/page.tsx'),
      `${withGrid.map((s) => s.name).join(', ')} の宅配便運賃を価格化しているのに、`
      + ' 散文が「We quote none of those rates」と言っている。',
    ).not.toMatch(/We quote none of those rates/i);
  });

  test('no page claims a service folds domestic shipping into its fee, while none of them does',
    () => {
      const included = SERVICES.filter((s) => s.domesticIncluded).map((s) => s.name);
      // 国内送料込みの社が実際に現れたら、その社についてはそう書いてよい。
      expect(included, 'domesticIncluded の社が増えたらこの検査を見直すこと').toEqual([]);

      for (const file of ['src/app/sources/page.tsx', 'src/app/page.tsx']) {
        expect(
          prose(file),
          `${file}: どの社も domesticIncluded ではない（compare.ts の domCharged は`
          + ' 全社に国内送料を課している）のに、散文が「サービス料に国内送料が含まれる」'
          + ' と言っている。',
        ).not.toMatch(/includes domestic shipping[^.]*(service|order) fee/i);
      }
    });

  test('no screen promises a final at-the-door total, while unpublished fees remain', () => {
    // トップページは「宛先で追加課金され得る」と明示していること。
    const home = prose('src/app/page.tsx');
    expect(home).toMatch(/destination can still add to these totals/i);

    // 総額を名乗る3箇所（ヒーロー文・順位の見出し・配達ログの合計行）のどれも、
    // 「着いたときに払い終わる額」だとは言わないこと。`countries.ts` に
    // 「not published」の費目（US の Zonos 前払い利用料）が残っている限り断定できない。
    const files = [
      'src/app/page.tsx',
      'src/components/compare/Results.tsx',
      'src/components/compare/DeliveryLog.tsx',
    ];
    for (const file of files) {
      expect(
        prose(file),
        `${file}: 未取得の費目（Zonos 前払い利用料・"not published" の売上税）がある以上、`
        + ' 着地総額は断定できない。',
      ).not.toMatch(/at the door|total that reaches your door/i);
    }
  });
});
