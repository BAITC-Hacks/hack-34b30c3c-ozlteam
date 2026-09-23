from datetime import date, timedelta

from app.Domains.Replenishment.DTO.calculation import CalculationInput


def demo_input() -> CalculationInput:
    """Small, anonymous and reproducible case covering all forecast adjustments."""
    as_of = date(2026, 9, 23)
    sales = []
    stockout_start = as_of - timedelta(days=18)
    stockout_end = as_of - timedelta(days=9)
    for offset in range(364, -1, -1):
        day = as_of - timedelta(days=offset)
        cable_qty = 8 if day.month == 9 else 4
        sales.append(
            {
                "date": day,
                "sku": "EK-CABLE-25",
                "warehouse": "Алматы",
                "customer_id": f"anon-{offset % 19:02d}",
                "quantity": cable_qty,
                "price": 890,
            }
        )
        switch_qty = 7 if offset < 60 else 4 if offset < 120 else 2
        sales.append(
            {
                "date": day,
                "sku": "EK-SWITCH-16",
                "warehouse": "Алматы",
                "customer_id": f"anon-{offset % 23:02d}",
                "quantity": switch_qty,
                "price": 2100,
            }
        )
        if not stockout_start <= day <= stockout_end:
            sales.append(
                {
                    "date": day,
                    "sku": "EK-LAMP-12",
                    "warehouse": "Астана",
                    "customer_id": f"anon-{offset % 17:02d}",
                    "quantity": 3,
                    "price": 1450,
                }
            )
    sales.append(
        {
            "date": as_of - timedelta(days=5),
            "sku": "EK-SWITCH-16",
            "warehouse": "Алматы",
            "customer_id": "anon-bulk-742",
            "quantity": 240,
            "price": 1950,
        }
    )
    return CalculationInput.model_validate(
        {
            "as_of": as_of,
            "review_days": 14,
            "products": [
                {
                    "sku": "EK-CABLE-25",
                    "name": "Кабель ВВГнг 3×2,5",
                    "category": "Кабель",
                    "supplier_id": "S-01",
                },
                {
                    "sku": "EK-SWITCH-16",
                    "name": "Автоматический выключатель 16А",
                    "category": "Автоматика",
                    "supplier_id": "S-02",
                },
                {
                    "sku": "EK-LAMP-12",
                    "name": "Светильник LED 12Вт",
                    "category": "Освещение",
                    "supplier_id": "S-01",
                },
            ],
            "suppliers": [
                {"id": "S-01", "name": "КабельТрейд", "lead_days": 21, "min_order_qty": 20},
                {"id": "S-02", "name": "ЭлектроПоставка", "lead_days": 14, "min_order_qty": 10},
            ],
            "sales": sales,
            "stock": [
                {"sku": "EK-CABLE-25", "warehouse": "Алматы", "quantity": 65},
                {"sku": "EK-SWITCH-16", "warehouse": "Алматы", "quantity": 35},
                {"sku": "EK-LAMP-12", "warehouse": "Астана", "quantity": 32},
            ],
            "inbound": [
                {
                    "sku": "EK-CABLE-25",
                    "warehouse": "Алматы",
                    "quantity": 25,
                    "eta": as_of + timedelta(days=10),
                },
                {
                    "sku": "EK-SWITCH-16",
                    "warehouse": "Алматы",
                    "quantity": 20,
                    "eta": as_of + timedelta(days=7),
                },
                {
                    "sku": "EK-LAMP-12",
                    "warehouse": "Астана",
                    "quantity": 10,
                    "eta": as_of + timedelta(days=12),
                },
            ],
            "stockouts": [
                {
                    "sku": "EK-LAMP-12",
                    "warehouse": "Астана",
                    "start": stockout_start,
                    "end": stockout_end,
                }
            ],
            "category_growth": [
                {"category": "Кабель", "growth_pct": 0.08},
                {"category": "Автоматика", "growth_pct": 0.12},
                {"category": "Освещение", "growth_pct": 0.05},
            ],
        }
    )
