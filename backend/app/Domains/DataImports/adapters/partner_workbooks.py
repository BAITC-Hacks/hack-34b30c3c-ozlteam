"""Explicit profiles for EKT's example workbooks; no database or guessed ERP facts.

Monthly series and quarantined rows are evidence, never invented daily sales.
The caller scopes stable external IDs to its source and validates every DataRow.
"""

import hashlib
import io
import json
import re
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from zipfile import ZipFile

from openpyxl import load_workbook

from app.core.errors import DomainError

MAX_PACKAGE_BYTES = 100 * 1024 * 1024
MAX_EXPANDED_BYTES = 500 * 1024 * 1024
MAX_SOURCE_ROWS = 600_000
TZ = timezone(timedelta(hours=5))
MONTHS = ("янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек")


def _text(value):
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def _number(value):
    try:
        result = Decimal(str(value))
        return result if result.is_finite() else None
    except (InvalidOperation, ValueError):
        return None


def _json(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    return value


def _hash(values):
    return hashlib.sha256(
        json.dumps(values, ensure_ascii=False, default=_json).encode()
    ).hexdigest()


def _month(label):
    value = _text(label).lower()
    year = re.search(r"20\d\d", value)
    if not year:
        return None
    for index, prefix in enumerate(MONTHS, 1):
        if value.startswith(prefix):
            return date(int(year[0]), index, 1).isoformat()
    return None


def _profile(filename):
    name = filename.lower()
    supplier = "systeme" if any(s in name for s in ("system", "syseme")) else "iek"
    for marker, kind in (
        ("динамика", "dynamics"),
        ("moq", "terms"),
        ("ежемесячные продажи", "monthly_sales"),
        ("ежемесячные остатки", "monthly_stocks"),
        ("сезонность", "seasonality"),
        ("пут", "inbound"),
    ):
        if marker in name:
            return supplier, kind
    raise DomainError("Неизвестный профиль книги", status_code=422, code="unknown_workbook_profile")


def parse_partner_files(files: list[tuple[str, bytes]], options: dict) -> dict:
    """Parse supplier workbooks as a single union, retaining missing-data blockers.

    Options are validated by the API DTO. Unit/MOQ/warehouse/stock overrides are
    explicit test assumptions and remain recorded in summary for auditability.
    """
    if not files or len(files) > 24 or sum(len(b) for _, b in files) > MAX_PACKAGE_BYTES:
        raise DomainError(
            "Допустим пакет из 1–24 книг до 100 МиБ", status_code=413, code="package_too_large"
        )
    as_of = date.fromisoformat(options.get("as_of", "2026-09-22"))
    history_start = date.fromisoformat(options.get("history_start", "2025-01-01"))
    revision = options.get("revision", 1)
    rows, issues, controls, manifest = [], [], [], []
    products, warehouses, suppliers, categories = {}, {}, {}, {}
    occurrences, identities, seen_files = Counter(), {}, set()
    total_source_rows = 0

    def row(kind, external_id, **kwargs):
        return dict(kind=kind, external_id=external_id, revision=revision, **kwargs)

    def warehouse(name):
        external_id = "ekt:warehouse:" + name
        warehouses[external_id] = row("warehouses", external_id, name=name)
        return external_id

    def issue(code, message, loc, product=None, severity="warning"):
        if product is None and loc.get("product_code"):
            product = products.get(loc["product_code"])
        issues.append(dict(severity=severity, code=code, message=message, **loc))
        if product is not None:
            product["reasons"].add(code)
            if severity == "error":
                product["blockers"].add(code)

    def product(code, name, supplier, loc, unit=None, sku=None):
        key = _text(code)
        if not key:
            return None
        item = products.setdefault(
            key,
            dict(
                code=key,
                external_id="ekt:product:" + key,
                name=_text(name) or key,
                supplier=supplier,
                supplier_external_id="ekt:supplier:" + supplier,
                reasons=set(),
                blockers=set(),
                provenance=[],
                units=set(),
                skus=set(),
                history=False,
                latest_stock=None,
                term=None,
                category=None,
                cable=False,
            ),
        )
        if item["supplier"] != supplier:
            issue("supplier_conflict", "Код встречается у разных поставщиков", loc, item, "error")
        if unit:
            item["units"].add(_text(unit))
        if sku:
            item["skus"].add(_text(sku))
        # One evidence location per file/profile suffices for the product registry;
        # each underlying fact retains its own source coordinates in controls.
        if not any(p["filename"] == loc["filename"] for p in item["provenance"]):
            item["provenance"].append(loc.copy())
        return item

    def fact(data, loc, raw):
        identity = (data["kind"], data["external_id"])
        digest = _hash(data)
        previous = identities.get(identity)
        if previous is not None:
            if previous != digest:
                issue(
                    "conflicting_fact",
                    "Одинаковый внешний ID содержит разные значения",
                    loc,
                    severity="error",
                )
            return
        identities[identity] = digest
        rows.append(data)
        # Facts have normalized values; source columns are documented in the
        # manifest. Raw original cells remain available for every accepted fact.
        controls.append(
            dict(
                kind="fact_provenance",
                external_id=data["external_id"],
                **loc,
                cells=[_json(v) for v in raw],
            )
        )

    def stock(item, quantity, reserved, day, warehouse_name, loc, raw):
        q, r = _number(quantity), _number(reserved)
        if q is None or r is None or q < 0 or r < 0 or r > q:
            issue("invalid_stock", "Остаток или резерв некорректен", loc, item, "error")
            return
        if not warehouse_name:
            issue("stock_warehouse_missing", "Нужно сопоставить склад остатков", loc, item, "error")
            return
        wid = warehouse(warehouse_name)
        stamp = day.isoformat() + "T00:00:00+05:00"
        fact(
            row(
                "stocks",
                "ekt:stock:" + _hash([item["code"], wid, stamp]),
                product_external_id=item["external_id"],
                warehouse_external_id=wid,
                as_of=stamp,
                quantity=str(q),
                reserved=str(r),
            ),
            loc,
            raw,
        )
        item["latest_stock"] = max(item["latest_stock"] or day, day)

    def inbound(item, quantity, eta, document, loc, raw):
        q = _number(quantity)
        if q is None or q <= 0:
            return
        name = options.get("warehouse_mapping", {}).get(item["supplier"] + ".inbound")
        if not name:
            issue(
                "inbound_warehouse_missing",
                "Нужно сопоставить склад поступления",
                loc,
                item,
                "error",
            )
            return
        wid = warehouse(name)
        fact(
            row(
                "inbound",
                "ekt:inbound:" + _hash([item["code"], wid, document, eta]),
                product_external_id=item["external_id"],
                warehouse_external_id=wid,
                supplier_external_id=item["supplier_external_id"],
                expected_date=eta,
                document_id=document,
                quantity=str(q),
            ),
            loc,
            raw,
        )

    for filename, content in sorted(files, key=lambda f: f[0]):
        if Path(filename).suffix.lower() != ".xlsx":
            raise DomainError(
                "Профиль принимает XLSX", status_code=415, code="unsupported_file_type"
            )
        digest = hashlib.sha256(content).hexdigest()
        if digest in seen_files:
            issues.append(
                dict(
                    severity="warning",
                    code="duplicate_file",
                    message="Повтор той же книги пропущен",
                    filename=filename,
                    sheet=None,
                    row=0,
                )
            )
            continue
        seen_files.add(digest)
        supplier, kind = _profile(filename)
        profile = supplier + "." + kind
        suppliers[supplier] = row(
            "suppliers",
            "ekt:supplier:" + supplier,
            name="IEK" if supplier == "iek" else "Systeme Electric",
        )
        with ZipFile(io.BytesIO(content)) as archive:
            if sum(i.file_size for i in archive.infolist()) > MAX_EXPANDED_BYTES:
                raise DomainError(
                    "Книга после распаковки слишком велика", status_code=413, code="file_too_large"
                )
        book = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        file_count = 0
        # Occurrence IDs are scoped to a workbook scan, not its name. Reordering
        # distinct rows or replaying under a different filename preserves IDs.
        occurrences.clear()
        try:
            for sheet_index, sheet in enumerate(book):
                iterator = sheet.iter_rows(values_only=True)
                headers = None
                for number, raw in enumerate(iterator, 1):
                    if not any(v is not None for v in raw):
                        continue
                    file_count += 1
                    total_source_rows += 1
                    if total_source_rows > MAX_SOURCE_ROWS:
                        raise DomainError(
                            "Слишком много строк в пакете", status_code=413, code="too_many_rows"
                        )
                    loc = dict(filename=filename, sheet=sheet.title, row=number, supplier=supplier)
                    if kind == "seasonality" or sheet_index > 0:
                        controls.append(
                            dict(kind="seasonality_reference", **loc, cells=[_json(v) for v in raw])
                        )
                        continue
                    if headers is None:
                        if kind == "inbound" and supplier == "systeme" and number < 2:
                            continue
                        headers = raw
                        expected = {
                            "dynamics": (3, "Код"),
                            "terms": (1, "Код 1с")
                            if supplier == "iek"
                            else (2, "Номенклатура.Код"),
                            "monthly_sales": (1, "Номенклатура.Код"),
                            "monthly_stocks": (2, "Номенклатура.Код"),
                            "inbound": (0, "Код 1с") if supplier == "iek" else (2, "Код 1с"),
                        }[kind]
                        if len(raw) <= expected[0] or _text(raw[expected[0]]) != expected[1]:
                            raise DomainError(
                                "Заголовки книги не соответствуют выбранному профилю",
                                status_code=422,
                                code="workbook_header_mismatch",
                            )
                        controls.append(
                            dict(kind="source_headers", **loc, cells=[_json(v) for v in raw])
                        )
                        continue
                    if kind == "dynamics":
                        if not raw[3]:
                            controls.append(dict(kind="document_total", **loc, cells=list(raw)))
                            continue
                        item = product(raw[3], raw[4], supplier, loc, unit=raw[5])
                        loc["product_code"] = item["code"]
                        q = _number(raw[7])
                        try:
                            dt = (
                                raw[0]
                                if isinstance(raw[0], datetime)
                                else datetime.strptime(_text(raw[0]), "%d.%m.%Y %H:%M:%S")
                            )
                            dt = dt.replace(tzinfo=TZ) if dt.tzinfo is None else dt
                        except (ValueError, TypeError):
                            dt = None
                        reason = None
                        if q is None:
                            reason = "invalid_sale_quantity"
                        elif not _text(raw[2]).startswith("Расходная накладная "):
                            reason = "unknown_operation"
                        elif (
                            q < 0
                            and options.get("negative_sales_policy", "quarantine")
                            != "signed_returns"
                        ):
                            reason = "negative_sale_quarantined"
                        elif dt is None:
                            reason = "invalid_sale_date"
                        elif not history_start <= dt.date() <= as_of:
                            reason = "outside_history_window"
                        elif not raw[6] or not raw[5]:
                            reason = "missing_sale_dimensions"
                        if reason:
                            issue(
                                reason,
                                "Строка сохранена для проверки и не включена в спрос",
                                loc,
                                item,
                            )
                            controls.append(
                                dict(
                                    kind="quarantined_sale",
                                    reason=reason,
                                    **loc,
                                    cells=[_json(v) for v in raw],
                                )
                            )
                            continue
                        document = _hash(
                            [dt.date().isoformat(), _text(raw[2]).split(" от ")[0], _text(raw[1])]
                        )
                        key = [
                            document,
                            item["code"],
                            _text(raw[5]),
                            _text(raw[6]),
                            dt.isoformat(),
                            str(q),
                        ]
                        signature = _hash(key)
                        occurrences[signature] += 1
                        eid = "ekt:sale:" + _hash([signature, occurrences[signature]])
                        fact(
                            row(
                                "sales",
                                eid,
                                product_external_id=item["external_id"],
                                warehouse_external_id=warehouse(_text(raw[6])),
                                date=dt.date().isoformat(),
                                document_date=dt.isoformat(),
                                document_id=document,
                                line_id=eid,
                                quantity=str(q),
                            ),
                            loc,
                            raw,
                        )
                        item["history"] = True
                    elif kind == "terms":
                        ci, ni, si = (1, 3, 2) if supplier == "iek" else (2, 1, 3)
                        if raw[ci] is None:
                            continue
                        item = product(raw[ci], raw[ni], supplier, loc, sku=raw[si])
                        loc["product_code"] = item["code"]
                        value = _number(raw[4])
                        controls.append(dict(kind="supplier_terms", **loc, cells=list(raw)))
                        if value is None or value <= 0:
                            issue(
                                "invalid_supplier_terms",
                                "Условие поставщика отсутствует или содержит ошибку",
                                loc,
                                item,
                                "error",
                            )
                        elif item["term"] is not None and item["term"] != value:
                            issue(
                                "conflicting_supplier_terms",
                                "Различающиеся условия для одного кода",
                                loc,
                                item,
                                "error",
                            )
                        else:
                            item["term"] = value
                    elif kind in ("monthly_sales", "monthly_stocks"):
                        ci = 1 if kind == "monthly_sales" else 2
                        if raw[ci] is None:
                            continue
                        ni = 1 if supplier == "systeme" and kind == "monthly_stocks" else 0
                        unit = (
                            raw[3 if supplier == "systeme" else 1]
                            if kind == "monthly_stocks"
                            else None
                        )
                        sku = raw[2] if supplier == "systeme" and kind == "monthly_sales" else None
                        item = product(raw[ci], raw[ni], supplier, loc, unit=unit, sku=sku)
                        loc["product_code"] = item["code"]
                        if (
                            supplier == "systeme"
                            and kind == "monthly_sales"
                            and item["term"] is not None
                            and _number(raw[3]) != item["term"]
                        ):
                            issue(
                                "monthly_pack_conflict",
                                "Кратность месячной книги отличается; "
                                "применено отдельное условие MOQ",
                                loc,
                                item,
                            )
                        controls.append(
                            dict(
                                kind=kind,
                                **loc,
                                cells=list(raw),
                                periods={
                                    str(i + 1): _month(h)
                                    for i, h in enumerate(headers)
                                    if _month(h)
                                },
                            )
                        )
                        if kind == "monthly_stocks":
                            name = options.get("warehouse_mapping", {}).get(profile)
                            for i, head in enumerate(headers):
                                period = _month(head)
                                if period and raw[i] is not None and name:
                                    stock(
                                        item, raw[i], 0, date.fromisoformat(period), name, loc, raw
                                    )
                    elif kind == "inbound":
                        ci, ni, si = (0, 2, 1) if supplier == "iek" else (2, 3, 1)
                        if (
                            supplier == "iek"
                            and _text(raw[ci]) == "0"
                            and not _text(raw[ni])
                            and all(value is None or value == "" for value in raw[3:])
                        ):
                            issue(
                                "inbound_section_header",
                                "Служебный заголовок раздела не является товаром",
                                loc,
                            )
                            controls.append(
                                dict(kind="inbound_section_header", **loc, cells=list(raw))
                            )
                            continue
                        if raw[ci] is None:
                            controls.append(
                                dict(kind="unmapped_inbound_row", **loc, cells=list(raw))
                            )
                            continue
                        item = product(raw[ci], raw[ni], supplier, loc, sku=raw[si])
                        loc["product_code"] = item["code"]
                        controls.append(dict(kind="inbound_source", **loc, cells=list(raw)))
                        if supplier == "iek":
                            item["cable"] |= "БУХТАМИ" in _text(raw[ni]).upper()
                            for i in range(3, len(headers)):
                                match = re.search(r"до\s+(\d{2}\.\d{2}\.\d{4})", _text(headers[i]))
                                if match and _number(raw[i]) is not None and _number(raw[i]) > 0:
                                    eta = datetime.strptime(match[1], "%d.%m.%Y").date().isoformat()
                                    inbound(
                                        item,
                                        raw[i],
                                        eta,
                                        "ekt:delivery:" + _hash(_text(headers[i])),
                                        loc,
                                        raw,
                                    )
                        else:
                            category_code = _text(raw[4]) or "unclassified"
                            item["category"] = "ekt:category:systeme:" + category_code
                            categories[item["category"]] = row(
                                "categories",
                                item["category"],
                                name="Systeme: категория " + category_code,
                            )
                            name = options.get("warehouse_mapping", {}).get("systeme.current_stock")
                            snapshot = date(2026, 9, 22)
                            stock(item, raw[49], raw[50], snapshot, name, loc, raw)
                            if (
                                _number(raw[49]) is not None
                                and _number(raw[50]) is not None
                                and _number(raw[51]) != _number(raw[49]) - _number(raw[50])
                            ):
                                issue(
                                    "stock_balance_mismatch",
                                    "Остаток минус резерв не равен свободному остатку",
                                    loc,
                                    item,
                                    "error",
                                )
                            # This profile is explicitly the example dated 22.09.2026;
                            # Its date belongs to the source, not the calculation.
                            inbound(
                                item,
                                raw[54],
                                "2026-09-24",
                                "ekt:delivery:systeme:2026-09-24",
                                loc,
                                raw,
                            )
        finally:
            book.close()
        manifest.append(
            dict(filename=filename, sha256=digest, profile=profile, row_count=file_count)
        )

    product_rows, quality = [], []
    for code, item in sorted(products.items()):
        loc = dict(item["provenance"][0], product_code=code)
        override = options.get("stock_overrides", {}).get(code)
        if override:
            stock(
                item,
                override["quantity"],
                override.get("reserved", 0),
                date.fromisoformat(override.get("as_of", as_of.isoformat())),
                override["warehouse"],
                loc,
                [],
            )
        reasons, blockers = item["reasons"], item["blockers"]
        unit = options.get("unit_overrides", {}).get(code)
        if not unit:
            if len(item["units"]) == 1:
                unit = next(iter(item["units"]))
            else:
                unit = "не определена"
                blockers.add("unit_missing_or_conflicting")
        if len(item["skus"]) > 1:
            blockers.add("supplier_sku_conflict")
        sku = sorted(item["skus"])[0] if item["skus"] else code
        if not item["skus"]:
            reasons.add("sku_is_1c_code")
        lead = options.get("lead_time_days_by_supplier", {}).get(
            item["supplier"], options.get("lead_time_days")
        )
        if lead is None:
            blockers.add("lead_time_missing")
        term = item["term"]
        semantics = "pack" if item["supplier"] == "systeme" else options.get("moq_semantics")
        if term is None:
            blockers.add("supplier_terms_missing")
        elif semantics is None:
            blockers.add("supplier_terms_semantics_missing")
        if semantics == "pack":
            reasons.add("minimum_order_not_supplied")
        elif semantics == "minimum":
            blockers.add("pack_size_not_supplied")
        if item["cable"] and code not in options.get("purchase_conversions", {}):
            blockers.add("purchase_unit_conversion_missing")
        if not item["history"]:
            blockers.add("detailed_history_missing")
        if item["latest_stock"] is None:
            blockers.add("current_stock_missing")
        elif (as_of - item["latest_stock"]).days > 7:
            blockers.add("current_stock_stale")
        reasons.update(("client_history_unavailable", "stockout_unavailable"))
        reasons.update(blockers)
        category = item["category"] or "ekt:category:" + item["supplier"] + ":unclassified"
        if item["category"] is None:
            reasons.add("category_unclassified")
        categories.setdefault(
            category,
            row(
                "categories",
                category,
                name=("IEK" if item["supplier"] == "iek" else "Systeme") + ": без категории",
            ),
        )
        conversion = Decimal(str(options.get("purchase_conversions", {}).get(code, 1)))
        status = "blocked" if blockers else "limited"
        metadata = dict(
            origin="partner_workbook",
            status=status,
            reasons=sorted(reasons),
            blocking_reasons=sorted(blockers),
            history_start=history_start.isoformat(),
            stock_max_age_days=7,
            as_of=as_of.isoformat(),
            supplier_terms_semantics=semantics,
            supplier_terms_known=(
                term is not None
                and semantics is not None
                and not blockers.intersection(
                    {
                        "invalid_supplier_terms",
                        "conflicting_supplier_terms",
                        "purchase_unit_conversion_missing",
                    }
                )
            ),
        )
        product_rows.append(
            row(
                "products",
                item["external_id"],
                sku=sku,
                code=code,
                name=item["name"][:500],
                unit=unit,
                supplier_external_id=item["supplier_external_id"],
                category_external_id=category,
                lead_time_days=lead,
                min_order_qty=str(
                    term * conversion if term is not None and semantics == "minimum" else 0
                ),
                pack_size=str(term * conversion if term is not None and semantics == "pack" else 1),
                data_quality=metadata,
            )
        )
        quality.append(
            {
                k: item[k]
                for k in (
                    "external_id",
                    "code",
                    "name",
                    "supplier",
                    "supplier_external_id",
                    "provenance",
                )
            }
            | dict(status=status, reasons=sorted(reasons))
        )
    result_rows = (
        list(suppliers.values())
        + list(warehouses.values())
        + list(categories.values())
        + product_rows
        + rows
    )
    return dict(
        rows=result_rows,
        issues=issues,
        products=quality,
        files=manifest,
        controls=controls,
        summary=dict(
            products=len(products),
            by_status=dict(Counter(p["status"] for p in quality)),
            by_kind=dict(Counter(r["kind"] for r in result_rows)),
            source_rows=total_source_rows,
            options=options,
            history_start=history_start.isoformat(),
            as_of=as_of.isoformat(),
        ),
    )
