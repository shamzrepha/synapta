"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ClipboardCheck, FilePenLine, FileUp, FlaskConical, GraduationCap, Layers, Megaphone, NotebookPen, PlayCircle, Plus, ScrollText, ShieldCheck, Sparkles, Target, TrendingUp, UserCheck, Zap, ArrowRight } from "lucide-react";
import { asArray } from "@/lib/api/client";
import { pickQuickActions, normalizeRole, type IconKey } from "@/lib/nav/quick-actions";
import { latestResume, READPOS_PREFIX } from "@/lib/nav/resume";

const ICONS: Record<IconKey, React.ComponentType<{ className?: string }>> = {
  continue: PlayCircle, classes: GraduationCap, cards: Layers, quiz: Zap, written: FilePenLine, notes: FileUp, papers: ScrollText, tutor: Sparkles,
  progress: TrendingUp, create: Plus, plans: NotebookPen, grading: ClipboardCheck, attendance: UserCheck, announce: Megaphone, labs: FlaskConical, forYou: Target, admin: ShieldCheck,
};

/** "Continue where I left off", then whatever Home puts in `after` (the next-step card), then four shortcuts. */
export function QuickActions({ role, classes, after }: { role: string | undefined; classes: Array<{ id: string; title: string }>; after?: React.ReactNode }) {
  const r = normalizeRole(role);
  const [due, setDue] = useState(0);
  const [stamp, setStamp] = useState(0);
  const list = asArray<{ id: string; title: string }>(classes);
  const key = list.map((c) => c.id).join(",");

  useEffect(() => {
    const t = setTimeout(() => setStamp(Date.now()), 0); // read storage after mount (no hydration mismatch)
    return () => clearTimeout(t);
  }, [key]);

  useEffect(() => {
    if (r !== "student") return;
    let alive = true;
    fetch("/api/flashcards")
      .then((x) => x.json())
      .then((j) => {
        if (alive && j?.ok) setDue(Number(j.data?.stats?.dueToday) || 0);
      })
      .catch(() => null);
    return () => {
      alive = false;
    };
  }, [r]);

  const resume = useMemo(() => {
    if (!stamp || r !== "student") return null;
    try {
      const entries: Array<{ key: string; raw: string | null }> = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(READPOS_PREFIX)) entries.push({ key: k, raw: localStorage.getItem(k) });
      }
      return latestResume(entries, list);
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp, r, key]);

  const actions = pickQuickActions({ role: r, dueCards: due, resume: resume ? { href: resume.href, title: resume.pos.title } : null });

  return (
    <section aria-label="Quick actions" className="space-y-3">
      {resume && (
        <Link href={resume.href} className="flex min-h-[44px] items-center gap-3 rounded-lg border border-brand-600/30 bg-brand-600/5 p-4 transition-colors hover:border-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
          <PlayCircle className="h-8 w-8 shrink-0 text-brand-600 dark:text-brand-400" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Continue where I left off</span>
            <span className="block truncate text-sm font-semibold">{resume.className}</span>
            {(resume.pos.title || resume.pos.snippet) && <span className="block truncate text-xs text-muted-foreground">{resume.pos.title || resume.pos.snippet}</span>}
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link>
      )}
      {after}
      <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Shortcuts</h2>
      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {actions.map((a) => {
          const Icon = ICONS[a.icon];
          return (
            <li key={a.id}>
              <Link
                href={a.href}
                className="relative flex min-h-[88px] flex-col items-start justify-between gap-2 rounded-lg border border-border bg-card p-3 transition-colors hover:border-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:border-brand-400"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-600/10 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" aria-hidden="true">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-sm font-semibold leading-tight">{a.label}</span>
                {a.badge && (
                  <span className="absolute right-2 top-2 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold text-white dark:bg-brand-500">
                    {a.badge === "Unfinished" ? "Unfinished" : `${a.badge} due`}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
