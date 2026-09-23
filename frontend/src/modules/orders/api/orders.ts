import { ApiError, apiRequest, tokenStore } from "../../../shared/api/client";
import type { OrderAudit, OrderHandoff, SupplierOrder } from "../types";

const base = "/v1/orders";

export function listOrders(status: string, offset: number, signal: AbortSignal) {
  const query = new URLSearchParams({ limit: "20", offset: String(offset) });
  if (status === "draft" || status === "approved") query.set("status", status);
  return apiRequest<SupplierOrder[]>(`${base}?${query}`, { signal });
}

export function getOrder(id: string, signal: AbortSignal) {
  return apiRequest<SupplierOrder>(`${base}/${id}`, { signal });
}

export function listWarehouses(signal: AbortSignal) {
  return apiRequest<Array<{ id: string; name: string }>>("/v1/catalogs/warehouses?limit=200", { signal });
}

export function editOrderLine(orderId: string, lineId: string, quantity: string, reason: string, expectedVersion: number) {
  return apiRequest<SupplierOrder>(`${base}/${orderId}/lines/${lineId}`, {
    method: "PATCH",
    body: { quantity, reason, expected_version: expectedVersion },
  });
}

export function updateOrderComment(orderId: string, comment: string, reason: string, expectedVersion: number) {
  return apiRequest<SupplierOrder>(`${base}/${orderId}`, {
    method: "PATCH",
    body: { comment, reason, expected_version: expectedVersion },
  });
}

export function deleteOrderLine(orderId: string, lineId: string, reason: string, expectedVersion: number) {
  return apiRequest<SupplierOrder>(`${base}/${orderId}/lines/${lineId}`, {
    method: "DELETE",
    body: { reason, expected_version: expectedVersion },
  });
}

export function getOrderAudit(orderId: string, offset: number, signal: AbortSignal) {
  const query = new URLSearchParams({ limit: "50", offset: String(offset) });
  return apiRequest<OrderAudit[]>(`${base}/${orderId}/audit?${query}`, { signal });
}

export function reviseOrder(orderId: string, reason: string, expectedVersion: number) {
  return apiRequest<SupplierOrder>(`${base}/${orderId}/revise`, {
    method: "POST",
    body: { reason, expected_version: expectedVersion },
  });
}

export function getOrderHandoff(orderId: string, signal: AbortSignal) {
  return apiRequest<OrderHandoff>(`${base}/${orderId}/1c`, { signal });
}

export function approveOrder(orderId: string, expectedVersion: number) {
  return apiRequest<SupplierOrder>(`${base}/${orderId}/approve`, {
    method: "POST",
    body: { expected_version: expectedVersion },
  });
}

export async function exportOrder(order: SupplierOrder, format: "csv" | "xlsx") {
  const response = await fetch(`/api${base}/${order.id}/export?format=${format}`, {
    headers: tokenStore.get() ? { Authorization: `Bearer ${tokenStore.get()}` } : {},
  });
  if (!response.ok) {
    if (response.status === 403) throw new ApiError(403, "У вашей роли нет права на экспорт заказов.");
    throw new ApiError(response.status, "Не удалось скачать файл заказа.");
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = `order-${order.id}-r${order.revision}.${format}`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
