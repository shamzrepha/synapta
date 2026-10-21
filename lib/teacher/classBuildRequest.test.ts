import { describe, expect, it } from "vitest";
import { parseClassBuildRequest, SEED_MATERIAL_MAX_CHARS } from "./classBuildRequest";

const req = (body?: string) => new Request("http://x/api", { method: "POST", body });
const code = async (p: Promise<unknown>) => p.then(() => "ok", (e) => `${e.status}:${e.code}`);

describe("parseClassBuildRequest", () => {
  it("accepts an empty body and a full valid body", async () => {
    expect(await parseClassBuildRequest(req())).toEqual({});
    const ok = await parseClassBuildRequest(req(JSON.stringify({ title: " Physics ", level: "school", durationWeeks: 6, audienceTags: ["a"], seedMaterialText: "x" })));
    expect(ok.title).toBe("Physics");
  });
  it("rejects malformed JSON", async () => {
    expect(await code(parseClassBuildRequest(req("{nope")))).toBe("400:BAD_JSON");
  });
  it("rejects invalid values and unknown fields", async () => {
    for (const bad of [{ level: "phd" }, { durationWeeks: 0 }, { durationWeeks: 2.5 }, { durationWeeks: 99 }, { title: "" }, { audienceTags: new Array(13).fill("t") }, { extra: 1 }, { title: 5 }]) {
      expect(await code(parseClassBuildRequest(req(JSON.stringify(bad)))), JSON.stringify(bad)).toBe("400:VALIDATION");
    }
  });
  it("rejects oversized seed material", async () => {
    const big = JSON.stringify({ seedMaterialText: "a".repeat(SEED_MATERIAL_MAX_CHARS + 1) });
    expect(await code(parseClassBuildRequest(req(big)))).toBe("400:VALIDATION");
  });
});
