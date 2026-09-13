# コメントの虚偽と検査の抜け道 監査（2026-09-13）

**担当スコープ**: コードは変更しない。洗い出しのみ。`src/lib/pricing/`・`src/components/`
の JSDoc/コメントと `docs/` の主要文書を対象に、コードの実態と食い違う記述、および
「通っているが検査になっていない」型の欠陥を探した。

**判定**（先出し）:

- **判断を誤らせる記述が 5 件ある**（すべて重大 = 実装状況を逆に伝えている。
  「まだ宅配便データが無い」「US しか測っていない」という、`services.ts` の
  実データと直接矛盾する記述）。
- **検査の抜け道は 0 件だった。** `KNOWN_UNRESOLVED_MISMATCH_IDS` は除外ではなく
  記録として機能している（実際のテストコードで確認済み、下記）。`skip`/`todo`/
  `only`/`fixme`/コメントアウトされたテストは実質ゼロ（project-scoped skip 5件のみ、
  いずれも正当）。`expect` の無いテストは AST 解析で 0 件（ヒューリスティックな
  初回スキャンで検出した候補はすべてヘルパー関数への委譲で、ヘルパー内部に
  `expect` があることを確認済み）。CI の `all-green` は shard 全体とテスト全体を
  実際に走らせており、緑を偽れる経路は見つからなかった。

---

## 表1: コードの実態と食い違う記述

| # | 場所 | コメントの主張 | コードの実態 | 種別 |
|---|------|----------------|--------------|------|
| 1 | `src/lib/pricing/services.ts:324` | 「測ったのは US のみ（P2 2、オーナー確定）——他国へこの列を持ち越さない。」 | 同じファイル内の16の宅配便ブロックすべてで `weightPointsByCountry` に複数国が入っている。実測（AST走査による集計）: US 16/16, GB 14/16, FR 14/16, AU 15/16, SG 15/16, CA 10/16, DE 9/16。コミット `91b9532`（PR #87、「宅配便の実測料金を7カ国すべてに配線する」）が入れた。 | **重大：実装済みを「未実装」と逆に伝える** |
| 2 | `src/lib/pricing/services.ts:303-304` | 「このPR時点でどの社にもデータを入れていない。データは並行作業者が `master/courier-rates.json`（別ファイル）で取っている。ここは器だけ。」（`MeasuredPostageRate` インターフェース自体のコメント） | 同じファイルに16ブロック分の実データ（重量点・価格）が直接書かれている。「器だけ」ではない。 | **重大：同上** |
| 3 | `src/lib/pricing/services.ts:371-374` | 「宅配便（P2）。このPR時点ではどの社も空——並行作業者がデータを取っている間、コード側は『器』だけを用意する。〜全社が空の間は、この計算機の挙動はこのPRの前後で1円も変わらない。」（`Service.courier` フィールドのコメント） | `SERVICES` 配列の各社エントリに `courier` オブジェクトが値付きで存在する（16ブロック）。挙動は変わっている——`compare.ts` の courier 選択ロジックが実際にこれらの値を使う（`docs/ROADMAP.md` PR #87 の記述と整合）。 | **重大：同上** |
| 4 | `src/lib/pricing/postage.ts:328-329` | 「P2: 宅配便（`MeasuredPostageRate`）。〜このPR時点ではどの社にもデータが無い（`services.ts` の `Service.courier` コメント参照）ので、以下は『器』であって、実際に選ばれることはまだ無い。」 | 同上。`services.ts` 側のコメント（#2, #3）を参照して同じ誤りを継承している——参照先自体が古いので、この参照は虚偽を虚偽で裏書きしている。 | **重大：同上（連鎖）** |
| 5 | `src/lib/pricing/courier-postage.test.ts:9-10` | 「P2: 器そのものの単体テスト。**このPR時点でどの社にも宅配便の実データを入れていない**（コーディネーターの指示——データ取り込みは別PR）ので、`courierPriceFor` 系は引き続きフィクスチャ。」 | 同上。ただしこのファイル自体は `SERVICES` 本体（実データ入り）を使ってテストしているとコメントの直後（11-13行目）に書いてあり、**同一コメント内で自己矛盾**している（「実データが無い」と言いながら「`SERVICES` 本体を使う」と続けている）。 | **重大：同上、かつ自己矛盾** |

**照合できなかったもの**: `docs/` 配下の PR番号・行番号参照は今回全件は照合していない
（`docs/ROADMAP.md` は逆に、PR #87 で7カ国配線済みと正しく最新化されており、
古い記述には取り消し線と「訂正」注記を自ら付けている——`docs/ROADMAP.md:93` 等。
つまり**このリポジトリの `docs/` は誠実に自己訂正する運用がされているが、
`src/lib/pricing/` 内のコード直書きコメント5箇所だけがその更新から取り残された**）。

`countries.ts:141,233,390` の「未実装」表記、`master-sync.test.ts:574` の F13b
「まだ実装されていない」は、それぞれ実コードで裏を取った——**いずれも実態と一致**
（F13b: `unpricedFees` に `free-shipping` キーが無いことを grep で確認済み）。
これらは表1に載せていない。

---

## 表2: 検査の抜け道（該当なし・確認した事実のみ）

| # | 対象 | 確認方法 | 事実 | 抜け道か |
|---|------|----------|------|----------|
| 1 | `KNOWN_UNRESOLVED_MISMATCH_IDS`（`src/lib/pricing/calculator-oracle.test.ts:94-99`） | テストコード読解＋実行（`npx vitest run … --reporter=verbose`） | 実行結果: `total 160, match 156, differ_named 0, differ_unexplained 4, not_comparable 0`。4件は `jauce:CA:500g:ems` / `jauce:CA:500g:surface` / `jauce:GB:500g:ems` / `jauce:GB:500g:surface`。テスト101-104行目は `unexplainedIds` が `KNOWN_UNRESOLVED_MISMATCH_IDS` と**完全一致（`toEqual`）**することを要求——集合が真部分集合でも上位集合でも失敗する。さらに106-117行目の `it.each` は**個々の観測ごとに** `differ_unexplained` なら既知集合に含まれることを要求し、それ以外は `match`/`not_comparable` のみ許す。 | **除外ではない。**新しい不一致が1件でも出ればテストが落ちる。逆に既知の4件が消えても（再測定で解消しても）テストが落ちる（集合の完全一致要求のため）——**記録として機能しており、緑を偽る効果は無い。** 「156/160 一致」という言い方は正確で、除外後の数字ではない（4件は不一致として明示的にカウント・報告されている）。 |
| 2 | `skip`/`todo`/`only`/`xit`/コメントアウトされたテスト | `grep -rn` (`.skip(`, `.todo(`, `.only(`, `xit(`, `xdescribe(`, `test.fixme`) をリポジトリ全体（`src/`, `e2e/`）に実行 | 見つかったのは `test.skip(testInfo.project.name !== 'desktop', …)` / `!== 'mobile'` の**5件**（`e2e/parcel.spec.ts:524,554`、`e2e/compare.spec.ts:1244,1368`、`e2e/a11y.spec.ts:32`）。いずれも「このテストは desktop/mobile 専用」という**プロジェクト分岐**で、対象外プロジェクトでの重複実行を止めるだけ——該当プロジェクトでは必ず実行される。`.only`・`.todo`・`xit`・コメントアウトされた `it(`/`test(`/`describe(` はゼロ件（grep 0 hit）。 | **抜け道ではない。**5件とも検査対象を減らしていない（同じ検査が別プロジェクトで重複実行されるのを防ぐだけ）。 |
| 3 | CI (`all-green` の依存先が全体を走らせているか) | `.github/workflows/ci.yml` を読解 | `fast` ジョブが lint/typecheck/`npm test`(vitest 全体)/`master/validate.py`/`master/render-docs.py --check` を実行。`e2e` ジョブは `--shard=N/4` で4分割・`fail-fast: false`（1つ落ちても残りも走る）。`retries` は明示的に0（`playwright.config.ts`、コメントに「再試行で不安定さを隠さない」と明記）。`continue-on-error` はどのステップにも無い。`all-green` は `needs.fast.result` と `needs.e2e.result` の両方が文字列 `'success'` であることを要求（`skipped`/`cancelled`/`failure` はすべて非成功として扱われる）。`--passWithNoTests` 相当のフラグや除外パターン（`--ignore`, `testPathIgnorePatterns` 等）は `package.json`・`vitest.config.ts`・`playwright.config.ts` のいずれにも見当たらない。 | **抜け道になる経路は見つからなかった。** |
| 4 | `expect` の無いテスト | TypeScript AST（`typescript` パッケージの `createSourceFile`）で `it(`/`test(` 呼び出しを機械的に列挙し、`skip`/`todo`/`fixme`/`beforeEach`/`afterEach` を除外した上で本文に `expect(`/`toPass`/`toMatchSnapshot` が無いものを検出 | 最終検出件数 **0件**。（正規表現ベースの粗いヒューリスティックでは一時117件・その後60件の誤検出が出たが、いずれも `it.each` の呼び出し形の誤爬羅、`test.beforeEach` の誤マッチ、または `noJapanese(page, path)` / `e.assertNotInCode()` / `e.read()===e.expect()` のようなヘルパー関数への委譲で、ヘルパー本体を個別に読んで `expect` があることを確認済み——`e2e/pages.spec.ts:22-32` の `noJapanese` 定義を実際に読んで確認。） | 該当なし |

---

## 結論

- **判断を誤らせる記述が 5 件ある（うち重大 = 実装状況を逆に伝えているもの 5 件）。**
  すべて「宅配便データがまだ無い／US しか測っていない」という同一系統の誤りで、
  `services.ts` 3箇所・`postage.ts` 1箇所・`courier-postage.test.ts` 1箇所に
  残存している。実データは PR #87（コミット `91b9532`）で7カ国に配線済み。
- **検査の抜け道は 0 件（うち、緑を偽れるもの 0 件）。** `KNOWN_UNRESOLVED_MISMATCH_IDS`
  は除外ではなく完全一致アサーションによる記録。skip はプロジェクト分岐のみ。
  `expect` の無いテストは無し。CI はシャード・ジョブとも全体を走らせている。

**一言の判定**: このコードベースの検査体制（テスト・CI）自体は誠実に機能しており、
「テストが通っている」が「検査できていない」ことを意味する箇所は見つからなかった。
一方で、**コメントは実装から取り残されている**——特に宅配便データの状態について、
3ファイル5箇所が「まだ無い」と言い続けており、これが実際に複数のエージェント・
コーディネーターを誤った結論（「宅配便は米国だけ」）に導いた実例がある
（オーナー指摘の `services.ts:324` がその発端）。**「今の計算モデルは穴だらけか」
という問いに対する答えを歪めているのはコードでも検査体制でもなく、これらの
古いコメントである。**

## 修正提案（今回は書くだけ・実施しない）

1. `services.ts:303-304, 324, 371-374` と `postage.ts:328-329` の「まだデータが無い」
   系のコメントを、PR #87 以降の実態（7カ国配線済み、国ごとのカバレッジは
   US16/GB14/FR14/AU15/SG15/CA10/DE9）に書き換える。
2. `courier-postage.test.ts:9-10` は同じファイル内で直後に矛盾する記述（`SERVICES`
   本体を使うと明記）があるので、コメント自体を「実データを使うテストに移行済み」
   に更新する。
3. 恒久対策として、`master-sync.test.ts` に既にある「マスタとコードの整合性を
   assert するテスト」の手法を流用し、`services.ts` のコメントが参照する事実
   （国のカバレッジ数など）をテストでも検算できないか検討する余地がある
   （このPRでは実装しない、提案のみ）。
