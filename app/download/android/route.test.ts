import { describe, it, expect } from "vitest";
import { GET, HEAD } from "./route";

describe("GET /download/android", () => {
  it("redirects 302 to the apk url from app-version.json", async () => {
    const res = await GET();
    expect(res.status).toBe(302);
    const location = res.headers.get("location");
    expect(location).toMatch(/sunroot-3\.[0-9]+\.apk/);
  });

  it("HEAD also returns 302 redirect", async () => {
    const res = await HEAD();
    expect(res.status).toBe(302);
    const location = res.headers.get("location");
    expect(location).toMatch(/sunroot-3\.[0-9]+\.apk/);
  });
});
