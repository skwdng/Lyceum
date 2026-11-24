# -*- coding: utf-8 -*-
"""
生成「盲评表」：给两位辩手独立打分用。

为什么盲评：作者已经按四维度打过档，如果标注者看到档位/顺序，会不自觉地往基准上靠，
测出来的"一致性"就是自我实现。所以这里做三件事：
  1. 打乱顺序（固定随机种子，可复现）
  2. 不显示 tier，也不显示作者给的 humanScore
  3. 每人一个工作表，互不可见对方的分数
"""
import json
import random
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

SRC = r"D:/siyige/server/src/test/resources/eval/score-dataset.json"
OUT = r"D:/siyige/docs/评测集-盲评表.xlsx"

with open(SRC, encoding="utf-8") as f:
    data = json.load(f)

samples = list(data["samples"])
random.Random(20261124).shuffle(samples)          # 固定种子：可复现

HEAD = ["编号", "辩题", "发言文本",
        "①判准(1-5)", "②证据(1-5)", "③回应对方(1-5)", "④交锋追问(1-5)",
        "你的总分(0-100)", "备注（可留空）"]

RUBRIC = [
    ["评分口径（请先读一遍再打分）"],
    ["① 判准 1-5", "有没有把话说到「按什么标准判断」：判准、口径、可核查的指标。1=完全没有，5=明确给出判准"],
    ["② 证据 1-5", "有没有可核查的依据：制度条款、具体机制、数据、案例。1=纯态度，5=有出处且与结论对应"],
    ["③ 回应对方 1-5", "有没有直接回应对方的具体说法（点名、引用、反驳），而不是自说自话"],
    ["④ 交锋追问 1-5", "有没有以可核查的追问收尾，把举证责任推回对方"],
    ["总分 0-100", "按你自己对「这段发言好不好」的整体判断打分，不必与四维度加权结果严格一致"],
    ["注意", "不要看别人的分数；不要改「发言文本」列；编号请保留（汇总要用）"],
]

wb = Workbook()
wb.remove(wb.active)

# 说明页
ws0 = wb.create_sheet("说明")
ws0.append(["思弈阁 · 评分有效性评测集（盲评）"])
ws0["A1"].font = Font(bold=True, size=14)
ws0.append([])
for row in RUBRIC:
    ws0.append(row)
ws0.append([])
ws0.append([f"样本数：{len(samples)} 条 · 辩题数：{len(set(s['topic'] for s in samples))} 个 · 打乱顺序（种子 20261124）"])
ws0.append(["填完请把这份文件的「辩手A」「辩手B」两个表分别另存为 辩手A.xlsx / 辩手B.xlsx，不要互相参考。"])
ws0.column_dimensions["A"].width = 26
ws0.column_dimensions["B"].width = 96
for r in ws0.iter_rows(min_row=1, max_row=ws0.max_row, min_col=2, max_col=2):
    for c in r:
        c.alignment = Alignment(wrap_text=True, vertical="top")

BLANK_FILL = PatternFill("solid", fgColor="FFF7E0")   # 需要填的格子用浅黄底


def build_sheet(title):
    ws = wb.create_sheet(title)
    ws.append(HEAD)
    for c in ws[1]:
        c.font = Font(bold=True)
        c.fill = PatternFill("solid", fgColor="E8EEF9")
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    for s in samples:
        ws.append([s["id"], s["topic"], s["text"], None, None, None, None, None, None])
    widths = [10, 26, 80, 12, 12, 14, 14, 14, 24]
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w
    for row in ws.iter_rows(min_row=2, max_row=ws.max_row):
        row[2].alignment = Alignment(wrap_text=True, vertical="top")
        row[1].alignment = Alignment(vertical="top")
        for i in range(3, 9):
            row[i].fill = BLANK_FILL
            row[i].alignment = Alignment(horizontal="center", vertical="top")
    ws.freeze_panes = "A2"
    return ws


build_sheet("辩手A")
build_sheet("辩手B")

# 隐藏的机器可读页：方便把填好的表直接转回 json（不参与人工填写）
ws_k = wb.create_sheet("_keys")
ws_k.append(["id", "topic", "tier", "authorScore"])
for s in samples:
    ws_k.append([s["id"], s["topic"], s["tier"], s["humanScore"]])
ws_k.sheet_state = "hidden"

wb.save(OUT)
print("已生成:", OUT)
print("行数:", len(samples), "· 工作表:", wb.sheetnames)
