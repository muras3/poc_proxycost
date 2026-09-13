import type { BoxDimensionsCm, CountryCode, CourierMethod, PostalMethod, Tier } from './types';
import type { DimensionLimit, MarkupPostageRate, MeasuredPostageRate } from './services';
import { SERVICES } from './services';
import { EMS_ZONE, EMS_MAX_GRAMS, emsFor } from './ems';

/**
 * **日本郵便の国際配送方式。**EMS だけを価格化していた状態からの拡張。
 *
 * 入れた方式の条件（3つとも満たすものだけ）:
 *   1. 日本郵便が**地帯別の料金表を公表**している
 *   2. 通関経路が**郵便のまま**＝現在の輸入側モデル（郵便の通関手数料）がそのまま使える
 *   3. **実重量課金**＝容積重量の軸（寸法）が要らない。寸法は入力に無い
 *
 * **宅配便（FedEx / DHL / UPS / SF / ECMS）はこの3つとも満たさない**ので入れない。
 * 送料だけ差し替えて通関を郵便のまま置くと、送料は下がり通関は上がるという
 * **向きが逆の2つの誤りが総額に同居する**（`docs/COMPLETENESS.md` §6）。
 *
 * **2026-09-07 訂正。**ここには「料率が非公開だから額が取れない」と書いてあったが、
 * **結論が間違っていた。**公表された料金表が無いのは事実で、それが条件1に当たらない
 * 理由であることも変わらない。だが**額そのものは公開の見積 API で取れる**——
 * ZenMarket の計算機は `POST calc.aspx/Calculate` に
 * `{weight, country, width, height, depth}` を渡すと、便ごとの `Price`（円）と
 * `ShippingLimitsParamA-CInCm`（寸法制限）を JSON で返す（`docs/O2-COURIER-RUN.md`）。
 * **寸法は行き止まりではなく引数だった。**「表が無い」から「価格化できない」を
 * 導いていたのが飛躍で、正しくは**条件3（寸法が入力に無い）が本当の障害**であり、
 * それも箱を仮定すれば解ける性質のもの（梱包後重量を `×1.2+300g` と仮定しているのと
 * 同じ）。**いま入れていない理由は条件2（通関が別モデル）と、寸法の仮定を
 * まだ置いていないこと。**
 *
 * **SAL 便は表があるが入れない。**Buyee の配送方法ページが
 * 「(Japan Post Economy Airmail) * **Currently suspended**」と書いている。
 * 日本郵便の料金表に行が残っていることは、いま引き受けていることを意味しない。
 * （`shipping-methods.ts` の Buyee の行が同じ理由で SAL を外している）
 */
export type { PostalMethod };

export const POSTAGE_SOURCE_URL =
  'https://www.post.japanpost.jp/send/oversea/charge/';
/** 料金表を読んで転記した日。**額と同じ重みで扱う**（DE の €6→€7.50 の教訓）。 */
export const POSTAGE_CHECKED_ON = '2026-09-07';

/**
 * **EMS と他方式で地帯の割り方が違う。**EMS は米国が第4地帯、
 * 通常郵便物・国際小包では**第3地帯**。EMS の地帯表を流用すると
 * **米国の額が全方式で狂う。**
 *
 * 第2地帯 = 中国・韓国・台湾を除くアジア（シンガポール）
 * 第3地帯 = 北米・欧州・オセアニア・中近東（米国・英国・ドイツ・フランス・豪州・カナダ）
 * 出典の地帯一覧: `list-normal/zone{n}-list.html`（2026-09-07 に7カ国すべてを照合）
 */
export const POSTAL_ZONE: Record<CountryCode, number> = {
  SG: 2,
  US: 3, GB: 3, DE: 3, FR: 3, AU: 3, CA: 3,
};

/** `[その重量まで(g), 円]`。**表そのままの段**で持ち、段の間を補間しない。 */
type Step = readonly [grams: number, yen: number];

/** 小形包装物・航空便。上限 2kg。出典 `list-normal/zone{2,3}.html` の「航空便 / 小形包装物」。 */
const SMALL_PACKET_AIR: Record<number, readonly Step[]> = {
  2: [[100, 380], [200, 500], [300, 620], [400, 740], [500, 860], [600, 980],
    [700, 1100], [800, 1220], [900, 1340], [1000, 1460], [1100, 1580], [1200, 1700],
    [1300, 1820], [1400, 1940], [1500, 2060], [1600, 2180], [1700, 2300], [1800, 2420],
    [1900, 2540], [2000, 2660]],
  3: [[100, 510], [200, 690], [300, 870], [400, 1050], [500, 1230], [600, 1410],
    [700, 1590], [800, 1770], [900, 1950], [1000, 2130], [1100, 2310], [1200, 2490],
    [1300, 2670], [1400, 2850], [1500, 3030], [1600, 3210], [1700, 3390], [1800, 3570],
    [1900, 3750], [2000, 3930]],
};

/**
 * 小形包装物・船便。上限 2kg。**第2地帯と第3地帯で額が同じ**——
 * これは転記ミスではなく、原文がそうなっている（両ページとも 480/600/800/1300/2200）。
 */
const SMALL_PACKET_SURFACE: Record<number, readonly Step[]> = {
  2: [[100, 480], [250, 600], [500, 800], [1000, 1300], [2000, 2200]],
  3: [[100, 480], [250, 600], [500, 800], [1000, 1300], [2000, 2200]],
};

/** 国際小包・航空便。上限 30kg。出典 `list-parcel/zone{2,3}.html` の「航空便」。 */
const PARCEL_AIR: Record<number, readonly Step[]> = {
  2: [[1000, 2500], [2000, 3700], [3000, 4900], [4000, 6100], [5000, 7300],
    [6000, 8500], [7000, 9700], [8000, 10900], [9000, 12100], [10000, 13300],
    [11000, 13950], [12000, 14600], [13000, 15250], [14000, 15900], [15000, 16550],
    [16000, 17200], [17000, 17850], [18000, 18500], [19000, 19150], [20000, 19800],
    [21000, 20450], [22000, 21100], [23000, 21750], [24000, 22400], [25000, 23050],
    [26000, 23700], [27000, 24350], [28000, 25000], [29000, 25650], [30000, 26300]],
  3: [[1000, 3850], [2000, 6000], [3000, 8150], [4000, 10300], [5000, 12450],
    [6000, 14600], [7000, 16750], [8000, 18900], [9000, 21050], [10000, 23200],
    [11000, 24800], [12000, 26400], [13000, 28000], [14000, 29600], [15000, 31200],
    [16000, 32800], [17000, 34400], [18000, 36000], [19000, 37600], [20000, 39200],
    [21000, 40800], [22000, 42400], [23000, 44000], [24000, 45600], [25000, 47200],
    [26000, 48800], [27000, 50400], [28000, 52000], [29000, 53600], [30000, 55200]],
};

/** 国際小包・船便。上限 30kg。出典 `list-parcel/zone{2,3}.html` の「船便」。 */
const PARCEL_SURFACE: Record<number, readonly Step[]> = {
  2: [[1000, 2100], [2000, 2600], [3000, 3100], [4000, 3600], [5000, 4100],
    [6000, 4600], [7000, 5100], [8000, 5600], [9000, 6100], [10000, 6600],
    [11000, 7000], [12000, 7400], [13000, 7800], [14000, 8200], [15000, 8600],
    [16000, 9000], [17000, 9400], [18000, 9800], [19000, 10200], [20000, 10600],
    [21000, 11000], [22000, 11400], [23000, 11800], [24000, 12200], [25000, 12600],
    [26000, 13000], [27000, 13400], [28000, 13800], [29000, 14200], [30000, 14600]],
  3: [[1000, 2500], [2000, 3100], [3000, 3700], [4000, 4300], [5000, 4900],
    [6000, 5500], [7000, 6100], [8000, 6700], [9000, 7300], [10000, 7900],
    [11000, 8300], [12000, 8700], [13000, 9100], [14000, 9500], [15000, 9900],
    [16000, 10300], [17000, 10700], [18000, 11100], [19000, 11500], [20000, 11900],
    [21000, 12300], [22000, 12700], [23000, 13100], [24000, 13500], [25000, 13900],
    [26000, 14300], [27000, 14700], [28000, 15100], [29000, 15500], [30000, 15900]],
};

export interface PostalMethodSpec {
  id: PostalMethod;
  /** 画面に出す名前。日本郵便の英語表記に寄せる。 */
  label: string;
  /**
   * 所要日数。**日本郵便は国ごとの検索フォームでしか出しておらず、静的な表が無い。**
   * だから代行各社が公表している方式別の日数を使い、**原文の言い回しを残す**
   * ——EMS の「Less than a week」を「7日以内」と書き換えると、原文が言っていない
   * 精度を主張することになる。社ごとに幅があるときは**遅いほう**を採る。
   */
  days: string;
  daysSourceUrl: string;
  daysTier: Tier;
  /** 追跡の有無。船便の小形包装物だけ追跡が付かない（Buyee 原文「without tracking」）。 */
  tracked: boolean;
}

export const POSTAL_METHODS: readonly PostalMethodSpec[] = [
  {
    id: 'ems', label: 'EMS', days: 'a week or less', tracked: true,
    daysSourceUrl: 'https://neokyo.com/en/shipping', daysTier: 'fixed',
  },
  {
    id: 'small-packet-air', label: 'Small packet (airmail)',
    days: '10 days or less', tracked: false,
    daysSourceUrl: 'https://neokyo.com/en/shipping', daysTier: 'fixed',
  },
  {
    id: 'parcel-air', label: 'International parcel (airmail)',
    days: '12–26 days', tracked: true,
    daysSourceUrl: 'https://buyee.jp/helpcenter/guide/shipping-method?lang=en',
    daysTier: 'fixed',
  },
  {
    id: 'small-packet-surface', label: 'Small packet (surface)',
    days: '1–3 months', tracked: false,
    daysSourceUrl: 'https://buyee.jp/helpcenter/guide/shipping-method?lang=en',
    daysTier: 'fixed',
  },
  {
    id: 'parcel-surface', label: 'International parcel (surface)',
    days: '1–3 months', tracked: true,
    daysSourceUrl: 'https://buyee.jp/helpcenter/guide/shipping-method?lang=en',
    daysTier: 'fixed',
  },
];

const TABLES: Record<Exclude<PostalMethod, 'ems'>, Record<number, readonly Step[]>> = {
  'small-packet-air': SMALL_PACKET_AIR,
  'small-packet-surface': SMALL_PACKET_SURFACE,
  'parcel-air': PARCEL_AIR,
  'parcel-surface': PARCEL_SURFACE,
};

/**
 * その方式でその国が属する地帯。**EMS だけ別の割り方を使う。**
 *
 * 額の計算は最初から `EMS_ZONE` と `POSTAL_ZONE` を使い分けていたが、
 * **画面の注記だけが `POSTAL_ZONE` で書かれていた。**そのため米国の EMS は
 * 第4地帯の額（30kg で ¥75,100。第3地帯なら ¥65,500）を出しながら
 * 注記に「zone 3」と書いていて、**額と根拠が食い違っていた。**
 * 地帯を答える口をここ1つにして、呼ぶ側が選び間違える余地を無くす。
 */
export function zoneFor(method: PostalMethod, cc: CountryCode): number {
  return method === 'ems' ? EMS_ZONE[cc] : POSTAL_ZONE[cc];
}

/** その方式・その地帯で表が持っている最大重量。**表の外は「高い」ではなく「送れない」。** */
export function maxGramsFor(method: PostalMethod, cc: CountryCode): number {
  if (method === 'ems') return EMS_MAX_GRAMS;
  const steps = TABLES[method][POSTAL_ZONE[cc]];
  return steps ? steps[steps.length - 1]![0] : 0;
}

/**
 * その方式でその重量を送れるか。**上限超は null を返す**——
 * 表の最後の段の額を当てると、送れないものに値段を付けることになる。
 */
export function postageFor(method: PostalMethod, cc: CountryCode, grams: number)
: { yen: number; stepGrams: number } | null {
  if (grams <= 0) return null;
  if (method === 'ems') {
    const r = emsFor(grams, EMS_ZONE[cc]);
    // `emsFor` は段を `stepG` で返し、表の外では両方 null にする。
    return r.yen == null || r.stepG == null ? null : { yen: r.yen, stepGrams: r.stepG };
  }
  const steps = TABLES[method][POSTAL_ZONE[cc]];
  if (!steps) return null;
  const hit = steps.find(([g]) => grams <= g);
  return hit ? { yen: hit[1], stepGrams: hit[0] } : null;
}

/**
 * その方式・その国・その重量の上乗せ（円）。**公表額に足す。**
 *
 * 掛け算（率）ではなく足し算にしたのは、実測で形が分かったのが
 * 「1kg 段ごとの定額」だったから。率で持つと重量で外れる
 * ——Jauce の船便は率で見ると 10.0% → 16.1% → 25.5% と動く。
 */
export function markupYen(
  rate: MarkupPostageRate, cc: CountryCode, grams: number,
): number {
  const m = rate.byCountry?.[cc] ?? rate.markup;
  switch (m.kind) {
    case 'none':
      return 0;
    case 'per-kg-step':
      return m.yen * Math.ceil(grams / 1000);
    case 'observed': {
      // **観測点の間は線形、外は端の値を延ばす。**形が分かっていないので、
      // 観測の外へ勝手な曲線を引かない。端の延長は「それ以上は知らない」の意味。
      const pts = [...m.points].sort((a, b) => a[0] - b[0]);
      if (grams <= pts[0]![0]) return pts[0]![1];
      const last = pts[pts.length - 1]!;
      if (grams >= last[0]) return last[1];
      for (let i = 1; i < pts.length; i++) {
        const [g0, y0] = pts[i - 1]!;
        const [g1, y1] = pts[i]!;
        if (grams <= g1) return Math.round(y0 + ((y1 - y0) * (grams - g0)) / (g1 - g0));
      }
      return last[1];
    }
  }
}

// ---------------------------------------------------------------------------
// P2 2a: 寸法の軸。**箱は仮定する。**既に梱包後重量を `round(net×1.2+300)`
// と仮定しているのと同じ性質の仮定（`compare.ts` の `grossG`）。
// ---------------------------------------------------------------------------

/**
 * 既定の個口寸法（cm）。**20×15×10。**
 *
 * 根拠: `docs/audit/o2-courier-2026-09-08.md` の `compact` がこの値で、実測の
 * 基準になっている（§2〜§4 の比較はすべて `blank` / `compact` / `bulky` の
 * 3水準で行われ、`compact` = 20×15×10 が「送れる側」の基準として使われている）。
 * さらにコーディネーターが2026-09-11 に集めた外部実測（GPT 引き継ぎ文書）で、
 * Jauce の実測条件も 600g・**30×20×10** と、この既定に近い箱を使っている——
 * 桁違いの箱ではないことの追加の裏付けになる。
 *
 * **これは確定値ではなく仮定である。**利用者に見せるときは必ずその旨を書く
 * （tier `estimate`。`DEFAULT_PARCEL_DIMENSIONS_NOTE` を使う）。
 * 利用者が寸法を入力できるようにするかどうかは、このPRのスコープ外
 * （`docs/ROADMAP.md` P2、オーナー指示）。
 */
export const DEFAULT_PARCEL_DIMENSIONS_CM: BoxDimensionsCm = {
  lengthCm: 20, widthCm: 15, heightCm: 10,
};
export const DEFAULT_PARCEL_DIMENSIONS_TIER: Tier = 'estimate';
export const DEFAULT_PARCEL_DIMENSIONS_NOTE =
  'we assume a 20×15×10cm box (ZenMarket\'s own "compact" reference size) — you cannot yet enter'
  + ' your own dimensions';

/**
 * **旧・立方体の一辺の上限（2026-09-08実測、廃止）。**
 *
 * 以前はここに `MAX_CUBE_SIDE_CM`（`small-packet-air: 30`, `ems/parcel-air/parcel-surface: 40`）
 * という「日本郵便の方式ごとに1つ、全社共通」の一辺の上限を置いていた。30cm という数字は
 * 偶然ではなく、**小形包装物の公式の制限「3辺の和 ≤90cm」を立方体に当てはめた値**
 * （30×3=90 でちょうど上限）だった。
 *
 * だがこれは2つの点で誤っていた:
 *   1. **制限は方式ごとに違う公式（最大長・長さ+胴回り・3辺の和）で決まっており、
 *      「立方体の一辺」という1個の数字には本来落とせない。**国際小包（航空・船便・SAL）は
 *      「最大長105cm・長さ+胴回り200cm」、EMS は「最大長150cm・長さ+胴回り300cm」と、
 *      公式そのものが違う。
 *   2. **全社共通ではなく、社ごとに違う。**2026-09-12 の実測（ドイツ・600g、立方体を
 *      20→50cmで走査）で、同じ「日本郵便の小形包装物」でも Buyee は35cmで消え、
 *      Neokyo/ZenMarket(ECMS)は45cmで消え、FROM JAPANは40cm以上でも生存し50cmで
 *      初めて消えるという、社ごとに違う挙動が確認された
 *      （`master/courier-rates.json` の `conclusions.max_cube_side_cm_cross_check`）。
 *      **一律の上限では、この社ごとの差を表せない。**
 *
 * 置き換えた先は `services.ts` の `DimensionLimit`（`PostageRateCommon.dimensionLimit`）
 * ——社・方式ごとに、画面に表示された公式の制限値（`maxLengthCm` /
 * `maxLengthPlusGirthCm` / `maxSumCm` など）をそのまま持つ。判定は
 * `dimensionsExceedLimit` が行う。
 */

/**
 * この寸法の個口が、その社・その方式の寸法上限を（額ではなく可否として）超えるか。
 *
 * `limit` が無ければ（その社・方式で寸法上限を確認していなければ）常に false——
 * **「分からない」を「送れない」に倒さない**、既存の開示原則と同じ向き。
 *
 * 3つの数字を独立に判定する（指定された項目だけ）:
 *   - `maxLengthCm`: 3辺のうち最長の辺
 *   - `maxLengthPlusGirthCm`: 最長辺 + 胴回り（胴回り = 2×(2番目に長い辺 + 最短辺)）
 *   - `maxSumCm`: 3辺の和
 *   - `maxSecondLongestCm` / `maxShortestCm`: 2番目に長い辺・最も短い辺の個別上限
 *     （ZenMarket の ECMS EXPRESS のような「最大長／2番目／3番目」表示専用）
 * 1つでも超えたら送れない。
 *
 * `DEFAULT_PARCEL_DIMENSIONS_CM`（20×15×10cm）は、3辺の和45cm・
 * 最長辺+胴回り 20+2×(15+10)=70cm で、ここに入れたどの社・方式の上限
 * （最も厳しい Buyee の小形包装物でも 60cm・90cm）も下回るので、**この既定の箱を
 * 使っているかぎりこの関数は常に false を返す**——寸法の軸を方式ごとの公式に
 * 置き換えたことが、今日の挙動を1円も変えない理由の一つ。
 */
export function dimensionsExceedLimit(
  dims: BoxDimensionsCm, limit: DimensionLimit | undefined,
): boolean {
  if (!limit) return false;
  const [longest, second, shortest] =
    [dims.lengthCm, dims.widthCm, dims.heightCm].sort((a, b) => b - a);
  if (limit.maxLengthCm != null && longest! > limit.maxLengthCm) return true;
  if (limit.maxSumCm != null && longest! + second! + shortest! > limit.maxSumCm) return true;
  if (limit.maxLengthPlusGirthCm != null
    && longest! + 2 * (second! + shortest!) > limit.maxLengthPlusGirthCm) return true;
  if (limit.maxSecondLongestCm != null && second! > limit.maxSecondLongestCm) return true;
  if (limit.maxShortestCm != null && shortest! > limit.maxShortestCm) return true;
  return false;
}

// ---------------------------------------------------------------------------
// P2: 宅配便（`MeasuredPostageRate`）。**最終価格を正とする。分解しない。**
// このコメントを書いた当時（このPR時点）はどの社にもデータが無く、以下は
// 「器」であって実際に選ばれることは無かった。
// **2026-09-13 時点ではもう違う。** PR #87（コミット `91b9532`）で宅配便の
// 実測料金が7カ国に配線済みで、以下は実際に選ばれる（`compare.ts` の courier
// 選択ロジック参照）。国ごとのカバレッジは一様ではない（例: US はほぼ全ブロック
// で測定済みだが DE・CA は薄い）——正確な内訳は `services.ts` の
// `weightPointsByCountry` を実際に数えて確認すること。
// （このコメントが古いままになっていた原因: データを配線した際にここを
// 直し忘れた。データを足すたびにこの節も見直すこと。）
// ---------------------------------------------------------------------------

/**
 * **便名 → `CourierMethod` ID の対応表。1箇所だけ。**（P2 1、オーナー確定 2026-09-12）
 * `master/courier-rates.json` の `*_us_grid_v2_2026_09_12.observations[].method_name` を
 * `services.ts` に転記するとき、次のデータ取り込みがここと照合できるようにする。
 *
 * **未解決の組**（同じ便かもしれないが確定できないので ID を分けたまま）:
 *   - ZenMarket の無印 `FEDEX` ↔ FROM JAPAN の `FedEx - Economy` / `FedEx - Priority`
 *     ── ZenMarket 画面はどちらの速度か明記していない。
 *   - Neokyo の `FedEx International Connect Plus` ↔ 上記のどちらか、または別サービス
 *     ── FedEx のブランド名としては Connect Plus は独自の商品名で、決め打ちしない。
 *
 * **確定して束ねた組**（表記が完全一致）: FROM JAPAN と Buyee の `ECMS` → 同じ
 * `courier-ecms`。ZenMarket の `ECMS EXPRESS` は表記が違うので束ねない。
 */
export const COURIER_METHOD_NAME_MAP: Readonly<Record<string, Readonly<Record<string, CourierMethod>>>> = {
  fromjapan: {
    ECMS: 'courier-ecms',
    UPS: 'courier-ups',
    DHL: 'courier-dhl',
    'FedEx - Economy': 'courier-fedex-economy',
    'FedEx - Priority': 'courier-fedex-priority',
  },
  buyee: {
    'Buyee Air Delivery': 'courier-buyee-air',
    ECMS: 'courier-ecms',
  },
  zenmarket: {
    'DHL (GREEN+)': 'courier-dhl-green-plus',
    'ECMS EXPRESS': 'courier-ecms-express',
    FEDEX: 'courier-fedex',
    'FEDEX LOWCOST': 'courier-fedex-lowcost',
    SURFACE: 'courier-surface',
    UPS: 'courier-ups',
  },
  neokyo: {
    'DHL EXPRESS 12:00 (2-5 days)': 'courier-dhl-express-1200',
    'DHL Express Worldwide (2-6 days)': 'courier-dhl-express-worldwide',
    'FedEx International Connect Plus (3-5 days)': 'courier-fedex-connect-plus',
  },
};

/**
 * 容積重量（g）。`縦×横×高さ[cm] ÷ 除数 × 1000` を切り上げる。
 * 除数は社ごとに違いうる（`MeasuredPostageRate.volumetricDivisorCm3PerKg`。
 * `docs/audit/o2-courier-2026-09-08.md` §5 ── 5000 か 6000 かは未確定）。
 */
export function volumetricWeightG(dims: BoxDimensionsCm, divisorCm3PerKg: number): number {
  const cm3 = dims.lengthCm * dims.widthCm * dims.heightCm;
  return Math.ceil((cm3 / divisorCm3PerKg) * 1000);
}

/** 請求重量（g）。実重量と容積重量の重いほう。**宅配便は容積重量が効く**（同§5）。 */
export function billableWeightG(
  realGrams: number, dims: BoxDimensionsCm, divisorCm3PerKg: number,
): number {
  return Math.max(realGrams, volumetricWeightG(dims, divisorCm3PerKg));
}

/**
 * **区間で返す（P2 1、オーナー確定 2026-09-12）。**測ったのは11個の重量点だけで、
 * 点と点の間の実カートの重量は補間しない・最寄りの点に丸めない——単調性
 * （軽いほうが安いか同額）から言える区間として返す: `low` = 直下の点の価格、
 * `high` = 直上の点の価格。
 *
 * - **測定範囲の外（500g未満・20000g超）は `null`。**外挿しない。
 * - **ちょうど測定点に乗る重量は `low === high`**（幅ゼロ、区間ではなく1点）。
 * - **その社・その国の列に重量で逆行する箇所があれば `high: null`**
 *   （オーナー確定の例外規定）——単調性が崩れている区間だけを「上限不明」に
 *   落とし、崩れていない区間（このPRで取り込んだ4社×USは全便で単調——
 *   `src/lib/pricing/__tests__/courier-monotonicity.test.ts` が検査する）
 *   まで巻き込んで unknown にしない。
 *
 * **容積重量を掛け直さない。**観測値そのものが「その代行にその実重量を入力したら
 * 出た画面の額」——代行が内部でどんな容積重量規則を使っていたかは、その額に
 * 織り込み済みで観測から分離できない（`docs/audit/o2-courier-2026-09-08.md` §5）。
 * ここで改めて `billableWeightG` を通すと、代行の未公表の規則の上に
 * こちらの未確定の規則（除数 5000 か 6000 か）を重ねて二重に補正することになる。
 * `dims` は**既定の箱（20×15×10cm）と一致するときだけ**この列を引ける、という
 * 適用範囲のガードにだけ使う——測ったのがその箱だけだから。
 */
export function courierPriceFor(
  rate: MeasuredPostageRate, cc: CountryCode, realGrams: number, dims: BoxDimensionsCm,
): { low: number; high: number | null } | null {
  if (dims.lengthCm !== DEFAULT_PARCEL_DIMENSIONS_CM.lengthCm
    || dims.widthCm !== DEFAULT_PARCEL_DIMENSIONS_CM.widthCm
    || dims.heightCm !== DEFAULT_PARCEL_DIMENSIONS_CM.heightCm) {
    return null; // 測ったのは既定の箱だけ
  }
  const points = rate.weightPointsByCountry[cc];
  if (!points || points.length === 0) return null; // まだ価格化されていない国
  if (realGrams < points[0]!.g || realGrams > points[points.length - 1]!.g) {
    return null; // 測定範囲の外。外挿しない。
  }
  const exact = points.find((p) => p.g === realGrams);
  if (exact) return { low: exact.yen, high: exact.yen };
  let lower = points[0]!;
  let upper = points[points.length - 1]!;
  for (const p of points) {
    if (p.g < realGrams && p.g > lower.g) lower = p;
    if (p.g > realGrams && p.g < upper.g) upper = p;
  }
  if (upper.yen < lower.yen) return { low: lower.yen, high: null }; // この区間だけ単調性が崩れている
  return { low: lower.yen, high: upper.yen };
}

/**
 * `compare.ts` の `cheapest` 解決が候補にする宅配便 ID の一覧。**1箇所だけ持つ**
 * ——ここと `MethodPicker` が別々に一覧を持つと、片方に足し忘れた便が出る。
 * `courier-surface` はここに入れない（`Row.surface` 専用、`compare.ts` 参照）。
 */
export const RANKED_COURIER_METHOD_IDS: readonly CourierMethod[] = [
  'courier-fedex', 'courier-fedex-economy', 'courier-fedex-priority', 'courier-fedex-lowcost',
  'courier-fedex-connect-plus', 'courier-ups', 'courier-dhl', 'courier-dhl-green-plus',
  'courier-dhl-express-1200', 'courier-dhl-express-worldwide', 'courier-sf-express',
  'courier-ecms', 'courier-ecms-express', 'courier-buyee-air',
];

/** 画面向けの宅配便1件分。`PostalMethodSpec` と同じ形に合わせて `MethodPicker` から使う。 */
export interface CourierMethodSpec {
  id: CourierMethod;
  /** 原文の便名（`labelRaw`）。訳さない。 */
  label: string;
  /** 便名の原文に日数が書いてあれば抜き出す。無ければ「未公表」と正直に言う。 */
  days: string;
  tracked: boolean;
}

/** `labelRaw` の括弧内に日数があれば抜き出す（例: 'DHL EXPRESS 12:00 (2-5 days)' → '2-5 days'）。 */
function daysFromLabelRaw(labelRaw: string): string | null {
  const m = labelRaw.match(/\(([^)]*\d[^)]*(?:day|month)s?[^)]*)\)/i);
  return m ? m[1]!.trim() : null;
}

/**
 * **ランキング候補の宅配便すべてを画面向けの形にする。**便名・日数は各社の
 * `Service.courier[id].labelRaw` から取る——`RANKED_COURIER_METHOD_IDS` の順で、
 * 同じ ID を最初に持つ社の表記を代表にする（`COURIER_METHOD_NAME_MAP` が
 * 束ねた組は表記が一致しているので、どの社を代表にしても同じ文字列になる）。
 */
export const COURIER_METHODS: readonly CourierMethodSpec[] = RANKED_COURIER_METHOD_IDS.map((id) => {
  for (const svc of SERVICES) {
    const rate = svc.courier?.[id];
    if (rate) {
      return {
        id, label: rate.labelRaw,
        days: daysFromLabelRaw(rate.labelRaw) ?? 'transit time not published',
        tracked: true,
      };
    }
  }
  // 到達しないはず（ID は必ずどこかの社の courier に定義がある）だが、型のために置く。
  return { id, label: id, days: 'transit time not published', tracked: true };
});

/**
 * **この宅配便が、この国のどこかの社で価格化されているか。**`MethodPicker` が
 * 「選べるのに未測定」を作らないために使う——未測定の国では選択肢から外すか、
 * 選べても理由を添えて無効化する。
 */
export function courierMethodAvailable(id: CourierMethod, cc: CountryCode): boolean {
  return SERVICES.some((svc) => (svc.courier?.[id]?.weightPointsByCountry[cc]?.length ?? 0) > 0);
}
