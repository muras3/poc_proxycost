# 監査：7カ国の税・関税・その他の費用

対象コミット `3aabc20` / ブランチ `claude/automated-income-schemes-uzn8zw-rh3uwh`。
検査対象は `src/lib/pricing/countries.ts` と `src/lib/pricing/compare.ts` の `taxLines()`（45〜97行）。
一次情報の取得はすべて **2026-09-06** に実施。取れなかったものは末尾の §7 に列挙した。

**結論を先に：7カ国のうち「実装が実態どおり」と言えるのは US と SG の一部だけで、
残り5カ国は課税ベース・閾値の測り方・徴収方式のいずれかが実態と違う。**
最大の誤りは金額の欠落（SG の GST、CA の州税と Canada Post 手数料）で、
総額の 8〜13% が抜けている。

---

## 0. 実装が実際に何をしているか（読み取り結果）

`taxLines(cc, {itemsYen, domYen, emsYen, units, parcels})` は次の順で1行ずつ積む。

| 手順 | コード | 内容 |
|---|---|---|
| 課税ベース | 51-53行 | `cif = 商品 + 国内送料 + EMS`。`base==='CIF'` なら cif、`'FOB'` なら**商品のみ** |
| 閾値判定 | 53行 | `declared = baseYen / 為替` を `dutyFreeLimit` と比較。**CIF 国では送料込みの値で閾値を判定している** |
| 関税 | 57-75行 | ①`flatDutyPerItem` があり閾値以下 → 定額 × 点数 ②閾値以下 → ¥0 ③`dutyRate` あり → `baseYen × 率` ④率が null → **null（総額から落ちる）** |
| VAT/GST | 77-83行 | `vatFreeLimit` 以下なら ¥0。そうでなければ CIF国は `cif + 関税`、FOB国は **`商品 + EMS`**（国内送料も手数料も入らない）に率を掛ける |
| 州税 | 84-87行 | CA のみ null 行を出す |
| 通関手数料 | 89-95行 | `clearanceFeePerParcel × 小包数`。**関税・VAT が実際に発生したかを見ずに常に課す** |

国別の定数は `countries.ts` の表のとおり（US: FOB/免税0/12.5%/$9.35、GB: CIF/135/VAT20%/£8、
DE: CIF/150/€3定額/19%、FR: 同/20%、AU: FOB/1000/GST10%、CA: FOB/20/GST5%/州税null、SG: CIF/関税0/GST9%/免税400）。

以下の金額例はすべて、**商品 ¥12,000・実重量 900g（梱包後 1,380g）・1点1小包**、
現行の固定為替（USD150 / GBP190 / EUR163 / AUD99 / CAD110 / SGD116）で
`compare()` を実際に走らせた最安行（Neokyo）の値である。

---

## 1. 米国（US）

| 項目 | 一次情報の値 | 実装の値 | 判定 | 出典 | 確認日 |
|---|---|---|---|---|---|
| 少額免税（de minimis $800） | **無期限停止。** 郵便を含む全モードで停止 | `dutyFreeLimit: 0` | **一致** | [CBP E-Commerce FAQ](https://www.cbp.gov/trade/basic-import-export/e-commerce/faqs) / [EO 14324 継続 (2026-02)](https://www.whitehouse.gov/presidential-actions/2026/02/continuing-the-suspension-of-duty-free-de-minimis-treatment-for-all-countries/) | 2026-09-06 |
| 郵便の課税方式 | 2026-02-24〜07-24 は Section 122 の一律10%。**2026-07-24 に新しい郵便 informal entry へ移行**し、以後は「HTSUS の分類・原産国・課税価格に基づく全ての税・手数料」を課す | 一律 12.5% | **偶然一致（理由が違う）** | [CBP E-Commerce FAQ](https://www.cbp.gov/trade/basic-import-export/e-commerce/faqs) | 2026-09-06 |
| 日本産品の関税率 | **MFN と Section 301 の合計が 12.5% になるよう調整。MFN が 12.5% 以上なら 301 はゼロ**（= 実効 `max(MFN, 12.5%)`）。2026-07-24 発効 | 12.5% 一律 | **MFN ≤ 12.5% の品目では一致、超える品目では過少** | [USTR 最終措置 FRN (2026-07-23) p.28, p.78](https://ustr.gov/sites/default/files/files/Press/Releases/2026/FLIP%20301%20Investigation%20Final%20Action%20FRN%207-23-26%20FINAL.pdf) | 2026-09-06 |
| 課税ベース | 米国は FOB（商品価格）。国際運賃は課税価格に入らない | `base: 'FOB'` | **一致** | HTSUS 一般規則／CBP | 2026-09-06 |
| USPS 通関・配達手数料 | **$9.35／課税対象郵便物1個**（Notice 123 価格表）。ただし IMM 712.11 は「customs duty or Internal Revenue tax **is collected**」な品にだけ課すと書き、712.2 は「examined and passed free of duty」を除外する。**税を徴収しなければ手数料も無い** | $2,500 以下 **0**（Zonos 事前納付で配達時の徴収が無い）／超は $9.35 | **一致（2026-09-07 に修正）。**原典で確認したので tier を `fixed` に上げた | [USPS IMM 712](https://pe.usps.com/text/imm/immc7_002.htm) / [Notice 123](https://pe.usps.com/text/dmm300/Notice123.htm) | 2026-09-07 |
| CBP 側の手数料 | **この帯では買い手に課されない**（2026-09-07 に原文で確認、以前の「欠落」は誤り）。①24.22(f)(2)「The fee specified in paragraph (f)(1) ... does not apply to dutiable Inbound EMS items」→ 名宛人課金の Dutiable Mail Fee $7.39 は EMS 適用外 ②24.22(l)(2) の EMS 手数料 $1.00 は USPS が**外国郵便事業者との settlement** で受け取り四半期ごとに CBP へ送金するもので、名宛人には課されない ③24.23(c)(v)「merchandise imported by mail, other than Inbound EMS items that are **formally entered**」→ MPF は郵便免除、EMS が正式申告（$2,500 超）のときだけ 24.23(b)(1) の formal MPF（0.3464%・最低 $33.58） | 無し | **$2,500 以下は一致（課されない）。$2,500 超の formal MPF は未実装** | [19 CFR 24.22](https://www.ecfr.gov/current/title-19/chapter-I/part-24/section-24.22) / [19 CFR 24.23](https://www.ecfr.gov/current/title-19/chapter-I/part-24/section-24.23) / [CBP User Fee Table](https://www.cbp.gov/trade/basic-import-export/user-fee-table) | 2026-09-07 |
| 州の売上税 | 連邦レベルには無い（実装の注記どおり） | `vatRate: null` | 一致 | — | — |

### 「米国の少額免税停止」という前提は今も正しいか → **正しい。ただし理由が古い。**

停止そのものは無期限で継続している（2026-02 の大統領令、2026-06-24 の連邦官報2件）。
`notes: ['de_minimis_suspended']` は現時点でも有効。

一方で **12.5% という数字の根拠は完全に入れ替わっている**。
`src/legacy/index.html:329` は「Section 301 の報道値、USITC で未確認」と書いているが、
2026-07-24 に USTR が強制労働を理由とする新 Section 301 措置を発動し、
日本は「12.5% net of MFN」の対象国に名指しされた（FRN p.28）。
したがって現在の正しい式は **`関税 = max(MFN率, 12.5%) × 商品価格`** である。
実装の「12.5% 一律」は下限としては正しく、上限としては間違っている。

USITC の HTS API（`hts.usitc.gov/reststop/search`）で実際に引いた MFN 一般税率：

| 品目 | HTS | MFN 一般 | 実際の合計（301込み） | 実装 | 差 |
|---|---|---|---|---|---|
| フィギュア・玩具・スケールモデル | 9503.00.00 | **Free** | 12.5% | 12.5% | **0** |
| 家庭用ゲーム機 | 9504.50.00 | Free | 12.5% | 12.5% | 0 |
| 書籍 | 4901.99.00 | Free | 12.5%（※書籍等は 301 の適用除外候補。Annex は未精査） | 12.5% | 未確定 |
| 綿Tシャツ | 6109.10.00 | **16.5%** | 16.5% | 12.5% | **-4.0pt** |
| 化繊セーター類 | 6110.30.30 | **32%** | 32% | 12.5% | **-19.5pt** |
| 革靴（男性） | 6403.99.60 | 8.5% | 12.5% | 12.5% | 0 |
| 合成皮革の靴 | 6402.99.31 | 6% | 12.5% | 12.5% | 0 |
| 貴金属の装身具 | 7113.19.50 | 5.5% | 12.5% | 12.5% | 0 |
| 収集品（考古・民族・歴史） | 9705.10.00 | Free | **301 の適用除外**（Annex II Part A に列挙。9701〜9705 の美術品・切手・収集品） | 12.5% | **+12.5pt（過大）** |

**金額にすると（商品 ¥12,000 の場合）**：化繊セーターで関税 ¥1,500 → 実際 ¥3,840（**¥2,340 の過少**）、
綿Tシャツで ¥1,500 → ¥1,980（¥480 の過少）、切手・美術品で ¥1,500 → ¥0（¥1,500 の過大）。
**扱う商品が主にフィギュアである限り 12.5% は当たっているが、衣類が1点混ざるだけで壊れる。**

さらに **原産国が実装のどこにも無い**。日本の出品でも中国製・ベトナム製は普通にあり、
Section 301 の税率は「products of Japan」に紐づく。中国原産品なら別の（はるかに高い）レートになる。
実装は「日本で買った＝日本原産」を暗黙に仮定している。

---

## 2. 英国（GB）

| 項目 | 一次情報の値 | 実装の値 | 判定 | 出典 | 確認日 |
|---|---|---|---|---|---|
| VAT率 | 20% | 0.20 | 一致 | [gov.uk 税と関税](https://www.gov.uk/goods-sent-from-abroad/tax-and-duty) | 2026-09-06 |
| £135 の測り方 | **intrinsic value（物品の価格）。運賃・保険は除く**（請求書で分離表示していない場合を除く）。他の税・手数料も除く。**合計consignment単位** | `cif`（商品＋国内送料＋EMS）を 135 と比較 | **ずれ（閾値を早く超える）** | [VAT and overseas goods sold directly to customers in the UK](https://www.gov.uk/guidance/vat-and-overseas-goods-sold-directly-to-customers-in-the-uk) | 2026-09-06 |
| VAT の徴収方式（≤£135） | **売り手が販売時点で英国VATを登録・課税**。輸入時には課さない | 「VAT 20%」を輸入側の行として課す | 金額はほぼ一致・**位置づけが違う** | 同上 | 2026-09-06 |
| VAT の課税ベース（>£135） | 「total package value = 物品＋郵送料＋梱包＋保険＋関税」 | `cif + 関税` | 一致 | [gov.uk](https://www.gov.uk/goods-sent-from-abroad/tax-and-duty) | 2026-09-06 |
| 関税（≤£135、非酒税品） | **無し** | ¥0 | 一致 | 同上 | 2026-09-06 |
| 関税（>£135） | 品目と原産地による（Trade Tariff）。日英CEPA で日本原産なら原則0% | `null`（総額から落ちる） | **欠落（ただし null 表示は誠実）** | 同上 | 2026-09-06 |
| 酒・たばこ | **金額にかかわらず Excise Duty**。£39以下の贈答免除も効かない | 扱い無し | **欠落** | 同上 | 2026-09-06 |
| Royal Mail の立替手数料 £8 | **取得できず**（royalmail.com が 403/503） | £8, `unverified` | **未検証のまま** | — | — |

**問題の実質**：≤£135 の場合、gov.uk の建て付けでは VAT は売り手が販売時に取り、
配達業者は税を立て替えないので **手数料も発生しない**。
実装は「VAT ¥3,670 ＋ 通関手数料 ¥1,520」を両方積む（総額 ¥23,590）。
手数料の ¥1,520 は**二重取り**の可能性が高い（`compare.ts:89-95` が
「税が実際に立て替えられたか」を条件にしていないため）。

**閾値の測り方のずれの実例**：商品 £120（¥22,800）＋ 国内送料 ¥800 ＋ EMS ¥5,550 →
`declared = £150.2 > 135` となり、実装は「閾値超・関税率は未取得（null）」に落ちる。
一次情報では intrinsic value は £120 なので **£135 以下**であり、関税ゼロ・売り手VATの世界に留まる。
**閾値の直下 £110〜£135 の帯で、実装は必ず判定を誤る。**

---

## 3. ドイツ（DE）／フランス（FR）

| 項目 | 一次情報の値 | 実装の値 | 判定 | 出典 | 確認日 |
|---|---|---|---|---|---|
| €150 の関税免除 | **2026-07-01 に撤廃**。Council Regulation (EU) 2026/382（2026-02-11、Reg 1186/2009 改正） | `dutyFreeLimit: 150` として残す | 実質一致（下の €3 で置き換わっている） | [EU 税制総局](https://taxation-customs.ec.europa.eu/news/e-commerce-150-eur-customs-duty-exemption-threshold-be-removed-2026-2025-11-13_en) | 2026-09-06 |
| €3 定額関税 | **1点あたり €3。€150 以下の consignment に含まれる distance sale of imported goods (DSIG) が対象。2026-07-01〜2028-06-30** | `flatDutyPerItem: 3` × 点数、`dutyTier: 'fixed'` | **一致（点数の掛け方も「per item」で正しい）** | [EU 暫定定額関税ガイダンス](https://taxation-customs.ec.europa.eu/news/guidance-and-legal-text-temporary-flat-fee-low-value-imports-which-will-apply-until-1-july-2028-2026-06-08_en) | 2026-09-06 |
| €3 の適用対象 | **DSIG に限る**。申告者は「seller または importer（IOSS holder / special arrangements user / 間接代理人）」 | 代行経由かどうかを問わず一律に €3 | **未検証のリスク**（下記） | 同上 | 2026-09-06 |
| €3 の VAT 課税ベース | **IOSS を使う場合は VAT の課税標準に含めない**。special arrangements / 標準手続では**含める** | 常に `cif + 関税` に含める | **IOSS 経路では過大** | [VAT e-Commerce explanatory notes 追補](https://vat-one-stop-shop.ec.europa.eu/eur-3-customs-duty-vat-guidelines-2026-06-16_en) | 2026-09-06 |
| VAT率 | DE 19% / FR 20% | 0.19 / 0.20 | 一致 | 同上 | 2026-09-06 |
| VAT 免税限度 | **無し**（2021-07-01 に €22 免除は廃止） | `vatFreeLimit: 0` | 一致 | 同上 | 2026-09-06 |
| €150 の測り方 | intrinsic value（UCC 上、運賃・保険を除く） | `cif`（送料込み）で判定 | **ずれ（GB と同じ構造の誤り）** | 同上 | 2026-09-06 |
| Union handling fee | **2026年11月以降に導入予定**。VAT の対象外 | 無し | **未実装（近く必要になる）** | [VAT 追補 PDF](https://vat-one-stop-shop.ec.europa.eu/document/download/4ba8dc4c-2600-43ee-9010-2101cd05210c_en) | 2026-09-06 |
| 郵便事業者の立替手数料 | **取得できず**（deutschepost.de / zoll.de の該当ページが 404） | `null`（「not included」と表示） | **未取得。表示は誠実** | — | — |

**`dutyTier: 'fixed'` は今なら正当**。`src/legacy/data.js:90` の時点では €3 に根拠が無く、
`dutyVerified: true` は先走りだったが、2026-07-01 に規則が追いついた。結果として現在は正しい。

**残るリスク**：€3 は **distance sale（売り手が EU の購入者へ発送する取引）** の制度である。
代行業者は「利用者の代理人として日本国内で買い、利用者宛に発送する」形態なので、
これが DSIG に当たるかは規則本文からは断定できなかった。
DSIG でないなら €150 以下でも **通常の EU 関税率**（玩具 4.7% 等）が適用される可能性がある。
ただし ZenMarket は EU 向け €150 以下で IOSS を使っていると自社で説明しており、
IOSS 利用＝DSIG として扱っている運用が実在する（[ZenMarket EU VAT ガイド](https://zenmarket.jp/en/blog/post/10269/vat-import-rules-eu)、本文は Cloudflare により取得できず検索結果のみ）。
**「DSIG に当たるか」は代行会社ごとに違いうる。実装は全社一律に €3 を積んでいる。**

IOSS 経路での €3 への VAT 二重計上は DE で €0.57、FR で €0.60（¥93 / ¥98）／点。金額は小さいが
**一次情報が明示的に「含めるな」と書いている箇所を含めている**。

---

## 4. オーストラリア（AU）

| 項目 | 一次情報の値 | 実装の値 | 判定 | 出典 | 確認日 |
|---|---|---|---|---|---|
| A$1,000 以下の GST | **10%。売り手・プラットフォーム・「redeliverer（転送・代理購入業者）」が販売時点で徴収**。国境では課さない | 「GST 10%」を輸入側の行として課す | 金額は近い・**徴収者と課税ベースが違う** | [Buyee 豪州GST案内](https://buyee.jp/helpcenter/guide/au-gst?lang=en) / [ZenMarket 豪州GST](https://zenmarket.jp/en/blog/post/7416/australia-gst-customs-zenmarket) | 2026-09-06 |
| GST の課税ベース（≤A$1,000） | Buyee の明記：「**物品価格・Buyeeのサービス料・オプション料・国内/国際送料・消費税等の 10%**」 | `商品 + EMS` のみ（79行の FOB 分岐） | **過少**。手数料・国内送料・梱包が抜ける | [Buyee 豪州GST案内](https://buyee.jp/helpcenter/guide/au-gst?lang=en) | 2026-09-06 |
| A$1,000 超 | 国境で GST と関税。**Import Processing Charge が発生** | 関税 `null`、手数料 `null` | **欠落** | [ABF Import Processing Charge](https://www.abf.gov.au/importing-exporting-and-manufacturing/importing/cost-of-importing-goods/charges/import-processing-charge) | 2026-09-06 |
| Import Processing Charge | 電子申告 >A$1,000〜<A$10,000：**A$50.00**、≥A$10,000：A$152.00。書面申告は A$90 / A$192 | 無し | **欠落** | 同上 | 2026-09-06 |
| 生物検疫課金 | Full Import Declaration（航空）**A$48.00**（A$1,000超の貨物） | 無し | **欠落** | 同上 | 2026-09-06 |
| 閾値の判定単位 | customs value（FOB） | `base: 'FOB'` | 一致 | 同上 | 2026-09-06 |
| 酒・たばこ | **A$1,000 以下でも GST 免除の対象外**。加えて日本郵便が豪州向け酒類を引き受けない | 扱い無し | **欠落** | [Buyee](https://buyee.jp/helpcenter/guide/au-gst?lang=en) / `src/data/weights.ts:1115` | 2026-09-06 |

金額例（商品 ¥12,000）：実装 GST ¥1,755 に対し、Buyee 方式の課税ベース（税前総額 ¥18,400）なら ¥1,840。
差は **¥85 の過少**で小さい。一方 **A$1,000 超の帯では A$50 + A$48 = ¥9,702 が丸ごと落ちている**。

---

## 5. カナダ（CA）

| 項目 | 一次情報の値 | 実装の値 | 判定 | 出典 | 確認日 |
|---|---|---|---|---|---|
| 郵便の免税限度 | **CAN$20 以下は関税・税なし**（Postal Imports Remission Order）。贈答は $60 | `dutyFreeLimit: 20`, `vatFreeLimit: 20` | 一致 | [CBSA 郵便輸入](https://www.cbsa-asfc.gc.ca/import/postal-postale/dtytx-drttx-eng.html) | 2026-09-06 |
| GST | 5% | 0.05 | 一致 | 同上 | 2026-09-06 |
| **州税** | **CBSA が居住州に応じて PST/HST を徴収する。$20 超の課税対象輸入品のほとんどが対象**。HST 州（NB/NL/NS/ON/PE）は 13%、GST+PST 州（BC/MB/QC/SK）は両方、GST のみの州（AB/NT/NU/YT） | `null`（「depends on your province — not included」） | **欠落。しかも「州によって決まる」は取得可能な情報**（州は利用者が選べる） | 同上 | 2026-09-06 |
| Canada Post 立替手数料 | **CAN$9.95／課税対象郵便物1個** | `null` | **欠落** | [Canada Post 関税・税・免除](https://www.canadapost-postescanada.ca/cpc/en/support/articles/customs-requirements/customs-duty-taxes-and-exemptions.page)（検索結果経由。ページ本文は取得できず） | 2026-09-06 |
| 関税率 | 品目・原産地による。CPTPP で日本原産なら多くが0% | `null` | 欠落（null 表示は誠実） | [CBSA](https://www.cbsa-asfc.gc.ca/import/postal-postale/dtytx-drttx-eng.html) | 2026-09-06 |
| GST の課税ベース | 「CBSA は物品の価額（カナダドル）に基づいて算定する」。国際運賃が入るとは書かれていない | `商品 + EMS`（79行） | **過大の疑い**（EMS ¥4,150 の 5% = ¥208） | 同上 | 2026-09-06 |

**総額への影響が最も大きいのがカナダ。** 実装は総額 ¥19,278 を出すが、
オンタリオ州（HST 13%）なら州分 8% ≒ **¥1,400**、Canada Post 手数料 **¥1,095** が加わり、
実勢はおよそ **¥21,800**。**約13%の過少表示。**
`province-tax` を「—」で出しているのは正しい態度だが、
**州は7カ国の選択と同じく利用者が指定できる情報**であり、「取得できない」ではなく「実装していない」だけである。

---

## 6. シンガポール（SG）

| 項目 | 一次情報の値 | 実装の値 | 判定 | 出典 | 確認日 |
|---|---|---|---|---|---|
| GST率 | 9% | 0.09 | 一致 | [Singapore Customs GST on Low-Value Goods](https://www.customs.gov.sg/personal-shipment/buying-from-overseas/gst-on-low-value-goods/)（最終更新 2026-03-25） | 2026-09-06 |
| S$400 の輸入時免除 | **存続している**。航空・郵便、酒・たばこ以外、CIF S$400 以下 | `vatFreeLimit: 400`（CIF基準） | **一致** | [Singapore Customs 郵便・クーリエの GST/関税](https://www.customs.gov.sg/personal-shipment/buying-from-overseas/paying-gst-duty-for-postal-courier-items/)（最終更新 2026-02-19） | 2026-09-06 |
| **OVR（海外事業者登録）** | **2023-01 以降、GST 登録済み海外事業者からの S$400 以下の購入は購入時点で 9% を課税**。免除は「主に非登録事業者からの購入」に適用 | 400 以下は一律 ¥0 | **欠落**（下記） | 同上 | 2026-09-06 |
| 転送・代行業者の扱い | **「転送業者が GST 登録していれば GST を課しうる。物品と転送業者のサービス料の両方に及びうる」** | 扱い無し | **欠落** | [Singapore Customs](https://www.customs.gov.sg/personal-shipment/buying-from-overseas/gst-on-low-value-goods/) | 2026-09-06 |
| 実際の代行業者の運用 | Buyee：**S$400 未満は「物品価格＋Buyeeのサービス料＋その他オプション料」とともに 9% を前徴収**（航空便。海上便は前徴収しない） | ¥0 | **明確なずれ** | [Buyee シンガポールGST案内](https://buyee.jp/helpcenter/guide/sg-gst?lang=en) | 2026-09-06 |
| 関税 | 酒・たばこ・自動車・石油以外は非課税 | `dutyRate: 0`, `dutyFreeLimit: Infinity` | 一致 | [Singapore Customs](https://www.customs.gov.sg/personal-shipment/buying-from-overseas/paying-gst-duty-for-postal-courier-items/) | 2026-09-06 |
| 酒類 | **S$400 以下でも GST 免除の対象外**。加えて酒類には物品税 | 「Duty ¥0 / GST ¥0」と表示される | **重大な欠落** | 同上 | 2026-09-06 |
| LVG の「sales value」 | **物品の価格のみ**。運賃・保険・GST・関税を含まない（例：品 S$395＋送料 S$25 → sales value は S$395） | — | 参考（OVR を実装する際の課税ベース） | [Singapore Customs](https://www.customs.gov.sg/personal-shipment/buying-from-overseas/gst-on-low-value-goods/) | 2026-09-06 |

**このツールが比較している5社はまさに「GST登録した海外事業者／転送業者」に該当する。**
実装は SG を「S$400 以下なら税ゼロ」と出すが、Buyee は自社ページで
**S$400 未満に 9% を前徴収すると明記している**。
金額例：実装の総額 ¥16,700 に対し、9% ＝ **¥1,503** が丸ごと落ちている（**約8%の過少**）。
SG は現在7カ国で最安に見えるが、**その最安さは欠落によって作られている。**

---

## 7. 実装に無い費用カテゴリ（横断）

| カテゴリ | 実態 | 金額の桁 | 一次情報 |
|---|---|---|---|
| 為替スプレッド | 各社の請求は円建て。利用者のカード／PayPal に 2〜4% の外貨手数料が乗る。`rates.ts` は公表仲値の固定値のみ | ¥20,000 につき **¥400〜800** | 未取得（カード会社ごと） |
| 米国 CBP の formal MPF（**$2,500 超の帯だけ**） | 24.23(c)(v) は郵便を MPF 免除にし、EMS も**正式申告されたときだけ**免除外。$2,500 以下は課されない（前の版の「¥550〜¥1,960 が未計上」は誤り） | **¥5,250〜**（$33.58 最低額・該当帯のみ） | [19 CFR 24.23](https://www.ecfr.gov/current/title-19/chapter-I/part-24/section-24.23) |
| 豪州 IPC＋生物検疫 | A$1,000超で A$50＋A$48 | **¥9,700**（該当帯のみ） | [ABF](https://www.abf.gov.au/importing-exporting-and-manufacturing/importing/cost-of-importing-goods/charges/import-processing-charge) |
| Canada Post 立替手数料 | CAN$9.95／課税郵便物 | **¥1,095** | Canada Post |
| カナダ州税 | 州により 0〜10%（QST 9.975%、ON 8%、BC 7% 等） | **¥0〜¥1,800** | [CBSA](https://www.cbsa-asfc.gc.ca/import/postal-postale/dtytx-drttx-eng.html) |
| EU Union handling fee | 2026年11月以降に導入予定。額未定・VAT対象外 | 未定 | [EU VAT 追補](https://vat-one-stop-shop.ec.europa.eu/eur-3-customs-duty-vat-guidelines-2026-06-16_en) |
| DE/FR の郵便立替手数料 | 存在するが額を取得できず | 不明 | 取得失敗（§8） |
| 酒税・たばこ税 | GB は金額を問わず excise。SG は酒に免除なし＋物品税。CA/AU も少額免除の対象外 | 品目次第（酒は本体価格級） | 各国税関 |
| 禁制品・数量制限 | 24度超の酒は**そもそも国際郵便で送れない**。24度以下でも国別に不可 | 総額の問題ではなく「送れない」 | [日本郵便 FAQ](https://www.post.japanpost.jp/int/question/64.html) |
| 原産国 | 関税率は原産国で決まる。実装に原産国の概念が無い | US で 12.5% と中国レートの差（桁が変わる） | [USTR FRN](https://ustr.gov/sites/default/files/files/Press/Releases/2026/FLIP%20301%20Investigation%20Final%20Action%20FRN%207-23-26%20FINAL.pdf) |
| 特恵原産地（EPA） | 日EU EPA・日英CEPA・CPTPP・JAEPA・JSEPA で日本原産品は多くが0%。閾値超の関税を `null` にしているが、原産地証明があれば0になりうる | 閾値超の帯で数千円 | 各協定 |

### 酒（アルコール）の扱い

`src/data/weights.ts:1115` は正しく書いている——
「24%超は航空危険物として一律不可、24%以下でも米国・豪州等が不可」。
日本郵便の一次情報でも「**アルコール度数24度以下であるものは国際郵便物として送ることができます。
ただし、国によってお送りいただけない場合があります**」と確認できた
（[日本郵便 FAQ 64](https://www.post.japanpost.jp/int/question/64.html)、確認日 2026-09-06）。

**しかしこの知識は計算に一切入っていない。**
`src/lib/pricing/weights.ts` は重量を返すだけで、`resolveWeight()` にも `WeightResolution` にも
「送れるか」を示すフィールドが無い。`compare.ts` は品目カテゴリを見ない。
その結果 `sake-720ml` を米国宛で入れると、**送れない荷物の総額が平然と5社分並ぶ**。
`grep -rn "prohibited\|shippable\|dangerous"` は `src/lib/` と `src/app/` で0件。
docs に書いてあることと動くコードが乖離している典型例である。

---

## 8. 総額への影響が大きい順（欠落・ずれ）

商品 ¥12,000・900g・1点・現行固定為替、最安行（Neokyo）での金額。

| # | 国 | 内容 | 方向 | 金額 | 総額比 |
|---|---|---|---|---|---|
| 1 | AU | A$1,000 超の IPC A$50 ＋ 生物検疫 A$48 が無い | 過少 | **¥9,702** | 該当帯で 30%超 |
| 2 | CA | 州税（ON 8%）＋ Canada Post CAN$9.95 が無い | 過少 | **¥2,495** | **-13%** |
| 3 | US | 衣類など MFN > 12.5% の品目を 12.5% 固定にしている（化繊セーター 32%） | 過少 | **¥2,340** | -10% |
| 4 | SG | OVR による 9% 前徴収（Buyee が明記）を「S$400以下は¥0」としている | 過少 | **¥1,503** | **-8%** |
| 5 | GB | ≤£135 で「VAT」と「£8 立替手数料」を両方積む（売り手徴収なら手数料は発生しない） | 過大 | **+¥1,520** | +7% |
| 6 | US | ~~Inbound EMS の MPF＋EMS 手数料~~ **誤りだった。**24.22(f)(2) と 24.23(c)(v) の原文で、$2,500 以下の EMS には CBP 手数料が課されないことを確認（2026-09-07） | — | ¥0 | 0% |
| 7 | CA | Canada Post 手数料単体（#2 の内訳） | 過少 | ¥1,095 | -6% |
| 8 | 全 | 為替スプレッド 2〜4%（実装は仲値固定） | 過少 | ¥400〜800 | -2〜4% |
| 9 | GB/DE/FR | 閾値を CIF で判定（正しくは intrinsic value）。£110〜135・€125〜150 の帯で判定を誤る | 両方向 | 帯によっては関税行が丸ごと反転 | — |
| 10 | AU | GST の課税ベースに手数料・国内送料が入っていない | 過少 | ¥85 | -0.4% |
| 11 | CA | GST の課税ベースに EMS を入れている | 過大 | +¥208 | +1% |
| 12 | DE/FR | IOSS 経路で €3 に VAT を掛けている | 過大 | +¥93〜98 | +0.5% |
| — | 全 | 酒類：送れない／物品税がある。計算に反映されない | 判定不能 | — | — |
| — | 全 | 原産国が無い（中国原産なら US の税率が別物） | 判定不能 | — | — |

**総額を低く見せる方向の誤りが、高く見せる方向より一貫して大きい。**
`Row.excluded` に「未取得の費目」を並べる設計は誠実だが、
上の #2 #4 #6 は「取得できない」のではなく「取りに行っていない」ものである。

---

## 9. コード上の具体的な指摘（`compare.ts`）

| 行 | 症状 |
|---|---|
| 52-53 | CIF 国で `declared` を CIF で作り免税限度と比べる。GB/EU の閾値は intrinsic value（運賃・保険を除く）。**閾値の直下で必ず誤判定する** |
| 79 | FOB 国の VAT ベースが `商品 + EMS`。これは AU の法定ベース（customs value＋運賃＋保険＋関税）でも、CA のベース（物品の価額）でも、代行各社の実際の徴収ベース（総額）でもない。**どの国の制度にも対応しない第3の値** |
| 79 | CIF 国のベースは `cif + 関税`。EU の IOSS 経路では €3 を含めてはならない（一次情報が明示） |
| 89-95 | 立替手数料を**税が実際に発生したかを見ずに**常に課す。USPS IMM 712.2 は「無税で通関した郵便物には手数料を課さない」と明記。GB の ≤£135 も同様 |
| 57-75 | 関税率が**国だけ**の関数。品目（HTS）と原産国が入らない。US を一律 12.5% にできているのは日本原産・低MFN品目に限った偶然 |
| 全体 | `taxLines()` は「送れるか」を判定しない。24度超の酒でも総額が出る |

---

## 10. 取れなかった一次情報と理由

| 項目 | 理由 |
|---|---|
| Royal Mail の £8 立替手数料 | `royalmail.com` と `help.royalmail.com` がこの環境からのアクセスに 403／503 を返す。価格表 PDF も 403。**実装の £8 は依然として未検証**（`clearanceTier: 'unverified'` は正しい） |
| Deutsche Post / DHL（DE）の通関立替手数料 | `deutschepost.de` の該当ページが 404、`zoll.de` の英語ページも 404。URL を特定できず |
| La Poste（FR）の通関立替手数料 | 上記に時間を取られ未着手 |
| ATO（豪州）の redeliverer 規定の原文 | `ato.gov.au` が Akamai により 403（WebFetch・curl とも）。**代替として ABF の IPC 表と Buyee の自社案内で裏を取った** |
| Federal Register の郵便 informal entry 規則本文 | `federalregister.gov` が `unblock.federalregister.gov` へリダイレクトし取得不可。**代替として CBP の FAQ とホワイトハウスの大統領令本文で裏を取った** |
| USTR FRN の Annex I / Annex II Part A の全量 | 431ページ。Japan の税率決定（p.28）と収集品の除外（p.241）は確認したが、**書籍・情報資料の除外範囲は未精査** |
| 日本郵便の国・地域別条件表（米国・豪州の酒類） | 国コード（cid）の特定に至らず。**日本郵便 FAQ の一般則（24度超は不可・国別制限あり）までは確認済み** |
| EU €3 が代行経由の購入で DSIG に当たるか | 規則本文（Reg 2026/382）と実施ガイダンスの範囲では断定できず。ZenMarket の EU VAT 解説は Cloudflare により本文取得不可 |
| カナダの CAN$9.95 と州税徴収の Canada Post 側原文 | 検索結果の要約までは取れたが、`canadapost-postescanada.ca` の本文は未取得。CBSA 側（州別 HST/PST の徴収）は本文で確認済み |
