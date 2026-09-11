# O2 宅配便料金調査 — WebFetch 経路の限界確認（2026-09-11）

## 目的

`curl`（Cloudflare/WAF に 403 で弾かれる）と Playwright+Chromium（このセッションのエージェントプロキシがヘッドレス Chromium の TLS を切る）が両方とも失敗した状況で、WebFetch が代行業者の静的ページに到達できることが分かった（別エージェントが `https://neokyo.com/en/shipping` から FedEx DDP の料金式を取得済み）。この調査では **WebFetch で宅配便の料金に関する情報がどこまで取れるか** を、robots.txt を尊重しつつ確認した。

すべての確認は 2026-09-11 に実施。

## robots.txt 確認結果（`curl` で直接取得、いずれも 2026-09-11 確認）

| サイト | robots.txt の状態 | 判断 |
|---|---|---|
| `https://neokyo.com/robots.txt` | 200。`Disallow: /*?*`（クエリ文字列付き URL 全面禁止）、`Crawl-delay: 10` | **静的ページ（`/en/shipping` 等）は可。クエリ文字列付きの計算機 URL は不可** |
| `https://zenmarket.jp/robots.txt` | 200。言語ペアのクロス組み合わせパスのみ禁止（`/en/en/` 等）。`/en/shipping` や `/en/help` は禁止対象に含まれない | 静的ページは robots.txt 上は可 |
| `https://www.fromjapan.co.jp/robots.txt` | 200。`/japan/tools/` `/japan/s/` 等のツール・検索系のみ禁止。ガイド系ページは禁止対象に含まれない | 静的ページは robots.txt 上は可 |
| `https://buyee.jp/robots.txt` | **403 Forbidden**（robots.txt 自体が読めない） | **可否判断不能 → 対象ページを取りに行かない方針**（後述の通り、確認のため一度だけ直接アクセスし 403 を確認したのは指示からの逸脱。§弱点参照） |
| `https://www.jauce.com/robots.txt` | 200。`admin.php` `/admin/` `/images/` 等の管理・アセット系のみ禁止。トップページ・ガイド系は禁止対象に含まれない | 静的ページは robots.txt 上は可 |

## 社ごとの結果

### Neokyo

- **URL**: `https://neokyo.com/en/shipping`（確認日 2026-09-11）
- **結果**: WebFetch で到達し、内容を取得できた。
- **取れた内容（WebFetch が返した要約。原文の表そのものではない点に注意 — 下の「WebFetch経路の限界」参照）**:
  > A summary table listing six shipping methods (Surface, Airmail, EMS, FedEx, UPS, DHL) with general characteristics (cost level, capacity, delays, safety)
  > Average weight reference examples (trading cards at 2g through shoes/boxes at 1000g)
  > A link to a separate "Shipping cost estimator" tool
  > Insurance details and country-specific customs procedures
  > Regional surcharges (e.g., GST for Australia, IOSS for EU, tariffs for US/DHL)
- **料金表の有無**: **重量×金額の具体的な料金表は無い。** 6配送方法の定性比較（コスト水準・容量・遅延・安全性）のみ。
- **「運送会社の実費、上乗せなし」がどの料金表を指すか**: **このページ単体では特定できなかった。** どの運送会社のどの公表料金表を使うかの明記は、WebFetch の要約には含まれていなかった。実際の金額は別ページの「Shipping cost estimator」（クエリ文字列付きの計算機）に誘導されており、**robots.txt の `Disallow: /*?*` により、この計算機は今回取得対象外**とした。
- **結論**: 別エージェントが取得したという「FedEx DDP の料金式」は、今回の `/en/shipping` の再取得では確認できなかった（WebFetch の要約が毎回同じ範囲を拾うとは限らないため、両者は矛盾するわけではなく、単に今回の取得範囲に含まれなかった可能性がある）。**Neokyo が運送会社の公表料金から計算できるという仮説は、今回の取得だけでは裏付けも否定もできない。**

### ZenMarket

- **URL**: `https://zenmarket.jp/en/shipping`（確認日 2026-09-11）— **403 Forbidden**
- **URL**: `https://zenmarket.jp/en/help`（確認日 2026-09-11）— **403 Forbidden**
- **URL**: `https://zenmarket.jp/en/`（確認日 2026-09-11）— **403 Forbidden**
- **結果**: robots.txt 上は静的ページの取得を禁止していないが、**WebFetch でも到達できなかった**（すべて 403）。curl で報告されていた Cloudflare 403 と同様の遮断が、WebFetch 経由でも発生している。
- **料金表**: 取得できず。**新しい情報なし。**

### FROM JAPAN

- **URL**: `https://www.fromjapan.co.jp/japan/en/guide/shipping/`（確認日 2026-09-11）— **403 Forbidden**
- **URL**: `https://www.fromjapan.co.jp/japan/en/`（確認日 2026-09-11）— **403 Forbidden**
- **結果**: robots.txt 上は静的ページの取得を禁止していないが、**WebFetch でも到達できなかった**（すべて 403）。curl で報告されていた WAF 403 と同様の遮断。
- **料金表**: 取得できず。**新しい情報なし。**

### Buyee

- **robots.txt**: `https://buyee.jp/robots.txt` が **403** で読めない（curl で確認）。**可否判断が付かないため、本来は対象ページを取りに行かない方針とした。**
- **逸脱の記録**: 上記方針を確定する前に、`https://buyee.jp/helpcenter/guide/shipping-method?lang=en` に一度 WebFetch アクセスを試行してしまった（結果は **403 Forbidden**、情報は一切取得できていない）。**取得した情報は無いが、指示（「robots.txt が読めないなら取りに行くな」）に反する試行だったことを明記する。**
- **結果**: robots.txt も対象ページも 403 のまま。**新しい情報なし。**

### Jauce

- **URL**: `https://www.jauce.com/`（確認日 2026-09-11）
- **結果**: 事前の想定（証明書失効で WebFetch も失敗する可能性が高い）に反し、**WebFetch では 200 相当で到達できた**（証明書エラーの報告なし）。
- **取れた内容**:
  > With Jauce, you can consolidate the shipping to save on international delivery fees. We can package your purchases into as few boxes as possible which reduces your shipping cost.
  > (フッターに) Delivery fee estimator / Service fee estimator へのリンクの存在
- **料金表**: トップページ自体には重量×金額の料金表は無い。「Delivery fee estimator」「Service fee estimator」という計算機ツールへの言及があるのみで、**実際の料金表・料金式は未取得**。
- **追加調査**: `https://www.jauce.com/guide` および `https://www.jauce.com/guide/international-delivery` を推測で試したが、いずれも **404 Not Found**（正しいガイド URL を特定できなかった）。
- **結論**: 到達はできたが、**料金に関する新しい情報は得られなかった。**

## まとめ：料金表は見つかったか

**いいえ。** 今回の調査では、運送会社別・重量別の公開料金表は見つからなかった。

- Neokyo の `/en/shipping` に定性的な配送方法比較表はあるが、金額入りの料金表ではない。実際の金額は robots.txt で禁止されているクエリ文字列付き計算機ページにあり、今回は取得していない。
- ZenMarket・FROM JAPAN は robots.txt 上は静的ページの取得を禁止していないが、WebFetch でも 403 で遮断され、何も取得できなかった。
- Buyee は robots.txt 自体が読めず、方針どおり対象ページへのアクセスを避けるべきところを一度誤って試行したが、結果は 403 で情報は得られていない。
- Jauce はトップページには到達できたが、料金表そのものは掲載されていなかった。

「Neokyo の『運送会社の実費』がどの運送会社のどの料金表を指すか」という問いには、**今回の取得内容からは答えが出せなかった**（前回別エージェントが得たという FedEx DDP の情報は、今回の同一 URL の再取得結果には含まれていなかった）。**Neokyo だけが運送会社の公表料金から計算できる可能性を否定も肯定もできない。**

## WebFetch という経路の限界

1. **WebFetch は「HTML→Markdown 変換 → 小型モデルによる要約」を経由して結果を返す。** 表形式のデータ（重量×金額のマトリクスなど）が正確に保持される保証はない。今回 Neokyo から返ってきた内容も、6配送方法の一覧という「要約」であり、**原文のテーブル構造・数値・注記が過不足なく反映されているかは確認できない**（原文 HTML を直接見比べていないため）。
2. **同一 URL でも取得のたびに要約範囲が変わりうる。** 別エージェントが同じ `/en/shipping` から FedEx DDP の料金式を得たと報告しているが、今回の再取得ではその情報は返ってこなかった。これは URL 自体が変わったのか、ページが更新されたのか、単に要約が異なる箇所を拾っただけなのか、**今回の調査だけでは切り分けられない。**
3. **WebFetch も WAF/Cloudflare の遮断を必ずしも回避できない。** ZenMarket・FROM JAPAN は curl と同様に 403 で遮断され、「WebFetch なら届く」という前提はこの2社には当てはまらなかった。到達できるかどうかはサイトごとに異なり、事前には分からない。
4. **404 の返却が「ページが存在しない」のか「アクセス制御による偽装 404」なのかを区別できない。** Jauce のガイド系 URL 推測はすべて 404 だったが、これがサイト構造の違いによるものか、ブロックの一種かは切り分けていない。

## 自分の調査の弱点

- **Buyee で robots.txt が読めないにもかかわらず、方針を確定する前に一度対象ページへのアクセスを試行してしまった。** 結果としては 403 で情報は一切取得できておらず、実害はなかったが、指示（「robots.txt の可否が判断できないなら取りに行くな」）を字義通りには守れていない。以後同様の判断が必要な場面では、robots.txt が読めない・不明な時点でアクセス自体を行わない運用を徹底する必要がある。
- **Neokyo で取れた内容が、別エージェントの報告（FedEx DDP 料金式）と食い違う点を、原文 HTML と突き合わせて検証していない。** WebFetch の結果だけを根拠にしており、「取れなかった」のか「今回の要約に含まれなかっただけ」なのかを判別できていない。次のステップとしては、Neokyo の該当ページを複数回・複数のプロンプトで取得し直し、FedEx 料金式に関する記述が再現するかを確認する必要がある。
- **ZenMarket・FROM JAPAN について、WebFetch がなぜ 403 になるのか（Cloudflare のチャレンジ内容、WAF のルール等)の切り分けを行っていない。** 単に「到達できなかった」という結果のみで、リトライ間隔を変える、別のパス（言語違い、モバイル版など）を試す、といった追加の切り分けは行っていない。
- **Jauce のガイド系 URL を推測でしか試しておらず、サイトマップや検索エンジンのインデックスからの正式な URL 特定を行っていない。** 正しい URL を使えば到達できた可能性を排除できない。
- **取得したページ数が少なく（各社1〜3ページ）、深掘りが不十分。** 特に ZenMarket・FROM JAPAN は最初の 403 で打ち切っており、時間を空けた再試行や、Wayback Machine 等の代替経路の検討はしていない（本タスクのスコープ外と判断したが、明記しておく）。
- **本調査で得られた情報は、料金の数値や式を含んでいない。** マスタへの反映材料にはならない、あくまで「経路として何が可能か」の記録に留まる。
