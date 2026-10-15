import { fetchJson } from "@/lib/api/client";

/** Calls our own API and returns data, or throws an Error with the server message. */
export async function api<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetchJson<T>(url, {
    method: init?.method || "GET",
    headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) throw new Error(res.error.message || "Something went wrong");
  return res.data;
}

export interface MyClass {
  id: string;
  title: string;
  isOwner?: boolean;
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}
