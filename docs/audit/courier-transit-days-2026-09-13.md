# 宅配便の所要日数 ── 現状・出典・「持てるか」の判定（2026-09-13）

**このタスクは調査のみ。`src/` と `master/` は1文字も変更していない。**

## 0. 到達できた／できなかった URL（HTTP ステータス付き）

| # | URL | 結果 |
|---|---|---|
| 1 | `https://mydhl.express.dhl/us/en/tools/time-and-cost-calculator.html`（DHL 運賃・所要日数計算ツール） | **302 → 404**（リダイレクト先が DHL 自身の404ページ）。到達できず。 |
| 2 | `https://mydhl.express.dhl/content/dam/downloads/us/en/rate-guide/service_and_rate_guide_us_en_2026.pdf...`（DHL US レートガイド PDF） | **200、到達成功**（4MB、以前の `master/carrier-weight-limits.json` 調査と同じ文書）。§2 参照。 |
| 3 | `https://www.dhl.com/discover/en-global/.../shipping-time-to-us`（DHL 一般解説記事） | **503 Service Unavailable**。到達できず。 |
| 4 | `https://www.ups.com/us/en/support/.../time-in-transit.page`（UPS Time in Transit） | **503 Service Unavailable**。到達できず。 |
| 5 | `https://www.ups.com/us/en/support/shipping-support/shipping-costs-rates.page` | **503 Service Unavailable**。到達できず。 |
| 6 | `https://www.ups.com/assets/resources/media/en_US/service_guide.pdf` | **503 Service Unavailable**。到達できず。 |
| 7 | `https://www.fedex.com/en-us/shipping/international-transit-times.html` | **200 だが中身は WAF/エラーページ**（"We're sorry, we can't process your request right now. It appears you don't have permission to view this webpage."、インシデント番号付き）。実質到達できず。`master/carrier-weight-limits.json` が既に記録した FedEx の WAF チャレンジと**同じ症状**を確認した。 |
| 8 | `https://www.ecmsglobal.com/en-us/`（ECMS トップページ） | **200、到達成功**だが、取得できた本文は `HOME \| ECMSGlobal \| International Shipping Service` というヘッダのみで、所要日数の記載は見つからなかった。 |
| 9 | `https://www.ecmsi.co.jp/en/` | **DNS解決失敗**（`ENOTFOUND`）。存在しないドメインの可能性。到達できず。 |

**要約: 一次資料に「到達して読めた」のは DHL の US レートガイド PDF（#2）だけ。** UPS は3つの URL すべてが 503。FedEx は既知の WAF 症状を再現した。ECMS はトップページには到達したが、所要日数の記載自体が見当たらなかった（トップページしか見ていないので「無い」と断定はしない。§3④参照）。

---

## 1. 現状の記述 ── コードと画面

### 1.1 郵便（`POSTAL_METHODS`, `src/lib/pricing/postage.ts:113–158`）

構造化されたフィールドを持つ:

```ts
interface PostalMethodSpec {
  id; label; days: string; daysSourceUrl: string; daysTier: Tier; tracked: boolean;
}
```

実際の値（5方式）:

| id | days | daysSourceUrl | daysTier |
|---|---|---|---|
| ems | `a week or less` | `neokyo.com/en/shipping` | fixed |
| small-packet-air | `10 days or less` | `neokyo.com/en/shipping` | fixed |
| parcel-air | `12–26 days` | `buyee.jp/helpcenter/...` | fixed |
| small-packet-surface | `1–3 months` | `buyee.jp/helpcenter/...` | fixed |
| parcel-surface | `1–3 months` | `buyee.jp/helpcenter/...` | fixed |

**重要な留保（コード自身のコメントが認めている）**: 「日本郵便は国ごとの検索フォームでしか出しておらず、静的な表が無い」ため、**出典は日本郵便ではなく代行業者（Neokyo・Buyee）が公表している日数**。つまり郵便側も一次資料（日本郵便）ではなく代行業者の二次的な言い回しを採用している ── 宅配便との違いは「構造化されたフィールドを持つかどうか」であって、「一次資料か」ではない。この点は今回のタスクで初めて明確になった：**郵便側の `daysTier: 'fixed'` は「日本郵便の公表値」を意味しない。**

`daysTier` と `daysSourceUrl` は **UI のどこにも表示されていない**（`src/components` を `grep` した結果、両フィールドを参照する箇所はゼロ）。画面には `days` の文字列だけが出る。

### 1.2 宅配便（`CourierMethodSpec`, `postage.ts:449–484`, `compare.ts:1262–1268`）

構造体に `daysSourceUrl` も `daysTier` も無い:

```ts
interface CourierMethodSpec { id; label; days: string; tracked: boolean; }
```

`compare.ts:1262` 付近では個別方式の `spec` を組み立てる際、宅配便は
```ts
{ id: method, label: courierRate?.labelRaw ?? method, days: 'not yet modeled',
  daysSourceUrl: courierRate?.sourceUrl ?? svc.sourceUrl ?? '', daysTier: 'none' as Tier, tracked: true }
```
と**その場で `PostalMethodSpec` 型に無理やり合わせて `days: 'not yet modeled'` を埋めている**（`daysSourceUrl` は料金の出典 URL を流用しているだけで、日数の出典ではない）。

一方 `COURIER_METHODS`（`postage.ts:471`、`MethodPicker` が使う一覧）は各社の `labelRaw` の**括弧内**を正規表現で抜いた日数を使う（§2 参照）。**つまり同じ「宅配便の日数」でも `compare.ts` の内部表現は常に `'not yet modeled'`／`daysTier: 'none'` で確度ゼロ扱いなのに、画面の選択メニュー（`MethodPicker`）はラベル由来の日数文字列を出している。** 両者は同期していない ── 画面には「2-5 days」のような具体的な数字が出るのに、内部的にはその数字の確度も出典も一切追跡していない。

`MethodPicker.tsx:50,60` は `${m.label} · ${m.days}` をそのまま連結表示するだけで、確度・出典を示すバッジや注記は無い。

---

## 2. 各社ラベルから抜いている日数 ── 全件列挙

`labelRaw` を持つ宅配便エントリを `src/lib/pricing/services.ts` から全件洗い出した（`courier-surface` を除く純粋な宅配便ブランドのみ）。

| # | 代行業者 | labelRaw | `daysFromLabelRaw()` の抽出結果 |
|---|---|---|---|
| 1 | Neokyo | `DHL EXPRESS 12:00 (2-5 days)` | **`2-5 days`** |
| 2 | Neokyo | `DHL Express Worldwide (2-6 days)` | **`2-6 days`** |
| 3 | Neokyo | `FedEx International Connect Plus (3-5 days)` | **`3-5 days`** |
| 4 | ZenMarket | `DHL (GREEN+)` | `transit time not published` |
| 5 | ZenMarket | `ECMS EXPRESS` | `transit time not published` |
| 6 | ZenMarket | `FEDEX` | `transit time not published` |
| 7 | ZenMarket | `FEDEX LOWCOST` | `transit time not published` |
| 8 | ZenMarket | `UPS` | `transit time not published` |
| 9 | FROM JAPAN | `ECMS` | `transit time not published` |
| 10 | FROM JAPAN | `UPS` | `transit time not published` |
| 11 | FROM JAPAN | `DHL` | `transit time not published` |
| 12 | FROM JAPAN | `FedEx - Economy` | `transit time not published` |
| 13 | FROM JAPAN | `FedEx - Priority` | `transit time not published` |
| 14 | Buyee | `Buyee Air Delivery` | `transit time not published` |
| 15 | Buyee | `ECMS` | `transit time not published` |

**16件中3件だけ日数が抜ける（Neokyo の3件のみ）。13件（81%）は `'transit time not published'` になる。** ZenMarket・FROM JAPAN・Buyee の3社は宅配便ラベルに日数を一切書いていない。

`RANKED_COURIER_METHOD_IDS`（14 ID、`COURIER_METHODS` が画面に出す代表値）で見ると、日数が入るのは Neokyo 由来の3 ID（`courier-dhl-express-1200`, `courier-dhl-express-worldwide`, `courier-fedex-connect-plus`）だけで、残り11 ID は `transit time not published` になる。

---

## 3. 運送会社の一次資料を実際に調べた結果

### 3.1 DHL Express ── 到達できた（US レートガイド PDF、200）

DHL Express Worldwide（`COURIER_METHOD_NAME_MAP` の zenmarket `'DHL (GREEN+)'`・fromjapan `'DHL'` などが指す**フラッグシップ商品**、`master/carrier-weight-limits.json` でも同じ商品として扱われている）について、DHL 自身の Service & Rate Guide 2026（US 版）p.6 が次のように書いている:

> **DHL Express Worldwide**: "Our most popular product, DHL Express Worldwide, offers an end of business day delivery service around the world for pieces up to 150 lb. and shipments up to 6,600 lb."
> 表内 **Money-back guarantee: No**

> **DHL Express 12:00**: "With DHL Express 12:00 you will receive your shipments before 12 noon on the next possible business day. DHL Express 12:00 offers a money-back guarantee\* ..."
> 表内 **Money-back guarantee: Yes\***

> **DHL Express 9:00 (10:30 to the USA)**: "Our premium time-definite service offers a delivery before 9:00 (10:30 to the USA) on lanes that guarantee either a next or second business day delivery. ... DHL Express 10:30 features a money-back guarantee\* ..."
> 表内 **Money-back guarantee: Yes\***

**確認できたこと**:
- DHL は US 向けに **国別の「◯日」という単一の到着日数表は公表していない**。公表しているのは商品ごとの**サービスレベル**（「翌営業日末までに」「翌営業日正午までに」「翌営業日9:00/米国は10:30までに」）であって、「日本→米国は◯日」という**幅（レンジ）ではなく、DHL 独自のネットワーク内での配達タイミング**を約束する形式。
- **フラッグシップの DHL Express Worldwide には money-back guarantee が無い**（表に明記して "No"）。**保証があるのは、より速く・より狭い国範囲をカバーする DHL Express 12:00 / 9:00 の方**（151か国・85か国のみ対応、Worldwide は220か国超）。つまり、代行業者がよく使う「DHL Express Worldwide」自体は**保証なしの目安**である。
- この US 版レートガイド PDF は**国別（起点＝日本）の日数**そのものは書いていない（p.1-8 の範囲。ゾーン別の残りのページは未取得。今回のタスクは所要日数の一次資料到達可否の確認が主眼のため、全ページは読んでいない）。**「日本発・米国着は◯日」という数字を DHL の一次資料から直接引用することはできなかった** ── 見つかったのは商品の性質（保証あり/なし、対応国数、配達タイミングの定義）であって、国別の到着日数表ではない。

GB/DE/FR/AU/CA/SG のレートガイドは今回**未取得**（`master/carrier-weight-limits.json` が既に取得済みのURLは把握しているが、本タスクでは所要日数の有無をUS版1本で確認するに留めた ── 時間の制約。**残り6か国のレートガイドに同じ「保証あり/なし」表があるかは未確認**）。

### 3.2 UPS ── 到達できず（503 が3回）

`ups.com` の Time in Transit ページ、料金サポートページ、Service Guide PDF の3 URL すべてが **503 Service Unavailable** を返した。ボットブロック（WAF/レート制限）の可能性が高いが、**確認していない**（503 はサーバ側の一時的な問題である可能性も否定できない）。**UPS の所要日数について一次資料から得られた事実はゼロ。** `master/carrier-weight-limits.json` の既存調査（重量上限）は UPS の US/CA/AU/GB Terms 文書・SG Service Guide に到達できていたので、**別の URL・別の時間帯なら到達できる可能性はある**が、今回は再現しなかった。

### 3.3 FedEx ── 到達できず（WAF チャレンジ、既知の症状の再現）

`fedex.com/en-us/shipping/international-transit-times.html` は HTTP 200 を返すが、本文は "We're sorry, we can't process your request right now. It appears you don't have permission to view this webpage."（インシデント番号付き）という**アクセス拒否ページ**だった。これは `master/carrier-weight-limits.json` が既に記録していた「FedEx | System Down のフェイルオーバーページ」と**同種の症状**（見た目のテキストは異なるが、どちらも「一次資料に見せかけたブロックページ」という構造は同じ）。**FedEx の所要日数について一次資料から得られた事実はゼロ。**

### 3.4 ECMS ── 到達したが日数の記載を確認できず

トップページ（`ecmsglobal.com/en-us/`）は 200 で到達したが、取得できた本文はヘッダのみで所要日数の記載は無かった。**サブページ（Terms & Conditions、料金計算ツール等）は今回巡回していない** ── `master/carrier-weight-limits.json` の既存調査は US/UK/SG の Terms & Conditions PDF に到達し「重量上限の記載が無い」ことを確認しているが、**所要日数についても同様に「記載が無い」と言い切るには T&C 本文を読み直す必要があり、今回は未確認**。ECMS がそもそも自社便を持つ運送会社なのか、他社便を使う混載業者（コンソリデーター）なのかも、今回到達した範囲（トップページのヘッダのみ）では判定できなかった。**分からない。**

`ecmsi.co.jp` は DNS 解決に失敗した。存在しないドメインを推測で叩いた可能性が高く、ECMS の正しい日本語ドメインは別にあるかもしれないが、**確認していない**。

### 3.5 まとめ表

| 運送会社 | 一次資料に到達できたか | 保証か目安か | 日本発7か国の日数を確認できたか |
|---|---|---|---|
| DHL Express | **できた**（US レートガイド、200） | Express Worldwide＝**目安・保証なし**（"No"と明記）。Express 12:00/9:00＝**保証あり**（"Yes*"）だが対応国が少ない | **できていない**（サービスレベルの説明は取れたが、国別の日数レンジそのものは未取得） |
| UPS | **できなかった**（503 ×3） | 不明 | 不明 |
| FedEx | **できなかった**（WAF、既知の症状を再現） | 不明 | 不明 |
| ECMS | **トップページのみ到達**、日数記載は未発見 | 不明 | 不明（運送会社なのかコンソリデーターなのかも未確定） |

**7か国 × 4社= 28通りのうち、日数を一次資料から直接引用できたものは0件。** DHL だけ「保証の有無」という部分的な事実は取れた。

---

## 4. 「社のラベル」と「運送会社の公表値」の食い違い

一次資料から**国別の日数レンジそのもの**が1件も取得できなかったため、「Neokyo の `DHL Express Worldwide (2-6 days)` という表記が DHL 自身の公表値と数値として一致するか」は**比較できない・分からない**。

ただし、**構造的な食い違いは1つ確認できた**:

- Neokyo のラベルは `DHL Express Worldwide (2-6 days)` と、**保証されているかのような単一の日数レンジ**として表示している。
- しかし DHL 自身の一次資料は、この商品（Worldwide）に money-back guarantee が**無い**ことを明記している。保証があるのはより高価な12:00/9:00便の方。
- つまり、**Neokyo のラベルの日数表記は、それが「保証」なのか「目安」なのかという運送会社側の重要な区別を消してしまっている。** 画面のユーザーは `2-6 days` という数字だけを見て、それが保証された納期だと誤解しかねない。

論点（オーナー向けの判断材料）:
- **代行業者側の日数の方が「ユーザーが実際に払って使うルート」に近い**という理屈は成立する ── ユーザーは DHL に直接発送を依頼するのではなく Neokyo 経由で DHL Express Worldwide を使うため、Neokyo が自社の経験・DHL との契約条件から出している日数の方が実態に近い可能性はある。
- しかし **出典の強さでは運送会社の一次資料が上**であり、かつ DHL の一次資料は「この商品には保証が無い」という、Neokyo のラベルには出てこない確度情報を持っている。**現状の実装（`daysFromLabelRaw`）はこの確度差を一切扱っていない** ── 郵便側にはある `daysTier` フィールドが宅配便には存在しない。

---

## 5. 「社ごとに便種が違うから共通表を持てない」は本当の制約か

`COURIER_METHOD_NAME_MAP`（`postage.ts:346–371`）を読むと、**すでに正規化は行われている**:

- `fromjapan.DHL` → `courier-dhl`
- `zenmarket.'DHL (GREEN+)'` → `courier-dhl-green-plus`
- `neokyo.'DHL EXPRESS 12:00 (2-5 days)'` → `courier-dhl-express-1200`
- `neokyo.'DHL Express Worldwide (2-6 days)'` → `courier-dhl-express-worldwide`

つまり**「ZenMarket の DHL (GREEN+) と Neokyo の DHL Express Worldwide が同じ商品かどうか」は、既存コードのコメント（`postage.ts:341` 付近）が「未解決の組」として明示的に扱っている**。両者を無条件に束ねてはいない ── コードは同一 ID にまとめず、別の `CourierMethod` 型（`courier-dhl-green-plus` と `courier-dhl-express-worldwide`）として保持している。これは正しい態度で、**「表記が違う＝別物」という保守的な前提を既に取っている**。

一方で `fromjapan.ECMS` と `buyee.ECMS` は**表記が完全一致するという理由だけで** `courier-ecms` に束ねられている（`postage.ts:343` のコメント）。これは「同じ ECMS という運送会社ブランドを指している」という**推測**であり、両社が本当に同じ ECMS のサービスレベルを指しているかどうかの一次資料による裏付けは無い（§3.4 で見た通り ECMS 自体の一次資料に到達できていない）。

**判定**: 「便種を運送会社×サービス名に正規化できるか」という問いには、**部分的に「できる」**と答えられる ── `COURIER_METHOD_NAME_MAP` はすでにその正規化のレイヤーを持っており、DHL のように複数のサービスレベル（Green+/12:00/Worldwide）を区別できているケースもある。ただし正規化の**根拠は一次資料ではなく表記の一致・不一致という推測**であり（ECMS の例）、「共通表を持てない」というコメントの理由づけ（法人契約している宅配ブランド・便種が社ごとに違う）は**半分だけ正しい** ── 便種は確かに社ごとに違うが、それは「共通表を一切持てない」ことの理由にはならず、**「各 `CourierMethod` ID ごとに、その ID が実際にどのサービスレベルを指すのか一次資料で確認し、日数を運送会社基準で埋める」という表は原理的に作れる**。今回の調査で埋まらなかったのは「調べていないから」であって「構造上不可能だから」ではない。

---

## 6. 結論 ── 一言で

**部分的に持てる。ただし今回の一次資料調査で実際に埋まったマスは、7か国×4社=28マス中ほぼ0マス。**

理由を整理すると:

1. **構造上は持てる。** `COURIER_METHOD_NAME_MAP` による運送会社×サービス名への正規化は既に存在し、`PostalMethodSpec` と同じ形（`days` / `daysSourceUrl` / `daysTier`）を `CourierMethodSpec` に足すこと自体に技術的な障害は無い。
2. **しかし一次資料へのアクセスが今回ほぼ全滅した。** DHL（US のみ部分的に到達）以外は UPS＝503連発、FedEx＝既知のWAF再現、ECMS＝到達したが記載未発見。**「社ごとに便種が違うから共通表を持てない」は理由として不正確**（正規化はできるので）で、**本当の障害は「運送会社の一次資料に到達できない／到達しても日本発の国別日数がそもそも載っていない」という別の問題**。
3. **「保証」と「目安」の区別は決定的に重要**（DHL Express Worldwide＝保証なし目安）で、現状の `daysFromLabelRaw()` はこれを一切区別しない。郵便の `daysTier` フィールドですら UI に表示されておらず、代行業者由来（日本郵便自身の公表値ではない）という限界を持つ。

### 今のまま（ラベルから抜く方式）を続ける場合の確度表示案

`CourierMethodSpec` に郵便と同じ `daysTier: Tier` を足し、値は一律 `'unverified'`（新設）とする。理由:
- 現状の13/16件（§2）は "transit time not published" で確度以前の問題。
- 残る3件（Neokyo 由来）も、§4 で見た通り「保証か目安か」を運送会社側で確認できていない以上、`daysTier: 'fixed'`（郵便で使われている「確定」ランク）を宅配便に流用するのは**根拠のない確度の主張**になる。
- 画面には `{days}`（例: `2-6 days · unverified`）のように**必ず確度を伴わせて表示する** ── 郵便同様、`daysTier` を持たせるだけで UI に出さなければ意味が無いので、`MethodPicker.tsx:50,60` の表示ロジックも郵便・宅配便どちらも `daysTier` を出すよう揃える必要がある（ただし本タスクは調査のみのためコード変更はしていない）。
- `compare.ts:1262` 付近の `days: 'not yet modeled'` はランキング内部の型合わせ用の値であり、これも `daysTier: 'none'` のまま据え置くのが正直（実際にランキングでは日数を一切使っていないため）。

**次にやるべき調査**（このタスクのスコープ外）: UPS（別時間帯・別 URL での再試行）、FedEx（WAF 回避策の要否をまず判定）、ECMS（正体の確認＝運送会社かコンソリデーターか）、DHL の残り6か国レートガイド（国別の日数レンジが本当に存在しないのか、単に US 版の巻頭8ページに無かっただけなのかの切り分け）。
