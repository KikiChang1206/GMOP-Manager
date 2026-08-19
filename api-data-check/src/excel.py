"""將擷取到的表格資料寫成真正的 .xls (BIFF) 檔。"""
from datetime import datetime
from pathlib import Path

import xlwt

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT / "output"


def write_xls(headers, rows, prefix="api_failures") -> Path:
    """headers: List[str]; rows: List[List[str]]。回傳產生的檔案路徑。"""
    OUTPUT_DIR.mkdir(exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_path = OUTPUT_DIR / f"{prefix}_{stamp}.xls"

    book = xlwt.Workbook(encoding="utf-8")
    sheet = book.add_sheet("Sheet1")

    bold = xlwt.easyxf("font: bold on;")
    for col, name in enumerate(headers):
        sheet.write(0, col, name, bold)
    for r, row in enumerate(rows, start=1):
        for c, value in enumerate(row):
            sheet.write(r, c, value)

    book.save(str(out_path))
    return out_path
