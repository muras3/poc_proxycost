import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  addByHand, cart, costRowByKey, emptyCart, gotoCompare, openCart, openRankRow, ranking, readRanking,
  setMethod, weightBox,
} from './helpers';

/**
 * 箱の E2E。**実際に足して、消して、重量を打ち込む。**
 *
 * Mock v3（2026-09-15）で箱の置き場所が2つになった。**どちらも `compare()` が返す
 * `Row.boxes` をそのまま描くだけ**で、UI 側では何も再計算しない:
 *   ・秤（`#heft`、`data-testid="scale"`）: 条件欄のすぐ下。1位の行の箱が台に乗り、
 *     総重量ぶん台が沈む。箱の大きさは重量の帯（≤2 kg / ≤10 kg / ≤20 kg / それ以上）
 *     でしか変わらない。
 *   ・配達ログの Packed の段（`data-testid="pack"`、1位以外の行も自分の箱を持つ）:
 *     行を開くと出る。箱ごとの重量・中身・申告額・関税判定はこちら。
 * 旧 `ParcelView`（`region "Parcel"`・`weight-ladder`・`parcel-delta`・`parcel-postage`）は
 * 無くなった。ここで固定するのは関係だけ:
 *   ・足したものは箱に入る／消せば出る
 *   ・箱の絵は重量の帯を跨いだときだけ大きくなり、帯の中では動かない
 *   ・**送料は EMS の段を跨いだときだけ動く**（配達ログの国際送料の行で見る。
 *     旧 `parcel-delta` の「+¥0」が担っていた検査）
 *   ・公表料金の無い重さでは ¥0 ではなく「比べられない」と言う
 *   ・prefers-reduced-motion では動かない
 *   ・キーボードだけで箱を動かせる
 *   ・中身が段ボールから見分けられる／箱から漏れない／画面から漏れない
 * 数字は決め打ちしない（EMS の表を直せば動く）。
 *
 * 削ったもの（担保先を書く）:
 *   ・「目盛り（`weight-ladder`）の現在段が表の中に見える」「箱が名乗る送料と目盛りの
 *     段が一致する」: Mock v3 に目盛りは無く、送料は配達ログの1か所にしか出ないので、
 *     一致を検査する2つ目の表示が存在しない。EMS の段そのものは `src/lib/pricing` の
 *     unit test が持つ。
 *   ・方式ごとの説明文（「EMS is priced by weight alone」「volumetric weight」）: Mock v3 は
 *     箱に方式別の散文を添えない。方式名は配達ログの国際送料の行（`intl-line-note`）と
 *     秤の要約に出るので、下の「秤は1位の行の方式を名乗る」で代える。方式の切替が
 *     全行の総額を動かすことは compare.spec 18b が持つ。
 *   ・ダークモードのコントラスト: Mock v3 は紙色1テーマ（`compare.css` は
 *     `html[data-makeup=light]` の節を常時適用）で、`prefers-color-scheme: dark` でも
 *     配色は変わらない。光の下の検査1つで十分。
 *   ・分割（店ごと・重量上限）の理由・中身・申告額・関税判定は `parcel-split.spec.ts`。
 */

const ITEM = 'Parcel test item';

function scale(page: Page) {
  return page.getByTestId('scale');
}

function scaleBoxes(page: Page) {
  return scale(page).getByTestId('scale-box');
}

/** 秤の上の1箱目の絵の幅。**重量の帯だけで決まる**（`BoxArt` の `W0`）ので、これが箱の大きさ。 */
async function boxWidth(page: Page): Promise<number> {
  return scaleBoxes(page).first().locator('svg').evaluate((el) => Number(el.getAttribute('width')));
}

/** 秤の要約（「1.4 kg in 1 box · …」）から総重量を kg で読む。 */
async function summaryKg(page: Page): Promise<number> {
  const text = await page.getByTestId('scale-summary').innerText();
  const m = /([\d.]+)\s*kg/.exec(text);
  expect(m, `秤の要約に重量が無い: ${text}`).not.toBeNull();
  return Number(m![1]);
}

/** 台の沈み（translateY の px）。重いほど大きい。 */
async function sink(page: Page): Promise<number> {
  return page.getByTestId('scale-platform').evaluate((el) => {
    const m = /translateY\((-?[\d.]+)px\)/.exec((el as HTMLElement).style.transform);
    return m ? Number(m[1]) : NaN;
  });
}

/** 1点だけのカートにして、その重量欄を返す。帯・段を跨ぐ／跨がないを狙って作れる。 */
async function soloCart(page: Page) {
  await emptyCart(page);
  await addByHand(page, ITEM, 4000);
  await openCart(page);
  await expect(scale(page)).toBeVisible();
  return weightBox(page, ITEM);
}

/** 1位の行を開き、その配達ログの国際送料の額（`.a` セル）を読む。 */
async function intlShippingText(page: Page): Promise<string> {
  const rows = await readRanking(page);
  const i = rows.findIndex((r) => r.cheapest);
  expect(i, 'no cheapest row').toBeGreaterThanOrEqual(0);
  const li = await openRankRow(page, i);
  // 費目名は「EMS to Canada」のように方式＋国なので、内部キーで引く。
  const line = costRowByKey(li, 'intl-shipping');
  await expect(line).toHaveCount(1);
  return (await line.locator('.a').innerText()).replace(/\s+/g, ' ').trim();
}

/** 秤・配達ログの箱の絵で、いま走っている Web Animations の数。 */
async function boxAnimations(page: Page): Promise<number> {
  return page.evaluate(() => document.getAnimations().filter((a) => {
    const t = (a.effect as KeyframeEffect | null)?.target as Element | null;
    return !!t && !!t.closest('#hboxes, [data-testid="pack"]');
  }).length);
}

test('an item you add lands in the box, and drops in', async ({ page }) => {
  await gotoCompare(page);
  await openCart(page);
  const before = await scale(page).getByTestId('packed-item').count();
  expect(before).toBeGreaterThan(0);

  // `addByHand` はカートを開き直すので、落下（380 ms）を捕まえるためにここでは手で足す。
  const form = page.getByRole('form', { name: 'Add an item by hand' });
  if (await page.locator('#manual[hidden]').count()) {
    await page.getByRole('button', { name: 'Add by hand', expanded: false }).first().click();
  }
  await form.getByLabel('Item name').fill(ITEM);
  await form.getByLabel('Price ¥').fill('4000');
  await form.getByRole('button', { name: 'Add by hand' }).click();
  // 箱が乗り直す動き（`Heft` の `useLayoutEffect`）。動きの最中に捕まえる。
  await expect.poll(() => boxAnimations(page), { timeout: 2_000, intervals: [0, 20, 50, 100] }).toBeGreaterThan(0);
  await expect(scale(page).getByTestId('packed-item')).toHaveCount(before + 1);

  // 消したら箱からも消える。任意の順で足せて消せる。
  await openCart(page);
  await page.getByRole('button', { name: `Remove ${ITEM}` }).click();
  await expect(scale(page).getByTestId('packed-item')).toHaveCount(before);
});

test('the box grows only when the parcel crosses a weight band; the scale sinks with every gram', async ({ page }) => {
  await gotoCompare(page);
  const w = await soloCart(page);

  // 900 g → 梱包後 1.4 kg。2 kg の帯の中。
  await w.fill('900');
  await expect.poll(() => summaryKg(page)).toBeLessThanOrEqual(2);
  const widthA = await boxWidth(page);
  const sinkA = await sink(page);

  // 1,000 g → 梱包後 1.5 kg。**同じ帯のまま。**箱は動かないが、台は沈む。
  await w.fill('1000');
  await expect.poll(() => summaryKg(page)).toBeGreaterThan(1.4);
  expect(await summaryKg(page)).toBeLessThanOrEqual(2);
  expect(await boxWidth(page)).toBe(widthA);
  expect(await sink(page)).toBeGreaterThan(sinkA);

  // 4,000 g → 2 kg の帯を出る。ここで初めて箱が大きくなる。
  await w.fill('4000');
  await expect.poll(() => summaryKg(page)).toBeGreaterThan(2);
  expect(await boxWidth(page)).toBeGreaterThan(widthA);
});

test('the postage moves only when the parcel crosses an EMS weight step', async ({ page }) => {
  await gotoCompare(page);
  // **この検査は EMS の段の切り替わり方そのものを見ている**——送料は段の境界を
  // 跨いだときだけ動き、境界の中では動かない、という EMS 固有の契約。
  // 宅配便には対応する契約が無いので方式を EMS に固定する（`cheapest` に任せると
  // この重量域は宅配便が最安になる）。
  await setMethod(page, 'ems');
  const w = await soloCart(page);

  // 900 g → 梱包後 1,380 g。1.5 kg の段の中。
  await w.fill('900');
  await expect.poll(() => summaryKg(page)).toBeCloseTo(1.4, 1);
  const postageA = await intlShippingText(page);
  expect(postageA).toMatch(/¥[\d,]+/);

  // 1,000 g → 梱包後 1,500 g。**同じ段のまま。**送料は動かない。
  await w.fill('1000');
  await expect.poll(() => summaryKg(page)).toBeCloseTo(1.5, 1);
  expect(await intlShippingText(page)).toBe(postageA);

  // 1,100 g → 梱包後 1,620 g。**段を跨ぐ。**ここで初めて送料が動く。
  await w.fill('1100');
  await expect.poll(() => summaryKg(page)).toBeCloseTo(1.6, 1);
  expect(await intlShippingText(page)).not.toBe(postageA);
});

test('over 30 kg the page says there is no published rate, not ¥0', async ({ page }) => {
  await gotoCompare(page);
  await setMethod(page, 'ems');
  const w = await soloCart(page);
  await w.fill('40000');

  // 比べられる行が無いので順位表は「Can't compare」に替わり、社ごとに理由を言う。
  const norank = page.getByTestId('norank');
  await expect(norank).toBeVisible({ timeout: 5000 });
  const text = await norank.innerText();
  expect(text).not.toMatch(/¥0\b/);
  await expect(norank.locator('li[data-row-id]')).toHaveCount(5);
  // 秤は1位の行の箱を描くもの。1位が居ないので、重さも箱も名乗らない。
  await expect(scale(page)).toHaveCount(0);
});

test('the box is operable with the keyboard alone', async ({ page }) => {
  await gotoCompare(page);
  await soloCart(page);
  const w = weightBox(page, ITEM);
  const id = await w.getAttribute('id');
  expect(id).toBeTruthy();

  // Tab だけで重量欄まで行けること。マウスでしか触れない欄は、直せない欄と同じ。
  let reached = false;
  for (let i = 0; i < 160 && !reached; i++) {
    await page.keyboard.press('Tab');
    reached = (await page.evaluate(() => document.activeElement?.id ?? '')) === id;
  }
  expect(reached, 'Tab だけで重量欄に到達できない').toBe(true);

  const kgBefore = await summaryKg(page);
  const widthBefore = await boxWidth(page);
  // 全選択のショートカットは OS で違うので、Home → Shift+End で選んでから打つ。
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.keyboard.type('9000');
  await expect.poll(() => summaryKg(page)).toBeGreaterThan(kgBefore);
  expect(await boxWidth(page)).toBeGreaterThanOrEqual(widthBefore);
});


/**
 * **中身が本当に画面に出ているか。**
 * 一度、中身が描かれてはいるが段ボールとのコントラストが 1.1:1 しかなく、
 * 目では「空の箱」にしか見えない状態を、DOM の存在確認だけのテストが全部通してしまった。
 * 存在（count）も、変わった画素の数も、可視性の証拠にはならない
 * （霞でも画素は動く）。**見分けが付くかはコントラスト比でしか言えない。**
 *
 * 中身（`.it`）を visibility:hidden にした絵と重ね、変化した画素それぞれについて
 * 「中身を描いた色」と「その裏の段ボールの色」のコントラスト比を出し、
 * 一番濃く出ている箇所が非テキストの下限 3:1 に届いているかを見る。
 * 絵は配達ログの Packed の段（等倍。秤の上は 0.5 倍で小さすぎる）。
 */
const NON_TEXT_MIN = 3; // WCAG 2.1 SC 1.4.11 Non-text Contrast

async function openFirstPack(page: Page): Promise<Locator> {
  const rows = await readRanking(page);
  const i = rows.findIndex((r) => r.cheapest);
  expect(i, 'no cheapest row').toBeGreaterThanOrEqual(0);
  const li = await openRankRow(page, i);
  const pack = li.getByTestId('pack');
  await expect(pack).toBeVisible();
  // 落下アニメーションが終わるのを待つ（品数 × 最大 440 ms ＋ 410 ms）。
  await expect.poll(() => boxAnimations(page), { timeout: 8_000 }).toBe(0);
  return pack;
}

async function glyphContrast(pack: Locator): Promise<{ best: number; changed: number }> {
  const page = pack.page();
  const art = pack.locator('.bxart').first();
  await art.scrollIntoViewIfNeeded();
  const shown = (await art.screenshot()).toString('base64');
  const setVis = (v: string) => art.evaluate((el, vis) => {
    el.querySelectorAll<SVGElement>('.it').forEach((g) => { g.style.visibility = vis; });
  }, v);
  await setVis('hidden');
  const blank = (await art.screenshot()).toString('base64');
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

  const one = await glyphContrast(await openFirstPack(page));
  expect(one.changed, '中身が1画素も描かれていない').toBeGreaterThan(0);
  expect(
    one.best,
    `中身と段ボールのコントラストが ${one.best}:1 しかない（箱が空に見える）`,
  ).toBeGreaterThanOrEqual(NON_TEXT_MIN);

  // 品が増えても見分けは落ちない。列は箱の内寸に合わせて縮むので画素数は増えない
  // （`BoxArt` は幅を品数で割る）——数えるのは品の数と、そのときのコントラスト。
  for (let i = 0; i < 5; i++) await addByHand(page, `Bulk ${i}`, 1000);
  const pack = await openFirstPack(page);
  await expect(pack.getByTestId('packed-item')).toHaveCount(6);
  const many = await glyphContrast(pack);
  expect(many.changed, '6点でも中身が描かれている').toBeGreaterThan(0);
  expect(many.best).toBeGreaterThanOrEqual(NON_TEXT_MIN);
});

/**
 * **中身が箱から漏れない。**
 * 品の大きさは実寸を主張していないので、品数が増えたら列ごと縮めて箱の内寸に収める
 * （`BoxArt` は `n` で幅を割る）。9点で、どの品も箱の前面より右に出ないこと。
 */
test('the contents stay inside the box however many you add', async ({ page }) => {
  await gotoCompare(page);
  await emptyCart(page);
  for (let i = 0; i < 9; i++) await addByHand(page, `Spill ${i}`, 1500);
  await expect(scale(page).getByTestId('packed-item')).toHaveCount(9);

  const fit = await scaleBoxes(page).first().locator('svg').evaluate((svg) => {
    // 箱の外形（上面＋側面を含む `.shell` 全体）。中身は奥行きぶん半分ずれて立つ
    // （`BoxArt` の `ox * 0.5`）ので、前面の板ではなく箱全体の幅で「外に出ていない」を見る。
    const shells = [...svg.querySelectorAll<SVGGElement>('g.shell')].map((g) => g.getBBox());
    const left = Math.min(...shells.map((b) => b.x));
    const right = Math.max(...shells.map((b) => b.x + b.width));
    const items = [...svg.querySelectorAll<SVGRectElement>('.it rect')].map((r) => r.getBBox());
    return {
      count: items.length,
      spill: Math.max(Math.max(...items.map((b) => b.x + b.width)) - right, left - Math.min(...items.map((b) => b.x))),
      overlap: items.some((b, i) => items.some((o, j) => j > i && b.x < o.x + o.width && o.x < b.x + b.width)),
    };
  });
  expect(fit.count).toBe(9);
  expect(fit.spill, `中身が箱から ${fit.spill.toFixed(1)}px 漏れている`).toBeLessThanOrEqual(1);
  expect(fit.overlap, '品どうしが重なって描かれている').toBe(false);
});

/** **箱がモバイルで画面外に出ない。**一番大きい帯の箱でも、秤も配達ログの箱も幅に収まる。 */
test('the box stays inside the viewport and never scrolls the page sideways', async ({ page }) => {
  await gotoCompare(page);
  const w = await soloCart(page);
  await w.fill('18000'); // 梱包後 20 kg を超え、一番大きい帯の箱になる（まだ比べられる行が残る重さ）
  await expect.poll(() => summaryKg(page)).toBeGreaterThan(20);
  const pack = await openFirstPack(page);
  await expect(pack.getByTestId('split-box').first()).toBeVisible();

  const r = await page.evaluate(() => {
    const doc = document.documentElement;
    const rect = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
    const heft = rect('[data-testid="scale"]');
    const bx = rect('[data-testid="pack"] .bxart');
    return {
      overflowX: doc.scrollWidth - doc.clientWidth,
      heftRight: heft.right - doc.clientWidth,
      heftLeft: heft.left,
      packRight: bx.right - doc.clientWidth,
    };
  });
  expect(r.overflowX, 'ページが横スクロールする').toBeLessThanOrEqual(0);
  expect(r.heftLeft, '秤が画面の左からはみ出している').toBeGreaterThanOrEqual(0);
  expect(r.heftRight, '秤が画面の右からはみ出している').toBeLessThanOrEqual(0);
  expect(r.packRight, '配達ログの箱が画面の右からはみ出している').toBeLessThanOrEqual(0);
});

test.describe('prefers-reduced-motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('nothing moves — the final state is shown at once', async ({ page }) => {
    await gotoCompare(page);
    await openCart(page);
    const before = await scale(page).getByTestId('packed-item').count();

    const form = page.getByRole('form', { name: 'Add an item by hand' });
    if (await page.locator('#manual[hidden]').count()) {
      await page.getByRole('button', { name: 'Add by hand', expanded: false }).first().click();
    }
    await form.getByLabel('Item name').fill(ITEM);
    await form.getByLabel('Price ¥').fill('4000');
    await form.getByRole('button', { name: 'Add by hand' }).click();

    // 落下の段階を演じない。品は最初から箱の中に居る。
    await expect(scale(page).getByTestId('packed-item')).toHaveCount(before + 1);
    expect(await boxAnimations(page)).toBe(0);

    // 配達ログの箱も同じ。開いた瞬間に中身が揃っていて、動くものは無い。
    const pack = await openFirstPack(page);
    await expect(pack.getByTestId('packed-item')).toHaveCount(before + 1);
    expect(await boxAnimations(page)).toBe(0);
    // それでも「何が起きたか」は言う。動きを止めても情報は削らない。
    await expect(page.getByTestId('scale-summary')).toContainText(/kg in 1 box/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// **秤の置き場所。**
// 秤は「足した品が乗る」絵で、動きが情報を運ぶ。入力から1画面以上離れた場所で動くと、
// **誰も見ていないあいだに動いて終わる。**ここで固定するのは3つ:
//   ・入力欄と秤が同じ視界に入っている（足す前・足した後の両方）
//   ・足しても画面は勝手に動かない（scrollIntoView で祖先を動かした前科がある）
//   ・**答え（順位）を画面の外に押し出していない**
// ─────────────────────────────────────────────────────────────────────────────

/** 追加の入口（キーワード／URL の入力欄）。ここと秤が同じ視界に無ければ意味が無い。 */
function addInput(page: Page) {
  return page.locator('#q');
}

test('the scale is in the same view as the input you add from — before and after adding', async ({ page }) => {
  await gotoCompare(page);

  // 何もスクロールしていない状態で、入力欄と秤が同時に、全部見えている。
  await expect(addInput(page)).toBeInViewport({ ratio: 1 });
  await expect(scale(page)).toBeInViewport({ ratio: 1 });

  const before = await scale(page).getByTestId('packed-item').count();
  const scrolled = await page.evaluate(() => window.scrollY);
  const form = page.getByRole('form', { name: 'Add an item by hand' });
  if (await page.locator('#manual[hidden]').count()) {
    await page.getByRole('button', { name: 'Add by hand', expanded: false }).first().click();
  }
  await form.getByLabel('Item name').fill(ITEM);
  await form.getByLabel('Price ¥').fill('4000');
  await form.getByRole('button', { name: 'Add by hand' }).click();
  await expect(scale(page).getByTestId('packed-item')).toHaveCount(before + 1);

  // **画面は勝手に動かない。**秤を見せるために scrollIntoView を呼ぶのは、
  // 祖先ごと動いて常時開示が画面外に出た（compare.spec の 19・24）ので禁止。
  expect(await page.evaluate(() => window.scrollY), 'ページが勝手にスクロールした').toBe(scrolled);

  // 落ちている最中も、静止した後も、秤は視界の中に居る。
  await expect(addInput(page)).toBeInViewport({ ratio: 1 });
  await expect(scale(page)).toBeInViewport({ ratio: 1 });
  await expect.poll(() => boxAnimations(page), { timeout: 5_000 }).toBe(0);
  await expect(scale(page)).toBeInViewport({ ratio: 1 });
});

test('an empty cart shows how to start, claims no numbers, and the first item you add lands on the scale', async ({ page }) => {
  await gotoCompare(page);
  await emptyCart(page);

  // Mock v3: 空のカートでは秤も順位表も出ず、3つの入口（`.empty`）だけが出る。
  // **持っていない数字を出さない。**空の状態に重量も送料も無い。
  await expect(scale(page)).toHaveCount(0);
  const start = page.getByRole('group', { name: 'How to start' });
  await expect(start).toBeVisible();
  // 3つの入口が最初の画面に全部収まるのは desktop の約束（mobile は縦積みで1画面を超える）。
  if (page.viewportSize()!.width >= 1024) await expect(start).toBeInViewport({ ratio: 1 });
  else await expect(start).toBeInViewport();
  const text = await start.innerText();
  expect(text, '空の状態が金額を名乗っている').not.toMatch(/¥/);
  expect(text, '空の状態が重量を名乗っている').not.toMatch(/\bkg\b/);
  await expect(ranking(page)).toHaveCount(0);

  // 足せば、秤が現れてその箱に入る。
  await addByHand(page, ITEM, 4000);
  await expect(scale(page)).toBeVisible();
  await expect(scale(page).getByTestId('packed-item')).toHaveCount(1);
  await expect(start).toHaveCount(0);
});

test('the scale names the 1st-place row, and follows the ranking when the weight moves it', async ({ page }) => {
  await gotoCompare(page);
  const w = await soloCart(page);

  // 秤の要約は「重さ · 1位の行の名前」（Mock `renderHeft` と同じく社名だけ。方式は
  // 順位表の行と配達ログの国際送料の行が名乗る）。名前は順位表の1位と同じ社。
  const check = async () => {
    const rows = await readRanking(page);
    const first = rows.find((r) => r.cheapest)!;
    const summary = (await page.getByTestId('scale-summary').innerText()).replace(/\s+/g, ' ');
    expect(summary).toContain(first.name);
    const li = await openRankRow(page, rows.indexOf(first));
    const method = (await li.getByTestId('intl-line-note').innerText()).split('·')[0]!.trim();
    expect(method.length).toBeGreaterThan(0);
    await openRankRow(page, rows.indexOf(first)); // 閉じる
    return `${first.name} / ${method}`;
  };
  await w.fill('200');
  await expect.poll(() => summaryKg(page)).toBeLessThan(1);
  const light = await check();
  await w.fill('1500');
  await expect.poll(() => summaryKg(page)).toBeGreaterThan(1.5);
  const heavy = await check();
  // 200 g と 1,500 g で1位（社か方式）が入れ替わる（`compare()` の実測: 郵便 → 宅配便）。
  // 入れ替わらなくなったら、秤が追従したことを別の重量で示す題材に替える。
  expect(heavy, 'the same row wins at 200 g and 1,500 g — pick weights that move the winner').not.toBe(light);
});

// PR-C（2026-09-15）でページの並びが変わった: 秤は条件欄のすぐ下、順位表より前に単独で
// 置く（もう入力・カートと横並びではない）。カートは順位表の下の「たたんだ1行」になった。
// 以前の「箱とカートが横に並ぶ／箱がカートの上に来る」検査はこの並びの前提が
// 無くなったので、その意図（**答え・箱が最初の画面から押し出されない**）だけを
// 引き継いで書き直す——数値・順位は変えていない。
test.describe('layout', () => {
  test('the scale sits above the ranking, and the ranking is still on the first screen', async ({ page }) => {
    await gotoCompare(page);
    const p = (await scale(page).boundingBox())!;
    const rank = (await ranking(page).boundingBox())!;

    // 秤は順位表より前。**幅を問わず成り立つ**——これだけが両方の
    // プロジェクトに共通の約束。
    expect(p.y, '秤が順位表より下に来ている').toBeLessThanOrEqual(rank.y);

    // **「最初の画面に答えが収まる」は元々 desktop 限定の約束**（旧
    // `test.describe('desktop layout')` 参照）。mobile（Pixel 7）は縦積みで
    // もともと1画面に収まらない前提。
    if (page.viewportSize() && page.viewportSize()!.width >= 1024) {
      // Summary（総額・現地通貨換算）は視界の中。
      await expect(page.getByTestId('summary')).toBeInViewport({ ratio: 1 });

      // 順位表そのものも、最初の画面のうちに始まっている。
      const vh = await page.evaluate(() => window.innerHeight);
      expect(
        rank.y,
        `順位表が最初の画面から押し出されている（${Math.round(rank.y)} > ${vh}）`,
      ).toBeLessThan(vh);
    }
  });

  test('the cart (folded line) comes after the ranking, and opening it does not move the scale', async ({ page }) => {
    await gotoCompare(page);
    const p = (await scale(page).boundingBox())!;
    const rank = (await ranking(page).boundingBox())!;
    const c = (await cart(page).boundingBox())!;

    expect(p.y, '秤が順位表より下に来ている').toBeLessThanOrEqual(rank.y);
    expect(rank.y, 'カートが順位表より上に来ている').toBeLessThanOrEqual(c.y);

    // **文書内の絶対位置で比べる。**`openCart` はカートの行（画面外にありうる）を
    // クリックするので、Playwright がそこへスクロールする——`boundingBox()` は
    // ビューポート相対なので、秤自体は動いていなくてもスクロール量だけ数値が
    // ずれる。scrollY を足して文書内の絶対位置に直してから比べる。
    const scrollBefore = await page.evaluate(() => window.scrollY);
    await openCart(page);
    const scrollAfter = await page.evaluate(() => window.scrollY);
    const pAfter = (await scale(page).boundingBox())!;
    const before = p.y + scrollBefore;
    const after = pAfter.y + scrollAfter;
    expect(Math.abs(after - before), 'カートを開くと秤の位置が動いた').toBeLessThan(2);
  });
});
