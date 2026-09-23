/**
 * Справочники автопарка, водителей, клиентов и заказов.
 *
 * Заказ и рейс здесь намеренно разведены: заказ приходит от клиента, рейс создаёт
 * диспетчер, и не каждый заказ доезжает до рейса. Три заказа оставлены без `tripId`
 * и в статусе `new` — на них показывают планирование, остальные уже в работе.
 *
 * Данные демонстрационные, но не случайные: номера, модели и веса подобраны так,
 * чтобы карточка на экране выдерживала взгляд человека, который возит грузы каждый день.
 */

import type { Client, Driver, Order, Vehicle } from "../types";

/* ─────────────────────────── автопарк ─────────────────────────── */

/**
 * Машины под разные классы груза: тенты под сборку и текстиль, рефрижераторы под
 * фрукты, контейнеровоз под морскую линию через Актау, цистерна под наливную химию.
 * Расход — литров на 100 км с грузом, а не паспортный: по нему считается себестоимость.
 */
export const VEHICLES: Vehicle[] = [
  { id: "veh-01", plate: "487 ABC 02", model: "Mercedes-Benz Actros 1845", kind: "tent", capacityT: 20, capacityM3: 86, consumption: 29, tankL: 700 },
  { id: "veh-02", plate: "512 KZM 05", model: "Volvo FH 460", kind: "tent", capacityT: 20, capacityM3: 92, consumption: 28, tankL: 800 },
  { id: "veh-03", plate: "903 ADT 02", model: "MAN TGX 18.480", kind: "tent", capacityT: 20, capacityM3: 86, consumption: 30, tankL: 780 },
  { id: "veh-04", plate: "178 SKB 17", model: "Shacman X3000", kind: "tent", capacityT: 20, capacityM3: 82, consumption: 34, tankL: 600 },
  { id: "veh-05", plate: "641 KZR 02", model: "Scania R 450", kind: "reefer", capacityT: 20, capacityM3: 78, consumption: 32, tankL: 700 },
  { id: "veh-06", plate: "205 MNB 05", model: "Mercedes-Benz Actros 1848", kind: "reefer", capacityT: 20, capacityM3: 76, consumption: 33, tankL: 700 },
  { id: "veh-07", plate: "396 CDE 01", model: "Howo T7H", kind: "container", capacityT: 24, capacityM3: 67, consumption: 35, tankL: 600 },
  { id: "veh-08", plate: "730 TRK 13", model: "КАМАЗ 65209", kind: "tank", capacityT: 20, capacityM3: 30, consumption: 33, tankL: 500 },
];

/* ─────────────────────────── водители ─────────────────────────── */

/**
 * Состав как в реальной алматинской компании: казахи, русские, уйгуры.
 * `shiftHours` — не украшение карточки: по нему симулятор решает, когда ставить
 * событие обязательного отдыха, поэтому смены разные, а не круглые восемь у всех.
 */
export const DRIVERS: Driver[] = [
  { id: "drv-01", name: "Ерлан Сапарбеков", phone: "+7 701 234-56-78", category: "CE", shiftHours: 9 },
  { id: "drv-02", name: "Нұрлан Абдрахманов", phone: "+7 701 345-67-89", category: "CE, ADR", shiftHours: 8 },
  { id: "drv-03", name: "Дмитрий Косенко", phone: "+7 705 456-78-90", category: "CE", shiftHours: 9 },
  { id: "drv-04", name: "Абдували Розахунов", phone: "+7 707 567-89-01", category: "CE, рефрижератор", shiftHours: 8 },
  { id: "drv-05", name: "Талгат Оспанов", phone: "+7 701 678-90-12", category: "CE", shiftHours: 9 },
  { id: "drv-06", name: "Сергей Пащенко", phone: "+7 775 789-01-23", category: "CE, негабарит", shiftHours: 8 },
  { id: "drv-07", name: "Ильхам Тохтахунов", phone: "+7 707 890-12-34", category: "CE", shiftHours: 9 },
  { id: "drv-08", name: "Айдос Жумабаев", phone: "+7 702 901-23-45", category: "CE, ADR", shiftHours: 8 },
];

/* ─────────────────────────── клиенты ─────────────────────────── */

/**
 * Грузовладельцы Казахстана и Узбекистана. `contact` — одной строкой: на карточке
 * рейса диспетчеру нужно имя и телефон, а не карточка контрагента.
 */
export const CLIENTS: Client[] = [
  { id: "cli-01", name: "ТОО «Алатау Трейд»", city: "Алматы", contact: "Айгерим Дүйсенова, +7 727 311-02-40" },
  { id: "cli-02", name: "ТОО «Казхимпром»", city: "Тараз", contact: "Виктор Лагутин, +7 726 245-11-08" },
  { id: "cli-03", name: "ТОО «Астана Строй Ресурс»", city: "Астана", contact: "Данияр Ахметов, +7 717 259-33-17" },
  { id: "cli-04", name: "ООО «Toshkent Fruit Group»", city: "Ташкент", contact: "Шухрат Хамидов, +998 71 202-14-60" },
  { id: "cli-05", name: "ТОО «Тянь-Шань Электроникс»", city: "Алматы", contact: "Ержан Калиев, +7 727 344-88-21" },
  { id: "cli-06", name: "ТОО «Текстиль Маркет KZ»", city: "Шымкент", contact: "Гүлмира Есімова, +7 725 240-56-73" },
];

/* ─────────────────────────── заказы ─────────────────────────── */

/**
 * Заказы на ближайшие две недели от 21 сентября 2026 года.
 *
 * Классы груза представлены все: от обычной сборки до наливной химии и негабарита —
 * иначе на демо не видно, что планировщик подбирает машину под груз, а не наоборот.
 * Точки — только существующие идентификаторы из `places.ts`.
 */
export const ORDERS: Order[] = [
  {
    id: "ORD-2451",
    clientId: "cli-01",
    from: "almaty",
    to: "astana",
    cargo: {
      name: "Бытовая химия и средства гигиены",
      class: "general",
      weightT: 14.6,
      volumeM3: 68,
      pallets: 22,
      value: 9_800_000,
    },
    dueAt: "2026-09-22T14:00:00+06:00",
    status: "running",
    tripId: "KZ-1183",
  },
  {
    id: "ORD-2452",
    clientId: "cli-06",
    from: "xian",
    to: "almaty",
    cargo: {
      name: "Текстиль: рулоны трикотажа",
      class: "general",
      weightT: 17.2,
      volumeM3: 84,
      pallets: 26,
      value: 21_400_000,
    },
    dueAt: "2026-09-23T18:00:00+06:00",
    status: "done",
    tripId: "KZ-1176",
  },
  {
    id: "ORD-2453",
    clientId: "cli-05",
    from: "urumqi",
    to: "almaty",
    cargo: {
      name: "Бытовая электроника: телевизоры и мониторы",
      class: "fragile",
      weightT: 9.4,
      volumeM3: 74,
      pallets: 18,
      value: 64_500_000,
    },
    dueAt: "2026-09-27T12:00:00+06:00",
    status: "planned",
    tripId: "KZ-1190",
  },
  {
    id: "ORD-2454",
    clientId: "cli-04",
    from: "tashkent",
    to: "almaty",
    cargo: {
      name: "Фрукты: виноград и гранат",
      class: "food",
      weightT: 18.0,
      volumeM3: 62,
      pallets: 20,
      value: 12_300_000,
      // Режим узкий: на нём и строится разбор события coldChain.
      temperature: "+2…+6 °C",
    },
    dueAt: "2026-09-24T08:00:00+06:00",
    status: "running",
    tripId: "KZ-1194",
  },
  {
    // Дальше — заказы без рейса: именно с них на демо начинают планирование.
    id: "ORD-2455",
    clientId: "cli-03",
    from: "moscow",
    to: "astana",
    cargo: {
      name: "Листогибочный станок в разборе",
      class: "oversize",
      weightT: 22.5,
      volumeM3: 54,
      pallets: 6,
      value: 148_000_000,
    },
    dueAt: "2026-10-03T10:00:00+06:00",
    status: "new",
  },
  {
    id: "ORD-2456",
    clientId: "cli-02",
    from: "taraz",
    to: "tashkent",
    cargo: {
      name: "Гипохлорит натрия в IBC-кубах, класс 8",
      class: "danger",
      weightT: 19.6,
      volumeM3: 26,
      pallets: 18,
      value: 7_600_000,
    },
    dueAt: "2026-09-29T09:00:00+06:00",
    status: "new",
  },
  {
    id: "ORD-2457",
    clientId: "cli-03",
    from: "shymkent",
    to: "astana",
    cargo: {
      name: "Стройматериалы: сухие смеси и плитка",
      class: "general",
      weightT: 21.0,
      volumeM3: 48,
      pallets: 24,
      value: 5_900_000,
    },
    dueAt: "2026-09-30T16:00:00+06:00",
    status: "new",
  },
];

/* ─────────────────────────── доступ по идентификатору ─────────────────────────── */

/**
 * Индексы строятся один раз при загрузке модуля: справочники не меняются в рантайме,
 * а карточка рейса дёргает их на каждый кадр симуляции.
 *
 * Неизвестный идентификатор — ошибка данных, а не пользовательский ввод: молча
 * возвращать `undefined` нельзя, иначе несуществующая машина доедет до экрана.
 */
const VEHICLE_INDEX = new Map(VEHICLES.map((item) => [item.id, item]));
const DRIVER_INDEX = new Map(DRIVERS.map((item) => [item.id, item]));
const CLIENT_INDEX = new Map(CLIENTS.map((item) => [item.id, item]));

export function vehicle(id: string): Vehicle {
  const found = VEHICLE_INDEX.get(id);
  if (found === undefined) throw new Error(`Неизвестная машина: ${id}`);
  return found;
}

export function driver(id: string): Driver {
  const found = DRIVER_INDEX.get(id);
  if (found === undefined) throw new Error(`Неизвестный водитель: ${id}`);
  return found;
}

export function client(id: string): Client {
  const found = CLIENT_INDEX.get(id);
  if (found === undefined) throw new Error(`Неизвестный клиент: ${id}`);
  return found;
}
