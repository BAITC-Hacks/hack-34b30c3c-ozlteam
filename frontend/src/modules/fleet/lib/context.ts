/**
 * Окружение события: всё, что нужно разбору, собрано в одном месте.
 *
 * И заготовленный разбор, и вопрос к модели работают с одним объектом — так они
 * не могут разойтись в фактах и назвать разные сроки для одного и того же события.
 */

import { client, driver, vehicle } from "../data/fleet";
import type { EventContext } from "../data/playbook";
import { placeName } from "../data/places";
import type { SimState } from "./simulator";
import { etaMinutes } from "./simulator";
import type { TripEvent } from "../types";
import { eta } from "./format";

export function eventContext(state: SimState, event: TripEvent): EventContext {
  const trip = state.trip;
  return {
    event,
    tripId: trip.id,
    placeName: placeName(trip.route[Math.min(state.reached, trip.route.length - 1)]),
    destination: placeName(trip.route[trip.route.length - 1]),
    clientName: client(trip.clientId).name,
    driverName: driver(trip.driverId).name,
    plate: vehicle(trip.vehicleId).plate,
    cargo: trip.cargo,
    delayMin: Math.round(state.runtime.delay),
    etaText: eta(trip.departAt, etaMinutes(state)),
  };
}
