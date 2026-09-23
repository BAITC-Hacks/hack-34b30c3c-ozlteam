"""Seven-sheet 1C-friendly workbook interchange using the existing openpyxl dependency."""

from datetime import date, datetime
from io import BytesIO
from zipfile import BadZipFile

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, PatternFill
from pydantic import ValidationError

from app.Domains.Replenishment.DTO.calculation import CalculationInput

SHEETS = {
    "products": ("sku", "name", "category", "supplier_id"),
    "suppliers": ("id", "name", "lead_days", "min_order_qty"),
    "sales": ("date", "sku", "warehouse", "customer_id", "quantity", "price"),
    "stock": ("sku", "warehouse", "quantity"),
    "inbound": ("sku", "warehouse", "quantity", "eta"),
    "stockouts": ("sku", "warehouse", "start", "end"),
    "category_growth": ("category", "growth_pct"),
}
MAX_ROWS_PER_SHEET = 100_000


class InvalidWorkbook(ValueError):
    pass


def parse_workbook(content: bytes) -> CalculationInput:
    try:
        workbook = load_workbook(BytesIO(content), read_only=True, data_only=True)
    except (BadZipFile, OSError, ValueError) as error:
        raise InvalidWorkbook("Файл не является корректной книгой XLSX") from error
    try:
        missing = set(SHEETS) - set(workbook.sheetnames)
        if missing:
            raise InvalidWorkbook(f"Отсутствуют листы: {', '.join(sorted(missing))}")
        payload: dict = {}
        for name, columns in SHEETS.items():
            rows = workbook[name].iter_rows(values_only=True)
            header = next(rows, None)
            if header is None or tuple(header[: len(columns)]) != columns:
                raise InvalidWorkbook(f"Лист {name}: ожидаются колонки {', '.join(columns)}")
            parsed = []
            for number, cells in enumerate(rows, start=2):
                if number > MAX_ROWS_PER_SHEET + 1:
                    raise InvalidWorkbook(f"Лист {name}: максимум {MAX_ROWS_PER_SHEET} строк")
                if all(value is None for value in cells):
                    continue
                if any(cells[index] is None for index in range(len(columns))):
                    raise InvalidWorkbook(f"Лист {name}, строка {number}: пустое обязательное поле")
                row = dict(zip(columns, cells, strict=False))
                for field in ("date", "eta", "start", "end"):
                    if field in row and isinstance(row[field], datetime):
                        row[field] = row[field].date()
                    elif field in row and isinstance(row[field], str):
                        try:
                            row[field] = date.fromisoformat(row[field])
                        except ValueError as error:
                            raise InvalidWorkbook(
                                f"Лист {name}, строка {number}: неверная дата в {field}"
                            ) from error
                parsed.append(row)
            payload[name] = parsed
        if "config" in workbook:
            rows = workbook["config"].iter_rows(values_only=True)
            if next(rows, None) != ("setting", "value"):
                raise InvalidWorkbook("Лист config: ожидаются колонки setting, value")
            settings = {cells[0]: cells[1] for cells in rows if cells and cells[0] is not None}
            if "as_of" not in settings or "review_days" not in settings:
                raise InvalidWorkbook("Лист config: нужны as_of и review_days")
            payload["as_of"] = settings["as_of"]
            payload["review_days"] = settings["review_days"]
            if isinstance(payload["as_of"], datetime):
                payload["as_of"] = payload["as_of"].date()
        else:
            if not payload["sales"]:
                raise InvalidWorkbook("Без листа config нужна хотя бы одна дата продажи")
            payload["as_of"] = max(row["date"] for row in payload["sales"])
            payload["review_days"] = 14
        try:
            return CalculationInput.model_validate(payload)
        except ValidationError as error:
            first = error.errors()[0]
            path = ".".join(str(part) for part in first["loc"])
            raise InvalidWorkbook(f"Некорректные данные {path}: {first['msg']}") from error
    finally:
        workbook.close()


def create_workbook(data: CalculationInput) -> bytes:
    workbook = Workbook()
    workbook.remove(workbook.active)
    for name, columns in SHEETS.items():
        sheet = workbook.create_sheet(name)
        sheet.append(columns)
        for record in getattr(data, name):
            sheet.append([getattr(record, column) for column in columns])
        sheet.freeze_panes = "A2"
        sheet.auto_filter.ref = sheet.dimensions
        for cell in sheet[1]:
            cell.font = Font(bold=True, color="FFFFFF")
            cell.fill = PatternFill("solid", fgColor="224360")
        for column_index, column in enumerate(columns, start=1):
            sheet.column_dimensions[sheet.cell(1, column_index).column_letter].width = min(
                30, max(12, len(column) + 4)
            )
    config = workbook.create_sheet("config")
    config.append(("setting", "value"))
    config.append(("as_of", data.as_of))
    config.append(("review_days", data.review_days))
    config["B2"].number_format = "yyyy-mm-dd"
    for cell in config[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="224360")
    for sheet in workbook:
        for row in sheet.iter_rows(min_row=2):
            for cell in row:
                if isinstance(cell.value, date):
                    cell.number_format = "yyyy-mm-dd"
    output = BytesIO()
    workbook.save(output)
    return output.getvalue()
