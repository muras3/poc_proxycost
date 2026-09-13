# 監査: `rankIndeterminate` は「決められない答え」を本当に決めさせないか

2026-09-13。対象: `src/lib/pricing/compare.ts` の `Row.total`／`Row.rankHigh`／
`rankIndeterminate`／`excluded`／`WhatCouldBeOff`。監査であり修正ではない
（実装は変えていない。テストは2件追加した——後述）。

before: `npx vitest run` **927 件 green**。after: **929 件 green**（追加テスト2件のみ。
既存テストへの変更は無し）。`npx tsc --noEmit` エラー無し。`npm run lint` エラー無し。

---

## 結論を先に

**Q: 今日、エンジンが正当化できない「最安」を名指しする条件は存在するか？**

**存在する。** しかも構成されたコーナーケースではなく、**既定の呼び出し方
（`method: 'cheapest'`、`DEFAULT_METHOD`）で普通に起きる。**

具体例（`src/lib/pricing/rank-indeterminate-audit.test.ts` に固定）:

```
compare({ method: 'cheapest', items: [1点, 600g, ¥3,000], country: 'US' })
```

- FROM JAPAN が下端最小（＝最安）になる。
- FROM JAPAN の `rankHigh` は `null`（外注梱包費 `outsourced-packing` が
  社固有の未取得行——`scope: 'shared'` ではない——で青天井）。
- にもかかわらず `result.rankIndeterminate` は `false`。
- 画面（`RankBoard.tsx` `diffText`）は `rankIndeterminate` **だけ**を見て
  「CHEAPEST」か「LEADS」かを選ぶので、この行には修飾なしの緑太字
  「CHEAPEST」が出る。

500g〜8,000g・3カ国以上・複数価格帯・`method: 'ems'`/`'cheapest'` の掃引で
**1万件を超える組み合わせ**が同じ形（FROM JAPAN が最安で `rankHigh === null`）
に当たった（掃引スクリプトはリポジトリに残していない——§9「一時ファイルを
作らない」に従い、手順だけここに記録する）。FROM JAPAN は最も安いことが多い社
（外注梱包費という社固有の未取得行を持つ、まさにその社）なので、これは稀な
巻き込みではなく、**構造的に頻発するパターン**だと判断する。

原因は `isIndeterminate`（compare.ts）の条件が狭すぎること:

```ts
function isIndeterminate(rows: Row[]): boolean {
  const comparable = rows.filter((r) => r.comparable);
  return comparable.length > 1 && comparable.every((r) => r.rankHigh == null);
}
```

「比較可能な**全社**の `rankHigh` が `null`」という、実務上ほぼ到達しない
グローバル条件でしか真にならない。**「今の1位（下端最小、同着含む）自身の
`rankHigh` が `null`」という、はるかにありふれた条件では真にならない。**
このコメント自体（compare.ts 2040-2044行）が「米国は現状これに該当しないので
`rankIndeterminate` は `false` になる」と明言しており、書いた人もこの分岐が
米国では発火しないことを知っていた——だが「1位自身が unbounded」というケースは
別に検討されていない。

対照的に `computeBracket`（同ファイル）は同じ状況を正しく扱っている:
1位自身の `rankHigh` が `null` だと `bound` が伸びず、`bound ?? Infinity` の
フォールバックで次点以下を無条件に枠へ通す——つまり**「1位の総額はどこまで
伸びるか分からないので、次点も同格として扱う」**という判断はコード上すでに
存在する。ところが `RankBoard.tsx` の見出しの言葉（「CHEAPEST」か「LEADS」か）
は `rankIndeterminate` だけを見ており、`computeBracket` が下した「実は同格」
という判断を一切参照しない。**同じ1回の計算結果の中で、バッジは「どちらでも
良い」と言い、見出しの太字緑は「これが確実に安い」と言う——2つの表示が
互いに矛盾している。** これが PR #93 と同じ種類の欠陥である理由: 数値は
（この場合は）壊れていない——`total.low`／`rankHigh`／`recommended` はどれも
正しく計算されている——が、**それらを合成して1語の断定に落とす最後の一段
（`isIndeterminate`）が、他の判断（`computeBracket`）と矛盾する狭さで書かれて
いる。**

---

## ケース1: 区間が重なる（候補行自身の `high` は判定に入らない）

**やったこと**: `overlapsLeader`（compare.ts 1908行）を直接読み、
`row.total.high` を一切参照せず `rowLow <= leaderHigh` の1本の不等式だけで
判定していることを確認した。関数直上のコメント（1896-1907行）がこれを仕様として
明記している——候補行自身が上限不明でも判定は変わらない、という文書化された
決定（`docs/ROADMAP.md` の論点への回答、と本文に明記）。

**正しいか**: 正しい。判定不能ラベルを付けるべきかは「1位側がどこまで
伸びうるか」だけで決まる話であって、候補行自身の上限の有無は無関係
——候補行の下端がすでに1位側の上限内にあるなら、候補行の総額が実際に
どこで確定しようと1位と重なりうるという結論は変わらない。候補行の `high`
を条件に混ぜると、「候補自身が上限不明なら自動的に枠へ通す／通さない」
という無関係な副作用が生まれる。

**確かめ方**: `overlapsLeader` の実装を読み、シグネチャが
`(rowLow: number, leaderHigh: number)` で `Row` 全体でなく数値2つしか
受け取らないこと自体が「候補行の `high` は構造的に見えない」ことを保証して
いると確認した。既存テスト（`compare.test.ts` 2637行台のコメント含む、
複数の `overlapsLeader`/bracket 関連テスト）はこの境界条件を継続的に検査
している。

---

## ケース2: 1社の未知が unbounded（1位ではない社）

**やったこと**: 「1位ではない社の `rankHigh === null`」が `rankIndeterminate`
を動かすかを、`isIndeterminate` の実装とテストで確認した。

**エンジンの挙動**: **動かさない。**1位でない社の `rankHigh` は
`isIndeterminate`（全員が `null` でなければ真にならない）にしか効かず、
1社だけが `null` でも他が非 `null` なら判定不能にはならない。

**正しいか**: **正しい。**課題文が指摘する通り「1位でない社の未知が
unbounded」は、その社が**1位より安いかもしれない**ことを意味しない
——`total.low` はどの社にとっても「確実にこれ以上」という下限であり、
2位以下の社の下限が1位の下限を上回っている以上、その社の unbounded な
上限は「もっと**高く**なりうる」方向にしか効かない。1位を脅かす方向の
不確かさではないので、この社1つで全体を判定不能にする理由はない。
——ただし、これは「1位**自身**が unbounded」なケースとは別の話であり、
上の「結論を先に」で示した通り、そちらは正しく扱われていない。

---

## ケース3: 共通の未知が大きい（`scope: 'shared'` の畳み込みと、その逆）

**やったこと**: 2つを検査した。

1. `scope: 'shared'` な未取得行が `rankHigh` で0に畳まれ、`total.high` では
   引き続き `null`（未確定）のままであること。
2. その逆——**本当は全5社に等しくかかる未知なのに `shared` が付いていない
   行**、または**社固有なのに `shared` が誤って付いている行**が無いか。

**(1) の確認**: ミューテーションテストで確認した。`rankHighFor` の
`if (l.scope === 'shared') continue;` を削除して `npx vitest run
src/lib/pricing/compare.test.ts` を再実行すると、**9件が real に失敗**した
（例: `an unbounded leader (leader.total.high === null) does not swallow
everyone` が `['zenmarket']` を期待して `['zenmarket', 'jauce']` を返す）。
このミューテーションは検査に確実に捕まる——ここは安全。`total.high` 側は
`totalRange()` が `scope` を一切見ない別関数なので、`shared` の有無に
関わらず未取得行があれば `null` のまま。これも読んで確認した
（`totalRange()` は91行未満、`rankHighFor` とほぼ同型だが `scope` 分岐が無い）。

**(2) の確認**: `compare.ts` 中で `L(...)` に `'shared'` を渡している箇所を
全て列挙した（5箇所、379-381・469-472・550-553・594-601・615-619行）:

| 行 | 費目 | scope が正しいと言える根拠 |
|---|---|---|
| duty（税率未公表） | 関税率そのものが国の制度で未公表 | どの社を使っても同じ関税率表を引く。会社に依存しない |
| vat（連邦売上税なし） | 米国に連邦売上税が無いという制度の話 | 同上 |
| clearance（帯が無い） | マスタに帯そのものが無い | 帯は国の通関手数料表の話で、会社の運用ではない |
| UK excise（酒税、ABV不明） | 英国が金額を問わず酒類に課す税 | 課税されるかどうかはカートの中身（品目）で決まり、会社を経由しない |
| duty-prepayment（Zonos） | 日本郵便が米国宛の郵便物に課す事前納付 | `isCourier` で既に宅配便を除外しており、郵便を使う社全員に同一額でかかる日本郵便自身の制度 |

5件とも「国の制度」または「日本郵便自身の制度」で、会社の裁量が入る余地が
無い——**誤って `shared` を付けている行は見つからなかった。**

逆方向（社固有なのに `shared` が付いていない）についても、`shared` を
**持たない** null 行を洗い出した: `storage`（保管料、816行、会社ごとの
無料日数が違う）、`svc.unpricedFees`（1377行、会社ごとの未公表手数料）、
`consolidationUnpricedFee`（1384行、Buyee 固有）、
`courier-destination-fees`（1448行、宅配便の燃油/遠隔地サーチャージ——
「日本郵便はこの行を持たない」とコメントが明記する通り会社群で持つ・
持たないが割れる）。**これらはどれも会社によって額・有無が変わりうる
費目で、`shared` を付けていないのは正しい。**

**結論**: `shared` フラグの割り当ては、見た限り正しい方向に倒れている
（危険な方向＝社固有をシェアド扱いする、は見つからなかった）。

---

## ケース4: 同着・僅差

**やったこと**: `rank()`／`computeBracket`／`tied` の実装を読み、既存テスト
（`compare.test.ts` の「a tied row says so」「a tie at the top puts both tied
companies in the bracket」「a tie for 1st exactly at the 2-company cap」など）
を確認した。

- 同着の判定は `total.low` の等値のみ（第2キー無し）。
- 並び順は `Array.prototype.sort` の安定性に依存しており、入力配列
  （`SERVICES` の宣言順）が固定である限り、複数回実行しても同じ順序になる
  ——`sort` はどのブラウザ/Node実装でも ES2019 以降 stable が仕様で保証されて
  いる。
- 同着が枠の上限（2社）を超えるときは「下端の昇順（＝同額の中では入力順）で
  先頭だけ枠へ」と明記されており（1934行のコメント）、`equivalent` に落ちた
  残りも印がちゃんと付く。

**正しいか**: 正しい。同着を「たまたま先に組み立てられた行が勝つ」ように
読ませる余地は無い——`tied` フラグが必ず立ち、画面もそれを表示する
（`RankBoard.tsx` の `tiedText`）。決定性もコード構造上保証されている。

---

## ケース5: オーナーが最も気にしている4件の仮置き（燃油・遠隔地・ゼロ税額の通関手数料・per-shipment単位）

**確認したこと**: これら4件は `docs/ROADMAP.md` に索引化された**仮定**であり、
`compare.ts` の中で**行として一切現れない**——郵便（EMS）便の場合、燃油・
遠隔地サーチャージは日本郵便の公表料金表にそのまま織り込まれている前提で、
未取得行にもならず `excluded` にも載らない。1447-1452行のコメントが
これを裏付ける:「**日本郵便はこの行を持たない**ので、Japan Post の総額は
この費目では開かない」——`courier-destination-fees`（燃油/遠隔地の未公表を
表す null 行）は `isCourier` の場合にしか作られない。郵便を使う行では、
燃油・遠隔地は**未取得行にすらならず、確度を落とすものが何も無い。**

`WhatCouldBeOff`（`missing` リスト、35行）は `l.amount == null` な行の
ラベルを集める作り——**行そのものが存在しない費目は原理的に拾えない。**
これは課題文が指摘する「行が無ければ表面化できない」非対称性そのもので、
コードを読んで実際にその通りだと確認した。

**この設計は正しいか——率直に述べる**: **正しくない可能性が高い、少なくとも
非対称。**同じ「未公表のキャリア追加料金」という性質の不確かさが、
宅配便では明示的な unbounded 行（`courier-destination-fees`）として
`total.high` を開き `excluded` に載るのに、郵便（EMS）では**同じ性質の
不確かさが存在しないかのように扱われる。**燃油サーチャージが本当に
EMS料金表の中に既に織り込まれているなら（郵便事業体の運賃はしばしば
サーチャージ込みで公表される）現状の扱いは正当化できるが、**それを
確認したという記録がどこにも無い。**タスク文が言う通り、もし本当に
一部が公表価格から漏れているなら、誤差は送料の20〜30%規模になりうる
——多くのランキングの逆転幅を上回る。**したがって現状「燃油はEMS料金に
織り込み済みと確認した」のか「確認していないが、行が無いので何も
起きていないように見えているだけ」なのかを、この監査だけでは判定できない
——`master/*.json` の出典を辿る追加調査が要る。**確かなのは「今のコードは
これを不確かさとして一切扱っていない」という一次の事実で、それをオーナーの
判断材料としてここに記録する（本ファイル §9「状況は理由にならない」に
従い、断定はしない）。

---

## テストが捕まえられないインデターミナシー・ロジックの全項目

指示通り「壊れても今のテストが検知できない箇所」を列挙する。

1. **`isIndeterminate` の真の側が一度も検査されていない。**
   `compare.test.ts` 全体で `rankIndeterminate` への言及は
   すべて `toBe(false)`（grep で確認、1件の例外なし）。ミューテーションで
   確認済み: `isIndeterminate` の本体を `return false;` に置き換えても
   `npx vitest run src/lib/pricing/compare.test.ts` は 164 件全て green
   のまま——`isIndeterminate` がバグって「絶対に真にならない」関数に
   なっても、テストスイートはそれに気づかない。PR #93 が見つけた
   「検査が検査になっていない」パターンと同型。
   （本PRで追加した `rank-indeterminate-audit.test.ts` の1つ目のテストは
   `rankIndeterminate` の値そのものを固定するが、これは「1位自身が
   unbounded でも判定不能にならない」という**今の**挙動を記録するテストで、
   `isIndeterminate` が真になる場合を検査するテストではない——後者は
   `comparable.length > 1 && every(rankHigh==null)` を満たすフィクスチャを
   要求で作らないと書けず、本監査では見つけられなかった。少なくとも
   `isIndeterminate` の**正の分岐**を1件も踏まないテストスイートは、
   その分岐が壊れても気づけない。）

2. **「1位自身が unbounded」の非対称は、今回追加したテストまで無検査
   だった。**上の「結論を先に」の欠陥は、既存927件のどれにも捕まらず、
   このテストを書いて `compare()` を実際に呼ぶまで気づかなかった
   （手順の指示どおり「実行して確認」した結果）。

3. **`RankBoard.tsx` の「CHEAPEST」/「LEADS」表示ロジックには専用のUIテスト
   が無い。**`grep -rn "rankIndeterminate" src/components` はヒットするが
   `RankBoard.test.tsx` に類するファイルは存在しない
   （`find src/components/compare -name '*.test.*'` で確認、該当0件）。
   `diffText`／`row.cheapest && !result.rankIndeterminate` の色分けは
   `compare()` が返す値を正しく解釈しているかどうかを直接検査するテストが
   無く、`compare.ts` 側の値が正しくても UI 側で握り潰す/取り違える変更が
   入っても、単体テストでは気づけない（本監査は Chromium プローブでの
   目視確認までは実施していない——時間の制約上、ソース読解のみ。
   `docs/audit/` の他監査が使っている `next build --webpack` +
   `next start` + Chromium 手動プローブの手順は今回実施していないと
   明記する）。

4. **`WhatCouldBeOff` の tier ベースの列挙が、`scope: 'shared'` の
   国別制度未知（duty-prepayment・UK excise 等）を「Not included」に
   正しく載せているかを直接検査するテストは無い**（`compare.test.ts`
   に `excluded` の中身を国別に検査するテストは複数あるが、
   `WhatCouldBeOff.tsx` 自体の出力を検査する専用テストは
   `find src -name 'WhatCouldBeOff*'` で見た限り無い）。

5. **ケース5の「行にならない仮定」は、定義上どのテストからも見えない。**
   これはテストの不備というより設計上の必然——行が存在しない以上、
   その行の欠落を検査するテストの書きようが無い。もしオーナーが
   §5の非対称を是正する場合（例えば EMS 側にも燃油の不確かさを行として
   持たせる）、そのときは初めて回帰テストが書けるようになる、という
   意味で記録しておく。

---

## 追加したテストについて

`src/lib/pricing/rank-indeterminate-audit.test.ts`。ランキング・UI ロジックは
一切変更していない——2件とも今の `compare()` の出力を固定するテストで、
「あるべき姿」を強制していない。

1. `US / 'cheapest' / 600g / ¥3,000`: FROM JAPAN が単独最安になり、
   `rankHigh === null`（社固有の外注梱包費が原因）でも
   `rankIndeterminate === false` のままであることを固定する。
2. 同じケースで、`computeBracket` が正しく次点を枠へ引き込む
   （1位自身が unbounded なので `bound` が伸びず、Infinity フォールバックが
   効く）ことを固定し、それでも見出しの「CHEAPEST」の言葉は
   `rankIndeterminate` だけで決まる——2つの信号が食い違うことを明示する。

`npx vitest run` は 927 → **929**（追加2件のみ、他は無変更）。
