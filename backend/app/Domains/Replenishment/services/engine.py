"""Deterministic, auditable replenishment baseline; no external model or network calls."""

from collections import defaultdict
from datetime import date, timedelta
from decimal import ROUND_CEILING, Decimal
from statistics import mean, median

ALGORITHM_VERSION = "robust-daily-v2"
ZERO = Decimal("0")


def number(value) -> Decimal:
    return Decimal(str(value or 0))


def encoded(value) -> str:
    return str(number(value).quantize(Decimal("0.000001")))


def day(value) -> date:
    return value if isinstance(value, date) else date.fromisoformat(str(value)[:10])


def dates(start: date, end: date):
    for offset in range(max(0, (end - start).days + 1)):
        yield start + timedelta(days=offset)


def _history(snapshot: dict, product: dict, as_of: date, history_days: int) -> dict:
    key = str(product["id"])
    lower = as_of - timedelta(days=history_days - 1)
    coverage_start = product.get("data_quality", {}).get("history_start")
    if coverage_start:
        lower = max(lower, day(coverage_start))
    sales = [
        row
        for row in snapshot.get("sales", [])
        if str(row["product_id"]) == key and lower <= day(row["date"]) <= as_of
    ]
    outages = [
        row
        for row in snapshot.get("stockouts", [])
        if str(row["product_id"]) == key and day(row["start"]) <= as_of
    ]
    # Never infer observation coverage before the first known transaction/outage.
    starts = [day(row["date"]) for row in sales] + [day(row["start"]) for row in outages]
    start = max(lower, min(starts)) if starts else as_of
    absent = {
        current
        for row in outages
        for current in dates(
            max(start, day(row["start"])), min(as_of, day(row["end"]) if row.get("end") else as_of)
        )
    }
    groups = defaultdict(Decimal)
    for row in sales:
        groups[(day(row["date"]), row.get("client_id") or None)] += number(row["quantity"])
    positive = [float(qty) for qty in groups.values() if qty > 0]
    center = median(positive) if positive else 0.0
    mad = median([abs(value - center) for value in positive]) if positive else 0.0
    threshold = max(center * 5, center + mad * 8)
    large_by_customer = defaultdict(list)
    for (current, client), qty in groups.items():
        if qty > threshold and center > 0:
            large_by_customer[client].append(current)
    recurring = {
        client
        for client, purchases in large_by_customer.items()
        if client is not None
        and len(purchases) >= 3
        and (max(purchases) - min(purchases)).days >= 28
    }
    raw = {current: ZERO for current in dates(start, as_of)}
    cleaned = dict(raw)
    excluded = []
    for (current, client), qty in groups.items():
        raw[current] += qty
        if qty > threshold and center > 0 and client not in recurring:
            excluded.append(
                {
                    "date": current.isoformat(),
                    "client_id": client,
                    "quantity": encoded(qty),
                    "threshold": encoded(threshold),
                    "reason": "one_off_customer_day" if client else "one_off_day_no_client",
                }
            )
        else:
            cleaned[current] += qty
    raw = {current: max(ZERO, qty) for current, qty in raw.items()}
    cleaned = {current: max(ZERO, qty) for current, qty in cleaned.items()}
    observed = {current: float(qty) for current, qty in cleaned.items() if current not in absent}
    corrected = {current: float(qty) for current, qty in cleaned.items()}
    lost = 0.0
    for current in absent:
        comparable = [
            qty
            for known, qty in observed.items()
            if known.month == current.month and known.weekday() == current.weekday()
        ]
        if len(comparable) < 3:
            comparable = [
                qty for known, qty in observed.items() if known.weekday() == current.weekday()
            ]
        if not comparable:
            comparable = list(observed.values())
        estimate = mean(comparable) if comparable else 0.0
        increment = max(0.0, estimate - corrected[current])
        corrected[current] += increment
        lost += increment
    return {
        "raw": raw,
        "cleaned": cleaned,
        "corrected": corrected,
        "excluded": excluded,
        "lost": lost,
        "absent": absent,
        "has_history": bool(starts),
        "stockout_without_reference": bool(absent) and not observed,
        "missing_client": any(not row.get("client_id") for row in sales),
    }


def _seasonal(series: dict) -> dict[int, float] | None:
    if len(series) < 540:
        return None
    level = mean(series.values())
    if level <= 0:
        return {month: 1.0 for month in range(1, 13)}
    by_month = defaultdict(list)
    for current, qty in series.items():
        by_month[current.month].append(qty)
    return {month: max(0.05, mean(values) / level) for month, values in by_month.items()}


def _trend(series: dict, seasonal: dict[int, float], as_of: date) -> tuple[float, float]:
    adjusted = {current: qty / seasonal.get(current.month, 1.0) for current, qty in series.items()}
    recent = [value for current, value in adjusted.items() if (as_of - current).days < 56]
    level = mean(recent) if recent else 0.0
    # Three increasing four-week blocks establish sustained growth. A last-day spike does not.
    blocks = [
        [
            value
            for current, value in adjusted.items()
            if index * 28 <= (as_of - current).days < (index + 1) * 28
        ]
        for index in range(3)
    ]
    if any(len(block) < 21 for block in blocks):
        return level, 0.0
    newest, middle, oldest = [mean(block) for block in blocks]
    sustained = newest > middle * 1.02 and middle > oldest * 1.02 and oldest > 0
    slope = min((newest - oldest) / 56, level / 180) if sustained else 0.0
    # level represents the midpoint of the last 56 days, advance it to the calculation date.
    return max(0.0, level + slope * 27.5), slope


def _growth(snapshot: dict, product: dict, current: date) -> tuple[float, str]:
    applicable = [
        row
        for row in snapshot.get("growth", [])
        if day(row["start"]) <= current <= day(row["end"])
        and (
            (row.get("product_id") and str(row["product_id"]) == str(product["id"]))
            or (
                not row.get("product_id")
                and row.get("category_id")
                and str(row["category_id"]) == str(product.get("category_id"))
            )
        )
    ]
    # Product overrides category, latest effective start wins; tie order is deterministic.
    applicable.sort(
        key=lambda row: (bool(row.get("product_id")), row["start"], str(row.get("id", "")))
    )
    if not applicable:
        return 0.0, "additional"
    selected = applicable[-1]
    return float(selected["rate"]), selected["mode"]


def calculate(snapshot: dict, as_of: date, parameters: dict | None = None) -> list[dict]:
    """JSON-compatible results. Snapshot must be warehouse-scoped by Inventory service."""
    parameters = parameters or {}
    history_days = parameters.get("history_days", 1095)
    products = [row for row in snapshot.get("products", []) if row.get("active", True)]
    # One pass over large input tables, not a full sales scan for every catalog item.
    indexed = {kind: defaultdict(list) for kind in ("sales", "stocks", "stockouts", "inbound")}
    for kind, by_product in indexed.items():
        for row in snapshot.get(kind, []):
            by_product[str(row["product_id"])].append(row)
    inputs = {
        str(product["id"]): {kind: rows[str(product["id"])] for kind, rows in indexed.items()}
        for product in products
    }
    histories = {
        str(row["id"]): _history(inputs[str(row["id"])], row, as_of, history_days)
        for row in products
    }
    profiles = {key: _seasonal(value["corrected"]) for key, value in histories.items()}
    category_profiles = defaultdict(list)
    for product in products:
        profile = profiles[str(product["id"])]
        if profile and product.get("category_id"):
            category_profiles[str(product["category_id"])].append(profile)
    result = []
    for product in products:
        key = str(product["id"])
        history = histories[key]
        warnings = list(snapshot.get("warnings", []))
        warnings.extend(product.get("warnings", []))
        if history["missing_client"]:
            warnings.append("missing_client_ids_day_level_outliers_only")
        blocked = []
        quality = product.get("data_quality") or {}
        if quality.get("status") == "blocked":
            blocked.extend(
                quality.get("blocking_reasons")
                or quality.get("reasons")
                or ["incomplete_product_data"]
            )
        warnings.extend(quality.get("reasons") or [])
        warnings.extend(quality.get("warnings") or [])
        if not product.get("supplier_id"):
            blocked.append("missing_supplier")
        if product.get("lead_time_days") is None:
            blocked.append("missing_lead_time")
        if not history["has_history"]:
            blocked.append("missing_sales_history")
        if history["stockout_without_reference"]:
            blocked.append("stockout_without_reference")
        if any(not source.get("complete", True) for source in snapshot.get("source_versions", [])):
            blocked.append("incomplete_source_sync")
        seasonal = profiles[key]
        method = "product_monthly" if seasonal else "flat_short_history"
        category = category_profiles.get(str(product.get("category_id")), [])
        if not seasonal and category:
            seasonal = {
                month: mean([profile.get(month, 1.0) for profile in category])
                for month in range(1, 13)
            }
            method = "category_monthly"
        if not seasonal:
            seasonal = {month: 1.0 for month in range(1, 13)}
            warnings.append("insufficient_history_for_annual_seasonality")
        level, slope = _trend(history["corrected"], seasonal, as_of)
        lead = int(product.get("lead_time_days") or 0)
        review = int(product.get("review_days", 7))
        safety_days = int(product.get("safety_days", 7))
        horizon = max(1, min(730, lead + review))
        if lead + review > 730:
            blocked.append("horizon_exceeds_730_days")
        stocks = [
            row
            for row in inputs[key]["stocks"]
            if str(row["product_id"]) == key and day(row["as_of"]) <= as_of
        ]
        stocks.sort(key=lambda row: row["as_of"])
        stock = stocks[-1] if stocks else None
        if not stock:
            blocked.append("missing_stock_snapshot")
        elif (as_of - day(stock["as_of"])).days > 1:
            warnings.append("stale_stock_snapshot")
        if stock and quality.get("origin") == "partner_workbook":
            max_age = int(quality.get("stock_max_age_days", 1))
            if (as_of - day(stock["as_of"])).days > max_age:
                blocked.append("stale_partner_stock_snapshot")
        available = (
            max(ZERO, number(stock["quantity"]) - number(stock.get("reserved"))) if stock else ZERO
        )
        daily = []
        for index in range(1, horizon + 1):
            current = as_of + timedelta(days=index)
            rate, mode = _growth(snapshot, product, current)
            trend_increment = 0.0 if mode == "replace_trend" else slope * index
            base = max(0.0, level + trend_increment) * seasonal.get(current.month, 1.0)
            qty = max(0.0, base * (1 + rate))
            daily.append(
                {
                    "date": current.isoformat(),
                    "quantity": encoded(qty),
                    "seasonal_factor": encoded(seasonal.get(current.month, 1.0)),
                    "trend_increment": encoded(trend_increment),
                    "growth_rate": encoded(rate),
                    "growth_mode": mode,
                }
            )
        forecast = sum((number(row["quantity"]) for row in daily), ZERO)
        safety = (forecast / horizon * safety_days).quantize(Decimal("0.000001"))
        arrivals = [
            row
            for row in inputs[key]["inbound"]
            if str(row["product_id"]) == key
            and row.get("status") in {"confirmed", "in_transit"}
            and as_of < day(row["expected_date"]) <= as_of + timedelta(days=horizon)
        ]
        inbound = sum((number(row["quantity"]) for row in arrivals), ZERO)
        if any(
            str(row["product_id"]) == key and day(row["expected_date"]) <= as_of
            for row in inputs[key]["inbound"]
        ):
            warnings.append("overdue_inbound_excluded")
        unrounded = max(ZERO, forecast + safety - available - inbound)
        quantity = unrounded
        pack = number(product.get("pack_size") or 1)
        if pack <= 0:
            blocked.append("invalid_pack_size")
            pack = Decimal(1)
        if quantity > 0:
            quantity = max(quantity, number(product.get("min_order_qty")))
            quantity = (quantity / pack).to_integral_value(rounding=ROUND_CEILING) * pack
        balance = available
        shortage = None
        for row in daily:
            balance += sum(
                (
                    number(arrival["quantity"])
                    for arrival in arrivals
                    if arrival["expected_date"] == row["date"]
                ),
                ZERO,
            )
            balance -= number(row["quantity"])
            if balance < 0 and shortage is None:
                shortage = row["date"]
        urgency = "none"
        if quantity > 0 or shortage:
            urgency = "normal"
        if shortage:
            urgency = "critical" if day(shortage) <= as_of + timedelta(days=lead) else "high"
        if blocked:
            warnings.extend(blocked)
        breakdown = {
            "lead_time_days": lead,
            "review_days": review,
            "horizon_days": horizon,
            "safety_days": safety_days,
            "forecast_quantity": encoded(forecast),
            "safety_stock": encoded(safety),
            "available_stock": encoded(available),
            "inbound_quantity": encoded(inbound),
            "unrounded_quantity": encoded(unrounded),
            "rounding_increment": encoded(quantity - unrounded),
            "recommended_quantity": encoded(quantity),
            "lost_demand": encoded(history["lost"]),
            "baseline_daily": encoded(level),
            "trend_daily_slope": encoded(slope),
            "seasonality_method": method,
            "shortage_date": shortage,
            "excess_quantity": encoded(max(ZERO, available + inbound - forecast - safety)),
            "raw_sales": encoded(sum(history["raw"].values(), ZERO)),
            "corrected_sales": encoded(sum(history["corrected"].values())),
            "excluded_quantity": encoded(
                sum((number(row["quantity"]) for row in history["excluded"]), ZERO)
            ),
        }
        explanation = (
            f"Спрос {encoded(forecast)} + страховой запас {encoded(safety)} "
            f"− доступный остаток {encoded(available)} − поступления {encoded(inbound)}. "
            f"После ограничения нулём и округления: {encoded(quantity)} {product.get('unit', '')}."
        )
        if blocked:
            explanation = "Заказ заблокирован: " + ", ".join(blocked) + ". " + explanation
        result.append(
            {
                "product_id": key,
                "supplier_id": product.get("supplier_id"),
                "sku": product["sku"],
                "name": product["name"],
                "unit": product["unit"],
                "recommended_quantity": encoded(quantity),
                "status": "blocked" if blocked else "ready",
                "urgency": urgency,
                "explanation": explanation,
                "details": {
                    "breakdown": breakdown,
                    "warnings": sorted(set(warnings)),
                    "forecast": daily,
                    "excluded_sales": history["excluded"],
                    "inbound": arrivals,
                    "history": [
                        {
                            "date": current.isoformat(),
                            "raw": encoded(history["raw"][current]),
                            "corrected": encoded(value),
                            "stockout": current in history["absent"],
                        }
                        for current, value in history["corrected"].items()
                    ],
                },
            }
        )
    return result
