import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FlipbookNotes } from "./flipbook-notes";
import { KineticStage } from "./kinetic-formula";
import { FlipCard } from "@/components/ui/flip-card";

describe("interactive flipbook & kinetic components SSR", () => {
  it("renders FlipbookNotes across multi-section notes with live math stage", () => {
    const md = `# Fractions Made Simple

## Simplifying 2/4
Look at how $2/4 = 1/2$ reduces step by step.

## Summary
- Divide numerator and denominator by the same factor.`;

    const html = renderToStaticMarkup(<FlipbookNotes markdown={md} title="Fractions" />);
    expect(html).toContain("Page 1 /");
    expect(html).toContain("Flipbook");
    expect(html).toContain("Scroll All");
    expect(html).toContain("Fractions Made Simple");
  });

  it("renders KineticStage fraction_slash scene cleanly", () => {
    const html = renderToStaticMarkup(
      <KineticStage
        pageKey="test-1"
        scenes={[
          {
            kind: "fraction_slash",
            num: 2,
            den: 4,
            divisor: 2,
            title: "Simplifying 2/4",
            caption: "Divide top and bottom by 2",
          },
        ]}
      />,
    );
    expect(html).toContain("Live Math Motion");
    expect(html).toContain("Simplifying 2/4");
  });

  it("renders FlipCard front and back faces cleanly on SSR", () => {
    const html = renderToStaticMarkup(
      <FlipCard
        flipped={false}
        onFlip={() => {}}
        front={<span>What is 2/4 reduced?</span>}
        back={<span>1/2</span>}
        frontPlainText="What is 2/4 reduced?"
        backPlainText="1/2"
      />,
    );
    expect(html).toContain("What is 2/4 reduced?");
    expect(html).toContain("Question");
    expect(html).toContain("Answer");
  });
});
