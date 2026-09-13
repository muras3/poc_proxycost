import { describe, expect, test } from 'vitest';
import { compare, isIndeterminate } from './compare';
import type { Row } from './types';

/**
 * `isIndeterminate`（PR、2026-09-13）: `docs/audit/rank-indeterminate-2026-09-13.md`
 * が発見した欠陥の回帰テスト。
 *
 * 修正前:
 * ```ts
 * function isIndeterminate(rows: Row[]): boolean {
 *   const comparable = rows.filter((r) => r.comparable);
 *   return comparable.length > 1 && comparable.every((r) => r.rankHigh == null);
 * }
 * ```
 * 「比較可能な**全社**の `rankHigh` が `null`」というグローバル条件でしか真に
 * ならず、「今の1位（下端最小、同着含む）自身の `rankHigh` が `null`」という、
 * はるかにありふれたケースを見逃していた。
 *
 * 修正後: 1位グループ（下端最小の同着を含む）のうち1社でも `rankHigh` が
 * `null` なら真。1位でない社の `rankHigh` は見ない。
 *
 * **選んだ範囲（狭い方の真実）**: 「1位が unbounded なら**このカート全体**を
 * 判定不能にする」のではなく、「**1位を名指しできない**」だけを言う。
 * `isIndeterminate` は単一の真偽値で `RankBoard` の見出し（CHEAPEST/LEADS）・
 * おすすめ枠の表示・要約文をまとめて切り替える設計（`rank()` 自体は変えていない
 * ので `rank`／`diff`／`recommended`／`equivalent` は本 PR の影響を受けない）
 * ——2位・3位以下が閉区間同士で確実な差を持っていても、「誰が1位か」が
 * 言えない以上、画面が「CHEAPEST」を出す対象がそもそも存在しないので、
 * 本 PR ではこの1個のフラグを「1位を名指しできるか」の意味に絞った。
 * 2位以下の相対順序（`rank`）はこの判定に関係なく、閉区間で確定していれば
 * そのまま画面に出る——「全員分からない」という広い方は選ばなかった
 * （情報を捨てすぎるため。ケース3のテストがこれを固定する）。
 */

const row = (over: { id: string; totalLow: number; rankHigh: number | null }): Row => {
  const { id, totalLow, rankHigh } = over;
  return {
    id, label: id, serviceName: id, method: 'ems', lines: [],
    total: { low: totalLow, high: rankHigh },
    rankHigh, comparable: true, notComparableReason: null,
    recommended: false, equivalent: false, rank: 0, diff: 0, cheapest: false, tied: false,
  } as unknown as Row;
};

describe('isIndeterminate — leader unbounded (2026-09-13 fix)', () => {
  test('reported case: US, 600 g, ¥3,000 — FROM JAPAN leads with rankHigh null, no unqualified cheapest', () => {
    // 監査の再現手順そのもの。既定の呼び出し方（method: 'cheapest'）で普通に起きる。
    const r = compare({
      method: 'cheapest',
      items: [{
        title: 'i0', priceYen: 3000, priceTier: 'fixed', site: 'yahoo-auctions',
        weightG: 600, weightTier: 'estimate', qty: 1, id: 'i0',
      }],
      country: 'US',
    });
    const comparable = r.rows.filter((x) => x.comparable).sort((a, b) => a.total.low - b.total.low);
    const leader = comparable[0]!;
    // 固定: FROM JAPAN が単独最安（下端最小）で、その `rankHigh` は社固有の
    // 外注梱包費（`outsourced-packing`）で上限不明。
    expect(leader.id).toBe('fromjapan');
    expect(leader.cheapest).toBe(true);
    expect(leader.rankHigh).toBeNull();
    // 直った点: 1位自身が上限不明なので「確実に安い」とは言い切れない。
    expect(r.rankIndeterminate).toBe(true);
  });

  test('previously-covered case: every comparable company unbounded — indeterminate stays true (old behaviour pinned)', () => {
    // 旧条件が唯一真になっていたグローバルなケース。新条件はこれの上位互換
    // ——1位自身の `rankHigh` も必然的に `null` なので、そのまま真になる。
    const rows = [
      row({ id: 'a', totalLow: 1000, rankHigh: null }),
      row({ id: 'b', totalLow: 2000, rankHigh: null }),
      row({ id: 'c', totalLow: 3000, rankHigh: null }),
    ];
    expect(isIndeterminate(rows)).toBe(true);
  });

  test('trailing-company case: a non-leader with rankHigh null does not make the ranking indeterminate', () => {
    // 監査ケース2で正しいと確認済みの挙動——1位でない社の unbounded は1位を
    // 脅かさない（`total.low` はどの社にとっても確実な下限なので、2位以下の
    // unbounded な上限は「もっと高くなりうる」方向にしか効かない）。これは
    // 今回の修正で壊してはいけない。
    const rows = [
      row({ id: 'leader', totalLow: 1000, rankHigh: 1200 }), // 1位: 閉区間・確定
      row({ id: 'trailing', totalLow: 2000, rankHigh: null }), // 2位: 上限不明だが1位を脅かさない
    ];
    expect(isIndeterminate(rows)).toBe(false);
  });

  test('a scope:"shared" unbounded unknown folds to 0 in rankHigh and does not trigger indeterminacy', () => {
    // 米国は連邦売上税が無く、Zonos の事前納付利用料（`duty-prepayment`、
    // `scope: 'shared'`）が郵便を使う全社に同一額でかかる未取得行として残る
    // ——`total.high` は依然 `null`（画面は「以上（上限不明）」のまま）だが、
    // `rankHighFor` はこれを0として畳むので `rankHigh` は非 null になり、
    // 順位判定には影響しない。実データでの固定（合成フィクスチャに頼らない）:
    // US・EMS・単品600gでは、比較可能な社（ZenMarket・Jauce）の総額はどちらも
    // 閉区間で確定しており、社固有の未取得行を持たない。
    const r = compare({
      method: 'ems',
      items: [{
        title: 'i0', priceYen: 3000, priceTier: 'fixed', site: 'yahoo-auctions',
        weightG: 600, weightTier: 'estimate', qty: 1, id: 'i0',
      }],
      country: 'US',
    });
    const comparable = r.rows.filter((x) => x.comparable);
    expect(comparable.map((x) => x.id).sort()).toEqual(['jauce', 'zenmarket']);
    for (const x of comparable) {
      // `total.high` は共通の未知（Zonos・連邦売上税）のせいで依然 null のまま
      // ——絶対値の不確かさは消えていない。
      expect(x.total.high, x.id).toBeNull();
      // だが `rankHigh` はどちらも非 null——共通の未知は畳まれて0扱いなので
      // 順位判定には効かない。
      expect(x.rankHigh, x.id).not.toBeNull();
    }
    // 直接ユニット: `scope: 'shared'` な null 行だけを持つ行は `rankHigh` に0を
    // 畳み、`isIndeterminate` を動かさない。
    const rows = [
      row({ id: 'a', totalLow: 1000, rankHigh: 1000 }), // shared のみ未知 → 0 に畳まれ非 null
      row({ id: 'b', totalLow: 1500, rankHigh: 1500 }),
    ];
    expect(isIndeterminate(rows)).toBe(false);
    expect(r.rankIndeterminate).toBe(false);
  });
});
