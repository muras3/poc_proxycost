import type { Tier } from './types';

/**
 * `master/fees.json`（および `master/customs.json`）の `tier` の3値。
 * `master/fees.json` の `$comment` の定義:
 *   A_confirmed … 各社公式の明記（quote 付き）
 *   B_inferred  … 一次情報からの推論（inference_basis 付き）
 *   C_unknown   … 未確認・未取得（quote も inference_basis も無い）
 */
export type MasterTier = 'A_confirmed' | 'B_inferred' | 'C_unknown';

/**
 * PR #137 の Fable 監査（`docs/audit/fable-review-2026-09-12.md` 系）が見つけた欠陥への対応。
 *
 * `master/fees.json` の確度語彙（3値、上）と `src/lib/pricing/types.ts` の `Tier`
 * （4値: `fixed` / `estimate` / `unverified` / `none`）は、**別々に生まれた別語彙**で、
 * これまでどこにも明示的な対応表が無かった。この1箇所だけがその対応表。
 *
 * ## 対応の根拠
 *
 * `Tier` の定義（`types.ts` 冒頭のコメント）:
 *   fixed      … 各社の公開料金表・日本郵便の公表料金（一次情報）
 *   estimate   … 我々の仮定、または利用者が触った値
 *   unverified … 二次情報。原典に当たれていない
 *   none       … 未取得
 *
 * - **A_confirmed → fixed**: どちらも「その社（または日本郵便）が公式に明記した値」を
 *   指している。A_confirmed は quote 付きが条件、fixed も「公開料金表」が条件。意味が
 *   ほぼ同一なのでここに疑問の余地はない。
 *
 * - **B_inferred → unverified**: `unverified` の定義は「二次情報。原典に当たれていない」。
 *   `master/fees.json` の B_inferred 行の実例（F26/zenmarket・F26/neokyo・F07/zenmarket・
 *   F29/jauce・F36/fromjapan）はいずれも、**その社自身の一次情報を確認できていない**まま、
 *   他社の確定値や日本郵便の公表表を借りて推論している——これはまさに「原典（その社自身の
 *   公式ページ）に当たれていない」状態そのもの。`estimate`（我々自身の仮定）とは違う——
 *   B_inferred は「何らかの一次情報はある。だがそれはこの行の対象自身のものではない」
 *   という、`unverified` の定義に正確に一致する状態。
 *
 *   **例外（この対応表の外）**: ZenMarket ヤフオク¥800（`T-F11a`、F02/zenmarket の
 *   `rule.inferred_marketplaces.yahoo_auction`）は同じ B_inferred でも性質が違う——
 *   その社自身の公式ページの quote は確認できている（¥800 という額そのものは一次情報）。
 *   不確かなのは「その分類（JDirectItems Auction）がヤフオクを指すか」という**我々の解釈**
 *   の方であって、原典に当たれていないことではない。`tierTitle.estimate`
 *   （「Our estimate, not a published figure」）の方が実態に近いので、コードは
 *   `estimate` のまま据え置く（既存の判断。ここでは変更しない）。同じ理由で
 *   F07/jauce の入金手数料（¥40 + 3.9%、額自体は quote 付きで A_confirmed）も、
 *   コード側は「gross-up として効くという計算式の解釈」を確認できていないとして
 *   `unverified` を維持している（`services.ts` のコメント参照）——これも「額の確度」と
 *   「計算式の確度」という別軸の話で、この対応表がカバーする「行の tier」とは別物。
 *   `master-sync.test.ts` の TIER チェックはこの1件を既知の例外として個別に記録する。
 *
 * - **C_unknown → none**: `none` の定義は「未取得。画面では『—』」。C_unknown は
 *   quote も inference_basis も無い、額そのものが取れていない行。`none` の定義と
 *   完全に一致する。
 *
 * `estimate` に対応する master 語彙は無い——`estimate` は「我々自身の仮定」（例:
 * Buyee の入金手数料をZenMarketの公表値から借用した暫定値）であって、そもそも
 * その社の master 行の値ではないことが多い（`F07/buyee` 等は NOT_IN_CODE。
 * master 行自体が「非公表」という事実の記録で、額を持たない）。
 */
export const MASTER_TIER_TO_CODE_TIER: Record<MasterTier, Tier> = {
  A_confirmed: 'fixed',
  B_inferred: 'unverified',
  C_unknown: 'none',
};
