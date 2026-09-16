import { EVENT_NAMES } from '@/lib/analytics/events';

export const runtime = 'nodejs';

/**
 * ファネルの1件を受けて**数えるだけ**の口。本文は `{ "e": "<段の名前>" }` のみを受け付け、
 * 既知の3語でなければ何も記録せずに 204 を返す（`src/lib/analytics/events.ts` 参照）。
 *
 * **保存先は Cloudflare Workers の Observability**（`wrangler.jsonc` で
 * `"observability": { "enabled": true }` が既に有効）。外部の計測サービスを足していないので、
 * サードパーティに渡るものは無い。
 *
 * **記録しないもの:** 接続元 IP、User-Agent、`Referer`、cookie、国・地域。Worker はこれらを
 * リクエストとして受け取るが、下の1行が書くのは段の名前と時刻だけで、どこにも保存しない。
 * 訪問者を識別する値は発行も保持もしない。
 */
export async function POST(req: Request): Promise<Response> {
  let name: unknown;
  try {
    name = ((await req.json()) as { e?: unknown }).e;
  } catch {
    // 壊れた本文は黙って捨てる。呼び出し側は応答を見ていない。
    return new Response(null, { status: 204 });
  }
  if (typeof name === 'string' && (EVENT_NAMES as readonly string[]).includes(name)) {
    // **1行 = 1件。**集計はログを段の名前で数える。
    console.log(JSON.stringify({ funnel: name, at: new Date().toISOString() }));
  }
  return new Response(null, { status: 204 });
}
