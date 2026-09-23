import { apiRequest } from "../../../shared/api/client";

export type CatalogKind = "products" | "categories" | "suppliers" | "warehouses";

export interface CatalogRecord {
  id: string;
  source_id: string;
  external_id: string;
  source_revision: number;
  source_updated_at: string | null;
  created_at: string;
  updated_at: string;
  name: string;
  active: boolean;
}

export interface ProductRecord extends CatalogRecord {
  sku: string;
  code: string | null;
  category_id: string | null;
  supplier_id: string | null;
  characteristic_external_id: string | null;
  unit: string;
  pack_size: string;
  min_order_qty: string;
  lead_time_days: number | null;
  data_quality?: {
    origin?: string;
    status?: "ready" | "limited" | "blocked";
    reasons?: string[];
    history_start?: string;
    supplier_terms_known?: boolean;
    supplier_terms_semantics?: "minimum" | "pack" | null;
    [key: string]: unknown;
  };
}

export interface CategoryRecord extends CatalogRecord {
  review_days: number;
  safety_days: number;
}

export interface WarehouseRecord extends CatalogRecord {
  organization_external_id: string | null;
}

export type AnyCatalogRecord = ProductRecord | CategoryRecord | WarehouseRecord | CatalogRecord;

export function listCatalog(
  kind: CatalogKind,
  filters: { q: string; active: string; offset: number; limit: number; supplier_id?: string; source_id?: string },
  signal?: AbortSignal,
): Promise<AnyCatalogRecord[]> {
  const query = new URLSearchParams({ limit: String(filters.limit), offset: String(filters.offset) });
  if (filters.q) query.set("q", filters.q);
  if (filters.active) query.set("active", filters.active);
  if (filters.supplier_id) query.set("supplier_id", filters.supplier_id);
  if (filters.source_id) query.set("source_id", filters.source_id);
  return apiRequest(`/v1/catalogs/${kind}?${query}`, { signal });
}

export function getCatalog(kind: CatalogKind, id: string, signal?: AbortSignal): Promise<AnyCatalogRecord> {
  return apiRequest(`/v1/catalogs/${kind}/${encodeURIComponent(id)}`, { signal });
}
