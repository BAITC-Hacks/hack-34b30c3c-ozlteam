import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { Badge, Button, EmptyState, ErrorState, Select, Table, Tabs, Td, Th, Tr } from "../../../shared/ui";
import { dataQualityReason } from "../../catalogs";
import { packageIssues, packageProducts } from "../api/packages";
import type { ImportPackage, PackageIssue, PackagePage, PackageProduct, ReadinessStatus } from "../api/packages";
import styles from "./PackageImports.module.css";

export const readinessName: Record<ReadinessStatus, string> = { ready: "Готово", limited: "С ограничениями", blocked: "Нужно исправить" };

export function PackageSkeleton() {
  return <div className={styles.skeleton} aria-busy="true" aria-label="Загружаем пакет"><div aria-hidden="true"><i /><i /><i /></div><div aria-hidden="true"><i /><i /><i /></div><div aria-hidden="true"><i /><i /><i /></div></div>;
}

export function PackageReadiness({ value }: { value: ImportPackage }) {
  const [params, setParams] = useSearchParams();
  const tab = params.get("package_tab") === "issues" ? "issues" : "products";
  const status = ["ready", "limited", "blocked"].includes(params.get("package_status") ?? "") ? params.get("package_status")! : "";
  const q = (params.get("package_q") ?? "").slice(0, 200);
  const rawOffset = Number(params.get("package_offset") ?? 0);
  const offset = Number.isInteger(rawOffset) && rawOffset > 0 ? rawOffset : 0;
  const [search, setSearch] = useState(q);
  const [products, setProducts] = useState<PackagePage<PackageProduct> | null>(null);
  const [issues, setIssues] = useState<PackagePage<PackageIssue> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [loadedKey, setLoadedKey] = useState("");
  const key = `${value.id}:${value.status}:${tab}:${q}:${status}:${offset}:${reload}`;

  useEffect(() => { setSearch(q); }, [q]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null);
    const request = tab === "issues"
      ? packageIssues(value.id, offset, controller.signal).then((result) => { if (!controller.signal.aborted) setIssues(result); })
      : packageProducts(value.id, { offset, q, status }, controller.signal).then((result) => { if (!controller.signal.aborted) setProducts(result); });
    request.then(() => { if (!controller.signal.aborted) setLoadedKey(key); })
      .catch((caught: unknown) => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Не удалось загрузить результат проверки."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [value.id, value.status, tab, offset, q, status, reload, key]);

  function update(name: string, text: string) {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (text) next.set(name, text); else next.delete(name);
      if (name !== "package_offset") next.delete("package_offset");
      return next;
    }, { replace: true });
  }

  const current = tab === "issues" ? issues : products;
  const total = loadedKey === key ? current?.total ?? 0 : 0;
  const count = loadedKey === key ? current?.items.length ?? 0 : 0;
  const summary = value.summary;
  const byStatus = summary.by_status && typeof summary.by_status === "object" && !Array.isArray(summary.by_status) ? summary.by_status : {};

  return <div className={styles.stack}>
    <dl className={styles.summary}>
      <div><dt>Товаров в пакете</dt><dd>{typeof summary.products === "number" ? summary.products.toLocaleString("ru-RU") : "—"}</dd></div>
      {Object.entries(readinessName).map(([name, title]) => <div key={name}><dt>{title}</dt><dd>{typeof byStatus[name] === "number" ? byStatus[name].toLocaleString("ru-RU") : 0}</dd></div>)}
      <div><dt>Замечаний к данным</dt><dd>{value.issue_count.toLocaleString("ru-RU")}</dd></div>
    </dl>
    <Tabs items={[{ id: "products", label: "Готовность товаров" }, { id: "issues", label: "Ошибки и ограничения" }]} value={tab} onValueChange={(next) => update("package_tab", next)} ariaLabel="Результат проверки пакета" />
    {tab === "products" ? <form className={styles.filters} onSubmit={(event) => { event.preventDefault(); update("package_q", search.trim()); }}><label>Поиск товара в пакете<input type="search" value={search} maxLength={200} onChange={(event) => setSearch(event.target.value)} placeholder="Название или код 1С" /></label><Select label="Готовность" value={status} onChange={(event) => update("package_status", event.target.value)}><option value="">Все товары</option>{Object.entries(readinessName).map(([key, title]) => <option key={key} value={key}>{title}</option>)}</Select><Button type="submit" variant="secondary">Найти</Button></form> : null}
    {error ? <ErrorState title="Результат не загружен" text={error} onRetry={() => setReload((value) => value + 1)} /> : loadedKey !== key ? <PackageSkeleton /> : <div className={styles.stack} aria-busy={loading}>
      {count === 0 ? <EmptyState title={tab === "issues" ? "Замечаний на этой странице нет" : "Товары не найдены"} text={offset ? "Вернитесь на предыдущую страницу." : tab === "products" ? "Измените поиск или фильтр готовности." : "Проверьте также готовность отдельных товаров."} /> : tab === "products" ? <Table wrapperClassName={styles.tableWrap}><thead><Tr><Th>Товар / код 1С</Th><Th>Поставщик</Th><Th>Готовность</Th><Th>Ограничения</Th></Tr></thead><tbody>{products?.items.map((item) => <Tr key={`${item.supplier}:${item.code}`}><Td>{item.name}<small className={styles.secondary}>{item.code}</small></Td><Td>{item.supplier === "iek" ? "IEK" : item.supplier === "systeme" ? "Systeme Electric" : item.supplier}</Td><Td><Badge tone={item.status === "ready" ? "success" : "warning"}>{readinessName[item.status]}</Badge></Td><Td>{item.reasons.length ? <details><summary>{item.reasons.length} ограничений</summary><ul className={styles.reasons}>{item.reasons.map((reason) => <li key={reason}>{dataQualityReason(reason)}</li>)}</ul></details> : "—"}</Td></Tr>)}</tbody></Table> : <ol className={styles.issues} start={offset + 1}>{issues?.items.map((issue, index) => <li key={`${offset}-${index}`}><Badge tone={issue.severity === "error" ? "danger" : "warning"}>{issue.severity === "error" ? "Ошибка" : "Проверить"}</Badge> {issue.message}<small className={styles.secondary}>{[issue.filename, issue.sheet, issue.row ? `строка ${issue.row}` : "", issue.product_code ? `код ${issue.product_code}` : ""].filter(Boolean).join(" · ")}</small><small className={styles.secondary}>{dataQualityReason(issue.code)}</small></li>)}</ol>}
      <div className={styles.pager}><span>{count ? `${offset + 1}–${offset + count} из ${total}` : `Всего: ${total}`}</span><div><Button variant="secondary" size="sm" disabled={loading || offset === 0} onClick={() => update("package_offset", String(Math.max(0, offset - 20)))}>Назад</Button><Button variant="secondary" size="sm" disabled={loading || offset + count >= total} onClick={() => update("package_offset", String(offset + 20))}>Далее</Button></div></div>
    </div>}
  </div>;
}
