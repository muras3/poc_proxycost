#!/usr/bin/env python3
"""FedEx GB/DE の3段帯構造（`banded_by_import_tax_mixed`）を、実際の
`master/validate.py#eval_clearance()` を通して検証する。

## なぜ `master/customs.json` を書き換えずにここでやるのか

このPRのスコープは `master/validate.py` と `src/lib/pricing/` に**能力を追加**する
ことで、GB/DE FedEx行の値を移行することではない（他のエージェントが同時に
`master/customs.json` の別項目を編集しているため）。したがって、GB/DEの実際の
raw_findings（`docs/audit/f34-fedex-seven-countries-2026-09-12.md` /
`f34-clearance-fee-by-route-2026-09-12.md`）が記録した帯の値をこのファイルの中に
そのまま合成 fixture として書き、`master/validate.py` が定義する本物の
`eval_clearance()` を import して評価する。customs.json 自体は一切読まない
（読んでも `rule.type: "unknown"` のままで、この新しい型は出てこない）。

## 実行方法

    python3 master/test_tiered_band_schema.py

`master/validate.py` はスクリプトとして書かれており（`if __name__` ガードが無い）、
import すると検証全体が走る。壊さないよう `contextlib.redirect_stdout` で標準出力を
抑え、失敗（`sys.exit(1)`）が起きないこと自体も確認した上で `eval_clearance` を
取り出す。
"""
import contextlib
import importlib.util
import io
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent


def _load_validate_module():
    spec = importlib.util.spec_from_file_location("_validate_for_tiered_band_test", ROOT / "validate.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        try:
            spec.loader.exec_module(module)
        except SystemExit as e:
            print(buf.getvalue(), file=sys.stderr)
            raise AssertionError(f"master/validate.py 自体が失敗している（sys.exit={e.code}）") from e
    return module


_validate = _load_validate_module()
eval_clearance = _validate.eval_clearance

# --- GB FedEx（docs/audit/f34-fedex-seven-countries-2026-09-12.md の raw_findings を転記） ---
# 帯1: 税額(duty+tax) £0.01–£43 → 30%・下限£10.50
# 帯2: £43–£524 → 定額£12.90
# 帯3: £524超 → 2.5%のみ
GB_FEDEX_RULE = {
    "type": "banded_by_import_tax_mixed",
    "currency": "GBP",
    "bands": [
        {"duty_tax_max": 43, "rule": {"type": "rate_of_import_charges_with_min", "rate": 0.30, "min": 10.50}},
        {"duty_tax_max": 524, "rule": {"type": "fixed_per_parcel", "amount": 12.90}},
        {"duty_tax_max": None, "rule": {"type": "rate_of_import_charges", "rate": 0.025}},
    ],
}

# --- DE FedEx（同ドキュメント。通貨と数値だけ違う、形はGBと同一） ---
# 帯1: 税額 €0.01–€50 → 30%・下限€5(net)
# 帯2: €50–€600 → 定額€15
# 帯3: €600超 → 2.5%のみ
DE_FEDEX_RULE = {
    "type": "banded_by_import_tax_mixed",
    "currency": "EUR",
    "bands": [
        {"duty_tax_max": 50, "rule": {"type": "rate_of_import_charges_with_min", "rate": 0.30, "min": 5.0}},
        {"duty_tax_max": 600, "rule": {"type": "fixed_per_parcel", "amount": 15.0}},
        {"duty_tax_max": None, "rule": {"type": "rate_of_import_charges", "rate": 0.025}},
    ],
}

failures = []


def check(cond, msg):
    if not cond:
        failures.append(msg)


def close(a, b, tol=1e-9):
    return abs(a - b) <= tol


# ===== 帯1（rate_with_min）の内部 =====
fee = eval_clearance(GB_FEDEX_RULE, {"import_tax": 20})
check(close(fee, 10.50), f"GB帯1(税額20, 下限適用): 期待10.50 実{fee}")  # 0.3*20=6 < 10.50 min

fee = eval_clearance(GB_FEDEX_RULE, {"import_tax": 40})
check(close(fee, 12.0), f"GB帯1(税額40, rate適用): 期待12.0(0.3*40) 実{fee}")

# ===== 帯1/帯2の境界: duty_tax_max=43 は「以下」に含む（banded_by_valueと同じ規約） =====
fee = eval_clearance(GB_FEDEX_RULE, {"import_tax": 43})
check(close(fee, max(0.30 * 43, 10.50)), f"GB境界(税額43ちょうど、帯1側): 期待{max(0.30*43, 10.50)} 実{fee}")

fee = eval_clearance(GB_FEDEX_RULE, {"import_tax": 43.01})
check(close(fee, 12.90), f"GB境界+0.01(帯2側、定額): 期待12.90 実{fee}")

# ===== 帯2（flat）の内部 =====
fee = eval_clearance(GB_FEDEX_RULE, {"import_tax": 200})
check(close(fee, 12.90), f"GB帯2内部(税額200): 期待12.90 実{fee}")

# ===== 帯2/帯3の境界: duty_tax_max=524 =====
fee = eval_clearance(GB_FEDEX_RULE, {"import_tax": 524})
check(close(fee, 12.90), f"GB境界(税額524ちょうど、帯2側): 期待12.90 実{fee}")

fee = eval_clearance(GB_FEDEX_RULE, {"import_tax": 524.01})
check(close(fee, 0.025 * 524.01), f"GB境界+0.01(帯3側、rate_only): 期待{0.025*524.01} 実{fee}")

# ===== 帯3（rate_only, 上限None=無制限） =====
fee = eval_clearance(GB_FEDEX_RULE, {"import_tax": 10000})
check(close(fee, 250.0), f"GB帯3(税額10000, 上限なし): 期待250.0 実{fee}")

# ===== DE も同型であること（通貨単位が違うだけ）を確認 =====
fee = eval_clearance(DE_FEDEX_RULE, {"import_tax": 30})
check(close(fee, 9.0), f"DE帯1(税額30, rate適用 0.3*30=9 > min5): 期待9.0 実{fee}")

fee = eval_clearance(DE_FEDEX_RULE, {"import_tax": 10})
check(close(fee, 5.0), f"DE帯1(税額10, 下限適用): 期待5.0 実{fee}")

fee = eval_clearance(DE_FEDEX_RULE, {"import_tax": 50})
check(close(fee, max(0.30 * 50, 5.0)), f"DE境界(税額50ちょうど、帯1側): 期待{max(0.30*50, 5.0)} 実{fee}")

fee = eval_clearance(DE_FEDEX_RULE, {"import_tax": 50.01})
check(close(fee, 15.0), f"DE境界+0.01(帯2側、定額): 期待15.0 実{fee}")

fee = eval_clearance(DE_FEDEX_RULE, {"import_tax": 600})
check(close(fee, 15.0), f"DE境界(税額600ちょうど、帯2側): 期待15.0 実{fee}")

fee = eval_clearance(DE_FEDEX_RULE, {"import_tax": 600.01})
check(close(fee, 0.025 * 600.01), f"DE境界+0.01(帯3側、rate_only): 期待{0.025*600.01} 実{fee}")

# ===== カートが箱分割で複数小包に分かれ、それぞれ違う帯に落ちるケース（straddling） =====
# per-parcelでの評価を想定（GB/DEのunitはC_unknownだが、courier-clearance.tsの方針
# ──「一次資料が言っていない行はper_parcelにする」を踏襲）。小包Aは帯1、小包Bは帯3に落ちる。
parcel_a_tax, parcel_b_tax = 20, 700
fee_a = eval_clearance(GB_FEDEX_RULE, {"import_tax": parcel_a_tax})
fee_b = eval_clearance(GB_FEDEX_RULE, {"import_tax": parcel_b_tax})
total = fee_a + fee_b
check(close(fee_a, 10.50), f"straddling小包A(帯1): 期待10.50 実{fee_a}")
check(close(fee_b, 0.025 * 700), f"straddling小包B(帯3): 期待{0.025*700} 実{fee_b}")
check(close(total, 10.50 + 0.025 * 700),
      f"straddlingカート合計(2小包が別の帯に落ちる): 期待{10.50 + 0.025*700} 実{total}")

# ===== 上限の無い帯を含まない行は ValueError で落ちること（境界の網羅性） =====
try:
    eval_clearance({"type": "banded_by_import_tax_mixed", "bands": [
        {"duty_tax_max": 10, "rule": {"type": "fixed_per_parcel", "amount": 1}},
    ]}, {"import_tax": 999})
    failures.append("上限なしの帯を持たない banded_by_import_tax_mixed が例外を投げなかった")
except ValueError:
    pass

# ===== EVAL_HANDLED_TYPES と分岐がずれていないこと =====
check("banded_by_import_tax_mixed" in _validate.EVAL_HANDLED_TYPES,
      "banded_by_import_tax_mixed が EVAL_HANDLED_TYPES に登録されていない")

if failures:
    print(f"NG: {len(failures)} 件")
    for m in failures:
        print("  -", m)
    sys.exit(1)
print(f"OK: banded_by_import_tax_mixed の帯境界・straddling を含む {13} 件のアサーションを"
      " 本物の eval_clearance() で検証（master/customs.json は変更していない）")
