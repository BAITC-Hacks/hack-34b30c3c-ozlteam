export interface CatalogOption {
  id: string;
  name: string;
  active: boolean;
}

export interface SourceVersion {
  source_id: string;
  revision: number;
  complete: boolean;
  synced_at: string | null;
}

export interface Run {
  id: string;
  warehouse_id: string;
  category_id: string | null;
  as_of: string;
  status: "queued" | "running" | "done" | "failed";
  algorithm_version: string;
  source_versions: SourceVersion[];
  warnings: string[];
  error: string | null;
  job_id: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface RunPage {
  items: Run[];
  total: number;
  limit: number;
  offset: number;
}

/** Сводка относится к одному последнему успешному срезу, а не к сумме расчётов. */
export interface ReplenishmentOverview {
  latest_run: Pick<Run, "id" | "warehouse_id" | "as_of" | "completed_at" | "algorithm_version"> | null;
  deficit_count: number;
  excess_count: number;
  blocked_count: number;
  draft_order_count: number;
  source_versions: SourceVersion[];
  warnings: string[];
}

export interface SavedRecommendation {
  id: string;
  order_id: string | null;
  run_id: string;
  product_id: string;
  supplier_id: string | null;
  warehouse_id: string;
  sku: string;
  name: string;
  unit: string;
  recommended_quantity: string;
  status: "ready" | "blocked";
  urgency: "none" | "normal" | "high" | "critical";
  explanation: string;
}

export interface SavedRecommendationPage {
  items: SavedRecommendation[];
  total: number;
  limit: number;
  offset: number;
}

export interface RecommendationDetails {
  breakdown: Record<string, number | string | null>;
  warnings: string[];
  forecast: Array<{ date: string; quantity: string; seasonal_factor: string; trend_increment: string; growth_rate: string; growth_mode?: "additional" | "replace_trend" }>;
  history: Array<{ date: string; raw: string; corrected: string; stockout: boolean }>;
  excluded_sales: Array<{ date: string; client_id: string | null; quantity: string; threshold: string; reason: string }>;
  inbound: Array<{ product_id?: string; expected_date: string; quantity: string; status: string }>;
}

export interface SavedRecommendationDetail extends SavedRecommendation {
  details: RecommendationDetails;
}

export interface JobStatus {
  status: "queued" | "running" | "done" | "failed";
  steps: Array<{ name: string; state: "pending" | "done" }>;
}

export interface CreatedOrder {
  id: string;
}
