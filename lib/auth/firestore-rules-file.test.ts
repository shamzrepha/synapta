import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// The app writes Firestore only through the server (admin SDK), so the deployed rules must never let a browser write.
describe("firestore.rules", () => {
  const rules = readFileSync(join(process.cwd(), "firestore.rules"), "utf8");
  const allows = rules.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("allow "));

  it("denies every client write", () => {
    const writes = allows.filter((l) => /^allow [^:]*\b(write|create|update|delete)\b/.test(l));
    expect(writes.length).toBeGreaterThan(0);
    for (const l of writes) expect(l, l).toMatch(/:\s*if false;$/);
  });

  it("never opens reads to everyone", () => {
    for (const l of allows) expect(l, l).not.toMatch(/if true;/);
  });

  it("starts from deny-all", () => {
    expect(rules).toMatch(/match \/\{document=\*\*\} \{\s*allow read, write: if false;/);
  });
});
