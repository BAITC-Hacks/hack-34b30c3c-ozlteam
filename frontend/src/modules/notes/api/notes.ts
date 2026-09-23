import { apiRequest } from "../../../shared/api/client";
import type { Note } from "../types";

export const notesApi = {
  list: (signal?: AbortSignal) =>
    apiRequest<Note[]>("/v1/notes?limit=100", { signal }),
  create: (title: string) =>
    apiRequest<Note>("/v1/notes", {
      method: "POST",
      body: JSON.stringify({ title }),
    }),
  remove: (id: string) =>
    apiRequest<void>(`/v1/notes/${id}`, { method: "DELETE" }),
};
