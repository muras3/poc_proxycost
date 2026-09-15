import { COURIER_METHODS, POSTAL_METHODS } from '@/lib/pricing/postage';
import type { CourierMethod, PostalMethod } from '@/lib/pricing/types';

/**
 * `Row.method` の表示名。**読み取り専用の対応表引き**——`POSTAL_METHODS`/
 * `COURIER_METHODS`（`src/lib/pricing/postage.ts`）は既に画面向けの `label`
 * を持っているので、ここではそれを引くだけで新しい文字列を作らない
 * （台帳 #15/#56「Ships by 列に方式名が無い」への対応）。
 * `src/lib/pricing` の値・ロジックには一切手を入れていない。
 */
export function methodLabel(method: PostalMethod | CourierMethod): string {
  const postal = POSTAL_METHODS.find((m) => m.id === method);
  if (postal) return postal.label;
  const courier = COURIER_METHODS.find((m) => m.id === method);
  return courier?.label ?? method;
}
