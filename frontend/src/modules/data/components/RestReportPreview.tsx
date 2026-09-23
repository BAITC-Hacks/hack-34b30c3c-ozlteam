import { useState } from "react";
import { Check } from "lucide-react";
import { useI18n } from "../../../shared/i18n/I18nContext";

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
  const { locale, t } = useI18n();
  const [confirm, setConfirm] = useState(false);
  const [complete, setComplete] = useState(false);
  const allColumns = [
    ...new Set(detail.preview.flatMap((row) => Object.keys(row))),
  ].filter((name) => name !== "kind");
  const columns = businessColumns
    .filter((name) => allColumns.includes(name))
    .slice(0, 6);
  const applied = detail.status === "applied";
  const applyError = error ? friendlyReportError(error, locale) : null;
  return (
    <Card
      title={applied ? t("Данные обновлены", "Деректер жаңартылды", "Data updated") : t("Проверьте данные", "Деректерді тексеріңіз", "Review data")}
      subtitle={`${reportKindTitle(detail.kind, locale)} — ${reportRowCount(detail.row_count, locale)}`}
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
              ? t("Сохранено", "Сақталды", "Saved")
              : detail.status === "invalid"
                ? t("Нужно исправить", "Түзету қажет", "Needs correction")
                : t("Можно сохранить", "Сақтауға болады", "Ready to save")}
          </Badge>
        </div>
        {detail.errors.length > 0 ? (
          <Alert tone="danger" title={t("Некоторые данные нужно исправить", "Кейбір деректерді түзету қажет", "Some data needs correction")}>
            <ul className={styles.errors}>
              {detail.errors.slice(0, 5).map((issue, index) => (
                <li key={index}>
                  {issue.row > 0 ? `${t("Строка", "Жол", "Row")} ${issue.row}` : t("Отчёт", "Есеп", "Report")}
                  {issue.column
                    ? `, ${reportFieldLabel(issue.column, locale)}`
                    : ""}: {friendlyReportError(issue.message, locale).message}
                </li>
              ))}
            </ul>
            {detail.errors.length > 5 ? (
              <p className={styles.hint}>
                {t("Показаны первые 5 ошибок из", "Алғашқы 5 қате көрсетілді, барлығы", "Showing the first 5 errors of")} {detail.errors.length}. {t("Все ошибки доступны в технических сведениях ниже.", "Барлық қате төмендегі техникалық мәліметтерде қолжетімді.", "All errors are available in the technical details below.")}
              </p>
            ) : null}
          </Alert>
        ) : null}
        {detail.preview.length > 0 && columns.length > 0 ? (
          <div>
            <p className={styles.hint}>
              {t("Пример полученных данных", "Алынған деректер мысалы", "Sample received data")}: {reportRowCount(detail.preview.length, locale)}. {t("Проверьте названия, даты и количество. Все колонки и связи с 1С доступны в технических сведениях.", "Атауларды, күндерді және мөлшерлерді тексеріңіз. Барлық бағандар мен 1С байланыстары техникалық мәліметтерде қолжетімді.", "Check names, dates and quantities. All columns and 1C references are in the technical details.")}
            </p>
            {columns.some((column) => column.endsWith("_external_id")) ? (
              <p className={styles.hint}>
                {t("Связанные товары, категории, склады и поставщики указаны идентификаторами из 1С: их названия в этом отчёте не переданы.", "Байланысты тауарлар, санаттар, қоймалар және жеткізушілер 1С идентификаторларымен көрсетілген: бұл есепте олардың атаулары берілмеген.", "Related products, categories, warehouses and suppliers are shown by 1C IDs; their names are not included in this report.")}
              </p>
            ) : null}
            <div
              className={styles.tableWrap}
              tabIndex={0}
              role="region"
              aria-label={t("Пример полученных данных, таблицу можно прокручивать", "Алынған деректер мысалы, кестені айналдыруға болады", "Sample received data, scrollable table")}
            >
              <Table>
                <thead>
                  <Tr>
                    <Th>{t("№ в примере", "Мысалдағы №", "Sample #")}</Th>
                    {columns.map((column) => (
                      <Th key={column}>{reportFieldLabel(column, locale)}</Th>
                    ))}
                  </Tr>
                </thead>
                <tbody>
                  {detail.preview.map((row, index) => (
                    <Tr key={index}>
                      <Td>{index + 1}</Td>
                      {columns.map((column) => (
                        <Td key={column}>
                          {reportCellValue(row[column], column, locale)}
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
              {t("Рабочие данные обновятся после вашего подтверждения. Товары, склады и поставщики должны быть загружены до отгрузок, остатков и поставок.", "Жұмыс деректері сіз растағаннан кейін жаңартылады. Тауарлар, қоймалар мен жеткізушілер жөнелтулерден, қорлардан және жеткізілімдерден бұрын жүктелуі керек.", "Working data updates after your confirmation. Import products, warehouses and suppliers before shipments, stock and deliveries.")}
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
              {t("Сохранить данные", "Деректерді сақтау", "Save data")}
            </Button>
            {!canApply ? (
              <p className={styles.hint}>
                {t("Для сохранения нужны права на изменение данных.", "Сақтау үшін деректерді өзгерту құқығы қажет.", "Saving requires permission to change data.")}
              </p>
            ) : null}
          </>
        ) : null}
        {applied ? (
          <Alert tone="success">
            {t("Данные обновлены в сервисе. Можно перейти к следующему отчёту.", "Сервистегі деректер жаңартылды. Келесі есепке өтуге болады.", "Data updated in the service. You can continue to the next report.")}
          </Alert>
        ) : null}
        <details className={styles.technical}>
          <summary>{t("Технические сведения", "Техникалық мәліметтер", "Technical details")}</summary>
          <div className={styles.stack}>
            <p className={styles.hint}>
              {t("Номер загрузки", "Жүктеме нөмірі", "Import ID")}: <code>{detail.id}</code>. {t("Версия источника на момент проверки", "Тексеру кезіндегі дереккөз нұсқасы", "Source version at check time")}: {detail.base_revision}. {t("Ниже — все колонки и исходные значения полученного примера.", "Төменде алынған мысалдың барлық бағандары мен бастапқы мәндері көрсетілген.", "All columns and original sample values are shown below.")}
            </p>
            {allColumns.length > 0 ? (
              <div
                className={styles.tableWrap}
                tabIndex={0}
                role="region"
                aria-label={t("Все колонки примера, таблицу можно прокручивать", "Мысалдың барлық бағандары, кестені айналдыруға болады", "All sample columns, scrollable table")}
              >
                <Table>
                  <thead>
                    <Tr>
                      <Th>{t("№ в примере", "Мысалдағы №", "Sample #")}</Th>
                      {allColumns.map((column) => (
                        <Th key={column}>
                          {reportFieldLabel(column, locale)}
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
                <p className={styles.hint}>{t("Все ошибки проверки", "Барлық тексеру қателері", "All validation errors")}</p>
                <ul className={styles.errors}>
                  {detail.errors.map((issue, index) => (
                    <li key={index}>
                      {issue.row > 0 ? `${t("Строка", "Жол", "Row")} ${issue.row}` : t("Отчёт", "Есеп", "Report")}
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
        title={t("Сохранить данные из 1С?", "1С деректерін сақтау керек пе?", "Save data from 1C?")}
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
              {t("Ещё раз проверить", "Қайта тексеру", "Review again")}
            </Button>
            <Button
              loading={busy}
              disabled={!canApply}
              onClick={() => void onApply(complete)}
            >
              {t("Подтвердить сохранение", "Сақтауды растау", "Confirm save")}
            </Button>
          </>
        }
      >
        <div className={styles.stack}>
          {applyError ? (
            <Alert tone="danger" title={t("Не удалось сохранить данные", "Деректерді сақтау мүмкін болмады", "Could not save data")}>
              {applyError.message}
              {applyError.technical ? (
                <details className={styles.technical}>
                  <summary>{t("Подробнее для специалиста", "Маманға арналған мәлімет", "Details for specialist")}</summary>
                  <code>{applyError.technical}</code>
                </details>
              ) : null}
            </Alert>
          ) : null}
          <ActionPreview
            items={[
              `${t("Сохранить в сервисе", "Сервисте сақтау", "Save in service")}: ${reportKindTitle(detail.kind, locale).toLocaleLowerCase(locale === "kk" ? "kk-KZ" : locale === "en" ? "en-US" : "ru-RU")} — ${reportRowCount(detail.row_count, locale)}`,
              t("Новые записи будут добавлены, существующие — обновлены при наличии изменений", "Жаңа жазбалар қосылады, бар жазбалар өзгерістер болса жаңартылады", "New records will be added; existing records will be updated if changed"),
              t("Данные в самой 1С останутся без изменений", "1С ішіндегі деректер өзгермейді", "Data in 1C will remain unchanged"),
            ]}
          />
          <Checkbox
            label={t("Все данные из 1С загружены", "1С деректерінің бәрі жүктелді", "All 1C data imported")}
            description={t("Отметьте, только если товары, склады, поставщики, отгрузки, остатки и товары в пути уже загружены и проверены. Это разрешит расчёт пополнения. Пока отметки нет, расчёт по этой базе 1С недоступен.", "Тауарлар, қоймалар, жеткізушілер, жөнелтулер, қорлар және жолдағы тауарлар жүктеліп, тексерілгенде ғана белгілеңіз. Бұл толықтыру есебіне рұқсат береді. Белгі болмаса, осы 1С базасы бойынша есептеу қолжетімсіз.", "Select only after products, warehouses, suppliers, shipments, stock and inbound goods have been imported and checked. This enables replenishment calculations. Until selected, calculations for this 1C database are unavailable.")}
            checked={complete}
            onChange={(event) => setComplete(event.target.checked)}
            disabled={busy}
          />
        </div>
      </Modal>
    </Card>
  );
}
