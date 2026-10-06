import { useAuth } from "../stores/auth";
import type { Session } from "../types/api";

export const API = "/api/v1";

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let refreshing: Promise<boolean> | null = null;

/** One silent refresh-token rotation shared by every request that hit a 401 at the same time. */
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
      setSession((await r.json()) as Session);
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
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("json")) {
    if (!res.ok) throw new ApiError(res.status, "error", `Request failed (${res.status})`);
    return res;
  }
  const data = await res.json();
  if (!res.ok) {
    const err = data?.error;
    throw new ApiError(res.status, err?.code ?? "error", err?.message ?? `Request failed (${res.status})`, err?.details);
  }
  return data;
}

type Init = RequestInit & { json?: unknown };

/** The single request function: auth header, one silent refresh, uniform errors. */
export async function request<T>(path: string, init: Init = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const send = () => {
    const token = useAuth.getState().tokens?.access_token;
    return fetch(`${API}${path}`, {
      ...rest,
      headers: {
        ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  };
  let res = await send();
  if (res.status === 401 && !path.startsWith("/auth/login") && !path.startsWith("/auth/refresh") && (await refresh())) res = await send();
  return (await parse(res)) as T;
}

export const get = <T>(path: string) => request<T>(path);
export const post = <T>(path: string, json?: unknown) => request<T>(path, { method: "POST", json: json ?? {} });
export const patch = <T>(path: string, json: unknown) => request<T>(path, { method: "PATCH", json });
export const upload = <T>(path: string, form: FormData) => request<T>(path, { method: "POST", body: form });

export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "");
  return entries.length ? `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()}` : "";
}
