# -*- coding: utf-8 -*-
"""生成简历中新增项目经历的 Word 片段（语气与字数对齐简历中物联网项目条目）。"""
import re
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT
from docx.oxml.ns import qn
from docx.shared import Cm, Pt

FONT = "微软雅黑"
BODY = Pt(10.5)
CONTENT_WIDTH = Cm(17.2)

TITLE = "个人知识库平台——面向个人资料的 RAG 检索问答与笔记系统【个人开发】"
DATE = "2026.10 - 2026.11"
STACK = ("React 19 + TypeScript + Vite + Tailwind CSS 4 + assistant-ui + Express 5 + "
         "MySQL + Qdrant + DeepSeek（已上线：knowledge.myelowen.fun）")

BULLETS = [
    "针对上传大文件后必须等解析、分块、向量化全部跑完才能继续操作，并发处理多份又占满内存的问题，"
    "设计**上传即返回 + 单消费者异步队列**的文档流水线：以 MySQL 记录全状态与失败原因、失败可单独重试，"
    "分块按 **800 字窗口 + 100 字重叠**且不跨页，保证每条引用都能回溯到原文页码；扫描件按字符数阈值自动转 "
    "OCR 并支持主备模型降级；写入前清理旧分块与向量使重传幂等，服务重启后中断任务自动续跑。",

    "针对纯向量检索对型号、错误码不敏感，且语义相近不等于能回答问题的缺陷，实现"
    "**向量召回 → ngram 全文 → RRF 融合名次 → cross-encoder 精排**的可组合检索链路：精排前放大召回池、"
    "放宽召回下限避免误杀；精排超时或关键词路失败自动退回向量排序，主流程始终可用。",

    "针对检索阈值只能靠手感调的问题，搭 **23 条问题的离线评估集**（含追问与负样本），"
    "用 recall@k / MRR / 拒答率横向对比配置：精排只重排不设阈值即可把 recall@5 从 **83.3% 提到 100%**、"
    "MRR 达 0.768，而用阈值换拒答会让命中率掉到 61.1%，据此定为「精排只排序、拒答交提示词」。",

    "针对首字延迟高、用户中途停止后已生成内容消失的问题，用 **SSE 逐段下发**并把中止信号透传到上游模型请求，"
    "停止时已生成内容照样落库；回答只展示真正被 **[编号] 引用**到的片段并可定位原文；"
    "长对话用**最近 10 条原文 + 滚动摘要**，平均每 3 轮才多一次模型调用。",

    "针对公网演示账号可能被刷爆额度的风险，按用户做接口限流、**每日 token 额度**与数据隔离，"
    "演示账号只读且单独降额；同时补齐 **21 个单测**与 CI，用 nginx + systemd 上线、"
    "Qdrant 与 MySQL 只绑内网，一键脚本完成构建→上传→迁移→重启。",
]


def set_font(run, size=BODY, bold=False):
    run.font.name = FONT
    run.font.size = size
    run.bold = bold
    run._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)


def add_rich(paragraph, text, size=BODY):
    """把 **加粗** 标记解析成不同 run。"""
    for i, part in enumerate(re.split(r"\*\*", text)):
        if not part:
            continue
        run = paragraph.add_run(part)
        set_font(run, size=size, bold=(i % 2 == 1))


doc = Document()
section = doc.sections[0]
section.page_width, section.page_height = Cm(21), Cm(29.7)
section.left_margin = section.right_margin = Cm(1.9)
section.top_margin = section.bottom_margin = Cm(1.8)

style = doc.styles["Normal"]
style.font.name = FONT
style.font.size = BODY
style.element.rPr.rFonts.set(qn("w:eastAsia"), FONT)

# 标题行：项目名 + 右对齐时间
head = doc.add_paragraph()
head.paragraph_format.space_before = Pt(0)
head.paragraph_format.space_after = Pt(2)
head.paragraph_format.tab_stops.add_tab_stop(CONTENT_WIDTH, WD_TAB_ALIGNMENT.RIGHT)
set_font(head.add_run(TITLE), size=Pt(11), bold=True)
set_font(head.add_run("\t" + DATE), size=Pt(10.5))

# 技术栈行
stack_p = doc.add_paragraph()
stack_p.paragraph_format.space_after = Pt(2)
set_font(stack_p.add_run(STACK))

# 项目要点
for text in BULLETS:
    p = doc.add_paragraph()
    pf = p.paragraph_format
    pf.left_indent = Cm(0.45)
    pf.first_line_indent = Cm(-0.45)
    pf.space_after = Pt(3)
    pf.line_spacing = 1.3
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    set_font(p.add_run("• "))
    add_rich(p, text)

out = r"E:\CodeSet\personal-knowledge\resume\个人知识库平台-简历条目.docx"
doc.save(out)
print("saved:", out)
