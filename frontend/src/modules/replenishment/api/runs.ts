import { apiRequest } from "../../../shared/api/client";
import type {
  CatalogOption,
  CreatedOrder,
  JobStatus,
  ReplenishmentOverview,
  Run,
  RunPage,
  SavedRecommendationDetail,
  SavedRecommendationPage,
} from "../runTypes";

const base = "/v1";

export async function getCatalog(kind: "warehouses" | "categories" | "suppliers", signal?: AbortSignal): Promise<CatalogOption[]> {
  const result: CatalogOption[] = [];
  for (let offset = 0; ; offset += 200) {
    const page = await apiRequest<CatalogOption[]>(`${base}/catalogs/${kind}?limit=200&offset=${offset}&active=true`, { signal });
    result.push(...page);
    if (page.length < 200) return result;
  }
}

export function getRuns(offset: number, signal?: AbortSignal): Promise<RunPage> {
  return apiRequest(`${base}/replenishment/runs?limit=30&offset=${offset}`, { signal });
}

export function getRun(id: string, signal?: AbortSignal): Promise<Run> {
  return apiRequest(`${base}/replenishment/runs/${id}`, { signal });
}

export function createRun(input: { warehouse_id: string; category_id: string | null; as_of: string; idempotency_key: string; parameters: { history_days: number } }): Promise<Run> {
  return apiRequest(`${base}/replenishment/runs`, { method: "POST", body: input });
}

export function getRecommendations(runId: string, offset: number, urgency: string, supplierId: string, signal?: AbortSignal): Promise<SavedRecommendationPage> {
  const params = new URLSearchParams({ limit: "50", offset: String(offset) });
  if (urgency) params.set("urgency", urgency);
  if (supplierId) params.set("supplier_id", supplierId);
  return apiRequest(`${base}/replenishment/runs/${runId}/recommendations?${params}`, { signal });
}

export function getRecommendation(id: string, signal?: AbortSignal): Promise<SavedRecommendationDetail> {
  return apiRequest(`${base}/recommendations/${id}`, { signal });
}

export function getJob(id: string, signal?: AbortSignal): Promise<JobStatus> {
  return apiRequest(`${base}/jobs/${id}`, { signal });
}

export function getOverview(warehouseId: string, signal?: AbortSignal): Promise<ReplenishmentOverview> {
  const params = new URLSearchParams();
  if (warehouseId) params.set("warehouse_id", warehouseId);
  const query = params.size ? `?${params}` : "";
  return apiRequest(`${base}/overview${query}`, { signal });
}

export function createOrders(recommendationIds: string[], idempotencyKey: string): Promise<CreatedOrder[]> {
  return apiRequest(`${base}/orders/from-recommendations`, {
    method: "POST",
    body: { recommendation_ids: recommendationIds, idempotency_key: idempotencyKey },
  });
}
