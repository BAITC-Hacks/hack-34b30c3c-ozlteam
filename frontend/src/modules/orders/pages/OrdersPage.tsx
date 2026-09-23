import { ArrowLeft, Download, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { PageHeader } from "../../../app/PageHeader";
import { ActionPreview, Alert, Badge, Button, Card, EmptyState, Table, Td, Th, Tr } from "../../../shared/ui";
import { ApiError } from "../../../shared/api/client";
import { approveOrder, editOrderLine, exportOrder, getOrder, listOrders, listWarehouses } from "../api/orders";
import type { OrderLine, SupplierOrder } from "../types";
import styles from "./OrdersPage.module.css";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dateTime = (value: string) => new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

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
    listOrders(status, offset, controller.signal).then(setOrders).catch((caught: unknown) => {
      if (!controller.signal.aborted) setError(explainError(caught));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [status, offset, reload]);

  const visible = useMemo(() => orders.filter((order) =>
    `${order.supplier_name} ${order.id} ${order.lines.map((line) => `${line.sku} ${line.name}`).join(" ")}`
      .toLocaleLowerCase("ru").includes(query.toLocaleLowerCase("ru")),
  ), [orders, query]);

  function updateParam(name: string, value: string) {
    const next = new URLSearchParams(params);
    if (value && value !== "all") next.set(name, value);
    else next.delete(name);
    if (name === "status") next.delete("offset");
    setParams(next);
  }

  return <div className={styles.page}>
    <PageHeader title="Заказы поставщикам" subtitle="Черновики, утверждение и экспорт для учётной системы" actions={<Button variant="secondary" size="sm" icon={<RefreshCw size={15} />} onClick={() => setReload((value) => value + 1)}>Обновить</Button>} />
    <Card title="Список заказов" subtitle="Каждый заказ относится к одному поставщику и складу">
      <div className={styles.filters}>
        <label>Статус<select value={status} onChange={(event) => updateParam("status", event.target.value)}><option value="all">Все</option><option value="draft">Черновики</option><option value="approved">Утверждённые</option></select></label>
        <label>Поиск на странице<input type="search" value={query} onChange={(event) => updateParam("q", event.target.value)} placeholder="Поставщик, товар или номер" /></label>
      </div>
      {loading ? <OrderSkeleton /> : error ? <Alert tone="danger" title="Не удалось загрузить заказы" action={<Button size="sm" variant="secondary" onClick={() => setReload((value) => value + 1)}>Повторить</Button>}>{error}</Alert> : visible.length ? <>
        <Table><thead><Tr><Th>Поставщик</Th><Th>Создан</Th><Th numeric>Позиций</Th><Th>Статус</Th><Th>Заказ</Th></Tr></thead><tbody>{visible.map((order) => <Tr key={order.id}>
          <Td><strong>{order.supplier_name}</strong><small className={styles.secondary}>Редакция {order.revision}</small></Td>
          <Td>{dateTime(order.created_at)}</Td><Td numeric>{order.lines.length}</Td>
          <Td><Badge tone={order.status === "approved" ? "success" : "warning"}>{order.status === "approved" ? "Утверждён" : "Черновик"}</Badge></Td>
          <Td><button type="button" className={styles.textButton} onClick={() => onOpen(order.id)}>Открыть<span className="srOnly"> заказ {order.id}</span></button></Td>
        </Tr>)}</tbody></Table>
        <div className={styles.pager}><span>Показаны {offset + 1}–{offset + orders.length}</span><div><Button variant="secondary" size="sm" disabled={offset === 0} onClick={() => updateParam("offset", String(Math.max(0, offset - 20)))}>Назад</Button><Button variant="secondary" size="sm" disabled={orders.length < 20} onClick={() => updateParam("offset", String(offset + 20))}>Далее</Button></div></div>
      </> : <EmptyState title={query ? "Совпадений нет" : "Заказов пока нет"} text={query ? "Попробуйте изменить поиск." : "Создайте черновики из рекомендаций после расчёта пополнения."} />}
    </Card>
  </div>;
}

function LineEditor({ order, line, onSaved }: { order: SupplierOrder; line: OrderLine; onSaved: (order: SupplierOrder) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(line.quantity);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const normalized = value.trim().replace(",", ".");
  const ready = validQuantity(value) && reason.trim().length > 0 && normalized !== line.quantity;

  async function save() {
    if (!ready) return;
    setPending(true); setError(null);
    try {
      onSaved(await editOrderLine(order.id, line.id, normalized, reason.trim(), order.version));
      setEditing(false); setReason("");
    } catch (caught) { setError(explainError(caught)); }
    finally { setPending(false); }
  }

  return <div className={styles.line}>
    <div className={styles.lineHead}><div><strong>{line.name}</strong><span className={styles.secondary}>{line.sku} · {line.unit}</span></div><div className={styles.lineValue}><strong>{quantity(line.quantity)} {line.unit}</strong><span className={styles.secondary}>Рекомендовано {quantity(line.recommended_quantity)}</span></div></div>
    {line.reason ? <p className={styles.lineReason}>Причина: {line.reason}</p> : null}
    {order.status === "draft" ? editing ? <div className={styles.editor}>
      <label>Количество<input inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} aria-invalid={value.length > 0 && !validQuantity(value)} /></label>
      <label>Причина изменения<input value={reason} maxLength={4000} onChange={(event) => setReason(event.target.value)} placeholder="Например, согласована партия поставки" /></label>
      <div className={styles.editorActions}><Button size="sm" loading={pending} disabled={!ready} onClick={() => void save()}>Сохранить</Button><Button size="sm" variant="ghost" disabled={pending} onClick={() => { setEditing(false); setValue(line.quantity); setReason(""); setError(null); }}>Отмена</Button></div>
      {value && !validQuantity(value) ? <small className={styles.errorText}>Введите положительное число: до 20 цифр и 6 знаков после запятой.</small> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div> : <Button size="sm" variant="ghost" onClick={() => { setValue(line.quantity); setEditing(true); }}>Изменить количество</Button> : null}
  </div>;
}

function OrderDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [order, setOrder] = useState<SupplierOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [preview, setPreview] = useState(false);
  const [pending, setPending] = useState(false);
  const [exporting, setExporting] = useState<"csv" | "xlsx" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [warehouseNames, setWarehouseNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null); setOrder(null); setPreview(false);
    getOrder(id, controller.signal).then(setOrder).catch((caught: unknown) => { if (!controller.signal.aborted) setError(explainError(caught)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    listWarehouses(controller.signal).then((items) => setWarehouseNames(new Map(items.map((item) => [item.id, item.name])))).catch(() => undefined);
    return () => controller.abort();
  }, [id, reload]);

  async function approve() {
    if (!order) return;
    setPending(true); setError(null);
    try { setOrder(await approveOrder(order.id, order.version)); setPreview(false); setNotice("Заказ утверждён. Теперь доступен экспорт; поставщику он не отправлен."); }
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
        {order.comment ? <p className={styles.comment}>{order.comment}</p> : null}
      </Card>
      <Card title="Позиции заказа" subtitle={order.status === "draft" ? "Количество можно изменить, указав причину" : "Утверждённый состав сохранён без изменений"}>
        <div className={styles.lines}>{order.lines.map((line) => <LineEditor key={`${line.id}:${order.version}`} order={order} line={line} onSaved={(updated) => { setOrder(updated); setError(null); }} />)}</div>
      </Card>
      {order.status === "draft" ? <Card title="Утверждение" subtitle="После утверждения заказ и его строки станут неизменяемыми">
        {preview ? <ActionPreview title="Проверка перед утверждением" items={[`${order.lines.length} позиций будут зафиксированы в редакции ${order.revision}.`, "Заказ станет доступен для экспорта в CSV и XLSX.", "Заказ не отправляется поставщику автоматически."]} actions={<><Button loading={pending} onClick={() => void approve()}>Утвердить заказ</Button><Button variant="ghost" disabled={pending} onClick={() => setPreview(false)}>Отмена</Button></>} /> : <Button variant="dark" disabled={order.lines.length === 0} onClick={() => setPreview(true)}>Просмотреть и утвердить</Button>}
      </Card> : <Card title="Экспорт" subtitle="Файл для передачи в учётную систему; отправка поставщику остаётся ручным действием"><div className={styles.exportActions}><Button variant="secondary" icon={<Download size={16} />} loading={exporting === "xlsx"} disabled={exporting !== null} onClick={() => void download("xlsx")}>Скачать XLSX</Button><Button variant="secondary" icon={<Download size={16} />} loading={exporting === "csv"} disabled={exporting !== null} onClick={() => void download("csv")}>Скачать CSV</Button></div></Card>}
    </> : null}
  </div>;
}

export function OrdersPage() {
  const [params, setParams] = useSearchParams();
  const id = params.get("id");
  function open(orderId: string) { const next = new URLSearchParams(params); next.set("id", orderId); setParams(next); }
  function back() { const next = new URLSearchParams(params); next.delete("id"); setParams(next, { replace: true }); }
  if (id && !uuid.test(id)) return <div className={styles.page}><PageHeader title="Заказ не найден" /><Alert tone="danger" action={<Button onClick={back}>К списку</Button>}>Ссылка на заказ содержит неверный идентификатор.</Alert></div>;
  return id ? <OrderDetail id={id} onBack={back} /> : <OrderList onOpen={open} />;
}
