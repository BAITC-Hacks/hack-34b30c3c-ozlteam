import { useEffect, useId, useRef, useState } from "react";

import styles from "./DemandChart.module.css";

export type DemandPoint = { date: string; value: number; secondary?: number; stockout?: boolean };
type Coordinate = { x: number; y: number };

// Tangents are limited to adjacent slopes: curves pass through every observation
// without inventing peaks or dipping below the values at either end of a segment.
export function smoothPath(points: Coordinate[]): string {
  if (!points.length) return "";
  const slopes = points.slice(1).map((point, index) => (point.y - points[index].y) / (point.x - points[index].x));
  const tangents = points.map((_, index) => {
    if (index === 0) return slopes[0] ?? 0;
    if (index === points.length - 1) return slopes.at(-1) ?? 0;
    const before = slopes[index - 1], after = slopes[index];
    return before * after <= 0 ? 0 : Math.sign(before) * Math.min(Math.abs(before), Math.abs(after));
  });
  return points.reduce((path, point, index) => {
    if (!index) return `M${point.x},${point.y}`;
    const previous = points[index - 1];
    const step = (point.x - previous.x) / 3;
    return `${path} C${previous.x + step},${previous.y + step * tangents[index - 1]} ${point.x - step},${point.y - step * tangents[index]} ${point.x},${point.y}`;
  }, "");
}

function dateLabel(value: string, full = false): string {
  const monthly = value.length === 7;
  return new Date(`${value}${monthly ? "-01" : ""}T12:00:00`).toLocaleDateString("ru-RU", {
    ...(monthly ? {} : { day: "numeric" as const }), month: full ? "long" : "short",
    ...(monthly || full ? { year: "numeric" as const } : {}),
  });
}

const quantity = (value: number) => value !== 0 && Math.abs(value) < 1e-12 ? String(value) : new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 12 }).format(value);
const axisQuantity = (value: number) => new Intl.NumberFormat("ru-RU", {
  notation: value !== 0 && Math.abs(value) < .01 ? "scientific" : "compact", maximumFractionDigits: 2,
}).format(value);

export function DemandChart({ points, secondLabel, unit }: { points: DemandPoint[]; secondLabel?: string; unit: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(480);
  const [active, setActive] = useState<number | null>(null);
  const descriptionId = useId();
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const title = secondLabel ? "Факт и скорректированный спрос по месяцам" : "Прогноз спроса по дням";
  const rawLabel = secondLabel ? "Факт продаж" : "Прогноз спроса";
  const height = 224, left = 52, right = 12, top = 24, bottom = 32;
  const plotWidth = Math.max(1, width - left - right), plotHeight = height - top - bottom;
  const values = points.flatMap((point) => secondLabel ? [point.value, point.secondary ?? 0] : [point.value]);
  const minimum = Math.min(0, ...values), maximum = Math.max(0, ...values);
  const span = maximum - minimum || 1;
  const stepSize = 10 ** Math.floor(Math.log10(span / 4));
  const step = Math.ceil((span * 1.15) / 4 / stepSize) * stepSize;
  const low = Math.floor(minimum / step) * step;
  const high = Math.ceil((maximum + span * .08) / step) * step;
  const ticks = Array.from({ length: Math.round((high - low) / step) + 1 }, (_, index) => low + index * step);
  const x = (index: number) => left + (points.length === 1 ? plotWidth / 2 : index * plotWidth / (points.length - 1));
  const y = (value: number) => top + plotHeight * (high - value) / (high - low);
  const coordinates = (key: "value" | "secondary") => points.map((point, index) => ({ x: x(index), y: y(point[key] ?? 0) }));
  const primaryPath = smoothPath(coordinates("value"));
  const secondaryPath = secondLabel ? smoothPath(coordinates("secondary")) : "";
  const area = `${secondLabel ? secondaryPath : primaryPath} L${x(points.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
  const tickCount = Math.min(points.length, width < 400 ? (secondLabel ? 2 : 3) : 4);
  const dateIndices = Array.from({ length: tickCount }, (_, index) => tickCount === 1 ? 0 : Math.round(index * (points.length - 1) / (tickCount - 1)));
  const selectedIndex = active === null ? null : Math.min(active, points.length - 1);
  const selected = selectedIndex === null ? null : points[selectedIndex];

  return <div ref={container} className={styles.chart}>
    {!points.length ? <p className={styles.empty}>Данных для графика нет.</p> : <>
      <div className={styles.legend}>
        <span><i className={secondLabel ? styles.rawKey : styles.forecastKey} />{rawLabel}</span>
        {secondLabel ? <span><i className={styles.correctedKey} />{secondLabel}</span> : null}
        {points.some((point) => point.stockout) ? <span><i className={styles.stockoutKey} />Был дефицит</span> : null}
      </div>
      <div className={styles.plot} tabIndex={0} role="group" aria-label={title} aria-describedby={descriptionId}
        onFocus={() => setActive(points.length - 1)} onBlur={() => setActive(null)}
        onPointerLeave={() => setActive(null)}
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setActive(Math.max(0, Math.min(points.length - 1, Math.round((event.clientX - rect.left - left) / plotWidth * (points.length - 1)))));
        }}
        onPointerDown={(event) => {
          event.currentTarget.focus({ preventScroll: true });
          const rect = event.currentTarget.getBoundingClientRect();
          setActive(Math.max(0, Math.min(points.length - 1, Math.round((event.clientX - rect.left - left) / plotWidth * (points.length - 1)))));
        }}
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End", "Escape"].includes(event.key)) return;
          event.preventDefault();
          if (event.key === "Escape") setActive(null);
          else if (event.key === "Home") setActive(0);
          else if (event.key === "End") setActive(points.length - 1);
          else setActive((index) => Math.max(0, Math.min(points.length - 1, (index ?? points.length - 1) + (event.key === "ArrowRight" ? 1 : -1))));
        }}>
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
          <text x={0} y={12} className={styles.axisText}>{unit}</text>
          {ticks.map((tick) => <g key={tick}>
            <line x1={left} y1={y(tick)} x2={width - right} y2={y(tick)} className={tick === 0 ? styles.axis : styles.grid} />
            <text x={left - 10} y={y(tick)} dy=".35em" textAnchor="end" className={styles.axisText}>{axisQuantity(tick)}</text>
          </g>)}
          <path d={area} className={secondLabel ? styles.correctedArea : styles.forecastArea} />
          <path d={primaryPath} className={secondLabel ? styles.rawLine : styles.forecastLine} />
          {secondLabel ? <path d={secondaryPath} className={styles.correctedLine} /> : null}
          {points.map((point, index) => point.stockout ? <circle key={point.date} cx={x(index)} cy={height - bottom + 8} r={3} className={styles.stockoutDot} /> : null)}
          {dateIndices.map((index) => <text key={index} x={x(index)} y={height - 5} textAnchor={points.length === 1 ? "middle" : index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"} className={styles.axisText}>{dateLabel(points[index].date)}</text>)}
          {(selectedIndex !== null || points.length === 1) && (() => {
            const index = selectedIndex ?? 0, point = points[index];
            return <g>
              {selected ? <line x1={x(index)} y1={top} x2={x(index)} y2={height - bottom} className={styles.cursor} /> : null}
              <circle cx={x(index)} cy={y(point.value)} r={4} className={styles.rawDot} />
              {secondLabel ? <circle cx={x(index)} cy={y(point.secondary ?? 0)} r={4} className={styles.correctedDot} /> : null}
            </g>;
          })()}
        </svg>
        {selected ? <div className={`${styles.tooltip} ${selectedIndex! > (points.length - 1) / 2 ? styles.tooltipLeft : styles.tooltipRight}`} aria-live="polite">
          <strong>{dateLabel(selected.date, true)}</strong>
          <span>{rawLabel}<b>{quantity(selected.value)} {unit}</b></span>
          {secondLabel ? <span>{secondLabel}<b>{quantity(selected.secondary ?? 0)} {unit}</b></span> : null}
          {selected.stockout ? <span>Был подтверждённый дефицит</span> : null}
        </div> : null}
      </div>
      <p id={descriptionId} className={styles.hint}>Выберите точку, чтобы увидеть значения. С клавиатуры — стрелками.</p>
    </>}
  </div>;
}
