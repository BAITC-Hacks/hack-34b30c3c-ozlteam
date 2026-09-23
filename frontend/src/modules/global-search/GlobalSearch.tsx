import { ArrowRight, ClipboardList, Search, ShoppingCart } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { apiRequest } from "../../shared/api/client";
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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Не удалось получить данные.";
}

export function GlobalSearch() {
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
      else { setOrders([]); setErrors((current) => [...current, `Заказы: ${errorMessage(orderResult.reason)}`]); }
      if (runResult.status === "fulfilled") setRuns(runResult.value);
      else { setRuns([]); setErrors((current) => [...current, `Расчёты: ${errorMessage(runResult.reason)}`]); }
      setLoading(false);
    });
    return () => controller.abort();
  }, [open, refresh]);

  const results = useMemo<Result[]>(() => [
    ...orders.map((order) => ({
      key: `order-${order.id}`,
      title: order.supplier_name,
      detail: `Заказ · ${order.status === "approved" ? "утверждён" : "черновик"} · ${order.lines.length} поз.`,
      searchText: `${order.id} ${order.supplier_name} ${order.lines.map((line) => `${line.sku} ${line.name}`).join(" ")}`,
      href: `/orders?id=${encodeURIComponent(order.id)}`,
      kind: "order" as const,
    })),
    ...runs.map((run) => ({
      key: `run-${run.id}`,
      title: `Расчёт от ${new Intl.DateTimeFormat("ru-RU").format(new Date(`${run.as_of}T00:00:00`))}`,
      detail: `Расчёт · ${run.status === "done" ? "готов" : run.status === "failed" ? "ошибка" : "в работе"}`,
      searchText: `${run.id} ${run.as_of} расчёт пополнение`,
      href: `/recommendations?run=${encodeURIComponent(run.id)}`,
      kind: "run" as const,
    })),
  ], [orders, runs]);
  const visible = useMemo(() => {
    const terms = query.trim().toLocaleLowerCase("ru").split(/\s+/).filter(Boolean);
    return results.filter((item) => terms.every((term) => item.searchText.toLocaleLowerCase("ru").includes(term))).slice(0, 50);
  }, [query, results]);

  function choose(result: Result) {
    setOpen(false);
    setQuery("");
    navigate(result.href);
  }

  return <>
    <button type="button" className={styles.trigger} onClick={() => setOpen(true)} aria-label="Открыть поиск по заказам и расчётам">
      <Search size={15} strokeWidth={1.8} aria-hidden="true" />
      <span>Поиск</span>
      <kbd>{navigator.platform.includes("Mac") ? "⌘K" : "Ctrl+K"}</kbd>
    </button>
    <Modal id="global-search" title="Поиск" open={open} onOpenChange={setOpen} size="md">
      <label className={styles.label} htmlFor="global-search-input">Заказ, товар, поставщик или расчёт</label>
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
          placeholder="Начните вводить…"
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded="true"
          aria-controls="global-search-results"
          aria-activedescendant={visible[selected] ? `global-result-${visible[selected].key}` : undefined}
        />
      </div>
      {loading ? <div className={styles.loading} role="status" aria-label="Загружаем результаты"><i /><i /><i /></div> : <>
        {errors.length ? <div className={styles.error} role="alert">{errors.map((message) => <p key={message}>{message}</p>)}<button type="button" onClick={() => setRefresh((value) => value + 1)}>Повторить</button></div> : null}
        <div id="global-search-results" className={styles.results} role="listbox" aria-label="Результаты поиска">
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
            <span><strong>{item.title}</strong><small>{item.detail}</small></span>
            <ArrowRight size={16} aria-hidden="true" />
          </button>)}
          {!visible.length ? <p className={styles.empty}>{errors.length === 2 ? "Данные недоступны. Повторите загрузку." : query.trim() ? "Совпадений нет. Попробуйте другое название, артикул или номер." : "Заказов и расчётов пока нет."}</p> : null}
        </div>
      </>}
      <p className={styles.hint}>↑ ↓ выбрать · Enter открыть · Esc закрыть</p>
    </Modal>
  </>;
}
