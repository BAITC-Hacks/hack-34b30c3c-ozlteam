import { buildTrip } from "./factory";
import { pointAtRatio } from "./projection";
import { createState } from "./simulator";
import type { SimState } from "./simulator";
import type { Trip } from "../types";

export type DemoStage = "draft" | "ordered" | "moving" | "delayed" | "arrived" | "received";
export const DEMO_STAGES: readonly { id: DemoStage; label: string; action: string }[] = [
  { id: "draft", label: "Подготовка", action: "Сначала" },
  { id: "ordered", label: "Заказ создан", action: "Создать демо-заказ" },
  { id: "moving", label: "В пути", action: "Отправить груз" },
  { id: "delayed", label: "Задержка", action: "Задержать на 2 дня" },
  { id: "arrived", label: "Прибыл", action: "Прибытие на склад" },
  { id: "received", label: "Принят", action: "Принять товар" },
];

const START = "2026-09-23T08:00:00+05:00";
const PLANNED_HOURS = 24;
const ITEMS = [
  { name: "Автомат IEK 16А", unit: "шт", ordered: 240, initialStock: 90, dailyDemand: 40 },
  { name: "УЗО IEK 40А", unit: "шт", ordered: 120, initialStock: 45, dailyDemand: 20 },
  { name: "Кабель ВВГнг", unit: "м", ordered: 1000, initialStock: 600, dailyDemand: 100 },
];
const BASE_TRIP = buildTrip({
  id: "KZ-1201", orderId: "ЗП-001", clientId: "demo-ekt",
  vehicleId: "veh-01", driverId: "drv-01", route: ["shymkent", "taraz", "almaty"],
  departAt: START, status: "planned",
  cargo: { name: "Пополнение Электрокомплекта: автоматы, УЗО, кабель", class: "general", weightT: 2, volumeM3: 8, pallets: 4, value: 0 },
});
// Timetable is scripted, geography comes from the existing map. No live GPS.
const INITIAL = createState(BASE_TRIP);
const round = (value: number) => Math.round(value * 10) / 10;

export interface SupplyDemoSnapshot {
  stage: DemoStage;
  stageLabel: string;
  orderId: string;
  supplier: string;
  warehouse: string;
  trip: Trip;
  sim: SimState;
  eta: string;
  delayHours: number;
  elapsedHours: number;
  items: { name: string; unit: string; ordered: number; currentStock: number; dailyDemand: number; stockAtArrival: number; shortage: number; stockAfterReceipt: number }[];
  riskCount: number;
}

export function getSupplyDemo(stage: DemoStage, progress = 0.15): SupplyDemoSnapshot {
  const arrived = stage === "arrived" || stage === "received";
  const delayed = stage === "delayed" || arrived;
  const delayHours = delayed ? 48 : 0;
  const ratio = arrived ? 1 : stage === "delayed" ? 0.65 : stage === "moving" ? Math.max(0.15, Math.min(0.65, Number.isFinite(progress) ? progress : 0.15)) : 0;
  const elapsedHours = arrived ? PLANNED_HOURS + delayHours : round(PLANNED_HOURS * ratio);
  const trip: Trip = { ...BASE_TRIP, status: arrived ? "done" : stage === "delayed" ? "held" : stage === "moving" ? "running" : "planned" };
  const at = pointAtRatio(INITIAL.path, ratio);
  const sim: SimState = {
    ...INITIAL, trip,
    runtime: {
      ...INITIAL.runtime, minutes: elapsedHours * 60, km: trip.plan.km * ratio,
      point: at.point, heading: at.heading, delay: delayHours * 60,
      halted: stage === "delayed" || arrived, haltReason: stage === "delayed" ? "Задержка на 2 дня" : arrived ? "На складе" : undefined,
      finished: arrived, telemetry: { ...INITIAL.runtime.telemetry, speed: stage === "moving" ? 65 : 0 },
    },
  };
  const items = ITEMS.map((item) => {
    const beforeReceipt = Math.max(0, round(item.initialStock - item.dailyDemand * elapsedHours / 24));
    const balance = round(item.initialStock - item.dailyDemand * (PLANNED_HOURS + delayHours) / 24);
    return {
      name: item.name, unit: item.unit, ordered: item.ordered, dailyDemand: item.dailyDemand,
      currentStock: beforeReceipt + (stage === "received" ? item.ordered : 0),
      stockAtArrival: Math.max(0, balance), shortage: Math.max(0, -balance),
      stockAfterReceipt: Math.max(0, balance) + item.ordered,
    };
  });
  return {
    stage, stageLabel: DEMO_STAGES.find((item) => item.id === stage)!.label,
    orderId: BASE_TRIP.orderId!, supplier: "IEK", warehouse: "Электрокомплект, Алматы",
    trip, sim, eta: new Date(Date.parse(START) + (PLANNED_HOURS + delayHours) * 3_600_000).toISOString(),
    delayHours, elapsedHours, items,
    riskCount: stage === "received" ? 0 : items.filter((item) => item.shortage > 0).length,
  };
}

export function supplyDemoPrompt(snapshot: SupplyDemoSnapshot, question: string): string {
  const facts = {
    источник: "Полностью синтетический сценарий, не данные 1С или GPS",
    этап: snapshot.stageLabel, заказ: snapshot.orderId, поставщик: snapshot.supplier,
    отгрузкаПодтверждена: !["draft", "ordered"].includes(snapshot.stage),
    состояниеМашины: snapshot.stage === "delayed" ? "Уже выехала, прошла 65% маршрута и остановилась в пути; задержка на 48 часов" : snapshot.stage === "moving" ? "Едет по маршруту" : ["arrived", "received"].includes(snapshot.stage) ? "Прибыла на склад" : "Ещё не выехала",
    склад: snapshot.warehouse, рейс: snapshot.trip.id, маршрут: "Шымкент → Тараз → Алматы",
    времяСценария: new Date(Date.parse(START) + snapshot.elapsedHours * 3_600_000).toISOString(),
    положение: { широта: round(snapshot.sim.runtime.point.lat), долгота: round(snapshot.sim.runtime.point.lon), пройденоПроцентов: Math.round(snapshot.sim.runtime.km / snapshot.trip.plan.km * 100) },
    планПрибытия: "2026-09-24T08:00:00+05:00", ожидаемоеПрибытие: snapshot.eta,
    задержкаЧасов: snapshot.delayHours, позицийРиска: snapshot.riskCount,
    позиции: snapshot.items.map((item) => ({ товар: item.name, единица: item.unit, заказано: item.ordered, остатокСейчас: item.currentStock, спросВСутки: item.dailyDemand, остатокПередПриёмкой: item.stockAtArrival, неудовлетворённыйСпросДоПрихода: item.shortage, остатокПослеПриёмки: item.stockAfterReceipt })),
  };
  return `Проанализируй учебную поставку для закупщика. Данные ниже полностью вымышлены и переданы пользователем; читать учётную БД не нужно. Ответь на вопрос по этому снимку: ${question.slice(0, 500)}\n` +
    "Дай кратко статус, срок (время Алматы UTC+5), риск по конкретным товарам и 1–2 действия для менеджера. Числа уже рассчитаны приложением: не подменяй их. Равномерный спрос — допущение демо. До этапа «В пути» машина ещё не выехала; «Прибыл» не означает приёмку. После «Принят» дефицит до прихода исторический, не текущий; упущенный спрос не считается резервом. Не заявляй выполненные действия или реальное GPS. Если чего-то нет в снимке, скажи об этом.\nСнимок:\n" + JSON.stringify(facts);
}
