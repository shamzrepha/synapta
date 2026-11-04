/** Catches the usual Firebase push mistakes (a wrong or mixed-up key) and explains Google's own errors in plain words. */

export interface PushConfig {
  apiKey?: string;
  projectId?: string;
  messagingSenderId?: string;
  appId?: string;
  vapidKey?: string;
}

/** Things that are wrong with the settings themselves, in plain words. Empty when they look right. */
export function checkPushConfig(c: PushConfig): string[] {
  const out: string[] = [];
  if (!c.apiKey) out.push("NEXT_PUBLIC_FIREBASE_API_KEY is empty.");
  else if (!/^AIza[\w-]{30,}$/.test(c.apiKey.trim())) out.push("NEXT_PUBLIC_FIREBASE_API_KEY doesn't look like a Firebase web API key (it starts with AIza).");
  if (!c.projectId) out.push("NEXT_PUBLIC_FIREBASE_PROJECT_ID is empty.");
  if (!c.messagingSenderId) out.push("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID is empty.");

  const app = /^1:(\d+):(\w+):[\w]+$/.exec((c.appId || "").trim());
  if (!c.appId) out.push("NEXT_PUBLIC_FIREBASE_APP_ID is empty.");
  else if (!app) out.push("NEXT_PUBLIC_FIREBASE_APP_ID doesn't look right (it should look like 1:123456789:web:abc123).");
  else {
    if (app[2] !== "web") out.push(`NEXT_PUBLIC_FIREBASE_APP_ID is for a ${app[2]} app. Use the Web app's id (1:…:web:…) from Project settings.`);
    if (c.messagingSenderId && app[1] !== c.messagingSenderId.trim()) out.push("The sender id and the app id come from different Firebase projects. Copy both from the same Web app in Project settings.");
  }

  const v = (c.vapidKey || "").trim();
  if (!v) out.push("NEXT_PUBLIC_FIREBASE_VAPID_KEY is empty.");
  else if (/\s|["']/.test(c.vapidKey || "")) out.push("NEXT_PUBLIC_FIREBASE_VAPID_KEY has spaces or quote marks in it. Paste only the key itself.");
  else if (!/^B[\w-]{80,95}$/.test(v)) out.push("NEXT_PUBLIC_FIREBASE_VAPID_KEY isn't a Web Push public key (about 87 characters, starting with B). Copy the key pair from Project settings, Cloud Messaging, Web Push certificates, not a server key.");
  return out;
}

const errorCode = (e: unknown) => String((e as { code?: unknown })?.code || "");
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e || ""));

/**
 * What to tell the person (and the admin who fixes it) when turning notifications on fails.
 * `problems` are the settings mistakes found by checkPushConfig, which are checked first because they are cheap to fix.
 */
export function explainPushError(e: unknown, problems: string[]): string {
  const code = errorCode(e);
  const text = errorText(e);
  if (problems.length) return `The push settings look wrong: ${problems[0]}${problems.length > 1 ? ` (and ${problems.length - 1} more)` : ""}`;
  if (code === "messaging/permission-blocked" || /permission/i.test(text) && /denied|blocked/i.test(text)) return "Notifications are blocked for this site. Allow them in your browser's site settings, then try again.";
  if (code === "messaging/token-subscribe-failed" && /authentication credential|API key|PERMISSION_DENIED|API has not been used|disabled/i.test(text)) {
    return "Google refused the push registration for this Firebase project. An admin needs to check, in Google Cloud for the Firebase project: (1) the Firebase Cloud Messaging Registration API and the Firebase Installations API are enabled; (2) the browser API key's restrictions allow them and this website; (3) Cloud Messaging has the Web Push key pair. After changing a NEXT_PUBLIC_ setting on Vercel, redeploy.";
  }
  if (code === "messaging/failed-service-worker-registration" || /service ?worker/i.test(text)) return "The notification helper couldn't start. Reload the page (hold Shift) and try again.";
  if (code === "messaging/unsupported-browser") return "This browser doesn't support push notifications.";
  return text || "Couldn't turn notifications on. Please try again.";
}
