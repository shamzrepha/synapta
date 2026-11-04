import { describe, it, expect } from "vitest";
import { checkPushConfig, explainPushError } from "./config-check";

const good = { apiKey: "AIzaSyD-1234567890abcdefghijklmnopqrstuv", projectId: "sunroot", messagingSenderId: "123456789012", appId: "1:123456789012:web:abcdef123456", vapidKey: "B" + "a1-_".repeat(21) + "xyz" };

describe("push settings check", () => {
  it("accepts settings that look right", () => {
    expect(good.vapidKey.length).toBe(88);
    expect(checkPushConfig(good)).toEqual([]);
  });
  it("names every empty setting", () => {
    const p = checkPushConfig({});
    expect(p.join(" ")).toContain("API_KEY");
    expect(p.join(" ")).toContain("PROJECT_ID");
    expect(p.join(" ")).toContain("SENDER_ID");
    expect(p.join(" ")).toContain("APP_ID");
    expect(p.join(" ")).toContain("VAPID_KEY");
  });
  it("catches a sender id and app id from different projects, and a non-web app id", () => {
    expect(checkPushConfig({ ...good, messagingSenderId: "999" }).join(" ")).toContain("different Firebase projects");
    expect(checkPushConfig({ ...good, appId: "1:123456789012:android:abc123" }).join(" ")).toContain("android app");
  });
  it("catches a VAPID key that is a server key, has quotes or spaces, or is cut short", () => {
    expect(checkPushConfig({ ...good, vapidKey: "AAAA" + "x".repeat(150) }).join(" ")).toContain("isn't a Web Push public key");
    expect(checkPushConfig({ ...good, vapidKey: ` ${good.vapidKey}` }).join(" ")).not.toContain("empty");
    expect(checkPushConfig({ ...good, vapidKey: `"${good.vapidKey}"` }).join(" ")).toContain("quote marks");
    expect(checkPushConfig({ ...good, vapidKey: good.vapidKey.slice(0, 40) }).join(" ")).toContain("isn't a Web Push public key");
  });
  it("catches an API key that isn't a Firebase web key", () => {
    expect(checkPushConfig({ ...good, apiKey: "sk_live_nope" }).join(" ")).toContain("AIza");
  });
});

describe("explaining a push failure", () => {
  const googleErr = Object.assign(new Error("Messaging: A problem occurred while subscribing the user to FCM: Request is missing required authentication credential. Expected OAuth 2 access token, login cookie or other valid authentication credential. (messaging/token-subscribe-failed)."), { code: "messaging/token-subscribe-failed" });
  it("points at the settings first when they look wrong", () => {
    expect(explainPushError(googleErr, ["The sender id and the app id come from different Firebase projects."])).toContain("different Firebase projects");
  });
  it("when the settings look right, gives the Google Cloud checklist for the credential error", () => {
    const m = explainPushError(googleErr, []);
    expect(m).toContain("Firebase Cloud Messaging Registration API");
    expect(m).toContain("API key");
    expect(m).toContain("redeploy");
    expect(m).not.toContain("Request is missing"); // plain words, not Google's sentence
  });
  it("explains blocked permission and a missing worker in plain words", () => {
    expect(explainPushError(Object.assign(new Error("x"), { code: "messaging/permission-blocked" }), [])).toContain("blocked");
    expect(explainPushError(Object.assign(new Error("service worker"), { code: "messaging/failed-service-worker-registration" }), [])).toContain("Reload");
  });
  it("passes an unknown error's own text through", () => {
    expect(explainPushError(new Error("Something odd"), [])).toBe("Something odd");
  });
});
