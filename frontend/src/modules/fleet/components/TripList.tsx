import { Badge } from "../../../shared/ui";
import { client } from "../data/fleet";
import { placeName } from "../data/places";
import { km } from "../lib/format";
import { progressOf } from "../lib/simulator";
import type { SimState } from "../lib/simulator";
import type { BadgeTone } from "../../../shared/ui";
import type { Trip, TripStatus } from "../types";
import styles from "./TripList.module.css";

const STATUS: Record<TripStatus, { label: string; tone: BadgeTone }> = {
  planned: { label: "Запланирован", tone: "neutral" },
  running: { label: "В пути", tone: "info" },
  // «Стоит», а не «задержан»: отдых по режиму и оформление на границе заложены в план.
  held: { label: "Стоит", tone: "warning" },
  done: { label: "Доставлен", tone: "success" },
};

export interface TripListProps {
  trips: Trip[];
  states: Record<string, SimState>;
  selectedId: string;
  onSelect: (id: string) => void;
}

export function TripList({ trips, states, selectedId, onSelect }: TripListProps) {
  return (
    <ul className={styles.list}>
      {trips.map((trip) => {
        const state = states[trip.id];
        const done = state?.runtime.finished === true;
        // Стоянкой считается пауза в пути, а не рейс, который ещё не выехал.
        const halted =
          state !== undefined && state.runtime.halted && state.runtime.minutes > 0 && !done;
        const status = done ? STATUS.done : halted ? STATUS.held : STATUS[trip.status];
        // Доставленный рейс показываем пройденным целиком: его симуляция не запускалась.
        const progress =
          trip.status === "done" ? 100 : state === undefined ? 0 : Math.round(progressOf(state) * 100);

        return (
          <li key={trip.id}>
            <button
              type="button"
              className={`${styles.row}${trip.id === selectedId ? ` ${styles.active}` : ""}`}
              onClick={() => onSelect(trip.id)}
              aria-current={trip.id === selectedId || undefined}
            >
              <span className={styles.head}>
                <b className={styles.id}>{trip.id}</b>
                <Badge tone={status.tone}>{status.label}</Badge>
              </span>
              <span className={styles.route}>
                {placeName(trip.route[0])} → {placeName(trip.route[trip.route.length - 1])}
              </span>
              <span className={styles.meta}>
                {client(trip.clientId).name} · {km(trip.plan.km)}
              </span>
              <span
                className={styles.meter}
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Пройдено по рейсу ${trip.id}`}
              >
                <span className={styles.fill} style={{ width: `${progress}%` }} />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
