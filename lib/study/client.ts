import { fetchJson } from "@/lib/api/client";

/** Calls one of our own endpoints and returns `data`, or throws an Error with the server's message. */
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetchJson<T>(url, init);
  if (!res.ok) throw new Error(res.error.message || "Something went wrong");
  return res.data;
}

export function send<T>(url: string, body: unknown, method: "POST" | "PATCH" | "DELETE" = "POST"): Promise<T> {
  return api<T>(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

/** The student's local calendar day as YYYY-MM-DD. */
export function localDay(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}
