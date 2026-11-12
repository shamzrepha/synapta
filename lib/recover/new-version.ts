/**
 * Knowing when the site has been updated under an open page or the Android shell. Every deployment has a build id; the page
 * remembers the one it was built with and asks the server which one is live. A newer one means the open page is out of date,
 * so it offers a refresh, and applies it by itself at the next natural moment (changing page), never while someone is typing.
 */
export function isNewBuild(mine: string | undefined | null, live: string | undefined | null): boolean {
  if (!mine || !live) return false;
  // local development and unknown builds never nag
  if (mine === "dev" || live === "dev") return false;
  return mine !== live;
}

export interface ApplyContext {
  pending: boolean;
  /** the page just changed (a natural moment for a refresh) */
  navigated: boolean;
  /** a text field is focused, or the keyboard is up */
  typing: boolean;
}
export function shouldApplyNow(c: ApplyContext): boolean {
  return c.pending && c.navigated && !c.typing;
}

export const VERSION_POLL_MS = 10 * 60 * 1000;
