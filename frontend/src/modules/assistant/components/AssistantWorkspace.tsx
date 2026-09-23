import { ArrowUp, History, Plus, RefreshCw, SlidersHorizontal } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Alert, Button, Modal, Select } from "../../../shared/ui";
import { getPackages, getWarehouses } from "../api/workspace";
import type { AssistantContext, ContextKey } from "../api/workspace";
import { useWorkspace } from "../hooks/useWorkspace";
import { NovaOrb } from "./NovaOrb";
import { AssistantAnswer } from "./AssistantAnswer";
import { ProposalCard, safeSourceUrl } from "./ProposalCard";
import styles from "./Workspace.module.css";
import hero from "../pages/AssistantPage.module.css";

const contextLabels: Record<ContextKey, string> = { warehouse_id: "Склад", run_id: "Расчёт", recommendation_id: "Рекомендация", order_id: "Заказ", package_id: "Пакет" };
const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
function incomingContext(pathname: string, search: string): AssistantContext {
  const params = new URLSearchParams(search);
  const result: AssistantContext = {};
  const pairs: [ContextKey, string | null][] = [["warehouse_id", params.get("warehouse_id") ?? params.get("warehouse")], ["run_id", params.get("run_id") ?? params.get("run")], ["package_id", params.get("package_id") ?? params.get("package")], ["order_id", params.get("order_id") ?? (pathname === "/orders" ? params.get("id") : null)], ["recommendation_id", params.get("recommendation_id") ?? pathname.match(/^\/recommendations\/([^/]+)$/)?.[1] ?? null]];
  for (const [key, value] of pairs) if (value && uuid.test(value)) result[key] = value;
  return result;
}
function Loading({ label }: { label: string }) { return <div className={styles.skeleton} role="status" aria-label={label} aria-busy="true"><i /><i /><i /></div>; }

export function AssistantWorkspace({ compact = false, decorated = true }: { compact?: boolean; decorated?: boolean }) {
  const [offset, setOffset] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const modalId = useId();
  const workspace = useWorkspace(offset);
  const question = workspace.draft;
  const { state, update, conversation, conversations, assistants } = workspace;
  const location = useLocation();
  const tail = useRef<HTMLDivElement>(null);
  const entered = useRef("");
  const warehouses = useQuery({ queryKey: ["assistant", workspace.userId, "warehouses"], queryFn: ({ signal }) => getWarehouses(signal), enabled: !!workspace.userId, retry: false });
  const packages = useQuery({ queryKey: ["assistant", workspace.userId, "packages"], queryFn: ({ signal }) => getPackages(signal), enabled: !!workspace.userId, retry: false });
  useEffect(() => {
    const entry = `${workspace.userId}:${location.pathname}${location.search}`;
    if (entered.current === entry || !workspace.userId || state.busy) return;
    entered.current = entry;
    const context = incomingContext(location.pathname, location.search);
    if (Object.keys(context).length) update({ context, allowData: false });
  }, [workspace.userId, location.pathname, location.search, state.busy]);
  const latestMessageId = conversation.data?.messages.at(-1)?.id;
  useEffect(() => { if (latestMessageId) tail.current?.scrollIntoView({ block: "nearest", behavior: "auto" }); }, [latestMessageId]);
  const chat = conversation.data;
  const assistant = assistants.data?.find((item) => item.id === state.assistantId);
  const initialLoading = !!state.activeId && conversation.isPending;
  const empty = !initialLoading && !chat?.messages.length;
  async function send(text: string) {
    await workspace.send(text);
  }
  function setContext(key: ContextKey, value: string) { const context = { ...state.context }; if (value) context[key] = value; else delete context[key]; update({ context, allowData: false }); }
  function contextName(key: ContextKey) {
    if (key === "warehouse_id") return warehouses.data?.find((item) => item.id === state.context[key])?.name ?? "Выбранный склад";
    if (key === "package_id") return packages.data?.items.find((item) => item.id === state.context[key])?.name ?? "Выбранный пакет";
    return `${contextLabels[key]} из открытого раздела`;
  }
  return <div className={`${styles.workspace} ${compact ? styles.compact : ""}`}>
    <div className={styles.toolbar}>
      <Button variant="ghost" size="sm" icon={<History size={16} />} aria-haspopup="dialog" aria-expanded={historyOpen} onClick={(event) => { event.currentTarget.focus(); setHistoryOpen(true); }}>История</Button>
      <span className={styles.chatTitle}>{chat?.title ?? "Новый диалог"}</span>
      <Button variant="ghost" size="sm" icon={<SlidersHorizontal size={16} />} aria-haspopup="dialog" aria-expanded={contextOpen} onClick={(event) => { event.currentTarget.focus(); setContextOpen(true); }}>Контекст</Button>
      <Button variant="secondary" size="sm" icon={<Plus size={16} />} disabled={state.busy} onClick={() => void workspace.newConversation()}>Новый чат</Button>
      {compact ? <Link to="/assistant">Открыть помощника</Link> : null}
    </div>
    <div className={styles.contextBar}>
      <span>{state.allowData ? "Учётные сводки разрешены" : "Без учётных сводок"}</span>
      {Object.keys(state.context).map((key) => <button type="button" key={key} onClick={() => setContextOpen(true)}>{contextName(key as ContextKey)}</button>)}
      {state.assistantId !== "auto" ? <button type="button" onClick={() => setContextOpen(true)}>{assistant?.title ?? "Выбрана тема"}</button> : null}
    </div>
    <Modal id={`${modalId}-history`} title="История диалогов" open={historyOpen} onOpenChange={setHistoryOpen} bodyScroll size="sm">
    {conversations.isPending ? <Loading label="Загружаем диалоги" /> : conversations.isError ? <Alert tone="warning" action={<Button variant="ghost" size="sm" onClick={() => void conversations.refetch()}>Повторить</Button>}>История недоступна: {conversations.error.message}</Alert> : null}
    <div className={styles.historyList}>
      <button type="button" disabled={state.busy} aria-current={!state.activeId ? "true" : undefined} onClick={() => { workspace.select(""); setHistoryOpen(false); }}>Новый диалог · черновик</button>
      {conversations.data?.map((item) => <button type="button" key={item.id} disabled={state.busy} aria-current={state.activeId === item.id ? "true" : undefined} onClick={() => { workspace.select(item.id); setHistoryOpen(false); }}>{item.title}</button>)}
    </div>
    {offset > 0 || (conversations.data?.length ?? 0) >= 50 ? <div className={styles.actions}><Button variant="ghost" size="sm" disabled={!offset || state.busy} onClick={() => setOffset(Math.max(0, offset - 50))}>Новые диалоги</Button><Button variant="ghost" size="sm" disabled={(conversations.data?.length ?? 0) < 50 || state.busy} onClick={() => setOffset(offset + 50)}>Ранние диалоги</Button></div> : null}
    {state.activeId ? <Button variant="ghost" size="sm" icon={<RefreshCw size={15} />} disabled={state.busy} onClick={() => void conversation.refetch()}>Обновить текущий диалог</Button> : null}
    </Modal>
    <Modal id={`${modalId}-context`} title="Контекст вопроса" open={contextOpen} onOpenChange={setContextOpen} bodyScroll size="sm" footer={<Button onClick={() => setContextOpen(false)}>Готово</Button>}>
      <div className={styles.controls}>
        <p className={styles.note}>Можно начать без настроек. Для вопроса о конкретных данных выберите склад или загруженный пакет.</p>
        <Select label="Склад для вопроса" value={state.context.warehouse_id ?? ""} disabled={state.busy} onChange={(event) => setContext("warehouse_id", event.target.value)}><option value="">Не выбран</option>{state.context.warehouse_id && !warehouses.data?.some((item) => item.id === state.context.warehouse_id) ? <option value={state.context.warehouse_id}>Склад из открытого раздела</option> : null}{warehouses.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>
        <Select label="Пакет файлов" value={state.context.package_id ?? ""} disabled={state.busy} onChange={(event) => setContext("package_id", event.target.value)}><option value="">Не выбран</option>{state.context.package_id && !packages.data?.items.some((item) => item.id === state.context.package_id) ? <option value={state.context.package_id}>Пакет из открытого раздела</option> : null}{packages.data?.items.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.status}</option>)}</Select>
        {warehouses.isError || packages.isError ? <p className={styles.note}>Часть списка данных недоступна. <button type="button" onClick={() => { void warehouses.refetch(); void packages.refetch(); }}>Обновить списки</button></p> : null}
        {Object.keys(state.context).map((key) => <div className={styles.contextItem} key={key}><span>{contextName(key as ContextKey)}</span><button type="button" disabled={state.busy} aria-label={`Убрать: ${contextLabels[key as ContextKey]}`} onClick={() => setContext(key as ContextKey, "")}>Убрать</button></div>)}
        <Link to="/data" onClick={() => setContextOpen(false)}>Загрузить файлы в источниках данных</Link>
        <label className={styles.permission}><input type="checkbox" checked={state.allowData} disabled={state.busy} onChange={(event) => update({ allowData: event.target.checked })} />Разрешить передачу учётных сводок AI-сервису</label>
        <p className={styles.note}>Только краткие сводки в пределах ваших прав — без исходных файлов и строк продаж. Выбранный контекст уточняет вопрос, но не ограничивает доступ. Текст вопроса передаётся AI-сервису и без этого разрешения: не вставляйте секреты.</p>
        <details className={styles.advanced}>
          <summary>Дополнительные настройки</summary>
          <Select label="Тема помощника" value={state.assistantId} disabled={state.busy || assistants.isPending} onChange={(event) => update({ assistantId: event.target.value })}>
            <option value="auto">Определять автоматически</option>
            {assistants.data?.filter((item) => item.id !== "auto").map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </Select>
          {assistant ? <p className={styles.note}>{assistant.description}</p> : null}
          {assistants.isError ? <Alert tone="warning" action={<Button size="sm" variant="ghost" onClick={() => void assistants.refetch()}>Повторить</Button>}>Список помощников недоступен.</Alert> : null}
        </details>
      </div>
    </Modal>
    <div className={`${styles.messages} ${empty && !compact && decorated ? hero.roomDecorated : ""}`} role="log" aria-label="История диалога" aria-busy={initialLoading}>
      {initialLoading ? <Loading label="Загружаем сообщения" /> : conversation.isError ? <Alert tone="danger" action={<Button variant="secondary" size="sm" onClick={() => void conversation.refetch()}>Обновить диалог</Button>}>{conversation.error.message}</Alert> : empty ? <div className={styles.empty}><div className={styles.smallOrb}><NovaOrb variant="mini" /></div><h2>Чем помочь с закупками?</h2><p>Разберём данные, расчёт или заказ.</p><Button variant="secondary" disabled={state.busy} onClick={() => void send("Что проверить перед расчётом пополнения склада?")}>Что проверить перед расчётом?</Button></div> : <>
        {chat?.has_older_messages ? <Button variant="secondary" size="sm" disabled={state.busy} onClick={() => void workspace.older()}>Загрузить более ранние сообщения</Button> : null}
        {chat?.messages.map((message) => <article key={message.id} className={message.role === "user" ? styles.mine : styles.theirs}><small>{message.role === "user" ? "Вы" : message.role === "system" ? "Система" : assistants.data?.find((item) => item.id === message.assistant_id)?.title ?? "Помощник"}</small>{message.role === "assistant" ? <AssistantAnswer content={message.content} animate={state.freshAnswer?.id === message.id} receivedAt={state.freshAnswer?.receivedAt} /> : <p>{message.content}</p>}
          {message.tool_calls.length ? <details><summary>Что проверено</summary><ul>{message.tool_calls.map((tool, index) => <li key={`${tool.name}-${index}`}><b>{tool.name}</b> · {tool.status}<p>{tool.summary}</p></li>)}</ul></details> : null}
          {message.sources.length ? <div className={styles.sources}><b>Источники</b>{message.sources.map((source, index) => { const url = safeSourceUrl(source.url); return url ? <Link key={index} to={url}>{source.title}</Link> : <span key={index}>{source.title} (ссылка недоступна)</span>; })}</div> : null}
        </article>)}
      </>}
      {chat?.proposals.map((proposal) => <ProposalCard key={proposal.id} proposal={proposal} busy={state.busy} onDecision={(item, decision) => void workspace.decide(item, decision)} />)}
      {state.busy ? <p className={styles.note} role="status">Запрос выполняется. Результат ещё не подтверждён сервером.</p> : null}
      <div ref={tail} />
    </div>
    {state.error ? <Alert tone="danger" title="Не удалось получить результат" action={state.retry ? <Button variant="secondary" size="sm" disabled={state.busy} onClick={() => void workspace.send("", true)}>Повторить тот же вопрос</Button> : <Button variant="secondary" size="sm" onClick={() => void conversation.refetch()}>Обновить диалог</Button>}>{state.error}{state.retry ? <p>Вопрос сохранён для повтора: {state.retry.input.content}</p> : null}</Alert> : null}
    <form className={styles.composer} onSubmit={(event) => { event.preventDefault(); void send(question); }}>
      <textarea value={question} onChange={(event) => workspace.setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(question); } }} rows={compact ? 1 : 2} maxLength={4000} aria-label="Вопрос помощнику" placeholder="Спросите о выбранных данных…" />
      <button type="submit" disabled={state.busy || !question.trim() || !workspace.userId || conversation.isError} aria-label="Отправить вопрос"><ArrowUp size={18} /></button>
    </form>
    <p className={styles.note}>Enter — отправить, Shift + Enter — новая строка. Действия выполняются только после вашего подтверждения.</p>
  </div>;
}
