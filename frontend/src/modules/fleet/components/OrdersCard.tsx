import { Plus } from "lucide-react";

import { Badge, Button, EmptyState } from "../../../shared/ui";
import { client } from "../data/fleet";
import { placeName } from "../data/places";
import type { Order } from "../types";
import styles from "./OrdersCard.module.css";
import { useI18n } from "../../../shared/i18n/I18nContext";

export interface OrdersCardProps {
  orders: Order[];
  onPlan: (order: Order) => void;
}

function due(value: string, locale: string): string {
  return new Date(value).toLocaleDateString(locale === "kk" ? "kk-KZ" : locale === "en" ? "en-US" : "ru-RU", { day: "numeric", month: "short" });
}

/** Заказы без рейса. Отсюда начинается цикл: заказ → рейс → движение → приёмка. */
export function OrdersCard({ orders, onPlan }: OrdersCardProps) {
  const { locale, t } = useI18n();
  if (orders.length === 0) {
    return <EmptyState title={t("Все заказы распланированы", "Барлық тапсырыстар жоспарланған", "All orders are planned")} text={t("Новых заявок нет.", "Жаңа өтінімдер жоқ.", "No new requests.")} />;
  }

  return (
    <ul className={styles.list}>
      {orders.map((order) => (
        <li key={order.id} className={styles.row}>
          <div className={styles.body}>
            <div className={styles.head}>
              <b className={styles.id}>{order.id}</b>
              <Badge tone="warning">{t("до", "дейін", "due")} {due(order.dueAt, locale)}</Badge>
            </div>
            <p className={styles.route}>
              {placeName(order.from)} → {placeName(order.to)}
            </p>
            <p className={styles.meta}>
              {client(order.clientId).name} · {order.cargo.name} · {order.cargo.weightT} {t("т", "т", "t")}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon={<Plus size={14} strokeWidth={2} />}
            onClick={() => onPlan(order)}
          >
            {t("Рейс", "Рейс", "Trip")}
          </Button>
        </li>
      ))}
    </ul>
  );
}
