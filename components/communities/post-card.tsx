"use client";

import React, { useState } from "react";
import { Heart, MessageCircle, Pin, PinOff, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/toast";
import { asArray } from "@/lib/api/client";
import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";

export interface CPost {
  id: string;
  text: string;
  image: string | null;
  tags: string[];
  pinned: boolean;
  likeCount: number;
  commentCount: number;
  liked: boolean;
  createdAtMs: number;
  author: { uid: string; displayName: string; photoURL: string | null };
  canDelete: boolean;
}
interface CComment {
  id: string;
  text: string;
  createdAtMs: number;
  author: { uid: string; displayName: string; photoURL: string | null };
  canDelete: boolean;
}

/** Text with #tags turned into tappable filters (everything else stays plain text). */
function TaggedText({ text, onTag }: { text: string; onTag: (t: string) => void }) {
  const parts = text.split(/(#[a-zA-Z][a-zA-Z0-9_]{1,39})/g);
  return (
    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <button key={i} type="button" onClick={() => onTag(p.slice(1).toLowerCase())} className="font-semibold text-teal-600 dark:text-teal-400">
            {p}
          </button>
        ) : (
          <React.Fragment key={i}>{p}</React.Fragment>
        )
      )}
    </p>
  );
}

export function CommunityPostCard({
  communityId,
  post,
  isOwner,
  onChange,
  onTag,
}: {
  communityId: string;
  post: CPost;
  isOwner: boolean;
  onChange: (id: string, patch: Partial<CPost> | null) => void;
  onTag: (t: string) => void;
}) {
  const { toast } = useToast();
  const base = `/api/communities/${communityId}/posts/${post.id}`;
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<CComment[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const loadComments = async () => {
    const j = await fetch(`${base}/comments`).then((r) => r.json()).catch(() => null);
    if (j?.ok) setComments(asArray<CComment>(j.data));
  };

  const like = async () => {
    onChange(post.id, { liked: !post.liked, likeCount: post.likeCount + (post.liked ? -1 : 1) });
    const j = await fetch(`${base}/like`, { method: "POST" }).then((r) => r.json()).catch(() => null);
    if (j?.ok) onChange(post.id, j.data);
    else onChange(post.id, { liked: post.liked, likeCount: post.likeCount });
  };

  const remove = async () => {
    if (!window.confirm("Delete this post?")) return;
    const j = await fetch(base, { method: "DELETE" }).then((r) => r.json()).catch(() => null);
    if (j?.ok) onChange(post.id, null);
    else toast({ title: "Couldn't delete", description: j?.error?.message, variant: "destructive" });
  };

  const pin = async () => {
    const j = await fetch(base, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pinned: !post.pinned }) })
      .then((r) => r.json())
      .catch(() => null);
    if (j?.ok) onChange(post.id, { pinned: !post.pinned });
  };

  const addComment = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    const j = await fetch(`${base}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: draft }) })
      .then((r) => r.json())
      .catch(() => null);
    setBusy(false);
    if (j?.ok) {
      setDraft("");
      onChange(post.id, { commentCount: post.commentCount + 1 });
      loadComments();
    } else toast({ title: "Couldn't comment", description: j?.error?.message, variant: "destructive" });
  };

  const removeComment = async (cid: string) => {
    const j = await fetch(`${base}/comments?cid=${cid}`, { method: "DELETE" }).then((r) => r.json()).catch(() => null);
    if (j?.ok) {
      setComments((c) => c.filter((x) => x.id !== cid));
      onChange(post.id, { commentCount: Math.max(0, post.commentCount - 1) });
    }
  };

  return (
    <article className={cn("rounded-2xl border bg-white dark:bg-slate-900 p-4 space-y-3", post.pinned ? "border-amber-500/50" : "border-slate-200 dark:border-slate-800")}>
      {post.pinned && (
        <p className="flex items-center gap-1 text-xs font-bold text-amber-600 dark:text-amber-400">
          <Pin className="h-3.5 w-3.5" /> Announcement
        </p>
      )}
      <div className="flex items-center gap-2">
        <Avatar name={post.author.displayName} photoURL={post.author.photoURL} seed={post.author.uid} size={32} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{post.author.displayName}</p>
          <p className="text-[11px] text-slate-500">{timeAgo(new Date(post.createdAtMs).toISOString())}</p>
        </div>
        {isOwner && (
          <button onClick={pin} aria-label={post.pinned ? "Unpin" : "Pin as announcement"} className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
            {post.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
          </button>
        )}
        {post.canDelete && (
          <button onClick={remove} aria-label="Delete post" className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-rose-500/10 hover:text-rose-600">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
      {post.text && <TaggedText text={post.text} onTag={onTag} />}
      {post.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/media/${post.image}`} alt="" loading="lazy" decoding="async" className="max-h-96 w-full rounded-xl object-cover" />
      )}
      <div className="flex items-center gap-1">
        <button onClick={like} className={cn("flex h-9 items-center gap-1 rounded-xl px-2.5 text-sm font-semibold", post.liked ? "bg-rose-500/10 text-rose-600" : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800")}>
          <Heart className={cn("h-4 w-4", post.liked && "fill-current")} /> {post.likeCount}
        </button>
        <button
          onClick={() => {
            if (!open) loadComments();
            setOpen(!open);
          }}
          className="flex h-9 items-center gap-1 rounded-xl px-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <MessageCircle className="h-4 w-4" /> {post.commentCount}
        </button>
      </div>
      {open && (
        <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3">
          {comments.map((c) => (
            <div key={c.id} className="flex items-start gap-2 text-sm">
              <Avatar name={c.author.displayName} photoURL={c.author.photoURL} seed={c.author.uid} size={24} />
              <p className="min-w-0 flex-1 break-words">
                <span className="font-semibold">{c.author.displayName}</span> {c.text}
              </p>
              {c.canDelete && (
                <button onClick={() => removeComment(c.id)} aria-label="Delete comment" className="text-slate-400 hover:text-rose-600">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
          <div className="flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addComment()}
              maxLength={500}
              placeholder="Write a comment"
              className="h-10 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
            <button onClick={addComment} disabled={busy || !draft.trim()} className="h-10 rounded-xl bg-teal-600 px-3 text-sm font-semibold text-white disabled:opacity-50">
              Send
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
