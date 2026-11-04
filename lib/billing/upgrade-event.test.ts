// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { UPGRADE_EVENT, isUpgradeCode, promptUpgrade } from "./upgrade-event";
import { fetchJson } from "@/lib/api/client";

afterEach(() => vi.restoreAllMocks());

describe("the upgrade pop-up trigger", () => {
  it("treats plan and token limits as upgrade moments, and nothing else", () => {
    expect(isUpgradeCode("PLAN_LIMIT")).toBe(true);
    expect(isUpgradeCode("QUOTA_EXCEEDED")).toBe(true);
    expect(isUpgradeCode("RATE_LIMITED")).toBe(false);
    expect(isUpgradeCode(undefined)).toBe(false);
  });
  it("raises the event with the message", () => {
    const got: string[] = [];
    const on = (e: Event) => got.push((e as CustomEvent<{ message: string }>).detail.message);
    window.addEventListener(UPGRADE_EVENT, on);
    promptUpgrade("You've used all 3 study notes sets.");
    window.removeEventListener(UPGRADE_EVENT, on);
    expect(got).toEqual(["You've used all 3 study notes sets."]);
  });
  it("fetchJson asks for the pop-up when the server says the plan limit is reached, but not for other errors", async () => {
    const got: string[] = [];
    const on = (e: Event) => got.push((e as CustomEvent<{ message: string }>).detail.message);
    window.addEventListener(UPGRADE_EVENT, on);
    const reply = (body: unknown) => vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify(body)));
    reply({ ok: false, error: { code: "PLAN_LIMIT", message: "Upgrade to Student Plus for more." } });
    const r = await fetchJson("/x");
    reply({ ok: false, error: { code: "NOT_FOUND", message: "nope" } });
    await fetchJson("/y");
    reply({ ok: true, data: 1 });
    await fetchJson("/z");
    window.removeEventListener(UPGRADE_EVENT, on);
    expect(r.ok).toBe(false);
    expect(got).toEqual(["Upgrade to Student Plus for more."]);
  });
});
