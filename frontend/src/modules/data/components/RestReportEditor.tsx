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

export function reportError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return "У вашей роли нет права на это действие.";
    if (error.status === 409)
      return "Версия источника изменилась или запись конфликтует с существующей. Получите отчёт заново и проверьте версии записей.";
  }
  return error instanceof Error
    ? error.message
    : "Не удалось выполнить действие. Попробуйте ещё раз.";
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
  return (
    <div className={editor.mapping}>
      {fields.map((field) => (
        <div className={editor.mappingRow} key={field.name}>
          <div className={editor.mappingLabel}>
            <strong>{reportFieldLabel(field.name)}</strong>
            <code>
              {field.name}
              {field.required ? " · обязательно" : ""}
            </code>
          </div>
          <Field
            label="Название поля в 1С"
            aria-label={`Поле 1С для «${reportFieldLabel(field.name)}»`}
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
  const firstKind =
    kinds.find((item) => item.kind === (profile?.kind ?? defaultKind)) ??
    kinds[0];
  const [form, setForm] = useState<ReportInput>(
    profile ?? {
      name: reportKindTitle(firstKind.kind),
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
  const displayError = error ? friendlyReportError(error) : null;

  function chooseKind(nextKind: ReportKind) {
    if (nextKind.kind === form.kind) return;
    change({
      kind: nextKind.kind,
      name:
        form.name === reportKindTitle(form.kind)
          ? reportKindTitle(nextKind.kind)
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
      if (mounted.current) setError(reportError(caught));
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
      if (mounted.current) setError(reportError(caught));
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
      if (mounted.current) setError(reportError(caught));
    } finally {
      if (mounted.current) pending(null);
    }
  }

  return (
    <div className={styles.stack}>
      <Card
        title={
          step === 0
            ? "Какие данные загрузим?"
            : step === 1
              ? "Подключение отчёта"
              : form.name
        }
        subtitle={
          step === 0
            ? "Выберите, что хотите получать из 1С."
            : step === 1
              ? "Сохраните ссылку один раз — затем отчёт можно будет обновлять одной кнопкой."
              : reportKindTitle(form.kind)
        }
      >
        <div className={styles.stack}>
          <ProgressSteps
            label="Подключение отчёта"
            steps={["Данные", "Подключение", "Проверка"]}
            current={step}
          />
          {displayError ? (
            <Alert tone="danger" title={displayError.title}>
              {displayError.message}
              {displayError.technical ? (
                <details className={styles.optional}>
                  <summary>Подробности для специалиста</summary>
                  <p className={editor.technical}>{displayError.technical}</p>
                </details>
              ) : null}
            </Alert>
          ) : null}
          {step === 0 ? (
            <>
              <fieldset className={editor.kindChoices} disabled={disabled}>
                <legend className={editor.legend}>Вид данных</legend>
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
                      <strong>{reportKindTitle(item.kind)}</strong>
                      <small>{reportKindDescription(item.kind)}</small>
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
                  Продолжить
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
                  <strong>{reportKindTitle(form.kind)}</strong>
                  <p className={styles.hint}>
                    {reportKindDescription(form.kind)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  onClick={() => setStep(0)}
                >
                  Изменить
                </Button>
              </div>
              <Field
                label="Название отчёта"
                value={form.name}
                maxLength={200}
                required
                disabled={disabled}
                placeholder="Например, отгрузки за сентябрь"
                onChange={(event) => change({ name: event.target.value })}
              />
              <Field
                label="Ссылка на отчёт в 1С"
                type="url"
                pattern="https?://.*"
                value={form.url}
                required
                maxLength={2048}
                disabled={disabled}
                placeholder="https://1c.example.kz/base/hs/reports/sales"
                hint="Попросите специалиста 1С дать ссылку для получения этого отчёта и настроить доступ. Пароль в ссылку добавлять не нужно."
                onChange={(event) => change({ url: event.target.value })}
              />
              <details
                className={editor.advanced}
                open={advanced}
                onToggle={(event) => setAdvanced(event.currentTarget.open)}
              >
                <summary>Дополнительные настройки</summary>
                <div className={styles.stack}>
                  <p className={styles.hint}>
                    Если формат отчёта отличается, настройте его со специалистом
                    1С. Для сопоставления понадобится пример ответа со списком
                    полей.
                  </p>
                  <div className={styles.formGrid}>
                    <Field
                      label="Где находится список строк"
                      maxLength={200}
                      value={form.items_path}
                      disabled={disabled}
                      placeholder="value"
                      hint="Путь в ответе JSON: например value или data.rows. Оставьте пустым, если ответ сразу содержит список."
                      onChange={(event) =>
                        change({ items_path: event.target.value })
                      }
                    />
                    <Field
                      label="Настройка доступа на сервере"
                      maxLength={100}
                      value={form.auth_env ?? ""}
                      disabled={disabled}
                      placeholder="ONEC_AUTH_MAIN"
                      pattern="ONEC_AUTH_[A-Z0-9_]+"
                      hint="Необязательно. Администратор сообщит имя настройки. Сам пароль или токен сюда не вводится."
                      onChange={(event) =>
                        change({ auth_env: event.target.value })
                      }
                    />
                  </div>
                  <div className={styles.mappingHead}>
                    <div>
                      <h4>Соответствие полей</h4>
                      <p>
                        Для каждого значения укажите название поля из ответа 1С.
                        Например, «Название» может приходить в поле
                        Наименование.
                      </p>
                    </div>
                  </div>
                  <Checkbox
                    label="Названия полей уже совпадают"
                    description="Использовать ответ без переименования. При проверке покажем недостающие и лишние поля."
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
                            Дополнительные поля ({optional.length})
                          </summary>
                          <div className={styles.stack}>
                            <p className={styles.hint}>
                              Пустое поле не загружается. Если название указано,
                              значение должно быть в каждой строке. Для
                              вложенного поля используйте точку: например
                              Номенклатура.Код.
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
                      Обязательные поля:{" "}
                      {required.map((field) => field.name).join(", ")}.
                    </p>
                  )}
                  <p className={styles.hint}>
                    Идентификаторы и версии записей берём из 1С. Код и артикул
                    не заменяют идентификатор. Ссылки на товары и склады должны
                    совпадать с ранее загруженными справочниками.
                  </p>
                  {form.kind === "growth" ? (
                    <p className={styles.hint}>
                      В дополнительных полях укажите либо товар
                      (product_external_id), либо категорию
                      (category_external_id). Значение rate = 0.1 означает рост
                      на 10%.
                    </p>
                  ) : null}
                  {form.kind === "products" ? (
                    <p className={styles.hint}>
                      Минимум заказа (min_order_qty) и кратность (pack_size) —
                      разные условия. Заполняйте их только подтверждёнными
                      значениями.
                    </p>
                  ) : null}
                  {form.kind === "sales" ? (
                    <Select
                      label="Как записано количество отгрузки в 1С"
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
                        Положительным числом — оставить как есть
                      </option>
                      <option value="-1">
                        Отрицательным числом — поменять знак
                      </option>
                    </Select>
                  ) : null}
                </div>
              </details>
              {!passthrough && (missing.length > 0 || duplicatePaths) ? (
                <Alert tone="warning" title="Нужно уточнить соответствие полей">
                  {duplicatePaths
                    ? "Одно поле 1С указано несколько раз. Выберите разные поля в дополнительных настройках."
                    : `В дополнительных настройках заполните: ${missing.map((field) => reportFieldLabel(field.name)).join(", ")}.`}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setAdvanced(true)}
                  >
                    Открыть настройки
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
                    {dirty ? "Сохранить и продолжить" : "Перейти к загрузке"}
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={() => setStep(2)}>
                    Вернуться к отчёту
                  </Button>
                )}
                <Button
                  variant="ghost"
                  disabled={busy !== null}
                  icon={<ArrowLeft size={16} strokeWidth={1.8} />}
                  onClick={() => setStep(profile && !dirty ? 2 : 0)}
                >
                  Назад
                </Button>
              </div>
              <p className={styles.hint}>
                На следующем шаге загрузим отчёт и покажем, что получилось.
                Данные попадут в сервис после вашего подтверждения.
              </p>
            </form>
          ) : null}
          {step === 2 ? (
            <>
              {!detail && busy !== "preview" ? (
                <div className={editor.ready}>
                  <strong>Подключение сохранено</strong>
                  <p className={styles.hint}>
                    Загрузите отчёт, чтобы проверить доступ и данные. Перед
                    добавлением в сервис вы увидите результат.
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
                  {detail ? "Загрузить заново" : "Загрузить и проверить"}
                </Button>
                <Button
                  variant="ghost"
                  icon={<Settings2 size={16} strokeWidth={1.8} />}
                  disabled={busy !== null}
                  onClick={() => setStep(1)}
                >
                  {canWrite ? "Настроить" : "Посмотреть настройки"}
                </Button>
              </div>
              {!canPreview ? (
                <p className={styles.hint}>
                  Для загрузки отчёта нужны права на импорт данных.
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      </Card>
      {busy === "preview" && !detail ? (
        <Card title="Загружаем отчёт из 1С" aria-busy="true">
          <div
            className={styles.stack}
            role="status"
            aria-label="Проверяем данные"
          >
            <p className={styles.hint}>
              Проверяем строки и соответствие полей.
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
