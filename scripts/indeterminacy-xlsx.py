#!/usr/bin/env python3
"""
docs/ledger/.indeterminacy-<日付>.rows.json（indeterminacy-ledger.ts の中間出力）
から、明細・要約の2シートを持つ xlsx を作る。集計はしない
（indeterminacy-summary.ts が既に計算した集計を再利用する）。

使い方: python3 scripts/indeterminacy-xlsx.py --date 2026-09-13 [--out-dir docs/ledger]

依存: openpyxl。無ければその旨を書いて exit 1 する
（CLAUDE.md 「無ければ CSV だけにして『xlsx は生成できなかった』と報告しろ」）。
"""
import argparse
import csv
import json
import re
import sys
from pathlib import Path

try:
    import openpyxl
    from openpyxl.styles import Font
except ImportError:
    print("indeterminacy-xlsx: openpyxl が見つかりません。xlsx は生成できませんでした。"
          " CSV(indeterminacy-<date>.csv) と要約 md はそのまま使えます。", file=sys.stderr)
    sys.exit(1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", required=True)
    ap.add_argument("--out-dir", default="docs/ledger")
    args = ap.parse_args()

    out_dir = Path(args.out_dir)
    csv_path = out_dir / f"indeterminacy-{args.date}.csv"
    json_path = out_dir / f".indeterminacy-{args.date}.rows.json"
    summary_path = out_dir / f"indeterminacy-summary-{args.date}.md"
    xlsx_path = out_dir / f"indeterminacy-{args.date}.xlsx"

    if not csv_path.exists() or not json_path.exists():
        print(f"indeterminacy-xlsx: {csv_path} / {json_path} が見つかりません。"
              " 先に `npx tsx scripts/indeterminacy-ledger.ts --date "
              f"{args.date}` を実行してください。", file=sys.stderr)
        sys.exit(1)

    wb = openpyxl.Workbook()

    # ── 明細シート ─────────────────────────────────────────────────
    ws = wb.active
    ws.title = "明細"
    with open(csv_path, encoding="utf-8-sig", newline="") as f:
        for row in csv.reader(f):
            ws.append(row)
    for cell in ws[1]:
        cell.font = Font(bold=True)
    ws.freeze_panes = "A2"

    # ── 要約シート ─────────────────────────────────────────────────
    ws2 = wb.create_sheet("要約")
    if summary_path.exists():
        md_text = summary_path.read_text(encoding="utf-8")
        write_markdown_tables_and_headings(ws2, md_text)
    else:
        with open(json_path, encoding="utf-8") as f:
            data = json.load(f)
        ws2.append(["rankIndeterminate", data["indeterminateCount"]])
        ws2.append(["total", data["total"]])
        ws2.append(["注記", f"summary md ({summary_path}) が見つからなかったため簡易版"])

    wb.save(xlsx_path)
    print(f"wrote {xlsx_path}")


def write_markdown_tables_and_headings(ws, md_text: str):
    """要約 md の見出しと markdown テーブルをそのままシートの行に流し込む。
    表以外の説明文も1セル1行のテキストとして残す——要約 md と xlsx の要約シートで
    内容が食い違わないようにするため、変換ではなく転記に徹する。"""
    row = 1
    lines = md_text.split("\n")
    i = 0
    bold = Font(bold=True)
    while i < len(lines):
        line = lines[i]
        if line.startswith("#"):
            cell = ws.cell(row=row, column=1, value=re.sub(r"^#+\s*", "", line))
            cell.font = bold
            row += 1
        elif line.startswith("|"):
            # markdown table block
            table_lines = []
            while i < len(lines) and lines[i].startswith("|"):
                table_lines.append(lines[i])
                i += 1
            i -= 1  # will be incremented at loop end
            for j, tline in enumerate(table_lines):
                if j == 1 and re.match(r"^\|[\s:|-]+\|$", tline):
                    continue  # separator row (|---|---|)
                cells = [c.strip() for c in tline.strip("|").split("|")]
                for col, val in enumerate(cells, start=1):
                    c = ws.cell(row=row, column=col, value=val)
                    if j == 0:
                        c.font = bold
                row += 1
            row += 1
        elif line.strip():
            ws.cell(row=row, column=1, value=line)
            row += 1
        else:
            row += 1
        i += 1


if __name__ == "__main__":
    main()
