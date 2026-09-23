import { createBrowserRouter, Navigate } from "react-router-dom";

import { AssistantPage } from "../modules/assistant";
import { LoginPage } from "../modules/auth";
import { RoutesPage } from "../modules/fleet";
import { NotesPage } from "../modules/notes";
import { ReplenishmentPage } from "../modules/replenishment";
import { UiKitPage } from "../modules/ui-kit";
import { AppLayout } from "./AppLayout";
import { PageHeader } from "./PageHeader";
import { RequireAuth } from "./RequireAuth";

function Placeholder({ title, description }: { title: string; description: string }) {
  return (
    <section>
      <PageHeader title={title} subtitle={description} />
    </section>
  );
}

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    path: "/",
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/recommendations" replace /> },
      {
        path: "recommendations",
        element: <ReplenishmentPage />,
      },
      {
        path: "orders",
        element: <Placeholder title="Заказы поставщикам" description="Здесь будут черновики заказов для проверки, утверждения и экспорта." />,
      },
      {
        path: "inventory",
        element: <Placeholder title="Запасы" description="Остатки, товары в пути и периоды отсутствия товара будут собраны здесь." />,
      },
      {
        path: "data",
        element: <Placeholder title="Источники данных" description="Здесь будут загрузка выгрузок, проверка полей и состояние данных." />,
      },
      {
        path: "data/catalogs",
        element: <Placeholder title="Справочники" description="Товары, категории, поставщики и сроки поставки будут доступны здесь." />,
      },
      { path: "notes", element: <NotesPage /> },
      { path: "assistant", element: <AssistantPage /> },
      { path: "shipments", element: <Placeholder title="Отправления" description="Раздел пока недоступен." /> },
      { path: "documents", element: <Placeholder title="Документы" description="Раздел пока недоступен." /> },
      { path: "receiving", element: <Placeholder title="Приёмка" description="Раздел пока недоступен." /> },
      { path: "warehouse", element: <Navigate to="/inventory" replace /> },
      { path: "routes", element: <RoutesPage /> },
      { path: "clients", element: <Placeholder title="Клиенты" description="Раздел пока недоступен." /> },
      { path: "carriers", element: <Placeholder title="Перевозчики" description="Раздел пока недоступен." /> },
      { path: "ui-kit", element: <UiKitPage /> },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
