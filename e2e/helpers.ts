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
  // **社名と変種は行の地の文からではなく、`<li data-row-id>` から構造的に読む。**
  // `data-row-id` は各行に1個ずつ、ボタンと同じ並び順で乗っている
  // （`RankBoard.tsx` の `<li data-row-id={row.id}><button>…`）。
  const rowIds = await ranking(page).locator('li[data-row-id]').evaluateAll(
    (els) => els.map((el) => el.getAttribute('data-row-id')),
  );
  if (rowIds.length !== n) {
    throw new Error(
      `readRanking: found ${n} rank button(s) but ${rowIds.length} li[data-row-id] element(s) `
      + `— they should be 1:1 (one <li data-row-id> wrapping one row button each). `
      + `row ids seen: ${JSON.stringify(rowIds)}`,
    );
  }
  const out: RankRow[] = [];
  for (let i = 0; i < n; i++) {
    const text = (await buttons.nth(i).innerText()).replace(/\s+/g, ' ').trim();
    // **比べられない行は 'NOT COMPARABLE' と `approx. total —` を出す。**
    // 額が無いことが正しい状態なので、ここで落とさずに null として持ち帰る。
    const comparable = !/NOT COMPARABLE/.test(text);
    const totalMatch = text.match(/approx\. total\s*~?(¥[\d,]+)/);
    if (comparable && !totalMatch) throw new Error(`row ${i} has no approx. total: ${text}`);
    if (!comparable && totalMatch) {
      throw new Error(`row ${i} is not comparable but still prints a total: ${text}`);
    }
    // 判定不能では「CHEAPEST」と言い切らず「LEADS」に変わる（P1-3 追修正、
    // `RankBoard` の `diffText`）——`row.cheapest`（下端最小）という事実自体は
    // 変わらないので、どちらの文言でも同じ意味として読む。
    const cheapest = /(^|\s)(CHEAPEST|LEADS)(\s|$)/.test(text);
    const diffMatch = text.match(/\+¥([\d,]+)/);
    // 行頭の数字がその行の順位。並び順（i+1）と一致するとは限らない。
    const shown = text.match(/^(\d+)\s/);
    if (!shown) throw new Error(`row ${i} shows no rank number: ${text}`);
    // **社名と変種は `data-row-id`（例: 'buyee:consolidated'）から読む。**
    // 以前はここを行の地の文の部分一致（`text.includes('consolidated' | 'default')`）
    // で読んでいたため、ZenMarket の Surface 便注記 "not used as the **default**
    // because it takes 1-3 months" のような、変種と無関係な地の文が
    // `variant: 'default'` として誤検出されていた（ZenMarket は default/consolidated
    // の変種を持たない社で、常に variant は null のはずだった）。地の文はこれからも
    // 変わり続けるので、部分一致は「今日たまたま引っかからない」だけで直っていない。
    const rowId = rowIds[i]!;
    const [svcId, variantPart] = rowId ? rowId.split(':') : [undefined, undefined];
    const name = svcId ? SERVICE_ID_TO_NAME[svcId] : undefined;
    if (!name) {
      const known = Object.keys(SERVICE_ID_TO_NAME).join(', ');
      throw new Error(
        `readRanking: row ${i} has data-row-id=${JSON.stringify(rowId)}, whose service id `
        + `${JSON.stringify(svcId)} is not one of the known ids (${known}). Row text: ${text}`,
      );
    }
    const variant = variantPart ?? null;
    out.push({
      rank: i + 1,
      shownRank: Number(shown[1]),
      tied: /tied with /.test(text),
      name,
      variant,
      total: totalMatch ? parseYen(totalMatch[1]!) : null,
      diff: cheapest ? 0 : parseYen(diffMatch?.[1] ?? '0'),
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
  const li = ranking(page).getByRole('listitem').nth(index);
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
  return li.locator(`tr[data-cost-key="${key}"]`);
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
