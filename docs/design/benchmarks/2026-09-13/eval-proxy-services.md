# 代行・転送サービス 11社 UI評価（2026-09-13）

対象: shots/s01〜s11。基本は desktop-full または mobile-full を見て、一部 fold も確認した。full 画像は縦に長く、縮小表示で読んだ。そのため細かい文字は読めていない。読めなかった所は推測で埋めず「読めない」と書く。
**撮影できなかったもの（capture-log.json と画像で確認）**
- Buyee desktop: 403 Forbidden。mobile は撮れた。
- FROM JAPAN desktop: 403 Forbidden。mobile は撮れた。
- ZenMarket desktop: Cloudflare の "Just a moment..."。mobile は撮れた。
- Sendico: desktop・mobile とも Cloudflare の認証画面で、中身はまったく見えない。
- Doorzo mobile: 通貨選択モーダル（Step 1）が画面を覆っていて、裏は見えない。高さは 664。

---

## s01 Buyee（mobile のみ）
- **第一印象**: 開くとまず Google翻訳の言語選択、楽天の広告バナー、「Winning bid Up to 20% OFF」の全面モーダルが重なり、下端には PR の固定帯もある。オレンジ系でアニメ画像が多い。とても騒がしい。本文は商品グリッド（Recommended for you）が延々と続き、下の方に「What is Buyee?」と手順図がある。
- **料金の見せ方**: 商品カードに Price / Buy It Now Price / Current Price を「12,900 YEN」のような形で並べている。手数料や送料はトップには出ていない。
- **取り入れる点**: 同じ商品カードの中で、ラベルを変えて価格を積む書き方（Price / Current Price）は、費目ラベル＋金額の縦積みに使える。「〜 until the item is delivered」の手順アイコンリストは、総額の内訳ステップを説明するのに使える。
- **避ける点**: 最初の画面を覆う割引モーダル、何重にもなった広告、翻訳ウィジェット。この「クーポン額が本当の総額を隠す」構造こそ、proxycost が逆を行くべき所。
- **参考度**: 2

## s02 ZenMarket（mobile のみ）
- **第一印象**: 白地に青緑、細い書体で密度は中くらい。上部にセールの帯と検索、その下に Cookie バナーがかぶる。「How to buy」の縦ステップが見出しの近くにある。
- **料金の見せ方**: 「Get a quote」「Pay for shipping」を手順の中で説明し、「TRANSPARENT FEE STRUCTURE」を利点に挙げている。金額そのものはトップでは読めない。
- **取り入れる点**: 縦ステップ（Add to cart → Get a quote → Wait → Specify shipping → Pay for shipping → Receive）は、「いつ何を払うか」（1回目の支払い／2回目の支払い）を時間軸で見せる手本になる。モバイル結果画面の行を展開したときの内訳を、時系列の順に並べる案に使える。
- **避ける点**: 「透明」をうたうのに数字を出していない。マーケット名のボタンを縦にずらっと並べていて冗長。
- **参考度**: 3

## s03 Neokyo
- **第一印象**: 白と青、丸いサンセリフ、カードと影を使ったオーソドックスな EC の見た目。入るとすぐ「50% off coupon」の全面モーダルが出る。トップの帯もプロモーション。
- **料金の見せ方**: 本文に「commission is only 350 yen per item + packaging fees」とさらっと書いてある。FAQ に「What is the Neokyo fee plan?」「customs duties?」。フッターに **PayPal Charge Rate 100 Yen = US$ 0.65** と **JST の時計**、「Shipping cost estimator」へのリンクがある。
- **取り入れる点**: フッターの小さなボックスで「換算レートと取得時刻」を示すやり方は、proxycost の「為替・料金表の取得時点」の表示にそのまま使える。5ステップのアイコンカード（Find → Purchase → Store → Pack → Ship）は、費目がどこで発生するかの凡例に使える。FAQ のアコーディオン（関税の扱いなど）は「What could be off」節の形に合う。
- **避ける点**: クーポンのモーダル。料金を長い文章の中に埋めていること。
- **参考度**: 3

## s04 FROM JAPAN（mobile のみ）
- **第一印象**: 白・黒・赤、細めの書体で情報が詰まっている。上にメルカリ 8% OFF のバナー、URL 貼り付けの検索欄。中ほどで Cookie バナーがかぶる。
- **料金の見せ方**: Usage Guide が「Pay for items (**Charge 1**)」「Pay for shipment (**Charge 2**)」と、支払いを2回に分けて明示している。営業時間の表とカレンダーもある（倉庫の休業日を示す）。
- **取り入れる点**: **Charge 1 / Charge 2 の区切り**は、総額の内訳を「商品と一緒に払う」「発送時に払う」の2グループに分ける根拠として一番わかりやすい。「Paste URL or Search」の1本入力は、proxycost の SearchBox と同じ考え方で、正しいことが確認できる。
- **避ける点**: カレンダーや SNS の列挙などで下半分の情報が多すぎる。desktop は 403 なので評価できない。
- **参考度**: 4

## s05 Jauce
- **第一印象**: 2010年代のままの青いバナー（「SINCE 2005」と女性の写真）、画像グリッド、ブログの一覧。古いが、落ち着いていて読める。
- **料金の見せ方**: トップに金額はない。フッターに「**Delivery fee estimator**」「**Service fee estimator**」のボタンが2つあり、日本時間の時刻も表示している。
- **取り入れる点**: 見積もりツールを「送料」と「手数料」に分けて出す発想は、proxycost の費目の分け方と合う。フッターの JST 時刻は、データ時点の表示の小さな手本。
- **避ける点**: 見積もりツールがフッターに埋もれている（proxycost では主役にすべきもの）。ストック写真のヒーロー。
- **参考度**: 2

## s06 tenso（転送）
- **第一印象**: 倉庫スタッフの写真ヒーロー、明朝系の見出し、白地に水色と緑の CTA。落ち着いた「信頼」系。
- **料金の見せ方**: 3ステップ（Shopping / Domestic Shipping / International Shipping）を**チャットの吹き出し**で説明し、「Available shipping methods」へ誘導する。フッターの下に黄色枠の「**Shipping Fee Calculator** — EMS, AIR, SAL, Surface…」ボックスがある。
- **取り入れる点**: 国内送料と国際送料を、ステップの段階そのものとして分けて見せる構成。発送方法（EMS/AIR/SAL/Surface）を列挙してから計算機へつなぐ流れは、MethodPicker の説明文に使える。枠で囲った計算機の入口カードは、`/sources` への導線に使える。
- **避ける点**: 写真カルーセルと Customer stories が長くて、料金に行き着くまでが遠い。
- **参考度**: 3

## s07 Blackship（転送）
- **第一印象**: 紫と濃紺のダーク UI、手書き風の見出しと大胆なイラスト。今どきのスタートアップらしい、トーンの一貫したブランディング。
- **料金の見せ方**: トップナビに **Pricing** を独立して置いている。機能カードに「\* Additional fees apply.」と**注記の記号を使った但し書き**がある。「Free Storage for 45 days」を見出しで言い切っている。フッターに Shipping Calculator。
- **取り入れる点**: 見出しの右上の `*` とカード内の小さな注記で「追加料金あり」を示すやり方は、確度「推定」マークの控えめな置き方の参考になる。3列アイコングリッド（Consolidation / Split Package / Package Photos…）は、会社ごとの「払う／払わない」サービス比較の見た目に使える。
- **避ける点**: ダーク＋装飾イラストは比較表の読みやすさとは相性が悪い。数字が1つもない。
- **参考度**: 3

## s08 Sendico
- desktop・mobile とも Cloudflare の "Performing security verification" の画面だけ。**中身は評価できない。**
- **参考度**: 評価不可（—）

## s09 Japan Rabbit（whiterabbitexpress → japanrabbit.com に転送）
- **第一印象**: 白地に朱赤1色の線画イラスト、太い赤見出し、余白がたっぷり。和のモチーフを1色で統一していて上品。左下に Cookie バナー（「Cookie mumbo jumbo」）。
- **料金の見せ方**: 「Get a quote, instantly」「100% Money-Back Guarantee — … excluding nominal auction bidding fee」と、**例外を同じ文の中で明記**している。ナビに PRICING、フッターに Service Fees / Shipping Calculator。
- **取り入れる点**: 1色のアクセントと線画アイコンで密度を下げる手法は、proxycost のトークンの範囲でも再現しやすい。保証文に例外を同じ行で書く書き方は、「CHEAPEST（ただし推定値を含む）」のように確度を並べて書くコピーの手本になる。FAQ のタブ（The Basics / Getting Started）も使える。
- **避ける点**: イラストが大きく、スクロールが長い。トップに数字がない。
- **参考度**: 3

## s10 Doorzo
- **第一印象**: オレンジ／黄色で高密度な中華 EC 風。desktop はクーポン4枚のモーダルと Cookie バナー、mobile は通貨選択のモーダルで覆われる。上部に「0 Purchase Fees」の大きな帯。
- **料金の見せ方**: desktop の Usage Guide が縦タイムラインで「**First Payment: Item Fee**」「**Second Payment: International Shipping Fee**」と、2回の支払いを色付きの節点で交互に配置している。mobile では通貨を選ぶと「**Reference currency is for estimation only**」と注記が出る。
- **取り入れる点**: (1) 参照通貨は「あくまで概算」と、選ぶ場面で言い切る注記は、proxycost の `~` 付き総額と通貨換算の注記にそのまま使える。(2) 2回払いのタイムラインは、FROM JAPAN の Charge 1/2 と並んで、内訳を時系列で見せる根拠になる。
- **避ける点**: 「0 Purchase Fees」を大きく掲げて、他の費目を小さくする見せ方（総額の比較をゆがめる典型）。何重にもなったモーダル、密度の高すぎるグリッド。
- **参考度**: 4

## s11 Remambo
- **第一印象**: 白地のカード型、緑とオレンジと紫が混ざった CTA、Trustpilot の星、細いサンセリフ。整っているが、色の役割がばらばら。Cookie 帯が中ほどにかぶる。
- **料金の見せ方**: バッジで「**Transparent Pricing**」「**No Upfront Deposit**」。リンクで「Fees and services」。ヘッダーに **Calculator** と **Currency: USD** の切り替え。フッターに Services & Pricing / Shipping Cost Estimator / Warehouse Storage Time。
- **取り入れる点**: ヘッダーに通貨の切り替えと Calculator を常に置くことで、比較の前提条件（通貨）をいつでも見える所に置ける。番号付きの「Why Use」リスト（左に太字見出し、右に説明の2列）は、`/sources` の説明ページの組み方として読みやすい。
- **避ける点**: CTA の色が3系統あって優先度がわからない。「Transparent Pricing」とバッジで言うだけで、数字を出していない。
- **参考度**: 3

---

## カテゴリ全体の共通パターン
- トップの主役は「商品を探す／買う」ことで、**総額は1社も出していない**。料金はフッターの Calculator / Estimator / Fees へ遠ざけられている。
- 「透明な料金」を**バッジや文言で言うだけ**（ZenMarket・Remambo）で、数字を並べない。
- 支払いを**2段階（商品代＋手数料 → 発送時の国際送料）**として説明するのが定番（FROM JAPAN の Charge 1/2、Doorzo の First/Second Payment、tenso の Step 2/3）。
- 手順を 3〜6 ステップのアイコン列やタイムラインで見せる。
- 入った瞬間のクーポン・割引モーダルと Cookie バナーの重なりがほぼ標準（Buyee・Neokyo・Doorzo・FROM JAPAN・Remambo）。「最大◯% OFF」「0 Purchase Fees」のように、**一部の費目だけを大きく見せる**。
- 為替・時刻（JST）・参照通貨の注記は出てくるが、フッターや設定の奥にあって小さい。
- ボット対策が強い（Buyee・FROM JAPAN の desktop、ZenMarket の desktop、Sendico）。

## proxycost が差別化できる余地
- **総額を最初の画面の主役にする**: 各社がフッターに押しやっている見積もりを、順位と差額の形で最上部に出す。これだけでカテゴリ内で唯一の存在になる。
- **「0 fees」「20% OFF」への反論として**: 費目を1つ残らず同じ大きさで並べ、「その割引を入れても総額は何位か」を見せる。モーダルもクーポンも置かない静かな画面そのものが信頼の信号になる。
- **Charge 1 / Charge 2 の形式に合わせる**: 利用者が既に知っている「2回払い」の区切りで内訳をまとめると、学び直しがいらない。
- **確度をバッジの宣伝ではなく、データの属性として出す**: 「Transparent」と言う代わりに、各費目に 確定／推定／二次／未取得 の記号と出典リンクを付ける。Blackship の `*` 注記や Doorzo の「estimation only」より一段具体的にできる。
- **為替・料金表の取得時点を結果のすぐそばに置く**: Neokyo・Jauce がフッターでやっている JST 時刻とレートの表示を、総額の直下へ持ってくる。
- **会社をまたいだ「払う／払わない」表**: 各社が自社の機能グリッド（Blackship など）でしか見せていないものを、横に並べて比較できる形にする。
