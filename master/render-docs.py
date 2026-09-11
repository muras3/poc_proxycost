#!/usr/bin/env python3
"""`docs/MASTER.md` の中で、JSON から機械生成できる節を差し替える。

手書きの表は必ず JSON からずれる（Fable レビュー L2：「34種」と書いて実数 33、
「8カ国/19経路」と書いて実際は 9/21）。**ずれない唯一の方法は生成すること。**

  python3 master/render-docs.py          # 生成して書き戻す
  python3 master/render-docs.py --check  # ずれていたら exit 1（CI 用）

差し替えるのは次のマーカーで挟まれた範囲だけ。それ以外の散文には触らない。
  <!-- generated:BEGIN <name> --> … <!-- generated:END <name> -->
"""
import json, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent
DOC = ROOT.parent / "docs" / "MASTER.md"
fees = json.loads((ROOT / "fees.json").read_text(encoding="utf-8"))
customs = json.loads((ROOT / "customs.json").read_text(encoding="utf-8"))

def money(rule):
    a, cur = rule.get("amount"), rule.get("currency", "")
    if rule.get("type") == "banded_by_value":
        return cur + " " + "・".join(
            ("上限なし" if up is None else f"〜{up}") + f":{amt}" for up, amt in rule["bands"])
    if rule.get("type") == "range":
        return f"{cur} {rule['min']}〜{rule['max']}"
    if a is None:
        for k in ("min", "base"):
            if isinstance(rule.get(k), (int, float)): a = rule[k]
    if isinstance(a, list): a = "・".join(str(x) for x in a)
    if a is None and "rate" in rule:
        s = f"{rule['rate'] * 100:g}%"
        if "min" in rule: s += f"（最低 {cur} {rule['min']}）"
        return s
    s = f"{cur} {a}".strip()
    if "rate" in rule: s = f"{rule['rate'] * 100:g}% / " + s
    return s or "—"

def counts():
    from collections import Counter
    t = Counter(r["tier"] for r in fees["rows"])
    co = Counter(r["company"] for r in fees["rows"])
    amt_c = sum(1 for r in fees["rows"] if r.get("amount_tier") == "C_unknown")
    routes = sum(len(c["clearance"]) for c in customs["countries"])
    out = ["| 数えたもの | 実数 |", "|---|---:|",
           f"| `fees.json` の行 | **{len(fees['rows'])}** |"]
    for k in ("A_confirmed", "B_inferred", "C_unknown"):
        if t.get(k): out.append(f"| ├ {k} | {t[k]} |")
    out += [f"| └ うち `amount_tier: C_unknown`（額が未取得） | {amt_c} |",
            f"| `rule.type` の語彙 | {len(fees['schema']['rule_type_vocabulary'])} 種 |",
            f"| `catalog`（F01〜、欠番なし） | {len(fees['catalog'])} |",
            f"| `customs.json` の国 | {len(customs['countries'])} |",
            f"| └ 通関経路 | {routes} |", "",
            "会社ごとの行数：" + " / ".join(f"{k} {v}" for k, v in co.most_common())]
    return "\n".join(out)

def country_table():
    out = ["| 国 | 関税 | VAT/GST | 通関手数料（経路ごと） |", "|---|---|---|---|"]
    for c in customs["countries"]:
        d, v = c["duty"], c["vat"]
        dr = money(d["rule"]) if d["rule"].get("type") != "threshold" else \
             f"{d['rule'].get('free_below', '?')} 以下は免税"
        vr = money(v["rule"]) if v["rule"].get("rate") is not None else "—"
        routes = " ／ ".join(
            f"{r['carrier']} {money(r['rule'])}" for r in c["clearance"]
            if r["rule"].get("type") != "unknown") or "**未取得**"
        star = {"A_confirmed": "", "B_inferred": "†", "C_unknown": "‡"}
        out.append(f"| **{c['country']}** | {dr}{star.get(d['tier'], '')} | {vr}{star.get(v['tier'], '')} | {routes} |")
    out.append("")
    out.append("† 推論（`inference_basis` あり）　‡ 未取得")
    return "\n".join(out)

def findings():
    out = []
    for f in customs.get("cross_country_findings", []):
        out.append(f"**{f['finding']}**（{f['tier']}）")
        out.append("")
        for cc, q in f["confirmed_in"].items():
            out.append(f"- **{cc}**: {q}")
        out.append("")
        out.append(f"→ {f['impact']}")
        out.append("")
    return "\n".join(out).rstrip()

def display_table():
    from collections import Counter, OrderedDict
    order = ["total", "engine_only", "optional", "warning_only", "hidden"]
    counts = Counter(e.get("display") for e in fees["catalog"])
    out = ["| display | 件数 | 意味 |", "|---|---:|---|"]
    for k in order:
        out.append(f"| `{k}` | {counts.get(k, 0)} | {fees['schema']['display_vocabulary'][k]} |")
    out.append("")
    out.append("### `total` 以外に分類された項目（載せない・載せない理由が1か所で読めること）")
    out.append("")
    out.append("| id | 名前 | display | 理由 |")
    out.append("|---|---|---|---|")
    for e in fees["catalog"]:
        if e.get("display") != "total":
            out.append(f"| {e['id']} | {e['name']} | `{e['display']}` | {e['display_reason']} |")
    return "\n".join(out)

def validator_output():
    """`validate.py` の出力そのものを埋める。**貼り付けた実行例は必ず古くなる**——
    以前ここには『通関経路 21』『[CONFLICT] ca-canadapost-forum ... 未解決』が
    手書きで残っていた。実数は 22、矛盾は解消済みだった。"""
    import subprocess
    r = subprocess.run([sys.executable, str(ROOT / "validate.py")],
                       capture_output=True, text=True)
    if r.returncode != 0:
        print("NG: validate.py が失敗した\n" + r.stdout + r.stderr); sys.exit(1)
    return "```\n" + r.stdout.strip() + "\n```"

BLOCKS = {"counts": counts, "display": display_table, "countries": country_table,
          "findings": findings, "validator": validator_output}

def main():
    doc = DOC.read_text(encoding="utf-8")
    new = doc
    for name, fn in BLOCKS.items():
        pat = re.compile(rf"(<!-- generated:BEGIN {name} -->\n)(?:.*?\n)?(<!-- generated:END {name} -->)", re.S)
        if not pat.search(new):
            print(f"NG: マーカー generated:{name} が {DOC} に無い"); sys.exit(1)
        new = pat.sub(lambda m: m.group(1) + fn() + "\n" + m.group(2), new)
    if "--check" in sys.argv:
        if new != doc:
            print("NG: docs/MASTER.md が JSON からずれている。`python3 master/render-docs.py` を実行すること")
            sys.exit(1)
        print("OK: docs/MASTER.md は JSON と一致している"); return
    DOC.write_text(new, encoding="utf-8")
    print(f"OK: {DOC.name} の生成節 {len(BLOCKS)} 個を書き戻した")

main()
