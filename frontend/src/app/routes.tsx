import { createBrowserRouter, Navigate } from "react-router-dom";

import { AssistantPage } from "../modules/assistant";
import { LoginPage } from "../modules/auth";
import { DashboardPage } from "../modules/dashboard";
import { RoutesPage } from "../modules/fleet";
import { NotesPage } from "../modules/notes";
import { ReplenishmentPage } from "../modules/replenishment";
import { UiKitPage } from "../modules/ui-kit";
import { AppLayout } from "./AppLayout";
import { RequireAuth } from "./RequireAuth";

/** Заглушка раздела: каркас есть, предметная часть появится вместе с направлением. */
function Placeholder({ title }: { title: string }) {
  return (
    <section>
      <h1 style={{ margin: 0, fontSize: "var(--fs-h1)", letterSpacing: "var(--ls-h1)" }}>
        {title}
      </h1>
      <p style={{ color: "var(--mut)" }}>
        Раздел ещё не наполнен. Каркас, маршрут и права уже работают.
      </p>
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
      { index: true, element: <ReplenishmentPage /> },
      { path: "dashboard", element: <DashboardPage /> },
      { path: "notes", element: <NotesPage /> },
      { path: "assistant", element: <AssistantPage /> },
      { path: "shipments", element: <Placeholder title="Отправления" /> },
      { path: "documents", element: <Placeholder title="Документы" /> },
      { path: "receiving", element: <Placeholder title="Приёмка" /> },
      { path: "warehouse", element: <Placeholder title="Склад" /> },
      { path: "routes", element: <RoutesPage /> },
      { path: "clients", element: <Placeholder title="Клиенты" /> },
      { path: "carriers", element: <Placeholder title="Перевозчики" /> },
      { path: "ui-kit", element: <UiKitPage /> },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
