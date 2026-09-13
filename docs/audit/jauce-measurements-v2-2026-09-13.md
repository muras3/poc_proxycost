# Jauce 実測データ v2 の取り込み(2026-09-13)

対象: `master/courier-rates.json`。オーナー提供の実測ファイル
`jauce_shipping_measurements_v2` (242 observations, 154 not_available, 6宛先
US/GB/FR/AU/CA/SG, grid定義, sources, cross_check) を丸ごと取り込んだ。

`observations.jauce_v2_2026_09_12_grid` / `..._not_available` / `..._grid_definition`
に生データを保存し、分析済みの結論は `conclusions.jauce_v2_2026_09_12_*` の5件に
分けて記録した。**`src/` には一切触れていない** ── このデータをどう価格計算に
配線するか(あるいは配線しないか)は別の意思決定として残している。

## 記録した4つの所見(フラットに数値化しなかったもの)

1. **SUBMITボタンの再計算バグ** (`jauce_v2_2026_09_12_submit_button_bug`) ──
   直前条件の値が残留し、正しい値に切り替わるまでのクリック回数が1〜4回以上と
   不定。`read_network_requests` でSUBMIT時にネットワークリクエストが一切
   発生しないことを確認しており、サーバー遅延ではなくクライアント側の状態管理
   バグと判断。収集者は「同一値を2回以上連続で確認してから採用」のプロトコルを
   敷いたが、**さらにクリックすれば違う値が出た可能性はゼロではない**と明記
   している。

2. **AU/CA/FRの完全フラット、GBの2段フラット** (`jauce_v2_2026_09_12_flat_ems_across_weight`) ──
   500g〜20000gの11点でEMS基本料金が一切変化しない。日本郵便EMSは重量帯で
   単価が決まる公表体系なので、20kgと500gが同額というのは文字通りには
   成立し得ない。原因を(a)Jauce独自の重量帯フラットレート方針、
   (b)Jauce側のロジックバグ、(c)所見1のSUBMITバグによるstale値混入、の
   いずれとも決め打ちせず、**不確実性そのものを一級の結論として記録した**。
   **もしこのフラット値をそのまま信頼できる料率として配線すれば、重量の重い
   カートでJauceが最安に見えるようになる** ── それがartefactだった場合は
   偽のランキングになる、とPR #93と同じ形のリスクとして明記した。

3. **SGの基準ボックス割引** (`jauce_v2_2026_09_12_sg_reference_box_discount`) ──
   600g固定で寸法だけを振ると、20x15x10cm(=リポジトリの
   `DEFAULT_PARCEL_DIMENSIONS_CM`と一致)のときだけEMS ¥1,900、それ以外の
   全寸法・空欄では¥2,150。**我々の既定箱は、SGについてだけ約¥250安い側の
   価格を系統的に引いてしまう。**これは他5か国で確認された「寸法を見ない」
   という所見と矛盾するので、一般化はしていない(`docs/PRINCIPLES.md` 原則3)。

4. **方式の提供可否は宛先依存** (`jauce_v2_2026_09_12_method_availability_by_destination`) ──
   Surfaceは米国で恒常的にNot available(declared)だが、GB/FR/AU/CAでは
   ¥2,750で恒常的に提供。SALは6か国とも常にNot available(declared)。
   AUのみEMS/SurfaceどちらにもGST注記が出るが金額は非表示 ──
   0円ではなく「金額不明の既知の追加費用」として記録。

## マスタ内の既存データとの矛盾(このPRの発見物として最も価値がある点)

取り込み前からマスタにあった単点測定 `observations.jauce_country_600g_20x15x10`
(600g・20x15x10cm時点のスナップショット)と、本ラウンドの同条件の実測を
突き合わせたところ、**FR・CA・AU・SGの4か国で値が一致しなかった**
(GB・USは一致)。

| 国 | 旧マスタ(600g/20x15x10cm) | 新ラウンド(同条件) |
|---|---|---|
| FR | EMS ¥3,400 | EMS ¥3,150 |
| CA | EMS ¥3,400 | EMS ¥3,150 |
| AU | EMS ¥3,400 | EMS ¥3,150(寸法空欄では¥3,400) |
| SG | EMS ¥2,150 | EMS ¥1,900(基準ボックス以外では¥2,150) |

旧AU値が新ラウンドの「寸法空欄」条件の値と、旧SG値が新ラウンドの「基準ボックス
以外」の値とそれぞれ一致しているのは、旧600g単点測定が当時のSUBMIT再計算バグに
巻き込まれていたか、寸法欄の入力状態が意図と異なっていた可能性を示す状況証拠
だが、**旧測定を再実行して確認していないため断定はせず、旧観測は書き換えていない**。
`conclusions.jauce_v2_2026_09_12_master_contradiction_found` に記録した。

## 検証

- `python3 master/validate.py` / `master/render-docs.py` は `master/fees.json` /
  `customs.json` / `fixtures.json` のみを読み、`courier-rates.json` は対象外
  (確認: 両スクリプトに `courier-rates` の参照なし)。したがってこのPRは
  両スクリプトの出力に影響しない。
- `npx vitest run` の件数で既存テストが壊れていないことを確認(下記レポート参照)。
