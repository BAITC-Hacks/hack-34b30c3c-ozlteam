import { Plus } from "lucide-react";

import { Badge, Button, EmptyState } from "../../../shared/ui";
import { client } from "../data/fleet";
import { placeName } from "../data/places";
import type { Order } from "../types";
import styles from "./OrdersCard.module.css";

export interface OrdersCardProps {
  orders: Order[];
  onPlan: (order: Order) => void;
}

function due(value: string): string {
  return new Date(value).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

/** Заказы без рейса. Отсюда начинается цикл: заказ → рейс → движение → приёмка. */
export function OrdersCard({ orders, onPlan }: OrdersCardProps) {
  if (orders.length === 0) {
    return <EmptyState title="Все заказы распланированы" text="Новых заявок нет." />;
  }

  return (
    <ul className={styles.list}>
      {orders.map((order) => (
        <li key={order.id} className={styles.row}>
          <div className={styles.body}>
            <div className={styles.head}>
              <b className={styles.id}>{order.id}</b>
              <Badge tone="warning">до {due(order.dueAt)}</Badge>
            </div>
            <p className={styles.route}>
              {placeName(order.from)} → {placeName(order.to)}
            </p>
            <p className={styles.meta}>
              {client(order.clientId).name} · {order.cargo.name} · {order.cargo.weightT} т
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon={<Plus size={14} strokeWidth={2} />}
            onClick={() => onPlan(order)}
          >
            Рейс
          </Button>
        </li>
      ))}
    </ul>
  );
}
