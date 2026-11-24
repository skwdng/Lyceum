# -*- coding: utf-8 -*-
"""
把填好的盲评表转成 human-labels.json，并算「系统分 vs 人工分」的一致性。

用法：
    python scripts/ingest_human_labels.py docs/评测集-盲评表.xlsx

输出：
    server/src/test/resources/eval/human-labels.json
      { "annotators": ["A","B"], "labels": { "t1-good": {"A": 85, "B": 78}, ... } }

之后 `mvn test -Dtest=ScoreHumanAlignTest` 会自动读它并算 Spearman。
"""
import json
import sys
from pathlib import Path

from openpyxl import load_workbook

SRC = Path(sys.argv[1] if len(sys.argv) > 1 else r"D:/siyige/docs/评测集-盲评表.xlsx")
OUT = Path(r"D:/siyige/server/src/test/resources/eval/human-labels.json")

wb = load_workbook(SRC, data_only=True)
labels = {}
annotators = []

for sheet in ("辩手A", "辩手B"):
    if sheet not in wb.sheetnames:
        continue
    ws = wb[sheet]
    who = sheet.replace("辩手", "")
    row_has_data = False
    for r in range(2, ws.max_row + 1):
        sid = ws.cell(row=r, column=1).value
        score = ws.cell(row=r, column=8).value      # 「你的总分(0-100)」
        if not sid:
            continue
        try:
            score = int(float(score))
        except (TypeError, ValueError):
            continue
        labels.setdefault(str(sid).strip(), {})[who] = score
        row_has_data = True
    if row_has_data:
        annotators.append(who)

if not labels:
    print("没有读到任何分数 —— 先把「你的总分(0-100)」那列填上再跑。")
    sys.exit(1)

payload = {"annotators": annotators, "labels": labels}
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

n = len(labels)
print(f"读到 {n} 条标注 · 标注者 {annotators} → {OUT}")


def spearman(xs, ys):
    n = len(xs)
    if n < 3:
        return float("nan")

    def rank(v):
        order = sorted(range(n), key=lambda i: v[i])
        rk = [0.0] * n
        i = 0
        while i < n:
            j = i
            while j + 1 < n and v[order[j + 1]] == v[order[i]]:
                j += 1
            avg = (i + j) / 2 + 1
            for k in range(i, j + 1):
                rk[order[k]] = avg
            i = j + 1
        return rk

    rx, ry = rank(xs), rank(ys)
    mx, my = sum(rx) / n, sum(ry) / n
    num = sum((rx[i] - mx) * (ry[i] - my) for i in range(n))
    dx = sum((rx[i] - mx) ** 2 for i in range(n)) ** 0.5
    dy = sum((ry[i] - my) ** 2 for i in range(n)) ** 0.5
    return num / (dx * dy) if dx and dy else float("nan")


# 顺带把与作者基准分的一致性也报一下，方便对比
dataset = json.loads(Path(r"D:/siyige/server/src/test/resources/eval/score-dataset.json").read_text(encoding="utf-8"))
author = {s["id"]: s["humanScore"] for s in dataset["samples"]}

ids = [i for i in labels if i in author]
for who in annotators:
    xs = [labels[i][who] for i in ids if who in labels[i]]
    ys = [author[i] for i in ids if who in labels[i]]
    if len(xs) >= 3:
        rho = spearman(xs, ys)
        print(f"  辩手{who} vs 作者基准：Spearman ρ = {rho:.3f}（n={len(xs)}）")
