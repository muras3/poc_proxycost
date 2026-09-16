import { COURIER_METHODS, POSTAL_METHODS, RANKED_COURIER_METHOD_IDS } from '@/lib/pricing/postage';
import type { CountryCode, CourierMethod, PostalMethod } from '@/lib/pricing/types';
import { COUNTRIES } from '@/lib/pricing/countries';

/**
 * **画面に出す方式名・日数・状態語の対応表。1箇所だけ。**（オーナー確定 2026-09-16）
 *
 * ここに入っている文字列は**整形した表示名**であって、各社の原文ではない。
 * 原文（`labelRaw`）は `raw`／`rawFrom` に必ず残し、選択肢の `title` と
 * 配達ログの注釈に出す——捨てない。
 *
 * **なぜ整形するか**: 運送会社でグループにすると、選択肢の文字列は
 * `FEDEX LOWCOST`・`DHL (GREEN+)`・`ECMS EXPRESS` のように社ごとの表記の癖が
 * そのまま並び、同じ画面の中で大文字小文字・日数の書式・追跡の言い回しが
 * 食い違う。読む側にとってそれは情報ではなく雑音なので、**表示だけ**をそろえる。
 *
 * **束ねない。**表示名を整えるのは見せ方だけで、便を1つにまとめたり、別の社の便を
 * 同じ ID にしたりはしない（`types.ts:36` の決定を変えない）——同じブランドでも便で
 * 順位が入れ替わり、日数が違うから。だから `METHOD_DISPLAY` の鍵は
 * `RANKED_COURIER_METHOD_IDS` と `POSTAL_METHODS` の ID と1対1で、
 * `methodDisplay.test.ts` がその1対1と、`raw` が実際の `labelRaw` と一致することを
 * 検査する（表示名を勝手に書き換えても、原文との対応が崩れれば落ちる）。
 *
 * **数値・順位には一切触れない。**`src/lib/pricing` は読むだけ。
 */

/** グループ（運送会社）。並びはこの順で画面に出る。 */
export const CARRIERS = [
  'Japan Post', 'FedEx', 'DHL', 'UPS', 'ECMS', 'SF Express', 'Buyee',
] as const;
export type Carrier = (typeof CARRIERS)[number];

/**
 * **状態語は1つずつしか持たない。**同じことを2通りに言わない
 * （`no tracking`/`untracked`、`not yet modeled`/`transit time not published` の混在をやめる）。
 */
export const DAYS_NOT_PUBLISHED = 'transit time not published';
export const UNTRACKED = 'untracked';
export const TRACKED = 'tracked';
/** 種別を社が公表していない便（ZenMarket の無印 `FEDEX` など）。勝手に Standard としない。 */
export const TIER_NOT_PUBLISHED = '(tier not published)';
/** その宛先でその便の価格を持っていない。 */
export function notPricedFor(country: CountryCode): string {
  return `not priced for ${COUNTRIES[country].name}`;
}

export interface MethodDisplay {
  id: PostalMethod | CourierMethod;
  carrier: Carrier;
  /** グループの中での便名。**会社名は重ねない**（FedEx グループの中は `Economy`）。 */
  service: string;
  /** 日数。書式は1つ（`3–5 days` / `≤1 week` / `1–3 months` / `transit time not published`）。 */
  days: string;
  tracked: boolean;
  /** 社の原文（`labelRaw`／`PostalMethodSpec.label`）。整形前。 */
  raw: string;
  /** その原文を印字している社。 */
  rawFrom: string;
}

/**
 * 郵便5方式。方式名は日本郵便の表記がすでにそろっているのでそのまま使い、
 * **日数の書式だけ**そろえる（`a week or less` → `≤1 week`）。日数の原文は
 * `POSTAL_METHODS[].days` に残っており、出典 URL もそちらが持っている。
 */
const POSTAL: Record<PostalMethod, { service: string; days: string; tracked: boolean }> = {
  ems: { service: 'EMS', days: '≤1 week', tracked: true },
  'small-packet-air': { service: 'Small packet (airmail)', days: '≤10 days', tracked: false },
  'parcel-air': { service: 'International parcel (airmail)', days: '12–26 days', tracked: true },
  'small-packet-surface': { service: 'Small packet (surface)', days: '1–3 months', tracked: false },
  'parcel-surface': { service: 'International parcel (surface)', days: '1–3 months', tracked: true },
};

/**
 * 宅配便。`service` は整形した表示名、`raw` は社の原文の便名。
 * 原文に括弧で入っている日数は名前から外し、`days` に移す（`Connect Plus · 3–5 days`）。
 */
const COURIER: Record<CourierMethod, {
  carrier: Carrier; service: string; days: string; raw: string; rawFrom: string;
}> = {
  'courier-fedex': {
    carrier: 'FedEx', service: TIER_NOT_PUBLISHED, days: DAYS_NOT_PUBLISHED,
    raw: 'FEDEX', rawFrom: 'ZenMarket',
  },
  'courier-fedex-economy': {
    carrier: 'FedEx', service: 'Economy', days: DAYS_NOT_PUBLISHED,
    raw: 'FedEx - Economy', rawFrom: 'FROM JAPAN',
  },
  'courier-fedex-priority': {
    carrier: 'FedEx', service: 'Priority', days: DAYS_NOT_PUBLISHED,
    raw: 'FedEx - Priority', rawFrom: 'FROM JAPAN',
  },
  'courier-fedex-lowcost': {
    carrier: 'FedEx', service: 'Lowcost', days: DAYS_NOT_PUBLISHED,
    raw: 'FEDEX LOWCOST', rawFrom: 'ZenMarket',
  },
  'courier-fedex-connect-plus': {
    carrier: 'FedEx', service: 'Connect Plus', days: '3–5 days',
    raw: 'FedEx International Connect Plus (3-5 days)', rawFrom: 'Neokyo',
  },
  'courier-ups': {
    carrier: 'UPS', service: TIER_NOT_PUBLISHED, days: DAYS_NOT_PUBLISHED,
    raw: 'UPS', rawFrom: 'ZenMarket',
  },
  'courier-dhl': {
    carrier: 'DHL', service: TIER_NOT_PUBLISHED, days: DAYS_NOT_PUBLISHED,
    raw: 'DHL', rawFrom: 'FROM JAPAN',
  },
  'courier-dhl-green-plus': {
    carrier: 'DHL', service: 'Green+', days: DAYS_NOT_PUBLISHED,
    raw: 'DHL (GREEN+)', rawFrom: 'ZenMarket',
  },
  'courier-dhl-express-1200': {
    carrier: 'DHL', service: 'Express 12:00', days: '2–5 days',
    raw: 'DHL EXPRESS 12:00 (2-5 days)', rawFrom: 'Neokyo',
  },
  'courier-dhl-express-worldwide': {
    carrier: 'DHL', service: 'Express Worldwide', days: '2–6 days',
    raw: 'DHL Express Worldwide (2-6 days)', rawFrom: 'Neokyo',
  },
  'courier-sf-express': {
    carrier: 'SF Express', service: TIER_NOT_PUBLISHED, days: DAYS_NOT_PUBLISHED,
    raw: 'courier-sf-express', rawFrom: 'no service prints this method today',
  },
  'courier-ecms': {
    carrier: 'ECMS', service: TIER_NOT_PUBLISHED, days: DAYS_NOT_PUBLISHED,
    raw: 'ECMS', rawFrom: 'FROM JAPAN',
  },
  'courier-ecms-express': {
    carrier: 'ECMS', service: 'Express', days: DAYS_NOT_PUBLISHED,
    raw: 'ECMS EXPRESS', rawFrom: 'ZenMarket',
  },
  'courier-buyee-air': {
    carrier: 'Buyee', service: 'Air Delivery', days: DAYS_NOT_PUBLISHED,
    raw: 'Buyee Air Delivery', rawFrom: 'Buyee',
  },
  // `courier-surface` はランキング候補ではない（`Row.surface` 専用）が、型のために持つ。
  'courier-surface': {
    carrier: 'Japan Post', service: 'International parcel (surface)', days: '1–3 months',
    raw: 'SURFACE', rawFrom: 'ZenMarket',
  },
};

/** その方式の表示情報。**ここを通さずに方式名を組み立てない。** */
export function methodDisplay(method: PostalMethod | CourierMethod): MethodDisplay {
  const postal = POSTAL[method as PostalMethod];
  if (postal) {
    const spec = POSTAL_METHODS.find((m) => m.id === method);
    return {
      id: method, carrier: 'Japan Post', service: postal.service, days: postal.days,
      tracked: postal.tracked, raw: spec?.label ?? postal.service, rawFrom: 'Japan Post',
    };
  }
  const c = COURIER[method as CourierMethod];
  // 宅配便の追跡の有無は社ごとの一次情報を持っていない（`COURIER_METHODS.tracked` も
  // 一律 true の決め打ち）。ここで新しい事実を作らないよう、同じ扱いのままにする。
  return {
    id: method, carrier: c.carrier, service: c.service, days: c.days,
    tracked: true, raw: c.raw, rawFrom: c.rawFrom,
  };
}

/**
 * 方式だけを見せる場所（順位ボードの Ships by 列・配達ログ）で使う、単独で読める名前。
 * グループの外に出るので、ここでは会社名を付ける。
 */
export function methodFullLabel(method: PostalMethod | CourierMethod): string {
  const d = methodDisplay(method);
  if (d.carrier === 'Japan Post') return d.service;
  return d.service === TIER_NOT_PUBLISHED ? `${d.carrier} ${TIER_NOT_PUBLISHED}` : `${d.carrier} ${d.service}`;
}

/** 原文の出どころ（選択肢の `title`・配達ログの注釈に出す1つの言い方）。 */
export function methodRawNote(method: PostalMethod | CourierMethod): string {
  const d = methodDisplay(method);
  return `${d.rawFrom}: “${d.raw}”`;
}

export interface CarrierGroup {
  carrier: Carrier;
  methods: readonly MethodDisplay[];
}

/**
 * 選択肢を運送会社でまとめる。**順位も候補も変えない**——`POSTAL_METHODS` と
 * `RANKED_COURIER_METHOD_IDS` の並びをそのまま会社ごとに畳むだけ。
 * `pick` で「その宛先で価格が付く便だけ」「付かない便だけ」を切り分ける。
 */
export function methodGroups(
  pick: (id: PostalMethod | CourierMethod) => boolean,
): readonly CarrierGroup[] {
  const ids: readonly (PostalMethod | CourierMethod)[] = [
    ...POSTAL_METHODS.map((m) => m.id), ...RANKED_COURIER_METHOD_IDS,
  ];
  const out: CarrierGroup[] = [];
  for (const id of ids) {
    if (!pick(id)) continue;
    const d = methodDisplay(id);
    const g = out.find((x) => x.carrier === d.carrier);
    if (g) (g.methods as MethodDisplay[]).push(d);
    else out.push({ carrier: d.carrier, methods: [d] });
  }
  // グループの並びは `CARRIERS`（郵便が先、あとは社名）。中身の並びはマスタのまま。
  return out.sort((a, b) => CARRIERS.indexOf(a.carrier) - CARRIERS.indexOf(b.carrier));
}

/** `COURIER_METHODS` を読むのはテストのため（原文との対応が崩れていないかの検査）。 */
export const COURIER_RAW_LABELS: Readonly<Record<string, string>> =
  Object.fromEntries(COURIER_METHODS.map((m) => [m.id, m.label]));
