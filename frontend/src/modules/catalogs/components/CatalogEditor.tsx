import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";

import { ApiError } from "../../../shared/api/client";
import { useI18n } from "../../../shared/i18n/I18nContext";
import { Alert, Button, Field, Modal, Select } from "../../../shared/ui";
import { createCatalog, getCatalog, listCatalog, listCatalogSources, updateCatalog } from "../api/catalogs";
import type { AnyCatalogRecord, CatalogKind, CatalogSource } from "../api/catalogs";
import { catalogChanges, catalogDraft, catalogFields, validCatalogQuantity } from "../manual";
import styles from "./CatalogEditor.module.css";

type Translate = ReturnType<typeof useI18n>["t"];

function mutationError(error: unknown, t: Translate): string {
  if (error instanceof ApiError) {
    if (error.status === 409) return t("Запись уже изменена. Ваши поля сохранены в форме. Закройте форму и обновите запись перед повторной правкой.", "Жазба өзгертілген. Енгізілген мәндер нысанда сақталды. Нысанды жауып, жазбаны жаңартыңыз.", "This record has changed. Your input remains in the form. Close the form and refresh the record before editing again.");
    if (error.status === 403) return t("Нет права изменять справочники.", "Анықтамалықтарды өзгерту құқығы жоқ.", "You do not have permission to edit catalogs.");
    if (error.status === 422) return t("Проверьте поля и связи: выбранные поставщик и категория должны быть допустимы для этого источника. Данные формы сохранены.", "Өрістер мен байланыстарды тексеріңіз: жеткізуші мен санат осы дереккөзге сәйкес болуы тиіс. Мәндер сақталды.", "Check fields and relationships: the supplier and category must be valid for this source. Your input is preserved.");
  }
  return error instanceof Error ? error.message : t("Не удалось сохранить запись.", "Жазбаны сақтау мүмкін болмады.", "Could not save the record.");
}

function ImportWarning() {
  const { t } = useI18n();
  return <Alert tone="warning" title={t("Локальное изменение", "Жергілікті өзгеріс", "Local edit")}>
    {t("Для импортированных записей: следующая загрузка из источника может перезаписать изменения.", "Импортталған жазбалар үшін: дереккөзден келесі жүктеу өзгерістерді қайта жазуы мүмкін.", "For imported records: the next source import may overwrite your changes.")}
  </Alert>;
}

function RelationField({ kind, value, onChange, sourceId, disabled }: { kind: "suppliers" | "categories"; value: string; onChange: (value: string) => void; sourceId?: string; disabled: boolean }) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<AnyCatalogRecord[]>([]);
  const [selected, setSelected] = useState<AnyCatalogRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const label = kind === "suppliers" ? t("Поставщик", "Жеткізуші", "Supplier") : t("Категория", "Санат", "Category");
  useEffect(() => {
    const controller = new AbortController();
    setSelected(null);
    if (value) getCatalog(kind, value, controller.signal).then((row) => { if (!controller.signal.aborted) setSelected(row); }).catch(() => {});
    return () => controller.abort();
  }, [kind, value]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(false); setRows([]);
    const timer = window.setTimeout(() => {
      listCatalog(kind, { q: search.trim(), active: "true", offset: 0, limit: 51, source_id: sourceId }, controller.signal)
        .then((result) => { if (!controller.signal.aborted) setRows(result); })
        .catch(() => { if (!controller.signal.aborted) setError(true); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, search ? 250 : 0);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [kind, search, sourceId, reload]);
  const visible = rows.slice(0, 50);
  return <div className={styles.relation}>
    <Field label={`${label}: ${t("поиск по названию", "атауы бойынша іздеу", "search by name")}`} type="search" maxLength={200} value={search} disabled={disabled} onChange={(event) => setSearch(event.target.value)} />
    <Select label={label} value={value} disabled={disabled || loading} onChange={(event) => onChange(event.target.value)} aria-busy={loading}>
      <option value="">{loading ? t("Загрузка…", "Жүктелуде…", "Loading…") : t("Не выбран", "Таңдалмаған", "Not selected")}</option>
      {value && !visible.some((row) => row.id === value) ? <option value={value}>{selected?.name ?? t("Текущее значение (название недоступно)", "Ағымдағы мән (атауы қолжетімсіз)", "Current value (name unavailable)")}</option> : null}
      {visible.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
    </Select>
    {error ? <div role="alert"><p className={styles.note}>{t("Не удалось загрузить варианты. Текущее значение сохранено.", "Нұсқаларды жүктеу мүмкін болмады. Ағымдағы мән сақталды.", "Could not load options. The current selection is preserved.")}</p><Button type="button" variant="ghost" size="sm" onClick={() => setReload((n) => n + 1)}>{t("Повторить", "Қайталау", "Retry")}</Button></div> : !loading && !rows.length ? <p className={styles.note}>{t("Совпадений нет. Измените поиск или сначала добавьте запись в справочник.", "Сәйкестік жоқ. Іздеуді өзгертіңіз немесе анықтамалыққа жазба қосыңыз.", "No matches. Change your search or add a catalog record first.")}</p> : rows.length > 50 ? <p className={styles.note}>{t("Показаны первые 50. Уточните поиск.", "Алғашқы 50 көрсетілген. Іздеуді нақтылаңыз.", "First 50 shown. Refine your search.")}</p> : null}
  </div>;
}

export function CatalogEditor({ kind, record, onClose, onSaved }: { kind: CatalogKind; record?: AnyCatalogRecord; onClose: () => void; onSaved: (record: AnyCatalogRecord) => void }) {
  const { t } = useI18n();
  const formId = useId();
  const [draft, setDraft] = useState(() => catalogDraft(kind, record));
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [sources, setSources] = useState<CatalogSource[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [sourcesError, setSourcesError] = useState(false);
  useEffect(() => {
    if (record) return;
    const controller = new AbortController();
    listCatalogSources(controller.signal).then((result) => { if (!controller.signal.aborted) setSources(result); }).catch(() => { if (!controller.signal.aborted) setSourcesError(true); });
    return () => controller.abort();
  }, [record]);
  const relationSourceId = record?.source_id || sourceId || sources.find((source) => source.system === "manual")?.id;
  const set = (key: keyof typeof draft, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pendingRef.current) return;
    if (!draft.name.trim() || (kind === "products" && (!draft.sku.trim() || !draft.unit.trim()))) {
      setError(t("Заполните обязательные поля, не только пробелами.", "Міндетті өрістерді толтырыңыз, бос орындар жеткіліксіз.", "Fill required fields with more than whitespace.")); return;
    }
    if (kind === "products" && (!validCatalogQuantity(draft.pack_size, true) || !validCatalogQuantity(draft.min_order_qty, false))) {
      setError(t("Кратность должна быть больше 0, минимум — не меньше 0. До 14 цифр до запятой и 6 после.", "Еселік 0-ден үлкен, минимум кемінде 0 болуы тиіс. Үтірге дейін 14, кейін 6 таңбаға дейін.", "Order multiple must exceed 0; minimum must be at least 0. Use up to 14 integer and 6 decimal digits.")); return;
    }
    pendingRef.current = true; setPending(true); setError(null);
    try {
      const saved = record ? await updateCatalog(kind, record, catalogChanges(kind, draft, record)) : await createCatalog(kind, { ...catalogFields(kind, draft), ...(sourceId ? { source_id: sourceId } : {}) });
      onSaved(saved);
    } catch (caught) { setError(mutationError(caught, t)); }
    finally { pendingRef.current = false; setPending(false); }
  }
  return <Modal id={`catalog-editor-${formId}`} open title={record ? t("Изменить запись", "Жазбаны өзгерту", "Edit record") : t("Добавить запись", "Жазба қосу", "Add record")} size={kind === "products" ? "lg" : "md"} bodyScroll closeOnBackdrop={!pending} closeOnEscape={!pending} showClose={!pending} onOpenChange={(open) => { if (!open && !pendingRef.current) onClose(); }} footer={<><Button type="button" variant="secondary" disabled={pending} onClick={onClose}>{t("Отмена", "Бас тарту", "Cancel")}</Button><Button type="submit" form={formId} loading={pending}>{t("Сохранить", "Сақтау", "Save")}</Button></>}>
    <form id={formId} className={styles.form} onSubmit={submit} aria-busy={pending}>
      {record ? <ImportWarning /> : <>
        <Select label={t("Источник учётных данных", "Есеп деректерінің көзі", "Accounting data source")} value={sourceId} disabled={pending} onChange={(event) => { setSourceId(event.target.value); setDraft((current) => ({ ...current, supplier_id: "", category_id: "" })); }}>
          <option value="">{t("Ручной справочник (отдельный источник)", "Қолмен енгізу (бөлек дереккөз)", "Manual catalog (separate source)")}</option>
          {sources.filter((source) => source.system !== "manual").map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
        </Select>
        <p className={styles.note}>{t("Для работы с существующими остатками и заказами выберите их источник. Товар, поставщик и склад должны относиться к одному источнику. Остатки и история автоматически не создаются.", "Қолданыстағы қалдықтар мен тапсырыстар үшін олардың дереккөзін таңдаңыз. Тауар, жеткізуші және қойма бір дереккөзге тиесілі болуы тиіс. Қалдықтар мен тарих автоматты жасалмайды.", "Choose the existing stock and orders source to use them. Product, supplier and warehouse must share one source. Stock and history are not created automatically.")}</p>
        {sourcesError ? <p role="status" className={styles.note}>{t("Источники недоступны: требуется доступ к интеграциям. Можно создать запись в отдельном ручном справочнике без связей.", "Дереккөздер қолжетімсіз: интеграцияларға рұқсат қажет. Бөлек қолмен енгізілетін анықтамалыққа байланыссыз жазба қосуға болады.", "Sources unavailable: integration access is required. You can still create an unlinked manual record.")}</p> : null}
      </>}
      {error ? <Alert tone="danger" title={t("Не удалось сохранить", "Сақтау мүмкін болмады", "Could not save")}>{error}</Alert> : null}
      <Field label={t("Название", "Атауы", "Name")} required maxLength={kind === "products" ? 500 : 300} value={draft.name} disabled={pending} onChange={(event) => set("name", event.target.value)} />
      {kind === "products" ? <>
        <div className={styles.fields}>
          <Field label={t("Артикул", "Артикул", "SKU")} required maxLength={200} value={draft.sku} disabled={pending} onChange={(event) => set("sku", event.target.value)} />
          <Field label={t("Код товара (необязательно)", "Тауар коды (міндетті емес)", "Product code (optional)")} maxLength={200} value={draft.code} disabled={pending} onChange={(event) => set("code", event.target.value)} />
          <Field label={t("Единица измерения", "Өлшем бірлігі", "Unit")} required maxLength={30} value={draft.unit} disabled={pending} onChange={(event) => set("unit", event.target.value)} />
          <Field label={t("Срок поставки, дней (необязательно)", "Жеткізу мерзімі, күн (міндетті емес)", "Lead time, days (optional)")} type="number" min={1} max={730} step={1} value={draft.lead_time_days} disabled={pending} onChange={(event) => set("lead_time_days", event.target.value)} />
          <Field label={t("Кратность заказа", "Тапсырыс еселігі", "Order multiple")} required inputMode="decimal" maxLength={21} value={draft.pack_size} disabled={pending} onChange={(event) => set("pack_size", event.target.value)} />
          <Field label={t("Минимальное количество заказа", "Тапсырыстың ең аз саны", "Minimum order quantity")} required inputMode="decimal" maxLength={21} value={draft.min_order_qty} disabled={pending} onChange={(event) => set("min_order_qty", event.target.value)} />
          {relationSourceId ? <><RelationField key={`suppliers-${relationSourceId}`} kind="suppliers" value={draft.supplier_id} onChange={(value) => set("supplier_id", value)} sourceId={relationSourceId} disabled={pending} />
          <RelationField key={`categories-${relationSourceId}`} kind="categories" value={draft.category_id} onChange={(value) => set("category_id", value)} sourceId={relationSourceId} disabled={pending} /></> : <p className={styles.note}>{t("Чтобы выбрать поставщика и категорию, выберите существующий источник или сначала добавьте их в ручной справочник.", "Жеткізуші мен санатты таңдау үшін дереккөзді таңдаңыз немесе оларды қолмен анықтамалыққа қосыңыз.", "To select a supplier and category, choose an existing source or add them to the manual catalog first.")}</p>}
        </div>
        {record ? <p className={styles.note}>{t("Связи выбираются из того же источника, что и товар.", "Байланыстар тауармен бір дереккөзден таңдалады.", "Relationships are selected from the same source as the product.")}</p> : null}
      </> : null}
      {kind === "categories" ? <div className={styles.fields}>
        <Field label={t("Период проверки, дней", "Тексеру кезеңі, күн", "Review period, days")} type="number" required min={1} max={365} step={1} value={draft.review_days} disabled={pending} onChange={(event) => set("review_days", event.target.value)} />
        <Field label={t("Страховой запас, дней", "Қауіпсіздік қоры, күн", "Safety stock, days")} type="number" required min={0} max={365} step={1} value={draft.safety_days} disabled={pending} onChange={(event) => set("safety_days", event.target.value)} />
      </div> : null}
    </form>
  </Modal>;
}

export function CatalogArchiveDialog({ kind, record, onClose, onSaved }: { kind: CatalogKind; record: AnyCatalogRecord; onClose: () => void; onSaved: (record: AnyCatalogRecord) => void }) {
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const action = record.active ? t("В архив", "Мұрағатқа", "Archive") : t("Восстановить", "Қалпына келтіру", "Restore");
  async function confirm() {
    if (pendingRef.current) return;
    pendingRef.current = true; setPending(true); setError(null);
    try { onSaved(await updateCatalog(kind, record, { active: !record.active })); }
    catch (caught) { setError(mutationError(caught, t)); }
    finally { pendingRef.current = false; setPending(false); }
  }
  return <Modal id="catalog-archive" open title={action} closeOnBackdrop={!pending} closeOnEscape={!pending} showClose={!pending} onOpenChange={(open) => { if (!open && !pendingRef.current) onClose(); }} footer={<><Button variant="secondary" disabled={pending} onClick={onClose}>{t("Отмена", "Бас тарту", "Cancel")}</Button><Button loading={pending} onClick={() => void confirm()}>{action}</Button></>}>
    <div className={styles.form}><p>{record.active ? t("Убрать запись из активных? Данные и связи сохранятся, запись можно восстановить.", "Жазбаны белсенділерден алып тастау керек пе? Деректер мен байланыстар сақталады, жазбаны қалпына келтіруге болады.", "Remove this record from active records? Data and relationships remain, and you can restore it.") : t("Вернуть запись в активные?", "Жазбаны қайта белсенді ету керек пе?", "Restore this record to active status?")} <strong>{record.name}</strong></p><ImportWarning />{error ? <Alert tone="danger" title={t("Не удалось изменить статус", "Күйді өзгерту мүмкін болмады", "Could not change status")}>{error}</Alert> : null}</div>
  </Modal>;
}
