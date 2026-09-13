# FROM JAPAN: Export Clearance Fee across the F26 threshold

Date: 2026-09-13. Ingested by PR #117 (as `invoice_check: confirmed_calculator` for F26/FROM JAPAN); supersedes the open question recorded in PR #113.

Measured at `https://www.fromjapan.co.jp/en/estimate/`. Fixed conditions: Germany, 1 kg, 20×15×10 cm, domestic shipping ¥0. **Three runs per price, identical every time.**

| 入力価格 | 結果画面の価格 | Export Clearance Fee | Handling fee | 3回の結果 |
|---:|---:|---:|---:|---|
| ¥150,000 | ¥150,000 | ¥0 | ¥500/Item | 3回とも同一 |
| ¥250,000 | ¥250,000 | **¥2,800** | ¥500/Item | 3回とも同一 |
| ¥500,000 | ¥500,000 | **¥2,800** | ¥500/Item | 3回とも同一 |

What else moved with price:

- Sub-total of Charge 1: equal to the input price
- Sub-total of charge 2: ¥4,350 → ¥7,150
- Total: ¥154,350 / ¥257,150 / ¥507,150
- International shipping, Handling fee, Payment Fees and domestic shipping: unchanged

Screen notes, verbatim:

> * Your final payment will be determined by actual cost and may vary from the estimate provided in this tool.
> * Estimated cost does not include possible customs duties. Details and cautionary points regarding customs procedures may be confirmed here.
> * Depending on the shipping method used, fees for non-standard delivery areas may be incurred.

**Conclusion: our F26 ¥2,800 and its ¥200,000 threshold are both correct.** The ¥0 seen in the earlier seven-country round was simply a ¥1,000 item not meeting the threshold — there was never a contradiction, and PR #113's four-way open question is answered by this.

This capture followed CLAUDE.md §10's discipline (one condition at a time, repeated runs, inputs verified against the screen), which is why it is trustworthy where the earlier Jauce and FROM JAPAN rounds were not.
