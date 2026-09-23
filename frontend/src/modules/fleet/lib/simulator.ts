/**
 * Симулятор рейса: движение по маршруту и события на одной оси времени.
 *
 * Чистая функция состояния — `advance(state, minutes)` возвращает новое состояние
 * и ничего не знает ни о таймере, ни об экране. Благодаря этому один и тот же код
 * работает в автоматическом режиме, в ручном шаге и в тестах, а когда вместо
 * симулятора появится настоящий трекер, заменится только источник событий.
 *
 * Случайность детерминирована: от одного зерна рейс всегда проходит одинаково,
 * иначе демонстрацию невозможно отрепетировать.
 */

import { describeEvent, SPEED_LIMIT } from "../data/playbook";
import { place } from "../data/places";
import type { EventKind, GeoPoint, Telemetry, Trip, TripEvent, TripRuntime } from "../types";
import { pointAtRatio } from "./projection";
import type { Measured } from "./projection";
import {
  DAILY_DRIVE_MIN,
  DAILY_REST_MIN,
  DRIVE_BLOCK_MIN,
  REST_MIN,
  corridorBetween,
  measuredRoute,
} from "./route";

/** Максимальный шаг внутреннего расчёта, минут: крупнее — и события проскакивают мимо точек. */
const SUB_STEP = 3;
/** Оформление на границе, минут. */
const BORDER_MIN = 210;
/** Пауза на заправку, минут. */
const FUEL_MIN = 25;
/** Вынужденная стоянка при поломке, минут. */
const BREAKDOWN_MIN = 150;
/** Остаток бака, ниже которого водитель обязан заправиться, %. */
const FUEL_FLOOR = 14;

export interface QueuedEvent {
  kind: EventKind;
  /** Минута рейса, на которой событие должно появиться. */
  at: number;
}

export interface SimState {
  trip: Trip;
  path: Measured;
  runtime: TripRuntime;
  events: TripEvent[];
  /** Индекс последней пройденной точки маршрута. */
  reached: number;
  /** Минута, до которой рейс стоит. */
  haltUntil: number;
  /** Отложенные события: таможня появляется не одновременно с въездом на пункт. */
  queue: QueuedEvent[];
  /** Состояние генератора случайных чисел. */
  rnd: number;
  /** Когда в последний раз фиксировали превышение — чтобы не сыпать ими подряд. */
  lastSpeedingAt: number;
  /** Минут за рулём с последнего суточного отдыха. */
  drivenToday: number;
  /** Порядковый номер события: из него собирается идентификатор. */
  counter: number;
}

/** mulberry32: короткий генератор с хорошим распределением и воспроизводимой цепочкой. */
function nextRandom(seed: number): { value: number; seed: number } {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, seed: t };
}

function seedFrom(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Скорость на участке, с которым сейчас идёт машина. */
function legSpeed(trip: Trip, legIndex: number): number {
  const leg = trip.plan.legs[Math.min(legIndex, trip.plan.legs.length - 1)];
  if (leg === undefined) return 60;
  return corridorBetween(leg.from, leg.to)?.speed ?? 60;
}

function legIndexFor(trip: Trip, km: number): number {
  const index = trip.plan.legs.findIndex((leg) => km < leg.kmTo);
  return index === -1 ? Math.max(0, trip.plan.legs.length - 1) : index;
}

function startTelemetry(trip: Trip): Telemetry {
  return {
    speed: 0,
    fuel: 100,
    drivingFor: 0,
    cargoTemp: trip.cargo.temperature === undefined ? undefined : -18,
  };
}

export function createState(trip: Trip): SimState {
  const path = measuredRoute(trip.route);
  const first = path.points[0] ?? { lon: 0, lat: 0 };
  return {
    trip,
    path,
    runtime: {
      tripId: trip.id,
      minutes: 0,
      km: 0,
      point: first,
      heading: 0,
      telemetry: startTelemetry(trip),
      legIndex: 0,
      // До запуска рейс не «стоит» — он ещё не выехал. Остановкой считается
      // только вынужденная пауза в пути, иначе панель врёт про простой.
      halted: false,
      delay: 0,
      finished: false,
    },
    events: [],
    reached: 0,
    haltUntil: 0,
    queue: [],
    rnd: seedFrom(trip.id),
    lastSpeedingAt: -999,
    drivenToday: 0,
    counter: 0,
  };
}

interface Emission {
  state: SimState;
  event: TripEvent;
}

/** Собрать событие в текущей точке и добавить его в ленту. */
function emit(state: SimState, kind: EventKind, overrides: Partial<TripEvent> = {}): Emission {
  const placeId = state.trip.route[Math.min(state.reached, state.trip.route.length - 1)];
  const destinationId = state.trip.route[state.trip.route.length - 1];

  // Телеметрия считается до описания: у превышения скорость приходит в overrides,
  // и текст должен назвать зафиксированную скорость, а не обычную скорость участка.
  const telemetry = overrides.telemetry ?? { ...state.runtime.telemetry };
  const described = describeEvent(kind, {
    placeName: place(placeId).name,
    destination: place(destinationId).name,
    speed: Math.round(telemetry.speed),
    cargo: state.trip.cargo,
  });

  const counter = state.counter + 1;
  const event: TripEvent = {
    id: `${state.trip.id}-e${counter}`,
    tripId: state.trip.id,
    kind,
    severity: described.severity,
    at: Math.round(state.runtime.minutes),
    km: Math.round(state.runtime.km),
    point: state.runtime.point,
    title: described.title,
    detail: described.detail,
    ...overrides,
    telemetry,
  };

  return {
    state: {
      ...state,
      counter,
      events: [...state.events, event],
      runtime: {
        ...state.runtime,
        delay: state.runtime.delay + (event.delay ?? 0),
      },
    },
    event,
  };
}

function halt(state: SimState, minutes: number, reason: string): SimState {
  return {
    ...state,
    haltUntil: state.runtime.minutes + minutes,
    runtime: {
      ...state.runtime,
      halted: true,
      haltReason: reason,
      telemetry: { ...state.runtime.telemetry, speed: 0 },
    },
  };
}

/** Один короткий шаг: не больше SUB_STEP минут, иначе события проскакивают точки. */
function stepOnce(input: SimState, minutes: number): SimState {
  let state = input;
  if (state.runtime.finished) return state;

  const now = state.runtime.minutes + minutes;
  state = { ...state, runtime: { ...state.runtime, minutes: now } };

  /* Первый шаг — это выезд: событие открывает ленту и задаёт точку отсчёта. */
  if (state.events.length === 0) state = emit(state, "depart").state;

  /* Отложенные события: таможня, снятие с контроля, конец отдыха. */
  const due = state.queue.filter((item) => item.at <= now);
  if (due.length > 0) {
    state = { ...state, queue: state.queue.filter((item) => item.at > now) };
    for (const item of due) {
      state = emit(state, item.kind, item.kind === "customs" ? { delay: 60 } : {}).state;
    }
  }

  /* Пока стоим — только время идёт. */
  if (state.haltUntil > now) return state;
  if (state.runtime.halted) {
    state = {
      ...state,
      runtime: { ...state.runtime, halted: false, haltReason: undefined },
    };
  }

  /* Движение. Разброс скорости ±12 % — иначе цифра на панели выглядит мёртвой. */
  const drawn = nextRandom(state.rnd);
  state = { ...state, rnd: drawn.seed };
  const base = legSpeed(state.trip, state.runtime.legIndex);
  const speed = base * (0.88 + drawn.value * 0.24);
  const travelled = (speed * minutes) / 60;
  const km = Math.min(state.trip.plan.km, state.runtime.km + travelled);
  const ratio = state.trip.plan.km === 0 ? 1 : km / state.trip.plan.km;
  const at = pointAtRatio(state.path, ratio);
  const spent = (state.trip.plan.km === 0 ? 0 : travelled / state.trip.plan.km) * 100;

  state = {
    ...state,
    runtime: {
      ...state.runtime,
      km,
      point: at.point,
      heading: at.heading,
      legIndex: legIndexFor(state.trip, km),
      telemetry: {
        ...state.runtime.telemetry,
        speed,
        fuel: Math.max(0, state.runtime.telemetry.fuel - spent * 1.6),
        drivingFor: state.runtime.telemetry.drivingFor + minutes,
      },
    },
    drivenToday: state.drivenToday + minutes,
  };

  /* Прибытие. */
  if (km >= state.trip.plan.km) {
    state = emit(state, "arrive").state;
    return {
      ...state,
      runtime: {
        ...state.runtime,
        finished: true,
        halted: true,
        haltReason: "Выгрузка",
        telemetry: { ...state.runtime.telemetry, speed: 0 },
      },
    };
  }

  /* Прохождение очередной точки маршрута. */
  const nextIndex = state.reached + 1;
  const nextLeg = state.trip.plan.legs[nextIndex - 1];
  if (nextLeg !== undefined && km >= nextLeg.kmTo && nextIndex < state.trip.route.length) {
    state = { ...state, reached: nextIndex };
    const arrivedAt = place(state.trip.route[nextIndex]);
    if (arrivedAt.kind === "border") {
      state = emit(state, "border", { delay: 30 }).state;
      state = halt(state, BORDER_MIN, `Оформление: ${arrivedAt.name}`);
      state = {
        ...state,
        queue: [
          ...state.queue,
          { kind: "customs", at: state.runtime.minutes + 35 },
          { kind: "customsDone", at: state.runtime.minutes + BORDER_MIN - 10 },
        ],
      };
      return state;
    }
    state = emit(state, "checkpoint").state;
  }

  /* Режим труда и отдыха. Перерывы заложены в план, поэтому они не добавляют
     отставания: задержкой считается только то, чего в плане не было. */
  if (state.drivenToday >= DAILY_DRIVE_MIN) {
    state = emit(state, "rest").state;
    state = halt(state, DAILY_REST_MIN, "Суточный отдых");
    return {
      ...state,
      drivenToday: 0,
      runtime: {
        ...state.runtime,
        telemetry: { ...state.runtime.telemetry, drivingFor: 0 },
      },
    };
  }

  if (state.runtime.telemetry.drivingFor >= DRIVE_BLOCK_MIN) {
    state = emit(state, "rest").state;
    state = halt(state, REST_MIN, "Перерыв 45 минут");
    return {
      ...state,
      runtime: {
        ...state.runtime,
        telemetry: { ...state.runtime.telemetry, drivingFor: 0 },
      },
    };
  }

  /* Заправка по остатку бака. */
  if (state.runtime.telemetry.fuel <= FUEL_FLOOR) {
    state = emit(state, "fuel", { delay: FUEL_MIN }).state;
    state = halt(state, FUEL_MIN, "Заправка");
    return {
      ...state,
      runtime: {
        ...state.runtime,
        telemetry: { ...state.runtime.telemetry, fuel: 100 },
      },
    };
  }

  /* Превышение скорости: редкое, но не реже одного раза за длинный рейс. */
  const chance = nextRandom(state.rnd);
  state = { ...state, rnd: chance.seed };
  if (chance.value < 0.012 && now - state.lastSpeedingAt > 240) {
    const over = SPEED_LIMIT + 14 + Math.round(chance.value * 900);
    state = { ...state, lastSpeedingAt: now };
    state = emit(state, "speeding", {
      telemetry: { ...state.runtime.telemetry, speed: over },
    }).state;
  }

  return state;
}

/** Продвинуть рейс на `minutes` минут, дробя шаг так, чтобы не пропустить события. */
export function advance(state: SimState, minutes: number): SimState {
  let current = state;
  let left = minutes;
  while (left > 0 && !current.runtime.finished) {
    const slice = Math.min(SUB_STEP, left);
    current = stepOnce(current, slice);
    left -= slice;
  }
  return current;
}

/** Вброс события вручную: ведущий ломает рейс на глазах у зала. */
export function inject(state: SimState, kind: EventKind): SimState {
  if (state.runtime.finished) return state;

  switch (kind) {
    case "breakdown": {
      const next = emit(state, "breakdown", { delay: BREAKDOWN_MIN }).state;
      return halt(next, BREAKDOWN_MIN, "Поломка");
    }
    case "speeding": {
      const over = SPEED_LIMIT + 27;
      return emit(state, "speeding", {
        telemetry: { ...state.runtime.telemetry, speed: over },
      }).state;
    }
    case "stop":
      return halt(emit(state, "stop", { delay: 40 }).state, 40, "Незапланированная стоянка");
    case "coldChain":
      return emit(state, "coldChain", {
        telemetry: { ...state.runtime.telemetry, cargoTemp: -4 },
      }).state;
    case "detour":
      return emit(state, "detour", { delay: 75 }).state;
    case "shortage":
      return emit(state, "shortage").state;
    case "customs":
      return halt(emit(state, "customs", { delay: 180 }).state, 180, "Задержка декларации");
    default:
      return emit(state, kind).state;
  }
}

/** Прогресс рейса, 0..1 — им рисуется пройденная часть трека. */
export function progressOf(state: SimState): number {
  return state.trip.plan.km === 0 ? 0 : state.runtime.km / state.trip.plan.km;
}

/** Расчётное прибытие с учётом накопленной задержки, минут от выезда. */
export function etaMinutes(state: SimState): number {
  return Math.round(state.trip.plan.totalHours * 60 + state.runtime.delay);
}

export type { GeoPoint };
