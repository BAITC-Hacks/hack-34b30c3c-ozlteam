import { ArrowRight, Download, Save } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ApiError } from "../../../shared/api/client";
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Field,
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
import { RestReportPreview } from "./RestReportPreview";
import styles from "./RestReports.module.css";
import skeleton from "../pages/DataSourcesPage.module.css";

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
    <div className={styles.mapping}>
      {fields.map((field) => (
        <div className={styles.mappingRow} key={field.name}>
          <Field
            label={<span>Поле 1С{field.required ? " *" : ""}</span>}
            aria-label={`Поле 1С для ${field.label}`}
            value={mapping[field.name] ?? ""}
            placeholder={field.name}
            required={field.required}
            disabled={disabled}
            onChange={(event) => onChange(field.name, event.target.value)}
          />
          <ArrowRight
            size={16}
            strokeWidth={1.8}
            className={styles.mappingArrow}
            aria-hidden="true"
          />
          <div className={styles.mappingTarget}>
            <strong>{field.label}</strong>
            <code>{field.name}</code>
            <span>
              {field.type}
              {field.required ? " · обязательно" : ""}
            </span>
          </div>
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
  onClose,
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
  onClose: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const firstKind =
    kinds.find((item) => item.kind === (profile?.kind ?? defaultKind)) ??
    kinds[0];
  const [form, setForm] = useState<ReportInput>(
    profile ?? {
      name: "",
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
    setDetail(null);
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
        title={profile ? profile.name : "Новый REST-отчёт"}
        subtitle="Запрос → сопоставление полей → проверка → применение"
        actions={
          <Button
            variant="ghost"
            size="sm"
            disabled={busy !== null}
            onClick={onClose}
          >
            Закрыть
          </Button>
        }
      >
        <form
          className={styles.stack}
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          {error ? (
            <Alert tone="danger" title="Действие не выполнено">
              {error}
            </Alert>
          ) : null}
          <div className={styles.formGrid}>
            <Field
              label="Название отчёта"
              value={form.name}
              maxLength={200}
              required
              disabled={disabled}
              placeholder="Например, отгрузки за сентябрь"
              onChange={(event) => change({ name: event.target.value })}
            />
            <Select
              label="Вид данных"
              value={form.kind}
              disabled={disabled}
              onChange={(event) => {
                const nextKind = kinds.find(
                  (item) => item.kind === event.target.value,
                );
                if (nextKind) {
                  change({ kind: nextKind.kind, quantity_multiplier: 1 });
                  setMapping(initialMapping(undefined, nextKind));
                }
              }}
            >
              {kinds.map((item) => (
                <option key={item.kind} value={item.kind}>
                  {item.title}
                </option>
              ))}
            </Select>
          </div>
          <p className={styles.hint}>{kind.description}</p>
          <Field
            label="Адрес REST-отчёта"
            type="url"
            pattern="https?://.*"
            value={form.url}
            required
            maxLength={2048}
            disabled={disabled}
            placeholder="https://1c.example.kz/base/hs/reports/sales"
            hint="GET-запрос выполняет сервер. Администратор должен разрешить этот адрес; пароль и токен в URL не указывайте."
            onChange={(event) => change({ url: event.target.value })}
          />
          <div className={styles.formGrid}>
            <Field
              label="Путь к массиву строк в JSON"
              maxLength={200}
              value={form.items_path}
              disabled={disabled}
              placeholder="value"
              hint="Например: value или data.rows. Пусто — если ответ сразу массив."
              onChange={(event) => change({ items_path: event.target.value })}
            />
            <Field
              label="Имя серверного ключа доступа"
              maxLength={100}
              value={form.auth_env ?? ""}
              disabled={disabled}
              placeholder="ONEC_AUTH_MAIN"
              pattern="ONEC_AUTH_[A-Z0-9_]+"
              hint="Необязательно. Это имя настройки на сервере, не сам токен."
              onChange={(event) => change({ auth_env: event.target.value })}
            />
          </div>
          <div className={styles.mappingHead}>
            <div>
              <h4>Сопоставление полей</h4>
              <p>
                Слева — имя или вложенный путь в ответе 1С, справа — поле нашей
                базы.
              </p>
            </div>
            <Badge tone="info">{required.length} обязательных</Badge>
          </div>
          <div className={styles.note}>
            Стабильный ID и версия записи приходят из источника. Код товара и
            артикул — отдельные поля. Ссылки на товары и склады должны совпадать
            с ID ранее загруженных справочников.
          </div>
          <Checkbox
            label="Ответ уже в нашем формате"
            description="Все поля JSON передаются без переименования. Лишние поля отклоняются при проверке."
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
              <details className={styles.optional}>
                <summary>Дополнительные поля ({optional.length})</summary>
                <div className={styles.stack}>
                  <p className={styles.hint}>
                    Оставьте путь пустым, чтобы не передавать поле. Если путь
                    задан, он должен присутствовать в каждой строке ответа.
                    Вложенный путь: например Номенклатура.Код.
                  </p>
                  <MappingFields
                    fields={optional}
                    mapping={mapping}
                    disabled={disabled}
                    onChange={changeMapping}
                  />
                </div>
              </details>
            </>
          ) : (
            <p className={styles.hint}>
              Обязательные поля:{" "}
              {required.map((field) => field.name).join(", ")}.
            </p>
          )}
          {form.kind === "growth" ? (
            <p className={styles.hint}>
              В дополнительных полях укажите ровно одну ссылку: на товар
              (product_external_id) или категорию (category_external_id).
              Значение rate = 0.1 означает прирост 10%.
            </p>
          ) : null}
          {form.kind === "products" ? (
            <p className={styles.hint}>
              MOQ (min_order_qty) и кратность (pack_size) — разные условия
              заказа. Передавайте подтверждённые значения, не подставляйте их по
              названию товара.
            </p>
          ) : null}
          {form.kind === "sales" ? (
            <Select
              label="Знак количества отгрузки в источнике"
              value={form.quantity_multiplier}
              disabled={disabled}
              onChange={(event) =>
                change({
                  quantity_multiplier: event.target.value === "-1" ? -1 : 1,
                })
              }
            >
              <option value="1">Положительный расход — оставить знак</option>
              <option value="-1">
                Отрицательный расход — инвертировать знак
              </option>
            </Select>
          ) : null}
          {duplicatePaths && !passthrough ? (
            <Alert tone="danger">
              Один исходный путь нельзя сопоставить с несколькими полями.
              Исправьте повторяющиеся пути.
            </Alert>
          ) : null}
          <div className={styles.actions}>
            <Button
              type="submit"
              variant="secondary"
              icon={<Save size={16} strokeWidth={1.8} />}
              loading={busy === "save"}
              disabled={
                disabled ||
                !dirty ||
                !form.name.trim() ||
                !form.url.trim() ||
                (!passthrough && (missing.length > 0 || duplicatePaths))
              }
            >
              Сохранить настройки
            </Button>
            <Button
              type="button"
              variant="dark"
              icon={<Download size={16} strokeWidth={1.8} />}
              loading={busy === "preview"}
              disabled={!profile || dirty || busy !== null || !canPreview}
              onClick={() => void preview()}
            >
              Получить и проверить
            </Button>
          </div>
          <p className={styles.hint}>
            {dirty
              ? "Сохраните настройки, чтобы запросить отчёт."
              : "Настройки сохранены. Получение создаст проверку в истории загрузок."}{" "}
            {missing.length > 0 && !passthrough
              ? `Заполните обязательные поля: ${missing.map((field) => field.label).join(", ")}.`
              : ""}
          </p>
        </form>
      </Card>
      {busy === "preview" ? (
        <Card title="Получаем и проверяем отчёт" aria-busy="true">
          <div
            className={styles.stack}
            role="status"
            aria-label="Ожидаем строки отчёта"
          >
            <div className={skeleton.skeletonRow} aria-hidden="true" />
            <p className={styles.hint}>
              Запрашиваем данные из 1С и проверяем их формат.
            </p>
          </div>
        </Card>
      ) : null}
      {detail ? (
        <RestReportPreview
          key={detail.id}
          detail={detail}
          canApply={canApply}
          busy={busy === "apply"}
          error={error}
          onApply={apply}
        />
      ) : null}
    </div>
  );
}
