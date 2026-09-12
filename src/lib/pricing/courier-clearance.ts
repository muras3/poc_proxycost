import type { CountryCode, CourierMethod } from './types';

/**
 * F34（通関手数料・業者軸）の宅配便側実装。
 *
 * 出典: `master/customs.json#clearance`（48行）と、それを取得した3本の監査ノート
 * （`docs/audit/f34-dhl-seven-countries-2026-09-12.md` / `f34-fedex-seven-countries-2026-09-12.md` /
 * `f34-ups-ecms-seven-countries-2026-09-12.md`）。ここは**そのデータをそのまま TypeScript に
 * 転記しただけ**で、新しい一次情報を取っていない——数字が変わったら master を見て転記し直すこと。
 *
 * ## tier の決め方
 * `master` の `tier: A_confirmed` → `'fixed'`、`tier: B_inferred` → `'estimate'`。
 * `C_unknown`／`schema_gap`／`counted_absence` は行の値そのものを持たない。
 * `COURIER_CLEARANCE` にキー自体を置かないことで表す。**このキー無しは2種類の
 * 別の意味を持つ**——呼び出し側（`compare.ts`）は `COURIER_CLEARANCE_UNKNOWN` を
 * 見て区別する:
 *   - `COURIER_CLEARANCE_UNKNOWN` にエントリがある（例: GB/DE の FedEx、GB の UPS）
 *     → schema_gap/C_unknown。「額不明」の null 行を出す（費用を消さない、
 *     `docs/PRINCIPLES.md` 原則2）。
 *   - どちらにもエントリが無い（例: DE/FR/AU/CA の ECMS） → counted_absence。
 *     その業者はその国に存在しないので、行そのものを出さない。
 *
 * ## per-parcel / per-shipment
 * 一次資料が明言している行（DE DHL、UPS 5か国、FedEx SG）はそのまま採用する。
 * **一次資料が言っていない行は `per: 'per_parcel'` にする**——箱分割（#85）で
 * 個口が増えたときに過小計上しない側に倒す（タスク指示「prefer the treatment
 * that does not understate」）。DHL の US/GB/FR/AU/CA/SG 行はマスタが
 * "unknown_but_likely_per_shipment"（推論、未確認）と書いているが、未確認である
 * 以上ここでは per_parcel を採る——マスタの推論に反する選択なので明記しておく。
 *
 * ## account holder / non-account holder の2系統がある行
 * DHL の DTX 行は口座の有無で率・最低額が変わる（GB/FR/CA）。**#101 はここを
 * 「率・最低額とも高い方を機械的に採用する」ヘッジで埋めていたが、これは誤りだった
 * ——「どちらが適用されるか分からない」ことへの目くらましであって、答えが分かった
 * 以上そのヘッジ自体が欠陥になる。#102 が DHL 自身のレートガイド（CA版の定義文）
 * から一次資料で決着させた: account holder／non-account holder は **shipper では
 * なく importer（受取人）の DHL 口座の有無**で決まり、DTX は受取人請求の費目
 * なので、代行経由で荷物を受け取る個人利用者には account を持たない
 * **non_account_holder が適用される。** その結論は `master/customs.json` の
 * 該当6行に `variant_applicability.answer` として記録済み（コードの外＝マスタが
 * 持つ事実）。ここではその値をそのまま転記するだけで、「高い方」のような
 * コード側の独自ルールを再導入しない。`master-sync.test.ts` がマスタの
 * `variant_applicability` からこの行を独立に再導出し、一致しなければ落ちる
 * ——`variant_applicability` が無い行があれば、そのテストは「高い方」に
 * フォールバックせず例外を投げる（サイレントな先祖返り防止）。
 * US/AU/SG は両変種の値が同一なのでこの選択自体が効かない。CA は変種の大小関係が
 * GB/FR と逆（non-account の方が高い）ため、「高い方」でも結果的に
 * non_account_holder と一致していた——**偶然の一致**であり、方針としては
 * 誤っていた。以後は明示的に non_account_holder を選んでいるので、この一致は
 * 意図した一致になった（`master-sync.test.ts` に CA 専用の固定テストがある）。
 *
 * ## 税ゼロ時に課すか
 * **7か国×4社のどの一次資料にも明示の免除規定が無い**（3本の監査ノートが共通して
 * 報告）。ここでは「立て替える対象（duty+tax）が0なら、そもそも advance が発生
 * しないので手数料も立たない」と「フラットの最低額は無条件に課される」のどちらが
 * 正しいか判定できないので、**duty+tax が0のときはこの行を `amount: null` にする**
 * ——0円と書けば「調べた上でゼロだった」という嘘になり、最低額を書けば「調べた上で
 * 満額だった」という別の嘘になる。null 行は `total.high` を自動的に開く
 * （`compare.ts` の `totalRange()`）。
 */

export type CourierClearanceCarrier = 'FedEx' | 'UPS' | 'DHL' | 'ECMS';

/** `CourierMethod` の便名プレフィクスから業者を引く。データの無い便（Buyee-Air 自社便、
 * SF Express、Surface 系）は `null`——`compare.ts` 側で従来どおりの「未公表」null 行にする。 */
export function courierCarrierOf(method: CourierMethod): CourierClearanceCarrier | null {
  if (method.startsWith('courier-fedex')) return 'FedEx';
  if (method === 'courier-ups') return 'UPS';
  if (method.startsWith('courier-dhl')) return 'DHL';
  if (method.startsWith('courier-ecms')) return 'ECMS';
  return null; // courier-sf-express / courier-buyee-air / courier-surface — master にデータなし
}

type Rule =
  | { kind: 'rate_min'; rate: number; minLocal: number }
  | { kind: 'rate_min_max'; rate: number; minLocal: number; maxLocal: number }
  | {
    kind: 'banded_value_mixed';
    valueLteLocal: number; flatLocal: number;
    aboveRate: number; aboveMinLocal: number;
  };

export interface CourierClearanceRoute {
  tier: 'fixed' | 'estimate';
  currency: string;
  rule: Rule;
  per: 'per_parcel' | 'per_shipment';
  sourceUrl: string;
  /** 画面の note に出す、この行が何の一次資料からどう来たかの短い説明。 */
  basisNote: string;
}

function rateMin(rate: number, minLocal: number): Rule {
  return { kind: 'rate_min', rate, minLocal };
}

const DHL_US_GB_FR_AU_CA_SG_PER = 'per_parcel' as const; // per-shipmentは推論のみ、未確認（上のコメント参照）

const DHL_SOURCES: Record<'US' | 'GB' | 'DE' | 'FR' | 'AU' | 'CA' | 'SG', string> = {
  US: 'https://mydhl.express.dhl/content/dam/downloads/us/en/rate-guide/service_and_rate_guide_us_en_2026.pdf.coredownload.pdf',
  GB: 'https://mydhl.express.dhl/content/dam/downloads/gb/en/rate-guide/service_and_rate_guide_gb_en.pdf.coredownload.pdf',
  DE: 'https://www.dhl.de/dam/jcr:3c343ee4-e952-4310-aa15-dfd1c99aa7e9/dhl-express-auftragsbedingungen-gebuehren-zollabfertigung-de-012025.pdf',
  FR: 'https://mydhl.express.dhl/content/dam/downloads/fr/en/rate-guide/service_and_rate_guide_fr_en_2026.pdf.coredownload.pdf',
  AU: 'https://mydhl.express.dhl/content/dam/downloads/au/en/rate-guide/service_and_rate_guide_au_en_2026.pdf.coredownload.pdf',
  CA: 'https://mydhl.express.dhl/content/dam/downloads/ca/en/rate-guide/service_and_rate_guide_ca_en_2026.pdf.coredownload.pdf',
  SG: 'https://mydhl.express.dhl/content/dam/downloads/sg/en/rate-guide/service_and_rate_guide_sg_en_2026.pdf.coredownload.pdf',
};

const DHL_BASIS = 'DHL Duty Tax Processing（宛先国・受取人請求）。DHL自身の Rate Guide 2026 から直接'
  + ' フェッチ・逐語確認（docs/audit/f34-dhl-seven-countries-2026-09-12.md）。';

const DHL_VARIANT_BASIS = DHL_BASIS
  + ' 口座有無で率・最低額が分かれる行は non_account_holder（master/customs.json の'
  + ' variant_applicability.answer、#102）を採用——代行経由で荷物を受け取る個人利用者は'
  + ' DHLの法人口座を持たないため。旧#101の「高い方を機械的に採用」は誤りとして撤回した。';

export const COURIER_CLEARANCE: Record<CountryCode, Partial<Record<CourierClearanceCarrier, CourierClearanceRoute>>> = {
  US: {
    FedEx: {
      tier: 'estimate', currency: 'USD', rule: rateMin(0.025, 17.5), per: 'per_parcel',
      sourceUrl: 'https://www.fedex.com/en-us/shipping/rate-changes/additional-shipping-fees.html',
      basisNote: 'FedEx Disbursement Fee。FedEx一次ページはこの環境のWAFに阻まれ本文未読——独立した'
        + '複数の二次情報（ShipScience等）が一致する式（2.5%、最低$17.50、2026-07-20発効）を転記。',
    },
    UPS: {
      tier: 'estimate', currency: 'USD', rule: rateMin(0.025, 17.5), per: 'per_shipment',
      sourceUrl: 'https://www.ups.com/us/en/shipping/international-shipping/import-fees',
      basisNote: 'UPS Disbursement Fee。UPS一次ページ本文は未読（200/503混在・Empty reply）——独立した'
        + '二次情報が一致する式（2.5%、最低$17.50、2026-09-07発効）を転記。',
    },
    DHL: {
      tier: 'fixed', currency: 'USD', rule: rateMin(0.02, 17.5), per: DHL_US_GB_FR_AU_CA_SG_PER,
      sourceUrl: DHL_SOURCES.US, basisNote: DHL_BASIS,
    },
    ECMS: {
      tier: 'fixed', currency: 'USD', rule: rateMin(0.03, 0), per: 'per_parcel',
      sourceUrl: 'https://www.ecmsglobal.com/resources/en-us/ECMS%20Express%20US%20Terms%20%20Conditions%20v1.2.pdf',
      basisNote: 'ECMS duty advance payment fee 3%（ECMS US T&C v1.2、逐語確認）。',
    },
  },
  GB: {
    // FedEx: schema_gap（3段の帯構造で既存rule.typeに収まらない）。キーを持たず、
    // 呼び出し側は COURIER_CLEARANCE_UNKNOWN を見て額不明の行を出す。
    // UPS: C_unknown（一次資料が取得できず、値そのものが無い）。同様にキーを持たない。
    DHL: {
      // #101 は account_holder 側の min(12.0)を使っていた。#102 の一次資料に基づき
      // non_account_holder 側の min(11.0)へ訂正（rateは両変種とも0.025で同一）。
      tier: 'fixed', currency: 'GBP', rule: rateMin(0.025, 11.0), per: DHL_US_GB_FR_AU_CA_SG_PER,
      sourceUrl: DHL_SOURCES.GB, basisNote: DHL_VARIANT_BASIS,
    },
    ECMS: {
      tier: 'fixed', currency: 'GBP', rule: rateMin(0.03, 0), per: 'per_parcel',
      sourceUrl: 'https://www.ecmsglobal.com/resources/en-uk/ECMS%20Express%20UK%20Terms%20Conditions%20v1.34.pdf',
      basisNote: 'ECMS duty advance payment fee 3%（ECMS UK T&C v1.34、US版と同一条文、逐語確認）。',
    },
  },
  DE: {
    // FedEx: schema_gap、DE も rule:null。
    UPS: {
      tier: 'fixed', currency: 'EUR',
      rule: { kind: 'banded_value_mixed', valueLteLocal: 22, flatLocal: 7.2, aboveRate: 0.03, aboveMinLocal: 14.9 },
      per: 'per_shipment',
      sourceUrl: 'https://www.ups.com/assets/resources/webcontent/de_DE/additional-service-charge-de.pdf',
      basisNote: 'UPS Disbursement Fee。申告価格帯で「€22以下=定額€7.20」「€22超=3.00%・最低€14.90'
        + 'のいずれか大きい方」に分岐（UPS自身のPDF、逐語確認）。',
    },
    DHL: {
      tier: 'fixed', currency: 'EUR', rule: rateMin(0.02, 15.0 * 1.19), per: 'per_shipment',
      sourceUrl: DHL_SOURCES.DE,
      basisNote: 'DHL Duty Tax Processing（独称 Kapitalbereitstellungsprovision）。最低額は独語一次資料の'
        + '「€15.00 zzgl. MwSt.」を19%込みで€17.85相当に換算——旧記録の€14.88（二次情報）は使わない'
        + '（#99の訂正）。DEのみ"pro abgefertigter Sendung"と明記されているので per_shipment。',
    },
    // ECMS: counted_absence（法人・T&C自体が確認できない）。キーを置かない＝行を出さない。
  },
  FR: {
    FedEx: {
      tier: 'estimate', currency: 'EUR', rule: rateMin(0.025, 18), per: 'per_parcel',
      sourceUrl: 'https://forum.quechoisir.org/fedex-substitution-frais-de-tva-dedouanement-t294550.html',
      basisNote: 'frais d\'avance / avance de douane。FedEx一次ページはWAFで未読——消費者フォーラム'
        + '投稿（quechoisir.org）が伝える「2.5%・最低€18 TTC」を転記（€15説との食い違いあり、'
        + '監査ノート参照）。',
    },
    UPS: {
      tier: 'fixed', currency: 'EUR',
      rule: { kind: 'banded_value_mixed', valueLteLocal: 22, flatLocal: 8.4, aboveRate: 0.0305, aboveMinLocal: 17.5 },
      per: 'per_shipment',
      sourceUrl: 'https://www.ups.com/assets/resources/webcontent/fr_FR/additional-service-charge-fr.pdf',
      basisNote: 'UPS Disbursement Fee。DEと同型の帯構造（€22以下=定額€8.40、超=3.05%・最低€17.50）'
        + '（UPS自身のPDF、逐語確認）。',
    },
    DHL: {
      // #101 は account_holder 側の rate(0.02)を使っていた。#102 の一次資料に基づき
      // non_account_holder 側の rate(0.018)へ訂正（minは両変種ともnon_account側の16.67と一致）。
      tier: 'fixed', currency: 'EUR', rule: rateMin(0.018, 16.67), per: DHL_US_GB_FR_AU_CA_SG_PER,
      sourceUrl: DHL_SOURCES.FR, basisNote: DHL_VARIANT_BASIS,
    },
    // ECMS: counted_absence。
  },
  AU: {
    FedEx: {
      tier: 'estimate', currency: 'AUD', rule: rateMin(0.029, 24), per: 'per_parcel',
      sourceUrl: 'https://www.fedex.com/en-au/customer-support/faq/duties-taxes-imported-goods/paying-duties-taxes/disbursement-fee-shipping.html',
      basisNote: 'Disbursement Fee/Advancement Fee。FedEx一次ページはWAFで未読——二次情報が一致する'
        + '式（2.9%・最低A$24、2026-07-20発効）を転記。ABF Import Processing Charge（税関自身の'
        + '費目、既存のclearance行）に**上乗せで**発生する別建ての費目。',
    },
    UPS: {
      tier: 'fixed', currency: 'AUD', rule: rateMin(0.036, 23.8), per: 'per_shipment',
      sourceUrl: 'https://www.ups.com/assets/resources/webcontent/en_GB/service_guide_au.pdf',
      basisNote: 'UPS Disbursement Fee（3.6%・最低A$23.80+GST、UPS自身のPDF、逐語確認）。ABF Import'
        + ' Processing Chargeに上乗せで発生する別建ての費目。',
    },
    DHL: {
      tier: 'fixed', currency: 'AUD', rule: rateMin(0.03, 23.0), per: DHL_US_GB_FR_AU_CA_SG_PER,
      sourceUrl: DHL_SOURCES.AU,
      basisNote: `${DHL_BASIS} ABF Import Processing Chargeに上乗せで発生する別建ての費目。`,
    },
    // ECMS: counted_absence。
  },
  CA: {
    FedEx: {
      tier: 'estimate', currency: 'CAD', rule: rateMin(0.031, 12), per: 'per_parcel',
      sourceUrl: 'https://www.fedex.com/en-ca/customer-support/faq/duties-taxes-imported-goods/paying-duties-taxes/disbursement-fee-shipping.html',
      basisNote: 'Disbursement Fee。FedEx一次ページはWAFで未読——二次情報が一致する式（3.10%・'
        + '最低CAD12.00、2026-08-03発効）を転記。',
    },
    UPS: {
      tier: 'fixed', currency: 'CAD', rule: rateMin(0.037, 11.65), per: 'per_shipment',
      sourceUrl: 'https://www.ups.com/assets/resources/webcontent/en_CA/rate_guide_ca.pdf',
      basisNote: 'UPS Disbursement Fee（3.7%・最低はサービス種別で$7.40〜$11.65、UPS自身のPDF、'
        + '逐語確認）。利用者がどのサービス級を使うか分からないので、過小計上しない高い方'
        + '（$11.65、Express系）を採用。',
    },
    DHL: {
      // CA は non_account_holder 側の min(18.0)——#101 の「高い方」ルールでも同じ値に
      // 偶然一致していた（CAだけ変種の大小関係がGB/FRと逆）。値自体は変えていないが、
      // 選択の理由を「高い方」から「non_account_holderが適用される」へ差し替えた。
      tier: 'fixed', currency: 'CAD', rule: rateMin(0.0275, 18.0), per: DHL_US_GB_FR_AU_CA_SG_PER,
      sourceUrl: DHL_SOURCES.CA, basisNote: DHL_VARIANT_BASIS,
    },
    // ECMS: counted_absence。
  },
  SG: {
    FedEx: {
      tier: 'estimate', currency: 'SGD',
      rule: { kind: 'rate_min_max', rate: 0.05, minLocal: 24, maxLocal: 120 }, per: 'per_shipment',
      sourceUrl: 'https://www.fedex.com/en-sg/customer-support/faq/duties-taxes-imported-goods/paying-duties-taxes/disbursement-fee-shipping.html',
      basisNote: 'Disbursement Fee/Advancement Fee。FedEx一次ページはWAFで未読——二次情報が一致する'
        + '式（5%・最低S$24・上限S$120、2026-07-20発効）を転記。per shipmentは旧版PDFの検索結果'
        + '要約による（2026年版での再確認はできていない）。',
    },
    UPS: {
      tier: 'fixed', currency: 'SGD',
      rule: { kind: 'rate_min_max', rate: 0.056, minLocal: 22.5, maxLocal: 100 }, per: 'per_shipment',
      sourceUrl: 'https://www.ups.com/assets/resources/webcontent/en_GB/service_guide_sg_2024.pdf',
      basisNote: 'UPS Disbursement Fee（5.6%・最低S$22.50・上限S$100、UPS自身のPDF、逐語確認）。',
    },
    DHL: {
      tier: 'fixed', currency: 'SGD', rule: rateMin(0.05, 20.0), per: DHL_US_GB_FR_AU_CA_SG_PER,
      sourceUrl: DHL_SOURCES.SG, basisNote: DHL_BASIS,
    },
    ECMS: {
      tier: 'fixed', currency: 'SGD', rule: rateMin(0.03, 0), per: 'per_parcel',
      sourceUrl: 'https://www.ecmsglobal.com/resources/en-sg/ECMS%20Express%20Singapore%20Pte%20Ltd_%20Terms%20and%20Conditions_2023.pdf',
      basisNote: 'ECMS duty advance payment fee 3%（ECMS Singapore T&C 2023、逐語確認）。',
    },
  },
};

// GB は FedEx/UPS 両方とも rule を持たないが「schema_gap」と「一次資料未達（C_unknown）」を
// 区別して note を出したいので、値を持たない行専用のメタ情報をここに置く。
export const COURIER_CLEARANCE_UNKNOWN: Partial<Record<CountryCode, Partial<Record<CourierClearanceCarrier, string>>>> = {
  GB: {
    FedEx: 'FedEx UK の Disbursement Fee は税額の帯で計算式自体が変わる3段構造'
      + '（下限付き率→定額→率のみ）で、既存のclearanceスキーマでは表現できない'
      + '（schema_gap、docs/audit/f34-fedex-seven-countries-2026-09-12.md）。額は出さない。',
    UPS: 'UPS UK の Disbursement Fee は一次資料が取得できていない（#81から継続、'
      + 'assets.ups.comがこの環境からEmpty reply/503）。二次情報（フォーラム）はあるが'
      + 'UPS自身の逐語引用ではないため C_unknown のまま。額は出さない。',
  },
  DE: {
    FedEx: 'FedEx DE の Aufwendungspauschale/Disbursement Fee はGBと同型の3段帯構造'
      + '（schema_gap、docs/audit/f34-fedex-seven-countries-2026-09-12.md）。額は出さない。',
  },
};

/** duty+tax の額（JPY）から、この rule に従う手数料をJPYで返す。 */
export function evalClearanceRuleYen(
  rule: Rule, dutyPlusTaxYen: number, declaredLocal: number, ccyToJpy: number,
): number {
  switch (rule.kind) {
    case 'rate_min':
      return Math.max(rule.minLocal * ccyToJpy, rule.rate * dutyPlusTaxYen);
    case 'rate_min_max': {
      const v = Math.max(rule.minLocal * ccyToJpy, rule.rate * dutyPlusTaxYen);
      return Math.min(v, rule.maxLocal * ccyToJpy);
    }
    case 'banded_value_mixed':
      return declaredLocal <= rule.valueLteLocal
        ? rule.flatLocal * ccyToJpy
        : Math.max(rule.aboveMinLocal * ccyToJpy, rule.aboveRate * dutyPlusTaxYen);
  }
}
