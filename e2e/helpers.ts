import { expect, type Locator, type Page } from '@playwright/test';

/**
 * 比較画面を実際に操作するための道具箱。
 * セレクタは role / label / text だけで書く。クラス名は見た目の都合で変わるので当てにしない
 * （唯一の例外は確度の下線を computed style で見る箇所。そこは spec 側に置いた）。
 */

/** ConsentBanner が localStorage に置く鍵。 */
export const CONSENT_KEY = 'proxycost.consent.v1';

/**
 * `Row.id`（`src/lib/pricing/compare.ts` の `buildRow`/`rowsFor` が
 * `svc.id + (variant ? ':' + variant : '')` で組み立てる）の社ID部分から
 * 表示名への対応。`RankBoard.tsx` はこの `id` をそのまま `<li data-row-id>`
 * に落としているので、**行の変種はここから構造的に読む**——行の地の文
 * （'not used as the default because it takes 1-3 months' のような Surface
 * 便の注記など、変種と無関係な文言）を部分一致で探さない。
 *
 * 例: 'zenmarket' → variant なし（null）。'buyee:consolidated' →
 * name='Buyee', variant='consolidated'。
 */
const SERVICE_ID_TO_NAME: Record<string, string> = {
  fromjapan: 'FROM JAPAN',
  zenmarket: 'ZenMarket',
  neokyo: 'Neokyo',
  buyee: 'Buyee',
  jauce: 'Jauce',
};

/**
 * variant を持ちうる社の名前の集合。**`compare.ts` の `rowsFor` を見ると、
 * `svc.parcelDefault === 'per-order'` の社だけが（カートに複数点あるとき）
 * default/consolidated の2行に分かれる。今それに該当するのは Buyee だけ**
 * （`services.ts` の `parcelDefault` フィールド：FROM JAPAN・ZenMarket・Neokyo・
 * Jauce はいずれも `'one'`）。他の4社の行は常に variant: null の単一行。
 *
 * この外の名前に non-null の variant を渡すのは、その場で落とすべき書き間違い
 * ——`findRow`／`rankOf`／`dropOf` に許してしまうと、「見つからない」
 * (`undefined`) が返るだけになり、"disappeared from the ranking" のような
 * ミスリーディングな失敗として1テストずつ後から発覚する
 * （実例: 2026-09-12、`dropOf('FROM JAPAN', 'default')` — FROM JAPAN の
 * `data-row-id` は常に `'fromjapan'` で variant を持たないのに、
 * 旧・部分一致検出の名残りで 'default' を渡していた）。
 */
export const VARIANT_CAPABLE_SERVICES: ReadonlySet<string> = new Set(['Buyee']);

/**
 * 社名（と variant）で1行を引く。**存在しない組み合わせと、そもそもあり得ない
 * 組み合わせを区別する**——後者（`VARIANT_CAPABLE_SERVICES` に無い社に
 * non-null の variant を渡す）はその場で例外にする。前者は `undefined` を返す
 * ので、呼び出し側が「見つからない」ことをどう扱うか決められる。
 */
export function findRow<T extends RankRow>(rows: T[], name: string, variant: string | null = null): T | undefined {
  if (variant !== null && !VARIANT_CAPABLE_SERVICES.has(name)) {
    const capable = [...VARIANT_CAPABLE_SERVICES].join(', ') || '(none)';
    throw new Error(
      `findRow: ${JSON.stringify(name)} has no variants — only ${capable} do — so `
      + `variant must be null, not ${JSON.stringify(variant)}. This is a call-site bug, `
      + `not a missing row. Rows present: `
      + `${rows.map((r) => `${r.name}${r.variant ? `/${r.variant}` : ''}`).join(', ') || '(no rows)'}`,
    );
  }
  return rows.find((r) => r.name === name && r.variant === variant);
}

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
  /** `approx. total ~¥33,500` から読んだ数字。幅表示のときは下限。比較不能なら null。 */
  total: number | null;
  /** 最安との差額。最安行は 0。 */
  diff: number;
  cheapest: boolean;
  /** 行の生テキスト。'pays us nothing' の判定などに使う。 */
  text: string;
  /**
   * 総額が出ている行か。**出ていない行は総額も差額も持たない**——国際送料が
   * 取れていないので、費目の合計は最大の費目を欠いた数字になる。画面は
   * 'NOT COMPARABLE' と `—` を出す。`readRanking` はそれを total=null で表す。
   */
  comparable: boolean;
}

export function ranking(page: Page): Locator {
  return page.getByRole('region', { name: 'Ranking' });
}

/**
 * 順位リストの各行の見出しボタン（Mock v3 の `.rh`）。開閉はこれを押す。
 * 行の中には注釈（§）や1位の札の横の秤の針（`.wmk`、これも li の直下）も居るので、`role=button` では数が合わない
 * ——配達ログを開く `aria-controls="log-…"` を持つボタンだけを引く。
 */
export function rankButtons(page: Page): Locator {
  return ranking(page).locator('li[data-row-id] > button[aria-controls^="log-"]');
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
export const DECIDES = /This weight decides 1st place/;

export function breakdownTable(page: Page): Locator {
  return page.locator('#all-fees');
}

/**
 * **PR-C（2026-09-15）で全社費目表・What could be off が折りたたみになった。**
 * `<details data-testid="breakdown-toggle">` の中に入っている——閉じたままでは
 * `breakdownTable`/`WhatCouldBeOff` の中身は `toBeVisible()` に落ちる（`hidden`
 * になるのは `<details>` の既定挙動）。中身を見るテストは先にこれを開く。
 * 既に開いていれば何もしない。
 */
export async function openBreakdown(page: Page): Promise<void> {
  for (const id of ['all-fees', 'what-could-be-off']) {
    const details = page.locator(`#${id}`);
    if (!(await details.count())) continue;
    const isOpen = await details.evaluate((el) => (el as HTMLDetailsElement).open);
    if (!isOpen) await details.locator('summary').click();
  }
}

/** '¥33,500' / '~¥33,500' / '¥1,000 – 2,000' から最初の数字を取る。 */
export function parseYen(text: string): number {
  const m = text.replace(/[−–—]/g, '-').match(/-?[\d,]+/);
  if (!m) throw new Error(`no number in ${JSON.stringify(text)}`);
  return Number(m[0].replace(/,/g, ''));
}

/** その要素の中心が実際にその要素自身に落ちるか（別の要素に取られていないか）。 */
async function pointerLandsOnSelf(locator: Locator): Promise<{ ok: boolean; hit: string | null }> {
  const box = await locator.boundingBox();
  if (!box) return { ok: false, hit: null };
  const page = locator.page();
  const hit = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.outerHTML.slice(0, 200) ?? null,
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  );
  const self = await locator.evaluate((el) => el.outerHTML.slice(0, 200));
  return { ok: hit === self, hit };
}

/**
 * 同意バナーが出るのを待ってから選ぶ。
 * バナーは useEffect でしか出ないので、**出たこと自体が hydration 完了の証拠**になる。
 * SSR された順位リストは押しても動かない時間帯があるため、この待ちを全テストの入口にする。
 *
 * **タッチエミュレーション（mobile project）下で不安定だった**（実測: CI の
 * shard 3/4・4/4 で `assumed-weights.spec.ts` 以降の全モバイルテストが
 * 60秒ぴったりで失敗し続け、ジョブの `timeout-minutes: 15` に達して
 * `cancelled` として打ち切られた——並列実行の設定ではなく、ここが実際に
 * 壊れて時間を食いつぶしていた）。
 *
 * 直したのは3点:
 *   1. **バナーの出現を待った直後にクリックへ突撃しない。**ボタン自身が
 *      「見えている」だけでなく「クリック先が実際にそのボタン自身に落ちる」
 *      （他の要素に奪われていない）ところまで待ってから押す。
 *   2. **バナーが出ないこと自体を即座に壊れているとは扱わない。**同意が
 *      既に決まっている（バナーを出す条件が成り立たない）状態と、
 *      hydration が本当に終わっていない状態を区別する——後者だけを壊れて
 *      いるとみなす。
 *   3. **失敗したら、素の Playwright タイムアウトのまま投げない。**
 *      「バナーが最後まで出なかった」「ボタンは見えたがクリック先を別の
 *      要素に奪われ続けた（奪っていた要素を名指しする）」のどちらで詰まったかを
 *      メッセージに残す——次にここが壊れたとき、原因を推測させない。
 */
export async function gotoCompare(
  page: Page,
  opts: { consent?: 'denied' | 'granted' | 'leave' } = {},
): Promise<void> {
  await page.goto('/');
  const banner = page.getByRole('dialog', { name: 'Cookie consent' });

  // **出現とハイドレーションを別々に待つ。**バナーが出なくても、順位が既に
  // 出ていれば「同意済みで最初から出さない」という正常な状態でありうる。
  const appeared = await banner.waitFor({ state: 'visible', timeout: 15_000 })
    .then(() => true).catch(() => false);

  if (!appeared) {
    const hydrated = await rankButtons(page).first().isVisible().catch(() => false);
    if (!hydrated) {
      throw new Error(
        'gotoCompare: the cookie consent banner never appeared, and the ranking is not '
        + 'visible either — hydration did not complete within 15s (neither a fresh consent '
        + 'prompt nor an already-decided, already-priced page showed up).',
      );
    }
    return; // 同意済みでバナー自体が出ない、正常な状態。
  }

  const choice = opts.consent ?? 'denied';
  if (choice === 'leave') {
    await expect(rankButtons(page).first()).toBeVisible();
    return;
  }

  const label = choice === 'denied' ? 'Reject' : 'Accept';
  const button = banner.getByRole('button', { name: label });
  await expect(button, `gotoCompare: the "${label}" button never appeared in the banner`)
    .toBeVisible({ timeout: 15_000 });

  // **見えているだけでは押せる保証にならない。**クリック先が実際にこのボタン
  // 自身に落ちるまで、短い間隔でポーリングする——同じ愚直な `.click()` を
  // 60秒黙って再試行させるより、詰まっている理由（何に奪われているか）を
  // 拾って途中で名指しできる。
  let lastHit: string | null = null;
  let landed = false;
  for (let i = 0; i < 30 && !landed; i++) {
    const check = await pointerLandsOnSelf(button);
    landed = check.ok;
    lastHit = check.hit;
    if (!landed) await page.waitForTimeout(500);
  }
  if (!landed) {
    throw new Error(
      `gotoCompare: the "${label}" button is visible but its click point is intercepted by `
      + `another element, not itself, for 15s straight — intercepting element: `
      + `${lastHit ?? '(none — element not found at that point)'}`,
    );
  }

  await button.click();
  await expect(banner, 'gotoCompare: clicked the banner button but the banner never closed')
    .toBeHidden();
  await expect(rankButtons(page).first()).toBeVisible();
}

/**
 * カートは**既定でどの幅でも畳まれている**（PR-C、mock-v3 §cart——以前は lg 以上で
 * 常に開いていたが、その版は「たたんだ1行」という mock の形を lg で捨てていた）。
 * 中身が見えていなければ、たたんだ1行（`data-testid="cart-line"`、条件欄の
 * `data-testid="conditions-cart-summary"` からも開ける）を押して開く。
 */
export async function openCart(page: Page): Promise<Locator> {
  const c = cart(page);
  const first = c.getByRole('listitem').first();
  if (!(await first.isVisible())) {
    await page.getByTestId('cart-line').click();
  }
  await expect(first).toBeVisible();
  return c;
}

/** カートをたたむ（開いていれば「Done」）。 */
export async function closeCart(page: Page): Promise<void> {
  const done = cart(page).getByRole('button', { name: 'Done' });
  if (await done.count()) await done.click();
}

/**
 * 送り先を選ぶ。条件欄の送り先は閉じているときは1つのボタン（Mock v3 `.wplacebtn`）で、
 * 押すと `Ship to` の select（カナダなら `Province` も）が出る。
 */
export async function shipTo(page: Page, code: string): Promise<void> {
  if (!(await page.getByLabel('Ship to').count())) await page.locator('#wPlace').click();
  await page.getByLabel('Ship to').selectOption(code);
  const done = page.locator('#wPlaceDone');
  if (await done.count()) await done.click();
}

/** 州を選ぶ（送り先がカナダのとき）。開いていなければ送り先を開いてから。 */
export async function setProvince(page: Page, code: string): Promise<void> {
  if (!(await page.getByLabel('Province').count())) await page.locator('#wPlace').click();
  await page.getByLabel('Province').selectOption(code);
}

/** 条件欄の送り先ボタン（閉じた状態の表示）。 */
export function destination(page: Page): Locator {
  return page.locator('#wPlace');
}

/**
 * 順位リストを読む。数字は決め打ちせず、関係だけを検証するための材料にする。
 * **行の地の文を正規表現で解析しない。**Mock v3 の行は、順位（`.c-rank`）・
 * 総額（`.tot` の aria-label）・差額（`.flap.diff` の aria-label）を別々の要素に
 * 持っているので、それぞれを構造的に読む。
 */
export async function readRanking(page: Page): Promise<RankRow[]> {
  const buttons = rankButtons(page);
  await expect(buttons.first()).toBeVisible();
  const n = await buttons.count();
  const lis = ranking(page).locator('li[data-row-id]');
  if ((await lis.count()) !== n) {
    throw new Error(
      `readRanking: found ${n} rank button(s) but ${await lis.count()} li[data-row-id] element(s) `
      + `— they should be 1:1 (one <li data-row-id> wrapping one row button each).`,
    );
  }
  const out: RankRow[] = [];
  for (let i = 0; i < n; i++) {
    const li = lis.nth(i);
    const rowId = (await li.getAttribute('data-row-id')) ?? '';
    const text = (await li.innerText()).replace(/\s+/g, ' ').trim();
    // `.c-rank` は '01' の後ろに読み上げ用の「CHEAPEST」等（`.sr`）を持つ。先頭の数字だけを読む。
    const rankText = (await li.locator('[data-testid="row-rank"]').innerText()).trim();
    const rankNum = rankText.match(/^(\d+)/);
    const diffLabel = (await li.locator('.flap.diff').getAttribute('aria-label')) ?? '';
    const totalLabel = (await li.locator('.tot').first().getAttribute('aria-label')) ?? '';
    // 比べられない行は順位に '—'、差額に 'NOT RANKED'、総額に `—` を出す。
    const comparable = diffLabel !== 'NOT RANKED';
    if (comparable && !/^¥[\d,]+/.test(totalLabel)) throw new Error(`row ${i} has no total: ${totalLabel} / ${text}`);
    if (!comparable && /^¥/.test(totalLabel)) throw new Error(`row ${i} is not comparable but still prints a total: ${text}`);
    // 判定不能では「1ST」ではなく「LEADS」——`row.cheapest`（下端最小）の事実は同じなので同じ意味に読む。
    const cheapest = comparable && /^(1ST|LEADS)$/.test(diffLabel);
    const shown = rankNum ? Number(rankNum[1]) : 0;
    if (!shown && comparable) throw new Error(`row ${i} shows no rank number: ${rankText} / ${text}`);
    const [svcId, variantPart] = rowId.split(':');
    const name = svcId ? SERVICE_ID_TO_NAME[svcId] : undefined;
    if (!name) {
      const known = Object.keys(SERVICE_ID_TO_NAME).join(', ');
      throw new Error(
        `readRanking: row ${i} has data-row-id=${JSON.stringify(rowId)}, whose service id `
        + `${JSON.stringify(svcId)} is not one of the known ids (${known}). Row text: ${text}`,
      );
    }
    out.push({
      rank: i + 1,
      shownRank: shown,
      tied: /Tied with /.test(text),
      name,
      variant: variantPart ?? null,
      total: comparable ? parseYen(totalLabel) : null,
      diff: cheapest || !comparable ? 0 : parseYen(diffLabel),
      cheapest,
      text,
      comparable,
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
  const li = ranking(page).locator('li[data-row-id]').nth(index);
  // 開いた中身は配達ログ（Mock v3 `.log`）。見た目は grid だが `role=table` を持つ。
  await expect(li.getByRole('table')).toBeVisible();
  return li;
}

/** 開いた行の2列比較から、費目名（左端セル）で1行を引く。 */
export function costRow(li: Locator, label: string | RegExp): Locator {
  return li.getByRole('row').filter({ has: li.page().getByRole('cell', { name: label }) });
}

/**
 * 開いた行の2列比較から、費目の内部キー（`Line.key`、`RowBreakdown.tsx` の
 * `data-cost-key`）で1行を引く。**同じ label 文字列を持つ行が2本以上ありうる
 * 費目（例: 国境側の `vat` 行と、社側の前払いをまとめる `prepaid-import-tax` 行は
 * どちらもラベルが "VAT"／"VAT collected at checkout" で始まる）は、
 * 文言ではなくこちらで引く。**
 */
export function costRowByKey(li: Locator, key: string): Locator {
  return li.locator(`[data-cost-key="${key}"]`);
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
  return page.getByTestId('scope-disclosure');
}

/** 「Ship by §」の注釈を開く（比べている範囲の開示はこの中に居る。Mock v3: wording only inside the popover）。 */
export async function openScopeNote(page: Page): Promise<Locator> {
  const mark = page.getByRole('button', { name: 'About: How methods are compared' });
  if ((await mark.getAttribute('aria-expanded')) !== 'true') await mark.click();
  await expect(emsOnlyNote(page)).toBeVisible();
  return emsOnlyNote(page);
}

/** 常時アイコン（送れるか未確認）を開く。 */
export async function openRestrictedNote(page: Page): Promise<Locator> {
  const icon = page.getByTestId('icon-shippability');
  if ((await icon.getAttribute('aria-expanded')) !== 'true') await icon.click();
  await expect(restrictedNote(page)).toBeVisible();
  return restrictedNote(page);
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
 * カートに「送料無料」の出品が1点でもあるときだけ出る、Buyee 限定の注記
 * （`FreeShippingDomesticNote`、T-F10）。無いときは出ない。
 */
export function freeShippingDomesticNote(page: Page): Locator {
  return page.locator('p').filter({ hasText: /domestic shipping fees may occur/ });
}

/**
 * 手入力で1点足す。**検索も URL 取得も要らない唯一の経路**なので、
 * 入力を組み立てるテストはここを通る。`site` を渡すと出品サイトも選ぶ。
 */
/**
 * 配送方式を固定する（`MethodPicker`、`#ship-by-select`）。**既定は `cheapest`**
 * ——宅配便が7カ国に配線されてから（#87）、既定カートを含め多くの重量で最安が
 * 宅配便に替わった（`ParcelView` の EMS 専用の絵・アニメーションは方式が
 * `PostalMethod` の行にしか出ない、#88 follow-up）。**EMS の箱・目盛り・落下
 * アニメーション自体を検査するテストは、`cheapest` に任せると重量やカートの
 * 中身次第で宅配便に化ける**——そういうテストは `'ems'` へ明示的に固定して、
 * 何を検査しているかをテスト自身に語らせる（「たまたま今は EMS が最安」に
 * 頼らない）。
 */
export async function setMethod(page: Page, method: string): Promise<void> {
  await page.locator('#ship-by-select').selectOption(method);
}

export async function addByHand(
  page: Page, title: string, priceYen: number, site?: string,
): Promise<void> {
  // 「Add by hand」のリンクがフォームを開く（aria-controls=manual）。開いていれば押さない。
  if (await page.locator('#manual[hidden]').count()) {
    await page.getByRole('button', { name: 'Add by hand', expanded: false }).first().click();
  }
  const form = page.getByRole('form', { name: 'Add an item by hand' });
  await form.getByLabel('Item name').fill(title);
  await form.getByLabel('Price ¥').fill(String(priceYen));
  if (site) await form.getByLabel('Site').selectOption(site);
  await form.getByRole('button', { name: 'Add by hand' }).click();
  // Mock v3 は足してもカートを開かない。足した品を直すテストが多いので、ここで開いておく。
  await openCart(page);
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
