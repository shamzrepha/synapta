"use client";

import React, { useEffect, useRef, useState } from "react";
import { Hash } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { activeToken, applySuggestion, type ActiveToken } from "@/lib/social/text";
import { asArray } from "@/lib/api/client";
import { cn } from "@/lib/utils";

interface UserHit {
  uid: string;
  username: string;
  displayName: string;
  photoURL: string | null;
}
interface TagHit {
  tag: string;
  total: number;
}

type Props = {
  value: string;
  onChange: (v: string) => void;
  as?: "textarea" | "input";
  /** lets the parent focus the box (e.g. when replying) */
  inputRef?: React.MutableRefObject<HTMLInputElement | HTMLTextAreaElement | null>;
} & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement> & React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "ref">;

/**
 * A text box that suggests people while you type "@ab…" and hashtags while you type "#ph…".
 * Arrow keys + Enter/Tab pick one, Esc closes, tapping works on phones.
 */
export function SocialInput({ value, onChange, as = "textarea", className, onKeyDown, inputRef, ...rest }: Props) {
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  const [token, setToken] = useState<ActiveToken | null>(null);
  const [caret, setCaret] = useState(0);
  const [users, setUsers] = useState<UserHit[]>([]);
  const [tags, setTags] = useState<TagHit[]>([]);
  const [index, setIndex] = useState(0);

  const sync = () => {
    const el = ref.current;
    if (!el) return;
    const c = el.selectionStart ?? el.value.length;
    setCaret(c);
    setToken(activeToken(el.value, c));
    setIndex(0);
  };

  // fetch suggestions for the token being typed (debounced; stale answers are ignored)
  useEffect(() => {
    if (!token) return;
    let live = true;
    const t = setTimeout(() => {
      const url = token.kind === "@" ? `/api/mentions/users?q=${encodeURIComponent(token.query)}` : `/api/hashtags/suggest?q=${encodeURIComponent(token.query)}`;
      fetch(url)
        .then((r) => r.json())
        .then((j) => {
          if (!live || !j.ok) return;
          if (token.kind === "@") setUsers(asArray<UserHit>(j.data.users));
          else setTags(asArray<TagHit>(j.data.tags));
        })
        .catch(() => undefined);
    }, 150);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [token]);

  const items = token ? (token.kind === "@" ? users.map((u) => ({ key: u.uid, value: u.username, node: u })) : tags.map((t) => ({ key: t.tag, value: t.tag, node: t }))) : [];
  const open = !!token && items.length > 0;

  const pick = (value: string) => {
    if (!token) return;
    const r = applySuggestion(value_(), caret, token, value);
    onChange(r.text);
    setToken(null);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(r.caret, r.caret);
    });
  };
  const value_ = () => ref.current?.value ?? value;

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement & HTMLInputElement>) => {
    if (open) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setIndex((i) => (i + 1) % items.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setIndex((i) => (i - 1 + items.length) % items.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pick(items[index].value);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setToken(null);
        return;
      }
    }
    (onKeyDown as ((e: React.KeyboardEvent<HTMLTextAreaElement & HTMLInputElement>) => void) | undefined)?.(e);
  };

  const setRef = (el: (HTMLTextAreaElement & HTMLInputElement) | null) => {
    ref.current = el;
    if (inputRef) inputRef.current = el;
  };
  const common = {
    ref: setRef,
    value,
    className,
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement & HTMLInputElement>) => {
      onChange(e.target.value);
      requestAnimationFrame(sync);
    },
    onKeyUp: (e: React.KeyboardEvent) => {
      if (!["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(e.key)) sync();
    },
    onClick: sync,
    onKeyDown: handleKey,
    onBlur: () => setTimeout(() => setToken(null), 150),
    autoComplete: "off",
    ...rest,
  };

  return (
    <div className="relative flex-1 min-w-0">
      {as === "textarea" ? <textarea {...(common as React.TextareaHTMLAttributes<HTMLTextAreaElement>)} ref={setRef} className={cn("w-full", className)} /> : <input {...(common as React.InputHTMLAttributes<HTMLInputElement>)} ref={setRef} className={cn("w-full", className)} />}
      {open && (
        <ul role="listbox" className="absolute left-0 right-0 top-full z-30 mt-1 max-h-60 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg">
          {items.map((it, i) => (
            <li key={it.key} role="option" aria-selected={i === index}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(it.value);
                }}
                className={cn("w-full flex items-center gap-2 px-3 py-2 text-left text-sm", i === index ? "bg-teal-500/10" : "hover:bg-slate-50 dark:hover:bg-slate-800")}
              >
                {token!.kind === "@" ? (
                  <>
                    <Avatar name={(it.node as UserHit).displayName} photoURL={(it.node as UserHit).photoURL} seed={(it.node as UserHit).uid} size={24} />
                    <span className="font-semibold truncate">{(it.node as UserHit).displayName}</span>
                    <span className="text-xs text-slate-500 truncate">@{(it.node as UserHit).username}</span>
                  </>
                ) : (
                  <>
                    <Hash className="h-4 w-4 text-teal-600 shrink-0" />
                    <span className="font-semibold truncate">{(it.node as TagHit).tag}</span>
                    <span className="ml-auto text-xs text-slate-500">{(it.node as TagHit).total ? `${(it.node as TagHit).total} posts` : "new tag"}</span>
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
