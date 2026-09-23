import { apiRequest } from "../../../shared/api/client";
import type { Conversation, ConversationSummary } from "./workspace";

/** Analyze only a supplied synthetic snapshot; no permission to read accounting data. */
export async function askSimulationAnalysis(question: string, signal?: AbortSignal): Promise<string> {
  const conversation = await apiRequest<ConversationSummary>("/v1/ai/conversations", {
    method: "POST", body: { title: "Демо: поставка и риск дефицита" }, signal,
  });
  const result = await apiRequest<Conversation>(`/v1/ai/conversations/${conversation.id}/messages`, {
    method: "POST", signal,
    body: { content: question, client_request_id: crypto.randomUUID(), assistant_id: "inventory", context: {}, allow_business_data: false },
  });
  const answer = result.messages.filter((message) => message.role === "assistant").at(-1)?.content.trim();
  if (!answer) throw new Error("Модель не вернула ответ. Попробуйте ещё раз.");
  return answer;
}
