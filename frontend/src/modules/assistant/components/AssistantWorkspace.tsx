import { ArrowUp, History, Maximize2, Plus, RefreshCw, SlidersHorizontal } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Alert, Button, Modal, Select } from "../../../shared/ui";
import { useI18n } from "../../../shared/i18n/I18nContext";
import { getPackages, getWarehouses } from "../api/workspace";
import type { AssistantContext, ContextKey } from "../api/workspace";
import { useWorkspace } from "../hooks/useWorkspace";
import { toolLabel } from "../lib/toolLabels";
import { NovaOrb } from "./NovaOrb";
import { AssistantAnswer } from "./AssistantAnswer";
import { ProposalCard, safeSourceUrl } from "./ProposalCard";
import styles from "./Workspace.module.css";
import hero from "../pages/AssistantPage.module.css";

function toolSummary(name: string, summary: string, t: ReturnType<typeof useI18n>["t"]) {
  return name === "search_help" && summary === "Найдено разделов справки: 0"
    ? t("Подходящие разделы справки не найдены.", "Сәйкес анықтама бөлімдері табылмады.", "No matching help sections found.")
    : summary;
}
const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
function incomingContext(pathname: string, search: string): AssistantContext {
  const params = new URLSearchParams(search);
  const result: AssistantContext = {};
  const pairs: [ContextKey, string | null][] = [["warehouse_id", params.get("warehouse_id") ?? params.get("warehouse")], ["run_id", params.get("run_id") ?? params.get("run")], ["package_id", params.get("package_id") ?? params.get("package")], ["order_id", params.get("order_id") ?? (pathname === "/orders" ? params.get("id") : null)], ["recommendation_id", params.get("recommendation_id") ?? pathname.match(/^\/recommendations\/([^/]+)$/)?.[1] ?? null]];
  for (const [key, value] of pairs) if (value && uuid.test(value)) result[key] = value;
  return result;
}
function Loading({ label }: { label: string }) { return <div className={styles.skeleton} role="status" aria-label={label} aria-busy="true"><i /><i /><i /></div>; }

export function AssistantWorkspace({ compact = false, onOpenFull }: { compact?: boolean; onOpenFull?: () => void }) {
  const { t } = useI18n();
  const toolNames: Record<string, [string, string]> = {
    search_help: ["Анықтамадан іздеу", "Search help"], search_catalog: ["Анықтамалықтардан іздеу", "Search catalogs"], resolve_supplier: ["Жеткізушіні нақтылау", "Resolve supplier"], get_overview: ["Сатып алуға шолу", "Purchasing overview"], get_stock: ["Қалдықтарды тексеру", "Check stock"], get_inbound: ["Күтілетін жеткізілімдерді тексеру", "Check inbound deliveries"], list_runs: ["Есептерді іздеу", "Find runs"], get_run: ["Есепті қарау", "View run"], list_recommendations: ["Ұсынымдарды іздеу", "Find recommendations"], get_recommendation: ["Ұсынымды тексеру", "Check recommendation"], list_orders: ["Тапсырыстарды іздеу", "Find orders"], get_order: ["Тапсырысты қарау", "View order"], list_packages: ["Деректер пакеттерін іздеу", "Find data packages"], get_package: ["Деректер пакетін тексеру", "Check data package"], prepare_calculate: ["Есепті дайындау", "Prepare calculation"], prepare_create_orders: ["Тапсырыс жобаларын дайындау", "Prepare order drafts"], prepare_create_supplier_draft: ["Жеткізушіге жоба дайындау", "Prepare supplier draft"], prepare_create_test_supplier_draft: ["Сынақ тапсырысын дайындау", "Prepare test order"], prepare_apply_package: ["Деректерді жүктеуге дайындау", "Prepare data import"], calculate: ["Есепті бастау", "Start calculation"], create_orders: ["Тапсырыс жобаларын жасау", "Create order drafts"], create_supplier_draft: ["Жеткізушіге жоба жасау", "Create supplier draft"], create_test_supplier_draft: ["Сынақ жобасын жасау", "Create test draft"], apply_package: ["Деректер пакетін қолдану", "Apply data package"], plan: ["Әрекетті тексеру", "Check action"],
  };
  const localToolLabel = (name: string) => { const translated = toolNames[name]; return translated ? t(toolLabel(name), ...translated) : t("Действие помощника", "Көмекші әрекеті", "Assistant action"); };
  const localToolStatus = (status: string) => ({ success: t("Выполнено", "Орындалды", "Completed"), error: t("Не выполнено", "Орындалмады", "Failed"), confirmed: t("Подтверждено", "Расталды", "Confirmed"), cancelled: t("Отменено", "Болдырылмады", "Cancelled"), pending: t("Ожидает выполнения", "Орындалуын күтуде", "Pending") } as Record<string, string>)[status] ?? t("Статус недоступен", "Мәртебе қолжетімсіз", "Status unavailable");
  const contextLabels: Record<ContextKey, string> = { warehouse_id: t("Склад", "Қойма", "Warehouse"), run_id: t("Расчёт", "Есеп", "Run"), recommendation_id: t("Рекомендация", "Ұсыным", "Recommendation"), order_id: t("Заказ", "Тапсырыс", "Order"), package_id: t("Пакет", "Пакет", "Package") };
  const [offset, setOffset] = useState(0);
  const [dismissedHistoryErrorAt, setDismissedHistoryErrorAt] = useState(0);
  const [dismissedError, setDismissedError] = useState("");
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
  const pending = state.pendingMessage?.conversationId === state.activeId ? state.pendingMessage : null;
  useEffect(() => { if (latestMessageId || pending) tail.current?.scrollIntoView({ block: "nearest", behavior: "auto" }); }, [latestMessageId, pending?.id, pending?.error]);
  const chat = conversation.data;
  const assistant = assistants.data?.find((item) => item.id === state.assistantId);
  const initialLoading = !!state.activeId && conversation.isPending && !pending;
  const empty = !initialLoading && !chat?.messages.length && !pending;
  const historyErrorVisible = conversations.isError && conversations.errorUpdatedAt !== dismissedHistoryErrorAt;
  useEffect(() => { if (!state.error) setDismissedError(""); }, [state.error]);
  const resultErrorVisible = !!state.error && !pending?.error && state.error !== dismissedError;
  async function send(text: string) {
    await workspace.send(text);
  }
  function setContext(key: ContextKey, value: string) { const context = { ...state.context }; if (value) context[key] = value; else delete context[key]; update({ context, allowData: false }); }
  function setDataAccess(allowData: boolean) {
    update({ allowData, ...(allowData && state.assistantId === "help" ? { assistantId: "auto" } : {}) });
  }
  function contextName(key: ContextKey) {
    if (key === "warehouse_id") return warehouses.data?.find((item) => item.id === state.context[key])?.name ?? t("Выбранный склад", "Таңдалған қойма", "Selected warehouse");
    if (key === "package_id") return packages.data?.items.find((item) => item.id === state.context[key])?.name ?? t("Выбранный пакет", "Таңдалған пакет", "Selected package");
    return `${contextLabels[key]} ${t("из открытого раздела", "ашық бөлімнен", "from current page")}`;
  }
  return <div className={`${styles.workspace} ${compact ? styles.compact : ""}`}>
    <aside className={styles.sidebar} aria-label={t('Настройки диалога', 'Диалог баптаулары', 'Conversation settings')}>
    <div className={styles.toolbar}>
      <span className={styles.iconAction}>
        <button className={styles.iconActionButton} type="button" title={t('История диалогов', 'Диалогтар тарихы', 'Conversation history')} aria-label={t('История диалогов', 'Диалогтар тарихы', 'Conversation history')} aria-haspopup="dialog" aria-expanded={historyOpen} onClick={() => setHistoryOpen(true)}><History size={18} strokeWidth={1.8} /></button>
      </span>
      <span className={styles.chatTitle} title={chat?.title ?? t('Новый диалог', 'Жаңа диалог', 'New conversation')}>{chat?.title ?? t('Новый диалог', 'Жаңа диалог', 'New conversation')}</span>
      <span className={styles.iconAction}>
        <button className={styles.iconActionButton} type="button" title={t('Контекст вопроса', 'Сұрақ контексті', 'Question context')} aria-label={t('Контекст вопроса', 'Сұрақ контексті', 'Question context')} aria-haspopup="dialog" aria-expanded={contextOpen} onClick={() => setContextOpen(true)}><SlidersHorizontal size={18} strokeWidth={1.8} /></button>
      </span>
      <span className={styles.iconAction}>
        <button className={styles.iconActionButton} type="button" title={t('Новый диалог', 'Жаңа диалог', 'New conversation')} aria-label={t('Новый диалог', 'Жаңа диалог', 'New conversation')} disabled={state.busy} onClick={() => void workspace.newConversation()}><Plus size={18} strokeWidth={1.8} /></button>
      </span>
      {state.activeId ? <span className={styles.iconAction}>
        <button className={styles.iconActionButton} type="button" title={t('Обновить диалог', 'Диалогты жаңарту', 'Refresh conversation')} aria-label={t('Обновить диалог', 'Диалогты жаңарту', 'Refresh conversation')} disabled={state.busy} onClick={() => void conversation.refetch()}><RefreshCw size={17} strokeWidth={1.8} /></button>
      </span> : null}
      {compact ? <span className={styles.iconAction}>
        <Link className={styles.iconActionButton} to="/assistant" onClick={onOpenFull} title={t('Открыть помощника', 'Көмекшіні ашу', 'Open assistant')} aria-label={t('Открыть помощника', 'Көмекшіні ашу', 'Open assistant')}><Maximize2 size={17} strokeWidth={1.8} /></Link>
      </span> : null}
    </div>
    {state.allowData || Object.keys(state.context).length || state.assistantId !== "auto" ? <div className={styles.contextBar}>
      {state.allowData ? <span>{t('Учётные сводки разрешены', 'Есептік жиынтықтарға рұқсат берілген', 'Accounting summaries allowed')}</span> : null}
      {Object.keys(state.context).map((key) => <button type="button" key={key} onClick={() => setContextOpen(true)}>{contextName(key as ContextKey)}</button>)}
      {state.assistantId !== "auto" ? <button type="button" onClick={() => setContextOpen(true)}>{assistant?.title ?? t('Выбрана тема', 'Тақырып таңдалды', 'Topic selected')}</button> : null}
    </div> : null}
    <Modal id={`${modalId}-history`} title={t('История диалогов', 'Диалогтар тарихы', 'Conversation history')} open={historyOpen} onOpenChange={setHistoryOpen} bodyScroll size="sm">
    {conversations.isPending ? <Loading label={t('Загружаем диалоги', 'Диалогтар жүктелуде', 'Loading conversations')} /> : null}
    <div className={styles.historyList}>
      <button type="button" disabled={state.busy} aria-current={!state.activeId ? "true" : undefined} onClick={() => { workspace.select(""); setHistoryOpen(false); }}>{t('Новый диалог · черновик', 'Жаңа диалог · жоба', 'New conversation · draft')}</button>
      {conversations.data?.map((item) => <button type="button" key={item.id} disabled={state.busy} aria-current={state.activeId === item.id ? "true" : undefined} onClick={() => { workspace.select(item.id); setHistoryOpen(false); }}>{item.title}</button>)}
    </div>
    {offset > 0 || (conversations.data?.length ?? 0) >= 50 ? <div className={styles.actions}><Button variant="ghost" size="sm" disabled={!offset || state.busy} onClick={() => setOffset(Math.max(0, offset - 50))}>{t('Новые диалоги', 'Жаңа диалогтар', 'Newer conversations')}</Button><Button variant="ghost" size="sm" disabled={(conversations.data?.length ?? 0) < 50 || state.busy} onClick={() => setOffset(offset + 50)}>{t('Ранние диалоги', 'Ескі диалогтар', 'Older conversations')}</Button></div> : null}
    {state.activeId ? <Button variant="ghost" size="sm" icon={<RefreshCw size={15} />} disabled={state.busy} onClick={() => void conversation.refetch()}>{t('Обновить текущий диалог', 'Ағымдағы диалогты жаңарту', 'Refresh current conversation')}</Button> : null}
    </Modal>
    <Modal id={`${modalId}-context`} title={t('Контекст вопроса', 'Сұрақ контексті', 'Question context')} open={contextOpen} onOpenChange={setContextOpen} bodyScroll size="sm" footer={<Button onClick={() => setContextOpen(false)}>{t('Готово', 'Дайын', 'Done')}</Button>}>
      <div className={styles.controls}>
        <p className={styles.note}>{t('Можно начать без настроек. Для вопроса о конкретных данных выберите склад или загруженный пакет.', 'Баптаусыз бастауға болады. Нақты деректер туралы сұрақ үшін қойманы немесе жүктелген пакетті таңдаңыз.', 'You can start without settings. For a question about specific data, select a warehouse or imported package.')}</p>
        <Select label={t('Склад для вопроса', 'Сұраққа арналған қойма', 'Warehouse for question')} value={state.context.warehouse_id ?? ""} disabled={state.busy} onChange={(event) => setContext("warehouse_id", event.target.value)}><option value="">{t('Не выбран', 'Таңдалмаған', 'Not selected')}</option>{state.context.warehouse_id && !warehouses.data?.some((item) => item.id === state.context.warehouse_id) ? <option value={state.context.warehouse_id}>{t('Склад из открытого раздела', 'Ашық бөлімдегі қойма', 'Warehouse from current page')}</option> : null}{warehouses.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>
        <Select label={t('Пакет файлов', 'Файлдар пакеті', 'File package')} value={state.context.package_id ?? ""} disabled={state.busy} onChange={(event) => setContext("package_id", event.target.value)}><option value="">{t('Не выбран', 'Таңдалмаған', 'Not selected')}</option>{state.context.package_id && !packages.data?.items.some((item) => item.id === state.context.package_id) ? <option value={state.context.package_id}>{t('Пакет из открытого раздела', 'Ашық бөлімдегі пакет', 'Package from current page')}</option> : null}{packages.data?.items.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.status}</option>)}</Select>
        {warehouses.isError || packages.isError ? <p className={styles.note}>{t('Часть списка данных недоступна. ', 'Деректер тізімінің бір бөлігі қолжетімсіз. ', 'Part of the data list is unavailable. ')}<button type="button" onClick={() => { void warehouses.refetch(); void packages.refetch(); }}>{t('Обновить списки', 'Тізімдерді жаңарту', 'Refresh lists')}</button></p> : null}
        {Object.keys(state.context).map((key) => <div className={styles.contextItem} key={key}><span>{contextName(key as ContextKey)}</span><button type="button" disabled={state.busy} aria-label={`${t("Убрать:", "Алып тастау:", "Remove:")} ${contextLabels[key as ContextKey]}`} onClick={() => setContext(key as ContextKey, "")}>{t('Убрать', 'Алып тастау', 'Remove')}</button></div>)}
        <Link to="/data" onClick={() => setContextOpen(false)}>{t('Загрузить файлы в источниках данных', 'Дереккөздерге файл жүктеу', 'Upload files in data sources')}</Link>
        <label className={styles.permission}><input type="checkbox" checked={state.allowData} disabled={state.busy} onChange={(event) => setDataAccess(event.target.checked)} />{t('Разрешить передачу учётных сводок AI-сервису', 'Есептік жиынтықтарды AI қызметіне беруге рұқсат ету', 'Allow sharing accounting summaries with the AI service')}</label>
        <p className={styles.note}>{t('Только краткие сводки в пределах ваших прав — без исходных файлов и строк продаж. Выбранный контекст уточняет вопрос, но не ограничивает доступ. Текст вопроса передаётся AI-сервису и без этого разрешения: не вставляйте секреты.', 'Тек құқықтарыңыз шеңберіндегі қысқа жиынтықтар беріледі — бастапқы файлдар мен сатылым жолдары емес. Таңдалған контекст сұрақты нақтылайды, бірақ қолжетімділікті шектемейді. Сұрақ мәтіні бұл рұқсатсыз да AI қызметіне жіберіледі: құпия ақпаратты енгізбеңіз.', 'Only short summaries within your permissions are shared, without source files or sales rows. Selected context clarifies the question but does not limit access. The question text is sent to the AI service even without this permission: do not include secrets.')}</p>
        <details className={styles.advanced}>
          <summary>{t('Дополнительные настройки', 'Қосымша баптаулар', 'Additional settings')}</summary>
          <Select label={t('Тема помощника', 'Көмекші тақырыбы', 'Assistant topic')} value={state.assistantId} disabled={state.busy || assistants.isPending} onChange={(event) => update({ assistantId: event.target.value })}>
            <option value="auto">{t('Определять автоматически', 'Автоматты анықтау', 'Detect automatically')}</option>
            {assistants.data?.filter((item) => item.id !== "auto").map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </Select>
          {assistant ? <p className={styles.note}>{assistant.description}</p> : null}
          {assistants.isError ? <Alert tone="warning" action={<Button size="sm" variant="ghost" onClick={() => void assistants.refetch()}>{t('Повторить', 'Қайталау', 'Retry')}</Button>}>{t('Список помощников недоступен.', 'Көмекшілер тізімі қолжетімсіз.', 'Assistant list unavailable.')}</Alert> : null}
        </details>
      </div>
    </Modal>
    </aside>
    <section className={styles.chat} aria-label={t('Чат помощника', 'Көмекші чаты', 'Assistant chat')}>
    <div className={`${styles.messages} ${empty && !compact ? styles.emptyMessages : ""}`} role="log" aria-label={t('История диалога', 'Диалог тарихы', 'Conversation history')} aria-busy={initialLoading}>
      {initialLoading ? <Loading label={t('Загружаем сообщения', 'Хабарлар жүктелуде', 'Loading messages')} /> : conversation.isError && !pending ? <Alert tone="danger" action={<Button variant="secondary" size="sm" onClick={() => void conversation.refetch()}>{t('Обновить диалог', 'Диалогты жаңарту', 'Refresh conversation')}</Button>}>{conversation.error.message}</Alert> : empty ? <div className={compact ? styles.empty : hero.welcome}><div className={compact ? styles.smallOrb : hero.orbStage}><NovaOrb variant={compact ? "mini" : "hero"} /></div>{compact ? <p>{t('Спросите о данных, расчёте или заказе.', 'Деректер, есеп немесе тапсырыс туралы сұраңыз.', 'Ask about data, a run or an order.')}</p> : <><h2>{t('Помощник по закупкам', 'Сатып алу көмекшісі', 'Purchasing assistant')}</h2><p>{t('Спросите о данных, расчёте или заказе. История сохраняется на сервере.', 'Деректер, есеп немесе тапсырыс туралы сұраңыз. Тарих серверде сақталады.', 'Ask about data, a run or an order. History is saved on the server.')}</p></>}<Button variant="secondary" disabled={state.busy} onClick={() => void send(t('Что проверить перед расчётом пополнения склада?', 'Қойманы толықтыруды есептемес бұрын нені тексеру керек?', 'What should I check before calculating replenishment?'))}>{t('Что проверить перед расчётом?', 'Есептеуге дейін нені тексеру керек?', 'What should I check first?')}</Button></div> : <>
        {chat?.has_older_messages ? <Button variant="secondary" size="sm" disabled={state.busy} onClick={() => void workspace.older()}>{t('Загрузить более ранние сообщения', 'Ескі хабарларды жүктеу', 'Load older messages')}</Button> : null}
        {chat?.messages.map((message) => <article key={message.id} className={message.role === "user" ? styles.mine : styles.theirs}><small>{message.role === "user" ? t('Вы', 'Сіз', 'You') : message.role === "system" ? t('Система', 'Жүйе', 'System') : assistants.data?.find((item) => item.id === message.assistant_id)?.title ?? t('Помощник', 'Көмекші', 'Assistant')}</small>{message.role === "assistant" ? <AssistantAnswer content={message.content} animate={state.freshAnswer?.id === message.id} receivedAt={state.freshAnswer?.receivedAt} /> : <p>{message.content}</p>}
          {message.tool_calls.length ? <details><summary>{t('Что проверено', 'Не тексерілді', 'What was checked')}</summary><ul>{message.tool_calls.map((tool, index) => <li key={`${tool.name}-${index}`}><b>{localToolLabel(tool.name)}</b> · {localToolStatus(tool.status)}<p>{tool.status === "error" ? t('Не удалось выполнить действие. Уточните запрос или повторите попытку.', 'Әрекет орындалмады. Сұрауды нақтылаңыз немесе қайталаңыз.', 'Action failed. Refine the request or try again.') : toolSummary(tool.name, tool.summary, t)}</p></li>)}</ul></details> : null}
          {message.sources.length ? <div className={styles.sources}><b>{t('Источники', 'Дереккөздер', 'Sources')}</b>{message.sources.map((source, index) => { const url = safeSourceUrl(source.url); return url ? <Link key={index} to={url}>{source.title}</Link> : <span key={index}>{source.title} ({t("ссылка недоступна", "сілтеме қолжетімсіз", "link unavailable")})</span>; })}</div> : null}
        </article>)}
      </>}
      {chat?.proposals.map((proposal) => <ProposalCard key={proposal.id} proposal={proposal} busy={state.busy} onDecision={(item, decision) => void workspace.decide(item, decision)} />)}
      {pending && !chat?.messages.some((message) => message.id === pending.existingMessageId) ? <article className={styles.mine} aria-label={t('Отправленный вопрос', 'Жіберілген сұрақ', 'Sent question')}><small>{t('Вы', 'Сіз', 'You')}</small><p>{pending.content}</p></article> : null}
      {pending?.error ? <article className={`${styles.theirs} ${styles.failedAnswer}`} role="alert"><small>{t("Помощник · запрос не выполнен", "Көмекші · сұрау орындалмады", "Assistant · request failed")}</small><p>{t("Не удалось ответить:", "Жауап беру мүмкін болмады:", "Could not answer:")} {pending.error}</p><Button variant="ghost" size="sm" disabled={state.busy} onClick={() => void workspace.send(state.retry ? "" : pending.content, !!state.retry)}>{t('Повторить вопрос', 'Сұрақты қайталау', 'Retry question')}</Button></article> : null}
      {state.busy ? <p className={styles.note} role="status">{pending ? t("Помощник готовит ответ…", "Көмекші жауап дайындауда…", "Assistant is preparing an answer…") : t("Запрос выполняется. Результат ещё не подтверждён сервером.", "Сұрау орындалуда. Нәтижені сервер әлі растаған жоқ.", "Request in progress. The server has not confirmed the result yet.")}</p> : null}
      <div ref={tail} />
    </div>
    {historyErrorVisible ? <Alert className={styles.statusNotice} tone="warning" onDismiss={() => setDismissedHistoryErrorAt(conversations.errorUpdatedAt)} dismissLabel={t('Закрыть сообщение об ошибке истории', 'Тарих қатесі туралы хабарды жабу', 'Dismiss history error')}>{t('История диалогов недоступна. ', 'Диалогтар тарихы қолжетімсіз. ', 'Conversation history is unavailable. ')}<button className={styles.noticeAction} type="button" onClick={() => void conversations.refetch()}>{t('Повторить', 'Қайталау', 'Retry')}</button></Alert> : resultErrorVisible ? <Alert className={styles.statusNotice} tone="danger" onDismiss={() => setDismissedError(state.error)} dismissLabel={t('Закрыть сообщение об ошибке диалога', 'Диалог қатесі туралы хабарды жабу', 'Dismiss conversation error')}>{t('Не удалось получить результат: ', 'Нәтиже алынбады: ', 'Could not get result: ')}{state.error} <button className={styles.noticeAction} type="button" disabled={state.busy} onClick={() => { if (state.retry) void workspace.send("", true); else void conversation.refetch(); }}>{state.retry ? t('Повторить вопрос', 'Сұрақты қайталау', 'Retry question') : t('Обновить диалог', 'Диалогты жаңарту', 'Refresh conversation')}</button></Alert> : null}
    {state.allowData ? <div className={styles.dataAccess}>
      <span>{t('Доступ к данным разрешён для этого диалога', 'Осы диалог үшін деректерге рұқсат берілді', 'Data access is allowed for this conversation')}</span>
      <Button variant="ghost" size="sm" disabled={state.busy} onClick={() => setDataAccess(false)}>{t('Отозвать доступ', 'Рұқсатты қайтарып алу', 'Revoke access')}</Button>
    </div> : <Alert className={styles.accessNotice} tone="info" title={t('Разрешите доступ, чтобы работать с заказами', 'Тапсырыстармен жұмыс істеу үшін рұқсат беріңіз', 'Allow access to work with orders')}>
      <p>{t('Помощник сможет передавать поставщиков, товары и ограниченные учётные сводки настроенному ИИ-провайдеру в пределах ваших прав. Без доступа можно продолжить справочный диалог.', 'Көмекші жеткізушілерді, тауарларды және шектеулі есептік жиынтықтарды құқықтарыңыз шеңберінде бапталған AI провайдеріне бере алады. Рұқсатсыз анықтамалық диалогты жалғастыруға болады.', 'The assistant can share suppliers, products and limited accounting summaries with the configured AI provider within your permissions. You can continue a help conversation without access.')}</p>
      <Button variant="secondary" size="sm" disabled={state.busy || !workspace.userId} onClick={() => setDataAccess(true)}>{t('Разрешить доступ к данным', 'Деректерге рұқсат беру', 'Allow data access')}</Button>
      <p className={styles.note}>{t('Затем отправьте запрос. Разрешение само не отправляет сообщения и не создаёт заказы.', 'Содан кейін сұрау жіберіңіз. Рұқсаттың өзі хабар жібермейді және тапсырыс жасамайды.', 'Then send a request. Permission alone does not send messages or create orders.')}</p>
    </Alert>}
    <form className={styles.composer} onSubmit={(event) => { event.preventDefault(); void send(question); }}>
      <textarea value={question} onChange={(event) => workspace.setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(question); } }} rows={compact ? 1 : 2} maxLength={4000} aria-label={t('Вопрос помощнику', 'Көмекшіге сұрақ', 'Question for assistant')} placeholder={t('Спросите о выбранных данных…', 'Таңдалған деректер туралы сұраңыз…', 'Ask about the selected data…')} />
      <button type="submit" disabled={state.busy || !question.trim() || !workspace.userId || conversation.isError} aria-label={t('Отправить вопрос', 'Сұрақты жіберу', 'Send question')}><ArrowUp size={18} /></button>
    </form>
    {!compact ? <p className={styles.note}>{t('Enter — отправить, Shift + Enter — новая строка. Действия выполняются только после вашего подтверждения.', 'Enter — жіберу, Shift + Enter — жаңа жол. Әрекеттер тек растағаннан кейін орындалады.', 'Enter to send, Shift + Enter for a new line. Actions run only after your confirmation.')}</p> : null}
    </section>
  </div>;
}
