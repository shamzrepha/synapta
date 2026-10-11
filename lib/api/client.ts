export type ApiOk<T> = { ok: true; data: T };
export type ApiErr = { ok: false; error: { code: string; message: string } };
export type ApiResult<T> = ApiOk<T> | ApiErr;

export function asArray<T>(v: T[] | readonly T[] | null | undefined): T[];
export function asArray<T = unknown>(v: unknown): T[];
export function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, init);
    const json = await res.json().catch(() => null);
    if (json && typeof json === "object" && "ok" in json) {
      return json as ApiResult<T>;
    }
    return {
      ok: false,
      error: { code: "MALFORMED_RESPONSE", message: "Unexpected server response" },
    };
  } catch {
    return {
      ok: false,
      error: { code: "NETWORK", message: "Network error" },
    };
  }
}
