"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Camera, FileUp, GraduationCap, Sparkles, X } from "lucide-react";
import { useUserStore } from "@/lib/store/use-user-store";

const EVENT = "sunroot:add-material";

/** Opens the "Add to Sunroot" sheet from anywhere (the phone bar's + button, the sidebar button, a link). */
export function openAddMaterial() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}

const OPTIONS = [
  { href: "/study/notes", icon: FileUp, title: "Upload notes, a PDF or a scan", hint: "Get clean study notes, a lesson and practice from any file." },
  { href: "/study/snap", icon: Camera, title: "Snap a homework problem", hint: "Take a photo and get the answer explained step by step." },
  { href: "/notebook", icon: BookOpen, title: "Chat with your documents", hint: "Ask questions of your own material, with sources." },
  { href: "/tutor", icon: Sparkles, title: "Ask the tutor", hint: "Stuck on something? Ask in your own words, by text or voice." },
];

/**
 * The one place to put material into Sunroot. On phones it rises from the bottom; on larger screens it is a small centred panel.
 * Everything Sunroot does starts from something you add, so this is one tap from every screen.
 */
export function AddMaterialSheet() {
  const pathname = usePathname();
  const { user } = useUserStore();
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname; // closes itself when you navigate
  const panel = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpenAt(null), []);
  const canTeach = user?.role === "teacher" || user?.role === "admin";

  useEffect(() => {
    const onOpen = () => setOpenAt(window.location.pathname);
    window.addEventListener(EVENT, onOpen);
    return () => window.removeEventListener(EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const items = () => Array.from(panel.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? []);
    items()[0]?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "Tab") {
        const list = items();
        if (!list.length) return;
        const first = list[0];
        const last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, close]);

  if (!open) return null;
  const options = canTeach ? [...OPTIONS, { href: "/classes/manage", icon: GraduationCap, title: "Create a class from a syllabus", hint: "Upload your syllabus; Sunroot maps it into topics for your students." }] : OPTIONS;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/60 md:items-center md:p-6" onClick={close}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Add to Sunroot"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-2xl border border-border bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-xl md:rounded-xl md:pb-4"
      >
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-semibold">Add to Sunroot</h2>
          <button type="button" onClick={close} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <ul className="divide-y divide-border">
          {options.map((o) => (
            <li key={o.href}>
              <Link href={o.href} onClick={close} className="flex items-start gap-3 rounded-md px-1 py-3 hover:bg-muted/60">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-600/10 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                  <o.icon className="h-[18px] w-[18px]" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{o.title}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{o.hint}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
