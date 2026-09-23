import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { RouterProvider } from "react-router-dom";

import { onUnauthorized } from "../shared/api/client";
import { PwaUpdate } from "../shared/pwa/PwaUpdate";
import { ModalProvider } from "../shared/ui";
import { router } from "./routes";

function createClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          // 401 уже обработан клиентом — повторять бессмысленно.
          if (error instanceof Error && error.message.includes("Сессия истекла")) return false;
          return failureCount < 2;
        },
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
    },
  });
}

export function App() {
  const [queryClient] = useState(createClient);

  useEffect(
    () => onUnauthorized(() => router.navigate("/login", { replace: true })),
    [],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ModalProvider>
        <RouterProvider router={router} />
        <PwaUpdate />
      </ModalProvider>
    </QueryClientProvider>
  );
}
