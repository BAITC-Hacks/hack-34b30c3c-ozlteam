import { useEffect, useMemo, useRef, useState } from "react";

import { CORRIDORS, COUNTRIES, MAP_BOUNDS, WATER } from "../data/geo";
import { PLACES } from "../data/places";
import { createProjection, sliceUpTo, toPath, toPolygon } from "../lib/projection";
import type { ScreenPoint } from "../lib/projection";
import { legPath } from "../lib/route";
import { progressOf } from "../lib/simulator";
import type { SimState } from "../lib/simulator";
import type { Trip, TripEvent } from "../types";
import styles from "./GeoMap.module.css";
import { useI18n } from "../../../shared/i18n/I18nContext";

/** Ширина системы координат карты. Всё внутри считается в этих единицах, не в пикселях. */
const WIDTH = 1000;
const projection = createProjection(MAP_BOUNDS, WIDTH);

type Box = [number, number, number, number];

const FULL: Box = [0, 0, WIDTH, projection.height];
/** Длительность перелёта камеры к рейсу, мс. */
const FLY_MS = 620;

export interface GeoMapProps {
  trips: Trip[];
  states: Record<string, SimState>;
  selectedId: string;
  /** Приблизить камеру к выбранному рейсу. */
  focused: boolean;
  /** Событие, выбранное в ленте: подсвечивается на карте. */
  activeEventId?: string;
  onSelectTrip: (id: string) => void;
  onPickEvent: (event: TripEvent) => void;
}

function project(points: { lon: number; lat: number }[]): ScreenPoint[] {
  return points.map((point) => projection.project(point));
}

/** Рамка вокруг маршрута с полями и в пропорциях полного кадра — иначе карта сплющится. */
function frameFor(points: ScreenPoint[]): Box {
  if (points.length === 0) return FULL;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const pad = Math.max(60, (maxX - minX) * 0.14, (maxY - minY) * 0.2);
  let w = maxX - minX + pad * 2;
  let h = maxY - minY + pad * 2;
  const ratio = FULL[2] / FULL[3];
  if (w / h > ratio) h = w / ratio;
  else w = h * ratio;

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return [cx - w / 2, cy - h / 2, w, h];
}

const easeOut = (t: number) => 1 - (1 - t) ** 3;

/** Плавный перелёт камеры: viewBox не анимируется средствами CSS, считаем сами. */
function useCamera(target: Box): Box {
  const [box, setBox] = useState<Box>(target);
  const from = useRef<Box>(target);
  const frame = useRef(0);

  useEffect(() => {
    const start = performance.now();
    const origin = from.current;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      from.current = target;
      setBox(target);
      return undefined;
    }

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / FLY_MS);
      const k = easeOut(t);
      const next = origin.map((value, i) => value + (target[i] - value) * k) as Box;
      from.current = next;
      setBox(next);
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [target]);

  return box;
}

/** Контуры стран и водоёмов не зависят ни от чего — считаем один раз на модуль. */
const LAND = COUNTRIES.map((country) => ({
  code: country.code,
  name: country.name,
  d: toPolygon(project(country.outline)),
  label: projection.project(country.label),
}));

const SEAS = WATER.map((water) => ({
  name: water.name,
  d: toPolygon(project(water.outline)),
  label: water.label === undefined ? undefined : projection.project(water.label),
}));

const NETWORK = CORRIDORS.map((corridor) => toPath(project(legPath(corridor.from, corridor.to))));

const PINS = PLACES.map((item) => ({ ...item, at: projection.project(item.point) }));

export function GeoMap({
  trips,
  states,
  selectedId,
  focused,
  activeEventId,
  onSelectTrip,
  onPickEvent,
}: GeoMapProps) {
  const { t } = useI18n();
  const selected = states[selectedId];

  const target = useMemo<Box>(
    () => (focused && selected !== undefined ? frameFor(project(selected.path.points)) : FULL),
    [focused, selected?.trip.id, selected?.path],
  );
  const box = useCamera(target);

  /* Толщина линий и кегль подписей заданы для полного кадра: при наезде камеры
     их надо уменьшать, иначе на приближении карта зарастает жирными штрихами. */
  const k = box[2] / WIDTH;

  const routeCountries = useMemo(() => {
    const codes = new Set<string>();
    if (selected === undefined) return codes;
    for (const id of selected.trip.route) {
      const pin = PINS.find((item) => item.id === id);
      if (pin !== undefined) codes.add(pin.country);
    }
    return codes;
  }, [selected?.trip.route]);

  const onRoute = useMemo(
    () => new Set(selected?.trip.route ?? []),
    [selected?.trip.route],
  );

  /**
   * Какие точки подписываем. Пункты пропуска стоят парами по обе стороны границы
   * (Хоргос и Нұр Жолы — 14 км), и на масштабе региона их названия печатаются
   * друг на друге. Поэтому подписи расставляются жадно: сначала важные, потом
   * остальные — и только если рядом ещё нет подписи.
   */
  const labels = useMemo(() => {
    const rank = (kind: string) => (kind === "hub" ? 0 : kind === "port" ? 1 : kind === "border" ? 2 : 3);
    const candidates = PINS.filter((pin) => pin.kind !== "city" || onRoute.has(pin.id))
      .slice()
      .sort((a, b) => rank(a.kind) - rank(b.kind) || (onRoute.has(b.id) ? 1 : 0) - (onRoute.has(a.id) ? 1 : 0));

    const taken: { x: number; y: number }[] = [];
    const chosen = new Set<string>();
    const gap = 26 * k;
    for (const pin of candidates) {
      if (taken.some((point) => Math.abs(point.x - pin.at.x) < gap * 2.4 && Math.abs(point.y - pin.at.y) < gap)) {
        continue;
      }
      taken.push(pin.at);
      chosen.add(pin.id);
    }
    return chosen;
  }, [onRoute, k]);

  return (
    <div className={styles.wrap}>
      <svg
        className={styles.canvas}
        viewBox={box.join(" ")}
        preserveAspectRatio="xMidYMid slice"
        role="img"
        aria-label={t("Карта рейсов: Китай, Казахстан, Узбекистан, Россия", "Рейстер картасы: Қытай, Қазақстан, Өзбекстан, Ресей", "Trip map: China, Kazakhstan, Uzbekistan, Russia")}
      >
        <defs>
          <filter id="trackGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation={4 * k} />
          </filter>
        </defs>

        {LAND.map((country) => (
          <path
            key={country.code}
            className={`${styles.land}${routeCountries.has(country.code) ? ` ${styles.lit}` : ""}`}
            d={country.d}
            strokeWidth={1.1 * k}
          />
        ))}

        {/* Море рисуется поверх суши: контуры стран упрощены и местами заходят в воду. */}
        {SEAS.map((sea) => (
          <path key={sea.name} className={styles.water} d={sea.d} strokeWidth={0.9 * k} />
        ))}

        {NETWORK.map((d, index) => (
          <path key={index} className={styles.road} d={d} strokeWidth={1.6 * k} />
        ))}

        {LAND.map((country) => (
          <text
            key={`${country.code}-label`}
            className={styles.country}
            x={country.label.x}
            y={country.label.y}
            fontSize={15 * k}
            textAnchor="middle"
          >
            {country.name}
          </text>
        ))}

        {/* Треки чужих рейсов — тонкой белой линией: они на карте есть, но не спорят с выбранным. */}
        {trips.map((trip) => {
          const state = states[trip.id];
          if (state === undefined || trip.id === selectedId) return null;
          if (trip.status === "planned") return null;
          return (
            <path
              key={`${trip.id}-trace`}
              className={`${styles.passed} ${styles.other}`}
              d={toPath(project(sliceUpTo(state.path, progressOf(state))))}
              strokeWidth={1.8 * k}
            />
          );
        })}

        {selected !== undefined ? (
          <>
            <path
              className={styles.ahead}
              d={toPath(project(selected.path.points))}
              strokeWidth={3 * k}
              strokeDasharray={`${7 * k} ${7 * k}`}
            />
            <path
              className={styles.glow}
              d={toPath(project(sliceUpTo(selected.path, progressOf(selected))))}
              strokeWidth={8 * k}
            />
            <path
              className={styles.passed}
              d={toPath(project(sliceUpTo(selected.path, progressOf(selected))))}
              strokeWidth={3.4 * k}
            />
          </>
        ) : null}

        {PINS.map((pin) => {
          const labelled = labels.has(pin.id);
          const radius = (pin.kind === "hub" ? 4 : pin.kind === "border" ? 3.6 : 2.6) * k;
          return (
            <g key={pin.id}>
              {pin.kind === "border" ? (
                <circle
                  className={styles.border}
                  cx={pin.at.x}
                  cy={pin.at.y}
                  r={radius + 2.4 * k}
                  strokeWidth={1.3 * k}
                />
              ) : null}
              <circle
                className={pin.kind === "hub" ? styles.hub : styles.pin}
                cx={pin.at.x}
                cy={pin.at.y}
                r={radius}
              />
              {labelled ? (
                <text
                  className={styles.label}
                  x={pin.at.x + 7 * k}
                  y={pin.at.y + 3.4 * k}
                  fontSize={11 * k}
                  strokeWidth={3 * k}
                >
                  {pin.name}
                </text>
              ) : null}
            </g>
          );
        })}

        {selected?.events.map((event) => {
          const at = projection.project(event.point);
          const tone =
            event.severity === "alert"
              ? styles.alertDot
              : event.severity === "warn"
                ? styles.warnDot
                : styles.infoDot;
          const active = event.id === activeEventId;
          return (
            <circle
              key={event.id}
              className={`${styles.mark} ${styles.markDot} ${tone}${active ? ` ${styles.markActive}` : ""}`}
              cx={at.x}
              cy={at.y}
              r={(active ? 5.4 : event.severity === "info" ? 2.8 : 4) * k}
              strokeWidth={1.4 * k}
              onClick={() => onPickEvent(event)}
            >
              <title>{event.title}</title>
            </circle>
          );
        })}

        {trips.map((trip) => {
          const state = states[trip.id];
          if (state === undefined || trip.status === "planned") return null;
          const at = projection.project(state.runtime.point);
          const idle = state.runtime.halted;
          const size = (trip.id === selectedId ? 8 : 6) * k;
          return (
            <g
              key={`${trip.id}-truck`}
              className={styles.truck}
              onClick={() => onSelectTrip(trip.id)}
              transform={`translate(${at.x} ${at.y})`}
            >
              <title>{`${trip.id} — ${idle ? (state.runtime.haltReason ?? t("стоит", "тоқтаған", "stopped")) : t("в пути", "жолда", "en route")}`}</title>
              {!idle ? <circle className={styles.halo} r={size} /> : null}
              <circle
                className={`${styles.truckBody}${idle ? ` ${styles.truckIdle}` : ""}`}
                r={size}
                strokeWidth={1.6 * k}
              />
              <path
                className={styles.truckArrow}
                transform={`rotate(${state.runtime.heading})`}
                d={`M0 ${-size * 0.52} L${size * 0.42} ${size * 0.4} L0 ${size * 0.16} L${-size * 0.42} ${size * 0.4} Z`}
              />
              {trip.id === selectedId ? (
                <text
                  className={styles.plate}
                  y={-size - 5 * k}
                  fontSize={11 * k}
                  strokeWidth={3 * k}
                  textAnchor="middle"
                >
                  {trip.id}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
