import { useAuth } from "../stores/auth";
import type { Tokens } from "../types";

export const API = "/api/v1";

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let refreshing: Promise<boolean> | null = null;

async function refresh(): Promise<boolean> {
  const { tokens, setSession, clear } = useAuth.getState();
  if (!tokens) return false;
  refreshing ??= fetch(`${API}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: tokens.refresh_token }),
  })
    .then(async (r) => {
      if (!r.ok) throw new Error("refresh failed");
      setSession((await r.json()) as Tokens);
      return true;
    })
    .catch(() => {
      clear();
      return false;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

async function parse(res: Response) {
  if (res.status === 204) return null;
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = data?.error;
    throw new ApiError(res.status, err?.code ?? "error", err?.message ?? data?.detail ?? `Request failed (${res.status})`);
  }
  return data;
}

/** Single, centralised request function: auth header, one silent token refresh, uniform errors. */
export async function request<T>(path: string, init: RequestInit & { json?: unknown; base?: string } = {}): Promise<T> {
  const { json, base = API, headers, ...rest } = init;
  const send = () => {
    const token = useAuth.getState().tokens?.access_token;
    const isForm = rest.body instanceof FormData;
    return fetch(`${base}${path}`, {
      ...rest,
      headers: {
        ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(isForm ? {} : {}),
        ...headers,
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  };
  let res = await send();
  if (res.status === 401 && !path.startsWith("/auth/") && (await refresh())) res = await send();
  return (await parse(res)) as T;
}

export const get = <T>(path: string) => request<T>(path);
export const post = <T>(path: string, json?: unknown) => request<T>(path, { method: "POST", json: json ?? {} });
export const patch = <T>(path: string, json: unknown) => request<T>(path, { method: "PATCH", json });
