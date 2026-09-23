import { ArrowLeft, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { PageHeader } from "../../../app/PageHeader";
import { returnPath } from "../../../shared/navigation/returnPath";
import { Alert, Badge, Button, Card, Chip, Field, Skeleton, Table, Td, Th, ThinkingSteps, Tr } from "../../../shared/ui";
import { askSimulationAnalysis } from "../../assistant";
import { GeoMap } from "../components/GeoMap";
import { DEMO_STAGES, getSupplyDemo, supplyDemoPrompt } from "../lib/supplyDemo";
import type { DemoStage, SupplyDemoSnapshot } from "../lib/supplyDemo";
import styles from "./ShipmentsPage.module.css";

const QUESTIONS = ["Где мой заказ?", "Успеет ли товар до дефицита?", "Что делать при задержке?"];
const number = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
const date = new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Almaty", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const noop = () => undefined;

function Analysis({ snapshot, onPending }: {
  snapshot: SupplyDemoSnapshot;
  onPending: (pending: boolean) => void;
}) {
  const [question, setQuestion] = useState(QUESTIONS[1]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [answer, setAnswer] = useState<{ text: string; question: string; stage: string; elapsed: number }>();
  const request = useRef<AbortController | undefined>(undefined);

  useEffect(() => () => {
    request.current?.abort();
    onPending(false);
  }, [onPending]);

  async function ask() {
    const text = question.trim();
    if (!text) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    onPending(true);
    setError(undefined);
    try {
      const response = await askSimulationAnalysis(supplyDemoPrompt(snapshot, text), controller.signal);
      if (!controller.signal.aborted && request.current === controller) {
        setAnswer({ text: response, question: text, stage: snapshot.stageLabel, elapsed: snapshot.elapsedHours });
      }
    } catch (cause) {
      if (!controller.signal.aborted && request.current === controller) {
        setError(cause instanceof Error ? cause.message : "Не удалось получить ответ модели. Попробуйте ещё раз.");
      }
    } finally {
      if (!controller.signal.aborted && request.current === controller) {
        setPending(false);
        onPending(false);
      }
    }
  }

  return (
    <Card id="analysis" title="Спросить ИИ о поставке" subtitle="Заказ, движение и запас — в одном контексте.">
      <div className={styles.analysis}>
        <div className={styles.suggestions} aria-label="Примеры вопросов">
          {QUESTIONS.map((text) => <Chip key={text} pressed={question === text} onClick={() => setQuestion(text)}>{text}</Chip>)}
        </div>
        <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void ask(); }}>
          <Field label="Ваш вопрос" value={question} maxLength={500} onChange={(event) => setQuestion(event.target.value)} />
          <p className={styles.note}>По кнопке передадим вопрос и текущие тестовые данные поставки AI-сервису для анализа.</p>
          <Button type="submit" disabled={!question.trim()} loading={pending} icon={<Sparkles size={16} strokeWidth={1.8} />}>Отправить данные и спросить</Button>
        </form>
        {pending ? <ThinkingSteps compact steps={[
          { label: `Срез «${snapshot.stageLabel}» передан модели`, status: "complete" },
          { label: "Модель анализирует поставку и риск дефицита", status: "active" },
        ]} /> : null}
        {error ? <Alert tone="danger" title="ИИ не ответил">{error}</Alert> : null}
        <div className={styles.answer} aria-busy={pending} aria-live="polite">
          {pending && !answer ? <div className={styles.skeleton} aria-hidden="true">
            <Skeleton width="55%" height="var(--sp-4)" />
            <Skeleton width="100%" height="var(--sp-3)" />
            <Skeleton width="93%" height="var(--sp-3)" />
            <Skeleton width="80%" height="var(--sp-3)" />
          </div> : answer ? <>
            <Badge tone={pending || error ? "warning" : "info"}>{pending || error ? "Предыдущий ответ" : "Ответ модели"}</Badge>
            <p className={styles.note}>Срез на момент вопроса: {answer.stage}, прошло {number.format(answer.elapsed)} ч.</p>
            <p className={styles.asked}>{answer.question}</p>
            <div className={styles.answerText}>{answer.text.split(/\n\s*\n/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
            <nav className={styles.links} aria-label="Данные ответа"><a href="#map">Карта</a><a href="#order">Заказ</a><a href="#stock">Запас</a></nav>
          </> : !pending && !error ? <p className={styles.note}>Спросите, успеет ли поставка до дефицита. После задержки задайте вопрос снова — модель получит изменившиеся данные.</p> : null}
        </div>
      </div>
    </Card>
  );
}

export function ShipmentsPage() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const rawStage = params.get("stage");
  const stage: DemoStage = DEMO_STAGES.find((item) => item.id === rawStage)?.id ?? "moving";
  const [progress, setProgress] = useState(0.15);
  const [pending, setPending] = useState(false);
  const snapshot = useMemo(() => getSupplyDemo(stage, progress), [stage, progress]);
  const from = returnPath(location.state?.from, "/orders", ["/orders", "/inventory", "/routes", "/assistant"]);

  useEffect(() => { setProgress(0.15); }, [stage]);
  useEffect(() => {
    if (stage !== "moving" || pending || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setProgress((value) => Math.min(0.65, value + 0.0125)), 500);
    return () => window.clearInterval(timer);
  }, [stage, pending]);

  function changeStage(value: DemoStage) {
    const updated = new URLSearchParams(params);
    updated.set("stage", value);
    setParams(updated, { replace: true, state: location.state });
  }

  return (
    <>
      <PageHeader title="Поставки" subtitle="Груз в пути, ожидаемое прибытие и влияние на запас." actions={
        <><a href="#map">Карта</a><a href="#analysis">Спросить ИИ</a><Button variant="secondary" icon={<ArrowLeft size={16} strokeWidth={1.8} />} onClick={() => navigate(from, { replace: true })}>Назад</Button></>
      } />
      <div className={styles.page}>
        <div className={styles.columns}>
          <div className={styles.stack}>
            <Card id="order" title={`Заказ ${snapshot.orderId}`} subtitle={`${snapshot.supplier} → ${snapshot.warehouse}`} actions={<Badge tone={stage === "delayed" ? "warning" : "info"}>{snapshot.stageLabel}</Badge>}>
              <dl className={styles.facts}>
                <div><dt>Прибытие по времени Алматы</dt><dd>{date.format(new Date(snapshot.eta))}</dd></div>
                <div><dt>Задержка</dt><dd>{snapshot.delayHours ? `+${snapshot.delayHours} ч` : "По плану"}</dd></div>
                <div><dt>Позиции в заказе</dt><dd>{snapshot.items.length}</dd></div>
              </dl>
              {stage === "draft" ? <p className={styles.note}>Заказ на подготовке.</p> : stage === "ordered" ? <p className={styles.note}>Ожидаем отгрузку: товар ещё не в пути.</p> : null}
            </Card>
            <Card id="map" padded={false} className={styles.mapCard}>
              <div className={styles.mapTitle}><h2>Движение поставки</h2><Badge tone={stage === "delayed" ? "warning" : "neutral"}>{snapshot.stageLabel}</Badge></div>
              <GeoMap trips={[snapshot.trip]} states={{ [snapshot.trip.id]: snapshot.sim }} selectedId={snapshot.trip.id} focused onSelectTrip={noop} onPickEvent={noop} />
              <p className={styles.mapNote}>Шымкент → Тараз → Алматы. Рейс {snapshot.trip.id}. {pending ? "Показан снимок на момент запроса ИИ." : "Положение по тестовым данным."}</p>
            </Card>
          </div>
          <Analysis key={stage} snapshot={snapshot} onPending={setPending} />
        </div>

        <Card id="stock" title="Как поставка влияет на запас" subtitle="Прогноз по остаткам, спросу и сроку поступления.">
          <div className={styles.stock}>
            <Alert tone={snapshot.riskCount ? "warning" : "success"} title={stage === "received" ? "Товар принят, запас пополнен" : snapshot.riskCount ? `${snapshot.riskCount} поз. с дефицитом до приёмки` : "До приёмки дефицита нет"}>
              {stage === "received" ? "Товар принят, тестовый остаток пополнен. Дефицит до прихода сохраняется в истории." : "Поставка пополнит остаток только после приёмки. Задержка увеличивает спрос до прихода."}
            </Alert>
            <Table aria-label="Расчёт запаса по товарам" stickyHeader={false}>
              <thead><Tr><Th>Товар</Th><Th numeric>Заказано</Th><Th numeric>Остаток сейчас</Th><Th numeric>Спрос / день</Th><Th numeric>К прибытию</Th><Th numeric>Дефицит до приёмки</Th><Th numeric>После приёмки</Th></Tr></thead>
              <tbody>{snapshot.items.map((item) => <Tr key={item.name}>
                <Td><strong>{item.name}</strong><div className={styles.note}>{item.unit}</div></Td>
                <Td numeric>{number.format(item.ordered)}</Td><Td numeric>{number.format(item.currentStock)}</Td><Td numeric>{number.format(item.dailyDemand)}</Td>
                <Td numeric>{number.format(item.stockAtArrival)}</Td><Td numeric className={item.shortage > 0 ? styles.risk : undefined}>{number.format(item.shortage)}</Td><Td numeric>{number.format(item.stockAfterReceipt)}</Td>
              </Tr>)}</tbody>
            </Table>
            <p className={styles.note}>Расчёт предполагает равномерный спрос. Непокрытый спрос показан отдельно как дефицит. После приёмки прибавляем поставку; прошлый дефицит не становится резервом. ИИ объясняет расчёт и предлагает действия.</p>
          </div>
        </Card>
        <details className={styles.source}>
          <summary>Источник данных · тестовые данные</summary>
          <p className={styles.note}>Поставка, движение и остатки пока поступают из моков. GPS и 1С не подключены. Анализ выполняет настоящая модель.</p>
          <label>Состояние тестовой поставки <select value={stage} onChange={(event) => changeStage(event.target.value as DemoStage)}>{DEMO_STAGES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        </details>
      </div>
    </>
  );
}
