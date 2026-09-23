import { ArrowLeft, Download, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { PageHeader } from "../../../app/PageHeader";
import { ActionPreview, Alert, Badge, Button, Card, EmptyState, Select, Table, Td, Th, Tr } from "../../../shared/ui";
import { ApiError } from "../../../shared/api/client";
import { approveOrder, deleteOrderLine, editOrderLine, exportOrder, getOrder, getOrderAudit, getOrderHandoff, listOrders, listWarehouses, reviseOrder, updateOrderComment } from "../api/orders";
import type { OrderAudit, OrderDelivery, OrderLine, SupplierOrder } from "../types";
import styles from "./OrdersPage.module.css";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dateTime = (value: string) => new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const auditAction = (action: string) => ({ created: "Заказ создан", edited: "Комментарий изменён", line_edited: "Количество изменено", line_deleted: "Позиция удалена", approved: "Заказ утверждён", revised_from: "Создана новая редакция", superseded: "Создана следующая редакция", "1c_acknowledged": "Ответ 1С получен" } as Record<string, string>)[action] ?? action;

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

function explainError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 403) return "У вашей роли нет прав на это действие. Обратитесь к администратору.";
    if (error.status === 409) return "Заказ изменился или уже утверждён. Обновите карточку и повторите действие.";
    if (error.status === 404) return "Заказ не найден. Вернитесь к списку.";
  }
  return error instanceof Error ? error.message : "Не удалось выполнить действие. Попробуйте ещё раз.";
}

function OrderSkeleton({ detail = false }: { detail?: boolean }) {
  return <div className={styles.skeleton} aria-busy="true" aria-label="Загружаем заказы">
    <Card><div className={styles.skeletonHeading} /><div className={styles.skeletonSub} /></Card>
    <Card>{Array.from({ length: detail ? 3 : 5 }, (_, index) => <div className={styles.skeletonRow} key={index}><i /><i /><i /></div>)}</Card>
  </div>;
}

function OrderList({ onOpen }: { onOpen: (id: string) => void }) {
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "all";
  const supplierId = params.get("supplier_id");
  const from = params.get("from");
  const supplierReturn = from?.startsWith("/data/catalogs?") ? from : `/data/catalogs?${new URLSearchParams({ tab: "suppliers", id: supplierId ?? "" })}`;
  const query = params.get("q") ?? "";
  const offset = Math.max(0, Number(params.get("offset") ?? 0) || 0);
  const [orders, setOrders] = useState<SupplierOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    listOrders(status, offset, controller.signal, supplierId).then(setOrders).catch((caught: unknown) => {
      if (!controller.signal.aborted) setError(explainError(caught));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [status, offset, supplierId, reload]);

  const visible = useMemo(() => orders.filter((order) =>
    `${order.supplier_name} ${order.id} ${order.lines.map((line) => `${line.sku} ${line.name}`).join(" ")}`
      .toLocaleLowerCase("ru").includes(query.toLocaleLowerCase("ru")),
  ), [orders, query]);

  function updateParam(name: string, value: string) {
    const next = new URLSearchParams(params);
    if (value && value !== "all") next.set(name, value);
    else next.delete(name);
    if (name === "status" || name === "supplier_id") next.delete("offset");
    setParams(next);
  }

  return <div className={styles.page}>
    <PageHeader title="Заказы поставщикам" subtitle="Черновики, утверждение и экспорт для учётной системы" actions={<Button variant="secondary" size="sm" icon={<RefreshCw size={15} />} onClick={() => setReload((value) => value + 1)}>Обновить</Button>} />
    <Card title="Список заказов" subtitle="Каждый заказ относится к одному поставщику и складу">
      {supplierId ? <Alert tone="info" title="Заказы выбранного поставщика" action={<Button variant="ghost" size="sm" onClick={() => updateParam("supplier_id", "")}>Все поставщики</Button>}>Фильтр сохраняется при смене статуса и страницы. <Link to={supplierReturn}>Вернуться в справочник</Link></Alert> : null}
      <div className={styles.filters}>
        <Select label="Статус" value={status} onChange={(event) => updateParam("status", event.target.value)}><option value="all">Все</option><option value="draft">Черновики</option><option value="approved">Утверждённые</option></Select>
        <label>Поиск на странице<input type="search" value={query} onChange={(event) => updateParam("q", event.target.value)} placeholder="Поставщик, товар или номер" /></label>
      </div>
      {loading ? <OrderSkeleton /> : error ? <Alert tone="danger" title="Не удалось загрузить заказы" action={<Button size="sm" variant="secondary" onClick={() => setReload((value) => value + 1)}>Повторить</Button>}>{error}</Alert> : <>
        {visible.length ?
        <Table><thead><Tr><Th>Поставщик</Th><Th>Создан</Th><Th numeric>Позиций</Th><Th>Статус</Th><Th>Заказ</Th></Tr></thead><tbody>{visible.map((order) => <Tr key={order.id}>
          <Td><strong>{order.supplier_name}</strong><small className={styles.secondary}>Редакция {order.revision}</small></Td>
          <Td>{dateTime(order.created_at)}</Td><Td numeric>{order.lines.length}</Td>
          <Td><Badge tone={order.status === "approved" ? "success" : "warning"}>{order.status === "approved" ? "Утверждён" : "Черновик"}</Badge></Td>
          <Td><button type="button" className={styles.textButton} onClick={() => onOpen(order.id)}>Открыть<span className="srOnly"> заказ {order.id}</span></button></Td>
        </Tr>)}</tbody></Table> : <EmptyState title={query ? "Совпадений нет" : offset > 0 ? "На этой странице заказов нет" : "Заказов пока нет"} text={query ? "Попробуйте изменить поиск или вернитесь на предыдущую страницу." : offset > 0 ? "Вернитесь на предыдущую страницу." : "Создайте черновики из рекомендаций после расчёта пополнения."} />}
        {orders.length > 0 || offset > 0 ? <div className={styles.pager}><span>{orders.length ? `Показаны ${offset + 1}–${offset + orders.length}` : "На этой странице заказов нет"}</span><div><Button variant="secondary" size="sm" disabled={offset === 0} onClick={() => updateParam("offset", String(Math.max(0, offset - 20)))}>Назад</Button><Button variant="secondary" size="sm" disabled={orders.length < 20} onClick={() => updateParam("offset", String(offset + 20))}>Далее</Button></div></div> : null}
      </>}
    </Card>
  </div>;
}

function LineEditor({ order, line, onSaved, onEditingChange }: { order: SupplierOrder; line: OrderLine; onSaved: (order: SupplierOrder) => void; onEditingChange: (lineId: string, editing: boolean) => void }) {
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
    } catch (caught) { setError(explainError(caught)); }
    finally { setPending(false); }
  }

  async function remove() {
    if (!reason.trim()) return;
    setPending(true); setError(null);
    try { onSaved(await deleteOrderLine(order.id, line.id, reason.trim(), order.version)); onEditingChange(line.id, false); }
    catch (caught) { setError(explainError(caught)); }
    finally { setPending(false); }
  }

  return <div className={styles.line}>
    <div className={styles.lineHead}><div><strong>{line.name}</strong><span className={styles.secondary}>{line.sku} · {line.unit}</span></div><div className={styles.lineValue}><strong>{quantity(line.quantity)} {line.unit}</strong><span className={styles.secondary}>Рекомендовано {quantity(line.recommended_quantity)}</span></div></div>
    {line.reason ? <p className={styles.lineReason}>Причина: {line.reason}</p> : null}
    {order.status === "draft" ? deleting ? <div className={styles.editor}>
      <label className={styles.wideField}>Причина удаления<input value={reason} maxLength={4000} onChange={(event) => setReason(event.target.value)} placeholder="Почему исключаем позицию из заказа" /></label>
      <div className={styles.editorActions}><Button size="sm" variant="secondary" loading={pending} disabled={!reason.trim()} onClick={() => void remove()}>Удалить позицию</Button><Button size="sm" variant="ghost" disabled={pending} onClick={() => { setDeleting(false); onEditingChange(line.id, false); setReason(""); setError(null); }}>Отмена</Button></div>
      <small className={styles.secondary}>Удаление останется в истории; рекомендация не вернётся в выбор для нового заказа.</small>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div> : editing ? <div className={styles.editor}>
      <label>Количество<input inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} aria-invalid={value.length > 0 && !validQuantity(value)} /></label>
      <label>Причина изменения<input value={reason} maxLength={4000} onChange={(event) => setReason(event.target.value)} placeholder="Например, согласована партия поставки" /></label>
      <div className={styles.editorActions}><Button size="sm" loading={pending} disabled={!ready} onClick={() => void save()}>Сохранить</Button><Button size="sm" variant="ghost" disabled={pending} onClick={() => { setEditing(false); onEditingChange(line.id, false); setValue(line.quantity); setReason(""); setError(null); }}>Отмена</Button></div>
      {value && !validQuantity(value) ? <small className={styles.errorText}>Введите положительное число: до 20 цифр и 6 знаков после запятой.</small> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div> : <div className={styles.lineActions}><Button size="sm" variant="ghost" onClick={() => { setValue(line.quantity); setEditing(true); onEditingChange(line.id, true); }}>Изменить количество</Button><Button size="sm" variant="ghost" onClick={() => { setDeleting(true); setReason(""); onEditingChange(line.id, true); }}>Удалить позицию</Button></div> : null}
  </div>;
}

function OrderDetail({ id, onBack, onOpen }: { id: string; onBack: () => void; onOpen: (id: string) => void }) {
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
  const [delivery, setDelivery] = useState<OrderDelivery | null>(null);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [revisionReason, setRevisionReason] = useState("");
  const [revisionOpen, setRevisionOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null); setOrder(null); setPreview(false); setEditingLineIds(new Set()); setAudit([]); setAuditOffset(0); setDelivery(null); setCommentEditing(false); setRevisionOpen(false); setNotice(null);
    getOrder(id, controller.signal).then((loaded) => { setOrder(loaded); setComment(loaded.comment); }).catch((caught: unknown) => { if (!controller.signal.aborted) setError(explainError(caught)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    listWarehouses(controller.signal).then((items) => setWarehouseNames(new Map(items.map((item) => [item.id, item.name])))).catch(() => undefined);
    return () => controller.abort();
  }, [id, reload]);

  useEffect(() => {
    if (!order || order.id !== id) return;
    const controller = new AbortController();
    setAuditLoading(true); setAuditError(null);
    getOrderAudit(id, auditOffset, controller.signal).then((items) => { setAudit((current) => auditOffset ? [...current, ...items] : items); setAuditHasMore(items.length === 50); })
      .catch((caught: unknown) => { if (!controller.signal.aborted) setAuditError(explainError(caught)); })
      .finally(() => { if (!controller.signal.aborted) setAuditLoading(false); });
    return () => controller.abort();
  }, [id, order?.version, auditOffset]);

  useEffect(() => {
    if (order?.status !== "approved" || order.id !== id) { setDelivery(null); setDeliveryError(null); return; }
    const controller = new AbortController();
    setDeliveryLoading(true);
    getOrderHandoff(id, controller.signal).then((handoff) => { setDelivery(handoff.delivery); setDeliveryError(null); })
      .catch((caught: unknown) => { if (!controller.signal.aborted && !(caught instanceof ApiError && caught.status === 409)) setDeliveryError(explainError(caught)); })
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
    catch (caught) { setError(explainError(caught)); }
    finally { setPending(false); }
  }

  async function createRevision() {
    if (!order || !revisionReason.trim()) return;
    setPending(true); setError(null);
    try { const next = await reviseOrder(order.id, revisionReason.trim(), order.version); onOpen(next.id); }
    catch (caught) { setError(explainError(caught)); }
    finally { setPending(false); }
  }

  async function approve() {
    if (!order || editingLineIds.size || commentEditing) return;
    setPending(true); setError(null);
    try { acceptOrder(await approveOrder(order.id, order.version)); setPreview(false); setNotice("Заказ утверждён. Теперь доступен экспорт; поставщику он не отправлен."); }
    catch (caught) { setError(explainError(caught)); setPreview(false); }
    finally { setPending(false); }
  }

  async function download(format: "csv" | "xlsx") {
    if (!order) return;
    setExporting(format); setError(null);
    try { await exportOrder(order, format); }
    catch (caught) { setError(explainError(caught)); }
    finally { setExporting(null); }
  }

  return <div className={styles.page}>
    <PageHeader title="Заказ поставщику" subtitle={order ? `${order.supplier_name} · редакция ${order.revision}` : "Проверка и утверждение заказа"} actions={<Button variant="secondary" size="sm" icon={<ArrowLeft size={15} />} onClick={onBack}>К списку</Button>} />
    {loading ? <OrderSkeleton detail /> : error && !order ? <Alert tone="danger" title="Не удалось открыть заказ" action={<Button size="sm" variant="secondary" onClick={() => setReload((value) => value + 1)}>Повторить</Button>}>{error}</Alert> : order ? <>
      {error ? <Alert tone="danger" title="Действие не выполнено" action={<Button size="sm" variant="secondary" onClick={() => setReload((value) => value + 1)}>Обновить заказ</Button>}>{error}</Alert> : null}
      {notice ? <Alert tone="success" onDismiss={() => setNotice(null)}>{notice}</Alert> : null}
      <Card title={order.supplier_name} subtitle={`Создан ${dateTime(order.created_at)} · версия ${order.version}`} actions={<Badge tone={order.status === "approved" ? "success" : "warning"}>{order.status === "approved" ? "Утверждён" : "Черновик"}</Badge>}>
        <div className={styles.summary}><span>Склад <b className={styles.identifier}>{warehouseNames.get(order.warehouse_id) ?? order.warehouse_id}</b></span><span>Позиций <b>{order.lines.length}</b></span>{order.approved_at ? <span>Утверждён <b>{dateTime(order.approved_at)}</b></span> : null}</div>
        {order.supersedes_order_id ? <p className={styles.comment}>Предыдущая редакция: <button type="button" className={styles.textButton} onClick={() => onOpen(order.supersedes_order_id!)}>Открыть</button></p> : null}
        {typeof successorId === "string" ? <p className={styles.comment}>Есть новая редакция: <button type="button" className={styles.textButton} onClick={() => onOpen(successorId)}>Открыть</button></p> : null}
        {commentEditing ? <div className={styles.commentForm}>
          <label>Комментарий<textarea value={comment} maxLength={4000} onChange={(event) => setComment(event.target.value)} /></label>
          <label>Причина изменения<input value={commentReason} maxLength={4000} onChange={(event) => setCommentReason(event.target.value)} /></label>
          <div className={styles.editorActions}><Button size="sm" loading={pending} disabled={comment === order.comment || !commentReason.trim()} onClick={() => void saveComment()}>Сохранить комментарий</Button><Button size="sm" variant="ghost" disabled={pending} onClick={() => { setComment(order.comment); setCommentReason(""); setCommentEditing(false); }}>Отмена</Button></div>
        </div> : <div className={styles.commentRow}><p className={styles.comment}>{order.comment || "Комментарий не добавлен"}</p>{order.status === "draft" ? <Button size="sm" variant="ghost" onClick={() => setCommentEditing(true)}>Изменить комментарий</Button> : null}</div>}
      </Card>
      <Card title="Позиции заказа" subtitle={order.status === "draft" ? "Количество можно изменить, указав причину" : "Утверждённый состав сохранён без изменений"}>
        <div className={styles.lines}>{order.lines.length ? order.lines.map((line) => <LineEditor key={line.id} order={order} line={line} onSaved={(updated) => { acceptOrder(updated); setEditingLineIds((current) => { const next = new Set(current); next.delete(line.id); return next; }); }} onEditingChange={(lineId, editing) => { setEditingLineIds((current) => { const next = new Set(current); if (editing) next.add(lineId); else next.delete(lineId); return next; }); if (editing) setPreview(false); }} />) : <EmptyState title="Все позиции исключены" text="Удалённые строки и причины остаются в истории заказа." />}</div>
      </Card>
      {order.status === "draft" ? <Card title="Утверждение" subtitle="После утверждения заказ и его строки станут неизменяемыми">
        {editingLineIds.size || commentEditing ? <p className={styles.pendingEdit}>Сохраните или отмените изменения перед утверждением.</p> : null}
        {preview ? <ActionPreview title="Проверка перед утверждением" items={[`${order.lines.length} позиций будут зафиксированы в редакции ${order.revision}.`, "Заказ станет доступен для экспорта в CSV и XLSX.", "Заказ не отправляется поставщику автоматически."]} actions={<><Button loading={pending} disabled={editingLineIds.size > 0 || commentEditing} onClick={() => void approve()}>Утвердить заказ</Button><Button variant="ghost" disabled={pending} onClick={() => setPreview(false)}>Отмена</Button></>} /> : <Button variant="dark" disabled={order.lines.length === 0 || editingLineIds.size > 0 || commentEditing} onClick={() => setPreview(true)}>Просмотреть и утвердить</Button>}
      </Card> : <Card title="Экспорт" subtitle="Файл для передачи в учётную систему; отправка поставщику остаётся ручным действием"><div className={styles.exportActions}><Button variant="secondary" icon={<Download size={16} />} loading={exporting === "xlsx"} disabled={exporting !== null} onClick={() => void download("xlsx")}>Скачать XLSX</Button><Button variant="secondary" icon={<Download size={16} />} loading={exporting === "csv"} disabled={exporting !== null} onClick={() => void download("csv")}>Скачать CSV</Button></div></Card>}
      {order.status === "approved" ? <Card title="Обработка в 1С" subtitle="Статус локального пакета; сама передача требует отдельного адаптера">
        <div className={styles.delivery}><Badge tone={deliveryStatus === "accepted" ? "success" : deliveryStatus === "rejected" ? "danger" : deliveryStatus === "pending" ? "warning" : "neutral"}>{deliveryStatus === "accepted" ? "Принят 1С" : deliveryStatus === "rejected" ? "Отклонён 1С" : deliveryStatus === "pending" ? "Пакет ожидает обработки" : deliveryStatus === "loading" ? "Проверяем статус" : "Статус недоступен"}</Badge>
          {delivery?.external_document_id ? <span>Документ 1С: <b>{delivery.external_document_id}</b></span> : null}
          {delivery?.message || typeof acknowledgement?.data.message === "string" ? <span>{delivery?.message || String(acknowledgement?.data.message)}</span> : null}</div>
        {deliveryError ? <Alert tone="warning">Не удалось прочитать пакет 1С: {deliveryError}</Alert> : null}
        {deliveryStatus === "rejected" && !successorId ? revisionOpen ? <div className={styles.commentForm}><label>Причина новой редакции<input value={revisionReason} maxLength={4000} onChange={(event) => setRevisionReason(event.target.value)} /></label><div className={styles.editorActions}><Button size="sm" loading={pending} disabled={!revisionReason.trim()} onClick={() => void createRevision()}>Создать черновик редакции {order.revision + 1}</Button><Button size="sm" variant="ghost" disabled={pending} onClick={() => setRevisionOpen(false)}>Отмена</Button></div></div> : <Button size="sm" variant="secondary" onClick={() => setRevisionOpen(true)}>Создать новую редакцию</Button> : null}
      </Card> : null}
      <Card title="История действий" subtitle="Изменения и причины по этому заказу">
        {auditError ? <Alert tone="danger" action={<Button size="sm" variant="secondary" onClick={() => setReload((value) => value + 1)}>Повторить</Button>}>{auditError}</Alert> : null}
        {auditLoading && !audit.length ? <div className={styles.skeletonRow}><i /><i /><i /></div> : audit.length ? <div className={styles.auditList}>{audit.map((item) => <div className={styles.auditItem} key={item.id}><div><strong>{auditAction(item.action)}</strong><span className={styles.secondary}>{dateTime(item.created_at)}</span></div>{typeof item.data.reason === "string" ? <p>Причина: {item.data.reason}</p> : null}{item.action === "line_edited" && item.data.before && item.data.after ? <p>{String((item.data.before as Record<string, unknown>).name)}: {String((item.data.before as Record<string, unknown>).quantity)} → {String((item.data.after as Record<string, unknown>).quantity)}</p> : null}</div>)}</div> : <p className={styles.secondary}>Действий пока нет.</p>}
        {auditHasMore && !auditLoading ? <Button size="sm" variant="ghost" onClick={() => setAuditOffset((value) => value + 50)}>Показать ещё</Button> : null}
      </Card>
    </> : null}
  </div>;
}

export function OrdersPage() {
  const [params, setParams] = useSearchParams();
  const id = params.get("id");
  function open(orderId: string) { const next = new URLSearchParams(params); next.set("id", orderId); setParams(next); }
  function back() { const next = new URLSearchParams(params); next.delete("id"); setParams(next, { replace: true }); }
  if (id && !uuid.test(id)) return <div className={styles.page}><PageHeader title="Заказ не найден" /><Alert tone="danger" action={<Button onClick={back}>К списку</Button>}>Ссылка на заказ содержит неверный идентификатор.</Alert></div>;
  return id ? <OrderDetail id={id} onBack={back} onOpen={open} /> : <OrderList onOpen={open} />;
}
