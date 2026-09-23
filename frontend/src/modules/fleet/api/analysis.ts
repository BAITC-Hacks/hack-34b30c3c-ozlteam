/**
 * Разбор события: сначала заготовка, поверх — ответ модели, если она доступна.
 *
 * Заготовка задаёт структуру — вывод, уверенность, действия. Модель возвращает
 * свободный текст, из которого структуру надёжно не вынуть, поэтому её ответ
 * занимает только место объяснения. Когда у эндпоинта появится строгий формат
 * ответа, сюда придёт разбор целиком, а заготовка останется запасным вариантом.
 */

import { askAssistant } from "../../assistant";
import { buildPrompt, localVerdict } from "../data/playbook";
import type { EventContext } from "../data/playbook";
import type { Verdict } from "../types";

export async function analyse(ctx: EventContext, signal?: AbortSignal): Promise<Verdict> {
  const fallback = localVerdict(ctx);
  try {
    const answer = await askAssistant(buildPrompt(ctx), [], signal);
    const text = answer.trim();
    if (text === "") return fallback;
    return { ...fallback, text, source: "model" };
  } catch {
    // Модель недоступна — это штатная ситуация стенда, а не ошибка экрана.
    return fallback;
  }
}
