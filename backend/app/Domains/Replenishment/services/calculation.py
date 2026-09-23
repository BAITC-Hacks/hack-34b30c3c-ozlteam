"""Deterministic, auditable daily-demand calculation for the hackathon case."""

from collections import defaultdict
from datetime import date, timedelta
from math import ceil, sqrt
from statistics import median

from app.Domains.Replenishment.DTO.calculation import CalculationInput
from app.Domains.Replenishment.resources.calculation import (
    CalculationMetrics,
    CalculationResult,
    Recommendation,
)


def _days(start: date, end: date):
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def _rate(daily: dict[date, int], unavailable: set[date], start: date, end: date) -> float:
    available = [day for day in _days(start, end) if day not in unavailable]
    if not available:
        return 0.0
    return sum(daily.get(day, 0) for day in available) / len(available)


def _spikes(sales: list) -> set[tuple[date, str]]:
    """Exclude isolated customer-day orders, retaining the rest of that day's sales."""
    daily_customer: dict[tuple[date, str], int] = defaultdict(int)
    daily_total: dict[date, int] = defaultdict(int)
    for sale in sales:
        daily_customer[(sale.date, sale.customer_id)] += sale.quantity
        daily_total[sale.date] += sale.quantity
    if len(daily_total) < 6:
        return set()
    ordinary_day = median(daily_total.values())
    threshold = max(20, 5 * ordinary_day)
    return {
        key
        for key, units in daily_customer.items()
        if units > threshold and units >= 0.6 * daily_total[key[0]]
    }


def _seasonality(
    regular_daily: dict[date, int], unavailable: set[date], start: date, as_of: date
) -> float:
    if (as_of - start).days < 300:
        return 1.0
    # Use last year's same month so a recent growth step cannot masquerade as seasonality.
    month_days = [
        day
        for day in _days(start, as_of - timedelta(days=120))
        if day.year == as_of.year - 1 and day.month == as_of.month and day not in unavailable
    ]
    if len(month_days) < 5:
        return 1.0
    base = _rate(regular_daily, unavailable, start, as_of - timedelta(days=120))
    if base <= 0:
        return 1.0
    month_rate = sum(regular_daily.get(day, 0) for day in month_days) / len(month_days)
    return min(1.75, max(0.65, month_rate / base))


def _trend(regular_daily: dict[date, int], unavailable: set[date], as_of: date) -> float:
    old = _rate(regular_daily, unavailable, as_of - timedelta(days=119), as_of - timedelta(days=60))
    mid = _rate(regular_daily, unavailable, as_of - timedelta(days=59), as_of - timedelta(days=30))
    recent = _rate(regular_daily, unavailable, as_of - timedelta(days=29), as_of)
    if old <= 0 or mid < old * 1.1 or recent < old * 1.1 or recent < mid * 0.9:
        return 1.0
    return min(1.5, sqrt(((mid + recent) / 2) / old))


def calculate(data: CalculationInput) -> CalculationResult:
    suppliers = {row.id: row for row in data.suppliers}
    growth = {row.category: row.growth_pct for row in data.category_growth}
    sale_groups: dict[tuple[str, str], list] = defaultdict(list)
    stock_groups: dict[tuple[str, str], int] = {}
    inbound_groups: dict[tuple[str, str], list] = defaultdict(list)
    stockout_groups: dict[tuple[str, str], list] = defaultdict(list)
    warehouses: dict[str, set[str]] = defaultdict(set)

    for sale in data.sales:
        if sale.date <= data.as_of:
            sale_groups[(sale.sku, sale.warehouse)].append(sale)
            warehouses[sale.sku].add(sale.warehouse)
    for row in data.stock:
        stock_groups[(row.sku, row.warehouse)] = row.quantity
        warehouses[row.sku].add(row.warehouse)
    for row in data.inbound:
        inbound_groups[(row.sku, row.warehouse)].append(row)
        warehouses[row.sku].add(row.warehouse)
    for row in data.stockouts:
        if row.start <= data.as_of:
            stockout_groups[(row.sku, row.warehouse)].append(row)
            warehouses[row.sku].add(row.warehouse)

    recommendations: list[Recommendation] = []
    earliest = data.as_of - timedelta(days=364)
    for product in sorted(data.products, key=lambda row: row.sku):
        supplier = suppliers[product.supplier_id]
        for warehouse in sorted(warehouses[product.sku]):
            key = (product.sku, warehouse)
            sales = [sale for sale in sale_groups[key] if sale.date >= earliest]
            intervals = stockout_groups[key]
            starts = [sale.date for sale in sales]
            starts += [max(row.start, earliest) for row in intervals]
            if not starts:
                continue  # No observed demand from which to infer a purchase.
            start = min(starts)
            unavailable = {
                day
                for row in intervals
                for day in _days(max(row.start, start), min(row.end, data.as_of))
            }
            excluded = _spikes(sales)
            excluded_units = sum(
                sale.quantity for sale in sales if (sale.date, sale.customer_id) in excluded
            )
            daily: dict[date, int] = defaultdict(int)
            for sale in sales:
                if (sale.date, sale.customer_id) not in excluded:
                    daily[sale.date] += sale.quantity
            raw_sales = sum(sale.quantity for sale in sales)
            available_rate = _rate(daily, unavailable, start, data.as_of)
            lost = sum(max(0.0, available_rate - daily.get(day, 0)) for day in unavailable)
            historical_days = (data.as_of - start).days + 1
            regular_daily = (sum(daily.values()) + lost) / historical_days
            seasonal = _seasonality(daily, unavailable, start, data.as_of)
            trend = _trend(daily, unavailable, data.as_of)
            category = 1 + growth[product.category]
            forecast = regular_daily * seasonal * trend * category
            horizon = supplier.lead_days + data.review_days
            target = ceil(forecast * horizon)
            on_hand = stock_groups.get(key, 0)
            cutoff = data.as_of + timedelta(days=horizon)
            inbound = sum(
                row.quantity for row in inbound_groups[key] if data.as_of <= row.eta <= cutoff
            )
            position = on_hand + inbound
            needed = max(0, target - position)
            if not needed:
                continue
            quantity = max(needed, supplier.min_order_qty)
            if forecast > 0 and on_hand / forecast < supplier.lead_days:
                urgency = "critical"
            elif forecast > 0 and position / forecast < horizon:
                urgency = "soon"
            else:
                urgency = "normal"
            explanation = (
                f"Спрос {forecast:.2f} шт./день на {horizon} дней "
                f"({supplier.lead_days} поставка + {data.review_days} до пересмотра) "
                f"даёт целевой запас {target} шт.; на складе {on_hand}, "
                f"в пути до конца горизонта {inbound}. "
                f"Исключено {excluded_units} шт. разовых продаж; "
                f"оценка упущенного спроса {lost:.1f} шт.; "
                f"сезон ×{seasonal:.2f}, тренд ×{trend:.2f}, "
                f"категория ×{category:.2f}."
            )
            if quantity > needed:
                explanation += f" Минимальная партия поставщика: {supplier.min_order_qty} шт."
            recommendations.append(
                Recommendation(
                    sku=product.sku,
                    name=product.name,
                    warehouse=warehouse,
                    category=product.category,
                    supplier_id=supplier.id,
                    supplier_name=supplier.name,
                    recommended_qty=quantity,
                    urgency=urgency,
                    explanation=explanation,
                    metrics=CalculationMetrics(
                        raw_sales=raw_sales,
                        excluded_spike_units=excluded_units,
                        lost_demand_units=round(lost, 3),
                        adjusted_daily_demand=round(forecast, 4),
                        seasonality_factor=round(seasonal, 4),
                        trend_factor=round(trend, 4),
                        category_growth_factor=round(category, 4),
                        on_hand=on_hand,
                        inbound=inbound,
                        target_stock=target,
                        stock_position=position,
                        lead_days=supplier.lead_days,
                        review_days=data.review_days,
                    ),
                )
            )
    recommendations.sort(key=lambda row: (row.supplier_name, row.sku, row.warehouse))
    return CalculationResult(as_of=data.as_of, recommendations=recommendations)
