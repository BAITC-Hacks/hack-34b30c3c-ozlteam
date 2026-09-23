/**
 * Рейсы демонстрационного стенда — производные от заказов, а не отдельный список.
 *
 * План каждого рейса считается тем же кодом, что и при создании нового: поправим
 * тариф или скорость на коридоре — демо-рейсы пересчитаются сами и не начнут
 * противоречить тому, что показывает планировщик.
 */

import { tripFromOrder } from "../lib/factory";
import type { Order, Trip, TripStatus } from "../types";
import { ORDERS } from "./fleet";

/** Кто и на чём везёт. Назначения зафиксированы по рейсам, чтобы демонстрацию можно было отрепетировать. */
const ASSIGNMENTS: Record<string, { vehicleId: string; driverId: string; departAt: string }> = {
  "KZ-1183": { vehicleId: "veh-01", driverId: "drv-01", departAt: "2026-09-21T06:00:00+06:00" },
  "KZ-1176": { vehicleId: "veh-07", driverId: "drv-07", departAt: "2026-09-18T05:00:00+06:00" },
  "KZ-1190": { vehicleId: "veh-03", driverId: "drv-03", departAt: "2026-09-22T07:00:00+06:00" },
  // Рефрижератор и водитель с допуском на него: температурный режим груза здесь не декорация.
  "KZ-1194": { vehicleId: "veh-05", driverId: "drv-04", departAt: "2026-09-21T04:30:00+06:00" },
};

const FALLBACK = { vehicleId: "veh-02", driverId: "drv-02", departAt: "2026-09-22T08:00:00+06:00" };

/** Статус рейса следует за статусом заказа: два источника правды разъедутся на первой же демонстрации. */
function statusOf(order: Order): TripStatus {
  switch (order.status) {
    case "running":
      return "running";
    case "done":
      return "done";
    default:
      return "planned";
  }
}

export const TRIPS: Trip[] = ORDERS.flatMap((order) => {
  if (order.tripId === undefined) return [];
  const slot = ASSIGNMENTS[order.tripId] ?? FALLBACK;
  const trip = tripFromOrder(order, { id: order.tripId, ...slot });
  // Между точками заказа может не оказаться дороги в справочнике коридоров —
  // такой заказ просто не превращается в рейс, вместо падения всего экрана.
  return trip === null ? [] : [{ ...trip, status: statusOf(order) }];
});
