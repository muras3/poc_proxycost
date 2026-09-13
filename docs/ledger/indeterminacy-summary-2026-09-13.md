# 断定不能（rankIndeterminate）台帳 — 要約 (2026-09-13)

**このファイルの作り方（再生成の手順）**: `npx tsx scripts/indeterminacy-ledger.ts --date <日付>` で明細 CSV と中間 JSON を作り、`npx tsx scripts/indeterminacy-summary.ts --date <日付>` で本ファイルを作る。xlsx が要るときは続けて `python3 scripts/indeterminacy-xlsx.py --date <日付>`。費目を1つ埋めたら（`src/lib/pricing/` に一次情報を追加したら）同じ3コマンドを再実行し、下の「累積効果」の残件数が減っているかを見る——減っていなければ、埋めた費目が実は他の未取得行と同じ条件を同時にブロックしていなかったということ。

## 条件格子（このファイルが対象にした範囲）

- 国: US, GB, DE, FR, AU, CA, SG（7 か国）
- 重量: 200, 500, 1000, 2000, 3000, 5000, 8000 g（7 段）
- 商品価格: 3000, 10000, 30000, 60000, 100000, 150000, 250000 円（7 段）
- 品目数: 1 / 保管日数: 0 / site: mercari
- 条件数: 343（**サンプルであって「全パターン」ではない**——重量・価格は連続値で、上のリストはその上の代表点でしかない。多品目・保管日数 > 0 の効果はこの格子には入っていない。）

**rankIndeterminate: 297/343（86.6%）** ／ 断定できた: 46/343（13.4%）

オーナー言及の「297/343 (86.6%)」（Fable 5.1）は、本スクリプトを `site: mercari`（既定）で走らせると再現する。`site: yahoo-auctions` では 292/343（85.1%）になり、`docs/audit/fable-fix-readiness-2026-09-13.md` §5-6 が 書く「288/343（84%）」はどちらとも一致しない——同文書は site を明記しておらず、スイープに使ったスクリプトもリポジトリに残っていない（同 CLAUDE.md §5 の方針どおり）ため、288 との食い違いの原因は確認できていない（288 は `cheapest-by-total` 修正 (#143) 前の数字——本スクリプトは修正後の `compare()` を呼んでいる）。

**下の「1. 妨げている費目」の内訳（266 / 97 / 51、累積 297→131→51→0）は、`docs/audit/fable-fix-readiness-round2-2026-09-13.md`「297条件の内訳」節が手作業で数えた同じ内訳と1件残らず一致する**（1位行自身の未取得行だけを見る、という同じ方法論を使ったため——詳細は「限界」節）。

## 1. 妨げている費目ごとの件数（多い順）

| 費目 (key) | ラベル | 社（1社/複数） | 妨げている条件数 | tier | 出典 |
|---|---|---|---|---|---|
| courier-destination-fees | Destination-side courier fees (unpublished) | buyee, fromjapan, zenmarket | 266 | none | なし（公表されていない） |
| outsourced-packing | Outsourced packing | fromjapan, buyee, zenmarket | 97 | none | なし（公表されていない） |
| courier-clearance-fee | FedEx destination clearance fee (unknown) | zenmarket, buyee, fromjapan | 51 | none | あり（一次情報を当たれば埋まる） |

## 2. 累積効果（上位費目を埋めたら何件に減るか）

**近似**: ある条件が複数費目で同時にブロックされているとき、選んだ費目の集合がその条件のブロック要因を**全て**覆っていなければ「解消」に数えない（過大評価を避ける保守的な近似。詳細はスクリプトのコメント参照）。

| 上位n費目 | 埋めた費目 | 残る rankIndeterminate 件数 |
|---|---|---|
| 1 | courier-destination-fees | 297 → **131** |
| 2 | courier-destination-fees, outsourced-packing | 297 → **51** |
| 3 | courier-destination-fees, outsourced-packing, courier-clearance-fee | 297 → **0** |

## 3. 断定できている条件の偏り

断定できた 46 件の内訳:

国別: DE=13, FR=13, CA=9, AU=5, US=3, GB=3

重量別: 200g=22, 500g=15, 1000g=9

価格別: ¥60000=12, ¥100000=12, ¥150000=12, ¥3000=5, ¥10000=5

偏りが見えれば書く。件数がどこかの国・重量・価格帯に極端に寄っていれば、「断定できる条件」自体が代表的でない可能性がある。

## 4. 「調べれば分かる」 / 「公表されていない」の区別

**これが一番重要な区別。**「調べれば分かる」費目を埋めれば断定不能は減らせる。「公表されていない」費目は、公表されない限り埋められない——その費目が断定不能の主因なら、断定不能は構造的に減らせないという結論になる。

- 調べれば分かる（findable）: 1 費目 / 延べ 51 条件
  - **courier-clearance-fee**（51条件）: 宅配便の着地側通関手数料。compare.ts のコメント（1691行付近）は GB/DE の FedEx・UPS を "schema_gap / C_unknown" と呼んでいる——「該当する運賃表・T&C に到達できなかった」であって「その社が公表していないと確認した」ではない。一次資料（運送会社の Service Guide 等）を追加で当たれば埋まる可能性がある側——ただし FedEx は既に公式サイトが WAF を返す事例が他にもあり（courier-destination-fees 参照）、実際に埋まる保証はない。
- 公表されていない（unpublished）: 2 費目 / 延べ 363 条件
  - **courier-destination-fees**（266条件）: 着地側の宅配便フルフィルメント/取扱手数料。4社中データがあるのは一部のみ。master/carrier-weight-limits.json・docs/audit/courier-transit-days-2026-09-13.md 参照。FedEx は公式サイトが HTTP 200 で WAF ページを返し取得不能。ECMS は自社の手数料を公表していない。
  - **outsourced-packing**（97条件）: FROM JAPAN の外注梱包費。同社は公表しておらず、社固有の未取得（scope無し）。

**「公表されていない」側が優勢。** 現状の格子では、断定不能の主因は調べても埋まらない費目が占めている——正直に言えば、この格子の範囲では断定不能は大きくは減らせない可能性がある。

## 限界（必ず読むこと）

- 上の条件格子は**サンプル**であり「全パターン」ではない。重量・商品価格は連続値で、この台帳はその上の代表点だけを見ている。多品目（複数商品・複数個口）や`storageDays > 0` の効果はこの格子には含まれていない——それらを変えるとrankIndeterminate の比率は変わりうる。
- 「1. 妨げている費目」は1位行自身の未取得行だけを見ている（`docs/audit/fable-fix-readiness-round2-2026-09-13.md` の方法論に合わせた——同監査は297条件すべてが1位自身の未取得費目で説明できたと確認済み）。次点以下の未取得行が原因で不確定になるケース（`overlapsLeader`側）がこの格子には現れなかったのでこの単純化で足りているが、別の格子では成立しない可能性がある。
- 「4. findable/unpublished」の分類は本スクリプト内の手書き表（`RESOLVABILITY`）に基づく——**集計から自動で出せるものではない**。新しい未取得費目が現れたら「未分類」に落ち、この表への追記が要る。
