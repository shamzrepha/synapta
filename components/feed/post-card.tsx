"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Heart, MessageCircle, Trash2, Link2, HelpCircle, Sparkles, Trophy, Send } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { timeAgo } from "@/components/notifications/notification-list";
import { useLiveChannel } from "@/lib/live/client";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export interface FeedPost {
  id: string;
  authorUid: string;
  authorName: string;
  authorPhoto: string | null;
  authorLevel: number;
  authorRole: string;
  kind: "post" | "question" | "showcase" | "achievement";
  text: string;
  link: string | null;
  classId: string | null;
  visibility: "public" | "class";
  likeCount: number;
  commentCount: number;
  createdAt: string | null;
  likedByMe: boolean;
  mine: boolean;
}

interface Comment {
  id: string;
  authorUid: string;
  authorName: string;
  authorPhoto: string | null;
  authorLevel: number;
  text: string;
  createdAt: string | null;
}

const KIND_BADGE: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  question: { label: "Question", icon: <HelpCircle className="h-3 w-3 mr-1" />, className: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300" },
  showcase: { label: "Showcase", icon: <Sparkles className="h-3 w-3 mr-1" />, className: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  achievement: { label: "Achievement", icon: <Trophy className="h-3 w-3 mr-1" />, className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
};

async function fetchComments(postId: string): Promise<Comment[] | null> {
  try {
    const res = await fetch(`/api/feed/${postId}/comments`);
    const data = await res.json();
    return data.ok ? data.data.comments : null;
  } catch {
    return null;
  }
}

export function PostCard({
  post,
  canModerate,
  defaultOpen = false,
  onDeleted,
  classLabel,
}: {
  post: FeedPost;
  canModerate?: boolean;
  defaultOpen?: boolean;
  onDeleted?: (id: string) => void;
  classLabel?: string;
}) {
  const { toast } = useToast();
  const [liked, setLiked] = useState(post.likedByMe);
  const [likes, setLikes] = useState(post.likeCount);
  const [pop, setPop] = useState(false);
  const [open, setOpen] = useState(defaultOpen);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [commentCount, setCommentCount] = useState(post.commentCount);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const loadComments = useCallback(async () => {
    const list = await fetchComments(post.id);
    if (list) {
      setComments(list);
      setCommentCount(list.length);
    }
  }, [post.id]);

  useEffect(() => {
    if (!open) return;
    fetchComments(post.id).then((list) => {
      if (list) {
        setComments(list);
        setCommentCount(list.length);
      }
    });
  }, [open, post.id]);

  // Live comments/likes while the thread is open
  useLiveChannel(open ? `post:${post.id}` : null, loadComments);

  const toggleLike = async () => {
    const next = !liked;
    setLiked(next);
    setLikes((n) => n + (next ? 1 : -1));
    if (next) {
      setPop(true);
      setTimeout(() => setPop(false), 400);
    }
    try {
      const res = await fetch(`/api/feed/${post.id}/like`, { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setLiked(data.data.liked);
        setLikes(data.data.likeCount);
      }
    } catch {
      setLiked(!next);
      setLikes((n) => n + (next ? -1 : 1));
    }
  };

  const sendComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/feed/${post.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: draft }),
      });
      const data = await res.json();
      if (data.ok) {
        setDraft("");
        loadComments();
      } else {
        toast({ title: "Couldn't comment", description: data.error?.message, variant: "destructive" });
      }
    } finally {
      setSending(false);
    }
  };

  const remove = async () => {
    if (!confirm("Delete this post?")) return;
    const res = await fetch(`/api/feed/${post.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    if (data?.ok) onDeleted?.(post.id);
    else toast({ title: "Couldn't delete", description: data?.error?.message, variant: "destructive" });
  };

  const kind = KIND_BADGE[post.kind];
  const isAchievement = post.kind === "achievement";

  return (
    <Card className={cn("p-4 sm:p-5 space-y-3", isAchievement && "bg-gradient-to-br from-emerald-500/5 to-amber-500/5")}>
      <div className="flex items-start gap-3">
        <Avatar name={post.authorName} photoURL={post.authorPhoto} seed={post.authorUid} size={40} level={post.authorLevel} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-semibold text-sm">{post.authorName}</span>
            {post.authorRole === "teacher" && <Badge variant="amber" className="text-[10px] py-0">Teacher</Badge>}
            {kind && (
              <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold", kind.className)}>
                {kind.icon}
                {kind.label}
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500">
            {timeAgo(post.createdAt)}
            {classLabel ? ` · ${classLabel}` : post.visibility === "class" ? " · class only" : ""}
          </p>
        </div>
        {(post.mine || canModerate) && (
          <button type="button" onClick={remove} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40" aria-label="Delete post">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className={cn(isAchievement && "text-base")}>
        {isAchievement ? (
          <MarkdownRenderer content={`**${post.authorName}** ${post.text}`} className="prose-p:my-0" />
        ) : (
          <MarkdownRenderer content={post.text} className="prose-p:my-1" />
        )}
      </div>

      {post.link && (
        <a
          href={post.link}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm text-teal-700 dark:text-teal-300 hover:bg-slate-50 dark:hover:bg-slate-900 break-all"
        >
          <Link2 className="h-4 w-4 shrink-0" /> {post.link}
        </a>
      )}

      <div className="flex items-center gap-1 pt-1 border-t border-slate-100 dark:border-slate-800">
        <button
          type="button"
          onClick={toggleLike}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-colors",
            liked ? "text-rose-600" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-900"
          )}
          aria-pressed={liked}
        >
          <Heart className={cn("h-4 w-4 transition-transform", liked && "fill-rose-500", pop && "scale-150")} /> {likes}
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-900"
        >
          <MessageCircle className="h-4 w-4" /> {commentCount} {post.kind === "question" ? "answers" : "comments"}
        </button>
      </div>

      {open && (
        <div className="space-y-3">
          {comments === null ? (
            <p className="text-xs text-slate-400">Loading…</p>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="flex gap-2.5">
                <Avatar name={c.authorName} photoURL={c.authorPhoto} seed={c.authorUid} size={30} />
                <div className="min-w-0 flex-1 rounded-2xl bg-slate-100 dark:bg-slate-900 px-3 py-2">
                  <p className="text-xs font-semibold">
                    {c.authorName} <span className="font-normal text-slate-400">· {timeAgo(c.createdAt)}</span>
                  </p>
                  <MarkdownRenderer content={c.text} className="prose-p:my-0 text-sm" />
                </div>
              </div>
            ))
          )}
          <form onSubmit={sendComment} className="flex items-center gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={1000}
              placeholder={post.kind === "question" ? "Write an answer…" : "Write a comment…"}
              className="flex-1 h-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-sm focus:outline-none focus:border-teal-500"
            />
            <button type="submit" disabled={!draft.trim() || sending} className="h-10 w-10 rounded-xl bg-teal-600 text-white flex items-center justify-center disabled:opacity-40" aria-label="Send comment">
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </Card>
  );
}
