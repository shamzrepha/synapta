import type { ReactNode } from "react";
import Link from "next/link";

/** Shared shell for /privacy and /terms: the draft banner stays loud until a lawyer has reviewed the text. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8">
      <div role="note" className="mb-8 rounded-xl border-2 border-amber-500 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100">
        Draft for legal review: not yet reviewed by a lawyer
      </div>
      <Link href="/" className="text-sm font-semibold text-brand-600 hover:underline dark:text-brand-400">&larr; Sunroot</Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">Last updated: {updated}</p>
      <div className="mt-8 space-y-4 text-[15px] leading-relaxed [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_a]:text-brand-600 [&_a]:underline dark:[&_a]:text-brand-400">
        {children}
      </div>
    </main>
  );
}
