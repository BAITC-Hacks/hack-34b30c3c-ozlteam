import { StatRow } from "../../../shared/ui";
import { driver, vehicle } from "../data/fleet";
import { place } from "../data/places";
import { duration, eta, km, num, percent } from "../lib/format";
import { etaMinutes, progressOf } from "../lib/simulator";
import type { SimState } from "../lib/simulator";
import styles from "./TripSummary.module.css";
import { useI18n } from "../../../shared/i18n/I18nContext";

export interface TripSummaryProps {
  state: SimState;
}

/** Шапка выбранного рейса: цепочка точек и живые показатели машины. */
export function TripSummary({ state }: TripSummaryProps) {
  const { t } = useI18n();
  const { trip, runtime } = state;
  const passed = progressOf(state);
  const left = Math.max(0, trip.plan.km - runtime.km);
  const car = vehicle(trip.vehicleId);
  const man = driver(trip.driverId);

  return (
    <div className={styles.wrap}>
      <ol className={styles.chain}>
        {trip.route.map((id, index) => {
          const done = index <= state.reached;
          const current = index === state.reached && !runtime.finished;
          return (
            <li
              key={id}
              className={`${styles.stop}${done ? ` ${styles.done}` : ""}${
                current ? ` ${styles.current}` : ""
              }`}
            >
              <span className={styles.dot} aria-hidden="true" />
              <span className={styles.name}>{place(id).name}</span>
              {place(id).kind === "border" ? (
                <span className={styles.kind}>{t("пункт пропуска", "өткізу пункті", "border crossing")}</span>
              ) : null}
            </li>
          );
        })}
      </ol>

      <StatRow
        items={[
          {
            label: t("Пройдено", "Жүрілген", "Covered"),
            value: km(runtime.km),
            delta: percent(passed * 100),
            deltaTone: "neutral",
          },
          { label: t("Осталось", "Қалды", "Remaining"), value: km(left) },
          {
            label: t("Скорость", "Жылдамдық", "Speed"),
            value: runtime.halted ? t("стоит", "тоқтаған", "stopped") : num(runtime.telemetry.speed),
            unit: runtime.halted ? undefined : t("км/ч", "км/сағ", "km/h"),
          },
          {
            label: t("Топливо", "Жанармай", "Fuel"),
            value: percent(runtime.telemetry.fuel),
            delta: `${num((runtime.telemetry.fuel / 100) * car.tankL)} ${t("л", "л", "L")}`,
            deltaTone: runtime.telemetry.fuel < 20 ? "bad" : "neutral",
          },
          {
            label: t("Прибытие", "Келу", "Arrival"),
            value: eta(trip.departAt, etaMinutes(state)),
            delta: runtime.delay > 0 ? `+${duration(runtime.delay)}` : t("по плану", "жоспар бойынша", "on schedule"),
            deltaTone: runtime.delay > 0 ? "bad" : "good",
          },
        ]}
      />

      <p className={styles.crew}>
        {car.model} · {car.plate} · {man.name} · {t("за рулём", "рөлде", "driving for")} {duration(runtime.telemetry.drivingFor)}
        {runtime.haltReason !== undefined ? (
          <span className={styles.halt}> — {runtime.haltReason}</span>
        ) : null}
      </p>
    </div>
  );
}
