import { ApiError, apiRequest, apiUpload, tokenStore } from "../../../shared/api/client";

export interface StoredFile {
  id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  kind: string;
  preview_url: string | null;
}

export function listFiles(limit = 20, offset = 0, signal?: AbortSignal): Promise<StoredFile[]> {
  return apiRequest<StoredFile[]>(`/v1/files?limit=${limit}&offset=${offset}`, { signal });
}

export function uploadFile(file: File): Promise<StoredFile> {
  return apiUpload<StoredFile>("/v1/files", file);
}

async function readFile(id: string, part: "content" | "preview"): Promise<Blob> {
  const headers = new Headers();
  const token = tokenStore.get();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`/api/v1/files/${encodeURIComponent(id)}/${part}`, { headers });
  if (!response.ok) throw new ApiError(response.status);
  return response.blob();
}

export function getPreview(id: string): Promise<Blob> {
  return readFile(id, "preview");
}

export async function downloadFile(file: StoredFile): Promise<void> {
  const blob = await readFile(file.id, "content");
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = file.filename;
    document.body.append(link);
    link.click();
    link.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
