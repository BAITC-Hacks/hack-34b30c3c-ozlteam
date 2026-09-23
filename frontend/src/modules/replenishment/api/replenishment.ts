import { apiRequest, apiUpload, tokenStore } from "../../../shared/api/client";
import type { CalculationInput, CalculationResult } from "../types";

const path = "/v1/replenishment";

export function getDemo(signal?: AbortSignal): Promise<CalculationInput> {
  return apiRequest(`${path}/demo`, { signal });
}

export function calculate(input: CalculationInput, signal?: AbortSignal): Promise<CalculationResult> {
  return apiRequest(`${path}/calculate`, { method: "POST", body: input, signal });
}

export function importWorkbook(file: File): Promise<CalculationInput> {
  return apiUpload(`${path}/import`, file);
}

export async function downloadTemplate(): Promise<void> {
  const token = tokenStore.get();
  const response = await fetch(`/api${path}/template`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new Error(`Не удалось скачать шаблон (${response.status}).`);
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = "replenishment-template.xlsx";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
