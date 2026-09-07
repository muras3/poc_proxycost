import { expect, type Locator, type Page } from '@playwright/test';

/**
 * 比較画面を実際に操作するための道具箱。
 * セレクタは role / label / text だけで書く。クラス名は見た目の都合で変わるので当てにしない
 * （唯一の例外は確度の下線を computed style で見る箇所。そこは spec 側に置いた）。
 */

/** ConsentBanner が localStorage に置く鍵。 */
export const CONSENT_KEY = 'proxycost.consent.v1';

/** 順位に出る会社名。行の見出しからどの社かを引くのに使う。 */
const SERVICE_NAMES = ['FROM JAPAN', 'ZenMarket', 'Neokyo', 'Buyee', 'Jauce'] as const;

export interface RankRow {
  /** 1 始まり。画面上の**並び順**。順位そのものではない（同額は同順位になる）。 */
  rank: number;
  /** 行が実際に表示している順位の数字。同額なら前の行と同じ数字になる。 */
  shownRank: number;
  /** 「tied with …」を名乗っているか。同額の行だけが名乗る。 */
  tied: boolean;
  /** 'Neokyo' / 'Buyee' など。 */
  name: string;
  /** 'consolidated' / 'default' / null。 */
  variant: string | null;
  /** `approx. total ~¥33,500` から読んだ数字。幅表示のときは下限。 */
  total: number;
  /** 最安との差額。最安行は 0。 */
  diff: number;
  cheapest: boolean;
  /** 行の生テキスト。'pays us nothing' の判定などに使う。 */
  text: string;
}

export function ranking(page: Page): Locator {
  return page.getByRole('region', { name: 'Ranking' });
}

/** 順位リストの各行の見出しボタン。開閉はこれを押す。 */
export function rankButtons(page: Page): Locator {
  return ranking(page).getByRole('button');
}

export function cart(page: Page): Locator {
  return page.getByRole('region', { name: 'Cart' });
}

/** カートの1品の行。タイトルで引く。 */
export function cartItem(page: Page, title: string): Locator {
  return cart(page).getByRole('listitem').filter({ hasText: title });
}

/** その品の重量入力。常に数字が入っていて、常に直せる。 */
export function weightBox(page: Page, title: string): Locator {
  return cartItem(page, title).getByRole('textbox', { name: `Weight in grams of ${title}` });
}

/** 「この品の重量だけで1位が替わる」の名指し。compare() の weightSensitivity が出す。 */
export const DECIDES = /This weight decides the cheapest/;

export function breakdownTable(page: Page): Locator {
  return page.getByRole('region', { name: 'Cost breakdown' });
}

/** '¥33,500' / '~¥33,500' / '¥1,000 – 2,000' から最初の数字を取る。 */
export function parseYen(text: string): number {
  const m = text.replace(/[−–—]/g, '-').match(/-?[\d,]+/);
  if (!m) throw new Error(`no number in ${JSON.stringify(text)}`);
  return Number(m[0].replace(/,/g, ''));
}

/**
 * 同意バナーが出るのを待ってから選ぶ。
 * バナーは useEffect でしか出ないので、**出たこと自体が hydration 完了の証拠**になる。
 * SSR された順位リストは押しても動かない時間帯があるため、この待ちを全テストの入口にする。
 */
export async function gotoCompare(
  page: Page,
  opts: { consent?: 'denied' | 'granted' | 'leave' } = {},
): Promise<void> {
  await page.goto('/');
  const banner = page.getByRole('dialog', { name: 'Cookie consent' });
  await expect(banner).toBeVisible();
  const choice = opts.consent ?? 'denied';
  if (choice !== 'leave') {
    await banner.getByRole('button', { name: choice === 'denied' ? 'Reject' : 'Accept' }).click();
    await expect(banner).toBeHidden();
  }
  await expect(rankButtons(page).first()).toBeVisible();
}

/**
 * カートはモバイルで畳まれている。中身が見えていなければ開く。
 * lg 以上では見出しの `Cart (n)` が `pointer-events-none` になっていて押せないので、
 * aria-expanded ではなく**中身が見えているか**で判断する。
 */
export async function openCart(page: Page): Promise<Locator> {
  const c = cart(page);
  const first = c.getByRole('listitem').first();
  if (!(await first.isVisible())) {
    await c.getByRole('button', { name: /^Cart \(/ }).click();
  }
  await expect(first).toBeVisible();
  return c;
}

/** 順位リストを読む。数字は決め打ちせず、関係だけを検証するための材料にする。 */
export async function readRanking(page: Page): Promise<RankRow[]> {
  const buttons = rankButtons(page);
  await expect(buttons.first()).toBeVisible();
  const n = await buttons.count();
  const out: RankRow[] = [];
  for (let i = 0; i < n; i++) {
    const text = (await buttons.nth(i).innerText()).replace(/\s+/g, ' ').trim();
    const totalMatch = text.match(/approx\. total\s*~?(¥[\d,]+)/);
    if (!totalMatch) throw new Error(`row ${i} has no approx. total: ${text}`);
    const cheapest = /(^|\s)CHEAPEST(\s|$)/.test(text);
    const diffMatch = text.match(/\+¥([\d,]+)/);
    // 行頭の数字がその行の順位。並び順（i+1）と一致するとは限らない。
    const shown = text.match(/^(\d+)\s/);
    if (!shown) throw new Error(`row ${i} shows no rank number: ${text}`);
    // **社名は行頭からだけ読む。** 行の中には他社の名前も出る（同額の「tied with ZenMarket」）
    // ので、行全体を includes で探すと隣の社の名前を自分の名前として拾う。
    const head = text.replace(/^\d+\s+/, '');
    const name = SERVICE_NAMES.find((s) => head.startsWith(s));
    if (!name) throw new Error(`row ${i} has no known service name: ${text}`);
    const variant = text.includes('consolidated') ? 'consolidated'
      : text.includes('default') ? 'default' : null;
    out.push({
      rank: i + 1,
      shownRank: Number(shown[1]),
      tied: /tied with /.test(text),
      name,
      variant,
      total: parseYen(totalMatch[1]!),
      diff: cheapest ? 0 : parseYen(diffMatch?.[1] ?? '0'),
      cheapest,
      text,
    });
  }
  return out;
}

/** 行を開く。開いた `li` を返す。既に開いていればそのまま。 */
export async function openRankRow(page: Page, index: number): Promise<Locator> {
  const button = rankButtons(page).nth(index);
  if ((await button.getAttribute('aria-expanded')) !== 'true') {
    await button.click();
  }
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  const li = ranking(page).getByRole('listitem').nth(index);
  await expect(li.getByRole('table')).toBeVisible();
  return li;
}

/** 開いた行の2列比較から、費目名（左端セル）で1行を引く。 */
export function costRow(li: Locator, label: string | RegExp): Locator {
  return li.getByRole('row').filter({ has: li.page().getByRole('cell', { name: label }) });
}

/** 表の1行を、セルの文字列の配列にする。 */
export async function rowCells(row: Locator): Promise<string[]> {
  const cells = row.getByRole('cell');
  const n = await cells.count();
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push((await cells.nth(i).innerText()).replace(/\s+/g, ' ').trim());
  return out;
}

/** 表の見出し行を文字列の配列にする。 */
export async function headerCells(scope: Locator): Promise<string[]> {
  const cells = scope.getByRole('columnheader');
  const n = await cells.count();
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push((await cells.nth(i).innerText()).replace(/\s+/g, ' ').trim());
  return out;
}

/** 昇順（同値は許す）か。総額は ¥100 丸めなので同値が出うる。 */
export function isNonDecreasing(xs: number[]): boolean {
  return xs.every((x, i) => i === 0 || xs[i - 1]! <= x);
}

/**
 * 「EMS でしか比べていない」の常時開示（`EmsOnlyNote`）。
 * 順位が出ているあいだは畳まれも消えもしない、という約束をここで引く。
 */
export function emsOnlyNote(page: Page): Locator {
  return page.locator('p').filter({ hasText: /Compared using Japan Post EMS only/ });
}

/**
 * 「送れないかもしれない」の常時開示（`RestrictedGoodsNote`）。
 * EMS の開示と同じ場所・同じ約束（畳まない・順位が出ている限り消えない）。
 */
export function restrictedNote(page: Page): Locator {
  return page.locator('p').filter({ hasText: /may not be shippable at all/ });
}

/** カートに酒が入ったときだけ出る、強いほうの警告（`AlcoholInCartNote`）。 */
export function alcoholNote(page: Page): Locator {
  return page.locator('p').filter({ hasText: /we read as alcohol/ });
}

/**
 * 手入力で1点足す。**検索も URL 取得も要らない唯一の経路**なので、
 * 入力を組み立てるテストはここを通る。`site` を渡すと出品サイトも選ぶ。
 */
export async function addByHand(
  page: Page, title: string, priceYen: number, site?: string,
): Promise<void> {
  const form = page.getByRole('button', { name: 'Or add an item by hand' });
  if (await form.count()) await form.click();
  await page.getByLabel('Item name').fill(title);
  await page.getByLabel('Price ¥').fill(String(priceYen));
  if (site) await page.getByLabel('Site').selectOption(site);
  await page.getByRole('button', { name: 'Add by hand', exact: true }).click();
}

/** カートを空にする。 */
export async function emptyCart(page: Page): Promise<void> {
  await openCart(page);
  const removes = cart(page).getByRole('button', { name: /^Remove / });
  for (let n = await removes.count(); n > 0; n = await removes.count()) await removes.first().click();
}

/** その要素が「開かないと読めない」場所に居ないか。畳まれた開示は開示ではない。 */
export async function isCollapsed(target: Locator): Promise<boolean> {
  return target.evaluate(
    (el) => !!el.closest('details:not([open]), [aria-expanded="false"], [hidden]'),
  );
}
