import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Database, FileJson, Plus } from "lucide-react";
import { useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { PageHeader } from "../../../app/PageHeader";
import { returnPath } from "../../../shared/navigation/returnPath";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Modal,
  Select,
} from "../../../shared/ui";
import { useCurrentUser } from "../../auth";
import { createSource, listSources } from "../api/data";
import { listReportKinds, listReports } from "../api/reports";
import type { RestReport } from "../api/reports";
import { reportError, RestReportEditor } from "../components/RestReportEditor";
import styles from "../components/RestReports.module.css";
import skeleton from "./DataSourcesPage.module.css";

function ReportSkeleton() {
  return (
    <div
      className={skeleton.skeleton}
      role="status"
      aria-busy="true"
      aria-label="Загружаем настройки интеграции"
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
        <i />
      </div>
    </div>
  );
}

export function RestIntegrationsPage() {
  const { data: user } = useCurrentUser();
  const canRead = Boolean(user?.permissions.includes("integrations.read"));
  const canWrite = Boolean(user?.permissions.includes("integrations.write"));
  const canPreview =
    canWrite && Boolean(user?.permissions.includes("imports.write"));
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
        next.set("source", id);
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
  const error = sources.error ?? kinds.error;
  const initialLoading = canRead && (sources.isPending || kinds.isPending);

  return (
    <div className={styles.page}>
      <PageHeader
        title="Интеграция с 1С"
        subtitle="REST-отчёты и сопоставление с форматом нашей базы"
        actions={
          <Button
            variant="secondary"
            size="sm"
            icon={<ArrowLeft size={16} strokeWidth={1.8} />}
            onClick={() => navigate(back, { replace: true })}
          >
            Назад
          </Button>
        }
      />
      {!canRead ? (
        <Alert tone="warning" title="Нет доступа">
          Для просмотра настроек нужно право integrations.read.
        </Alert>
      ) : null}
      {error ? (
        <Alert
          tone="danger"
          title="Не удалось загрузить интеграции"
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                void sources.refetch();
                void kinds.refetch();
              }}
            >
              Повторить
            </Button>
          }
        >
          {reportError(error)}
        </Alert>
      ) : null}
      {initialLoading ? (
        <ReportSkeleton />
      ) : canRead && !error ? (
        <>
          <Card
            title="База учёта"
            subtitle="Одна база 1С может содержать любые бренды и поставщиков"
            actions={
              <Button
                variant="secondary"
                size="sm"
                icon={<Plus size={15} strokeWidth={1.8} />}
                disabled={!canWrite || busy}
                onClick={() => {
                  addSource.reset();
                  setSourceOpen(true);
                }}
              >
                Добавить базу
              </Button>
            }
          >
            <div className={styles.sourceBar}>
              <Select
                label="Источник данных"
                value={sourceId}
                disabled={busy}
                onChange={(event) => selectSource(event.target.value)}
              >
                <option value="">Выберите базу</option>
                {sources.data?.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
              {source ? (
                <div className={styles.sourceStatus}>
                  <Badge tone={source.complete ? "success" : "warning"}>
                    {source.complete
                      ? "Выгрузка согласована"
                      : "Выгрузка не завершена"}
                  </Badge>
                  <span>Версия {source.revision}</span>
                  <span>
                    {source.synced_at
                      ? `Обновлена ${new Date(source.synced_at).toLocaleString("ru-RU")}`
                      : "Данные ещё не применялись"}
                  </span>
                </div>
              ) : null}
            </div>
            {!sources.data?.length ? (
              <p className={styles.hint}>
                Добавьте базу, затем настройте адрес и поля каждого отчёта.
              </p>
            ) : null}
          </Card>
          <div className={styles.storageNote}>
            <Database size={18} strokeWidth={1.8} aria-hidden="true" />
            <p>
              Храним у нас в PostgreSQL: настройки отчётов, сопоставления,
              результаты проверок и применённые данные. Ключ доступа остаётся на
              сервере.
            </p>
          </div>
          {source ? (
            <div className={styles.workspace}>
              <Card
                title="REST-отчёты"
                subtitle="Настройки сохраняются для следующих загрузок"
                actions={
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Plus size={15} strokeWidth={1.8} />}
                    disabled={
                      !canWrite ||
                      busy ||
                      !kinds.data?.length ||
                      reports.isPending
                    }
                    onClick={() => selectReport("new")}
                  >
                    Добавить
                  </Button>
                }
              >
                {reports.isPending ? (
                  <ReportSkeleton />
                ) : reports.error ? (
                  <Alert
                    tone="danger"
                    title="Не удалось загрузить отчёты"
                    action={
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void reports.refetch()}
                      >
                        Повторить
                      </Button>
                    }
                  >
                    {reportError(reports.error)}
                  </Alert>
                ) : reports.data?.length ? (
                  <div className={styles.reportList}>
                    {reports.data.map((report) => (
                      <button
                        type="button"
                        key={report.id}
                        className={`${styles.reportRow} ${selection === report.id ? styles.selected : ""}`}
                        disabled={busy}
                        aria-pressed={selection === report.id}
                        onClick={() => selectReport(report.id)}
                      >
                        <FileJson
                          size={18}
                          strokeWidth={1.8}
                          aria-hidden="true"
                        />
                        <span>
                          <strong>{report.name}</strong>
                          <small>
                            {kinds.data?.find(
                              (item) => item.kind === report.kind,
                            )?.title ?? report.kind}
                          </small>
                        </span>
                        <ArrowLeft
                          className={styles.openArrow}
                          size={16}
                          strokeWidth={1.8}
                          aria-hidden="true"
                        />
                      </button>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="Отчётов пока нет"
                    text="Добавьте первый REST-отчёт этой базы."
                  />
                )}
                <p className={styles.hint}>
                  Сначала справочники: категории, поставщики, склады, товары.
                  Затем факты: отгрузки, остатки, путь, отсутствие товара и
                  прирост.
                </p>
              </Card>
              {kinds.data?.length && (selection === "new" || profile) ? (
                <RestReportEditor
                  key={`${sourceId}:${selection}:${params.get("kind") ?? ""}`}
                  sourceId={sourceId}
                  profile={profile}
                  kinds={kinds.data}
                  defaultKind={params.get("kind")}
                  canWrite={canWrite}
                  canPreview={canPreview}
                  canApply={canApply}
                  onSaved={saved}
                  onApplied={() => {
                    void queryClient.invalidateQueries({
                      queryKey: ["rest-integration-sources"],
                    });
                  }}
                  onClose={() => selectReport(null)}
                  onBusy={setBusy}
                />
              ) : (
                <Card
                  title="Все данные для пополнения"
                  subtitle="Выберите отчёт слева или добавьте новый"
                >
                  <div className={styles.kindGrid}>
                    {kinds.data?.map((item) => (
                      <button
                        key={item.kind}
                        type="button"
                        className={styles.kindRow}
                        disabled={
                          !canWrite ||
                          reports.isPending ||
                          Boolean(reports.error)
                        }
                        onClick={() => {
                          setParams(
                            (current) => {
                              const next = new URLSearchParams(current);
                              next.set("source", sourceId);
                              next.set("report", "new");
                              next.set("kind", item.kind);
                              return next;
                            },
                            { replace: true, state: location.state },
                          );
                        }}
                      >
                        <FileJson
                          size={17}
                          strokeWidth={1.8}
                          aria-hidden="true"
                        />
                        <span>{item.title}</span>
                      </button>
                    ))}
                  </div>
                  <p className={styles.hint}>
                    Для каждого отчёта задайте свой REST-адрес. Поддерживается
                    JSON с массивом строк. Готовность подключения проверяется
                    реальным запросом.
                  </p>
                </Card>
              )}
            </div>
          ) : null}
        </>
      ) : null}
      <Modal
        id="create-rest-source"
        title="Добавить базу 1С"
        open={sourceOpen}
        onOpenChange={(open) => {
          if (!addSource.isPending) setSourceOpen(open);
        }}
        closeOnEscape={!addSource.isPending}
        closeOnBackdrop={!addSource.isPending}
        showClose={!addSource.isPending}
        footer={
          <>
            <Button
              variant="secondary"
              disabled={addSource.isPending}
              onClick={() => setSourceOpen(false)}
            >
              Отмена
            </Button>
            <Button
              type="submit"
              form="rest-source-form"
              disabled={!sourceName.trim() || !canWrite}
              loading={addSource.isPending}
            >
              Добавить базу
            </Button>
          </>
        }
      >
        <form
          id="rest-source-form"
          className={styles.stack}
          onSubmit={(event) => {
            event.preventDefault();
            if (canWrite && sourceName.trim()) addSource.mutate();
          }}
        >
          {addSource.error ? (
            <Alert tone="danger">{reportError(addSource.error)}</Alert>
          ) : null}
          <Field
            label="Название базы"
            placeholder="1С Электрокомплект"
            value={sourceName}
            required
            maxLength={200}
            disabled={addSource.isPending}
            onChange={(event) => setSourceName(event.target.value)}
          />
          <p className={styles.hint}>
            Выберите понятное название конкретной базы учёта. REST-адреса
            настраиваются отдельно для каждого отчёта.
          </p>
        </form>
      </Modal>
    </div>
  );
}
