import { expect, test, type Locator, type Page } from '@playwright/test';
import { addByHand, cart, cartItem, emptyCart, gotoCompare, isCollapsed, openCart, weightBox } from './helpers';

/**
 * 「重量が分かっていない」を画面が言えているか、の E2E。
 *
 * 本番で起きたこと: 3点入れて3点とも重量表に当たらず、黙って仮置きの 1 kg が入り、
 * 合計 ~3.9 kg になっていた。行ごとには `assumed` と書いてあったが、**利用者は
 * 気づかなかった。**1点ずつ読まないと分からない形は、言っていないのと同じ。
 *
 * ここで固定するのは関係だけ（数字も文言の全文も決め打ちしない）:
 *   ・引き当たっているカートでは**何も出ない**（邪魔にしない）
 *   ・仮置きが在れば「何点中何点か」が**1か所**に出る
 *   ・畳んだカートの中に隠れない
 *   ・重量を入れると数が減り、全部入れば消える
 *   ・その場から重量欄へ行ける
 */

/** 重量表に当たらないタイトル。表が伸びてこれが当たるようになったら、
 *  注記が出なくなってここが落ちる。**そのときは題材を替える**（注記を緩めない）。 */
const OFF_TABLE = [
  'mystery lot A, no weight data',
  'mystery lot B, no weight data',
  'mystery lot C, no weight data',
] as const;

function note(page: Page): Locator {
  return page.getByTestId('assumed-weights');
}

/** 仮置きの印（`?`）。行の重量の隣に立つ。 */
function marks(scope: Locator): Locator {
  return scope.getByTestId('assumed-mark');
}

/** 行に立った印だけ。**注記自身も同じ印を持つ**ので、カート全体で数えると1つ多く数える。 */
function rowMarks(page: Page): Locator {
  return cart(page).getByRole('listitem').getByTestId('assumed-mark');
}

/** カートを空にしてから、重量表に当たらない品を n 点足す。 */
async function cartOfUnknowns(page: Page, n: number): Promise<void> {
  await emptyCart(page);
  for (const title of OFF_TABLE.slice(0, n)) await addByHand(page, title, 4000);
  await openCart(page);
}

test('a cart the weight table covers stays silent about placeholders', async ({ page }) => {
  // 既定のカート（例の2点）は両方とも重量表に当たる。ここで注記が出たら邪魔。
  await gotoCompare(page);
  await openCart(page);
  await expect(cart(page).getByRole('listitem')).toHaveCount(2);
  await expect(note(page)).toHaveCount(0);
  await expect(rowMarks(page)).toHaveCount(0);
});

test('three items with no weight data are counted in one place, not one row at a time', async ({ page }) => {
  await gotoCompare(page);
  await cartOfUnknowns(page, 3);

  const n = note(page);
  await expect(n).toBeVisible();
  // **1か所で数える。**注記はカートに1つだけ。
  await expect(n).toHaveCount(1);
  await expect(n).toHaveAttribute('data-count', '3');
  await expect(n).toHaveAttribute('data-total', '3');
  await expect(n).toContainText('None of the 3 items in your cart have weight data');

  // 総額と順位への影響を言う。仮置きが多いほど順位は当てにならない。
  await expect(n).toContainText(/totals/);
  await expect(n).toContainText(/ranking/);

  // 仮置きの値そのものも出す（画面の重量欄と同じ数字）。
  await expect(n).toContainText(/~1 kg/);

  // 行の側にも印が立つ。**色以外の記号**を1つ持たせる約束（docs/UI-DESIGN.md §6）。
  await expect(rowMarks(page)).toHaveCount(3);
});

test('a placeholder among looked-up items says which fraction of the parcel it is', async ({ page }) => {
  await gotoCompare(page);
  // 既定の2点（表に当たる）＋当たらない1点。
  await addByHand(page, OFF_TABLE[0], 4000);
  await openCart(page);

  const n = note(page);
  await expect(n).toHaveAttribute('data-count', '1');
  await expect(n).toHaveAttribute('data-total', '3');
  await expect(n).toContainText('1 of the 3 items in your cart has no weight data');
  // 全部が仮置きではないので、割合を言う（「箱ぜんぶ」ではない）。
  await expect(n).toContainText(/%/);

  // 印が立つのは当たらなかった行だけ。
  await expect(rowMarks(page)).toHaveCount(1);
  await expect(marks(cartItem(page, OFF_TABLE[0]))).toHaveCount(1);
});

test('the count follows the cart, and goes silent once every weight is filled in', async ({ page }) => {
  await gotoCompare(page);
  await cartOfUnknowns(page, 2);
  await expect(note(page)).toHaveAttribute('data-count', '2');

  // 1点入れる → 残り1点。**入れた品は仮置きではなくなる。**
  await weightBox(page, OFF_TABLE[0]).fill('600');
  await expect(note(page)).toHaveAttribute('data-count', '1');
  await expect(note(page)).toContainText('1 of the 2 items in your cart has no weight data');
  await expect(rowMarks(page)).toHaveCount(1);

  // 全部入れる → 注記も印も消える。直したのに警告が残るのは嘘。
  await weightBox(page, OFF_TABLE[1]).fill('700');
  await expect(note(page)).toHaveCount(0);
  await expect(rowMarks(page)).toHaveCount(0);
});

test('the note takes you to the weight box of the first item that has none', async ({ page }) => {
  await gotoCompare(page);
  await addByHand(page, OFF_TABLE[0], 4000);
  await openCart(page);

  await note(page).getByRole('button', { name: /^Enter the real weight/ }).click();
  // 文だけ出して欄を探させない。押したらその欄に居る。
  await expect(weightBox(page, OFF_TABLE[0])).toBeFocused();
});

test('the note is readable without opening the cart', async ({ page }) => {
  await gotoCompare(page);
  await cartOfUnknowns(page, 2);

  // モバイルではカートは畳める。畳んだ中に入れたら、開いた人にしか言っていない。
  const toggle = cart(page).getByRole('button', { name: /^Cart \(/ });
  if (await toggle.isVisible()) await toggle.click();

  await expect(note(page)).toBeVisible();
  expect(await isCollapsed(note(page)), '注記が畳まれたカートの中に入っている').toBe(false);
});

test('the box explains its dashed shapes only when a placeholder is standing in it', async ({ page }) => {
  await gotoCompare(page);
  const parcel = page.getByRole('region', { name: 'Parcel' });

  // 既定のカートは2点とも重量表に当たる。**画面に無い形を説明しない。**
  await expect(parcel).toBeVisible();
  await expect(parcel).not.toContainText(/dashed outline/);

  await addByHand(page, OFF_TABLE[0], 4000);

  // 入った瞬間から、点線が何なのかを箱の但し書きが名指しする。
  await expect(parcel).toContainText(/dashed outline/);
  // 形の違いは目で見た人にしか届かない。読み上げでも数えて言う。
  await expect(page.getByTestId('packing-box-scene'))
    .toHaveAttribute('aria-label', /placeholder weight we chose/);
});
