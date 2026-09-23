import { apiRequest } from "../../../shared/api/client";

export type Role = "user" | "assistant";

export interface ChatTurn {
  role: Role;
  content: string;
}

interface AnswerResponse {
  answer: string;
}

/** История живёт у клиента: на сервере у чата пока нет хранилища. */
export async function askAssistant(
  question: string,
  history: ChatTurn[],
  signal?: AbortSignal,
): Promise<string> {
  const data = await apiRequest<AnswerResponse>("/v1/ai/chat", {
    method: "POST",
    body: { question, history: history.slice(-20).map((turn) => ({ ...turn, content: turn.content.slice(0, 4000) })) },
    signal,
  });
  return data.answer;
}
