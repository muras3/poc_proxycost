import type { CountryCode, ProvinceCode, Tier } from './types';

export interface Country {
  name: string;
  ccy: string;
  /** 課税ベース。CIF = 商品+送料、FOB = 商品のみ。 */
  base: 'CIF' | 'FOB';
  /** 免税限度（現地通貨）。 */
  dutyFreeLimit: number;
  /** 限度以下で1点あたり定額の関税がかかる国（DE / FR の少額課税）。 */
  flatDutyPerItem?: number;
  /** null = 税率を取得できていない。0 と書くな。 */
  dutyRate: number | null;
  dutyTier: Tier;
  vatRate: number | null;
  vatFreeLimit: number | null;
  /**
   * 小包ごとの通関手数料（現地通貨）を、内容品価格の帯ごとに持つ。
   *
   * **定額1つでは足りない国がある。**オーストラリアの Import Processing Charge は
   * A$1,000 以下で **A$0.00**（原文の表がその行を持っている＝取得できた 0）、
   * それを超えると A$50、A$10,000 以上で A$152 と、帯で変わる。
   * カナダのように「一定額以下は課税自体が無いので手数料も無い」国も同じ形で書ける。
   *
   * 帯は `upTo` の**昇順**、最後は `Number.POSITIVE_INFINITY`。判定は内容品価格を
   * 郵便物1個ぶんに割った額で行う（手数料は郵便物ごとに課されるので）。
   * `amount: 0` は**取得できた 0**（原文がその帯で 0 と書いている）であって、
   * 未取得ではない。未取得は `clearanceBands` を置かないことで表す。
   */
  clearanceBands?: { upTo: number; amount: number; note: string }[];
  clearanceCcy: string;
  clearanceTier: Tier;
  clearanceSourceUrl?: string;
  /** `clearanceBands` を読んだ日。**帯ごとの額は他の数字と同じで、日付が無ければ
   *  いつの値か言えない。**画面に「read <日付>」として出す。 */
  clearanceCheckedOn?: string;
  /** 額が複数の出典に分かれるとき、`clearanceSourceUrl` 以外の出典。
   *  AU の生物検疫費用は DAFF の額で、ABF が代わりに徴収しているだけ。
   *  徴収者のページだけを出典に立てると、額の出どころを取り違える。 */
  clearanceSourceUrl2?: string;
  notes: string[];
  sourceUrl: string | null;
  /**
   * 内容品価格がこの額（現地通貨）以下のとき、**輸入税を国境ではなく販売事業者
   * （＝代行）が販売時点で徴収する**制度がある国。null = そういう制度が無い／未取得。
   * この帯では国境で二重に取られないので、税関側の行は 0 になる。
   * 実際にいくら取られるかは社ごとに違うので `services.ts` の prepaidImportTax を見る。
   */
  sellerCollectsBelow: number | null;
  /**
   * 関税の事前納付が要る国と帯。**利用料は発生するが額が公表されていない。**
   * 額を持っていないので、この費目は必ず tier none（null）で出す。0 とは書かない。
   */
  dutyPrepayment?: {
    /** 内容品価格（現地通貨）がこの額以下の郵便物で事前納付が必要。超えると不要。 */
    upTo: number;
    /** 画面のラベル。**excluded にそのまま並ぶので、これ自体が開示文になる。** */
    label: string;
    note: string;
    sourceUrl: string;
    checkedOn: string;
  };
}

// 各国の税。null = 未取得（画面では「—」。0 とは書かない）。
// dutyTier / clearanceTier が 'unverified' の値は二次情報で、原典に当たれていない。
export const COUNTRIES: Record<CountryCode, Country> = {
  US: {
    name: 'United States', ccy: 'USD', base: 'FOB',
    dutyFreeLimit: 0, dutyRate: 0.125, dutyTier: 'unverified',
    vatRate: null, vatFreeLimit: null,
    // USPS Notice 123 の「Customs Clearance and Delivery ... Per dutiable item
    // All other qualifying classes of inbound mail $9.35」。**原典で確認済み。**
    //
    // **この手数料は無条件ではない。**IMM 712.11 原文:「Post Office facilities must
    // collect a Postal Service fee from the addressee for each item on which customs
    // duty or Internal Revenue tax **is collected**」。712.2 は「mail items examined
    // and passed free of duty」を明示的に除外する。**配達時に徴収するものが無ければ
    // 手数料も無い**——GB/DE/FR/SG と同じ構造（`docs/MASTER.md` の共通構造）。
    //
    // 日本郵便は米国宛を「差出人が Zonos で関税を事前納付すること」を条件に引き受ける
    // （下の `dutyPrepayment`、$2,500 まで）。事前納付されていれば配達時の徴収は無く、
    // 712.11 の条件が立たない。Notice 123 自身も「USPS Delivered Duty Paid (DDP) ...
    // Per piece $0.00」と別立てしている。**よって $2,500 以下は 0**（取得できた 0）。
    clearanceBands: [
      {
        upTo: 2500, amount: 0,
        note: 'duty is prepaid by the sender through Zonos, so the Postal Service has'
          + ' nothing to collect at delivery — IMM 712.11 charges the fee only on items'
          + ' on which duty is collected, and Notice 123 lists DDP at $0.00',
      },
      {
        upTo: Number.POSITIVE_INFINITY, amount: 9.35,
        note: 'USPS customs clearance and delivery fee, per dutiable item — above the'
          + ' $2,500 prepayment band, duty is collected at delivery instead',
      },
    ],
    clearanceCcy: 'USD', clearanceTier: 'fixed',
    // 原典 = USPS Notice 123（Price List）。IMM 712 は徴収条件、Notice 123 は額。
    clearanceSourceUrl: 'https://pe.usps.com/text/dmm300/Notice123.htm',
    clearanceSourceUrl2: 'https://pe.usps.com/text/imm/immc7_002.htm',
    clearanceCheckedOn: '2026-09-07',
    // **CBP 側の手数料は、この計算機の帯では買い手に課されない。**原文で確認した:
    // - 19 CFR 24.22(f)(2)「The fee specified in paragraph (f)(1) of this section
    //   does not apply to dutiable Inbound EMS items」→ 名宛人課金の Dutiable Mail
    //   Fee $7.39 は **EMS に適用されない**
    // - 19 CFR 24.22(l)(2) の EMS 手数料 $1.00 は USPS が外国郵便事業者との
    //   settlement で受け取り四半期ごとに CBP へ送金するもの。**名宛人には課されない**
    // - 19 CFR 24.23(c)(v)「merchandise imported by mail, other than Inbound EMS items
    //   that are **formally entered**」→ MPF は郵便免除。EMS が正式輸入申告される
    //   （＝$2,500 超）ときだけ 24.23(b)(1) の formal MPF（0.3464%・最低 $33.58）。
    //   **$2,500 超の帯に未実装**（`docs/TODO-NEXT.md`）。
    notes: ['de_minimis_suspended'],
    sourceUrl: 'https://hts.usitc.gov/',
    sellerCollectsBelow: null,
    // 日本郵便は 2026-04-14 から米国宛の引受を再開したが、条件として
    // 「差出人自身が CBP 認証事業者のアプリで関税を事前納付すること」を課している。
    // 内容品価格の帯は 2026-07-24 に 800 → 2,500 USD へ引き上げられた。
    // 販売品（この計算機が扱うもの）は 100 USD 以下でも事前納付が要る
    // （100 USD 以下で不要なのは書類と個人間の贈答品だけ）。
    // 原文（英語版）:「Zonos is currently the only certified company we recommend.
    // You will be charged a fee as designated by Zonos when you pay duties using its app.」
    // — **利用料が発生するとだけ書いてあり、額はどこにも無い。**
    // 各社（代行）も、この利用料をいくら転嫁するか公表していない。だから null で出す。
    dutyPrepayment: {
      upTo: 2500,
      label: 'US import prepayment (Zonos) fee — not published',
      note: 'Japan Post accepts US-bound mail only if the sender prepays duty through'
        + ' Zonos, and says Zonos charges a fee for it. Nobody publishes the amount.',
      sourceUrl: 'https://www.post.japanpost.jp/service/send/oversea/information/2026/0413_01_en.html',
      checkedOn: '2026-09-06',
    },
  },
  GB: {
    name: 'United Kingdom', ccy: 'GBP', base: 'CIF',
    dutyFreeLimit: 135, dutyRate: null, dutyTier: 'none',
    vatRate: 0.20, vatFreeLimit: 0,
    clearanceBands: [{
      upTo: Number.POSITIVE_INFINITY, amount: 8,
      note: 'Royal Mail handling fee — we have not read the original',
    }],
    clearanceCcy: 'GBP', clearanceTier: 'unverified',
    // **原典に当たれていない。**note にもそう書いてある。二次情報として出す。
    clearanceSourceUrl: 'https://personal.help.royalmail.com/app/answers/detail/a_id/106',
    clearanceCheckedOn: '2026-09-06',
    notes: [],
    sourceUrl: 'https://www.gov.uk/goods-sent-from-abroad',
    sellerCollectsBelow: null,
  },
  DE: {
    name: 'Germany', ccy: 'EUR', base: 'CIF',
    // €3 の定額関税そのものは EU の一次情報で確定している（2026-07-01〜2028-06-30、
    // 1点あたり €3）。**確定していないのは「代行経由の購入がその対象か」。**
    // 制度は distance sale of imported goods (DSIG) に限り、申告者は売り手または
    // 輸入者（IOSS 保有者・special arrangements 利用者・間接代理人）と書かれている。
    // 代行が挟まる取引がここに当たるかは規則本文からは断定できない
    // （docs/audit/taxes.md §「€3 の適用対象」）。当たらなければこの ¥489/点 は
    // 総額から丸ごと消える。だから確定として描かない。
    dutyFreeLimit: 150, flatDutyPerItem: 3, dutyRate: null, dutyTier: 'unverified',
    vatRate: 0.19, vatFreeLimit: 0,
    // Deutsche Post / DHL の Auslagepauschale。**2026-03-10 に €6 → €7.50 へ上がった**
    // （公式「Leistungen und Preise」2026-07-01 版で €7.50／通、消費税込み）。
    // 額は総額によらず一律。**輸入税が実際に発生する通にだけ課される**
    // ——ドイツは免税枠が無い（`vatFreeLimit: 0`）ので、この計算機が扱う帯では常に発生する。
    // 独自通関（Selbstverzollung）を選べば回避できるが、それは利用者の操作であって
    // 料金表ではない（`docs/MASTER.md` の D_unpredictable と同じ扱い）。
    clearanceBands: [{
      upTo: Number.POSITIVE_INFINITY, amount: 7.5,
      note: 'Deutsche Post / DHL Auslagepauschale, per consignment, incl. VAT',
    }],
    clearanceCcy: 'EUR', clearanceTier: 'unverified',
    // **原典（Deutsche Post「Leistungen und Preise」）に当たれていない。**
    // 額と改定日は業界紙と paketda.de（複数が €7.50 で一致）から。tier はそのため unverified。
    // 以前この国は帯そのものを持たず「—」を出していたが、それは
    // 「手数料が無い」ではなく「我々が調べていない」であり、DE だけ安く見えていた。
    clearanceSourceUrl: 'https://www.paketda.de/zoll/auslagepauschale.html',
    clearanceCheckedOn: '2026-09-07',
    notes: [],
    sourceUrl: 'https://www.zoll.de/EN/Private-individuals/private-individuals_node.html',
    sellerCollectsBelow: null,
  },
  FR: {
    name: 'France', ccy: 'EUR', base: 'CIF',
    // DE と同じ €3。対象（DSIG）に当たるかを断定できないので確定として描かない。
    dutyFreeLimit: 150, flatDutyPerItem: 3, dutyRate: null, dutyTier: 'unverified',
    vatRate: 0.20, vatFreeLimit: 0,
    // La Poste の「frais de gestion」。**額は利用者がいつ払うかで変わる。**
    // 原文:「En payant en ligne, vous bénéficiez de frais de gestion réduits
    // (2 ou 5€ selon le type de colis)」／配達時・窓口は「le tarif plein」で
    // **フランス本土 8€ TTC**（海外県は 7.5€ / 7€ と TVA 率で違う）。
    // **既定は 8€ を出す。**利用者が何もしなければこれになるからで、
    // 事前にオンラインで払えば 2〜5€ に下がるのは**利用者の操作**であって料金表ではない
    // （スペインの Correos も €6 → €1.56 と同じ構造。docs/MASTER.md の D_unpredictable）。
    // 本土の宛先だけを扱うので海外県の帯は入れていない。
    clearanceBands: [{
      upTo: Number.POSITIVE_INFINITY, amount: 8,
      note: 'La Poste frais de gestion, full rate at delivery — 2–5 EUR if paid online in advance',
    }],
    clearanceCcy: 'EUR', clearanceTier: 'fixed',
    clearanceSourceUrl: 'https://www.laposte.fr/conseils-pratiques/comment-payer-frais-de-douane-colis-international',
    clearanceCheckedOn: '2026-09-07',
    notes: [],
    sourceUrl: 'https://www.douane.gouv.fr/',
    sellerCollectsBelow: null,
  },
  AU: {
    name: 'Australia', ccy: 'AUD', base: 'FOB',
    dutyFreeLimit: 1000, dutyRate: null, dutyTier: 'none',
    vatRate: 0.10, vatFreeLimit: 0,
    // ABF の Import Processing Charge の表（原文は Cargo Channel に **Post** を含む）。
    // 電子申告（Electronic）の行を採る——書類申告（Documentary、A$90 / A$192）は例外的で、
    // 郵便の通関で既定になる根拠が無い。**A$1,000 以下の A$0.00 は原文の行そのもの**で、
    // 「調べていない 0」ではない。この帯はちょうど代行が販売時点で GST を取る帯でもある。
    // A$1,000 超には DAFF の生物検疫費用回収（Full Import Declaration charge – air A$48。
    // ABF が DAFF に代わって徴収する）が同じページで併記されているので足す。
    clearanceBands: [
      { upTo: 1000, amount: 0, note: 'no import declaration is required at or below AUD 1,000' },
      {
        upTo: 10000, amount: 50 + 48,
        note: 'AUD 50 import processing charge (electronic) + AUD 48 biosecurity charge (air)',
      },
      {
        upTo: Number.POSITIVE_INFINITY, amount: 152 + 48,
        note: 'AUD 152 import processing charge (electronic) + AUD 48 biosecurity charge (air)',
      },
    ],
    clearanceCcy: 'AUD', clearanceTier: 'fixed',
    clearanceSourceUrl:
      'https://www.abf.gov.au/importing-exporting-and-manufacturing/importing/'
      + 'cost-of-importing-goods/charges/import-processing-charge',
    // A$48 は DAFF（農漁林業省）の費用回収額で、ABF が代わりに徴収している。
    // **徴収者のページだけを出典に立てると、額の出どころを取り違える。**
    clearanceSourceUrl2:
      'https://www.agriculture.gov.au/biosecurity-trade/export/from/charges',
    clearanceCheckedOn: '2026-09-07',
    notes: ['seller_collects_gst'],
    sourceUrl: 'https://www.abf.gov.au/importing-exporting-and-manufacturing/importing/cost-of-importing-goods',
    // A$1,000 以下の輸入は、売り手・プラットフォーム・「redeliverer（転送・代行業者）」が
    // 販売時点で GST を徴収する制度（2018-07-01〜）。国境では課さない。
    // この計算機が比べている5社は全社がこの制度の対象で、全社が自社ページで徴収を明記している。
    sellerCollectsBelow: 1000,
  },
  CA: {
    name: 'Canada', ccy: 'CAD', base: 'FOB',
    dutyFreeLimit: 20, dutyRate: null, dutyTier: 'none',
    vatRate: 0.05, vatFreeLimit: 20,
    // Canada Post 原文:「We apply a handling fee of CAN$9.95 per dutiable or taxable
    // mail item.」——**課税対象の郵便物1個ごと**。C$20 以下は同じページが
    // 「The CBSA doesn't assess duty or tax on mail items valued at CAN$20 or less」と
    // 書いているので、その帯では手数料も発生しない（0。未取得の 0 ではない）。
    clearanceBands: [
      {
        upTo: 20, amount: 0,
        note: 'no duty or tax is assessed at or below CAD 20, so nothing is charged for'
          + ' collecting it',
      },
      {
        upTo: Number.POSITIVE_INFINITY, amount: 9.95,
        note: 'Canada Post handling fee, charged on each dutiable or taxable item',
      },
    ],
    clearanceCcy: 'CAD', clearanceTier: 'fixed',
    clearanceSourceUrl:
      'https://www.canadapost-postescanada.ca/cpc/en/support/articles/customs-requirements/'
      + 'customs-duty-taxes-and-exemptions.page',
    clearanceCheckedOn: '2026-09-07',
    // 州税は `CA_PROVINCES` が持つ。**この行はもう「未取得」ではない。**
    notes: [],
    // 旧 URL（travel-voyage/postal-postale-eng.html）は 2026-09-07 に 404 だった。
    // Canada Post の案内ページが、この計算機が使う値（C$20・C$9.95・州税）を
    // 1枚で書いている唯一の生きたページなのでそちらを指す。
    sourceUrl:
      'https://www.canadapost-postescanada.ca/cpc/en/support/articles/customs-requirements/'
      + 'customs-duty-taxes-and-exemptions.page',
    sellerCollectsBelow: null,
  },
  SG: {
    name: 'Singapore', ccy: 'SGD', base: 'CIF',
    dutyFreeLimit: Number.POSITIVE_INFINITY, dutyRate: 0, dutyTier: 'fixed',
    vatRate: 0.09, vatFreeLimit: 400,
    // SingPost の Handling Fee。**シンガポール税関自身は通関手数料を取らない**
    // （原文「Singapore Customs does not collect any clearance fee ... other than
    // payment of duty or GST」）。取るのは SingPost で、名目は
    // 「税関に代わって GST・関税を徴収する手数料」。
    //
    // **だから帯は S$400 で割れる。**S$400 以下は OVR で決済時に GST が済んでいるので
    // 国境で徴収するものが無く、この手数料も発生しない ——「取得できた 0」。
    // 超えた帯だけ S$10.90／通。
    clearanceBands: [
      { upTo: 400, amount: 0, note: 'GST already collected at checkout under OVR — nothing for SingPost to collect' },
      { upTo: Number.POSITIVE_INFINITY, amount: 10.9, note: 'SingPost handling fee, per consignment' },
    ],
    clearanceCcy: 'SGD', clearanceTier: 'unverified',
    // **S$400 の閾値は公式本文で取れた**（「the postal parcel contains goods of a
    // total CIF value exceeding S$400」）。**額 S$10.90 は取れていない**——
    // 公式ページの該当 FAQ が折り畳みで、本文に当たれたのは検索エンジン経由の描画だけ。
    // だから tier は unverified。文そのものが取れたら fixed に上げる。
    clearanceSourceUrl: 'https://www.singpost.com/support/managing-deliveries/customs-clearance-gst-payments',
    clearanceCheckedOn: '2026-09-07',
    notes: ['seller_collects_gst'],
    sourceUrl: 'https://www.customs.gov.sg/individuals/importing-personal-goods/',
    // S$400 未満の低額品（LVG）は、GST 登録済みの海外事業者・転送業者が
    // 販売時点で GST を徴収する（OVR、2023-01-01〜）。国境の免除が残っているのは
    // **未登録の事業者から買った場合**であって、「S$400 以下なら常に無税」ではない。
    sellerCollectsBelow: 400,
  },
};

export const COUNTRY_CODES = Object.keys(COUNTRIES) as CountryCode[];

/**
 * カナダの州・準州と、**輸入時に CBSA が徴収する州の税**。
 *
 * 率は CBSA の Memorandum D2-3-6 Appendix A（非商業輸入品に対する州税の徴収表）から。
 * ここは「州が住民に課している税率」ではなく「**国境で実際に取られる率**」なので、
 * 州の財務省ではなくこの表を正とする（両者は一致しないことがある。例えば
 * CBSA が徴収協定を持たない州では、州税は国境で取られない）。
 *
 * **`rate` は州の取り分だけ。**連邦の GST 5% は `COUNTRIES.CA.vatRate` が別に出す。
 * D2-3-6 は HST 州を「13% of value for HST」のように**合計**で書いているので、
 * そこから 5% を引いた数字をここに置く。足すと原文の合計に戻る（テストで縛る）。
 *
 * 人口は Statistics Canada の四半期推計（2026-04-01、preliminary）。
 * **州を選ばなかった人に出す代表値の重みにしか使わない。**
 */
export interface Province {
  name: string;
  /** 州の取り分の率。連邦 GST 5% は含まない。0 = 国境で州税を取らない（未取得ではない）。 */
  rate: number;
  /** 画面と note に出す税の呼び名。 */
  taxName: 'HST' | 'PST' | 'QST' | null;
  /** D2-3-6 が書いている合計（GST/HST 込み）。原文との突き合わせ用。 */
  totalWithGst: number;
  /** Statistics Canada 2026-04-01 推計。代表値の重み。 */
  populationOn20260401: number;
}

export const CA_PROVINCE_SOURCE_URL =
  'https://www.cbsa-asfc.gc.ca/publications/dm-md/d2/d2-3-6-eng.html';
export const CA_POPULATION_SOURCE_URL =
  'https://www150.statcan.gc.ca/n1/daily-quotidien/260617/dq260617a-eng.htm';
export const CA_PROVINCE_CHECKED_ON = '2026-09-07';
export const CA_POPULATION_AS_OF = '2026-04-01';

export const CA_PROVINCES: Record<ProvinceCode, Province> = {
  // HST 州。D2-3-6 の合計から連邦 GST 5% を引いた分が州の取り分。
  ON: { name: 'Ontario', rate: 0.08, taxName: 'HST', totalWithGst: 0.13, populationOn20260401: 16103890 },
  NS: { name: 'Nova Scotia', rate: 0.09, taxName: 'HST', totalWithGst: 0.14, populationOn20260401: 1090852 },
  NB: { name: 'New Brunswick', rate: 0.10, taxName: 'HST', totalWithGst: 0.15, populationOn20260401: 866497 },
  NL: { name: 'Newfoundland and Labrador', rate: 0.10, taxName: 'HST', totalWithGst: 0.15, populationOn20260401: 547910 },
  PE: { name: 'Prince Edward Island', rate: 0.10, taxName: 'HST', totalWithGst: 0.15, populationOn20260401: 181715 },
  // PST 州。GST 5% の上に州の売上税が乗る。
  BC: { name: 'British Columbia', rate: 0.07, taxName: 'PST', totalWithGst: 0.12, populationOn20260401: 5646420 },
  MB: { name: 'Manitoba', rate: 0.07, taxName: 'PST', totalWithGst: 0.12, populationOn20260401: 1503865 },
  SK: { name: 'Saskatchewan', rate: 0.06, taxName: 'PST', totalWithGst: 0.11, populationOn20260401: 1266092 },
  // ケベックの QST は原文が「9.975% of value for GST」＝ GST と同じ課税標準に掛ける。
  QC: { name: 'Quebec', rate: 0.09975, taxName: 'QST', totalWithGst: 0.14975, populationOn20260401: 9016222 },
  // 徴収協定が無い州・準州。**0 は「調べていない」ではなく「国境では取られない」。**
  AB: { name: 'Alberta', rate: 0, taxName: null, totalWithGst: 0.05, populationOn20260401: 5057077 },
  YT: { name: 'Yukon', rate: 0, taxName: null, totalWithGst: 0.05, populationOn20260401: 48493 },
  NT: { name: 'Northwest Territories', rate: 0, taxName: null, totalWithGst: 0.05, populationOn20260401: 45808 },
  NU: { name: 'Nunavut', rate: 0, taxName: null, totalWithGst: 0.05, populationOn20260401: 42215 },
};

export const PROVINCE_CODES = Object.keys(CA_PROVINCES) as ProvinceCode[];

/**
 * 州を選ばなかった人に出す代表値。**人口加重の平均**（観測できる基準）。
 *
 * 単純平均にしない: 州の数で割ると、人口 4 万の準州（税率 0）が人口 1,610 万の
 * オンタリオ（8%）と同じ重みになり、実際に払う人の分布から離れる。
 * 「一番人口の多い州の率」にもしない——それは代表値ではなくオンタリオの値である。
 *
 * **これは推定であって誰の請求額でもない。**画面では tier estimate（`~` と琥珀）で出し、
 * note に「州を選ぶと確定する」と書く。`—` にはしない: 州税は確実に発生する費目で、
 * 発生するものを「未取得」として総額から落とすほうが誤りが大きい
 * （docs/DESIGN-NOTES.md §2、docs/TODO-NEXT.md 1.）。
 */
export const CA_PROVINCE_AVERAGE_RATE: number = (() => {
  const rows = Object.values(CA_PROVINCES);
  const pop = rows.reduce((a, p) => a + p.populationOn20260401, 0);
  return rows.reduce((a, p) => a + p.rate * p.populationOn20260401, 0) / pop;
})();
