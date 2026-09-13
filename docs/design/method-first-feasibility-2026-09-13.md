# 「配送方法が主軸」の表（案C）は成立するか — 2026-09-13 調査

対象国: US GB DE FR AU CA SG（7カ国）。対象社: Buyee / ZenMarket / Neokyo / FROM JAPAN / Jauce（5社）。
コードは変更していない。調べたのは `src/lib/pricing/` と `master/` のみ。

## 1. 方式の母集合

エンジンは配送方式を型として2軸に分けている（`src/lib/pricing/types.ts`）。

- **`PostalMethod`（郵便、5種）**: `ems` / `small-packet-air` / `small-packet-surface` /
  `parcel-air` / `parcel-surface`。日本郵便が地帯別の公表料金表を持ち、通関経路が郵便のまま、
  実重量課金——という3条件を満たすものだけ（`postage.ts` 冒頭のコメント）。
- **`CourierMethod`（宅配便、17種）**: `courier-fedex` / `-economy` / `-priority` / `-lowcost` /
  `-connect-plus`、`courier-ups`、`courier-dhl` / `-green-plus` / `-express-1200` /
  `-express-worldwide`、`courier-sf-express`、`courier-ecms` / `-ecms-express`、
  `courier-buyee-air`、`courier-surface`（各社が「Surface」と自称する自社便。日本郵便の
  船便2方式とは別物）。ブランド名ではなく画面に出る「便名」ごとに ID を分けている
  （同じ「FedEx」でも便によって重量帯で順位が入れ替わるため、オーナー確定2026-09-12）。

`courier-surface` を除く16の宅配便IDのうち、実際に `Service.courier` に価格データが
入っている（=どこかの社に1件でも `weightPointsByCountry` がある）IDは16個全部。ただし後述の
とおり、**その全16個が「US以外のキーを一切持たない」**（§2）。

`shipping-methods.ts` の冒頭コメントは「価格を付けているのは EMS の1つだけ」と書いているが、
これは**古い**——`Service.courier`（宅配便の実測最終価格、`MeasuredPostageRate`）が
2026-09-12に配線されている。このファイル（`ALTERNATIVE_SHIPPING`）は「各社が売っている
方式一覧」の開示用途に残っているだけで、価格化の有無を表すものではない。

## 2. 被覆マトリクス（5社 × 7カ国 × 各方式）

### 郵便4〜5方式（`PostalMethod`）

各社の郵便方式の額は「日本郵便の公表料金表 + 社の上乗せ」という式（`MarkupPostageRate`）で
出るため、**国ごとに実測を集める必要がない**——上乗せの形（`markup`/`byCountry`）さえ
決まれば式が7カ国全部を計算する。実際、明示的な `unavailableIn` が付いている行だけが
「出せないセル」で、それ以外は式で7カ国とも出る。

`unavailableIn` の実例（コード確認済み・**(a) 提供していないと確認済み**）:
- Neokyo: EMS/Small packet/Parcel-air が `unavailableIn: ['US']`（米国向けは宅配便のみ）
- ZenMarket: 郵便方式が `unavailableIn: ['DE']`
- FROM JAPAN: 郵便5方式すべて `unavailableIn: ['US']`
- Buyee: 郵便4方式すべて `unavailableIn: ['US']`
- Jauce: 郵便方式の一部が `unavailableIn: ['US']`（EMSは米国にもある）

郵便側は式で埋まるため、空セルはほぼ全部 **(a)**。(b)/(c) はほぼ無い、というのが読み取れる
構造。ただしこれは「上乗せの式自体が正しい」という前提の上に立っている——式の確度
（`tier: 'fixed'|'estimate'`）は方式・社ごとに違う（§で下述）。

### 宅配便（`CourierMethod`）— ここが本題

`MeasuredPostageRate.weightPointsByCountry` は**「最終価格をそのまま持つ」構造**で、
式では埋まらない。国ごとに実測しない限り値が無い。

**コード（`src/lib/pricing/services.ts`）に配線済みの `weightPointsByCountry` は、
16個の宅配便エントリ全部が `US` のキーしか持っていない。** grep で確認した実際のキーは
すべて `US: [...]` のみで、GB/DE/FR/AU/CA/SGのキーはコード上に1つも無い。
`services.ts` 自身のコメントが明言している:「測ったのはUSのみ（P2 2、オーナー確定）
——他国へこの列を持ち越さない」。

つまり **5社×6宅配便方式（社によって異なる）×US = 価格化済み**、
**5社×宅配便方式×(GB/DE/FR/AU/CA/SGの6カ国) = コード上は全滅**。

ここが (b) か (c) かは `master/courier-rates.json` を見て判定する必要がある——
このファイルには US 以外の生データが実在するかもしれないから。確認した結果:

- `observations` キーに `..._six_countries_v2_2026_09_12`（zenmarket/fromjapan/neokyo/
  buyee/jauce の5社分）、`fromjapan_seven_countries_2026_09_13`、
  `jauce_v3_remeasurement_2026_09_13` など、**US以外の6カ国分の生の実測観測が
  master には確かに存在する。**
- しかし `MeasuredPostageRate.weightPointsByCountry` の型コメントは明言している:
  「US の列を GB 等に流用すると根拠のない数字になる」——つまり US 以外の観測が
  あっても、それを `services.ts` に転記する作業自体がまだ行われていない。

**したがって US 以外の宅配便セルは (b)（提供しているかもしれないが、我々がレートを
持っていない＝未配線）** と判定できる——(c)（提供の有無すら分からない）ではない。
生データは master に存在し、配線されていないだけ。ただしこれは「6カ国とも生データが
揃っている」という意味ではなく、社・国・方式の組み合わせごとに master 内の実測密度が
違う（例: DE は `zenmarket_de_full_2026_09_12` のように単独で厚みがあるが、他の
国×社の組はもっと薄い可能性がある——本調査では master 内の生データの**存在**は
確認したが、それが16方式×6カ国×5社の全セルを埋めるだけの密度かは確認していない
（**未確認**、行数の全数チェックはしていない）。

### 集計（概算・件数は方式定義の粒度に依存するため目安）

| 区分 | 内容 | 件数の性質 |
|---|---|---|
| (a) 提供していないと確認済み | 郵便方式の `unavailableIn` 指定＋宅配便の`unavailableIn`指定 | コードに明示。件数は少数（社×国の単位で二桁未満） |
| (b) 提供している可能性はあるが未配線 | 宅配便×GB/DE/FR/AU/CA/SG全部（16方式×6カ国×該当社） | **最大のブロック。ほぼ全セルがここ** |
| (c) 提供の有無も不明 | 母集合に無い組み合わせ（例: ある社がそもそも扱っていない便） | 個別に確認していない社×便の組がまだ残る（未確認、本調査では全数チェックしていない） |

**結論として、空セルの絶対多数は (b) であって (a) ではない。** 郵便側は式で埋まるので
(a) 中心、宅配便側は US 以外まるごと (b)。案Cの表を「方式×国×社」の粒度で作ろうとすると、
6/7 の国列で宅配便の行がほぼ空欄になる。

## 3. 重量依存

- **郵便方式**: 表そのものが重量段で切られている（`postageFor()` が段を引く）ため、
  重量依存は方式の定義そのものに組み込まれている。`maxGramsFor(method: PostalMethod, cc)`
  で上限も取れる。
- **宅配便**: `weightPointsByCountry` は11点（500/600/700/1000/1500/2000/2500/3000/
  5000/10000/20000g）の実測点を持ち、点と点の間は補間しない（下端＝直下の点、
  上端＝直上の点として区間で返す、`postage.ts` の `courierPriceFor`）。**重量依存の
  構造はある**——ただし US のみ。
- **CLAUDE.md §9 が記録している「宅配便の重量上限は `src/lib/pricing/` に存在しない」は
  コードで確認した限り事実。** `maxGramsFor()` のシグネチャは
  `maxGramsFor(method: PostalMethod, cc: CountryCode): number` で `CourierMethod` を
  受け付けない。`src/lib/pricing/` 全体を grep しても宅配便版の上限関数は無い。
  `master/carrier-weight-limits.json` に DHL/UPS/FedEx/ECMS の7カ国分の重量・寸法上限の
  一次情報収集**は存在する**が、そのファイル自身の `$schema_note` が明言している通り
  「本タスクは値を追加するだけで、`src/`配下の配線（`maxGramsFor`・`splitByWeightLimit`・
  `DimensionLimit`への接続）はスコープ外」——**配線ゼロ**。§9の記載は誇張ではなく
  コードの現状そのもの。

## 4. 商品価格依存の方式フィルタ

`src/lib/pricing/` 全体（`postage.ts`・`services.ts`・`compare.ts`）を grep したが、
商品価格（`priceYen`・`declaredYen`）を条件にして配送方式そのものを除外する処理は
**見つからなかった**。`50000`/`50,000` を含むコードは US の輸出申告関連の閾値
（`EXPORT_DECLARATION_FEE_THRESHOLD_JPY` 周辺）であって、方式フィルタとは無関係。

**結論: FROM JAPANで実測された「商品価格¥50,000超で最安3方式が消える」という価格依存
フィルタは、我々のエンジンに実装されていない。** `master/courier-rates.json` に
`fromjapan_price_scan` という観測キーがあり生データとしては記録されているが、
`services.ts`・`postage.ts`・`compare.ts` のどこにもこの条件分岐を実装したコードはない
（=これも grep で確認した事実であり、「たぶん無い」ではない）。他社に同種のフィルタが
あるかどうかは、少なくともこのフィルタを検査する専用ロジックがコード側に一切無いため
確認しようがない——**他社について調査した記録も見当たらない（未確認）**。

## 5. 所要日数

- **郵便方式（`PostalMethodSpec`, `postage.ts`）**: `days`（文字列, 例「a week or less」）・
  `tracked`（真偽値）・`daysSourceUrl`・`daysTier: Tier` を**構造化して**持つ。出典と確度が
  ある（例: EMS は `days: 'a week or less'`, `daysTier: 'fixed'`, 出典 neokyo.com）。
- **宅配便（`CourierMethodSpec`, `postage.ts` の `COURIER_METHODS`）**: 日数は
  `daysFromLabelRaw(rate.labelRaw)` という**ラベル文字列からの正規表現抽出**でしか
  出していない。`labelRaw` にたまたま `(2-5 days)` のような表記が含まれていれば拾えるが、
  含まれていなければ `'transit time not published'` に落ちる。**`tier`・`sourceUrl` に
  相当するフィールドは存在しない**——郵便方式のような構造化された確度・出典は無い。
  抽出元の `labelRaw` 自体は各社の実測（`master/courier-rates.json`）由来の文字列だが、
  「その日数表記がどの一次資料の言葉そのものか」を検査する仕組みはコードには無い。

**結論: 案Cが日数を主軸に据えるなら、郵便側は使えるが宅配便側は「出典も確度も無い
文字列抽出」しか無く、そのまま主軸には使えない。**

## 6. 現状の方式選択ロジック

- `compare.ts` の既定 `DEFAULT_METHOD` は `'cheapest'`（オーナー確定、以前はEMS固定だった）。
  `'cheapest'` は**行（社）ごとに、その条件で実際に運べる方式のうち最安を選ぶ**——
  郵便方式と価格化済みの宅配便方式の両方が候補に入る（`courier-surface` は候補から除外、
  1〜3か月かかるため常に `Row.surface` という別枠に回す）。「運べない」（重量超過・
  `unavailableIn`）方式は候補から外れる。
- 利用者が `method` を明示指定すれば、その方式固定で計算する（`MethodPicker.tsx` の
  select）。`MethodPicker` は額を表示しない設計——額は個口数などで社ごとに変わるため、
  一覧には**日数と追跡の有無**だけを出す。宅配便は `courierMethodAvailable(id, cc)` で
  「その国でその便が価格化されているか」を判定し、未測定の国では選べないようにする
  （消さずに理由付きで無効化）。

## 結論

**判定: 成立しない。**

被覆マトリクスの実体は、郵便側（式で7カ国が埋まる。空セルはほぼ (a)）と、
宅配便側（US以外の6カ国がコード上まるごと (b)＝未配線。生データはmasterにあるが
`services.ts`に転記されていない）とで、性質が全く違う。案Cは「行＝配送方式、
列＝5社」という表を**国ごとに**作ることになるが、宅配便の行はUS列以外ほぼ全部
空欄になる。加えて:

- 宅配便には重量上限の構造が存在しない（§3、CLAUDE.md §9の記録どおり事実）。
- 商品価格依存の方式フィルタ（FROM JAPANで実測済み）は未実装（§4）。
- 所要日数は郵便側にしか出典・確度付きの構造化データが無く、宅配便側はラベル文字列からの
  抽出に頼っている（§5）。

方式主軸の表は「日数×確度」も「7カ国均一の被覆」も要求するが、いま揃っているのは
「US限定の宅配便価格」と「郵便側の構造化された日数」だけ。空欄の大半が (a)（提供していない
という正直な空白）ではなく (b)（未配線・未収集）である以上、**今の時点でこの案を実装しても
6/7カ国分は穴だらけの表になる。**
