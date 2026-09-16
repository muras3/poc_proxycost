import { expect, test, type Page } from '@playwright/test';
import { gotoCompare, ranking, readRanking, shipTo } from './helpers';
import { compare, DEFAULT_STORAGE_DAYS } from '../src/lib/pricing/compare';
import { defaultCartItems } from '../src/components/compare/useCompare';
import { COUNTRIES } from '../src/lib/pricing/countries';
import type { CountryCode } from '../src/lib/pricing/types';

/**
 * **見出しが engine の答えと一致していることを、画面の側から検査する。**
 *
 * 期待値を文言でベタ書きしない（CLAUDE.md §5）。`getByText(/too close/)` の
 * 存在確認だけなら、engine が何を返していても通ってしまう——この PR が直した
 * 欠陥（engine は判別不能と知っているのに画面が1位を名指しする）を、まさに
 * 検出できないテストになる。
 *
 * そこで**同じ既定カートを Node 側で `compare()` に通し**、その
 * `contestedIds`（`computeContested`。CAP 無し・非推移で「1位と区別が付かない
 * 社」）から期待値をその場で導出して、画面の見出し・順位バッジと突き合わせる。
 * 品は `defaultCartItems()` を画面と共有するので、既定カートが変われば両方が
 * 同時に変わる。
 */

/** 画面と同じ既定（`useCompare` の `initial()`）で engine を回す。 */
function engineFor(country: CountryCode) {
  return compare({
    items: defaultCartItems(), country, province: null, method: 'cheapest',
    storageDays: DEFAULT_STORAGE_DAYS,
  });
}

async function pickCountry(page: Page, country: CountryCode): Promise<void> {
  await shipTo(page, country);
  await expect(ranking(page).locator('li[data-row-id]').first()).toBeVisible();
}

const CASES: CountryCode[] = ['US', 'GB', 'DE', 'FR', 'AU', 'CA', 'SG'];

test('the headline names exactly the services the engine cannot tell apart', async ({ page }) => {
  await gotoCompare(page);

  // どの枝も実際に通っていることを数える。通っていない枝の検査は検査ではない。
  let sawClear = 0; let sawTooClose = 0; let sawIndeterminate = 0;

  for (const country of CASES) {
    await pickCountry(page, country);
    const r = engineFor(country);
    const comp = r.rows.filter((x) => x.comparable);
    if (comp.length < 2) continue;

    const byId = new Map(r.rows.map((x) => [x.id, x]));
    const contested = r.contestedIds.map((id) => byId.get(id)!);
    const head = (await page.getByTestId('summary').locator('h2.summary').innerText())
      .replace(/\s+/g, ' ').trim();

    if (r.rankIndeterminate) {
      sawIndeterminate += 1;
      // 1位自身の上限が開いている状態の文言は、この PR では変えていない。
      expect(head, `${country}: ${head}`).toMatch(/Can.t tell who leads/);
      continue;
    }

    if (r.contestedIds.length === 1) {
      sawClear += 1;
      // **断定してよい唯一のケース。**engine が1社しか挙げていないので、
      // その社名が見出しに出て、「too close」とは言っていない。
      expect(head, `${country}: ${head}`).toContain(contested[0]!.serviceName);
      expect(head, `${country}: asserted a winner but hedged`).not.toMatch(/too close to call/i);
    } else {
      sawTooClose += 1;
      // **交わっている社が2社以上。1位を名指ししない。**
      expect(head, `${country}: named a single winner while ${r.contestedIds.length} overlap`)
        .toMatch(/too close to call|tied/i);
      // **差額の数値を出さない**（点推定どうしの差は、交わっている相手について
      // 何も言っていない）。
      expect(head, `${country}: printed a gap under a too-close headline`).not.toMatch(/¥[\d,]+/);
      // **黙殺しない。**名前が畳まれていても、何社が交わっているかは必ず出る。
      const named = contested.filter((x) => head.includes(x.label) || head.includes(x.serviceName));
      if (named.length < contested.length) {
        expect(head, `${country}: folded the list but hid the count`)
          .toMatch(new RegExp(`${contested.length}\\b`));
      }
    }

    // 画面の順位バッジも同じ集合を指している（見出しと行で別の答えを出さない）。
    const rows = await readRanking(page);
    const screenContested = rows.filter((x) => x.contested || (x.comparable && x.cheapest));
    const engineContested = new Set(contested.map((x) => x.id));
    expect(
      screenContested.length,
      `${country}: board marks ${screenContested.length} rows contested, engine says ${engineContested.size}`,
    ).toBe(engineContested.size);
  }

  expect(sawClear + sawTooClose + sawIndeterminate, 'no country produced a headline').toBeGreaterThan(0);
  // 断定側と「判別できない」側の**両方**が実データで通っていること。
  expect(sawClear, 'no country asserted a clear winner — the positive case is untested').toBeGreaterThan(0);
  expect(sawTooClose, 'no country hit the too-close headline').toBeGreaterThan(0);
});

test('a row that overlaps the leader shows no gap figure, and says why', async ({ page }) => {
  await gotoCompare(page);
  let checked = 0;

  for (const country of CASES) {
    await pickCountry(page, country);
    const r = engineFor(country);
    const rows = await readRanking(page);

    for (const row of rows.filter((x) => x.comparable && !x.cheapest)) {
      // engine の答えを id ではなく画面の社名で引き当てる（`readRanking` は
      // `data-row-id` から社名を解決している）。
      const engineRow = r.rows.find((x) => x.serviceName === row.name
        && (row.variant == null || x.variant === row.variant));
      if (!engineRow) continue;
      const overlaps = r.contestedIds.includes(engineRow.id);
      expect(
        row.contested,
        `${country}/${row.name}: screen says contested=${row.contested}, engine says ${overlaps}`,
      ).toBe(overlaps);
      if (overlaps) {
        expect(row.diff, `${country}/${row.name} printed a gap it cannot stand behind`).toBeNull();
        expect(row.text).toMatch(/Too close to call against/);
        checked += 1;
      }
    }
  }

  expect(checked, 'no overlapping row appeared on screen across every country').toBeGreaterThan(0);
});

test('the country list this spec sweeps is the whole country list', () => {
  // 国が増えたらこのスペックの掃引も増える。増えなければ黙って穴が空く。
  expect([...CASES].sort()).toEqual(Object.keys(COUNTRIES).sort());
});
