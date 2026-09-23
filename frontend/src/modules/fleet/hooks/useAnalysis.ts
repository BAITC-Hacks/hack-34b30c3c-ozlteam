/** Разбор выбранного события: держит один запрос и отменяет устаревшие. */

import { useEffect, useState } from "react";

import { analyse } from "../api/analysis";
import type { EventContext } from "../data/playbook";
import type { Verdict } from "../types";

export interface Analysis {
  verdict: Verdict | undefined;
  pending: boolean;
}

export function useAnalysis(ctx: EventContext | undefined): Analysis {
  const [verdict, setVerdict] = useState<Verdict | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const eventId = ctx?.event.id;

  useEffect(() => {
    if (ctx === undefined) {
      setVerdict(undefined);
      return undefined;
    }
    const controller = new AbortController();
    setPending(true);
    analyse(ctx, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setVerdict(result);
      })
      .finally(() => {
        if (!controller.signal.aborted) setPending(false);
      });
    return () => controller.abort();
    // Разбор зависит только от события: остальные поля контекста меняются вместе с ним,
    // а на сам объект контекста завязываться нельзя — он пересоздаётся каждый тик.
  }, [eventId]);

  return { verdict, pending };
}
