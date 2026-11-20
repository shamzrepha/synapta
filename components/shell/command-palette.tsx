"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, Moon, Plus, Search as SearchIcon, Sparkles, Sun } from "lucide-react";
import { useUserStore } from "@/lib/store/use-user-store";
import { useTheme } from "@/components/providers/theme-provider";
import { NAV_ITEMS } from "./nav-items";
import { FEATURES } from "@/lib/features/registry";
import { paletteSuggestions, normalizeRole } from "@/lib/nav/quick-actions";
import { FeatureIcon } from "./feature-icon";
import { openAddMaterial } from "./add-material";
import { cn } from "@/lib/utils";

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  emoji?: string;
  run: () => void;
}

const OPEN_EVENT = "sunroot:open-palette";

/** Opens the palette from a button (the topbar's Jump to). */
export function openCommandPalette() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(OPEN_EVENT));
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
    const onOpen = () => {
      setQ("");
      setCursor(0);
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const role = normalizeRole(user?.role);
    const go = (href: string) => () => router.push(href);
    const seen = new Set<string>();
    const suggested: Command[] = paletteSuggestions(role).map((a) => ({ id: "s:" + a.href, label: a.label, hint: "Suggested", icon: Sparkles, run: go(a.href) }));
    suggested.forEach((c) => seen.add(c.id.slice(2)));
    const features: Command[] = FEATURES.filter((f) => f.status === "live" && (f.group !== "Teachers" || role !== "student") && !seen.has(f.href))
      .map((f) => ({ id: "f:" + f.id, label: f.title, hint: f.blurb, icon: () => null, run: go(f.href), emoji: f.emoji }));
    const list: Command[] = [
      { id: "add", label: "Add material", hint: "Upload notes, a photo, a link", icon: Plus, run: () => openAddMaterial() },
      ...suggested,
      ...NAV_ITEMS.filter((n) => n.roles.includes(role)).map((n) => ({ id: n.href, label: n.label, hint: n.hint, icon: n.icon, run: go(n.href) })),
      ...features,
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
                className={cn("w-full min-h-[44px] flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm", i === cursor ? "bg-brand-500/10" : "")}
              >
                {c.emoji ? <FeatureIcon emoji={c.emoji} tile="h-7 w-7" /> : <c.icon className="h-4 w-4 text-brand-600 dark:text-brand-400 shrink-0" />}
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
