import { apiRequest } from "../../../shared/api/client";
import type {
  CatalogOption,
  CreatedOrder,
  JobStatus,
  Run,
  RunPage,
  SavedRecommendationDetail,
  SavedRecommendationPage,
} from "../runTypes";

const base = "/v1";

export function getCatalog(kind: "warehouses" | "categories" | "suppliers", signal?: AbortSignal): Promise<CatalogOption[]> {
  return apiRequest(`${base}/catalogs/${kind}?limit=200&active=true`, { signal });
}

export function getRuns(signal?: AbortSignal): Promise<RunPage> {
  return apiRequest(`${base}/replenishment/runs?limit=30`, { signal });
}

export function getRun(id: string, signal?: AbortSignal): Promise<Run> {
  return apiRequest(`${base}/replenishment/runs/${id}`, { signal });
}

export function createRun(input: { warehouse_id: string; category_id: string | null; as_of: string; idempotency_key: string; parameters: { history_days: number } }): Promise<Run> {
  return apiRequest(`${base}/replenishment/runs`, { method: "POST", body: input });
}

export function getRecommendations(runId: string, offset: number, urgency: string, signal?: AbortSignal): Promise<SavedRecommendationPage> {
  const params = new URLSearchParams({ limit: "50", offset: String(offset) });
  if (urgency) params.set("urgency", urgency);
  return apiRequest(`${base}/replenishment/runs/${runId}/recommendations?${params}`, { signal });
}

export function getRecommendation(id: string, signal?: AbortSignal): Promise<SavedRecommendationDetail> {
  return apiRequest(`${base}/recommendations/${id}`, { signal });
}

export function getJob(id: string, signal?: AbortSignal): Promise<JobStatus> {
  return apiRequest(`${base}/jobs/${id}`, { signal });
}

export function createOrders(recommendationIds: string[]): Promise<CreatedOrder[]> {
  return apiRequest(`${base}/orders/from-recommendations`, {
    method: "POST",
    body: { recommendation_ids: recommendationIds, idempotency_key: crypto.randomUUID() },
  });
}
