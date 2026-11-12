"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { normalizeMath } from "@/lib/text/readable";

interface MarkdownRendererProps {
  content: string;
  className?: string;
  /** already in the learner's language (server-translated class content, AI answers): skip page translation */
  localized?: boolean;
}

export function MarkdownRenderer({ content, className, localized }: MarkdownRendererProps) {
  return (
    <div
      // text already in the learner's language (server-translated lessons, AI answers) is left alone by the page translator
      translate={localized ? "no" : undefined}
      dir="auto"
      className={cn(
        "prose prose-slate dark:prose-invert max-w-none text-sm leading-relaxed",
        // Headings
        "prose-headings:font-bold prose-headings:tracking-tight",
        "prose-h1:text-xl prose-h1:mt-4 prose-h1:mb-2 prose-h1:border-b prose-h1:pb-1 prose-h1:border-slate-200 dark:prose-h1:border-slate-800",
        "prose-h2:text-lg prose-h2:mt-4 prose-h2:mb-2",
        "prose-h3:text-base prose-h3:mt-3 prose-h3:mb-1",
        // Paragraphs & Lists
        "prose-p:my-2 prose-p:leading-relaxed",
        "prose-ul:my-2 prose-ul:pl-5 prose-li:my-0.5",
        "prose-ol:my-2 prose-ol:pl-5 prose-li:my-0.5",
        // Inline Code & Blocks
        "prose-code:font-mono prose-code:text-xs prose-code:bg-slate-100 dark:prose-code:bg-slate-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-brand-700 dark:prose-code:text-brand-300",
        "prose-pre:bg-slate-900 prose-pre:text-slate-100 prose-pre:rounded-xl prose-pre:p-4 prose-pre:my-3",
        // Blockquotes
        "prose-blockquote:border-l-4 prose-blockquote:border-brand-500 prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-slate-600 dark:prose-blockquote:text-slate-400",
        // Links
        "prose-a:text-brand-600 dark:prose-a:text-brand-400 prose-a:underline hover:prose-a:text-brand-700",
        className
      )}
    >
      <ReactMarkdown
        // tables, task lists and "~~strike~~"; a single "~" stays plain text ("about ~5 V")
        remarkPlugins={[remarkMath, [remarkGfm, { singleTilde: false }]]}
        rehypePlugins={[rehypeKatex]}
        components={{
          table: (props) => (
            <div className="note-table" role="region" tabIndex={0} aria-label="Table, scrolls sideways">
              <table {...props} />
            </div>
          ),
        }}
      >
        {normalizeMath(content)}
      </ReactMarkdown>
    </div>
  );
}
