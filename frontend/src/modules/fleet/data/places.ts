/**
 * Точки маршрутной сети: города, склады, пункты пропуска, порт.
 *
 * Общий справочник для карты, планировщика и симулятора. Координаты — WGS 84,
 * с точностью до сотых градуса: этого хватает, чтобы город встал на своё место
 * на карте региона, и не создаёт иллюзии геодезической точности.
 */

import type { Place } from "../types";

export const PLACES: Place[] = [
  /* ─── Казахстан ─── */
  { id: "almaty", name: "Алматы", country: "KZ", kind: "hub", point: { lon: 76.89, lat: 43.24 }, note: "склад А1" },
  { id: "astana", name: "Астана", country: "KZ", kind: "hub", point: { lon: 71.43, lat: 51.13 }, note: "склад С2" },
  { id: "shymkent", name: "Шымкент", country: "KZ", kind: "hub", point: { lon: 69.60, lat: 42.32 }, note: "склад Ш1" },
  { id: "karaganda", name: "Караганда", country: "KZ", kind: "city", point: { lon: 73.10, lat: 49.81 } },
  { id: "taraz", name: "Тараз", country: "KZ", kind: "city", point: { lon: 71.37, lat: 42.90 } },
  { id: "kyzylorda", name: "Кызылорда", country: "KZ", kind: "city", point: { lon: 65.51, lat: 44.85 } },
  { id: "aktobe", name: "Актобе", country: "KZ", kind: "city", point: { lon: 57.17, lat: 50.28 } },
  { id: "atyrau", name: "Атырау", country: "KZ", kind: "city", point: { lon: 51.92, lat: 47.09 } },
  { id: "aktau", name: "Актау", country: "KZ", kind: "port", point: { lon: 51.16, lat: 43.64 }, note: "порт" },
  { id: "balkhash", name: "Балхаш", country: "KZ", kind: "city", point: { lon: 74.98, lat: 46.84 } },
  { id: "khorgos", name: "Нұр Жолы", country: "KZ", kind: "border", point: { lon: 80.28, lat: 44.22 }, note: "пункт пропуска" },
  { id: "zhaisan", name: "Жайсан", country: "KZ", kind: "border", point: { lon: 60.62, lat: 50.79 }, note: "пункт пропуска" },
  { id: "zhibek", name: "Жібек Жолы", country: "KZ", kind: "border", point: { lon: 69.21, lat: 41.48 }, note: "пункт пропуска" },

  /* ─── Китай ─── */
  { id: "khorgos-cn", name: "Хоргос", country: "CN", kind: "border", point: { lon: 80.42, lat: 44.20 }, note: "пункт пропуска" },
  { id: "urumqi", name: "Урумчи", country: "CN", kind: "hub", point: { lon: 87.62, lat: 43.83 }, note: "консолидация" },
  { id: "kashgar", name: "Кашгар", country: "CN", kind: "city", point: { lon: 75.99, lat: 39.47 } },
  { id: "alashankou", name: "Алашанькоу", country: "CN", kind: "border", point: { lon: 82.57, lat: 45.17 }, note: "ж/д переход" },
  { id: "lanzhou", name: "Ланьчжоу", country: "CN", kind: "city", point: { lon: 103.83, lat: 36.06 } },
  { id: "xian", name: "Сиань", country: "CN", kind: "hub", point: { lon: 108.94, lat: 34.34 }, note: "отправитель" },

  /* ─── Узбекистан ─── */
  { id: "tashkent", name: "Ташкент", country: "UZ", kind: "hub", point: { lon: 69.24, lat: 41.30 }, note: "склад Т1" },
  { id: "samarkand", name: "Самарканд", country: "UZ", kind: "city", point: { lon: 66.96, lat: 39.65 } },
  { id: "navoi", name: "Навои", country: "UZ", kind: "city", point: { lon: 65.37, lat: 40.10 } },
  { id: "bukhara", name: "Бухара", country: "UZ", kind: "city", point: { lon: 64.42, lat: 39.77 } },

  /* ─── Россия ─── */
  { id: "orenburg", name: "Оренбург", country: "RU", kind: "city", point: { lon: 55.10, lat: 51.77 } },
  { id: "samara", name: "Самара", country: "RU", kind: "city", point: { lon: 50.15, lat: 53.20 } },
  { id: "moscow", name: "Москва", country: "RU", kind: "hub", point: { lon: 37.62, lat: 55.75 }, note: "склад М4" },
  { id: "chelyabinsk", name: "Челябинск", country: "RU", kind: "city", point: { lon: 61.40, lat: 55.16 } },
  { id: "omsk", name: "Омск", country: "RU", kind: "city", point: { lon: 73.37, lat: 54.99 } },
  { id: "novosibirsk", name: "Новосибирск", country: "RU", kind: "hub", point: { lon: 82.92, lat: 55.03 }, note: "склад Н1" },

  /* ─── Киргизия ─── */
  { id: "bishkek", name: "Бишкек", country: "KG", kind: "city", point: { lon: 74.59, lat: 42.87 } },
];

/** Точка по идентификатору. Неизвестный id — ошибка данных, не пользовательский ввод. */
const INDEX = new Map(PLACES.map((place) => [place.id, place]));

export function place(id: string): Place {
  const found = INDEX.get(id);
  if (found === undefined) throw new Error(`Неизвестная точка маршрута: ${id}`);
  return found;
}

export function placeName(id: string): string {
  return INDEX.get(id)?.name ?? id;
}
