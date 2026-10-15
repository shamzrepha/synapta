"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageCircle, Plus, Send, ArrowLeft, Users, Check, X, Search, SmilePlus, LogOut, UserPlus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar } from "@/components/ui/avatar";
import { AttachmentCard, type SharedAttachment } from "@/components/social/attachment-card";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { useRealtime } from "@/components/providers/realtime-provider";
import { useLiveChannel } from "@/lib/live/client";
import { useUserStore } from "@/lib/store/use-user-store";
import { useToast } from "@/components/ui/toast";
import { chatTime, exactTime } from "@/lib/time";
import { asArray } from "@/lib/api/client";
import { cn } from "@/lib/utils";

const EMOJIS = ["👍", "❤️", "😂", "😮", "🎉", "🙏"];

interface ChatSummary {
  id: string;
  type: "direct" | "group";
  name: string;
  photoURL: string | null;
  otherUid: string | null;
  memberCount: number;
  lastMessage: { text: string; senderUid: string; senderName: string; at: string | null } | null;
  unread: number;
}

interface Message {
  id: string;
  senderUid: string;
  senderName: string;
  senderPhoto: string | null;
  text: string;
  attachment: SharedAttachment | null;
  reactions: Record<string, string[]>;
  createdAt: string | null;
}

interface ChatDetail {
  chat: {
    id: string;
    type: "direct" | "group";
    name: string;
    photoURL: string | null;
    otherUid: string | null;
    otherUsername: string | null;
    members: Array<{ uid: string; displayName: string; photoURL: string | null; level: number }>;
  };
  messages: Message[];
  typing: string[];
  readAt: Record<string, string | null>;
}

async function fetchInbox(): Promise<ChatSummary[] | null> {
  const j = await fetch("/api/chats").then((r) => r.json()).catch(() => null);
  return j?.ok ? j.data.chats : null;
}
async function fetchChat(id: string): Promise<ChatDetail | null> {
  const j = await fetch(`/api/chats/${id}`).then((r) => r.json()).catch(() => null);
  return j?.ok ? j.data : null;
}

function NewChatModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { toast } = useToast();
  const [friends, setFriends] = useState<Array<{ uid: string; displayName: string; photoURL: string | null }>>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/friends")
      .then((r) => r.json())
      .then((j) => j.ok && setFriends(asArray(j.data.friends)))
      .catch(() => null);
  }, []);

  const create = async () => {
    setBusy(true);
    const body = picked.length === 1 ? { type: "direct", uid: picked[0] } : { type: "group", name: name || "Study group", memberUids: picked };
    const r = await fetch("/api/chats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (r?.ok) onCreated(r.data.id);
    else toast({ title: "Couldn't start chat", description: r?.error?.message, variant: "destructive" });
  };

  const shown = friends.filter((f) => f.displayName.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="fixed inset-0 z-[60] bg-slate-950/60 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="w-full sm:max-w-md max-h-[85vh] flex flex-col bg-white dark:bg-slate-950 rounded-t-3xl sm:rounded-3xl p-4 gap-3 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="font-bold">New message</p>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-900" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search friends" className="w-full h-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 pl-9 pr-3 text-sm" />
        </div>
        {picked.length > 1 && (
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Group name (e.g. Physics squad)" className="w-full h-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-sm" />
        )}
        <ul className="overflow-y-auto flex-1 -mx-1">
          {shown.length === 0 && (
            <li className="text-sm text-slate-500 p-4 text-center">
              No friends yet. <Link href="/friends" className="text-teal-600 font-semibold">Find people</Link>
            </li>
          )}
          {shown.map((f) => {
            const on = picked.includes(f.uid);
            return (
              <li key={f.uid}>
                <button
                  type="button"
                  onClick={() => setPicked((p) => (on ? p.filter((x) => x !== f.uid) : [...p, f.uid]))}
                  className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-900"
                >
                  <Avatar name={f.displayName} photoURL={f.photoURL} seed={f.uid} size={36} />
                  <span className="flex-1 text-left text-sm font-medium">{f.displayName}</span>
                  <span className={cn("h-5 w-5 rounded-full border-2 flex items-center justify-center", on ? "bg-teal-600 border-teal-600 text-white" : "border-slate-300")}>
                    {on && <Check className="h-3 w-3" />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <Button onClick={create} disabled={picked.length === 0} isLoading={busy}>
          {picked.length > 1 ? `Create group (${picked.length + 1})` : "Chat"}
        </Button>
      </div>
    </div>
  );
}

function Conversation({ chatId, onBack, onChanged }: { chatId: string; onBack: () => void; onChanged: () => void }) {
  const { user } = useUserStore();
  const { toast } = useToast();
  const [detail, setDetail] = useState<ChatDetail | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [typingShown, setTypingShown] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastTyping = useRef(0);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markRead = useCallback(() => {
    fetch(`/api/chats/${chatId}/read`, { method: "POST" }).then(() => onChanged()).catch(() => null);
  }, [chatId, onChanged]);

  const apply = useCallback((d: ChatDetail | null) => {
    if (!d) return;
    setDetail(d);
    setTypingShown(d.typing);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    if (d.typing.length) typingTimer.current = setTimeout(() => setTypingShown([]), 7000);
  }, []);

  useEffect(() => {
    fetchChat(chatId).then((d) => {
      apply(d);
      markRead();
    });
  }, [chatId, apply, markRead]);

  const refresh = useCallback(async () => {
    apply(await fetchChat(chatId));
    if (document.visibilityState === "visible") markRead();
  }, [chatId, apply, markRead]);
  useLiveChannel(`chat:${chatId}`, refresh, 250);

  const count = detail?.messages.length || 0;
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [count]);

  const onType = (v: string) => {
    setText(v);
    if (Date.now() - lastTyping.current > 3000 && v.trim()) {
      lastTyping.current = Date.now();
      fetch(`/api/chats/${chatId}/typing`, { method: "POST" }).catch(() => null);
    }
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || sending) return;
    const body = text;
    setText("");
    setSending(true);
    // Optimistic bubble
    setDetail((d) =>
      d
        ? {
            ...d,
            messages: [
              ...d.messages,
              { id: `tmp-${Date.now()}`, senderUid: user?.uid || "", senderName: user?.displayName || "", senderPhoto: null, text: body, attachment: null, reactions: {}, createdAt: new Date().toISOString() },
            ],
          }
        : d
    );
    const r = await fetch(`/api/chats/${chatId}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: body }) }).then((x) => x.json()).catch(() => null);
    setSending(false);
    if (!r?.ok) {
      toast({ title: "Not sent", description: r?.error?.message, variant: "destructive" });
      setText(body);
    }
    refresh();
    onChanged();
  };

  const react = async (messageId: string, emoji: string) => {
    setPickerFor(null);
    await fetch(`/api/chats/${chatId}/messages/${messageId}/react`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ emoji }) }).catch(() => null);
    refresh();
  };

  const leave = async () => {
    if (!confirm("Leave this group?")) return;
    await fetch(`/api/chats/${chatId}/members`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "leave" }) });
    onChanged();
    onBack();
  };

  if (!detail) return <Skeleton className="h-full min-h-[400px] w-full rounded-2xl" />;
  const me = user?.uid;
  const lastMine = [...detail.messages].reverse().find((m) => m.senderUid === me);
  const seenBy = lastMine?.createdAt
    ? Object.entries(detail.readAt).filter(([u, t]) => u !== me && t && new Date(t) >= new Date(lastMine.createdAt!)).map(([u]) => u)
    : [];

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-3 px-3 py-2.5 border-b border-slate-100 dark:border-slate-800 shrink-0">
        <button onClick={onBack} className="md:hidden p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </button>
        {detail.chat.type === "direct" ? (
          <Link href={`/u/${detail.chat.otherUsername || detail.chat.otherUid}`} className="flex items-center gap-2 min-w-0">
            <Avatar name={detail.chat.name} photoURL={detail.chat.photoURL} seed={detail.chat.otherUid || chatId} size={36} />
            <span className="font-semibold truncate">{detail.chat.name}</span>
          </Link>
        ) : (
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="h-9 w-9 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0">
              <Users className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold truncate">{detail.chat.name}</span>
              <span className="block text-[11px] text-slate-500 truncate">{detail.chat.members.map((m) => m.displayName).join(", ")}</span>
            </span>
          </div>
        )}
        {detail.chat.type === "group" && (
          <button onClick={leave} className="ml-auto p-2 text-slate-400 hover:text-rose-600" aria-label="Leave group" title="Leave group">
            <LogOut className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-2 min-h-0">
        {detail.messages.length === 0 && <p className="text-center text-sm text-slate-500 py-10">Say hi 👋</p>}
        {detail.messages.map((m, i) => {
          if (m.senderUid === "system") {
            return (
              <p key={m.id} className="text-center text-[11px] text-slate-500 py-1">
                {m.text}
              </p>
            );
          }
          const mine = m.senderUid === me;
          const prev = detail.messages[i - 1];
          const showName = detail.chat.type === "group" && !mine && prev?.senderUid !== m.senderUid;
          const reactions = Object.entries(m.reactions || {});
          return (
            <div key={m.id} className={cn("flex gap-2 group", mine ? "justify-end" : "justify-start")}>
              {!mine && <Avatar name={m.senderName} photoURL={m.senderPhoto} seed={m.senderUid} size={28} className={cn(prev?.senderUid === m.senderUid && "invisible")} />}
              <div className={cn("max-w-[78%] space-y-1", mine && "items-end flex flex-col")}>
                {showName && <p className="text-[11px] font-semibold text-slate-500 px-1">{m.senderName}</p>}
                <div className="relative">
                  <div
                    title={exactTime(m.createdAt)}
                    className={cn(
                      "rounded-2xl px-3.5 py-2 text-sm space-y-2",
                      mine ? "bg-teal-600 text-white rounded-br-md [&_a]:text-white" : "bg-slate-100 dark:bg-slate-900 rounded-bl-md"
                    )}
                  >
                    {m.text && <MarkdownRenderer content={m.text} className={cn("prose-p:my-0 text-sm", mine && "text-white prose-invert")} />}
                    {m.attachment && <AttachmentCard a={m.attachment} compact className="text-slate-900 dark:text-slate-100" />}
                  </div>
                  <button
                    type="button"
                    onClick={() => setPickerFor(pickerFor === m.id ? null : m.id)}
                    className={cn("absolute top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-400 opacity-0 group-hover:opacity-100 focus:opacity-100", mine ? "-left-7" : "-right-7")}
                    aria-label="React"
                  >
                    <SmilePlus className="h-4 w-4" />
                  </button>
                  {pickerFor === m.id && (
                    <div className={cn("absolute -top-11 z-10 flex gap-1 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg px-2 py-1", mine ? "right-0" : "left-0")}>
                      {EMOJIS.map((e) => (
                        <button key={e} onClick={() => react(m.id, e)} className="text-xl hover:scale-125 transition-transform">
                          {e}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {reactions.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {reactions.map(([e, uids]) => (
                      <button
                        key={e}
                        onClick={() => react(m.id, e)}
                        className={cn("text-xs rounded-full px-1.5 py-0.5 border", me && uids.includes(me) ? "border-teal-500 bg-teal-500/10" : "border-slate-200 dark:border-slate-700")}
                      >
                        {e} {uids.length}
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-slate-400 px-1">{chatTime(m.createdAt)}</p>
              </div>
            </div>
          );
        })}
        {lastMine && seenBy.length > 0 && (
          <p className="text-right text-[11px] text-slate-500 pr-1">{detail.chat.type === "direct" ? "Seen" : `Seen by ${seenBy.length}`}</p>
        )}
        {typingShown.length > 0 && (
          <p className="text-xs text-slate-500 flex items-center gap-1.5 px-1">
            <span className="inline-flex gap-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" />
              <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:120ms]" />
              <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:240ms]" />
            </span>
            {typingShown.join(", ")} {typingShown.length > 1 ? "are" : "is"} typing…
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} className="p-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2 shrink-0">
        <input
          value={text}
          onChange={(e) => onType(e.target.value)}
          maxLength={4000}
          placeholder="Message…"
          className="flex-1 h-11 rounded-full border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-4 text-sm focus:outline-none focus:border-teal-500"
        />
        <button type="submit" disabled={!text.trim() || sending} className="h-11 w-11 rounded-full bg-teal-600 text-white flex items-center justify-center disabled:opacity-40" aria-label="Send">
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}

export default function MessagesPage() {
  const router = useRouter();
  const { signalVersion } = useRealtime();
  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    fetchInbox().then((c) => setChats(c || []));
  }, [signalVersion]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const chat = params.get("chat");
    const withUid = params.get("with");
    if (chat) {
      const t = setTimeout(() => setActive(chat), 0);
      return () => clearTimeout(t);
    }
    if (withUid) {
      fetch("/api/chats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "direct", uid: withUid }) })
        .then((r) => r.json())
        .then((j) => j.ok && setActive(j.data.id))
        .catch(() => null);
    }
  }, []);

  const refreshInbox = useCallback(() => {
    fetchInbox().then((c) => c && setChats(c));
  }, []);

  const open = (id: string) => {
    setActive(id);
    router.replace(`/messages?chat=${id}`);
  };

  return (
    <div className="max-w-5xl mx-auto">
      <Card className="overflow-hidden grid grid-cols-1 md:grid-cols-[320px_minmax(0,1fr)] h-[calc(100dvh-10rem)] md:h-[calc(100dvh-8rem)] min-h-[480px]">
        <div className={cn("flex flex-col min-h-0 border-r border-slate-100 dark:border-slate-800", active && "hidden md:flex")}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
            <h1 className="font-extrabold text-lg flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-teal-600" /> Messages
            </h1>
            <Button size="sm" onClick={() => setShowNew(true)} aria-label="New message">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <ul className="flex-1 overflow-y-auto">
            {chats === null ? (
              <li className="p-4 space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </li>
            ) : chats.length === 0 ? (
              <li className="p-6 text-center text-sm text-slate-500 space-y-3">
                <p>No conversations yet.</p>
                <Button size="sm" variant="outline" onClick={() => setShowNew(true)}>
                  <UserPlus className="h-4 w-4 mr-1" /> Start one
                </Button>
              </li>
            ) : (
              chats.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => open(c.id)}
                    className={cn("w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-900/60", active === c.id && "bg-teal-500/10")}
                  >
                    {c.type === "group" ? (
                      <span className="h-11 w-11 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0">
                        <Users className="h-5 w-5" />
                      </span>
                    ) : (
                      <Avatar name={c.name} photoURL={c.photoURL} seed={c.otherUid || c.id} size={44} />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className={cn("truncate text-sm", c.unread ? "font-bold" : "font-semibold")}>{c.name}</span>
                        <span className="text-[11px] text-slate-400 shrink-0">{chatTime(c.lastMessage?.at)}</span>
                      </span>
                      <span className="flex items-center justify-between gap-2">
                        <span className={cn("truncate text-xs", c.unread ? "text-slate-900 dark:text-slate-100 font-medium" : "text-slate-500")}>
                          {c.lastMessage ? `${c.type === "group" && c.lastMessage.senderName ? `${c.lastMessage.senderName.split(" ")[0]}: ` : ""}${c.lastMessage.text}` : "No messages yet"}
                        </span>
                        {c.unread > 0 && <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-teal-600 text-white text-[10px] font-bold flex items-center justify-center">{c.unread}</span>}
                      </span>
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
        <div className={cn("min-h-0", !active && "hidden md:flex md:items-center md:justify-center")}>
          {active ? (
            <Conversation key={active} chatId={active} onBack={() => { setActive(null); router.replace("/messages"); }} onChanged={refreshInbox} />
          ) : (
            <div className="text-center text-sm text-slate-500 space-y-2">
              <MessageCircle className="h-10 w-10 mx-auto text-slate-300" />
              <p>Pick a conversation or start a new one.</p>
            </div>
          )}
        </div>
      </Card>
      {showNew && (
        <NewChatModal
          onClose={() => setShowNew(false)}
          onCreated={(id) => {
            setShowNew(false);
            refreshInbox();
            open(id);
          }}
        />
      )}
    </div>
  );
}
