import { describe, expect, it } from "vitest";
import { parseTutorMessage } from "./tutor-bubble";
import { readableText } from "@/lib/text/readable";

describe("tutor speech bubble messages", () => {
  it("ignores anything that is not a tutor line", () => {
    expect(parseTutorMessage("goal_complete", { text: "hi" }, 1)).toBeNull();
    expect(parseTutorMessage("tutor_say", null, 1)).toBeNull();
    expect(parseTutorMessage("tutor_say", { text: "   " }, 1)).toBeNull();
  });
  it("falls back to a hint tone and keeps the id", () => {
    expect(parseTutorMessage("tutor_say", { text: "Try more voltage", tone: "nonsense" }, 7)).toMatchObject({ id: 7, tone: "hint", text: "Try more voltage" });
    expect(parseTutorMessage("tutor_say", { text: "Well done", tone: "praise" }, 8)?.tone).toBe("praise");
  });
  it("never shows raw LaTeX or Markdown", () => {
    const m = parseTutorMessage("tutor_say", { text: "**Ohm's law** is `V = I x R`" }, 2);
    expect(m?.text).not.toMatch(/\*\*|`/);
    expect(readableText("**bold** `code`")).not.toMatch(/\*\*|`/);
  });
});
