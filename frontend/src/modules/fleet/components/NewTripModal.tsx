import { useEffect, useMemo, useState } from "react";

import { Alert, Field, FormModal, Select } from "../../../shared/ui";
import { CLIENTS, DRIVERS, VEHICLES, vehicle } from "../data/fleet";
import { PLACES, placeName } from "../data/places";
import { buildTrip, nextTripId } from "../lib/factory";
import { duration, km, money, num } from "../lib/format";
import { findRoute, planRoute } from "../lib/route";
import type { Cargo, CargoClass, Order, Trip } from "../types";
import styles from "./NewTripModal.module.css";
import { useI18n } from "../../../shared/i18n/I18nContext";

const CARGO_CLASSES: { value: CargoClass; label: string }[] = [
  { value: "general", label: "Обычный груз" },
  { value: "food", label: "Продукты, температурный режим" },
  { value: "fragile", label: "Хрупкий" },
  { value: "danger", label: "Опасный" },
  { value: "oversize", label: "Негабарит" },
];

export interface NewTripModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Заказ, по которому создаётся рейс. Без него форма пустая. */
  order?: Order;
  existing: Trip[];
  onCreate: (trip: Trip, order?: Order) => void;
}

/**
 * Создание рейса: маршрут подбирается по сети коридоров, а план пересчитывается
 * на каждое изменение. Человек видит цену и срок до того, как нажмёт «Создать», —
 * иначе рейс приходится удалять и заводить заново.
 */
export function NewTripModal({ open, onOpenChange, order, existing, onCreate }: NewTripModalProps) {
  const { t } = useI18n();
  const [from, setFrom] = useState("almaty");
  const [to, setTo] = useState("astana");
  const [vehicleId, setVehicleId] = useState(VEHICLES[0].id);
  const [driverId, setDriverId] = useState(DRIVERS[0].id);
  const [clientId, setClientId] = useState(CLIENTS[0].id);
  const [name, setName] = useState("Сборный груз");
  const [weight, setWeight] = useState("18");
  const [pallets, setPallets] = useState("20");
  const [cargoClass, setCargoClass] = useState<CargoClass>("general");

  /* Заказ подставляет всё, что в нём уже есть: логист правит, а не вводит заново. */
  useEffect(() => {
    if (!open || order === undefined) return;
    setFrom(order.from);
    setTo(order.to);
    setClientId(order.clientId);
    setName(order.cargo.name);
    setWeight(String(order.cargo.weightT));
    setPallets(String(order.cargo.pallets));
    setCargoClass(order.cargo.class);
  }, [open, order]);

  const route = useMemo(() => findRoute(from, to), [from, to]);
  const plan = useMemo(
    () => (route === null ? null : planRoute(route, vehicle(vehicleId))),
    [route, vehicleId],
  );

  const car = vehicle(vehicleId);
  const weightValue = Number(weight.replace(",", "."));
  const overweight = Number.isFinite(weightValue) && weightValue > car.capacityT;

  function submit() {
    if (route === null) return;
    const cargo: Cargo = {
      name: name.trim() === "" ? t("Груз", "Жүк", "Cargo") : name.trim(),
      class: cargoClass,
      weightT: Number.isFinite(weightValue) ? weightValue : 0,
      volumeM3: order?.cargo.volumeM3 ?? Math.round(Number(pallets) * 1.9),
      pallets: Number(pallets) || 0,
      value: order?.cargo.value ?? 0,
      temperature: cargoClass === "food" ? (order?.cargo.temperature ?? "+2…+6 °C") : undefined,
    };
    const trip = buildTrip({
      id: nextTripId(existing),
      orderId: order?.id,
      clientId,
      vehicleId,
      driverId,
      cargo,
      route,
      departAt: new Date().toISOString(),
    });
    onCreate(trip, order);
    onOpenChange(false);
  }

  return (
    <FormModal
      id="fleet-new-trip"
      title={order === undefined ? t("Новый рейс", "Жаңа рейс", "New trip") : t(`Рейс по заказу ${order.id}`, `${order.id} тапсырысы бойынша рейс`, `Trip for order ${order.id}`)}
      size="lg"
      open={open}
      onOpenChange={onOpenChange}
      submitLabel={t("Создать рейс", "Рейс жасау", "Create trip")}
      onSubmit={submit}
    >
      <div className={styles.grid}>
        <Select label={t("Откуда", "Қайдан", "From")} value={from} onChange={(event) => setFrom(event.target.value)}>
          {PLACES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </Select>
        <Select label={t("Куда", "Қайда", "To")} value={to} onChange={(event) => setTo(event.target.value)}>
          {PLACES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </Select>

        <Select
          label={t("Машина", "Көлік", "Vehicle")}
          value={vehicleId}
          onChange={(event) => setVehicleId(event.target.value)}
          hint={`${car.capacityT} ${t("т", "т", "t")} · ${car.capacityM3} ${t("м³", "м³", "m³")} · ${car.consumption} ${t("л/100 км", "л/100 км", "L/100 km")}`}
        >
          {VEHICLES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.model} — {item.plate}
            </option>
          ))}
        </Select>
        <Select label={t("Водитель", "Жүргізуші", "Driver")} value={driverId} onChange={(event) => setDriverId(event.target.value)}>
          {DRIVERS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} ({item.category})
            </option>
          ))}
        </Select>

        <Select label={t("Клиент", "Клиент", "Client")} value={clientId} onChange={(event) => setClientId(event.target.value)}>
          {CLIENTS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </Select>
        <Select
          label={t("Класс груза", "Жүк санаты", "Cargo class")}
          value={cargoClass}
          onChange={(event) => setCargoClass(event.target.value as CargoClass)}
        >
          {CARGO_CLASSES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.value === "general" ? t("Обычный груз", "Қарапайым жүк", "General cargo") : item.value === "food" ? t("Продукты, температурный режим", "Азық-түлік, температуралық режим", "Food, temperature controlled") : item.value === "fragile" ? t("Хрупкий", "Сынғыш", "Fragile") : item.value === "danger" ? t("Опасный", "Қауіпті", "Hazardous") : t("Негабарит", "Ірі көлемді", "Oversize")}
            </option>
          ))}
        </Select>

        <Field label={t("Груз", "Жүк", "Cargo")} value={name} onChange={(event) => setName(event.target.value)} />
        <div className={styles.pair}>
          <Field
            label={t("Вес, т", "Салмақ, т", "Weight, t")}
            inputMode="decimal"
            value={weight}
            onChange={(event) => setWeight(event.target.value)}
            error={overweight ? t(`Больше грузоподъёмности: ${car.capacityT} т`, `Жүк көтерімділігінен асады: ${car.capacityT} т`, `Exceeds capacity: ${car.capacityT} t`) : undefined}
          />
          <Field
            label={t("Паллет", "Паллет", "Pallets")}
            inputMode="numeric"
            value={pallets}
            onChange={(event) => setPallets(event.target.value)}
          />
        </div>
      </div>

      {route === null ? (
        <Alert tone="warning" title={t("Маршрут не найден", "Бағыт табылмады", "Route not found")}>
          {t(`Между «${placeName(from)}» и «${placeName(to)}» в справочнике нет дороги. Выберите другие точки — сеть коридоров пока покрывает Китай, Казахстан, Узбекистан и Россию.`, `Анықтамалықта «${placeName(from)}» және «${placeName(to)}» арасында жол жоқ. Басқа нүктелерді таңдаңыз — желі әзірге Қытай, Қазақстан, Өзбекстан және Ресейді қамтиды.`, `There is no road between “${placeName(from)}” and “${placeName(to)}” in the directory. Choose other points. The network currently covers China, Kazakhstan, Uzbekistan, and Russia.`)}
        </Alert>
      ) : (
        <div className={styles.plan}>
          <p className={styles.chain}>{route.map((id) => placeName(id)).join(" → ")}</p>
          <dl className={styles.numbers}>
            <div>
              <dt>{t("Расстояние", "Қашықтық", "Distance")}</dt>
              <dd>{km(plan?.km ?? 0)}</dd>
            </div>
            <div>
              <dt>{t("В пути", "Жолда", "Travel time")}</dt>
              <dd>{duration((plan?.totalHours ?? 0) * 60)}</dd>
            </div>
            <div>
              <dt>{t("Топливо", "Жанармай", "Fuel")}</dt>
              <dd>{num(plan?.fuelL ?? 0)} {t("л", "л", "L")}</dd>
            </div>
            <div>
              <dt>{t("Себестоимость", "Өзіндік құн", "Cost")}</dt>
              <dd>{money(plan?.cost ?? 0)}</dd>
            </div>
            <div className={styles.price}>
              <dt>{t("Клиенту", "Клиентке", "Client price")}</dt>
              <dd>{money(plan?.price ?? 0)}</dd>
            </div>
          </dl>
        </div>
      )}
    </FormModal>
  );
}
