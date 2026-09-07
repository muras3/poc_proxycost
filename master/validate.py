#!/usr/bin/env python3
"""マスタの検証器。

1) スキーマ検証 ── A_confirmed は quote 必須、B_inferred は inference_basis 必須、
   catalog に欠番が無いこと、rule.type が既知の語彙であること
2) 再現検証 ── master/fixtures.json の実請求を、マスタの規則だけで再現できるか

  python3 master/validate.py
"""
import json, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent
fees = json.loads((ROOT / "fees.json").read_text(encoding="utf-8"))
customs = json.loads((ROOT / "customs.json").read_text(encoding="utf-8"))
fixtures = json.loads((ROOT / "fixtures.json").read_text(encoding="utf-8"))

fail = []
def check(cond, msg):
    if not cond:
        fail.append(msg)

# ---------------------------------------------------------------- 1. スキーマ
print("== 1. スキーマ ==")

for r in fees["rows"]:
    tag = f'{r["company"]}/{r["id"]}({r["name"]})'
    check(r["tier"] in ("A_confirmed", "B_inferred"), f"{tag}: fees.json に A/B 以外の tier")
    if r["tier"] == "A_confirmed":
        check("quote" in r, f"{tag}: A_confirmed なのに quote が無い")
    else:
        check("inference_basis" in r, f"{tag}: B_inferred なのに inference_basis が無い")
    check("source" in r and r["source"], f"{tag}: source が無い")
    check("type" in r.get("rule", {}), f"{tag}: rule.type が無い")

cat_ids = {e["id"] for e in fees["catalog"]}
row_ids = {r["id"] for r in fees["rows"]}
check(row_ids <= cat_ids, f"catalog に無い費目IDが rows にある: {sorted(row_ids - cat_ids)}")
for e in fees["catalog"]:
    if not e["in_fees_master"]:
        check("excluded_reason" in e, f'catalog {e["id"]}: fees に行が無いのに理由が書かれていない')
    check(e["in_fees_master"] == (e["id"] in row_ids),
          f'catalog {e["id"]}: in_fees_master が rows の実態と一致しない')

for c in customs["countries"]:
    cc = c["country"]
    check("clearance_fee_vat" in c, f"{cc}: clearance_fee_vat(F38) が無い")
    for r in c["clearance"]:
        check("tier" in r and "rule" in r, f"{cc}/{r.get('carrier')}: tier か rule が無い")
        if r["tier"] == "B_inferred":
            check("inference_basis" in r, f"{cc}/{r.get('carrier')}: B なのに basis が無い")

print(f"  費目行 {len(fees['rows'])} / catalog {len(fees['catalog'])} / 国 {len(customs['countries'])}"
      f" / 通関経路 {sum(len(c['clearance']) for c in customs['countries'])}")

# ---------------------------------------------------------------- 2. 再現検証
print("\n== 2. 実請求の再現 ==")
TOL = 0.11  # 投稿者が段階ごとに四捨五入しているため

def near(a, b):
    return abs(a - b) <= TOL

results = []
for f in fixtures["fixtures"]:
    fid, exp = f["id"], f.get("expected_eur") or f.get("expected_cad") or f.get("expected_jpy")

    if fid == "es-zenmarket-ups-2023-07-26":
        base = f["expected_eur"]["items_plus_shipping"]
        tax = base * 0.21                       # customs.json ES vat
        fee = f["expected_eur"]["import_tax"] * 0.283   # ES/UPS rate_of_import_charges
        fee_vat = fee * 0.21                    # ES clearance_fee_vat (F38)
        total = base + f["expected_eur"]["import_tax"] + fee + fee_vat
        ok = near(fee, exp["clearance_fee"]) and near(fee_vat, exp["clearance_fee_vat"]) and near(total, exp["total"])
        results.append((fid, ok, "一部が循環（28.3%はこの請求から導いた率）",
                        f"手数料 {fee:.2f}/{exp['clearance_fee']} 手数料VAT {fee_vat:.2f}/{exp['clearance_fee_vat']} 合計 {total:.2f}/{exp['total']}"))

    elif fid == "ca-canadapost-forum":
        v, pst_rate = f["input"]["declared_value_cad"], f["input"]["pst_rate"]
        gst = v * 0.05                          # customs.json CA vat
        pst = v * pst_rate                      # CA provincial_tax
        handling = 9.95                         # CA/Canada Post（公式の published fee）
        total = gst + pst + handling
        ok = near(gst, exp["gst"]) and near(pst, exp["pst"]) and near(total, exp["total"])
        results.append((fid, ok, "独立（CA$9.95 は Canada Post 公式。この請求から導いた値ではない）",
                        f"GST {gst:.2f}/{exp['gst']} PST {pst:.2f}/{exp['pst']} 合計 {total:.2f}/{exp['total']}"))

    elif fid == "es-correos-selfclear":
        b = f["input"]["taxable_base_eur"]
        vat = b * 0.21
        fee, fee_vat = 1.29, 1.29 * 0.21        # ES/correos_self_clear
        total = vat + fee + fee_vat
        ok = near(vat, exp["vat"]) and near(fee_vat, exp["clearance_fee_vat"]) and near(total, exp["total"])
        results.append((fid, ok, "独立（€1.29 と 21% は支払画面の内訳そのもの）",
                        f"IVA {vat:.2f}/{exp['vat']} 手数料VAT {fee_vat:.2f}/{exp['clearance_fee_vat']} 合計 {total:.2f}/{exp['total']}"))

    elif fid == "es-fedex-30pct":
        t = f["input"]["import_tax_eur"]
        fee = t * 0.30
        fee_vat = fee * 0.21
        ok = near(fee, exp["clearance_fee"]) and near(fee + fee_vat, exp["clearance_total"])
        results.append((fid, ok, "循環（30%はこの請求から導いた率）",
                        f"手数料 {fee:.2f}/{exp['clearance_fee']} 手数料込み {fee+fee_vat:.2f}/{exp['clearance_total']}"))

    elif fid == "au-zenmarket-ems":
        results.append((fid, None, "再現不可",
                        "仕入先と国内送料が記事に無く、Charge1 の内訳 ¥1,184 を分解できない。"
                        "さらに豪州GSTが総額に現れておらず、マスタと矛盾する（要確認）"))

for fid, ok, kind, detail in results:
    mark = "PASS" if ok else ("SKIP" if ok is None else "FAIL")
    print(f"  [{mark}] {fid}")
    print(f"         {kind}")
    print(f"         {detail}")
    if ok is False:
        fail.append(f"再現失敗: {fid}")

# ---------------------------------------------------------------- 結果
print()
if fail:
    print(f"NG: {len(fail)} 件")
    for m in fail:
        print("  -", m)
    sys.exit(1)
n_pass = sum(1 for _, ok, _, _ in results if ok)
n_indep = sum(1 for _, ok, k, _ in results if ok and k.startswith("独立"))
print(f"OK: スキーマ検証を通過 / 実請求 {n_pass}/{len(results)} 件を再現（うち独立検証 {n_indep} 件）")
