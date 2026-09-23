import { createBrowserRouter, Navigate } from "react-router-dom";

import { AssistantPage } from "../modules/assistant";
import { LoginPage } from "../modules/auth";
import { CatalogsPage } from "../modules/catalogs";
import { DataSourcesPage, RestIntegrationsPage } from "../modules/data";
import { RoutesPage, SupplyDemoPage } from "../modules/fleet";
import { InventoryPage } from "../modules/inventory";
import { NotesPage } from "../modules/notes";
import { OrdersPage } from "../modules/orders";
import { OverviewPage } from "../modules/overview";
import { RecommendationDetailPage, ReplenishmentPage, RunsPage } from "../modules/replenishment";
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
      { index: true, element: <OverviewPage /> },
      {
        path: "recommendations",
        element: <RunsPage />,
      },
      { path: "recommendations/:recommendationId", element: <RecommendationDetailPage /> },
      { path: "recommendations/demo", element: <ReplenishmentPage /> },
      {
        path: "orders",
        element: <OrdersPage />,
      },
      {
        path: "inventory",
        element: <InventoryPage />,
      },
      {
        path: "data",
        element: <DataSourcesPage />,
      },
      {
        path: "data/integrations",
        element: <RestIntegrationsPage />,
      },
      {
        path: "data/catalogs",
        element: <CatalogsPage />,
      },
      { path: "notes", element: <NotesPage /> },
      { path: "assistant", element: <AssistantPage /> },
      { path: "shipments", element: <Placeholder title="Отправления" description="Раздел пока недоступен." /> },
      { path: "documents", element: <Placeholder title="Документы" description="Раздел пока недоступен." /> },
      { path: "receiving", element: <Placeholder title="Приёмка" description="Раздел пока недоступен." /> },
      { path: "warehouse", element: <Navigate to="/inventory" replace /> },
      { path: "routes", element: <RoutesPage /> },
      { path: "routes/demo", element: <SupplyDemoPage /> },
      { path: "clients", element: <Placeholder title="Клиенты" description="Раздел пока недоступен." /> },
      { path: "carriers", element: <Placeholder title="Перевозчики" description="Раздел пока недоступен." /> },
      { path: "ui-kit", element: <UiKitPage /> },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
