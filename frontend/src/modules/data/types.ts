export interface Source {
  id: string;
  name: string;
  system: "1c" | "file";
  revision: number;
  cursor: string | null;
  complete: boolean;
  synced_at: string | null;
  created_at: string;
}

export interface ExchangeBatch {
  id: string;
  source_id: string;
  batch_key: string;
  revision: number;
  row_count: number;
  cursor: string | null;
  created_at: string;
  summary: Record<string, number>;
}

export interface RowError {
  sheet: string | null;
  row: number;
  column: string | null;
  message: string;
}

export interface ImportBatch {
  id: string;
  source_id: string;
  filename: string;
  kind: string;
  base_revision: number;
  status: "validated" | "invalid" | "applied";
  row_count: number;
  errors: RowError[];
  created_at: string;
  applied_at: string | null;
}

export interface ImportDetail extends ImportBatch {
  preview: Array<Record<string, unknown>>;
}
