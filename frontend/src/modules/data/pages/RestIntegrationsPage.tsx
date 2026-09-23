import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Database, FileText, Plus } from "lucide-react";
import { useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { PageHeader } from "../../../app/PageHeader";
import { useI18n } from "../../../shared/i18n/I18nContext";
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
  const { t } = useI18n();
  return (
    <div
      className={skeleton.skeleton}
      role="status"
      aria-busy="true"
      aria-label={t("Загружаем отчёты", "Есептер жүктелуде", "Loading reports")}
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
  const { locale, t } = useI18n();
  const dateLocale = locale === "kk" ? "kk-KZ" : locale === "en" ? "en-US" : "ru-RU";
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
    error instanceof Error ? error.message : t("Не удалось открыть отчёты", "Есептерді ашу мүмкін болмады", "Could not open reports"),
    locale,
  );
  const loading =
    userPending || (canRead && (sources.isPending || kinds.isPending));

  return (
    <div className={styles.page}>
      <PageHeader
        title={t("Данные из 1С", "1С деректері", "1C data")}
        subtitle={
          selection
            ? t("Подключите отчёт и проверьте данные перед загрузкой", "Есепті қосып, жүктемес бұрын деректерді тексеріңіз", "Connect a report and check its data before import")
            : t("Ваши отчёты для расчёта закупок", "Сатып алуды есептеуге арналған есептеріңіз", "Your reports for purchasing calculations")
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
            {selection ? t("К отчётам", "Есептерге", "To reports") : t("К источникам", "Дереккөздерге", "To sources")}
          </Button>
        }
      />
      {loading ? (
        <LoadingReports />
      ) : !canRead ? (
        <Alert tone="warning" title={t("Нужен доступ к данным", "Деректерге қолжетімділік қажет", "Data access required")}>
          {t("Попросите администратора открыть вам раздел интеграции с 1С.", "Әкімшіден 1С интеграция бөліміне қолжетімділік беруді сұраңыз.", "Ask an administrator to give you access to 1C integration.")}
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
              {t("Повторить", "Қайталау", "Retry")}
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
                    ? `${t("Последняя загрузка", "Соңғы жүктеме", "Last import")}: ${new Date(source.synced_at).toLocaleString(dateLocale, { dateStyle: "short", timeStyle: "short" })}`
                    : t("Данные ещё не загружались", "Деректер әлі жүктелмеген", "No data imported yet")}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={openSources}
              >
                {t("Сменить", "Ауыстыру", "Change")}
              </Button>
            </div>
          ) : sources.data?.length ? (
            <Alert
              tone="warning"
              title={t("Выберите вашу базу 1С", "1С базаңызды таңдаңыз", "Choose your 1C database")}
              action={
                <Button variant="secondary" onClick={openSources}>
                  {t("Выбрать базу", "Базаны таңдау", "Choose database")}
                </Button>
              }
            >
              {t("Выбранная база больше недоступна.", "Таңдалған база енді қолжетімсіз.", "The selected database is no longer available.")}
            </Alert>
          ) : (
            <Card
              title={t("Подключите вашу 1С", "1С жүйесін қосыңыз", "Connect your 1C")}
              subtitle={t("Добавьте базу, из которой будете загружать отчёты", "Есептер жүктелетін базаны қосыңыз", "Add the database you will import reports from")}
            >
              <div className={styles.empty}>
                <p>
                  {t("Настройте подключение один раз. Затем достаточно выбрать отчёт и загрузить свежие данные.", "Қосылымды бір рет баптаңыз. Кейін есепті таңдап, жаңа деректерді жүктеу жеткілікті.", "Set up the connection once. Then choose a report and import fresh data.")}
                </p>
                <Button
                  variant="dark"
                  disabled={!canWrite}
                  onClick={openSources}
                >
                  {t("Добавить базу 1С", "1С базасын қосу", "Add 1C database")}
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
                title={t("Не удалось открыть список отчётов", "Есептер тізімін ашу мүмкін болмады", "Could not open report list")}
                action={
                  <Button
                    variant="secondary"
                    onClick={() => void reports.refetch()}
                  >
                    {t("Повторить", "Қайталау", "Retry")}
                  </Button>
                }
              >
                {t("Проверьте соединение и попробуйте ещё раз.", "Қосылымды тексеріп, қайталап көріңіз.", "Check the connection and try again.")}
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
                    title={t("Отчёт не найден", "Есеп табылмады", "Report not found")}
                    text={t("Вернитесь к списку и выберите другой отчёт.", "Тізімге оралып, басқа есепті таңдаңыз.", "Return to the list and choose another report.")}
                  />
                )}
              </div>
            ) : (
              <>
                <div className={styles.listHeader}>
                  <h2>{t("Ваши отчёты", "Есептеріңіз", "Your reports")}</h2>
                  {reports.data?.length ? (
                    <Button
                      variant="dark"
                      icon={<Plus size={16} strokeWidth={1.8} />}
                      disabled={!canWrite}
                      onClick={() => selectReport("new")}
                    >
                      {t("Добавить отчёт", "Есеп қосу", "Add report")}
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
                        aria-label={`${t("Открыть отчёт", "Есепті ашу", "Open report")} «${report.name}»`}
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
                          <span>{reportKindTitle(report.kind, locale)}</span>
                          <small>{reportKindDescription(report.kind, locale)}</small>
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
                    title={t("Добавьте первый отчёт", "Алғашқы есепті қосыңыз", "Add your first report")}
                    subtitle={t("Например, остатки товаров или отгрузки за период", "Мысалы, тауар қорлары немесе кезеңдегі жөнелтулер", "For example, stock balances or shipments for a period")}
                  >
                    <div className={styles.empty}>
                      <p>
                        {t("Выберите данные, укажите ссылку на отчёт и проверьте результат. Ссылку можно получить у специалиста, который обслуживает вашу 1С.", "Деректерді таңдап, есеп сілтемесін көрсетіңіз және нәтижені тексеріңіз. Сілтемені 1С жүйесіне қызмет көрсететін маманнан алуға болады.", "Choose the data, enter the report link and check the result. Your 1C specialist can provide the link.")}
                      </p>
                      <Button
                        variant="dark"
                        icon={<Plus size={16} strokeWidth={1.8} />}
                        disabled={!canWrite}
                        onClick={() => selectReport("new")}
                      >
                        {t("Добавить отчёт", "Есеп қосу", "Add report")}
                      </Button>
                    </div>
                  </Card>
                )}
                <p className={styles.footnote}>
                  {t("Перед обновлением вы увидите полученные данные и сможете их проверить.", "Жаңартудан бұрын алынған деректерді көріп, тексере аласыз.", "You can review the received data before updating.")}
                </p>
              </>
            ))}
        </>
      )}

      <Modal
        id="create-rest-source"
        title={sources.data?.length ? t("Ваша база 1С", "1С базаңыз", "Your 1C database") : t("Добавить базу 1С", "1С базасын қосу", "Add 1C database")}
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
              label={t("Выберите базу", "Базаны таңдаңыз", "Choose database")}
              value={source?.id ?? ""}
              disabled={addSource.isPending}
              onChange={(event) => {
                selectSource(event.target.value);
                setSourceOpen(false);
              }}
            >
              <option value="" disabled>
                {t("Выберите базу", "Базаны таңдаңыз", "Choose database")}
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
                <Alert tone="danger" title={t("Не удалось добавить базу", "Базаны қосу мүмкін болмады", "Could not add database")}>
                  {t("Попробуйте ещё раз. Если ошибка повторяется, обратитесь к администратору.", "Қайталап көріңіз. Қате қайталанса, әкімшіге хабарласыңыз.", "Try again. If the error persists, contact an administrator.")}
                </Alert>
              ) : null}
              <Field
                label={
                  sources.data?.length
                    ? t("Или добавьте другую базу", "Немесе басқа база қосыңыз", "Or add another database")
                    : t("Как называется ваша база?", "Базаңыз қалай аталады?", "What is your database called?")
                }
                placeholder={t("Например, 1С Электрокомплект", "Мысалы, 1С Электрокомплект", "For example, 1C Elektrokomplekt")}
                hint={t("Название поможет отличать эту базу от других.", "Атауы бұл базаны басқалардан ажыратуға көмектеседі.", "A name helps distinguish this database from others.")}
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
                {t("Добавить базу", "База қосу", "Add database")}
              </Button>
            </form>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
