import { describe, it, expect } from "vitest";
import { friendlyReadError, pageText, type TextPage } from "./page-text";

/** A stream that can only be read with getReader(): like iPhone Safari's, it has no async iterator, so `for await` over it throws. */
function readerOnlyStream(chunks: Array<{ items: unknown[] }>) {
  let i = 0;
  return {
    getReader: () => ({
      read: async () => (i < chunks.length ? { done: false, value: chunks[i++] } : { done: true, value: undefined }),
      releaseLock: () => {},
    }),
  } as unknown as ReadableStream<{ items: unknown[] }>;
}

describe("pageText", () => {
  it("reads a page through getReader, with no async iteration (iPhone Safari)", async () => {
    const stream = readerOnlyStream([{ items: [{ str: "Dyspnoea" }, { str: "is" }] }, { items: [{ str: "breathlessness" }, { type: "beginMarkedContent" }] }]);
    expect(Symbol.asyncIterator in (stream as object)).toBe(false);
    const page: TextPage = {
      streamTextContent: () => stream,
      getTextContent: async () => {
        throw new TypeError("undefined is not a function (near '...of e...')");
      },
    };
    expect(await pageText(page)).toBe("Dyspnoea is breathlessness ");
  });
  it("falls back to getTextContent when the page has no stream", async () => {
    const page: TextPage = { getTextContent: async () => ({ items: [{ str: "a" }, { str: "b" }] }) };
    expect(await pageText(page)).toBe("a b");
  });
});

describe("friendlyReadError", () => {
  it("turns a raw browser error into a plain sentence", () => {
    const e = friendlyReadError(new TypeError("undefined is not a function (near '...t of e...')"));
    expect(e.message).not.toMatch(/undefined|function/);
    expect(e.message).toMatch(/Couldn't read that file/);
  });
  it("explains a missing DecompressionStream", () => {
    expect(friendlyReadError(new TypeError("Can't find variable: DecompressionStream")).message).toMatch(/PDF/);
  });
  it("keeps messages that were already written for people", () => {
    const own = new Error("Please save this file as a PDF or .docx and upload that. This older format can't be read here.");
    expect(friendlyReadError(own)).toBe(own);
  });
});
