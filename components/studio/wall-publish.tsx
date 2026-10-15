"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ImagePlus, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { uploadPostImage } from "@/lib/image-compress";
import { parseVideoUrl } from "@/lib/studio/wall";

/** "Publish to the Maker Wall" form, shown in the editor's Share tab (owners only). */
export function WallPublish({ designId, isOwner, onPublished }: { designId: string; isOwner: boolean; onPublished?: () => void }) {
  const { toast } = useToast();
  const [loaded, setLoaded] = useState(false);
  const [onWall, setOnWall] = useState(false);
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [cover, setCover] = useState<{ path: string; url: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/studio/wall/${designId}`)
      .then((r) => r.json())
      .then((j) => {
        if (!live) return;
        if (j.ok) {
          setOnWall(true);
          setDescription(j.data.item.description || "");
          setVideoUrl(j.data.item.video?.url || "");
          if (j.data.item.coverUrl) setCover({ path: String(j.data.item.coverUrl).replace("/api/media/", ""), url: j.data.item.coverUrl });
        }
        setLoaded(true);
      })
      .catch(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, [designId]);

  if (!isOwner || !loaded) return null;

  const videoOk = !videoUrl.trim() || !!parseVideoUrl(videoUrl);
  const call = async (method: "POST" | "DELETE") => {
    setBusy(true);
    try {
      const j = await fetch(`/api/studio/designs/${designId}/wall`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "POST" ? JSON.stringify({ description, videoUrl: videoUrl.trim(), coverPath: cover?.path || null }) : undefined,
      }).then((r) => r.json());
      if (j.ok) {
        setOnWall(method === "POST");
        setOpen(false);
        toast({ title: method === "POST" ? "On the Maker Wall" : "Removed from the Maker Wall" });
        onPublished?.();
      } else toast({ title: "Couldn't update the wall", description: j.error?.message, variant: "destructive" });
    } catch {
      toast({ title: "Couldn't update the wall", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };
  const pick = async (f: File | undefined) => {
    if (!f) return;
    try {
      setCover(await uploadPostImage(f));
    } catch (e) {
      toast({ title: "Couldn't upload the photo", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    }
  };

  return (
    <div className="rounded-2xl border border-teal-500/40 bg-teal-500/5 p-3 space-y-2">
      <p className="font-bold flex items-center gap-1.5"><Rocket className="h-4 w-4" /> Maker Wall</p>
      {!open ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setOpen(true)}>{onWall ? "Edit wall post" : "Publish to the Maker Wall"}</Button>
          {onWall && (
            <>
              <Link href={`/studio/wall/${designId}`} className="text-xs font-semibold text-teal-600">View</Link>
              <button type="button" disabled={busy} onClick={() => call("DELETE")} className="text-xs font-semibold text-rose-600 min-h-[36px]">Take down</button>
            </>
          )}
          {!onWall && <span className="text-xs text-slate-500">Makes the design public.</span>}
        </div>
      ) : (
        <div className="space-y-2">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={1200} placeholder="What does it do? What did you learn?" className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm" aria-label="Description" />
          <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="Demo video link (YouTube or Vimeo, optional)" className="h-10 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm" aria-label="Demo video link" />
          {!videoOk && <p className="text-xs text-rose-600">That doesn&apos;t look like a YouTube or Vimeo link.</p>}
          <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer min-h-[36px]">
            <ImagePlus className="h-4 w-4" /> {cover ? "Change cover photo" : "Add a cover photo (optional)"}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          </label>
          {cover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover.url} alt="Cover preview" className="h-24 rounded-xl border border-slate-200 dark:border-slate-800 object-cover" />
          )}
          <p className="text-[11px] text-slate-500">The parts list is built automatically from your circuit. Publishing makes the design public.</p>
          <div className="flex gap-2">
            <Button size="sm" isLoading={busy} disabled={description.trim().length < 10 || !videoOk} onClick={() => call("POST")}>Publish</Button>
            <Button size="sm" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
