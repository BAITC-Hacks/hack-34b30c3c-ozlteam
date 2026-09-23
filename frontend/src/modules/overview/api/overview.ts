import { apiRequest } from "../../../shared/api/client";

export interface OverviewSourceVersion {
  source_id: string;
  revision: number;
  cursor: string | null;
  synced_at: string | null;
  complete: boolean;
}

export interface OverviewRun {
  id: string;
  warehouse_id: string;
  as_of: string;
  completed_at: string | null;
  algorithm_version: string;
}

export interface Overview {
  latest_run: OverviewRun | null;
  deficit_count: number;
  excess_count: number;
  blocked_count: number;
  draft_order_count: number;
  source_versions: OverviewSourceVersion[];
  warnings: string[];
}

export interface WarehouseOption {
  id: string;
  name: string;
}

export function getOverview(warehouseId: string, signal?: AbortSignal): Promise<Overview> {
  const query = warehouseId ? `?warehouse_id=${encodeURIComponent(warehouseId)}` : "";
  return apiRequest(`/v1/overview${query}`, { signal });
}

export function getOverviewWarehouses(signal?: AbortSignal): Promise<WarehouseOption[]> {
  return apiRequest("/v1/catalogs/warehouses?limit=200&active=true", { signal });
}
