/**
 * Маршрутная сеть: поиск пути по графу коридоров и расчёт плана рейса.
 *
 * Считаем по дорожному километражу из справочника коридоров, а не по прямой:
 * между Алматы и Астаной по прямой 970 км, по дороге — около 1200, и на таком
 * расхождении разваливается и срок, и топливо, и цена.
 */

import { CORRIDORS } from "../data/geo";
import { place } from "../data/places";
import type { Corridor, GeoPoint, LegPlan, RoutePlan, Vehicle } from "../types";
import { measure } from "./projection";
import type { Measured } from "./projection";

/* ─── Экономика рейса. Значения демонстрационные: реальные ставки берутся из договора. ─── */

/** Дизель, ₸ за литр. */
export const DIESEL_PRICE = 295;
/** Оплата водителя, ₸ за час за рулём. */
export const DRIVER_RATE = 3200;
/** Дорожные расходы, ₸ за км: платные участки, стоянки, мойка. */
export const ROAD_FEE = 14;
/** Прохождение одного пункта пропуска, ₸: брокер, сборы, простой. */
export const BORDER_COST = 45_000;
/** Наценка к себестоимости. */
export const MARGIN = 1.24;
/** Оформление на границе, часов. */
export const BORDER_HOURS = 3.5;
/** Погрузка и выгрузка, часов на рейс. */
export const HANDLING_HOURS = 2;
/** Непрерывное время за рулём до обязательного перерыва, минут. */
export const DRIVE_BLOCK_MIN = 270;
/** Длительность обязательного перерыва, минут. */
export const REST_MIN = 45;
/** Время за рулём в сутки, минут: дальше водитель обязан встать на суточный отдых. */
export const DAILY_DRIVE_MIN = 540;
/** Суточный отдых, минут. */
export const DAILY_REST_MIN = 660;

/** Коридор между точками в любом направлении. */
export function corridorBetween(from: string, to: string): Corridor | undefined {
  return CORRIDORS.find(
    (corridor) =>
      (corridor.from === from && corridor.to === to) ||
      (corridor.from === to && corridor.to === from),
  );
}

/**
 * Ломаная одного участка: от точки через изгибы дороги к точке.
 * Промежуточные точки хранятся в одном направлении, поэтому при обратном
 * движении их порядок разворачивается — иначе линия ляжет петлёй.
 */
export function legPath(from: string, to: string): GeoPoint[] {
  const start = place(from).point;
  const end = place(to).point;
  const corridor = corridorBetween(from, to);
  if (corridor === undefined || corridor.via === undefined) return [start, end];
  const via = corridor.from === from ? corridor.via : [...corridor.via].reverse();
  return [start, ...via, end];
}

/** Ломаная всего маршрута без повторов в стыках участков. */
export function routePath(route: string[]): GeoPoint[] {
  const points: GeoPoint[] = [];
  for (let i = 1; i < route.length; i += 1) {
    const leg = legPath(route[i - 1], route[i]);
    points.push(...(i === 1 ? leg : leg.slice(1)));
  }
  return points;
}

export function measuredRoute(route: string[]): Measured {
  return measure(routePath(route));
}

/** Сколько раз рейс пересекает границу: по смене страны между точками. */
export function countCrossings(route: string[]): number {
  let crossings = 0;
  for (let i = 1; i < route.length; i += 1) {
    if (place(route[i - 1]).country !== place(route[i]).country) crossings += 1;
  }
  return crossings;
}

/** План рейса: километры, сроки, топливо и деньги. Считается один раз при создании. */
export function planRoute(route: string[], vehicle: Vehicle): RoutePlan {
  const legs: LegPlan[] = [];
  let km = 0;
  let driveHours = 0;

  for (let i = 1; i < route.length; i += 1) {
    const from = route[i - 1];
    const to = route[i];
    const corridor = corridorBetween(from, to);
    // Коридора нет — участок всё равно проезжий: берём прямую с запасом 18 % на изгибы.
    const legKm = corridor?.km ?? Math.round(measure(legPath(from, to)).total * 1.18);
    const speed = corridor?.speed ?? 55;
    const hours = legKm / speed;
    km += legKm;
    driveHours += hours;
    legs.push({ from, to, km: legKm, hours, kmTo: km });
  }

  const crossings = countCrossings(route);
  // Водитель не едет круглые сутки: на длинном плече ночёвок больше, чем самого
  // движения, и без них срок доставки занижается в разы. Последняя ночёвка не нужна —
  // рейс к этому моменту уже закончен, поэтому из числа отрезков вычитается один.
  const driveMin = driveHours * 60;
  const breaks = Math.max(0, Math.ceil(driveMin / DRIVE_BLOCK_MIN) - 1) * REST_MIN;
  const nights = Math.max(0, Math.ceil(driveMin / DAILY_DRIVE_MIN) - 1) * DAILY_REST_MIN;
  const restHours = (breaks + nights) / 60;
  const totalHours = driveHours + restHours + crossings * BORDER_HOURS + HANDLING_HOURS;
  const fuelL = (km / 100) * vehicle.consumption;
  const cost =
    fuelL * DIESEL_PRICE + driveHours * DRIVER_RATE + km * ROAD_FEE + crossings * BORDER_COST;

  return {
    km: Math.round(km),
    driveHours: Math.round(driveHours * 10) / 10,
    totalHours: Math.round(totalHours * 10) / 10,
    fuelL: Math.round(fuelL),
    cost: Math.round(cost / 1000) * 1000,
    price: Math.round((cost * MARGIN) / 1000) * 1000,
    legs,
  };
}

/** Граф смежности строится один раз: коридоры не меняются во время работы. */
const GRAPH: Map<string, { to: string; km: number }[]> = (() => {
  const graph = new Map<string, { to: string; km: number }[]>();
  const link = (from: string, to: string, km: number) => {
    const list = graph.get(from);
    if (list === undefined) graph.set(from, [{ to, km }]);
    else list.push({ to, km });
  };
  for (const corridor of CORRIDORS) {
    link(corridor.from, corridor.to, corridor.km);
    link(corridor.to, corridor.from, corridor.km);
  }
  return graph;
})();

/**
 * Кратчайший маршрут по километражу — Дейкстра на неотрицательных весах.
 * Сеть меньше сотни узлов, поэтому очередь с приоритетом не нужна: линейный
 * выбор минимума проще читается и не заметен по времени.
 */
export function findRoute(from: string, to: string): string[] | null {
  if (from === to) return null;

  const distance = new Map<string, number>([[from, 0]]);
  const previous = new Map<string, string>();
  const visited = new Set<string>();

  for (;;) {
    let current: string | undefined;
    let best = Number.POSITIVE_INFINITY;
    for (const [node, value] of distance) {
      if (!visited.has(node) && value < best) {
        best = value;
        current = node;
      }
    }
    if (current === undefined) return null;
    if (current === to) break;

    visited.add(current);
    for (const edge of GRAPH.get(current) ?? []) {
      if (visited.has(edge.to)) continue;
      const candidate = best + edge.km;
      if (candidate < (distance.get(edge.to) ?? Number.POSITIVE_INFINITY)) {
        distance.set(edge.to, candidate);
        previous.set(edge.to, current);
      }
    }
  }

  const route = [to];
  let cursor = to;
  while (cursor !== from) {
    const back = previous.get(cursor);
    if (back === undefined) return null;
    route.unshift(back);
    cursor = back;
  }
  return route;
}

/** Точки, до которых из этой вообще есть дорога: ими наполняется выбор пункта назначения. */
export function reachable(from: string): Set<string> {
  const seen = new Set<string>([from]);
  const queue = [from];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const edge of GRAPH.get(current) ?? []) {
      if (seen.has(edge.to)) continue;
      seen.add(edge.to);
      queue.push(edge.to);
    }
  }
  seen.delete(from);
  return seen;
}
