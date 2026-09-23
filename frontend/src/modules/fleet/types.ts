/**
 * Модель рейса: география, план, телематика и события на одной оси времени.
 *
 * Таможня, граница, превышение скорости, стоянка и режим труда — это не разные
 * подсистемы, а типы событий одной ленты. Когда вместо симулятора появится живой
 * трекер, он будет присылать те же `TripEvent`, и ни экран, ни разбор не изменятся.
 */

/** Точка на земле: долгота и широта в градусах, WGS 84. */
export interface GeoPoint {
  lon: number;
  lat: number;
}

export type CountryCode = "KZ" | "CN" | "UZ" | "RU" | "KG" | "TJ" | "TM";

/** Роль точки в маршруте: от неё зависит и значок, и какие события тут возможны. */
export type PlaceKind = "hub" | "border" | "city" | "port";

export interface Place {
  id: string;
  name: string;
  country: CountryCode;
  kind: PlaceKind;
  point: GeoPoint;
  /** Короткая подпись под названием: «склад», «пункт пропуска». */
  note?: string;
}

/** Участок между двумя точками: расстояние по дороге и изгиб линии на карте. */
export interface Corridor {
  from: string;
  to: string;
  /** Километры по дороге, а не по прямой. */
  km: number;
  /** Средняя скорость с учётом дороги и рельефа, км/ч. */
  speed: number;
  /** Промежуточные точки, чтобы линия шла по дороге, а не по хорде. */
  via?: GeoPoint[];
  road?: string;
}

/* ─────────────────────────── справочники ─────────────────────────── */

export type VehicleKind = "tent" | "reefer" | "container" | "tank";

export interface Vehicle {
  id: string;
  plate: string;
  model: string;
  kind: VehicleKind;
  /** Грузоподъёмность, тонн. */
  capacityT: number;
  /** Объём кузова, м³. */
  capacityM3: number;
  /** Расход, литров на 100 км. */
  consumption: number;
  tankL: number;
}

export interface Driver {
  id: string;
  name: string;
  phone: string;
  /** Класс: влияет только на подпись в карточке. */
  category: string;
  /** Часов за рулём подряд до обязательного отдыха. */
  shiftHours: number;
}

export interface Client {
  id: string;
  name: string;
  city: string;
  contact: string;
}

export type CargoClass = "general" | "food" | "fragile" | "danger" | "oversize";

export interface Cargo {
  name: string;
  class: CargoClass;
  weightT: number;
  volumeM3: number;
  pallets: number;
  /** Объявленная стоимость, ₸. */
  value: number;
  /** Нужен ли температурный режим. */
  temperature?: string;
}

/* ─────────────────────────── заказ и рейс ─────────────────────────── */

export type OrderStatus = "new" | "planned" | "running" | "done";

export interface Order {
  id: string;
  clientId: string;
  from: string;
  to: string;
  cargo: Cargo;
  /** Крайний срок доставки, ISO-дата. */
  dueAt: string;
  status: OrderStatus;
  /** Рейс, созданный по заказу. Пока его нет — заказ ждёт планирования. */
  tripId?: string;
}

export type TripStatus = "planned" | "running" | "held" | "done";

/** План рейса: считается один раз при создании и дальше служит эталоном. */
export interface RoutePlan {
  km: number;
  /** Чистое время в пути, часов, без стоянок и границы. */
  driveHours: number;
  /** Полное время с отдыхом и оформлением, часов. */
  totalHours: number;
  fuelL: number;
  /** Себестоимость, ₸: топливо, водитель, дорога, оформление. */
  cost: number;
  /** Цена клиенту, ₸. */
  price: number;
  legs: LegPlan[];
}

export interface LegPlan {
  from: string;
  to: string;
  km: number;
  hours: number;
  /** Накопленный километраж на конце участка — по нему считается позиция. */
  kmTo: number;
}

export interface Trip {
  id: string;
  orderId?: string;
  clientId: string;
  vehicleId: string;
  driverId: string;
  cargo: Cargo;
  /** Идентификаторы точек по порядку: первая — погрузка, последняя — выгрузка. */
  route: string[];
  plan: RoutePlan;
  status: TripStatus;
  /** Дата выезда, ISO. */
  departAt: string;
}

/* ─────────────────────────── телематика и события ─────────────────────────── */

export interface Telemetry {
  /** Текущая скорость, км/ч. */
  speed: number;
  /** Остаток топлива, % бака. */
  fuel: number;
  /** Минут за рулём без перерыва. */
  drivingFor: number;
  /** Температура в кузове для рефрижератора, °C. */
  cargoTemp?: number;
}

export type EventKind =
  | "depart"
  | "checkpoint"
  | "border"
  | "customs"
  | "customsDone"
  | "speeding"
  | "stop"
  | "rest"
  | "fuel"
  | "breakdown"
  | "detour"
  | "coldChain"
  | "arrive"
  | "shortage";

export type EventSeverity = "info" | "warn" | "alert";

export interface TripEvent {
  id: string;
  tripId: string;
  kind: EventKind;
  severity: EventSeverity;
  /** Минут от выезда. Единственная ось времени симуляции. */
  at: number;
  /** Километр маршрута, на котором случилось. */
  km: number;
  point: GeoPoint;
  title: string;
  detail: string;
  telemetry: Telemetry;
  /** Задержка, которую событие добавляет к прибытию, минут. */
  delay?: number;
}

/** Живое состояние рейса: то, что меняется каждый тик симуляции. */
export interface TripRuntime {
  tripId: string;
  /** Минут от выезда. */
  minutes: number;
  /** Пройдено километров. */
  km: number;
  point: GeoPoint;
  /** Курс в градусах, 0 — на север. Нужен, чтобы развернуть значок машины. */
  heading: number;
  telemetry: Telemetry;
  /** Индекс текущего участка в `plan.legs`. */
  legIndex: number;
  /** Рейс стоит: граница, оформление, отдых, поломка. */
  halted: boolean;
  /** Причина остановки для подписи на карте. */
  haltReason?: string;
  /** Накопленная задержка к плановому прибытию, минут. */
  delay: number;
  finished: boolean;
}

/* ─────────────────────────── разбор ИИ ─────────────────────────── */

export interface VerdictAction {
  label: string;
  /** Одно главное действие на разбор, остальные — тихие. */
  primary?: boolean;
}

export interface Verdict {
  eventId: string;
  title: string;
  text: string;
  /** Уверенность, 0..100 — обязательна по правилам дизайн-системы. */
  confidence: number;
  why: string;
  actions: VerdictAction[];
  /** Ответила модель или сработал заготовленный разбор. */
  source: "model" | "local";
}
