import { ArrowLeft, ArrowRight, Download, Settings2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ApiError } from "../../../shared/api/client";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Field,
  ProgressSteps,
  Select,
} from "../../../shared/ui";
import { applyImport } from "../api/data";
import { previewReport, saveReport } from "../api/reports";
import type {
  ReportField,
  ReportInput,
  ReportKind,
  RestReport,
} from "../api/reports";
import type { ImportDetail } from "../types";
import {
  friendlyReportError,
  reportFieldLabel,
  reportKindDescription,
  reportKindTitle,
} from "../lib/reportPresentation";
import { RestReportPreview } from "./RestReportPreview";
import styles from "./RestReports.module.css";
import skeleton from "../pages/DataSourcesPage.module.css";
import editor from "./RestReportEditor.module.css";
import { useI18n, translate, type Locale } from "../../../shared/i18n/I18nContext";

export function reportError(error: unknown, locale: Locale = "ru"): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return translate(locale, "У вашей роли нет права на это действие.", "Сіздің рөліңізге бұл әрекетке рұқсат жоқ.", "Your role cannot perform this action.");
    if (error.status === 409)
      return translate(locale, "Версия источника изменилась или запись конфликтует с существующей. Получите отчёт заново и проверьте версии записей.", "Дереккөз нұсқасы өзгерді немесе жазба басқа жазбамен қайшы келеді. Есепті қайта алып, жазбалардың нұсқасын тексеріңіз.", "The source version changed or a record conflicts with an existing one. Fetch the report again and check record versions.");
  }
  return error instanceof Error
    ? error.message
    : translate(locale, "Не удалось выполнить действие. Попробуйте ещё раз.", "Әрекетті орындау мүмкін болмады. Қайталап көріңіз.", "Could not complete the action. Please try again.");
}

function initialMapping(
  profile: RestReport | undefined,
  kind: ReportKind,
): Record<string, string> {
  if (profile && Object.keys(profile.column_mapping).length > 0)
    return Object.fromEntries(
      Object.entries(profile.column_mapping).map(([source, target]) => [
        target,
        source,
      ]),
    );
  return Object.fromEntries(
    kind.fields
      .filter((field) => field.required)
      .map((field) => [field.name, field.name]),
  );
}

function MappingFields({
  fields,
  mapping,
  disabled,
  onChange,
}: {
  fields: ReportField[];
  mapping: Record<string, string>;
  disabled: boolean;
  onChange: (name: string, value: string) => void;
}) {
  const { locale, t } = useI18n();
  return (
    <div className={editor.mapping}>
      {fields.map((field) => (
        <div className={editor.mappingRow} key={field.name}>
          <div className={editor.mappingLabel}>
            <strong>{reportFieldLabel(field.name, locale)}</strong>
            <code>
              {field.name}
              {field.required ? ` · ${t("обязательно", "міндетті", "required")}` : ""}
            </code>
          </div>
          <Field
            label={t("Название поля в 1С", "1С жүйесіндегі өріс атауы", "Field name in 1C")}
            aria-label={`${t("Поле 1С для", "1С өрісі", "1C field for")} «${reportFieldLabel(field.name, locale)}»`}
            value={mapping[field.name] ?? ""}
            placeholder={field.name}
            disabled={disabled}
            onChange={(event) => onChange(field.name, event.target.value)}
          />
        </div>
      ))}
    </div>
  );
}

export function RestReportEditor({
  sourceId,
  profile,
  kinds,
  defaultKind,
  canWrite,
  canPreview,
  canApply,
  onSaved,
  onApplied,
  onBusy,
}: {
  sourceId: string;
  profile?: RestReport;
  kinds: ReportKind[];
  canWrite: boolean;
  canPreview: boolean;
  canApply: boolean;
  defaultKind?: string | null;
  onSaved: (report: RestReport) => void;
  onApplied: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const { locale, t } = useI18n();
  const firstKind =
    kinds.find((item) => item.kind === (profile?.kind ?? defaultKind)) ??
    kinds[0];
  const [form, setForm] = useState<ReportInput>(
    profile ?? {
      name: reportKindTitle(firstKind.kind, locale),
      kind: firstKind.kind,
      url: "",
      items_path: "value",
      column_mapping: {},
      quantity_multiplier: 1,
      auth_env: null,
    },
  );
  const [mapping, setMapping] = useState(() =>
    initialMapping(profile, firstKind),
  );
  const [passthrough, setPassthrough] = useState(
    Boolean(profile && Object.keys(profile.column_mapping).length === 0),
  );
  const [dirty, setDirty] = useState(!profile);
  const [step, setStep] = useState(profile ? 2 : 0);
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState<"save" | "preview" | "apply" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<ImportDetail | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const kind = kinds.find((item) => item.kind === form.kind) ?? firstKind;
  const required = kind.fields.filter((field) => field.required);
  const optional = kind.fields.filter((field) => !field.required);
  const pairs = Object.entries(mapping)
    .map(([target, source]) => [source.trim(), target])
    .filter(([source]) => source);
  const duplicatePaths =
    new Set(pairs.map(([source]) => source)).size !== pairs.length;
  const missing = required.filter((field) => !mapping[field.name]?.trim());
  const disabled = !canWrite || busy !== null;
  const displayError = error ? friendlyReportError(error, locale) : null;

  function chooseKind(nextKind: ReportKind) {
    if (nextKind.kind === form.kind) return;
    change({
      kind: nextKind.kind,
      name:
        form.name === reportKindTitle(form.kind, locale)
          ? reportKindTitle(nextKind.kind, locale)
          : form.name,
      quantity_multiplier: 1,
    });
    setMapping(initialMapping(undefined, nextKind));
  }

  function change(changes: Partial<ReportInput>) {
    setForm((current) => ({ ...current, ...changes }));
    setDirty(true);
    setDetail(null);
    setError(null);
  }
  function changeMapping(name: string, value: string) {
    setMapping((current) => ({ ...current, [name]: value }));
    setDirty(true);
    setDetail(null);
    setError(null);
  }
  function pending(value: typeof busy) {
    setBusy(value);
    onBusy(value !== null);
  }

  async function save() {
    if (
      !canWrite ||
      busy ||
      (!passthrough && (missing.length || duplicatePaths))
    )
      return;
    pending("save");
    setError(null);
    try {
      const saved = await saveReport(sourceId, profile?.id, {
        name: form.name.trim(),
        kind: form.kind,
        url: form.url.trim(),
        items_path: form.items_path.trim(),
        quantity_multiplier: form.quantity_multiplier,
        auth_env: form.auth_env?.trim() || null,
        column_mapping: passthrough ? {} : Object.fromEntries(pairs),
      });
      if (!mounted.current) return;
      setDirty(false);
      setStep(2);
      onSaved(saved);
    } catch (caught) {
      if (mounted.current) setError(reportError(caught, locale));
    } finally {
      if (mounted.current) pending(null);
    }
  }

  async function preview() {
    if (!profile || dirty || busy || !canPreview) return;
    pending("preview");
    setError(null);
    try {
      const result = await previewReport(profile.id);
      if (mounted.current) setDetail(result);
    } catch (caught) {
      if (mounted.current) setError(reportError(caught, locale));
    } finally {
      if (mounted.current) pending(null);
    }
  }

  async function apply(complete: boolean) {
    if (!detail || busy || !canApply) return;
    pending("apply");
    setError(null);
    try {
      const result = await applyImport(detail.id, complete);
      if (mounted.current) {
        setDetail(result);
        onApplied();
      }
    } catch (caught) {
      if (mounted.current) setError(reportError(caught, locale));
    } finally {
      if (mounted.current) pending(null);
    }
  }

  return (
    <div className={styles.stack}>
      <Card
        title={
          step === 0
            ? t("Какие данные загрузим?", "Қандай деректерді жүктейміз?", "Which data should we load?")
            : step === 1
              ? t("Подключение отчёта", "Есепті қосу", "Connect report")
              : form.name
        }
        subtitle={
          step === 0
            ? t("Выберите, что хотите получать из 1С.", "1С жүйесінен қандай деректерді алатыныңызды таңдаңыз.", "Choose what to receive from 1C.")
            : step === 1
              ? t("Сохраните ссылку один раз — затем отчёт можно будет обновлять одной кнопкой.", "Сілтемені бір рет сақтаңыз — содан кейін есепті бір батырмамен жаңарта аласыз.", "Save the link once, then refresh the report with one button.")
              : reportKindTitle(form.kind, locale)
        }
      >
        <div className={styles.stack}>
          <ProgressSteps
            label={t("Подключение отчёта", "Есепті қосу", "Connect report")}
            steps={[t("Данные", "Деректер", "Data"), t("Подключение", "Қосу", "Connection"), t("Проверка", "Тексеру", "Review")]}
            current={step}
          />
          {displayError ? (
            <Alert tone="danger" title={displayError.title}>
              {displayError.message}
              {displayError.technical ? (
                <details className={styles.optional}>
                  <summary>{t("Подробности для специалиста", "Маманға арналған мәліметтер", "Details for a specialist")}</summary>
                  <p className={editor.technical}>{displayError.technical}</p>
                </details>
              ) : null}
            </Alert>
          ) : null}
          {step === 0 ? (
            <>
              <fieldset className={editor.kindChoices} disabled={disabled}>
                <legend className={editor.legend}>{t("Вид данных", "Дерек түрі", "Data type")}</legend>
                {kinds.map((item) => (
                  <label className={editor.kindChoice} key={item.kind}>
                    <input
                      type="radio"
                      name="report-kind"
                      value={item.kind}
                      checked={form.kind === item.kind}
                      onChange={() => chooseKind(item)}
                    />
                    <span>
                      <strong>{reportKindTitle(item.kind, locale)}</strong>
                      <small>{reportKindDescription(item.kind, locale)}</small>
                    </span>
                  </label>
                ))}
              </fieldset>
              <div className={styles.actions}>
                <Button
                  variant="dark"
                  disabled={!canWrite}
                  onClick={() => setStep(1)}
                  icon={<ArrowRight size={16} strokeWidth={1.8} />}
                >
                  {t("Продолжить", "Жалғастыру", "Continue")}
                </Button>
              </div>
            </>
          ) : null}
          {step === 1 ? (
            <form
              className={styles.stack}
              onInvalidCapture={() => setAdvanced(true)}
              onSubmit={(event) => {
                event.preventDefault();
                if (dirty) void save();
                else setStep(2);
              }}
            >
              <div className={editor.chosenKind}>
                <div>
                  <strong>{reportKindTitle(form.kind, locale)}</strong>
                  <p className={styles.hint}>
                    {reportKindDescription(form.kind, locale)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  onClick={() => setStep(0)}
                >
                  {t("Изменить", "Өзгерту", "Change")}
                </Button>
              </div>
              <Field
                label={t("Название отчёта", "Есеп атауы", "Report name")}
                value={form.name}
                maxLength={200}
                required
                disabled={disabled}
                placeholder={t("Например, отгрузки за сентябрь", "Мысалы, қыркүйектегі жөнелтілімдер", "For example, September shipments")}
                onChange={(event) => change({ name: event.target.value })}
              />
              <Field
                label={t("Ссылка на отчёт в 1С", "1С есебінің сілтемесі", "Link to report in 1C")}
                type="url"
                pattern="https?://.*"
                value={form.url}
                required
                maxLength={2048}
                disabled={disabled}
                placeholder="https://1c.example.kz/base/hs/reports/sales"
                hint={t("Попросите специалиста 1С дать ссылку для получения этого отчёта и настроить доступ. Пароль в ссылку добавлять не нужно.", "1С маманынан осы есепке сілтеме мен қолжетімділікті орнатуды сұраңыз. Құпиясөзді сілтемеге қоспаңыз.", "Ask your 1C specialist for the report link and access setup. Do not include a password in the link.")}
                onChange={(event) => change({ url: event.target.value })}
              />
              <details
                className={editor.advanced}
                open={advanced}
                onToggle={(event) => setAdvanced(event.currentTarget.open)}
              >
                <summary>{t("Дополнительные настройки", "Қосымша баптаулар", "Advanced settings")}</summary>
                <div className={styles.stack}>
                  <p className={styles.hint}>
                    {t("Если формат отчёта отличается, настройте его со специалистом 1С. Для сопоставления понадобится пример ответа со списком полей.", "Есеп пішімі өзгеше болса, оны 1С маманымен баптаңыз. Сәйкестендіру үшін өрістер тізімі бар жауап үлгісі қажет.", "If the report format differs, configure it with your 1C specialist. You will need a sample response with a list of fields for mapping.")}
                  </p>
                  <div className={styles.formGrid}>
                    <Field
                      label={t("Где находится список строк", "Жолдар тізімі қайда орналасқан", "Where the row list is located")}
                      maxLength={200}
                      value={form.items_path}
                      disabled={disabled}
                      placeholder="value"
                      hint={t("Путь в ответе JSON: например value или data.rows. Оставьте пустым, если ответ сразу содержит список.", "JSON жауабындағы жол: мысалы, value немесе data.rows. Жауап бірден тізім болса, бос қалдырыңыз.", "Path in the JSON response, such as value or data.rows. Leave blank if the response is already a list.")}
                      onChange={(event) =>
                        change({ items_path: event.target.value })
                      }
                    />
                    <Field
                      label={t("Настройка доступа на сервере", "Сервердегі қолжетімділік баптауы", "Server access setting")}
                      maxLength={100}
                      value={form.auth_env ?? ""}
                      disabled={disabled}
                      placeholder="ONEC_AUTH_MAIN"
                      pattern="ONEC_AUTH_[A-Z0-9_]+"
                      hint={t("Необязательно. Администратор сообщит имя настройки. Сам пароль или токен сюда не вводится.", "Міндетті емес. Баптау атауын әкімші береді. Құпиясөзді немесе токенді мұнда енгізбеңіз.", "Optional. Your administrator will provide the setting name. Do not enter the password or token here.")}
                      onChange={(event) =>
                        change({ auth_env: event.target.value })
                      }
                    />
                  </div>
                  <div className={styles.mappingHead}>
                    <div>
                      <h4>{t("Соответствие полей", "Өрістерді сәйкестендіру", "Field mapping")}</h4>
                      <p>
                        {t("Для каждого значения укажите название поля из ответа 1С. Например, «Название» может приходить в поле Наименование.", "Әр мән үшін 1С жауабындағы өріс атауын көрсетіңіз. Мысалы, «Атауы» Наименование өрісінде болуы мүмкін.", "For each value, enter the field name from the 1C response. For example, Name may come from the Наименование field.")}
                      </p>
                    </div>
                  </div>
                  <Checkbox
                    label={t("Названия полей уже совпадают", "Өріс атаулары әлдеқашан сәйкес", "Field names already match")}
                    description={t("Использовать ответ без переименования. При проверке покажем недостающие и лишние поля.", "Жауапты өріс атауларын өзгертпей пайдалану. Тексергенде жетіспейтін және артық өрістер көрсетіледі.", "Use the response without renaming fields. Review will show missing and extra fields.")}
                    checked={passthrough}
                    disabled={disabled}
                    onChange={(event) => {
                      setPassthrough(event.target.checked);
                      change({});
                    }}
                  />
                  {!passthrough ? (
                    <>
                      <MappingFields
                        fields={required}
                        mapping={mapping}
                        disabled={disabled}
                        onChange={changeMapping}
                      />
                      {optional.length > 0 ? (
                        <details className={styles.optional}>
                          <summary>
                            {t("Дополнительные поля", "Қосымша өрістер", "Optional fields")} ({optional.length})
                          </summary>
                          <div className={styles.stack}>
                            <p className={styles.hint}>
                              {t("Пустое поле не загружается. Если название указано, значение должно быть в каждой строке. Для вложенного поля используйте точку: например Номенклатура.Код.", "Бос өріс жүктелмейді. Атауы көрсетілсе, мән әр жолда болуы керек. Кірістірілген өріс үшін нүкте қолданыңыз: мысалы, Номенклатура.Код.", "An empty field is not imported. If named, a value must be present in every row. Use a dot for nested fields, such as Номенклатура.Код.")}
                            </p>
                            <MappingFields
                              fields={optional}
                              mapping={mapping}
                              disabled={disabled}
                              onChange={changeMapping}
                            />
                          </div>
                        </details>
                      ) : null}
                    </>
                  ) : (
                    <p className={styles.hint}>
                      {t("Обязательные поля", "Міндетті өрістер", "Required fields")}:{" "}
                      {required.map((field) => field.name).join(", ")}.
                    </p>
                  )}
                  <p className={styles.hint}>
                    {t("Идентификаторы и версии записей берём из 1С. Код и артикул не заменяют идентификатор. Ссылки на товары и склады должны совпадать с ранее загруженными справочниками.", "Жазба идентификаторлары мен нұсқаларын 1С жүйесінен аламыз. Код пен артикул идентификатордың орнын баспайды. Тауар мен қойма сілтемелері бұрын жүктелген анықтамалықтарға сәйкес болуы керек.", "Record IDs and versions come from 1C. Code and SKU do not replace an ID. Product and warehouse references must match previously imported directories.")}
                  </p>
                  {form.kind === "growth" ? (
                    <p className={styles.hint}>
                      {t("В дополнительных полях укажите либо товар (product_external_id), либо категорию (category_external_id). Значение rate = 0.1 означает рост на 10%.", "Қосымша өрістерде тауарды (product_external_id) немесе санатты (category_external_id) көрсетіңіз. rate = 0.1 мәні 10% өсімді білдіреді.", "In optional fields, specify either a product (product_external_id) or category (category_external_id). rate = 0.1 means 10% growth.")}
                    </p>
                  ) : null}
                  {form.kind === "products" ? (
                    <p className={styles.hint}>
                      {t("Минимум заказа (min_order_qty) и кратность (pack_size) — разные условия. Заполняйте их только подтверждёнными значениями.", "Ең аз тапсырыс (min_order_qty) пен қаптама еселігі (pack_size) — бөлек шарттар. Оларды тек расталған мәндермен толтырыңыз.", "Minimum order quantity (min_order_qty) and pack size (pack_size) are separate terms. Enter only confirmed values.")}
                    </p>
                  ) : null}
                  {form.kind === "sales" ? (
                    <Select
                      label={t("Как записано количество отгрузки в 1С", "1С жүйесінде жөнелтілім саны қалай жазылған", "How shipment quantity is recorded in 1C")}
                      value={form.quantity_multiplier}
                      disabled={disabled}
                      onChange={(event) =>
                        change({
                          quantity_multiplier:
                            event.target.value === "-1" ? -1 : 1,
                        })
                      }
                    >
                      <option value="1">
                        {t("Положительным числом — оставить как есть", "Оң санмен — өзгеріссіз қалдыру", "Positive number — keep as is")}
                      </option>
                      <option value="-1">
                        {t("Отрицательным числом — поменять знак", "Теріс санмен — таңбасын өзгерту", "Negative number — reverse sign")}
                      </option>
                    </Select>
                  ) : null}
                </div>
              </details>
              {!passthrough && (missing.length > 0 || duplicatePaths) ? (
                <Alert tone="warning" title={t("Нужно уточнить соответствие полей", "Өрістер сәйкестігін нақтылау керек", "Field mapping needs review")}>
                  {duplicatePaths
                    ? t("Одно поле 1С указано несколько раз. Выберите разные поля в дополнительных настройках.", "Бір 1С өрісі бірнеше рет көрсетілген. Қосымша баптауларда әртүрлі өрістерді таңдаңыз.", "The same 1C field is used more than once. Choose different fields in advanced settings.")
                    : `${t("В дополнительных настройках заполните", "Қосымша баптауларда толтырыңыз", "Complete in advanced settings")}: ${missing.map((field) => reportFieldLabel(field.name, locale)).join(", ")}.`}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setAdvanced(true)}
                  >
                    {t("Открыть настройки", "Баптауларды ашу", "Open settings")}
                  </Button>
                </Alert>
              ) : null}
              <div className={styles.actions}>
                {canWrite ? (
                  <Button
                    type="submit"
                    variant="dark"
                    loading={busy === "save"}
                    disabled={
                      disabled ||
                      !form.name.trim() ||
                      !form.url.trim() ||
                      (!passthrough && (missing.length > 0 || duplicatePaths))
                    }
                  >
                    {dirty ? t("Сохранить и продолжить", "Сақтап, жалғастыру", "Save and continue") : t("Перейти к загрузке", "Жүктеуге өту", "Continue to upload")}
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={() => setStep(2)}>
                    {t("Вернуться к отчёту", "Есепке оралу", "Back to report")}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  disabled={busy !== null}
                  icon={<ArrowLeft size={16} strokeWidth={1.8} />}
                  onClick={() => setStep(profile && !dirty ? 2 : 0)}
                >
                  {t("Назад", "Артқа", "Back")}
                </Button>
              </div>
              <p className={styles.hint}>
                {t("На следующем шаге загрузим отчёт и покажем, что получилось. Данные попадут в сервис после вашего подтверждения.", "Келесі қадамда есепті жүктеп, нәтижесін көрсетеміз. Деректер сервиске тек сіз растағаннан кейін қосылады.", "Next, we will load the report and show the result. Data enters the service only after you confirm.")}
              </p>
            </form>
          ) : null}
          {step === 2 ? (
            <>
              {!detail && busy !== "preview" ? (
                <div className={editor.ready}>
                  <strong>{t("Подключение сохранено", "Қосылым сақталды", "Connection saved")}</strong>
                  <p className={styles.hint}>
                    {t("Загрузите отчёт, чтобы проверить доступ и данные. Перед добавлением в сервис вы увидите результат.", "Қолжетімділік пен деректерді тексеру үшін есепті жүктеңіз. Сервиске қоспас бұрын нәтижесін көресіз.", "Load the report to check access and data. You will see the result before adding it to the service.")}
                  </p>
                </div>
              ) : null}
              <div className={styles.actions}>
                <Button
                  variant={detail ? "secondary" : "dark"}
                  icon={<Download size={16} strokeWidth={1.8} />}
                  loading={busy === "preview"}
                  disabled={!profile || dirty || busy !== null || !canPreview}
                  onClick={() => void preview()}
                >
                  {detail ? t("Загрузить заново", "Қайта жүктеу", "Reload") : t("Загрузить и проверить", "Жүктеп, тексеру", "Load and review")}
                </Button>
                <Button
                  variant="ghost"
                  icon={<Settings2 size={16} strokeWidth={1.8} />}
                  disabled={busy !== null}
                  onClick={() => setStep(1)}
                >
                  {canWrite ? t("Настроить", "Баптау", "Configure") : t("Посмотреть настройки", "Баптауларды қарау", "View settings")}
                </Button>
              </div>
              {!canPreview ? (
                <p className={styles.hint}>
                  {t("Для загрузки отчёта нужны права на импорт данных.", "Есепті жүктеу үшін деректерді импорттау құқығы қажет.", "Data import permission is required to load the report.")}
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      </Card>
      {busy === "preview" && !detail ? (
        <Card title={t("Загружаем отчёт из 1С", "1С есебі жүктелуде", "Loading report from 1C")} aria-busy="true">
          <div
            className={styles.stack}
            role="status"
            aria-label={t("Проверяем данные", "Деректер тексерілуде", "Checking data")}
          >
            <p className={styles.hint}>
              {t("Проверяем строки и соответствие полей.", "Жолдар мен өрістер сәйкестігін тексеріп жатырмыз.", "Checking rows and field mapping.")}
            </p>
            <div className={skeleton.skeletonRow} aria-hidden="true" />
            <div className={skeleton.skeletonRow} aria-hidden="true" />
            <div className={skeleton.skeletonRow} aria-hidden="true" />
          </div>
        </Card>
      ) : null}
      {detail && step === 2 ? (
        <RestReportPreview
          key={detail.id}
          detail={detail}
          canApply={canApply && busy !== "preview"}
          busy={busy === "apply"}
          error={error}
          onApply={apply}
        />
      ) : null}
    </div>
  );
}
