import { useState } from "react";

import {
  ActionPreview,
  AiBlock,
  Badge,
  Button,
  ConfirmModal,
  EmptyState,
  ResultNotice,
  ThinkingSteps,
} from "../../../shared/ui";
import { clock } from "../lib/format";
import type { TripEvent, Verdict, VerdictAction } from "../types";
import { eventIcon } from "./eventIcon";
import styles from "./VerdictCard.module.css";

export interface VerdictCardProps {
  event: TripEvent | undefined;
  verdict: Verdict | undefined;
  pending: boolean;
}

/**
 * Разбор события. Действие модели никогда не выполняется само: сначала человек
 * видит предпросмотр «что произойдёт», и только подтверждение что-то меняет.
 * Здесь подтверждение пока только фиксируется в интерфейсе — интеграций нет.
 */
export function VerdictCard({ event, verdict, pending }: VerdictCardProps) {
  const [confirming, setConfirming] = useState<VerdictAction | undefined>(undefined);
  const [done, setDone] = useState<string | undefined>(undefined);

  if (event === undefined) {
    return (
      <EmptyState
        title="Выберите событие"
        text="Нажмите строку в ленте или точку на карте — ассистент разберёт, что это значит."
      />
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <span className={styles.icon} aria-hidden="true">
          {eventIcon(event.kind, 16)}
        </span>
        <div className={styles.titles}>
          <b>{event.title}</b>
          <span className={styles.meta}>
            {clock(event.at)} · {event.km} км
          </span>
        </div>
        <Badge tone={event.severity === "alert" ? "danger" : event.severity === "warn" ? "warning" : "neutral"}>
          {event.severity === "alert" ? "Нарушение" : event.severity === "warn" ? "Внимание" : "Событие"}
        </Badge>
      </div>

      {pending || verdict === undefined ? (
        <ThinkingSteps
          title="Логист разбирает событие"
          steps={[
            { label: "Сверяет событие с планом рейса", status: "complete" },
            { label: "Смотрит телеметрию и документы", status: "active" },
            { label: "Готовит вывод и действия", status: "pending" },
          ]}
        />
      ) : (
        <>
          <AiBlock
            title={verdict.title}
            text={verdict.text}
            confidence={verdict.confidence}
            why={verdict.why}
            actions={verdict.actions.map((action) => (
              <Button
                key={action.label}
                variant={action.primary === true ? "primary" : "secondary"}
                size="sm"
                onClick={() => setConfirming(action)}
              >
                {action.label}
              </Button>
            ))}
          />
          <p className={styles.source}>
            {verdict.source === "model"
              ? "Ответ живой модели через /api/v1/ai/chat."
              : "Модель недоступна — показан заготовленный разбор."}
          </p>
        </>
      )}

      {done !== undefined ? <ResultNotice>{done}</ResultNotice> : null}

      <ConfirmModal
        id="fleet-action"
        title={confirming?.label ?? ""}
        open={confirming !== undefined}
        confirmLabel="Подтвердить"
        onOpenChange={(open) => {
          if (!open) setConfirming(undefined);
        }}
        onConfirm={() => {
          setDone(`${confirming?.label ?? ""} — отмечено в карточке рейса.`);
          setConfirming(undefined);
        }}
      >
        <ActionPreview
          items={[
            `Действие: ${confirming?.label ?? ""}`,
            `Событие: ${event.title}`,
            `Отметка появится в истории рейса ${event.tripId}`,
          ]}
          note="Во внешние системы стенд ничего не отправляет: это демонстрация сценария."
        />
      </ConfirmModal>
    </div>
  );
}
