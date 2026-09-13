# 税ゼロ時の宅配便通関手数料（F34）── working treatment の決定と実装（2026-09-13）

## 位置づけ

本文書は `docs/audit/f34-zero-duty-clearance-fee-2026-09-12.md`（結論: 「DHL/UPS/FedEx/ECMS×7か国
のどの一次資料からも、税ゼロ時にこの手数料が課されるかは決着しない」という行き止まりの確定）を
受けて、**オーナーが2026-09-13にこの行き止まりについて working treatment を下した**ので、その
決定と実装を記録する。位置づけとしては F28（燃油サーチャージ、`docs/audit/fuel-surcharge-inclusion-2026-09-12.md`）
・F40（遠隔地サーチャージ、`docs/audit/remote-area-surcharge-inclusion-2026-09-12.md`）と同じ形——
一次資料が決着しない論点について、明示された未検証の運用判断を記録する——だが、**リスクの向きが
逆**である点が本文書の主眼になる。

## 決定

**DHL・UPS・FedExの3社について、ある単位（`per_parcel`なら小包1つ、`per_shipment`なら荷物全体）の
duty+taxが0円のとき、目的地側の通関/立替手数料（Duty Tax Processing / Disbursement Fee 等）は
課されないものとして扱う。** 記録先: `master/carrier-surcharges.json` の
`surcharges_verification_2026_09_12.zero_duty_clearance_fee_working_treatment`（id:
`C13_zero_duty_working_treatment_2026_09_13`）。`confidence` はF28・F40と同じ
`reasoned_judgement_unconfirmed`。

**ECMSはこの working treatment の対象外。** ECMSのT&Cは
"If ECMS EXPRESS advances any Customs Duties on behalf of a Receiver, ECMS EXPRESS is entitled
to charge ... a duty advance payment fee of 3%" と条件文で書いている——advanceする対象
（duty+tax）が0なら、3%の基準額自体が0になる。これは**未検証の仮定ではなく、ECMS自身の一次資料
の式（`rateMin(0.03, 0)`、最低額そのものが0円）を評価するだけで導かれる結果**であり、他の3社の
working treatmentとは性質が違う。したがって ECMS はこの working treatment の判定
（`isZeroDutyAssumptionCarrier()`）から明示的に除外し、`amountKind: 'range'` の器を経由させず、
常に `tier: 'fixed'` の実額として扱う。

## F28/F40 との違い ── リスクの向きが逆

F28（燃油）・F40（遠隔地）は「プロキシの表示価格に宅配業者側のサーチャージが**込み**」と仮定する
ことで compare.ts 側の計算を単純化した。この仮定が外れていた場合、**見積りは実際より安く出続ける
（過小計上）**——だから両エントリの `shared_premise_risk_with_fuel` は「本マスタの見積りが実際
より低く出る」方向でリスクを記録している。

本working treatmentは逆方向である。「税ゼロなら手数料も課されない」と仮定することで、**見積りは
実際より安く出続ける**……はずが、待てよ、これも過小計上では？　いや——ここが重要な区別で、
**F28/F40は「サーチャージを一切計算しない」という単純化なので、常に安全側（込みという前提が
正しければ何も足さなくてよい）に振れているようで、実は「込みでなかった場合は過小計上」という
リスクを負う。**一方、本working treatmentは「税ゼロの小包 **にだけ** 手数料を課さない」という
条件付きの仮定であり、**通関手数料という行自体は消えない**（税>0の小包・荷物には引き続き実額の
手数料が乗る）。つまり、F28/F40が「その費目を丸ごと扱わない」ことで負う一方向のリスクなのに
対し、本working treatmentは「その費目の一部（税ゼロの単位）だけ」を仮定に委ねる、より限定された
リスクである。

とはいえ、方向は同じく**過小計上**——DHL/UPS/FedExの税ゼロの小包・荷物で、もし実際には
無条件のフラット最低額が課されているなら、本マスタの見積りはその分だけ安く出続ける。これは
**F28/F40とは逆方向**という位置づけ（F28/F40は「込みだと仮定」して安全側に倒すのに対し、
このプロジェクトの既存の習慣は「見積りが低すぎるかもしれない」ことをより危険な誤りとして扱って
きた——`docs/PRINCIPLES.md` 原則1の残余リスクの置き場所の議論、原則2の「無かったことは証拠に
ならない」も同じ方向の慎重さから来ている）。したがって、この working treatment はその習慣に
照らして相対的に重い判断になる、という自己批判的な注記を `master/carrier-surcharges.json` の
`direction_of_error_note` に残した。

## この仮定はいくらの話か（監査の試算の再掲）

`docs/audit/f34-zero-duty-clearance-fee-2026-09-12.md` が既に試算した、deminimis以下（duty+tax
が文字通り0円）のカート1件あたり、この working treatment が外れていた場合に見積りから消える額
（＝各社の最低額そのもの）:

| ルート | 現地通貨 | 円換算（概算） |
|---|---|---|
| CA UPS Standard | CAD 7.40 | 約¥838 |
| CA UPS Express系 | CAD 11.65 | 約¥1,319 |
| CA DHL Express（non_account_holder） | CAD 18.00 | 約¥2,038 |
| SG DHL Express | SGD 20.00 | 約¥2,467 |
| US DHL/UPS/FedEx（参照値） | USD 17.50 | 約¥2,734 |
| SG UPS | SGD 22.50 | 約¥2,775 |
| AU DHL Express | AUD 23.00 | 約¥2,589 |
| AU UPS（GST込み） | AUD 26.18 | 約¥2,948 |

AU UPS・SG UPSの2ルートはUS基準（¥2,734）を上回る。deminimis以下のカート1件あたり、この仮定が
外れていた場合に見積りから消える額は、ルートによって**約¥838〜約¥2,948**の幅を持つ。

## 実装

`src/lib/pricing/courier-clearance.ts` に `isZeroDutyAssumptionCarrier(carrier)` と
`aggregateClearanceFee(rule, carrier, units, ccyToJpy)` を追加した。後者が、この working
treatmentの**単位ごとの適用**を一元的に担う——`compare.ts` はこの関数を呼ぶだけで、税ゼロの
判定・実額の積み上げ・仮定が外れた場合の上乗せ分の計算をすべてこの関数に委ねる。

**カート単位ではなく単位（小包/荷物）単位で判定する。**以前の実装は「カート全体で1つでも
duty+taxがあれば全部実額、全部ゼロなら行自体をnullにする」という**カート単位**の判定だった。
これは、複数小包にまたがるカートで、税ゼロの小包1つのために本来課されるはずの実額（他の
課税小包の分）まで消してしまう、あるいは逆に税ゼロの小包にも無条件に最低額を課してしまう、
という失敗を生む——`prepaid-import-tax` 側でPR #93が実際に踏んだのと同じ形の失敗を、この
費目でも再現しかねなかった。`aggregateClearanceFee` は各単位を個別に判定してから合算するので、
この失敗が起きない（`src/lib/pricing/courier-clearance.test.ts` の straddle テストが
`aggregateClearanceFee` を直接叩いて、課税小包の実額と免税小包の仮定を混同していないことを
固定している——**実際の5社の master データには「per-order分割 かつ DHL/UPS/FedExを扱う」
組み合わせが存在しない**ため、`compare()` を通した straddle e2e は今回のmaster構成では
再現できないが、`compare.ts` が呼ぶのと同じ集計関数を直接検証することで同じ保証を得ている）。

**画面表示は `amountKind: 'range'` にする。**0円と決め打ちすれば「調べた上でゼロだった」という
嘘になり、最低額を書けば「調べた上で満額だった」という別の嘘になる。区間にすることで、
`amount`（low）＝仮定通りに計算した実額、`amountHighYen`（high）＝仮定が外れて税ゼロの単位にも
最低額が課された場合の額、の両方を保持する。この行のラベルには「assumed zero on N of M
parcels/shipments with no duty/tax due」という形で、仮定を適用した単位の数を明示する。

**`total.high` は元々このprで変わらない。**宅配便の行には常に `courier-destination-fees`
（燃油/遠隔地サーチャージの一般的な未知、F28/F40）という無条件の `amount: null` 行が付随して
おり、これが `total.high` を既に無条件に開いている（`docs/audit/f34-zero-duty-clearance-fee-2026-09-12.md`
の作業以前からある既存の挙動）。したがって本PRの `courier-clearance-fee` 行が `amountKind: 'range'`
になったことは `total.high` の開閉そのものには影響しない——影響するのは `total.low`（従来より
正確になる。税ゼロの単位を実額計算から正しく除外するようになったため）と、この行自体が持つ
`amount`/`amountHighYen` という、より粒度の細かい区間表示である。

## ECMSがsourcedであることの確認

`courier-clearance.test.ts` に、SG ECMS（`courier-ecms-express`、ZenMarketが扱う）でduty+taxが
0円のカートを流すテストを追加した。`fee.amount === 0`・`fee.amountKind !== 'range'`・
`fee.tier === 'fixed'`・`fee.note` に working treatment の文言が含まれないことを確認する——
DHL/UPS/FedExの仮定を経由せず、ECMS自身の式が0を導いていることを固定する。

## 検証

- `npx vitest run` — 実装前 **916件**（このworktreeでのベースライン再計測。既存の
  `docs/audit/f34-zero-duty-clearance-fee-2026-09-12.md` が報告する904件からは、その後の
  他PRのマージで増えている）→ 実装後 **918件**（既存1件を新しい仕様に更新し、新規4件を追加）。
- `npx tsc --noEmit` — エラー0件。
- `npm run lint` — エラー0件。
- `python3 master/validate.py` — 矛盾0件、再現4件（独立1件）。既存と同数、退行なし。
- `python3 master/render-docs.py --check` — 一致確認済み。
- `master/customs.json` は一切変更していない（タスクの制約通り）。変更したのは
  `master/carrier-surcharges.json`（working treatmentの新規記録）と `src/lib/pricing/`
  （`courier-clearance.ts`・`compare.ts`・テスト）のみ。

## #111とのマージ（2026-09-13追記）── per_shipment が「注文（Air Waybill）単位」になった後の再確認

`main` に #111（FedEx GB/DEを`unit: per_shipment`にdirect_fetchで確定し、`compare.ts`に
「箱の分割理由から推定したAir Waybill単位でper_shipmentを評価する」`shipmentGroups`グループ化を
導入したPR）がマージされたため、本PRをリベースし、`aggregateClearanceFee`が受け取る`units`の
組み立て方を**小包単位**から**#111が定義した単位（`per_parcel`なら小包、`per_shipment`なら
`shipmentGroups`が組んだ「注文」グループ）**に差し替えた。`aggregateClearanceFee`自体は
単位の中身（小包か、まとめた注文か）を関知しない純粋な集計関数なので、`compare.ts`側で
正しい`units`配列を渡すだけで済んだ——関数のシグネチャ・実装は変更していない。

**ヘッドラインの mixed-cart 数字を再導出した結果、変わらなかった。** 理由: 本working treatment
の対象3社（DHL/UPS/FedEx）のうち、`per_shipment`かつ「店舗分割が実際に起きる」組み合わせは、
今のmasterデータに存在しない——#111自身のテスト
（`courier-clearance.test.ts`「a multi-shop courier cart (Buyee, shop split) never reports a
weight-limit box either」のコメント）が既に同じ理由を記録している: 店舗分割（`split`）が効くのは
`parcelDefault: 'per-order'`のBuyeeだけで、Buyeeが扱う宅配便は自社便（`courier-buyee-air`、
carrierOfがnull）とECMS（`per_parcel`、working treatmentの対象外）のみ。したがって
「店舗分割 × per_shipment × 仮定の対象3社」という組み合わせは到達不能——本PRのheadline
mixed-cart（DHL SG、`per_parcel`）は、この`per_shipment`グループ化ロジックの変更を一切
経由しないコードパス（`per_parcel`は常に小包1つ=1単位のまま）なので、**#111のマージによって
挙動もテスト結果の数字も変わらない**。

念のため、`per_shipment`側でも本working treatmentが正しく合成されることを直接確認した
（新規テスト「a per_shipment assumption-carrier route (SG FedEx) composes with the
whole-shipment grouping」）: SG FedEx（`per_shipment`、working treatment対象、実データ）で
duty+taxが0円のカートを1注文（店舗分割なし、`shipmentGroups`が1グループにまとめる）で流すと、
`fee.amountKind === 'range'`・`fee.amount === 0`・`fee.amountHighYen > 0`・
`fee.label`に"assumed zero on 1 of 1 shipment"が出ることを確認した——単位が「小包」から
「Air Waybill 1枚（＝#111のグループ化が組んだ注文単位）」に変わっても、仮定は単位ごとに
正しく適用される。

## `duty+tax` から計算したこと（閾値からではないこと）の効果

`taxResult.perParcel[i].duty.yen` / `.vat.yen` という、既に確定した実際の課税額を単位ごとに
見ているので、「deminimis以下かどうか」という閾値判定を新たに導入する必要はなかった——
GB/DE/FR/AUのようにvatFreeLimit:0でduty免除でもVATは初回から課される国では、この実装は
正しく「duty+tax > 0」側の分岐に落ちる（threshold未満でも課税ありと判定される）。この点は
実装前に懸念していた「threshold判定と混同する」落とし穴だったが、既存の `taxResult` を
再利用したことで、閾値ロジックを重複実装せずに済み、想定通り副作用なく動いた——今回
発見が必要になるような食い違いは無かった。
