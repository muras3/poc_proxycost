import { POSTAL_METHODS, RANKED_COURIER_METHOD_IDS } from './postage';
import type { CourierMethod, PostalMethod } from './types';

/**
 * **利用者が選ぶ単位は運送会社。**（オーナー確定 2026-09-16）
 *
 * なぜ: 「Ship by」に便を20個並べていたのは間違いだった。細かい便はたいてい1社しか
 * 扱っていないので（`Lowcost` は ZenMarket だけ）、利用者が便を選んだ瞬間に他社が
 * 全部「比べられません」になり、実画面で "4 of 5 services can't be ranked" が出て
 * 比較そのものが成立しなくなる。**選ぶ単位を運送会社に上げれば、どの社もその会社の
 * 便を1つは持っている限り比較に残る。**
 *
 * 便の指名は捨てていない——「Choose a specific service」を開いたときだけ従来の
 * 一覧を出す（`PostalMethod`／`CourierMethod` の指定はそのまま生きている）。
 *
 * **この対応表が唯一の出どころ。** 表示側（`src/lib/ui/methodDisplay.ts`）は
 * ここから運送会社を引く——社名を2箇所に書くと、片方だけ直したときに
 * 「選べる会社」と「行に出る会社名」が食い違う。
 */
export const CARRIER_IDS = [
  'japan-post', 'fedex', 'dhl', 'ups', 'ecms', 'sf-express', 'buyee',
] as const;
export type CarrierId = (typeof CARRIER_IDS)[number];

/** 画面に出す社名。並びは `CARRIER_IDS` の順（郵便が先、あとは社名）。 */
export const CARRIER_NAMES = {
  'japan-post': 'Japan Post',
  fedex: 'FedEx',
  dhl: 'DHL',
  ups: 'UPS',
  ecms: 'ECMS',
  'sf-express': 'SF Express',
  buyee: 'Buyee',
} as const satisfies Record<CarrierId, string>;

/** 画面に出す社名（`CARRIER_NAMES` の値そのもの）。 */
export type CarrierName = (typeof CARRIER_NAMES)[CarrierId];

/**
 * `Ship by` の選択肢の値。`'cheapest'`（既定）か `carrier:<id>`。
 * **文字列にしてあるのは `<select>` の `value` と往復させるため**——オブジェクトだと
 * UI 側で毎回詰め替えることになり、詰め替えを忘れた箇所が静かに既定へ落ちる。
 */
export type CarrierChoice = `carrier:${CarrierId}`;
export function carrierChoice(id: CarrierId): CarrierChoice {
  return `carrier:${id}`;
}
export function carrierIdOfChoice(v: string): CarrierId | null {
  if (!v.startsWith('carrier:')) return null;
  const id = v.slice('carrier:'.length) as CarrierId;
  return CARRIER_IDS.includes(id) ? id : null;
}

/**
 * その便を出している運送会社。**`courier-surface` も含めて全 ID を返す**
 * （順位候補かどうかとは別の話）。
 */
export function carrierOf(method: PostalMethod | CourierMethod): CarrierId {
  if (!method.startsWith('courier-')) return 'japan-post';
  // ZenMarket の `SURFACE` は日本郵便の船便を社の画面から売っているもので、
  // 運送会社としては日本郵便。順位には出ない（`Row.surface` 専用）。
  if (method === 'courier-surface') return 'japan-post';
  if (method.startsWith('courier-fedex')) return 'fedex';
  if (method.startsWith('courier-dhl')) return 'dhl';
  if (method.startsWith('courier-ups')) return 'ups';
  if (method.startsWith('courier-ecms')) return 'ecms';
  if (method.startsWith('courier-sf-express')) return 'sf-express';
  return 'buyee';
}

/**
 * その運送会社の便（順位に出しうるものだけ）。船便は入らない——郵便の
 * `*-surface` 2方式も `courier-surface` も、既定の解決から外すという決定
 * （P2 4、`compare.ts` の `SURFACE_POSTAL_IDS`）をここでも守る。
 * **順位候補の集合を変えないので、`'cheapest'` の結果は1円も動かない。**
 */
export const SURFACE_POSTAL_IDS: readonly PostalMethod[] = ['small-packet-surface', 'parcel-surface'];

export function methodsOfCarrier(id: CarrierId): readonly (PostalMethod | CourierMethod)[] {
  const ids: readonly (PostalMethod | CourierMethod)[] = [
    ...POSTAL_METHODS.map((m) => m.id).filter((m) => !SURFACE_POSTAL_IDS.includes(m)),
    ...RANKED_COURIER_METHOD_IDS,
  ];
  return ids.filter((m) => carrierOf(m) === id);
}
