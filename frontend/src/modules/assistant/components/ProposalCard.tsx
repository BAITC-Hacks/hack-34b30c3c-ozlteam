import { Link } from "react-router-dom";
import { Badge, Button, Card } from "../../../shared/ui";
import type { Proposal } from "../api/workspace";
import styles from "./Workspace.module.css";

const labels: Record<string, string> = {
  warehouse_id: "ID склада", warehouse_name: "Склад", category_id: "Категория", as_of: "Дата среза", history_days: "История, дней",
  package_id: "ID пакета", name: "Название", status: "Статус", row_count: "Строк", by_status: "Готовность строк",
  sku: "Артикул", quantity: "Количество", unit: "Единица", supplier_id: "Поставщик", recommendation_id: "Рекомендация",
  ready: "Готово", limited: "С ограничениями", blocked: "Требует исправления", lines: "Позиции", kind: "Действие",
  warnings: "Предупреждения", run_id: "Расчёт", orders: "Заказы", id: "ID", applied: "Применён", validated: "Проверен",
  notice: "Примечание", supplier_name: "Поставщик", line_count: "Позиций", job_id: "Фоновая задача", queued: "В очереди",
};
export function safeSourceUrl(value: string): string | null {
  if (!value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f]/.test(value)) return null;
  try {
    const url = new URL(value, "https://workspace.invalid");
    if (url.origin !== "https://workspace.invalid" || !/^\/(?:$|data(?:\/|$)|inventory(?:\/|$)|recommendations(?:\/|$)|orders(?:\/|$)|assistant(?:\/|$))/.test(url.pathname)) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return null; }
}
function valueText(value: unknown): string {
  if (value == null) return "Не указано";
  if (typeof value === "boolean") return value ? "Да" : "Нет";
  if (typeof value === "string") return labels[value] ?? value;
  return String(value);
}
function Preview({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (depth > 4) return <span>Подробности доступны в исходном разделе.</span>;
  if (Array.isArray(value)) return <ol className={styles.previewList}>{value.map((item, index) => <li key={index}><Preview value={item} depth={depth + 1} /></li>)}</ol>;
  if (value && typeof value === "object") return <dl className={styles.previewFields}>{Object.entries(value).map(([key, item]) => <div key={key}><dt>{labels[key] ?? key}</dt><dd><Preview value={item} depth={depth + 1} /></dd></div>)}</dl>;
  return <span>{valueText(value)}</span>;
}
export function ProposalCard({ proposal, busy, onDecision }: { proposal: Proposal; busy: boolean; onDecision: (proposal: Proposal, decision: "confirm" | "cancel") => void }) {
  const result = proposal.result;
  const orders = Array.isArray(result?.orders) ? result.orders : [];
  return <Card title={proposal.title} subtitle={`Версия предложения ${proposal.version}`} actions={<Badge tone={proposal.status === "confirmed" ? "success" : proposal.status === "pending" ? "warning" : "neutral"}>{proposal.status === "pending" ? "Ждёт решения" : proposal.status === "confirmed" ? "Подтверждено" : "Отменено"}</Badge>}>
    <p>{proposal.summary}</p>
    <Preview value={proposal.preview} />
    <p className={styles.note}>{proposal.kind === "calculate" ? "Будет запущен сохранённый расчёт. Заказы не создаются." : proposal.kind === "create_orders" ? "Будут созданы только черновики. Утверждение и отправка поставщику не выполняются." : "Пакет будет применён к рабочим данным. Проверьте состав и ограничения выше."}</p>
    {proposal.status === "pending" ? <div className={styles.actions}><Button disabled={busy} onClick={() => onDecision(proposal, "confirm")}>Подтвердить действие</Button><Button variant="secondary" disabled={busy} onClick={() => onDecision(proposal, "cancel")}>Отменить предложение</Button></div> : null}
    {result ? <div className={styles.result}><strong>Результат</strong><Preview value={result} />
      {typeof result.run_id === "string" ? <Link to={`/recommendations?run=${encodeURIComponent(result.run_id)}`}>Открыть расчёт</Link> : null}
      {typeof result.package_id === "string" ? <Link to={`/data?package=${encodeURIComponent(result.package_id)}`}>Открыть пакет</Link> : null}
      {orders.map((order, index) => order && typeof order === "object" && "id" in order && typeof order.id === "string" ? <Link key={order.id} to={`/orders?id=${encodeURIComponent(order.id)}`}>Открыть заказ {index + 1}</Link> : null)}
    </div> : null}
  </Card>;
}
