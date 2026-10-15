"use client";

import { SocialInput } from "@/components/feed/social-input";
import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  MessageCircle,
  Trash2,
  Link2,
  HelpCircle,
  Sparkles,
  Trophy,
  Send,
  Repeat2,
  Share2,
  Bookmark,
  Heart,
  CornerDownRight,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { AttachmentCard, type SharedAttachment } from "@/components/social/attachment-card";
import { ShareSheet } from "@/components/social/share-sheet";
import { useDataSaver } from "@/components/settings/use-prefs";
import { useLiveChannel } from "@/lib/live/client";
import { useToast } from "@/components/ui/toast";
import { linkifySocial } from "@/lib/social/text";
import { timeAgo, exactTime } from "@/lib/time";
import { cn } from "@/lib/utils";

export const REACTIONS = [
  { key: "like", emoji: "👍", label: "Like" },
  { key: "love", emoji: "❤️", label: "Love" },
  { key: "haha", emoji: "😂", label: "Haha" },
  { key: "wow", emoji: "🤯", label: "Mind-blown" },
  { key: "celebrate", emoji: "🎉", label: "Celebrate" },
] as const;
type ReactionKey = (typeof REACTIONS)[number]["key"];

export interface FeedPost {
  id: string;
  authorUid: string;
  authorName: string;
  authorUsername?: string | null;
  authorPhoto: string | null;
  authorLevel: number;
  authorRole: string;
  kind: "post" | "question" | "showcase" | "achievement" | "repost";
  text: string;
  link: string | null;
  images?: string[];
  poll?: { options: Array<{ id: string; text: string; votes: number }>; totalVotes: number; endsAt: string | null; closed: boolean } | null;
  repostOf?: { id: string; authorUid: string; authorName: string; authorPhoto: string | null; kind: string; text: string; images: string[]; createdAt: string | null } | null;
  attachment?: SharedAttachment | null;
  classId: string | null;
  visibility: "public" | "class";
  likeCount: number;
  reactionCounts?: Partial<Record<ReactionKey, number>>;
  commentCount: number;
  repostCount?: number;
  createdAt: string | null;
  likedByMe: boolean;
  myReaction?: ReactionKey | null;
  myVote?: string | null;
  bookmarked?: boolean;
  mine: boolean;
}

interface Comment {
  id: string;
  parentId: string | null;
  replyToName: string | null;
  authorUid: string;
  authorName: string;
  authorUsername: string | null;
  authorPhoto: string | null;
  authorLevel: number;
  text: string;
  likeCount: number;
  likedByMe: boolean;
  createdAt: string | null;
  canDelete: boolean;
  replies?: Comment[];
}

const KIND_BADGE: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  question: { label: "Question", icon: <HelpCircle className="h-3 w-3 mr-1" />, className: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300" },
  showcase: { label: "Showcase", icon: <Sparkles className="h-3 w-3 mr-1" />, className: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  achievement: { label: "Achievement", icon: <Trophy className="h-3 w-3 mr-1" />, className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
};

export function profileHref(username: string | null | undefined, uid: string) {
  return `/u/${username || uid}`;
}

async function fetchComments(postId: string): Promise<{ comments: Comment[]; total: number } | null> {
  try {
    const res = await fetch(`/api/feed/${postId}/comments`);
    const data = await res.json();
    return data.ok ? data.data : null;
  } catch {
    return null;
  }
}

function Time({ iso }: { iso: string | null }) {
  return (
    <time dateTime={iso || undefined} title={exactTime(iso)} className="cursor-default">
      {timeAgo(iso)}
    </time>
  );
}

function ImageGrid({ images, onOpen }: { images: string[]; onOpen: (src: string) => void }) {
  const dataSaver = useDataSaver();
  if (images.length === 0) return null;
  return (
    <div className={cn("grid gap-1.5 rounded-2xl overflow-hidden", images.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
      {images.slice(0, 4).map((p, i) => (
        <button
          key={p}
          type="button"
          onClick={() => onOpen(`/api/media/${p}`)}
          className={cn("relative bg-slate-100 dark:bg-slate-900", images.length === 3 && i === 0 && "row-span-2")}
        >
          {dataSaver ? (
            <span className="flex h-20 w-full items-center justify-center text-xs font-semibold text-slate-500">Data saver: tap to view image</span>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/media/${p}`} alt="" loading="lazy" decoding="async" className={cn("w-full object-cover", images.length === 1 ? "max-h-[480px]" : "h-48 sm:h-56", images.length === 3 && i === 0 && "h-full")} />
          )}
        </button>
      ))}
    </div>
  );
}

function CommentRow({
  c,
  postId,
  onReply,
  onChanged,
  isReply = false,
}: {
  c: Comment;
  postId: string;
  onReply: (c: Comment) => void;
  onChanged: () => void;
  isReply?: boolean;
}) {
  const [liked, setLiked] = useState(c.likedByMe);
  const [likes, setLikes] = useState(c.likeCount);

  const like = async () => {
    const next = !liked;
    setLiked(next);
    setLikes((n) => n + (next ? 1 : -1));
    const r = await fetch(`/api/feed/${postId}/comments/${c.id}/like`, { method: "POST" }).then((x) => x.json()).catch(() => null);
    if (r?.ok) {
      setLiked(r.data.liked);
      setLikes(r.data.likeCount);
    }
  };
  const remove = async () => {
    if (!confirm("Delete this comment?")) return;
    await fetch(`/api/feed/${postId}/comments/${c.id}`, { method: "DELETE" }).catch(() => null);
    onChanged();
  };

  return (
    <div className={cn("flex gap-2.5", isReply && "ml-10")}>
      <Link href={profileHref(c.authorUsername, c.authorUid)} className="shrink-0">
        <Avatar name={c.authorName} photoURL={c.authorPhoto} seed={c.authorUid} size={isReply ? 26 : 32} />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="rounded-2xl bg-slate-100 dark:bg-slate-900 px-3 py-2">
          <Link href={profileHref(c.authorUsername, c.authorUid)} className="text-xs font-semibold hover:underline">
            {c.authorName}
          </Link>
          {c.replyToName && <span className="text-[11px] text-slate-500"> ▸ {c.replyToName}</span>}
          <MarkdownRenderer content={linkifySocial(c.text)} className="prose-p:my-0 text-sm" />
        </div>
        <div className="flex items-center gap-3 px-2 pt-1 text-[11px] text-slate-500">
          <Time iso={c.createdAt} />
          <button type="button" onClick={like} className={cn("font-semibold flex items-center gap-1", liked ? "text-rose-600" : "hover:text-slate-800 dark:hover:text-slate-200")}>
            <Heart className={cn("h-3 w-3", liked && "fill-rose-500")} /> {likes > 0 ? likes : "Like"}
          </button>
          <button type="button" onClick={() => onReply(c)} className="font-semibold hover:text-slate-800 dark:hover:text-slate-200">
            Reply
          </button>
          {c.canDelete && (
            <button type="button" onClick={remove} className="hover:text-rose-600" aria-label="Delete comment">
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
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
  const [myReaction, setMyReaction] = useState<ReactionKey | null>(post.myReaction ?? (post.likedByMe ? "like" : null));
  const [counts, setCounts] = useState<Partial<Record<ReactionKey, number>>>(
    post.reactionCounts && Object.keys(post.reactionCounts).length ? post.reactionCounts : post.likeCount ? { like: post.likeCount } : {}
  );
  const [picker, setPicker] = useState(false);
  const [open, setOpen] = useState(defaultOpen);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [commentCount, setCommentCount] = useState(post.commentCount);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [sending, setSending] = useState(false);
  const [bookmarked, setBookmarked] = useState(!!post.bookmarked);
  const [poll, setPoll] = useState(post.poll || null);
  const [myVote, setMyVote] = useState(post.myVote || null);
  const [sharing, setSharing] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadComments = useCallback(async () => {
    const d = await fetchComments(post.id);
    if (d) {
      setComments(d.comments);
      setCommentCount(d.total);
    }
  }, [post.id]);

  useEffect(() => {
    if (!open) return;
    fetchComments(post.id).then((d) => {
      if (d) {
        setComments(d.comments);
        setCommentCount(d.total);
      }
    });
  }, [open, post.id]);

  useLiveChannel(open ? `post:${post.id}` : null, loadComments);

  const react = async (key: ReactionKey | null) => {
    setPicker(false);
    const prev = myReaction;
    const prevCounts = counts;
    const next = { ...counts };
    if (prev) next[prev] = Math.max(0, (next[prev] || 0) - 1);
    if (key) next[key] = (next[key] || 0) + 1;
    setMyReaction(key);
    setCounts(next);
    const r = await fetch(`/api/feed/${post.id}/react`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reaction: key }),
    })
      .then((x) => x.json())
      .catch(() => null);
    if (r?.ok) {
      setMyReaction(r.data.myReaction);
      setCounts(r.data.reactionCounts);
    } else {
      setMyReaction(prev);
      setCounts(prevCounts);
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
        body: JSON.stringify({ text: draft, parentId: replyTo?.id || null }),
      });
      const data = await res.json();
      if (data.ok) {
        setDraft("");
        setReplyTo(null);
        loadComments();
      } else {
        toast({ title: "Couldn't comment", description: data.error?.message, variant: "destructive" });
      }
    } finally {
      setSending(false);
    }
  };

  const toggleBookmark = async () => {
    setBookmarked((b) => !b);
    const r = await fetch(`/api/feed/${post.id}/bookmark`, { method: "POST" }).then((x) => x.json()).catch(() => null);
    if (r?.ok) {
      setBookmarked(r.data.bookmarked);
      toast({ title: r.data.bookmarked ? "Saved to your library" : "Removed from saved", variant: "success" });
    }
  };

  const vote = async (optionId: string) => {
    const r = await fetch(`/api/feed/${post.id}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ optionId }),
    })
      .then((x) => x.json())
      .catch(() => null);
    if (r?.ok) {
      setMyVote(r.data.myVote);
      setPoll(r.data.poll);
    } else toast({ title: "Vote not counted", description: r?.error?.message, variant: "destructive" });
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
  const isRepost = post.kind === "repost" && post.repostOf;
  const totalReactions = Object.values(counts).reduce((a, b) => a + (b || 0), 0);
  const topEmojis = REACTIONS.filter((r) => (counts[r.key] || 0) > 0)
    .sort((a, b) => (counts[b.key] || 0) - (counts[a.key] || 0))
    .slice(0, 3);
  const mine = REACTIONS.find((r) => r.key === myReaction);

  return (
    <Card className={cn("p-4 sm:p-5 space-y-3", isAchievement && "bg-gradient-to-br from-emerald-500/5 to-amber-500/5")}>
      {isRepost && !post.text && (
        <p className="text-xs font-semibold text-slate-500 flex items-center gap-1.5 -mb-1">
          <Repeat2 className="h-3.5 w-3.5" /> {post.mine ? "You" : post.authorName} reposted
        </p>
      )}

      <div className="flex items-start gap-3">
        <Link href={profileHref(post.authorUsername, post.authorUid)} className="shrink-0">
          <Avatar name={post.authorName} photoURL={post.authorPhoto} seed={post.authorUid} size={42} level={post.authorLevel} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <Link href={profileHref(post.authorUsername, post.authorUid)} className="font-semibold text-sm hover:underline">
              {post.authorName}
            </Link>
            {post.authorUsername && <span className="text-xs text-slate-500">@{post.authorUsername}</span>}
            {post.authorRole === "teacher" && <Badge variant="amber" className="text-[10px] py-0">Teacher</Badge>}
            {kind && (
              <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold", kind.className)}>
                {kind.icon}
                {kind.label}
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500">
            <Time iso={post.createdAt} /> · {exactTime(post.createdAt)}
            {classLabel ? ` · ${classLabel}` : post.visibility === "class" ? " · class only" : ""}
          </p>
        </div>
        {(post.mine || canModerate) && (
          <button type="button" onClick={remove} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40" aria-label="Delete post">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {post.text && (
        <div className={cn(isAchievement && "text-base")}>
          <MarkdownRenderer content={isAchievement ? `**${post.authorName}** ${post.text}` : linkifySocial(post.text)} className="prose-p:my-1" />
        </div>
      )}

      {post.images && post.images.length > 0 && <ImageGrid images={post.images} onOpen={setLightbox} />}

      {poll && (
        <div className="space-y-2">
          {poll.options.map((o) => {
            const pct = poll.totalVotes ? Math.round((o.votes / poll.totalVotes) * 100) : 0;
            const showResults = !!myVote || poll.closed;
            const chosen = myVote === o.id;
            return (
              <button
                key={o.id}
                type="button"
                disabled={poll.closed}
                onClick={() => vote(o.id)}
                className={cn("relative w-full text-left rounded-xl border-2 px-3 py-2.5 overflow-hidden", chosen ? "border-teal-500" : "border-slate-200 dark:border-slate-800 hover:border-teal-400/60")}
              >
                {showResults && <span className="absolute inset-y-0 left-0 bg-teal-500/15 transition-all duration-500" style={{ width: `${pct}%` }} />}
                <span className="relative flex items-center justify-between gap-2 text-sm">
                  <span className={cn(chosen && "font-semibold")}>{o.text}</span>
                  {showResults && <span className="font-bold tabular-nums">{pct}%</span>}
                </span>
              </button>
            );
          })}
          <p className="text-[11px] text-slate-500">
            {poll.totalVotes} vote{poll.totalVotes === 1 ? "" : "s"} · {poll.closed ? "Final results" : poll.endsAt ? `ends ${exactTime(poll.endsAt)}` : ""}
          </p>
        </div>
      )}

      {post.attachment && <AttachmentCard a={post.attachment} />}

      {isRepost && post.repostOf && (
        <Link href={`/feed?post=${post.repostOf.id}`} className="block rounded-2xl border border-slate-200 dark:border-slate-800 p-3 space-y-2 hover:bg-slate-50 dark:hover:bg-slate-900/50">
          <div className="flex items-center gap-2">
            <Avatar name={post.repostOf.authorName} photoURL={post.repostOf.authorPhoto} seed={post.repostOf.authorUid} size={24} />
            <span className="text-xs font-semibold">{post.repostOf.authorName}</span>
            <span className="text-[11px] text-slate-500">
              <Time iso={post.repostOf.createdAt} />
            </span>
          </div>
          {post.repostOf.text && <MarkdownRenderer content={post.repostOf.text} className="prose-p:my-0 text-sm line-clamp-6" />}
          {post.repostOf.images?.[0] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/media/${post.repostOf.images[0]}`} alt="" className="rounded-xl max-h-64 w-full object-cover" />
          )}
        </Link>
      )}

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

      {(totalReactions > 0 || commentCount > 0 || (post.repostCount || 0) > 0) && (
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span className="flex items-center gap-1">
            {topEmojis.length > 0 && <span className="flex -space-x-1">{topEmojis.map((r) => <span key={r.key}>{r.emoji}</span>)}</span>}
            {totalReactions > 0 && <span>{totalReactions}</span>}
          </span>
          <span className="flex gap-3">
            {commentCount > 0 && (
              <button type="button" onClick={() => setOpen(true)} className="hover:underline">
                {commentCount} {post.kind === "question" ? "answer" : "comment"}
                {commentCount === 1 ? "" : "s"}
              </button>
            )}
            {(post.repostCount || 0) > 0 && <span>{post.repostCount} repost{post.repostCount === 1 ? "" : "s"}</span>}
          </span>
        </div>
      )}

      <div className="relative grid grid-cols-4 gap-1 pt-1 border-t border-slate-100 dark:border-slate-800">
        {picker && (
          <div
            className="absolute -top-14 left-0 z-20 flex gap-1 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl px-2 py-1.5"
            onMouseLeave={() => setPicker(false)}
          >
            {REACTIONS.map((r) => (
              <button
                key={r.key}
                type="button"
                title={r.label}
                onClick={() => react(myReaction === r.key ? null : r.key)}
                className={cn("text-2xl transition-transform hover:scale-125 px-0.5", myReaction === r.key && "scale-110")}
              >
                {r.emoji}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => react(myReaction ? null : "like")}
          onMouseEnter={() => setPicker(true)}
          onTouchStart={() => {
            holdTimer.current = setTimeout(() => setPicker(true), 400);
          }}
          onTouchEnd={() => holdTimer.current && clearTimeout(holdTimer.current)}
          onContextMenu={(e) => {
            e.preventDefault();
            setPicker(true);
          }}
          className={cn(
            "flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-medium transition-colors",
            mine ? "text-teal-700 dark:text-teal-300" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-900"
          )}
          aria-pressed={!!mine}
        >
          <span className="text-base leading-none">{mine ? mine.emoji : "👍"}</span>
          <span className="hidden sm:inline">{mine ? mine.label : "Like"}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setTimeout(() => inputRef.current?.focus(), 50);
          }}
          className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-900"
        >
          <MessageCircle className="h-4 w-4" /> <span className="hidden sm:inline">{post.kind === "question" ? "Answer" : "Comment"}</span>
        </button>
        <button
          type="button"
          onClick={() => setSharing(true)}
          className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-900"
        >
          <Share2 className="h-4 w-4" /> <span className="hidden sm:inline">Share</span>
        </button>
        <button
          type="button"
          onClick={toggleBookmark}
          className={cn(
            "flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-medium",
            bookmarked ? "text-amber-600" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-900"
          )}
          aria-pressed={bookmarked}
        >
          <Bookmark className={cn("h-4 w-4", bookmarked && "fill-amber-500")} /> <span className="hidden sm:inline">{bookmarked ? "Saved" : "Save"}</span>
        </button>
      </div>

      {open && (
        <div className="space-y-3">
          {comments === null ? (
            <p className="text-xs text-slate-400">Loading…</p>
          ) : comments.length === 0 ? (
            <p className="text-xs text-slate-500">No comments yet. Start the conversation.</p>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="space-y-2">
                <CommentRow c={c} postId={post.id} onReply={(x) => { setReplyTo(x); inputRef.current?.focus(); }} onChanged={loadComments} />
                {(c.replies || []).map((r) => (
                  <CommentRow key={r.id} c={r} postId={post.id} onReply={(x) => { setReplyTo(x); inputRef.current?.focus(); }} onChanged={loadComments} isReply />
                ))}
              </div>
            ))
          )}
          {replyTo && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <CornerDownRight className="h-3.5 w-3.5" /> Replying to <strong>{replyTo.authorName}</strong>
              <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <form onSubmit={sendComment} className="flex items-center gap-2">
            <SocialInput
              as="input"
              inputRef={inputRef as React.MutableRefObject<HTMLInputElement | HTMLTextAreaElement | null>}
              value={draft}
              onChange={setDraft}
              maxLength={1500}
              placeholder={replyTo ? `Reply to ${replyTo.authorName}…` : post.kind === "question" ? "Write an answer… (@mention someone)" : "Write a comment…"}
              className="h-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-sm focus:outline-none focus:border-teal-500"
            />
            <button type="submit" disabled={!draft.trim() || sending} className="h-10 w-10 rounded-xl bg-teal-600 text-white flex items-center justify-center disabled:opacity-40" aria-label="Send comment">
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}

      {sharing && (
        <ShareSheet
          postId={isRepost && post.repostOf ? post.repostOf.id : post.id}
          attachment={{
            type: "post",
            id: post.id,
            title: (post.text || post.repostOf?.text || "Post").slice(0, 120),
            subtitle: `by ${post.authorName}`,
            href: `/feed?post=${post.id}`,
          }}
          onClose={() => setSharing(false)}
        />
      )}

      {lightbox && (
        <div className="fixed inset-0 z-[70] bg-black/90 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" className="max-h-full max-w-full rounded-xl" />
          <button className="absolute top-4 right-4 text-white p-2" aria-label="Close">
            <X className="h-6 w-6" />
          </button>
        </div>
      )}
    </Card>
  );
}
