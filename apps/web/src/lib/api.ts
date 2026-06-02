/**
 * Tiny client-side helper for talking to the Kongsian API.
 *
 * Usage:
 *   const api = createApiClient({ baseUrl: import.meta.env.PUBLIC_API_URL });
 *   const { data, error } = await api.get("/v1/brands/me");
 *
 * Reads the session token from localStorage (key: kongsian_session).
 * Returns `{ data, error, status }` so callers can show friendly errors.
 */

export interface ApiClient {
  get<T = any>(path: string, init?: RequestInit): Promise<ApiResult<T>>;
  post<T = any>(path: string, body?: any, init?: RequestInit): Promise<ApiResult<T>>;
  patch<T = any>(path: string, body?: any, init?: RequestInit): Promise<ApiResult<T>>;
  delete<T = any>(path: string, init?: RequestInit): Promise<ApiResult<T>>;
  raw<T = any>(path: string, init: RequestInit): Promise<ApiResult<T>>;
}

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: { code: string; message?: string; issues?: any } | null;
}

const SESSION_KEY = "kongsian_session";

export function getSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(SESSION_KEY);
}

export function setSessionToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(SESSION_KEY, token);
  else window.localStorage.removeItem(SESSION_KEY);
}

export function createApiClient(opts: { baseUrl: string; getToken?: () => string | null }): ApiClient {
  const baseUrl = opts.baseUrl.replace(/\/$/, "");
  const getToken = opts.getToken ?? getSessionToken;

  async function call<T>(method: string, path: string, body: any, init?: RequestInit): Promise<ApiResult<T>> {
    const url = path.startsWith("http") ? path : `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const headers = new Headers(init?.headers || {});
    headers.set("Content-Type", "application/json");
    const tok = getToken();
    if (tok) headers.set("Authorization", `Bearer ${tok}`);
    let payload: BodyInit | null | undefined = undefined;
    if (body !== undefined && body !== null) {
      payload = typeof body === "string" ? body : JSON.stringify(body);
    }
    try {
      const res = await fetch(url, { method, headers, body: payload, ...init });
      const status = res.status;
      const json = await res.json().catch(() => ({}));
      if (res.ok && json && json.ok) {
        return { ok: true, status, data: (json.data ?? null) as T, error: null };
      }
      return {
        ok: false,
        status,
        data: null,
        error: (json && json.error) || { code: "UNKNOWN", message: `HTTP ${status}` },
      };
    } catch (e: any) {
      return { ok: false, status: 0, data: null, error: { code: "NETWORK", message: e?.message || "Network error" } };
    }
  }

  return {
    get: (p, i) => call("GET", p, undefined, i),
    post: (p, b, i) => call("POST", p, b, i),
    patch: (p, b, i) => call("PATCH", p, b, i),
    delete: (p, i) => call("DELETE", p, undefined, i),
    raw: (p, i) => call(i.method || "GET", p, undefined, i),
  };
}

/** API base URL — set in apps/web wrangler.toml as PUBLIC_API_URL (or fallback). */
export const API_BASE_URL =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.PUBLIC_API_URL) ||
  "https://kongsian-api.workers.dev";

/** Single shared client. */
export const api = createApiClient({ baseUrl: API_BASE_URL });
