/**
 * Проекция Меркатора и геометрия ломаной маршрута.
 *
 * Карта своя, без тайлов и внешних библиотек: на площадке может не быть интернета,
 * а весь регион укладывается в один кадр — рендерить его дешевле, чем тянуть движок
 * карт. Меркатор выбран потому, что в нём прямая на экране читается как дорога;
 * искажение площадей на широтах 31–60° для схемы рейса значения не имеет.
 */

import type { GeoPoint } from "../types";

export interface Bounds {
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
}

/** Экранная точка в координатах viewBox. */
export interface ScreenPoint {
  x: number;
  y: number;
}

export interface Projection {
  /** Ширина viewBox; высота считается из широтного размаха, чтобы не сплющить регион. */
  width: number;
  height: number;
  project(point: GeoPoint): ScreenPoint;
  /** Обратное преобразование: нужно, чтобы понять, куда ткнул пользователь. */
  unproject(point: ScreenPoint): GeoPoint;
}

const RAD = Math.PI / 180;
/** Радиус Земли, км — для расстояний по дуге большого круга. */
const EARTH_KM = 6371;

/** Меркатор по широте: y растёт к полюсам нелинейно. */
function mercatorY(lat: number): number {
  const clamped = Math.max(-85, Math.min(85, lat));
  return Math.log(Math.tan(Math.PI / 4 + (clamped * RAD) / 2));
}

function inverseMercatorY(y: number): number {
  return (2 * Math.atan(Math.exp(y)) - Math.PI / 2) / RAD;
}

export function createProjection(bounds: Bounds, width: number): Projection {
  const left = bounds.minLon;
  const spanLon = bounds.maxLon - bounds.minLon;
  const top = mercatorY(bounds.maxLat);
  const spanY = top - mercatorY(bounds.minLat);
  const scale = width / spanLon;
  const height = spanY * scale * (180 / Math.PI);

  // Меркатор задан в радианах, а долготу мы держим в градусах: множитель 180/π
  // приводит вертикаль к тому же масштабу, иначе карта вытягивается по высоте.
  const yScale = scale * (180 / Math.PI);

  return {
    width,
    height,
    project(point) {
      return {
        x: (point.lon - left) * scale,
        y: (top - mercatorY(point.lat)) * yScale,
      };
    },
    unproject(point) {
      return {
        lon: point.x / scale + left,
        lat: inverseMercatorY(top - point.y / yScale),
      };
    },
  };
}

/** Расстояние по дуге большого круга, км. Для оценки, а не для расчёта ставки. */
export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Курс из точки в точку, градусы по часовой стрелке от севера. Разворачивает значок машины. */
export function bearing(a: GeoPoint, b: GeoPoint): number {
  const dLon = (b.lon - a.lon) * RAD;
  const lat1 = a.lat * RAD;
  const lat2 = b.lat * RAD;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}

export function lerpPoint(a: GeoPoint, b: GeoPoint, t: number): GeoPoint {
  return { lon: a.lon + (b.lon - a.lon) * t, lat: a.lat + (b.lat - a.lat) * t };
}

/** Длины звеньев ломаной и их сумма — считаем один раз и переиспользуем. */
export interface Measured {
  points: GeoPoint[];
  segments: number[];
  total: number;
}

export function measure(points: GeoPoint[]): Measured {
  const segments: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const length = distanceKm(points[i - 1], points[i]);
    segments.push(length);
    total += length;
  }
  return { points, segments, total };
}

export interface PointOnPath {
  point: GeoPoint;
  heading: number;
  /** Доля пути, 0..1. */
  t: number;
}

/**
 * Точка на ломаной по пройденному расстоянию.
 *
 * Геометрическая длина ломаной и километраж по дороге не совпадают — ломаная
 * всегда короче. Поэтому расстояние передаётся долей пути (`ratio`), а не в км:
 * так машина приходит в конечную точку ровно тогда, когда рейс закончен.
 */
export function pointAtRatio(path: Measured, ratio: number): PointOnPath {
  const t = Math.max(0, Math.min(1, ratio));
  if (path.points.length === 0) return { point: { lon: 0, lat: 0 }, heading: 0, t };
  if (path.points.length === 1 || path.total === 0) {
    return { point: path.points[0], heading: 0, t };
  }

  let left = path.total * t;
  for (let i = 0; i < path.segments.length; i += 1) {
    const length = path.segments[i];
    if (left <= length || i === path.segments.length - 1) {
      const local = length === 0 ? 0 : Math.max(0, Math.min(1, left / length));
      const a = path.points[i];
      const b = path.points[i + 1];
      return { point: lerpPoint(a, b, local), heading: bearing(a, b), t };
    }
    left -= length;
  }
  const last = path.points[path.points.length - 1];
  return { point: last, heading: 0, t };
}

/** Часть ломаной от начала до доли `ratio` — ею рисуется пройденный след. */
export function sliceUpTo(path: Measured, ratio: number): GeoPoint[] {
  const t = Math.max(0, Math.min(1, ratio));
  if (path.points.length < 2) return [...path.points];

  const target = path.total * t;
  const result: GeoPoint[] = [path.points[0]];
  let walked = 0;
  for (let i = 0; i < path.segments.length; i += 1) {
    const length = path.segments[i];
    if (walked + length >= target) {
      const local = length === 0 ? 0 : (target - walked) / length;
      result.push(lerpPoint(path.points[i], path.points[i + 1], local));
      return result;
    }
    walked += length;
    result.push(path.points[i + 1]);
  }
  return result;
}

/** Ломаная в атрибут `d`: прямые звенья, сглаживание берёт на себя `stroke-linejoin`. */
export function toPath(points: ScreenPoint[]): string {
  if (points.length === 0) return "";
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");
}

/** Замкнутый контур страны или водоёма. */
export function toPolygon(points: ScreenPoint[]): string {
  return points.length === 0 ? "" : `${toPath(points)} Z`;
}
