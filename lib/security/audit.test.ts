import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeFakeDb, fakeTimestamp, type Store } from "@/lib/testing/fake-firestore";

const store: Store = new Map();
vi.mock("@/lib/firebase/admin", () => ({ Timestamp: fakeTimestamp, adminDb: () => makeFakeDb(store) }));

import { safeDetails, writeAudit } from "./audit";

beforeEach(() => store.clear());

describe("audit", () => {
  it("strips anything secret-looking from details but keeps last4", () => {
    expect(safeDetails({ last4: "abcd", key: "AIzaSyFULLKEYVALUE", token: "tok_12345678", provider: "groq" })).toEqual({ last4: "abcd", provider: "groq" });
  });
  it("writes an auditLogs entry with actor, action and target", async () => {
    await writeAudit({ actorUid: "a1", actorEmail: "a@x.y", action: "ai_key.saved", targetType: "secret", targetId: "groq", details: { last4: "1234" } });
    const docs = [...store.entries()].filter(([k]) => k.startsWith("auditLogs/"));
    expect(docs).toHaveLength(1);
    expect(docs[0][1]).toMatchObject({ actorUid: "a1", action: "ai_key.saved", targetId: "groq", details: { last4: "1234" } });
  });
  it("never throws when the write fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(writeAudit({ actorUid: "a1", action: "x", targetType: "y", details: {} })).resolves.toBeUndefined();
  });
});
