# 検査されていない4箇所の監査（2026-09-13）

対象PR: `claude/close-coverage-gaps`。**振る舞いは変えていない。テストの追加のみ**
（`src/lib/pricing/compare.ts` は `taxLines` を export しただけで、ロジックは1文字も
変えていない — 差分は `git diff` で確認できる）。

各項目とも、対応するテストを一時的に mutation（値やロジックを壊す）して
落ちることを確認し、直後に復元して `git diff` が空になることと `npx vitest run`
全件パスを確認した。以下は各項目の結論と、その過程で見つけた別の欠落。

---

## ① GB の関税率 `0.029`

**足したテスト**: `src/lib/pricing/taxes.test.ts`
`GB: zero below the GBP 135 threshold, the 2.9% WTO estimate above it`
——AU（`WTO 豪州プロファイル 2.3%`）と同じ形。£135以下で免税・超過で
`COUNTRIES.GB.dutyRate === 0.029` かつ `dutyRateSourceUrl` が `GB_e.pdf` を
含むことを確認する。

**出典は見つかった。** `src/lib/pricing/countries.ts` の GB エントリの
コメント（`dutyRateSourceUrl` の直上）に既に書かれている:
- WTO World Tariff Profiles 2025、英国プロファイル Part A.1
- 「Simple average 2025 — Total 3.7 / Ag 8.6 / **Non-Ag 2.9**」
- EU (4.1%)・カナダ (2.0%〜2.3%) と同じ選び方（非農産品の単純平均）
- 反証も同じコメントに記録済み: 同プロファイルの度数分布で、英国は
  非農産品の税表の行の55.2%が無税（最頻値は0%）——だから `dutyTier: 'estimate'`

出典URL: `https://www.wto.org/english/res_e/statis_e/daily_update_e/tariff_profiles/GB_e.pdf`

**master/customs.json には対応する値が無い。** GB エントリを直接確認した:

```json
"duty": {
  "rule": { "type": "threshold", "free_below": 135, "rate_above": "unknown" },
  "tier": "C_unknown",
  ...
}
```

`rate_above` が `"unknown"`、`tier` が `"C_unknown"` のまま——`countries.ts` の
`0.029` は master 側の追加確認を経ていない値だという欠落。Fable の所見
「masterにも無い」と一致する。**master に値を足すかどうかはこのPRの範囲外**
（依頼どおり、勝手に足していない）。

**注意（誤解しやすい点）**: `master/customs.json` の中に `0.029` という数値自体は
存在する（`countries[5]` = AU の `clearance[2].rule.rate`）が、これは AU の
Import Processing Charge の rate であって GB とは無関係の偶然の一致。GB の
duty rate に対応する値は master に存在しない。

**mutation の結果**: `countries.ts` の GB `dutyRate` を `0.029` → `0.05` に
書き換えたところ、足したテストが
`AssertionError: expected 0.05 to be 0.029` で落ちた → 復元 → `git diff` 空を確認。

---

## ② 箱詰めの順番（`packHeaviestFirst`）

**順番は結果を変えるか: 変える。** `compare()` を通じて実際に確認した具体例:

カート: 900g/¥27,000・700g/¥30,000・500g/¥1,000（GB、`small-packet-air`、
`maxGramsFor` の上限2000g grossを超えるため2箱に分割される）。

- **現行実装（重い順・LPT）**: 箱A={900g}（申告額¥27,000）・箱B={700g,500g}
  （申告額¥31,000）。¥27,000はGBP 127.7で£135以下＝免税、¥31,000はGBP 146.6で
  £135超＝関税対象。→ 関税額 = zenmarketの行で **1,076円**（実測、vitestで確認）。
- **もし「軽い順」に変えていたら**: 箱A={500g,900g}（¥28,000）・箱B={700g}
  （¥30,000）。¥28,000はGBP 132.4で免税、¥30,000はGBP 141.9で関税対象。
  → 関税額は **988円**（実測）。

同じ商品構成・同じ国・同じ方式で、詰め方だけを変えると関税額が変わる
（1,076円 vs 988円）——これはFableの所見（多品目・重量分割が起きるカートで
個口ごとの免税判定が変わり得る）を具体例で裏付けている。

**なぜ「重い順」でなければならないかの根拠**: `docs/DESIGN-BOX-SIZE.md` §2⑤
「各箱の申告額 ── 均等割をやめる」（オーナー確定 2026-09-12）に明記されている:
- 梱包後重量が既に商品ごとに分解できているため、追加のデータ（体積・入力順）を
  必要としない
- 「重い順に箱を埋める」は現実の梱包作業に近い直感で、ビンパッキングの
  初等的なヒューリスティック（First Fit Decreasing / LPT）とも一致する
- **ただし実際の割り当ては代行が決める。これは仮定である**、と同ドキュメントが
  明示している——「重い順」は正しさが確認された規則ではなく、選ばれた仮の規則。
- 傍証（ZenMarket発送案内ページ、`master/fees.json` F39c）は「箱ごとに商品が
  物理的に分かれる」という事実だけを裏付け、**割り当ての順序自体は裏付けない**
  ——`DESIGN-BOX-SIZE.md` 自身がそう明記している。

なお同ドキュメントには「この規則は決定・文書化済みだが未実装」と書かれているが
（2026-09-12時点の記述）、実際に読んだ現在の `compare.ts`（`boxesForPostal`/
`splitByWeightLimit` の呼び出し、1085行目以降）では既に接続済みだった——
ドキュメントが実装に追いついていない、別の小さな不整合。

**足したテスト**:
- `src/lib/pricing/parcels.test.ts`
  `heaviest-first pairs the two lighter items together, not the heaviest with a lighter one`
  ——`packHeaviestFirst` 単体で、3点2箱の組み合わせ自体（重量900gが単独、
  700g+500gが同居）を固定。
- `src/lib/pricing/taxes.test.ts`
  `packing order changes the duty amount when a shipment splits into multiple GB parcels`
  ——`compare()` 経由で、上の具体例の関税額が¥30,000×2.9%（軽い順にした場合の額）
  より厳密に大きいことを固定（=重い順の¥31,000側の額であることの検査）。

**mutation の結果**: `parcels.ts` の `packHeaviestFirst` の並び替えを
「重量降順」→「重量昇順」に変更したところ、**両方のテストが落ちた**:
- `parcels.test.ts`側: `expected undefined to be truthy`（{900g}単独の箱が
  見つからなくなった）
- `taxes.test.ts`側: `expected [28000, 30000] to deeply equal [27000, 31000]`
  （箱の中身の組み合わせが変わった実測値）
→ 復元 → `git diff` 空を確認。

---

## ③ 税の計算順序（`taxLines`）

**正確な記述**（`src/lib/pricing/compare.ts` を読んで確認、277行目以降）:

1. 個口ごとの課税ベースをまず組み立てる:
   - `cifP = itemsYen + domYen + emsYen`（商品代＋国内送料＋国際送料）
   - `baseYenP = base === 'CIF' ? cifP : itemsYen`
   - `declaredP = itemsYen / 為替レート`（免税限度の判定は**運賃を除いた商品代のみ**）
2. **関税を先に確定する**（`dutyPerParcel`）。`declaredP` が `dutyFreeLimit` 以下
   なら関税0。超えていれば `dutyBaseYenP * dutyRate`
   （`dutyBaseYenP` はカナダだけ別式 `itemsYen + domYen`、それ以外は `baseYenP`）。
3. **VAT/GST はそのあと、関税を含めたベースで計算する**（`vatPerParcel`）:
   ```
   vatBaseP = base === 'CIF' ? cifP + dutyYenP
            : cc === 'CA'    ? itemsYen + domYen + dutyYenP
            :                  itemsYen + emsYen   // 米・豪・星は関税を含めない
   ```

つまり **`base: 'CIF'` の国（GB・DE・FR）とカナダは「関税→VAT」のカスケード**
（VATの課税標準に関税額を足す）で、**`base: 'FOB'` の国（US・AU・SG）は
関税をVATベースに含めない。**

**順序を入れ替えたら結果が変わる条件**: `base: 'CIF'` の国で、免税限度を超えて
関税が発生するとき（関税が0なら順序を入れ替えても結果は同じなので、必ず
関税が正の条件が要る）。GBで商品代¥100,000（GBP 473、£135超）の例:
- 現行（関税→VAT）: 関税 = 100,000×2.9% = 2,900円。VAT = (100,000+2,900)×20% = **20,580円**。
- もし順序が逆（VATを関税抜きのCIFで計算）: VAT = 100,000×20% = **20,000円**。
- 差は580円——順序は結果に効く。

**export の選択とその理由**: `taxLines` を export した（`compare.ts` の
export行のみ変更、ロジックは無変更）。`compare()` 経由の間接検査だと、個口ごとの
`domYen`/`emsYen`（配送方式・社ごとに解決される内部値）を呼び出し側から
制御できず、「順序が効く条件」を狙って正確に作れない。`taxLines` を直接呼べば
`ParcelTaxBasis` の全フィールド（`itemsYen`/`domYen`/`emsYen`）をテストが握れるので、
こちらを選んだ。

**足したテスト**: `src/lib/pricing/tax-order.test.ts`
- `GB: VAT is computed on (CIF + duty), not on CIF alone`
  ——実際のVAT額が「関税込みベース」の期待値と一致し、「関税抜きベース」の
  期待値とは一致しないことを固定。
- `GB: below the duty-free threshold, duty is 0 and VAT is on CIF alone`
  ——関税が発生しない条件では両方の計算方法が一致してしまう（=順序の効果が
  隠れる）ことを対照として記録。

**mutation の結果**: `vatBaseP = c.base === 'CIF' ? p.cifP + dutyYenP` の
`+ dutyYenP` を削り、関税を含めない計算に変えたところ、1つ目のテストが
`AssertionError: expected 20000 to be 20580` で落ちた → 復元 → `git diff` 空を確認。

---

## ④ 丸め

**`Math.round` の出現箇所の棚卸し**（`src/lib/pricing/compare.ts` +
`src/lib/ui/format.ts`。詳細な表は `src/lib/pricing/rounding.test.ts` の
先頭コメントに残した）:

| 箇所 | 何を | 単位 |
|---|---|---|
| `grossG` / `itemWeightG`（2箇所） | 重量 | グラム |
| `province-tax`（2箇所） | 州税額 | 円 |
| `duty`（3箇所） | 関税額 | 円 |
| `vat` | VAT/GST額 | 円 |
| `clearance` | 通関手数料 | 円 |
| `prepaid-import-tax`（2箇所） | 決済時徴収の推定税額 | 円 |
| `courier-clearance-fee`（3箇所） | 宅配便の通関手数料 | 円 |
| `deposit` | デポジット手数料 | 円 |
| `format.ts` `yen()` | 表示用の円額 | 円 |
| `format.ts` `yenRounded()` | 表示用の総額 | **¥100** |
| `format.ts` `foreign()` | 表示用の外貨換算額 | 現地通貨の整数単位 |

**単位の混在は見つからなかった。** 金額系はすべて「円の整数」に丸めており、
`yenRounded()` の¥100だけが例外だが、これは表示専用（`totalIntervalText`/
`yenRange` の `round` 引数）で、`grep -rn "yenRounded" src/lib/pricing/` は
ゼロ件——丸めた後の値が計算に戻ってくる経路は無い。

**二重丸めも見つからなかった。** `Line.amount` はどの行も一度だけ `Math.round`
され、`sum()`/`totalRange()`（`Row.total`）はその整数を単純合計するだけで
再度丸めない。VATの課税ベースに足す関税額（`dutyYenP`）も、表示用に丸めた
`duty.amount` ではなく丸め前の `dutyPerParcel[i].yen` を使っている
（③のテストが、この生の値がVATベースに正しく入ることを別途確認済み）。

**足したテスト**:
- `src/lib/ui/format.ts` 用に新規 `src/lib/ui/format.test.ts`
  （この関数群には専用テストが無かった）——`yen()`/`yenRounded()` の丸め単位と
  `.5` の丸め方向（JSの `Math.round` は+Infinity方向）を固定。
- 新規 `src/lib/pricing/rounding.test.ts`
  - 全行の金額が整数円であること（複数国・端数のある価格で横断確認）
  - `Row.total.low` が内訳の単純合計と一致すること（同語反復的な保証として）
  - **丸め粒度そのものを主張するテスト**: US・関税の計算で、
    6,667円×12.5%=833.375円 → 期待値833円（¥100単位に丸めれば誤って
    800円になる）を直接固定。

**mutation の結果**:
- `format.ts` の `yenRounded` を¥100→¥10単位に変えたところ、
  `format.test.ts` の4件が失敗（¥5,250–19,850 になるべきが期待値と不一致、等）
  → 復元。
- `compare.ts` の関税（rate単独ブランチ）の丸めを `Math.round(dutyYen)` →
  `Math.round(dutyYen/100)*100` に変えたところ、`rounding.test.ts` の
  丸め粒度テストが `expected 800 to be 833` で失敗 → 復元。
- なお「内訳合計＝総額」テストは、この丸め粒度mutationでは**落ちなかった**
  （`total` は `lines` から計算する定義そのものなので、個々の行の丸め方が
  変わっても自己無矛盾なままになる）——この限界を`rounding.test.ts`の
  コメントに明記した。丸め粒度そのものを主張するには、行の期待値を
  独立に計算して比較するテストが別途必要だった。

---

## 足したテストが現状の実装で落ちたものは無い

4項目とも、追加したテストは**現状の実装に対して全件パス**している
（`npx vitest run` 1113件パス）。mutation で意図的に壊したときにだけ落ちる
ことを確認した——つまり「実装のバグを見つけた」というケースは今回は無かった。

## 分からないこと・別に見つかった問題

- **`docs/DESIGN-BOX-SIZE.md` §2⑤の「未実装」という記述が実装に追いついていない**
  （②参照）。ドキュメントの更新自体はこのPRの範囲外として触れていない。
- **GBの `dutyRate: 0.029` が master 未確認のまま**（①参照）。master に足すか
  どうかは別判断——このPRでは master に一切触れていない。
- 上記2件以外に、今回の調査で新たに見つけた欠落は無い。
