import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { RouterProvider } from "react-router-dom";

import { CURRENT_USER_KEY } from "../modules/auth";
import { onUnauthorized } from "../shared/api/client";
import { I18nProvider } from "../shared/i18n/I18nContext";
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
    () => onUnauthorized(() => {
      queryClient.removeQueries({ queryKey: CURRENT_USER_KEY });
      if (router.state.location.pathname !== "/login") {
        const { pathname, search, hash } = router.state.location;
        void router.navigate("/login", { replace: true, state: { from: `${pathname}${search}${hash}` } });
      }
    }),
    [queryClient],
  );

  return (
    <I18nProvider>
      <QueryClientProvider client={queryClient}>
        <ModalProvider>
          <RouterProvider router={router} />
          <PwaUpdate />
        </ModalProvider>
      </QueryClientProvider>
    </I18nProvider>
  );
}
