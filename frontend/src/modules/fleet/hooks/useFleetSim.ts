/**
 * Состояние демонстрации: несколько рейсов идут одновременно, один выбран.
 *
 * Таймер один на все рейсы — по отдельному интервалу на машину состояния начинают
 * расходиться во времени, и лента событий перестаёт быть общей хронологией.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { TRIPS } from "../data/trips";
import { advance, createState, inject } from "../lib/simulator";
import type { SimState } from "../lib/simulator";
import type { EventKind, Trip, TripEvent } from "../types";

export type SimMode = "auto" | "manual";

/** Частота пересчёта, мс. Реже — движение рвётся, чаще — расчёт не успевает окупиться. */
const TICK_MS = 200;
/** Шаг ручного режима, минут рейса. */
export const MANUAL_STEP = 15;
/** Варианты скорости: минут рейса за секунду реального времени. */
export const RATES = [10, 30, 90] as const;

export interface FleetSim {
  trips: Trip[];
  states: Record<string, SimState>;
  selected: Trip | undefined;
  selectedState: SimState | undefined;
  /** Все события всех рейсов, новые сверху. */
  feed: TripEvent[];
  mode: SimMode;
  playing: boolean;
  rate: number;
  select: (id: string) => void;
  setMode: (mode: SimMode) => void;
  setRate: (rate: number) => void;
  toggle: () => void;
  step: () => void;
  reset: () => void;
  launch: (id: string) => void;
  fire: (kind: EventKind) => void;
  addTrip: (trip: Trip) => void;
}

function initialStates(trips: Trip[]): Record<string, SimState> {
  return Object.fromEntries(trips.map((trip) => [trip.id, createState(trip)]));
}

export function useFleetSim(): FleetSim {
  const [trips, setTrips] = useState<Trip[]>(TRIPS);
  const [states, setStates] = useState<Record<string, SimState>>(() => initialStates(TRIPS));
  const [selectedId, setSelectedId] = useState<string>(TRIPS[0]?.id ?? "");
  const [mode, setMode] = useState<SimMode>("auto");
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState<number>(RATES[1]);

  const rateRef = useRef(rate);
  rateRef.current = rate;

  /* Автоматический ход: двигаются только выехавшие рейсы. */
  useEffect(() => {
    if (!playing || mode !== "auto") return undefined;
    const timer = window.setInterval(() => {
      const minutes = (rateRef.current * TICK_MS) / 1000;
      setStates((current) => {
        let changed = false;
        const next: Record<string, SimState> = {};
        for (const [id, state] of Object.entries(current)) {
          if (state.trip.status !== "running" || state.runtime.finished) {
            next[id] = state;
            continue;
          }
          next[id] = advance(state, minutes);
          changed = true;
        }
        return changed ? next : current;
      });
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [playing, mode]);

  const select = useCallback((id: string) => setSelectedId(id), []);

  const step = useCallback(() => {
    setStates((current) => {
      const state = current[selectedId];
      if (state === undefined || state.runtime.finished) return current;
      return { ...current, [selectedId]: advance(state, MANUAL_STEP) };
    });
  }, [selectedId]);

  const toggle = useCallback(() => setPlaying((value) => !value), []);

  const reset = useCallback(() => {
    setPlaying(false);
    setStates(initialStates(trips));
  }, [trips]);

  const launch = useCallback((id: string) => {
    setTrips((current) =>
      current.map((trip) => (trip.id === id ? { ...trip, status: "running" } : trip)),
    );
    setStates((current) => {
      const state = current[id];
      if (state === undefined) return current;
      return {
        ...current,
        [id]: { ...state, trip: { ...state.trip, status: "running" } },
      };
    });
    setSelectedId(id);
    setPlaying(true);
  }, []);

  const fire = useCallback(
    (kind: EventKind) => {
      setStates((current) => {
        const state = current[selectedId];
        if (state === undefined) return current;
        return { ...current, [selectedId]: inject(state, kind) };
      });
    },
    [selectedId],
  );

  const addTrip = useCallback((trip: Trip) => {
    setTrips((current) => [trip, ...current]);
    setStates((current) => ({ ...current, [trip.id]: createState(trip) }));
    setSelectedId(trip.id);
  }, []);

  const feed = useMemo(() => {
    const all = Object.values(states).flatMap((state) => state.events);
    // Свежие сверху; при равном времени — по номеру события, чтобы порядок не прыгал.
    return all.sort((a, b) => b.at - a.at || b.id.localeCompare(a.id));
  }, [states]);

  const selected = useMemo(() => trips.find((trip) => trip.id === selectedId), [trips, selectedId]);

  return {
    trips,
    states,
    selected,
    selectedState: states[selectedId],
    feed,
    mode,
    playing,
    rate,
    select,
    setMode,
    setRate,
    toggle,
    step,
    reset,
    launch,
    fire,
    addTrip,
  };
}
