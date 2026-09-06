# 監査：先行3監査が見ていない領域

対象ブランチ `claude/automated-income-schemes-uzn8zw-rh3uwh`。検査日 **2026-09-06**。
先行監査 `docs/audit/fees.md` / `taxes.md` / `logic.md` を全文読んだうえで、
**3つとも触れていない領域**だけを扱う。製品コードは触っていない。

判定はすべて、この場で実際に走らせた `compare()` の値か、この日に取得した一次情報に基づく。
取れなかったものは「取れなかった」と書く。

> **作業ツリーの状態について。** 監査の途中で `ems.ts` / `compare.ts` / `types.ts` /
> `weights.ts` / `WeightTable.tsx` が別作業により変更された（`git status` で確認）。
> 変更は `logic.md` L3（15kg 超の丸め）への対応で、`emsFor` が表の外で `null` を返し、
> `Row.comparable` が導入されている。この変更で一度 `npx vitest run` が
> 16 failed / 158 passed になり、その後 `compare.test.ts` と `docs/DESIGN-NOTES.md` が
> **挙動に合わせて書き換えられて 181 passed に戻った。挙動は直っていない。**
> 以下の判定は、**この変更を含む現在のツリー**（`git diff --stat` で9ファイル）に対するものである。
> 変更前の挙動（15kg 超を丸める）についての判定は G4 に併記した。

---

## 0. 先に結論

**先行3監査は「費目が正しいか」「税率が正しいか」「計算が正しいか」を見ている。
どれも「EMS で送る」という前提の内側の話である。その前提の外に、より大きな穴が4つある。**

| # | 見落とし | 一次情報 | 総額・順位への効き |
|---|---|---|---|
| **A** | **EMS は5社が選べる方式の中で常に最も高い。**小形包装物（航空）は同じ重量で 43〜54% 安い | 日本郵便 料金表 | 国際送料は総額の約40%（DESIGN-NOTES §1）。その行が丸ごと最高値で固定されている |
| **B** | **米国宛は 2025-08-27〜2026-04-13 まで引受停止。**再開後は $100 超で Zonos による関税事前支払いが**必須**、Zonos の利用料がかかる | 日本郵便 2026-04-13 プレスリリース | 米国列の課税モデル（12.5% + USPS $9.35）が制度ごと入れ替わっている。監視スクリプトはこの変更を検知できない |
| **C** | **固定為替が最大 11.9% ずれている。**`RATES_AS_OF` は「2026-09-06」＝今日と書いてあるが、値は今日の仲値ではない | exchangerate-api（2026-09-06 00:02 UTC） | 画面の現地通貨表示が英・独・仏・豪で 10〜12% 過大。免税限度の判定境界が数千〜1万数千円ずれる |
| **D** | **EMS 料金表は27段ではなく42段（30kg まで）。**「この表では持たない」という `ems.ts` のコメントは事実に反する。同じ URL の同じ表に載っている | 日本郵便 EMS 料金表 | **現在のツリーでは、5点×3,000g／米国で「Buyee, default（最も高い ¥96,388）」が1位に出る。**正しい料金を入れれば Neokyo が ¥69,378 で1位（差 ¥27,010）。`logic.md` L3 はコードの言い訳を検証せずに通した |

以下の金額例はすべて **1点 ¥5,000 / 実重量 500g（梱包後 900g）/ 米国宛**、
現行の固定為替で `compare()` を実際に走らせた次の基準値に対する差である。

```
1 Neokyo      12,898
2 FROM JAPAN  13,548 (+650)
3 Buyee       13,848 (+950)
4 ZenMarket   14,069 (+1,171)
5 Jauce       14,598 (+1,700)
```

**1位と2位の差は ¥650。**以下の見落としはほぼ全てこの幅より大きい。

---

## 1. 見落としの一覧（重大な順）

### G1. 配送方法が EMS 固定（最重要・§2 で詳述）

出典: [日本郵便 料金表](https://www.post.japanpost.jp/int/charge/list/index.html)（取得成功 200、2026-09-06）

5社はいずれも EMS 以外を選べる。各社の公式ページで確認した提供方式：

| 社 | 選べる国際配送方式（原文で確認） | 出典 |
|---|---|---|
| Buyee | EMS / AIR（国際小包・小形包装物・AIR Packet）/ SAL（現在停止中）/ 船便 / FedEx / FedEx Economy / DHL / UPS / ECMS / Buyee Air Delivery ほか **11種以上** | [shipping-method](https://buyee.jp/helpcenter/guide/shipping-method?lang=en) 200 |
| Neokyo | Surface / Airmail / EMS / FedEx / UPS / DHL の **6種**（「Neokyo offers you 6 different shipment methods」） | [shipping](https://neokyo.com/en/shipping) 200 |
| FROM JAPAN | 日本郵便（EMS / 国際小包 航空・船便 / 小形包装物 航空・船便 / 国際 ePacket Light）/ FedEx Priority・Economy / DHL / ECMS の **8種以上** | `translate/en_help.txt` `help_logistics_370-391,442-443,510,520` 200 |
| Jauce | 日本郵便のみ **EMS / SAL / 船便 の3種** | [japan_auction_detail](https://www.jauce.com/japan_auction_detail) 200 |
| ZenMarket | **取得できず**（Cloudflare 403、`fees.md` と同じ） | — |

**Buyee は自社ページで EMS より安い方式があると明記している**（原文）：

- AIR: "Airmail is almost as fast as EMS, but **a little bit cheaper**."
- Small Packet: "Airmail is almost as fast as EMS, but **cheaper**, and only for small packages."
- SAL: "Slower than EMS or Airmail, but **considerably cheaper**."
- 船便: "Takes 1-3 months to arrive, but **is the cheapest shipping option we offer**."
- FedEx: "Depending on the weight, shipping rates are **cheaper than EMS**."
- DHL: "Depending on the weight, it could be **cheaper than EMS**."

実装は6種〜11種の中から**最も高い1つ**を全社に固定している。

### G2. 米国宛の制度が2026-04 に入れ替わっている（DDP 事前支払いと Zonos 利用料）

出典: [日本郵便 2026-04-13 プレスリリース PDF](https://www.post.japanpost.jp/notification/pressrelease/2026/00_honsha/0413_01_01.pdf)（取得成功 200、347,959 bytes、`pdftotext` で本文を読んだ）
／[英語版お知らせ](https://www.post.japanpost.jp/service/send/oversea/information/2026/0413_01_en.html)（取得成功 200）

原文（日本語 PDF）：

> 米国政府は、2025 年 7 月 30 日、…免税措置（デミニミス）を同年 8 月 29 日から停止し…
> これを受け当社は、**同年 8 月 27 日から、内容品価格が 100US ドルを超える個人間の贈答品や
> 販売品を包有する米国宛ての郵便物について、一時的に引き受けを停止しておりました。**
> …**2026 年 4 月 14 日以降、指定する郵便局にて米国宛ての全ての郵便物を引き受けいたします。**

差出条件（原文の表そのまま）：

| 内容品価格 | 引受局 | 関税の事前支払い | ラベル |
|---|---|---|---|
| 100USD 以下（書状・EMS書類・個人間贈答品） | 全局 | 不要 | 不要 |
| 100USD 以下（上記以外） | 指定郵便局 | **必要** | DDP |
| 100USD 超〜800USD 以下 | 指定郵便局 | **必要** | DDP |
| 800USD 超 | 指定郵便局 | 不要 | 不要 |

> ※ 現在、当社が推奨する認定事業者は **Zonos 社のみ**となります。
> ※ アプリケーションを利用して関税などをお支払いいただく際には、**Zonos 社が定める利用料金がかかります。**

**総額・順位への効き**

1. **Zonos の利用料が総額に無い。**Zonos 公式も「per shipment postal clearance fee … vary by post」
   としか書いておらず、**額は公開されていない**（[Zonos Docs](https://zonos.com/docs/postal/shipping-via-posts/zonos-and-japan-post/zonos-prepay) 取得成功）。
   額が取れないなら **`null`（「—」）で出すべき費目**であって、無いことにしてよい費目ではない。
2. **USPS の $9.35 は、この経路では発生しない可能性が高い。**$9.35 は USPS が関税を立替徴収したときの
   手数料である。DDP で事前納付済みなら USPS は徴収しない。`taxes.md` は
   「USPS IMM 712.2 は無税通関の郵便物に手数料を課さない」と書きながら、DDP 制度そのものを見ていない。
   実装は `clearanceFeePerParcel: 9.35` を **税の発生有無を問わず常に課している**（`compare.ts:89-95`）。
3. **代行会社ごとに米国の課税方式が違う。**Neokyo は自社ページで（原文）：

   > If you ship with **DHL**, the customs are **Delivered Duty Unpaid (DDU)** …
   > If you ship with **FedEx**, the customs are **Delivered Duty Paid (DDP)** …
   > **Base Tax: a flat 13.4% fee on the declared value plus 150 yen per package.**
   > **Flat Fedex Broker Fee: 2% of the Base Tax or 15USD, whichever is higher.**
   > **Item Line Fee**: … **from 3.50USD**.
   > Optional: if the package contains any kind of edible, consumable or cosmetic item,
   > FedEx will charge an **additional 29 USD**.

   基準ケース（商品 ¥5,000）で計算すると：

   | | 実装 | Neokyo/FedEx（原文どおり） |
   |---|---:|---:|
   | 関税 | 12.5% = ¥625 | 13.4% = ¥670 + ¥150/個口 |
   | 手数料 | USPS $9.35 = ¥1,403 | ブローカー $15 = ¥2,250 + 品目行 $3.50 = ¥525 |
   | 計 | **¥2,028** | **¥3,595** |

   差は **+¥1,567**。Neokyo の総額は 12,898 → **14,465** となり、
   **FROM JAPAN(13,548)・Buyee(13,848)・ZenMarket(14,069) に抜かれて 1位 → 4位**。
   `fees.md` は「Neokyo の1位は国内送料の仮定で作られている」と書いたが、
   **米国宛では配送方法の選択だけでも1位が消える。**

### G3. 為替が最大 11.9% ずれている。`RATES_AS_OF` は今日の日付だが値は今日のものではない

`src/lib/pricing/rates.ts` の値と、同日 2026-09-06 00:02 UTC の実勢（[exchangerate-api](https://open.er-api.com/v6/latest/JPY)、取得成功）：

| 通貨 | 実装（円/1通貨） | 実勢 | ずれ |
|---|---:|---:|---:|
| USD | 150 | 156.18 | **−4.0%** |
| GBP | 190 | 211.10 | **−10.0%** |
| EUR | 163 | 181.42 | **−10.2%** |
| AUD | 99 | 112.41 | **−11.9%** |
| CAD | 110 | 112.96 | −2.6% |
| SGD | 116 | 123.32 | **−5.9%** |

コメントは「実装日に公表仲値から転記し asOf を更新すること」と書き、`RATES_AS_OF = '2026-09-06'`（＝今日）と
主張している。**値は今日の仲値ではない。転記されていない日付だけが今日になっている。**
Neokyo 自身のフッターの表示（"100 Yen = US$ 0.64" → ¥156.25/USD、取得成功）とも合わない。

**効き方は2つある。**

**(a) 画面の現地通貨表示が過大**。`RankBoard.tsx:162` は `foreign(total, code, rate)` = `yen / rate` を
そのまま見出しの下に出す。レートが小さいほど数字は大きくなる。
英国利用者の基準ケース（¥13,510）は `≈ £71` と出るが、実勢では `≈ £64`。**11% 過大**。

**(b) 免税限度の判定境界がずれる**（`compare.ts:53` `declared = baseYen / rate`）。

| 国 | 限度 | 実装の境界 | 実勢の境界 | ずれ幅 |
|---|---|---:|---:|---:|
| GB | £135 | ¥25,650 | ¥28,499 | **¥2,849** |
| DE/FR | €150 | ¥24,450 | ¥27,213 | **¥2,763** |
| AU | A$1,000 | ¥99,000 | ¥112,410 | **¥13,410** |
| SG | S$400 | ¥46,400 | ¥49,328 | **¥2,928** |
| CA | C$20 | ¥2,200 | ¥2,259 | ¥59 |

SG は限度以下なら GST ¥0、超えると CIF の 9%。**¥46,400〜¥49,328 の帯で、実装だけが約 ¥4,200 の GST を課す。**
DE/FR は `logic.md` L2 の「¥1 高い商品のほうが ¥580 安い」という非単調点そのものが、
本来の位置より **約 ¥2,100 手前**に置かれている。

**監視の穴**: `scripts/fees-check.ts` は各社の料金ページ・EMS 料金表・各国税ページのハッシュしか見ない。
**為替は監視対象に入っていない。**`RATES_AS_OF` が古くなっても誰も気づかない。

### G4. EMS 料金表は27段ではなく42段。15kg 超の料金は同じページに載っている

`ems.ts` の見出しコメントは現在も **「EMS 日本発（日本郵便 公表料金、全27段）」** と書いている。
`emsStepIndex` のコメントは監査中に書き換えられたが、変更前はこうだった：

> /** 重量から段の添字を引く。15kg 超は最上段に丸める（**EMS の受付上限が 30kg で、
>  *  そこから先は国別に段が分かれるため、この表では持たない**）。 */

変更後（現在）：

> /** 重量から段の添字を引く。**表の外なら -1 を返す。**
>  *  以前は最上段に丸めていたが、20kg を 15kg の料金で出すことになり、
>  *  「持っていない数字を安い側に丸めて見せる」ことになっていた。 */

**どちらのバージョンも「表に無い」を前提にしている。前提そのものが誤りである。**

`EMS_SOURCE_URL` が指す [その表](https://www.post.japanpost.jp/send/oversea/charge/list-ems/all.html)（取得成功 200）を
実際にパースした結果：**段は 42。上限は 30,000g。国別に分かれてなどいない。同じ5地帯の同じ表である。**

```
official steps: 42   max g: 30000
impl steps: 27
mismatches in first 27: 0          ← 実装の27段は公表値と完全一致（初めて突合した）
official rows beyond impl:
 [16000, 15400, 19350, 36100, 41500, 44100]
 [20000, 18600, 23350, 44500, 51100, 53700]
 [25000, 22600, 28350, 55000, 63100, 65700]
 [30000, 26600, 33350, 65500, 75100, 77700]
 （ほか 16〜30kg の全11段）
```

**(a) 変更前の挙動（`logic.md` L3 が指摘したもの）の過小額**（第4地帯＝米国）：

| 梱包後重量 | 旧実装 | 公表 | 過小 |
|---:|---:|---:|---:|
| 15,000 g | 39,100 | 39,100 | 0 |
| 20,000 g | 39,100 | **51,100** | **−¥12,000（−23%）** |
| 25,000 g | 39,100 | **63,100** | **−¥24,000（−38%）** |
| 30,000 g | 39,100 | **75,100** | **−¥36,000（−48%）** |
| 30,000 g 超 | 39,100 | **引受不可** | 送れない荷物に総額が出る |

**(b) 現在のツリー（監査中に加えられた修正）はもっと悪い。**

修正は「丸めずに null を返し、その行を `comparable: false` にして順位から外す」というもの。
画面に出る文言は：

```
zone 4, over 15 kg — no published rate
Japan Post publishes no EMS rate above 15 kg in our table,
so this total is missing its largest line
```

**「Japan Post publishes no EMS rate above 15 kg」は事実に反する。**
`EMS_SOURCE_URL` が指すその表に、16〜30kg の11段が載っている（上の突合結果）。
持っていないのは日本郵便ではなく我々である。**一次情報について誤った断定を画面に出している。**

さらに、`rank()` が「比べられない行を末尾に回す」ようになった結果、
**個口を分割する行だけが表の内側に残り、1位に出る。**実測：

```
## 5 items x 3000g -> US   gross(consolidated)=18300
  rank1 Buyee, default      total=96388  ems=63500  comparable=true
  rank2 Neokyo              total=23078  ems=null   comparable=false
  rank3 FROM JAPAN          total=25778  ems=null   comparable=false
  rank4 ZenMarket           total=27112  ems=null   comparable=false
  rank5 Buyee, consolidated total=27278  ems=null   comparable=false
  rank6 Jauce               total=29105  ems=null   comparable=false
```

分割すると1個口が 3,900g に収まるので表の内側に入り、同梱すると 18,300g で表の外に出る。
**このツールで最も高い行（¥96,388）が唯一の「1位」として提示される。**

公表料金（18kg 段・第4地帯 = ¥46,300）を入れれば：

| | 総額 |
|---|---:|
| Neokyo（同梱） | 23,078 + 46,300 = **¥69,378** ← 本当の1位 |
| Buyee, default（5個口） | **¥96,388** |
| 差 | **¥27,010** |

**現在の画面は、正しい1位より ¥27,010 高い選択肢を1位として推している。**

しかもこのケースは **DESIGN-NOTES §1 が自分の根拠として挙げている例**
（5点 × ¥3,000、3,000 g/点 → ¥62,178）そのものである。
`compare.test.ts` の `3000 g per item → ¥62178` は現在 **失敗している**：

```
$ npx vitest run
 Test Files  1 failed | 6 passed (7)
      Tests  16 failed | 158 passed (174)
 FAIL src/lib/pricing/compare.test.ts > verified totals — 5 items x ¥3,000 to the US > 3000 g per item → ¥62178
 FAIL ... > every country ranks the same way > {US,GB,DE,FR,AU,CA,SG}: Neokyo cheapest, Buyee default last
 FAIL ... > paid domestic shipping: Neokyo wins everywhere on the grid
```

**7カ国すべての「Neokyo が最安・Buyee default が最下位」テストが落ちている。**
`logic.md` が「174 tests 全て通る」と書いた状態から、この修正で 16 件が赤になった。

**(c) 監査を書いている最中に、この誤りがテストと設計文書に固定された。**

私が (b) を書いた直後、`compare.test.ts` と `docs/DESIGN-NOTES.md` が更新され、
`npx vitest run` は **181 passed** に戻った。**挙動は直っていない。**上の実測は今も同じ値を返す。
テストのほうが挙動に合わせて書き換えられた：

```ts
// src/lib/pricing/compare.test.ts（現在）
test.each(COUNTRIES_ALL)(
  '%s: **above the published EMS table the comparison stops, it does not silently flip**',
  (cc) => {
    const r = compare({ items: items(5, 3000), country: cc });
    ...
    // 注文ごとに分ける Buyee default だけが表の範囲に収まる。
    const top = r.rows.find((row) => row.comparable)!;
    expect(top.label).toBe('Buyee, default');   // ← 最も高い行が1位であることを7カ国で固定した
  },
);
```

`docs/DESIGN-NOTES.md` も同じ向きに書き換えられた：

> 1個口にまとめる4社は国際送料を出せず、注文ごとに分ける Buyee default だけが表の
> 範囲に収まって唯一の比較可能な選択肢として残る。

**「表の範囲」は日本郵便の範囲ではなく、我々が転記した27段の範囲である。**
18.3kg の EMS 料金は第4地帯 **¥46,300**（18kg 段）として公表されている。
設計文書とテストが、**転記漏れを制度の性質として記述してしまった。**

`rankStable` の主張も同時に `5x` → `3x` に引き下げられた（`compare.ts:337` `[1/3, 3]`）。
`logic.md` L5 の「5倍で成立しない」への対処が、
**成立する範囲を測り直して主張を狭める**という形で行われている。これ自体は誠実だが、
狭めた理由（Neokyo の梱包 ¥150/kg が支配的になる 4.76kg/5.96kg の閾値）は
画面にも文書にも書かれていない。

**評価**: `logic.md` L3 の指摘（安い側に丸めるな）は正しい。だが対処が
「持っていないと言う」であって「取りに行く」ではなかった。
**料金は同じ URL の同じ表にある。**15段を転記すれば、丸めも null も
「Buyee default が唯一の選択肢」という結論も要らない。
UI の重量欄に `20000` と打てば到達する経路である。

### G5. 個口分割の実務：分割の罰は EMS 固定が作っている

実装の「Buyee, default は +¥8,765」という最大の順位差は、EMS の段の非線形性から出ている。
配送方法を変えると**符号が反転する**。

3点 × 500g（各個口 900g、同梱時 2,100g）、米国宛：

| 方式 | 分割3個口 | 同梱1個口 | 分割の罰 |
|---|---:|---:|---:|
| **EMS（実装）** | 3 × 5,020 = **15,060** | **9,100** | **+5,960** |
| 小形包装物 航空 | 3 × 2,510 = **7,530** | **2,100g > 2kg で使用不可** | — |
| 小形包装物 ＋ 同梱は国際小包航空 | **7,530** | **9,200** | **−1,670（分割のほうが安い）** |
| 国際小包 船便 | 3 × 2,600 = 7,800 | 4,000 | +3,800 |

`compare()` の実測（3点 ¥5,000 / 500g / US）：

```
3 Buyee, consolidated  total=32778  ems=9100   parcels=1
6 Buyee, default       total=41543  ems=15060  parcels=3     差 +8,765
```

EMS を小形包装物（分割側）／国際小包航空（同梱側）に置き換えると、
consolidated 32,878 / default 33,863 で **差は +985**。米国の通関手数料
（$9.35 × 個口、G2 のとおり DDP 経路では発生しない疑いがある）を外すと **default が ¥1,820 安くなる。**

**「Buyee だけが注文ごとに別送するので不利」という、このツールで最も大きな順位差が、
EMS を選んだ場合にのみ成立する。**

### G6. 保険・補償が総額にも任意費目にも無い（社ごとに構造が違う）

いずれも原文で確認（2026-09-06）。

| 社 | 保険・補償 | 実装 |
|---|---|---|
| Neokyo | 「The insurance cost is included in the shipping price」。ただし **EMS: 内容品 ¥20,000 までは無料、以降 ¥20,000 ごとに ¥50**。**船便: ¥6,000 まで無料、以降 400 + ¥50/¥20,000** | 無し |
| Jauce | **「A fee of JPY 250/kg is required for methods other than EMS of Japan Post.」** ＋ Premium Insurance 総額の 1.9% | 無し |
| Buyee | 保証プラン4種（Standard ¥500/注文 推奨・Insured ¥500・Inspection ¥300・Lite ¥0）。**「if the package is shipped as Small Packet (without Tracking), non-delivery or loss will not be covered by Standard Plan or Insured Delivery Plan」**、**「You may not be able to select surface mail when selecting a delivery method」** | 無し（`fees.md` が欠落として指摘済み） |
| FROM JAPAN | Product Protection Plan が必須（¥500/点）。`help_logistics_410`「Items shipped via small packet are **not covered by insurance**」 | プラン料は総額に入っている。任意欄に二重計上（`fees.md` 指摘済み） |

**新しい指摘は Jauce の ¥250/kg**。これは「EMS 以外を選ぶと Jauce だけが払う」費用で、
**配送方法の選択と順位が結びつく唯一の明示的な数字**である。
基準ケースを小形包装物に切り替えると全社が −¥2,560 動くが、Jauce だけ +¥250（入金手数料 gross-up 後 +¥260）乗るので、
ZenMarket との差は **¥529 → ¥778（+47%）** に開く。
**画面の主役である「差額」が、配送方法を変えるだけで5割動く。**

### G7. 支払い方法・請求通貨の差（各社が別々のレートで請求する）

Buyee 原文（[payment](https://buyee.jp/helpcenter/guide/payment?lang=en) 取得成功）：

> The currency of your payments will be determined by **the country of your PayPal account**.
> The currency of your payments will be determined by **the country of issue of your credit card**.

つまり **Buyee は利用者の現地通貨で請求する**。Neokyo は「All transactions on Neokyo are made in Yen」
（`fees.md` が引用済み）で、換算は PayPal 側。ZenMarket は入金手数料 3.5%、Jauce は ¥40 + 3.9%。

**このツールは円建て総額で順位を付けるが、5社は同じ円額を別々のレートで請求する。**
カードの外貨手数料 2〜4% は総額 ¥13,000 で **¥260〜520**。1位と2位の差 ¥650 と同じ桁である。
`taxes.md` は「為替スプレッド」を横断表に1行だけ挙げたが、
**それが社ごとに違う（＝順位に効く）ことは書いていない。**

コンビニ払いは Neokyo ¥1,000 / FROM JAPAN ¥1,000 が任意欄にある。Buyee・ZenMarket・Jauce は未取得。

### G8. 会員プラン（未検証のまま残っている）

- FROM JAPAN: Green / Gold / Platinum / Black の会員ランクで国際送料が %OFF（`fees.md` が指摘済み。率は配信ファイルから読めない）
- Buyee: BuyeePASS は Buyee Air Delivery Taiwan 専用（`fees.md` が確認済み・対応7カ国に該当なし）
- Neokyo / ZenMarket / Jauce: **取得できなかった。**Neokyo の fees / FAQ / shipping の3ページに有料会員の記載は無かったが、
  「無い」と断定できる文も見つからなかった。ZenMarket は 403。

### G9. 禁制品・数量制限で「そもそも送れない」組み合わせ

`taxes.md` が酒について指摘済み。**それより広い。**各社の原文（全て 2026-09-06）：

- Buyee FedEx 不可: Nintendo Switch / 骨董品 / 食品（サプリ含む）/ 食器 / 中古マフラー / 刃物 / 武器・甲冑類
- Buyee DHL 不可: タイヤ / 車のライト / 武器・甲冑類。ベトナム・ロシア・ウクライナ・ベラルーシ宛不可
- Buyee ECMS: **総額 ¥200,000 以上不可**、¥500 未満の品を含む荷物不可、酒・食品不可、リチウム不可
- Neokyo 制限: 刃物 / リチウム電池 / タイヤ・ガスカートリッジ / 帯磁物（アンプ等）/ モーター
- Neokyo: **「All packages with a value exceeding 100,000 yen may be required to ship via FedEx, DHL, or UPS」**（＝高額品は EMS を選べない）
- FROM JAPAN 制限（`help_logistics_1020-1161`）: 貴金属・宝石 / ロウソク / 石油ストーブ / 玩具銃 / スピーカー / カイロ / 電球・LED / 電池入り / 車部品 / タイヤ / トナー / インク / 化学品 / 酒
- FROM JAPAN: **小形包装物は Charge 1 が ¥30,000 未満のときのみ**、ePacket Light は ¥10,000 未満のみ
- 小形包装物（日本郵便）: 最大 2kg・最大辺 60cm・3辺計 90cm・**内容品価格 ¥200,000 まで**

`grep -rn "prohibited\|shippable\|restricted\|dangerous\|lithium\|hazmat" src/` → **0件**。
`taxes.md` は酒だけを見て「docs に書いてあることと動くコードが乖離」と書いたが、
**リチウム電池を含む出品（ワイヤレスイヤホン・モバイルバッテリー・電池入り玩具）のほうが件数はずっと多い。**

### G10. 寸法（容積重量）と個口の物理制約が無い

- ECMS: **「Maximum volumetric weight: 30kg … Volumetric weight = Length × Width × Height ÷ 5,000」**（Buyee 原文）
- FedEx / DHL / UPS も容積重量で課金する
- EMS: 最大辺 1.5m・長さ＋胴回り 3.0m（Buyee・Jauce とも原文で確認）
- 小形包装物: 最大辺 60cm・3辺計 90cm
- **Neokyo: 米国・メキシコ・スペイン・ブラジル・韓国宛は 105cm / 200cm / 20kg**（原文）
  → **米国宛の実効上限は 30kg ではなく 20kg。**G4 の「30kg まで段がある」より手前で切れる

実装は `grossG = 実重量 × 1.2 + 300g` の1次元しか持たない。
**フィギュアの箱・ぬいぐるみ・衣装は実重量より容積が効く**（`src/data/weights.ts` の対象カテゴリそのもの）。
容積重量が支配的な荷物では、宅配便の見積りは実重量ベースの EMS 換算と桁で外れる。

### G11. 時間軸：オークションの落札価格は事後に決まる。実装はそれを知りながら使っていない

`src/lib/search/sites.ts:9` に型がある：

```ts
/** オークションか固定価格か。オークションは落札価格が事後に決まる。 */
kind: 'auction' | 'fixed';
```

`grep -rn "\.kind" src/ | grep -v "kind:"` → **0件。この欄はどこからも読まれていない。**
`yahoo-auctions` の出品を追加すると、`priceTier: 'fixed'`（`SearchBox.tsx:38`）で
**現在価格が確定価格として総額に入る。**

これは Jauce にとって特に効く。Jauce だけが従価型（落札価格の 8%）なので、
現在価格 ¥5,000 の出品が ¥15,000 で落札されれば Jauce の手数料だけ +¥800 増える。
実装は「¥5,000 の 8% = ¥400」を確定値の色で出す。

さらに Jauce の原文（[japan_auction_detail](https://www.jauce.com/japan_auction_detail)）：

> Domestic delivery fee: … **We may switch to a shipping method with insurance even if the auction
> listing states "free shipping" or specifies a method without insurance, and an actual shipping fee will apply.**

**DESIGN-NOTES §1 は「唯一の逆転条件は送料込み」「これは推定ではなく出品ページの `chargeForShipping` から確定できる」と
書いているが、Jauce は送料込み出品でも国内送料を実費で取りうると明記している。**
「確定できる」という主張が、少なくとも1社について一次情報で否定されている。

### G12. 返品・キャンセル時の費用

- Neokyo（[FAQ](https://neokyo.com/en/faq) 200）: **「Cancellation is strictly forbidden」**。
  「What happens if my package is returned to Japan?」の項があり、返送された荷物の再送料は利用者負担
- FROM JAPAN（`special_order_140`）: 「After Charge 1 is paid, we cannot make a cancellation, return, or claim to the seller.」
  廃棄費用 `help_fee_1460`: **Standard disposal $5.00 / 点**
- Neokyo（原文）: 「If you wish to modify a package content (and the package has been already prepared),
  **packing fee shall be applied again in the form of a new invoice.**」
- FROM JAPAN `help_logistics_140`: 発送指示の変更・取消には **¥1,500 以上の再梱包料**
- Buyee 保証プラン: 「International shipping charges and bulk packaging service charges are **non-refundable**」
  「**Customs duty is not refundable**」

いずれも「発生すれば大きいが確率が読めない」費目。総額に入れる性質ではないが、
`Row.optionalLines`（「これを選ぶと +¥1,500」）に並べる価値はある。**現在1件も無い。**

### G13. 保管料の非対称（`fees.md` の指摘の補強）

`fees.md` が「発送が早ければ0」として軽微に分類した。**分類が甘い。**
このツールの想定利用者はオークションの落札を待って同梱するので、滞留は例外ではなく既定である。
Buyee は無料30日で5社中最短、以降 **日割 ¥100〜300/日**（`fees.md` が取得済み）。
3点を別々の週に落札して同梱するだけで、最初の1点が 30日を超えることは普通に起きる。
そして **同梱は Buyee の default（分割）を consolidated（同梱）に変える唯一の手段**なので、
「同梱すると保管料が付く」という関係が、順位表の最大の差（G5）と直結している。

### G14. 実装が「published rate」と書いているが、その根拠は4社で assumed

`compare.ts:210-214`（監査中の変更後の現在の姿）：

```ts
lines.push(L('ems', `EMS to ${COUNTRIES[ctx.cc].name}`, emsYen,
  `zone ${zone}, ${stepLabel}`
  + (overMax ? '' : svc.emsMarkup === 0 ? ', published rate' : `, +${...}% markup`),
  overMax ? 'none' : 'estimate', EMS_SOURCE_URL));
```

表の内側にある限り `emsMarkup === 0` なら無条件に **「published rate」** と書く。しかし
`emsMarkupTier` は Jauce のみ `'fixed'`（実測確認済み）で、
**Neokyo・ZenMarket・FROM JAPAN・Buyee は `'estimate'`（＝assumed）**。
`FeeTable.tsx:156` は「(assumed)」と正直に出しているのに、
**内訳の行は同じ数字を「published rate」と断言している。同じ数字に2つの確度が付いている。**

しかも Buyee の AIR Packet の原文は逆を言っている：

> The international shipping fees include Japan Post's official rates **and Buyee's shipping preparation fee**.

少なくとも1方式で **Buyee は上乗せしている**と自分で書いている。EMS についての明示は取れなかったが、
`emsMarkup: 0` は「確認した0」ではなく「未確認の0」であり、これは不変条件1（未取得を0と書くな）の
形を変えた違反である。

---

## 2. 「EMS 固定」は妥当か → **妥当でない。EMS はこの7カ国のどの重量帯でも最安ではない。**

日本郵便の公表料金を全て取得して突合した（[料金表一覧](https://www.post.japanpost.jp/int/charge/list/index.html)、
`list-normal/zone{2,3,4}.html`・`list-parcel/zone{2,3,4}.html`・`list-ems/all.html`、いずれも 200、2026-09-06）。

`grossG` 後の重量に対する、日本郵便の全方式の公表料金：

| 梱包後 | 宛先 | **EMS（実装）** | 小形包装物 航空 | 国際小包 航空 | 国際小包 SAL | 国際小包 船便 |
|---:|---|---:|---:|---:|---:|---:|
| 900 g | US | **5,020** | **2,510** | 4,200 | 2,900 | 2,600 |
| 900 g | GB/DE/FR/AU/CA | **4,150** | **1,950** | 3,850 | 2,800 | 2,500 |
| 900 g | SG | **2,900** | **1,340** | 2,500 | 2,300 | 2,100 |
| 1,500 g | US | **6,600** | **3,770** | 6,700 | 4,100 | 3,300 |
| 1,500 g | GB/DE/FR/AU/CA | **5,550** | **3,030** | 6,000 | 4,000 | 3,100 |
| 2,100 g | US | **9,100** | 2kg 超で不可 | 9,200 | 5,300 | **4,000** |
| 2,100 g | GB/DE/FR/AU/CA | **7,750** | 不可 | 8,150 | 5,200 | **3,700** |
| 3,900 g | US | **12,700** | 不可 | 11,700 | 6,500 | **4,700** |
| 3,900 g | GB/DE/FR/AU/CA | **10,900** | 不可 | 10,300 | 6,400 | **4,300** |
| 6,300 g | US | **19,900** | 不可 | 19,200 | 9,700 | **6,800** |
| 15,000 g | US | **39,100** | 不可 | 36,700 | 17,700 | **11,900** |

**読み取れること**

1. **EMS が最安になる重量帯は一つも無い。**「追跡付き航空」に限れば 1.0〜2.5kg で
   EMS が国際小包航空をわずかに下回る（US 1,500g で 6,600 < 6,700）が、
   **小形包装物（2kg まで）はその帯でも 43% 安い**（3,770 vs 6,600）。
2. **2kg 以下（このツールの主戦場：フィギュア1〜2体・CD・トレカ・書籍）では EMS が 1.9〜2.2 倍高い。**
   基準ケース 900g・米国宛の差は **¥2,510**。1位と2位の差 ¥650 の **3.9倍**。
3. 船便は全帯で EMS の 1/3〜1/4。SAL は Buyee が「currently suspended」と明記しているので現時点では選べない。
4. 実装が「Jauce の emsMarkup は実測で 0 を確認」としているのは、**EMS についてだけ**。
   他方式の上乗せは5社とも未確認。

**では順位は動くか。** 3種類の効き方がある。

**(a) 全社に同じ方式を当てると、1位は動かない（US）。**
EMS→小形包装物で全社 −¥2,560、順位は Neokyo → FROM JAPAN → Buyee → ZenMarket → Jauce のまま。
**この意味では DESIGN-NOTES §1 の「推定誤差は全社に等しく乗る」は成立している。**

**(b) しかし差額は動く。**Jauce だけが EMS 以外で ¥250/kg の保険料を払う（G6）ので、
ZenMarket との差は ¥529 → ¥778（**+47%**）。
画面の主役は総額ではなく差額（DESIGN-NOTES §1 の UI 結論）なのだから、これは主役が動いている。

**(c) 個口構造が変わると1位も動く。**G5 のとおり、Buyee default と consolidated の差は
**+¥8,765 → +¥985**、条件によっては **符号が反転**する。
さらに Jauce は日本郵便3方式しか持たず、Buyee は11方式・Neokyo は6方式を持つ（G1）。
**各社が到達できる最小総額は方式の品揃えで決まるので、「EMS 固定」は
社ごとに違う品揃えを全社同一に潰している。**これは推定誤差ではなく、比較軸の消去である。

**結論**

> **「EMS 固定」はこのツール最大の構造的仮定であり、そのとおりである。**
> 総額は 2kg 以下で ¥2,000〜2,600 過大、5kg 超で ¥5,000〜13,000 過大。
> 1位の顔ぶれは（同一方式を当てる限り）保たれるが、
> **差額は最大 47% 動き、Buyee の分割/同梱という最大の順位差は符号が反転する。**
> そして「どの方式を選べるか」自体が社ごとに違うので、
> **EMS 固定は「順位は総額のみで決まる」という約束を、比較軸を1本削ることで守っている。**

正直な選択肢は2つしかない：(i) 方式を利用者に選ばせて社ごとの品揃えを出す、
(ii) EMS 固定を続けるなら **画面に「EMS を選んだ場合の比較であり、各社はより安い方式を持つ」と明記する**。
現在の画面はどちらもしていない（`EMS to United States` という行ラベルはあるが、
それが5社共通の**仮定**であるとは書かれていない）。

---

## 3. 先行監査の弱い結論の指摘

| # | 監査 | 箇所 | 何が弱いか |
|---|---|---|---|
| **W1** | logic | L3「15kg 超を黙って 15kg 料金に丸める」 | 症状は正しいが、**`ems.ts` の「この表では持たない」という理由をそのまま受け入れている。**表は同じ URL に 30kg まである。**結果として、この指摘を受けた修正が「持っていない」と画面に書く方向に進み、最も高い行（¥96,388）が7カ国で1位に出る新しい誤りを生み、それがテストと DESIGN-NOTES に固定された（G4-b, G4-c）。**「合っていることの証拠を出せ」を、コードのコメントに対しては適用していない。**指摘の質ではなく、指摘の宛先を間違えた例である** |
| **W2** | logic | 「`npx vitest run` は 174 tests 全て通る（＝以下の誤りはどれも既存テストに引っかかっていない）」 | 監査時点では事実。**ただしテストが何を守っているかの検査が無い**。`compare.test.ts` は paysUs が順位に効かないことを検査しているが、**EMS 表と公表値の突合テストは無い**。私が突合するまで、実装の27段が公表値と一致するかは誰も確かめていなかった（結果は完全一致・G4）。**段の「数」を守るテストが無かったので、27段しか無いこと自体は誰にも検知されなかった** |
| **W3** | logic | 「§1 の総額の表は今も一致する」「実装の挙動は正直。古いのは DESIGN-NOTES のほう」 | 総額の一致は EMS を前提にした内部整合の確認にすぎない。**外部（日本郵便の公表料金）と突き合わせていない。**「正直」の対象が、比較対象を持たない数字になっている |
| **W4** | taxes | 「US の 12.5% は…扱う商品が主にフィギュアである限り当たっている」 | 品目（HTS）の議論としては丁寧。しかし**徴収の仕組みを見ていない**。2026-04 以降、$100 超の郵便物は Zonos 経由の DDP 事前納付が必須で、代行会社が FedEx を選べば Neokyo は 13.4% + ブローカー料を課す（G2）。**「税率が正しいか」の前に「誰がどう徴収するか」が制度ごと変わっている** |
| **W5** | taxes | USPS $9.35 を「一致。tier を unverified から上げてよい」 | **料額の一致と、その費目が発生するかは別。**同じ監査が §9 で「立替手数料を税が発生したか見ずに常に課している」と自分で指摘しているのに、§1 の判定は「一致」のまま。DDP 経路では発生しない疑いが強い（G2）。**tier を上げる提案は撤回されるべき** |
| **W6** | taxes | 「実装に無い費用カテゴリ（横断）」に「為替スプレッド 2〜4%」を1行 | **社ごとに請求通貨と換算主体が違うことを見ていない**（Buyee は現地通貨請求、Neokyo は円建て、ZenMarket は 3.5% 入金手数料、Jauce は ¥40+3.9%）。総額 ¥13,000 で ¥260〜520＝1位と2位の差と同じ桁（G7）。「横断＝全社同じ」という前提が誤り |
| **W7** | taxes | §7「禁制品・数量制限」を酒だけで代表させている | リチウム電池・刃物・貴金属・スピーカー・帯磁物・タイヤなど、各社が明示的に列挙している制限品目のほうが件数が多い（G9）。しかも **FedEx で送れない品目と DHL で送れない品目が違う**ので、「送れない」は国だけでなく方式の関数である |
| **W8** | fees | ZenMarket 列を「未検証」と正しく書いた | 判定は正しい。ただし**「未検証」で止まっており、実装をどう扱うべきかの提案が無い。**`primarySource: true` のまま画面に実線で出ている（`FeeTable.tsx:182`）。一次情報が1つも取れていない社の列見出しが実線であることは、`services.ts` の定義（「料金の出所が一次情報か。false なら破線」）に照らして誤り |
| **W9** | fees | Jauce の `sourceUrl` 404 を「監視の穴」として最下位（#15）に置いた | **順位が低すぎる。**同じ穴が米国の引受停止（2025-08〜2026-04）を検知しなかった穴でもある。`fees-check.ts` は料金ページのハッシュしか見ないので、**料金が変わらずに「送れなくなる」変化は原理的に検知できない**（G2・G3・監視対象に為替も条件表も無い） |
| **W10** | fees / taxes 共通 | 両方が「Neokyo が1位」を前提に影響額を計算している | Neokyo が1位なのは EMS 固定・米国の課税を12.5%+$9.35 とした場合に限る。G2 の FedEx/DDP 経路では Neokyo は 4位（12,898 → 14,465）。**先行監査の影響額表の基準行そのものが、検証されていない前提の上に立っている** |

---

## 4. 不変条件の再検査（grep 出力つき）

### 不変条件2「順位は総額のみ。報酬額（paysUs）を参照しない」→ **守られている**

```
$ grep -n "paysUs" src/lib/pricing/compare.ts
255:    paysUs: svc.paysUs,
270:/** 総額の昇順で順位を付ける。**報酬額（paysUs）は一切参照しない。** */

$ sed -n '271,278p' src/lib/pricing/compare.ts
function rank(rows: Row[]): Row[] {
  const sorted = [...rows].sort(
    (a, b) => a.total - b.total || a.serviceName.localeCompare(b.serviceName));
  const low = sorted[0]?.total ?? 0;
  return sorted.map((r, i) => ({
    ...r, rank: i + 1, diff: r.total - low, cheapest: r.total === low,
  }));
}
```

`rank()` は `total` とサービス名しか見ない。表示側（`RankBoard.tsx:100,123`）は `paysUs` を
`rel="sponsored"` の切り替えにだけ使い、並び・強調には使っていない。
`SiteFooter.tsx` と `privacy/page.tsx` は開示のために列挙しているだけ。**問題なし。**

監査中に加えられた変更で `rank()` は `comparable` で2群に分けるようになったが、
**`comparable` は `emsYen != null` だけで決まり、`paysUs` は依然として参照されていない。**
不変条件2は変更後も守られている。

**ただし一点。**同額のときのタイブレークが `serviceName.localeCompare` なので、
アルファベット順（Buyee < FROM JAPAN < Jauce < Neokyo < ZenMarket）で決まる。
偶然だが **報酬を払う Buyee が、払わない Neokyo・Jauce より上に来る**向きである。
`logic.md` C8 は「同額に到達する入力を見つけられなかったので未検証」としている。
私も見つけていない。**恣意的なタイブレークが報酬を払う側に有利な向きである、という事実だけ記録する。**

### 不変条件3「LLM を実行時に使わない。全て決定的な計算」→ **守られている**

```
$ grep -rniE "openai|anthropic|claude|gpt|llm|gemini" src/ --include=*.ts --include=*.tsx
src/lib/search/product.ts:7:// 価格の抽出は決定的にやる。LLM は使わない。
src/lib/search/product.test.ts:72:  // 駿河屋がこの形。ClaudeBot / GPTBot は名指しで禁止だが `*` は Allow: /。
src/lib/search/product.test.ts:73:  const txt = 'User-agent: ClaudeBot\nDisallow: /\n\nUser-agent: *\nAllow: /';
src/lib/search/product.test.ts:104: const txt = 'User-agent: GPTBot\nDisallow: /item/\n\nUser-agent: *\nDisallow: /admin';

$ grep -rn "fetch(" src/lib src/app --include=*.ts --include=*.tsx | grep -v test
src/lib/search/product.ts:251:      res = await fetch(current, {
src/lib/search/brave.ts:61:    const r = await fetch(url, {
```

実行時の外部呼び出しは Brave 検索と出品ページ取得の2つだけ。
`src/lib/pricing/` は**外部呼び出しをまったく持たない**。**問題なし。**

### 不変条件1「未取得は 0 ではなく null、画面では『—』」→ **3箇所で破られている**

**(1) `logic.md` L1 が指摘済み**: `domesticIncluded` の社で「¥0 と表示した金額を裏で課税」。

**(2) 新規：`emsMarkup: 0` は「確認した0」ではなく「未確認の0」**（G14）。
`emsMarkupTier` が `'estimate'` の4社について、内訳行は「published rate」と断言する。

```
$ grep -n "emsMarkupTier" src/lib/pricing/services.ts
 93:    emsMarkupTier: 'estimate',   ← Neokyo
122:    emsMarkupTier: 'estimate',   ← ZenMarket
152:    emsMarkupTier: 'estimate',   ← FROM JAPAN
179:    emsMarkupTier: 'estimate',   ← Buyee
216:    emsMarkupTier: 'fixed',      ← Jauce のみ

$ sed -n '210,214p' src/lib/pricing/compare.ts
  lines.push(L('ems', `EMS to ${COUNTRIES[ctx.cc].name}`, emsYen,
    `zone ${zone}, ${stepLabel}`
    + (overMax ? '' : svc.emsMarkup === 0 ? ', published rate' : `, +${(svc.emsMarkup * 100).toFixed(0)}% markup`),
    overMax ? 'none' : 'estimate', EMS_SOURCE_URL));

$ grep -n "emsMarkupTier" src/lib/pricing/compare.ts
（0件 — compare.ts はこの tier を一度も読まない）
```

**(3) 新規：`packing: null` と `deposit: null` が「無料」と「未取得」を区別できない。**

```
$ grep -n "packing: null\|deposit: null" src/lib/pricing/services.ts
110:    domesticIncluded: false,      ← ZenMarket … 117: packing: null
117:    packing: null,                ← ZenMarket（fees.md いわく「無料である証拠が無い」）
147:    packing: null,                ← FROM JAPAN
172:    packing: null,                ← Buyee
 87:    deposit: null,                ← Neokyo
146:    deposit: null,                ← FROM JAPAN
171:    deposit: null,                ← Buyee
```

`packingLine()` は `if (!svc.packing) return null;` で **行を出さない**。
利用者から見れば「梱包料の欄が無い＝掛からない」であって、「未取得」とは読めない。
`Line.amount = null` なら `excluded[]` に載り「excl. packing」と出るのに、
`svc.packing = null` は `excluded[]` にすら載らない。
**型が「未取得の梱包料」を表現できない。**`Country.clearanceFeePerParcel: number | null` は
きちんと「null = 未取得」と書いて「—」を出しているのに、`Service.packing` にはその区別が無い。
不変条件1の趣旨（0 と書くな）が、**サービス側の型では実現されていない。**

### 不変条件4「一次情報と二次情報を型（tier）で区別する。推測で埋めない」→ **部分的に破られている**

**(1) EMS 行の `tier` がハードコードで `'estimate'`**（`compare.ts:213`）。
EMS 料金そのものは日本郵便の公表値＝一次情報で、私の突合でも27段完全一致（G4）。
推定なのは**重量**であって料金ではない。2つを1つの tier に潰したため、
`logic.md` C4 のとおり `approximate` が**常に true** になり、画面の `~` は情報を持たない。

**(2) `primarySource: true` が5社全部に付いている。**

```
$ grep -n "primarySource" src/lib/pricing/services.ts
 84:    primarySource: true,   ← Neokyo
107:    primarySource: true,   ← ZenMarket ← 一次情報が1件も取れていない（fees.md）
136:    primarySource: true,   ← FROM JAPAN
168:    primarySource: true,   ← Buyee
193:    primarySource: true,   ← Jauce ← sourceUrl が 404（fees.md）
```

`services.ts:55` のコメントは「料金の出所が一次情報か。**false なら画面の列見出しを破線にする**」。
ZenMarket は公式ページが1つも取れず、Jauce は `sourceUrl` が 404。
**この2社の列見出しが実線で出ているのは、tier による区別の放棄である。**
`fees.md` はこれを指摘していない（W8）。

**(3) `Site.kind` が宣言されているのに一度も読まれない。**

```
$ grep -rn "\.kind" src/ --include=*.ts --include=*.tsx | grep -v "kind:"
（0件）
```

「オークションは落札価格が事後に決まる」と型のコメントに書きながら、
オークションの現在価格を `priceTier: 'fixed'` で確定値として扱う（G11）。
**「推測で埋めるな」の逆で、「事後に決まる値を確定値として埋めている。」**

**(4) 「送れるか」を表す型が存在しない。**

```
$ grep -rn "prohibited\|shippable\|restricted\|dangerous\|lithium\|hazmat" src/lib src/app src/components --include=*.ts --include=*.tsx | wc -l
0
```

`taxes.md` が酒について同じ grep を出しているが、対象を広げても 0 件（G9）。

---

## 5. 取れなかった一次情報

| 項目 | 理由 |
|---|---|
| ZenMarket の一切のページ | Cloudflare 403（`fees.md` と同じ。再試行しても同じ）。**配送方式・会員プラン・保険のいずれも未取得** |
| Zonos の1件あたり利用料の額 | Zonos 公式ドキュメントに額の記載が無い（"vary by post … visible in your Zonos Dashboard"）。**日本郵便の PDF も「Zonos 社が定める利用料金がかかります」までしか書かない** |
| Neokyo / Jauce の有料会員の有無 | fees / FAQ / shipping の3ページに記載が無かった。「無い」と断定できる文も無い |
| Buyee の EMS 上乗せ額 | 「Buyee's shipping preparation fee」が AIR Packet の説明にだけあり、EMS についての明示は見つからなかった |
| 日本郵便 国際郵便条件表（国別の引受可否・上限重量） | `overview.html` は条件表 PDF へのリンクのみで、本文を取得できなかった。**Neokyo の「米国宛 20kg」は Neokyo 側の記載で裏を取った** |
| 各社の実際の見積り額（EMS 以外） | ログインが必要な見積りツールのため未取得。**上の比較表は日本郵便の公表料金であって、各社の請求額ではない** |
| ECMS / Buyee Air Delivery の料金 | 同上 |

---

## 6. 総額・順位への影響が大きい順（まとめ）

基準ケース（1点 ¥5,000 / 500g / 米国、Neokyo 12,898・1位2位差 ¥650）。

| # | 見落とし | 向き | 額 | 順位を動かすか |
|---|---|---|---:|---|
| 1 | EMS 固定（小形包装物なら 2kg 以下で ¥2,510 → −¥2,560） | 過大 | **−¥2,560** | 1位は不動、**差額が最大 +47%**、Buyee 分割/同梱の差が符号反転 |
| 2 | 米国 DDP：Neokyo/FedEx は 13.4% + ¥150 + ブローカー $15 + 品目行 $3.50 | 過小 | **+¥1,567** | **Neokyo が 1位 → 4位** |
| 3 | EMS 表が27段（公表は42段・30kg まで）。現ツリーは 15kg 超を `comparable: false` にする | 判定不能 | — | **5点×3,000g／米国で最も高い ¥96,388 の行が1位。正しい1位より +¥27,010。テスト 16 件が赤** |
| 4 | 為替 10〜12% 陳腐化（画面の現地通貨表示・免税限度の境界） | 表示は過大 / 税は帯依存 | **£表示 +11%**、SG 帯で **+¥4,200** | SG・DE/FR の境界帯で動く |
| 5 | Zonos 利用料（米国 $100 超で必須、額不明） | 過小 | **不明（null にすべき）** | 全社同額なら不動 |
| 6 | Jauce の非EMS保険 ¥250/kg | 方式依存 | +¥250/kg | **ZenMarket との差が ¥529 → ¥778** |
| 7 | 請求通貨・カード外貨手数料が社ごとに違う | 過小 | ¥260〜520 | **1位2位差 ¥650 と同じ桁** |
| 8 | 容積重量・寸法制限（ECMS は L×W×H/5000、小形包装物 60/90cm、Neokyo 米国 105cm/20kg） | 過小 | かさ物で桁 | 方式が使えなくなる |
| 9 | 禁制品（リチウム・刃物・貴金属・スピーカー・帯磁物）。方式ごとに違う | 判定不能 | — | 送れない組合せに総額が出る |
| 10 | オークションの落札価格が事後に決まる（`Site.kind` 未使用） | 過小 | Jauce の 8% が全額連動 | 落札価格次第 |
| 11 | 保管料（Buyee 30日超 ¥100〜300/日）。同梱＝滞留なので既定で発生する | 過小 | ¥100〜300/日 | 同梱前提の3点カートで動きうる |
| 12 | 返品・キャンセル・再梱包（FJ ¥1,500〜・廃棄 $5/点・Neokyo は再梱包料の再請求） | 過小 | 発生時のみ | 総額外（任意欄に無い） |
| 13 | 会員プラン（FJ の国際送料 %OFF、他は未取得） | 過大 | 率不明 | 常連では動く |

---

## 7. 最後に

3つの先行監査は、いずれも**「実装が置いた前提の内側」を精密に検査している**。
費目・税率・境界値・NaN — どれも本物の欠陥を見つけている。

だがこのツールの主張は「日本の購入代行5社で、商品が利用者の国に届くまでの総額」である。
**その「届くまで」の経路を、5社が持つ6〜11通りの中から最も高い1つに固定したことが、
金額でも順位でも、3監査が挙げたどの欠陥より大きい。**

そして米国については、**2025年8月から2026年4月まで、その1つが存在しなかった。**
`services.ts` も `countries.ts` も `ems.ts` も、その8か月間、
存在しない配送手段の料金で総額を出し続ける形になっていた。
`scripts/fees-check.ts` はそれを検知できない。料金表は変わっていなかったからである。
