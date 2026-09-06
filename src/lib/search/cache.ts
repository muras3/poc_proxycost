// Cloudflare KV があればそれを、無ければプロセス内 Map を使う。
// vitest / next build / next dev のどれでも落ちないこと（相手への礼儀のための仕組みが
// 落ちて本体を巻き込むのは本末転倒）。

interface KVLike {
  get(key: string, type: 'text'): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

const memory = new Map<string, { value: string; expires: number }>();

async function kv(): Promise<KVLike | null> {
  try {
    const mod = await import('@opennextjs/cloudflare');
    const ctx = mod.getCloudflareContext?.();
    const binding = (ctx?.env as Record<string, unknown> | undefined)?.['CACHE'];
    return (binding as KVLike | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function cacheGet(key: string): Promise<string | null> {
  const store = await kv();
  if (store) {
    try {
      return await store.get(key, 'text');
    } catch {
      return null;
    }
  }
  const hit = memory.get(key);
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    memory.delete(key);
    return null;
  }
  return hit.value;
}

export async function cachePut(key: string, value: string, ttlSeconds: number): Promise<void> {
  const store = await kv();
  if (store) {
    try {
      await store.put(key, value, { expirationTtl: ttlSeconds });
    } catch {
      // キャッシュに書けなくても本体は動く。
    }
    return;
  }
  memory.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
}

export const TTL_SEARCH = 60 * 60 * 24; // 24h
export const TTL_PRODUCT = 60 * 60;     // 1h
