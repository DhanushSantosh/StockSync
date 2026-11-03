"""Render the combined report with the reference report's academic layout."""

from __future__ import annotations

import subprocess
from copy import deepcopy
from pathlib import Path

from docx import Document
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs/combined-report.md"
DOCX = ROOT / "output/docx/StockSync-Combined-Report.docx"
PDF_DIR = ROOT / "output/pdf"

CAPTIONS = [
    "Technology stack", "Functional requirements and evidence", "Main Firestore entities",
    "Data dictionary for the shared dataset", "UCI cleaning summary",
    "UCI held-out results", "Generated grocery held-out results",
    "Report-to-code map", "Claim and evidence boundary",
]


def add_page_field(paragraph) -> None:
    run = paragraph.add_run()
    for kind, value in (("begin", None), (None, " PAGE "), ("separate", None),
                        (None, "1"), ("end", None)):
        if kind:
            node = OxmlElement("w:fldChar")
            node.set(qn("w:fldCharType"), kind)
        elif value == " PAGE ":
            node = OxmlElement("w:instrText")
            node.set(qn("xml:space"), "preserve")
            node.text = value
        else:
            node = OxmlElement("w:t")
            node.text = value
        run._r.append(node)


def cell_border(table) -> None:
    borders = OxmlElement("w:tblBorders")
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        border = OxmlElement(f"w:{edge}")
        border.set(qn("w:val"), "single")
        border.set(qn("w:sz"), "4")
        border.set(qn("w:color"), "000000")
        borders.append(border)
    table._tbl.tblPr.append(borders)


def polish_docx(path: Path) -> None:
    document = Document(path)
    section = document.sections[0]
    section.page_width, section.page_height = Inches(8.27), Inches(11.69)
    section.top_margin = Inches(0.9)
    section.bottom_margin = Inches(0.7)
    section.left_margin = section.right_margin = Inches(1.0)
    section.footer_distance = Inches(0.35)

    used = ("Normal", "Body Text", "First Paragraph", "Compact", "Heading 1",
            "Heading 2", "Heading 3", "Caption", "Table Paragraph", "Bibliography", "Source Code")
    for name in used:
        if name not in document.styles:
            continue
        style = document.styles[name]
        style.font.name = "Times New Roman"
        style.font.size = Pt(12)
        style.font.color.rgb = RGBColor(0, 0, 0)
        style.paragraph_format.line_spacing = 1.12
        style.paragraph_format.space_after = Pt(6)
        if name.startswith("Heading"):
            style.font.bold = True
            style.paragraph_format.space_before = Pt(10)
            style.paragraph_format.space_after = Pt(5)
        elif name == "Source Code":
            style.font.name = "Courier New"
            style.font.size = Pt(9)
            style.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.LEFT
        else:
            style.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY

    for paragraph in document.paragraphs:
        if paragraph.text == "ABSTRACT":
            paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
            paragraph.paragraph_format.space_after = Pt(16)
        elif paragraph.text.startswith("1. INTRODUCTION"):
            paragraph.paragraph_format.page_break_before = True
        elif paragraph.text.startswith("Figure "):
            paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
            paragraph.paragraph_format.space_after = Pt(10)
        elif paragraph._p.xpath(".//w:drawing"):
            paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        elif paragraph.text.startswith("Keywords:"):
            paragraph.paragraph_format.space_before = Pt(18)
        for run in paragraph.runs:
            run.font.name = "Courier New" if paragraph.style.name == "Source Code" else "Times New Roman"
            run.font.color.rgb = RGBColor(0, 0, 0)
            if paragraph.style.name.startswith("Heading"):
                run.font.size = Pt(12)
            elif paragraph.style.name == "Source Code":
                run.font.size = Pt(9)

    # Keep diagrams on one page; Pandoc preserves their source pixel height.
    for shape in document.inline_shapes:
        max_height = Inches(4.4)
        max_width = Inches(6.1)
        scale = min(1, max_height / shape.height, max_width / shape.width)
        if scale < 1:
            shape.width = int(shape.width * scale)
            shape.height = int(shape.height * scale)

    for index, table in enumerate(document.tables):
        caption = document.add_paragraph()
        caption.style = document.styles["Normal"]
        caption.alignment = WD_ALIGN_PARAGRAPH.CENTER
        caption.paragraph_format.keep_with_next = True
        caption.paragraph_format.space_before = Pt(5)
        caption.paragraph_format.space_after = Pt(3)
        caption.add_run(f"Table {index + 1}: ").bold = True
        caption.add_run(CAPTIONS[index])
        table._tbl.addprevious(caption._p)
        cell_border(table)
        for row_index, row in enumerate(table.rows):
            row._tr.get_or_add_trPr().append(OxmlElement("w:cantSplit"))
            for cell in row.cells:
                cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
                if row_index == 0:
                    shading = OxmlElement("w:shd")
                    shading.set(qn("w:fill"), "000000")
                    cell._tc.get_or_add_tcPr().append(shading)
                for paragraph in cell.paragraphs:
                    paragraph.alignment = WD_ALIGN_PARAGRAPH.LEFT
                    paragraph.paragraph_format.space_after = Pt(0)
                    paragraph.paragraph_format.line_spacing = 1.0
                    for run in paragraph.runs:
                        run.font.name = "Times New Roman"
                        run.font.size = Pt(10.5)
                        run.font.bold = row_index == 0
                        run.font.color.rgb = RGBColor(255, 255, 255) if row_index == 0 else RGBColor(0, 0, 0)

    footer = section.footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    add_page_field(footer)
    for run in footer.runs:
        run.font.name = "Times New Roman"
        run.font.size = Pt(10)

    # The abstract is page i; Chapter 1 begins with page 1.
    keywords = next(paragraph for paragraph in document.paragraphs if paragraph.text.startswith("Keywords:"))
    abstract_section = deepcopy(section._sectPr)
    first_number = OxmlElement("w:pgNumType")
    first_number.set(qn("w:fmt"), "lowerRoman")
    first_number.set(qn("w:start"), "1")
    abstract_section.append(first_number)
    keywords._p.get_or_add_pPr().append(abstract_section)
    body_number = OxmlElement("w:pgNumType")
    body_number.set(qn("w:fmt"), "decimal")
    body_number.set(qn("w:start"), "1")
    section._sectPr.append(body_number)

    document.save(path)


def main() -> None:
    DOCX.parent.mkdir(parents=True, exist_ok=True)
    PDF_DIR.mkdir(parents=True, exist_ok=True)
    subprocess.run([
        "pandoc", str(SOURCE), "--from=gfm", "--to=docx",
        f"--resource-path={ROOT / 'docs'}", f"--output={DOCX}",
    ], check=True)
    polish_docx(DOCX)
    subprocess.run([
        "libreoffice", "-env:UserInstallation=file:///tmp/stocksync-lo-combined",
        "--headless", "--convert-to", "pdf", "--outdir", str(PDF_DIR), str(DOCX),
    ], check=True)
    print(f"Wrote {PDF_DIR / 'StockSync-Combined-Report.pdf'}")


if __name__ == "__main__":
    main()
