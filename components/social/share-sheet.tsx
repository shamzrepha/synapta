"use client";

import React, { useEffect, useState } from "react";
import { X, Send, Link2, Repeat2, Quote, Search, Check, Newspaper } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { AttachmentCard, type SharedAttachment } from "./attachment-card";
import { asArray } from "@/lib/api/client";
import { cn } from "@/lib/utils";

interface ChatLite {
  id: string;
  type: "direct" | "group";
  name: string;
  photoURL: string | null;
}

interface FriendLite {
  uid: string;
  displayName: string;
  photoURL: string | null;
}

/**
 * One share sheet for everything: send to friends/groups in Messages, post to your feed or a class
 * (repost/quote for posts), or copy a link.
 */
export function ShareSheet({
  attachment,
  postId,
  onClose,
  onShared,
}: {
  attachment: SharedAttachment;
  /** When sharing a post: enables Repost / Quote */
  postId?: string;
  onClose: () => void;
  onShared?: () => void;
}) {
  const { toast } = useToast();
  const [chats, setChats] = useState<ChatLite[]>([]);
  const [friends, setFriends] = useState<FriendLite[]>([]);
  const [classes, setClasses] = useState<Array<{ id: string; title: string }>>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [feedTarget, setFeedTarget] = useState("public");

  useEffect(() => {
    Promise.all([
      fetch("/api/chats").then((r) => r.json()).catch(() => null),
      fetch("/api/friends").then((r) => r.json()).catch(() => null),
      fetch("/api/classes?scope=mine").then((r) => r.json()).catch(() => null),
    ]).then(([c, f, cl]) => {
      if (c?.ok) setChats(c.data.chats);
      if (f?.ok) setFriends(asArray<FriendLite>(f.data.friends));
      if (cl?.ok) setClasses(asArray<{ id: string; title: string; isOwner?: boolean; userEnrollmentStatus?: string }>(cl.data).filter((x) => x.isOwner || x.userEnrollmentStatus === "active"));
    });
  }, []);

  // Recent chats first, then friends without a chat yet
  const directUids = new Set(chats.filter((c) => c.type === "direct").map((c) => c.id));
  const targets = [
    ...chats.map((c) => ({ key: `chat:${c.id}`, name: c.name, photoURL: c.photoURL, sub: c.type === "group" ? "Group" : "" })),
    ...friends
      .filter((f) => !Array.from(directUids).some((id) => id.includes(f.uid)))
      .map((f) => ({ key: `friend:${f.uid}`, name: f.displayName, photoURL: f.photoURL, sub: "" })),
  ].filter((t) => t.name.toLowerCase().includes(query.toLowerCase()));

  const toggle = (key: string) =>
    setPicked((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const sendToChats = async () => {
    setBusy("send");
    try {
      for (const key of picked) {
        let chatId = key.slice(5);
        if (key.startsWith("friend:")) {
          const r = await fetch("/api/chats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "direct", uid: key.slice(7) }) }).then((x) => x.json());
          if (!r.ok) throw new Error(r.error?.message);
          chatId = r.data.id;
        }
        const r = await fetch(`/api/chats/${chatId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: note, attachment }),
        }).then((x) => x.json());
        if (!r.ok) throw new Error(r.error?.message);
      }
      toast({ title: `Sent to ${picked.size} ${picked.size === 1 ? "chat" : "chats"}`, variant: "success" });
      onShared?.();
      onClose();
    } catch (e) {
      toast({ title: "Couldn't send", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const shareToFeed = async (mode: "repost" | "quote" | "post") => {
    setBusy(mode);
    try {
      const classId = feedTarget.startsWith("class:") ? feedTarget.slice(6) : null;
      const r = postId
        ? await fetch(`/api/feed/${postId}/repost`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: mode === "quote" ? note : "", classId }),
          }).then((x) => x.json())
        : await fetch("/api/feed", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: note, kind: "showcase", attachment, classId, visibility: classId ? "class" : "public" }),
          }).then((x) => x.json());
      if (!r.ok) throw new Error(r.error?.message);
      toast({ title: mode === "repost" ? "Reposted" : "Shared to the feed", variant: "success" });
      onShared?.();
      onClose();
    } catch (e) {
      toast({ title: "Couldn't share", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const copyLink = async () => {
    await navigator.clipboard?.writeText(`${window.location.origin}${attachment.href}`).catch(() => null);
    toast({ title: "Link copied", variant: "success" });
  };

  return (
    <div className="fixed inset-0 z-[60] bg-slate-950/60 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-950 rounded-t-3xl sm:rounded-3xl p-4 space-y-4 shadow-2xl pb-[calc(1rem+env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="font-bold">Share</p>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-900" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <AttachmentCard a={attachment} compact />
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder={postId ? "Add a comment (for Quote or a message)…" : "Say something about it…"}
          className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:border-teal-500"
        />

        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <Send className="h-3.5 w-3.5" /> Send in Messages
          </p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search friends and groups" className="w-full h-9 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 pl-9 pr-3 text-sm" />
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {targets.length === 0 && <p className="text-xs text-slate-500 py-2">Add friends to send things to them.</p>}
            {targets.map((t) => (
              <button key={t.key} type="button" onClick={() => toggle(t.key)} className="shrink-0 w-16 flex flex-col items-center gap-1">
                <span className="relative">
                  <Avatar name={t.name} photoURL={t.photoURL} seed={t.key} size={48} />
                  {picked.has(t.key) && (
                    <span className="absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-full bg-teal-600 text-white flex items-center justify-center ring-2 ring-white dark:ring-slate-950">
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                </span>
                <span className="text-[11px] leading-tight text-center line-clamp-2">{t.name}</span>
              </button>
            ))}
          </div>
          <Button className="w-full" size="sm" disabled={picked.size === 0} onClick={sendToChats} isLoading={busy === "send"}>
            Send{picked.size ? ` to ${picked.size}` : ""}
          </Button>
        </div>

        <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <Newspaper className="h-3.5 w-3.5" /> Share to a feed
          </p>
          <select value={feedTarget} onChange={(e) => setFeedTarget(e.target.value)} className="w-full h-9 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 text-sm">
            <option value="public">🌍 Everyone</option>
            {asArray(classes).map((c) => (
              <option key={c.id} value={`class:${c.id}`}>
                🎓 {c.title}
              </option>
            ))}
          </select>
          <div className={cn("grid gap-2", postId ? "grid-cols-2" : "grid-cols-1")}>
            {postId ? (
              <>
                <Button size="sm" variant="outline" onClick={() => shareToFeed("repost")} isLoading={busy === "repost"}>
                  <Repeat2 className="h-4 w-4 mr-1" /> Repost
                </Button>
                <Button size="sm" variant="outline" onClick={() => shareToFeed("quote")} isLoading={busy === "quote"} disabled={!note.trim()}>
                  <Quote className="h-4 w-4 mr-1" /> Quote
                </Button>
              </>
            ) : (
              <Button size="sm" variant="outline" onClick={() => shareToFeed("post")} isLoading={busy === "post"}>
                <Newspaper className="h-4 w-4 mr-1" /> Post it
              </Button>
            )}
          </div>
        </div>

        <button type="button" onClick={copyLink} className="w-full flex items-center justify-center gap-2 text-sm font-semibold py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-900">
          <Link2 className="h-4 w-4" /> Copy link
        </button>
      </div>
    </div>
  );
}
