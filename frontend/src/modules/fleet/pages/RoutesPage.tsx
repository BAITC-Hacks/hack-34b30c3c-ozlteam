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

/**
 * Живая карта рейсов: движение, события и разбор ассистента на одном экране.
 *
 * Данные демонстрационные, движение считает симулятор — но формат событий тот же,
 * что придёт от настоящего трекера, поэтому экран переживёт замену источника.
 */
export function RoutesPage() {
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
        title="Маршруты"
        subtitle="Где сейчас машины, что с ними происходит и что с этим делать."
        actions={
          <Button
            variant="dark"
            icon={<Plus size={15} strokeWidth={2} />}
            onClick={() => {
              setOrder(undefined);
              setPlanning(true);
            }}
          >
            Новый рейс
          </Button>
        }
      />

      <div className={styles.tiles}>
        <Tile label="В пути" value={running} hint={`из ${sim.trips.length} рейсов`} />
        <Tile
          label="Стоят"
          value={held}
          hint={held === 0 ? "все едут" : "граница, отдых, поломка"}
          tone={held > 0 ? "warn" : "default"}
        />
        <Tile label="Нарушений" value={alerts} hint="за всё время демонстрации" tone={alerts > 0 ? "up" : "default"} />
        <Tile
          label="Отставание"
          value={delay === 0 ? "нет" : duration(delay)}
          hint={sim.selected?.id ?? "рейс не выбран"}
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
        <Card title={`Рейс ${state.trip.id}`} subtitle={state.trip.cargo.name}>
          <TripSummary state={state} />
        </Card>
      ) : null}

      <div className={styles.columns}>
        <Card
          title="Рейсы"
          subtitle="Выберите рейс — карта и лента переключатся на него."
          actions={
            sim.selected !== undefined && sim.selected.status === "planned" ? (
              <Button size="sm" onClick={() => sim.launch(sim.selected?.id ?? "")}>
                Выпустить в рейс
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

        <Card title="Хронология" subtitle="Граница, телематика и режим водителя в одной ленте.">
          <EventFeed events={[...events].reverse()} activeId={active?.id} onPick={setPicked} />
        </Card>

        <div className={styles.stack}>
          <Card title="Разбор ассистента">
            <VerdictCard event={active} verdict={analysis.verdict} pending={analysis.pending} />
          </Card>
          <Card title="Заказы без рейса" subtitle="Рейс создаётся прямо отсюда.">
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
