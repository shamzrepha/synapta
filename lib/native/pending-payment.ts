/**
 * A payment that was started but not yet confirmed. Paystack opens in the browser, so the person can come back to the app
 * (or a tab) without the "paid" return link; we remember the reference and confirm it when they are back.
 */
const KEY = "sunroot:pendingPayment";
const MAX_AGE_MS = 60 * 60 * 1000;

export interface PendingPayment {
  reference: string;
  at: number;
}

export function savePending(reference: string, now = Date.now()): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ reference, at: now } satisfies PendingPayment));
  } catch {}
}

export function readPending(now = Date.now()): PendingPayment | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<PendingPayment>;
    if (typeof p.reference !== "string" || typeof p.at !== "number" || now - p.at > MAX_AGE_MS || !/^[A-Za-z0-9_.=-]{6,100}$/.test(p.reference)) {
      clearPending();
      return null;
    }
    return { reference: p.reference, at: p.at };
  } catch {
    return null;
  }
}

export function clearPending(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
