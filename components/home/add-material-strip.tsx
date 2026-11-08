import React from "react";
import Link from "next/link";
import { BookOpen, Camera, FileUp, Sparkles } from "lucide-react";

const TILES = [
  { href: "/study/notes", icon: FileUp, title: "Upload notes", hint: "PDF, scan or photo" },
  { href: "/study/snap", icon: Camera, title: "Snap homework", hint: "Get it explained" },
  { href: "/notebook", icon: BookOpen, title: "Chat with a document", hint: "Ask, with sources" },
  { href: "/tutor", icon: Sparkles, title: "Ask the tutor", hint: "Text or voice" },
];

/** The four ways to put something in, right on Home. Everything Sunroot builds starts from what you add. */
export function AddMaterialStrip() {
  return (
    <section aria-label="Add material" className="space-y-3">
      <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Add something to learn from</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {TILES.map((t) => (
          <Link key={t.href} href={t.href} className="group flex flex-col gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-brand-600 dark:hover:border-brand-400">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-600/10 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
              <t.icon className="h-[18px] w-[18px]" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-medium leading-tight">{t.title}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{t.hint}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
