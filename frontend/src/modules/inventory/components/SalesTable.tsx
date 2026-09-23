import { Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Badge, Button, Table, Td, Th, Tr } from "../../../shared/ui";
import { downloadSaleDocument } from "../api/inventory";
import type { CatalogRow, SaleRow } from "../api/inventory";
import styles from "./SalesTable.module.css";

function saleDate(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat("ru-RU", { dateStyle: "short" }).format(date);
}

function SaleDocument({ row }: { row: SaleRow }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function download() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setError(null);
    try {
      await downloadSaleDocument(row.id, controller.signal);
    } catch (caught) {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Не удалось скачать документ. Попробуйте ещё раз.");
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setPending(false);
    }
  }

  return <div className={styles.document}>
    <Button variant="secondary" size="sm" icon={<Download size={15} strokeWidth={1.8} />} loading={pending}
      onClick={() => void download()} title="Все загруженные строки документа, включая другие страницы списка"
      aria-label={`Скачать XLSX документа от ${saleDate(row.date)}`}>
      Скачать XLSX
    </Button>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
  </div>;
}

export function SalesTable({ rows, products, warehouses, formatQuantity }: {
  rows: SaleRow[];
  products: ReadonlyMap<string, CatalogRow>;
  warehouses: ReadonlyMap<string, string>;
  formatQuantity: (value: string) => string;
}) {
  return <>
    <p className={styles.scrollHint}>Прокрутите таблицу вправо, чтобы увидеть документ и количество.</p>
    <Table className={styles.table} wrapperClassName={styles.scroll} aria-label="Продажи и документы отгрузки">
      <colgroup><col className={styles.dateColumn} /><col className={styles.productColumn} /><col className={styles.warehouseColumn} /><col className={styles.documentColumn} /><col className={styles.quantityColumn} /><col className={styles.statusColumn} /></colgroup>
      <thead><Tr><Th>Дата</Th><Th>Товар</Th><Th>Склад</Th><Th>Документ</Th><Th numeric>Количество</Th><Th>Статус</Th></Tr></thead>
      <tbody>{rows.map((row) => {
        const product = products.get(row.product_id);
        return <Tr key={row.id}>
          <Td className={styles.date}><time dateTime={row.date}>{saleDate(row.date)}</time></Td>
          <Td className={styles.product}><strong>{product?.name ?? row.product_id}</strong>{product?.sku ? <span className={styles.secondary}>{product.sku}</span> : null}</Td>
          <Td className={styles.warehouse}>{warehouses.get(row.warehouse_id) ?? row.warehouse_id}</Td>
          <Td><SaleDocument row={row} /></Td>
          <Td numeric className={styles.quantity}>{formatQuantity(row.quantity)}{product?.unit ? <span className={styles.unit}> {product.unit}</span> : null}</Td>
          <Td><Badge tone={row.status === "cancelled" ? "warning" : "neutral"}>{row.status === "posted" ? "Проведена" : row.status === "cancelled" ? "Отменена" : row.status}</Badge></Td>
        </Tr>;
      })}</tbody>
    </Table>
  </>;
}
