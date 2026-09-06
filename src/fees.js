// 日本の購入代行 3 社の料金モデル。
//
// ここの数字が間違っていたら、このツールの存在価値は無い。
// 一次情報（各社の公式料金ページ）だけを載せ、出典を必ず添える。
// 比較記事など二次情報は採用しない — 実際に 3 項目とも外していた。

export const CHECKED_ON = '2026-09-06';

export const SOURCES = {
  neokyo: { url: 'https://neokyo.com/en/fees', label: 'neokyo.com/en/fees' },
  zenmarket: { url: 'https://zenmarket.jp/ja/fees.aspx', label: 'zenmarket.jp/ja/fees.aspx' },
  buyee: { url: 'https://buyee.jp/helpcenter/guide/fees?lang=en', label: 'buyee.jp/helpcenter/guide/fees' },
};

// 出典が無い唯一の数字。ヤフオクの出品で落札者が送料を負担するとき、
// 実際の額は出品者の設定次第で事前には分からない。ゆうパック・宅急便の
// 実勢から置いた仮定であって、公開料金表の値ではない。
// UI では必ず est. マーカーを付け、利用者が上書きできる。
export const ASSUMED_DOMESTIC_SHIPPING = 800;

export const SERVICES = {
  neokyo: {
    name: 'Neokyo',
    serviceFeePerItem: 350,       // 国内送料・45日保管を含む
    domesticShippingIncluded: true,
    depositFeeRate: 0,
    packing: { baseUpTo2kg: 500, perExtraKg: 150 },
    source: SOURCES.neokyo,
  },
  zenmarket: {
    name: 'ZenMarket',
    // 「商品1点ごとのサービス手数料 300円〜800円」。ヤフオク・メルカリは上限。
    serviceFeePerItem: 800,
    domesticShippingIncluded: false,  // 「場合によってお支払い」
    depositFeeRate: 0.035,            // 送金合計額に対して 3.5%
    packing: null,                    // おまとめ発送は手数料に込み
    source: SOURCES.zenmarket,
  },
  buyee: {
    name: 'Buyee',
    serviceFeePerOrder: 500,          // "Flat rate ¥500 / Per order"
    domesticServiceFeePerOrder: 500,  // 「国内配送サービス料」
    domesticShippingIncluded: false,
    depositFeeRate: 0,
    packing: null,
    // 同一出品者でも注文ごとに個別処理される。点数が増えるほど差が開く最大の要因。
    perOrderDomestic: true,
    source: SOURCES.buyee,
  },
};

// 保証プラン（Buyee のみ・注文ごと）。既定は Lite。
// 最も安い前提で計算しても Buyee が最高額、という事実のほうが強い。
export const BUYEE_PLANS = { lite: 0, inspection: 300, standard: 500, insured: 500 };

// ZenMarket の入金手数料は「実際にチャージする額」ではなく「送金合計額」の 3.5%。
// 手取りで net 円必要なら gross = net / (1 - 0.035) を送金する必要がある。
export function depositSurcharge(net, rate) {
  if (!rate) return 0;
  return net / (1 - rate) - net;
}

// 梱包料：2kg まで定額、超過分は 1kg ごと（切り上げ）
export function packingFee(kg, packing) {
  if (!packing) return 0;
  if (!(kg > 2)) return packing.baseUpTo2kg;
  return packing.baseUpTo2kg + packing.perExtraKg * Math.ceil(kg - 2);
}
