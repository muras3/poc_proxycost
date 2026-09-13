# 生の実測ファイル（index）

このディレクトリは、オーナーが複数のセッションにわたって
`/root/.claude/uploads/2018e7f9-275f-533a-b47f-7ac384387db0/` にアップロードした
**29件・約3.9MBの生の実測ファイル**を、内容を一切変更せずに保存する。

**これは散文の説明ではなく索引である。** 各ファイルについて、どの代行(プロキシ)の、
いつの、何をカバーする測定で、どのPRに取り込まれ、そして──最も重要な点として──
**その内容は今も信頼できると考えられているか**、を1行で記す。

## 原則

- **原文をバイト単位で保存する。** 整形・キーの並べ替え・間引き・「クリーンアップ」は
  一切行っていない。JSONとして壊れているファイルがあれば、直さずにそのまま置き、
  ここにその旨を書く(今回は全26件のJSONが正常にパースできた。壊れているものはない)。
- **読める名前に変え、元のアップロードファイル名は必ずここに記録する。** 元の名前は
  8桁の16進プレフィックス(セッションのアップロードID)を持ち、そのセッションの外では
  意味を持たない。`docs/audit/*.md` の記述が元のファイル名を参照していることがあるため、
  対応表として本READMEを使うこと。
- **信頼性は一律ではない。** 少なくとも2ラウンド(Jauce v2、FROM JAPANの一部)は、
  後続のPRで内容を覆されている。覆された生データも「どう間違えたか」の証拠として
  価値があるので消さないが、良いデータのように見える場所には置かない。

## 命名規則

`docs/measurements/raw/<代行またはグループ>/<日付>-<内容>.<拡張子>`

`<代行またはグループ>` は `jauce` / `fromjapan` / `zenmarket` / `neokyo` / `buyee` /
`surcharges`(運送会社の燃油・遠隔地・立替手数料。5社共通ではなく運送会社(FedEx/DHL/UPS)軸) /
`misc`(単一の代行に属さない複数代行にまたがるファイル、またはプロジェクトのハンドオフ文書)。

## §10 の測定規律との関係

`CLAUDE.md` §10(1条件ずつ・単一ブラウザセッション・SUBMIT複数回確認・表示される配送方法の
集合まで確認する)が明文化されたのは **2026-09-13**。以下の表の `checked_at` が
2026-09-11または2026-09-12のファイルは、**すべてこの規律が確立する前の測定であり、
その規律の下では捕獲されていない。** 該当ファイルは表の「§10前」列に ✓ を付けた。
2026-09-13測定の2件(Jauce v3、FROM JAPAN七か国)は、§10が明文化されるに至った
その日の測定であり、Jauce v3のレポート自身がその規律(単一操作者・単一ブラウザセッション・
1条件ずつ・SUBMIT複数回確認)に沿って測定し直したことを明記している。FROM JAPANの
七か国測定も「500gと2,000gは2回測定し、同一結果」という確認を伴っている。

## 索引

凡例: **信頼性** = 🟢 信頼できると考えられている(後続PRで否定されていない) /
🔴 後続PRで否定・訂正された(全部または一部) / 🟡 未評価・使われていない(取り込まれていない、
または上位版に置き換えられた) / ⚪ 測定データではない(参考文書)。

### Jauce

| 保存先 | 元のアップロードファイル名 | 日付 | 内容 | 取り込みPR | §10前 | 信頼性 |
|---|---|---|---|---|:---:|---|
| `jauce/2026-09-12-six-countries-v2.json` | `05bea962-jauce_shipping_measurements_v2.json` | 2026-09-12 | US/GB/FR/AU/CA/SG、214観測/140 not_available | PR #79(`jauce_six_countries_v2_2026_09_12`として`capture_file`がこのファイルを指す) | ✓ | 🔴 **⚠️ 取り込まれてはいるが、実質未使用。** `capture_file`はこのファイルを指しているが、下記`2c1862f3`(242観測/154 not_available)の件数と一致するデータ(`jauce_v2_2026_09_12_grid`/`..._not_available`)には`capture_file`キー自体が無い ── つまり実際に価格計算の議論の土台になったのは`2c1862f3`の方で、本ファイルは取り込み処理は通ったが、その後の分析・結論のどこからも参照されていない。「取り込まれたが使われていない」は「まだ取り込まれていない」より危険な状態(存在するのに追跡できる経路が無い)なので、明確に区別して書いている。同日・同一問題(SUBMIT残留表示バグ、タブ間汚染)を抱える回でもあり、下記`2c1862f3`系列と合わせて全体が疑わしい。個別に再測定されていない値は信用しない。 |
| `jauce/2026-09-12-six-countries-v2-final.json` | `2c1862f3-jauce_shipping_measurements_v2-1.json` | 2026-09-12 | 同上6か国、242観測/154 not_available(上記の後継版・最終アップロード)。`master/courier-rates.json` の `jauce_v2_2026_09_12_grid`(242件)/`..._not_available`(154件)と件数一致 | PR #107 | ✓ | 🔴 **PR #115で明確に否定された。** 「AU/CA/FR/GBのEMSは重量に関わらず平坦」「SGはEMS計算機が基準ボックスのときだけ約¥250安い」の2所見はいずれも否定(DENIED)。さらに陽性対照(US)ですら3000g付近が¥4,180(本ファイル)対¥10,300(再測定)で2倍以上食い違った ── **同じ条件で2倍以上の差**は、平坦に見えた4か国に限らずラウンド全体の信頼性が疑わしいことを意味する。**US 500gと20000gだけは再測定で再現した**ため、その2点に限り生き残っている可能性がある(個別の再確認はしていない)。 |
| `jauce/2026-09-13-v3-remeasurement.md` | `a32724fb-jauce_______20260913_2.md` | 2026-09-13 | 上記2件の再測定。US陽性対照、AU/CA/FR/GBのEMS重量カーブ、SG寸法比較、AU GST注記 | PR #115 | (§10確立日の測定) | 🟢 **これがJauceについて信頼できるラウンド。** 陽性対照合格(¥3,900→¥10,300→¥51,100で重量差を検出)。単一操作者・単一ブラウザセッション・1条件ずつ・SUBMIT複数回確認のプロトコルに従った。 |

### FROM JAPAN

| 保存先 | 元のアップロードファイル名 | 日付 | 内容 | 取り込みPR | §10前 | 信頼性 |
|---|---|---|---|---|:---:|---|
| `fromjapan/2026-09-12-us-japanpost-confirmation.json` | `883dac73-fromjapan_shipping_measurements.json` | 2026-09-12 | US向け、日本郵便が使えないことの確認(5観測/6 not_available、`master`と件数一致) | PR #61 | ✓ | 🟢 単純な有無確認で、後に否定されていない。 |
| `fromjapan/2026-09-12-us-grid-v2.json` | `2653f044-fromjapan_shipping_measurements_v2.json` | 2026-09-12 | US密グリッド(重量・寸法走査) | PR #69 | ✓ | 🟢 後続PRで直接否定された所見なし。 |
| `fromjapan/2026-09-12-six-countries-v2.json` | `5e631118-fromjapan_shipping_measurements_v2.json` | 2026-09-12 | GB/FR/AU/CA/SG 6か国拡張。GB寸法重量プラトー、SGのFedEx Priority/Economy逆転など多数の所見を含む | PR #79 | ✓ | 🟡 個々の所見が後で反証された記録は見当たらないが、Jauceで見つかった「SUBMit時のstale値」「タブ間汚染」と同種の測定手法(§10前)で取られており、独立に再検証されていない。過信しない。 |
| `fromjapan/2026-09-13-seven-countries-owner-measured.md` | `0a750303-FROM_JAPAN_shipping_measurement_2026-09-13.md` | 2026-09-13 | オーナー自身が7か国(US/GB/DE/FR/AU/CA/SG)を手動測定。500gと2,000gは2回測定し同一結果 | PR #112 | (§10確立日の測定) | 🟢 ただし**固有の既知の不安定さを1件持つ**: SG・500gの条件で、1回目はUPSが¥2,891で表示され、2回目はUPSがまったく表示されなかった(`docs/PRINCIPLES.md`/CLAUDE.md§10追記が記録する「価格ではなく表示される配送方法の集合そのものが揺れる」第3の不安定パターン)。価格が一致しても方式の顔ぶれの一致は別に確認すること。 |

### ZenMarket

| 保存先 | 元のアップロードファイル名 | 日付 | 内容 | 取り込みPR | §10前 | 信頼性 |
|---|---|---|---|---|:---:|---|
| `zenmarket/2026-09-11-de-draft-superseded.json` | `dd920369-zenmarket_shipping_measurements.json` | 2026-09-11 | 初回のDE測定(230観測/13 not_available) | PR #59で一旦取り込み | ✓ | 🟡 **取り込み後、同じ回のうちにPR #61で下記のsuperset版に丸ごと置換された。** 現在の `master/courier-rates.json` の`zenmarket_2026_09_12`は本ファイルではなく次の行の内容(276/47)。本ファイル自体は最終的にmasterに残っていない。 |
| `zenmarket/2026-09-11-de-superset.json` | `2b760823-zenmarket_shipping_measurements.json` | 2026-09-11 | 上記の superset 版(276観測/47 not_available)。`master/courier-rates.json`の`zenmarket_2026_09_12`(PR #59置換後/#61)、`zenmarket_de_full_2026_09_12`(PR #79、`capture_file`で確認)の両方の実際の出典 | PR #61(置換)/#79(DE抽出) | ✓ | 🟢 後続PRで否定された記録なし。 |
| `zenmarket/2026-09-12-us-grid-v2.json` | `07782bc7-zenmarket_shipping_measurements_v2.json` | 2026-09-12 | US密グリッド。`capture_file`で`zenmarket_us_grid_v2_2026_09_12`と一致確認 | PR #69 | ✓ | 🟢 |
| `zenmarket/2026-09-12-six-countries-v2.json` | `9f872bc5-zenmarket_shipping_measurements_v2.json` | 2026-09-12 | GB/FR/AU/CA/SG拡張。「RECOMMENDEDバッジ=最安ではない」等の所見 | PR #79 | ✓ | 🟡 個々の反証記録なし。§10前の測定であることは変わらない。 |

### Neokyo

| 保存先 | 元のアップロードファイル名 | 日付 | 内容 | 取り込みPR | §10前 | 信頼性 |
|---|---|---|---|---|:---:|---|
| `neokyo/2026-09-12-de-full.json` | `5feb2d19-neokyo_shipping_measurements.json` | 2026-09-12 | DE中心の初回測定。`capture_file`で`neokyo_de_full_2026_09_12`と一致確認 | PR #79 | ✓ | 🟢 |
| `neokyo/2026-09-12-us-grid-v2.json` | `556220e3-neokyo_shipping_measurements_v2.json` | 2026-09-12 | US密グリッド。DHLの出現/消失(note_11〜13)を同一タブで再確認した記録あり | PR #69 | ✓ | 🟢 むしろ模範例: 疑わしい挙動(DHL消失)を自ら同一タブで再測定して訂正している。 |
| `neokyo/2026-09-12-six-countries-v2.json` | `c8db9ac5-neokyo_shipping_measurements_v2.json` | 2026-09-12 | GB/FR/AU/CA/SG拡張。GBのDHLフラット帯(note_18)ほか多数 | PR #79 | ✓ | 🟡 個々の反証記録なし。§10前。 |

### Buyee

| 保存先 | 元のアップロードファイル名 | 日付 | 内容 | 取り込みPR | §10前 | 信頼性 |
|---|---|---|---|---|:---:|---|
| `buyee/2026-09-12-us-japanpost-confirmation.json` | `33b3ab84-buyee_shipping_measurements.json` | 2026-09-12 | US向け日本郵便不可の確認(2観測/8 not_available、件数一致) | PR #61 | ✓ | 🟢 |
| `buyee/2026-09-12-de-verified.json` | `548b615f-buyee_shipping_verified_2026-09-12.json` | 2026-09-12 | DE検証版。ファイル自身が`contradiction_with_addendum_2026_09_12`として、同日の`fede91d0`アドエンダムとの間の矛盾点を自己申告している | PR #79/#82 | ✓ | 🟡 ファイル自身が既知の矛盾を記録済み。`master`側の`buyee_de_2026_09_12.contradiction_with_addendum_2026_09_12`を必ず併読すること。 |
| `buyee/2026-09-12-us-grid-v2.json` | `8814873b-buyee_shipping_measurements_v2.json` | 2026-09-12 | US密グリッド | PR #69 | ✓ | 🟢 |
| `buyee/2026-09-12-six-countries-v2.json` | `59b65abf-buyee_shipping_measurements_v2.json` | 2026-09-12 | GB/FR/AU/CA/SG拡張。容積重量除数がBuyeeだけ他社と異なるという`docs/PRINCIPLES.md`原則3の根拠データ | PR #79 | ✓ | 🟢 原則3として明文化されるほど、他社データとの対比で確認済み。 |

### 運送会社サーチャージ(FedEx/DHL/UPS)

`master/courier-surcharges.json` は本タスクのスコープ外(sibling PR #117が`master/fees.json`/`master/customs.json`を担当)だが、`master/carrier-surcharges.json`は本PRのスコープ内の生データの取り込み先として参照のみ行った(編集はしていない)。

| 保存先 | 元のアップロードファイル名 | 日付 | 内容 | 取り込みPR(推定含む) | §10前 | 信頼性 |
|---|---|---|---|---|:---:|---|
| `surcharges/2026-09-12-ups.json` | `625f3a7c-ups_surcharges.json` | 2026-09-12 | UPS 燃油/遠隔地/通関立替 初回 | PR #63(スキーマ)/#65(初回データ) | ✓ | 🟢 |
| `surcharges/2026-09-12-ups-v2.json` | `bd2dd136-ups_surcharges.json` | 2026-09-12 | UPS DE/FR/AU/SG追加版 | PR #67 | ✓ | 🟢 |
| `surcharges/2026-09-12-dhl-a.json` | `ac3306b3-dhl_surcharges.json` | 2026-09-12 | DHL 燃油/遠隔地/通関立替 | PR #65 | ✓ | 🟡 通関手数料のカテゴリ取り違えがあった版の可能性がある(次の行を参照)。 |
| `surcharges/2026-09-12-dhl-b.json` | `c014d75a-dhl_surcharges.json` | 2026-09-12 | DHL 訂正版 | PR #67「DHLの通関手数料カテゴリ取り違えを是正」 | ✓ | 🟢 `a`との具体的な差分(どのフィールドが訂正されたか)はファイル単体からは確定できていない。使う場合は両方を突き合わせること。 |
| `surcharges/2026-09-12-fedex-v1.json` | `7e2930c5-fedex_surcharges.json` | 2026-09-12 | FedEx 初回 | PR #65 | ✓ | 🟡 `docs/PRINCIPLES.md`が記録する「FedEx通関手数料ページのプルダウンをJavaScriptで操作した捕獲は、利用規約の禁止条項に触れる懸念から破棄された」という経緯の対象がこの初回捕獲である可能性が高いが、本ファイル自体にその経緯を示す記述は無く断定はできない。 |
| `surcharges/2026-09-12-fedex-v2-a.json` | `644aa995-fedex_surcharges_v2.json` | 2026-09-12 | FedEx 手動プルダウン操作による再取得(v2) | PR #67付近 | ✓ | 🟢 `confirmed_manually_by_user`のフラグを持ち、`master/carrier-surcharges.json`の`surcharges_verification_2026_09_12.fedex_dropdown_note`(オーナー本人がプルダウンを手動操作した旨)と内容が一致する。 |
| `surcharges/2026-09-12-fedex-v2-b.json` | `a4e23fe9-fedex_surcharges_v2.json` | 2026-09-12 | FedEx 手動プルダウン操作版のさらなる版(`a`とは内容が異なる) | PR #67付近 | ✓ | 🟢 同上。`a`と`b`のどちらがmasterへの最終反映元かは`capture_file`記録が無く確定できていない。両方とも同じ手動確認の系列にある。 |

### 単一プロキシに属さない・測定以外

| 保存先 | 元のアップロードファイル名 | 日付 | 内容 | 取り込みPR | §10前 | 信頼性 |
|---|---|---|---|---|:---:|---|
| `misc/2026-09-12-fromjapan-calculator-observations.json` | `80790acb-proxy_shipping_calculator_observations_2026-09-12.json` | 2026-09-12 | FROM JAPAN計算機の重量・国別カーブ観測。`master/courier-rates.json`の`weight_curve_de_20x15x10`系キーの出典(PR #52の系列コミットで導入) | PR #52(推定。マージコミット番号を直接確認できておらず、#49と#52の間に位置する履歴から推定) | ✓ | 🟢 |
| `misc/2026-09-12-multi-proxy-addendum.json` | `fede91d0-proxy_shipping_measurement_addendum_2026-09-12.json` | 2026-09-12 | FROM JAPAN/Jauce/Buyee/ZenMarket/Neokyo横断の追加観測。`master/courier-rates.json`の`jauce_de_2026_09_12`の出典として`capture_file`一致確認済み | PR #79 | ✓ | 🟡 Jauce部分は上記Jauce v2ラウンドと同じ日・同じ手法上の懸念を共有する。Buyee部分は`buyee/2026-09-12-de-verified.json`との間に自己申告の矛盾がある(上記参照)。 |
| `misc/2026-09-09-development-handoff-factchecked.md` | `0ff58140-ProxyCost_Development_Handoff_FACTCHECKED_20260909.md` | 2026-09-09 | **測定データではない。** プロジェクトの設計意図・Fact/Decision/Open区分をまとめたハンドオフ文書(2回のファクトチェック済み) | (直接の「取り込みPR」は無し。プロジェクト初期の設計方針の土台として参照された) | ✓(対象外) | ⚪ 測定ではないため信頼性ラベルの対象外。プロジェクトの初期意図を知るための一次資料として保存。 |

### チャットに直接貼り付けられた捕獲(アップロードファイルではない)

以下の2件は、上記29件とは**出所の系統が異なる**。ファイルとしてアップロードされたのではなく、
**オーナーがコーディネーターとの会話にテキストとして直接貼り付け、コーディネーターがこのセッションへ
中継した**ものである。会話が終われば同様に消えていたはずのもので、セッションスコープのアップロード
ディレクトリという足跡すら残らない、**29件よりもさらに弱い証跡の連鎖**を持つ。同格の行として一覧に
紛れ込ませず、この節で分けて明示する。

**検証方法**: このセッションは「コーディネーターがそう言っている」ことを単独の証拠として受理していない。
一度、出所を確認できない形で本文が中継された際は取り込みを拒否し、その後コーディネーターが
「オーナーの言葉を私が正しく伝えたという主張ではなく、`main`に既にマージされた内容を自分で確認せよ」
という検証可能な指示に差し替えてきたため、実際に`master/customs.json`(origin/main)と
`master/fees.json`(未マージのPR #117ブランチ、`refs/pull/117/head`)を読んで、貼り付け本文の
引用・数値・URL・キー名が一致することを確認した上で取り込んだ。

| 保存先 | 由来 | 日付 | 取り込みPR | 検証結果 | 信頼性 |
|---|---|---|---|---|---|
| `pasted/2026-09-13-fedex-billing-unit.md` | オーナーがチャットに貼り付け、コーディネーターが中継 | 2026-09-13 | PR #111(`ae86410`、マージ済み) | `origin/main`の`master/customs.json`で確認済み: GB/DE双方のFedEx `clearance`行が`unit: "per_shipment"` `unit_tier: "direct_fetch"`を持ち、`unit_quote`が本文の引用("'Shipment' means one or more Packages or Freight, moving on a single Air Waybill.")と一言一句一致、`unit_source`のURLも一致、`unit_fetch_route`が「オーナー本人が直接フェッチした」と記録している。`git log -S "Air Waybill" -- master/customs.json`はPR #111(`ae86410`)のみを返す。 | 🟢 **FedEx自身のサイトが本環境からのフェッチにHTTP 200のWAF代替ページしか返さない(4件の監査ノートで`input_rejected`と記録済み)ため、これがプロジェクト唯一のFedEx直接取得(direct_fetch)ソースであり、我々自身では再取得できない。**出所の連鎖(貼り付け)は29件のアップロードより弱いが、内容はmasterへの反映と完全に一致した。 |
| `pasted/2026-09-13-fromjapan-export-clearance-threshold.md` | オーナーがチャットに貼り付け、コーディネーターが中継 | 2026-09-13 | PR #117(**まだ`main`にマージされていない**。`refs/pull/117/head`として存在、CI通過待ちの可能性) | PR #117のブランチの`master/fees.json`で確認済み: F26/fromjapan行に`invoice_check: "confirmed_calculator"`と`invoice_check_detail`が存在し、`measured_on: "2026-09-13"`、3価格帯(¥150,000→¥0、¥250,000→¥2,800、¥500,000→¥2,800)×3回ずつの`observations`、CLAUDE.md §10準拠の測定手順の記述が、貼り付け本文の表・数値と一致する。`git show origin/pr-117:master/fees.json`で直接確認した。 | 🟢 ただし**まだ`main`にマージされていない**ため、この捕獲が実際にプロジェクトの結論として確定したとは言い切れない。PR #117がマージされ次第、このREADMEの「取り込みPR」欄の状態(マージ済みかどうか)を更新すること。CLAUDE.md §10の測定規律(1条件ずつ・3回再現)に沿っており、PR #113が残した「FROM JAPANの計算機がExport Clearance Feeを¥0と表示した件は何を意味するか」という未決着の4通りの読みのうち、少なくとも「¥1,000の商品が単に¥200,000のしきい値に届いていなかっただけ」という説明を裏付ける。 |

## 重複について

`80790acb-proxy_shipping_calculator_observations_2026-09-12.json` と
`b28e0bdf-proxy_shipping_calculator_observations_2026-09-12.json` は
**md5が完全に一致するバイト単位の同一ファイル**(アップロード時刻のみ23:28と23:43で異なる)。
二重に保存する意味が無いため、`80790acb`の内容だけを
`misc/2026-09-12-fromjapan-calculator-observations.json`として1本のみ保存した。
`b28e0bdf`はどこにも保存していない。

## サイズ

ディレクトリ合計 約3.9MB(29件のアップロードのうち、上記の完全重複1件を除いた28件、および
チャット貼り付けの2件・合計30件相当)。単体で突出して大きいファイルは無い(最大は約720KB)。
貼り付けの2件はテキストのみで数KB程度であり、合計サイズにほぼ影響しない。

## 個人情報・秘密情報について

全ファイルを目視・機械的キーワード検索(住所/氏名/注文番号/アカウント番号/メール/請求書/顧客等)
で確認した。ヒットしたのはいずれも「配送方法名(例: `NOVA GLOBAL (DOOR-TO-DOOR ADDRESS)`)」や
「計算機のフィールド名の議論」「プライバシー方針そのものについての設計文書の記述」であり、
実在の個人情報・注文情報は含まれていない。送料計算機に架空/固定の入力(価格・重量・寸法)を
与えて得た表示結果のみである。

## 壊れているJSONについて

29件中26件がJSON、3件がMarkdown。JSONの26件は全て`json.load`で正常にパースできた。
壊れているファイルは無かった。
