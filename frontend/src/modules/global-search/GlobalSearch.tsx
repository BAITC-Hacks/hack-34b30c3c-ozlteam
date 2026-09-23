import { ArrowRight, ClipboardList, Search, ShoppingCart } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { apiRequest } from "../../shared/api/client";
import { useI18n } from "../../shared/i18n/I18nContext";
import { Modal } from "../../shared/ui";
import styles from "./GlobalSearch.module.css";

interface Order {
  id: string;
  supplier_name: string;
  status: "draft" | "approved";
  lines: Array<{ sku: string; name: string }>;
}

interface Run {
  id: string;
  as_of: string;
  status: "queued" | "running" | "done" | "failed";
}

interface RunPage { items: Run[]; total: number }

interface Result {
  key: string;
  title: string;
  detail: string;
  match?: string;
  searchText: string;
  href: string;
  kind: "order" | "run";
}

async function loadOrders(signal: AbortSignal): Promise<Order[]> {
  const all: Order[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await apiRequest<Order[]>(`/v1/orders?limit=100&offset=${offset}`, { signal });
    all.push(...page);
    if (page.length < 100) return all;
  }
}

async function loadRuns(signal: AbortSignal): Promise<Run[]> {
  const all: Run[] = [];
  for (let offset = 0; ; offset += 200) {
    const page = await apiRequest<RunPage>(`/v1/replenishment/runs?limit=200&offset=${offset}`, { signal });
    all.push(...page.items);
    if (all.length >= page.total || page.items.length < 200) return all;
  }
}

function normalizeSearch(value: string): string {
  return value.toLocaleLowerCase("ru-RU").replaceAll("ё", "е");
}

export function GlobalSearch() {
  const { locale, t } = useI18n();
  const errorMessage = (error: unknown) => error instanceof Error ? error.message : t("Не удалось получить данные.", "Деректерді алу мүмкін болмады.", "Could not load data.");
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [selected, setSelected] = useState(0);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setErrors([]);
    Promise.allSettled([loadOrders(controller.signal), loadRuns(controller.signal)]).then(([orderResult, runResult]) => {
      if (controller.signal.aborted) return;
      if (orderResult.status === "fulfilled") setOrders(orderResult.value);
      else { setOrders([]); setErrors((current) => [...current, `${t("Заказы", "Тапсырыстар", "Orders")}: ${errorMessage(orderResult.reason)}`]); }
      if (runResult.status === "fulfilled") setRuns(runResult.value);
      else { setRuns([]); setErrors((current) => [...current, `${t("Расчёты", "Есептеулер", "Calculations")}: ${errorMessage(runResult.reason)}`]); }
      setLoading(false);
    });
    return () => controller.abort();
  }, [open, refresh, t]);

  const terms = useMemo(() => normalizeSearch(query.trim()).split(/\s+/).filter(Boolean), [query]);
  const results = useMemo<Result[]>(() => [
    ...orders.map((order) => {
      const matchedLine = terms.length
        ? order.lines.find((line) => terms.some((term) => normalizeSearch(`${line.sku} ${line.name}`).includes(term)))
        : undefined;
      return {
        key: `order-${order.id}`,
        title: order.supplier_name,
        detail: `${t("Заказ", "Тапсырыс", "Order")} № ${order.id.slice(-8)} · ${order.status === "approved" ? t("утверждён", "бекітілген", "approved") : t("черновик", "жоба", "draft")} · ${order.lines.length} ${t("поз.", "позиция", "items")}`,
        match: matchedLine ? `${matchedLine.name} · ${matchedLine.sku}` : undefined,
        searchText: `${order.id} ${order.supplier_name} ${order.lines.map((line) => `${line.sku} ${line.name}`).join(" ")}`,
        href: `/orders?id=${encodeURIComponent(order.id)}`,
        kind: "order" as const,
      };
    }),
    ...runs.map((run) => ({
      key: `run-${run.id}`,
      title: `${t("Расчёт от", "Есептеу күні", "Calculation on")} ${new Intl.DateTimeFormat(locale === "kk" ? "kk-KZ" : locale === "en" ? "en-US" : "ru-RU").format(new Date(`${run.as_of}T00:00:00`))}`,
      detail: `${t("Расчёт", "Есептеу", "Calculation")} № ${run.id.slice(-8)} · ${run.status === "done" ? t("готов", "дайын", "complete") : run.status === "failed" ? t("ошибка", "қате", "failed") : t("в работе", "орындалуда", "in progress")}`,
      searchText: `${run.id} ${run.as_of} расчёт пополнение есептеу толықтыру calculation replenishment`,
      href: `/recommendations?run=${encodeURIComponent(run.id)}`,
      kind: "run" as const,
    })),
  ], [orders, runs, terms, locale, t]);
  const visible = useMemo(() => {
    return results.filter((item) => terms.every((term) => normalizeSearch(item.searchText).includes(term))).slice(0, 50);
  }, [terms, results]);

  function choose(result: Result) {
    setOpen(false);
    setQuery("");
    navigate(result.href);
  }

  return <>
    <button type="button" className={styles.trigger} onClick={() => setOpen(true)} aria-label={t("Открыть поиск по заказам и расчётам", "Тапсырыстар мен есептеулерді іздеуді ашу", "Search orders and calculations")}>
      <Search size={15} strokeWidth={1.8} aria-hidden="true" />
      <span>{t("Поиск", "Іздеу", "Search")}</span>
      <kbd>{navigator.platform.includes("Mac") ? "⌘K" : "Ctrl+K"}</kbd>
    </button>
    <Modal id="global-search" title={t("Поиск", "Іздеу", "Search")} open={open} onOpenChange={setOpen} size="md">
      <label className={styles.label} htmlFor="global-search-input">{t("Заказ, товар, поставщик или расчёт", "Тапсырыс, тауар, жеткізуші немесе есептеу", "Order, product, supplier or calculation")}</label>
      <div className={styles.inputWrap}>
        <Search size={18} strokeWidth={1.8} aria-hidden="true" />
        <input
          ref={inputRef}
          id="global-search-input"
          type="search"
          value={query}
          onChange={(event) => { setQuery(event.target.value); setSelected(0); }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") { event.preventDefault(); setSelected((value) => Math.min(value + 1, Math.max(visible.length - 1, 0))); }
            if (event.key === "ArrowUp") { event.preventDefault(); setSelected((value) => Math.max(value - 1, 0)); }
            if (event.key === "Enter" && visible[selected]) { event.preventDefault(); choose(visible[selected]); }
          }}
          placeholder={t("Начните вводить…", "Іздеу сөзін енгізіңіз…", "Start typing…")}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded="true"
          aria-controls="global-search-results"
          aria-activedescendant={visible[selected] ? `global-result-${visible[selected].key}` : undefined}
        />
      </div>
      {loading ? <div className={styles.loading} role="status" aria-label={t("Загружаем результаты", "Нәтижелер жүктелуде", "Loading results")}><i /><i /><i /></div> : <>
        {errors.length ? <div className={styles.error} role="alert">{errors.map((message) => <p key={message}>{message}</p>)}<button type="button" onClick={() => setRefresh((value) => value + 1)}>{t("Повторить", "Қайталау", "Retry")}</button></div> : null}
        <div id="global-search-results" className={styles.results} role="listbox" aria-label={t("Результаты поиска", "Іздеу нәтижелері", "Search results")}>
          {visible.map((item, index) => <button
            id={`global-result-${item.key}`}
            key={item.key}
            type="button"
            role="option"
            aria-selected={index === selected}
            className={styles.result}
            onMouseEnter={() => setSelected(index)}
            onClick={() => choose(item)}
          >
            {item.kind === "order" ? <ShoppingCart size={18} aria-hidden="true" /> : <ClipboardList size={18} aria-hidden="true" />}
            <span><strong>{item.title}</strong><small>{item.detail}</small>{item.match ? <small className={styles.match}>{t("Товар", "Тауар", "Product")}: {item.match}</small> : null}</span>
            <ArrowRight size={16} aria-hidden="true" />
          </button>)}
          {!visible.length ? <p className={styles.empty}>{errors.length === 2 ? t("Данные недоступны. Повторите загрузку.", "Деректер қолжетімсіз. Қайта жүктеп көріңіз.", "Data is unavailable. Try loading again.") : query.trim() ? t("Совпадений нет. Попробуйте другое название, артикул или номер.", "Сәйкестік табылмады. Басқа атауды, артикулды немесе нөмірді енгізіңіз.", "No matches. Try another name, SKU or number.") : t("Заказов и расчётов пока нет.", "Әзірге тапсырыстар мен есептеулер жоқ.", "There are no orders or calculations yet.")}</p> : null}
        </div>
      </>}
      <p className={styles.hint}>{t("↑ ↓ выбрать · Enter открыть · Esc закрыть", "↑ ↓ таңдау · Enter ашу · Esc жабу", "↑ ↓ select · Enter open · Esc close")}</p>
    </Modal>
  </>;
}
