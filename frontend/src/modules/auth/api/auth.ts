import { apiRequest, tokenStore } from "../../../shared/api/client";

export interface CurrentUser {
  id: string;
  email: string;
  full_name: string;
  permissions: string[];
}

interface TokenResponse {
  access_token: string;
  token_type: string;
}

export async function login(email: string, password: string): Promise<CurrentUser> {
  const token = await apiRequest<TokenResponse>("/v1/auth/login", {
    method: "POST",
    body: { email, password },
  });
  tokenStore.set(token.access_token);
  return fetchMe();
}

export function fetchMe(): Promise<CurrentUser> {
  return apiRequest<CurrentUser>("/v1/auth/me");
}

export async function logout(): Promise<void> {
  try {
    await apiRequest<void>("/v1/auth/logout", { method: "POST" });
  } finally {
    tokenStore.clear();
  }
}
