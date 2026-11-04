/** A tiny browser event so any part of the app can ask for the "upgrade your plan" pop-up when a limit is hit. */
export const UPGRADE_EVENT = "sunroot:upgrade";

/** Error codes from the server that mean "this needs a bigger plan or has used the allowance". */
export const UPGRADE_CODES = ["PLAN_LIMIT", "QUOTA_EXCEEDED"] as const;

export const isUpgradeCode = (code: unknown): boolean => typeof code === "string" && (UPGRADE_CODES as readonly string[]).includes(code);

export function promptUpgrade(message: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(UPGRADE_EVENT, { detail: { message } }));
}
