"use client";

import React, { useRef, useState } from "react";
import { ImagePlus, Loader2, Megaphone, X } from "lucide-react";
import { SocialInput } from "@/components/feed/social-input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { uploadPostImage } from "@/lib/image-compress";
import { MAX_POST_CHARS } from "@/lib/communities/rules";
import { cn } from "@/lib/utils";

export function CommunityComposer({ communityId, isOwner, onPosted }: { communityId: string; isOwner: boolean; onPosted: () => void }) {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [image, setImage] = useState<{ path: string; url: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [posting, setPosting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setUploading(true);
    try {
      setImage(await uploadPostImage(f));
    } catch (e) {
      toast({ title: "Couldn't upload image", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const post = async () => {
    if (!text.trim() && !image) return;
    setPosting(true);
    const j = await fetch(`/api/communities/${communityId}/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, image: image?.path, pinned: isOwner && pinned }),
    })
      .then((r) => r.json())
      .catch(() => null);
    setPosting(false);
    if (j?.ok) {
      setText("");
      setImage(null);
      setPinned(false);
      onPosted();
    } else toast({ title: "Couldn't post", description: j?.error?.message, variant: "destructive" });
  };

  return (
    <div className="space-y-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
      <SocialInput
        value={text}
        onChange={setText}
        rows={3}
        maxLength={MAX_POST_CHARS}
        placeholder="Share something with the community (#tags work)"
        className="w-full resize-none rounded-xl border border-slate-300 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900"
      />
      {image && (
        <div className="relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.url} alt="" className="h-24 rounded-xl object-cover" />
          <button onClick={() => setImage(null)} aria-label="Remove image" className="absolute -right-2 -top-2 rounded-full bg-slate-900 p-1 text-white">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
        <button onClick={() => fileRef.current?.click()} className="flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-semibold dark:border-slate-700">
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />} Photo
        </button>
        {isOwner && (
          <button
            onClick={() => setPinned((p) => !p)}
            className={cn("flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold", pinned ? "border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300" : "border-slate-200 dark:border-slate-700")}
          >
            <Megaphone className="h-3.5 w-3.5" /> Announcement
          </button>
        )}
        <Button size="sm" className="ml-auto" onClick={post} isLoading={posting} disabled={uploading || (!text.trim() && !image)}>
          Post
        </Button>
      </div>
    </div>
  );
}
