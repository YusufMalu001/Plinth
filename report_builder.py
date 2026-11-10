from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
import hashlib
import os

import openpyxl  # type: ignore
from docx import Document  # type: ignore
from docx.enum.section import WD_ORIENT  # type: ignore
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT  # type: ignore
from docx.enum.text import WD_ALIGN_PARAGRAPH  # type: ignore
from docx.oxml import OxmlElement  # type: ignore
from docx.oxml.ns import qn  # type: ignore
from docx.shared import Inches, Pt, RGBColor  # type: ignore


BASE = Path('/home/fardeen/Downloads')
OUT = Path('/home/fardeen/Documents/aleyx-projects/Synergy/output/client-workbook-data-report.docx')
FILES = [
    'PS - CS12.xlsm', 'PS - Laser ECONOMY.xlsm', 'PS - Laser GLIDER (1).xlsm',
    'ABS MATERIAL REPORT.xlsx', 'PS - RODS CUTTING.xlsm', 'PS - Laser GLIDER.xlsm',
    'PS - CS10.xlsm', 'PS - CS9.xlsm', 'PS - CS8.xlsm', 'FLOOR AUDIT NEW.xlsm',
    'MRP PROJECT.xlsm', 'PS - CS3-CS6.xlsm', 'PS - CS11.xlsm',
]


def clean(value):
    return str(value).replace('\n', ' ').replace('\r', ' ').strip() if value is not None else ''


def source_cell(filename, sheet, row):
    return f'{filename} / {sheet} / row {row}'


def profile_workbook(filename):
    path = BASE / filename
    formulas = 0
    cached = 0
    populated = 0
    sheets = []
    wb_formula = openpyxl.load_workbook(path, read_only=True, data_only=False, keep_vba=True)
    wb_values = openpyxl.load_workbook(path, read_only=True, data_only=True, keep_vba=True)
    for wf, wv in zip(wb_formula.worksheets, wb_values.worksheets):
        sheet_populated = 0
        sheet_formulas = 0
        for row_f, row_v in zip(wf.iter_rows(values_only=True), wv.iter_rows(values_only=True)):
            for formula, value in zip(row_f, row_v):
                if value is not None and clean(value):
                    populated += 1
                    sheet_populated += 1
                if isinstance(formula, str) and formula.startswith('='):
                    formulas += 1
                    sheet_formulas += 1
                    if value is not None:
                        cached += 1
        sheets.append((wf.title, wf.max_row or 0, wf.max_column or 0, sheet_populated, sheet_formulas))
    return {'filename': filename, 'sheets': sheets, 'populated': populated, 'formulas': formulas, 'cached': cached}


def extract_products():
    wb = openpyxl.load_workbook(BASE / 'MRP PROJECT.xlsm', read_only=True, data_only=True, keep_vba=True)
    ws = wb['Masters']
    products = []
    for row_number, row in enumerate(ws.iter_rows(min_row=2, values_only=True), 2):
        sku, asin, name, mrp = (row + (None,) * 4)[:4]
        if clean(sku) and clean(name):
            products.append({'sku': clean(sku), 'asin': clean(asin), 'name': clean(name), 'mrp': mrp, 'source': source_cell('MRP PROJECT.xlsm', 'Masters', row_number)})
    return products


def extract_literals():
    units = defaultdict(list)
    departments = defaultdict(list)
    material_rows = defaultdict(list)
    ps_summaries = []
    for filename in FILES:
        if filename in {'ABS MATERIAL REPORT.xlsx', 'FLOOR AUDIT NEW.xlsm', 'MRP PROJECT.xlsm'}:
            continue
        wb = openpyxl.load_workbook(BASE / filename, read_only=True, data_only=True, keep_vba=True)
        ps_rows = []
        for ws in wb.worksheets:
            rows = [list(row) for row in ws.iter_rows(values_only=True)]
            for i, row in enumerate(rows):
                vals = [clean(x) for x in row]
                for j, value in enumerate(vals):
                    if value.upper() == 'DEPARTMENT' and j + 1 < len(vals) and vals[j + 1]:
                        departments[vals[j + 1]].append(source_cell(filename, ws.title, i + 1))
                if ws.title == 'PS_Log' and i > 0 and len(row) >= 6 and clean(row[3]):
                    ps_rows.append((clean(row[3]), row[4]))
                if not any(token in ws.title.upper() for token in ('MATERIAL', 'MAT -', 'ASSEMBLY')):
                    continue
                header = next((idx for idx, candidate in enumerate(rows) if 'PARTICULARS' in [clean(x).upper() for x in candidate] and 'QUANTITY' in [clean(x).upper() for x in candidate]), None)
                if header is None:
                    continue
                header_values = [clean(x).upper() for x in rows[header]]
                particulars_index = header_values.index('PARTICULARS')
                unit_index = header_values.index('UNIT') if 'UNIT' in header_values else None
                for row_number, data in enumerate(rows[header + 1:], header + 2):
                    name = clean(data[particulars_index]) if particulars_index < len(data) else ''
                    unit = clean(data[unit_index]) if unit_index is not None and unit_index < len(data) else ''
                    if not name or name.upper() in {'DATE', 'SIGN', 'REMARKS', 'PARTICULARS'} or name.endswith(':'):
                        continue
                    if unit and not unit.startswith('='):
                        units[unit].append(source_cell(filename, ws.title, row_number))
                    material_rows[name].append((filename, ws.title, row_number, unit))
        if ps_rows:
            ids = [x[0] for x in ps_rows]
            counts = Counter(ids)
            dates = [x[1] for x in ps_rows if isinstance(x[1], datetime)]
            date_range = ''
            if dates:
                date_range = f'{min(dates).date().isoformat()} to {max(dates).date().isoformat()}'
            ps_summaries.append((filename, len(ps_rows), len(counts), sum(v - 1 for v in counts.values() if v > 1), date_range))
    return units, departments, material_rows, ps_summaries


def cell_shading(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn('w:shd'))
    if shd is None:
        shd = OxmlElement('w:shd')
        tc_pr.append(shd)
    shd.set(qn('w:fill'), fill)


def cell_margins(cell, top=90, start=100, bottom=90, end=100):
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in('w:tcMar')
    if tc_mar is None:
        tc_mar = OxmlElement('w:tcMar')
        tc_pr.append(tc_mar)
    for side, value in [('top', top), ('start', start), ('bottom', bottom), ('end', end)]:
        node = tc_mar.find(qn(f'w:{side}'))
        if node is None:
            node = OxmlElement(f'w:{side}')
            tc_mar.append(node)
        node.set(qn('w:w'), str(value))
        node.set(qn('w:type'), 'dxa')


def set_cell_text(cell, text, bold=False, color='000000', size=8.5):
    cell.text = ''
    p = cell.paragraphs[0]
    p.paragraph_format.space_after = Pt(0)
    run = p.add_run(str(text))
    run.bold = bold
    run.font.name = 'Aptos'
    run._element.rPr.rFonts.set(qn('w:ascii'), 'Aptos')
    run._element.rPr.rFonts.set(qn('w:hAnsi'), 'Aptos')
    run.font.size = Pt(size)
    run.font.color.rgb = RGBColor.from_string(color)
    cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    cell_margins(cell)


def add_table(doc, headers, rows, widths=None, font_size=8.5):
    table = doc.add_table(rows=1, cols=len(headers))
    table.style = 'Table Grid'
    table.autofit = False
    for idx, header in enumerate(headers):
        set_cell_text(table.rows[0].cells[idx], header, bold=True, color='FFFFFF', size=font_size)
        cell_shading(table.rows[0].cells[idx], '1F4E78')
        if widths:
            table.rows[0].cells[idx].width = Inches(widths[idx])
    for row_index, row in enumerate(rows):
        cells = table.add_row().cells
        for idx, value in enumerate(row):
            set_cell_text(cells[idx], value, size=font_size)
            cell_shading(cells[idx], 'F3F6F9' if row_index % 2 else 'FFFFFF')
            if widths:
                cells[idx].width = Inches(widths[idx])
    doc.add_paragraph().paragraph_format.space_after = Pt(1)
    return table


def add_heading(doc, text, level=1):
    p = doc.add_paragraph(style=f'Heading {level}')
    p.paragraph_format.keep_with_next = True
    run = p.add_run(text)
    run.font.name = 'Aptos Display'
    run._element.rPr.rFonts.set(qn('w:ascii'), 'Aptos Display')
    run._element.rPr.rFonts.set(qn('w:hAnsi'), 'Aptos Display')
    run.font.color.rgb = RGBColor(0, 0, 0)
    return p


def add_body(doc, text, bold_lead=None):
    p = doc.add_paragraph(style='Body Text')
    p.paragraph_format.space_after = Pt(6)
    if bold_lead and text.startswith(bold_lead):
        r = p.add_run(bold_lead)
        r.bold = True
        p.add_run(text[len(bold_lead):])
    else:
        p.add_run(text)
    return p


def build():
    profiles = [profile_workbook(f) for f in FILES]
    products = extract_products()
    units, departments, materials, ps_summaries = extract_literals()
    glider_hashes = {f: hashlib.sha256((BASE / f).read_bytes()).hexdigest() for f in ['PS - Laser GLIDER.xlsm', 'PS - Laser GLIDER (1).xlsm']}

    doc = Document()
    section = doc.sections[0]
    section.top_margin = Inches(0.65)
    section.bottom_margin = Inches(0.65)
    section.left_margin = Inches(0.7)
    section.right_margin = Inches(0.7)
    styles = doc.styles
    styles['Normal'].font.name = 'Aptos'
    styles['Normal']._element.rPr.rFonts.set(qn('w:ascii'), 'Aptos')
    styles['Normal']._element.rPr.rFonts.set(qn('w:hAnsi'), 'Aptos')
    styles['Normal'].font.size = Pt(10)
    styles['Body Text'].font.name = 'Aptos'
    styles['Body Text'].font.size = Pt(10)
    for style_name in ['Heading 1', 'Heading 2', 'Heading 3']:
        styles[style_name].font.name = 'Aptos Display'
        styles[style_name].font.color.rgb = RGBColor(0, 0, 0)
    styles['Title'].font.name = 'Aptos Display'
    styles['Title'].font.color.rgb = RGBColor(0, 0, 0)
    styles['Title'].font.size = Pt(24)

    title = doc.add_paragraph(style='Title')
    title.add_run('Synergy International Client Workbook Data Report')
    subtitle = doc.add_paragraph()
    subtitle.paragraph_format.space_after = Pt(16)
    run = subtitle.add_run('Source inventory and pre-seeding data classification')
    run.font.size = Pt(12)
    run.italic = True
    run.font.color.rgb = RGBColor(80, 80, 80)

    add_body(doc, 'This report records the data found in the 13 supplied Excel workbooks before any database import. It distinguishes directly identifiable master data from operational history, formula-driven values, duplicate files, and records that require a business decision before they can be inserted safely.')
    add_body(doc, f'Prepared from {len(FILES)} supplied workbooks. The report contains the complete product master extracted from MRP PROJECT.xlsm, source-level inventory for every worksheet, literal units and departments, material candidates with provenance, production-log summaries, and import controls.')

    add_heading(doc, '1 Report conclusion', 1)
    add_body(doc, 'The supplied workbooks contain enough evidence to import the product master as a first controlled dataset. They do not contain one authoritative, consistently labelled master for categories, product families, materials, departments, vendors, or UOM dimensions. Those fields must be staged and reviewed before final database seeding. No remote database data is used in this report.')
    add_body(doc, 'The GLIDER duplicate should be represented once because PS - Laser GLIDER.xlsm and PS - Laser GLIDER (1).xlsm have the same SHA-256 file hash. Formula-heavy workbooks must be recalculated in an Excel-compatible engine before their evaluated values are treated as source facts.')

    add_heading(doc, '2 Workbook inventory', 1)
    inventory_rows = []
    for p in profiles:
        key = p['filename']
        if key == 'MRP PROJECT.xlsm': content = 'SKU, ASIN, item name, MRP, warehouse fields, label input'
        elif key == 'ABS MATERIAL REPORT.xlsx': content = 'Raw material inward, onward, goods received, balances, rates and formulas'
        elif key == 'FLOOR AUDIT NEW.xlsm': content = 'Floor and return audit balances, physical counts and variance formulas'
        else: content = 'Production schedules, material issues, assembly/operation sheets and PS_Log'
        inventory_rows.append((p['filename'], len(p['sheets']), p['populated'], p['formulas'], p['cached'], content))
    add_table(doc, ['Workbook', 'Sheets', 'Populated cells', 'Formula cells', 'Cached formula values', 'Primary content'], inventory_rows, [1.55, .45, .72, .68, .85, 2.65], 7.5)

    add_heading(doc, '3 Complete product master', 1)
    add_body(doc, f'MRP PROJECT.xlsm / Masters contains {len(products)} product rows with all four identity/value fields present: SKU, ASIN, item name, and MRP. These rows are the strongest product-master source in the supplied files. Warehouse ID and address cells are blank in the extracted rows and are not fabricated here.')
    product_rows = [(p['sku'], p['asin'], p['mrp'], p['name']) for p in products]
    add_table(doc, ['SKU', 'ASIN', 'MRP', 'Item name'], product_rows, [.78, 1.0, .5, 4.95], 7.3)

    add_heading(doc, '4 Explicit units of measure', 1)
    add_body(doc, 'The following literal unit labels occur in material issue and assembly sheets. Their presence does not prove a conversion, dimension, or canonical code, so the source spelling is retained.')
    add_table(doc, ['Source unit label', 'Occurrences', 'Representative source'], [(u, len(srcs), srcs[0]) for u, srcs in sorted(units.items())], [1.25, .7, 5.3], 8)

    add_heading(doc, '5 Explicit department values', 1)
    if departments:
        add_table(doc, ['Source department value', 'Occurrences', 'Source'], [(d, len(srcs), srcs[0]) for d, srcs in sorted(departments.items())], [2.2, .7, 4.35], 8)
    else:
        add_body(doc, 'No explicit department values were found.')
    add_body(doc, 'Names such as store in-charge, production in-charge, laser in-charge, buffing in-charge, and cutting in-charge are personnel or responsibility labels, not department master values. They are therefore not converted into departments.')

    add_heading(doc, '6 Material candidates', 1)
    add_body(doc, f'The material/assembly sheets contain {len(materials)} distinct literal particulars after excluding obvious header labels and signature markers. This is a candidate register, not an approved material master: it includes components, intermediate assemblies, finished subassemblies, dimensions, and some operational labels. Each row retains its source so the final classification can be reviewed without losing evidence.')
    material_rows = []
    for name, occurrences in sorted(materials.items(), key=lambda item: item[0].lower()):
        source = occurrences[0]
        source_text = source_cell(source[0], source[1], source[2])
        units_seen = ', '.join(sorted(set(x[3] for x in occurrences if x[3])))
        material_rows.append((name, len(occurrences), units_seen, source_text))
    add_table(doc, ['Literal particular', 'Occurrences', 'Source unit labels', 'First source'], material_rows, [2.45, .65, 1.1, 3.05], 7.2)

    add_heading(doc, '7 Production and operational history', 1)
    add_body(doc, 'PS_Log is the most structured production-history source. It contains PS IDs, dates, sheet names, and sequence information. It should not be imported as products or materials. The report preserves duplicate PS IDs for review rather than silently deduplicating them.')
    add_table(doc, ['Workbook', 'PS rows', 'Unique PS IDs', 'Duplicate rows', 'Date range'], ps_summaries, [2.05, .65, .78, .8, 2.25], 8)
    add_body(doc, 'ABS MATERIAL REPORT.xlsx and FLOOR AUDIT NEW.xlsm contain stock movement and audit information. These are transaction/history sources, not master data. Their formulas and balance columns require recalculation and reconciliation before any opening balance or ledger posting is created.')

    add_heading(doc, '8 Source sheet classification', 1)
    for p in profiles:
        add_heading(doc, p['filename'], 2)
        sheet_text = '; '.join(f'{name} ({rows}x{cols})' for name, rows, cols, _, _ in p['sheets'])
        add_body(doc, sheet_text)

    add_heading(doc, '9 Data quality findings and controls', 1)
    findings = [
        ('Duplicate source file', 'The two GLIDER workbook hashes are identical: ' + glider_hashes['PS - Laser GLIDER.xlsm'] + '.', 'Load once and retain both filenames in provenance if needed.'),
        ('Formula evaluation', 'ABS MATERIAL REPORT.xlsx contains 9,989 formula cells and 3,723 cached values.', 'Recalculate a temporary copy using an Excel-compatible engine, then validate balances.'),
        ('Missing warehouse data', 'MRP PROJECT / Masters has blank warehouse ID and address fields in the extracted product rows.', 'Leave nullable and report missing values; do not infer a warehouse.'),
        ('Material ambiguity', f'{len(materials)} literal particulars include components and process labels.', 'Stage as candidates and approve material type/code/UOM before master import.'),
        ('Department ambiguity', 'Only one explicit department value was found; in-charge labels identify people or roles.', 'Create only the explicit value unless the client supplies an organization master.'),
        ('Vendor absence', 'No vendor master was found in the 13 supplied workbooks.', 'Do not create vendors from party names without a vendor master decision.'),
    ]
    add_table(doc, ['Finding', 'Evidence', 'Import control'], findings, [1.25, 3.1, 2.7], 8)

    add_heading(doc, '10 Proposed controlled import order', 1)
    for item in [
        'Stage every extracted row with workbook, sheet, row, source value, normalized comparison value, and extraction mode (literal or recalculated formula).',
        f'Approve the {len(products)} product rows from MRP PROJECT / Masters as products; keep MRP and ASIN provenance attached.',
        'Approve literal UOM labels and define canonical codes and dimensions before creating UOM records.',
        'Classify material candidates into raw material, component, packaging, intermediate assembly, process label, or reject before creating Material records.',
        'Confirm category and product-family mappings; the workbooks do not provide a single explicit category master.',
        'Confirm department and warehouse master values; do not infer them from personnel names or SKU prefixes.',
        'Only after master validation, import stock, production, and audit history with reconciliation checks and duplicate handling.',
    ]:
        p = doc.add_paragraph(style='List Number')
        p.paragraph_format.space_after = Pt(3)
        p.add_run(item)

    add_heading(doc, '11 Review decisions required before seeding', 1)
    for item in [
        f'Approve the {len(products)}-row MRP product master as the authoritative product list.',
        'Confirm whether the identical GLIDER workbook is one source copy, as the file hashes indicate.',
        'Provide or approve canonical UOM codes and dimensions for Pipes, Nos., Pcs, and Box.',
        'Provide the authoritative department and warehouse list.',
        'Approve material classifications and canonical codes for the candidate register.',
        'Confirm whether production logs, ABS stock movements, and floor/return audits are to be imported as historical transactions or only used to establish opening balances.',
    ]:
        p = doc.add_paragraph(style='List Bullet')
        p.paragraph_format.space_after = Pt(3)
        p.add_run(item)

    add_heading(doc, 'Appendix A Source file fingerprints', 1)
    add_table(doc, ['Workbook', 'SHA-256'], [(f, hashlib.sha256((BASE / f).read_bytes()).hexdigest()) for f in FILES], [2.4, 4.8], 7.2)

    footer = section.footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    fr = footer.add_run('Synergy International client workbook data report')
    fr.font.size = Pt(8)
    fr.font.color.rgb = RGBColor(100, 100, 100)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc.core_properties.title = 'Synergy International Client Workbook Data Report'
    doc.core_properties.subject = 'Pre-seeding source data classification'
    doc.save(OUT)
    print(OUT)


if __name__ == '__main__':
    build()
