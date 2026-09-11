#!/usr/bin/env python3
"""マスタの検証器。

1) スキーマ検証
2) 再現検証 ── master/customs.json の rule を**実際に読んで評価**し、実請求を再現できるか

  python3 master/validate.py

【重要】再現部に数値のリテラルを書かないこと。書いた瞬間に検証の意味が消える。
以前の版は 0.21 / 0.283 / 9.95 をコードにベタ書きしており、customs.json を
書き換えても PASS していた（Fable のレビュー R1 で指摘）。
"""
import json, sys, pathlib
from decimal import Decimal

ROOT = pathlib.Path(__file__).resolve().parent
fees = json.loads((ROOT / "fees.json").read_text(encoding="utf-8"))
customs = json.loads((ROOT / "customs.json").read_text(encoding="utf-8"))
fixtures = json.loads((ROOT / "fixtures.json").read_text(encoding="utf-8"))
CO = {c["country"]: c for c in customs["countries"]}

fail, warn = [], []
def check(cond, msg): (fail if not cond else warn).append(msg) if not cond else None

# =============================================================== 1. スキーマ
print("== 1. スキーマ ==")
VOCAB = set(fees["schema"]["rule_type_vocabulary"])

for r in fees["rows"]:
    tag = f'{r["company"]}/{r["id"]}({r["name"]})'
    check(r["rule"]["type"] in VOCAB, f"{tag}: rule.type '{r['rule']['type']}' が語彙集合に無い")
    check("source" in r and r["source"], f"{tag}: source が無い")
    if r["tier"] == "A_confirmed":
        check("quote" in r, f"{tag}: A_confirmed なのに quote が無い")
    elif r["tier"] == "B_inferred":
        check("inference_basis" in r, f"{tag}: B_inferred なのに inference_basis が無い")
    # 額が unknown の行は amount_tier を必須にする（A のまま点予測に使わせない）
    if "unknown" in json.dumps(r["rule"], ensure_ascii=False):
        check(r.get("amount_tier") == "C_unknown",
              f"{tag}: rule に unknown を含むのに amount_tier が C_unknown でない")
    # rule.inferred_marketplaces は、行全体が A_confirmed でも
    # マーケットプレイス単位で推論値であることを示す印。基準を必ず持たせる
    for mk, info in r["rule"].get("inferred_marketplaces", {}).items():
        itag = f"{tag}/{mk}"
        check(info.get("tier") == "B_inferred",
              f"{itag}: inferred_marketplaces の tier が B_inferred でない")
        check(bool(info.get("inference_basis")),
              f"{itag}: inferred_marketplaces に inference_basis が無い")
        check(bool(info.get("sources")),
              f"{itag}: inferred_marketplaces に sources が無い")
        for s in info.get("sources", []):
            check(bool(s.get("source")) and bool(s.get("quote")) and bool(s.get("checked_on")),
                  f"{itag}: sources の1件に source/quote/checked_on のいずれかが無い")
    # A 行は rule 内の数値が quote に現れること（引用が主張を支えているか）
    if r["tier"] == "A_confirmed" and "quote" in r:
        nums = [v for v in json.loads(json.dumps(r["rule"])).values() if isinstance(v, (int, float))]
        nums = [n for n in nums if n not in (0, 1) and float(n) == int(n) and n >= 100]
        for n in nums:
            forms = [str(int(n)), f"{int(n):,}"]
            if n % 1000 == 0: forms.append(str(int(n // 1000)))   # 2000g を「2 kg」と書く場合
            if not any(s in r["quote"].replace(",", "") for s in forms):
                warn.append(f"{tag}: rule の {int(n)} が quote に現れない（引用が主張を支えていない疑い）")

cat_ids = {e["id"] for e in fees["catalog"]}
row_ids = {r["id"] for r in fees["rows"]}
check(row_ids <= cat_ids, f"catalog に無い費目IDが rows にある: {sorted(row_ids - cat_ids)}")

OCCURRENCE_VOCAB = set(fees["schema"]["occurrence_vocabulary"])
DISPLAY_VOCAB = set(fees["schema"]["display_vocabulary"])
DISPLAY_TOTAL_FORBIDDEN_OCCURRENCE = {"D_user_choice", "E_unpredictable", "nonexistent"}
display_counts = {}

for e in fees["catalog"]:
    check(e["in_fees_master"] == (e["id"] in row_ids), f'catalog {e["id"]}: in_fees_master が実態と不一致')
    if not e["in_fees_master"]:
        check("excluded_reason" in e, f'catalog {e["id"]}: 行が無いのに理由が書かれていない')
    # display / occurrence の必須チェック
    check("occurrence" in e, f'catalog {e["id"]}: occurrence が無い')
    check("display" in e, f'catalog {e["id"]}: display が無い')
    check("display_reason" in e, f'catalog {e["id"]}: display_reason が無い')
    if "occurrence" in e:
        check(e["occurrence"] in OCCURRENCE_VOCAB,
              f'catalog {e["id"]}: occurrence \'{e["occurrence"]}\' が語彙集合に無い')
    if "display" in e:
        check(e["display"] in DISPLAY_VOCAB,
              f'catalog {e["id"]}: display \'{e["display"]}\' が語彙集合に無い')
        display_counts[e["display"]] = display_counts.get(e["display"], 0) + 1
    check(e.get("display_reason", "") != "", f'catalog {e["id"]}: display_reason が空文字')
    # 論理矛盾: 総額に入れるのに、利用者が選ぶ／予測不能／存在しない費目であってはならない
    if e.get("display") == "total" and e.get("occurrence") in DISPLAY_TOTAL_FORBIDDEN_OCCURRENCE:
        fail.append(f'catalog {e["id"]}: display が total なのに occurrence が {e["occurrence"]}（論理矛盾）')

BASES = set(customs["schema"]["base_vocabulary"])
for cc, c in CO.items():
    check("clearance_fee_vat" in c, f"{cc}: clearance_fee_vat(F38) が無い")
    for k in ("duty", "vat"):
        check("base" in c[k], f"{cc}/{k}: base が無い（何に率を掛けるかが未定義）")
        check("threshold_base" in c[k], f"{cc}/{k}: threshold_base が無い")
        check(c[k].get("base") in BASES, f"{cc}/{k}: base '{c[k].get('base')}' が語彙集合に無い")
    for r in c["clearance"]:
        if r["tier"] == "A_confirmed":
            check("quote" in r, f"{cc}/{r.get('carrier')}: customs の A なのに quote が無い")
        elif r["tier"] == "B_inferred":
            check("inference_basis" in r, f"{cc}/{r.get('carrier')}: B なのに basis が無い")

print(f"  費目 {len(fees['rows'])} 行 / rule.type {len(VOCAB)} 種 / catalog {len(fees['catalog'])}"
      f" / 国 {len(CO)} / 通関経路 {sum(len(c['clearance']) for c in CO.values())}")
print("  display 内訳: " + " / ".join(f"{k} {display_counts.get(k, 0)}" for k in
      ("total", "engine_only", "optional", "warning_only", "hidden")))

# =============================================================== 2. 再現検証
print("\n== 2. 実請求の再現（customs.json の rule を評価する） ==")

def find_route(cc, carrier, variant=None):
    for r in CO[cc]["clearance"]:
        if r["carrier"] == carrier and (variant is None or r.get("variant") == variant):
            return r
    return None

def eval_clearance(rule, ctx):
    """通関手数料の rule を評価する。ctx: import_tax / goods_value"""
    t = rule["type"]
    if t == "fixed_per_parcel":            return rule["amount"]
    if t == "fixed_plus_vat":              return rule["base"]
    if t == "rate_of_import_charges":      return rule["rate"] * ctx["import_tax"]
    if t == "rate_of_value_with_min":      return max(rule["rate"] * ctx["goods_value"], rule["min"])
    if t == "fixed_min":                   return rule["min"]
    if t == "fixed_per_parcel_plus_gst":   return rule["amount"]
    if t == "banded_by_value":
        # 帯は「小包1個あたりの申告額」で選ぶ。上限 None ＝ 上限なし。
        # **帯の 0 は「取得できた 0」**（原文がその帯で 0 と書いている）で、未取得ではない。
        v = ctx["goods_value_per_parcel"]
        for up, amt in rule["bands"]:
            if up is None or v <= up: return amt
        raise ValueError(f"banded_by_value: 値 {v} を含む帯が無い")
    raise KeyError(f"未対応の clearance rule.type: {t}")

def eval_fee_vat(country, fee):
    r = CO[country]["clearance_fee_vat"]["rule"]
    if r["type"] == "rate_of_clearance_fee": return r["rate"] * fee
    if r["type"] in ("not_applicable", "unknown", "included_in_min"): return 0.0
    raise KeyError(f"未対応の clearance_fee_vat rule.type: {r['type']}")

results = []
for f in fixtures["fixtures"]:
    fid, cc = f["id"], f["country"]
    indep = not f.get("source_same_as_master", True)
    kind = "独立" if indep else "循環（率をこの請求書から導いている）"
    tol = f.get("tolerance", 0.11)
    try:
        if fid == "es-zenmarket-ups-2023-07-26":
            exp = f["expected_eur"]
            vat_rate = CO[cc]["vat"]["rule"]["rate"]                        # ← マスタから
            base = exp["items_plus_shipping"]
            tax = vat_rate * base
            route = find_route(cc, "UPS")
            fee = eval_clearance(route["rule"], {"import_tax": exp["import_tax"], "goods_value": base})
            fee_vat = eval_fee_vat(cc, fee)
            total = base + exp["import_tax"] + fee + fee_vat
            ok = (abs(fee - exp["clearance_fee"]) <= tol and abs(fee_vat - exp["clearance_fee_vat"]) <= tol
                  and abs(total - exp["total"]) <= tol)
            det = (f"IVA {tax:.2f}(算出)/{exp['import_tax']}(実請求) 手数料 {fee:.2f}/{exp['clearance_fee']} "
                   f"手数料VAT {fee_vat:.2f}/{exp['clearance_fee_vat']} 合計 {total:.2f}/{exp['total']}")

        elif fid == "ca-canadapost-forum":
            exp = f["expected_cad"]
            v = f["input"]["declared_value_cad"]
            gst = CO[cc]["vat"]["rule"]["rate"] * v                          # ← マスタから
            pst = f["input"]["pst_rate"] * v                                 # ← 請求書から逆算（循環）
            route = find_route(cc, "Canada Post")
            fee = eval_clearance(route["rule"], {"import_tax": gst + pst, "goods_value": v})
            fee_vat = eval_fee_vat(cc, fee)                                  # ← マスタは 5% を持つ
            total = gst + pst + fee + fee_vat
            ok = abs(total - exp["total"]) <= tol
            det = (f"GST {gst:.2f}/{exp['gst']} PST {pst:.2f}/{exp['pst']} 手数料 {fee:.2f}/{exp['handling']} "
                   f"手数料GST {fee_vat:.2f}/(実請求に行が無い) 合計 {total:.2f}/{exp['total']}")

        elif fid == "es-correos-selfclear":
            exp = f["expected_eur"]
            b = f["input"]["taxable_base_eur"]
            vat = CO[cc]["vat"]["rule"]["rate"] * b
            route = find_route(cc, "Correos（事前に自分で払う）")
            fee = eval_clearance(route["rule"], {"import_tax": vat, "goods_value": b})
            fee_vat = eval_fee_vat(cc, fee)
            total = vat + fee + fee_vat
            ok = abs(total - exp["total"]) <= tol
            det = f"IVA {vat:.2f}/{exp['vat']} 手数料 {fee:.2f}/{exp['clearance_fee']} 合計 {total:.2f}/{exp['total']}"

        elif fid == "es-fedex-30pct":
            exp = f["expected_eur"]
            route = find_route(cc, "FedEx", variant="conflicting_report")
            fee = eval_clearance(route["rule"], {"import_tax": f["input"]["import_tax_eur"], "goods_value": 0})
            fee_vat = eval_fee_vat(cc, fee)
            ok = abs(fee + fee_vat - exp["clearance_total"]) <= tol
            det = f"手数料 {fee:.2f}/{exp['clearance_fee']} 手数料込み {fee+fee_vat:.2f}/{exp['clearance_total']}"

        else:
            results.append((fid, None, "再現不可", f.get("not_reproducible_reason", "—"), indep)); continue

    except KeyError as e:
        results.append((fid, False, "評価不能", str(e), indep)); continue

    if not ok and f.get("known_conflict"):
        results.append((fid, "conflict", kind, det + " ／ " + f["known_conflict"], indep))
    else:
        results.append((fid, ok, kind, det, indep))

for fid, ok, kind, det, indep in results:
    mark = {True: "PASS", False: "FAIL", None: "SKIP", "conflict": "CONFLICT"}[ok]
    print(f"  [{mark:8}] {fid}  ({kind})")
    print(f"             {det}")
    if ok is False:
        fail.append(f"再現失敗: {fid}")

# =============================================================== 結果
n_pass = sum(1 for _, ok, _, _, _ in results if ok is True)
n_indep = sum(1 for _, ok, _, _, ip in results if ok is True and ip)
n_conf = sum(1 for _, ok, _, _, _ in results if ok == "conflict")
print()
if warn:
    print(f"警告 {len(warn)} 件")
    for m in warn[:12]:
        print("  -", m)
if fail:
    print(f"\nNG: {len(fail)} 件")
    for m in fail:
        print("  -", m)
    sys.exit(1)
print(f"\nOK: スキーマ通過 / 再現 {n_pass}件（うち独立 {n_indep}件）/ マスタと矛盾 {n_conf}件")
print("   ※ 独立 = fixture の出典とマスタの数値の出典が別文書であること")
