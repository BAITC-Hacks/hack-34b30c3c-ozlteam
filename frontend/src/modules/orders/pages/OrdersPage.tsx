import { ArrowLeft, Download, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { PageHeader } from "../../../app/PageHeader";
import { useI18n } from "../../../shared/i18n/I18nContext";
import { ActionPreview, Alert, Badge, Button, Card, EmptyState, Select, Table, Td, Th, Tr } from "../../../shared/ui";
import { ApiError } from "../../../shared/api/client";
import { approveOrder, deleteOrderLine, editOrderLine, exportOrder, getOrder, getOrderAudit, getOrderHandoff, listOrderFilterOptions, listOrders, listWarehouses, reviseOrder, updateOrderComment } from "../api/orders";
import type { OrderAudit, OrderDelivery, OrderLine, SupplierOrder } from "../types";
import styles from "./OrdersPage.module.css";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dateTime = (value: string, locale = "ru") => new Intl.DateTimeFormat(locale === "kk" ? "kk-KZ" : locale === "en" ? "en-US" : "ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const auditAction = (action: string, t: ReturnType<typeof useI18n>["t"]) => ({ created: t("Заказ создан", "Тапсырыс жасалды", "Order created"), edited: t("Комментарий изменён", "Пікір өзгертілді", "Comment changed"), line_edited: t("Количество изменено", "Саны өзгертілді", "Quantity changed"), line_deleted: t("Позиция удалена", "Позиция жойылды", "Item removed"), approved: t("Заказ утверждён", "Тапсырыс бекітілді", "Order approved"), revised_from: t("Создана новая редакция", "Жаңа нұсқа жасалды", "New revision created"), superseded: t("Создана следующая редакция", "Келесі нұсқа жасалды", "Next revision created"), "1c_acknowledged": t("Ответ 1С получен", "1С жауабы алынды", "1C response received") } as Record<string, string>)[action] ?? action;

function quantity(value: string) {
  const [integer, fraction] = value.split(".");
  const whole = new Intl.NumberFormat("ru-RU").format(BigInt(integer || "0"));
  const decimal = fraction?.replace(/0+$/, "");
  return decimal ? `${whole},${decimal}` : whole;
}

function validQuantity(value: string) {
  const clean = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,6})?$/.test(clean)) return false;
  const [integer, fraction = ""] = clean.split(".");
  return (integer + fraction).replace(/^0+/, "").length <= 20 && /[1-9]/.test(integer + fraction);
}

function explainError(error: unknown, t: ReturnType<typeof useI18n>["t"]) {
  if (error instanceof ApiError) {
    if (error.status === 403) return t("У вашей роли нет прав на это действие. Обратитесь к администратору.", "Бұл әрекетке рұқсатыңыз жоқ. Әкімшіге хабарласыңыз.", "Your role cannot perform this action. Contact an administrator.");
    if (error.status === 409) return t("Заказ изменился или уже утверждён. Обновите карточку и повторите действие.", "Тапсырыс өзгерген немесе бекітілген. Бетті жаңартып, әрекетті қайталаңыз.", "The order changed or was approved. Refresh and try again.");
    if (error.status === 404) return t("Заказ не найден. Вернитесь к списку.", "Тапсырыс табылмады. Тізімге оралыңыз.", "Order not found. Return to the list.");
  }
  return error instanceof Error ? error.message : t("Не удалось выполнить действие. Попробуйте ещё раз.", "Әрекет орындалмады. Қайта көріңіз.", "Action failed. Try again.");
}

function OrderSkeleton({ detail = false }: { detail?: boolean }) {
  return <div className={styles.skeleton} aria-busy="true" aria-label="Загружаем заказы">
    <Card><div className={styles.skeletonHeading} /><div className={styles.skeletonSub} /></Card>
    <Card>{Array.from({ length: detail ? 3 : 5 }, (_, index) => <div className={styles.skeletonRow} key={index}><i /><i /><i /></div>)}</Card>
  </div>;
}

function OrderList({ onOpen }: { onOpen: (id: string) => void }) {
  const { t, locale } = useI18n();
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "all";
  const supplierId = params.get("supplier_id") ?? "";
  const from = params.get("from");
  const supplierReturn = from?.startsWith("/data/catalogs?") ? from : `/data/catalogs?${new URLSearchParams({ tab: "suppliers", id: supplierId ?? "" })}`;
  const query = params.get("q") ?? "";
  const warehouseId = params.get("warehouse_id") ?? "";
  const offset = Math.max(0, Number(params.get("offset") ?? 0) || 0);
  const [orders, setOrders] = useState<SupplierOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);
  const [warehouses, setWarehouses] = useState<Array<{ id: string; name: string }>>([]);
  const [filtersError, setFiltersError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    listOrders(status, offset, controller.signal, supplierId, warehouseId).then(setOrders).catch((caught: unknown) => {
      if (!controller.signal.aborted) setError(explainError(caught, t));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [status, supplierId, warehouseId, offset, reload]);

  useEffect(() => {
    const controller = new AbortController();
    setFiltersError(null);
    Promise.all([listOrderFilterOptions("suppliers", controller.signal), listOrderFilterOptions("warehouses", controller.signal)])
      .then(([supplierRows, warehouseRows]) => { setSuppliers(supplierRows); setWarehouses(warehouseRows); })
      .catch((caught: unknown) => { if (!controller.signal.aborted) setFiltersError(explainError(caught, t)); });
    return () => controller.abort();
  }, [reload]);

  const visible = useMemo(() => orders.filter((order) =>
    `${order.supplier_name} ${order.id} ${order.lines.map((line) => `${line.sku} ${line.name}`).join(" ")}`
      .toLocaleLowerCase("ru").includes(query.toLocaleLowerCase("ru")),
  ), [orders, query]);

  function updateParam(name: string, value: string) {
    const next = new URLSearchParams(params);
    if (value && value !== "all") next.set(name, value);
    else next.delete(name);
    if (name !== "offset" && name !== "q") next.delete("offset");
    setParams(next);
  }

  return <div className={styles.page}>
    <PageHeader title={t('Заказы поставщикам', 'Жеткізушілерге тапсырыстар', 'Supplier orders')} subtitle={t('Черновики, утверждение и экспорт для учётной системы', 'Жобалар, бекіту және есеп жүйесіне экспорт', 'Drafts, approval and export to the accounting system')} actions={<Button variant="secondary" size="sm" icon={<RefreshCw size={15} />} onClick={() => setReload((value) => value + 1)}>{t('Обновить', 'Жаңарту', 'Refresh')}</Button>} />
    <Card title={t('Список заказов', 'Тапсырыстар тізімі', 'Order list')} subtitle={t('Каждый заказ относится к одному поставщику и складу', 'Әр тапсырыс бір жеткізуші мен қоймаға қатысты', 'Each order belongs to one supplier and warehouse')}>
      {supplierId ? <Alert tone="info" title={t('Заказы выбранного поставщика', 'Таңдалған жеткізушінің тапсырыстары', 'Orders from selected supplier')} action={<Button variant="ghost" size="sm" onClick={() => updateParam("supplier_id", "")}>{t('Все поставщики', 'Барлық жеткізушілер', 'All suppliers')}</Button>}>{t("Фильтр сохраняется при смене статуса и страницы.", "Мәртебе мен бетті ауыстырғанда сүзгі сақталады.", "The filter remains when status or page changes.")} <Link to={supplierReturn}>{t('Вернуться в справочник', 'Анықтамалыққа оралу', 'Back to catalog')}</Link></Alert> : null}
      <div className={styles.filters}>
        <Select label={t('Статус', 'Мәртебе', 'Status')} value={status} onChange={(event) => updateParam("status", event.target.value)}><option value="all">{t('Все', 'Барлығы', 'All')}</option><option value="draft">{t('Черновики', 'Жобалар', 'Drafts')}</option><option value="approved">{t('Утверждённые', 'Бекітілгендер', 'Approved')}</option></Select>
        <Select label={t('Поставщик', 'Жеткізуші', 'Supplier')} value={supplierId} onChange={(event) => updateParam("supplier_id", event.target.value)}><option value="">{t('Все поставщики', 'Барлық жеткізушілер', 'All suppliers')}</option>{suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}{supplierId && !suppliers.some((item) => item.id === supplierId) ? <option value={supplierId}>{supplierId}</option> : null}</Select>
        <Select label={t('Склад', 'Қойма', 'Warehouse')} value={warehouseId} onChange={(event) => updateParam("warehouse_id", event.target.value)}><option value="">{t('Все склады', 'Барлық қоймалар', 'All warehouses')}</option>{warehouses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}{warehouseId && !warehouses.some((item) => item.id === warehouseId) ? <option value={warehouseId}>{warehouseId}</option> : null}</Select>
        <label>{t('Поиск на странице', 'Беттен іздеу', 'Search this page')}<input type="search" value={query} onChange={(event) => updateParam("q", event.target.value)} placeholder={t('Поставщик, товар или номер', 'Жеткізуші, тауар немесе нөмір', 'Supplier, product or number')} /></label>
      </div>
      {filtersError ? <Alert tone="warning">{t("Справочники фильтров не загрузились:", "Сүзгі анықтамалықтары жүктелмеді:", "Filter catalogs could not be loaded:")} {filtersError}</Alert> : null}
      {loading ? <OrderSkeleton /> : error ? <Alert tone="danger" title={t('Не удалось загрузить заказы', 'Тапсырыстар жүктелмеді', 'Could not load orders')} action={<Button size="sm" variant="secondary" onClick={() => setReload((value) => value + 1)}>{t('Повторить', 'Қайталау', 'Retry')}</Button>}>{error}</Alert> : <>
        {visible.length ?
        <Table><thead><Tr><Th>{t('Поставщик', 'Жеткізуші', 'Supplier')}</Th><Th>{t('Создан', 'Құрылған', 'Created')}</Th><Th numeric>{t('Позиций', 'Позициялар', 'Items')}</Th><Th>{t('Статус', 'Мәртебе', 'Status')}</Th><Th>{t('Заказ', 'Тапсырыс', 'Order')}</Th></Tr></thead><tbody>{visible.map((order) => <Tr key={order.id}>
          <Td><strong>{order.supplier_name}</strong><small className={styles.secondary}>{t("Редакция", "Нұсқа", "Revision")} {order.revision}</small></Td>
          <Td>{dateTime(order.created_at, locale)}</Td><Td numeric>{order.lines.length}</Td>
          <Td><Badge tone={order.status === "approved" ? "success" : "warning"}>{order.status === "approved" ? t('Утверждён', 'Бекітілген', 'Approved') : t('Черновик', 'Жоба', 'Draft')}</Badge></Td>
          <Td><button type="button" className={styles.textButton} onClick={() => onOpen(order.id)}>{t('Открыть', 'Ашу', 'Open')}<span className="srOnly"> заказ {order.id}</span></button></Td>
        </Tr>)}</tbody></Table> : <EmptyState title={query ? t('Совпадений нет', 'Сәйкестік жоқ', 'No matches') : offset > 0 ? t('На этой странице заказов нет', 'Бұл бетте тапсырыс жоқ', 'No orders on this page') : t('Заказов пока нет', 'Әзірге тапсырыс жоқ', 'No orders yet')} text={query ? t('Попробуйте изменить поиск или вернитесь на предыдущую страницу.', 'Іздеуді өзгертіңіз немесе алдыңғы бетке оралыңыз.', 'Change the search or go back to the previous page.') : offset > 0 ? t('Вернитесь на предыдущую страницу.', 'Алдыңғы бетке оралыңыз.', 'Go back to the previous page.') : t('Создайте черновики из рекомендаций после расчёта пополнения.', 'Толықтыруды есептегеннен кейін ұсынымдардан жобалар жасаңыз.', 'Create drafts from recommendations after running replenishment.')} />}
        {orders.length > 0 || offset > 0 ? <div className={styles.pager}><span>{orders.length ? `${t("Показаны", "Көрсетілді", "Showing")} ${offset + 1}–${offset + orders.length}` : t('На этой странице заказов нет', 'Бұл бетте тапсырыс жоқ', 'No orders on this page')}</span><div><Button variant="secondary" size="sm" disabled={offset === 0} onClick={() => updateParam("offset", String(Math.max(0, offset - 20)))}>{t('Назад', 'Артқа', 'Previous')}</Button><Button variant="secondary" size="sm" disabled={orders.length < 20} onClick={() => updateParam("offset", String(offset + 20))}>{t('Далее', 'Келесі', 'Next')}</Button></div></div> : null}
      </>}
    </Card>
  </div>;
}

function LineEditor({ order, line, onSaved, onEditingChange, onExplain }: { order: SupplierOrder; line: OrderLine; onSaved: (order: SupplierOrder) => void; onEditingChange: (lineId: string, editing: boolean) => void; onExplain: (recommendationId: string) => void }) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(line.quantity);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const normalized = value.trim().replace(",", ".");
  const ready = validQuantity(value) && reason.trim().length > 0 && normalized !== line.quantity;

  async function save() {
    if (!ready) return;
    setPending(true); setError(null);
    try {
      onSaved(await editOrderLine(order.id, line.id, normalized, reason.trim(), order.version));
      setEditing(false); onEditingChange(line.id, false); setReason("");
    } catch (caught) { setError(explainError(caught, t)); }
    finally { setPending(false); }
  }

  async function remove() {
    if (!reason.trim()) return;
    setPending(true); setError(null);
    try { onSaved(await deleteOrderLine(order.id, line.id, reason.trim(), order.version)); onEditingChange(line.id, false); }
    catch (caught) { setError(explainError(caught, t)); }
    finally { setPending(false); }
  }

  return <div className={styles.line}>
    <div className={styles.lineHead}><div><strong>{line.name}</strong><span className={styles.secondary}>{line.sku} · {line.unit}</span>{line.recommendation_id ? <button type="button" className={styles.textButton} onClick={() => onExplain(line.recommendation_id!)}>{t('Почему рекомендовано', 'Неге ұсынылды', 'Why recommended')}</button> : null}</div><div className={styles.lineValue}><strong>{quantity(line.quantity)} {line.unit}</strong><span className={styles.secondary}>{t("Рекомендовано", "Ұсынылғаны", "Recommended")} {quantity(line.recommended_quantity)}</span></div></div>
    {line.reason ? <p className={styles.lineReason}>{t("Причина:", "Себебі:", "Reason:")} {line.reason}</p> : null}
    {order.status === "draft" ? deleting ? <div className={styles.editor}>
      <label className={styles.wideField}>{t('Причина удаления', 'Жою себебі', 'Reason for removal')}<input value={reason} maxLength={4000} onChange={(event) => setReason(event.target.value)} placeholder={t('Почему исключаем позицию из заказа', 'Позицияны тапсырыстан неге алып тастаймыз', 'Why remove this item from the order')} /></label>
      <div className={styles.editorActions}><Button size="sm" variant="secondary" loading={pending} disabled={!reason.trim()} onClick={() => void remove()}>{t('Удалить позицию', 'Позицияны жою', 'Remove item')}</Button><Button size="sm" variant="ghost" disabled={pending} onClick={() => { setDeleting(false); onEditingChange(line.id, false); setReason(""); setError(null); }}>{t('Отмена', 'Болдырмау', 'Cancel')}</Button></div>
      <small className={styles.secondary}>{t('Удаление останется в истории; рекомендация не вернётся в выбор для нового заказа.', 'Жою тарихта сақталады; ұсыным жаңа тапсырыс үшін таңдауға қайта оралмайды.', 'Removal remains in history; the recommendation will not return to selection for a new order.')}</small>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div> : editing ? <div className={styles.editor}>
      <label>{t('Количество', 'Саны', 'Quantity')}<input inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} aria-invalid={value.length > 0 && !validQuantity(value)} /></label>
      <label>{t('Причина изменения', 'Өзгерту себебі', 'Reason for change')}<input value={reason} maxLength={4000} onChange={(event) => setReason(event.target.value)} placeholder={t('Например, согласована партия поставки', 'Мысалы, жеткізу партиясы келісілді', 'For example, the delivery batch was agreed')} /></label>
      <div className={styles.editorActions}><Button size="sm" loading={pending} disabled={!ready} onClick={() => void save()}>{t('Сохранить', 'Сақтау', 'Save')}</Button><Button size="sm" variant="ghost" disabled={pending} onClick={() => { setEditing(false); onEditingChange(line.id, false); setValue(line.quantity); setReason(""); setError(null); }}>{t('Отмена', 'Болдырмау', 'Cancel')}</Button></div>
      {value && !validQuantity(value) ? <small className={styles.errorText}>{t('Введите положительное число: до 20 цифр и 6 знаков после запятой.', 'Оң сан енгізіңіз: үтірге дейін 20, кейін 6 санға дейін.', 'Enter a positive number with up to 20 digits and 6 decimal places.')}</small> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div> : <div className={styles.lineActions}><Button size="sm" variant="ghost" onClick={() => { setValue(line.quantity); setEditing(true); onEditingChange(line.id, true); }}>{t('Изменить количество', 'Санын өзгерту', 'Change quantity')}</Button><Button size="sm" variant="ghost" onClick={() => { setDeleting(true); setReason(""); onEditingChange(line.id, true); }}>{t('Удалить позицию', 'Позицияны жою', 'Remove item')}</Button></div> : null}
  </div>;
}

function OrderDetail({ id, onBack, onOpen }: { id: string; onBack: () => void; onOpen: (id: string) => void }) {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [order, setOrder] = useState<SupplierOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [preview, setPreview] = useState(false);
  const [pending, setPending] = useState(false);
  const [exporting, setExporting] = useState<"csv" | "xlsx" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingLineIds, setEditingLineIds] = useState<Set<string>>(new Set());
  const [warehouseNames, setWarehouseNames] = useState<Map<string, string>>(new Map());
  const [comment, setComment] = useState("");
  const [commentReason, setCommentReason] = useState("");
  const [commentEditing, setCommentEditing] = useState(false);
  const [audit, setAudit] = useState<OrderAudit[]>([]);
  const [auditOffset, setAuditOffset] = useState(0);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditHasMore, setAuditHasMore] = useState(false);
  const [auditRetry, setAuditRetry] = useState(0);
  const [delivery, setDelivery] = useState<OrderDelivery | null>(null);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [revisionReason, setRevisionReason] = useState("");
  const [revisionOpen, setRevisionOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null); setOrder(null); setPreview(false); setEditingLineIds(new Set()); setAudit([]); setAuditOffset(0); setDelivery(null); setCommentEditing(false); setRevisionOpen(false); setNotice(null);
    getOrder(id, controller.signal).then((loaded) => { setOrder(loaded); setComment(loaded.comment); }).catch((caught: unknown) => { if (!controller.signal.aborted) setError(explainError(caught, t)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    listWarehouses(controller.signal).then((items) => setWarehouseNames(new Map(items.map((item) => [item.id, item.name])))).catch(() => undefined);
    return () => controller.abort();
  }, [id, reload]);

  useEffect(() => {
    if (!order || order.id !== id) return;
    const controller = new AbortController();
    setAuditLoading(true); setAuditError(null);
    getOrderAudit(id, auditOffset, controller.signal).then((items) => { setAudit((current) => auditOffset ? [...current, ...items] : items); setAuditHasMore(items.length === 50); })
      .catch((caught: unknown) => { if (!controller.signal.aborted) setAuditError(explainError(caught, t)); })
      .finally(() => { if (!controller.signal.aborted) setAuditLoading(false); });
    return () => controller.abort();
  }, [id, order?.version, auditOffset, auditRetry]);

  useEffect(() => {
    if (order?.status !== "approved" || order.id !== id) { setDelivery(null); setDeliveryError(null); return; }
    const controller = new AbortController();
    setDeliveryLoading(true);
    getOrderHandoff(id, controller.signal).then((handoff) => { setDelivery(handoff.delivery); setDeliveryError(null); })
      .catch((caught: unknown) => { if (!controller.signal.aborted && !(caught instanceof ApiError && caught.status === 409)) setDeliveryError(explainError(caught, t)); })
      .finally(() => { if (!controller.signal.aborted) setDeliveryLoading(false); });
    return () => controller.abort();
  }, [id, order?.status, order?.version]);

  const acknowledgement = audit.find((item) => item.action === "1c_acknowledged");
  const acknowledgedStatus = acknowledgement?.data.status;
  const deliveryStatus = acknowledgedStatus === "accepted" || acknowledgedStatus === "rejected" ? acknowledgedStatus : delivery?.status ?? (auditLoading || deliveryLoading ? "loading" : "unknown");
  const successorId = audit.find((item) => item.action === "superseded")?.data.successor_order_id;

  function acceptOrder(updated: SupplierOrder) { setOrder(updated); setAuditOffset(0); setAudit([]); setError(null); }

  async function saveComment() {
    if (!order || !commentReason.trim() || comment === order.comment) return;
    setPending(true); setError(null);
    try { acceptOrder(await updateOrderComment(order.id, comment, commentReason.trim(), order.version)); setCommentEditing(false); setCommentReason(""); setNotice("Комментарий сохранён."); }
    catch (caught) { setError(explainError(caught, t)); }
    finally { setPending(false); }
  }

  async function createRevision() {
    if (!order || !revisionReason.trim()) return;
    setPending(true); setError(null);
    try { const next = await reviseOrder(order.id, revisionReason.trim(), order.version); onOpen(next.id); }
    catch (caught) { setError(explainError(caught, t)); }
    finally { setPending(false); }
  }

  async function approve() {
    if (!order || editingLineIds.size || commentEditing) return;
    setPending(true); setError(null);
    try { acceptOrder(await approveOrder(order.id, order.version)); setPreview(false); setNotice("Заказ утверждён. Теперь доступен экспорт; поставщику он не отправлен."); }
    catch (caught) { setError(explainError(caught, t)); setPreview(false); }
    finally { setPending(false); }
  }

  async function download(format: "csv" | "xlsx") {
    if (!order) return;
    setExporting(format); setError(null);
    try { await exportOrder(order, format); }
    catch (caught) { setError(explainError(caught, t)); }
    finally { setExporting(null); }
  }

  return <div className={styles.page}>
    <PageHeader title={t('Заказ поставщику', 'Жеткізушіге тапсырыс', 'Supplier order')} subtitle={order ? `${order.supplier_name} · ${t("редакция", "нұсқа", "revision")} ${order.revision}` : t('Проверка и утверждение заказа', 'Тапсырысты тексеру және бекіту', 'Review and approve order')} actions={<Button variant="secondary" size="sm" icon={<ArrowLeft size={15} />} onClick={onBack}>{t('К списку', 'Тізімге', 'Back to list')}</Button>} />
    {loading ? <OrderSkeleton detail /> : error && !order ? <Alert tone="danger" title={t('Не удалось открыть заказ', 'Тапсырыс ашылмады', 'Could not open order')} action={<Button size="sm" variant="secondary" onClick={() => setReload((value) => value + 1)}>{t('Повторить', 'Қайталау', 'Retry')}</Button>}>{error}</Alert> : order ? <>
      {error ? <Alert tone="danger" title={t('Действие не выполнено', 'Әрекет орындалмады', 'Action failed')} action={<Button size="sm" variant="secondary" onClick={() => setReload((value) => value + 1)}>{t('Обновить заказ', 'Тапсырысты жаңарту', 'Refresh order')}</Button>}>{error}</Alert> : null}
      {notice ? <Alert tone="success" onDismiss={() => setNotice(null)}>{notice}</Alert> : null}
      <Card title={order.supplier_name} subtitle={`${t("Создан", "Құрылған", "Created")} ${dateTime(order.created_at, locale)} · ${t("версия", "нұсқа", "version")} ${order.version}`} actions={<Badge tone={order.status === "approved" ? "success" : "warning"}>{order.status === "approved" ? t('Утверждён', 'Бекітілген', 'Approved') : t('Черновик', 'Жоба', 'Draft')}</Badge>}>
        <div className={styles.summary}><span>{t("Склад", "Қойма", "Warehouse")} <b className={styles.identifier}>{warehouseNames.get(order.warehouse_id) ?? order.external_references.warehouse.name}</b></span><span>{t("Позиций", "Позициялар", "Items")} <b>{order.lines.length}</b></span>{order.approved_at ? <span>{t("Утверждён", "Бекітілген", "Approved")} <b>{dateTime(order.approved_at, locale)}</b></span> : null}</div>
        {order.supersedes_order_id ? <p className={styles.comment}>{t("Предыдущая редакция:", "Алдыңғы нұсқа:", "Previous revision:")} <button type="button" className={styles.textButton} onClick={() => onOpen(order.supersedes_order_id!)}>{t('Открыть', 'Ашу', 'Open')}</button></p> : null}
        {typeof successorId === "string" ? <p className={styles.comment}>{t("Есть новая редакция:", "Жаңа нұсқа бар:", "A new revision exists:")} <button type="button" className={styles.textButton} onClick={() => onOpen(successorId)}>{t('Открыть', 'Ашу', 'Open')}</button></p> : null}
        {commentEditing ? <div className={styles.commentForm}>
          <label>{t('Комментарий', 'Пікір', 'Comment')}<textarea value={comment} maxLength={4000} onChange={(event) => setComment(event.target.value)} /></label>
          <label>{t('Причина изменения', 'Өзгерту себебі', 'Reason for change')}<input value={commentReason} maxLength={4000} onChange={(event) => setCommentReason(event.target.value)} /></label>
          <div className={styles.editorActions}><Button size="sm" loading={pending} disabled={comment === order.comment || !commentReason.trim()} onClick={() => void saveComment()}>{t('Сохранить комментарий', 'Пікірді сақтау', 'Save comment')}</Button><Button size="sm" variant="ghost" disabled={pending} onClick={() => { setComment(order.comment); setCommentReason(""); setCommentEditing(false); }}>{t('Отмена', 'Болдырмау', 'Cancel')}</Button></div>
        </div> : <div className={styles.commentRow}><p className={styles.comment}>{order.comment || t('Комментарий не добавлен', 'Пікір қосылмаған', 'No comment')}</p>{order.status === "draft" ? <Button size="sm" variant="ghost" onClick={() => setCommentEditing(true)}>{t('Изменить комментарий', 'Пікірді өзгерту', 'Edit comment')}</Button> : null}</div>}
      </Card>
      <Card title={t('Позиции заказа', 'Тапсырыс позициялары', 'Order items')} subtitle={order.status === "draft" ? t('Количество можно изменить, указав причину', 'Себебін көрсетіп санын өзгертуге болады', 'You can change quantity with a reason') : t('Утверждённый состав сохранён без изменений', 'Бекітілген құрам өзгеріссіз сақталды', 'Approved items are locked')}>
        <div className={styles.lines}>{order.lines.length ? order.lines.map((line) => <LineEditor key={line.id} order={order} line={line} onSaved={(updated) => { acceptOrder(updated); setEditingLineIds((current) => { const next = new Set(current); next.delete(line.id); return next; }); }} onEditingChange={(lineId, editing) => { setEditingLineIds((current) => { const next = new Set(current); if (editing) next.add(lineId); else next.delete(lineId); return next; }); if (editing) setPreview(false); }} onExplain={(recommendationId) => navigate(`/recommendations/${recommendationId}?${new URLSearchParams({ from: `${location.pathname}${location.search}${location.hash}` })}`)} />) : <EmptyState title={t('Все позиции исключены', 'Барлық позициялар алынып тасталды', 'All items removed')} text={t('Удалённые строки и причины остаются в истории заказа.', 'Жойылған жолдар мен себептер тапсырыс тарихында қалады.', 'Removed lines and reasons remain in order history.')} />}</div>
      </Card>
      {order.status === "draft" ? <Card title={t('Утверждение', 'Бекіту', 'Approval')} subtitle={t('После утверждения заказ и его строки станут неизменяемыми', 'Бекіткеннен кейін тапсырыс пен оның жолдары өзгермейді', 'After approval, the order and its lines cannot be changed')}>
        {editingLineIds.size || commentEditing ? <p className={styles.pendingEdit}>{t('Сохраните или отмените изменения перед утверждением.', 'Бекітпес бұрын өзгерістерді сақтаңыз немесе болдырмаңыз.', 'Save or cancel edits before approval.')}</p> : null}
        {preview ? <ActionPreview title={t('Проверка перед утверждением', 'Бекіту алдында тексеру', 'Review before approval')} items={[`${order.lines.length} ${t("позиций будут зафиксированы в редакции", "позиция нұсқада бекітіледі", "items will be locked in revision")} ${order.revision}.`, t('Заказ станет доступен для экспорта в CSV и XLSX.', 'Тапсырысты CSV және XLSX түрінде экспорттауға болады.', 'The order will be available for CSV and XLSX export.'), t('Заказ не отправляется поставщику автоматически.', 'Тапсырыс жеткізушіге автоматты түрде жіберілмейді.', 'The order is not sent to the supplier automatically.')]} actions={<><Button loading={pending} disabled={editingLineIds.size > 0 || commentEditing} onClick={() => void approve()}>{t('Утвердить заказ', 'Тапсырысты бекіту', 'Approve order')}</Button><Button variant="ghost" disabled={pending} onClick={() => setPreview(false)}>{t('Отмена', 'Болдырмау', 'Cancel')}</Button></>} /> : <Button variant="dark" disabled={order.lines.length === 0 || editingLineIds.size > 0 || commentEditing} onClick={() => setPreview(true)}>{t('Просмотреть и утвердить', 'Қарап, бекіту', 'Review and approve')}</Button>}
      </Card> : <Card title={t('Экспорт', 'Экспорт', 'Export')} subtitle={t('Файл для передачи в учётную систему; отправка поставщику остаётся ручным действием', 'Есеп жүйесіне арналған файл; жеткізушіге жіберу қолмен жасалады', 'File for the accounting system; sending it to the supplier is manual')}><div className={styles.exportActions}><Button variant="secondary" icon={<Download size={16} />} loading={exporting === "xlsx"} disabled={exporting !== null} onClick={() => void download("xlsx")}>{t('Скачать XLSX', 'XLSX жүктеу', 'Download XLSX')}</Button><Button variant="secondary" icon={<Download size={16} />} loading={exporting === "csv"} disabled={exporting !== null} onClick={() => void download("csv")}>{t('Скачать CSV', 'CSV жүктеу', 'Download CSV')}</Button></div></Card>}
      {order.status === "approved" ? <Card title={t('Обработка в 1С', '1С-та өңдеу', '1C processing')} subtitle={t('Статус локального пакета; сама передача требует отдельного адаптера', 'Жергілікті пакеттің мәртебесі; жіберу үшін бөлек адаптер қажет', 'Local package status; transfer requires a separate adapter')}>
        <div className={styles.delivery}><Badge tone={deliveryStatus === "accepted" ? "success" : deliveryStatus === "rejected" ? "danger" : deliveryStatus === "pending" ? "warning" : "neutral"}>{deliveryStatus === "accepted" ? t('Принят 1С', '1С қабылдады', 'Accepted by 1C') : deliveryStatus === "rejected" ? t('Отклонён 1С', '1С қабылдамады', 'Rejected by 1C') : deliveryStatus === "pending" ? t('Пакет ожидает обработки', 'Пакет өңдеуді күтуде', 'Package awaits processing') : deliveryStatus === "loading" ? t('Проверяем статус', 'Мәртебе тексерілуде', 'Checking status') : t('Статус недоступен', 'Мәртебе қолжетімсіз', 'Status unavailable')}</Badge>
          {delivery?.external_document_id ? <span>{t("Документ 1С:", "1С құжаты:", "1C document:")} <b>{delivery.external_document_id}</b></span> : null}
          {delivery?.message || typeof acknowledgement?.data.message === "string" ? <span>{delivery?.message || String(acknowledgement?.data.message)}</span> : null}</div>
        {deliveryError ? <Alert tone="warning">{t("Не удалось прочитать пакет 1С:", "1С пакеті оқылмады:", "Could not read the 1C package:")} {deliveryError}</Alert> : null}
        {deliveryStatus === "rejected" && !successorId ? revisionOpen ? <div className={styles.commentForm}><label>{t('Причина новой редакции', 'Жаңа нұсқа себебі', 'Reason for new revision')}<input value={revisionReason} maxLength={4000} onChange={(event) => setRevisionReason(event.target.value)} /></label><div className={styles.editorActions}><Button size="sm" loading={pending} disabled={!revisionReason.trim()} onClick={() => void createRevision()}>{t("Создать черновик редакции", "Нұсқа жобасын жасау", "Create revision draft")} {order.revision + 1}</Button><Button size="sm" variant="ghost" disabled={pending} onClick={() => setRevisionOpen(false)}>{t('Отмена', 'Болдырмау', 'Cancel')}</Button></div></div> : <Button size="sm" variant="secondary" onClick={() => setRevisionOpen(true)}>{t('Создать новую редакцию', 'Жаңа нұсқа жасау', 'Create new revision')}</Button> : null}
      </Card> : null}
      <Card title={t('История действий', 'Әрекеттер тарихы', 'Action history')} subtitle={t('Изменения и причины по этому заказу', 'Осы тапсырыс бойынша өзгерістер мен себептер', 'Changes and reasons for this order')}>
        {auditError ? <Alert tone="danger" action={<Button size="sm" variant="secondary" onClick={() => setAuditRetry((value) => value + 1)}>{t('Повторить', 'Қайталау', 'Retry')}</Button>}>{auditError}</Alert> : null}
        {auditLoading && !audit.length ? <div className={styles.skeletonRow}><i /><i /><i /></div> : audit.length ? <div className={styles.auditList}>{audit.map((item) => <div className={styles.auditItem} key={item.id}><div><strong>{auditAction(item.action, t)}</strong><span className={styles.secondary}>{dateTime(item.created_at, locale)} · {t("сотрудник", "қызметкер", "employee")} {item.actor_id}</span></div>{typeof item.data.reason === "string" ? <p>{t("Причина:", "Себебі:", "Reason:")} {item.data.reason}</p> : null}{item.action === "line_edited" && item.data.before && item.data.after ? <p>{String((item.data.before as Record<string, unknown>).name)}: {String((item.data.before as Record<string, unknown>).quantity)} → {String((item.data.after as Record<string, unknown>).quantity)}</p> : null}{item.action === "line_deleted" && item.data.before ? <p>{String((item.data.before as Record<string, unknown>).name)}: {String((item.data.before as Record<string, unknown>).quantity)} {String((item.data.before as Record<string, unknown>).unit)}</p> : null}</div>)}</div> : !auditError ? <p className={styles.secondary}>{t('Действий пока нет.', 'Әзірге әрекет жоқ.', 'No actions yet.')}</p> : null}
        {auditHasMore && !auditLoading && !auditError ? <Button size="sm" variant="ghost" onClick={() => setAuditOffset((value) => value + 50)}>{t('Показать ещё', 'Тағы көрсету', 'Show more')}</Button> : null}
      </Card>
    </> : null}
  </div>;
}

export function OrdersPage() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const id = params.get("id");
  function open(orderId: string) { const next = new URLSearchParams(params); next.set("id", orderId); setParams(next); }
  function back() { const next = new URLSearchParams(params); next.delete("id"); setParams(next, { replace: true }); }
  if (id && !uuid.test(id)) return <div className={styles.page}><PageHeader title={t('Заказ не найден', 'Тапсырыс табылмады', 'Order not found')} /><Alert tone="danger" action={<Button onClick={back}>{t('К списку', 'Тізімге', 'Back to list')}</Button>}>{t('Ссылка на заказ содержит неверный идентификатор.', 'Тапсырыс сілтемесіндегі идентификатор қате.', 'The order link has an invalid identifier.')}</Alert></div>;
  return id ? <OrderDetail id={id} onBack={back} onOpen={open} /> : <OrderList onOpen={open} />;
}
