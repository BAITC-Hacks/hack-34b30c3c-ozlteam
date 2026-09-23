import { apiFormRequest, apiRequest } from "../../../shared/api/client";
import type { ImportBatch, ImportDetail, Source } from "../types";

export function listSources(signal?: AbortSignal) {
  return apiRequest<Source[]>("/v1/integrations/1c/sources", { signal });
}

export function createSource(name: string, system: "1c" | "file") {
  return apiRequest<Source>("/v1/integrations/1c/sources", { method: "POST", body: { name, system } });
}

export function listImports(signal?: AbortSignal) {
  return apiRequest<ImportBatch[]>("/v1/imports?limit=50", { signal });
}

export function getImport(id: string, signal?: AbortSignal) {
  return apiRequest<ImportDetail>(`/v1/imports/${id}`, { signal });
}

export function stageImport(input: { sourceId: string; kind: string; file: File; mapping: string; multiplier: number }) {
  const form = new FormData();
  form.append("source_id", input.sourceId);
  form.append("kind", input.kind);
  form.append("file", input.file);
  form.append("column_mapping", input.mapping);
  form.append("quantity_multiplier", String(input.multiplier));
  return apiFormRequest<ImportDetail>("/v1/imports", form);
}

export function applyImport(id: string, complete: boolean) {
  return apiRequest<ImportDetail>(`/v1/imports/${id}/apply`, { method: "POST", body: { complete } });
}
