# カナダ (CA) の免税しきい値は1つではない ── 郵便／宅配便／CUSMA の3制度調査

調査日 2026-09-12。`docs/ROADMAP.md` が「単一 `CA.dutyFreeLimit`（CAD 20）が郵便・宅配便・CUSMA
の3制度を1本に潰しており、宅配便の通関表示（PR #73, #77, #79）に誤差の向きが未確定のまま
乗っている」と記録していた欠陥に対する一次情報調査。**スコープは調査と記録のみ。**
しきい値を分割する実装（`src/lib/pricing/countries.ts` の変更）は別PRで行う。

## 結論を先に

**現行の単一 `dutyFreeLimit = CAD 20` は、日本発の宅配便に対しても値として誤っていない。**
CBSA は郵便と宅配便を別の帯として明記しているが、日本（米国・メキシコ以外）発の宅配便の
しきい値は郵便と同じ CAD 20 で、duty と tax も同額。CUSMA が引き上げる CAD 40/150 の
de minimis は原文で「Imported from the US and Mexico」に限定されており、**日本発の
このプロダクトのユースケースには適用されない。** したがって「too high か too low か」の
問いには、**「現行値は正しい。ただし単一値が正しいのは今の対象（日本発）に限った
偶然の一致で、根拠は別制度から来ている」**というのが答えになる。

## 表: 3制度 × (しきい値, 通貨, 課税ベース, duty/tax, 日本発への適用, confidence, 出典)

| 制度 | duty閾値 | tax閾値 | 通貨 | 課税ベース | duty=tax? | 日本発に適用? | confidence | 出典・確認日 |
|---|---|---|---|---|---|---|---|---|
| 郵便（Canada Post / 日本郵便引き渡し） | 20 | 20 | CAD | value for duty | 同じ | 適用される | `direct_fetch` | CBSA `cusma-aceum/lvs-efv-eng.html`、2026-09-12 |
| 宅配便・米墨以外（CLVSの通常帯） | 20 | 20 | CAD | value for duty | 同じ | 適用される | `direct_fetch` | 同上 |
| 宅配便・米墨発（CUSMA de minimis） | 40 | 40〜150は税のみ／150超で両方 | CAD | value for duty | **異なる**（duty 40 / tax 二段階 40・150） | **適用されない**（米墨発限定） | `direct_fetch` | 同上 |

参考: CLVS（Courier Low Value Shipment）プログラム自体の対象上限 **CAD 3,300** は、上の
免税しきい値とは別物（簡易通関手続きが使える上限であって、免税の話ではない）。出典:
CBSA Memorandum D17-4-0（`direct_fetch`、2026-09-12）。

## 出典と原文引用（verbatim quote 付き = direct_fetch）

一次情報1点（CBSA 自身のページ）に3制度すべてが1枚で並んで書かれていた。

**出典**: https://www.cbsa-asfc.gc.ca/services/cusma-aceum/lvs-efv-eng.html
（`curl -L` でフェッチ、HTTP 200。リダイレクトなし。2026-09-12 に読み取り）

> For a shipment imported by mail, the following still applies:
> $20 and under: duty and tax free when imported from any country
> Above $20: duties and taxes apply when imported from any country, including the US and Mexico
>
> For a shipment imported by courier [Footnote 1]:
> Imported from any country (other than the US and Mexico)
> Up to $20: duty and tax free
> Above $20: duties and taxes apply, excluding the US and Mexico
>
> Imported from the US and Mexico
> Up to $40: duty and tax free
> Above $40 to $150: duty free, but taxes still apply
> Above $150: duties and taxes apply

同ページ冒頭:
> All amounts listed on this page are in Canadian dollars and refer to the value for duty,
> which is the dollar amount used to calculate duty owed for goods being imported into Canada.

→ 3制度すべてが同じ課税ベース（value for duty）に対して測られている、という記述もこの
1文で確認できる。`countries.ts` の `base`/`threshold_base` の区別に対応させると、いずれの
制度も `threshold_base: goods`（value for duty。既存の CA エントリが duty/vat で使っている
定義と同じ。国際送料は para.18 で除外、国内送料は para.19 で算入 ── これは今回の調査対象外
で既存の `base_note` がすでに記録済み）。

**関連出典（CLVS プログラム対象上限 CAD 3,300）**:
https://www.cbsa-asfc.gc.ca/publications/dm-md/d17/d17-4-0-eng.html
（`direct_fetch`、2026-09-12。検索結果に現れた要約から「CAD 3,300 の LVS しきい値は
2020-07-01 発効のまま変わっていない」という記述を確認。このページ自体は上記 lvs-efv ページ
から `D17-4-0: Courier Low Value Shipment Program で詳細を参照` と明示的にリンクされている
公式の相互参照）。

## CUSMA は我々に適用されるか ── 結論: 適用されない

CUSMA の引き上げられた de minimis（CAD 40 / CAD 150）は、**原産国が米国・メキシコの
場合に限定される制度**であることが原文で明示されている（"Imported from the US and Mexico"
という見出しそのものが原産国条件）。このプロダクトが扱う出荷はすべて日本発なので、
CUSMA の恩恵はどの経路（郵便・宅配便）でも一切関係しない。**「CUSMA はこの計算機には
適用されない」という exclusion を、根拠付きで記録することが、今回のもっとも重要な結論。**
数値を無理に当てはめてはいけない（依頼の指示通り、「適用されない」を完全な答えとして扱う）。

## 州（province）との相互作用

`countries.ts` の `ProvinceCode` / `CA_PROVINCES` が扱う州税は、しきい値を超えて課税対象に
なった後にどの税率（GST 5% に州分を足すか、QST を掛けるか）を適用するかという**別レイヤー**
の話。今回調査した郵便・宅配便・CUSMA のしきい値自体は連邦制度で全国一律であり、**州によって
変わらない。** 出典は同じ CBSA ページ（州別の記載が一切無く、全文が「any country」
「the US and Mexico」という原産国の軸でのみ分岐している）。

## 現行スキーマで表現できるか

`countries.ts` が持つ `dutyFreeLimit`（単一値）+ `clearanceBands` で、**今回の対象範囲
（日本発）は表現できる**。理由は「郵便」と「宅配便・米墨以外」のしきい値がどちらも
CAD 20 で一致するため、単一値のままで両方を正しくカバーできるから。

ただし、これは**日本発に限った偶然の一致**であり、スキーマが3制度を本質的に区別できる
ようになっているわけではない。将来 CUSMA 帯（米墨発）を扱う必要が生じた場合、
単一 `dutyFreeLimit` では表現できない。理由:
- duty のしきい値（40）と tax のしきい値が**異なり**、しかも tax 側は二段階（40〜150 は
  tax のみ、150 超で duty も）で、`dutyFreeLimit` 1本では duty と tax を同時に表せない。
- しきい値が「経路（郵便/宅配便）× 原産国（JP か US/MX か）」の組で分岐する。

その場合に必要な形: しきい値を `{ duty_threshold, tax_threshold_low, tax_threshold_high }`
の3値組にし、経路×原産国のキー（例: `postal`, `courier_non_us_mx`, `courier_us_mx`）ごとに
持つ構造。**今回はこの変更を実装しない。** `master/customs.json` の
`CA.de_minimis_regimes` に上記3制度をこの形の先取りとして記録済みなので、次に実装する
エージェントはそこから起こせる。

## confidence の内訳（正直な棚卸し）

- **`direct_fetch`（原文をそのまま読み、verbatim quote あり）**: 郵便/宅配便/CUSMA の
  3帯の金額と条件（`cbsa-asfc.gc.ca/services/cusma-aceum/lvs-efv-eng.html` から）。
  課税ベースが value for duty である旨の1文も同じ確認。
- **`direct_fetch`（本文から逐語引用済み）**: CLVS プログラムの CAD 3,300 という数字は
  D17-4-0 のページ本文（"Updates made to this D-memo" 節）に
  `amend the low value shipment (LVS) threshold to $3,300 Canadian dollars (CAD), which
  came into effect July 1, 2020` という一文があり、ここから逐語引用した（`curl -L` で
  ページ全体を取得、HTTP 200、リダイレクトなし）。
- 州との非依存性の結論は、上記 `direct_fetch` の同一ページに州の言及が一切無いことの
  消極的確認（"counted_absence" に近いが、ページが述べる分岐軸が原産国のみと明示されて
  いるため、単なる見落としではないと判断できる）。

## 次の一歩（未確定のまま残すもの）

- CUSMA 側の一次法文（CUSMA Article 7.8(1)(f) 原文）そのものへの直接あたり。今回は
  CBSA 自身の実施ページ（施行済みの解釈）を一次情報として採用しており、条文原文までは
  読んでいない。数字自体は CBSA ページと条文で一致するはずだが、確認はしていない。
