# 監査: 燃油／遠隔地サーチャージの分離（2026-09-13、オーナー決定＋2回の訂正）

対象PR: `claude/split-fuel-remote-surcharges`。実装は `src/lib/pricing/compare.ts` の
`courier-destination-fees` 行の撤去と分離。マージはしていない。

## 1. 何を変えたか

旧仕様: 宅配便の行に無条件で1本の未取得行
`courier-destination-fees`（`amount: null`, `tier: 'none'`）を積み、燃油サーチャージと
遠隔地サーチャージの不明をまとめて表していた。`amount: null` かつ `unknownCapYen` が
無い行は `Row.total.high` を必ず `null`（上限不明）にする（`totalRange()`）ので、この
1行だけで宅配便が1位になるほぼ全条件の `total.high` が開いていた。

新仕様:

- **燃油サーチャージ**: 行を作らない。計上しない・未知にもしない（C11の決定を維持、
  根拠を強化）。
- **遠隔地サーチャージ**: `Line` にしない。`Row.total`（low/high）に一切触れない。
  代わりに画面共通の注記（`RemoteAreaSurchargeNote`、常時表示）でのみ開示する。
- **`Row.closedByAssumption: string[]`（新設）**: `total.high` が閉じていても、それが
  一次情報の確定なのか、この2つの未確認の仮定に依存した閉じ方なのかを区別する。
  宅配便の行（`intl-shipping` が実価格を持つ行）は必ず
  `['courier-fuel-surcharge-included', 'courier-remote-area-surcharge-excluded']` を持つ。
- **`RankBoard` の緑ラベル**: `closedByAssumption` が非空の行は「CHEAPEST」ではなく
  「ESTIMATED CHEAPEST」。`rankIndeterminate` のときは従来どおり「LEADS」が最優先。
  仮定に依存しない行（郵便のみの行など）は「CHEAPEST」のまま——全部を
  ESTIMATED CHEAPEST に寄せると、一次情報で確定した46条件と仮定依存の266条件の
  区別が画面から消えてしまうため（`RankBoard.tsx` の該当コメント参照）。

## 2. `rankIndeterminate` の実測

方法: `docs/audit/fable-fix-readiness-round2-2026-09-13.md` §3-1/§9 と同じ343条件
（US/GB/DE/FR/AU/CA/SG × {200,500,1000,2000,3000,5000,8000}g ×
{3000,10000,30000,60000,100000,150000,250000}円、1品目、`site: 'mercari'`、
`storageDays: 0`、`method: 'cheapest'`）。

| | 条件数 |
|---|---|
| 全条件 | 343 |
| 変更前（`rankIndeterminate === true`、文書記載値） | 297 |
| **変更後（実測、この環境で再走査）** | **131** |

**実測値131は、事前の予測（round2監査の「`courier-destination-fees` を埋めた場合」の
試算131）と一致した。**ただし今回は「埋めた」のではなく「行を撤去した」——結果として
同じ数になったのは、この行が単独原因だった166条件（297中）がすべて解消し、他の
未取得費目（`outsourced-packing` 97、`courier-clearance-fee` 51、それらの組み合わせ）が
残る131条件がそのまま残ったため。この計算過程はスクリプトとしてリポジトリに残して
いない（CLAUDE.md §5、一時ファイル禁止）——手順は上記の通り再現可能。

## 3. 遠隔地サーチャージの表現: `Line` か別フィールドか

**`Line` にしなかった。** 理由:

`totalRange()`（`Row.total.high` を計算する関数）は `amount: null` の行を、
`scope: 'shared'` が付いていても**閉じない**——`scope` が畳むのは順位専用の内部値
`rankHighFor()`（`Row.rankHigh`）だけで、`totalRange()` はこの値を一切見ない
（`compare.ts` 冒頭のコメントで明記されている既存の仕様）。したがって
「総額に加算せず、かつ `total.high` も開けない」という要件を満たす唯一の方法は
**そもそも行を作らないこと**だった。

比較のデータ（`Row`）には一切触れず、画面側の静的な文言
（`RemoteAreaSurchargeNote.tsx`）として持たせた。`FreeShippingDomesticNote` 等、
既存の「カート全体・常時1行・畳まない」注記コンポーネントの形に倣った。

## 4. 後出し請求（「carrier bills after the fact」）の扱い ── 決定と衝突の可能性

旧行の note にあった「宅配業者が後から転嫁しうる料金」という包括的な文言は、
オーナーの2026-09-13決定（燃油・遠隔地の2項目のみ）には明示されていない第3の
論点だった。

**判断: 燃油込みの前提の範囲内に吸収し、独立した未知としては残さない。**

根拠:
- 別カテゴリの未知として残すには、それを裏付ける一次情報を持っていない。
- 通関/立替手数料は既に別行 `courier-clearance-fee`（F34）が持っており、重複させない。
- 独立した未知として残すなら `total.high` を開ける必要が生じ、これは
  「上限を開ける必要はない」というオーナーの決定と**衝突する**。

**この判断は一次情報に基づくものではない。**今後この文言が指していた具体的な費目
（燃油・遠隔地・通関以外）が判明した場合、`total.high` を開けるかどうかを
改めてオーナーに判断してもらう必要がある——その時点でこの吸収判断との衝突が
顕在化する。勝手にどちらかへ倒さず、ここに記録する。

## 5. 燃油を加算しない根拠の追記（G8、オーナー、2026-09-13）

`master/carrier-surcharges.json` の C11（`fuel_surcharge_working_treatment`）に
`grounds_supporting` の新規エントリ `G8_contractual_rate_argument_2026_09_13` を
追加した（既存のG1〜G7は削除していない）。要旨:

1. 代行各社はFedEx等と法人契約を持ち、一般公開の運賃・燃油率とは異なる契約条件を持つ。
2. 公開燃油率（週次33〜50%）を代行の契約条件にそのまま当てはめる根拠が無い。
3. **帰結（G1〜G4より強い主張）**: ProxyCostが一般公開の燃油率を別途加算する方が、
   加算しないより危険——契約率が不明である以上、加算行為自体に妥当性が無く、
   二重計上または過大評価になる可能性が高い。
4. **この論が確立するのは「公開燃油率を加算しない」ことまで。**「代行の表示送料が
   最終額であり、後から燃油が別請求されることは無い」ことは確立しない——運用上の
   一般論（既存のG1と同型）であり一次情報の裏付けを伴わない。「代行が身銭を切って
   吸収している」とも主張しない——契約サーチャージ分が既に表示送料に転嫁されている
   可能性が高い、という主張に留まる。

`treatment` フィールドの原文は削除せず、`treatment_refinement_2026_09_13` として
言い回しを更新した版を追加した。

## 6. master の訂正（元の記述は消していない）

- **C11（燃油）**: `arithmetic_note_correction_2026_09_13` を追加。誤っていたのは
  「compare.tsが実際に行う計算は変わらない」という**コードへの影響評価**であり、
  「燃油は込みとして扱う」という判断自体は変わっていない。実際には
  `courier-destination-fees` の `amount: null` を通じて343条件中266条件の
  `rankIndeterminate` を生んでいた。「誤りだった」「嘘だった」という書き方はしていない。
- **C12（遠隔地）**: `owner_decision_revision_2026_09_13` を追加。扱いを
  「含めるかどうか」から「含めない・総額に加算しない・住所依存の比較対象外費用として
  注記する」に変更したこと、`decided_on`/`decided_by`（2026-09-13、オーナー）を記録した。
  **`rank_neutrality_not_claimed` フィールドで明記**: 総額から除外してよいという決定は
  「順位に中立」を意味しない——遠隔地サーチャージが実際に発生する住所では、社ごとの
  契約条件・運送会社の判定基準が異なりうるため、除外して比較した順位が実際の総額での
  順位と一致する保証はない。

`master/validate.py` は通過（スキーマ通過・再現4件・マスタと矛盾0件、変更前と同じ）。

## 7. 画面の共通注記

日本語原文（オーナー指定、最終版・訂正3）:
> 表示送料は燃油サーチャージ込みとして推定しています。遠隔地追加料金は含みません。

英訳（`RemoteAreaSurchargeNote.tsx` の `REMOTE_AREA_SURCHARGE_NOTE_TEXT`）:
> Displayed shipping rates are estimated as fuel-surcharge inclusive. Remote-area
> surcharges are not included.

意味を足す・弱めることはしていない——「推定しています」を "are estimated as" と訳し、
「含みません」を "are not included" とそのまま訳した。**常時表示**（宅配便の行が
無い籠でも出る、訂正3の指示どおり）。

## 8. UI変更の範囲（CLAUDE.md §8 の例外について）

このPRはCLAUDE.md §8（数値変更とUI変更を同じPRに混ぜない）の**意図的な例外**である。
理由: 上限不明を閉じて総額を断定できるようにする変更は、それを支える前提
（燃油込み・遠隔地除外）の開示と同時に出さなければ、開示の無い断定が
`main` に入る瞬間ができる。`src/components/` の変更は次の2点のみに限定した:

1. `RemoteAreaSurchargeNote.tsx`（新規）と `Calculator.tsx` への配線（注記の追加）。
2. `RankBoard.tsx` の `leadWordFor()`（緑ラベルの文言選択ロジック、訂正2）。

それ以外のUIコンポーネントは変更していない。

## 9. e2eへの影響（1件ずつ (a)/(b) 判定）

- `e2e/taxes.spec.ts`「the US board admits the Zonos …」: **(a) 新しい挙動が正しい**。
  旧テストは「どの行も必ずZonosか目的地未知のどちらかを持つ」という、
  `courier-destination-fees` の存在を前提にした主張だった。行自体が撤去されたので
  前提が崩れた——書き換えて、courier行がその種の個別行を持たないこと・共通注記が
  常時出ることを検査する形にした。
- `e2e/compare.spec.ts` テスト17: **(a)**。コメントが「Buyeeの`rankHigh`が
  `courier-destination-fees`のせいで常にnull」と書いていたが、その行が撤去された
  今もFROM JAPAN側の`outsourced-packing`（社固有・撤去対象外）が残るため、
  `rankIndeterminate`の結論自体は変わらない。コメントを実態に合わせて更新した。
- `e2e/parcel.spec.ts`「the box stands beside the cart…」: **(b) 実装（レイアウト）側の
  問題**——正確には「新しい注記1文を常時追加した副作用」。904px > 900pxの制約を破った。
  文言は削れない（オーナー指定・言い換え禁止）ので、`Calculator.tsx` の該当ブロックの
  `space-y` を 1.5→1 に詰めて吸収した（`EmsOnlyNote` 追加時の2026-09-12と同じ対処）。
- `src/lib/pricing/compare.test.ts`「splitting costs more on the courier…」: **(a)**。
  旧アサーションが撤去された行の存在を直接検査していた。米国宛の `vat`（Zonos、
  `scope: 'shared'`）行は今回の変更の対象外で、そのため `total.high` はこの
  シナリオでは依然として `null` のまま——これは正しい残余であり、期待値を
  そのように更新した。
- `src/lib/pricing/courier-clearance.test.ts`・`courier-wiring.test.ts`: **(a)**。
  撤去された行の不在を確認する形に更新した。

## 10. 検証結果

- `npx vitest run`: 1147件 green（新規テスト11件を含む）。
- `npx tsc --noEmit`: エラー無し。
- `npm run lint`: エラー無し。
- `python3 master/validate.py`: OK（スキーマ通過、再現4件、マスタと矛盾0件）。
- e2e: ローカルで `next build --webpack` の本番ビルドに対し、`e2e/taxes.spec.ts`
  全件・`e2e/compare.spec.ts` 全件（desktop+mobile）・`e2e/parcel.spec.ts` /
  `e2e/parcel-split.spec.ts` 全件（desktop+mobile）・`e2e/a11y.spec.ts` /
  `e2e/api.spec.ts` / `e2e/assumed-weights.spec.ts` / `e2e/pages.spec.ts`
  （desktop）を実行し、すべて green（layout修正後）。フルマトリクスはCIに委ねる。
- mutation証明: `courier-destination-fees` 行を意図的に復元する変異を入れ、
  新規テスト（`fuel-remote-surcharge-split.test.ts` 他）が5件中4件検出して落ちる
  ことを確認 → 復元 → `git diff` が該当箇所で空であることを確認。
  `RankBoard.leadWordFor()` を常に `'CHEAPEST'` を返す変異に書き換え、
  `RankBoard.leadWord.test.ts` が1件検出して落ちることを確認 → 復元 → 空diff確認。

## 11. 未確認のまま残していること

- 燃油・遠隔地サーチャージの実際の契約率・込み/別立ての一次情報は、依然として
  取得できていない（`pending_test` はC11・C12の両方に残ったまま）。
- 「後出し請求」を燃油込みの前提に吸収する判断（§4）は一次情報に基づかない。
