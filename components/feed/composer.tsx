"use client";

import React, { useRef, useState } from "react";
import { HelpCircle, Sparkles, MessageSquare, Link2, ImagePlus, BarChart3, X, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/toast";
import { useUserStore } from "@/lib/store/use-user-store";
import { uploadPostImage } from "@/lib/image-compress";
import { asArray } from "@/lib/api/client";
import { cn } from "@/lib/utils";

type Kind = "post" | "question" | "showcase";

const KINDS: Array<{ key: Kind; label: string; icon: React.ReactNode; placeholder: string }> = [
  { key: "post", label: "Post", icon: <MessageSquare className="h-3.5 w-3.5" />, placeholder: "Share a win, a tip or what you learned… (#hashtags and @mentions work)" },
  { key: "question", label: "Ask", icon: <HelpCircle className="h-3.5 w-3.5" />, placeholder: "Stuck on something? Ask your classmates…" },
  { key: "showcase", label: "Showcase", icon: <Sparkles className="h-3.5 w-3.5" />, placeholder: "Show off a project, notes or a solution…" },
];

interface Img {
  path: string;
  url: string;
}

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
  const [images, setImages] = useState<Img[]>([]);
  const [uploading, setUploading] = useState(0);
  const [pollOn, setPollOn] = useState(false);
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [pollHours, setPollHours] = useState(24);
  const [audience, setAudience] = useState<string>(defaultClassId ? `class:${defaultClassId}` : "public");
  const [posting, setPosting] = useState(false);
  const [focused, setFocused] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setText("");
    setLink("");
    setShowLink(false);
    setImages([]);
    setPollOn(false);
    setPollOptions(["", ""]);
    setFocused(false);
  };

  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    const list = Array.from(files).slice(0, 4 - images.length);
    for (const f of list) {
      if (!f.type.startsWith("image/")) continue;
      setUploading((n) => n + 1);
      try {
        const img = await uploadPostImage(f);
        setImages((prev) => [...prev, img].slice(0, 4));
      } catch (e) {
        toast({ title: "Couldn't upload image", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  const submit = async () => {
    const options = pollOptions.map((o) => o.trim()).filter(Boolean);
    if (pollOn && options.length < 2) {
      toast({ title: "Add at least two poll options", variant: "destructive" });
      return;
    }
    if (!text.trim() && images.length === 0) return;
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
          images: images.map((i) => i.path),
          poll: pollOn ? { options, durationHours: pollHours } : null,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        reset();
        onPosted();
      } else {
        toast({ title: "Couldn't post", description: data.error?.message, variant: "destructive" });
      }
    } finally {
      setPosting(false);
    }
  };

  const current = KINDS.find((k) => k.key === kind)!;
  const expanded = focused || !!text || images.length > 0 || pollOn;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex gap-3">
        <Avatar name={user?.displayName || "You"} photoURL={user?.photoURL} seed={user?.uid} size={40} />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setFocused(true)}
          rows={expanded ? 3 : 1}
          maxLength={3000}
          placeholder={pollOn ? "Ask your poll question…" : current.placeholder}
          className="flex-1 resize-none rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-3 py-2.5 text-sm focus:outline-none focus:border-teal-500 focus:bg-white dark:focus:bg-slate-900"
        />
      </div>

      {(images.length > 0 || uploading > 0) && (
        <div className="flex gap-2 flex-wrap pl-[52px]">
          {images.map((img) => (
            <div key={img.path} className="relative h-20 w-20 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => setImages((prev) => prev.filter((p) => p.path !== img.path))}
                className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 text-white flex items-center justify-center"
                aria-label="Remove image"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          {uploading > 0 && (
            <div className="h-20 w-20 rounded-xl border border-dashed border-slate-300 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          )}
        </div>
      )}

      {pollOn && (
        <div className="pl-[52px] space-y-2">
          {pollOptions.map((o, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={o}
                onChange={(e) => setPollOptions((prev) => prev.map((p, j) => (j === i ? e.target.value : p)))}
                maxLength={80}
                placeholder={`Option ${i + 1}`}
                className="flex-1 h-9 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-sm"
              />
              {pollOptions.length > 2 && (
                <button type="button" onClick={() => setPollOptions((prev) => prev.filter((_, j) => j !== i))} aria-label="Remove option" className="px-2 text-slate-400">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
          <div className="flex items-center gap-2 text-xs">
            {pollOptions.length < 4 && (
              <button type="button" onClick={() => setPollOptions((p) => [...p, ""])} className="font-semibold text-teal-600">
                + Add option
              </button>
            )}
            <select value={pollHours} onChange={(e) => setPollHours(Number(e.target.value))} className="ml-auto h-8 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2">
              {[1, 6, 24, 72, 168].map((h) => (
                <option key={h} value={h}>
                  {h < 24 ? `${h} hour${h > 1 ? "s" : ""}` : `${h / 24} day${h > 24 ? "s" : ""}`}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {expanded && (
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
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={images.length >= 4} className="p-1.5 rounded-full border border-slate-200 dark:border-slate-800 text-slate-500 disabled:opacity-40" aria-label="Add photos">
              <ImagePlus className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => setPollOn((v) => !v)} className={cn("p-1.5 rounded-full border", pollOn ? "border-teal-500 text-teal-600" : "border-slate-200 dark:border-slate-800 text-slate-500")} aria-label="Add poll">
              <BarChart3 className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => setShowLink((v) => !v)} className={cn("p-1.5 rounded-full border", showLink ? "border-teal-500 text-teal-600" : "border-slate-200 dark:border-slate-800 text-slate-500")} aria-label="Add link">
              <Link2 className="h-3.5 w-3.5" />
            </button>
            <select value={audience} onChange={(e) => setAudience(e.target.value)} className="h-8 rounded-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 text-xs max-w-[170px]" aria-label="Who can see this">
              <option value="public">🌍 Everyone</option>
              {defaultClassId && (
                <option value={`public:${defaultClassId}`}>🌍 Everyone (tagged {classes.find((c) => c.id === defaultClassId)?.title || "class"})</option>
              )}
              {asArray(classes).map((c) => (
                <option key={c.id} value={`class:${c.id}`}>
                  🎓 {c.title} only
                </option>
              ))}
            </select>
            <Button size="sm" className="ml-auto" onClick={submit} isLoading={posting} disabled={(!text.trim() && images.length === 0) || uploading > 0}>
              Post
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
