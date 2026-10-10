"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { cn } from "@/lib/utils";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div
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
        "prose-code:font-mono prose-code:text-xs prose-code:bg-slate-100 dark:prose-code:bg-slate-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-teal-700 dark:prose-code:text-teal-300",
        "prose-pre:bg-slate-900 prose-pre:text-slate-100 prose-pre:rounded-xl prose-pre:p-4 prose-pre:my-3",
        // Blockquotes
        "prose-blockquote:border-l-4 prose-blockquote:border-teal-500 prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-slate-600 dark:prose-blockquote:text-slate-400",
        // Links
        "prose-a:text-teal-600 dark:prose-a:text-teal-400 prose-a:underline hover:prose-a:text-teal-700",
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
