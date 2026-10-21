/**
 * Finds out WHY the microphone isn't working, so the app can say what to do instead of a generic "blocked".
 * Checks the secure-page requirement, the stored site permission, and finally asks the browser for the microphone
 * (which shows the permission prompt when it hasn't been decided) and releases it again.
 */
export type MicProblem = "blocked" | "missing" | "busy" | "insecure" | "service" | "offline" | "unknown";

export interface MicHelp {
  problem: MicProblem;
  title: string;
  help: string;
}

export const MIC_HELP: Record<MicProblem, MicHelp> = {
  blocked: {
    problem: "blocked",
    title: "The microphone is blocked for this site",
    help: "Tap the lock (or tune) icon beside the web address, open Permissions or Site settings, set Microphone to Allow, then reload. If it is already allowed there, open your phone's Settings → Apps → your browser → Permissions → Microphone and allow it.",
  },
  missing: { problem: "missing", title: "No microphone found", help: "Plug in or connect a microphone (or earphones with a mic) and try again. You can also type your question below." },
  busy: { problem: "busy", title: "Another app is using the microphone", help: "Close the call, voice message or recording app that has the microphone, then tap the mic again." },
  insecure: { problem: "insecure", title: "Voice needs a secure page", help: "Open the app from its https:// address. Browsers only allow the microphone on secure pages." },
  service: { problem: "service", title: "This browser can't use speech recognition", help: "Voice input needs your browser's speech service (Google's, in Chrome). Update or switch to Chrome, make sure Google speech services are on, or type your question below." },
  offline: { problem: "offline", title: "Speech recognition needs the internet", help: "Check your connection and try again, or type your question below." },
  unknown: { problem: "unknown", title: "The microphone didn't start", help: "Reload the page and try again. If it keeps happening, check the microphone permission in your browser's site settings, or type your question below." },
};

/** What a `getUserMedia` error means. */
export function problemFromMediaError(name: string | undefined): MicProblem {
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
    case "PermissionDeniedError":
      return "blocked";
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
      return "missing";
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return "busy";
    default:
      return "unknown";
  }
}

/** What a Web Speech recognition error code means (null: nothing to tell the user). */
export function problemFromRecognitionError(code: string | undefined): MicProblem | null {
  switch (code) {
    case "not-allowed":
      return "blocked";
    case "service-not-allowed":
      return "service";
    case "audio-capture":
      return "missing";
    case "network":
      return "offline";
    case "no-speech":
    case "aborted":
      return null;
    default:
      return "unknown";
  }
}

interface NavLike {
  mediaDevices?: { getUserMedia?: (c: { audio: boolean }) => Promise<{ getTracks: () => Array<{ stop: () => void }> }> };
  permissions?: { query?: (d: { name: string }) => Promise<{ state: string }> };
}

export type MicCheck = { ok: true } | ({ ok: false } & MicHelp);

export async function checkMic(nav: NavLike = navigator as unknown as NavLike, secure: boolean = typeof window === "undefined" ? true : window.isSecureContext): Promise<MicCheck> {
  if (!secure) return { ok: false, ...MIC_HELP.insecure };
  // a stored "blocked" can be read directly; no prompt can appear in that state
  try {
    const status = await nav.permissions?.query?.({ name: "microphone" });
    if (status?.state === "denied") return { ok: false, ...MIC_HELP.blocked };
  } catch {
    /* some browsers don't know the "microphone" permission name: carry on and ask for it */
  }
  const get = nav.mediaDevices?.getUserMedia;
  if (!get) return { ok: true }; // can't pre-check here; let speech recognition ask for itself
  try {
    const stream = await get.call(nav.mediaDevices, { audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return { ok: true };
  } catch (e) {
    return { ok: false, ...MIC_HELP[problemFromMediaError((e as { name?: string })?.name)] };
  }
}
