import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { PageHeader } from "../../../app/PageHeader";
import { Button, Card, Tile } from "../../../shared/ui";
import { EventFeed } from "../components/EventFeed";
import { GeoMap } from "../components/GeoMap";
import { NewTripModal } from "../components/NewTripModal";
import { OrdersCard } from "../components/OrdersCard";
import { SimControls } from "../components/SimControls";
import { TripList } from "../components/TripList";
import { TripSummary } from "../components/TripSummary";
import { VerdictCard } from "../components/VerdictCard";
import { ORDERS } from "../data/fleet";
import { useAnalysis } from "../hooks/useAnalysis";
import { useFleetSim } from "../hooks/useFleetSim";
import { eventContext } from "../lib/context";
import { duration } from "../lib/format";
import type { Order, Trip, TripEvent } from "../types";
import styles from "./RoutesPage.module.css";
import { useI18n } from "../../../shared/i18n/I18nContext";

/**
 * Живая карта рейсов: движение, события и разбор ассистента на одном экране.
 *
 * Данные демонстрационные, движение считает симулятор — но формат событий тот же,
 * что придёт от настоящего трекера, поэтому экран переживёт замену источника.
 */
export function RoutesPage() {
  const { t } = useI18n();
  const sim = useFleetSim();
  const [focused, setFocused] = useState(true);
  const [picked, setPicked] = useState<TripEvent | undefined>(undefined);
  const [planning, setPlanning] = useState(false);
  const [order, setOrder] = useState<Order | undefined>(undefined);
  const [orders, setOrders] = useState<Order[]>(() =>
    ORDERS.filter((item) => item.tripId === undefined),
  );

  const state = sim.selectedState;
  const events = state?.events ?? [];
  const latest = events[events.length - 1];

  /* Новое событие само встаёт на разбор: в этом весь смысл — случилось, и ассистент объяснил. */
  useEffect(() => {
    if (latest !== undefined) setPicked(latest);
  }, [latest?.id]);

  /* Смена рейса сбрасывает разбор: чужое событие рядом с новым рейсом сбивает с толку. */
  useEffect(() => {
    setPicked(undefined);
  }, [sim.selected?.id]);

  const active = useMemo(() => {
    if (picked === undefined || state === undefined) return undefined;
    return events.some((event) => event.id === picked.id) ? picked : undefined;
  }, [picked, state, events]);

  const ctx = useMemo(
    () => (state === undefined || active === undefined ? undefined : eventContext(state, active)),
    [state, active?.id],
  );
  const analysis = useAnalysis(ctx);

  const running = sim.trips.filter((trip) => trip.status === "running").length;
  const alerts = sim.feed.filter((event) => event.severity === "alert").length;
  const held = Object.values(sim.states).filter(
    (item) => item.trip.status === "running" && item.runtime.halted && !item.runtime.finished,
  ).length;
  const delay = state?.runtime.delay ?? 0;

  function created(trip: Trip, source?: Order) {
    sim.addTrip(trip);
    if (source !== undefined) setOrders((current) => current.filter((item) => item.id !== source.id));
    setFocused(true);
  }

  return (
    <>
      <PageHeader
        title={t("Маршруты", "Бағыттар", "Routes")}
        subtitle={t("Где сейчас машины, что с ними происходит и что с этим делать.", "Көліктер қайда, не болып жатыр және не істеу керек.", "Where vehicles are, what is happening, and what to do.")}
        actions={
          <Button
            variant="dark"
            icon={<Plus size={15} strokeWidth={2} />}
            onClick={() => {
              setOrder(undefined);
              setPlanning(true);
            }}
          >
            {t("Новый рейс", "Жаңа рейс", "New trip")}
          </Button>
        }
      />

      <div className={styles.tiles}>
        <Tile label={t("В пути", "Жолда", "En route")} value={running} hint={t(`из ${sim.trips.length} рейсов`, `${sim.trips.length} рейстің ішінен`, `of ${sim.trips.length} trips`)} />
        <Tile
          label={t("Стоят", "Тоқтаған", "Stopped")}
          value={held}
          hint={held === 0 ? t("все едут", "бәрі жүріп жатыр", "all moving") : t("граница, отдых, поломка", "шекара, демалыс, ақау", "border, rest, breakdown")}
          tone={held > 0 ? "warn" : "default"}
        />
        <Tile label={t("Нарушений", "Ереже бұзулар", "Alerts")} value={alerts} hint={t("за всё время демонстрации", "демо барысында", "during this demo")} tone={alerts > 0 ? "up" : "default"} />
        <Tile
          label={t("Отставание", "Кідіріс", "Delay")}
          value={delay === 0 ? t("нет", "жоқ", "none") : duration(delay)}
          hint={sim.selected?.id ?? t("рейс не выбран", "рейс таңдалмаған", "no trip selected")}
          tone={delay > 0 ? "warn" : "good"}
        />
      </div>

      <Card padded={false}>
        <GeoMap
          trips={sim.trips}
          states={sim.states}
          selectedId={sim.selected?.id ?? ""}
          focused={focused}
          activeEventId={active?.id}
          onSelectTrip={sim.select}
          onPickEvent={setPicked}
        />
        <div className={styles.controls}>
          <SimControls
            playing={sim.playing}
            mode={sim.mode}
            rate={sim.rate}
            focused={focused}
            disabled={state === undefined || state.runtime.finished}
            onToggle={sim.toggle}
            onStep={sim.step}
            onReset={sim.reset}
            onMode={sim.setMode}
            onRate={sim.setRate}
            onFocus={setFocused}
            onFire={sim.fire}
          />
        </div>
      </Card>

      {state !== undefined ? (
        <Card title={`${t("Рейс", "Рейс", "Trip")} ${state.trip.id}`} subtitle={state.trip.cargo.name}>
          <TripSummary state={state} />
        </Card>
      ) : null}

      <div className={styles.columns}>
        <Card
          title={t("Рейсы", "Рейстер", "Trips")}
          subtitle={t("Выберите рейс — карта и лента переключатся на него.", "Рейсті таңдаңыз — карта мен оқиғалар соған ауысады.", "Select a trip to show it on the map and timeline.")}
          actions={
            sim.selected !== undefined && sim.selected.status === "planned" ? (
              <Button size="sm" onClick={() => sim.launch(sim.selected?.id ?? "")}>
                {t("Выпустить в рейс", "Рейсті бастау", "Start trip")}
              </Button>
            ) : undefined
          }
        >
          <TripList
            trips={sim.trips}
            states={sim.states}
            selectedId={sim.selected?.id ?? ""}
            onSelect={sim.select}
          />
        </Card>

        <Card title={t("Хронология", "Оқиғалар реті", "Timeline")} subtitle={t("Граница, телематика и режим водителя в одной ленте.", "Шекара, телематика және жүргізуші режимі бір тізімде.", "Border, telematics, and driver activity in one feed.")}>
          <EventFeed events={[...events].reverse()} activeId={active?.id} onPick={setPicked} />
        </Card>

        <div className={styles.stack}>
          <Card title={t("Разбор ассистента", "Ассистент талдауы", "Assistant analysis")}>
            <VerdictCard event={active} verdict={analysis.verdict} pending={analysis.pending} />
          </Card>
          <Card title={t("Заказы без рейса", "Рейссіз тапсырыстар", "Orders without a trip")} subtitle={t("Рейс создаётся прямо отсюда.", "Рейсті осы жерден жасауға болады.", "Create a trip directly from here.")}>
            <OrdersCard
              orders={orders}
              onPlan={(item) => {
                setOrder(item);
                setPlanning(true);
              }}
            />
          </Card>
        </div>
      </div>

      <NewTripModal
        open={planning}
        onOpenChange={setPlanning}
        order={order}
        existing={sim.trips}
        onCreate={created}
      />
    </>
  );
}
