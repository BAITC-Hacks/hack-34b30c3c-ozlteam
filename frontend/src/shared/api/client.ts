const TOKEN_KEY = "hackalem.token";

export class ApiError extends Error {
  constructor(
    public status: number,
    message?: string,
  ) {
    super(message ?? `Ошибка API (${status}). Попробуйте ещё раз.`);
  }
}

/** Токен живёт в localStorage: на соревнованиях этого достаточно. */
export const tokenStore = {
  get: (): string | null => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (token: string): void => {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* приватный режим — работаем без сохранения */
    }
  },
  clear: (): void => {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* см. выше */
    }
  },
};

/** Слушатели 401: роутер перекидывает на вход, не зная деталей запроса. */
type UnauthorizedHandler = () => void;
const unauthorizedHandlers = new Set<UnauthorizedHandler>();

export function onUnauthorized(handler: UnauthorizedHandler): () => void {
  unauthorizedHandlers.add(handler);
  return () => unauthorizedHandlers.delete(handler);
}

async function readError(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string") return body.detail;
  } catch {
    /* тело не JSON — покажем общий текст */
  }
  return undefined;
}

async function request(path: string, init: RequestInit): Promise<Response> {
  const token = tokenStore.get();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`/api${path}`, { ...init, headers });

  if (response.status === 401) {
    tokenStore.clear();
    unauthorizedHandlers.forEach((handler) => handler());
    throw new ApiError(401, "Сессия истекла. Войдите заново.");
  }
  if (!response.ok) throw new ApiError(response.status, await readError(response));
  return response;
}

/** JSON-запрос. Для тела передавайте обычный объект, сериализация внутри. */
export async function apiRequest<T>(
  path: string,
  init: Omit<RequestInit, "body"> & { body?: unknown } = {},
): Promise<T> {
  const { body, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (body !== undefined) headers.set("Content-Type", "application/json");

  const response = await request(path, {
    ...rest,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Загрузка файла: Content-Type проставляет браузер вместе с boundary. */
export async function apiUpload<T>(path: string, file: File, field = "file"): Promise<T> {
  const form = new FormData();
  form.append(field, file);
  const response = await request(path, { method: "POST", body: form });
  return (await response.json()) as T;
}

/** Поток статуса фоновой задачи. Возвращает функцию отписки. */
export function apiEvents(path: string, onMessage: (data: unknown) => void): () => void {
  const source = new EventSource(`/api${path}`);
  source.onmessage = (event) => {
    try {
      onMessage(JSON.parse(event.data));
    } catch {
      /* пропускаем кадры, которые не разбираются */
    }
  };
  return () => source.close();
}
