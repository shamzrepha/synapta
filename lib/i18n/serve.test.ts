import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const langs: Record<string, string> = { student_fr: "fr", student_en: "en", teacher_ha: "ha", teacher_en: "en" };
vi.mock("./server", () => ({ getUserLanguage: vi.fn(async (uid: string) => langs[uid] ?? "en") }));
vi.mock("./translate", () => ({ localizeJson: vi.fn(async (v: { text?: string } | undefined, lang: string) => ({ text: `${lang}:${v?.text}` })) }));

import { classSourceLanguage, localizeFor } from "./serve";
import { localizeJson } from "./translate";

const req = (query = "") => ({ nextUrl: new URL(`http://x/api${query}`) }) as unknown as NextRequest;
const user = (uid: string) => ({ uid, email: null, role: "student" as const });

describe("localizeFor", () => {
  beforeEach(() => vi.mocked(localizeJson).mockClear());

  it("gives a student the teacher's content in the student's language", async () => {
    expect(await localizeFor(req(), user("student_fr"), false, { text: "Current" }, "en")).toEqual({ text: "fr:Current" });
  });

  it("never translates content already in the reader's language", async () => {
    expect(await localizeFor(req(), user("student_en"), false, { text: "Current" }, "en")).toEqual({ text: "Current" });
    expect(localizeJson).not.toHaveBeenCalled();
  });

  it("translates a Hausa teacher's class into English for an English student", async () => {
    expect(await localizeFor(req(), user("student_en"), false, { text: "Wuta" }, "ha")).toEqual({ text: "en:Wuta" });
  });

  it("keeps the original for the teacher unless they preview a language", async () => {
    expect(await localizeFor(req(), user("teacher_en"), true, { text: "Current" }, "en")).toEqual({ text: "Current" });
    expect(await localizeFor(req("?lang=yo"), user("teacher_en"), true, { text: "Current" }, "en")).toEqual({ text: "yo:Current" });
  });

  it("reads the class's language from its teacher", async () => {
    expect(await classSourceLanguage({ teacherId: "teacher_ha" })).toBe("ha");
    expect(await classSourceLanguage({})).toBe("en");
  });
});
