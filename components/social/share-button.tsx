"use client";

import React, { useState } from "react";
import { Share2, Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { ShareSheet } from "./share-sheet";
import type { SharedAttachment } from "./attachment-card";

/** Share anything (room, challenge, topic, badge, notebook…) to chats or a feed. */
export function ShareButton({ item, label = "Share", size = "sm", variant = "outline" }: { item: SharedAttachment; label?: string; size?: "sm" | "default"; variant?: "outline" | "default" | "ghost" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size={size} variant={variant} onClick={() => setOpen(true)}>
        <Share2 className="h-4 w-4 mr-1" /> {label}
      </Button>
      {open && <ShareSheet attachment={item} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Save anything to the personal library (/saved). */
export function SaveButton({ item, initiallySaved = false }: { item: SharedAttachment; initiallySaved?: boolean }) {
  const { toast } = useToast();
  const [saved, setSaved] = useState(initiallySaved);
  const toggle = async () => {
    const next = !saved;
    setSaved(next);
    const r = await fetch("/api/bookmarks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item, saved: next }) }).then((x) => x.json()).catch(() => null);
    if (!r?.ok) setSaved(!next);
    else toast({ title: next ? "Saved to your library" : "Removed from saved", variant: "success" });
  };
  return (
    <Button size="sm" variant="outline" onClick={toggle} aria-pressed={saved}>
      <Bookmark className={`h-4 w-4 mr-1 ${saved ? "fill-amber-500 text-amber-500" : ""}`} /> {saved ? "Saved" : "Save"}
    </Button>
  );
}
