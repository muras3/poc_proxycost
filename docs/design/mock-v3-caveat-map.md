# mock-v3 caveat map (2026-09-15)

Scope: `prototypes/mock-v3.html`, built on `mock-v2.html` + `caveat-ui-grammar.md`. Numbers are
`docs/design/caveat-coverage-audit.md` section 2. "Not shown" here means: not in the DOM at all, not even
behind an open row / `<details>` / `section`. The owner's brief says the 100-item list does not all need to
be on screen -- completeness is already guaranteed by the audit table, not by this screen -- so this file is
the record of what v3 chose to leave out and why, kept out of the screen itself.

Column "v3 form": form = drawn as a shape/line/mark (no sentence needed); label = a single word + icon;
open = only inside an opened row / cart / `<details>`; not shown = absent from the DOM.

| audit # | caveat | v3 form | why |
|---|---|---|---|
| 1 | no comparable row | form (`.norank` block, all rows fall below the line) | replaces the board; per-company reasons stay in `.wcbo` |
| 2,3,4 | indeterminate ranking | form (bar fades under the leader; `LEADS` stamp) + 1 short line | the fact that only the *leader's* bound is open (audit §3-1) cannot be drawn without a legend, so one line names it; no "N companies" wording |
| 7 | rank unstable with weight | form: red dot on the decisive cart item (visible on the folded 1-line cart, not only when opened) + a wobbling scale-needle icon (`.wmk`) next to the 1st-place stamp; both open the same popover on request. Reduced-motion swaps the wobble for a static filled wedge of the same angular width | 2026-09-15 owner review: the "1st place changes if weights are off -- mostly the weight of X" sentence was removed outright, not shortened -- the item mark + needle carry "which weight, how much it can swing" without naming it in a sentence |
| 22 (bar scope) | any row's total range, not only the leader's | form: `.totbar` under every row's total, all rows sharing one 0..max scale so two rows' bars visibly overlap when they can't be told apart | 2026-09-15 owner review: previously only the leader's own bar (in `.dbar`) showed uncertainty; "at least" text and the total's own `+` glyph are now gone everywhere (summary and rows), replaced by this bar |
| 57 (bar form) | courier day figures | form: `.daybar`, a shared log-scale (1-90 day) bar -- solid fill = published, dashed = courier's own label (unmeasured), dotted+no fill = not published, open red ring at the bar's own end = untracked | 2026-09-15 owner review: "days n/p" and "untracked" words removed; the short day figure stays as a label next to the bar, per owner's instruction that the number itself may remain |
| 12 | decisive but same winner name | 1 clause, rewritten (audit §3-3): "the recommended set still changes... even though the named winner reads the same" | still text: the engine gives single winner names, not the two winner *sets*, so a shape can't be drawn without a new field (see grammar §5, needed field `bracketAtLow/High`) |
| 21,78,79,80 | costs left out of the total | form: named line under the row (`+ Sales tax / VAT`), no sentence | replaces the audit's bare `+` |
| 22 | upper bound unknown | form only (bar fades right, `¥X+`) | no "or more" text |
| 24 | `≈`/approximate | **removed** | true on every comparable row (audit §3-5); a mark that never varies carries no information |
| 26,27,28 | recommended / equivalent | form (indigo left-rule groups the rows, no badge word) | 3 badge strings collapsed into 1 shape |
| 31 | "1 parcel assumed" | open (Boxes column stays a count; the `· assumed` word is in the opened Packed log) | a count column has no room for a qualifier without breaking the 390px 3-column row |
| 34 | Surface alternative | open (delivery-log Export stage) | this is unchanged from mock-v2; a form for "there is a slower, cheaper way that isn't in the ranked total" would need its own row and was judged to add more clutter than the sentence it replaces |
| 37,37b,37c,38 | box split reason / duty per box | form: line style between boxes (dashed = weight-limit split, dotted = shop unknown, solid = different shop) + open figcaption for the duty/VAT detail | "OVER LIMIT" text removed per kill-list §4 |
| 39,40 | `SplitDisclosure` / "each box priced separately" owner text | **not shown** | inherited gap from mock-v2; the two owner-authored sentences have no engine field behind them (the box split reason line already carries the operational meaning) and re-adding them as paragraphs would put a "解説文" back in the closed screen, which the brief rules out. Flagged, not fixed, in this pass. |
| 41 | "if boxes were combined into one" heading | **not shown** (mock-v3 keeps mock-v2's platform/scale metaphor instead) | same metaphor substitution as v2; the scale under the board already answers "how would the total move" without a heading |
| 45 | above the EMS table | **not shown**, absorbed into #1's no-rate screen | no separate rung exists once the ladder itself isn't drawn (mock-v2 already dropped `WeightLadder`) |
| 46 | "+¥0 same EMS weight step" chip | **not shown**, absorbed into the scale (`.heft`) sinking or not sinking | the scale's own movement is the replacement shape; a text chip on top of it would duplicate the cue |
| 47 | 4-tier confidence legend | open (delivery-log heading + `§`), line-style only on-screen | legend text only needed once, not per row |
| 53 | Buyee free-shipping listings can still owe domestic shipping | **not shown** | mock-v2 never wired the `FreeShippingDomesticNote` at all (audit calls this a real gap, not a v2-vs-v3 difference); v3 inherits the gap. To fix properly needs a per-row `!` keyed to `freeShipping && domesticShippingYen==null`, which the design doc assigns to §1.1 #53 but this build did not reach in the time available |
| 57 | courier day figures are label-derived, not measured | form (dashed underline on the day text, same line-style as every other estimate) | previously drawn with full confidence (audit §3-9); now visually equal to "our estimate" |
| 64,77,84,85 | US duty floor / UK alcohol excise / alcohol-in-cart / long-item-in-cart warnings | **not shown / not reproducible** | mock's cart cannot construct an item on a restricted weight line (audit §1.2); unchanged from mock-v2 |
| 82 | "goods restrictions not checked" | form: 1 icon button (boxed item behind a slash, `.iconband`) opening the wording on request; no `!` unless GB/DE (lithium) | kill-list §9: a mark on every screen is not a warning, it's wallpaper. 2026-09-15 owner review: replaced the 1-line sentence with an icon -- wording only in the popover now |
| n/a | "Fuel surcharge included, remote-area surcharge not included" | form: 1 icon button (fuel pump + map pin, `.iconband`), same treatment as #82 | 2026-09-15 owner review: same rule as #82 -- an always-true line earns an icon, not a sentence, on the closed screen |
| n/a | "One box only if you ask [service] to combine your orders" (Buyee consolidated variant) | form: Boxes column draws `1 <-> N` (`.boxpair`) instead of the count, and both the default and consolidated rows for that service carry a matching left rule (`.boxtie`) | 2026-09-15 owner review: sentence removed; the two-state shape says "ask and get 1, don't and get N" without naming the service in a sentence each time |
| 83 | lithium airmail refused to GB/DE | form-adjacent: 1-line `!` that only appears for those two destinations | engine has no `destinationFacts.lithiumAirmailListed` field (grammar §5); the `['GB','DE']` pair is hardcoded from `RestrictedGoodsNote.tsx` as read during the audit, not derived live -- flagged as a NEEDS FIELD, not a permanent design choice |
| 92 | "What could be off" — Not included list | open, trimmed | the "Not included" sub-list is deleted per kill-list §11 (duplicates the new `+ line name` under each row); Estimated / Second-hand / weight items kept |
| 99 | amount `title` attribute | **not shown** (no hover tooltip) | replaced by `§` per the grammar doc; a title attribute is invisible on touch and duplicates the `§` popover |

## What changed in *form*, not presence (already visible in mock-v2, re-expressed here)

- #22/#23 total bar: now fades on the right when the upper bound is unknown, instead of relying on the `+` glyph alone.
- #26-28: three badge strings -> one indigo bracket rule shared by the rows inside the leader's band.
- #37c: box-to-box line style instead of "OVER LIMIT" red text.
- #57: courier days get the same dashed line-style as every other estimate.
- #82: the always-on band lost its `!` (kill-list §2); only a destination-specific fact (lithium, #83) still earns one.
- #21/#78/#79/#80: the missing-cost names are now printed under the row instead of only visible as a bare `+`.
- #2-4 / §3-1: summary and condition line now say "the leader's own upper bound is open" rather than "N companies are within our error."
- Flap animation (kill-list §6): numbers now flip straight to their new value; the random-glyph scramble is removed.
