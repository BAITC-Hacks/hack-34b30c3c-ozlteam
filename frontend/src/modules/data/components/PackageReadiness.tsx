import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { Badge, Button, EmptyState, ErrorState, Select, Table, Tabs, Td, Th, Tr } from "../../../shared/ui";
import { useI18n } from "../../../shared/i18n/I18nContext";
import { dataQualityReason } from "../../catalogs";
import { packageIssues, packageProducts } from "../api/packages";
import type { ImportPackage, PackageIssue, PackagePage, PackageProduct, ReadinessStatus } from "../api/packages";
import styles from "./PackageImports.module.css";

export function PackageSkeleton() {
  const { t } = useI18n();
  return <div className={styles.skeleton} aria-busy="true" aria-label={t("Загружаем пакет", "Пакет жүктелуде", "Loading package")}><div aria-hidden="true"><i /><i /><i /></div><div aria-hidden="true"><i /><i /><i /></div><div aria-hidden="true"><i /><i /><i /></div></div>;
}

export function PackageReadiness({ value }: { value: ImportPackage }) {
  const { locale, t } = useI18n();
  const readinessName: Record<ReadinessStatus, string> = { ready: t("Готово", "Дайын", "Ready"), limited: t("С ограничениями", "Шектеулер бар", "Limited"), blocked: t("Нужно исправить", "Түзету қажет", "Needs correction") };
  const numberLocale = locale === "kk" ? "kk-KZ" : locale === "en" ? "en-US" : "ru-RU";
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
      .catch((caught: unknown) => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : t("Не удалось загрузить результат проверки.", "Тексеру нәтижесін жүктеу мүмкін болмады.", "Could not load check results.")); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [value.id, value.status, tab, offset, q, status, reload, key, t]);

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
      <div><dt>{t("Товаров в пакете", "Пакеттегі тауарлар", "Products in package")}</dt><dd>{typeof summary.products === "number" ? summary.products.toLocaleString(numberLocale) : "—"}</dd></div>
      {Object.entries(readinessName).map(([name, title]) => <div key={name}><dt>{title}</dt><dd>{typeof byStatus[name] === "number" ? byStatus[name].toLocaleString(numberLocale) : 0}</dd></div>)}
      <div><dt>{t("Замечаний к данным", "Деректерге қатысты ескертулер", "Data issues")}</dt><dd>{value.issue_count.toLocaleString(numberLocale)}</dd></div>
    </dl>
    <Tabs items={[{ id: "products", label: t("Готовность товаров", "Тауарлардың дайындығы", "Product readiness") }, { id: "issues", label: t("Ошибки и ограничения", "Қателер мен шектеулер", "Errors and limitations") }]} value={tab} onValueChange={(next) => update("package_tab", next)} ariaLabel={t("Результат проверки пакета", "Пакетті тексеру нәтижесі", "Package check result")} />
    {tab === "products" ? <form className={styles.filters} onSubmit={(event) => { event.preventDefault(); update("package_q", search.trim()); }}><label>{t("Поиск товара в пакете", "Пакеттен тауар іздеу", "Search products in package")}<input type="search" value={search} maxLength={200} onChange={(event) => setSearch(event.target.value)} placeholder={t("Название или код 1С", "Атауы немесе 1С коды", "Name or 1C code")} /></label><Select label={t("Готовность", "Дайындық", "Readiness")} value={status} onChange={(event) => update("package_status", event.target.value)}><option value="">{t("Все товары", "Барлық тауарлар", "All products")}</option>{Object.entries(readinessName).map(([key, title]) => <option key={key} value={key}>{title}</option>)}</Select><Button type="submit" variant="secondary">{t("Найти", "Табу", "Search")}</Button></form> : null}
    {error ? <ErrorState title={t("Результат не загружен", "Нәтиже жүктелмеді", "Results not loaded")} text={error} onRetry={() => setReload((value) => value + 1)} /> : loadedKey !== key ? <PackageSkeleton /> : <div className={styles.stack} aria-busy={loading}>
      {count === 0 ? <EmptyState title={tab === "issues" ? t("Замечаний на этой странице нет", "Бұл бетте ескертулер жоқ", "No issues on this page") : t("Товары не найдены", "Тауарлар табылмады", "No products found")} text={offset ? t("Вернитесь на предыдущую страницу.", "Алдыңғы бетке оралыңыз.", "Return to the previous page.") : tab === "products" ? t("Измените поиск или фильтр готовности.", "Іздеуді немесе дайындық сүзгісін өзгертіңіз.", "Change the search or readiness filter.") : t("Проверьте также готовность отдельных товаров.", "Жекелеген тауарлардың дайындығын да тексеріңіз.", "Also check individual product readiness.")} /> : tab === "products" ? <Table wrapperClassName={styles.tableWrap}><thead><Tr><Th>{t("Товар / код 1С", "Тауар / 1С коды", "Product / 1C code")}</Th><Th>{t("Поставщик", "Жеткізуші", "Supplier")}</Th><Th>{t("Готовность", "Дайындық", "Readiness")}</Th><Th>{t("Ограничения", "Шектеулер", "Limitations")}</Th></Tr></thead><tbody>{products?.items.map((item) => <Tr key={`${item.supplier}:${item.code}`}><Td>{item.name}<small className={styles.secondary}>{item.code}</small></Td><Td>{item.supplier === "iek" ? "IEK" : item.supplier === "systeme" ? "Systeme Electric" : item.supplier}</Td><Td><Badge tone={item.status === "ready" ? "success" : "warning"}>{readinessName[item.status]}</Badge></Td><Td>{item.reasons.length ? <details><summary>{item.reasons.length} {t("ограничений", "шектеу", "limitations")}</summary><ul className={styles.reasons}>{item.reasons.map((reason) => <li key={reason}>{dataQualityReason(reason)}</li>)}</ul></details> : "—"}</Td></Tr>)}</tbody></Table> : <ol className={styles.issues} start={offset + 1}>{issues?.items.map((issue, index) => <li key={`${offset}-${index}`}><Badge tone={issue.severity === "error" ? "danger" : "warning"}>{issue.severity === "error" ? t("Ошибка", "Қате", "Error") : t("Проверить", "Тексеру", "Review")}</Badge> {issue.message}<small className={styles.secondary}>{[issue.filename, issue.sheet, issue.row ? `${t("строка", "жол", "row")} ${issue.row}` : "", issue.product_code ? `${t("код", "код", "code")} ${issue.product_code}` : ""].filter(Boolean).join(" · ")}</small><small className={styles.secondary}>{dataQualityReason(issue.code)}</small></li>)}</ol>}
      <div className={styles.pager}><span>{count ? `${offset + 1}–${offset + count} ${t("из", "/", "of")} ${total}` : `${t("Всего", "Барлығы", "Total")}: ${total}`}</span><div><Button variant="secondary" size="sm" disabled={loading || offset === 0} onClick={() => update("package_offset", String(Math.max(0, offset - 20)))}>{t("Назад", "Артқа", "Previous")}</Button><Button variant="secondary" size="sm" disabled={loading || offset + count >= total} onClick={() => update("package_offset", String(offset + 20))}>{t("Далее", "Келесі", "Next")}</Button></div></div>
    </div>}
  </div>;
}
