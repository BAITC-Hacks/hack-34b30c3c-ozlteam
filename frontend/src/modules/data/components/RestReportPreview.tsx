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
import {
  friendlyReportError,
  reportCellValue,
  reportFieldLabel,
  reportKindTitle,
  reportRowCount,
} from "../lib/reportPresentation";
import styles from "./RestReportPreview.module.css";

const businessColumns = [
  "name",
  "code",
  "sku",
  "product_external_id",
  "category_external_id",
  "warehouse_external_id",
  "supplier_external_id",
  "date",
  "as_of",
  "expected_date",
  "start",
  "end",
  "quantity",
  "reserved",
  "unit",
  "price",
  "rate",
  "mode",
  "min_order_qty",
  "pack_size",
  "lead_time_days",
  "review_days",
  "safety_days",
  "status",
  "active",
];

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
  const allColumns = [
    ...new Set(detail.preview.flatMap((row) => Object.keys(row))),
  ].filter((name) => name !== "kind");
  const columns = businessColumns
    .filter((name) => allColumns.includes(name))
    .slice(0, 6);
  const applied = detail.status === "applied";
  const applyError = error ? friendlyReportError(error) : null;
  return (
    <Card
      title={applied ? "Данные обновлены" : "Проверьте данные"}
      subtitle={`${reportKindTitle(detail.kind)} — ${reportRowCount(detail.row_count)}`}
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
              ? "Сохранено"
              : detail.status === "invalid"
                ? "Нужно исправить"
                : "Можно сохранить"}
          </Badge>
        </div>
        {detail.errors.length > 0 ? (
          <Alert tone="danger" title="Некоторые данные нужно исправить">
            <ul className={styles.errors}>
              {detail.errors.slice(0, 5).map((issue, index) => (
                <li key={index}>
                  {issue.row > 0 ? `Строка ${issue.row}` : "Отчёт"}
                  {issue.column
                    ? `, ${reportFieldLabel(issue.column)}`
                    : ""}: {friendlyReportError(issue.message).message}
                </li>
              ))}
            </ul>
            {detail.errors.length > 5 ? (
              <p className={styles.hint}>
                Показаны первые 5 ошибок из {detail.errors.length}. Все ошибки
                доступны в технических сведениях ниже.
              </p>
            ) : null}
          </Alert>
        ) : null}
        {detail.preview.length > 0 && columns.length > 0 ? (
          <div>
            <p className={styles.hint}>
              Пример полученных данных: {reportRowCount(detail.preview.length)}.
              Проверьте названия, даты и количество. Все колонки и связи с 1С
              доступны в технических сведениях.
            </p>
            {columns.some((column) => column.endsWith("_external_id")) ? (
              <p className={styles.hint}>
                Связанные товары, категории, склады и поставщики указаны
                идентификаторами из 1С: их названия в этом отчёте не переданы.
              </p>
            ) : null}
            <div
              className={styles.tableWrap}
              tabIndex={0}
              role="region"
              aria-label="Пример полученных данных, таблицу можно прокручивать"
            >
              <Table>
                <thead>
                  <Tr>
                    <Th>№ в примере</Th>
                    {columns.map((column) => (
                      <Th key={column}>{reportFieldLabel(column)}</Th>
                    ))}
                  </Tr>
                </thead>
                <tbody>
                  {detail.preview.map((row, index) => (
                    <Tr key={index}>
                      <Td>{index + 1}</Td>
                      {columns.map((column) => (
                        <Td key={column}>
                          {reportCellValue(row[column], column)}
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
              Рабочие данные обновятся после вашего подтверждения. Товары,
              склады и поставщики должны быть загружены до отгрузок, остатков и
              поставок.
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
              Сохранить данные
            </Button>
            {!canApply ? (
              <p className={styles.hint}>
                Для сохранения нужны права на изменение данных.
              </p>
            ) : null}
          </>
        ) : null}
        {applied ? (
          <Alert tone="success">
            Данные обновлены в сервисе. Можно перейти к следующему отчёту.
          </Alert>
        ) : null}
        <details className={styles.technical}>
          <summary>Технические сведения</summary>
          <div className={styles.stack}>
            <p className={styles.hint}>
              Номер загрузки: <code>{detail.id}</code>. Версия источника на
              момент проверки: {detail.base_revision}. Ниже — все колонки и
              исходные значения полученного примера.
            </p>
            {allColumns.length > 0 ? (
              <div
                className={styles.tableWrap}
                tabIndex={0}
                role="region"
                aria-label="Все колонки примера, таблицу можно прокручивать"
              >
                <Table>
                  <thead>
                    <Tr>
                      <Th>№ в примере</Th>
                      {allColumns.map((column) => (
                        <Th key={column}>
                          {reportFieldLabel(column)}
                          <code className={styles.fieldKey}>{column}</code>
                        </Th>
                      ))}
                    </Tr>
                  </thead>
                  <tbody>
                    {detail.preview.map((row, index) => (
                      <Tr key={index}>
                        <Td>{index + 1}</Td>
                        {allColumns.map((column) => (
                          <Td key={column}>
                            <code>
                              {row[column] == null
                                ? "—"
                                : typeof row[column] === "object"
                                  ? JSON.stringify(row[column])
                                  : String(row[column])}
                            </code>
                          </Td>
                        ))}
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            ) : null}
            {detail.errors.length > 0 ? (
              <div>
                <p className={styles.hint}>Все ошибки проверки</p>
                <ul className={styles.errors}>
                  {detail.errors.map((issue, index) => (
                    <li key={index}>
                      {issue.row > 0 ? `Строка ${issue.row}` : "Отчёт"}
                      {issue.column ? `, ${issue.column}` : ""}:{" "}
                      <code>{issue.message}</code>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </details>
      </div>
      <Modal
        id="apply-rest-report"
        title="Сохранить данные из 1С?"
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
              Ещё раз проверить
            </Button>
            <Button
              loading={busy}
              disabled={!canApply}
              onClick={() => void onApply(complete)}
            >
              Подтвердить сохранение
            </Button>
          </>
        }
      >
        <div className={styles.stack}>
          {applyError ? (
            <Alert tone="danger" title="Не удалось сохранить данные">
              {applyError.message}
              {applyError.technical ? (
                <details className={styles.technical}>
                  <summary>Подробнее для специалиста</summary>
                  <code>{applyError.technical}</code>
                </details>
              ) : null}
            </Alert>
          ) : null}
          <ActionPreview
            items={[
              `Сохранить в сервисе: ${reportKindTitle(detail.kind).toLocaleLowerCase("ru-RU")} — ${reportRowCount(detail.row_count)}`,
              "Новые записи будут добавлены, существующие — обновлены при наличии изменений",
              "Данные в самой 1С останутся без изменений",
            ]}
          />
          <Checkbox
            label="Все данные из 1С загружены"
            description="Отметьте, только если товары, склады, поставщики, отгрузки, остатки и товары в пути уже загружены и проверены. Это разрешит расчёт пополнения. Пока отметки нет, расчёт по этой базе 1С недоступен."
            checked={complete}
            onChange={(event) => setComplete(event.target.checked)}
            disabled={busy}
          />
        </div>
      </Modal>
    </Card>
  );
}
