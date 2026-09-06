// 数字の出どころと確度。ここが崩れたらこのツールの価値は無い。
//   fixed      … 各社の公開料金表・日本郵便の公表料金（一次情報）
//   unverified … 二次情報。原典に当たれていない
//   estimate   … 我々の仮定、または利用者が触った値
// 「未取得」は 0 ではなく null。画面では「—」と出し、0 と書かない。

export const CHECKED_ON = '2026-09-06';

// ── EMS 日本発（日本郵便 公表料金、全段）
// https://www.post.japanpost.jp/send/oversea/charge/list-ems/all.html
// 列 = 第1〜第5地帯。第4=米国、第3=ヨーロッパ・オセアニア・カナダ、第2=アジア。
export const EMS_ZONE = { US: 4, GB: 3, DE: 3, FR: 3, AU: 3, CA: 3, SG: 2 };
export const EMS_TABLE = [
  [500, 1450, 1900, 3150, 3900, 3600],    [600, 1600, 2150, 3400, 4180, 3900],
  [700, 1750, 2400, 3650, 4460, 4200],    [800, 1900, 2650, 3900, 4740, 4500],
  [900, 2050, 2900, 4150, 5020, 4800],    [1000, 2200, 3150, 4400, 5300, 5100],
  [1250, 2500, 3500, 5000, 5990, 5850],   [1500, 2800, 3850, 5550, 6600, 6600],
  [1750, 3100, 4200, 6150, 7290, 7350],   [2000, 3400, 4550, 6700, 7900, 8100],
  [2500, 3900, 5150, 7750, 9100, 9600],   [3000, 4400, 5750, 8800, 10300, 11100],
  [3500, 4900, 6350, 9850, 11500, 12600], [4000, 5400, 6950, 10900, 12700, 14100],
  [4500, 5900, 7550, 11950, 13900, 15600],[5000, 6400, 8150, 13000, 15100, 17100],
  [5500, 6900, 8750, 14050, 16300, 18600],[6000, 7400, 9350, 15100, 17500, 20100],
  [7000, 8200, 10350, 17200, 19900, 22500],[8000, 9000, 11350, 19300, 22300, 24900],
  [9000, 9800, 12350, 21400, 24700, 27300],[10000, 10600, 13350, 23500, 27100, 29700],
  [11000, 11400, 14350, 25600, 29500, 32100],[12000, 12200, 15350, 27700, 31900, 34500],
  [13000, 13000, 16350, 29800, 34300, 36900],[14000, 13800, 17350, 31900, 36700, 39300],
  [15000, 14600, 18350, 34000, 39100, 41700],
];
export function emsStepIndex(grams) {
  const i = EMS_TABLE.findIndex((r) => grams <= r[0]);
  return i === -1 ? EMS_TABLE.length - 1 : i;
}
export const emsAt = (idx, zone) => EMS_TABLE[idx][zone];

// ── 代行4社
export const SERVICES = [
  { id: 'neokyo', name: 'Neokyo', perItem: 350, domesticIncluded: true, depositRate: 0,
    packing: { base: 500, perExtraKg: 150 }, referral: null,
    url: 'https://neokyo.com/', source: 'neokyo.com/en/fees',
    sourceUrl: 'https://neokyo.com/en/fees', parcelDefault: 'one', parcelVerified: true },
  { id: 'zenmarket', name: 'ZenMarket', perItem: 800, domesticIncluded: false, depositRate: 0.035,
    packing: null, referral: 'ZenMarket pays us ¥100 if you sign up',
    url: 'https://zenmarket.jp/', source: 'zenmarket.jp/ja/fees.aspx',
    sourceUrl: 'https://zenmarket.jp/ja/fees.aspx', parcelDefault: 'one', parcelVerified: false },
  { id: 'fromjapan', name: 'FROM JAPAN', perItem: 500, perItemVerified: false,
    domesticIncluded: false, depositRate: 0, packing: null,
    referral: 'FROM JAPAN pays us a % of your purchase',
    url: 'https://www.fromjapan.co.jp/', source: 'second-hand', sourceUrl: null,
    parcelDefault: 'one', parcelVerified: false },
  { id: 'buyee', name: 'Buyee', perOrder: 500, domesticServicePerOrder: 500,
    domesticIncluded: false, depositRate: 0, packing: null,
    referral: 'Buyee pays us a % of your purchase',
    url: 'https://buyee.jp/', source: 'buyee.jp/helpcenter/guide/fees',
    sourceUrl: 'https://buyee.jp/helpcenter/guide/fees?lang=en',
    parcelDefault: 'per-order', parcelVerified: true },
];

// 出品ページに重量は書いていない。カテゴリからの推定であって実測ではない。
// 国際送料は総額の最大項目なので、一番大きい数字が一番弱い根拠に乗る。
export const WEIGHT_BY_CATEGORY = [
  [/トレーディングカード|カード/, 50], [/万年筆|ボールペン/, 60], [/CD/, 150],
  [/ゲームソフト/, 150], [/Blu-?ray|DVD/i, 200], [/Tシャツ|カットソー/, 250],
  [/ぬいぐるみ/, 300], [/腕時計/, 300], [/コミック|文庫|書籍|^本$/, 400],
  [/コントローラー|周辺機器/, 400], [/フィギュア|プラモデル/, 600],
  [/パーカー|スウェット/, 600], [/レンズ/, 600], [/雑誌|画集|設定資料集/, 900],
  [/ジャケット|コート/, 1000], [/カメラ/, 900], [/スニーカー|靴/, 1200],
  [/Switch|携帯ゲーム機/i, 1500], [/PlayStation|Xbox|据置/i, 3000],
];
export const WEIGHT_FALLBACK = 1000;
export const ASSUMED_DOMESTIC_SHIPPING = 800;   // 実勢 ¥150〜1,500 の中の仮定
export const PACKING_MULTIPLIER = 1.2;          // 仮定
export const PACKING_ADD_G = 300;               // 仮定

// ── 為替（固定。ライブ取得は外部依存＝障害点なので使わない）
// 実装日に公表仲値から転記し asOf を更新すること。利用者は画面で変更できる。
export const RATES = { asOf: '2026-09-06', USD: 150, GBP: 190, EUR: 163, AUD: 99, CAD: 110, SGD: 116 };

// ── 各国の税。null = 未取得（画面では「—」。0 とは書かない）
export const COUNTRIES = {
  US: { name: 'United States', ccy: 'USD', base: 'FOB',
        dutyFreeLimit: 0, dutyRate: 0.125, dutyVerified: false,
        vatRate: null, vatFreeLimit: null,
        clearanceFeePerParcel: 9.35, clearanceCcy: 'USD', clearanceVerified: false,
        notes: ['de_minimis_suspended'] },
  GB: { name: 'United Kingdom', ccy: 'GBP', base: 'CIF',
        dutyFreeLimit: 135, dutyRate: null, dutyVerified: false,
        vatRate: 0.20, vatFreeLimit: 0,
        clearanceFeePerParcel: 8, clearanceCcy: 'GBP', clearanceVerified: false, notes: [] },
  DE: { name: 'Germany', ccy: 'EUR', base: 'CIF',
        dutyFreeLimit: 150, flatDutyPerItem: 3, dutyRate: null, dutyVerified: true,
        vatRate: 0.19, vatFreeLimit: 0,
        clearanceFeePerParcel: null, clearanceCcy: 'EUR', clearanceVerified: false, notes: [] },
  FR: { name: 'France', ccy: 'EUR', base: 'CIF',
        dutyFreeLimit: 150, flatDutyPerItem: 3, dutyRate: null, dutyVerified: true,
        vatRate: 0.20, vatFreeLimit: 0,
        clearanceFeePerParcel: null, clearanceCcy: 'EUR', clearanceVerified: false, notes: [] },
  AU: { name: 'Australia', ccy: 'AUD', base: 'FOB',
        dutyFreeLimit: 1000, dutyRate: null, dutyVerified: false,
        vatRate: 0.10, vatFreeLimit: 0,
        clearanceFeePerParcel: null, clearanceCcy: 'AUD', clearanceVerified: false, notes: [] },
  CA: { name: 'Canada', ccy: 'CAD', base: 'FOB',
        dutyFreeLimit: 20, dutyRate: null, dutyVerified: false,
        vatRate: 0.05, vatFreeLimit: 20,
        clearanceFeePerParcel: null, clearanceCcy: 'CAD', clearanceVerified: false,
        notes: ['province_tax_not_included'] },
  SG: { name: 'Singapore', ccy: 'SGD', base: 'CIF',
        dutyFreeLimit: Infinity, dutyRate: 0, dutyVerified: true,
        vatRate: 0.09, vatFreeLimit: 400,
        clearanceFeePerParcel: null, clearanceCcy: 'SGD', clearanceVerified: false, notes: [] },
};
