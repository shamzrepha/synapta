import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import { pickQuickActions, paletteSuggestions } from "./quick-actions";
import { allMoreEntries, moreGroupsFor, MORE_ORDER } from "./more-groups";
import { latestResume, parseReadPos } from "./resume";
import { NAV_ITEMS } from "@/components/shell/nav-items";

function routePatterns(): RegExp[] {
  const out: RegExp[] = [];
  const walk = (dir: string, segs: string[]) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        const n = e.name;
        walk(path.join(dir, n), /^\(.*\)$/.test(n) ? segs : [...segs, n]);
      } else if (e.name === "page.tsx" || e.name === "page.ts") {
        const re = "^/" + segs.map((s) => (/^\[.*\]$/.test(s) ? "[^/]+" : s.replace(/[.*+?^${}()|\\]/g, "\\$&"))).join("/") + "$";
        out.push(new RegExp(segs.length ? re : "^/$"));
      }
    }
  };
  walk(path.resolve(__dirname, "../../app"), []);
  return out;
}
const routes = routePatterns();
const exists = (href: string) => routes.some((r) => r.test(href.split("?")[0].split("#")[0]));

describe("quick actions", () => {
  it("gives students 8 tiles with no duplicate hrefs", () => {
    const a = pickQuickActions({ role: "student" });
    expect(a).toHaveLength(8);
    expect(new Set(a.map((x) => x.href)).size).toBe(8);
  });
  it("shows a due badge and a resume tile only when there is something to show", () => {
    const none = pickQuickActions({ role: "student" });
    expect(none[0].id).toBe("classes");
    expect(none.find((x) => x.id === "cards")?.badge).toBeUndefined();
    const s = pickQuickActions({ role: "student", dueCards: 12, resume: { href: "/classes/c1/read" } });
    expect(s[0]).toMatchObject({ id: "continue", href: "/classes/c1/read" });
    expect(s.find((x) => x.id === "cards")?.badge).toBe("12");
    expect(pickQuickActions({ dueCards: 250 }).find((x) => x.id === "cards")?.badge).toBe("99+");
  });
  it("keeps teacher tools away from students and student-only tiles away from teachers", () => {
    const stu = pickQuickActions({ role: "student" }).map((x) => x.href);
    expect(stu.some((h) => h.startsWith("/teach") || h === "/admin" || h.includes("create=1"))).toBe(false);
    const t = pickQuickActions({ role: "teacher" });
    expect(t).toHaveLength(8);
    expect(t.some((x) => x.href === "/teach/grading")).toBe(true);
    expect(t.some((x) => x.href === "/admin")).toBe(false);
    expect(pickQuickActions({ role: "admin" }).some((x) => x.href === "/admin")).toBe(true);
    expect(pickQuickActions({ role: "bogus" })[1].id).toBe("cards");
  });
  it("palette suggestions add For you and Labs for students", () => {
    expect(paletteSuggestions("student").map((x) => x.id)).toEqual(expect.arrayContaining(["forYou", "labs"]));
  });
});

describe("More page", () => {
  it("has no duplicate hrefs or titles, and every group name is known", () => {
    const e = allMoreEntries();
    const paths = e.map((x) => x.href.split("?")[0]);
    expect(paths.filter((p, i) => paths.indexOf(p) !== i)).toEqual([]);
    const titles = e.map((x) => x.title.toLowerCase());
    expect(titles.filter((p, i) => titles.indexOf(p) !== i)).toEqual([]);
    for (const x of e) expect(MORE_ORDER).toContain(x.group);
  });
  it("hides Teach from students and shows it to teachers", () => {
    expect(moreGroupsFor("student").some((g) => g.name === "Teach")).toBe(false);
    expect(moreGroupsFor("teacher").some((g) => g.name === "Teach")).toBe(true);
  });
});

describe("resume", () => {
  it("parses saved positions and picks the latest one in a class the student is in", () => {
    expect(parseReadPos("nope")).toBeNull();
    expect(parseReadPos(JSON.stringify({ snippet: "x" }))).toBeNull();
    const r = latestResume(
      [
        { key: "sunroot:readpos:a", raw: JSON.stringify({ kc: "k1", at: 5 }) },
        { key: "sunroot:readpos:b", raw: JSON.stringify({ kc: "k2", title: "Waves", at: 9 }) },
        { key: "sunroot:readpos:gone", raw: JSON.stringify({ kc: "k3", at: 99 }) },
        { key: "other", raw: "{}" },
      ],
      [{ id: "a", title: "A" }, { id: "b", title: "B" }]
    );
    expect(r?.classId).toBe("b");
    expect(r?.href).toBe("/classes/b/read");
  });
});

describe("every navigation href exists in the route tree", () => {
  it("shell nav, More, quick actions", () => {
    const hrefs = [
      ...NAV_ITEMS.map((n) => n.href),
      ...allMoreEntries().map((e) => e.href),
      ...pickQuickActions({ role: "student" }).map((a) => a.href),
      ...pickQuickActions({ role: "admin" }).map((a) => a.href),
      ...paletteSuggestions("student").map((a) => a.href),
    ];
    expect(hrefs.filter((h) => !exists(h))).toEqual([]);
  });
  it("mobile bar has at most 5 slots (4 tabs and Add)", () => {
    expect(NAV_ITEMS.filter((n) => n.primary).length).toBeLessThanOrEqual(4);
  });
});
