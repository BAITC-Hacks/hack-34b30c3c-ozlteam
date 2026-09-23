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
import { useI18n } from "../../../shared/i18n/I18nContext";

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
  const { t } = useI18n();
  const [confirming, setConfirming] = useState<VerdictAction | undefined>(undefined);
  const [done, setDone] = useState<string | undefined>(undefined);

  if (event === undefined) {
    return (
      <EmptyState
        title={t("Выберите событие", "Оқиғаны таңдаңыз", "Select an event")}
        text={t("Нажмите строку в ленте или точку на карте — ассистент разберёт, что это значит.", "Тізімдегі жолды немесе картадағы нүктені басыңыз — ассистент оқиғаны талдайды.", "Select a row in the feed or a point on the map for the assistant to analyze.")}
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
            {clock(event.at)} · {event.km} {t("км", "км", "km")}
          </span>
        </div>
        <Badge tone={event.severity === "alert" ? "danger" : event.severity === "warn" ? "warning" : "neutral"}>
          {event.severity === "alert" ? t("Нарушение", "Ереже бұзу", "Alert") : event.severity === "warn" ? t("Внимание", "Назар аударыңыз", "Warning") : t("Событие", "Оқиға", "Event")}
        </Badge>
      </div>

      {pending || verdict === undefined ? (
        <ThinkingSteps
          title={t("Логист разбирает событие", "Логист оқиғаны талдап жатыр", "Logistics assistant is analyzing the event")}
          steps={[
            { label: t("Сверяет событие с планом рейса", "Оқиғаны рейс жоспарымен салыстыруда", "Checking against the trip plan"), status: "complete" },
            { label: t("Смотрит телеметрию и документы", "Телеметрия мен құжаттарды қарап жатыр", "Reviewing telemetry and documents"), status: "active" },
            { label: t("Готовит вывод и действия", "Қорытынды мен әрекеттерді дайындауда", "Preparing conclusions and actions"), status: "pending" },
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
              ? t("Ответ живой модели через /api/v1/ai/chat.", "Модель жауабы /api/v1/ai/chat арқылы алынды.", "Live model response via /api/v1/ai/chat.")
              : t("Модель недоступна — показан заготовленный разбор.", "Модель қолжетімсіз — дайын талдау көрсетілді.", "Model unavailable; showing a prepared analysis.")}
          </p>
        </>
      )}

      {done !== undefined ? <ResultNotice>{done}</ResultNotice> : null}

      <ConfirmModal
        id="fleet-action"
        title={confirming?.label ?? ""}
        open={confirming !== undefined}
        confirmLabel={t("Подтвердить", "Растау", "Confirm")}
        onOpenChange={(open) => {
          if (!open) setConfirming(undefined);
        }}
        onConfirm={() => {
          setDone(t(`${confirming?.label ?? ""} — отмечено в карточке рейса.`, `${confirming?.label ?? ""} — рейс карточкасында белгіленді.`, `${confirming?.label ?? ""} — noted on the trip card.`));
          setConfirming(undefined);
        }}
      >
        <ActionPreview
          items={[
            `${t("Действие", "Әрекет", "Action")}: ${confirming?.label ?? ""}`,
            `${t("Событие", "Оқиға", "Event")}: ${event.title}`,
            t(`Отметка появится в истории рейса ${event.tripId}`, `Белгі ${event.tripId} рейсінің тарихында пайда болады`, `The note will appear in trip ${event.tripId} history`),
          ]}
          note={t("Во внешние системы стенд ничего не отправляет: это демонстрация сценария.", "Демо сыртқы жүйелерге ештеңе жібермейді: бұл тек сценарий көрсетілімі.", "This demo sends nothing to external systems; it only demonstrates the workflow.")}
        />
      </ConfirmModal>
    </div>
  );
}
