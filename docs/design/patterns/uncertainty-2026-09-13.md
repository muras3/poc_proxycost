# 不確実性・信頼度・推定値を見せるUIパターン調査（2026-09-13）

## 到達可否 一覧

WebSearch はすべて検索結果の要約（Anthropic側の集約）を経由しており、個々の一次URLへの直接到達ではない。個別に WebFetch を試みたものは明示する。

| # | パターン | 出典URL | 到達可否 |
|---|---|---|---|
| 1 | FiveThirtyEight/選挙予測の確率表現 | projects.fivethirtyeight.com/2024-election-forecast/ | **到達不可**（302 → abcnews.go.com/politics に転送、同ページ自体は現存せず。以降は検索結果とCJR/Poynter/Northwestern等の二次分析のみで記述） |
| 2 | NYT Needle（2020, 2018） | cjr.org, poynter.org, hullmanlab.northwestern.edu | 検索結果からのみ（個別WebFetch未実施） |
| 3 | ハリケーン Cone of Uncertainty | nhc.noaa.gov/aboutcone.shtml | **WebFetch到達済み**（2026-09-13）。誤読研究は別途 journals.ametsoc.org / climatecommunication.yale.edu を検索結果で確認 |
| 4 | 降水確率(PoP)の誤解 | wxguys.ssec.wisc.edu, livescience.com 等 | 検索結果のみ |
| 5 | アンサンブル予報スパゲッティ図 | cpc.ncep.noaa.gov, foxweather.com, en.wikipedia.org/Ensemble_forecasting | 検索結果のみ |
| 6 | IPCC likelihood/confidence 2軸 | ipcc.ch AR5 Uncertainty Guidance Note (PDF) | 検索結果のみ（PDF本文は個別WebFetch未実施） |
| 7 | イングランド銀行 ファンチャート | bankofengland.co.uk | 検索結果のみ |
| 8 | Zillow Zestimate レンジ | zillow.com/zestimate/ | 検索結果のみ |
| 9 | 退職シミュレータ Monte Carlo/ファンチャート | 各種ファイナンス系サイト（一次のVanguard/Fidelity自体には未到達） | 検索結果のみ、**一次サイトへの到達なし**（要注記） |
| 10 | Wise の手数料・レート見積もり | wise.com/pricing, wise.com/compare/disclaimer | 検索結果のみ |
| 11 | DHL/Zonos Landed Cost 見積もり | zonos.com/landed-cost, developer.dhl.com/api-reference/duty-and-tax-calculator | 検索結果のみ |
| 12 | Uber Upfront Pricing のレンジ表示 | uber.com/help, uber.com/gb/en/blog | 検索結果のみ |
| 13 | Wikipedia `[citation needed]` 系テンプレート | en.wikipedia.org/wiki/Template:Citation_needed 等 | 検索結果のみ |
| 14 | Our World in Data のデータ品質注記 | ourworldindata.org/faqs, ourworldindata.org/data-insights/... | 検索結果のみ |
| 15 | Open Food Facts の完全性 | openfoodfacts.github.io, world.openfoodfacts.org/nutriscore | 検索結果のみ |
| 16 | 米国 Good Faith Estimate（医療費見積もり） | cms.gov (PDF), dmc.org | 検索結果のみ |

**採れた数: 16パターン。20には届かなかった。** 主因は環境の WebFetch がプロキシ経由で多くの一次サイト（特に対話的な計算機UI、JS描画されるダッシュボード）のスクリーンショット相当の情報を取れず、また WebSearch はAnthropic側の要約を返すため「画面のレイアウト・色・タイポグラフィ」まで検証できたのは事実上 #3（NHC cone ページ）1件のみだったこと。他は検索結果の記述に依拠しており、レイアウト詳細の一部は伝聞である旨を各項目に明記した。

---

## 重点3点の有無（先に結論)

- **上限が存在しない／分からない、をどう描くか**: **見つからなかった**。今回到達した16件の中で「上限が原理的に不明」という状態を専用の視覚記法（エラーバーの片側を開く、矢印で外に出す等）で表現している実例は確認できなかった。Zestimate・Wise・Uber・Zonos はいずれも「レンジ」であって、上端自体は常に存在する（不確かだが有限）。GFEの$400ルールも上端の有無ではなく乖離の許容幅の話。IPCCのfat tailの図示や気候感度の「>>」記法など、片側が開いた不確実性の図法は存在すると理論的には知られているが、**今回のリサーチでは実例に一次到達できておらず、断定しない**。
- **根拠の強さの段階（IPCCの2軸、バッジ、濃淡）**: **見つかった**。IPCC AR5 Guidance Note が likelihood（確率、5段階以上）と confidence（証拠の質・合意度、5段階: very low〜very high）を**別軸**として明示的に分離しているのが最も直接該当（#6）。Our World in Data・Wikipediaのバッジ/テンプレートは「段階」ではなく「フラグ（ある/ない）」に近い。
- **2シナリオ比較（楽観/悲観）**: **部分的に見つかった**。ファンチャート（イングランド銀行、退職シミュレータ）は連続分布であり2点シナリオではない。明確な「楽観/悲観の2点」提示の実例は今回到達したものの中には無かった。近いのはGFEの「予想額 vs 実際請求額が$400超で異議申立可」という2点だが、これは事前レンジではなく事後の許容幅なので厳密には該当しない。**明確な2シナリオ比較の実例は見つからなかった、と明言する。**

---

## 各パターン

### 1. FiveThirtyEight系の選挙予測（確率＋区間）

- **出典**: `https://projects.fivethirtyeight.com/2024-election-forecast/`（2026-09-13時点、302で abcnews.go.com/politics へ転送——538の選挙予測ページ自体が現存しない）。以降はCJR・Poynter・Northwestern大学 Hullman Lab の分析記事（検索結果経由、個別WebFetch未実施）。
- **解いている問題**: 「〇〇候補が勝つ確率78%」という単一の数字だけでは、有権者が「ほぼ確実に勝つ」と読み違える。
- **具体的な見せ方（伝聞）**: 州ごとの勝敗マップを多数生成し「200枚中いくつが青か」で見せる、確率を「4回に3回」のような頻度表現に言い換える、得票分布のドット散布。
- **研究・批判**: Poynterの記事は、2020年に538が出した「州ごとの投票日結果と最終結果の乖離を示すチャート」が後に選挙不正の"証拠"として悪用された事例を記録している。Nate Silver自身が「誰にでも伝わる形で確率を説明するのは難しい」と述べたと報じられている。
- **我々に使えるか**: **条件付き**。頻度表現（「4回に3回」的な言い換え）は流用できるが、我々の対象は確率的な勝敗ではなく金額の区間なので直接の型は違う。

### 2. NYTの選挙ニードル

- **出典**: `cjr.org/special_report/2018-midterms-forecasts-538-cnn-times-needle.php`、`poynter.org`（検索結果のみ、個別WebFetch未実施）。
- **解いている問題**: リアルタイムで変動する予測の「今どちらに振れているか」を直感的に見せる。
- **具体的な見せ方（伝聞）**: 針が左右に振れるメーター。針の位置＝現在の予測、振れ幅の演出で不確実性を暗示。
- **研究・批判**: 「政治で最も嫌われたデータビジュアライゼーション」と呼ばれた。針が振れること自体が「情勢が激変している」という誤読を誘発し、的中したにもかかわらず信頼を失ったとCJR等が報じている。Hullman Labは「不確実性を伝えるはずが伝わらなかった」と総括し、代替として物理的なメタファ（Plinko）を試している。
- **研究・批判の評価**: これは「不確実性表示が意思決定/理解を悪化させた」明確な失敗事例として引用に値する。
- **我々に使えるか**: **使えない（反面教師として）**。単一の動く指標に不確実性を暗示させる設計は避けるべき、という否定的な学びとして扱う。

### 3. ハリケーン Cone of Uncertainty

- **出典**: `https://www.nhc.noaa.gov/aboutcone.shtml`（**2026-09-13 WebFetch到達済み**）。追加で誤読研究: `journals.ametsoc.org/view/journals/bams/88/5/bams-88-5-651.xml`（Broad et al. 2007, BAMS、検索結果経由）。
- **解いている問題**: 台風進路予測の位置誤差を、時間展開する帯として見せる。
- **具体的な見せ方**: 各予測時刻（12h〜120h）ごとに「過去5年の実績誤差の2/3が収まる」半径の円を置き、それらを包絡した帯（cone）を描く。半径は時間とともに拡大（12hで25海里→120hで200海里、大西洋）。
- **研究・批判**: **見つかった、かつ具体的**。Broad et al. (2007, BAMS)は2004年のフロリダのハリケーンシーズンで、住民・メディア双方が cone を「被害範囲」と誤読したと報告。2018-2019年の2,800人超調査では44%が「cone から嵐の大きさが分かる」、40%が「cone から被害地域が分かる」と誤答（govtech.comが報告）。原因として cone の縁という「目立つ境界線」が、時間とともに広がる嵐そのものの成長のように見えることが指摘されている。NHC自身の公式ページ（到達確認済み）には、この誤読についての記載は**一切ない**——技術的な作図方法の説明のみで、公式ページと批判的研究の間に明確なギャップがある。
- **我々に使えるか**: **使える**。「境界線（縁）自体が過剰に意味を持って読まれる」という知見は、我々の `total.high === null` を単純に太い線や強い枠で描くと「そこが上限だ」と誤読されるリスクの警告として直接活きる。

### 4. 降水確率（PoP）の誤解

- **出典**: 検索結果集約（wxguys.ssec.wisc.edu, livescience.com, iflscience.com 等、個別WebFetch未実施）。
- **解いている問題**: 「30%の確率で雨」の意味（面積か、確信度か、強さか）を一言のラベルにどう畳むか。
- **具体的な見せ方**: パーセンテージ数値のみ、多くの場合説明文なし。
- **研究・批判**: 5都市の通行人調査で「30%の意味を気象学的に正しく答えられたのはニューヨークのみ過半数」という研究が報告されている（出典記事内での言及、一次論文への到達なし）。面積・強度・確信度のどれとも取れる多義的表現が誤解の温床、との指摘。
- **我々に使えるか**: **使える（反面教師）**。単一パーセンテージ・単一ラベルは多義的に読まれるので、我々の `confidence`/`tier` を単一の数字やラベルだけで出すのは同じ罠に落ちる。

### 5. アンサンブル予報スパゲッティ図

- **出典**: `cpc.ncep.noaa.gov/products/predictions/threats/briefs/hgtP1.html`、`en.wikipedia.org/wiki/Ensemble_forecasting`（検索結果のみ）。
- **解いている問題**: 単一モデルではなく多数の初期値摂動シミュレーションの「ばらつきそのもの」を見せる。
- **具体的な見せ方**: 同じ地図上に各アンサンブルメンバーの進路線を重ね描き。序盤は線が束になり、時間が進むほど発散する。線が密集＝高確信、拡散＝低確信を視覚的に体感させる。
- **研究・批判**: 検索結果の範囲では専用の誤読研究は見つからなかった（cone ほど明確な社会科学的批判は今回到達できず）。
- **我々に使えるか**: **条件付き**。「線の集合の発散度」で確信度を見せる発想は、我々の3社見積もりの重なり（bracket/recommended/equivalent）の可視化と親和性がある。ただし我々のデータ点は3〜5件程度でアンサンブルの「多数決」的な説得力は出せない。

### 6. IPCC の likelihood / confidence 2軸

- **出典**: `ipcc.ch/site/assets/uploads/2017/08/AR5_Uncertainty_Guidance_Note.pdf`（検索結果経由、PDF本体への個別WebFetch未実施）。
- **解いている問題**: 「どれくらい確からしいか（確率）」と「どれだけ強い根拠があるか（証拠の質・合意度）」は別物であり、1つの数字や1つの言葉に潰すと片方が消える。
- **具体的な見せ方**: confidence を5段階の定性語（very low, low, medium, high, very high）、likelihood を確率区間に対応した定性語（virtually certain 99–100%、likely 66–100%等）で**別々に**表記し、文中で並記する（例: "likely (high confidence)"）。
- **研究・批判**: Springerの追跡研究 (`link.springer.com/article/10.1007/s10584-020-02746-x`) は、実際のIPCC報告書内でこの2軸がどれだけ一貫して併記されているかを検証しており、運用上のばらつきも指摘されている（検索結果の要約に基づく、原論文未到達）。
- **我々に使えるか**: **使える、最重要**。我々の `tier`（fixed/estimate/unverified/none）と `confidence`（direct_fetch/search_snippet/reasoned_judgement_unconfirmed）と `invoice_check`（never_checked/confirmed_calculator/confirmed_independent/contradicted）の3軸は、IPCCの「確率」と「証拠の質」の2軸分離の考え方に近い。**3軸をユーザー向けに畳むなら2段階が妥当**——(a) 金額の確からしさ（tier由来、amountの形に直結）と(b) 検証の深さ（confidence×invoice_checkを合成した「誰が/どう確認したか」）に分け、IPCCのように定性語＋短い注記を併記する形。3軸そのままをUIに出すと降水確率と同じ多義的な数値の羅列になる。

### 7. イングランド銀行 インフレ予測ファンチャート

- **出典**: `bankofengland.co.uk/monetary-policy-report/2025/august-2025`、`bankofengland.co.uk/quarterly-bulletin/1998/q1/the-inflation-report-projections-understanding-the-fan-chart`（検索結果のみ）。
- **解いている問題**: 中心予測だけでなく「どれだけの幅で外れうるか」を、誤った精度感を与えずに見せる。
- **具体的な見せ方**: 中央値の実線を核に、外側に向かって色の濃淡が薄くなる帯（等確率帯を複数重ねたグラデーション）。歪み（skew）も表現でき、対称とは限らない。
- **研究・批判**: 「見せかけの精度を与えないため」という設計意図が一次資料（Quarterly Bulletin 1998）に明記されている、との言及あり（検索結果経由）。
- **我々に使えるか**: **条件付き**。連続分布向けの意匠であり、我々は各社3〜5点の離散比較なので帯そのものは持ち込みにくいが、「濃淡で確信度を表す」という語彙（境界を太い線ではなくグラデーションで表す）は #3 の cone の教訓（縁が誤読される）とも整合し、**`high === null` を表す際に「濃い実線→薄れて消える」矢印/グラデーションにする**発想の裏付けとして使える。

### 8. Zillow Zestimate レンジ

- **出典**: `zillow.com/zestimate/`（検索結果のみ）。
- **解いている問題**: 単一のAI推定額だけを出すと「確定額」に見えてしまう住宅価格を、幅として提示する。
- **具体的な見せ方**: 中心値（Zestimate）と、その下にlow-highのレンジを表示。レンジの広さ自体が「確信度が低い」ことの代理指標になっている（データが薄い物件ほど広い）。
- **研究・批判**: 今回の検索結果の範囲では学術的な効果検証は見つからなかった。
- **我々に使えるか**: **使える**。「レンジの広さ＝確信度の代理」という発想は、我々の `{low, high}` にそのまま乗る。ただし Zestimate は両端とも有限（`high === null` に相当する状態が無い）ので、その一線は超えない。

### 9. 退職シミュレータ Monte Carlo / ファンチャート

- **出典**: 検索結果は `ryanoconnellfinance.com` 等のサードパーティ計算機・解説記事が中心で、**Vanguard/Fidelity自身の一次UIには到達していない**。
- **解いている問題**: 「資産が寿命まで持つか」を単一の答え（Yes/No）ではなく確率として見せる。
- **具体的な見せ方（伝聞）**: 「成功確率90%」のような単一パーセンテージに加え、資産推移のファンチャート（P10–P90、P25–P75の帯＋中央値線）。
- **研究・批判**: 検索結果の範囲では専用の実験研究は見つからなかった。Morningstarの年次リサーチが安全引出率の数値根拠として言及されている程度。
- **注記**: **この項目は一次UIの実物を見ておらず、伝聞の確度が他項目より低い。** 今後同様の調査をするなら Vanguard/Fidelity の実ツールに直接到達すべき。
- **我々に使えるか**: **条件付き**（一次未確認のため）。「成功確率」という単一数字とファンチャートを併記する二段構えの発想自体は、我々の総額レンジ＋短い定性文（rankStabilityNote相当）の組み合わせと同型。

### 10. Wise の手数料・為替レート見積もり

- **出典**: `wise.com/pricing`、`wise.com/ie/compare/disclaimer`（検索結果のみ）。
- **解いている問題**: 送金手数料と為替レートは実行時まで確定しないが、事前に「だいたいこう」と見せる必要がある。
- **具体的な見せ方（伝聞）**: 実行前に内訳（手数料＋想定レート）を明示。ページには「実際のレートは変動する」「一部通貨はレートを確定（ロック）できる」という注記。
- **研究・批判**: 検索結果の範囲では専用の実験研究は見つからなかった。
- **我々に使えるか**: **使える**。「確定できる要素」と「変動する要素」を1つの見積もりの中で分けて注記する構造は、我々の `tier: fixed` な費目と `tier: estimate/unverified` な費目を1つの内訳表の中に混在させて出す設計と直接一致する。

### 11. DHL / Zonos の Landed Cost（関税込み総額）見積もり

- **出典**: `zonos.com/landed-cost`、`developer.dhl.com/api-reference/duty-and-tax-calculator`（検索結果のみ）。
- **解いている問題**: 越境ECで「関税込みの本当の総額」が分からないという、我々の課題と最も構造が近い問題。
- **具体的な見せ方（伝聞）**: 総額の内訳（商品代・送料・関税・税・手数料）を項目別に表示。Zonosは配送方式によって**「保証（guaranteed quote）」と「見積もり（estimate）」を明示的に区別**——DDP（関税元払い）が使える経路では確定額、DDU（着払い）しかない経路では見積もりのラベルが付く。DHLの計算機は免責文で「本サービスの完全性・正確性を確認するのはユーザーの責任」「DHLは通関の専門家ではない」と明記。
- **研究・批判**: 検索結果の範囲では専用の実験研究は見つからなかった。
- **我々に使えるか**: **使える、最も近い先例**。「保証 vs 見積もり」の二値ラベルをまず出し、内訳の各行はその下で `tier` ごとに描き分ける、という二層構造は我々の `Row.total`（区間）と `Line.tier`（行ごとの確度）の関係そのものに対応する。DHLの免責文の書きぶり（誰が何を確認していないかを名指しする）は `invoice_check: never_checked` を画面文言化する際の直接の参考になる。

### 12. Uber Upfront Pricing のレンジ表示

- **出典**: `help.uber.com/en/riders/article/review-change-in-upfront-trip-price`、`uber.com/gb/en/blog/understanding-your-upfront-fare-when-it-can-change-and-what-extra-fees-may-apply/`（検索結果のみ）。
- **解いている問題**: 需給・経路変更で変わりうる運賃を、乗車前にどう提示するか。
- **具体的な見せ方（伝聞）**: 確定額を出せるときは単一額（upfront price）、出せないときはレンジを表示。乗車後に目的地変更・追加停車があれば距離時間ベースの実費精算に切り替わる旨を明記。
- **研究・批判**: 検索結果の範囲では専用の実験研究は見つからなかった。
- **我々に使えるか**: **条件付き**。「確定できるときは点、できないときは幅」という切り替えロジックは我々の `AmountKind`（point/range/unknown）と同型だが、Uberは「事前に確定できるか」を配車前に判定するのに対し、我々は「事後にどこまで検証できたか」（invoice_check）が主因なので、切り替えの引き金が違う点に注意。

### 13. Wikipedia の `[citation needed]` 系テンプレート

- **出典**: `en.wikipedia.org/wiki/Template:Citation_needed`、`en.wikipedia.org/wiki/Template:More_citations_needed`（検索結果のみ）。
- **解いている問題**: 「これは事実として書かれているが出典が無い」という一文単位の欠落を、本文を書き換えずに指摘する。
- **具体的な見せ方（伝聞）**: 本文中に小さい上付きの `[citation needed]` リンクを埋め込む（1文単位）。記事全体・節単位では冒頭に目立つ帯（banner）を出す粒度違いのテンプレートが複数ある（Template:More citations needed = 記事全体、Template:More citations needed section = 節単位、Template:Citation needed = 1文単位）。
- **研究・批判**: 検索結果の範囲では専用の実験研究は見つからなかった。
- **我々に使えるか**: **使える**。「行1本の欠落」と「行全体・カテゴリ全体の欠落」を粒度別に別々の視覚要素で示す発想は、我々の `Line.tier === 'none'`（1行の未取得）と `Row.excluded`（複数行の未取得の合算）を画面上で区別して出す現行設計（`RankBoard.tsx` の `excl. ...` 表示）とすでに近い。粒度をさらに細かく（1文=1行）保つ規律として引用できる。

### 14. Our World in Data のデータ品質注記

- **出典**: `ourworldindata.org/faqs`、`ourworldindata.org/data-insights/spotting-and-fixing-data-issues-how-we-help-improve-data-quality-on-and-off-our-publication`（検索結果のみ）。
- **解いている問題**: 二次利用データ（他機関の統計）を再配布する際、原典の既知の欠陥（例: 土地利用がGHG統計から抜けている等）を隠さず、かつ本文を煩雑にしない。
- **具体的な見せ方（伝聞）**: 各グラフ・表に出典と最終更新日を必ず添える。方法論注記（例: GDPがインフレ調整済みか）をキャプションレベルで明示。異常値を検知する内製ツールで原典提供元にフィードバックするプロセスを持つ。
- **研究・批判**: 検索結果の範囲では専用の実験研究は見つからなかった。
- **我々に使えるか**: **使える**。「出典＋参照日を常に併記する」という規律は、`RankBoard.tsx` の `Summary` が既に ECB のレート出典・参照日を書き分けている実装方針（`asOf` と `fetchedOn` を区別）と完全に一致しており、他の `tier: unverified` な行にも同じ規律を広げる根拠として引用できる。

### 15. Open Food Facts の完全性

- **出典**: `openfoodfacts.github.io/openfoodfacts-server/api/`、`world.openfoodfacts.org/nutriscore`（検索結果のみ）。
- **解いている問題**: クラウドソースの製品データベースで、項目ごとの入力有無・信頼性がばらばらな中、Nutri-Score等の派生指標をどう出すか。
- **具体的な見せ方（伝聞）**: 必要フィールドが揃っていない製品にはスコア自体を出さない（欠落を推測で埋めない）。データは「誰でも編集できる」ことを明示し、正確性の保証はしていない旨を明記。
- **研究・批判**: 検索結果の範囲では専用の実験研究は見つからなかった。
- **我々に使えるか**: **使える（消極的な意味で）**。「必要なデータが無ければスコアそのものを出さない」という態度は、我々の `amount: null` を `0` で埋めない・`tier: none` を `—` と表示する既存の規律（`types.ts` のコメント）と同じ思想。裏付けの弱い実例だが方向性の一致として引用する。

### 16. 米国 Good Faith Estimate（医療費見積もり、No Surprises Act）

- **出典**: `cms.gov/files/document/gfe-and-ppdr-requirements-slides.pdf`、`dmc.org/no-surprises-act-good-faith-estimates`（検索結果のみ）。
- **解いている問題**: 事前に確定できない医療費を、患者に対してどこまでの拘束力で提示するか。
- **具体的な見せ方（伝聞）**: 施術前に書面で見積総額を提示する法的義務。見積もりと実際請求の乖離が**$400以上**あれば、患者は異議申立（dispute resolution）を起こせるという、金額の閾値付きの「約束の強さ」の制度設計。
- **研究・批判**: 検索結果の範囲では効果検証（患者の理解度・意思決定への影響)は見つからなかった。
- **我々に使えるか**: **条件付き**。UIパターンというより制度設計だが、「見積もりと実額の乖離をどこまで許容するか」を明文の閾値で区切る発想は、我々が `invoice_check: contradicted`（実測が見積もりと食い違った）をいつ「深刻な不一致」として警告表示に格上げするかの閾値設計の参考になりうる。ただし米国医療の$400は文脈依存の数字であり、そのまま流用できる値ではない。

---

## 「不確実性の可視化は判断を改善するか」についての知見

**出典のある知見が見つかった。** 中心はJessica Hullman（Northwestern）らの一連の研究（検索結果経由、原論文PDFへの個別WebFetchは未実施——`arxiv.org/pdf/1908.01697`「Why Authors Don't Visualize Uncertainty」、`users.eecs.northwestern.edu/~jhullman/paper_BELIV_evaluating_uncertainty_vis.pdf`、Padilla・Kay・Hullman "Uncertainty Visualization" 2020/2022 サーベイ論文など）。

要点（検索結果の要約に基づく、一次データへの到達なしと明記した上で）:

- Hullman, Resnick, Adar (2015) は、**hypothetical outcome plots（HOPs、分布から1サンプルずつをアニメーションで見せる手法）が、変数の順序に関する推論において、エラーバーやバイオリンプロットより優れていた**、と報告されている。
- 一方で別の研究では、単一分布と複数分布（バイオリンプロット・標準偏差のエラーバー）から得られる確率判断に大差が無かった、という逆の結果も報告されており、**「不確実性を可視化すれば必ず理解が良くなる」という単純な結論では無い**——手法と課題（タスク）の組み合わせに強く依存する、というのがサーベイ論文群(Padilla et al. 2020/2021 "A review of uncertainty visualization errors")の立場。
- NYTニードル（#2）とハリケーンcone（#3）は、いずれも**「不確実性を見せる意図の表現が、実際には確実性の誤読を誘発した」実例**として、査読誌（BAMS, Broad et al. 2007）および業界批評（CJR, Poynter）の両方に記録がある。cone の方は査読付き学術研究(BAMS)であり、より確度が高い。

**したがって**: 「不確実性を見せればユーザーの判断が良くなる」という単純な仮説は支持されておらず、**表現手法（cone/needle/error bar/HOPs等）ごとにタスクとの相性を検証する必要がある**、というのが現時点の到達できた知見の要約。我々のUIをどれか1つの意匠に決め打つ前に、少なくとも「境界線を太く強調する意匠は誤読を誘発しやすい」（#3の教訓）という否定的知見だけは反映すべき。

---

## 我々に使えると判断した上位5つ

1. **#11 DHL/Zonos の Landed Cost 見積もり** — 「保証 vs 見積もり」の二値ラベル＋項目別内訳という構造が、我々の `Row.total` と `Line.tier` の関係に最も近い。免責文の書きぶり（誰が何を確認していないかを名指し）も流用できる。
2. **#6 IPCC の likelihood/confidence 2軸** — 我々の3軸（tier/confidence/invoice_check）をユーザー向けに畳む際、「金額の確からしさ」と「検証の深さ」の2軸に整理し直す設計指針として直接使える。
3. **#3 ハリケーン Cone of Uncertainty（の失敗）** — 「境界線（縁）自体が過剰な意味を持って読まれる」という査読付き知見。`total.high === null` の表現を太い枠線で区切らない、という否定的だが具体的な設計制約になる。
4. **#10 Wise の手数料・レート見積もり** — 「確定できる要素」と「変動する要素」を1つの内訳の中に混在させて出す構造が、我々の `tier: fixed` な費目と `estimate/unverified` な費目の混在表示とそのまま一致する。
5. **#14 Our World in Data のデータ品質注記** — 出典と参照日を必ずセットで書く規律。既に `Summary`（`RankBoard.tsx`）のECBレート表示で実践している方針を、他の `unverified` 行にも一貫して広げる根拠として引用できる。

**見つからなかったもの（明言）**: 「上限が存在しない／分からない」を専用の視覚記法（開いたエラーバー等）で表す実例、および明確な2シナリオ（楽観/悲観）比較の実例。どちらも今回到達した16件の中には無かった。
