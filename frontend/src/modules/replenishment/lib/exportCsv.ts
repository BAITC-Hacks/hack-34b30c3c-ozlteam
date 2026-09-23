import type { Recommendation } from "../types";

const columns = ["Поставщик", "Артикул", "Товар", "Склад", "Категория", "Количество", "Срочность", "Обоснование"];

const urgencyLabel = { critical: "Критично", soon: "Скоро", normal: "Планово" } as const;

function cell(value: string | number): string {
  const text = String(value);
  // Табличные программы не должны исполнять содержимое выгрузки как формулу.
  const safe = /^[\s]*[=+@-]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function exportOrdersCsv(rows: Recommendation[], quantities: Record<string, number>, asOf: string): void {
  const data = rows
    .filter((row) => (quantities[`${row.sku}::${row.warehouse}`] ?? row.recommended_qty) > 0)
    .map((row) => [
      row.supplier_name,
      row.sku,
      row.name,
      row.warehouse,
      row.category,
      quantities[`${row.sku}::${row.warehouse}`] ?? row.recommended_qty,
      urgencyLabel[row.urgency],
      row.explanation,
    ]);
  const csv = `\uFEFF${[columns, ...data].map((row) => row.map(cell).join(";")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `orders-${asOf}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
