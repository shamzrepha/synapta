"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, Moon, Plus, Search as SearchIcon, Sun } from "lucide-react";
import { useUserStore } from "@/lib/store/use-user-store";
import { useTheme } from "@/components/providers/theme-provider";
import { NAV_ITEMS } from "./nav-items";
import { openAddMaterial } from "./add-material";
import { cn } from "@/lib/utils";

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  run: () => void;
}

/** Ctrl/Cmd+K: jump anywhere, add material, switch theme, or search everything. */
export function CommandPalette() {
  const router = useRouter();
  const { user } = useUserStore();
  const { theme, toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        setQ("");
        setCursor(0);
      } else if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const role = (user?.role || "student") as "student" | "teacher" | "admin";
    const go = (href: string) => () => router.push(href);
    const list: Command[] = [
      { id: "add", label: "Add material", hint: "Upload notes, a photo, a link", icon: Plus, run: () => openAddMaterial() },
      ...NAV_ITEMS.filter((n) => n.roles.includes(role)).map((n) => ({ id: n.href, label: n.label, hint: n.hint, icon: n.icon, run: go(n.href) })),
      {
        id: "theme",
        label: theme === "dark" ? "Switch to light mode" : "Switch to dark mode",
        icon: theme === "dark" ? Sun : Moon,
        run: toggleTheme,
      },
    ];
    return list;
  }, [user?.role, router, theme, toggleTheme]);

  const needle = q.trim().toLowerCase();
  const shown = useMemo(() => {
    const hits = needle ? commands.filter((c) => (c.label + " " + (c.hint || "")).toLowerCase().includes(needle)) : commands;
    return needle
      ? [...hits, { id: "search", label: `Search everything for "${q.trim()}"`, icon: SearchIcon, run: () => router.push(`/search?q=${encodeURIComponent(q.trim())}`) } as Command]
      : hits;
  }, [commands, needle, q, router]);

  const choose = (c?: Command) => {
    if (!c) return;
    setOpen(false);
    c.run();
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center p-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Command palette">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border px-3">
          <SearchIcon className="h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setCursor(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => Math.min(c + 1, shown.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => Math.max(c - 1, 0));
              } else if (e.key === "Enter") choose(shown[cursor]);
            }}
            placeholder="Go to, add, or search…"
            className="h-12 w-full bg-transparent text-sm outline-none"
            aria-label="Type a command"
          />
          <kbd className="text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5">Esc</kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-1.5" role="listbox">
          {shown.map((c, i) => (
            <li key={c.id} role="option" aria-selected={i === cursor}>
              <button
                type="button"
                onMouseEnter={() => setCursor(i)}
                onClick={() => choose(c)}
                className={cn("w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm", i === cursor ? "bg-brand-500/10" : "")}
              >
                <c.icon className="h-4 w-4 text-brand-600 dark:text-brand-400 shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block truncate">{c.label}</span>
                  {c.hint && <span className="block truncate text-xs text-muted-foreground">{c.hint}</span>}
                </span>
                {i === cursor && <CornerDownLeft className="h-3.5 w-3.5 text-muted-foreground" />}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
