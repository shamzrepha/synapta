// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { DomTranslator } from "./dom";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("DomTranslator", () => {
  it("translates labels and attributes, skips code and content, and follows later text changes", async () => {
    document.body.innerHTML = `
      <nav><a href="/x">My classes</a><button aria-label="Open menu"> Save </button></nav>
      <input placeholder="Search topics" />
      <div translate="no"><p>Lesson text stays</p></div>
      <pre>void loop()</pre>
      <p id="live">Loading</p>`;
    const fetcher = vi.fn(async (_lang: string, texts: string[]) => Object.fromEntries(texts.map((t) => [t, `FR:${t}`])));
    const tr = new DomTranslator("fr", fetcher);
    tr.start(document.body);
    await wait(20);
    expect(document.querySelector("a")!.textContent).toBe("FR:My classes");
    expect(document.querySelector("button")!.textContent).toBe(" FR:Save ");
    expect(document.querySelector("button")!.getAttribute("aria-label")).toBe("FR:Open menu");
    expect(document.querySelector("input")!.getAttribute("placeholder")).toBe("FR:Search topics");
    expect(document.querySelector("[translate=no] p")!.textContent).toBe("Lesson text stays");
    expect(document.querySelector("pre")!.textContent).toBe("void loop()");

    // React writes new text into the same node: it is translated too, and our own writes don't loop
    (document.getElementById("live")!.firstChild as Text).nodeValue = "Ready";
    await wait(200);
    expect(document.getElementById("live")!.textContent).toBe("FR:Ready");
    const calls = fetcher.mock.calls.length;
    await wait(200);
    expect(fetcher.mock.calls.length).toBe(calls);
    tr.stop();
  });
});
