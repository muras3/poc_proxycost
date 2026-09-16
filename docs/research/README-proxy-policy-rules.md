# 代行5社の禁止・制限ポリシー調査（2026-09-16 受領）

`proxy-policy-rules-2026-09-16.xlsx` は**外部（GPT）が実施した調査の生成果物**である。
オーナーが 2026-09-16 に受領し、失われないようそのままリポジトリに保管した。

**この時点では engine に配線されていない。**`src/lib/pricing/` はこのファイルを読んでいない。

## 中身

| シート | 行数（ヘッダ込） | 内容 |
|---|---:|---|
| `policy_rules` | 53 | 社 × 規則。`action`（purchase / international_shipping / shipping_method）と `status`（prohibited / conditional）を分けている |
| `category_matrix` | 32 | カテゴリ × 5社の可否。`UNKNOWN` が多数 |
| `attribute_rules` | 11 | 閾値つきの規則（リチウム電池 100 Wh、1梱包2個、5 kg/箱 など） |
| `provider_discretion` | 9 | 社の裁量条項。カテゴリだけでは判定できない箇所 |
| `unknowns` | 17 | 未解決の問いと、その検証方法 |

## 取り込む前に確認が要ること

このファイルは本リポジトリの証拠の扱い（`docs/FEE-ITEMS.md`・`master/` の tier）とは**別の語彙**で書かれている。
`source_url` / `source_quote` / `source_type` / `checked_at` / `evidence_level` の列を持つので対応は取れるが、
**取り込みの際に次を確認せずに master 化しないこと:**

- `evidence_level: confirmed` が、本リポジトリの `A_confirmed`（自分で原典を読んだ）と同じ意味か。
  **このファイルを作ったのは我々ではない。**引用文が実際に `source_url` に存在するかは未検証。
- `category_matrix` の `UNKNOWN` は「取得できなかった」であって「該当しない」ではない。
  `—`（発生しない）と混同しない（`docs/DESIGN-NOTES.md` §2）。
- `provider_discretion` は、カテゴリ一致だけでは判定できないことを社自身が言っている箇所。
  ここを「判定できる」と描くと、ProxyCost が最も嫌う種類の誤りになる。
- `unknowns` に HIGH が複数ある。**5社分が揃っていない状態で「購入可否」を名乗らない。**

## 経緯

外部レビュー（2026-09-15）が「料金精度は上がったが、そもそも買えるのかが最大の穴」と指摘した。
`/sources` 自身も "Every total assumes the parcel can be sent. We never check that." と書いている。
その欠落を埋めるための一次材料が本ファイル。
