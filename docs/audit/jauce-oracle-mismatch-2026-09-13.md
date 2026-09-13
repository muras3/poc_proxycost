# Jauce オラクル不一致（CA/GB）監査 — 2026-09-13

対象: PR #126 が入れた `src/lib/pricing/calculator-oracle.ts` の突合結果、`differ_unexplained` 4件
（`jauce:CA:500g:ems` / `jauce:CA:500g:surface` / `jauce:GB:500g:ems` / `jauce:GB:500g:surface`）。

## 1. 不一致の正確な内容（自分の目で確認した数値）

`npx vitest run src/lib/pricing/calculator-oracle.test.ts` の出力と `master/courier-rates.json`
（`observations.jauce_v3_remeasurement_2026_09_13.grid_b_au_ca_fr_gb_weight_curve_2026_09_13`）を
直接読んで確認した。報告にあった「¥1,000 と ¥400」は正しかった（前提ではなく検証結果として確認）。

| # | 観測 (条件) | 商品価格 | 寸法 | 代行の表示額 | エンジンの算出額 | 残差 (表示−エンジン) |
|---|---|---|---|---|---|---|
| 1 | Jauce・CA・500g・EMS   | (このハーネスは送料のみ比較。商品価格・数量は入力に含まれない) | 20×15×10cm | ¥2,150 | ¥3,150 | **−¥1,000** |
| 2 | Jauce・CA・500g・Surface | 同上 | 20×15×10cm | ¥2,350 | ¥2,750 | **−¥400** |
| 3 | Jauce・GB・500g・EMS   | 同上 | 20×15×10cm | ¥2,150 | ¥3,150 | **−¥1,000** |
| 4 | Jauce・GB・500g・Surface | 同上 | 20×15×10cm | ¥2,350 | ¥2,750 | **−¥400** |

注記: `calculator-oracle.ts` はこのPRの範囲では郵送料そのものだけを突き合わせており（`docs/measurements/CALCULATOR-ORACLE.md`
の「これは何を証明しないか」節参照）、商品価格・数量はこの4条件の入力に含まれない。「商品価格」列を空欄にしたのはこのため。

## 2. 差額の分解 — `Row.Line` を全部ダンプして原因を絞り込む

`postageFor()` / `markupYen()` の内訳（このハーネスが比較しているのはこの2値の合計だけ）:

### #1・#3: EMS（CA・GB共通、500g）
```
engineYen = postageFor('ems', cc, 500).yen + markupYen(...)  // Jauce EMSにmarkupは無い(0)
          = EMS_TABLE[500g行][zone3列] + 0
          = 3150 + 0 = 3150
```
- `EMS_ZONE.CA = EMS_ZONE.GB = 3`（`src/lib/pricing/ems.ts`）
- `EMS_TABLE` の 500g 行: `[500, 1450, 1900, 3150, 3900, 3600]` → zone3(第3地帯) = **3150**
- 単一の Line（EMS表引き）で説明が付く。マークアップ等の合成ではない。

### #2・#4: Surface（CA・GB共通、500g）
```
engineYen = postageFor('parcel-surface', cc, 500).yen + markupYen(JAUCE_SURFACE_MARKUP, cc, 500)
```
- `postageFor`: `PARCEL_SURFACE[zone3]` を `grams <= g` で検索 → 500g は最初の段 `[1000, 2500]` に該当 → **2500**
- `markupYen`: `per-kg-step` = `250 * Math.ceil(500/1000)` = `250 * 1` = **250**
- 合計 = 2500 + 250 = **2750**
- こちらは2つの Line（郵送料本体2500 + Jauce独自の梱包マークアップ250）の合成。どちらも単独では
  差額(¥400)を説明しない——2500単独なら差は¥150、2750が正しい内訳。

### 差額そのものの分解
表示額¥2,150／¥2,350 は、上記どの Line （zone3の郵送料・markup）を個別に足し引きしても作れない。
一方で **`EMS_TABLE`/`PARCEL_SURFACE` の zone2（第2地帯）列を使うと一致する**（§3で詳述）。
つまり差額は「単一の会計項目の欠落・重複」ではなく、**地帯（zone）そのものの取り違え、または
別条件の観測値の混入**という構造的な不一致であり、Line 単位の加算では説明できない。

## 3. `EMS_ZONE` 仮説の検証

### 3.1 我々のコードの地帯定義
- `src/lib/pricing/ems.ts`: `EMS_ZONE = { US: 4, GB: 3, DE: 3, FR: 3, AU: 3, CA: 3, SG: 2 }`
- `src/lib/pricing/postage.ts`: `POSTAL_ZONE = { SG: 2, US: 3, GB: 3, DE: 3, FR: 3, AU: 3, CA: 3 }`
  （EMSと通常郵便で地帯の割り方が違う旨のコメントあり。今回はEMSの`EMS_ZONE`が疑われている）

### 3.2 公式出典との突合
出典: `https://www.post.japanpost.jp/send/oversea/charge/list-ems/all.html`
（`src/lib/pricing/ems.ts` の `EMS_SOURCE_URL`、確認日 2026-09-06 と記載。今回 WebFetch で再取得できた）

取得結果（2026-09-13 に WebFetch で確認）:
- **Canada は Zone 3**（オセアニア・カナダ・メキシコ・中近東・ヨーロッパ）
- **United Kingdom は Zone 3**（同上、ヨーロッパ圏）
- **Singapore は Zone 2**（アジア（中国・韓国・台湾を除く））

→ **我々の `EMS_ZONE`（CA=3, GB=3, SG=2）は公式表と一致している。バグではない。**

### 3.3 それでも一致する数値がある — なぜ「たまたま」では説明できないか
表示額¥2,150／¥2,350は、`EMS_TABLE`・`PARCEL_SURFACE` の **zone2（SGの地帯）** の値と
ビット一致する:

| 項目 | zone2で計算した値 | 表示額 |
|---|---|---|
| EMS・600g・zone2 | `EMS_TABLE`の600g行 zone2列 = ¥2,150 | ¥2,150 |
| Surface・600g・zone2 | `PARCEL_SURFACE[zone2]`の1000g段(600g該当) ¥2,100 + markup(250×1)=¥2,350 | ¥2,350 |

しかもこの2値（¥2,150・¥2,350）は、同じ `master/courier-rates.json` の中の
**別の観測**——`grid_c_sg_dimension_comparison_2026_09_13`（SG・600g・20×15×10cm）
の実測値と**完全に一致する**（EMS ¥2,150／Surface ¥2,350、どちらも `smart_packing: 420` まで
CA/GBの500g行と同一）。EMSとSurfaceという計算方法の異なる2本の系列が、両方とも
「zone2・600g」という一貫した組み合わせに揃うのは、我々のコードのバグでは説明しにくい
（`EMS_ZONE`と`POSTAL_ZONE`は独立したテーブルであり、両方が同時に「CA/GBをSGの地帯として
600gの段で誤って参照する」ような共通のバグ経路はコード上に存在しない）。**測定側で
SGの結果がCA/GBの表示に混入した**と考えるほうが、2系列同時一致をはるかに単純に説明する。

**結論: `EMS_ZONE` 仮説は棄却する。** 我々の地帯表は公式出典と一致しており、コードにバグは無い。

## 4. 生測定ファイルの確認 — stale仮説の検証

`docs/measurements/raw/jauce/2026-09-13-v3-remeasurement.md` と `master/courier-rates.json` の
`jauce_v3_remeasurement_2026_09_13` を確認した。

- CA/GB・500g の値は **PR #107 由来ではなく、2026-09-13 の `v3` 再測定由来**（`measured_date: 2026-09-13`、
  `capture_file` は 2026-09-13 のもの）。つまり「古いラウンドの値が置き換えられずに残っていた」という
  意味でのstaleではない。
- ただし v3 自身の `methodology_note` が明記する通り、v3 measurement はさらに前段（v2、2026-09-12、
  4体のサブエージェント並列実行・同一Chromeプロファイル共有）で「タブ間の状態汚染が複数回観測された」
  ことを受けて、**汚染が疑われた項目だけ**を単一操作者・単一セッションで撮り直したもの。
  CA・GBの500gはその撮り直し対象に含まれていた（`contamination_note` 参照）。
- `contamination_note`（CA・500g）: 「click1ではAUの残留値（¥3,150 + GST for Australia）が
  誤表示され、click2で正しいCAの値に切り替わり以降安定。」— **この「正しい」は測定者の自己申告であり、
  独立に検算されていない**（`docs/measurements/CALCULATOR-ORACLE.md` が既に明記している通り）。
  §3.3で示した通り、その「click2の値」は実際にはSGの値と一致しており、自己申告の「正しさ」は
  裏付けられない。
- GB・500g は `submit_clicks_to_stabilize: 1` で `contamination_note` が付いていない
  （＝この項目自体は「残留値の混入」としては記録されていない）。にもかかわらず値はCAと
  ビット一致し、かつSG@600gともビット一致する。これは、**目に見える残留値症状
  （前条件の値が一瞬映る）が無いケースでも汚染が起きうる**ことを示唆する——
  v3自身が「同一プロファイル内のタブ間で何らかの状態（localStorage等）が共有されている
  可能性があり、技術的な原因までは特定できていない」と記す通り（CLAUDE.md §9: 状況は
  理由にならない。ここでは「原因不明」以上を主張しない）。

**stale仮説（v2由来の値が紛れ込んだままv3に載った）は、日付・ファイル出所としては否定できる
（値そのものはv3日付のもの）が、「v3の測定操作自体がSGの結果を誤って拾った」という意味での
汚染は、§3.3のビット一致という強い状況証拠がある。**

## 5. 結論: **(B) 測定値が信用できない**

根拠（3点、すべて上で示した一次データに基づく）:

1. 我々の `EMS_ZONE`／`POSTAL_ZONE` は公式出典（Japan Post EMS料金表、2026-09-13 WebFetch確認）
   と一致しており、CA・GBをZone3とする実装は正しい。バグの経路はコード上に見当たらない。
2. CA・GB・500gの表示額（EMS ¥2,150／Surface ¥2,350）は、**同じ測定セッション内の別条件
   （SG・600g）の実測値とEMS・Surface両系列でビット一致する**。2系列同時一致は単一のコード
   バグでは説明しにくく、測定側の混入で説明する方が単純である。
3. 生データ自身（`contamination_note`）が、少なくともCAについて「click1でAUの残留値が誤表示
   された」という同種の汚染を自己申告しており、GBについても外形上区別できない同じ症状の
   可能性を排除できない。

**したがって `src/lib/pricing/` もマスタの `EMS_TABLE`／`PARCEL_SURFACE` も変更しない。**
`calculator-oracle.test.ts` の `KNOWN_UNRESOLVED_MISMATCH_IDS` もそのまま残す
（このPRでは書き換えない——`docs/measurements/CALCULATOR-ORACLE.md` の指示通り、
再測定なしに書き換えない）。

`master/courier-rates.json` の当該4件のうちCA/GB・500gの2エントリに、この監査へのリンクを
持つ `reliability_flag` / `reliability_note` を追加した（数値そのものは変更していない）。

## 6. 再測定手順（CLAUDE.md §10 準拠。実施はしない — ブラウザ操作は自分ではしない）

次にJauceのCA/GB・500gを再測定するときは、以下を守ること:

1. **単一のブラウザセッション・単一タブ**で、他のエージェント・自動化タスクと**同一プロファイルを
   共有しない**（v2の並列実行汚染の再発を避ける）。
2. **1条件ずつ順番に測る。** 直前にSG（またはAU等の他条件）を測っていないまっさらなセッションで、
   CA・500g・EMS/Surfaceだけを先に測る。SGはCA/GBの後、または別セッションで測る
   （「直前にSGを測っていない」という条件を明示的に作ることで、混入経路そのものを断つ）。
3. **陽性対照（US・EMS・500/3000/20000g → ¥3,900/¥10,300/¥51,100）を毎回先頭に測り**、
   平坦に出たらその回は無効。
4. **SUBMITは2〜3回押し**、そのつど:
   - 画面の価格が連続して同じ値か
   - 画面に表示されている入力値（重量・寸法・国）が実際に入力した値と一致しているか
   - **表示された配送方式の集合**（EMS/SAL/Surfaceの有無）が毎回同じか
   を確認する。1回でも変われば、それ自体を不安定性として記録する。
5. `docs/measurements/CALCULATOR-ORACLE.md` の条件「G-2」（CA/GBのEMS・500/600/1000g）に
   従い、**500gだけでなく600g・1000gも測って階段の境界を確認する**——今回の疑いが
   「600g帯の値が500gの表示に混ざった」というものである以上、600g自体を正しく単独測定して
   500gと明確に異なる額が出ることを確認するのが、最も直接的な反証・確証になる。
6. 得られた値は `master/courier-rates.json` の該当エントリを置き換え、`reliability_flag`/
   `reliability_note` を外し、`calculator-oracle.test.ts` の `KNOWN_UNRESOLVED_MISMATCH_IDS`
   を更新すること（一致すれば4件とも削除、再現すれば残す）。

## 7. 残った未知（正直に書く）

- CA/GBとSGの値がビット一致した**技術的な混入経路**（localStorage共有か、Jauce自身のサーバ側
  キャッシュか、それとも純粋な偶然の一致か）は特定していない。特定するにはブラウザの
  DevTools（Network/Application タブ）でのライブ観測が必要で、今回のタスク範囲では行っていない。
- GBの`submit_clicks_to_stabilize: 1`（目に見える残留値症状なし）が、CAと同じ混入経路によるものか、
  それとも独立した別の原因かは未確認。
- 「Jauceが実際にCA/GBをどこかの条件でzone2の設備・価格帯に振り分ける可能性」自体を完全には
  排除できていない（可能性は低いと判断したが、ゼロとは主張しない）——これを排除するには
  §6の再測定が必要であり、まだ実施していない。
