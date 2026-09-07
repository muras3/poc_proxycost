# ③ 宅配便の料金を取る ── 依頼用プロンプト

**この文書はそのまま作業者に渡せる形で書いてある。**渡す相手は、自分のPCでブラウザが使える人／エージェント（Cowork など）。

`docs/O2-CALCULATOR-RUN.md` のフェーズ3にあたる。**やり方が変わったので別文書にした**——画面の数字を書き写すのではなく、**計算機が呼んでいる API の応答 JSON をそのまま保存する。**

---

## この作業で決まること

`poc_proxycost` は代行5社（Buyee / ZenMarket / Neokyo / FROM JAPAN / Jauce）経由で日本の商品を7カ国へ送るときの**総額**を予測して比較するサイト。**いま日本郵便の5方式しか価格化していない。宅配便は1円も出していない。**

リポジトリが持っている実請求データの言及数は **FedEx 12 / EMS 11 / UPS 7 / DHL 7**。
**実際の発送のおよそ半分が宅配便で、その 0% を我々は価格化していない。**

この作業で決まるのは3つ。

| # | 何を決めるか | なぜ効くか |
|---|---|---|
| **1** | **寸法を渡さなくても額が出る便はどれか** | 出るなら**日本郵便と同じ形でそのまま価格化できる。**我々の入力に寸法は無い |
| **2** | **寸法で額がどう変わるか（容積重量の除数）** | 除数が分かれば、**箱を仮定して**全便を価格化できる。既に梱包後重量を `round(net×1.2+300)` と仮定しているのと同じ性質の仮定 |
| **3** | 各便の寸法制限・重量上限 | 「送れない」を「高い」と間違えないため。応答が `cm` で返してくる |

**1 だけでも価値がある。1→2→3 の順にやって、途中で止めてよい。**

---

## やってはいけないこと

- **アカウントを作らない。ログインしない。**計算機は公開されており、登録なしで使える
- **何も購入しない。**カートに入れる操作すら不要
- **CAPTCHA を回避しない。**出たらそこで止めて報告する
- **各社の利用規約を先に読む。****自動アクセス・スクレイピングの禁止が書かれていたら、その社では下の「一括取得」をやらない。**手で数回入力するところまでに留めるか、その社を飛ばす。**判断が付かなければ止めて報告**
- **間隔を空ける。**下のスクリプトは1.5秒待つようにしてある。**短くしない**
- **見えた数字を丸めない・換算しない。**JSON をそのまま保存する

---

## ZenMarket ── 呼び口が判明している唯一の社

### 分かっていること（2026-09-07 確認）

計算機のページ: `https://zenmarket.jp/calc.aspx`
そのページの JS（`https://zenmarket.jp/js/calc.js`）が叩いている先:

```
POST https://zenmarket.jp/calc.aspx/Calculate
Content-Type: application/json

{"weight":"600","country":"DE","width":"","height":"","depth":"","totalPrice":""}
```

- `weight` … グラム。文字列
- `country` … `US` / `GB` / `DE` / `FR` / `AU` / `CA` / `SG`
- `width` / `height` / `depth` … **センチ。空文字でよい**（画面でも「optional」）
- `totalPrice` … 商品代。空文字でよい

応答は ASP.NET の形で `{"d": "<JSON文字列>"}`。`d` をもう一度パースすると**便ごとの配列**になり、少なくともこれらを持つ:

| フィールド | 中身 |
|---|---|
| `Service` | 便の ID（数値） |
| `Price` | **円。数値** |
| `PriceSpan` | 表示用の整形済み文字列 |
| `Weight` | 投げた重量のエコー |
| `MaxWeight` / `MaxPriceLimit` | その便の上限 |
| `ShippingLimitsParamAInCm` / `BInCm` / `CInCm` | **寸法制限（cm）** |
| `ShippingLimitsCalculationScheme` | 制限の当て方（0/1/2 のどれか） |
| `Notes` / `TaxInfo` | 注記 |

**`Service` は数値 ID で、社名が入っていない。**画面側は `#sm<Service>` という要素に額を入れる。だから**ID と便名の対応表を、画面から目視で取ること**（下の手順1）。

画面に出ている便（2026-09-07）:
`DHL eC (Packet Plus, about 3 weeks)` / `UPS (2-6 days)` / `FedEx (2-6 days)` / `FedEx LowCost (3-7 days)` / `DHL (GREEN+) (2-6 days)` / `SF EXPRESS (3-5 days)` / `EMS` …

**注目**: 画面は UPS・FedEx・FedEx LowCost・DHL(GREEN+)・SF EXPRESS の5便に
「**Price depends on parcel dimensions**」と書いている。**DHL eC (Packet Plus) だけこの注記が無い。**
→ 手順2の「決定実験」はこれが本当かを確かめる。

### 手順1 ── 便 ID の対応表を作る（目視・5分）

1. `https://zenmarket.jp/calc.aspx` を開く
2. 重量に `600`、国に `Germany` を入れる
3. 額が出たら、**開発者ツールで各額の要素の id を読む**。`total17` のように末尾が `Service` の ID
4. **`ID → 画面の便名` を書き出す**。例: `17 → DHL eC (Packet Plus)`

**これが無いと、集めた JSON がどの便のものか分からない。最優先。**

### 手順2 ── 決定実験（4回・寸法が効くかを確かめる）

同じページを開いたまま、**開発者ツールのコンソール**で:

```js
const call = async (weight, country, w, h, d) => {
  const r = await fetch('/calc.aspx/Calculate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ weight: String(weight), country, width: w, height: h, depth: d, totalPrice: '' }),
  });
  return JSON.parse((await r.json()).d);
};

// 重量は同じ。箱だけ小さい／大きい。
const compact = await call(600, 'DE', '20', '15', '10');   //  3,000 cm3
const bulky   = await call(600, 'DE', '60', '50', '40');   // 120,000 cm3
const blank   = await call(600, 'DE', '', '', '');          // 寸法なし
console.log(JSON.stringify({ blank, compact, bulky }, null, 1));
```

**読み方（ここが本題）:**

| 観測 | 意味 |
|---|---|
| `compact` と `bulky` の `Price` が**同じ** | その便は**実重量課金**。寸法は要らない。**そのまま価格化できる** |
| `bulky` だけ高い | **容積重量課金。**除数が要る（手順3） |
| `blank` が `compact` と同じ | 寸法未指定は**最小の箱**として扱われている |
| `blank` が `bulky` と同じ | 寸法未指定は**大きい箱**として扱われている。安全側 |
| `bulky` でその便が**消える** | 寸法制限を超えた。「高い」ではなく「送れない」 |

**この4回の結果だけで、依頼の目的1は達成される。ここで止めてよい。**

### 手順3 ── 容積重量の除数を求める（余力があれば）

FedEx / UPS / DHL は一般に `L×W×H(cm) ÷ 5000` を kg として扱い、実重量と大きいほうで課金する。
**それが本当か、除数が 5000 か 6000 かを、この計算機で直接確かめられる。**

```js
// 実重量 600g 固定。箱を少しずつ大きくして、額が上がる境目を探す。
for (const cm of [20, 25, 30, 35, 40, 45, 50]) {
  const r = await call(600, 'DE', String(cm), String(cm), String(cm));
  console.log(cm + 'cm cube =', (cm ** 3), 'cm3 →',
    r.map(s => s.Service + ':' + s.Price).join(' '));
  await new Promise(s => setTimeout(s, 1500));
}
```

額が跳ねた立方体の体積を除数で割ると、その便の重量段に一致するはず。
**一致しなければ我々の仮説（÷5000）が間違っているということで、それ自体が結果。**

### 手順4 ── 一括取得（**規約を確認してから**）

**利用規約に自動アクセスの禁止が無いことを先に確かめる。**あれば手順3で止める。

```js
const OUT = [];
const COUNTRIES = ['US', 'GB', 'DE', 'FR', 'AU', 'CA', 'SG'];
const WEIGHTS = [500, 1000, 2000, 5000, 10000];
const BOXES = [
  { w: '', h: '', d: '' },            // 寸法なし
  { w: '30', h: '20', d: '15' },      //   9,000 cm3
  { w: '50', h: '40', d: '30' },      //  60,000 cm3
];
for (const country of COUNTRIES) {
  for (const weight of WEIGHTS) {
    for (const b of BOXES) {
      try {
        OUT.push({ country, weight, box: b, services: await call(weight, country, b.w, b.h, b.d) });
      } catch (e) {
        OUT.push({ country, weight, box: b, error: String(e) });
      }
      await new Promise(s => setTimeout(s, 1500));   // **短くしない**
    }
  }
}
console.log('collected', OUT.length, 'of 105');
copy(JSON.stringify(OUT));   // クリップボードに入る。ファイルに貼って渡す
```

105 回 × 1.5 秒 ＝ **約 4 分**。途中で止まってもそこまでを渡してよい（`error` の行も残る）。

---

## 他の4社 ── 呼び口を探すところから

**ZenMarket 以外は、計算機の場所も呼び口も未確認。**探し方は同じ:

1. その社の計算機／見積ページを開く
2. **開発者ツールの Network タブを開いてから**、重量と国を入れる
3. **XHR / Fetch に出てきたリクエスト**を見る。それが呼び口
4. 右クリック →「Copy as fetch」でそのままコンソールに貼れる
5. あとは ZenMarket と同じ

| 社 | 分かっていること |
|---|---|
| **Neokyo** | `https://neokyo.com/en/shipping-rates-estimate` に `?weight=600&country_to=DE` を付けると URL だけで結果が出る（2026-09-07 確認）。**ただし宅配便が出るかは未確認** |
| **Buyee** | 配送方法ページ `buyee.jp/helpcenter/guide/shipping-method?lang=en` の各方式の欄に `→International Shipping Fee Estimation` のリンクがある |
| **FROM JAPAN** | 未確認 |
| **Jauce** | 未確認 |

**見つからない社があったら、探した URL と結果を書いて報告する。「無い」ことも結果。**

---

## 出力の形

**1社 = 1ファイル。**`evidence/o2-courier-<company>-2026-09-XX.json`

```jsonc
{
  "company": "zenmarket",
  "checked_on": "2026-09-XX",
  "endpoint": "POST https://zenmarket.jp/calc.aspx/Calculate",
  "tos_checked": "https://zenmarket.jp/... — 自動アクセスの禁止は無かった／あった",
  "service_id_map": {          // 手順1の対応表。**これが無いと他が読めない**
    "17": "DHL eC (Packet Plus)",
    "20": "FedEx"
  },
  "dimension_probe": { "blank": [], "compact": [], "bulky": [] },   // 手順2の生 JSON
  "divisor_probe": [],          // 手順3。やっていなければ空
  "grid": []                    // 手順4の OUT。やっていなければ空
}
```

**JSON を加工しない。**フィールドを削らない、名前を変えない、円を換算しない。
**我々が読めなかったフィールドこそ、我々がまだ知らないことを持っている。**

---

## 報告

1. 上のファイル（社ごと）
2. **手順2の答えを、社ごとに1行で。これが最重要:**
   - `ZenMarket: 寸法なしで額が出る便 = DHL eC のみ / 他5便は bulky で +N円`
   - `Buyee: 計算機に宅配便が出ない`
3. **やってみて分かった障害**（規約に禁止があった・CAPTCHA・呼び口が見つからない など）。**これも成果**

---

## 補足：なぜ「画面を読む」から「JSON を保存する」に変えたのか

前の依頼文（`O2-CALCULATOR-RUN.md`）は「画面の数字を書き写す」形だった。**それだと105回の目視転記になり、しかも画面に出ていない情報（寸法制限・上限・便の内部 ID）が落ちる。**

呼び口が判明したので、**1回の呼び出しで全便の全フィールドが構造化されたまま取れる。**転記ミスがゼロになり、我々が今は使わないフィールドも将来のために残る。

そして**「料率が非公開だから宅配便は価格化できない」という我々の結論は間違っていた。**
公表された料金表が無いのは事実だが、**関数としては公開されていて評価できる。**
表を持っていなくても、十分な点を取れば形は決まる（Jauce の船便の上乗せ `+¥250/kg段` は
実測3点から決めた。同じ手が使える）。
