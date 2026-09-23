import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "../../auth";
import { ApiError } from "../../../shared/api/client";
import { createConversation, decideProposal, getAssistants, getConversation, getConversations, getMessages, sendMessage } from "../api/workspace";
import type { AssistantContext, Conversation, Proposal, SendInput } from "../api/workspace";

interface WorkspaceState {
  activeId: string; assistantId: string; context: AssistantContext; allowData: boolean;
  busy: boolean; error: string; retry: { id: string; input: SendInput } | null;
}
function initialState(userId: string): WorkspaceState {
  let activeId = "";
  try { activeId = sessionStorage.getItem(`assistant.active.${userId}`) ?? ""; } catch { /* ID only, no private chat content. */ }
  if (!/^[\da-f-]{36}$/i.test(activeId)) activeId = "";
  return { activeId, assistantId: "auto", context: {}, allowData: false, busy: false, error: "", retry: null };
}
function errorMessage(error: unknown) {
  if (error instanceof ApiError && error.status === 409) return "Данные или предложение изменились. Обновите диалог и проверьте актуальный результат перед повторным действием.";
  if (error instanceof ApiError && error.status === 403) return "У вашей роли нет доступа к этому действию или выбранным данным.";
  return error instanceof Error ? error.message : "Запрос не выполнен. Попробуйте ещё раз.";
}

export function useWorkspace(offset = 0) {
  const { data: user } = useCurrentUser();
  const userId = user?.id ?? "";
  const client = useQueryClient();
  const key = ["assistant", userId, "workspace"];
  const { data: state } = useQuery({ queryKey: key, queryFn: () => initialState(userId), initialData: () => initialState(userId), enabled: false });
  function update(patch: Partial<WorkspaceState>) { client.setQueryData<WorkspaceState>(key, (current) => ({ ...(current ?? initialState(userId)), ...patch })); }
  const assistants = useQuery({ queryKey: ["assistant", userId, "helpers"], queryFn: ({ signal }) => getAssistants(signal), enabled: !!userId, retry: false });
  const conversations = useQuery({ queryKey: ["assistant", userId, "conversations", offset], queryFn: ({ signal }) => getConversations(offset, signal), enabled: !!userId, retry: false });
  const conversationKey = (id: string) => ["assistant", userId, "conversation", id];
  const conversation = useQuery({ queryKey: conversationKey(state.activeId), queryFn: ({ signal }) => getConversation(state.activeId, signal), enabled: !!userId && !!state.activeId, retry: false, refetchOnWindowFocus: false });
  function select(id: string) {
    if (state.busy) return;
    update({ activeId: id, error: "", retry: null, allowData: false });
    try { sessionStorage.setItem(`assistant.active.${userId}`, id); } catch { /* Optional navigation persistence. */ }
  }
  function save(result: Conversation) {
    client.setQueryData(conversationKey(result.id), result);
    void client.invalidateQueries({ queryKey: ["assistant", userId, "conversations"] });
  }
  async function newConversation() {
    if (!userId || client.getQueryData<WorkspaceState>(key)?.busy) return;
    update({ busy: true, error: "" });
    try {
      const added = await createConversation();
      update({ activeId: added.id, retry: null, context: {}, allowData: false });
      try { sessionStorage.setItem(`assistant.active.${userId}`, added.id); } catch { /* Optional ID persistence. */ }
      save({ ...added, messages: [], proposals: [], has_older_messages: false });
    } catch (error) { update({ error: errorMessage(error) }); }
    finally { update({ busy: false }); }
  }
  async function send(content: string, retry = false): Promise<boolean> {
    if (!userId || client.getQueryData<WorkspaceState>(key)?.busy || (!retry && !content.trim())) return false;
    update({ busy: true, error: "" });
    let attempt = retry || state.retry?.input.content === content.trim() ? state.retry : null;
    if (attempt?.input.allow_business_data && !state.allowData) {
      update({ busy: false, error: "Разрешение на чтение данных отозвано. Этот повтор использовал исходное разрешение: обновите диалог, чтобы проверить результат, или задайте новый вопрос без доступа к данным." });
      return false;
    }
    try {
      if (!attempt) {
        let id = state.activeId;
        if (!id) {
          const added = await createConversation(); id = added.id;
          update({ activeId: id });
          try { sessionStorage.setItem(`assistant.active.${userId}`, id); } catch { /* Optional ID persistence. */ }
          save({ ...added, messages: [], proposals: [], has_older_messages: false });
        }
        attempt = { id, input: { content: content.trim(), client_request_id: crypto.randomUUID(), assistant_id: state.assistantId, context: { ...state.context }, allow_business_data: state.allowData } };
      }
      update({ retry: attempt });
      await client.cancelQueries({ queryKey: conversationKey(attempt.id) });
      save(await sendMessage(attempt.id, attempt.input));
      update({ retry: null });
      return true;
    } catch (error) {
      update({ error: errorMessage(error) });
      if (attempt) void client.invalidateQueries({ queryKey: conversationKey(attempt.id) });
      return false;
    } finally { update({ busy: false }); }
  }
  async function decide(proposal: Proposal, decision: "confirm" | "cancel") {
    if (!state.activeId || client.getQueryData<WorkspaceState>(key)?.busy) return;
    update({ busy: true, error: "" });
    try { await client.cancelQueries({ queryKey: conversationKey(state.activeId) }); save(await decideProposal(state.activeId, proposal, decision)); }
    catch (error) { update({ error: errorMessage(error) }); void client.invalidateQueries({ queryKey: conversationKey(state.activeId) }); }
    finally { update({ busy: false }); }
  }
  async function older() {
    const current = conversation.data;
    if (!current || !current.has_older_messages || client.getQueryData<WorkspaceState>(key)?.busy) return;
    update({ busy: true, error: "" });
    try {
      const messages = await getMessages(current.id, current.messages.length);
      const ids = new Set(current.messages.map((message) => message.id));
      client.setQueryData(conversationKey(current.id), { ...current, messages: [...messages.filter((message) => !ids.has(message.id)), ...current.messages], has_older_messages: messages.length === 100 });
    } catch (error) { update({ error: errorMessage(error) }); }
    finally { update({ busy: false }); }
  }
  return { userId, state, update, assistants, conversations, conversation, select, newConversation, send, decide, older };
}
