import { adminDb, adminMessaging } from "@/lib/firebase/admin";

/**
 * Sends a web push to every browser the user enabled (Firebase Cloud Messaging). Best-effort:
 * dead tokens are pruned, failures never block the in-app notification.
 */
export async function sendPush(uid: string, msg: { title: string; body?: string; href?: string | null; tag?: string }): Promise<void> {
  try {
    const col = adminDb().collection("users").doc(uid).collection("pushTokens");
    const snap = await col.limit(10).get();
    if (snap.empty) return;
    const tokens = snap.docs.map((d) => d.data().token as string).filter(Boolean);
    const res = await adminMessaging().sendEachForMulticast({
      tokens,
      // Data-only so the service worker controls display (and the click link)
      data: { title: msg.title.slice(0, 120), body: (msg.body || "").slice(0, 200), href: msg.href || "/notifications", tag: msg.tag || "" },
      webpush: { headers: { Urgency: "normal", TTL: "86400" } },
    });
    const dead: string[] = [];
    res.responses.forEach((r, i) => {
      const code = r.error?.code || "";
      if (code.includes("registration-token-not-registered") || code.includes("invalid-registration-token") || code.includes("invalid-argument")) dead.push(tokens[i]);
    });
    await Promise.all(snap.docs.filter((d) => dead.includes(d.data().token)).map((d) => d.ref.delete()));
  } catch (err) {
    console.warn("[push] send failed", err instanceof Error ? err.message : err);
  }
}
