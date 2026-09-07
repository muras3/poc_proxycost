import { expect, test, type Page } from '@playwright/test';
import { addByHand, emptyCart, gotoCompare, openCart, weightBox } from './helpers';

/**
 * 箱の E2E。**実際に足して、消して、重量を打ち込む。**
 * 固定するのは関係だけ:
 *   ・足したものは箱に入る
 *   ・段を跨いだときだけ箱が大きくなる
 *   ・**跨がなかったら「+¥0」を出して静止する**（ここが一番効く）
 *   ・prefers-reduced-motion では動かない
 *   ・キーボードだけで箱を動かせる
 * 数字は決め打ちしない（EMS の表を直せば動く）。
 */

const ITEM = 'Parcel test item';

function parcel(page: Page) {
  return page.getByRole('region', { name: 'Parcel' });
}

function box(page: Page) {
  return page.getByTestId('packing-box');
}

/** 箱の（縮尺をかける前の）幅。**段の添字だけで決まる**ので、これが箱の大きさ。
 *  実際に描かれる幅は狭い画面では縮尺で頭打ちになるので、そちらは大きさの証拠にならない。 */
async function boxWidth(page: Page): Promise<number> {
  return box(page).evaluate((el) => parseFloat((el as HTMLElement).style.width));
}

async function step(page: Page): Promise<string> {
  return (await parcel(page).getAttribute('data-step')) ?? '';
}

/** 1点だけのカートにして、その重量欄を返す。段を跨ぐ・跨がないを狙って作れる。 */
async function soloCart(page: Page) {
  await emptyCart(page);
  await addByHand(page, ITEM, 4000);
  await openCart(page);
  await expect(parcel(page)).toBeVisible();
  return weightBox(page, ITEM);
}

test('an item you add lands in the box', async ({ page }) => {
  await gotoCompare(page);
  const before = await page.getByTestId('packed-item').count();
  await addByHand(page, ITEM, 4000);
  await expect(page.getByTestId('packed-item')).toHaveCount(before + 1);
  // 落ちてきたのは今足した1点だけ。既に入っていた品は落とし直さない。
  await expect(page.locator('[data-entering="true"]')).toHaveCount(1);

  // 消したら箱からも消える。任意の順で足せて消せる。
  await openCart(page);
  await page.getByRole('button', { name: `Remove ${ITEM}` }).click();
  await expect(page.getByTestId('packed-item')).toHaveCount(before);
});

test('the box grows only when the parcel crosses an EMS weight step', async ({ page }) => {
  await gotoCompare(page);
  const w = await soloCart(page);

  // 900 g → 梱包後 1,380 g。1.5 kg の段の中。
  await w.fill('900');
  await expect(parcel(page)).toHaveAttribute('data-phase', 'idle', { timeout: 5000 });
  const stepA = await step(page);
  const widthA = await boxWidth(page);

  // 1,000 g → 梱包後 1,500 g。**同じ段のまま。**箱は動かない。
  await w.fill('1000');
  await expect(page.getByTestId('parcel-delta')).toHaveAttribute('data-crossed', 'false', {
    timeout: 5000,
  });
  await expect(page.getByTestId('parcel-delta')).toContainText('+¥0');
  await expect(page.getByTestId('parcel-delta')).toContainText('same EMS weight step');
  expect(await step(page)).toBe(stepA);
  expect(await boxWidth(page)).toBe(widthA);

  // 1,100 g → 梱包後 1,620 g。**段を跨ぐ。**ここで初めて箱が大きくなる。
  await w.fill('1100');
  await expect(page.getByTestId('parcel-delta')).toHaveAttribute('data-crossed', 'true', {
    timeout: 5000,
  });
  expect(await step(page)).not.toBe(stepA);
  expect(await boxWidth(page)).toBeGreaterThan(widthA);
  // 跨いだ回の差額は 0 ではない。¥0 で静止したことにしない。
  await expect(page.getByTestId('parcel-delta')).not.toContainText('+¥0');
  await expect(page.getByTestId('parcel-delta')).toContainText('crossed an EMS weight step');
});

test('the postage the box shows is the step it stands on', async ({ page }) => {
  await gotoCompare(page);
  const w = await soloCart(page);
  await w.fill('1000');
  await expect(parcel(page)).toHaveAttribute('data-phase', 'idle', { timeout: 5000 });

  // 現在段（aria-current="step"）の料金と、箱が名乗る送料が同じであること。
  const now = parcel(page).locator('[data-testid="ladder-rung"][aria-current="step"]');
  await expect(now).toHaveCount(1);
  const rung = (await now.innerText()).replace(/\s+/g, ' ');
  const postage = await page.getByTestId('parcel-postage').innerText();
  const yenIn = (s: string) => s.match(/¥[\d,]+/)?.[0];
  expect(yenIn(postage)).toBe(yenIn(rung.split(' ').slice(-1)[0] ?? ''));
});

test('over 30 kg the box says there is no published rate, not ¥0', async ({ page }) => {
  await gotoCompare(page);
  const w = await soloCart(page);
  await w.fill('40000');
  await expect(page.getByTestId('parcel-postage')).toContainText('—', { timeout: 5000 });
  await expect(page.getByTestId('parcel-postage')).not.toContainText('¥0');
});

test('the box is operable with the keyboard alone', async ({ page }) => {
  await gotoCompare(page);
  await soloCart(page);
  const w = weightBox(page, ITEM);
  const id = await w.getAttribute('id');
  expect(id).toBeTruthy();

  // Tab だけで重量欄まで行けること。マウスでしか触れない欄は、直せない欄と同じ。
  let reached = false;
  for (let i = 0; i < 120 && !reached; i++) {
    await page.keyboard.press('Tab');
    reached = (await page.evaluate(() => document.activeElement?.id ?? '')) === id;
  }
  expect(reached, 'Tab だけで重量欄に到達できない').toBe(true);

  const widthBefore = await boxWidth(page);
  await page.keyboard.press('Control+a');
  await page.keyboard.type('9000');
  await expect(page.getByTestId('parcel-delta')).toBeVisible({ timeout: 5000 });
  await expect(parcel(page)).toHaveAttribute('data-phase', 'idle', { timeout: 5000 });
  expect(await boxWidth(page)).toBeGreaterThan(widthBefore);
});

test.describe('prefers-reduced-motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('nothing moves — the final state is shown at once', async ({ page }) => {
    await gotoCompare(page);
    const before = await page.getByTestId('packed-item').count();
    await addByHand(page, ITEM, 4000);
    await expect(page.getByTestId('packed-item')).toHaveCount(before + 1);

    // 落下の段階を演じない。落ちてくる品はいない。
    await expect(page.locator('[data-entering="true"]')).toHaveCount(0);
    await expect(parcel(page)).toHaveAttribute('data-phase', 'idle');
    // それでも「何が起きたか」は言う。動きを止めても情報は削らない。
    await expect(page.getByTestId('parcel-delta')).toBeVisible();
  });
});
