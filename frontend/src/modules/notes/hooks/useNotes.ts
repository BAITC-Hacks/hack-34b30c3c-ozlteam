import { useCallback, useEffect, useState } from "react";
import { notesApi } from "../api/notes";
import type { Note } from "../types";

export function useNotes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    notesApi
      .list(controller.signal)
      .then(setNotes)
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Не удалось загрузить заметки. Проверьте соединение с API.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [revision]);

  async function mutate(action: () => Promise<unknown>): Promise<boolean> {
    setBusy(true);
    setError("");
    try {
      await action();
      reload();
      return true;
    } catch {
      setError("Не удалось сохранить изменения. Попробуйте ещё раз.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return {
    notes,
    loading,
    busy,
    error,
    reload,
    create: (title: string) => mutate(() => notesApi.create(title)),
    remove: (id: string) => mutate(() => notesApi.remove(id)),
  };
}
