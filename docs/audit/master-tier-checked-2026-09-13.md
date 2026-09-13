# master/fees.json の tier と src/ の Tier を突き合わせる（PR #137、2026-09-13）

## 発端

Fable 5.1（PR #137 の監査）: `master/fees.json` の `tier`（`A_confirmed` /
`B_inferred` / `C_unknown`）が、どのテストにも検査されていなかった。
`master/fees.json` の tier を5行書き換えて走らせたら 5/5 生存、1,100件すべて通った。
すでに食い違いが3行あると報告していた:
`F02`/buyee、`F26`/zenmarket、`F26`/neokyo（master は `B_inferred` だが code は
`fixed`。`F26` は `exportClearanceLine()` が全社一律で `'fixed'` を付けていた）。

## 1. 現状の確定 ── 食い違いは何件だったか

**機械的な全件突き合わせの結果、食い違いは4件だった（3件より多い）。**

対象は `master-sync.test.ts` の `MAPPED` バケット（42件）── コードに対応する値が
実在する行だけ。`NOT_IN_CODE`（29件）は定義上コード側に対応する値そのものが無い
ので tier の比較が成立しない（既存の「網羅性」テストが MAPPED/CONFLICT/NOT_IN_CODE
の3バケットで `fees.json` の全80行をちょうど1回ずつ覆うことを保証しているので、
この境界は恣意的な選び方ではない）。MAPPED 42件のうち、対応する src の値が
真偽値・null・重量表の日数など tier を持たない型のもの（`chargedPerDistinctItem`
など）を除いた19件を実際に読み比べた。

| # | 行 | master tier | 直す前の code tier | 対応表どおりの期待値 | 判定 |
|---|---|---|---|---|---|
| 1 | F02/buyee 購入手数料 | B_inferred | fixed（`fee.tier` を F12 と共有） | unverified | **食い違い（Fable報告済み）** |
| 2 | F26/zenmarket 輸出通関手数料 | B_inferred | fixed（全社一律） | unverified | **食い違い（Fable報告済み）** |
| 3 | F26/neokyo 輸出通関手数料 | B_inferred | fixed（全社一律） | unverified | **食い違い（Fable報告済み）** |
| 4 | F07/jauce 入金手数料 | A_confirmed | unverified | fixed | **食い違い（今回新規に発見）** |
| 5〜19 | F12/buyee・F26/buyee・F26/fromjapan・F26/jauce・F09/jauce・F06/fromjapan・F14/neokyo・F14/jauce・F14/zenmarket・F36/buyee×2・F36/zenmarket×2・F36/neokyo・F36/fromjapan・F30/fromjapan | A_confirmed | fixed | fixed | 一致 |

4件目（F07/jauce）は今回のこの調査で新たに見つけた。ただし後述のとおり、
**これは他の3件と性質が違う**ため直す方向を分けている（§4参照）。

**確認していないこと**: MAPPED 42件のうち、上表に無い残り23件（`chargedPerDistinctItem`
等の真偽値・`storage` の日数・`domesticIncluded` など tier を持たない型の値）は
tier比較の対象にできないので確認していない。これらは「tier概念が無い値」であって
「見落とした」わけではないが、断定はしない。

## 2. 語彙の対応表と根拠

`src/lib/pricing/tier-vocab.ts` に置いた（唯一の定義箇所）:

```
A_confirmed → fixed
B_inferred  → unverified
C_unknown   → none
```

根拠（`src/lib/ui/tiers.tsx` の `tierTitle` の文言から読み取った）:

- **A_confirmed → fixed**: どちらも「その社（または日本郵便）が公式に明記した値」。
  A_confirmed の条件は quote 付き、fixed の定義は「公開料金表・公表料金」── ほぼ同義。
- **B_inferred → unverified**: `unverified` の定義は「二次情報。原典に当たれていない」。
  B_inferred の実例（F26/zenmarket・F26/neokyo・F36/fromjapan 等）はいずれも、
  **その社自身の一次情報を確認できていない**まま他社の確定値や日本郵便の公表表を
  借りて推論している状態で、`unverified` の定義に正確に一致する。
- **C_unknown → none**: `none` の定義は「未取得。画面では『—』」。C_unknown は
  quote も inference_basis も無い、額そのものが取れていない行で、定義が完全一致。

**一対一にならない点**: `Tier` は4値だが master は3値。`estimate`
（「我々自身の仮定」）に対応する master 語彙は無い── `estimate` は主に、その社の
値ではなく別の社/我々の暫定値を借りた行（例: Buyee/Neokyo/FROM JAPAN の入金手数料。
これらは master 側では「非公表」という**事実の記録**であって額を持たない
`NOT_IN_CODE` 行）に使われており、そもそも比較対象の master 行自体が存在しない。

**この対応表の外に置いた例外が2件ある**（無理に押し込めなかった）:

1. **ZenMarket ヤフオク¥800**（`T-F11a`、既存）: 同じ B_inferred でも性質が違う。
   その社自身の公式ページの quote は確認できている（¥800という額そのものは
   一次情報）。不確かなのは「その分類（JDirectItems Auction）がヤフオクを指すか」
   という**我々の解釈**であって、原典に当たれていないことではない。
   `tierTitle.estimate`（"Our estimate, not a published figure"）の方が実態に
   近いので、コードは `estimate` のまま（変更していない）。
2. **F07/jauce 入金手数料**（今回新規）: 額（¥40 + 3.9%）自体は
   `quote: "JPY 40 + 3.9% over the deposit amount"` で A_confirmed。だがコードの
   コメントが明記するとおり、「¥40が先に乗り、その上で率がgross-upで効く」という
   **計算式の解釈**は原文で確認できていない。額の確度（A_confirmed）と計算式の
   解釈の確度は別軸で、`tier` という1つのフィールドしか無い master には
   この区別を表せない。**安全側（確度の低い方）に寄せ、code を `unverified` の
   まま変更しなかった**── gross-up 解釈を裏付ける一次資料URLを示せないため、
   確度を上げる方向には寄せられない（コーディネーター指示 §9 のとおり、
   状況（quoteがあること）だけでは計算式の解釈が正しい理由にならない）。

## 3. `master-sync.test.ts` に足した検査 ── mutation で実証

`src/lib/pricing/master-sync.test.ts` に `TIER` セクションを追加した（19件、
上表の1〜19行に対応）。`readMasterTier()` は必ず `findRow(...).tier` を
その場でファイルから読み、`MASTER_TIER_TO_CODE_TIER` で変換して `readCodeTier()`
と比較する── T-F0 と同じ設計（期待値をベタ書きしない・master を唯一の出典とする）。

**mutation の実施と復元**:

1. `master/fees.json` の F36/buyee「AU GST 代理徴収」の `tier` を
   `A_confirmed` → `C_unknown` に書き換えて `npx vitest run -t TIER` を実行 →
   **落ちた**（`expected 'fixed' to be 'none'`）。
2. `git diff` で変更を確認後、バックアップから復元。`git diff master/fees.json`
   が空であることを確認済み。
3. 逆方向も確認: `services.ts` の `perOrderYenTier: 'unverified'` を一時的に
   `'fixed'` に書き換えて同テストを実行 → **落ちた**
   （`expected 'unverified' to be 'fixed'`）。`git checkout` で復元。

**両方を同じ方向に書き換えたら通ってしまう構造にはなっていない**── テストは
master の値をその場で読み直すだけで、期待値そのものを保持していないので、
どちらか一方だけを直しても検出される。

## 4. 4件をどちらに寄せたか

| 行 | 判断 | 直した箇所 | 理由 |
|---|---|---|---|
| F02/buyee | **code を下げる**（fixed→unverified） | `services.ts`: `FeeModel.perOrderYenTier` を新設し `'unverified'` を設定。`compare.ts` の `purchase-fee` 行が `f.perOrderYenTier ?? f.tier` を読むよう変更 | master の根拠（2019年のBEENOSプレスリリース、7年前、現行ページ未再確認）を一次資料として確認した。¥500 という額自体を疑う材料は無い（Fable の mutation も額ではなく確度の欠陥として報告）ので額は変えない |
| F26/zenmarket | **code を下げる**（fixed→unverified） | `compare.ts`: `exportClearanceLine()` に `tier` 引数を追加し、`EXPORT_CLEARANCE_FEE_TIER_BY_SERVICE`（社ごとの定数）で切り替え | master の根拠（ZenMarket自身のページでの直接の quote が無く、他3社の一致からの推論）を確認した |
| F26/neokyo | **code を下げる**（fixed→unverified） | 同上 | 同上 |
| F07/jauce | **code は変更しない**（unverified のまま） | ── | §2 の例外2参照。額の確度（A_confirmed）と計算式解釈の確度は別軸。一次資料で gross-up 解釈を確認できていないので、確度を上げる方向には寄せない（安全側に留める） |

F26 の buyee/fromjapan/jauce（A_confirmed）は変更していない
（`EXPORT_CLEARANCE_FEE_TIER_BY_SERVICE` で `'fixed'` のまま）。

## 5. `confidence` と `invoice_check` ── 今回繋いでいない

`master/fees.json` の各行が持つ `confidence`（一部の行にのみ存在、`invoice_check`
とは別のフィールド）と `invoice_check`（`never_checked` 等）は、**`src/` のどこにも
対応する値が存在せず、今回のPRでも繋いでいない。** 今回繋いだのは `tier` の3値
だけ。これらは別の作業（コーディネーター指示 §5）として残っている。

## 6. 画面表示が変わる費目

`src/lib/ui/tiers.tsx` の表示規則により、`fixed → unverified` は
**色は変わらず**（どちらも `text-neutral-900`／ダークは `text-neutral-100`）、
**`~` も付かない**（`~` は `tier === 'estimate'` のときだけ）。変わるのは:
- 下線: 点線の下線が付く（`decoration-dotted`）
- ホバー時の title: 「From the published price list」→「Second-hand source — we
  have not seen the original」
- `Row.approximate`（総額の `~` 表示）は `tier === 'estimate'` の行にしか
  反応しないため、**今回の変更はどの社の総額表示にも `~` を追加しない**
  （`compare.ts` の `approximate` 算出ロジックで確認済み）。

変わる行:
- Buyee の Purchase fee（`purchase-fee`）
- ZenMarket・Neokyo の Export clearance fee（`export-clearance`）

## 7. `all green`

ローカルで確認済み:
- `npx tsc --noEmit` ── エラー無し
- `npx vitest run` ── 35 files / 1120 tests 全通過
- `npm run lint` ── エラー無し
- `python3 master/validate.py` ── スキーマ通過・矛盾0件（今回の変更は `master/fees.json`
  を書き換えていないので無関係。fees.json は mutation テスト後に復元し `git diff` で
  差分ゼロを確認済み）
- Playwright（webpack ビルド、worktree ローカルポート 3152）: `e2e/compare.spec.ts`
  （desktop project、tier 表示のアサーションを含む #12 を含む）・`e2e/taxes.spec.ts`・
  `e2e/parcel.spec.ts` を実行し、desktop 側は全件通過（mobile project は今回のPRの
  変更と関係が無いこと・時間の都合でローカルでは走らせていない。CIのフルマトリクスで
  確認する）

CI は PR 作成後に確認する。`all green` ジョブの結果だけを見る（CLAUDE.md §6）。

## スコープ外・分からないこと

- `DormantCourierFee`（F27）には `tier` フィールドが無く、そもそも比較できない
  （画面にも総額にも出していない行なので実害は無いが、構造的な欠落として記録する）。
- MAPPED の残り23件（真偽値・storage日数など）は tier 概念を持たない値なので
  検査対象にしていない。
- `confidence` フィールド・`invoice_check` フィールドは今回繋いでいない（§5）。
