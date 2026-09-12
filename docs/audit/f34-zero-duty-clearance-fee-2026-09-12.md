# F34: 税ゼロ時に通関手数料は課されるか ── DHL/UPS/FedEx/ECMS × 7か国（2026-09-12）

## 結論を先に

**この監査は「新しく確認できた」結果ではなく、「確認できないことを再確認した」結果である。**
先行3監査（`f34-dhl-seven-countries-2026-09-12.md`、`f34-ups-ecms-seven-countries-2026-09-12.md`、
`f34-fedex-seven-countries-2026-09-12.md`）が既にこの軸を `C_unknown` / `unknown` として
記録していた。本タスクは追加のWeb検索・一次資料フェッチを行い、その結論を覆す新情報が
見つからないことを確かめた上で、**FedExの7行に欠けていたフィールド自体を埋め**、
DE/FR/AU/CAのECMS行に「carrier自体が未確認なのでこの問いが成立しない」ことを明示した。

- **DHL Express・UPS**: 7か国×2社= 14セルすべて、依然 `C_unknown` / `unknown`。今回追加で
  Rate Guide以外の情報源（DHL/UPSの一般向けFAQ、consumer forumのT&C言及）を検索したが、
  「duty/taxがゼロならこの手数料も課さない」と明記する一次資料は見つからなかった。
- **FedEx**: 7か国とも、一次資料自体（disbursement-fee-shipping.html 系ページ）に到達できない
  という既存の壁（WAF代替失敗ページ、HTTP 200 だが本文はエラーページ）を本タスクでも再現した。
  したがって `unknown` に加えて `input_rejected`（一次資料そのものに到達できなかった）という
  confidence を明示した。US/GB/GBの再取得は今回もFedEx WAFに阻まれた。
- **ECMS**: US/GB/SGの3法人は既存監査が確認済み（下記参照、`does_not_apply_if_no_duty_advanced`
  という条件付き構造が読み取れる）。DE/FR/AU/CAはそもそも法人自体が未確認（counted_absence）
  のため、本タスクではこの4か国に「carrierが未確認なのでこの問い自体が成立しない」ことを示す
  フィールドを追加した（金額行自体は既存のまま、値は変更していない）。

## 表: carrier × destination × charged-at-zero-duty × mechanism × confidence × source × 確認日 × 逐語引用

| carrier | destination | charged-at-zero-duty | mechanism | confidence | source | 確認日 | verbatim quote |
|---|---|---|---|---|---|---|---|
| DHL Express | US/GB/DE/FR/AU/CA/SG（7か国） | unknown | 不明（Rate Guideに免除規定の記述なし） | `counted_absence`（`tier: C_unknown`） | 7か国分のDHL Express Service & Rate Guide 2026 PDF全文（#99で直接フェッチ済み） | 2026-09-12（#99）／本タスクで追加検索したが更新なし | なし（"duty tax|disbursement"および"de minimis|no duty|duty-free|zero"でgrepし全文確認したが該当箇所なし） |
| UPS | US/GB/DE/FR/AU/CA/SG（7か国） | unknown | 不明（Disbursement Feeの一次資料に条件文なし。式が"% of the advanced amount"である以上、advanced amountがゼロなら率側は0になるが、flatの最低額がゼロ税でも課されるかは構造上決まらない） | `counted_absence`（`tier: unknown`） | 6か国分のUPS Rate/Service Guide PDF（#100で直接フェッチ済み、GBのみ本文未読） | 2026-09-12（#100）／本タスクで追加検索したが更新なし | なし |
| FedEx | US/GB/DE/FR/AU/CA/SG（7か国） | unknown | 判定不能（一次資料そのものに到達できない） | `input_rejected` | fedex.com の disbursement-fee-shipping.html / ancillary-clearance-service.html 系ページ（全て curl -L・WebFetch とも HTTP 200 だが本文はFedEx自社WAFの代替失敗ページ） | 2026-09-12（再試行、#98と同じ結果を再現） | なし（本文自体が取得不能） |
| ECMS | US/GB/SG（3法人が実在） | **depends-on-entry寄り**（"advances any Customs Duties" という条件文があり、立て替えが発生しない＝関税ゼロなら3%の基準となる金額自体が発生しないと読める） | 立て替えた関税の有無に連動（T&Cの条件文構造から） | `reasoned_judgement_unconfirmed`（T&C自体はA_confirmed、ゼロ税時の扱いは条件文からの読み） | ECMS US/UK/Singapore Terms and Conditions（3法人版で一言一句同一） | 2026-09-12（#100） | あり: "If ECMS EXPRESS advances any Customs Duties on behalf of a Receiver, ECMS EXPRESS is entitled to charge a duty advance payment fee of 3%." |
| ECMS | DE/FR/AU/CA（4か国） | **not_applicable**（carrier自体が未確認） | ECMSという法人・T&C文書自体がこの4か国向けに存在しない（counted_absence） | `counted_absence` | ecmsglobal.com サイト内検索・Web検索（en-us/en-uk/en-sg/en-nl/en-hkの5法人のみ発見） | 2026-09-12（#100） | — |

## 依然として unknown なセルと、そこで何を試したか（ステータスコード付き）

- **DHL Express 7か国**: #99が7本のRate Guide PDF全文（各約10ページ）を"duty tax|disbursement"
  および"de minimis|no duty|duty-free|zero"でgrepし、免除規定の記述が無いことを確認済み
  （`counted_absence`）。本タスクでは追加で `dhl.com/us-en/.../customs-duties-and-taxes.html`
  をWebFetchしたが **HTTP 503**（本文未取得）。DHLタイランドの一般ガイド（`dhl.com/discover/en-th/...`）
  には「duty+VAT ≤ THB 200なら免除」という具体的な免除文言が見つかったが、**これはタイ向け
  ページであり本タスクの対象7か国のいずれでもない** ── 「DHLはどこかの市場で免除の運用をしている」
  という事実の傍証にはなるが、US/GB/DE/FR/AU/CA/SGの7か国のどれにも直接適用できる証拠ではない
  ため、表には加えていない。
- **UPS 7か国**: #100が6か国のRate/Service Guide PDFを直接フェッチ済み、免除規定なし。GBは
  本文未読のまま（`assets.ups.com`のPDFが`curl: (52) Empty reply from server`、WebFetchで
  `HTTP 503`）。本タスクでも `assets.ups.com` へのアクセスは再試行していない（#100が既に
  2回失敗を記録済みのため重複調査を避けた）。追加でUPSの一般FAQ・T&Cグロッサリー
  （`ups.com/assets/resources/webcontent/supplychain/media/customs-brokerage-billing-terms.pdf`
  等）をWebSearchで検索したが、ゼロ税時の扱いに触れる記述は見つからなかった。
- **FedEx 7か国**: 本タスクで `fedex.com/en-gb/support/clearance/customs-changes/de-minimis.html`
  （HTTP 200だがWAF代替ページ）と `fedex.com/en-us/customer-support/faq/.../disbursement-fee-shipping.html`
  （同、"It appears you don't have permission to view this webpage"）を再フェッチしたが、
  #98が記録した壁を再現しただけだった。archive.org経由の代替取得（#98が試行済み）は本タスクでは
  再試行していない（`Blocked by egress policy`という環境側の制約が変わったという情報が無いため）。
- **ECMS DE/FR/AU/CA**: #100のサイト内検索・Web検索の結果を追加検証したが、4か国向けの
  T&C文書・法人ページは今回も見つからなかった（`counted_absence`のまま）。

## 「depends-on-entry」というモデルの方が良いか

**部分的にはい、ただし宅配便4社では実証できていない。** タスク文が示唆した「正規の通関申告
（entry）が行われるかどうかに連動する」という形は、**ECMSのT&C（"If ECMS EXPRESS advances
any Customs Duties"）だけがこの構造を文言レベルで示している。** DHL/UPS/FedExの一次資料は
いずれも「% of the advanced amount, minimum X」という同じ形の式を使っているが、**minimum側が
advanced amountゼロでも課されるのか、advanced amountがゼロなら式自体が起動しないのか、
どちらとも読める曖昧な書き方**で、entry連動のモデルを裏付ける記述も、否定する記述も無い。
したがって「boolean（yes/no）よりdepends-on-entryの方が正確」という主張は、**ECMSの1社に
限っては文言で裏付けられるが、DHL・UPS・FedExの3社については依然として推測に留まり、
原則1（推測で埋めない）に照らして採用できない。**

## これが現行モデルの過大計上に対して意味すること

`docs/audit/f34-clearance-fee-by-route-2026-09-12.md` と `f34-dhl-seven-countries-2026-09-12.md`
が既に指摘した非対称性（郵便5か国は免除規定を確認済み、宅配便側は0か国）は、本タスクでも
変わらなかった。したがって、以下は既存の指摘の再確認であり新事実ではない:

- DHL/UPSの最低額（例: US $17.50前後）は、duty+tax実額が小さい・ゼロに近いカートに対しても
  満額課される可能性が排除できないまま`total.high`が開いている。
  destinationで言えば **CA（CAD 20未満で免税）・AU（A$1,000未満で免税）・SG（S$400未満は
  GSTなし）** の3か国が、最も「安いカートがそもそも税ゼロになる」頻度の高い候補（`docs/PRINCIPLES.md`
  の各国 duty/vat 閾値を参照）。この3か国でDHL/UPSの最低額（CAD 12〜18、A$23、S$20〜22.5）
  がまるごと過大計上になっている可能性は、本タスク後も否定も肯定もできない。
- GB/DE/FRはVATが初回から課されるため「税が本当にゼロになる」ケースはCA/AU/SGより狭いが、
  duty側だけが免除される閾値（135/150/150ユーロ相当）の直下の価格帯では、DHL/UPSの手数料が
  duty分のみを基準にした計算（rate × duty+tax、min適用）とどう整合するかは依然不明。
- **US**は de minimis がすでに停止済み（§321停止）なので、この論点は事実上効かない
  （常に何らかの duty/tax が発生する前提になる）。

**変わらぬ結論**: このモデルの `total.high` が開いたままであることは、この監査の後もなお
正しい状態である。DHL/UPS/FedExのいずれについても、税ゼロ時の扱いを`total.low`側の点予測に
組み込める確度の情報は今回も得られなかった。

### 過大計上を円で見積もる

`docs/audit/f34-clearance-fee-by-route-2026-09-12.md`（#101）が示した比較の形——「US の
DHL/UPS 最低額 $17.50 ≒ ¥2,734 が、典型的なカートの実際の duty+tax ¥1,867 を上回り、
それだけでランキングを入れ替えた」——と同じ計算を CA/AU/SG に当てはめる。**de minimis 以下の
カートは duty+tax がまさに ¥0 になるケースなので、もし手数料がゼロ税でも満額課されるなら、
過大計上額はその国の最低額そのもの**になる。`src/lib/pricing/rates.ts` の固定レート
（ECB 2026-09-04 時点、CAD 113.22円・AUD 112.55円・SGD 123.33円）で換算すると:

| destination | carrier | 最低額（原文） | 円換算 | #101 の ¥2,734（US基準）との比較 |
|---|---|---|---|---|
| CA | DHL Express（non_account_holder、#104適用後） | CAD 18.00 | **約¥2,038** | 下回る（約74%） |
| CA | UPS（Express系 $11.65／Standard $7.40） | CAD 11.65／7.40 | **約¥1,319／約¥838** | いずれも下回る（48〜28%） |
| AU | DHL Express | AUD 23.00 | **約¥2,589** | 下回る（約95%） |
| AU | UPS（GST込み A$26.18） | AUD 26.18 | **約¥2,948** | **上回る**（約108%） |
| SG | DHL Express | SGD 20.00 | **約¥2,467** | 下回る（約90%） |
| SG | UPS | SGD 22.50 | **約¥2,775** | **上回る**（約101%） |

**読み方**: CA/AU/SGでdeminimis以下のカート（CA: CAD 20未満、AU: A$1,000未満、SG: S$400未満）
にこの最低額が満額課されるなら、**過大計上の規模はUS基準（¥2,734）とほぼ同じ桁**（AU/SGの
UPSはむしろこれを上回る）。逆に「税ゼロなら課さない」が真なら、これらのカートのDHL/UPS行は
**手数料丸ごと（約¥800〜¥2,950）が本来ゼロであるべき**、ということになる。どちらが真かは
本タスクでも決着していないため、この幅がそのまま `total.high` に残る根拠になる。

## この監査は「行き止まり」であって「未着手のTODO」ではない

**この結論をこれ以上、同じPDFを読み直して埋めようとしないこと。** DHL/UPSは既に公開レート
ガイド全文を2回（#99/#100、本タスク）grepしており、免除規定が無いことは繰り返し確認済みで、
FedExは一次資料そのものに到達できない壁が3セッション（#98、本タスク）連続で同じ形で再現して
いる。次にこの軸へ本当に一歩進めるとしたら、**探し方を変えるのではなく、証拠の種類を変える
必要がある**。具体的には次の形の実請求（fixture）が要る:

- **destination**: CA・AU・SGのいずれか（de minimis以下のカートが最も起こりやすい3か国）。
- **carrier**: DHL Express または UPS（両社とも最低額が明確で、免除の有無で結果が最も大きく
  ぶれる）。
- **必要な条件**: 申告価格が当該国の de minimis 閾値未満（CA: CAD 20未満、AU: A$1,000未満、
  SG: S$400未満）で、**duty・taxの実額がゼロと明記された請求書・配送記録**。
- **見るべき点**: その請求書上に Duty Tax Processing／Disbursement Fee 相当の行が
  **存在するか、存在しないか**。存在すれば「税ゼロでも課す」、存在しなければ「税ゼロなら
  課さない」の直接証拠になる——推論を挟まず、行の有無だけで決着する。
- 現状 `master/fixtures.json` にはこの形の実請求が1件もない。ZenMarket/Buyee等の利用者が
  実際に受け取った、CA/AU/SG向けの少額（de minimis以下）カートのDHL/UPSインボイスが
  あれば、この監査を「行き止まり」から「決着」に進められる。

## 検証

- `python3 master/validate.py` → 矛盾0件、再現4件（独立1件）。カバレッジ表示は既存のまま
  （`zero_when_no_tax`系フィールドは`eval_clearance()`の対象外で検証出力に影響しない）。
- `python3 master/render-docs.py` → 生成節を書き戻し、`--check` → 一致確認済み。
- `npx vitest run` → **904 件 pass**（`main`基準値と同数、退行なし）。
- `master/customs.json` の既存フィールド（rate/min/max等の金額）は一切変更していない。
  変更したのは、FedEx 7行（US/GB/DE/FR/AU/CA/SG）への `zero_when_no_tax` /
  `zero_when_no_tax_confidence` / `zero_when_no_tax_note` の新規追加と、ECMS DE/FR/AU/CA
  4行への同フィールドの新規追加のみ。

## `src/` への影響

`src/` は一切変更していない。本タスクは `master/customs.json` とこのドキュメントのみのスコープ。
