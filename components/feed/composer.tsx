"use client";

import React, { useState } from "react";
import { HelpCircle, Sparkles, MessageSquare, Link2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/toast";
import { useUserStore } from "@/lib/store/use-user-store";
import { cn } from "@/lib/utils";
import { asArray } from "@/lib/api/client";

type Kind = "post" | "question" | "showcase";

const KINDS: Array<{ key: Kind; label: string; icon: React.ReactNode; placeholder: string }> = [
  { key: "post", label: "Post", icon: <MessageSquare className="h-3.5 w-3.5" />, placeholder: "Share what you learned, a tip, or a win…" },
  { key: "question", label: "Ask", icon: <HelpCircle className="h-3.5 w-3.5" />, placeholder: "Stuck on something? Ask your classmates…" },
  { key: "showcase", label: "Showcase", icon: <Sparkles className="h-3.5 w-3.5" />, placeholder: "Show off a project, notes or a solution…" },
];

export function Composer({
  classes,
  defaultClassId,
  onPosted,
}: {
  classes: Array<{ id: string; title: string }>;
  defaultClassId?: string;
  onPosted: () => void;
}) {
  const { user } = useUserStore();
  const { toast } = useToast();
  const [kind, setKind] = useState<Kind>("post");
  const [text, setText] = useState("");
  const [link, setLink] = useState("");
  const [showLink, setShowLink] = useState(false);
  const [audience, setAudience] = useState<string>(defaultClassId ? `class:${defaultClassId}` : "public");
  const [posting, setPosting] = useState(false);
  const [focused, setFocused] = useState(false);

  const submit = async () => {
    if (!text.trim() || posting) return;
    setPosting(true);
    const classId = audience.startsWith("class:") ? audience.slice(6) : audience.startsWith("public:") ? audience.slice(7) : null;
    try {
      const res = await fetch("/api/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          kind,
          classId,
          visibility: audience.startsWith("class:") ? "class" : "public",
          link: link.trim() || null,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setText("");
        setLink("");
        setShowLink(false);
        setFocused(false);
        onPosted();
      } else {
        toast({ title: "Couldn't post", description: data.error?.message, variant: "destructive" });
      }
    } finally {
      setPosting(false);
    }
  };

  const current = KINDS.find((k) => k.key === kind)!;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex gap-3">
        <Avatar name={user?.displayName || "You"} photoURL={user?.photoURL} seed={user?.uid} size={40} />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setFocused(true)}
          rows={focused || text ? 3 : 1}
          maxLength={2000}
          placeholder={current.placeholder}
          className="flex-1 resize-none rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-3 py-2.5 text-sm focus:outline-none focus:border-teal-500 focus:bg-white dark:focus:bg-slate-900"
        />
      </div>
      {(focused || text) && (
        <>
          {showLink && (
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://… (project, repo, notes)"
              className="w-full h-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-sm focus:outline-none focus:border-teal-500"
            />
          )}
          <div className="flex flex-wrap items-center gap-2">
            {KINDS.map((k) => (
              <button
                key={k.key}
                type="button"
                onClick={() => setKind(k.key)}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-semibold border",
                  kind === k.key ? "border-teal-500 bg-teal-500/10 text-teal-700 dark:text-teal-300" : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"
                )}
              >
                {k.icon} {k.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowLink((v) => !v)}
              className={cn("p-1.5 rounded-full border", showLink ? "border-teal-500 text-teal-600" : "border-slate-200 dark:border-slate-800 text-slate-500")}
              aria-label="Add link"
            >
              <Link2 className="h-3.5 w-3.5" />
            </button>
            <select
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              className="h-8 rounded-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 text-xs max-w-[180px]"
              aria-label="Who can see this"
            >
              <option value="public">🌍 Everyone</option>
              {defaultClassId && (
                <option value={`public:${defaultClassId}`}>
                  🌍 Everyone (tagged {classes.find((c) => c.id === defaultClassId)?.title || "class"})
                </option>
              )}
              {asArray(classes).map((c) => (
                <option key={c.id} value={`class:${c.id}`}>
                  🎓 {c.title} only
                </option>
              ))}
            </select>
            <Button size="sm" className="ml-auto" onClick={submit} isLoading={posting} disabled={!text.trim()}>
              Post
            </Button>
          </div>
          <p className="text-[11px] text-slate-400">Markdown and $\LaTeX$ supported. Be kind — posts can be removed by teachers.</p>
        </>
      )}
    </Card>
  );
}
