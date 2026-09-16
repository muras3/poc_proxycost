import type { CourierMethod, PostalMethod } from '@/lib/pricing/types';
import { methodFullLabel } from './methodDisplay';

/**
 * `Row.method` の表示名。**`methodDisplay.ts` の対応表1箇所から出す**
 * （台帳 #15/#56「Ships by 列に方式名が無い」への対応）。
 *
 * **2026-09-16 変更。**以前はここで `POSTAL_METHODS`/`COURIER_METHODS` の
 * `label`（＝各社の原文 `labelRaw`）をそのまま返していた。その結果、順位ボードには
 * `FEDEX LOWCOST`・`DHL (GREEN+)` のように社ごとの表記の癖がそのまま出て、
 * Ship by の選択肢・配達ログとの間で同じ便が違う字で並んでいた。表示名は
 * `methodDisplay.ts` で整形したものに一本化し、**原文は捨てずに**
 * `methodRawNote()` が出す（選択肢の `title`・配達ログの注釈）。
 * `src/lib/pricing` の値・ロジックには一切手を入れていない。
 */
export function methodLabel(method: PostalMethod | CourierMethod): string {
  return methodFullLabel(method);
}
