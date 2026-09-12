# F34 `eval_clearance()` カバレッジ ── 26件の未評価 rule.type を評価器で埋める（2026-09-12）

PR #100 が可視化した「48件中26件が `eval_clearance()` 未対応」を埋める作業。
対象は `master/validate.py`（`eval_clearance()` の拡張）と `master/customs.json`
（不変・確認のみ）。**`src/` は一切触っていない** ── これは価格計算パスの変更ではなく、
「マスタの transcribe が実請求と整合しているか」を検証する側の拡張。

## 先に結論

- **26件のうち19件に評価器を追加した。** 残り7件（`unknown` 3件・`not_found` 4件）は
  そもそもルール自体が「未確認」を意味する型で、計算する対象が無いため評価器を書けない
  ── これは正しく「型未対応」のまま残した。
- **新たに評価可能になった19件のうち、実請求 fixture で実際にクロスチェックできたのは
  0件。** 独立した実請求（`master/fixtures.json` に verbatim な金額が確認できるもの）を
  Web検索で探したが、公式ページの料率説明や二次情報の要約は見つかっても、
  「この経路のこの評価器で計算した金額と一致する具体的な実請求の数字」は見つからなかった。
  **架空の fixture を作ってカバレッジの数字を良く見せることはしていない。**
  「fixture が見つからないこと」自体を結果として報告する（タスク文が明示的に許容している）。
- **ラチェットを追加した。** 今後 `customs.json` に追加される `clearance` 行が
  `eval_clearance()` 未対応の型を持ち、かつ `GRANDFATHERED_UNEVALUATED`（このPR時点で
  main にあった7件）に無い組み合わせなら、`validate.py` は `fail` して exit(1) する。
  キーは **`(country, carrier, route)` の3つ組**。

## 表: 26件の内訳

| country | carrier(route) | rule.type | 評価器 追加 | fixture 独立/循環/無し | 対応 |
|---|---|---|---|---|---|
| US | FedEx(courier_brokerage) | greater_of | ○ | 無し | 評価器のみ追加 |
| US | DHL Express(dhl_express) | rate_of_import_charges_with_min_variants | ○ | 無し | 評価器のみ追加（variant必須） |
| US | UPS(ups_disbursement) | rate_of_import_charges_with_min | ○ | 無し | 評価器のみ追加 |
| GB | DHL Express(dhl_express) | rate_of_import_charges_with_min_variants | ○ | 無し | 評価器のみ追加 |
| GB | FedEx(courier_brokerage) | unknown | × | 無し | 対応不可（構造が unknown） |
| GB | UPS(ups_disbursement) | unknown | × | 無し | 対応不可（構造が unknown） |
| DE | DHL Express(dhl_express) | rate_of_import_charges_with_min | ○ | 無し | 評価器のみ追加 |
| DE | UPS(ups_disbursement) | banded_by_value_mixed | ○ | 無し | 評価器のみ追加（再帰評価） |
| DE | FedEx(fedex) | unknown | × | 無し | 対応不可（構造が unknown） |
| DE | ECMS(ecms_duty_advance) | not_found | × | 無し | 対応不可（法人自体が未確認） |
| FR | DHL Express(dhl_express) | rate_of_import_charges_with_min_variants | ○ | 無し | 評価器のみ追加 |
| FR | FedEx(fedex) | greater_of | ○ | 無し | 評価器のみ追加 |
| FR | UPS(ups_disbursement) | banded_by_value_mixed | ○ | 無し | 評価器のみ追加（再帰評価） |
| FR | ECMS(ecms_duty_advance) | not_found | × | 無し | 対応不可 |
| AU | DHL Express(dhl_express) | rate_of_import_charges_with_min_variants | ○ | 無し | 評価器のみ追加 |
| AU | FedEx(fedex) | greater_of | ○ | 無し | 評価器のみ追加 |
| AU | UPS(ups_disbursement) | greater_of | ○ | 無し | 評価器のみ追加 |
| AU | ECMS(ecms_duty_advance) | not_found | × | 無し | 対応不可 |
| CA | UPS/FedEx/DHL(courier) | range | ○（包含判定のみ） | 無し | 評価器追加（等号ではなく包含） |
| CA | DHL Express(dhl_express) | rate_of_import_charges_with_min_variants | ○ | 無し | 評価器のみ追加 |
| CA | FedEx(fedex) | greater_of | ○ | 無し | 評価器のみ追加 |
| CA | UPS(ups_disbursement) | greater_of_by_service | ○ | 無し | 評価器のみ追加（service必須） |
| CA | ECMS(ecms_duty_advance) | not_found | × | 無し | 対応不可 |
| SG | DHL Express(dhl_express) | rate_of_import_charges_with_min_variants | ○ | 無し | 評価器のみ追加 |
| SG | FedEx(fedex) | greater_of | ○ | 無し | 評価器のみ追加 |
| SG | UPS(ups_disbursement) | rate_of_import_charges_with_min_and_max | ○ | 無し | 評価器のみ追加（上限あり） |

**評価器を追加した19件のうち、fixture が無いために依然クロスチェックされていないのは19件全部。**
これは「実装しなかった」のではなく、「クロスチェックする実請求が見つからなかった」という
別の理由による。`docs/PRINCIPLES.md` 原則2（無かったことは見たと示せない限り証拠にならない）
に照らし、探した内容を明記する: DHL/UPSの公式レートガイド説明・料率解説サイト・
2〜3件のフォーラム/コミュニティ投稿を検索したが、**この評価器の入力（import_tax や
service種別）と紐づく具体的な実請求の金額**は見つからなかった。

## `range` 型の扱い

`CA/UPS・FedEx・DHL(courier)` の `range` 型（CAD 10〜50）は、原文が「幅」を述べているだけで
一点の金額を述べていない。**中央値や端点を使って計算可能な数字に化けさせることはしない。**
`eval_clearance()` はこの型について `(min, max)` のタプルをそのまま返し、新設した
`eval_clearance_range_contains(range_result, amount)` で実請求額がこの幅に収まるかどうかの
**包含判定**のみを行う契約にした。等号での再現検証はできないし、してはならない。

## `rate_of_import_charges_with_min_variants` / `greater_of_by_service` の設計

DHL の Duty Tax Processing（account_holder / non_account_holder）や CA UPS の
サービス種別（Standard / Express系）は、**代行の内部運用ではなく利用者の契約形態・選択した
サービスで決まる公表済みの分岐**なので、原則1（公式の枠組みから計算する）には反しない。
ただし `eval_clearance()` に `ctx["variant"]` / `ctx["service"]` を渡さずに呼ぶと
`KeyError` で明示的に落ちる ── どちらを使うか代行側の運用を勝手に決め打ちしないため。

## ラチェットの仕組み

`master/validate.py` に `GRANDFATHERED_UNEVALUATED` という集合を追加した。中身はこのPR時点で
main にまだ残る7件（`unknown` × 3、`not_found` × 4）の `(country, carrier, route)` タプル。
未評価の行を見つけたとき、この集合に入っていなければ `fail` に積んで最終的に `exit(1)` する。
**したがって今後 `customs.json` に `eval_clearance()` 未対応の型を持つ新しい `clearance` 行を
追加すると、`validate.py` がビルドを落とす。** 既存の7件はグランドファーザーされているため、
このPRの前提を壊さない。7件のどれかに評価器を実装した場合は、`EVAL_HANDLED_TYPES` に型を
追加し、`GRANDFATHERED_UNEVALUATED` からその組を外すこと（両方を更新しないと矛盾する）。

## `validate.py` の新しい出力

`rule.type 評価カバレッジ` セクションの直後に、新しく `fixture カバレッジ` セクションを追加した。
「型未対応」と「評価可能だが fixture が無い」を別リストとして常に表示する:

```
rule.type 評価カバレッジ: 通関経路 48 件中 41 件が eval_clearance() で評価可能、7 件は宣言のみで未評価
fixture カバレッジ: 評価可能な 41 件中 4 件は実請求 fixture でクロスチェック済み、36 件は評価可能だが突き合わせる fixture が無い
```

（41件・36件は今回の26件だけでなく、以前から評価可能だったが fixture の無かった行（US USPS、
GB Royal Mail/Parcelforce 等）も含む全経路の実数。24行→48行と経路数が変わったため`main`と
数字は直接比較できないが、「評価可能かどうか」と「fixtureがあるかどうか」を分けて見せる
という要求は満たしている。）

## ambiguity として残した点

- `rate_of_import_charges_with_min_variants` の `account_holder` と `non_account_holder`
  は、末端の利用者（ZenMarket等の代行を使う個人）がどちらに該当するかが `customs.json`
  のどこにも書かれていない。評価器自体は両方を計算できるが、**このリポジトリのユースケース
  （個人輸入・代行経由）でどちらの variant が実際に適用されるのかは未確認**。実装で
  この型を使う人は先にこれを埋める必要がある。
- `banded_by_value_mixed` の帯境界は `value_lte` / `value_gt` で表現されているが、
  ちょうど帯の境界値（例: DE UPS の €22）における包含・排他は原文の逐語引用
  （"≤ €22" / "exceed €22"）と一致させてある。将来この型を別の経路に転用する際は、
  境界の丸め・通貨換算のタイミングによって帯が変わりうる点に注意が必要。

## 検証

- `python3 master/validate.py` → 矛盾0件（`OK: スキーマ通過 / 再現 4件（うち独立 1件）/
  マスタと矛盾 0件`）。カバレッジ: rule.type 評価可能 41/48（未評価7）、
  fixture クロスチェック済み 4/41（評価可能だが未fixture 36）。
- `python3 master/render-docs.py` → 生成節を書き戻し、`--check` → 一致確認済み。
- `npx vitest run` → **904 件 pass**（`main` の基準値と同数、何も失われていない）。
- `master/customs.json` の既存の記録値（金額・rate・min・max等）は一切変更していない。
