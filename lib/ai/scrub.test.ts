import { describe, it, expect } from "vitest";
import { scrubPii, sanitizeUntrustedPromptText } from "./scrub";

describe("lib/ai/scrub", () => {
  it("redacts email addresses", () => {
    const raw = "Please submit to professor.smith@university.edu or ta@gmail.com";
    const scrubbed = scrubPii(raw);
    expect(scrubbed).not.toContain("professor.smith@university.edu");
    expect(scrubbed).not.toContain("ta@gmail.com");
    expect(scrubbed).toContain("[REDACTED_EMAIL]");
  });

  it("redacts phone numbers", () => {
    const raw = "Contact desk at +1-555-839-2049 or (800) 555-0199 for office hours.";
    const scrubbed = scrubPii(raw);
    expect(scrubbed).not.toContain("555-839-2049");
    expect(scrubbed).toContain("[REDACTED_PHONE]");
  });

  it("redacts student matriculation IDs", () => {
    const raw = "Student ID: STU-992834-X scored 95% on Quiz 1. Reg No: REG-8837199";
    const scrubbed = scrubPii(raw);
    expect(scrubbed).not.toContain("STU-992834-X");
    expect(scrubbed).toContain("[REDACTED_ID]");
  });

  it("strips HTML scripts and truncates excessive length in sanitizeUntrustedPromptText", () => {
    const malicious = "<script>alert('pwned')</script> Hello world! Email: student@school.edu";
    const sanitized = sanitizeUntrustedPromptText(malicious, 25);
    expect(sanitized).not.toContain("<script>");
    expect(sanitized).not.toContain("student@school.edu");
    expect(sanitized).toContain("[Content truncated for analysis]");
  });
});
