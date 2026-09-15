# 広告バナーの配置（調査と推奨） 2026-09-14

対象: 比較画面（試作 `prototypes/proposal-ac-ledger-manifest.html` の構造: 条件1行 → 要約 → 順位ボード → 行を開くと配達ログ → フッター）。
現行方針（`REQUIREMENTS.md` #11、`docs/UI-DESIGN.md`、`src/components/chrome/AdSlot.tsx`）: **比較表の中・横には置かず結果の下に1枠、同意が無ければ描画しない、ラベル「Ad · unrelated to the ranking」**。本調査はこの方針を**支持する**。変える点は「ラベル文言」「高さ予約」「サイズ」の3つ。

調査は WebSearch / WebFetch で実施。本文を直接読めたものは【一次】、検索要約・二次記事経由のみのものは【二次】と記す。

---

## 1. 調査結果

### 1.1 視認性（viewability）と位置
- **MRC/IAB の定義**: ディスプレイ広告は面積の50%以上が1秒連続で画面内にあれば「視認」。242,500px超の大型は30%で可。【二次】検索要約経由（原典PDF: [MRC Viewable Ad Impression Measurement Guidelines](https://www.iab.com/wp-content/uploads/2015/06/MRC-Viewable-Ad-Impression-Measurement-Guideline.pdf)、本文は未取得）。
- **Google AdSense ヘルプ**: 視認性が最も高いのは「ページ最上部」ではなく**ファーストビューの下端（fold の直上）**。fold 下では**本文と別カラム（左右）の方が中央より高い**。【一次】[Viewability best practices – AdSense Help](https://support.google.com/adsense/answer/6219980?hl=en)
- **Google 2014「The Importance of Being Seen」**: fold 直上 73% / 直下 44%、ATF 中央値 68% / BTF 40%、全体で56%超が見られていない。【二次】[MediaPost](https://www.mediapost.com/publications/article/239523/more-than-56-of-ad-impressions-are-not-seen-goog.html) 等の検索要約のみ。Google 原典レポートには到達できていない。
- 注意: 「視認」は画面内に入っただけで、注視されたことではない（→1.2）。

### 1.2 バナーブラインドネス
- **NN/g（Banner Blindness Revisited）**: 右レールは画面面積の25%を占めるのに注視は0.8%（期待値の約1/33）。上部バナーと右レールは最も無視される。インライン（本文中）の広告や、モバイルで画面に対して大きい広告は視線を奪いやすい。推奨は「**本物のコンテンツを広告に似せない**」「**広告とコンテンツを同じセクションに混ぜず視覚的に分ける**」。【一次】[NN/g](https://www.nngroup.com/articles/banner-blindness-old-and-new-findings/)
- **Burke, Hornof, Nilsen & Gorman (2005, ACM TOCHI 12(4))**: 画面にバナーがあるだけで視覚探索が遅くなり、点滅・高彩度のバナーは主観的作業負荷（NASA-TLX）を上げる。しかも広告は記憶されない。【二次】[ACM DL](https://dl.acm.org/doi/10.1145/1121112.1121116) / [Semantic Scholar](https://www.semanticscholar.org/paper/High-cost-banner-blindness:-Ads-increase-perceived-Burke-Hornof/47e35ee88bab9fe666bd0eed19e5b0db139f3101) の抄録要約経由。
- 含意: proxycost の主タスク（5行を見比べて1社を選ぶ）の**視野内に広告を置くと、比較の速度を落とす**。インフィードは「見られる」が、それは比較作業を邪魔しているという意味でもある。

### 1.3 タスク完了・信頼・離脱
- 妨害的な広告は理解度・サイト信頼性の評価を下げ、侵入感を高める（"The impact of online disruptive ads on users' comprehension, evaluation of site credibility, and sentiment of intrusiveness"）。【二次】[ResearchGate](https://www.researchgate.net/publication/267776028_The_impact_of_online_disruptive_ads_on_users%27_comprehension_evaluation_of_site_credibility_and_sentiment_of_intrusiveness) の検索要約のみ。
- Goldfarb & Tucker: 目立つ（obtrusive）広告とターゲティングの組合せはプライバシー懸念で効果が落ちる。【二次】[MIT DSpace PDF](https://dspace.mit.edu/bitstream/handle/1721.1/67901/GoldfarbTuckerIntrusiveness.pdf?sequence=1)（本文未読）。
- **比較サイト固有の信頼研究（広告位置 × 比較結果への信頼）は見つけられなかった。** 下記は規制と一般研究からの推論である。
- **CLS**: 広告は layout shift の最大要因の一つ。対策は CSS の `min-height`/`min-width` で**枠を事前予約**、no-fill でも**枠を畳まない**（畳むのも shift）。fluid サイズは fold 下のみ。目標 CLS < 0.1（p75）。【一次】[GPT: Minimize layout shift](https://developers.google.com/publisher-tag/guides/minimize-layout-shift)、[web.dev: Loading ads without impacting page speed](https://web.dev/articles/loading-ads-page-speed)、【二次】[web.dev: Optimize CLS](https://web.dev/optimize-cls/)

### 1.4 規約・法
- **AdSense 配置ポリシー**【一次】[Ad placement policies](https://support.google.com/adsense/answer/1346295?hl=en-GB):
  - 誤クリックを誘う配置の禁止（リンク・ボタン・メニューの近く）。広告がメニュー・ナビ・ダウンロードリンク等の**サイトコンテンツと紛らわしい実装の禁止**。
  - 広告の見出しは **"Advertisements" または "Sponsored links"** のみ。「おすすめ」「resources」等は不可。
  - 点滅や矢印で広告に注意を向けるのは不可。コンテンツを広告に似せるのも不可。ユーザー操作なしの自動リフレッシュ不可。
  - ナビ要素から約200px離す、という数字は Google 公式ブログ/二次記事経由【二次】[Inside AdSense 2016](https://adsense.googleblog.com/2016/05/preventing-accidental-clicks.html)（本文未読）。
- **FTC ネイティブ広告ガイド**【一次】[FTC](https://www.ftc.gov/business-guidance/resources/native-advertising-guide-businesses): 理解される語は "Ad" / "Advertisement" / "Paid Advertisement"。"Promoted" は曖昧。開示は広告の**前（上）**に、十分な文字サイズ・コントラストで。色の差だけでなく**目立つ罫線**で囲むことを推奨。
- **EU UCPD 附属書I 11a（指令 2019/2161 で追加、2022-05-28 適用）**: 検索結果（ランキング）で、有料広告や上位表示のための支払いを明示せずに結果を出すことはブラックリスト行為。【二次】[EUR-Lex 要約](https://eur-lex.europa.eu/summary/EN/legissum:l32011)、[指令本文](https://www.legislation.gov.uk/eudr/2019/2161/2019-11-27/data.xht?view=snippet&wrap=true)（本文未精読）。→ **広告を順位ボードの行と同形で並べるのは、この規定に抵触し得る最悪の形**。
- **UK CMA デジタル比較ツール市場調査（最終報告）**: 順位基準と価格の完全開示、中立でない／利益相反がある場合の明示を求める。【二次】[Lexology 解説](https://www.lexology.com/library/detail.aspx?g=482bb9fb-efb2-4762-a2ed-c10e5dfdd8f8)、[FCA 消費者パネル回答](https://www.fca.org.uk/panels-assets/consumer-panel/publication/fscp_response_cma_digital_comparison_tools.pdf)。CMA 原典には到達していない。
- **日本 景品表示法 ステマ告示（2023-10-01 施行）**: 事業者の表示であることが判別困難な表示は不当表示。部分的な表示・短時間表示は「明瞭でない」。【一次】[消費者庁](https://www.caa.go.jp/notice/entry/034365/)。紹介料（paysUs）の開示にも関わる。

### 1.5 Better Ads Standards（Coalition for Better Ads）【一次】[Standards](https://www.betterads.org/standards/)
- Desktop 禁止: ポップアップ、音声付き自動再生動画、カウントダウン付きプレステシャル、**Large Sticky Ads**、広告密度50%超、sticky動画併用時の密度30%超。
- Mobile 禁止: ポップアップ、プレステシャル、**広告密度30%超**、点滅アニメ、音声付き自動再生、カウントダウン付きポストステシャル、全画面スクロールオーバー、**Large Sticky Ads（画面の30%超）**【一次】[定義](https://www.betterads.org/mobile-large-sticky-ad/)、sticky ポップアウト動画、sticky動画＋大型インライン。
- 密度は viewport ではなく**メインコンテンツ部の高さの合計に対する広告高さの合計**。【一次】[Mobile density](https://www.betterads.org/mobile-ad-density-higher-than-30/)
- Chrome が 2018-02 から違反サイトの広告を除去して執行。【二次】[ppc.land](https://ppc.land/coalition-for-better-ads/)

---

## 2. 配置候補の比較（試作の構造に当てはめ）

評価: ◎良 ○可 △注意 ×不可

| 候補 | 視認性 | 信頼（中立性）への影響 | 誤クリックリスク | 規約・法 | CLS | 総合 |
|---|---|---|---|---|---|---|
| A. 条件1行〜要約の間（ファーストビュー上部） | ◎ | × 結果より先に広告。比較の視野内 | △ 入力欄・実行ボタンに近い | △ AdSense 誤クリック配置に接近 | △ 最上部で shift すると全体が動く | × |
| B. 順位ボードの行間インフィード | ◎ | × 「6社目」に見える。UCPD 11a の趣旨に反する | × 行を開くクリック対象と隣接 | × コンテンツと紛らわしい配置 | × 行の開閉で位置が動く | **禁止** |
| C. 配達ログ（行を開いた中） | ○ | × 特定の代行の詳細内＝その会社と関係があると読める | × 開閉トグル・リンクに隣接 | × 同上、「特定画像との対応付け」禁止にも近い | × 開閉で出現 | **禁止** |
| D. ボード直後（ログ・凡例の前） | ○〜◎（fold 付近に来やすい） | △ ボードと同じ視線の流れにあり、比較直後に目に入る | △ 最下行の開閉トグルに近い | ○ 余白を取れば可 | ○ 予約すれば0 | △ |
| E. 結果ブロック全体の後・フッター上（現行） | △〜○（スクロール後） | ◎ 比較作業が終わった後にだけ現れる | ◎ 近くに操作要素が少ない | ◎ | ◎ fold 下で予約済み | **推奨** |
| F. サイドレール（desktop のみ・ボード横） | △ NN/g で注視0.8% | △ 「横」に並ぶ＝現方針に反する。ただし別カラムなので行と混同はしにくい | ○ | ○ | ○ 固定幅なら0 | △（現方針では不採用） |
| G. sticky 下部アンカー（mobile） | ◎ 常時表示 | × 比較中ずっと視野に入る | △ 画面下の親指ゾーン、ボード行と重なる | ○ 30%未満なら Better Ads 適合、AdSense アンカーは許可形式 | ◎ overlay なので CLS 0 | 不採用 |
| H. フッター内（ナビリンク群の中） | × | ○ | × ナビリンクに隣接 | × | ○ | 不採用 |

補足:
- ページ全体が短い（5行のボード）ので、mobile で E が fold のすぐ下に来ることが多い。AdSense の「fold 直下の視認性は低いが、別の場所に上げる理由にはならない」。視認性を理由に B/C/D に上げるのは信頼を収益に交換する行為で、proxycost の生命線と矛盾する。
- mobile 密度: 1枠 320×100 なら、メインコンテンツ高さが約 334px を超える限り30%未満。300×250 の場合、メインコンテンツが 833px 未満の短い結果（例: エラー表示のみ）では**30%超になり得る**ので、結果が無い状態では広告を出さない。

---

## 3. 推奨

### 3.1 Desktop
1. **E: 結果ブロック（順位 → 凡例 → 内訳 → 弱点）の後、フッターの前に1枠のみ。** 本文カラム幅の中で中央寄せ。
2. サイズ: **728×90（Leaderboard）** を第一候補。本文カラムが 728px 未満なら **300×250（Medium Rectangle）**。
3. サイドレール（F）は置かない（現方針の「横に置かない」を維持。NN/g でもほぼ見られず収益寄与が小さい割に「比較の横に広告」という印象だけ残る）。

### 3.2 Mobile
1. **E と同じ位置に1枠のみ。** sticky アンカー（G）・インタースティシャル・ボード内インフィードは使わない。AdSense の自動広告（Auto ads）を使う場合は**アンカー／ヴィネット／インページ自動挿入を OFF**にし、手動ユニットだけにする（自動挿入はボード行間に入り得る）。
2. サイズ: **320×100**（推奨）または 320×50。300×250 は密度・比較後の圧迫感から第二候補。

### 3.3 禁止すべき配置（`AdSlot` のコメント／UI-DESIGN に明記する候補）
- 順位ボードの行間、行の上下に接する位置、配達ログの中、要約・条件行の近く
- 行の開閉トグル・「代行サイトへ」リンク・入力欄から **200px 未満**
- sticky／フローティング／ポップアップ／自動リフレッシュ／点滅アニメ
- 広告の近くに代行会社名・ロゴ・順位番号・価格を置くこと（特定の行と対応付けて見える）
- 結果が無い（エラー・未入力）状態で広告だけが残る表示

### 3.4 広告と比較結果を視覚的に分ける具体策
- **ラベル**: 枠の**上**に `Advertisement`（AdSense は "Advertisements" / "Sponsored links" のみ許可。現行の「Ad · unrelated to the ranking」は AdSense の見出し規定に照らすと不安が残る）。中立性の注記は**ラベルと分けて**、枠の下に小さく「Ads are served by Google and do not affect the ranking.」を置く、または `/sources` の開示ページに回す。※ 注記文を AdSense が「広告の見出し」とみなすかは未確認。審査時に確認する。
- **罫線・余白**: 結果ブロックとの間に**上下 48px 以上**＋全幅の区切り罫線。広告枠自体は 1px 実線の枠（FTC は色差だけでなく罫線を推奨）。
- **紙の見た目と明確に違う枠**: 試作は「台帳／配送票（紙）」の質感なので、広告枠には紙のテクスチャ・罫線パターン・等幅数字・スタンプ風の装飾を**使わない**。背景はフラットな中立灰（プロジェクトトークンの muted 系）、角丸はボード行と違う値にする。
- **高さ予約で CLS 0**: コンテナに `min-height`（desktop 90px + ラベル行、mobile 100px + ラベル行、300×250 時 250px）を**同意取得前から**確保するか、同意前は描画しない現行方式を保つなら「同意状態が確定してからレンダリング」かつ fold 下なので shift は視野外。no-fill 時も枠を畳まず、空の枠（ラベルのみ）を残す。遅延読み込み（viewport 接近時）を使う。
- **動きなし**: 静的クリエイティブ優先。AdSense 管理画面で点滅・アニメカテゴリの制限を検討（Burke et al.）。

### 3.5 推奨サイズまとめ（IAB 固定サイズ）
出典: [IAB New Standard Ad Unit Portfolio (2017)](https://www.iab.com/wp-content/uploads/2017/08/IABNewAdPortfolio_FINAL_2017.pdf)【二次: 検索要約経由、PDF本文は未読】

| 画面 | 第一候補 | 代替 |
|---|---|---|
| Desktop（本文幅 ≥ 728px） | 728×90 | 970×250 は結果より目立つので不採用 |
| Desktop（本文幅 < 728px）/ Tablet | 300×250 | 336×280 |
| Mobile | 320×100 | 320×50（高さ最小）／300×250（密度に注意） |

レスポンシブ広告ユニットを使う場合も、コンテナ側で `max-height` と `min-height` を固定し、指定外の大型（300×600 等）が入らないようにする。

---

## 4. 未到達・未確認
- Google 2014 視認性レポート原典、MRC ガイドライン PDF 本文、IAB ポートフォリオ PDF 本文、CMA 最終報告原典、Burke et al. 本文、disruptive ads 論文本文 — いずれも検索要約／二次記事経由。
- 「比較サイトで広告位置が結果への信頼に与える影響」を直接測った研究は見つからなかった。E を推奨する根拠は NN/g・Burke（作業妨害）と規制（UCPD 11a／FTC／ステマ告示）からの推論。
- AdSense で中立性の注記文を広告ラベル近くに置くことの可否は、ポリシー本文に明記が無く未確認。
