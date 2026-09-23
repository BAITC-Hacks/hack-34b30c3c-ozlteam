import { ArrowLeft, ArrowRight, RotateCcw, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { PageHeader } from "../../../app/PageHeader";
import { returnPath } from "../../../shared/navigation/returnPath";
import { Alert, Badge, Button, Card, Chip, Field, Skeleton, Table, Td, Th, ThinkingSteps, Tr } from "../../../shared/ui";
import { askSimulationAnalysis } from "../../assistant";
import { GeoMap } from "../components/GeoMap";
import { DEMO_STAGES, getSupplyDemo, supplyDemoPrompt } from "../lib/supplyDemo";
import type { DemoStage, SupplyDemoSnapshot } from "../lib/supplyDemo";
import styles from "./SupplyDemoPage.module.css";

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
    <Card title="Спросить ИИ о поставке" subtitle="Заказ, движение и запас — в одном контексте.">
      <div className={styles.analysis}>
        <div className={styles.suggestions} aria-label="Примеры вопросов">
          {QUESTIONS.map((text) => <Chip key={text} pressed={question === text} onClick={() => setQuestion(text)}>{text}</Chip>)}
        </div>
        <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void ask(); }}>
          <Field label="Ваш вопрос" value={question} maxLength={500} onChange={(event) => setQuestion(event.target.value)} />
          <p className={styles.note}>По кнопке передадим вопрос и синтетические данные этого сценария настроенному AI-сервису. Ответ создаёт модель; изменения в учёте не выполняются.</p>
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

export function SupplyDemoPage() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const rawStage = params.get("stage");
  const stage: DemoStage = DEMO_STAGES.find((item) => item.id === rawStage)?.id ?? "draft";
  const [progress, setProgress] = useState(0.15);
  const [pending, setPending] = useState(false);
  const [reset, setReset] = useState(0);
  const snapshot = useMemo(() => getSupplyDemo(stage, progress), [stage, progress]);
  const stageIndex = DEMO_STAGES.findIndex((item) => item.id === stage);
  const next = DEMO_STAGES[stageIndex + 1];
  const from = returnPath(location.state?.from, "/orders", ["/orders", "/inventory", "/routes", "/assistant"]);

  useEffect(() => { setProgress(0.15); }, [stage]);
  useEffect(() => {
    if (stage !== "moving" || pending || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setProgress((value) => Math.min(0.65, value + 0.0125)), 500);
    return () => window.clearInterval(timer);
  }, [stage, pending]);

  function changeStage(value: DemoStage) {
    if (value === "draft") {
      setProgress(0.15);
      setReset((current) => current + 1);
    }
    const updated = new URLSearchParams(params);
    updated.set("stage", value);
    setParams(updated, { replace: true, state: location.state });
  }

  return (
    <>
      <PageHeader title="От заказа до склада" subtitle="Сценарная поставка и настоящий анализ ИИ." actions={
        <Button variant="secondary" icon={<ArrowLeft size={16} strokeWidth={1.8} />} onClick={() => navigate(from, { replace: true })}>Назад</Button>
      } />
      <div className={styles.page}>
        <Card>
          <div className={styles.scenarioHead}>
            <div><Badge tone="info">Синтетический сценарий</Badge><p className={styles.note}>Все товары, координаты и сроки демонстрационные. Каждый шаг меняет данные для карты, склада и ИИ.</p></div>
            <Button variant="ghost" icon={<RotateCcw size={15} strokeWidth={1.8} />} onClick={() => changeStage("draft")}>Сначала</Button>
          </div>
          <ol className={styles.stages} aria-label="Этапы демонстрации">
            {DEMO_STAGES.map((item, index) => <li key={item.id} aria-current={stage === item.id ? "step" : undefined} className={index <= stageIndex ? styles.reached : undefined}><span>{index + 1}</span>{item.label}</li>)}
          </ol>
          <div className={styles.next}>
            <strong>{snapshot.stageLabel}</strong>
            {next ? <Button variant="dark" icon={<ArrowRight size={16} strokeWidth={1.8} />} onClick={() => changeStage(next.id)}>{next.action}</Button> : <Badge tone="success">Сценарий завершён</Badge>}
          </div>
        </Card>

        <div className={styles.columns}>
          <div className={styles.stack}>
            <Card id="order" title={`Демозаказ ${snapshot.orderId}`} subtitle={`${snapshot.supplier} → ${snapshot.warehouse}`}>
              <dl className={styles.facts}>
                <div><dt>Прибытие по времени Алматы</dt><dd>{date.format(new Date(snapshot.eta))}</dd></div>
                <div><dt>Задержка</dt><dd>{snapshot.delayHours ? `+${snapshot.delayHours} ч` : "По плану"}</dd></div>
                <div><dt>Позиции в заказе</dt><dd>{snapshot.items.length}</dd></div>
              </dl>
              {stage === "draft" ? <p className={styles.note}>Заказ ещё не создан. Начните сценарий кнопкой выше.</p> : stage === "ordered" ? <p className={styles.note}>Заказ создан в сценарии. Ожидаем отгрузку: товар ещё не в пути.</p> : null}
            </Card>
            <Card id="map" padded={false} className={styles.mapCard}>
              <div className={styles.mapTitle}><h2>Движение поставки</h2><Badge tone={stage === "delayed" ? "warning" : "neutral"}>{snapshot.stageLabel}</Badge></div>
              <GeoMap trips={[snapshot.trip]} states={{ [snapshot.trip.id]: snapshot.sim }} selectedId={snapshot.trip.id} focused onSelectTrip={noop} onPickEvent={noop} />
              <p className={styles.mapNote}>Симуляция маршрута, не GPS. {pending ? "Движение приостановлено на время анализа." : stage === "moving" ? "Машина движется по сценарию; следующий шаг задаёте вы." : "Положение соответствует текущему этапу."}</p>
            </Card>
          </div>
          <Analysis key={`${stage}-${reset}`} snapshot={snapshot} onPending={setPending} />
        </div>

        <Card id="stock" title="Как поставка влияет на запас" subtitle="Постоянный синтетический спрос: отгрузки Электрокомплекта его клиентам.">
          <div className={styles.stock}>
            <Alert tone={snapshot.riskCount ? "warning" : "success"} title={stage === "received" ? "Товар принят, запас пополнен" : snapshot.riskCount ? `${snapshot.riskCount} поз. с дефицитом до приёмки` : "До приёмки дефицита нет"}>
              {stage === "received" ? "Товар принят в сценарии, остаток пополнен. Дефицит до прихода сохраняется как история сценария." : "Поставка пополнит остаток только после приёмки. Задержка увеличивает спрос до прихода."}
            </Alert>
            <Table aria-label="Расчёт запаса по товарам" stickyHeader={false}>
              <thead><Tr><Th>Товар</Th><Th numeric>Заказано</Th><Th numeric>Остаток сейчас</Th><Th numeric>Спрос / день</Th><Th numeric>К прибытию</Th><Th numeric>Дефицит до приёмки</Th><Th numeric>После приёмки</Th></Tr></thead>
              <tbody>{snapshot.items.map((item) => <Tr key={item.name}>
                <Td><strong>{item.name}</strong><div className={styles.note}>{item.unit}</div></Td>
                <Td numeric>{number.format(item.ordered)}</Td><Td numeric>{number.format(item.currentStock)}</Td><Td numeric>{number.format(item.dailyDemand)}</Td>
                <Td numeric>{number.format(item.stockAtArrival)}</Td><Td numeric className={item.shortage > 0 ? styles.risk : undefined}>{number.format(item.shortage)}</Td><Td numeric>{number.format(item.stockAfterReceipt)}</Td>
              </Tr>)}</tbody>
            </Table>
            <p className={styles.note}>Запас к прибытию = максимум из 0 и разницы остатка и спроса до прихода. Непокрытый спрос показан отдельно как дефицит. После приёмки прибавляем поставку; прошлый дефицит не становится резервом. Количества считает сценарий; ИИ объясняет причины и предлагает действия.</p>
          </div>
        </Card>
      </div>
    </>
  );
}
