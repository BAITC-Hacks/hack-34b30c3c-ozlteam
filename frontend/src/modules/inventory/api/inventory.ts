import { apiRequest } from "../../../shared/api/client";

export type InventoryKind = "stocks" | "inbound" | "stockouts" | "sales" | "stock_history" | "growth";

interface BaseRow {
  id: string;
  product_id: string;
  warehouse_id: string;
  updated_at: string;
}

export interface StockRow extends BaseRow {
  as_of: string;
  quantity: string;
  reserved: string;
}

export interface InboundRow extends BaseRow {
  supplier_id: string | null;
  document_id: string;
  expected_date: string;
  quantity: string;
  status: string;
}

export interface StockoutRow extends BaseRow {
  start: string;
  end: string | null;
  active: boolean;
}

export interface SaleRow extends BaseRow {
  date: string;
  document_id: string;
  line_id: string;
  quantity: string;
  price: string | null;
  status: string;
}

export interface GrowthRow {
  id: string;
  product_id: string | null;
  category_id: string | null;
  start: string;
  end: string;
  rate: string;
  mode: string;
  active: boolean;
}

export interface CatalogRow {
  id: string;
  name: string;
  sku?: string;
  unit?: string;
}

export function listInventory(kind: InventoryKind, filters: URLSearchParams, signal?: AbortSignal): Promise<StockRow[] | InboundRow[] | StockoutRow[] | SaleRow[] | GrowthRow[]> {
  const path = kind === "stocks" ? "/v1/inventory" : `/v1/inventory/${kind === "stock_history" ? "stocks" : kind}`;
  return apiRequest(`${path}?${filters}`, { signal });
}

export function listCatalog(kind: "warehouses" | "products" | "suppliers" | "categories", query = "", signal?: AbortSignal): Promise<CatalogRow[]> {
  const filters = new URLSearchParams({ limit: "200", active: "true" });
  if (query) filters.set("q", query);
  return apiRequest(`/v1/catalogs/${kind}?${filters}`, { signal });
}

export function getCatalogRecord(kind: "warehouses" | "products" | "suppliers", id: string, signal?: AbortSignal): Promise<CatalogRow> {
  return apiRequest(`/v1/catalogs/${kind}/${id}`, { signal });
}
