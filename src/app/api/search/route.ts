import { NextResponse } from 'next/server';
import { z } from 'zod';
import { braveSearch, isSearchConfigured, NOT_CONFIGURED } from '@/lib/search/brave';

export const runtime = 'nodejs';

const querySchema = z.string().trim().min(1).max(120);

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q');
  const parsed = querySchema.safeParse(q ?? '');
  if (!parsed.success) {
    // 空のクエリを「未設定」と書かない。キーの有無は別の事実なので別に答える。
    return NextResponse.json(
      {
        configured: isSearchConfigured(),
        results: [],
        reason: isSearchConfigured() ? 'Enter a keyword to search.' : NOT_CONFIGURED,
      },
      { status: 200 },
    );
  }
  // キーが無くても 200 を返す。UI は URL を貼る道に落ちる。例外で画面を壊さない。
  return NextResponse.json(await braveSearch(parsed.data), { status: 200 });
}
