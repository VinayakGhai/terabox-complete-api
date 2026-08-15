from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors

pdf_path = "/home/nayak-indie/terabox-complete-api/LEARN_IT.pdf"
doc = SimpleDocTemplate(pdf_path, pagesize=letter, leftMargin=36, rightMargin=36, topMargin=36, bottomMargin=36)
styles = getSampleStyleSheet()

title_style = ParagraphStyle(
    'TitleStyle',
    parent=styles['Normal'],
    fontName='Helvetica-Bold',
    fontSize=42,
    leading=48,
    textColor=colors.HexColor('#0d1117'),
    alignment=0, # Left-aligned minimalist
    spaceAfter=10
)

subtitle_style = ParagraphStyle(
    'SubTitleStyle',
    parent=styles['Normal'],
    fontName='Helvetica',
    fontSize=14,
    leading=18,
    textColor=colors.HexColor('#24292e'),
    spaceAfter=15
)

section_heading = ParagraphStyle(
    'SectionHeading',
    parent=styles['Heading2'],
    fontName='Helvetica-Bold',
    fontSize=18,
    leading=22,
    textColor=colors.HexColor('#0366d6'),
    spaceBefore=15,
    spaceAfter=8
)

body_style = ParagraphStyle(
    'BodyStyle',
    parent=styles['Normal'],
    fontName='Helvetica',
    fontSize=10,
    leading=14,
    textColor=colors.HexColor('#24292e'),
    spaceAfter=8
)

code_style = ParagraphStyle(
    'CodeStyle',
    parent=styles['Normal'],
    fontName='Courier',
    fontSize=9,
    leading=12,
    textColor=colors.HexColor('#24292e'),
    backColor=colors.HexColor('#f6f8fa'),
    borderColor=colors.HexColor('#e1e4e8'),
    borderWidth=1,
    borderPadding=6,
    spaceAfter=10
)

elements = []

elements.append(Paragraph("LEARN IT", title_style))
elements.append(Paragraph("Terabox Complete API & CLI Uploader Manual — VinayakGhai (Indie Dev)", subtitle_style))
elements.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor('#0366d6'), spaceAfter=15))

elements.append(Paragraph("1. ONE-LINE INSTALLATION (LINUX / AUR)", section_heading))
elements.append(Paragraph(
    "To install Terabox Complete API on any Linux system, simply run: <b>yay -S teraapi-full</b> "
    "or install globally via Node package manager using: <b>npm install -g @vinayakghai/terabox-complete-api</b>.",
    body_style
))
elements.append(Paragraph(
    "The Terabox Complete API is engineered for ultra-fast, non-intrusive command line uploads. "
    "Unlike legacy web automation tools, it uses a Cloudflare Worker edge proxy with zero GUI windows, "
    "achieving 3ms prompt returns via background detachment.",
    body_style
))

elements.append(Paragraph("2. REVAMPED CLI SYNTAX REFERENCE (stt / storetera)", section_heading))

table_data = [
    [Paragraph("<b>Command Syntax</b>", body_style), Paragraph("<b>Short Alias</b>", body_style), Paragraph("<b>Description & Execution Mode</b>", body_style)],
    [Paragraph("storetera upload &lt;file&gt;", body_style), Paragraph("stt &lt;file&gt;", body_style), Paragraph("Upload file instantly (Background Detached &lt;3ms)", body_style)],
    [Paragraph("storetera upload --sync", body_style), Paragraph("stt upload --sync", body_style), Paragraph("Upload file in foreground with live progress bar", body_style)],
    [Paragraph("storetera dir &lt;folder&gt;", body_style), Paragraph("stt dir &lt;folder&gt;", body_style), Paragraph("Upload entire directory recursively", body_style)],
    [Paragraph("storetera track", body_style), Paragraph("stt track", body_style), Paragraph("View live color background process progress bars", body_style)],
    [Paragraph("storetera delete &lt;path&gt;", body_style), Paragraph("stt delete &lt;path&gt;", body_style), Paragraph("Purge remote file or directory on cloud storage", body_style)],
    [Paragraph("storetera list [folder]", body_style), Paragraph("stt list [folder]", body_style), Paragraph("List all remote files in TeraBox storage", body_style)],
    [Paragraph("storetera check", body_style), Paragraph("stt check", body_style), Paragraph("Verify Worker proxy & account session health", body_style)],
    [Paragraph("storetera log", body_style), Paragraph("stt log", body_style), Paragraph("View formatted upload history log", body_style)],
    [Paragraph("storetera clear", body_style), Paragraph("stt log clear / stt clear", body_style), Paragraph("Clear local upload history & tracking cache", body_style)],
    [Paragraph("storetera help", body_style), Paragraph("stt help / stt -h", body_style), Paragraph("Display interactive terminal help menu", body_style)]
]

t = Table(table_data, colWidths=[150, 110, 280])
t.setStyle(TableStyle([
    ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#f6f8fa')),
    ('TEXTCOLOR', (0,0), (-1,0), colors.HexColor('#0366d6')),
    ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#e1e4e8')),
    ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ('BOTTOMPADDING', (0,0), (-1,-1), 6),
    ('TOPPADDING', (0,0), (-1,-1), 6),
]))
elements.append(t)
elements.append(Spacer(1, 15))

elements.append(Paragraph("3. END USER LICENSE AGREEMENT (EULA) & MIT LICENSE", section_heading))
elements.append(Paragraph(
    "This software is released by <b>VinayakGhai (Indie Dev)</b> under the MIT License. "
    "You are granted a free, perpetual, non-exclusive license to use, modify, and distribute this software for "
    "personal or commercial automated cloud storage workloads.",
    body_style
))
elements.append(Paragraph(
    "<b>Privacy Notice</b>: Credentials (ndus) are stored strictly locally in your .env file or extracted "
    "from local browser stores. No telemetry or credentials are sent to external third parties.",
    body_style
))

doc.build(elements)
print("✓ LEARN_IT.pdf successfully generated with ReportLab!")
