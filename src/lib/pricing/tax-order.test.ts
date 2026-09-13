import { describe, expect, test } from 'vitest';
import { taxLines } from './compare';
import { rateFor } from './rates';
import type { ParcelTaxBasis } from './compare';

/**
 * 監査 (docs/audit/close-coverage-gaps-2026-09-13.md ③): `taxLines` は
 * 非export で、`compare()` 経由の間接検査しか無かった。**関税→VAT という
 * 積み上げの順序自体を主張するテストが無かった。**
 *
 * `compare.ts` を読んで確認した実際の順序（`taxLines` 本体、277行目以降）:
 *
 *   1. まず個口ごとの課税ベースを組み立てる:
 *        cifP       = itemsYen + domYen + emsYen  （商品代＋国内送料＋国際送料）
 *        baseYenP   = base === 'CIF' ? cifP : itemsYen
 *        declaredP  = itemsYen / 為替レート        （免税限度の判定は運賃を除いた商品代のみ）
 *   2. **関税を先に確定する**（`dutyPerParcel`）:
 *        declaredP が dutyFreeLimit 以下なら 0（'free'/'no-duty'/'flat')。
 *        超えていれば dutyBaseYenP * dutyRate（カナダだけ dutyBaseYenP が別式、
 *        それ以外は dutyBaseYenP = baseYenP）。
 *   3. **VAT/GST はそのあとに、関税を含めたベースで計算する**（`vatPerParcel`）:
 *        vatBaseP = base === 'CIF' ? cifP + dutyYenP
 *                 : cc === 'CA'    ? itemsYen + domYen + dutyYenP
 *                 :                  itemsYen + emsYen        （米豪星＝FOB系、関税を含めない）
 *        vatYen = vatBaseP * vatRate
 *
 * つまり **base: 'CIF' の国（GB・DE・FR など）とカナダは「関税→VAT」のカスケード**
 * （VATの課税標準に関税額を足す）で、**base: 'FOB' の国（米・豪・星）は関税を
 * VATベースに入れない**——`vatBaseP` の分岐がそれを直接示している。
 *
 * 下のテストは GB（base: 'CIF'）で、関税が発生する条件を作り、
 * 「VATが関税を含めたベースで計算されている」ことを直接固定する。
 * 関税が0（免税）の条件では duty+VAT どちらの順で計算しても同じ結果になり
 * 順序の効果が見えないので、必ず declaredP が dutyFreeLimit を超える条件を使う。
 */
describe('taxLines: duty is added to the tax base before VAT (docs/audit ③)', () => {
  test('GB: VAT is computed on (CIF + duty), not on CIF alone', () => {
    const itemsYen = 100_000; // GBP 100,000/211.40 ≈ 473 > £135 なので関税が発生する
    const parcels: ParcelTaxBasis[] = [{ itemsYen, domYen: 0, emsYen: 0, units: 1 }];
    const { lines } = taxLines('GB', null, [], parcels);
    const duty = lines.find((l) => l.key === 'duty')!;
    const vat = lines.find((l) => l.key === 'vat')!;

    const dutyRate = 0.029; // COUNTRIES.GB.dutyRate — countries.test.ts / taxes.test.ts が別途固定する
    const vatRate = 0.20; // COUNTRIES.GB.vatRate
    const expectedDutyYen = itemsYen * dutyRate; // cifP === itemsYen（domYen/emsYenを0にしたのでbaseYenP=itemsYen）
    const expectedVatOnCifPlusDuty = Math.round((itemsYen + expectedDutyYen) * vatRate);
    const expectedVatOnCifOnly = Math.round(itemsYen * vatRate); // もし順序が逆で関税を含めなかった場合の値

    expect(duty.amount).toBe(Math.round(expectedDutyYen));
    // **これが順序の主張そのもの**: 実際の VAT は「関税を含めたベース」に一致し、
    // 「関税を含めないベース」とは一致しない（=関税が先に確定してから VAT の
    // 課税標準に足されている、というカスケードの証拠）。
    expect(vat.amount).toBe(expectedVatOnCifPlusDuty);
    expect(vat.amount).not.toBe(expectedVatOnCifOnly);

    // rateFor を使って、免税限度の判定が運賃を除いた商品代だけで行われている
    // ことも合わせて確認しておく（このテストの前提が成り立つための土台）。
    expect(itemsYen / rateFor('GBP')).toBeGreaterThan(135);
  });

  test('GB: below the duty-free threshold, duty is 0 and VAT is on CIF alone (no cascade effect to hide)', () => {
    const itemsYen = 10_000; // GBP 10,000/211.40 ≈ 47 < £135、免税
    const parcels: ParcelTaxBasis[] = [{ itemsYen, domYen: 0, emsYen: 0, units: 1 }];
    const { lines } = taxLines('GB', null, [], parcels);
    const duty = lines.find((l) => l.key === 'duty')!;
    const vat = lines.find((l) => l.key === 'vat')!;
    expect(duty.amount).toBe(0);
    // 関税が0なので、カスケードの有無に関わらず VAT = itemsYen * vatRate と一致する
    // ——順序の効果は「関税が発生する条件」でしか観測できない、という前提の裏取り。
    expect(vat.amount).toBe(Math.round(itemsYen * 0.20));
  });
});
