import { apiRequest } from "../../../shared/api/client";
import type { ImportDetail } from "../types";

export interface ReportField {
  name: string;
  label: string;
  required: boolean;
  type: string;
}

export interface ReportKind {
  kind: string;
  title: string;
  description: string;
  fields: ReportField[];
}

export interface ReportInput {
  name: string;
  kind: string;
  url: string;
  items_path: string;
  column_mapping: Record<string, string>;
  quantity_multiplier: 1 | -1;
  auth_env: string | null;
}

export interface RestReport extends ReportInput {
  id: string;
  source_id: string;
  created_at: string;
  updated_at: string;
}

const base = "/v1/integrations/1c";
export const listReportKinds = (signal?: AbortSignal) =>
  apiRequest<ReportKind[]>(`${base}/report-kinds`, { signal });
export const listReports = (sourceId: string, signal?: AbortSignal) =>
  apiRequest<RestReport[]>(
    `${base}/sources/${encodeURIComponent(sourceId)}/reports`,
    { signal },
  );
export const saveReport = (
  sourceId: string,
  id: string | undefined,
  body: ReportInput,
) =>
  apiRequest<RestReport>(
    id
      ? `${base}/reports/${id}`
      : `${base}/sources/${encodeURIComponent(sourceId)}/reports`,
    { method: id ? "PUT" : "POST", body },
  );
export const previewReport = (id: string) =>
  apiRequest<ImportDetail>(`${base}/reports/${id}/preview`, { method: "POST" });
