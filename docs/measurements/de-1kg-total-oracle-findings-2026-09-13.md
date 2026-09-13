# DE・1kg「合計」オラクル所見(2026-09-13)

原文: `docs/measurements/raw/de-1kg-total-oracle-2026-09-13.md`(オーナー提供、無改変)。
固定条件: ドイツ / 1,000g / 20×15×10cm / 国内送料¥0 / 数量1。¥1,000・¥10,000・¥50,000・¥250,000の
4価格帯、各条件3回試行(表示一致確認済み)。

以下は**原文から読み取れることのみ**を書く。推測・一般化はしない(CLAUDE.md §9)。

## 1. 5社中3社は「合計」が出ない

Buyee・Jauce・Neokyoの3社は、商品価格(Item price / Retail price相当)の入力欄が画面上に
構造的に存在しない。入力欄は国・重量・寸法(Neokyoのみ郵便番号も必須)のみで、これらはいずれの
価格帯でも同一の送料見積り一覧を返す。したがって商品代金を含む「合計」はこの3社では**出ない**
(出典: 原文「2. Buyee」「4. Jauce」「5. Neokyo」各節)。

FROM JAPANのみ、単一の「Total」欄を出す(デフォルト選択方式=表示中の最安値に対する合計)。
ZenMarketは方式ごとに個別のTotalを並列表示し、単一の代表合計は存在しない。

## 2. ZenMarketの新しい不安定さの分類

原文が記録した事象: ¥50,000・¥250,000の両条件で、同一入力・3回試行のうち1回目と2・3回目とで
表示される配送方法の構成が異なった(1回目はNOVA GLOBAL/ECMS EXPRESSを含む構成、2・3回目は
SURFACE/AIRMAIL(AVIA)/EMSを含む別構成)。

CLAUDE.md §10が既に記録している3種類との異同:
- ①stale値の残留(前条件の値が残る)
- ②初回クリックで結果テーブルが未描画
- ③方式の出現・消失(FROM JAPANのSGでUPSが出たり出なかったりした事例)

**判定できない。** 原文には「1回目→2・3回目」という時系列と、両者の完全な構成の記述はあるが、
以下が欠けているため、③(方式の出現消失)と同種と断定することも、それとは別の第4の形だと
断定することもできない:
- ¥1,000・¥10,000では同じ3回中で構成が変わらなかった、という比較対象はあるが、それが
  「なぜ¥50,000以上でだけ起きたか」(価格欄の値そのものが構成判定に使われている可能性)を
  裏付ける記述が原文に無い。
- 1回目の試行が「ページを開いて価格欄に最初の値を入力した直後」だったのか、「別条件からの
  遷移直後」だったのかが原文に書かれていない。前者ならタイミング依存の初回限定挙動(②に近い)、
  後者なら前条件の残留(①に近い)の可能性がそれぞれ残るが、どちらも確認できない。
- 消えた方式(NOVA GLOBAL/ECMS EXPRESS)がその後の試行で「価格を再入力しても二度と出ない」のか
  「別の再現条件で出る」のかの追加試行が原文に無い。

結論: 既知の3種と同種か別種かは**判定できない**。追加情報(1回目の操作直前の状態、再現条件)が
無ければこれ以上は絞り込めない。

## 3. FROM JAPANの価格依存の方式フィルタ — エンジン実装の有無

原文の事実: FROM JAPANは¥50,000以上でInternational ePacket Light / Surface (Small Packet) /
AirMail (Small Packet) の3方式を非表示にする。

`src/lib/pricing/`を読んだ結果:

- **`small-packet-surface`・`small-packet-air`(Surface (Small Packet) / AirMail (Small Packet)
  に対応)には価格依存フィルタが実装されている。** `src/lib/pricing/services.ts:1282,1291`で
  両方式に`priceCapJpy: 30000`が設定されており、`src/lib/pricing/compare.ts:1118,1145,1300`で
  `itemsYen > rate.priceCapJpy`のとき当該方式を候補から除外している。コード上のコメント
  (`services.ts`付近、F30)によれば出典はFROM JAPANのヘルプページ(en_help.txt、2026-09-11再取得)
  の"Packages with Charge 1 value under 30,000 yen"という一次記述で、閾値は¥30,000。
- **International ePacket Lightには価格依存フィルタが実装されていない。** 同じコメントに
  「ePacket_Light（¥10,000）・ePacket / IPA（$400）・PMI（$2,499.99）はこの計算機が価格化して
  いない方式なので繋がない」とあり、この方式自体がエンジンの`postage`テーブルに存在しない
  (`master-sync.test.ts`のNOT_IN_CODEに理由が記録されているとコメントに明記)。つまり、
  International ePacket Lightについては「価格帯によって出したり消したりする」以前に、そもそも
  エンジンが一切価格を付けていない。

結論(事実): **部分的に実装されている。** Small Packet系2方式は`priceCapJpy`機構により
¥30,000超で非表示になる仕組みがあり、これは原文の「¥50,000で3方式非表示」のうち2方式
(Small Packet 2方式)の閾値(¥30,000 < ¥50,000)と整合する。残る1方式(International ePacket
Light)はエンジンに存在しないため、価格依存フィルタの対象にすらなっていない。したがって
「FROM JAPANの価格依存の方式フィルタを実装しているか」への答えは、方式ごとに異なる
(2/3方式は実装、1/3方式は方式自体が未実装)。

なお、原文の¥50,000条件におけるFROM JAPAN非表示3方式のうち、Surface (Small Packet)
(原文¥1,000条件で¥1,300)・AirMail (Small Packet)(同¥2,130)は`priceCapJpy: 30000`と
整合する側(Charge 1 = 商品代金のみで判定、¥50,000 > ¥30,000だから非表示)だが、
この整合性そのものは「今回やらなくてよい」とされた突き合わせ作業に踏み込むため、
ここでは指摘のみに留める。

## 4. Export Clearance Fee ¥2,800としきい値¥200,000

原文: ¥250,000で発生(¥2,800)、¥50,000では¥0。

既存記録: `src/lib/pricing/services.ts:443`に
`export const EXPORT_DECLARATION_FEE_THRESHOLD_JPY = 200000;`があり、同ファイルのコメント
(`services.ts:431,437`)は「判定は行の商品代合計(¥200,000超)」「発生しないとき(¥200,000以下)も
行を出す(額0・tier fixed)」と明記している。

**整合する。** ¥50,000(<¥200,000)で¥0、¥250,000(>¥200,000)で¥2,800という原文の観測は、
既存のしきい値¥200,000と矛盾しない(¥50,000も¥250,000も、しきい値¥200,000の左右いずれかに
明確に位置しており、しきい値そのものの値(例えば¥200,000ちょうどや¥100,000〜¥200,000の間)を
検証できる価格帯は今回の4点には含まれていない)。

## 5. 社内の方式間の差 — 各社・各条件の最小〜最大

原文の数値から、各社・各条件で画面に表示された金額(合計が出る社は合計、出ない社は送料見積りの
範囲)の最小〜最大を示す。Buyee/Jauce/Neokyoは商品価格欄が無いため4価格帯とも同一値になる
(表内で1行にまとめた)。

| 会社 | 対象 | ¥1,000 | ¥10,000 | ¥50,000 | ¥250,000 |
|---|---|---|---|---|---|
| FROM JAPAN | Total(単一・デフォルト方式) | ¥4,000 | ¥13,000 | ¥54,350 | ¥257,150 |
| FROM JAPAN | 画面表示の送料方式の範囲(参考。Totalには不採用の方式も含む) | ¥1,300〜¥5,895 | (同左、10方式共通) | ¥2,500〜¥5,895(7方式) | (同左、7方式) |
| ZenMarket | Total(方式ごと、価格帯内の最小〜最大) | ¥3,802〜¥7,562 | ¥12,802〜¥16,562 | ¥52,802〜¥56,562(1回目) / ¥53,000〜¥56,562(2・3回目) | ¥253,000〜¥256,562(1回目) / ¥253,000〜¥256,562(2・3回目) |
| Buyee | 送料見積りの範囲(合計欄なし・価格帯非依存) | ¥2,130〜¥4,612(4方式) | 同左 | 同左 | 同左 |
| Jauce | 送料見積りの範囲(合計欄なし・価格帯非依存) | ¥2,750〜¥4,400(+¥420 smart packing、SALはNot available) | 同左 | 同左 | 同左 |
| Neokyo | 送料見積りの範囲(合計欄なし・価格帯非依存) | ¥2,500〜¥6,471(7方式、2方式はNot available) | 同左 | 同左 | 同左 |

**社内の方式間の差が社間の差を超える例**: ZenMarketの¥1,000条件の社内レンジ(¥3,802〜¥7,562、
差¥3,760)は、¥1,000条件でのFROM JAPAN Total(¥4,000)とZenMarketの最安値(¥3,802)の社間の差
(¥198)より大幅に大きい。原文の記述通り。

## 6. エンジンと突き合わせ可能なセルの一覧(突き合わせ自体は未実施)

条件: ドイツ・1,000g・20×15×10cmのみ。エンジン(`src/lib/pricing/compare.ts`ほか)は郵便系
(`PostalMethod`)と宅配便系(`CourierMethod`)を方式ごとに個別の価格として算出するため、
「合計」ではなく**方式単位の送料**同士でなら突き合わせの候補になる。

- 突き合わせ候補になり得るセル(方式名がエンジンの方式IDに対応しそうなもの):
  - FROM JAPAN: AirMail、EMS、UPS、DHL、FedEx-Economy、FedEx-Priority、Surface、
    Surface (Small Packet)、AirMail (Small Packet)(ただしInternational ePacket Lightは
    §3の通りエンジン未実装のため対象外)
  - Buyee: EMS、International Parcel Post (AIR)/Airmail、International Parcel Post
    (Surface Mail)/Surface Mail、Small Packet (AIR)/Airmail
  - ZenMarket: EMS、DHL (GREEN+)、UPS、FEDEX(方式名の対応関係(LOWCOSTとの区別含む)は
    未確認)
  - Jauce: EMS、Surface
  - Neokyo: Japan Post EMS/Airmail/Surface、DHL Express Worldwide、FedEx International
    Priority/Economy
- 突き合わせ**できない**セル: FROM JAPANのTotal・ZenMarketのTotal(いずれも商品代金・
  手数料込みで、エンジンの「合計」計算ロジックと突き合わせるには本作業の対象外である
  Handling fee/ZenMarket Fee/Export Clearance Feeの取り扱いまで含めた比較が必要)。
  Buyee/Jauce/Neokyoは合計自体が存在しないため、方式単位の送料としてのみ比較可能。

**突き合わせ作業そのものは今回実施していない。** 上記は候補セルの列挙のみ。

## 矛盾の指摘(上書きはしない)

- `docs/measurements/raw/README.md`のJauce節にある2026-09-13再測定(`jauce/2026-09-13-v3-remeasurement.md`)
  はEMSが重量に応じて明確に増加する(¥3,900→¥10,300→¥51,100)ことを記録済みだが、今回の原文の
  Jauce計測(1,000g固定)では方式一覧に`Not available`のSALを含む3方式のみが出ており、価格自体は
  重量非依存の議論とは無関係(今回は単一重量点)なので直接の数値矛盾ではない。ただし今回の原文には
  smart packing加算(¥420)が明記されているのに対し、既存のJauce記録側にこの加算費目への言及が
  あるかどうかは本タスクの範囲では確認していない。**矛盾かどうか未確認。**
- FROM JAPANについて、既存記録
  (`docs/measurements/raw/fromjapan/2026-09-13-seven-countries-owner-measured.md`)の
  DE・1,000g行(32-33行目付近)は今回の原文の「¥1,000条件・1,000g」の方式別金額と一致するかを
  突き合わせると、International ePacket Light ¥2,500、AirMail ¥3,850、UPS ¥4,358、
  EMS ¥4,400、FedEx-Economy ¥5,309、FedEx-Priority ¥5,671、DHL ¥5,895、Surface (Small
  Packet) ¥1,300、AirMail (Small Packet) ¥2,130、Surface ¥2,500と**すべて一致**しており、
  矛盾は見当たらない。
- Export Clearance Feeのしきい値(¥200,000)は§4の通り既存の`EXPORT_DECLARATION_FEE_THRESHOLD_JPY`
  と整合しており、矛盾なし。
- それ以外(Buyee/Jauce/Neokyo/ZenMarketの他条件)について、既存の`docs/`・`master/`側の記録との
  横断的な突き合わせは本タスクの範囲(6.で列挙のみと指示)を超えるため実施していない。**確認して
  いない。**
