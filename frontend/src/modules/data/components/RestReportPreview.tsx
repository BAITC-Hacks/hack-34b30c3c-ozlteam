import { useState } from "react";
import { Check } from "lucide-react";

import {
  ActionPreview,
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Modal,
  Table,
  Td,
  Th,
  Tr,
} from "../../../shared/ui";
import type { ImportDetail } from "../types";
import styles from "./RestReports.module.css";

export function RestReportPreview({
  detail,
  canApply,
  busy,
  error,
  onApply,
}: {
  detail: ImportDetail;
  canApply: boolean;
  busy: boolean;
  error: string | null;
  onApply: (complete: boolean) => Promise<void>;
}) {
  const [confirm, setConfirm] = useState(false);
  const [complete, setComplete] = useState(false);
  const columns = [
    ...new Set(detail.preview.flatMap((row) => Object.keys(row))),
  ].filter((name) => name !== "kind");
  const applied = detail.status === "applied";
  return (
    <Card
      title="Проверка полученных данных"
      subtitle={`${detail.row_count} строк · версия источника ${detail.base_revision}`}
    >
      <div className={styles.stack}>
        <div>
          <Badge
            tone={
              applied
                ? "success"
                : detail.status === "invalid"
                  ? "danger"
                  : "warning"
            }
          >
            {applied
              ? "Применено"
              : detail.status === "invalid"
                ? "Нужно исправить"
                : "Готово к применению"}
          </Badge>
        </div>
        {detail.errors.length > 0 ? (
          <Alert tone="danger" title={`Ошибки: ${detail.errors.length}`}>
            <ul className={styles.errors}>
              {detail.errors.slice(0, 20).map((issue, index) => (
                <li key={index}>
                  Строка {issue.row}
                  {issue.column ? `, ${issue.column}` : ""}:{" "}
                  {issue.message === "Field required"
                    ? "Отсутствует обязательное значение. Проверьте сопоставление."
                    : issue.message}
                </li>
              ))}
            </ul>
            {detail.errors.length > 20 ? (
              <p>
                Показаны первые 20 ошибок. Полный результат сохранён в истории
                загрузок.
              </p>
            ) : null}
          </Alert>
        ) : null}
        {detail.preview.length > 0 ? (
          <div>
            <p className={styles.hint}>
              Первые {detail.preview.length} строк после сопоставления.
              Проверьте идентификаторы, даты, единицы и знак количества.
            </p>
            <div
              className={styles.tableWrap}
              tabIndex={0}
              aria-label="Нормализованные строки"
            >
              <Table>
                <thead>
                  <Tr>
                    {columns.map((column) => (
                      <Th key={column}>{column}</Th>
                    ))}
                  </Tr>
                </thead>
                <tbody>
                  {detail.preview.map((row, index) => (
                    <Tr key={index}>
                      {columns.map((column) => (
                        <Td key={column}>
                          {row[column] == null
                            ? "—"
                            : typeof row[column] === "object"
                              ? JSON.stringify(row[column])
                              : String(row[column])}
                        </Td>
                      ))}
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </div>
        ) : null}
        {detail.status === "validated" ? (
          <>
            <p className={styles.hint}>
              Проверка сохранила промежуточный набор. Рабочие данные изменятся
              после применения. Сначала примените справочники, затем отгрузки,
              остатки и поставки.
            </p>
            <Button
              variant="dark"
              icon={<Check size={16} strokeWidth={1.8} />}
              disabled={!canApply || busy}
              onClick={() => {
                setComplete(false);
                setConfirm(true);
              }}
            >
              Применить данные
            </Button>
          </>
        ) : null}
        {applied ? (
          <Alert tone="success">
            Данные записаны в PostgreSQL. Состояние полноты обновлено у
            источника.
          </Alert>
        ) : null}
      </div>
      <Modal
        id="apply-rest-report"
        title="Применить данные отчёта"
        open={confirm && !applied}
        onOpenChange={(open) => {
          if (!busy) setConfirm(open);
        }}
        closeOnBackdrop={!busy}
        closeOnEscape={!busy}
        showClose={!busy}
        footer={
          <>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setConfirm(false)}
            >
              Вернуться
            </Button>
            <Button loading={busy} onClick={() => void onApply(complete)}>
              Применить {detail.row_count} строк
            </Button>
          </>
        }
      >
        <div className={styles.stack}>
          {error ? (
            <Alert tone="danger" title="Данные не применены">
              {error}
            </Alert>
          ) : null}
          <ActionPreview
            items={[
              "Проверенные записи обновят справочники и факты в нашей базе",
              "Версия источника изменится",
            ]}
          />
          <Checkbox
            label="Это последняя согласованная часть выгрузки"
            description="Разрешить расчёт по источнику. Отметьте только когда справочники, отгрузки, остатки и товары в пути загружены и согласованы. Без отметки расчёт по этому источнику будет заблокирован."
            checked={complete}
            onChange={(event) => setComplete(event.target.checked)}
            disabled={busy}
          />
        </div>
      </Modal>
    </Card>
  );
}
