/**
 * Сборка рейса: заказ + машина + водитель + маршрут = рейс с посчитанным планом.
 *
 * Рейс не создаётся вручную по полям — только через эту функцию, иначе план и
 * маршрут разъедутся и симулятор поедет по одной ломаной, а сроки покажет от другой.
 */

import { vehicle } from "../data/fleet";
import type { Cargo, Order, Trip, TripStatus } from "../types";
import { findRoute, planRoute } from "./route";

export interface TripDraft {
  id: string;
  clientId: string;
  vehicleId: string;
  driverId: string;
  cargo: Cargo;
  /** Точки по порядку. Если не задать — маршрут подберётся по сети коридоров. */
  route: string[];
  departAt: string;
  orderId?: string;
  status?: TripStatus;
}

export function buildTrip(draft: TripDraft): Trip {
  return {
    id: draft.id,
    orderId: draft.orderId,
    clientId: draft.clientId,
    vehicleId: draft.vehicleId,
    driverId: draft.driverId,
    cargo: draft.cargo,
    route: draft.route,
    plan: planRoute(draft.route, vehicle(draft.vehicleId)),
    status: draft.status ?? "planned",
    departAt: draft.departAt,
  };
}

/** Рейс по заказу: маршрут подбирается автоматически по кратчайшему пути. */
export function tripFromOrder(
  order: Order,
  assignment: { id: string; vehicleId: string; driverId: string; departAt: string },
): Trip | null {
  const route = findRoute(order.from, order.to);
  if (route === null) return null;
  return buildTrip({
    id: assignment.id,
    orderId: order.id,
    clientId: order.clientId,
    vehicleId: assignment.vehicleId,
    driverId: assignment.driverId,
    cargo: order.cargo,
    route,
    departAt: assignment.departAt,
  });
}

/**
 * Следующий свободный номер рейса в формате KZ-1183.
 * Номера сквозные по компании, поэтому берём максимум, а не количество:
 * удалённый рейс не должен вернуть свой номер новому.
 */
export function nextTripId(existing: readonly Trip[]): string {
  const numbers = existing
    .map((trip) => Number.parseInt(trip.id.replace(/^\D+/, ""), 10))
    .filter((value) => Number.isFinite(value));
  const max = numbers.length === 0 ? 1180 : Math.max(...numbers);
  return `KZ-${max + 1}`;
}
