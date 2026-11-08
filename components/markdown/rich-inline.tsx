"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { normalizeMath } from "@/lib/text/readable";

/** A short AI-written string (objective, hint, question, option) shown as readable inline text: Markdown and maths are rendered, never left as raw symbols. */
export function RichInline({ text, className }: { text: string; className?: string }) {
  return (
    <span className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          p: ({ children }) => <>{children}</>,
          ul: ({ children }) => <>{children}</>,
          ol: ({ children }) => <>{children}</>,
          li: ({ children }) => <>{children} </>,
          h1: ({ children }) => <strong>{children}</strong>,
          h2: ({ children }) => <strong>{children}</strong>,
          h3: ({ children }) => <strong>{children}</strong>,
          a: ({ children }) => <>{children}</>,
        }}
      >
        {normalizeMath(text)}
      </ReactMarkdown>
    </span>
  );
}
