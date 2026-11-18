import { describe, it, expect, vi } from "vitest";

vi.mock("node:fs", () => ({ default: { existsSync: () => false, readFileSync: () => "" } }));

import { GET } from "./route";

describe("GET /download/android without a readable manifest", () => {
  it("never redirects to an APK file that may not exist", async () => {
    const res = await GET();
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).not.toMatch(/\.apk$/);
  });
});
