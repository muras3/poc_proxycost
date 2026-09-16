/**
 * ファネル3段だけを数える最小の計測。**個人情報も、商品を特定しうる値も送らない。**
 *
 * 測りたいのは1つだけ——「比較結果を見た人の何％が代行業者への遷移を押すか」。
 * それには段の**件数**しか要らないので、送るのは下の `EventName` の**1語だけ**にする
 * （2026-09-16 オーナー指示。迷ったら送る情報が少ない方）。
 *
 * **送らないもの（意図的に落としている）:**
 *   - 商品 URL・検索語（`/api/search` `/api/product` には行くが、計測には渡さない）
 *   - 商品名・価格・重量・総額・行き先の国
 *   - どの代行業者を押したか（`serviceName`）。**測りたい問いに要らない。**
 *   - cookie・localStorage・訪問者 ID・指紋のたぐい。**一切発行しない。**
 *   - `document.referrer`、`window.location`（クエリに商品 URL が入りうる）
 *
 * 送るもの: `{ e: <EventName> }` のみ。外部スクリプトは読み込まない（サードパーティに
 * 渡るものが無い）。宛先は同じ Worker 上の `/api/e` で、Worker は他のリクエストと同様に
 * 接続元 IP と User-Agent を**受け取る**が、**それらは記録しない**（`route.ts` 参照）。
 */
export const EVENT_NAMES = ['entry', 'results', 'outbound'] as const;
export type EventName = (typeof EVENT_NAMES)[number];

/**
 * **1回のページ読み込みにつき、各段は最大1回。**こうしないと比が 100% を超えて
 * 「結果を見た人のうち押した割合」として読めなくなる（`outbound` を押すたびに数えると、
 * 1人が複数社を開いただけで分子が膨らむ）。したがって出てくる比の意味は
 * 「結果に到達した読み込みのうち、**1回以上**遷移を押した割合」。
 */
const sent = new Set<EventName>();

export function track(name: EventName): void {
  if (typeof navigator === 'undefined' || sent.has(name)) return;
  sent.add(name);
  const body = JSON.stringify({ e: name });
  try {
    // `sendBeacon` はページ遷移（＝`outbound` の直後に起きる）でも落ちない。
    if (typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon('/api/e', new Blob([body], { type: 'application/json' }));
      return;
    }
    void fetch('/api/e', {
      method: 'POST',
      body,
      keepalive: true,
      headers: { 'content-type': 'application/json' },
    });
  } catch {
    // **計測の失敗で画面を壊さない。**数が落ちるだけの話。
  }
}

/** テスト用。`sent` の重複抑止を初期状態に戻す。 */
export function resetTrackedForTest(): void {
  sent.clear();
}
