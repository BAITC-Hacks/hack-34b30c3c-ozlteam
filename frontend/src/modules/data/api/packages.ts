import { apiFormRequest, apiRequest } from "../../../shared/api/client";

export type PackageStatus = "queued" | "parsing" | "validated" | "applying" | "applied" | "failed";
export type ReadinessStatus = "ready" | "limited" | "blocked";
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface ImportPackage {
  id: string;
  source_id: string;
  name: string;
  status: PackageStatus;
  job_id: string | null;
  files: { name: string; size: number; sha256: string; profile?: string | null; row_count?: number | null }[];
  options: Record<string, JsonValue>;
  summary: Record<string, JsonValue>;
  controls: JsonValue;
  row_count: number;
  processed_rows: number;
  issue_count: number;
  error: string | null;
  created_at: string;
  applied_at: string | null;
}

export interface PackagePage<T> { items: T[]; total: number; limit: number; offset: number }
export interface PackageIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  filename?: string;
  sheet?: string;
  row?: number;
  product_code?: string;
  supplier?: string;
}
export interface PackageProduct {
  name: string;
  code: string;
  supplier: string;
  supplier_external_id: string;
  external_id: string;
  status: ReadinessStatus;
  reasons: string[];
  provenance: Record<string, JsonValue>[];
}

export interface PackageOptions {
  as_of: string;
  history_start: string;
  revision: number;
  lead_time_days: number | null;
  warehouse_mapping: Record<string, string>;
  negative_sales_policy: "quarantine" | "signed_returns";
  moq_semantics: "minimum" | "pack" | null;
}

const path = "/v1/imports/packages";

export function uploadPackage(files: File[], options: PackageOptions, sourceId: string, name: string): Promise<ImportPackage> {
  const form = new FormData();
  files.forEach((file) => form.append("files", file));
  form.set("options", JSON.stringify(options));
  form.set("name", name);
  if (sourceId) form.set("source_id", sourceId);
  return apiFormRequest(path, form);
}

export function listPackages(offset = 0, signal?: AbortSignal): Promise<PackagePage<ImportPackage>> {
  return apiRequest(`${path}?limit=10&offset=${offset}`, { signal });
}

export function getPackage(id: string, signal?: AbortSignal): Promise<ImportPackage> {
  return apiRequest(`${path}/${encodeURIComponent(id)}`, { signal });
}

export function applyPackage(id: string): Promise<ImportPackage> {
  return apiRequest(`${path}/${encodeURIComponent(id)}/apply`, { method: "POST" });
}

export function retryPackage(id: string): Promise<ImportPackage> {
  return apiRequest(`${path}/${encodeURIComponent(id)}/retry`, { method: "POST" });
}

export function packageIssues(id: string, offset: number, signal?: AbortSignal): Promise<PackagePage<PackageIssue>> {
  return apiRequest(`${path}/${encodeURIComponent(id)}/issues?limit=20&offset=${offset}`, { signal });
}

export function packageProducts(id: string, filters: { offset: number; q: string; status: string }, signal?: AbortSignal): Promise<PackagePage<PackageProduct>> {
  const query = new URLSearchParams({ limit: "20", offset: String(filters.offset) });
  if (filters.q) query.set("q", filters.q);
  if (filters.status) query.set("status", filters.status);
  return apiRequest(`${path}/${encodeURIComponent(id)}/products?${query}`, { signal });
}
