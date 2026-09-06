# 監査：重量と総額の推論ロジック

対象: `src/lib/pricing/compare.ts`（376行）, `ems.ts`, `countries.ts`, `services.ts`, `weights.ts`
検査日: 2026-09-06 / ブランチ `claude/automated-income-schemes-uzn8zw-rh3uwh` @ `3aabc20`
方法: 読解ではなく **実行**。`npx tsx` から `compare()` を直接呼び、出た数字を手計算と照合した。
`npx vitest run` は 174 tests / 7 files すべて通る（＝以下の誤りはどれも既存テストに引っかかっていない）。

再現用の共通ヘルパー（以下のコードはこれを前置すれば全部そのまま走る）:

```ts
// /tmp/probe/lib.ts
export const it = (o: any = {}) => ({
  id: o.id ?? 'i1', title: o.title ?? 'x', priceYen: o.priceYen ?? 3000,
  priceTier: o.priceTier ?? 'fixed', site: o.site ?? 'yahoo-auctions',
  weightG: o.weightG === undefined ? 600 : o.weightG,
  weightTier: 'estimate', qty: o.qty ?? 1, ...o,
});
```
実行は `npx tsx --tsconfig tsconfig.json <file>`（`@/` の解決に tsconfig が要る）。

---

## 0. 要約：重大な誤り

| # | 誤り | 影響 | 判定 |
|---|---|---|---|
| L1 | `domesticIncluded` の社でも、課税ベース CIF に **架空の国内送料 ¥800** が入る | 内訳のどの行にも現れない金額で Neokyo の VAT が動く。DE で ¥152、`domesticShippingYen` を入れると ¥798 動く | **バグ（確定）** |
| L2 | DE / FR の免税限度をまたぐと **総額が下がる**（¥1 高い商品の総額が ¥580 安い） | 単調性が壊れている。順位も歪む | **バグ（確定）** |
| L3 | 15,000g 超の EMS を **黙って 15kg の料金に丸める** | 20kg で数万円の過小表示。null でなく「安い数字」を出す＝不変条件1の違反方向 | **バグ（確定）** |
| L4 | `resolveWeight` の優先順位が「**当たった語**」ではなく「**その行の最長語**」 | ねんどろいど+CD → 439g でなく 100g。日付 `2024/1/8` → 1/8 スケール 1,300g | **バグ（確定）** |
| L5 | DESIGN-NOTES §1 の「1/3〜5倍でも7カ国で順位が動かない」「唯一の逆転条件は送料込み」が **現実装で成立しない** | 5.96kg/点（5点）・4.76kg/点（1点）で Neokyo→FROM JAPAN。送料込みは1点のときしか逆転しない | **主張が古い（確定）** |

以下、分岐ごとに実測値を出す。

---

## 1. 分岐の網羅表

`compare()` の分岐を全部列挙し、実際に走らせた値を置いた。

| # | 分岐 | 条件 | 期待 | 実測（実行値） | 判定 |
|---|---|---|---|---|---|
| B1 | 重量既知 / 不明 | `items.some(i => i.weightG == null)` | 不明なら bands | 1点 600g → `bands: null`, rows 5行。1点 null → bands 6段 | OK |
| B2 | 個口 1つ / 注文ごと | `svc.parcelDefault === 'per-order' && items.length > 1` | Buyee のみ2行 | 3点で `buyee:consolidated` と `buyee:default` の2行。1点なら `buyee` 1行 | OK（但し C1） |
| B3 | 梱包重量 → EMS 段 | `grossG` が `emsFor` の前 | 前 | 600g → gross `round(600*1.2+300)=1020` → 1.3kg 段 ¥5,990（zone4） | OK |
| B4 | 個口が複数のとき各個口に梱包加算 | `split ? netPerItem.map(grossG) : [grossG(sum)]` | 各個口 | 3点600g: default = 3×`grossG(600)`=3×1020 → EMS ¥5,990×3=¥17,970。consolidated = `grossG(1800)`=2460 → ¥9,100 | OK |
| B5 | 数量 qty | `netPerItem = w * qty`, `perItemYen * qty` | 重量・点数は qty 倍 | 1点 qty=3 → items ¥9,000、Neokyo service-fee ¥1,050、EMS 2.5kg 段。ただし **国内送料は ¥800 のまま（qty 非依存）** | 意図的だが未記述 |
| B6 | 送料込み `freeShipping` | `domesticFor` が最優先 | ¥0 | GB 1点: FROM JAPAN ¥12,268→¥11,820、Neokyo ¥11,970（**据置**、L1 参照） | 部分的に誤り |
| B7 | `domesticShippingYen` 明示 | freeShipping の次 | その値 | `domesticShippingYen: 0` と `freeShipping: true` は同じ総額。**両方指定すると freeShipping が勝つ**（安い方向に倒れる） | 要注意 |
| B8 | 国内送料の仮定 | 未指定 → ¥800 / tier `estimate` | ¥800 | ¥800、note `~¥800 each, paste the URL to know` | OK |
| B9 | 入金手数料 gross-up | `base = sum(lines)+flat`、税の**前** | 税を含まない | ZenMarket US: base=3000+800+800+5990=10590、`10590*0.035/0.965=384.09` → **¥384** 実測一致。税・通関は base に入っていない | **OK（正しい）** |
| B10 | Jauce の定額+率の gross-up | `flat` を先に足してから率 | `40 + (b/(1-0.039)-b)` | base=3000+400+240+800+540+5990+40=11010 → `40+11010*0.039/0.961=486.8` → **¥487** 一致 | 計算はOK（解釈は未検証） |
| B11 | Jauce 従価 8% | `chargeableYen * 0.08` | 落札価格の8% | ¥3,000 → ¥240 | OK |
| B12 | Jauce の site 別無料 | `freeForSites: ['rakuten','yahoo-shopping']` | perItem と adValorem が 0 | rakuten 1点: service-fee ¥0 / ad-valorem ¥0、**packing ¥540 と deposit ¥461 は課金**。混在（rakuten+yahoo-auctions）で ¥400・¥240 のみ | OK |
| B13 | Jauce 梱包 ¥120/kg | `packingLine(svc, parcelGross)` | — | **梱包後の重量**に対して `ceil(g/1000)`。600g → gross 1020 → `300+120*2=¥540`。商品重量 600g なら ¥420 のはず | **仕様未確認・要検証（下記 C2）** |
| B14 | Neokyo 梱包 2kg まで無料 | `max(0, ceil((g-2000)/1000))` | — | gross 1020 → ¥500。gross 2001 → ¥650 | OK |
| B15 | 課税ベース CIF / FOB | `c.base` | CIF=商品+国内+EMS | DE 600g ¥3,000: cif=3000+800+5000=8800、vat=(8800+489)*0.19=**¥1,765** 一致 | 計算一致。但し L1 |
| B16 | FOB の VAT ベース | `itemsYen + emsYen`（duty を含まない） | — | CA ¥3,000/600g: (3000+5000)*0.05=**¥400**。国内送料 ¥800 は VAT ベース外だが CIF 判定 `declared` は itemsYen のみ | 一貫していない（下記 C3） |
| B17 | 免税限度以下＋定額関税 | `flatDutyPerItem != null && declared <= limit` | DE/FR ¥489/点 | DE ¥3,000 → duty ¥489 (`EUR 3 flat × 1 item`) | OK |
| B18 | 免税限度超＋税率なし | `dutyRate == null` | null（「—」） | CA ¥3,000 → duty `null`, note `over the CAD 20 threshold — rate not included`, `excluded: [Duty, Provincial tax, Customs clearance fee]` | OK（表示） |
| B19 | 未取得 null の伝播 | `sum` が `?? 0` | 総額に足さない・excluded に出す | US: `vat=null` → `excluded:['Sales tax / VAT']`。総額は足していない | OK |
| B20 | 段の代表値 | `bands[Math.floor(6/2)]` = index 3 | 「真ん中の段」 | `[500,1000,1500,2000,3000,5000]` の **2 kg**（4段目/6段中）。真ん中ではない | 軽微だが高めに寄る |
| B21 | `emsMarkup` | 全社 0 | — | `Math.round(x*1)` の恒等。**この分岐は一度も実行されていない** | 死んだ経路 |
| B22 | 複数個口 × 梱包 | `packingLine` のループ | — | 個口が2以上になるのは `buyee:default` のみ、Buyee は `packing: null`。**ループの2周目以降は到達不能** | 死んだ経路 |
| B23 | 複数個口 × 入金手数料 | — | — | Buyee に `deposit` なし。**到達不能** | 死んだ経路 |
| B24 | `approximate` | `priceEstimated || lines.some(tier==='estimate')` | 推定混在なら true | EMS 行の tier が常に `'estimate'` 固定 → **7カ国 × 全重量で常に true**。false になる入力を見つけられなかった | 情報量ゼロ（下記 C4） |

---

## 2. 誤り（再現手順つき）

### L1 — `domesticIncluded` の社に「見えない ¥800」が課税ベースに乗る（確定）

`buildRow` は `domYen` を **`svc.domesticIncluded` に関係なく** 計算し、
表示行だけを 0 に差し替えたうえで、その `domYen` を `taxLines` に渡している。

```ts
const dom = items.map(domesticFor);
const domYen = dom.reduce((a, d) => a + d.yen, 0);      // ← 常に ¥800
lines.push(svc.domesticIncluded
  ? L('domestic-shipping', 'Domestic shipping', 0, 'included in the service fee', ...)   // ← 表示は 0
  : L('domestic-shipping', 'Domestic shipping', domYen, ...));
...
lines.push(...taxLines(ctx.cc, { itemsYen, domYen, emsYen, units, parcels }));  // ← ¥800 が CIF に入る
```

実測（DE、1点 ¥3,000 / 600g、Neokyo）:

| 入力 | 表示される domestic-shipping | VAT | 総額 |
|---|---:|---:|---:|
| 既定（国内送料は仮定の ¥800） | **¥0**「included in the service fee」 | ¥1,765 | **¥11,104** |
| `freeShipping: true` | **¥0**（同じ文言） | ¥1,613 | **¥10,952** |
| `domesticShippingYen: 5000` | **¥0**（同じ文言） | ¥2,563 | **¥11,902** |

内訳の全行が同一なのに総額が ¥798 動く。利用者は差の出どころを画面から辿れない。

```ts
import { compare } from '@/lib/pricing/compare';
import { it } from './lib';
for (const p of [{}, { freeShipping: true }, { domesticShippingYen: 5000 }]) {
  const r = compare({ items: [it(p)], country: 'DE' });
  const nk = r.rows.find((x: any) => x.id === 'neokyo')!;
  console.log(JSON.stringify(p), 'total', nk.total,
    'domestic-line', nk.lines.find((l: any) => l.key === 'domestic-shipping')!.amount,
    'vat', nk.lines.find((l: any) => l.key === 'vat')!.amount);
}
// {} total 11104 domestic-line 0 vat 1765
// {"freeShipping":true} total 10952 domestic-line 0 vat 1613
// {"domesticShippingYen":5000} total 11902 domestic-line 0 vat 2563
```

税務上「サービス料に含まれる国内輸送費も CIF に入る」と解する余地はあるが、
入っている金額は **我々が勝手に置いた ¥800**（`ASSUMED_DOMESTIC_SHIPPING_YEN`）であって、
Neokyo が実際に払う額ではない。しかも画面には ¥0 と書いてある。
「未取得は 0 でなく null」の裏返しで、**0 と表示した金額を裏で課税している**。

### L2 — DE / FR：¥1 高い商品のほうが総額が ¥580 安い（確定）

```ts
if (c.flatDutyPerItem != null && declared <= c.dutyFreeLimit) { /* EUR 3/点 */ }
else if (declared <= c.dutyFreeLimit) { /* 0 */ }
else if (c.dutyRate != null) { /* 率 */ }
else { /* null = 「—」*/ }
```

DE / FR は `dutyRate: null` なので、限度 EUR150 を **超えた瞬間に関税が「—」になり、総額から消える**。
さらに CIF 国なので VAT ベースからも `dutyYen` が抜ける。結果、総額が下がる。

```ts
import { compare } from '@/lib/pricing/compare';
import { it } from './lib';
for (const p of [18650, 18651]) {
  const r = compare({ items: [it({ priceYen: p })], country: 'DE' });
  const z = r.rows.find((x: any) => x.id === 'zenmarket')!;
  console.log(p, z.total, z.lines.find((l: any) => l.key === 'duty')!.amount);
}
// 18650 31393 489
// 18651 30813 null      ← 商品が ¥1 高いのに総額が ¥580 安い
```

FR も同じ境界で **−¥586**。

**重量でも起きる。** CIF に EMS が入るので、重い＝安い が成立する区間がある:

```ts
for (const w of [500, 510]) {
  const r = compare({ items: [it({ priceYen: 19300, weightG: w })], country: 'DE' });
  console.log(w, r.rows.find((x: any) => x.id === 'zenmarket')!.total);
}
// 500 31148
// 510 30873      ← 10g 重いのに ¥275 安い
```

**順位も歪む。** 各社は CIF が違うので、本来は社ごとに違う商品価格で限度をまたぐはず
（Neokyo は国内送料が総額に無いので後でまたぐはず）。ところが L1 のせいで **全社が同じ ¥18,651 で同時にまたぐ**。
L1 を直すと今度は「ある社だけ関税が消える」という別の逆転が出る。2つは一緒に直す必要がある。

正しい扱いは、限度超で税率が未取得なら **総額を下げるのではなく `null` を上に積む**（＝「この額に加えて関税が乗る」）
か、少なくとも限度以下の ¥489 を下限として残すこと。今の実装は「未取得」を「無料」より安く扱っている。

他国の境界（すべて実測、1点 600g / ZenMarket）:

| 国 | 境界 | 変化 | 単調 |
|---|---|---|---|
| GB (GBP135, CIF) | 商品 ¥19,850 → ¥19,851 | 総額 ¥34,059 → ¥34,060（duty 0→null、金額差なし） | OK |
| DE (EUR150, CIF) | ¥18,650 → ¥18,651 | **¥31,393 → ¥30,813（−580）** | **NG** |
| FR (EUR150, CIF) | ¥18,650 → ¥18,651 | **¥31,643 → ¥31,057（−586）** | **NG** |
| CA (CAD20, FOB) | ¥2,200 → ¥2,201 | ¥9,119 → ¥9,480（+361、GST 0→360、duty 0→null） | OK |
| SG (SGD400 VAT) | ¥42,100 → ¥42,101 | ¥48,912 → ¥53,089（+4,177） | OK |
| AU (AUD1000, FOB) | ¥99,000 → ¥99,001 | ¥119,830 → ¥119,831（duty 0→null） | OK |
| US (USD0, FOB) | `itemsYen == 0` のときだけ duty 0 | 下記 E4 | 表示が誤り |

### L3 — 15kg 超を黙って 15kg 料金に丸める（確定）

`emsStepIndex` は表の外を `EMS_MAX_INDEX` に落とす。`compare()` はそれをそのまま使う。

```ts
import { compare } from '@/lib/pricing/compare';
import { it } from './lib';
for (const w of [12250, 12251, 20000, 100000, 1e9]) {
  const nk = compare({ items: [it({ weightG: w })], country: 'US' }).rows.find((x: any) => x.id === 'neokyo')!;
  console.log(w, 'gross', Math.round(w * 1.2 + 300), 'ems', nk.lines.find((l: any) => l.key === 'ems')!.amount, 'total', nk.total);
}
// 12250     gross 15000      ems 39100 total 46678
// 12251     gross 15001      ems 39100 total 46828   ← 表の外。以降ずっと 39100
// 20000     gross 24300      ems 39100 total 48178
// 100000    gross 120300     ems 39100 total 62578
// 1000000000 gross 1200000300 ems 39100 total 180044578  ← 1200 トンの荷物が EMS ¥39,100
```

- EMS の受付上限は 30kg。15〜30kg は **料金が存在するのに 15kg 料金**（数万円の過小）。
- 30kg 超は **そもそも送れない**のに総額が出る。
- 梱包料だけは重量に比例して伸びる（1200 トンで ¥180,000,350）ので、**総額はそれらしく見える**。
- `ems.ts` のコメントは「15kg 超は最上段に丸める」と自認しているが、`compare()` 側は
  それを `tier: 'estimate'` の普通の数字として出す。**未取得なら null**（不変条件1）に反する。
- 到達可能: `ItemList` の重量入力は `toYen`（数字以外を除去）＋ `g > 0` のみ。`20000` と打てば到達する。

### L4 — `resolveWeight` の優先順位が「当たった語」でなく「行の最長語」（確定）

```ts
.sort((a, b) => longest(b.line.match) - longest(a.line.match));   // 行の最長語
```

`music/cd` 行の語は `['cd','compact disc']` で最長は 12。`figures/nendoroid` は `['nendoroid','ねんどろいど']` で 9。
したがって **2文字の "cd" が 9文字の "ねんどろいど" に勝つ**。

```ts
import { resolveWeight } from '@/lib/pricing/weights';
console.log(resolveWeight('ねんどろいど 初音ミク'));
//   grams: 439, lineId: 'nendoroid'
console.log(resolveWeight('ねんどろいど 初音ミク 初回限定CD付き'));
//   grams: 100, lineId: 'cd'     ← 特典 CD が付いた瞬間フィギュアが 100g になる
console.log(resolveWeight('compact disc player Sony'));
//   grams: 100, lineId: 'cd'     ← CD プレーヤー（実重量 2kg 前後）が 100g
```

コメントは「語が長いラインを先に当てる（'1/7' より 'pop up parade' を優先する）」と書いてあるが、
実装は **当たった語の長さを一切見ていない**。比較すべきは「マッチした語の長さ」。

### L5 — DESIGN-NOTES §1 の主張は現実装では成立しない（確定）

§1 の総額の表は **今も一致する**（下記）。壊れているのは「順位」の主張のほう。

| 実重量/点（5点 ¥3,000 → US） | doc の総額 | 実測 | 一致 |
|---:|---:|---:|---|
| 200 g | ¥27,128 | **¥27,128** | ✓ |
| 600 g | ¥33,528 | **¥33,528** | ✓ |
| 1,500 g | ¥48,828 | **¥48,828** | ✓ |
| 3,000 g | ¥62,178 | **¥62,178** | ✓ |

一方、

- **「1/3〜5倍に外しても順位が動かない」は 1.2kg/点 以上で成立しない。**
  5点 ¥3,000 → US で `rankStable` を重量ごとに追うと、`1200g` から **false** になる
  （5倍 = 6,000g/点 で Neokyo → FROM JAPAN）。実装自身がそう言っている。
  §1 の表の 1,500g・3,000g の行はまさにその領域で、doc は「動かない」と書いているが
  実装は `rankStable: false` を返す。**doc と実装が矛盾している。**

- **1位が入れ替わる重量（実測）**: 5点 ¥3,000 → **5,960 g/点** から FROM JAPAN。
  1点 ¥3,000 → **4,760 g** から FROM JAPAN。**7カ国すべてで同じ向きに起きる**
  （US/GB/DE/FR/AU/CA/SG、6,000g で全国 fromjapan）。原因は Neokyo の梱包
  `2kg 超 ¥150/kg` に FROM JAPAN 側の対応費目が無いこと。§1 は「7カ国すべてで1位 Neokyo」と書いているが、
  **重量条件が抜けている**。

- **「唯一の逆転条件は送料込み」も成立しない。**
  実測（600g）:

  | カート | 既定 | `freeShipping: true` |
  |---|---|---|
  | 1点 GB | Neokyo ¥11,970 | **FROM JAPAN ¥11,820**（逆転する） |
  | 5点 × 7カ国 | Neokyo | **Neokyo のまま**（逆転しない） |

  理由: FROM JAPAN は `perItemYen 500` に加え `paymentInsideJapanYen 200` が
  `orders`（= `items.length`）倍で乗るので実質 ¥700/点。Neokyo は ¥350/点＋梱包 ¥500/個口。
  n=1 では FJ 700 < NK 850、n≥2 では FJ 700n > NK 350n+500。
  **逆転は1点のカートでしか起きない。** doc の「唯一の逆転条件」は現実装では
  「1点かつ送料込み」または「重量 ≥ 約4.8kg/点」の2つになっている。

- **`rankStable` の定義と文言のずれ。** true のときの文言は
  `"... stays cheapest even if we are off by 5x on weight."` だが、実際に試すのは
  `[1/3, 3, 5]` の **3点だけ**。1/5・1/10 は試していないし、5倍より上も見ていない。
  `w=600g` の 1点カートは `rankStable: true` を返すが、**8倍（4,800g）で FROM JAPAN に入れ替わる**。
  文言は「5倍まで」と限定しているので嘘ではないが、利用者は「だいたい大丈夫」と読む。
  なお **[1/3, 5] の内側は総当たりで検証した（7カ国 × 価格2種 × 重量10種 × 点数2種 × 倍率 0.34〜5.00 を 0.02 刻み、
  合計 65,520 通り、compare() 呼び出しは約26万回）── `rankStable: true` なのに区間内で1位が動く例は 0 件。**
  3点サンプリングは **1位に関しては** 今の料金構造では十分だった。ただしそれは料金表の形に依存する保証で、
  料金が1つ変われば崩れうる。

- **`rankStable` は1位しか見ていない。** 画面の主役は「順位と差額」（§1 の UI 結論）なのに、
  2位以下の入れ替わりは検査も表示もしていない。実測: 5点 ¥3,000 → US で
  200g のとき `fromjapan < jauce < buyee:consolidated < zenmarket`、
  600g のとき `fromjapan < buyee:consolidated < zenmarket < jauce`。
  **Jauce が2位から5位へ動いているのに `rankStable: true`。**

- **段（bands）のときの `rankStable` は別物。** `bands.every(b => b.cheapestRowId === first.cheapestRowId)`
  であって、既知重量の item は一切揺すらない（`weightScale` は常に 1）。
  同じフィールド名で2つの違う検査結果が入る。

---

## 3. 境界値の総当たり結果

### EMS 27段（zone 4 / Neokyo / ¥3,000）

各段の上限 `cap` と `cap+1` を **梱包後重量**で狙い、`net = ceil((gross-300)/1.2)` を入力した。

- **段飛ばし・NaN・負値は無し。** `net` を 1g ずつ 0〜13,000g 動かして `emsStepIndex(grossG(net))` を追ったところ、
  **段の飛び 0 件、到達できない段 0 件**（27段すべて到達可能）。
- ただし `grossG` は `Math.round(net*1.2+300)` なので **段の境界は net 側では 1g 単位で揃わない**。
  例: `cap=700` を狙って `net=334` を入れると `gross=round(700.8)=701` になり 800g 段に落ちる。
  正しくは `net=333` (`gross=700`)。表示側の「1.3 kg step」等は gross の段なので嘘ではない。
- 実測の代表:

  | 目標 gross | net | 実 gross | 段 | EMS |
  |---:|---:|---:|---|---:|
  | 500 | 167 | 500 | 500 g | ¥3,900 |
  | 501 | 168 | 502 | 600 g | ¥4,180 |
  | 1000 | 584 | 1001 | 1.3 kg | ¥5,990 |
  | 1250 | 792 | 1250 | 1.3 kg | ¥5,990 |
  | 1251 | 793 | 1252 | 1.5 kg | ¥6,600 |
  | 15000 | 12250 | 15000 | 15 kg | ¥39,100 |
  | 15001 | 12251 | 15001 | 15 kg | **¥39,100（表の外・L3）** |

### 免税限度

上の L2 の表を参照。**DE / FR のみ非単調**。

### qty / items / 価格 / 重量

| ケース | 実測 | 判定 |
|---|---|---|
| `items: []` | `rows: []`, `bands: null`, `rankStable: true`, `note: ''`, `totalRangeYen: null` | OK（落ちない） |
| `qty: 0` | **総額が出る**。Neokyo ¥5,803 / Jauce ¥6,772。`items ¥0 "0 items"`、`service-fee "¥400 × 0"`、EMS ¥3,900（`grossG(0)=300` → 500g 段）、packing ¥420、domestic ¥800、clearance ¥1,403 | **要ガード**（E1） |
| `qty: 1` | 通常 | OK |
| `qty: 2.5` | `plural(2.5,'item')` → `"2.5 items"`、総額はそのまま按分 | UI から到達不能（±1のみ） |
| `qty: -3` | **負の総額**（ZenMarket ¥-5,540 など）。順位も付く | UI から到達不能（`Math.max(1, ...)` で下限1） |
| `priceYen: 0` | 総額 ¥9,488（Jauce）。US の関税が `0` で note が `under the USD 0 threshold` | 表示が誤り（E4） |
| `priceYen: -100000` | **負の総額**。1位 Jauce ¥-102,895 | UI から到達不能 |
| `priceYen: 1e15` | ¥1,125,000,000,008,243。桁溢れなし | OK |
| `weightG: null` | bands 6段 | OK |
| `weightG: 0` | `Math.max(1, 0)` → 1g 扱い。`weightG:1` と完全同値（総額 ¥9,528 他） | OK（0 を「無料」と読まない） |
| `weightG: -5000` | `Math.max(1, -6000)` → 1g。総額は `weightG:1` と同値 | OK（安全側ではない：重い荷物を 1g にする） |
| `weightG: NaN` | **NaN が混ざる**（下記 E2） | **要ガード** |
| `weightG: Infinity` | Neokyo `Infinity`、Jauce `NaN`、他3社は有限 | **要ガード** |
| `weightG: 1e9` | 総額 ¥180,044,578、EMS は ¥39,100（L3） | **要ガード** |

### E1 — `qty: 0` で「0点の荷物」に総額が出る

```ts
compare({ items: [it({ qty: 0 })], country: 'US' }).rows.map((r:any)=>`${r.id}=${r.total}`);
// [ 'neokyo=5803', 'zenmarket=6273', 'fromjapan=6303', 'jauce=6772', 'buyee=7103' ]
```
`0 items` に対して国内送料 ¥800・EMS ¥3,900・通関 ¥1,403 が出る。UI（`ItemList`）は
`Math.max(1, item.qty - 1)` で下限 1 なので現状は到達しないが、`compare()` は公開 API で無防備。

### E2 — NaN / Infinity 重量で **順位表が黙って壊れる**

```ts
import { compare } from '@/lib/pricing/compare';
import { it } from './lib';
console.log(compare({ items: [it({ weightG: NaN })], country: 'US' })
  .rows.map((r: any) => `${r.rank}:${r.id}=${r.total}`).join(' '));
// 1:fromjapan=45378  2:buyee=45678  3:jauce=NaN  4:neokyo=NaN  5:zenmarket=47063
console.log(compare({ items: [it({ weightG: Infinity })], country: 'US' })
  .rows.map((r: any) => `${r.rank}:${r.id}=${r.total}`).join(' '));
// 1:fromjapan=45378  2:buyee=45678  3:jauce=NaN  4:zenmarket=47063  5:neokyo=Infinity
```

内訳:
- `emsStepIndex(NaN)` は `NaN <= cap` が常に false なのでループを抜けて `EMS_MAX_INDEX` を返す
  → **EMS が有限の ¥39,100 になる**。エラーにならない。
- `packingLine` の `Math.max(0, Math.ceil((NaN - 0)/1000))` は `NaN` → 梱包がある社（Neokyo/Jauce）だけ NaN。
- `rank()` の `a.total - b.total` は NaN を含むと比較が全部 false になり、**並びが入力順のまま**になる。
  結果、NaN の行が「3位」「4位」として、有限の行に混ざって表示される。
- Infinity では Neokyo が `Infinity` で最下位、FROM JAPAN が「1位 ¥45,378」として **もっともらしく出る**。

UI 経路（`ItemList.toYen` は数字以外を除去、`commitWeight` は `g > 0` を要求）からは現状到達しないが、
API / 将来の入力経路には防御が無い。`compare()` の入口で `Number.isFinite` を検査すべき。

### E3 — `toYen` を重量欄に流用しているので「1.5kg」が 15g になる

`ItemList.commitWeight` は `toYen(weight)` を使う。`toYen` は `text.replace(/[^\d]/g,'')`。
利用者が `1.5kg` と打つと `"15"` → **15 g**。`1,500` は 1500 で正しい。
落ちはしないが、桁が 100 倍ずれた総額が「確定した重量」として出る。

### E4 — 米国の関税表示：`itemsYen == 0` のとき「USD 0 の免税限度以下」と書く

```ts
} else if (declared <= c.dutyFreeLimit) {
  out.push(L('duty', 'Duty', 0, `under the ${c.ccy} ${c.dutyFreeLimit} threshold`, ...));
```
US は `dutyFreeLimit: 0` / `notes: ['de_minimis_suspended']`。`declared = 0` のとき `0 <= 0` が真になり、
**「免税限度以下なので ¥0」** と表示される。de minimis が停止している国でこの文は誤り。
`<` にするか、`dutyFreeLimit === 0` を別扱いにする必要がある。

### E5 — シンガポールの関税 note が `under the SGD Infinity threshold`

`SG.dutyFreeLimit: Number.POSITIVE_INFINITY` がそのまま文字列に入る。

```ts
compare({ items: [it({})], country: 'SG' }).rows[0].lines.find((l:any)=>l.key==='duty').note
// 'under the SGD Infinity threshold'
```
画面にそのまま出る（`Line.note` は内訳の説明文）。

---

## 4. 重量の推定が総額に与える影響（数値）

1点 ¥3,000 → US、Neokyo。重量を動かしたときの総額:

| 重量/点 | gross | EMS 段 | 総額 | 基準(600g)比 |
|---:|---:|---|---:|---:|
| 60 g | 372 | 500 g | ¥9,528 | −18% |
| 200 g | 540 | 600 g | ¥9,808 | −16% |
| 600 g | 1,020 | 1.3 kg | ¥11,618 | 0% |
| 1,800 g | 2,460 | 2.5 kg | ¥15,278 | +31% |
| 3,000 g | 3,900 | 4 kg | ¥19,178 | +65% |
| 6,000 g | 7,500 | 8 kg | ¥29,678 | +155% |
| 12,000 g | 14,700 | 15 kg | ¥46,678 | +302% |

**「順位は頑健」が成立する条件（実測）:**

| 条件 | 1位 | 成立 |
|---|---|---|
| 1点、重量 < 4,760 g | Neokyo | ✓ 7カ国すべて |
| 5点、重量/点 < 5,960 g | Neokyo | ✓ 7カ国すべて |
| 価格 ¥500〜¥200,000（重量 100/600/3,000 g） | Neokyo | ✓（順位表全体も不変） |
| **重量 ≥ 4,760 g（1点）/ 5,960 g（5点）** | **FROM JAPAN** | **✗ 7カ国すべてで逆転** |
| **1点 かつ `freeShipping: true`** | **FROM JAPAN**（GB で ¥11,820 vs ¥11,970） | **✗** |
| 2点以上 かつ `freeShipping: true` | Neokyo | ✓（doc の主張はここで外れる） |

**成立しない条件の特定:**
1. 梱包重量課金（Neokyo `2kg 超 ¥150/kg`）が支配的になる重量域。閾値は `4.76 kg`（1点）/ `5.96 kg`（5点）。
   フィギュア 1/4 スケール（3,000 g）は 1点なら安全側だが、**2体で 6,000 g** になると
   `grossG` 後に 7.5 kg になり Neokyo の梱包が ¥1,000 追加で乗る。段（bands）の 5 kg 行では
   すでに逆転している（下記）。
2. 点数が 1 のとき、FROM JAPAN の `¥500 + ¥200/order` が Neokyo の `¥350 + ¥500梱包` を下回る。
   `freeShipping` がこの差を開く。

**段（bands）での逆転は既に画面に出ている:**

```
band 500 g   neokyo=10648 fromjapan=11298 buyee=11598 zenmarket=11747 jauce=12101
band 1 kg    neokyo=12228 ...
band 1.5 kg  neokyo=14878 ...
band 2 kg    neokyo=16078 ...
band 3 kg    neokyo=18628 ...
band 5 kg    fromjapan=26178 neokyo=26278 ...     ← 逆転
rankStable: false
note: "The cheapest option changes with weight — 500 g: Neokyo, ..., 5 kg: FROM JAPAN."
```
実装の挙動は正直。**古いのは DESIGN-NOTES のほう。**

### 段の label と実際に買う EMS 段のずれ

`UNKNOWN_WEIGHT_STEPS_G` は「EMS 表の段からしか取らない」と `ems.ts` に書いてあるが、
`grossG` を通した後は EMS の段ではなくなる:

| band label（=商品重量/点） | gross | 実際の EMS 段 |
|---|---:|---|
| 500 g | 900 | **900 g** |
| 1 kg | 1,500 | **1.5 kg** |
| 1.5 kg | 2,100 | **2.5 kg** |
| 2 kg | 2,700 | **3 kg** |
| 3 kg | 3,900 | **4 kg** |
| 5 kg | 6,300 | **7 kg** |

表の見出しは `Weight / item` なので画面の意味は正しいが、
`ems.ts` の「任意の刻みだと隣の行が同じ総額になる」という選定根拠は成立していない
（gross 後に段が飛ぶので、27段中 6段しか通らず、1kg・1.25kg・1.75kg・2kg・3.5kg・4.5kg・5kg・5.5kg・6kg 段は
段表示のときに一度も現れない）。

### 代表段の選び方

`bands[Math.floor(6/2)]` = index 3 = **2 kg**。6段の「真ん中」は 1.5 kg と 2 kg の間なので、
実装は上寄りを選んでいる。重量不明の1点カートの見出し総額は
2 kg 段の **¥16,078** になり、500 g 段の ¥10,648 に対して +51%。
「1つの数字を押し付けない」と言いつつ `result.rows` には押し付けている。

---

## 5. `resolveWeight` の誤爆・取りこぼし（実測）

`useCompare` は `resolveWeight(draft.title)` を **カテゴリ無し**で呼ぶ。
したがって `fallbackG`（figures なら 1,000 g）と `categoryById` は **アプリからは到達しない**（死んだ経路）。
以下はすべてカテゴリ無しの実測。

### 誤爆

| タイトル | 出た値 | 妥当な値 | 倍率 |
|---|---:|---:|---|
| `【1/7(火)まで】限定出品 トレカ` | **1,500 g**（1/7 scale） | ~50 g | **30x** |
| `2024/1/8 発売予定 トレーディングカード` | **1,300 g**（1/8 scale） | ~50 g | **26x** |
| `ねんどろいど 初音ミク 初回限定CD付き` | **100 g**（cd） | 439 g | 1/4 |
| `compact disc player Sony` | **100 g**（cd） | ~2,000 g | 1/20 |
| `袴 単品 男性用` / `剣道 袴 27号` | 1,500 g（hakama、**1文字トークン「袴」**） | — | 誤爆源 |
| `杖 ステッキ 木製 高齢者用` | **2,000 g**（bokuto、**1文字トークン「杖」**） | — | 誤爆 |
| `ジュース 700ml ペットボトル 24本` | **1,420 g**（sake-720ml） | ~17,000 g | 1/12 |
| `Vinyl sticker 10 sheets` | **270 g**（lp） | ~30 g | 9x |
| `SSR ウマ娘 缶バッジ 未開封` | 50 g（single-card、"ssr"） | ~30 g | 軽微 |
| `空手着 上下セット 女児 120cm` | 2,500 g（大人用の値） | — | サイズ非対応 |
| `1/6 ドール 服` | **1,800 g**（1/6 scale figure） | ~100 g | **18x** |
| `OBI 帯のみ` | 400 g（budo-obi）※レコードの帯 | ~5 g | 80x |
| `snack box japan` | 90 g（snack-sweets） | — | 誤爆 |

日付・締切・比率としての `1/4` `1/6` `1/7` `1/8` はすべて `matches()` を通る。
`(?<![a-z0-9])1/7(?![a-z0-9])` は直前が `/` や `【` なら境界とみなすため、
`2024/1/8` の `1/8` に当たる。**フィギュアのスケール表記は前に「1/7スケール」等の語を要求すべき。**

1文字・2文字の CJK トークンは `ASCII.test` が false なので **境界チェックなしの部分一致**になる。
該当するもの: `袴`(hakama 1,500g), `杖`(bokuto 2,000g), `餅`(snack 90g), `鍔`(200g),
`そば`(122g), `丸五`(830g), `醤油`(484g), `道糸`(87g), `下衣`(2,100g), `小手`(2,000g), `胴台`(2,000g)。

### 取りこぼし

| タイトル | 結果 | 問題 |
|---|---|---|
| `psa10 charizard` | **null** | 実際の出品は `PSA10` と詰めて書く。`psa` の後ろの数字で境界に落ちる |
| `BGS9.5 リザードン` | **null** | 同上 |
| `フィギュア 初音ミク 未開封` | **null** | **`figures` カテゴリに日本語の総称トークンが1つも無い**（ねんどろいど/ポップアップパレードのみ）。ヤフオク・メルカリの大半の出品が当たらない |
| `ドラゴンボール 一番くじ フィギュア A賞` | **null** | 同上 |
| `Nintendo Switch 本体` / `iPhone 15 Pro ケース` / `grand piano Yamaha` / `カシオ 電卓` | null | カテゴリ自体が無い。段に落ちるので安全側 |

取りこぼしは段（bands）に落ちるので **安全側**。危険なのは誤爆のほう
（1つの数字が「確定した重量」として表示され、`hasUnknownWeight` が false になり段の表が消える）。

### `resolveWeight` の副次的な確認

```ts
resolveWeight('completely unknown thing', 'figures')  // { grams: 1000, tier: 'estimate', ... }
resolveWeight('', 'sneakers')                          // { grams: 750, tier: 'estimate', ... }  ← 空文字で 750g
resolveWeight('completely unknown thing', 'no-such')   // { grams: null, tier: 'none', ... }     ← 落ちない
```
空タイトルでもカテゴリを渡せば数字が出る。今はアプリから呼ばれないが、経路が開けば不変条件4に触れる。

---

## 6. その他の指摘（軽微）

| # | 内容 |
|---|---|
| C1 | `buyee:consolidated` と `buyee:default` が **同じ順位表の別行として競合**する。3点 US で consolidated が3位、default が6位。`rank`/`diff` は「社の比較」ではなく「行の比較」になっている。`rankStable` も行 id 比較なので、Buyee の2変種が入れ替わっただけで「不安定」と出る |
| C2 | Jauce の梱包 `¥120/kg` を **梱包後重量**（`grossG` 後）に掛けている。600g の商品が `ceil(1020/1000)=2` kg 課金で ¥540。商品重量なら ¥420。差 ¥120 は **我々の梱包仮定だけで生まれる**。`services.ts` の note にも「¥300 per parcel + ¥120/kg」としか書いておらず、切り上げ単位も未記載。原文未確認 |
| C3 | FOB 国の VAT ベースが `itemsYen + emsYen`（国内送料を含まない）なのに、`declared`（免税判定）は `itemsYen` のみ。同じ「FOB」の語で2つの違うベースを使っている。CIF 国は `cif` と `cif + dutyYen` の2つ。4通りのベースがコメント無しで並んでいる |
| C4 | `approximate` は EMS 行の `tier: 'estimate'` がハードコードなので **常に true**。7カ国 × 3重量 × 確定価格 × 確定国内送料でも false にならない。画面の `~` は情報を持たない |
| C5 | `CompareResult.totalRangeYen` は `bands.flatMap(b => b.rows.map(r => r.total))` の min/max、つまり **「最軽量の最安社」〜「最重量の最高社」**。1点 US で `[10648, 28334]`。どの社を選んでも取りうる幅ではない。`compare.test.ts` 以外から参照されていない（死んだフィールド） |
| C6 | `buyee:default` の EMS note に段が無い（`zone 4, 3 parcels, published rate`）。他社は `1 parcel, 2.5 kg step` と段が出る。個口が複数のときだけ段の情報が落ちる |
| C7 | `rowDiffRange` は段ごとの「その段の1位との差」の min/max。段によって1位が変わると **基準の違う差を混ぜる**。1点 US の Neokyo は `[0, 100]`（5kg 段でだけ2位）で、値は正しいが意味が段ごとに変わる |
| C8 | 同額タイの扱い: `cheapest: r.total === low` なので **同額が2行あれば両方 cheapest = true**（rank は 1 と 2）。現行の料金表では同額に到達する入力を見つけられなかったので未検証 |
| C9 | `freeShipping: true` と `domesticShippingYen: 1200` を両方与えると **freeShipping が勝つ**（安い方向）。データが矛盾したとき安いほうに倒れるのは、このツールの姿勢と逆 |
| C10 | 死んだ経路: `emsMarkup !== 0`（全社 0）、`packingLine` の2個口目以降（個口が増えるのは Buyee だけで packing が null）、`deposit` × 複数個口、`resolveWeight` のカテゴリ fallback。いずれもテストが通っているだけで実行されていない |

---

## 7. 落ちた・NaN・負値が出たケース（一覧）

| 入力 | 結果 | UI から到達可能か |
|---|---|---|
| 例外で落ちた入力 | **なし**（全ケースで `compare()` は返る） | — |
| `weightG: NaN` | 総額に `NaN` が2行、順位が入力順のまま | 不可（`toYen` が数字のみ） |
| `weightG: Infinity` | Neokyo `Infinity`、Jauce `NaN`、他は有限で1位が付く | 不可 |
| `priceYen: NaN` | **全5行 NaN**、順位は入力順 | 不可（`ManualAdd` が `p > 0 && isFinite` を要求） |
| `priceYen: -100000` | 全行が負の総額、1位 `jauce=-102895` | 不可 |
| `qty: -3` | 全行が負の総額 | 不可（UI は `Math.max(1, qty-1)`） |
| `weightG: 1e9` | 総額 ¥180,044,578（EMS は ¥39,100 のまま） | **可**（重量欄に打てる） |
| `weightG: 20000` | EMS ¥39,100（実際の 24kg 相当料金より数万円低い） | **可** |
| `qty: 0` | 「0 items」に ¥5,803〜¥7,103 の総額 | 不可（現行 UI のみ） |
| `items: []` | 空の結果、例外なし | 可 |

**負値・NaN はすべて `compare()` の入口に検査が無いことに由来する。**
現行 UI の入力ガードに全面的に依存しており、`compare()` 自体は公開 API として無防備。

---

## 8. 検証に使ったコマンド

```
npx vitest run                                   # 174 passed / 7 files
npx tsx --tsconfig tsconfig.json /tmp/probe/t*.ts
```

主な走査:
- EMS 段: `net` 0〜13,000 g を 1g 刻み（段飛ばし 0、未到達段 0）
- 免税限度: DE/FR ¥18,000〜21,000、GB ¥15,000〜30,000、CA ¥1,000〜4,000、SG ¥40,000〜60,000、AU ¥90,000〜110,000 を ¥1 刻み
- 順位頑健性: 7カ国 × 価格2 × 重量10 × 点数2 × 倍率 0.34〜5.00（0.02刻み）＝ 65,520 通り
- 1位入替の閾値: 重量 100〜9,000 g（5点）/ 100〜20,000 g（1点）を 10 g 刻み
- `resolveWeight`: 60タイトル（日英混在・日付・型番・誤爆狙い）
