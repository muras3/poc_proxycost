# Jauce 再測定によるPR #107の訂正(2026-09-13)

対象: `master/courier-rates.json`。入力レポート:
`/root/.claude/uploads/2018e7f9-275f-533a-b47f-7ac384387db0/a32724fb-jauce_______20260913_2.md`

**`src/` には一切触れていない。** `master/customs.json` / `master/fees.json` /
`master/validate.py` も対象外(並行するsibling PRが担当)。

## 経緯

PR #107 は「AU/CA/FR/GBのEMSは重量に関わらず平坦」「SGはEMS計算機が基準ボックス
(20x15x10cm)のときだけ約¥250安い」という2つの所見を記録した。オーナーが
「文字通りには成立し得ない結果だ」として再測定を依頼した。今回、単一操作者・
単一ブラウザセッションで1条件ずつSUBMITを2〜3回押して値が固定されるのを
確認するプロトコルで測り直した結果を取り込む。

## 1. 平坦料金説: 否定(DENIED)

`conclusions.jauce_v3_2026_09_13_flat_rate_denied` に記録。

20x15x10cm固定でAU/CA/FR/GBを500g/3000g/20000gで測ると、EMSは
¥3,150(AU/FR)・¥2,150(CA/GB) → ¥8,800 → ¥44,500 と明確に増加した
(Surfaceも¥2,750/¥2,350 → ¥4,450 → ¥16,900)。3000gと20000gでは4カ国が
同一料金に収斂しており、これは日本郵便の共通の距離帯・重量帯テーブルを
使っていることと整合的な**読み**であって、確定した仕組みだと断定するもの
ではない(`reasoned_judgement_unconfirmed`)。

平坦に見えた原因は、①SUBMITの表示更新バグ(前条件の値が残留 / 初回未描画)と、
②4体のサブエージェントが同一Chromeプロファイル・同一タブグループを共有して
並列実行したことによるタブ間の状態汚染、の複合だったと判断している
(これも`reasoned_judgement_unconfirmed`。技術的な汚染経路そのものは特定
できていない)。

`conclusions.jauce_v2_2026_09_12_flat_ems_across_weight` は削除せず、
`superseded_by` で今回のDENIED結論を指すようにした。

## 2. SG寸法依存説: 否定(DENIED)

`conclusions.jauce_v3_2026_09_13_sg_dimension_dependency_denied` に記録。

SG・600g固定で長辺を20cm→21cmに変えても、EMS ¥2,150・Surface ¥2,350の
まま完全に不変だった。前回の「基準ボックスのときだけ¥1,900」という所見は
再現せず、stale display(前条件の値の残留表示)を拾った結果だった可能性が
高いと判断する。ただし検証したのは20cm/21cmの1cm差のみであり、
10x10x10〜50x50x50cmの全寸法グリッドを再実行したわけではないので、
寸法依存性そのものを全域にわたって排除したとは言えない(scope limit)。

`conclusions.jauce_v2_2026_09_12_sg_reference_box_discount` は削除せず、
`superseded_by` で今回のDENIED結論を指すようにした。

## 3. 陽性対照(US)は合格。ただし前回roundの信頼性そのものに疑義

`conclusions.jauce_v3_2026_09_13_positive_control_passed` /
`jauce_v3_2026_09_13_previous_round_reliability` に記録。

US・20x15x10cmでEMSは¥3,900→¥10,300→¥51,100と明確に増加し、手順は
重量差を検出できている。

**再現した値**: US 500g(¥3,900)、US 20000g(¥51,100)。
**再現しなかった値**: US 3000g(旧¥4,180 → 新¥10,300)、AU/CA/FR/GBの
「平坦」所見、SGの基準ボックス割引。

US 3000g付近の値が前回roundと2倍以上食い違ったことから、**前回roundの
Jauceデータは、上記2つの否定された所見に限らず、今回reproduceが確認できた
ものを除いて広く信頼できないものとして扱う。**

## 4. 既存データとの矛盾の再検討(PR #107が「未解決」としていた点)

`conclusions.jauce_v3_2026_09_13_master_contradiction_reexamined` に記録。
PR #107は、マスタの単点測定`observations.jauce_country_600g_20x15x10`が、
自身の(前回round v2の)「寸法空欄」条件(AU)・「基準ボックス以外」条件(SG)
の値とそれぞれ一致することを未解決の状況証拠として残していた。

- **SGは数値が実際に一致した。** 旧単点測定のSG値(EMS ¥2,150、
  Surface ¥2,350)は、今回の再測定(600g/20x15x10cm、EMS ¥2,150、
  Surface ¥2,350)と完全一致した。つまりSGについては**旧単点測定の方が
  正しく**、前回round(v2)の「基準ボックスで¥1,900」の方がstale display
  だったと言える。これはPR #107が疑っていた向き(旧測定が汚染されていた)
  とは**逆**であり、旧測定を裏付ける結果になった。
- **AU/CA/FRは数値が一致するかどうか確認できていない。** 今回の再測定は
  500g/3000g/20000gの3点のみで、旧単点測定と同じ600g/20x15x10cmの条件を
  直接測っていない。参考として`observations.jauce_germany_weight_curve_20x15x10`
  (DE)の500g=¥3,150→600g=¥3,400という刻みは、AU/FRの今回の500g値
  (¥3,150)と整合する初期値から600gで¥3,400へ上がるパターンと矛盾しないが、
  これはDEの系列からの類推(`reasoned_judgement_unconfirmed`)であって
  AU/CA/FR自身の直接測定ではない。

**したがって「解消された」とは断定しない。** SGについてのみ数値が一致する
ことをもって説明がついたと言え、AU/CA/FRについては旧600g値が正しいのか
stale displayだったのかは今回のデータでは未確定のまま残る。次回の再測定で
AU/CA/FR/GBの600g/20x15x10cmを直接取ることが必要。

## 5. 新しく判明した失敗機構: タブ間の状態汚染

`conclusions.jauce_v3_2026_09_13_parallel_tab_contamination` に記録。既に
記録済みのクライアント側SUBMIT再計算バグ(前条件の値が残留する/初回は
描画されない)とは別に、**同一Chromeプロファインを共有する複数の自動化
タスクを並列実行すると、あるタブの入力・結果が別のタブに漏れ込む**ことが
分かった(フランス20000gに無関係なAUのGST注記と上限値が混入、UK
3000g/20000gの初回未描画、SG寸法比較2条件目で3種類の値)。技術的な原因
(localStorage共有か、別の機構か)はここでは特定できていない ──
これ以上推測しない(CLAUDE.md §9)。汚染が疑われた項目は並列を止め、単一
操作者・単一セッションで取り直した。

## 6. AU GST金額の非開示は確定(counted_absence)

`observations.jauce_v3_remeasurement_2026_09_13.note_d_au_gst_amount_2026_09_13`
に記録。「+ GST for Australia」の注記自体はverbatimで再現するが、リンク・
title属性・data属性・イベントハンドラは存在せず、ページに`<a>`要素が0個、
FAQ・内訳セクションも存在しない。これは「読み取れなかった」のではなく
「そもそも掲載されていない」という`counted_absence`として確定できる。

## 検証

- `python3 master/validate.py` : 変更なし(0 contradictions)。`courier-rates.json`
  はvalidate.py/render-docs.pyの対象外(既存の`docs/audit/jauce-measurements-v2-2026-09-13.md`
  に記載の通り、両スクリプトは`fees.json`/`customs.json`/`fixtures.json`のみを
  読み、`courier-rates`への参照を持たない)。
- `python3 master/render-docs.py` / `--check` : 差分なし(courier-ratesは
  レンダリング対象外のため)。
- `npx vitest run` : 件数を確認(下記PR本文参照)。`src/`は変更していないため
  既存テストへの影響は無いはずだが、実測値として実行して確認した。

## CLAUDE.mdへの追記

測定手順のルールをCLAUDE.md §10として追記した(1条件ずつ・単一ブラウザ
セッションで、SUBMITを2〜3回押して値が固定されるのを確認する)。詳細は
CLAUDE.md本文を参照。
