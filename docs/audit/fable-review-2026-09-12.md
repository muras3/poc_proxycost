# Fable review — 2026-09-12 (origin/main = `64d6906`)

Adversarial review, findings only. No PR, no source changes. Every claim below was produced by executing `compare()` (tsx scripts in the scratchpad) and, for F1, by driving the built page in Chromium. Baseline at `64d6906`: `npx vitest run` 856/856, `python3 master/validate.py` OK, `python3 master/render-docs.py --check` OK.

Ranking is by what a user would be misled about, not by cleverness.

---

## F1 — Checkout-collected VAT/GST vanishes when parcels straddle the collect-at-checkout threshold (silent omission, flips a #1)

**Where.** `src/lib/pricing/compare.ts:1352-1368` gates `prepaidImportTaxLine()` on `worstParcelDeclared` (the *largest* parcel). `taxLines()` at `compare.ts:418-423` decides `seller-collects` *per parcel*. When at least one parcel is over the threshold and at least one is under, the under-threshold parcels get `vat.yen = 0` (“collected at checkout”) and the row gets **no** `prepaid-import-tax` line — the tax exists in neither place.

**Proof (executed).** AU, Buyee default, three yahoo-auctions items ¥45,020 / ¥45,020 / ¥168,825 (A$400 / A$400 / A$1,500), 500 g each:

```
vat        17078 [fixed] GST :: 10% on 1 parcel; the other 2 parcels owe none (collected at checkout by the service)
prepaid-import-tax  (no line)      excluded=[]      total={low:319468, high:319468}
boxes: ¥45020 per-listing vat=seller-collects/0 | ¥45020 per-listing vat=seller-collects/0 | ¥168825 per-listing vat=rate/17077
```

Control: the same company, one A$400 parcel, emits `prepaid-import-tax ¥4,752 "GST collected at checkout"`. SG behaves identically. Since #85 (§2④ weight splits) it also hits single-parcel companies: ZenMarket → DE, two items €100/€300 at 1,200 g each, `method: small-packet-air` splits into 2 boxes; box 1 is `seller-collects` (IOSS), the clearance note even says “1 parcel already paid tax at checkout”, no checkout line exists, `total.high === low`.

**On the real page (Chromium, `next start` of the webpack build).** Buyee default renders as rank 1, “CHEAPEST”, “★ Recommended — sole top pick”, approx. total **¥319,500 with no “or more”**; the GST row says “the other 2 parcels owe none (collected at checkout by the service)”; each split box says “VAT / GST: collected at checkout, not at the border”; there is no checkout-collection row anywhere.

**Size.** The missing GST is ≥ ¥9,004 (10% of ¥90,040 goods; Buyee’s base is Charge 1 + Charge 2, so more). Buyee default leads FROM JAPAN by ¥2,208. **The omission decides the #1 and the badge.**

**Why it is invisible from every direction.** Not in `excluded[]`, not in `WhatCouldBeOff` (which reads line tiers — a missing line has no tier), does not open `total.high`. Same shape as the `if (svc.deposit)` archetype. Note also `compare.ts:1355` calls passing the largest parcel the “safe side”; for this case it is the unsafe side.

**What a user concludes.** That Buyee default is the cheapest with certainty, and that “collected at checkout” is a cost already inside the total.

---

## F2 — Light US carts: three companies are told “does not ship EMS to United States — its options there are couriers, which we do not price” (both halves false)

**Where.** `compare.ts:1067` — the `'cheapest'` resolution ends with `?.id ?? 'ems'`. Every courier grid starts at 500 g (`postage.ts:422`), and Buyee / FROM JAPAN / Neokyo have `unavailableIn: ['US']` for all Japan Post methods (#92). For a packed weight under 500 g (net ≲ 166 g) nothing prices, the row silently becomes `method: 'ems'`, and `notComparableReason` (`compare.ts:1523-1525`) says the company does not ship EMS to the US and that we do not price its couriers.

**Proof.** US, one ¥3,000 yahoo-auctions item at 50 g or 150 g: `fromjapan`, `neokyo`, `buyee` all non-comparable with exactly that sentence; `excluded` lists “EMS to United States”. At 170 g (504 g packed) the same three price fine on ECMS / DHL. The default example cart at ⅓ weight hits the same path for Buyee default, which is what makes `rankStabilityNote` say “Beyond that the parcel leaves the published EMS table” (F5).

**What a user concludes.** That a trading card cannot be sent to the US by three of five companies, and that the site does not price their couriers. The true statement is “below the lightest weight we measured for their couriers (500 g)”.

---

## F3 — Postal-route facts are charged and asserted on courier rows (master ⟂ src)

`taxLines()`, `exportClearanceLine()` and the Zonos line are method-agnostic; courier rows inherit Japan-Post-only facts.

**(a) F26 export clearance ¥2,800 on courier rows.** `master/fees.json` F26 (buyee, fromjapan) has `when.carrier_in: ["JapanPost_all"]`, quotes “sent through Japan Post”; `docs/MASTER.md:100` says “日本郵便を使う限り発生する”. `compare.ts:1303` adds it unconditionally. Proof: US cart ¥250,000 — ECMS / UPS / DHL rows all carry “Export clearance fee ¥2,800 — … Japan Post treats parcels sent together …”. Every courier row over ¥200k is overstated by ¥2,800 and attributes the fee to the wrong carrier.

**(b) Postal handling fees on courier rows.** GB ECMS / DHL / FedEx rows: “Customs clearance fee GBP 8 × 1 parcel — Royal Mail handling fee”. CA UPS row: “CAD 9.95 × 1 parcel — Canada Post handling fee”. `master/customs.json` CA records a separate `route: courier` brokerage (CA$10–50+, B_inferred). `docs/ROADMAP.md` 2d says courier clearance is “現状（0円計上）” — true only for the US; in GB / CA / DE / FR / SG the courier row carries the *postal* carrier’s fee under the postal carrier’s name, next to the null “Destination-side courier fees (unpublished)” line. The unknown line does open `total.high` (honest); the labelled amount is the untruth.

**(c) Zonos on courier rows.** US UPS / DHL / ECMS rows list “US import prepayment (Zonos) fee — not published :: Japan Post accepts US-bound mail only if the sender prepays duty through Zonos…” in `excluded`, and their clearance note reads “duty is prepaid by the sender through Zonos, so the Postal Service has nothing to collect”. Neither applies to a courier shipment.

**What a user concludes.** That a FedEx/UPS parcel goes through Royal Mail / Canada Post / USPS-Zonos, and (over ¥200k) pays Japan Post’s export fee.

---

## F4 — `ConsolidationCallout` says “It is free” while the same result says it cannot confirm that

`src/components/compare/ConsolidationCallout.tsx:12-14`: “ask them to consolidate before shipping. It is free and saves about ¥{def.low − con.low}”. `services.ts:1661-1665` (F14/buyee) says “the amount (if any) is not published; we could not confirm it is free”, and that line is why `buyee:consolidated` has `total.high === null`. Proof (US default cart): `con.excluded = ["Package consolidation", …]`, `con.high = null`, callout would print “It is free and saves about ¥1,593”. `master/fees.json` F14/buyee: `amount: "unknown"`, `amount_tier: C_unknown`.

---

## F5 — EMS-centric prose that is now false because couriers win by default

Executed on the UI’s example cart: **all seven countries’ cheapest rows are couriers** (ECMS Express, FedEx, FedEx Lowcost, ECMS, UPS; all `tier: estimate`).

- `src/components/compare/WhatCouldBeOff.tsx:64-65`: “The EMS rate is the published one, but the weight that picks it is ours” — printed under every result; the top row’s shipping is a courier estimate.
- `compare.ts:2055`: “Beyond that the parcel leaves the published EMS table.” is appended whenever any row drops comparability at ×⅓ or ×3, whatever the cause (US default cart: the cause is F2’s 500 g courier floor at ×⅓, nothing left any EMS table). `compare.ts:2066` similarly hard-codes “no published EMS rate covers the parcel”.
- `ParcelView.tsx:772-777` heading “Parcel — if everything ships together” is rendered above the per-listing split boxes (verified on page) and above the courier single box.
- `ParcelView.tsx` postal branch labels the figure “EMS postage” and draws the EMS ladder even when the cheapest row’s method is `small-packet-air` (`parcelStateFor` is EMS-only; e.g. US ZenMarket at 50 g).

---

## F6 — `Row.boxes[i].reason` is `'weight-limit'` on every box that was never split

`compare.ts:1126`: `… > 1 ? 'weight-limit' : split ? groupReason(gi) : 'weight-limit'`. Every single-box row (all five non-Buyee rows on the DE default cart, Buyee single-item rows) reports `reason: 'weight-limit'`. Not rendered today (`MultiBoxView` needs >1 box; `CourierSingleBoxView` does not print the reason), but the API asserts a split that did not happen — exactly the collapse the four-way split was meant to prevent, one consumer away. A fifth value (`'single'`) or `null` would be truthful.

---

## Tests (attack line 1)

**T1 — two `compare.test.ts` tests named “conservation” cannot fail.** §2⑤ block (“conservation: the sum of per-parcel declared values equals the cart total exactly”, ~line 506) and §2④ block (“conservation: splitting … the cart-wide duty base is exact”, ~line 596) assert `line(row, 'items').amount`, which is `itemsYen` summed from the cart (`compare.ts:910`) and never touches the boxes. Mutation: `declaredYen: 0` in `packOfGroup` (`compare.ts:941`) and `box.declaredYen += 0` in `packHeaviestFirst` (`parcels.ts:79`); `npx vitest run … -t conservation` → `parcels.test.ts` ×2 **failed**, `compare.test.ts` ×2 **passed**. (The `Row.boxes` tests at ~669/676 do sum `boxes[].declaredYen` — those are real.) Related: `ParcelBox.declaredYen` (from `b.declaredYen`) and the tax base `parcelTaxBases[i].itemsYen` (`compare.ts:1329`, recomputed from indices) are two independent computations of the same number; a divergence would be caught by neither “conservation” test.

**T2 — e2e `setMethod(page,'ems')` pins (#90): sound.** Each pinned test measures an EMS-only mechanism (ladder rung = postage figure; box grows only across a step; +¥0 chip; reduced-motion; keyboard growth) and still fails if that mechanism breaks. None asserts the pin took effect (e.g. `parcel-postage` count 1), but a silently ignored `selectOption` would make them fail loudly against the courier view, so no false green. The two new method-sensitivity tests use fixtures the author says were run through `compare()`; I confirmed 200 g → postal winner, 1500 g → courier winner.

**T3 — `NOT_IN_CODE`: no silencing found.** Every F07 entry asserts the borrowed 3.5% keeps `tier: 'estimate'` and `sourceUrl: null` — truthful. Two weak entries: F29/jauce ×2 assert `unpricedFees.length === 0` (proves “Jauce has no unpriced fees”, not “insurance is not wired”; passes if insurance were wired elsewhere, breaks spuriously if any unpriced fee is added). F13b/buyee’s `reason` says “まだ実装されていない” but the warning is implemented (`compare.ts` `domesticFor`, `FreeShippingDomesticNote`); classification defensible (warning_only ≠ line), reason text stale.

**T4 — “measured totals” pins.** The seven-country totals object was replaced wholesale for F07. It is an explicit regression pin of implementation output (header says so). Deltas are consistent: rows that already carried a deposit (ZenMarket, Jauce) are unchanged; the other three moved by a ~3.5% gross-up. Courier fixture values `4607` / `13578` trace to `services.ts` Buyee-Air US points (2,000 g → 4,607; 3 × 1,000 g → 4,526). Not evidence of correctness; not a loosening either.

**T5 — repointed fixtures (#85/#87/#90/F07).** AU→CA tie, DE→CA kendo, US→GB free-shipping swap, DE→GB “all-fixed row” (Jauce): each still exercises the named property; the “tie at top is unstable” test honestly became “tie at top puts both in the bracket” and records that no unstable-tie fixture exists any more.

---

## Verified negatives (where not to spend effort)

- `src/components/` holds no pricing re-derivation other than the EMS single-box preview, which #90 gated to postal-winning rows (residual: F5 last bullet).
- Volumetric: `courierPriceFor` applies **no** volumetric rule (observed prices include it; guarded to the default box), so no cross-company rounding can leak; all `volumetricDivisorCm3PerKg: 5000` entries are inert; the courier explainer states no divisor.
- Per-box tax rendering (`DUTY_TEXT`/`VAT_TEXT`) maps kinds faithfully: `flat` says “still charged under the duty-free line”, `no-duty` says no line applies, `free` cannot occur where `vatFreeLimit: 0`. The `seller-collects` text is the one F1 makes false.
- Split reasons: all four are rendered distinctly; `unresolved-shop` is never shown as “a different shop”.
- Deposit: all five services now carry `deposit`; the `if (svc.deposit)` hole is closed and `services.test.ts` pins the set.
- `totalRange`/`rankHighFor`/`computeBracket` behave as documented for `high === null`; `rowTotalRange` propagates `null`.
- The ePacket Light gap, courier non-wiring to §2④, and Buyee DE FedEx anomaly are recorded as stated in the brief; not re-reported.

## Checks run

`npx vitest run` → 856 passed (at `64d6906`); `python3 master/validate.py` → OK (schema pass, 4 fixtures reproduced, 0 master contradictions); `python3 master/render-docs.py --check` → OK. Mutation run restored byte-for-byte (`grep -c MUTATION` → 0, `git diff` empty). `next build --webpack` + `next start -p 3140` used for the Chromium probe, then stopped.
