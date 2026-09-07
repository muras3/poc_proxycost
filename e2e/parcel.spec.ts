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


/**
 * **中身が本当に画面に出ているか。**
 * 一度、中身が描かれてはいるが段ボールとのコントラストが 1.1:1 しかなく、
 * 目では「空の箱」にしか見えない状態を、DOM の存在確認だけのテストが全部通してしまった。
 * 存在（count）も、変わった画素の数も、可視性の証拠にはならない
 * （霞でも画素は動く）。**見分けが付くかはコントラスト比でしか言えない。**
 *
 * 中身を visibility:hidden にした絵と重ね、変化した画素それぞれについて
 * 「中身を描いた色」と「その裏の段ボールの色」のコントラスト比を出し、
 * 一番濃く出ている箇所が非テキストの下限 3:1 に届いているかを見る。
 */
const NON_TEXT_MIN = 3; // WCAG 2.1 SC 1.4.11 Non-text Contrast

async function glyphContrast(page: Page): Promise<{ best: number; changed: number }> {
  const scene = page.getByTestId('packing-box-scene');
  await parcel(page).scrollIntoViewIfNeeded();
  const shown = (await scene.screenshot()).toString('base64');
  const setVis = (v: string) =>
    page.$eval(
      '[data-testid="packing-box-contents"]',
      (el, vis) => {
        (el as HTMLElement).style.visibility = vis;
      },
      v,
    );
  await setVis('hidden');
  const blank = (await scene.screenshot()).toString('base64');
  await setVis('');
  return page.evaluate(async ([a, b]) => {
    const load = (d: string) =>
      new Promise<HTMLImageElement>((res) => {
        const i = new Image();
        i.onload = () => res(i);
        i.src = 'data:image/png;base64,' + d;
      });
    const [ia, ib] = await Promise.all([load(a!), load(b!)]);
    const data = (img: HTMLImageElement) => {
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      c.getContext('2d')!.drawImage(img, 0, 0);
      return c.getContext('2d')!.getImageData(0, 0, img.width, img.height).data;
    };
    const da = data(ia);
    const db = data(ib);
    const lum = (r: number, g: number, bl: number) => {
      const f = (v: number) => {
        const u = v / 255;
        return u <= 0.03928 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl);
    };
    let best = 1;
    let changed = 0;
    for (let i = 0; i < da.length; i += 4) {
      const d = Math.max(
        Math.abs(da[i]! - db[i]!),
        Math.abs(da[i + 1]! - db[i + 1]!),
        Math.abs(da[i + 2]! - db[i + 2]!),
      );
      if (d <= 2) continue;
      changed++;
      const l1 = lum(da[i]!, da[i + 1]!, da[i + 2]!);
      const l2 = lum(db[i]!, db[i + 1]!, db[i + 2]!);
      const c = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      if (c > best) best = c;
    }
    return { best: Math.round(best * 100) / 100, changed };
  }, [shown, blank] as const);
}

test('the contents stand out from the cardboard, not just exist in the DOM', async ({ page }) => {
  await gotoCompare(page);
  const w = await soloCart(page);
  await w.fill('900');
  await expect(parcel(page)).toHaveAttribute('data-phase', 'idle', { timeout: 5000 });

  const one = await glyphContrast(page);
  expect(one.changed, '中身が1画素も描かれていない').toBeGreaterThan(0);
  expect(
    one.best,
    `中身と段ボールのコントラストが ${one.best}:1 しかない（箱が空に見える）`,
  ).toBeGreaterThanOrEqual(NON_TEXT_MIN);

  // 足したぶん、見えている量も増える。1点ぶんが偶然の縁のノイズでないことの裏。
  for (let i = 0; i < 5; i++) await addByHand(page, `Bulk ${i}`, 1000);
  await openCart(page);
  await expect(parcel(page)).toHaveAttribute('data-phase', 'idle', { timeout: 8000 });
  const many = await glyphContrast(page);
  expect(many.changed).toBeGreaterThan(one.changed * 2);
  expect(many.best).toBeGreaterThanOrEqual(NON_TEXT_MIN);
});

test('the contents stand out in dark mode too', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await gotoCompare(page);
  const w = await soloCart(page);
  await w.fill('900');
  await expect(parcel(page)).toHaveAttribute('data-phase', 'idle', { timeout: 5000 });
  const dark = await glyphContrast(page);
  expect(dark.changed, 'ダークで中身が1画素も描かれていない').toBeGreaterThan(0);
  expect(dark.best, `ダークで中身が沈んでいる（${dark.best}:1）`).toBeGreaterThanOrEqual(
    NON_TEXT_MIN,
  );
});


/**
 * **中身が箱から漏れない。**
 * 列は折り返さないので、品数が増えると自然幅が内寸を超え、
 * 両端の品が箱の外の壁の上に載る（7点で 25px 外に出ていた）。
 * 品の大きさは実寸を主張していないので、列ごと縮めて収める。
 */
test('the contents stay inside the box however many you add', async ({ page }) => {
  await gotoCompare(page);
  await emptyCart(page);
  for (let i = 0; i < 9; i++) await addByHand(page, `Spill ${i}`, 1500);
  await openCart(page);
  await expect(parcel(page)).toHaveAttribute('data-phase', 'idle', { timeout: 8000 });

  const fit = await page.evaluate(() => {
    const row = document.querySelector('[data-testid="packing-box-row"]') as HTMLElement;
    const holder = row.parentElement as HTMLElement;
    const cs = getComputedStyle(holder);
    const avail =
      holder.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const m = /scale\(([\d.]+)\)/.exec(row.style.transform);
    const scale = m ? Number(m[1]) : 1;
    return { avail, drawn: row.offsetWidth * scale, count: row.children.length };
  });
  expect(fit.count).toBe(9);
  // 描かれる列の幅が箱の内寸を超えない = どの品も箱の外の面に載らない。
  expect(fit.drawn, `中身が箱から ${(fit.drawn - fit.avail).toFixed(0)}px 漏れている`).toBeLessThanOrEqual(fit.avail + 1);
});

/** **箱がモバイルで画面外に出ない。**縮尺が効いているかを実寸で見る。 */
test('the box stays inside the viewport and never scrolls the page sideways', async ({ page }) => {
  await gotoCompare(page);
  const w = await soloCart(page);
  await w.fill('25000'); // 一番大きい箱に近い段
  await expect(parcel(page)).toHaveAttribute('data-phase', 'idle', { timeout: 5000 });
  const r = await page.evaluate(() => {
    const scene = document.querySelector('[data-testid="packing-box-scene"]')!.getBoundingClientRect();
    const box = document.querySelector('[data-testid="packing-box"]')!.getBoundingClientRect();
    return {
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      spillLeft: scene.left - box.left,
      spillRight: box.right - scene.right,
    };
  });
  expect(r.overflowX, 'ページが横スクロールする').toBeLessThanOrEqual(0);
  expect(r.spillLeft, '箱が場面の左からはみ出している').toBeLessThanOrEqual(1);
  expect(r.spillRight, '箱が場面の右からはみ出している').toBeLessThanOrEqual(1);
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

// ─────────────────────────────────────────────────────────────────────────────
// **現在段が画面の中に無ければ、目盛りは目盛りとして働いていない。**
// ol が static のままだと offsetTop が別の祖先基準になり、2.6 kg の荷物で
// 19〜30 kg の帯を出していた。テストが無いと同じ形で再発する。
// ─────────────────────────────────────────────────────────────────────────────
test('the ladder shows the step the parcel is actually on, not the end of the table', async ({ page }) => {
  await gotoCompare(page);
  const ladder = page.getByTestId('weight-ladder');
  await expect(ladder).toBeVisible();

  const now = ladder.locator('[data-state="now"]').first();
  await expect(now).toBeVisible();

  // 現在段がスクロール領域の見えている範囲に収まっていること。
  const inside = await ladder.evaluate((list) => {
    const el = list.querySelector('[data-state="now"]');
    if (!el) return null;
    const l = list.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return r.top >= l.top - 1 && r.bottom <= l.bottom + 1
      && r.left >= l.left - 1 && r.right <= l.right + 1;
  });
  expect(inside, 'the current rung is scrolled out of the ladder').toBe(true);

  // 現在段の重量が、画面が出している梱包後の重量と辻褄が合っていること。
  // （最下段に張り付いていると 30 kg が「現在段」に見えるので、ここで気づける）
  const rung = (await now.textContent()) ?? '';
  const weight = (await page.getByTestId('parcel-weight').textContent()) ?? '';
  const kgOf = (s: string) => {
    const m = /([\d.]+)\s*kg/.exec(s);
    if (m?.[1]) return Number(m[1]);
    const g = /([\d,]+)\s*g/.exec(s);
    return g?.[1] ? Number(g[1].replace(/,/g, '')) / 1000 : NaN;
  };
  const rungKg = kgOf(rung);
  const parcelKg = kgOf(weight);
  expect(Number.isFinite(rungKg) && Number.isFinite(parcelKg)).toBe(true);
  // 段は「その重量以下」を受ける上限なので、荷物より軽い段が現在段になることはない。
  expect(rungKg, `rung ${rungKg} kg vs parcel ${parcelKg} kg`).toBeGreaterThanOrEqual(parcelKg);
  // かつ、遠すぎない（30 kg に張り付いていない）。
  expect(rungKg).toBeLessThan(parcelKg + 10);
});
