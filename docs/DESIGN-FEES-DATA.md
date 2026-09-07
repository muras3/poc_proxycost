# 料金表のデータ設計（重量パイプラインに揃える）

作成日 2026-09-07 / 対象ブランチ `claude/automated-income-schemes-uzn8zw-rh3uwh`
状態: **設計のみ。実装はしていない。** 本文中の JSON・TS は形の提案であり、リポジトリにはまだ無い。

読んだもの: `src/data/weights.ts`（先頭と型）、`data/weights/index.json`、`data/weights/figures.json`、
`scripts/weights-build.ts`、`src/lib/pricing/services.ts`（作業ツリー版 412 行。HEAD 版 388 行に別エージェントの
コメント追記が入っている途中）、`scripts/fees-check.ts`、`data/fee-pages.json`、`docs/audit/fees.md`、
`docs/COMPLETENESS.md`、`REQUIREMENTS.md`、`docs/UI-DESIGN.md` §6、`src/lib/pricing/{compare,types,shops,deeplink}.ts`、
`src/lib/search/sites.ts`、`src/components/sources/FeeTable.tsx`、`src/app/sources/page.tsx`、`e2e/`、`.github/workflows/`。

---

## 0. 要旨（決めたこと）

1. **原本は JSON、生成物は TS。** `data/fees/<service>.json` を 5 本、`data/sites.json` を 1 本置き、
   `scripts/fees-build.ts` が `src/data/fees.ts`・`src/data/sites.ts`・`data/fees/index.json` を出す。
   重量の `data/weights/*.json → scripts/weights-build.ts → src/data/weights.ts` と同じ 3 層。
2. **数字は必ず「figure」の形で持つ。** figure ＝ 値 ＋ tier ＋ evidence。evidence ＝ 出典 URL ＋
   **原文の引用（quote）** ＋ 確認日 ＋（写しから読んだなら）採取日。生の数字をデータに書く場所は無い。
3. **fees-check は「引用がページに残っているか」を見る。** ハッシュは補助に格下げ。引用が消えたら
   「どのファイルのどの figure が根拠を失ったか」を JSON パスで指す。**数字は読み取らない。直すのは人間。**
4. **サイト依存の額は全域型。** `bySite: Record<SiteId, figure名 | 'unknown'>`。既定値・フォールバック・
   ワイルドカードは持たない。`SiteId` は `data/sites.json` から生成し、`types.ts` は再エクスポートに変える。
5. **「知らない」は 3 通りに分けて全部データに書く。** 費目単位の `unknown`／サイト単位の `unknown`／
   その社がそのサイトを扱わない `not-supported`。どれも画面では `—` と `excluded` に出し、
   **必ず発生する費目**（サービス料）が unknown の行は順位から外す。
6. **ビルドは検証と書き出しだけ。** 重量ビルドの denylist のようなデータ加工層は持たない。
7. **移行は 6 段。** 並走 → 等価テスト → 差し替え → 監視の付け替え → 消費側の切替 → 20 サイト化。
   各段の完了条件は §5。

---

## 1. 決めた設計

### 1.1 ファイル配置

```
data/
  sites.json                 ← 検索対象サイトの台帳。SiteId の唯一の出所（§1.2）
  fees/
    neokyo.json              ← 社ごとの原本（§1.3）
    zenmarket.json
    fromjapan.json
    buyee.json
    jauce.json
    index.json               ← 生成物。要約・unknown 一覧・出典 URL 一覧（§1.5.3）
  fee-pages.json             ← 監視の記録（現状維持。形は変えない）
  proxy-sites.json           ← 各社が「対応」と公表するサイト名の機械抽出と、名前→SiteId の人手対応表（既存。§1.2.1）

scripts/
  sites-build.ts             ← data/sites.json → src/data/sites.ts
  fees-build.ts              ← data/fees/*.json → src/data/fees.ts + data/fees/index.json
  fees-check.ts              ← 監視（§1.8。原本 JSON を直接読む）
  lib/fees-data.ts           ← 原本の読み込みと検証。build と check が同じ関数を使う

src/data/
  sites.ts                   ← 生成物。SITE_IDS / SiteId / SITES
  fees.ts                    ← 生成物。型と FEE_SERVICES

src/lib/pricing/
  types.ts                   ← SiteId を `@/data/sites` から再エクスポート（他は現状維持）
  services.ts                ← 移行中は「生成物 → 既存 Service 形」への写像だけ。最終的に消えるか薄い lookup になる
```

`npm run` は `sites:build`・`fees:build`・`fees:check` を足し、`data:build`（両 build）をまとめる。

### 1.2 原本: `data/sites.json`

サイトの識別子・ホスト名・出品の性質を 1 か所に置く。**料金の知識は入れない**
（現状 `src/lib/search/sites.ts` の `jauceFree` は Jauce の料金であって、サイトの属性ではない。§3 制約5）。

```json
{
  "checkedOn": "2026-09-06",
  "sites": [
    {
      "id": "yahoo-auctions",
      "name": "Yahoo! Auctions",
      "labelDomain": "auctions.yahoo.co.jp",
      "hosts": ["auctions.yahoo.co.jp"],
      "listing": ["^(?:page\\.)?auctions\\.yahoo\\.co\\.jp\\/(?:jp\\/)?auction\\/[a-z]?\\d+"],
      "kind": "auction",
      "shopModel": "per-listing"
    },
    {
      "id": "rakuten",
      "name": "Rakuten",
      "labelDomain": "rakuten.co.jp",
      "hosts": ["item.rakuten.co.jp", "rakuten.co.jp"],
      "kind": "fixed",
      "shopModel": "shop-in-path"
    },
    {
      "id": "suruga-ya",
      "name": "Suruga-ya",
      "labelDomain": "suruga-ya.jp",
      "hosts": ["suruga-ya.jp"],
      "kind": "fixed",
      "shopModel": "single-shop"
    },
    {
      "id": "other",
      "name": "Other shop",
      "labelDomain": "unknown site",
      "hosts": [],
      "kind": "fixed",
      "shopModel": "unknown"
    }
  ]
}
```

- `shopModel` は現在 `shops.ts` の `SINGLE_SHOP_SITES` / `PER_LISTING_SITES` と rakuten/yahoo-shopping の分岐に
  散っている知識。`'single-shop' | 'per-listing' | 'shop-in-path' | 'unknown'`。サイトを足したときに
  「Buyee の同一店舗まとめが黙って点ごとに戻る」（`shops.ts` 冒頭が自分で警告している事故）を、
  台帳の必須欄にして防ぐ。
- `labelDomain` は `ItemList.tsx` の `SITE_NAMES`、`name` は `FeeTable.tsx` の `SITE_LABEL` と
  `search/sites.ts` の `name` に相当。**現状 3 か所に同じ表がある。** 生成物 `SITES` から引くようにして 1 か所にする。
- `listing` は作業ツリーの `search/sites.ts` に 2026-09-07 に増えた `Site.listing: RegExp[]`（一覧ページを候補から落とす
  正規表現）。JSON では文字列で持ち、`sites:build` が `new RegExp(s, 'i')` でコンパイルできることを検査してから TS に
  リテラルとして書き出す。空配列＝「形を確かめていない＝落とさない」の意味は現行どおり。
- `other` は台帳の一員として残す（URL から判定できなかった出品の受け皿）。`hosts: []`・`listing: []` 固定をビルドが検査する。

#### 1.2.1 `data/proxy-sites.json` との関係（既に存在する）

別エージェントが 2026-09-07 に置いた `data/proxy-sites.json` は、(a) `sources`: 各社の一次情報（Jauce のヘッダタブ、
Neokyo の shop-list、FROM JAPAN の翻訳ファイル等）から**機械抽出した表示名とリンク先**、(b) `known`: 表示名 → host → `siteId`
の**人手の対応表**（`siteId: null` は未追加または「サイトではない」）を持つ。`scripts/lib/proxy-sites.ts` の冒頭が
「取得と抽出だけ。判断はしない」と宣言しており、この設計と同じ線を引いている。役割分担:

| 事実 | どこに書くか | 誰が書くか |
|---|---|---|
| その社のページに今どんな名前が並んでいるか | `proxy-sites.json#/sources`（監視の記録。fee-pages.json と同じ作法） | スクリプト |
| その名前がどの host / SiteId か | `proxy-sites.json#/known` | 人 |
| その社が SiteId を扱うか（`support`） | `data/fees/<service>.json#/sites`（料金の原本。evidence つき） | 人 |
| その社のその SiteId の料率 | 同 `#/charges/*/bySite` | 人 |

`fees:build` の追加検査 **V13**: `known` で `siteId` が付いた表示名が、ある社の `sources[].labels` に出ているのに、その社の
`sites[siteId].support` が `'no'` なら止める（社が自分で「扱う」と並べている名前を、料金側が「扱わない」と書いている）。
逆（`support: 'yes'` なのに一覧に無い）は止めない——一覧は nav の抜粋で網羅ではないから。`known` に host があって
`siteId: null` の行（今なら `paypayfleamarket.yahoo.co.jp`）は「台帳に足す候補」で、`index.json` の `candidateSites` に列挙する。
これが Phase 6 の入力になる。

### 1.3 原本: `data/fees/<service>.json`

原則:

- **数字は figure でしか書けない。** figure は `{ yen | rate | value, tier, evidence }`。
- **evidence は原文の引用を持つ。** `tier: 'fixed'` なら `quote` 必須、URL は社自身のホスト。
- **サイトに依存する額は全サイトぶん書く。** `bySite` のキーは `data/sites.json` の全 id。抜けはビルドが止める。
- **費目は決められた鍵の全部について何か言う。** `charged` / `not-charged` / `unknown` のどれか。無言は許さない。
- 説明が要るところは `note`（英語、画面に出る）と `why`（日本語、画面に出ない、書いた人の判断理由）。
  services.ts の `//` コメントに埋まっている判断は `why` に移す。

#### 1.3.1 全文例: ZenMarket のサービス料（実在の原文から）

出典: 料金ページの Wayback 2026-07-25 写し
`https://web.archive.org/web/20260725075657/https://zenmarket.jp/en/fees.aspx`（`docs/COMPLETENESS.md` §0 で 2026-09-06 に読了。
直アクセスは Cloudflare の 403）。入金手数料の「from 1%」は Arquivo.pt 2025-11-27 写し（作業ツリーの services.ts が
2026-09-06 読了と記録）。実請求 ¥10,363 は `docs/DESIGN-NOTES.md` §3。

```json
{
  "id": "zenmarket",
  "name": "ZenMarket",
  "url": "https://zenmarket.jp/",
  "feePage": "https://zenmarket.jp/en/fees.aspx",

  "sites": {
    "yahoo-auctions": { "support": "yes", "evidence": { "$ref": "#/evidence/marketplace" } },
    "mercari":        { "support": "yes", "evidence": { "$ref": "#/evidence/marketplace" } },
    "rakuten":        { "support": "yes", "evidence": { "$ref": "#/evidence/standard" } },
    "amazon-jp":      { "support": "yes", "evidence": { "$ref": "#/evidence/standard" } },
    "yahoo-shopping": { "support": "unknown" },
    "suruga-ya":      { "support": "unknown" },
    "mandarake":      { "support": "unknown" },
    "zozo":           { "support": "unknown" },
    "hmv":            { "support": "unknown" },
    "toranoana":      { "support": "unknown" },
    "other":          { "support": "unknown" }
  },

  "evidence": {
    "standard": {
      "url": "https://zenmarket.jp/en/fees.aspx",
      "archiveUrl": "https://web.archive.org/web/20260725075657/https://zenmarket.jp/en/fees.aspx",
      "capturedOn": "2026-07-25",
      "checkedOn": "2026-09-06",
      "quote": "standard fee of 500 yen … Amazon, Rakuten, and most other stores"
    },
    "marketplace": {
      "url": "https://zenmarket.jp/en/fees.aspx",
      "archiveUrl": "https://web.archive.org/web/20260725075657/https://zenmarket.jp/en/fees.aspx",
      "capturedOn": "2026-07-25",
      "checkedOn": "2026-09-06",
      "quote": "800 yen … all Mercari items and JDirectItems Auction bids"
    },
    "same-item-once": {
      "url": "https://zenmarket.jp/en/fees.aspx",
      "archiveUrl": "https://web.archive.org/web/20260725075657/https://zenmarket.jp/en/fees.aspx",
      "capturedOn": "2026-07-25",
      "checkedOn": "2026-09-06",
      "quote": "If you buy 3 identical T-shirts, our service fee will still be the same"
    },
    "packing-free": {
      "url": "https://zenmarket.jp/en/fees.aspx",
      "archiveUrl": "https://web.archive.org/web/20260725075657/https://zenmarket.jp/en/fees.aspx",
      "capturedOn": "2026-07-25",
      "checkedOn": "2026-09-06",
      "quote": "You never pay: … for initial packing and consolidation"
    },
    "deposit-from-1pct": {
      "url": "https://zenmarket.jp/en/fees.aspx",
      "archiveUrl": "https://arquivo.pt/wayback/20251127000000/https://zenmarket.jp/en/fees.aspx",
      "capturedOn": "2025-11-27",
      "checkedOn": "2026-09-06",
      "quote": "Funds Deposit Fee (from 1%)"
    }
  },

  "charges": {
    "service-fee": {
      "status": "charged",
      "basis": {
        "value": "per-distinct-item",
        "tier": "fixed",
        "evidence": { "$ref": "#/evidence/same-item-once" }
      },
      "figures": {
        "standard":    { "yen": 500, "tier": "fixed", "evidence": { "$ref": "#/evidence/standard" } },
        "marketplace": { "yen": 800, "tier": "fixed", "evidence": { "$ref": "#/evidence/marketplace" } }
      },
      "bySite": {
        "yahoo-auctions": "marketplace",
        "mercari":        "marketplace",
        "rakuten":        "standard",
        "amazon-jp":      "standard",
        "yahoo-shopping": { "figure": "standard", "why": "原文の「most other stores」に含めた。名指しはされていない" },
        "suruga-ya":      { "figure": "standard", "why": "同上" },
        "mandarake":      { "figure": "standard", "why": "同上" },
        "zozo":           { "figure": "standard", "why": "同上" },
        "hmv":            { "figure": "standard", "why": "同上" },
        "toranoana":      { "figure": "standard", "why": "同上" },
        "other":          { "figure": "standard", "why": "同上" }
      },
      "note": "¥300 at ZenMarket Recommended Stores — not detected here",
      "why": "推奨店は店舗単位の区分で、このモデルの粒度（サイト）では表せない。表示で開示するに留める（COMPLETENESS T4）"
    },
    "purchase-fee":      { "status": "not-charged", "why": "点ごとの service-fee の社。注文単位の費目は原文に無い" },
    "protection-plan":   { "status": "not-charged", "why": "原文に無い" },
    "ad-valorem":        { "status": "not-charged", "why": "原文に無い" },
    "bank-fee":          { "status": "not-charged", "why": "原文に無い" },
    "payment-inside-jp": { "status": "not-charged", "why": "原文に無い" },
    "packing": {
      "status": "not-charged",
      "evidence": { "$ref": "#/evidence/packing-free" }
    },
    "deposit": {
      "status": "charged",
      "flatYen": { "yen": 0, "tier": "fixed", "evidence": { "$ref": "#/evidence/deposit-from-1pct" } },
      "rate": {
        "rate": 0.035,
        "tier": "estimate",
        "evidence": {
          "url": "https://nyamo.life/archives/zenmarket.html",
          "checkedOn": "2026-09-06",
          "quote": null,
          "reasoning": "公表値は「from 1%」だけで支払方法ごとの率が無い。3.5% は台湾の利用者が公開した実請求 ¥10,363 から 10000/(1-0.035)=10362.7 と逆算した我々の推定"
        }
      },
      "method": { "value": "gross-up", "tier": "estimate", "evidence": { "$ref": "#/charges/deposit/rate/evidence" } },
      "note": "3.5% of the whole payment — the page says only \"from 1%\""
    }
  },

  "domesticIncluded": { "value": false, "tier": "fixed", "evidence": { "$ref": "#/evidence/standard" },
                        "why": "サービス料の説明に国内送料は含まれない" },

  "parcels": {
    "default": { "value": "one", "tier": "estimate",
                 "evidence": { "url": "https://zenmarket.jp/en/fees.aspx", "checkedOn": "2026-09-06", "quote": null,
                               "reasoning": "「貯めて1個口」型と読めるが、既定を明言した文を取れていない" } },
    "consolidationOnRequest": { "value": false, "tier": "estimate", "evidence": { "$ref": "#/parcels/default/evidence" } }
  },

  "emsMarkup": {
    "rate": { "rate": 0, "tier": "estimate",
              "evidence": { "url": "https://zenmarket.jp/en/fees.aspx", "checkedOn": "2026-09-06", "quote": null,
                            "reasoning": "料金ページは国際送料を「Always pay」と書くだけ。実請求は1件が公表額と一致（R2 ¥2,700）、1件は一致せず（R3 ¥4,021）。docs/audit/reality.md §3.4" } }
  },

  "optional": [
    { "key": "photos", "label": "Extra photos",
      "amount": { "yen": 500, "tier": "fixed", "evidence": { "$ref": "#/evidence/standard" } }, "note": "per request" },
    { "key": "repack", "label": "Repacking",
      "amount": { "yen": 1000, "tier": "fixed", "evidence": { "$ref": "#/evidence/standard" } }, "note": "from ¥1,000 to ¥4,000" }
  ],

  "prepaidImportTax": {
    "US": { "status": "not-applicable", "why": "受取国側が売り手徴収を課していない（countries.ts の sellerCollectsBelow が無い）" },
    "GB": { "status": "not-applicable", "why": "同上" },
    "DE": { "status": "not-applicable", "why": "同上" },
    "FR": { "status": "not-applicable", "why": "同上" },
    "CA": { "status": "not-applicable", "why": "同上" },
    "AU": {
      "status": "collected",
      "rate": { "rate": 0.10, "tier": "fixed",
                "evidence": { "url": "https://zenmarket.jp/en/fees.aspx", "checkedOn": "2026-09-06",
                              "quote": "we are required to collect 10% GST for all parcels sent to Australia with a total value of 1,000 AUD or less" } },
      "base": { "value": "declared", "tier": "fixed",
                "evidence": { "url": "https://zenmarket.jp/en/fees.aspx", "checkedOn": "2026-09-06",
                              "quote": "GST will be applied to parcels where the declared value is equal to or lower than 1,000 AUD" } },
      "note": "10% of the declared value, charged with the international shipping fee"
    },
    "SG": { "status": "unknown", "why": "同ページに欧州 VAT の記載はあるがシンガポールの記載は無い" }
  },

  "paysUs": true,
  "referralNote": "pays us ¥100 if you sign up"
}
```

`optional` の photos/repack の evidence を `standard` に寄せているのは形を見せるための省略で、実装時は各額の文を引く。
`$ref` は JSON Pointer。同じ引用を何度も書かせないためで、ビルドが解決する（外部ファイルは参照できない）。

#### 1.3.2 抜粋: Jauce（従価・サイト別の額・ベータ無料・銀行手数料）

出典: `https://www.jauce.com/japan_auction_detail`（`docs/audit/fees.md` §5、2026-09-06 取得）。

```json
{
  "id": "jauce",
  "feePage": "https://www.jauce.com/japan_auction_detail",
  "sites": {
    "yahoo-auctions": { "support": "yes", "evidence": { "$ref": "#/evidence/auction" } },
    "rakuten":        { "support": "yes", "evidence": { "$ref": "#/evidence/beta-free" } },
    "yahoo-shopping": { "support": "yes", "evidence": { "$ref": "#/evidence/beta-free" } },
    "amazon-jp": {
      "support": "unknown",
      "evidence": { "url": "https://www.jauce.com/japan_auction_detail", "checkedOn": "2026-09-06",
                    "quote": "*Our Amazon Japan service is currently under maintenance and so is temporarily unavailable." },
      "why": "停止中。再開時の料金区分（ベータ無料か場外店舗か）も読めない"
    },
    "suruga-ya": { "support": "yes", "evidence": { "$ref": "#/evidence/offsite" } },
    "…": "…"
  },
  "evidence": {
    "auction":   { "url": "https://www.jauce.com/japan_auction_detail", "checkedOn": "2026-09-06",
                   "quote": "Jauce commission: JPY 400 per auction + 8% of the closing price" },
    "offsite":   { "url": "https://www.jauce.com/japan_auction_detail", "checkedOn": "2026-09-06",
                   "quote": "Fees for off-site stores — Service fee: JPY 1,000 + 8% over the item purchase price" },
    "beta-free": { "url": "https://www.jauce.com/japan_auction_detail", "checkedOn": "2026-09-06",
                   "quote": "Shopping fees for Online Shopping Malls — Service fee: FREE during the beta version" },
    "banking":   { "url": "https://www.jauce.com/japan_auction_detail", "checkedOn": "2026-09-06",
                   "quote": "Banking fee: JPY 300 flat per payment." },
    "packing":   { "url": "https://www.jauce.com/japan_auction_detail", "checkedOn": "2026-09-06",
                   "quote": "Smart Packing: JPY 300 per package + JPY 120/kg" }
  },
  "charges": {
    "service-fee": {
      "status": "charged",
      "basis": { "value": "per-unit", "tier": "fixed", "evidence": { "$ref": "#/evidence/auction" },
                 "why": "原文は per auction。同一オークションで複数個の扱いは記載なし（COMPLETENESS §8）" },
      "figures": {
        "auction":   { "yen": 400,  "tier": "fixed", "evidence": { "$ref": "#/evidence/auction" } },
        "offsite":   { "yen": 1000, "tier": "fixed", "evidence": { "$ref": "#/evidence/offsite" } },
        "beta-free": { "yen": 0,    "tier": "fixed", "evidence": { "$ref": "#/evidence/beta-free" } }
      },
      "bySite": {
        "yahoo-auctions": "auction",
        "rakuten":        "beta-free",
        "yahoo-shopping": "beta-free",
        "amazon-jp":      "unknown",
        "suruga-ya":      "offsite",
        "mandarake":      "offsite",
        "zozo":           "offsite",
        "hmv":            "offsite",
        "toranoana":      "offsite",
        "mercari":        "unknown",
        "other":          { "figure": "offsite", "why": "現行 services.ts の判断を引き継ぐ。原文が『場外店舗』の範囲を列挙していないので、Phase 5 で unknown に戻す候補" }
      }
    },
    "ad-valorem": {
      "status": "charged",
      "figures": { "eight": { "rate": 0.08, "tier": "fixed", "evidence": { "$ref": "#/evidence/auction" } },
                   "beta-free": { "rate": 0, "tier": "fixed", "evidence": { "$ref": "#/evidence/beta-free" } } },
      "bySite": { "yahoo-auctions": "eight", "rakuten": "beta-free", "yahoo-shopping": "beta-free",
                  "amazon-jp": "unknown", "mercari": "unknown", "suruga-ya": "eight", "…": "…" },
      "base": { "value": "item-price", "tier": "fixed", "evidence": { "$ref": "#/evidence/auction" },
                "why": "「8% of the closing price」。計算例（落札 50,000 → 手数料 4,400）とも一致。送料は含まない" }
    },
    "bank-fee": {
      "status": "charged",
      "amount": { "yen": 300, "tier": "fixed", "evidence": { "$ref": "#/evidence/banking" } },
      "basis": { "value": "per-order", "tier": "estimate",
                 "evidence": { "url": "https://www.jauce.com/japan_auction_detail", "checkedOn": "2026-09-06", "quote": null,
                               "reasoning": "原文は「出品者×日ごとに1回」。注文ごとで近似しており、これは上限側に外す" } },
      "note": "¥300 per payment — once per seller per day"
    },
    "packing": {
      "status": "charged",
      "perParcelYen": { "yen": 300, "tier": "fixed", "evidence": { "$ref": "#/evidence/packing" } },
      "perKgYen":     { "yen": 120, "tier": "fixed", "evidence": { "$ref": "#/evidence/packing" } },
      "freeUpToG":    { "value": 0,  "tier": "fixed", "evidence": { "$ref": "#/evidence/packing" } },
      "mandatory":    { "value": true, "tier": "fixed",
                        "evidence": { "url": "https://www.jauce.com/japan_auction_detail", "checkedOn": "2026-09-06",
                                      "quote": "By default, we check all the packages and optimize them accordingly" } }
    },
    "…": "…"
  }
}
```

現行 `services.ts` は `amazon-jp: 1000`・`mercari` は既定 400 に落ちる。**上の例は「原文が言っていないことは書かない」に
寄せてある**ので、Phase 2 の等価テスト（§5）で必ず差分として出る。それがこの設計の意図した挙動で、差分を見た人が
「現行を保つ（1:1 転記）」か「unknown にする」かを決めて、決めたことが JSON に残る。

#### 1.3.3 抜粋: FROM JAPAN（原文が base64 の JSON である場合の evidence）

出典: `https://www.fromjapan.co.jp/translate/en_help.txt`（`docs/audit/fees.md` §3。1,474 個の文字列を持つ base64 JSON）。

```json
"evidence": {
  "per-item": {
    "url": "https://www.fromjapan.co.jp/translate/en_help.txt",
    "format": "base64-json-strings",
    "locator": "help_fee_140",
    "checkedOn": "2026-09-06",
    "quote": "500 yen per item"
  },
  "same-item-once": {
    "url": "https://www.fromjapan.co.jp/translate/en_help.txt",
    "format": "base64-json-strings",
    "locator": "help_fee_150",
    "checkedOn": "2026-09-06",
    "quote": "*If multiple units of the same item are paid together, handling fees will be the same as for one item."
  },
  "payment-fee-auction": {
    "url": "https://www.fromjapan.co.jp/translate/en_help.txt",
    "format": "base64-json-strings",
    "locator": "title_serviceRule_1460",
    "checkedOn": "2026-09-06",
    "quote": "Regardless of the payment method, items won on JDirectItems Auctions shall incur a 200 yen payment fee per auction."
  }
}
```

`format` は**輸送形式のデコーダ**を選ぶだけ（`html` 既定 / `text` / `base64-json-strings`）。料金を解釈するパーサではない。
このファイルを読むには既に必要だったこと（fees.md がそうして読んだ）を、監視側にも同じ形で持たせる。

### 1.4 evidence と tier の対応規則（ビルドが強制する）

`types.ts` の Tier 定義を、そのままデータの制約に写す。

| tier | 意味（types.ts） | evidence の必須条件 | 違反したらビルド停止 |
|---|---|---|---|
| `fixed` | 各社の公開料金表（一次情報） | `quote` が非空、`url` のホストが `service.url` のホストと一致（現行 `services.test.ts` の主張と同じ）。`archiveUrl` があれば `capturedOn` 必須 | quote 無し／他社ホスト／写しなのに採取日無し |
| `unverified` | 二次情報 | `url` が社以外のホスト、`quote` 非空 | 社自身のホストなのに unverified（なら fixed にできるはず） |
| `estimate` | 我々の仮定 | `reasoning` 非空。`quote` は `null` 可 | reasoning 無し |
| `none` | 未取得 | **データには書けない。** unknown を消費側が `none` として描く | データに `none` があれば停止 |

加えて **数字と引用の突き合わせ**（弱いが効く）: `yen` / `rate` の値を桁区切りあり・なし・百分率で文字列化し、
そのいずれかが `quote` に含まれることを要求する（`500` ⊂ "500 yen per item"、`0.08` → "8%" ⊂ "…+ 8% of…"、
`1000` → "1,000" ⊂ "JPY 1,000 + 8%"）。含まれなければ停止。**これは引用から数字を読む処理ではない**（一方向の存在確認）。
転記ミス（500 を 5000 と打つ）を止めるだけで、間違った文を引いた誤りは止められない（§6）。

### 1.5 生成物

#### 1.5.1 `src/data/sites.ts`

```ts
// data/sites.json から scripts/sites-build.ts が生成する。手で編集するな。`npm run sites:build`。
export const SITE_IDS = [
  'yahoo-auctions', 'mercari', 'rakuten', 'yahoo-shopping', 'amazon-jp',
  'suruga-ya', 'mandarake', 'zozo', 'hmv', 'toranoana', 'other',
] as const;
export type SiteId = (typeof SITE_IDS)[number];

export type ShopModel = 'single-shop' | 'per-listing' | 'shop-in-path' | 'unknown';
export interface Site {
  id: SiteId;
  name: string;
  labelDomain: string;
  hosts: string[];
  kind: 'auction' | 'fixed';
  shopModel: ShopModel;
}
export const SITES: readonly Site[] = [ /* … */ ];
export const SITE_BY_ID: Record<SiteId, Site> = { /* … */ };
export const SITES_CHECKED_ON = '2026-09-06';
```

`SITE_IDS` が `as const` で出ているので、`Record<SiteId, …>` と書いた場所（`FeeTable.SITE_LABEL`、`ItemList.SITE_NAMES`、
生成物 `bySite`）は**サイトを足した瞬間に typecheck が落ちる**。これが 1 つ目の門。

#### 1.5.2 `src/data/fees.ts`（型の要点）

```ts
// data/fees/*.json から scripts/fees-build.ts が生成する。手で編集するな。`npm run fees:build`。
import type { SiteId } from './sites';
import type { CountryCode } from '@/lib/pricing/types';

/** データが持てる確度。'none' は無い — 未取得は Unknown として別に表す。 */
export type DataTier = 'fixed' | 'estimate' | 'unverified';

export interface Evidence {
  url: string;
  /** 原文の引用。fixed / unverified では必須。estimate では null 可。 */
  quote: string | null;
  checkedOn: string;
  /** 写しから読んだとき。両方そろって初めて有効。 */
  archiveUrl?: string;
  capturedOn?: string;
  /** 本文の取り出し方。料金の解釈はしない。 */
  format?: 'html' | 'text' | 'base64-json-strings';
  /** format が base64-json-strings のときの鍵など。 */
  locator?: string;
  /** estimate の根拠（日本語可、画面には出さない）。 */
  reasoning?: string;
}

export interface YenFigure  { yen: number;  tier: DataTier; evidence: Evidence; note?: string }
export interface RateFigure { rate: number; tier: DataTier; evidence: Evidence; note?: string }
export interface ValueFigure<T> { value: T; tier: DataTier; evidence: Evidence; note?: string }

/** その社・そのサイトの額。全サイトぶん必ず存在する。 */
export type SiteFee =
  | { kind: 'figure'; name: string; figure: YenFigure | RateFigure }
  | { kind: 'unknown'; note?: string }
  | { kind: 'not-supported' };

export type SiteSupport = { support: 'yes' | 'no' | 'unknown'; evidence?: Evidence; note?: string };

export type ChargeStatus<T> =
  | ({ status: 'charged' } & T)
  | { status: 'not-charged'; evidence?: Evidence }
  | { status: 'unknown'; note?: string };

export interface PerItemCharge {
  basis: ValueFigure<'per-distinct-item' | 'per-unit'>;
  bySite: Record<SiteId, SiteFee>;          // ← 全域。figure 名は解決済みで figure 本体が入る
  note?: string;
}
export interface AdValoremCharge {
  bySite: Record<SiteId, SiteFee>;
  base: ValueFigure<'item-price'>;
}
export interface PerOrderCharge { amount: YenFigure; note?: string }
export interface BankFeeCharge  { amount: YenFigure; basis: ValueFigure<'per-order'>; note?: string }
export interface PaymentInsideJpCharge { amount: YenFigure; bySite: Record<SiteId, SiteFee> }
export interface PackingCharge {
  perParcelYen: YenFigure; perKgYen: YenFigure; freeUpToG: ValueFigure<number>; mandatory: ValueFigure<boolean>;
}
export interface DepositCharge {
  flatYen: YenFigure; rate: RateFigure; method: ValueFigure<'gross-up' | 'additive'>; note: string;
}

/** 費目の鍵は Line.key と同じ語。ここに無い費目は「このモデルが知らない費目」で、足すのはコードの変更。 */
export interface Charges {
  'service-fee':       ChargeStatus<PerItemCharge>;
  'purchase-fee':      ChargeStatus<PerOrderCharge>;
  'protection-plan':   ChargeStatus<PerOrderCharge>;
  'ad-valorem':        ChargeStatus<AdValoremCharge>;
  'bank-fee':          ChargeStatus<BankFeeCharge>;
  'payment-inside-jp': ChargeStatus<PaymentInsideJpCharge>;
  'packing':           ChargeStatus<PackingCharge>;
  'deposit':           ChargeStatus<DepositCharge>;
}

export type PrepaidImportTaxEntry =
  | { status: 'collected'; rate: RateFigure; base: ValueFigure<'declared' | 'before-shipping' | 'total'>; note: string }
  | { status: 'not-collected'; evidence: Evidence }
  | { status: 'not-applicable'; note?: string }
  | { status: 'unknown'; note?: string };

export interface FeeService {
  id: string;
  name: string;
  url: string;
  feePage: string;
  /** 全 fixed の evidence が自社ホストなら true。ビルドが導く。手で書かない。 */
  primarySource: boolean;
  sites: Record<SiteId, SiteSupport>;
  charges: Charges;
  domesticIncluded: ValueFigure<boolean>;
  parcels: { default: ValueFigure<'one' | 'per-order'>; consolidationOnRequest: ValueFigure<boolean> };
  emsMarkup: { rate: RateFigure };
  optional: { key: string; label: string; amount: YenFigure; note: string }[];
  prepaidImportTax: Record<CountryCode, PrepaidImportTaxEntry>;   // ← こちらも全域
  paysUs: boolean;
  referralNote: string | null;
  /** この社の figure のうち最も古い checkedOn。 */
  oldestCheckedOn: string;
}

export const FEE_SERVICES: readonly FeeService[] = [ /* neokyo, zenmarket, fromjapan, buyee, jauce の順 */ ];
export const FEE_SERVICE_BY_ID: Record<string, FeeService>;
/** 全社・全 figure の中で最も古い確認日。「Fees checked on …」はこれを出す。 */
export const FEES_CHECKED_ON: string;
/** 監視対象にすべき URL（evidence の url と archiveUrl の重複排除）。 */
export const FEE_EVIDENCE_URLS: readonly string[];
```

`prepaidImportTax` も `CountryCode` の全域にした。現行の `Partial<Record<CountryCode, …>>` は「無い＝未確認」を
compare.ts が正しく null に落としているが、書き忘れと未確認が区別できない点はサイトと同じ穴なので、同じ薬を使う。

#### 1.5.3 `data/fees/index.json`（生成物・要約）

`weights/index.json` に相当。fees-check と `/sources` が読める形で「今この表がどれだけ埋まっているか」を出す。

```json
{
  "generatedBy": "scripts/fees-build.ts",
  "generatedOn": "2026-09-07",
  "oldestCheckedOn": "2026-09-06",
  "newestCheckedOn": "2026-09-06",
  "siteIds": ["yahoo-auctions", "…", "other"],
  "totals": { "services": 5, "figures": 0, "byTier": { "fixed": 0, "estimate": 0, "unverified": 0 },
              "unknownSiteCells": 0, "unknownCharges": 0, "unsupportedCells": 0, "archiveBackedEvidence": 0 },
  "unknown": [
    { "path": "jauce/charges/service-fee/bySite/amazon-jp", "note": "under maintenance" }
  ],
  "archiveBacked": [
    { "path": "zenmarket/evidence/standard", "archiveUrl": "…", "capturedOn": "2026-07-25", "ageDays": 44 }
  ],
  "evidenceUrls": [
    { "url": "https://neokyo.com/en/fees", "format": "html", "quotes": 5, "backs": ["neokyo/charges/service-fee/figures/standard", "…"] }
  ],
  "services": [ { "id": "neokyo", "oldestCheckedOn": "2026-09-06", "figures": 0, "unknownSiteCells": 0, "…": "…" } ]
}
```

（数値は生成されるまで 0 のまま置いた。形の例であって実測ではない。）

### 1.6 ビルドスクリプトの責務（`scripts/fees-build.ts`）

**やること: 読む・検証する・書き出す。それだけ。** 重量ビルドの `MATCH_DENYLIST` のように値を加工する層は持たない
（§2 で理由）。検証は zod（依存に既にある v4）で書く。zod 4 の `z.record(z.enum(SITE_IDS), …)` は鍵の全域を要求するので、
「全サイトぶん書け」はスキーマそのものになる。

検証一覧（1 つでも落ちれば `process.exit(1)`、どのファイルのどのパスかを出す）:

| # | 検査 | 止める理由 |
|---|---|---|
| V1 | `data/sites.json` の id が一意・`other` が存在し `hosts: []`・ホストが他サイトの接尾辞にならない | `siteFromUrl` の最長一致が壊れる |
| V2 | 各サービスの `sites` が全 SiteId を持つ | 制約4 |
| V3 | 各 `bySite` が全 SiteId を持つ。値は `figures` に存在する名前か `unknown` | 制約3・4 |
| V4 | `sites[x].support === 'no'` のサイトに `bySite[x]` が figure を指していない（`not-supported` に置換して出力） | 扱わないサイトの古い額が残る |
| V5 | `charges` の 8 鍵が全部ある。各 `status` は 3 値のどれか | 無言の費目を許さない |
| V6 | tier ↔ evidence の規則（§1.4） | 確度の嘘 |
| V7 | 数字が引用に現れる（§1.4） | 転記ミス |
| V8 | `checkedOn` / `capturedOn` が `YYYY-MM-DD`、今日以前、`capturedOn <= checkedOn` | 未来の確認日・逆転 |
| V9 | `$ref` が解決でき、未参照の `evidence` が無い | 孤児の引用は「どの数字の根拠か」を失う |
| V10 | `prepaidImportTax` が全 CountryCode を持つ。`not-applicable` は `countries.ts` の `sellerCollectsBelow` が無い国だけに許す | 国側の規定と社側の記録の食い違い |
| V11 | サービス順が `neokyo, zenmarket, fromjapan, buyee, jauce`（現行テストの主張） | 順序をデータに委ねない |
| V12 | `data/fees/index.json` と `src/data/fees.ts` が原本から再生成した結果と一致（**ドリフト検査は vitest 側**: `src/data/fees.test.ts` がビルド関数を呼んで文字列比較） | 原本だけ直して生成物を忘れる |
| V13 | `data/proxy-sites.json#/known` で SiteId が付いた表示名が、ある社の抽出一覧に出ているのに、その社の `sites[siteId].support` が `'no'` | 社が「扱う」と並べる名前を料金側が「扱わない」と書いている（§1.2.1） |

V12 は重量には無い（`weights-build` を呼ぶテストも CI ステップも無いことを grep で確認した）。**fees で先に入れ、
重量にも同じ検査を足すことを勧める**（この設計の範囲外）。

### 1.7 引く側の意味づけ（`unknown` / `not-supported` を画面でどう出すか）

`docs/DESIGN-NOTES.md` §2 の 2 軸（**発生が確実か／金額が確実か**）をそのまま使う。

| データの状態 | 発生 | 金額 | 行の Line | 総額 | 順位 |
|---|---|---|---|---|---|
| `figure` | 確実 | 確定/推定/二次 | 額と tier（UI-DESIGN §6 のとおり） | 入る | 付く |
| `service-fee` / `purchase-fee` の `bySite[site] = unknown` | **確実**（代行に購入手数料は必ずある） | 不明 | `amount: null, tier: 'none'`、label「Service fee for {site} — not confirmed」 | 抜ける | **付けない。** `comparable: false`、`notComparableReason: "{service} does not publish its fee for {site}, so this total is missing a line it certainly has"` |
| `packing` / `deposit` / `bank-fee` などの `status: unknown` | 不明 | 不明 | `null` / `none`、label は excluded に載る | 抜ける | 付く（現行の前徴収 GST 未確認と同じ扱い） |
| `sites[site].support === 'no'` | — | — | 行の Line は作らない | — | `comparable: false`、reason「{service} does not buy from {site}」。行は末尾に理由つきで残す（消さない） |
| `sites[site].support === 'unknown'` かつ bySite が figure | 確実 | 確定 | 通常どおり。ただし行の `tag` に「site support not confirmed」 | 入る | 付く |

「必ず発生する費目が不明なら順位から外す」は現行の EMS null と同じ規則（`compare.ts` `comparable`）。
サービス料が抜けた総額を並べると、**調べていない社が安く見えて 1 位になる**——このプロダクトで最悪の壊れ方なので、
前徴収 GST（発生自体が不確実）とは扱いを分ける。

`/sources` の FeeTable は社 × サイトの行列に変え、各セルに額・tier・`—`・「not supported」を出す。セルの `title` に
引用と確認日を入れる（`Evidence.quote` がそのまま使える）。**現在 `page.tsx` に手書きされている FROM JAPAN の
「the original does not say whether it is charged once per order or once per item」は、作業ツリーの `services.ts` が
「原文に per auction と書いてある」と結論した今、既に矛盾している。** 引用をデータに持てば、この種の散文は
データから描くだけになり、ずれない。

### 1.8 `scripts/fees-check.ts` の変更

現状: `SERVICES[].sourceUrl` を本文ハッシュ／数字指紋で見る。差分が出ても「ページが変わった」までしか言えない。
**変更後:**

1. 監視対象は `FEE_EVIDENCE_URLS`（evidence の url の重複排除）＋現行の EMS・お知らせ・ECB・各国税ページ。
   → Jauce の 404 を 1 年放置した事故（fees.md #15）は、**根拠に使った URL は必ず監視対象**になることで再発しない。
2. 取得できたページごとに、本文を正規化（現行 `stripText` ＋ NFKC ＋ 引用符・ダッシュの正規化 ＋ 空白圧縮 ＋ 小文字化。
   `format: base64-json-strings` はデコードして文字列を連結）し、そのページを url に持つ**すべての引用について
   「含まれているか」**を見る。引用の `…` は「任意の文字列」として扱う。
3. 報告は引用単位で、JSON パスを付ける:
   ```
   - **ZenMarket の料金ページ** で根拠の文が見つからない
     → data/fees/zenmarket.json#/evidence/marketplace（service-fee: yahoo-auctions, mercari の ¥800）
     引用:「800 yen … all Mercari items and JDirectItems Auction bids」
   ```
4. 本文ハッシュは残すが格下げ: 「変わったが引用は全部残っている」は**別の見出し**で報せる（新しい費目が増えた可能性）。
   Neokyo の Trivia 差し込み（毎回ハッシュが変わる）は、引用が残る限り 3 の門を通らないので、
   現行の「数字の指紋」逃げ道は要らなくなる（残しても害は無い）。
5. `archiveUrl` を持つ evidence は、写しに対しては何も検査しない（写しは変わらない）。代わりに
   「live が取れないまま採取日から N 日」を毎回報せる。ZenMarket の 403 は、**「読めている」ではなく
   「44 日前の写しに立っている」と表示される**。
6. `data/fees/index.json` の `unknown` 一覧を毎回ログに出す。issue には載せない（毎週同じになる）が、
   「まだ N セル未確認」が実行ログに残る。
7. 数字は今までどおり**一切書き換えない**。`data/fee-pages.json` の形も変えない。

引用の検査は**状態を持たない**（データと今の本文を比べるだけ）ので、`fee-pages.json` に何も足す必要は無い。

---

## 2. 重量パイプラインとの対応表

| 観点 | 重量（現状） | 料金（この設計） | 踏襲／変更と理由 |
|---|---|---|---|
| 原本の単位 | カテゴリ 1 つ＝JSON 1 本 | 社 1 つ＝JSON 1 本 | **踏襲。** 再取得は社ごとに起きる。git の履歴も社ごとに読める |
| 原本と別の台帳 | 無し | `data/sites.json` | **追加。** 料金は「社 × サイト」の 2 軸で、サイト側の全域を検査するには台帳が要る |
| 生成 TS の冒頭「手で編集するな」 | あり | あり | 踏襲 |
| `index.json` の生成 | 要約・not obtained・partial gaps | 要約・unknown セル・写し依存・出典 URL | 踏襲（中身は違う） |
| 型を build と生成 TS の両方に書く | 両方に手書き（重複） | zod スキーマから型を導き、生成 TS に文字列で出す | **変更。** 重複した型は片方が腐る。zod 4 が既に依存にある |
| ビルドでのデータ加工 | `MATCH_DENYLIST` が match 語を落とす（値は触らない） | **加工層なし** | **変更。** 重量の「当て方」は判断だが、料金の数字は転記。転記に加工の余地を残すと「ビルドが直した」数字が出る |
| SEED（TS にしか無かったデータの救出） | あり | 無し。一度きりの転記＋等価テスト（§5 Phase 2） | **変更。** services.ts のコメントに埋まった根拠は機械では JSON に写せない。人が転記し、等価テストで数値の一致を担保する |
| 確認日の集約 | カテゴリの `checkedOn` の**最新** | figure の `checkedOn` の**最古** | **変更。** 「Fees checked on X」は「X 以降に全部見た」と読まれる。最新を出すと最古の figure が隠れる |
| 「取れていない」の表現 | カテゴリ単位（`NOT_OBTAINED`） | セル単位（`unknown` / `not-supported`）＋費目単位（`status: unknown`） | 思想は踏襲、粒度を細かく。料金は「一部だけ分かる」が普通 |
| 出典 | `sources[]`（ドメイン・URL・verdict） | `evidence`（URL・**引用**・確認日・採取日） | **変更。** 重量は統計なので引用が無い。料金は散文の転記なので、引用が無いと監視が費目に落ちない |
| 引く側の判断ロジック | `pricing/weights.ts` に corroboration / exclusion | `compare.ts` の `feeLines` が figure/unknown/not-supported を解釈 | 踏襲（データは判断を持たない、判断はコード） |
| ドリフト検査 | 無し | vitest で原本→生成を再計算して比較 | **追加。** 重量にも入れるべき |
| 並び順 | `CATEGORY_ORDER` を build に持つ | サービス順を build に持つ（現行テストの順） | 踏襲 |
| JSON にだけあって TS に出さない欄 | `method` | `why`（判断理由） | 踏襲。ただし `evidence` は TS に出す（`/sources` が引用を描くため） |

---

## 3. 制約 1〜6 への回答

### 制約1: 取得は人手のまま。保存を構造化する

- 抽出の自動化は**入れない**。ビルドも check も、数字を文から読む処理を持たない。
- 唯一の「読み取り」は §1.4 の一方向検査（値が引用に含まれるか）で、これは転記ミスの門であって抽出ではない。
  含まれていなくても数字を変えず、ビルドを止めるだけ。
- `format: base64-json-strings` は輸送形式のデコード。fees.md がこのファイルを読むときに既にやったこと。

### 制約2: fees-check が「どの数字を直すべきか」を指せる

- 引用はデータの figure に付いている。引用が消えた → figure の JSON パス → その figure を参照する `bySite` のサイト、
  という逆引きは全部データの中で閉じる（§1.8 の 3）。
- 報せるのは「根拠の文が見つからない」までで、新しい数字は人が読む。**ハッシュが変わっただけ**（引用は全部残っている）
  は別の見出しにして、優先度を分ける。
- 限界（§6）: 古い文が残ったまま新しい文が追加された改定は、引用検査では拾えず、ハッシュ見出しで人が読むしかない。

### 制約3: 「知らない」が数字に化けない

案として出された `Record<SiteId, number | 'default' | 'unknown'>` は**採らない**（§4 の却下2）。採るのは
`bySite: Record<SiteId, figure名 | 'unknown'>` ＋ 名前付き figure。理由:

- 生の `number` を許すと、その額の出典と確認日が付かない。
- `'default'` は「別の場所にある既定値を見よ」で、**既定値がどのサイトを念頭に書かれたかが消える**。
  ZenMarket の「most other stores」が Suruga-ya を含むかは人の判断で、その判断を `bySite['suruga-ya'] = 'standard'`
  という 1 行として残したい。`'default'` と書くとその判断が無かったことになる。
- `'unknown'` は残す。画面は §1.7 のとおり: `—`（tier `none`）、`excluded` に載せ、**サービス料なら順位から外す**。
- `not-supported` は `sites` から導く。「その社が扱わない」と「額を知らない」は別の事実。

### 制約4: サイトが 10 → 20 になったとき、5 社ぶんの判断を忘れられない

門を 3 つ重ねる。どれも「忘れると赤くなる」のであって、「忘れると既定値が入る」ではない。

1. `data/sites.json` に足す → `sites:build` → `SITE_IDS` が変わる → `Record<SiteId, …>` を使う全箇所で **typecheck が落ちる**。
2. `fees:build` の V2・V3 が、5 社すべての `sites` と `bySite`（service-fee・ad-valorem・payment-inside-jp）に
   新サイトの鍵が無いと**止まる**。埋め方は figure 名か `unknown` の明示のみ。ワイルドカードは無い（§4 却下3）。
3. `unknown` で埋めた場合は `index.json` の `unknown` 一覧と fees-check のログに毎週出る。埋めたことは通るが、忘れたことにはならない。

別エージェントの「5 社の対応サイト一覧」スクリプトの出力は `data/proxy-sites.json`（§1.2.1）に留まり、各社 JSON の
`sites` ブロック（`support` と evidence）は人がそれを見て書く。V13 が両者の食い違いを止める。
`bySite` も人が埋める（料率の判断は一次情報を読む作業なので）。20 サイト × 5 社 × 最大 3 費目 ＝ 最大 300 行の明示的判断。
多いが、それが「忘れられない」の代金で、`unknown` と書けば 1 行で済む。

### 制約5: SiteId の二重管理

**単一の出所は `data/sites.json`。** `types.ts` でも `search/sites.ts` でもない。

- `types.ts` の手書き union は id しか持てず、ホスト名・kind・shopModel を持てない。
- `search/sites.ts` は検索の層。`pricing` が `search` を import すると層が逆転する（今は `search → pricing/types` の向き）。
  中立な `src/data/sites.ts` を生成して両方がそこから引けば、向きの問題が消える。
- `types.ts` は `export type { SiteId } from '@/data/sites'` にして、既存の import パスを壊さない。
- `search/sites.ts` は `SITES` を `@/data/sites` から import し、`siteFromUrl` / `siteById` / `siteFilter` の関数だけ残す。
  `Site.jauceFree` は削除（Jauce の `service-fee.bySite` に `beta-free` figure として移る。同じ事実を 2 か所に置かない）。
  `sites.test.ts` の jauceFree の主張は `services.test.ts` 側で `bySite` を見る形に移す。
- `shops.ts` の `SINGLE_SHOP_SITES` / `PER_LISTING_SITES` は `SITE_BY_ID[site].shopModel` から導く。
- `deeplink.ts` の `DEEP_LINKS: Record<string, Partial<Record<SiteId, DeepLink>>>` は Partial のまま（「直リンクの形を検証していない」
  が既定でよい。無ければトップに落ちる、という現行の安全側の挙動は正しい）。

### 制約6: 移行の順序

§5。要点は「**先に新しい形を作って旧形へ写像し、等価であることをテストで示してから差し替える**」。
別エージェントが `services.ts` を編集中なので、Phase 2 の間は **JSON と TS の二重メンテ期間**が発生する。
その期間の食い違いは等価テストが必ず拾う。

---

## 4. 却下した案とその理由

| # | 案 | 却下の理由 |
|---|---|---|
| 1 | **社ごとのパーサで料金ページから数字を抽出する** | 制約1。言い回しの変化で静かに壊れ、間違った数字を自信を持って出す。ZenMarket の原文は表ではなく散文。FROM JAPAN は base64 JSON。Buyee は見積りツール。5 社で 3 通りの形式に 5 通りの文体で、パーサの維持費がデータの維持費を超える |
| 2 | **`Record<SiteId, number \| 'default' \| 'unknown'>`（提示案）** | `number` に出典が付かない。`'default'` は判断を消す（制約3 の項）。既定値 `perItemYen` との二重構造が残り、「どのサイトが既定に含まれるか」を人間が覚え続けることになる——いま解こうとしている問題そのもの |
| 3 | **`bySite` にワイルドカード（`"*": "standard"`）を許す** | 20 サイトを 1 行で埋められて楽だが、それは「新サイトに既定値が黙って入る」の再発明。制約4 に反する。**全域を手で書くことが仕様** |
| 4 | **費目を汎用の「課金ルール」リストにして compare.ts をルール解釈器に書き換える** | 設計としては綺麗だが、データの移行を計算ロジックの書き換えに変えてしまう。`feeLines` は別エージェントが編集中で、`services.test.ts` は `service-fee` / `bank-fee` 等の Line 鍵で主張している。費目の鍵を Line 鍵と同じにして 1:1 で写せる形にするほうが、移行中に緑を保てる |
| 5 | **生成 TS を出さず、JSON を `resolveJsonModule` で直接 import する** | JSON import は鍵の型が `string` に広がり、`Record<SiteId, …>` の全域性が**コンパイル時の事実にならない**。検証も実行時に落ちる。生成 TS だからこそ typecheck が門になる（制約4 の門1） |
| 6 | **1 本の `fees.json` にまとめる** | 再取得は社ごとに起きる。5 社を 1 ファイルにすると git の履歴と差分が読みにくく、2 人が別の社を直すと衝突する。重量が category ごとに分けた理由と同じ |
| 7 | **引用を `data/fee-pages.json`（監視側）に持たせる** | 引用は数字の根拠であって監視の状態ではない。数字の隣に無いと、どの figure の根拠かがまた人間の記憶になる。監視側は状態を持たない検査にできる（§1.8） |
| 8 | **ページ全文のスナップショットをリポジトリに保存して diff を出す** | 本文の diff は「どこが変わったか」は示すが「どの数字に効くか」は示さない。容量と著作権の問題もある。引用の存在検査のほうが小さくて目的に近い |
| 9 | **`SiteId` の正を `search/sites.ts` の `SITES` にする** | 層の向きが逆転する（pricing が search に依存）。中立な生成物に置く |

---

## 5. 移行手順

基準（2026-09-07 の作業ツリー）: `npm run lint`・`npm run typecheck` が通り、vitest **298 件**緑（依頼文の 274 件から
別エージェントの作業で増えている）、E2E は依頼文の **124 件**を基準とする（この環境では Chromium を起こさなかったので未再実行。
`playwright.config.ts` は desktop / mobile の 2 プロジェクト）。以下の各段で「緑」とは、この 4 つ（lint / typecheck / vitest / E2E）に
その段で足した検査を加えたもの。

**別エージェントとの調整:** Phase 2 が終わるまで `services.ts` の編集は続いてよい。Phase 2 の等価テストが赤くなったら
JSON 側を追随させる。Phase 3 以降は `services.ts` の数値編集を止め、JSON を直す。

### Phase 0 — 現状を固定する（コードは足すだけ、変えない）

- `src/lib/pricing/services.golden.test.ts`: `JSON.stringify(SERVICES)` を正規化してスナップショットに固定する
  （vitest の `toMatchInlineSnapshot` でも外部ファイルでもよい）。**意図しない値の変化を Phase 3 まで検知する門。**
- **完了条件:** 追加テストが緑。既存 298 件・E2E 124 件に変化なし。

### Phase 1 — サイト台帳

- `data/sites.json`、`scripts/sites-build.ts`、生成 `src/data/sites.ts`、ドリフト検査 `src/data/sites.test.ts`。
- `types.ts` の `SiteId` を再エクスポートに。`search/sites.ts` は `SITES` を import、`jauceFree` は**この段では残す**
  （sites.json に一時的に持つ。二重管理の解消は Phase 5）。
- `FeeTable.SITE_LABEL` / `ItemList.SITE_NAMES` / `shops.ts` の配列はまだ触らない（typecheck が通ることだけ確認）。
- **完了条件:** `siteFilter()` の返す文字列が変わっていないことをテストで固定。`sites.test.ts` 全件緑。E2E 緑。
  `git diff` に `src/lib/pricing/compare.ts` / `services.ts` が**含まれない**。

### Phase 2 — 料金の原本とビルドを並走させる（消費者はまだ旧 `SERVICES`）

- `data/fees/*.json` を 5 本、作業ツリーの `services.ts` から**1:1 で転記**する。コメントの根拠は `evidence.quote` に、
  判断は `why` に写す。引用は `docs/audit/fees.md` と services.ts のコメントに既にある。
- `scripts/lib/fees-data.ts`（読み込み＋zod 検証）、`scripts/fees-build.ts`、生成 `src/data/fees.ts`・`data/fees/index.json`、
  ドリフト検査 `src/data/fees.test.ts`。
- **等価テスト** `src/lib/pricing/services.equivalence.test.ts`: `toLegacyService(FEE_SERVICES)` を Phase 0 のスナップショットと
  deep-equal。`toLegacyService` は `src/lib/pricing/services-legacy.ts` に置く（生成物 → 既存 `Service` 形）。
  `unknown` は旧形に写せないので、この段では **`unknown` を 1 つも書かない**（現行の判断をそのまま figure にする。
  §1.3.2 で示した `amazon-jp: unknown` のような改善は Phase 5 の判断に送る）。
- **完了条件:** `npm run fees:build` が V1〜V11 を全部通る。等価テスト緑。既存テストは 1 件も変えていない。
  別エージェントが `services.ts` の値を触ったら等価テストが赤くなり、JSON を追随させて緑に戻す——これを最低 1 回経験してから次へ。

### Phase 3 — 正を差し替える

- `services.ts` の `SERVICES` リテラルを削除し、`export const SERVICES: Service[] = FEE_SERVICES.map(toLegacyService)` にする。
  `SERVICES_CHECKED_ON` は `FEES_CHECKED_ON`（最古）を再エクスポート。`Service` 型と `SERVICE_BY_ID` は残す。
  `compare.ts` / `FeeTable.tsx` / `SiteFooter.tsx` / `fees-check.ts` は**触らない**。
- Phase 0 のゴールデンはそのまま。
- **完了条件:** 既存 298 件・E2E 124 件が**テスト側を 1 文字も変えずに**緑。ゴールデン一致。`/sources` の
  「Fees read on 2026-09-06」が同じ文字列で出る（最古も最新も同日なので変化なし）。

### Phase 4 — 監視を根拠に付け替える

- `fees-check.ts`: 対象を `FEE_EVIDENCE_URLS` ＋既存の EMS/お知らせ/ECB/税に。引用の存在検査、写しの経過日数、
  unknown 一覧のログ（§1.8）。正規化関数と検査関数は `scripts/lib/fees-check-core.ts` に出し、
  `src/lib/…` からは import せず、`vitest.config` の `include` に `scripts/lib/**/*.test.ts` を足して単体テストする。
- `data/fee-pages.json` の形は変えない。
- **完了条件:** `npm run fees:check` をローカルで走らせ、全 evidence URL の HTTP status と「N 引用を確認」が出る。
  引用を 1 つ故意に壊して走らせ、JSON パスつきで報告されることを確認してから戻す。fees-watch の Action を
  `workflow_dispatch` で 1 回走らせて全件 200（ZenMarket は 403 と写しの経過日数）。

### Phase 5 — 消費側を新しい意味に切り替える

- `compare.ts` の `feeLines` が `FeeService` を直接読む（§1.7 の表）。`toLegacyService` と `Service` 型を削除。
- `FeeTable` を社 × サイトの行列に。セル `title` に引用と確認日。`page.tsx` の手書き散文（Jauce / FROM JAPAN の段落）を
  データ由来に置き換えるか削除。`ItemList.SITE_NAMES` / `FeeTable.SITE_LABEL` を `SITE_BY_ID` に。`shops.ts` を `shopModel` に。
  `Site.jauceFree` 削除、`sites.test.ts` の該当 2 件を `bySite` の主張に書き直す。
- `services.test.ts` の「fee 行の sourceUrl が `s.sourceUrl` と一致」は「その行の figure の evidence.url と一致」に変える
  （Neokyo の AU GST が既に `/en/shipping` を別に持っているように、費目ごとに URL が違うのが正しい）。
- ここで初めて `unknown` を書く（Jauce `amazon-jp` / `mercari`、FROM JAPAN・Buyee の `packing` など、原文に無いもの）。
  ゴールデンは**意図して**更新し、差分を PR 本文に列挙する。
- 新規テスト: service-fee unknown で `comparable:false`、packing unknown で `—`＋excluded、`support:'no'` で行が末尾に理由つき。
  E2E: `/sources` のセルに引用が出る、`—` のセルに `title` が付く。
- **完了条件:** 全緑。`grep -rn "jauceFree\|SITE_LABEL\|SITE_NAMES\|SINGLE_SHOP_SITES" src` が 0 件。
  `docs/COMPLETENESS.md` の T4・T6 の記述をこの形に合わせて更新。

### Phase 6 — 20 サイト

- `data/proxy-sites.json#/known` の `host` あり・`siteId: null` の行（`index.json` の `candidateSites`）から、検索対象にする
  サイトを人が選び、`data/sites.json` に足して `known` の `siteId` を埋める → typecheck と `fees:build` が赤くなる →
  5 社の `sites` に `support` を、`bySite` を figure か `unknown` で埋める → 緑。
- **完了条件:** `index.json` の `unknownSiteCells` が実際に調べた結果と一致し、その数が `/sources` に出る。
  `siteFilter()` の Brave クエリ長が API の上限を超えないことをテストで固定（1 クエリに収める制約が `sites.ts` にある）。

---

## 6. この設計で防げる失敗と、防げない失敗

### 防げる

| 失敗 | 何が止めるか |
|---|---|
| サイトを足して、ある社の料率判断を忘れる | typecheck（`Record<SiteId>`）＋ V2/V3 |
| 「調べていない額」が既定値として静かに出る | 既定値の概念が無い。`unknown` は `—` と excluded、サービス料なら順位から外す |
| 数字に出典・確認日が付いていない | figure 以外の形で数字を書けない（zod） |
| 確度の嘘（引用が無いのに fixed、社の原文なのに unverified） | V6 |
| 転記の桁ミス | V7（値が引用に含まれる） |
| ページが変わったとき、どの数字を見直すべきか分からない | 引用単位の検査と JSON パス |
| 根拠に使った URL が 404 のまま監視から漏れる（Jauce の事故） | evidence の URL は自動的に監視対象 |
| 写しから読んだ数字が「今日読んだ」顔をする | `archiveUrl` + `capturedOn` 必須、経過日数を毎週報告（`shipping-methods.ts` の `capturedOn` と同じ考え） |
| 原本だけ直して生成物を忘れる | V12（ドリフト検査） |
| 「Fees checked on」が最古の figure を隠す | 最古を出す |
| 同じ事実の二重管理（`jauceFree` と `freeForSites`、3 つのサイト名表） | 1 か所に寄せ、他は生成物から引く |
| `/sources` の散文がデータと食い違う（FROM JAPAN ¥200 の説明） | 散文をデータの引用から描く |
| 費目を「無いから書かない」で済ませ、無いのか未確認なのか分からなくなる | V5（8 鍵すべてに status） |

### 防げない（正直に）

| 失敗 | なぜ防げないか | 緩和 |
|---|---|---|
| **原文の読み違い** — 引用は正しく、数字も引用に含まれるが、解釈が違う（課税ベースが declared か total か、per auction を per unit と読む、Jauce 入金手数料の gross-up か加算か） | 構造化は解釈を検査できない。fees.md の「誤り」判定の大半はこの種 | `why` に判断理由を残し、監査（fees.md）が引用と判断を並べて読めるようにする。監査の手間を減らすだけで、無くしはしない |
| **古い文が残ったまま新しい文が加わる改定**（「10 月 1 日から 600 円」が追記され、旧文はそのまま） | 引用の存在検査は通る | ハッシュ見出しで「変わったが引用は残っている」を報せ、人が読む。週次なので最大 7 日遅れる |
| **改定日と検査日の間** | 週次 | 変えない（毎日回しても人が読むのは週次） |
| **JS 描画・見積りツール・ログイン後にしか無い数字**（Buyee の送料見積り、FJ の会員ランク割引率） | 本文に無いものは検査できない | `unknown` / `estimate` として正直に描くところまで |
| **Cloudflare 403 のページ（ZenMarket）** | live を読めない | 写しの経過日数を報せる。「読めている」とは表示しない |
| **モデルが知らない費目**（保管料、輸出通関、Recommended Stores の店舗単位の ¥300） | スキーマに鍵が無いものは V5 の対象外。店舗単位の区分はサイト粒度で表せない | fees.md の費目一覧とスキーマの鍵を人が突き合わせる。表示で「not detected here」と開示（T4） |
| **`sites` ブロックの誤り**（別エージェントのスクリプトが対応サイトを誤って yes/no にする） | 上流の誤りはそのまま流れる | `support` にも evidence を要求し、fees-check の引用検査に乗せる |
| **引用の言い換えによる偽陽性**（数字は変わらず文だけ直された） | 引用が消えたと報せる | 人が確認して引用を更新する。誤報の向きは「余計に見る」側なので許容 |
| **人が `unknown` を放置する** | 書けば通る | `index.json` と毎週のログに残す。それでも放置はできる |
| **数字が正しくて計算が間違う**（compare.ts のロジック） | データ設計の範囲外 | 既存のテストと監査（logic.md） |
| **同じ引用を複数 figure が共有していて、片方だけ変わる改定** | 引用の粒度が文なので、文の中の 2 つの数字を区別できない | figure ごとに引用を分ける運用。V7 が「その figure の値が引用に無い」で拾える場合もあるが、必ずではない |

---

## 付録 A — 現行コードで見つけた、この設計が直す具体箇所

読みながら見つけたものを、実装者のために列挙する（コードは変えていない）。

1. `src/lib/search/sites.ts` の `Site.jauceFree` と `src/lib/pricing/services.ts` の `freeForSites: ['rakuten','yahoo-shopping']` は
   同じ事実の二重管理。`sites.test.ts` がこれを主張している。
2. サイトの表示名が 3 か所にある: `search/sites.ts` の `name`、`FeeTable.tsx` の `SITE_LABEL`、`ItemList.tsx` の `SITE_NAMES`。
   後ろ 2 つは `Record<SiteId, string>` なので typecheck は効くが、文字列は手で 3 回書く。
3. `shops.ts` の `SINGLE_SHOP_SITES` / `PER_LISTING_SITES` は配列で、サイトを足しても typecheck は落ちない（`shops.ts` 冒頭が
   自分でこの危険を書いている）。
4. `src/app/sources/page.tsx` の FROM JAPAN 段落「the original does not say whether it is charged once per order or once per item」は、
   作業ツリーの `services.ts`（`paymentInsideJapanSites: ['yahoo-auctions']`、tier fixed、「原文に per auction と書いてある」）と矛盾。
   同ページの Jauce 段落「we have not seen the original wording」（入金手数料）も、原文取得済み（fees.md §5「Depositing fee: JPY 40 + 3.9%…」）と矛盾。
5. `services.ts` の `sourceUrl` は ZenMarket が `/ja/fees.aspx`、引用は英語ページ（`/en/fees.aspx` の写し）から。監視対象と根拠のページが違う。
6. `data/fee-pages.json` に Jauce の項目は**今はある**（fees.md #15 の時点では無かった。`a85a50e` で直っている）。
7. `scripts/weights-build.ts` を呼ぶテストも CI ステップも無い。生成物と原本のドリフトは検知されない。
8. 作業ツリーの `services.ts` で ZenMarket の deposit tier が `fixed → estimate` に変わっている途中（コメントに根拠）。
   この種の「tier を変えた理由」がコメントにしか残らないのが、evidence を構造化する動機そのもの。
