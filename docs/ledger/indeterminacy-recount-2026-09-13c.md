# rankIndeterminate 実測 — #150 + #149 を合算した後 (2026-09-13c)

**目的**: PR #150（FROM JAPAN 外注梱包のゲート）と PR #149（GB/DE の FedEx・UPS 立替手数料）
は、どちらも「#147 適用後の131件」を起点に単独で測定されていた（重なりを測っていなかった）。
本ファイルは、両方が入った最新 main（`72bae6b`）で `scripts/indeterminacy-ledger.ts` /
`indeterminacy-summary.ts` / `indeterminacy-xlsx.py` を実際に走らせた結果を記録する。

条件格子: 既定の343条件（7か国 × 重量7段 × 価格7段、1品目、`storageDays: 0`、`method: 'cheapest'`）。
`Item.site` は `mercari` と `yahoo-auctions` の両方で測定。

生成物:
- `docs/ledger/indeterminacy-2026-09-13c.csv` / `.xlsx` / `indeterminacy-summary-2026-09-13c.md`（site: mercari）
- `docs/ledger/indeterminacy-2026-09-13c-ya.csv` / `.xlsx` / `indeterminacy-summary-2026-09-13c-ya.md`（site: yahoo-auctions）

## 1. 今日の推移

| 段階 | 変更 | rankIndeterminate（site: mercari） | 潰した費目 |
|---|---|---|---|
| 起点 | #146 台帳導入時点の実測（`fable-fix-readiness` 由来） | 297/343（86.6%） | — |
| #147 適用後 | 燃油・遠隔地サーチャージを分離し、`courier-destination-fees` 行自体を無条件生成しない形に変更 | 131/343（38.2%） | `courier-destination-fees`（266条件でブロック要因だったうちの大半。ただし `Row.closedByAssumption` に仮定依存の印は残す） |
| #150 単独測定（#147の131から） | FROM JAPAN 外注梱包費を実条件でゲート | 51/343（記録値、単独測定） | `outsourced-packing`（97条件） |
| #149 単独測定（#147の131から） | GB/DE の FedEx・UPS 立替（通関）手数料を追加 | 82/343（記録値、単独測定） | `courier-clearance-fee`（51条件） |
| **#150 + #149 合算（本ファイル、実測）** | 両方が main に入った状態 | **0/343（0.0%）** | `outsourced-packing` と `courier-clearance-fee` の両方が同時に潰れた——重なりが完全解消側に効いた（#150 と #149 が対処した97件・51件の間に、双方の解消が揃わないと閉じない条件は無かった） |

site: yahoo-auctions でも同一実行で **0/343（0.0%）**（起点側は292/343 と記録されていたもの）。

**注**: #150・#149 の「単独測定」欄の51・82は、指示に書かれていた過去の測定値をそのまま転記した
ものであり、本セッションで再測定していない。本セッションが実際に走らせて確認したのは
「起点=131（#147適用後、これは本セッションでも再現）」と「合算後=0」の2点のみ。

## 2. 残っている判別不能の原因費目

**ゼロ。** `mercari` / `yahoo-auctions` いずれも rankIndeterminate は 0/343。
妨げている費目の内訳表（両 summary の「1. 妨げている費目ごとの件数」節）は空になっている
（該当行なし）。件数・社・tier・出典の列挙は「該当なし」。

## 3. `closedByAssumption` — 判別不能ゼロと「確定」は別物

`rankIndeterminate` が 0 になったことは「全条件が確定した」ことを意味しない。
`Row.closedByAssumption`（PR #147 新設、`total.high` を閉じるために使った未検証の仮定への依存フラグ）
を独立に集計すると:

| site | closedByAssumption が立っている条件数 |
|---|---|
| mercari | **266/343（77.6%）** |
| yahoo-auctions | **265/343（77.3%）** |

これは #147 が `courier-destination-fees` 行の生成を止めたのと引き換えに導入した仕組みで、
「燃油サーチャージは代行の表示価格に既に込み」という**検証済みの決定ではなく未確認の仮定**
（`docs/ROADMAP.md` の該当行、`carrier-surcharges.json` の `confidence: reasoned_judgement_unconfirmed`）
に依存する宅配便の行がここに数えられる。画面では「CHEAPEST」ではなく「ESTIMATED CHEAPEST」と
表示される。

**したがって正しい報告は「判別不能ゼロ」であって「全343条件が確定」ではない。**
266/343（mercari）・265/343（yahoo-auctions）は、rankIndeterminate という尺度には出てこない形で、
依然として未確認の仮定の上に立っている。

## 4. 「調べれば分かる」/「公表されていない」の分類

判別不能の原因費目がゼロのため、本セッションでは分類対象がない
（`scripts/indeterminacy-summary.ts` の「4.」節も両site とも0件で出力される）。

## 限界・確認していないこと

- #150・#149 それぞれの「単独測定値」（51・82）は本セッションで再取得していない。転記のみ。
- `closedByAssumption` の266/265件それぞれの内訳（国・重量・価格帯の偏りなど）は、
  今回の指示範囲（合算値の実測）を超えるため集計していない——必要なら別途 CSV の
  `closedByAssumption` 列でフィルタして見られる。
- 本ファイルは測定のみ。`src/` `master/` は変更していない。
