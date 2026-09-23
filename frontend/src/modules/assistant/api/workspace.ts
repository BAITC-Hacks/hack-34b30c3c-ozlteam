import { apiRequest } from "../../../shared/api/client";

export interface Assistant { id: string; title: string; description: string; tools: string[] }
export interface ConversationSummary { id: string; title: string; created_at: string; updated_at: string }
export interface Message {
  id: string; role: "user" | "assistant" | "system"; content: string; assistant_id: string; created_at: string;
  tool_calls: Array<{ name: string; status: string; summary: string }>;
  sources: Array<{ title: string; url: string }>;
}
export interface Proposal {
  id: string; kind: "calculate" | "create_orders" | "apply_package"; status: "pending" | "confirmed" | "cancelled";
  title: string; summary: string; payload: Record<string, unknown>; preview: Record<string, unknown>;
  version: number; result: Record<string, unknown> | null; created_at: string;
}
export interface Conversation extends ConversationSummary { messages: Message[]; proposals: Proposal[]; has_older_messages: boolean }
export type ContextKey = "warehouse_id" | "run_id" | "recommendation_id" | "order_id" | "package_id";
export type AssistantContext = Partial<Record<ContextKey, string>>;
export interface SendInput { content: string; client_request_id: string; assistant_id: string; context: AssistantContext; allow_business_data: boolean }
const base = "/v1/ai";
export const getAssistants = (signal?: AbortSignal) => apiRequest<Assistant[]>(`${base}/assistants`, { signal });
export const getConversations = (offset: number, signal?: AbortSignal) => apiRequest<ConversationSummary[]>(`${base}/conversations?limit=50&offset=${offset}`, { signal });
export const createConversation = () => apiRequest<ConversationSummary>(`${base}/conversations`, { method: "POST", body: {} });
export const getConversation = (id: string, signal?: AbortSignal) => apiRequest<Conversation>(`${base}/conversations/${id}`, { signal });
export const getMessages = (id: string, offset: number) => apiRequest<Message[]>(`${base}/conversations/${id}/messages?limit=100&offset=${offset}`);
export const sendMessage = (id: string, body: SendInput) => apiRequest<Conversation>(`${base}/conversations/${id}/messages`, { method: "POST", body });
export const decideProposal = (id: string, proposal: Proposal, decision: "confirm" | "cancel") => apiRequest<Conversation>(`${base}/conversations/${id}/proposals/${proposal.id}/decision`, { method: "POST", body: { expected_version: proposal.version, decision } });
export const getWarehouses = (signal?: AbortSignal) => apiRequest<Array<{ id: string; name: string }>>("/v1/catalogs/warehouses?limit=200&active=true", { signal });
export const getPackages = (signal?: AbortSignal) => apiRequest<{ items: Array<{ id: string; name: string; status: string }> }>("/v1/imports/packages?limit=50&offset=0", { signal });
