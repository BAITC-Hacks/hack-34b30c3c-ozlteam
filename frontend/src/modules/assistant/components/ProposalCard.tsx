import { Link, useLocation } from "react-router-dom";
import { Badge, Button, Card } from "../../../shared/ui";
import { useI18n } from "../../../shared/i18n/I18nContext";
import type { Proposal } from "../api/workspace";
import styles from "./Workspace.module.css";

const labels: Record<string, [string, string, string]> = {
  warehouse_id: ['ID склада', 'Қойма ID', 'Warehouse ID'],
  warehouse_name: ['Склад', 'Қойма', 'Warehouse'],
  category_id: ['Категория', 'Санат', 'Category'],
  as_of: ['Дата среза', 'Дерек күні', 'Snapshot date'],
  history_days: ['История, дней', 'Тарих, күн', 'History, days'],
  package_id: ['ID пакета', 'Пакет ID', 'Package ID'],
  name: ['Название', 'Атауы', 'Name'],
  status: ['Статус', 'Мәртебе', 'Status'],
  row_count: ['Строк', 'Жолдар', 'Rows'],
  by_status: ['Готовность строк', 'Жолдардың дайындығы', 'Row readiness'],
  sku: ['Артикул', 'Артикул', 'SKU'],
  quantity: ['Количество', 'Саны', 'Quantity'],
  unit: ['Единица', 'Бірлік', 'Unit'],
  supplier_id: ['Поставщик', 'Жеткізуші', 'Supplier'],
  recommendation_id: ['Рекомендация', 'Ұсыным', 'Recommendation'],
  ready: ['Готово', 'Дайын', 'Ready'],
  limited: ['С ограничениями', 'Шектеулермен', 'Limited'],
  blocked: ['Требует исправления', 'Түзету қажет', 'Needs correction'],
  lines: ['Позиции', 'Позициялар', 'Items'],
  kind: ['Действие', 'Әрекет', 'Action'],
  warnings: ['Предупреждения', 'Ескертулер', 'Warnings'],
  run_id: ['Расчёт', 'Есеп', 'Run'],
  orders: ['Заказы', 'Тапсырыстар', 'Orders'],
  id: ['ID', 'ID', 'ID'],
  applied: ['Применён', 'Қолданылды', 'Applied'],
  validated: ['Проверен', 'Тексерілді', 'Validated'],
  notice: ['Примечание', 'Ескерту', 'Note'],
  supplier_name: ['Поставщик', 'Жеткізуші', 'Supplier'],
  line_count: ['Позиций', 'Позициялар', 'Items'],
  job_id: ['Фоновая задача', 'Фондық тапсырма', 'Background job'],
  queued: ['В очереди', 'Кезекте', 'Queued'],
  draft: ['Черновик', 'Жоба', 'Draft'],
  approved: ['Утверждён', 'Бекітілген', 'Approved'],
  comment: ['Комментарий', 'Пікір', 'Comment'],
  reason: ['Основание', 'Негіздеме', 'Reason'],
};
function label(key: string, t: ReturnType<typeof useI18n>["t"]): string {
  const words = labels[key];
  return words ? t(...words) : key;
}
export function safeSourceUrl(value: string): string | null {
  if (!value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f]/.test(value)) return null;
  try {
    const url = new URL(value, "https://workspace.invalid");
    if (url.origin !== "https://workspace.invalid" || !/^\/(?:$|data(?:\/|$)|inventory(?:\/|$)|recommendations(?:\/|$)|orders(?:\/|$)|assistant(?:\/|$))/.test(url.pathname)) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return null; }
}
function valueText(value: unknown, t: ReturnType<typeof useI18n>["t"]): string {
  if (value == null) return t("Не указано", "Көрсетілмеген", "Not specified");
  if (typeof value === "boolean") return value ? t("Да", "Иә", "Yes") : t("Нет", "Жоқ", "No");
  if (typeof value === "string") return label(value, t);
  return String(value);
}
function Preview({ value, depth = 0 }: { value: unknown; depth?: number }) {
  const { t } = useI18n();
  if (depth > 4) return <span>{t('Подробности доступны в исходном разделе.', 'Толығырақ бастапқы бөлімде көрсетілген.', 'Details are available in the source section.')}</span>;
  if (Array.isArray(value)) return <ol className={styles.previewList}>{value.map((item, index) => <li key={index}><Preview value={item} depth={depth + 1} /></li>)}</ol>;
  if (value && typeof value === "object") return <dl className={styles.previewFields}>{Object.entries(value).map(([key, item]) => <div key={key}><dt>{label(key, t)}</dt><dd><Preview value={item} depth={depth + 1} /></dd></div>)}</dl>;
  return <span>{valueText(value, t)}</span>;
}
function SupplierDraftPreview({ preview, test = false }: { preview: Record<string, unknown>; test?: boolean }) {
  const { t } = useI18n();
  const lines = Array.isArray(preview.lines) ? preview.lines : [];
  return <>
    <dl className={styles.previewFields}>
      <div><dt>{t('Поставщик', 'Жеткізуші', 'Supplier')}</dt><dd>{valueText(preview.supplier_name, t)}</dd></div>
      <div><dt>{t('Склад', 'Қойма', 'Warehouse')}</dt><dd>{valueText(preview.warehouse_name, t)}</dd></div>
    </dl>
    <ol className={styles.previewList}>{lines.map((line, index) => {
      if (!line || typeof line !== "object") return null;
      const item = line as Record<string, unknown>;
      return <li key={index}><strong>{valueText(item.name, t)}</strong><div>{t('Артикул: ', 'Артикул: ', 'SKU: ')}{valueText(item.sku, t)}</div><div>{valueText(item.quantity, t)} {valueText(item.unit, t)}</div></li>;
    })}</ol>
    <p className={styles.note}>{test ? t('Тестовые позиции и количества для проверки работы с заказом. Это не прогноз потребности.', 'Тапсырыспен жұмысты тексеруге арналған сынақ позициялары мен сандары. Бұл сұраныс болжамы емес.', 'Test items and quantities for checking the order flow. This is not a demand forecast.') : t('Товары и количества указаны вами. Это не расчёт потребности.', 'Тауарлар мен сандарды өзіңіз көрсеттіңіз. Бұл сұраныс есебі емес.', 'You specified these products and quantities. This is not a demand calculation.')}</p>
    {test && typeof preview.notice === "string" ? <p className={styles.note}>{preview.notice}</p> : null}
  </>;
}
export function ProposalCard({ proposal, busy, onDecision }: { proposal: Proposal; busy: boolean; onDecision: (proposal: Proposal, decision: "confirm" | "cancel") => void }) {
  const { t } = useI18n();
  const location = useLocation();
  const returnTo = `${location.pathname}${location.search}${location.hash}`;
  const result = proposal.result;
  const orders = Array.isArray(result?.orders) ? result.orders : [];
  const testDraft = proposal.kind === "create_test_supplier_draft";
  const supplierDraft = proposal.kind === "create_supplier_draft" || testDraft;
  return <Card title={proposal.title} subtitle={`${testDraft ? t('Тестовый заказ · ', 'Сынақ тапсырыс · ', 'Test order · ') : ""}${t("Версия предложения", "Ұсыныс нұсқасы", "Proposal version")} ${proposal.version}`} actions={<Badge tone={proposal.status === "confirmed" ? "success" : proposal.status === "pending" ? "warning" : "neutral"}>{proposal.status === "pending" ? t('Ждёт решения', 'Шешім күтуде', 'Awaiting decision') : proposal.status === "confirmed" ? t('Подтверждено', 'Расталды', 'Confirmed') : t('Отменено', 'Болдырылмады', 'Cancelled')}</Badge>}>
    <p>{proposal.summary}</p>
    {supplierDraft ? <SupplierDraftPreview preview={proposal.preview} test={testDraft} /> : <Preview value={proposal.preview} />}
    <p className={styles.note}>{proposal.kind === "calculate" ? t('Будет запущен сохранённый расчёт. Заказы не создаются.', 'Сақталған есеп іске қосылады. Тапсырыстар жасалмайды.', 'A saved calculation will run. No orders will be created.') : proposal.kind === "create_orders" || supplierDraft ? t('Создаётся черновик с указанными позициями. Откройте заказ, чтобы проверить, утвердить или удалить его.', 'Көрсетілген позициялармен жоба жасалады. Тексеру, бекіту немесе жою үшін тапсырысты ашыңыз.', 'A draft with the selected items will be created. Open the order to review, approve or delete it.') : t('Пакет будет применён к рабочим данным. Проверьте состав и ограничения выше.', 'Пакет жұмыс деректеріне қолданылады. Жоғарыдағы құрам мен шектеулерді тексеріңіз.', 'The package will be applied to working data. Review its contents and limitations above.')}</p>
    {proposal.status === "pending" ? <div className={styles.actions}><Button loading={busy} onClick={() => onDecision(proposal, "confirm")}>{testDraft ? t('Создать тестовый черновик', 'Сынақ жобасын жасау', 'Create test draft') : supplierDraft ? t('Создать черновик', 'Жоба жасау', 'Create draft') : t('Подтвердить действие', 'Әрекетті растау', 'Confirm action')}</Button><Button variant="secondary" disabled={busy} onClick={() => onDecision(proposal, "cancel")}>{t('Отменить предложение', 'Ұсынысты болдырмау', 'Cancel proposal')}</Button></div> : null}
    {result ? <div className={styles.result}><strong>{testDraft ? t('Тестовый черновик создан', 'Сынақ жобасы жасалды', 'Test draft created') : supplierDraft ? t('Черновик создан', 'Жоба жасалды', 'Draft created') : t('Результат', 'Нәтиже', 'Result')}</strong>{!supplierDraft ? <Preview value={result} /> : null}
      {typeof result.run_id === "string" ? <Link to={`/recommendations?run=${encodeURIComponent(result.run_id)}`}>{t('Открыть расчёт', 'Есепті ашу', 'Open run')}</Link> : null}
      {typeof result.package_id === "string" ? <Link to={`/data?package=${encodeURIComponent(result.package_id)}`}>{t('Открыть пакет', 'Пакетті ашу', 'Open package')}</Link> : null}
      {orders.map((order, index) => order && typeof order === "object" && "id" in order && typeof order.id === "string" ? <Link key={order.id} to={`/orders?id=${encodeURIComponent(order.id)}`} state={{ returnTo }}>{t("Открыть заказ", "Тапсырысты ашу", "Open order")} {index + 1}</Link> : null)}
    </div> : null}
  </Card>;
}
