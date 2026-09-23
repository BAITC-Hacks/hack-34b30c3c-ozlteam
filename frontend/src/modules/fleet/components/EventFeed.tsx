import { EmptyState } from "../../../shared/ui";
import { clock } from "../lib/format";
import type { TripEvent } from "../types";
import { eventIcon } from "./eventIcon";
import styles from "./EventFeed.module.css";

export interface EventFeedProps {
  events: TripEvent[];
  activeId?: string;
  onPick: (event: TripEvent) => void;
}

/**
 * Хронология рейса. Граница, превышение и режим отдыха лежат в одной ленте:
 * логисту важен порядок происходящего, а не из какой подсистемы пришла строка.
 */
export function EventFeed({ events, activeId, onPick }: EventFeedProps) {
  if (events.length === 0) {
    return (
      <EmptyState
        title="Событий пока нет"
        text="Запустите рейс — лента наполнится тем, что происходит в дороге."
      />
    );
  }

  return (
    <ol className={styles.feed}>
      {events.map((event) => (
        <li key={event.id}>
          <button
            type="button"
            className={`${styles.row} ${styles[event.severity]}${
              event.id === activeId ? ` ${styles.active}` : ""
            }`}
            onClick={() => onPick(event)}
            aria-current={event.id === activeId || undefined}
          >
            <span className={styles.time}>{clock(event.at)}</span>
            <span className={styles.icon} aria-hidden="true">
              {eventIcon(event.kind)}
            </span>
            <span className={styles.body}>
              <b className={styles.title}>{event.title}</b>
              <span className={styles.detail}>{event.detail}</span>
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}
