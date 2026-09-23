import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Database, FileText, Plus } from "lucide-react";
import { useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { PageHeader } from "../../../app/PageHeader";
import { returnPath } from "../../../shared/navigation/returnPath";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Field,
  Modal,
  Select,
} from "../../../shared/ui";
import { useCurrentUser } from "../../auth";
import { createSource, listSources } from "../api/data";
import { listReportKinds, listReports, type RestReport } from "../api/reports";
import { RestReportEditor } from "../components/RestReportEditor";
import {
  friendlyReportError,
  reportKindDescription,
  reportKindTitle,
} from "../lib/reportPresentation";
import skeleton from "./DataSourcesPage.module.css";
import styles from "./RestIntegrationsPage.module.css";

function LoadingReports() {
  return (
    <div
      className={skeleton.skeleton}
      role="status"
      aria-busy="true"
      aria-label="Загружаем отчёты"
    >
      <div aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}

export function RestIntegrationsPage() {
  const { data: user, isPending: userPending } = useCurrentUser();
  const canRead = Boolean(user?.permissions.includes("integrations.read"));
  const canWrite = Boolean(user?.permissions.includes("integrations.write"));
  const canApply = Boolean(user?.permissions.includes("imports.write"));
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceName, setSourceName] = useState("");
  const [busy, setBusy] = useState(false);
  const sources = useQuery({
    queryKey: ["rest-integration-sources"],
    queryFn: ({ signal }) => listSources(signal),
    enabled: canRead,
  });
  const kinds = useQuery({
    queryKey: ["rest-report-kinds"],
    queryFn: ({ signal }) => listReportKinds(signal),
    enabled: canRead,
    staleTime: 60_000,
  });
  const sourceId =
    params.get("source") ??
    sources.data?.find((source) => source.system === "1c")?.id ??
    sources.data?.[0]?.id ??
    "";
  const source = sources.data?.find((item) => item.id === sourceId);
  const reports = useQuery({
    queryKey: ["rest-reports", sourceId],
    queryFn: ({ signal }) => listReports(sourceId, signal),
    enabled: Boolean(source) && canRead,
  });
  const selection = params.get("report");
  const profile = reports.data?.find((item) => item.id === selection);
  const state: unknown = location.state;
  const from =
    state && typeof state === "object" && "from" in state
      ? state.from
      : undefined;
  const back = returnPath(from, "/data", [
    "/",
    "/data",
    "/data/catalogs",
    "/inventory",
  ]);

  function selectReport(id: string | null) {
    setBusy(false);
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set("source", sourceId);
        next.delete("kind");
        if (id) next.set("report", id);
        else next.delete("report");
        return next;
      },
      { replace: true, state: location.state },
    );
  }
  function selectSource(id: string) {
    setBusy(false);
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (id) next.set("source", id);
        else next.delete("source");
        next.delete("report");
        next.delete("kind");
        return next;
      },
      { replace: true, state: location.state },
    );
  }
  function saved(report: RestReport) {
    queryClient.setQueryData<RestReport[]>(
      ["rest-reports", report.source_id],
      (current) => {
        const list = current ?? [];
        return list.some((item) => item.id === report.id)
          ? list.map((item) => (item.id === report.id ? report : item))
          : [...list, report];
      },
    );
    selectReport(report.id);
  }
  const addSource = useMutation({
    mutationFn: () => createSource(sourceName.trim(), "1c"),
    onSuccess: async (added) => {
      await queryClient.invalidateQueries({
        queryKey: ["rest-integration-sources"],
      });
      selectSource(added.id);
      setSourceOpen(false);
      setSourceName("");
    },
  });
  function openSources() {
    addSource.reset();
    setSourceOpen(true);
  }
  const error = sources.error ?? kinds.error;
  const errorCopy = friendlyReportError(
    error instanceof Error ? error.message : "Не удалось открыть отчёты",
  );
  const loading =
    userPending || (canRead && (sources.isPending || kinds.isPending));

  return (
    <div className={styles.page}>
      <PageHeader
        title="Данные из 1С"
        subtitle={
          selection
            ? "Подключите отчёт и проверьте данные перед загрузкой"
            : "Ваши отчёты для расчёта закупок"
        }
        actions={
          <Button
            variant="secondary"
            size="sm"
            icon={<ArrowLeft size={16} strokeWidth={1.8} />}
            disabled={busy}
            onClick={() =>
              selection ? selectReport(null) : navigate(back, { replace: true })
            }
          >
            {selection ? "К отчётам" : "К источникам"}
          </Button>
        }
      />
      {loading ? (
        <LoadingReports />
      ) : !canRead ? (
        <Alert tone="warning" title="Нужен доступ к данным">
          Попросите администратора открыть вам раздел интеграции с 1С.
        </Alert>
      ) : error ? (
        <Alert
          tone="danger"
          title={errorCopy.title}
          action={
            <Button
              variant="secondary"
              onClick={() => {
                void sources.refetch();
                void kinds.refetch();
              }}
            >
              Повторить
            </Button>
          }
        >
          {errorCopy.message}
        </Alert>
      ) : (
        <>
          {source ? (
            <div className={styles.sourceLine}>
              <Database size={18} strokeWidth={1.8} aria-hidden="true" />
              <div>
                <strong>{source.name}</strong>
                <span>
                  {source.synced_at
                    ? `Последняя загрузка: ${new Date(source.synced_at).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}`
                    : "Данные ещё не загружались"}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={openSources}
              >
                Сменить
              </Button>
            </div>
          ) : sources.data?.length ? (
            <Alert
              tone="warning"
              title="Выберите вашу базу 1С"
              action={
                <Button variant="secondary" onClick={openSources}>
                  Выбрать базу
                </Button>
              }
            >
              Выбранная база больше недоступна.
            </Alert>
          ) : (
            <Card
              title="Подключите вашу 1С"
              subtitle="Добавьте базу, из которой будете загружать отчёты"
            >
              <div className={styles.empty}>
                <p>
                  Настройте подключение один раз. Затем достаточно выбрать отчёт
                  и загрузить свежие данные.
                </p>
                <Button
                  variant="dark"
                  disabled={!canWrite}
                  onClick={openSources}
                >
                  Добавить базу 1С
                </Button>
              </div>
            </Card>
          )}

          {source &&
            (reports.isPending ? (
              <LoadingReports />
            ) : reports.error ? (
              <Alert
                tone="danger"
                title="Не удалось открыть список отчётов"
                action={
                  <Button
                    variant="secondary"
                    onClick={() => void reports.refetch()}
                  >
                    Повторить
                  </Button>
                }
              >
                Проверьте соединение и попробуйте ещё раз.
              </Alert>
            ) : selection && kinds.data?.length ? (
              <div className={styles.editor}>
                {selection === "new" || profile ? (
                  <RestReportEditor
                    key={`${sourceId}:${selection}`}
                    sourceId={sourceId}
                    profile={profile}
                    kinds={kinds.data}
                    defaultKind={params.get("kind")}
                    canWrite={canWrite}
                    canPreview={canWrite && canApply}
                    canApply={canApply}
                    onSaved={saved}
                    onApplied={() => {
                      void queryClient.invalidateQueries({
                        queryKey: ["rest-integration-sources"],
                      });
                    }}
                    onBusy={setBusy}
                  />
                ) : (
                  <EmptyState
                    title="Отчёт не найден"
                    text="Вернитесь к списку и выберите другой отчёт."
                  />
                )}
              </div>
            ) : (
              <>
                <div className={styles.listHeader}>
                  <h2>Ваши отчёты</h2>
                  {reports.data?.length ? (
                    <Button
                      variant="dark"
                      icon={<Plus size={16} strokeWidth={1.8} />}
                      disabled={!canWrite}
                      onClick={() => selectReport("new")}
                    >
                      Добавить отчёт
                    </Button>
                  ) : null}
                </div>
                {reports.data?.length ? (
                  <div className={styles.reports}>
                    {reports.data.map((report) => (
                      <button
                        className={styles.report}
                        type="button"
                        key={report.id}
                        onClick={() => selectReport(report.id)}
                        aria-label={`Открыть отчёт «${report.name}»`}
                      >
                        <span className={styles.reportIcon}>
                          <FileText
                            size={20}
                            strokeWidth={1.8}
                            aria-hidden="true"
                          />
                        </span>
                        <span className={styles.reportCopy}>
                          <strong>{report.name}</strong>
                          <span>{reportKindTitle(report.kind)}</span>
                          <small>{reportKindDescription(report.kind)}</small>
                        </span>
                        <ArrowRight
                          size={18}
                          strokeWidth={1.8}
                          aria-hidden="true"
                        />
                      </button>
                    ))}
                  </div>
                ) : (
                  <Card
                    title="Добавьте первый отчёт"
                    subtitle="Например, остатки товаров или отгрузки за период"
                  >
                    <div className={styles.empty}>
                      <p>
                        Выберите данные, укажите ссылку на отчёт и проверьте
                        результат. Ссылку можно получить у специалиста, который
                        обслуживает вашу 1С.
                      </p>
                      <Button
                        variant="dark"
                        icon={<Plus size={16} strokeWidth={1.8} />}
                        disabled={!canWrite}
                        onClick={() => selectReport("new")}
                      >
                        Добавить отчёт
                      </Button>
                    </div>
                  </Card>
                )}
                <p className={styles.footnote}>
                  Перед обновлением вы увидите полученные данные и сможете их
                  проверить.
                </p>
              </>
            ))}
        </>
      )}

      <Modal
        id="create-rest-source"
        title={sources.data?.length ? "Ваша база 1С" : "Добавить базу 1С"}
        open={sourceOpen}
        onOpenChange={(open) => {
          if (!addSource.isPending) setSourceOpen(open);
        }}
        closeOnEscape={!addSource.isPending}
        closeOnBackdrop={!addSource.isPending}
        showClose={!addSource.isPending}
      >
        <div className={styles.modalBody}>
          {sources.data?.length ? (
            <Select
              label="Выберите базу"
              value={source?.id ?? ""}
              disabled={addSource.isPending}
              onChange={(event) => {
                selectSource(event.target.value);
                setSourceOpen(false);
              }}
            >
              <option value="" disabled>
                Выберите базу
              </option>
              {sources.data.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          ) : null}
          {canWrite ? (
            <form
              className={styles.modalBody}
              onSubmit={(event) => {
                event.preventDefault();
                if (sourceName.trim() && !addSource.isPending)
                  addSource.mutate();
              }}
            >
              {addSource.error ? (
                <Alert tone="danger" title="Не удалось добавить базу">
                  Попробуйте ещё раз. Если ошибка повторяется, обратитесь к
                  администратору.
                </Alert>
              ) : null}
              <Field
                label={
                  sources.data?.length
                    ? "Или добавьте другую базу"
                    : "Как называется ваша база?"
                }
                placeholder="Например, 1С Электрокомплект"
                hint="Название поможет отличать эту базу от других."
                value={sourceName}
                required
                maxLength={200}
                disabled={addSource.isPending}
                onChange={(event) => setSourceName(event.target.value)}
              />
              <Button
                type="submit"
                variant="dark"
                disabled={!sourceName.trim()}
                loading={addSource.isPending}
              >
                Добавить базу
              </Button>
            </form>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
