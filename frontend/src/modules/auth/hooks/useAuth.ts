import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";

import { tokenStore } from "../../../shared/api/client";
import { fetchMe, login as loginRequest, logout as logoutRequest } from "../api/auth";
import type { CurrentUser } from "../api/auth";

export const CURRENT_USER_KEY = ["auth", "me"] as const;

export function useCurrentUser() {
  return useQuery<CurrentUser>({
    queryKey: CURRENT_USER_KEY,
    queryFn: fetchMe,
    // Без токена запрос заведомо вернёт 401 — не дёргаем сеть впустую.
    enabled: tokenStore.get() !== null,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      loginRequest(email, password),
    onSuccess: (user) => queryClient.setQueryData(CURRENT_USER_KEY, user),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  return useMutation({
    mutationFn: logoutRequest,
    onSettled: () => {
      queryClient.clear();
      void navigate("/login", {
        replace: true,
        state: { from: `${location.pathname}${location.search}${location.hash}` },
      });
    },
  });
}
