# FROM JAPAN 自社計算機 ── 7か国 実測ノート（2026-09-13）

オーナー自身がFROM JAPANの送料計算機の画面を直接操作して測定した。入力元:
`0a750303-FROM_JAPAN_shipping_measurement_2026-09-13.md`。

**スコープは `master/courier-rates.json`（本追記）と本ノートのみ。`src/` は一切変更していない。
`master/customs.json` / `master/fees.json` / `master/validate.py` にも触れていない。**

## 入力条件

Country of Purchase = Japan、Retail price or final winning bid = ¥1,000、Weight = 0.5/1/2/5 kg、
L/W/H = 20/15/10 cm、Domestic delivery fee = 0円、Payment Fees = Free。対象7か国:
US / GB / DE / FR / AU / CA / SG。価格は画面の `International Shipping` 欄。方法名は画面表示のまま
記録し、我々の語彙へのマッピングは別工程として明示的に分離した(下記)。

生データは `master/courier-rates.json` の `observations.fromjapan_seven_countries_2026_09_13` に
格納した。

## 結論を先に

### 1. FROM JAPANに対する我々の過大計上額は、これまでの記録より大幅に大きい

`conclusions.courier_lineup_diffs.they_offer_but_we_dont_have` は2026-09-12時点で、DE 600gの
International ePacket Light ¥1,780 に対して「我々の最安¥2,500との差は最大¥720」と記録していた。

今回の実測で、500g条件のGB/DE/FR/AU/CA全てで International ePacket Light ¥1,600 に加え、
**Surface (Small Packet) ¥800** と **AirMail (Small Packet) ¥1,230** が同時に存在することが判明した。
我々が持っていない方式のうち最安は ¥800 であって ¥1,600 ではない。

**算術**: 旧記録 ¥2,500 − ¥1,780 = ¥720。新記録 ¥2,500 − ¥800 = **¥1,700**。
旧記録は実態の半分以下だった。`master/courier-rates.json` の当該エントリを訂正し、
`conclusions.fromjapan_overstatement_correction_2026_09_13` に詳細を記録した。

### 2. Export Clearance Fee ¥0 表示と、master F26（¥2,800）の関係 ── オーナー判断待ち

FROM JAPANの結果画面は、測定した全条件（商品価格¥1,000）で一貫して
`Export Clearance Fee: 0 yen` を表示していた。これは日本郵便系の行（EMS/AirMail/Surface等）でも
同じだった。

`master/fees.json` F26（fromjapan）は「日本郵便便かつ申告額¥200,000超で¥2,800」というルールで、
既存の `conclusions.export_clearance_threshold` はFROM JAPAN自身の価格走査で¥200,000→¥0、
¥200,001→¥2,800という閾値をすでに確認している。したがって今回の¥1,000条件での¥0表示は
閾値未満だから¥0という最も素直な解釈でF26と矛盾しない可能性が高い。

ただし、これを「解決した」と扱うのではなく、対立候補の読みをそのまま記録した
（`conclusions.export_clearance_fee_contradiction_2026_09_13`）:

- (a) 閾値未満なので整合——最有力。
- (b) FROM JAPANは実際には別建て請求せず送料等に吸収している可能性。
- (c) 画面の「最終支払額は実費に基づき見積りと異なりうる」という注記が示唆する通り、
  確定請求時に別途課される可能性。
- (d) F26の¥2,800がこの計測対象の方式には適用されない別区分の可能性。

**どちらの数値も本PRでは変更していない。** 次の一手は、¥200,000超・日本郵便便という条件で
FROM JAPANを再実測し、実際に¥2,800が表示されるか確認すること。

### 3. SGの500g条件が2回の測定で食い違った ── 未解決の信頼性の疑問

1回目はUPSが選択肢に出ず、2回目はUPS ¥2,891が出た。他の全ての二重測定条件
（500gと2,000gを2回測定した6か国、およびSGの2,000g）は完全に一致した。

これはJauceのsubmit-buttonバグ（価格が古いまま残る）とは異なる型の再現性の問題で、
今回は「方式そのものの有無」がぶれた。原因は特定しておらず、
`conclusions.fromjapan_sg_ups_appearance_discrepancy_2026_09_13` に未解決のまま記録した。

### 4. GB/DE/FRの価格表がバイト単位で同一

3か国とも0.5/1/2/5kgの全条件で、表示された方式の集合・価格が完全に一致した。単一の
料金ゾーンである可能性が高いが、断定はしていない——上記3のSG差分により、この計算機の
再現性自体が完全には確立していないため、キャッシュや状態バグの可能性を積極的に排除できない。
`conclusions.fromjapan_gb_de_fr_price_table_identity_2026_09_13` に記録した。

## その他の確認事項

- **US genuinely lacks the cheap methods**: 全4重量条件でInternational ePacket Light / SF Express /
  Small Packet各方式 / Surfaceが一貫して非表示（表示されたのはECMS/UPS/DHL/FedEx-Economy/
  FedEx-Priorityの5方式のみ）。PR #92の「FROM JAPANはUSに日本郵便を出していない」という結論を、
  別日・別セッションの独立測定で確認した（`conclusions.fromjapan_us_japanpost_absence_confirmed_2026_09_13`）。
- **5,000gでInternational ePacket Lightと両Small Packet方式が消える**: それが表示されていた
  全ての国（GB/DE/FR/AU/CA/SG）で2,000gまでは表示され、5,000gで消えた。上限は2kg超5kg以下の
  どこかにあると推測されるが、これは実測からの推測であり公表された上限ではない
  （`conclusions.fromjapan_weight_ceiling_epacket_smallpacket_2026_09_13`、
  `reasoned_judgement_unconfirmed`）。
- **SF Expressが表示されたのはSingaporeのみ**（declared-elsewhere-absent、
  `conclusions.fromjapan_sf_express_scope_2026_09_13`）。
- **Handling fee ¥500/Item** は `master/fees.json` F02（fromjapan、取扱手数料、¥500固定）と一致。
  差異なし（`conclusions.fromjapan_handling_fee_cross_check_2026_09_13`）。
- **methods_shown_total** を全条件で記録した（`docs/PRINCIPLES.md` 原則2の必須項目）。

## 方法名マッピング（別工程として明示分離）

| 画面表示名 | 我々の語彙 | 確信度 |
|---|---|---|
| EMS | `ems` | 確度高 |
| AirMail | `parcel-air` | 確度高 |
| Surface | `parcel-surface` | 確度高 |
| AirMail (Small Packet) | `small-packet-air` | 確度高 |
| Surface (Small Packet) | `small-packet-surface` | 確度高 |
| International ePacket Light | 対応キーなし（`services.ts`の`postage`に存在しない） | **不確実フラグ** |
| ECMS | `courier`側の一方式と推測、固有レート無し | **不確実フラグ** |
| SF Express | `courier`側の一方式と推測、固有レート無し | **不確実フラグ** |
| UPS / DHL / FedEx - Economy / FedEx - Priority | `courier`(宅配便)モデルに対応すると推測、便名別レートは無い | **不確実フラグ** |

## 未着手のまま残るもの（このPRでは反映しない）

- International ePacket Light / Surface (Small Packet) / AirMail (Small Packet) を我々のモデルに
  追加するかどうかはオーナー判断（`src/`は本PRで一切変更していない）。
- Export Clearance Feeの矛盾はオーナー判断待ち（上記2）。
- ECMS / SF Express / 宅配便各社の便名別レートを個別に価格化するかは別途判断。
